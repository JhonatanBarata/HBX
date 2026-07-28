import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaService } from '../logistica/logistica.service';
import {
  TENANT_FINANCE_SOURCE_MODULES,
  isLogisticaSource,
} from './finance-source-modules';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Teto de entregas resolvidas por extrato (fatura mensal pode somar centenas). */
const EXTRATO_ENTREGAS_CAP = 500;

/** providerPayload é TEXT com JSON — decodifica sem nunca derrubar o extrato. */
function parseDetalhes(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Entregas referenciadas por uma cobrança: a própria (avulsa) + as somadas (fatura). */
function entregaIdsDoCharge(
  entregaId: string | null,
  detalhes: Record<string, unknown> | null,
): string[] {
  const ids = new Set<string>();
  const direto = String(entregaId || '').trim();
  if (direto) ids.add(direto);
  const lista = detalhes?.entregaIds;
  if (Array.isArray(lista)) {
    for (const item of lista) {
      const id = String(item ?? '').trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export interface SaldoClienteRow {
  customerProfileId: string;
  nome: string | null;
  saldoAberto: number;
  cobrancas: number;
}
export interface SaldosResult {
  clientes: SaldoClienteRow[];
}
/** Uma entrega que COMPÕE a cobrança (a própria, ou uma das somadas na fatura mensal). */
export interface ExtratoEntregaRow {
  id: string;
  data: string | null; // deliveredAt (real) ou scheduledAt (agendada)
  entregue: boolean;
  status: string;
  quantidade: number;
  valor: number;
  produto: string | null;
  entregador: string | null;
  local: string | null;
  recebidoNaHora: boolean | null;
  receiptMethod: string | null;
  cobrancaOutcome: string | null;
  observacao: string | null;
}

export interface ExtratoChargeRow {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  lifecycle: string;
  sourceModule: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  // EXTRATO DETALHADO (28/07) — o resto do que a cobrança guarda de verdade.
  updatedAt: string | null;
  billingCycle: string | null;
  paymentMethod: string | null;
  competence: string | null;
  externalReference: string | null;
  entregaId: string | null;
  ledgerEntryId: string | null;
  refundedAt: string | null;
  refundAmount: number;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  mpMerchantOrderId: string | null;
  paymentUrl: string | null;
  pixTicketUrl: string | null;
  lastWebhookAt: string | null;
  criadoPorUserId: number | null;
  criadoPor: string | null;
  /** providerPayload já decodificado (forma, pagoNaHora, receiptMethod, mesRef…). */
  detalhes: Record<string, unknown> | null;
  /** Entregas que compõem esta cobrança (avulsa = 1; fatura mensal = as somadas). */
  entregas: ExtratoEntregaRow[];
  /** Quantas entregas a cobrança referencia (pode ser > entregas.length no teto). */
  entregasTotal: number;
}
export interface ExtratoResult {
  clienteId: string;
  nome: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoChargeRow[];
}
export interface QuitarResult {
  id: string;
  status: string;
  paidAt: string | null;
  alreadyPaid: boolean;
}

/**
 * FINANCEIRO-UNIVERSAL (Fase 1) — financeiro do TENANT desacoplado da logística.
 *
 * Lê/baixa `FinanceiroCharge` por CATÁLOGO de origens (TENANT_FINANCE_SOURCE_MODULES)
 * — hoje logística (entrega/fechamento) + vendas (fechamento). A receita da
 * PLATAFORMA (assinatura/recarga, sourceModule=null) fica FORA por construção.
 *
 * NÃO toca `logistica.service.ts`: a baixa de cobrança logística é DELEGADA ao
 * `LogisticaService.quitarCharge` (paridade total, inclusive parar a cadência
 * recovery). A logística segue intocada — garantia de não quebrar.
 *
 * LEI DO VENDEDOR: o controller é @Admin — só o responsável vê valores.
 */
@Injectable()
export class FinanceiroTenantService {
  private readonly logger = new Logger(FinanceiroTenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
  ) {}

  /** "Quem me deve": clientes com cobrança em aberto (pending) de QUALQUER origem do tenant. */
  async saldos(companyId: number): Promise<SaldosResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    const rows = await this.prisma.financeiroCharge.groupBy({
      by: ['customerProfileId'],
      where: {
        companyId,
        status: 'pending',
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
        customerProfileId: { not: null },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const comSaldo = rows
      .filter((r) => r.customerProfileId && round2(Number(r._sum.amount) || 0) > 0)
      .map((r) => ({
        customerProfileId: r.customerProfileId as string,
        saldoAberto: round2(Math.max(0, Number(r._sum.amount) || 0)),
        cobrancas: Number(r._count?._all) || 0,
      }));
    if (comSaldo.length === 0) return { clientes: [] };

    const ids = comSaldo.map((c) => c.customerProfileId);
    const nomes = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(nomes.map((n) => [n.id, n.name] as const));

    const clientes = comSaldo
      .map((c) => ({
        ...c,
        nome: String(nomePorId.get(c.customerProfileId) || '').trim() || null,
      }))
      .sort((a, b) => b.saldoAberto - a.saldoAberto);

    return { clientes };
  }

  /** Extrato de UM cliente: todas as cobranças do tenant (qualquer origem). company-scoped. */
  async extratoCliente(companyId: number, clienteId: string): Promise<ExtratoResult | null> {
    if (!companyId || !clienteId) return null;
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(clienteId).trim(), companyId },
      select: { id: true, name: true },
    });
    if (!cliente) return null;

    const charges = await this.prisma.financeiroCharge.findMany({
      where: {
        companyId,
        customerProfileId: cliente.id,
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        amount: true,
        currency: true,
        description: true,
        status: true,
        lifecycle: true,
        sourceModule: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        billingCycle: true,
        paymentMethod: true,
        competence: true,
        externalReference: true,
        entregaId: true,
        ledgerEntryId: true,
        refundedAt: true,
        refundAmount: true,
        mpPaymentId: true,
        mpPreferenceId: true,
        mpMerchantOrderId: true,
        paymentUrl: true,
        pixTicketUrl: true,
        lastWebhookAt: true,
        createdByUserId: true,
        providerPayload: true,
      },
    });

    const saldoAberto = round2(
      charges
        .filter((c) => c.status === 'pending')
        .reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0),
    );

    // Payload decodificado + entregas referenciadas, POR cobrança (1 passada só).
    const porCharge = charges.map((c) => {
      const detalhes = parseDetalhes(c.providerPayload);
      return { charge: c, detalhes, entregaIds: entregaIdsDoCharge(c.entregaId, detalhes) };
    });

    // Resolve NOME de quem criou e as ENTREGAS em consultas em LOTE (nada de N+1).
    const userIds = [
      ...new Set(porCharge.map((p) => p.charge.createdByUserId).filter((id): id is number => !!id)),
    ];
    const idsEntrega = new Set<string>();
    for (const p of porCharge) {
      for (const id of p.entregaIds) {
        if (idsEntrega.size >= EXTRATO_ENTREGAS_CAP) break;
        idsEntrega.add(id);
      }
    }

    const [usuarios, entregas] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { companyId, id: { in: userIds } },
            select: { id: true, name: true, username: true },
          })
        : Promise.resolve([]),
      idsEntrega.size
        ? this.prisma.entrega.findMany({
            where: { companyId, id: { in: [...idsEntrega] } },
            select: {
              id: true,
              status: true,
              quantidade: true,
              valor: true,
              scheduledAt: true,
              deliveredAt: true,
              recebidoNaHora: true,
              receiptMethod: true,
              cobrancaOutcome: true,
              notes: true,
              product: { select: { name: true } },
              entregador: { select: { name: true, username: true } },
              local: { select: { apelido: true, endereco: true, numero: true, bairro: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const nomePorUserId = new Map(
      usuarios.map((u) => [u.id, String(u.name || u.username || '').trim() || null] as const),
    );
    const entregaPorId = new Map<string, ExtratoEntregaRow>(
      entregas.map((e) => {
        const local = e.local
          ? [
              String(e.local.apelido || '').trim(),
              [String(e.local.endereco || '').trim(), String(e.local.numero || '').trim()]
                .filter(Boolean)
                .join(', '),
              String(e.local.bairro || '').trim(),
            ]
              .filter(Boolean)
              .join(' — ')
          : '';
        const row: ExtratoEntregaRow = {
          id: e.id,
          data: iso(e.deliveredAt ?? e.scheduledAt),
          entregue: Boolean(e.deliveredAt),
          status: e.status,
          quantidade: Number(e.quantidade) || 0,
          valor: round2(Number(e.valor) || 0),
          produto: String(e.product?.name || '').trim() || null,
          entregador: String(e.entregador?.name || e.entregador?.username || '').trim() || null,
          local: local || null,
          recebidoNaHora: e.recebidoNaHora ?? null,
          receiptMethod: e.receiptMethod ?? null,
          cobrancaOutcome: e.cobrancaOutcome ?? null,
          observacao: String(e.notes || '').trim() || null,
        };
        return [e.id, row] as const;
      }),
    );

    return {
      clienteId: cliente.id,
      nome: String(cliente.name || '').trim() || null,
      saldoAberto,
      total: charges.length,
      charges: porCharge.map(({ charge: c, detalhes, entregaIds }) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        description: c.description,
        status: c.status,
        lifecycle: c.lifecycle,
        sourceModule: c.sourceModule ?? null,
        dueDate: iso(c.dueDate),
        paidAt: iso(c.paidAt),
        createdAt: iso(c.createdAt),
        updatedAt: iso(c.updatedAt),
        billingCycle: c.billingCycle ?? null,
        paymentMethod: c.paymentMethod ?? null,
        competence: c.competence ?? null,
        externalReference: c.externalReference ?? null,
        entregaId: c.entregaId ?? null,
        ledgerEntryId: c.ledgerEntryId ?? null,
        refundedAt: iso(c.refundedAt),
        refundAmount: round2(Number(c.refundAmount) || 0),
        mpPaymentId: c.mpPaymentId ?? null,
        mpPreferenceId: c.mpPreferenceId ?? null,
        mpMerchantOrderId: c.mpMerchantOrderId ?? null,
        paymentUrl: c.paymentUrl ?? null,
        pixTicketUrl: c.pixTicketUrl ?? null,
        lastWebhookAt: iso(c.lastWebhookAt),
        criadoPorUserId: c.createdByUserId ?? null,
        criadoPor: c.createdByUserId ? (nomePorUserId.get(c.createdByUserId) ?? null) : null,
        detalhes,
        entregas: entregaIds
          .map((id) => entregaPorId.get(id))
          .filter((e): e is ExtratoEntregaRow => !!e),
        entregasTotal: entregaIds.length,
      })),
    };
  }

  /**
   * Baixa manual GENÉRICA de uma cobrança do tenant.
   * - origem LOGÍSTICA → delega ao LogisticaService.quitarCharge (mesma parada de
   *   recovery, mesma auditoria — zero divergência de comportamento).
   * - origem VENDAS (ou outra futura do catálogo) → claim atômico local
   *   (pending→approved/paid), idempotente. Não toca MP, não dispara nada.
   * Charge de outra empresa ou origem fora do catálogo → null (controller → 404).
   */
  async quitarCharge(
    companyId: number,
    chargeId: string,
    opts: { userId?: number | null } = {},
  ): Promise<QuitarResult | null> {
    if (!companyId || !chargeId) return null;
    const id = String(chargeId).trim();

    const charge = await this.prisma.financeiroCharge.findFirst({
      where: {
        id,
        companyId,
        sourceModule: { in: [...TENANT_FINANCE_SOURCE_MODULES] },
      },
      select: { id: true, status: true, lifecycle: true, amount: true, paidAt: true, sourceModule: true },
    });
    if (!charge) return null;

    // Logística: delega (paridade total + para a cadência recovery de quem pagou).
    if (isLogisticaSource(charge.sourceModule)) {
      const res = await this.logistica.quitarCharge(companyId, id, opts);
      if (!res) return null;
      return { id: res.id, status: res.status, paidAt: res.paidAt, alreadyPaid: res.alreadyPaid };
    }

    // Já paga → idempotente (200 com estado atual).
    if (charge.paidAt || charge.status === 'approved' || charge.lifecycle === 'paid') {
      return {
        id: charge.id,
        status: charge.status,
        paidAt: charge.paidAt ? charge.paidAt.toISOString() : null,
        alreadyPaid: true,
      };
    }
    // Não-quitável (cancelled/failed/refunded) → devolve estado sem mutar.
    if (String(charge.status).trim().toLowerCase() !== 'pending') {
      return { id: charge.id, status: charge.status, paidAt: null, alreadyPaid: false };
    }

    // Claim atômico pending→paga (guarda no WHERE): 2 cliques = 1 baixa.
    const now = new Date();
    const claim = await this.prisma.financeiroCharge.updateMany({
      where: { id: charge.id, companyId, status: 'pending' },
      data: { status: 'approved', lifecycle: 'paid', paidAt: now },
    });
    if (!claim.count) {
      const atual = await this.prisma.financeiroCharge.findFirst({
        where: { id: charge.id, companyId },
        select: { id: true, status: true, paidAt: true },
      });
      if (!atual) return null;
      return {
        id: atual.id,
        status: atual.status,
        paidAt: atual.paidAt ? atual.paidAt.toISOString() : null,
        alreadyPaid: Boolean(atual.paidAt) || atual.status === 'approved',
      };
    }

    this.logger.log(
      `[financeiro-tenant] baixa manual: charge=${charge.id} company=${companyId} amount=${charge.amount} source=${charge.sourceModule} user=${opts.userId ?? 'n/d'} paidAt=${now.toISOString()}`,
    );
    return { id: charge.id, status: 'approved', paidAt: now.toISOString(), alreadyPaid: false };
  }
}
