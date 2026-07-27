import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActorKindUserLike, isBillingOwnerActor } from '../access/actor-kind';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import { EspelhoVinculoSnapshot } from './logistica-agenda-espelho.util';

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
 *     [companyId, customerProfileId, localId, dia]: rodar 2× no mesmo dia = 1
 *     entrega por (cliente, local). (MULTILOCAL 10/07 — antes era só cliente+dia.)
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
  async listByCliente(
    companyId: number,
    customerProfileId: string,
    actor?: ActorKindUserLike,
  ): Promise<ClienteProdutoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const billingAudience = isBillingOwnerActor(actor);
    const rows = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId: cid },
      orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        customerProfileId: true,
        productId: true,
        qtdPadrao: true,
        ...(billingAudience ? { precoAcordado: true as const } : {}),
        frequenciaDias: true,
        diasSemana: true,
        proximaData: true,
        ativo: true,
        product: {
          select: {
            id: true,
            name: true,
            unidade: true,
            ...(billingAudience ? { price: true as const, priceCents: true as const } : {}),
          },
        },
      },
    });
    return rows.map((row) => serializeClienteProduto(row, billingAudience));
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

    // 🔴 27/07 (dono, SEM LEGADO): o dia NÃO vem do produto. Vínculo novo NASCE
    // nos dias do CLIENTE (a visita) — quem muda dia é
    // `PATCH /logistica/clientes/:id/dias`, e ele reescreve todos os vínculos.
    const diasSemana = await this.diasDoCliente(companyId, conta.id);
    const frequenciaDias =
      input.frequenciaDias != null && Number.isFinite(Number(input.frequenciaDias))
        ? Math.max(1, Math.trunc(Number(input.frequenciaDias)))
        : null;
    // proximaData: explícita > (se recorrente) hoje > null.
    const proximaData =
      parseDateOrNull(input.proximaData) ?? (frequenciaDias || diasSemana ? startOfDay(new Date()) : null);

    // MULTILOCAL (10/07) — em qual local este vínculo é entregue. Valida contra o
    // MESMO cliente+empresa; inválido/de-outro-cliente → null (o gerar-dia cai no
    // grupo "sem local", agregando com o principal — leniência igual ao contato/produto).
    const localId = await this.resolveLocalDoCliente(companyId, conta.id, input.localId);

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
        localId,
      },
      select: cpSelect,
    });
    return serializeClienteProduto(created, true);
  }

  /**
   * DIA É DO CLIENTE (27/07) — os dias de entrega da CONTA: união ISO dos dias
   * dos vínculos ativos. É a fonte que um vínculo novo herda.
   */
  async diasDoCliente(companyId: number, customerProfileId: string): Promise<string | null> {
    const rows = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId, ativo: true },
      select: { diasSemana: true },
    });
    const dias = new Set<number>();
    for (const row of rows) {
      for (const dia of parseDiasSemana(row.diasSemana)) dias.add(dia);
    }
    return dias.size ? [...dias].sort((a, b) => a - b).join(',') : null;
  }

  /**
   * 🔴 O ÚNICO caminho de escrita de dia da semana no sistema (27/07, ordem do
   * dono). Define os dias da VISITA do cliente: todos os vínculos ativos dele
   * passam a valer nesses dias, de uma vez — nunca mais produto A na terça e
   * produto B na quinta. Lista vazia = cliente sem dia fixo (os vínculos ficam,
   * só param de cair na agenda semanal).
   *
   * Devolve os ids dos vínculos tocados: o controller espelha cada um no plano
   * (ponte cadastro→agenda), que é o que o gerar-dia lê de verdade.
   */
  async definirDiasDoCliente(
    companyId: number,
    customerProfileId: string,
    dias: number[],
  ): Promise<{ vinculoIds: string[]; diasSemana: string | null }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: String(customerProfileId || '').trim(), companyId },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException('Cliente não encontrado');
    const diasSemana = normalizeDiasSemana(
      [...new Set((dias || []).map((d) => Math.trunc(Number(d))))].sort((a, b) => a - b).join(','),
    );
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId: conta.id, ativo: true },
      select: { id: true, diasSemana: true, proximaData: true },
    });
    for (const vinculo of vinculos) {
      if ((vinculo.diasSemana ?? null) === diasSemana) continue;
      await this.prisma.clienteProduto.update({
        where: { id: vinculo.id },
        data: {
          diasSemana,
          // Ganhou dia fixo e não tinha data de partida: começa a valer hoje
          // (mesma regra do create). Perdeu o dia: a data fica como estava.
          ...(diasSemana && !vinculo.proximaData ? { proximaData: startOfDay(new Date()) } : {}),
        },
      });
    }
    return { vinculoIds: vinculos.map((v) => v.id), diasSemana };
  }

  /**
   * MULTILOCAL — resolve o localId a gravar num vínculo: só aceita um LocalEntrega
   * do MESMO cliente+empresa; qualquer outra coisa (vazio, inexistente, de outro
   * cliente) vira null (default = grupo sem-local no gerar-dia, que pós-backfill
   * agrega com o principal). Não lança — leniência igual à do contato na entrega.
   */
  private async resolveLocalDoCliente(
    companyId: number,
    customerProfileId: string,
    localId?: string | null,
  ): Promise<string | null> {
    const want = String(localId || '').trim();
    if (!want) return null;
    const loc = await this.prisma.localEntrega.findFirst({
      where: { id: want, companyId, customerProfileId },
      select: { id: true },
    });
    return loc?.id ?? null;
  }

  async update(companyId: number, id: string, input: UpdateClienteProdutoInput): Promise<ClienteProdutoDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.clienteProduto.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true, customerProfileId: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.qtdPadrao != null) data.qtdPadrao = Math.max(1, Math.trunc(Number(input.qtdPadrao)));
    // MULTILOCAL — trocar o local do vínculo (valida contra o cliente dono; inválido → null).
    if (input.localId !== undefined)
      data.localId = await this.resolveLocalDoCliente(companyId, existing.customerProfileId, input.localId);
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
    // (dia da semana NÃO se edita por aqui — ver `definirDiasDoCliente`)
    if (input.proximaData !== undefined) data.proximaData = parseDateOrNull(input.proximaData);
    if (input.ativo !== undefined) data.ativo = !!input.ativo;

    const updated = await this.prisma.clienteProduto.update({
      where: { id: existing.id },
      data,
      select: cpSelect,
    });
    return serializeClienteProduto(updated, true);
  }

  /** Liga/desliga o vínculo (atalho do toggle da UI). */
  async toggleAtivo(companyId: number, id: string, ativo: boolean): Promise<ClienteProdutoDTO | null> {
    return this.update(companyId, id, { ativo });
  }

  /**
   * PONTE CADASTRO→AGENDA (26/07) — snapshot cru do vínculo ANTES de uma
   * mutação, pro controller espelhar a diferença nos planos da Agenda V2
   * (LogisticaAgendaService.espelharVinculoCadastro). Null = não existe.
   */
  async vinculoEspelhoSnapshot(companyId: number, id: string): Promise<EspelhoVinculoSnapshot | null> {
    return carregarVinculoEspelhoSnapshot(this.prisma, companyId, id);
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
  async listProdutos(companyId: number, actor?: ActorKindUserLike): Promise<ProdutoOptionDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const billingAudience = isBillingOwnerActor(actor);
    const rows = await this.prisma.product.findMany({
      where: { companyId, status: 'active', kind: 'tenant_product' },
      orderBy: [{ usaLogistica: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        unidade: true,
        usaLogistica: true,
        ...(billingAudience ? { price: true as const, priceCents: true as const } : {}),
      },
    });
    return rows.map((p) => ({
      id: p.id,
      nome: p.name,
      unidade: p.unidade ?? null,
      usaLogistica: p.usaLogistica,
      ...(billingAudience
        ? {
            precoCatalogo:
              typeof p.priceCents === 'number'
                ? p.priceCents / 100
                : typeof p.price === 'number'
                  ? p.price
                  : null,
          }
        : {}),
    }));
  }

  // ── PR18072026 W1 — façade de produtos sob /logistica (allowlist do APK) ────
  /**
   * POST /logistica/produtos — cria um produto do catálogo do tenant DIRETO
   * (o app do entregador só fala com `logistica/*`, não `/products`). Nasce
   * `kind='tenant_product'`, `status='active'`, `usaLogistica=true` (é o
   * catálogo do roteiro de entrega). Company-scoped (companyId do JWT).
   */
  async createProduto(companyId: number, input: CriarProdutoInput): Promise<ProdutoFacadeDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const nome = String(input.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Nome é obrigatório.');
    const priceCents = normalizePrecoCentavos(input.preco);
    const created = await this.prisma.product.create({
      data: {
        companyId,
        kind: 'tenant_product',
        status: 'active',
        name: nome.slice(0, 140),
        unidade: input.unidade?.trim() || null,
        usaLogistica: true,
        price: priceCents / 100,
        priceCents,
        stock: normalizeEstoque(input.estoque),
      },
    });
    return produtoFacadeDTO(created);
  }

  /**
   * PATCH /logistica/produtos/:id — nome/unidade/preço/estoque/ativo, company-
   * scoped (fail-closed: id de outra empresa → null, o controller vira 404).
   * Arquivar (`ativo:false`) mapeia para `Product.status='archived'` — some do
   * picker (listProdutos filtra `status:'active'`) sem quebrar vínculos
   * existentes (ClienteProduto/EntregaItem seguem apontando pro mesmo id).
   */
  async updateProduto(companyId: number, id: string, input: Partial<CriarProdutoInput> & { ativo?: boolean }): Promise<ProdutoFacadeDTO | null> {
    if (!companyId || !id) return null;
    const productId = Math.trunc(Number(id));
    if (!Number.isInteger(productId) || productId <= 0) return null;
    const existing = await this.prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) {
      const nome = String(input.nome).trim();
      if (!nome) throw new BadRequestException('Nome é obrigatório.');
      data.name = nome.slice(0, 140);
    }
    if (input.unidade !== undefined) data.unidade = String(input.unidade).trim() || null;
    if (input.preco !== undefined) {
      const priceCents = normalizePrecoCentavos(input.preco);
      data.priceCents = priceCents;
      data.price = priceCents / 100;
    }
    if (input.estoque !== undefined) data.stock = normalizeEstoque(input.estoque);
    // Arquivar = ativo=false: some do picker (listProdutos filtra status:'active')
    // sem quebrar vínculos existentes (produto continua existindo no banco).
    if (input.ativo !== undefined) data.status = input.ativo ? 'active' : 'archived';

    const updated = await this.prisma.product.update({ where: { id: existing.id }, data });
    return produtoFacadeDTO(updated);
  }

  // ── GERAR ENTREGAS DO DIA ────────────────────────────────────────────────────
  /**
   * Busca os vínculos ATIVOS candidatos do dia (proximaData vencida OU o dia bate
   * no diasSemana) e AGRUPA por cliente os que realmente vencem HOJE (dueOnDay).
   * Consulta única, reusada por `gerarDia` (que materializa) e `getDiaPreview`
   * (que só lê — pop-up "Gerar entregas" do app). Traz `product.name` e
   * `customerProfile.name` (só usados pelo preview; gerarDia ignora).
   */
  private async buscarVencidosPorCliente(
    companyId: number,
    dia: Date,
    dayEnd: Date,
    dow: number,
    includeBillingInputs = true,
  ) {
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: {
        companyId,
        ativo: true,
        OR: [{ proximaData: { lte: dayEnd } }, { diasSemana: { not: null } }],
      },
      select: {
        id: true,
        customerProfileId: true,
        // MULTILOCAL (10/07) — em qual local do cliente este vínculo entrega (null =
        // perfil/legado). É a chave da sub-agregação por local no gerarDia.
        localId: true,
        // MULTILOCAL (11/07) — o preview precisa receber também as coordenadas do
        // local. Sem elas o Android pinta a parada de vermelho antes da geração,
        // embora a entrega tenha GPS válido no banco.
        local: { select: { apelido: true, lat: true, lng: true, geoFonte: true } },
        productId: true,
        qtdPadrao: true,
        ...(includeBillingInputs ? { precoAcordado: true as const } : {}),
        frequenciaDias: true,
        diasSemana: true,
        proximaData: true,
        product: {
          select: {
            id: true,
            name: true,
            ...(includeBillingInputs ? { price: true as const, priceCents: true as const } : {}),
          },
        },
        customerProfile: {
          select: {
            id: true,
            name: true,
            // Fallback de legado: vínculos sem LocalEntrega continuam usando o
            // pino da ficha do cliente na prévia da rota.
            lat: true,
            lng: true,
            geoFonte: true,
            // PR18072026 W1 — observação livre sobre o cliente (dia-preview).
            observacoes: true,
            ...(includeBillingInputs ? { precoPadrao: true as const } : {}),
          },
        },
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
   * [companyId, customerProfileId, localId, dia]: se já existe QUALQUER entrega do
   * cliente NESTE LOCAL naquele dia (gerada por recorrência OU agendada à mão), NÃO
   * cria outra — e ainda assim avança proximaData de CADA vínculo vencido, pra não
   * ficar "preso" no passado.
   *
   * MULTILOCAL (10/07) — a agregação agora é por (cliente, LOCAL): sub-agrupa os
   * vínculos vencidos do cliente por localId e cria 1 Entrega por local (com o
   * localId gravado). Cliente com 1 local (todos após backfill) = 1 grupo só =
   * comportamento idêntico ao anterior (cliente+dia).
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
    const deliveryIds: string[] = [];

    for (const [customerProfileId, vencidos] of porCliente) {
      // MULTILOCAL (10/07) — sub-agrupa os vencidos do cliente POR LOCAL: 1 Entrega
      // por (cliente, local), com a agregação multi-item (TASK 5) preservada DENTRO
      // de cada local. Cliente com 1 local (todos após backfill) = 1 grupo só →
      // comportamento IDÊNTICO ao anterior. localId ausente/legado (null) forma seu
      // próprio grupo e cai no fallback do perfil na rota (chave '' = sentinela; um
      // cuid real nunca é vazio).
      const porLocal = new Map<string, typeof vencidos>();
      for (const v of vencidos) {
        const chave = v.localId ?? '';
        const arr = porLocal.get(chave);
        if (arr) arr.push(v);
        else porLocal.set(chave, [v]);
      }

      for (const vencidosDoLocal of porLocal.values()) {
        const localId = vencidosDoLocal[0].localId ?? null;

        // Idempotência por [companyId, customerProfileId, localId, dia]: já existe
        // entrega do cliente NESTE LOCAL neste dia? (qualquer origem). Sem o localId
        // na chave, o 2º local do cliente seria pulado (a checagem antiga era só
        // cliente+dia). localId null = "IS NULL" (entregas legadas/sem local).
        const existente = await this.prisma.entrega.findFirst({
          where: {
            companyId,
            customerProfileId,
            localId,
            scheduledAt: { gte: dia, lte: dayEnd },
          },
          select: { id: true, status: true },
        });

        // FIX 21/07 — entrega 'cancelada' não vale como "já existe": ela não entra
        // na rota (logistica-rota.service.ts), então pular por causa dela travava o
        // dia inteiro depois de um "limpar dia". Reabre a MESMA linha (não duplica
        // a entrega e não debita crédito de novo).
        if (existente && existente.status === 'cancelada') {
          const itensReabrir = vencidosDoLocal.map((v) => ({
            productId: v.productId,
            qtdPrevista: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
            valorUnit: resolveValorUnit(v),
          }));
          await this.prisma.entrega.update({
            where: { id: existente.id },
            data: {
              status: 'agendada',
              rotaOrdem: null,
              etaAt: null,
              startedAt: null,
              quantidade: itensReabrir.reduce((soma, it) => soma + it.qtdPrevista, 0),
              valor: itensReabrir.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0),
              itens: { deleteMany: {}, ...(itensReabrir.length ? { create: itensReabrir } : {}) },
            },
          });
          deliveryIds.push(existente.id);
        } else if (existente) {
          deliveryIds.push(existente.id);
          puladas++;
        } else {
          const itens = vencidosDoLocal.map((v) => ({
            productId: v.productId,
            qtdPrevista: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
            valorUnit: resolveValorUnit(v),
          }));
          const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
          const valor = itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0);

          // BUGFIX (09/07) — BUG 1: a Entrega nascia com contatoId=null; sem contato
          // gravado, o aviso "entregue" caía no CustomerProfile.phone (podendo estar
          // desatualizado — caso Josefino: o WhatsApp certo estava no Contato principal,
          // não no telefone da conta). Resolve o contato principal/mais-recente ANTES
          // de criar a Entrega — best-effort: falha aqui não pode travar o gerar-dia
          // (contatoId fica null, dispararWhatsappEntregue tem seu próprio fallback).
          let contatoId: string | null = null;
          try {
            contatoId = await resolvePrincipalContatoId(this.prisma as any, companyId, customerProfileId);
          } catch (e: any) {
            this.logger.warn(
              `[logistica] gerar-dia resolvePrincipalContato cliente=${customerProfileId} falhou: ${String(e?.message || e)}`,
            );
          }

          const criada = await this.prisma.entrega.create({
            data: {
              companyId,
              customerProfileId,
              contatoId,
              // MULTILOCAL — a Entrega herda o local do vínculo (null = perfil/legado).
              localId,
              // productId escalar legado = o do 1º vínculo (backward-compat N6; o
              // N6 real — montarVarsAviso/listRota — já prioriza `itens` sobre este
              // campo quando `itens.length > 0`, que é sempre o caso aqui).
              productId: vencidosDoLocal[0].productId,
              quantidade, // backward-compat: escalar coerente com a SOMA dos itens
              valor, // idem
              status: 'agendada',
              // L4-A (18/07) — mesma semântica do materialize (logistica-occurrence.service.ts):
              // este gerarDia materializa recorrência do dia.
              origem: 'recorrente',
              scheduledAt: dia,
              cobrancaStatus: 'pendente',
              itens: { create: itens },
            },
            select: { id: true },
          });
          deliveryIds.push(criada.id);
          criadas++;
        }

        // Avança proximaData de TODOS os vínculos vencidos DESTE local (mesmo quando
        // pulou — não deixa nenhum vínculo preso no passado).
        for (const v of vencidosDoLocal) {
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
    }

    const dayISO = dia.toISOString().slice(0, 10);
    this.logger.log(
      `[logistica] gerar-dia ${dayISO} company=${companyId}: ${criadas} criada(s), ${puladas} pulada(s) (idempotência), ${avancados} vínculo(s) avançado(s).`,
    );
    return { date: dayISO, criadas, puladas, avancados, candidatos: vinculos.length, deliveryIds };
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
   *
   * MULTILOCAL (11/07) — o preview agora ESPELHA o agrupamento do gerarDia: 1
   * linha por (cliente, LOCAL), não mais 1 por cliente (que somava itens de
   * todos os locais numa linha só, sub-representando o multi-local). Cada linha
   * ganha localId/localApelido (opcionais); cliente com 1 local (pós-backfill)
   * = 1 linha idêntica ao anterior, com localApelido null.
   */
  async getDiaPreview(
    companyId: number,
    dateInput?: string,
    actor?: ActorKindUserLike,
  ): Promise<DiaPreviewResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);
    const dow = isoDow(dia);

    const { porCliente } = await this.buscarVencidosPorCliente(
      companyId,
      dia,
      dayEnd,
      dow,
      isBillingOwnerActor(actor),
    );

    const clientes: DiaPreviewClienteDTO[] = [];
    for (const [customerProfileId, vencidos] of porCliente) {
      // Sub-agrupa por LOCAL — MESMA chave do gerarDia (localId ?? '' como
      // sentinela; um cuid real nunca é vazio). 1 grupo = 1 linha do preview.
      const porLocal = new Map<string, typeof vencidos>();
      for (const v of vencidos) {
        const chave = v.localId ?? '';
        const arr = porLocal.get(chave);
        if (arr) arr.push(v);
        else porLocal.set(chave, [v]);
      }

      for (const vencidosDoLocal of porLocal.values()) {
        // FIX (25/07) — mesmo bug do toStop (logistica-rota.service.ts): campo a
        // campo podia combinar a lat de uma fonte com a lng de outra.
        // resolverCoordenadaMultilocal escolhe a fonte inteira (local só vale com
        // lat E lng válidos; senão cai inteiro pro perfil).
        const coord = resolverCoordenadaMultilocal(
          vencidosDoLocal[0]?.local ?? null,
          vencidosDoLocal[0]?.customerProfile ?? null,
        );
        clientes.push({
          customerProfileId,
          nome: String(vencidosDoLocal[0]?.customerProfile?.name ?? '').trim(),
          // MULTILOCAL — a porta desta linha (null = perfil/legado) + o apelido.
          localId: vencidosDoLocal[0]?.localId ?? null,
          localApelido: vencidosDoLocal[0]?.local?.apelido ?? null,
          lat: coord.lat,
          lng: coord.lng,
          geoFonte: coord.geoFonte,
          itens: vencidosDoLocal.map((v) => ({
            productId: v.productId,
            nome: String(v.product?.name ?? '').trim(),
            qtd: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
          })),
          // PR18072026 W1 — observação livre sobre o cliente.
          observacoes: vencidosDoLocal[0]?.customerProfile?.observacoes ?? null,
        });
      }
    }

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
  precoAcordado?: number | null;
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
export function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Um "YYYY-MM-DD" puro (o que a UI manda em ?date=) DEVE ser lido no fuso LOCAL,
  // não como UTC-midnight — senão, num fuso atrás de UTC (Brasília -3), "2026-07-06"
  // vira 05/07 21:00 local e o dia da rota escorrega pro dia anterior. Datas com
  // hora/offset explícitos seguem o parse padrão.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
    // FIX (BUG 4, 11/07) — round-trip: "2026-13-40" ou "2026-02-30" são datas de
    // calendário IMPOSSÍVEIS mas bem-formadas; sem este check, o overflow do JS Date
    // as ROLA silenciosamente pro dia/mês seguinte (mês 13 = jan do ano seguinte,
    // dia 40 rola pro mês seguinte) e getTime() nunca vira NaN — a data rolada
    // passava como válida e podia materializar Entrega/PATCH proximaData no dia
    // ERRADO. Se o que voltou não bate com y/mo/day pedidos, é rollover → inválida.
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── PONTE CADASTRO→AGENDA (26/07) ───────────────────────────────────────────────
// Snapshot cru do vínculo pro espelho em LogisticaPlanoEntrega (o dia é do
// CLIENTE/visita, não do produto — ver logistica-agenda-espelho.util.ts).
// Função de MÓDULO (recebe o prisma) de propósito: o agenda.service já importa
// funções daqui; injetar serviços um no outro criaria ciclo de DI.
export async function carregarVinculoEspelhoSnapshot(
  prisma: { clienteProduto: { findFirst: (args: any) => Promise<any> } },
  companyId: number,
  id: string,
): Promise<EspelhoVinculoSnapshot | null> {
  if (!companyId || !id) return null;
  const row = await prisma.clienteProduto.findFirst({
    where: { id: String(id).trim(), companyId },
    select: {
      id: true,
      customerProfileId: true,
      localId: true,
      productId: true,
      qtdPadrao: true,
      ativo: true,
      diasSemana: true,
      frequenciaDias: true,
      proximaData: true,
      precoAcordado: true,
      product: { select: { price: true, priceCents: true } },
      customerProfile: { select: { precoPadrao: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    customerProfileId: row.customerProfileId,
    localId: row.localId ?? null,
    productId: row.productId,
    qtdPadrao: Math.max(1, Math.trunc(Number(row.qtdPadrao) || 1)),
    ativo: row.ativo !== false,
    diasSemana: row.diasSemana ?? null,
    frequenciaDias: row.frequenciaDias ?? null,
    proximaData: row.proximaData ?? null,
    valorUnit: resolveValorUnit(row),
  };
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
  localId: true,
  product: { select: { id: true, name: true, unidade: true, price: true, priceCents: true } },
} as const;

function serializeClienteProduto(r: any, billingAudience: boolean): ClienteProdutoDTO {
  return {
    id: r.id,
    customerProfileId: r.customerProfileId,
    productId: r.productId,
    qtdPadrao: r.qtdPadrao,
    ...(billingAudience ? { precoAcordado: r.precoAcordado ?? null } : {}),
    frequenciaDias: r.frequenciaDias ?? null,
    diasSemana: r.diasSemana ?? null,
    proximaData: r.proximaData ? r.proximaData.toISOString() : null,
    ativo: r.ativo,
    localId: r.localId ?? null,
    produto: r.product
      ? {
          id: r.product.id,
          nome: r.product.name,
          unidade: r.product.unidade ?? null,
          ...(billingAudience
            ? {
                precoCatalogo:
                  typeof r.product.priceCents === 'number'
                    ? r.product.priceCents / 100
                    : typeof r.product.price === 'number'
                      ? r.product.price
                      : null,
              }
            : {}),
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
  // (sem diasSemana: dia é do CLIENTE — definirDiasDoCliente, 27/07)
  proximaData?: string;
  ativo?: boolean;
  localId?: string;
}

export interface UpdateClienteProdutoInput {
  qtdPadrao?: number;
  precoAcordado?: number;
  frequenciaDias?: number;
  // (sem diasSemana: dia é do CLIENTE — definirDiasDoCliente, 27/07)
  proximaData?: string;
  ativo?: boolean;
  localId?: string;
}

export interface ClienteProdutoDTO {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado?: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  localId: string | null;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo?: number | null } | null;
}

export interface GerarDiaResult {
  date: string;
  criadas: number;
  puladas: number;
  avancados: number;
  candidatos: number;
  deliveryIds: string[];
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
  // MULTILOCAL (11/07) — a porta desta linha do preview (aditivo, backward-compat):
  // localId null = perfil/legado; localApelido null quando o local não tem apelido.
  localId?: string | null;
  localApelido?: string | null;
  // Coordenadas do local da parada (ou da ficha, em legado). O app usa estes
  // campos para validar a localização e desenhar a prévia antes de gerar.
  lat?: number | null;
  lng?: number | null;
  geoFonte?: string | null;
  itens: DiaPreviewItemDTO[];
  // PR18072026 W1 — observação livre sobre o cliente.
  observacoes?: string | null;
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
  precoCatalogo?: number | null;
}

// ── PR18072026 W1 — façade de produtos ────────────────────────────────────────
export interface CriarProdutoInput {
  nome: string;
  unidade?: string;
  preco?: number;
  estoque?: number;
}

export interface ProdutoFacadeDTO {
  id: number;
  nome: string;
  unidade: string | null;
  preco: number;
  estoque: number;
  ativo: boolean;
}

function normalizePrecoCentavos(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('preco inválido.');
  return Math.round(n * 100);
}

function normalizeEstoque(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException('estoque inválido.');
  return n;
}

function produtoFacadeDTO(row: { id: number; name: string; unidade: string | null; price: number | null; priceCents: number | null; stock: number | null; status: string }): ProdutoFacadeDTO {
  return {
    id: row.id,
    nome: row.name,
    unidade: row.unidade ?? null,
    preco: typeof row.priceCents === 'number' ? row.priceCents / 100 : typeof row.price === 'number' ? row.price : 0,
    estoque: row.stock ?? 0,
    ativo: row.status === 'active',
  };
}
