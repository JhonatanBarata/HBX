import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaService } from './logistica.service';
import type { LogisticaActor } from './logistica-operacao.service';
import { isoWeekdayForDate, saoPauloDateKey } from './logistica-occurrence.service';
import { saoPauloMidnight } from './logistica-agenda-cursor.util';
import { resolveValorUnit } from './logistica-recorrencia.service';
import type { VenderCadernetaDto } from './dto/logistica.dto';

/**
 * MODO CADERNETA (PR04082026-MODO-CADERNETA) — venda por toque no cliente, SEM
 * rota e SEM debitar crédito (o débito segue exclusivo do Iniciar rota).
 *
 * Nasceu do André (company 41): ele abandonou a ROTA (pinos podres), não o app —
 * usa a tela de Clientes como caderneta. Aqui a venda registrada é a MESMA
 * máquina do confirmar da rota (cobrança, comprovante, GPS de ouro realimenta o
 * pino ≤60m) — cada venda registrada conserta um pino, e o medidor "Mapa: X de N"
 * mostra o GPS sendo reconstruído até o dia liberar a rota de volta.
 *
 * Reuso deliberado: `vender` = createEntrega + confirmarEntrega EXISTENTES —
 * nenhuma regra de dinheiro nova mora aqui (código financeiro tem dono).
 */

// Fontes PROVADAS no campo — MESMA lei do semáforo da conferência
// (GEOFONTES_PROVADAS em logistica-conferencia.util.ts): geocode não conta.
const FONTES_PROVADAS = new Set(['gps_entrega', 'gps_cadastro']);

export interface CadernetaMedida {
  total: number;
  provados: number;
  pronto: boolean;
}

export interface CadernetaResumo {
  ativo: boolean;
  dia: CadernetaMedida;
  // A BASE DA AGENDA (PR05082026-VER-TELA V4, 05/08): todos os clientes com dia
  // de entrega cadastrado, não só os de hoje. É ELA que decide quando o convite
  // do GPS aparece — emenda 3 do dono: cliente avulso, sem dia, nunca trava o
  // GPS de ninguém. Campo ADITIVO: APK velho simplesmente ignora.
  base: CadernetaMedida;
  // null quando o módulo financeiro do tenant está OFF — sem financeiro não
  // existe "quanto entrou por forma"; número inventado em tela de dinheiro é
  // mentira (o APK esconde o card quando vem null).
  fechamento: {
    totalCents: number;
    vendas: number;
    formas: { dinheiroCents: number; pixCents: number; cartaoCents: number; fiadoCents: number };
  } | null;
  // QUEM DEVE (05/08, ordem do dono: `{Devedor?} S/N? Caso sim: "Deve: {valor}"`)
  // — só quem tem saldo em aberto entra, em centavos, indexado pelo id do
  // cliente. Vem no resumo (e não no roster) porque a lista da caderneta mistura
  // duas fontes (agenda do dia + entregas de hoje) e o "Deve" tem de valer pras
  // duas. Vazio com financeiro OFF: sem cobrança não existe devedor.
  devedores: Record<string, number>;
}

export interface CadernetaVendaResult {
  ok: true;
  entregaId: string;
  totalCents: number;
  replayed?: boolean;
}

export interface CadernetaApagarVendaResult {
  ok: true;
  entregaId: string;
  /** true quando a venda já estava apagada (2º toque, replay da fila offline). */
  jaApagada?: boolean;
}

function cents(valor: number | null | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function dateKeyValida(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : saoPauloDateKey(new Date());
}

@Injectable()
export class LogisticaCadernetaService {
  private readonly logger = new Logger(LogisticaCadernetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
  ) {}

  private async configRow(companyId: number) {
    return this.prisma.logisticaConfig.findUnique({ where: { companyId } });
  }

  /** Medidor do dia + fechamento por forma — o contrato da tela caderneta do APK. */
  async resumo(companyId: number, dateInput?: unknown): Promise<CadernetaResumo> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dateKey = dateKeyValida(dateInput);
    const cfg = await this.configRow(companyId);

    // ── Medidores: clientes × quantos têm localização PROVADA no campo. Dois
    // recortes da MESMA conta (dia é do CLIENTE — LogisticaPlanoEntrega é a
    // verdade): o DIA (só quem entrega hoje) e a BASE (todo mundo com dia
    // cadastrado). Read-only: nunca materializa entrega nem avança proximaData
    // (mesma lei do dia-preview).
    const diaSemana = isoWeekdayForDate(dateKey);
    const [dia, base] = await Promise.all([
      this.medir(companyId, diaSemana),
      this.medir(companyId, null),
    ]);

    // ── Fechamento do dia: a conta que o dono faz de cabeça hoje (quanto entrou
    // em dinheiro/pix/cartão + quanto ficou fiado). Fonte = Entrega entregue no
    // dia civil SP; método imediato soma na forma, o resto é fiado do dia.
    // Financeiro OFF → null (sem cobrança não há forma; o card nem aparece).
    // "Deve: R$ X" da linha do dia. REUSA `saldosFinanceiro` — a mesma visão
    // "quem me deve" da web, que por sua vez lê a fonte única
    // `saldoAbertoPorClientes`. Escrever uma 2ª conta de dívida aqui seria a
    // receita pronta pro APK e o extrato discordarem. Best-effort: dívida é
    // enfeite da linha; falha dela nunca pode derrubar a tela do dia.
    let devedores: Record<string, number> = {};
    if (cfg?.moduloFinanceiroAtivo) {
      try {
        const saldos = await this.logistica.saldosFinanceiro(companyId);
        for (const row of saldos.clientes || []) {
          const c = cents(row.saldoAberto);
          if (c > 0) devedores[row.customerProfileId] = c;
        }
      } catch (e: any) {
        this.logger.warn(`[caderneta] devedores company=${companyId} falhou: ${String(e?.message || e)}`);
        devedores = {};
      }
    }

    let fechamento: CadernetaResumo['fechamento'] = null;
    if (cfg?.moduloFinanceiroAtivo) {
      const inicio = saoPauloMidnight(dateKey);
      const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
      const entregues = await this.prisma.entrega.findMany({
        where: { companyId, status: 'entregue', deliveredAt: { gte: inicio, lt: fim } },
        select: { valor: true, receiptMethod: true },
      });
      const formas = { dinheiroCents: 0, pixCents: 0, cartaoCents: 0, fiadoCents: 0 };
      let totalCents = 0;
      for (const e of entregues) {
        const c = cents(e.valor);
        totalCents += c;
        if (e.receiptMethod === 'dinheiro') formas.dinheiroCents += c;
        else if (e.receiptMethod === 'pix') formas.pixCents += c;
        else if (e.receiptMethod === 'cartao') formas.cartaoCents += c;
        else formas.fiadoCents += c;
      }
      fechamento = { totalCents, vendas: entregues.length, formas };
    }

    return { ativo: !!cfg?.modoCaderneta, dia, base, fechamento, devedores };
  }

  /**
   * Quantos clientes com plano de entrega ativo, e quantos deles já têm o
   * endereço PROVADO em campo. `diaSemana = null` mede a BASE inteira (o
   * recorte do convite do GPS); com um dia, mede só quem entrega naquele dia.
   *
   * "Pronto" exige total > 0: base vazia não é base provada — oferecer o GPS
   * pra quem não tem cliente nenhum seria convite pra tela vazia.
   */
  private async medir(companyId: number, diaSemana: number | null): Promise<CadernetaMedida> {
    const planos = await this.prisma.logisticaPlanoEntrega.findMany({
      // Cliente morto não conta (mesma régua CLIENTE_VIVO da agenda).
      where: {
        companyId,
        ativo: true,
        ...(diaSemana === null ? {} : { diaSemana }),
        customerProfile: { status: 'active', isCliente: true },
      },
      select: { customerProfileId: true },
    });
    const clienteIds = [...new Set(planos.map((p) => p.customerProfileId))];
    if (!clienteIds.length) return { total: 0, provados: 0, pronto: false };

    const contas = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: clienteIds } },
      select: {
        geoFonte: true,
        // O pino que a rota USA é o do local principal (multilocal); perfil é fallback.
        locais: {
          where: { ativo: true, isPrincipal: true },
          select: { geoFonte: true },
          take: 1,
        },
      },
    });
    let provados = 0;
    for (const conta of contas) {
      const fonte = conta.locais[0]?.geoFonte ?? conta.geoFonte;
      if (fonte && FONTES_PROVADAS.has(fonte)) provados += 1;
    }
    const total = clienteIds.length;
    return { total, provados, pronto: total > 0 && provados >= total };
  }

  /**
   * Vendeu: cria a Entrega de HOJE já entregue reusando createEntrega +
   * confirmarEntrega (cobrança/GPS/idempotência da casa). NUNCA debita crédito.
   */
  async vender(
    companyId: number,
    dto: VenderCadernetaDto,
    actor?: LogisticaActor | null,
  ): Promise<CadernetaVendaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.configRow(companyId);
    if (!cfg?.modoCaderneta) {
      throw new BadRequestException('O modo caderneta está desligado nos Ajustes.');
    }
    const itens = Array.isArray(dto.itens) ? dto.itens : [];
    if (itens.length === 0) throw new BadRequestException('Escolha ao menos um produto.');
    const desfecho = String(dto.desfecho || '').trim();
    const metodo = String(dto.metodo || '').trim() || null;
    // Método só é exigível quando existe FINANCEIRO pra registrá-lo. Com o módulo
    // OFF a folha tem um botão só ("Entregue") e não manda método — exigir aqui
    // travaria TODA venda do tenant sem financeiro.
    if (desfecho === 'pagou' && !metodo && cfg.moduloFinanceiroAtivo) {
      throw new BadRequestException('Escolha como recebeu: dinheiro, Pix ou cartão.');
    }
    const key = String(dto.idempotencyKey || '').trim().slice(0, 80);
    if (!key) throw new BadRequestException('Chave de idempotência é obrigatória.');

    // Idempotência do CLIQUE (antes de criar qualquer coisa): a mesma key já
    // virou venda → devolve o desfecho anterior, nada re-executa. (A janela
    // criar→confirmar não pré-grava a key de propósito: o replay do confirmar
    // PRESSUPÕE que key gravada = entrega confirmada — ver M8.)
    const anterior = await this.prisma.entrega.findFirst({
      where: { companyId, idempotencyKey: key },
      select: { id: true, valor: true },
    });
    if (anterior) {
      return { ok: true, entregaId: anterior.id, totalCents: cents(anterior.valor), replayed: true };
    }

    // 🔴 PREÇO POR CLIENTE (05/08) — a régua de sempre, resolvida AQUI e não no
    // createEntrega (que só conhece o catálogo). Sem isto a caderneta cobrava
    // R$13 de quem tem R$11 combinado (Larissa, cia 41): o precoAcordado estava
    // no banco desde 24/07 e nenhum caminho da venda o lia. Fica DEPOIS do
    // portão de idempotência de propósito — replay não consulta preço nenhum.
    const precos = await this.resolverPrecos(companyId, dto.clienteId, itens);

    const [primeiro, ...resto] = itens;
    const precoPrimeiro = precos.get(primeiro.productId);
    const criada = await this.logistica.createEntrega(
      companyId,
      {
        customerProfileId: dto.clienteId,
        productId: primeiro.productId,
        quantidade: primeiro.quantidade,
        localId: dto.localId,
        // `valor` do createEntrega é o TOTAL da entrega (ele só multiplica pela
        // quantidade quando o valor NÃO vem explícito) — por isso a conta sai
        // daqui já feita. Sem este campo o preço voltaria a ser o de catálogo.
        valor: round2(precoPrimeiro!.valorUnit * primeiro.quantidade),
      },
      actor ?? null,
    );

    // Confirma na mesma máquina da rota. 'deveu' manda 'fiado' EXPLÍCITO — sem
    // isso o M6 derivaria o metodoPadrao do cliente na_hora e QUITARIA uma venda
    // que ficou pendurada. Ator não filtra aqui: a entrega nasceu NESTA chamada,
    // sem entregador — o escopo por-tenant (companyId) segue duro.
    await this.logistica.confirmarEntrega(
      companyId,
      criada.id,
      {
        lat: dto.gps?.lat,
        lng: dto.gps?.lng,
        accuracy: dto.gps?.accuracy,
        receiptMethod: desfecho === 'pagou' ? (metodo ?? undefined) : 'fiado',
        novosItens: resto.map((i) => ({
          productId: i.productId,
          qtdEntregue: i.quantidade,
          valorUnit: precos.get(i.productId)!.valorUnit,
        })),
        idempotencyKey: key,
      },
      null,
    );

    // 🔴 O PREÇO EDITADO FICA (ordem do dono: "ficar o preço fixo até a
    // próxima"). Só o que ele TOCOU vira combinado — venda com preço herdado
    // não reescreve cadastro. Best-effort: gravar o combinado nunca derruba uma
    // venda que JÁ aconteceu (o dinheiro da entrega já está lançado acima).
    for (const item of itens) {
      const preco = precos.get(item.productId);
      if (!preco?.editado) continue;
      try {
        await this.gravarPrecoCombinado(companyId, dto.clienteId, item.productId, preco.valorUnit);
      } catch (e: any) {
        this.logger.warn(
          `[caderneta] preço combinado cliente=${dto.clienteId} produto=${item.productId} falhou: ${String(e?.message || e)}`,
        );
      }
    }

    // Número da casa (opcional, best-effort): completa o cadastro SEM nunca
    // travar a venda — e só preenche o que está VAZIO (nunca reescreve decisão).
    const numero = String(dto.numero || '').trim().slice(0, 20);
    if (numero) {
      try {
        await this.prisma.customerProfile.updateMany({
          where: { companyId, id: dto.clienteId, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
        await this.prisma.localEntrega.updateMany({
          where: dto.localId
            ? { companyId, id: dto.localId, customerProfileId: dto.clienteId, OR: [{ numero: null }, { numero: '' }] }
            : { companyId, customerProfileId: dto.clienteId, isPrincipal: true, ativo: true, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
      } catch (e: any) {
        this.logger.warn(`[caderneta] numero best-effort cliente=${dto.clienteId} falhou: ${String(e?.message || e)}`);
      }
    }

    const final = await this.prisma.entrega.findFirst({
      where: { companyId, id: criada.id },
      select: { valor: true },
    });
    return { ok: true, entregaId: criada.id, totalCents: cents(final?.valor) };
  }

  /**
   * O preço unitário de CADA item da venda, resolvido no servidor.
   *
   * Ordem (a MESMA de `resolveValorUnit` que o gerarDia usa pra gravar o
   * EntregaItem — as duas telas nunca podem discordar):
   *   1. preço EDITADO na folha da venda (só quando o dono tocou no valor);
   *   2. `ClienteProduto.precoAcordado` — o preço combinado com ESTE cliente;
   *   3. preço de catálogo do produto;
   *   4. `precoPadrao` do cliente; 5. zero.
   *
   * `editado` viaja junto porque é ele que decide se o preço vira combinado
   * (item 2 do pedido do dono) — herdar preço nunca reescreve cadastro.
   */
  private async resolverPrecos(
    companyId: number,
    clienteId: string,
    itens: Array<{ productId: number; quantidade: number; valorUnit?: number }>,
  ): Promise<Map<number, { valorUnit: number; editado: boolean }>> {
    const productIds = [...new Set(itens.map((i) => Math.trunc(Number(i.productId))))];
    const [vinculos, produtos, conta] = await Promise.all([
      this.prisma.clienteProduto.findMany({
        where: { companyId, customerProfileId: clienteId, productId: { in: productIds }, ativo: true },
        // O vínculo mais antigo do par cliente+produto é "o de sempre" (o schema
        // permite o mesmo produto 2× pra recorrência — mesma régua do
        // ensureVinculoSemDia da Leitura de Rota).
        orderBy: [{ createdAt: 'asc' }],
        select: { productId: true, precoAcordado: true },
      }),
      this.prisma.product.findMany({
        where: { companyId, id: { in: productIds } },
        select: { id: true, price: true, priceCents: true },
      }),
      this.prisma.customerProfile.findFirst({
        where: { companyId, id: clienteId },
        select: { precoPadrao: true },
      }),
    ]);

    const acordadoPor = new Map<number, number>();
    for (const v of vinculos) {
      if (v.precoAcordado == null || !Number.isFinite(v.precoAcordado)) continue;
      if (!acordadoPor.has(v.productId)) acordadoPor.set(v.productId, v.precoAcordado);
    }
    const produtoPor = new Map(produtos.map((p) => [p.id, p]));

    const out = new Map<number, { valorUnit: number; editado: boolean }>();
    for (const item of itens) {
      const productId = Math.trunc(Number(item.productId));
      if (out.has(productId)) continue;
      const editado = item.valorUnit != null && Number.isFinite(Number(item.valorUnit));
      const valorUnit = editado
        ? Math.max(0, round2(Number(item.valorUnit)))
        : resolveValorUnit({
            precoAcordado: acordadoPor.get(productId) ?? null,
            product: produtoPor.get(productId) ?? null,
            customerProfile: conta ?? null,
          });
      out.set(productId, { valorUnit, editado });
    }
    return out;
  }

  /**
   * Grava o preço combinado com o cliente. Sem vínculo, cria um SEM DIA —
   * invisível pro gerar-dia (`buscarVencidosPorCliente` só olha quem tem
   * diasSemana ou proximaData), então guardar um preço NUNCA inventa recorrência.
   *
   * Toca SÓ o preço: `qtdPadrao`, dias e cadência ficam como o dono deixou. Ele
   * pediu que o PREÇO ficasse fixo — vender 3 hoje não pode virar "3 sempre".
   */
  private async gravarPrecoCombinado(
    companyId: number,
    clienteId: string,
    productId: number,
    valorUnit: number,
  ): Promise<void> {
    const existente = await this.prisma.clienteProduto.findFirst({
      where: { companyId, customerProfileId: clienteId, productId },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, precoAcordado: true },
    });
    if (existente) {
      if (Number(existente.precoAcordado) === valorUnit) return;
      await this.prisma.clienteProduto.update({
        where: { id: existente.id },
        data: { precoAcordado: valorUnit },
      });
      return;
    }
    await this.prisma.clienteProduto.create({
      data: {
        companyId,
        customerProfileId: clienteId,
        productId,
        precoAcordado: valorUnit,
        qtdPadrao: 1,
        diasSemana: null,
        frequenciaDias: null,
        proximaData: null,
      },
    });
  }

  /**
   * 🔴 APAGAR A VENDA ERRADA (05/08, pedido do dono: "cliente não consegue
   * excluir entrega errada, mantém pressionado e não deleta — tem q apagar do
   * histórico tbm").
   *
   * Desfaz a venda INTEIRA, nos três lugares onde ela aparece:
   *   1. a entrega vira 'cancelada' → sai da lista do dia E do fechamento
   *      (o fechamento conta `status:'entregue'`);
   *   2. a cobrança DESTA entrega é cancelada;
   *   3. a linha do histórico do cliente é apagada.
   *
   * 💰 DINHEIRO JÁ RECEBIDO TAMBÉM É DESFEITO AQUI — de propósito, e é a única
   * porta do sistema em que isso acontece. Não é o sistema decidindo: é uma
   * venda que NÃO EXISTIU, apagada pelo dono com o dedo em cima da linha e uma
   * confirmação. Deixar o charge pago de pé faria o fechamento do dia mentir
   * pra sempre, que é o oposto do que ele pediu. O estado anterior fica inteiro
   * no `DeletionRecord` (snapshot da entrega + do charge), então o desfazer tem
   * volta pelas mãos do suporte.
   *
   * Idempotente: entrega já cancelada devolve `jaApagada` e ainda assim varre o
   * histórico (o 2º toque limpa o que o 1º não conseguiu).
   */
  async apagarVenda(
    companyId: number,
    entregaId: string,
    opts: { deletedByUserId?: number | null } = {},
  ): Promise<CadernetaApagarVendaResult | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const id = String(entregaId || '').trim();
    if (!id) throw new BadRequestException('Entrega não identificada');

    const entrega = await this.prisma.entrega.findFirst({
      where: { id, companyId },
      select: {
        id: true, companyId: true, customerProfileId: true, productId: true, quantidade: true,
        valor: true, status: true, receiptMethod: true, cobrancaStatus: true, notes: true,
        scheduledAt: true, deliveredAt: true,
      },
    });
    if (!entrega) return null;

    // 💰 FAIL-CLOSED: entrega já FATURADA está dentro de uma fatura fechada do
    // mês (1 charge agrupando N entregas, sem `entregaId` — o cancelamento
    // abaixo nem a encontraria). Sumir com a entrega e deixar a fatura de pé
    // seria a tela mentindo sobre o que foi cobrado. Desfazer isso é decisão de
    // fechamento, não de toque-longo na rua.
    if (entrega.cobrancaStatus === 'faturada') {
      throw new BadRequestException('Esta entrega já entrou no fechamento do mês. Ajuste pelo financeiro.');
    }

    const jaApagada = entrega.status === 'cancelada';
    const charges = await this.prisma.financeiroCharge.findMany({
      where: { companyId, entregaId: entrega.id },
      select: { id: true, amount: true, status: true, lifecycle: true, paidAt: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (!jaApagada) {
        await tx.deletionRecord.create({
          data: {
            moduleKey: 'logistica',
            entityType: 'Entrega',
            entityId: entrega.id,
            companyId,
            motivo: 'Venda apagada na caderneta',
            snapshot: JSON.stringify({ entrega, charges }),
            deletedByUserId: opts.deletedByUserId ?? null,
          },
        });
        await tx.financeiroCharge.updateMany({
          where: { companyId, entregaId: entrega.id, status: { not: 'cancelled' } },
          data: { status: 'cancelled', lifecycle: 'cancelled' },
        });
        await tx.entrega.update({
          where: { id: entrega.id },
          data: {
            status: 'cancelada',
            cobrancaStatus: 'pendente',
            notes: `${entrega.notes ? entrega.notes + ' | ' : ''}Venda apagada na caderneta`.slice(0, 500),
          },
        });
      }
      // Sempre — é a segunda metade literal do pedido ("apagar do histórico tbm").
      await tx.clienteHistorico.deleteMany({ where: { companyId, entregaId: entrega.id } });
    });

    return { ok: true, entregaId: entrega.id, ...(jaApagada ? { jaApagada: true } : {}) };
  }
}

function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}
