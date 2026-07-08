import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// "Cron" caseiro (o repo não usa @nestjs/schedule): varre 1×/dia + 1 passada
// atrasada no boot. INERTE por default — só toca empresas que ligaram
// LogisticaConfig.gerarDiaAutomatico (default false). Sem nenhuma empresa opt-in,
// o timer acorda, não encontra ninguém e volta a dormir (zero efeito).
const GERAR_DIA_SWEEP_MS = 24 * 60 * 60 * 1000;
const GERAR_DIA_BOOT_DELAY_MS = 30_000;

/**
 * LOGÍSTICA-MOBILE M2 (05/07) — amarração PRODUTO×CLIENTE + recorrência.
 *
 * Duas frentes:
 *  1) CRUD de `ClienteProduto` (o vínculo "cliente X leva N do produto Y a cada
 *     Z dias / nos dias W, pelo preço P"), company-scoped, valida que cliente e
 *     produto são da MESMA empresa (isolamento por-tenant duro).
 *  2) "Gerar entregas do dia" (POST /logistica/gerar-dia): varre os vínculos
 *     ATIVOS vencidos (proximaData <= dia OU dia bate no diasSemana) e materializa
 *     `Entrega` + `EntregaItem`, avançando `proximaData`. É IDEMPOTENTE por
 *     [companyId, customerProfileId, dia]: rodar 2× no mesmo dia = 1 entrega/cliente.
 *
 * ── BACKWARD-COMPAT (regra dura do M2) ───────────────────────────────────────
 * Ao criar a Entrega, além de gravar os `EntregaItem`, mantemos `Entrega.quantidade`
 * e `Entrega.valor` COERENTES (soma dos itens) — assim o N6 (confirmarEntrega,
 * cobrança) segue funcionando sem alteração. A Entrega vira multi-produto, mas os
 * campos escalares legados continuam a valer.
 *
 * ── SEM EFEITO EXTERNO ───────────────────────────────────────────────────────
 * Gerar o dia é 100% interno (grava linhas). Não dispara WhatsApp nem cobrança —
 * isso só acontece no CONFIRMAR (N6), atrás de HBX_LOGISTICA_ENABLED. O cron que
 * chama este serviço vive atrás de LogisticaConfig.gerarDiaAutomatico (default OFF).
 */
@Injectable()
export class LogisticaRecorrenciaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRecorrenciaService.name);
  private gerarDiaSweepHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ── CRON "gerar dia automático" (INERTE por default) ─────────────────────────
  onModuleInit() {
    this.gerarDiaSweepHandle = setInterval(() => {
      void this.sweepGerarDiaAutomatico('interval');
    }, GERAR_DIA_SWEEP_MS);
    // 1 passada atrasada no boot (não roda EM boot — respiro de 30s; ainda assim
    // só faz algo se alguma empresa tiver gerarDiaAutomatico=true).
    setTimeout(() => {
      void this.sweepGerarDiaAutomatico('startup');
    }, GERAR_DIA_BOOT_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.gerarDiaSweepHandle) clearInterval(this.gerarDiaSweepHandle);
    this.gerarDiaSweepHandle = null;
  }

  /**
   * Passada do cron: só as empresas que LIGARAM gerarDiaAutomatico entram. Sem
   * opt-in = no-op total (nenhuma escrita). Cada empresa roda o gerarDia idempotente
   * de HOJE — repetir não duplica. Falha de uma não derruba as outras.
   */
  private async sweepGerarDiaAutomatico(trigger: 'startup' | 'interval'): Promise<void> {
    let configs: Array<{ companyId: number }> = [];
    try {
      configs = await this.prisma.logisticaConfig.findMany({
        where: { gerarDiaAutomatico: true },
        select: { companyId: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] gerar-dia cron (${trigger}) falhou ao listar configs: ${String(e?.message || e)}`);
      return;
    }
    if (configs.length === 0) return; // ninguém opt-in → inerte
    for (const c of configs) {
      try {
        await this.gerarDia(c.companyId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica] gerar-dia cron (${trigger}) company=${c.companyId} falhou: ${String(e?.message || e)}`,
        );
      }
    }
  }

  // ── CRUD ClienteProduto ─────────────────────────────────────────────────────
  async listByCliente(companyId: number, customerProfileId: string): Promise<ClienteProdutoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const rows = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId: cid },
      orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        customerProfileId: true,
        productId: true,
        qtdPadrao: true,
        precoAcordado: true,
        frequenciaDias: true,
        diasSemana: true,
        proximaData: true,
        ativo: true,
        product: { select: { id: true, name: true, unidade: true, price: true, priceCents: true } },
      },
    });
    return rows.map(serializeClienteProduto);
  }

  async create(companyId: number, input: CreateClienteProdutoInput): Promise<ClienteProdutoDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const customerProfileId = String(input.customerProfileId || '').trim();
    if (!customerProfileId) throw new BadRequestException('Cliente é obrigatório.');

    // Cliente e produto DESTA empresa (isolamento por-tenant duro).
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: customerProfileId, companyId },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException('Cliente não encontrado');
    const product = await this.prisma.product.findFirst({
      where: { id: Number(input.productId), companyId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const diasSemana = normalizeDiasSemana(input.diasSemana);
    const frequenciaDias =
      input.frequenciaDias != null && Number.isFinite(Number(input.frequenciaDias))
        ? Math.max(1, Math.trunc(Number(input.frequenciaDias)))
        : null;
    // proximaData: explícita > (se recorrente) hoje > null.
    const proximaData =
      parseDateOrNull(input.proximaData) ?? (frequenciaDias || diasSemana ? startOfDay(new Date()) : null);

    // TASK 5 (08/07) — @@unique([companyId, customerProfileId, productId]) foi
    // REMOVIDO do schema: o mesmo produto pode ser vinculado 2× ao mesmo cliente
    // (ex.: 1 galão na segunda, outro na sexta, vínculos separados). Sem índice
    // único, este create() não estoura mais P2002 de duplicado — o vínculo
    // repetido é intencional e permitido.
    const created = await this.prisma.clienteProduto.create({
      data: {
        companyId,
        customerProfileId: conta.id,
        productId: product.id,
        qtdPadrao: Math.max(1, Math.trunc(Number(input.qtdPadrao) || 1)),
        precoAcordado:
          input.precoAcordado != null && Number.isFinite(Number(input.precoAcordado))
            ? Math.max(0, Number(input.precoAcordado))
            : null,
        frequenciaDias,
        diasSemana,
        proximaData,
        ativo: input.ativo !== false,
      },
      select: cpSelect,
    });
    return serializeClienteProduto(created);
  }

  async update(companyId: number, id: string, input: UpdateClienteProdutoInput): Promise<ClienteProdutoDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.clienteProduto.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.qtdPadrao != null) data.qtdPadrao = Math.max(1, Math.trunc(Number(input.qtdPadrao)));
    if (input.precoAcordado !== undefined)
      data.precoAcordado =
        input.precoAcordado != null && Number.isFinite(Number(input.precoAcordado))
          ? Math.max(0, Number(input.precoAcordado))
          : null;
    if (input.frequenciaDias !== undefined)
      data.frequenciaDias =
        input.frequenciaDias != null && Number.isFinite(Number(input.frequenciaDias))
          ? Math.max(1, Math.trunc(Number(input.frequenciaDias)))
          : null;
    if (input.diasSemana !== undefined) data.diasSemana = normalizeDiasSemana(input.diasSemana);
    if (input.proximaData !== undefined) data.proximaData = parseDateOrNull(input.proximaData);
    if (input.ativo !== undefined) data.ativo = !!input.ativo;

    const updated = await this.prisma.clienteProduto.update({
      where: { id: existing.id },
      data,
      select: cpSelect,
    });
    return serializeClienteProduto(updated);
  }

  /** Liga/desliga o vínculo (atalho do toggle da UI). */
  async toggleAtivo(companyId: number, id: string, ativo: boolean): Promise<ClienteProdutoDTO | null> {
    return this.update(companyId, id, { ativo });
  }

  /**
   * TASK 9 (08/07) — REMOVE o vínculo produto×cliente de VEZ (hard delete, o "-"
   * da UI). Diferente do toggleAtivo (que só pausa, ativo=false): aqui o vínculo
   * some do banco. company-scoped: só apaga se o id for desta empresa; senão
   * devolve false (o controller vira 404). Não toca entregas já geradas — o
   * gerarDia é que lê os vínculos vivos, então remover só impede recorrências
   * FUTURAS. Sem efeito externo.
   */
  async remove(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const existing = await this.prisma.clienteProduto.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.clienteProduto.delete({ where: { id: existing.id } });
    return true;
  }

  /**
   * Catálogo de produtos da empresa para o seletor da UI "Produtos do cliente".
   * Prioriza os marcados usaLogistica (item de entrega), mas devolve todos os
   * ativos para não travar o cadastro. Company-scoped.
   */
  async listProdutos(companyId: number): Promise<ProdutoOptionDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const rows = await this.prisma.product.findMany({
      where: { companyId, status: 'active', kind: 'tenant_product' },
      orderBy: [{ usaLogistica: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 500,
      select: { id: true, name: true, unidade: true, price: true, priceCents: true, usaLogistica: true },
    });
    return rows.map((p) => ({
      id: p.id,
      nome: p.name,
      unidade: p.unidade ?? null,
      usaLogistica: p.usaLogistica,
      precoCatalogo:
        typeof p.priceCents === 'number' ? p.priceCents / 100 : typeof p.price === 'number' ? p.price : null,
    }));
  }

  // ── GERAR ENTREGAS DO DIA ────────────────────────────────────────────────────
  /**
   * Busca os vínculos ATIVOS candidatos do dia (proximaData vencida OU o dia bate
   * no diasSemana) e AGRUPA por cliente os que realmente vencem HOJE (dueOnDay).
   * Consulta única, reusada por `gerarDia` (que materializa) e `getDiaPreview`
   * (que só lê — pop-up "Gerar entregas" do app). Traz `product.name` e
   * `customerProfile.name` (só usados pelo preview; gerarDia ignora).
   */
  private async buscarVencidosPorCliente(companyId: number, dia: Date, dayEnd: Date, dow: number) {
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: {
        companyId,
        ativo: true,
        OR: [{ proximaData: { lte: dayEnd } }, { diasSemana: { not: null } }],
      },
      select: {
        id: true,
        customerProfileId: true,
        productId: true,
        qtdPadrao: true,
        precoAcordado: true,
        frequenciaDias: true,
        diasSemana: true,
        proximaData: true,
        product: { select: { id: true, name: true, price: true, priceCents: true } },
        customerProfile: { select: { id: true, name: true, precoPadrao: true } },
      },
    });

    // TASK 5 — um cliente pode ter VÁRIOS vínculos vencidos no MESMO dia
    // (inclusive o MESMO produto 2×, ex. galão da segunda + galão da sexta que
    // por acaso vencem juntos). Agrupar aqui é o que permite ao gerarDia criar
    // 1 Entrega com N EntregaItem em vez de perder todos os vínculos menos o 1º.
    const porCliente = new Map<string, typeof vinculos>();
    for (const v of vinculos) {
      if (!dueOnDay(v, dia, dow)) continue;
      const arr = porCliente.get(v.customerProfileId);
      if (arr) arr.push(v);
      else porCliente.set(v.customerProfileId, [v]);
    }
    return { vinculos, porCliente };
  }

  /**
   * Materializa as entregas recorrentes vencidas do dia. IDEMPOTENTE por
   * [companyId, customerProfileId, dia]: se já existe QUALQUER entrega do cliente
   * naquele dia (gerada por recorrência OU agendada à mão), NÃO cria outra — e
   * ainda assim avança proximaData de CADA vínculo vencido, pra não ficar "preso"
   * no passado.
   *
   * TASK 5 (08/07) — AGREGAÇÃO: antes, 1 Entrega por cliente/dia levava só o item
   * do PRIMEIRO vínculo vencido e os demais eram SILENCIOSAMENTE PERDIDOS (o
   * `existente` é por cliente+dia, não por vínculo). Agora agrupa TODOS os
   * vínculos vencidos do cliente (via `buscarVencidosPorCliente`) e cria UMA
   * Entrega com UM EntregaItem por vínculo — Entrega.quantidade/valor (legado,
   * N6) viram a SOMA dos itens.
   */
  async gerarDia(companyId: number, dateInput?: string): Promise<GerarDiaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);
    const dow = isoDow(dia); // 1..7 (seg..dom)

    const { vinculos, porCliente } = await this.buscarVencidosPorCliente(companyId, dia, dayEnd, dow);

    let criadas = 0;
    let puladas = 0;
    let avancados = 0;

    for (const [customerProfileId, vencidos] of porCliente) {
      // Idempotência: já existe entrega do cliente NESTE dia? (qualquer origem)
      const existente = await this.prisma.entrega.findFirst({
        where: {
          companyId,
          customerProfileId,
          scheduledAt: { gte: dia, lte: dayEnd },
        },
        select: { id: true },
      });

      if (existente) {
        puladas++;
      } else {
        const itens = vencidos.map((v) => ({
          productId: v.productId,
          qtdPrevista: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
          valorUnit: resolveValorUnit(v),
        }));
        const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
        const valor = itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0);

        await this.prisma.entrega.create({
          data: {
            companyId,
            customerProfileId,
            // productId escalar legado = o do 1º vínculo (backward-compat N6; o
            // N6 real — montarVarsAviso/listRota — já prioriza `itens` sobre este
            // campo quando `itens.length > 0`, que é sempre o caso aqui).
            productId: vencidos[0].productId,
            quantidade, // backward-compat: escalar coerente com a SOMA dos itens
            valor, // idem
            status: 'agendada',
            scheduledAt: dia,
            cobrancaStatus: 'pendente',
            itens: { create: itens },
          },
          select: { id: true },
        });
        criadas++;
      }

      // Avança proximaData de TODOS os vínculos vencidos (mesmo quando pulou —
      // não deixa nenhum vínculo preso no passado).
      for (const v of vencidos) {
        const proxima = nextProximaData(v, dia, dow);
        if (proxima) {
          await this.prisma.clienteProduto.update({
            where: { id: v.id },
            data: { proximaData: proxima },
          });
          avancados++;
        }
      }
    }

    const dayISO = dia.toISOString().slice(0, 10);
    this.logger.log(
      `[logistica] gerar-dia ${dayISO} company=${companyId}: ${criadas} criada(s), ${puladas} pulada(s) (idempotência), ${avancados} vínculo(s) avançado(s).`,
    );
    return { date: dayISO, criadas, puladas, avancados, candidatos: vinculos.length };
  }

  // ── TASK 7 — PREVIEW do dia (pop-up "Gerar entregas") ───────────────────────
  /**
   * READ-ONLY: mesma regra de vencimento do gerarDia (dueOnDay), mas NÃO escreve
   * nada (nem Entrega, nem proximaData). Devolve os vínculos vencidos AGRUPADOS
   * por cliente, com nome do cliente/produto resolvidos, pro pop-up "Gerar
   * entregas" mostrar quem cairia na rota ANTES do dono clicar "Começar Rota".
   *
   * Cada vínculo vencido vira 1 item da lista (NÃO funde vínculos do MESMO
   * produto): é o espelho fiel do que `gerarDia` realmente materializa em
   * EntregaItem — se o cliente tem 2 vínculos do mesmo produto vencendo hoje,
   * o preview mostra 2 linhas (o front pode agrupar na exibição se quiser).
   */
  async getDiaPreview(companyId: number, dateInput?: string): Promise<DiaPreviewResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);
    const dow = isoDow(dia);

    const { porCliente } = await this.buscarVencidosPorCliente(companyId, dia, dayEnd, dow);

    const clientes: DiaPreviewClienteDTO[] = Array.from(porCliente.entries()).map(
      ([customerProfileId, vencidos]) => ({
        customerProfileId,
        nome: String(vencidos[0]?.customerProfile?.name ?? '').trim(),
        itens: vencidos.map((v) => ({
          productId: v.productId,
          nome: String(v.product?.name ?? '').trim(),
          qtd: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
        })),
      }),
    );

    return { date: dia.toISOString().slice(0, 10), clientes };
  }
}

// ── lógica pura de recorrência (testável isolada) ───────────────────────────────

/** O vínculo vence NESTE dia? proximaData vencida OU dow ∈ diasSemana. */
export function dueOnDay(
  v: { proximaData: Date | null; frequenciaDias: number | null; diasSemana: string | null },
  dia: Date,
  dow: number,
): boolean {
  const dias = parseDiasSemana(v.diasSemana);
  if (dias.length > 0) return dias.includes(dow);
  if (v.proximaData) return startOfDay(v.proximaData).getTime() <= startOfDay(dia).getTime();
  return false;
}

/**
 * Próxima data após materializar o dia:
 *  - diasSemana → o PRÓXIMO dia da semana da lista depois de `dia`.
 *  - frequenciaDias → dia + N.
 *  - nenhum → null (vínculo só-manual; não reaparece sozinho).
 */
export function nextProximaData(
  v: { proximaData: Date | null; frequenciaDias: number | null; diasSemana: string | null },
  dia: Date,
  dow: number,
): Date | null {
  const dias = parseDiasSemana(v.diasSemana);
  if (dias.length > 0) {
    for (let add = 1; add <= 7; add++) {
      const cand = ((dow - 1 + add) % 7) + 1; // 1..7
      if (dias.includes(cand)) return addDays(startOfDay(dia), add);
    }
    return addDays(startOfDay(dia), 7);
  }
  if (v.frequenciaDias && v.frequenciaDias > 0) {
    return addDays(startOfDay(dia), Math.trunc(v.frequenciaDias));
  }
  return null;
}

/** Valor unitário: preço acordado > preço do produto > precoPadrao do cliente > 0. */
export function resolveValorUnit(v: {
  precoAcordado: number | null;
  product?: { price?: number | null; priceCents?: number | null } | null;
  customerProfile?: { precoPadrao?: number | null } | null;
}): number {
  if (v.precoAcordado != null && Number.isFinite(v.precoAcordado)) return Math.max(0, v.precoAcordado);
  const p = v.product;
  if (p) {
    if (typeof p.priceCents === 'number') return Math.max(0, p.priceCents / 100);
    if (typeof p.price === 'number') return Math.max(0, p.price);
  }
  const padrao = v.customerProfile?.precoPadrao;
  if (typeof padrao === 'number') return Math.max(0, padrao);
  return 0;
}

// ── helpers de data / dias-da-semana ────────────────────────────────────────────
export function parseDiasSemana(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => Math.trunc(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
}

function normalizeDiasSemana(raw: string | null | undefined): string | null {
  const dias = Array.from(new Set(parseDiasSemana(raw))).sort((a, b) => a - b);
  return dias.length > 0 ? dias.join(',') : null;
}

/** ISO day-of-week: 1=segunda … 7=domingo (JS getDay: 0=dom). */
export function isoDow(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Um "YYYY-MM-DD" puro (o que a UI manda em ?date=) DEVE ser lido no fuso LOCAL,
  // não como UTC-midnight — senão, num fuso atrás de UTC (Brasília -3), "2026-07-06"
  // vira 05/07 21:00 local e o dia da rota escorrega pro dia anterior. Datas com
  // hora/offset explícitos seguem o parse padrão.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── serialização / tipos ────────────────────────────────────────────────────────
const cpSelect = {
  id: true,
  customerProfileId: true,
  productId: true,
  qtdPadrao: true,
  precoAcordado: true,
  frequenciaDias: true,
  diasSemana: true,
  proximaData: true,
  ativo: true,
  product: { select: { id: true, name: true, unidade: true, price: true, priceCents: true } },
} as const;

function serializeClienteProduto(r: any): ClienteProdutoDTO {
  return {
    id: r.id,
    customerProfileId: r.customerProfileId,
    productId: r.productId,
    qtdPadrao: r.qtdPadrao,
    precoAcordado: r.precoAcordado ?? null,
    frequenciaDias: r.frequenciaDias ?? null,
    diasSemana: r.diasSemana ?? null,
    proximaData: r.proximaData ? r.proximaData.toISOString() : null,
    ativo: r.ativo,
    produto: r.product
      ? {
          id: r.product.id,
          nome: r.product.name,
          unidade: r.product.unidade ?? null,
          precoCatalogo:
            typeof r.product.priceCents === 'number'
              ? r.product.priceCents / 100
              : typeof r.product.price === 'number'
                ? r.product.price
                : null,
        }
      : null,
  };
}

export interface CreateClienteProdutoInput {
  customerProfileId: string;
  productId: number;
  qtdPadrao?: number;
  precoAcordado?: number;
  frequenciaDias?: number;
  diasSemana?: string;
  proximaData?: string;
  ativo?: boolean;
}

export interface UpdateClienteProdutoInput {
  qtdPadrao?: number;
  precoAcordado?: number;
  frequenciaDias?: number;
  diasSemana?: string;
  proximaData?: string;
  ativo?: boolean;
}

export interface ClienteProdutoDTO {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo: number | null } | null;
}

export interface GerarDiaResult {
  date: string;
  criadas: number;
  puladas: number;
  avancados: number;
  candidatos: number;
}

// ── TASK 7 — preview do dia (pop-up "Gerar entregas") ────────────────────────
export interface DiaPreviewItemDTO {
  productId: number;
  nome: string;
  qtd: number;
}

export interface DiaPreviewClienteDTO {
  customerProfileId: string;
  nome: string;
  itens: DiaPreviewItemDTO[];
}

export interface DiaPreviewResult {
  date: string;
  clientes: DiaPreviewClienteDTO[];
}

export interface ProdutoOptionDTO {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo: number | null;
}
