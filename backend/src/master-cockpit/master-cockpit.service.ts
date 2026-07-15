import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import {
  resolveCompanyAccessState,
  CompanyAccessSnapshot,
} from '../modules/company-access-state';
import {
  getCommercialPlanMonthlyPrice,
  getCommercialPlanTitle,
} from '../commercial-plans/commercial-plan-catalog';
import { CreditsService } from '../credits/credits.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { isCreditsFeatureEnabled } from '../credits/credits.flags';
import { COMPANY_KIND_TENANT } from '../common/company-kind';

// Cockpit do MASTER (Camada 5 do onboarding HBX). O system master OPERA a
// plataforma — este service só LÊ (cross-company) e agrega. NÃO escreve nada e
// NÃO duplica lógica de comissão/venda/team — apenas projeta os dados que esses
// donos já gravaram:
//   - Feed do flywheel: VendasLead (saleStatus/saleValue/commissionAmount…)
//   - Comissões: VendasCommissionReceivable (payable/paid/pending)
//   - Roster/status: Company + resolveCompanyAccessState; saldo/consumo de crédito
//     vêm do ledger (CreditWalletService — fonte única de saldo)
//   - MASTER-REFAB S5 (modelo crédito): recarga 30d/circulação REUSAM
//     CreditsService.getMasterOverview (via DI, 1 fonte só); burn 7d e consumo
//     30d = Σ débitos (kind='debit') do CreditLedgerEntry; funil de ativação
//     cadastro→1º consumo→1ª recarga
//   - Vendedores ativados: User.onboardingStateJson (first_conversation_started)
//     OU derivação barata (lead atribuído + conversa) — espelha a derivação do
//     OnboardingController.checklist (LEITURA; não edita aquele arquivo).
//
// Tudo defensivo: cada bloco engole erro e devolve vazio — o cockpit nunca
// quebra por uma query lenta/ausente.

type SaleFeedItem = {
  leadId: string;
  at: string;
  companyId: number;
  companyName: string;
  sellerUserId: number | null;
  sellerName: string;
  planKey: string | null;
  planTitle: string | null;
  saleValue: number;
  setupValue: number;
  commissionAmount: number;
  saleStatus: string;
  commissionStatus: string;
  text: string;
};

type CommissionFeedItem = {
  id: string;
  at: string;
  companyId: number;
  companyName: string;
  sellerUserId: number | null;
  sellerName: string;
  amount: number;
  status: string;
  kind: string;
  text: string;
};

// C4 (TESTE-GERAL/CORRECOES.md): totais de hoje/mês calculados por query Prisma
// própria (count/aggregate), SEM depender do `take: 60` do feed visual.
type SaleAndCommissionTotals = {
  salesTodayCount: number;
  salesTodayValue: number;
  salesMonthCount: number;
  salesMonthValue: number;
  commissionPayable: number;
  commissionPaidMonth: number;
};

type RosterCompany = {
  id: number;
  name: string;
  slug: string | null;
  state: string;
  statusLabel: string;
  riskLevel: string;
  released: boolean;
  planKey: string | null;
  planTitle: string;
  mrr: number;
  sellsHbxPlans: boolean;
  sellerCount: number;
  activatedSellerCount: number;
  createdAt: string | null;
  // S5 (modelo crédito): saldo atual da carteira (null = módulo de crédito OFF na env)
  // + consumo de créditos nos últimos 30d (Σ débitos do ledger).
  creditsBalance: number | null;
  consumption30d: number;
};

// ── MASTER-REFAB S5 — blocos do modelo crédito ─────────────────────────────────
// KPIs de crédito do topo. `revenueRecharge30d`/`creditsInCirculation` REUSAM
// CreditsService.getMasterOverview (1 fonte só, via DI); burn 7d = Σ débitos
// (kind='debit') do ledger; "empresas sem saldo" = MESMA régua da janela Créditos
// (tenants com saldo agregado <= 0, saldo por CreditWalletService.getBalancesByCompanyIds).
type CreditsBlock = {
  revenueRecharge30d: number;
  revenueRecharge30dCount: number;
  creditsInCirculation: number;
  burn7d: number;
  companiesNoBalance: number;
};

// Funil de ativação (a métrica que paga boleto): cadastros de tenants nos últimos
// 30d → "Ativou" (1º consumo) → 1ª recarga aprovada, com taxas de conversão.
// FONTE ESCOLHIDA pro "Ativou": primeiro débito REAL no ledger (kind='debit') — a
// MESMA fonte única de saldo/burn/consumo deste cockpit (uma régua só). NÃO usamos
// CARD_SUCCESS do usage-log de propósito: aquele trilho mistura telemetria comercial
// legado e não diferencia consumo de crédito.
type ActivationFunnel = {
  signups30d: number;
  activated30d: number;
  recharged30d: number;
  activationRate: number;
  rechargeRate: number;
};

type SellerDrill = {
  userId: number;
  name: string;
  email: string | null;
  companyId: number | null;
  companyName: string | null;
  activated: boolean;
  activatedAt: string | null;
  leadsAssigned: number;
  dealsClosed: number;
  commissionPayable: number;
};

// COCKPIT-MASTER Sprint 2 — tail da trilha única de eventos do dono (MasterEvent).
type MasterEventItem = {
  id: string;
  type: string;
  severity: string;
  companyId: number | null;
  companyName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

// Saúde da operação (v1): chips por estado (MOTOR AO VIVO), último webhook de
// pagamento processado e último lead visto pela fábrica. Best-effort por
// sub-bloco: erro → null (o cockpit nunca quebra por uma sonda).
type WhatsappHealth = {
  total: number;
  open: number;
  connecting: number;
  closed: number;
  other: number;
  checkedAt: string;
};

type BillingHealth = { lastWebhookAt: string | null };

type FactoryHealth = { lastLeadSeenAt: string | null };

type HealthBlock = {
  whatsapp: WhatsappHealth | null;
  billing: BillingHealth | null;
  factory: FactoryHealth | null;
};

const ACTIVATION_EVENT = 'first_conversation_started';

// Cache do overview (Sprint 2): full scan de até 500 empresas + vendedores a cada
// 30 s POR ABA era o endpoint mais caro do /master. 1 instância de backend → cache
// in-memory simples; `generatedAt` já informa a idade do snapshot ao frontend.
const OVERVIEW_CACHE_TTL_MS = 30_000;
// Chips: leitura do motor ao vivo tem cache próprio (não martelar o motor).
const WHATSAPP_HEALTH_TTL_MS = 60_000;
const EVENTS_TAIL_SIZE = 40;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function money(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

// payloadJson do MasterEvent → objeto (JSON quebrado/lixo antigo vira null).
function parseEventPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseOnboardingEvents(raw: unknown): Record<string, string> {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    const ev = parsed && typeof parsed === 'object' ? parsed.events : null;
    if (!ev || typeof ev !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(ev)) {
      if (typeof v === 'string' && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

@Injectable()
export class MasterCockpitService {
  private readonly logger = new Logger(MasterCockpitService.name);

  // Cache in-memory do overview (TTL 30 s) + single-flight: requests dentro do
  // TTL devolvem o snapshot; rebuilds concorrentes aguardam a MESMA promise.
  private overviewCache: { at: number; payload: any } | null = null;
  private overviewInFlight: Promise<any> | null = null;
  // Contador de dev (aceite Sprint 2: 2 abas → 1 rebuild por janela de 30 s).
  private overviewRebuilds = 0;

  // Cache próprio da sonda de chips (60 s) — não martelar o motor ao vivo.
  private whatsappHealthCache: { at: number; value: WhatsappHealth | null } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webwhats: WebwhatsBridgeService,
    // S5 — REUSO via DI (padrão S1/S2): agregados de crédito vêm do CreditsService/
    // CreditWalletService, nunca de query duplicada aqui.
    private readonly credits: CreditsService,
    private readonly creditWallet: CreditWalletService,
  ) {}

  // Visão única do cockpit — com cache (TTL 30 s) e single-flight. O payload em
  // si é montado por buildOverview(); `generatedAt` informa a idade do snapshot.
  async overview(): Promise<any> {
    const cached = this.overviewCache;
    if (cached && Date.now() - cached.at < OVERVIEW_CACHE_TTL_MS) {
      return cached.payload;
    }
    if (this.overviewInFlight) {
      return this.overviewInFlight;
    }
    this.overviewInFlight = this.buildOverview()
      .then((payload) => {
        this.overviewCache = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        this.overviewInFlight = null;
      });
    return this.overviewInFlight;
  }

  // Monta o payload completo. Faz as leituras em paralelo — cada bloco é
  // defensivo (erro → vazio/null) para o cockpit nunca quebrar.
  private async buildOverview(): Promise<any> {
    this.overviewRebuilds += 1;
    this.logger.debug(`overview rebuild #${this.overviewRebuilds}`);
    const nowMs = Date.now();
    const [feed, commissions, roster, sellers, events, health, saleTotals, credits, activationFunnel] =
      await Promise.all([
        this.buildSaleFeed().catch(() => [] as SaleFeedItem[]),
        this.buildCommissionFeed().catch(() => [] as CommissionFeedItem[]),
        this.buildRoster(nowMs).catch(() => [] as RosterCompany[]),
        this.buildSellers().catch(() => [] as SellerDrill[]),
        this.buildEvents().catch(() => [] as MasterEventItem[]),
        this.buildHealth().catch(
          () => ({ whatsapp: null, billing: null, factory: null }) as HealthBlock,
        ),
        this.buildSaleAndCommissionTotals().catch(() => null as SaleAndCommissionTotals | null),
        // S5 — blocos do modelo crédito (flag OFF ou erro → null; front mostra "—").
        this.buildCreditsBlock().catch(() => null as CreditsBlock | null),
        this.buildActivationFunnel().catch(() => null as ActivationFunnel | null),
      ]);

    const activatedSellers = sellers.filter((s) => s.activated);
    const totalSellers = sellers.length;

    // Funil de aquisição (indicador-líder do flywheel). Empresas liberadas =
    // chegaram em "operando"; vendedores ativados = iniciaram a 1ª conversa.
    const releasedCompanies = roster.filter((r) => r.released).length;
    const sellingCompanies = roster.filter((r) => r.sellsHbxPlans).length;
    const mrrTotal = money(
      roster.filter((r) => r.released).reduce((acc, r) => acc + r.mrr, 0),
    );

    // Recortes do feed (todas as empresas) p/ os cards de topo.
    // C4 (TESTE-GERAL/CORRECOES.md): feed/commissions acima vêm truncados
    // (`take: 60`, só para exibição da lista). Os KPIs de hoje/mês NÃO podem
    // depender desse corte — usam `buildSaleAndCommissionTotals()` (query
    // Prisma count/aggregate própria, sem take). Fallback pro filtro do array
    // truncado só se a query de totais falhar (defensivo, igual ao resto do arquivo).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const dayMs = startOfDay.getTime();
    const monthMs = startOfMonth.getTime();

    let salesTodayCount: number;
    let salesTodayValue: number;
    let salesMonthCount: number;
    let salesMonthValue: number;
    let commissionPayable: number;
    let commissionPaidMonth: number;

    if (saleTotals) {
      salesTodayCount = saleTotals.salesTodayCount;
      salesTodayValue = saleTotals.salesTodayValue;
      salesMonthCount = saleTotals.salesMonthCount;
      salesMonthValue = saleTotals.salesMonthValue;
      commissionPayable = saleTotals.commissionPayable;
      commissionPaidMonth = saleTotals.commissionPaidMonth;
    } else {
      const salesToday = feed.filter((f) => new Date(f.at).getTime() >= dayMs);
      const salesMonth = feed.filter((f) => new Date(f.at).getTime() >= monthMs);
      salesTodayCount = salesToday.length;
      salesTodayValue = money(salesToday.reduce((a, f) => a + f.saleValue, 0));
      salesMonthCount = salesMonth.length;
      salesMonthValue = money(salesMonth.reduce((a, f) => a + f.saleValue, 0));
      commissionPayable = money(
        commissions.filter((c) => c.status === 'payable').reduce((a, c) => a + c.amount, 0),
      );
      commissionPaidMonth = money(
        commissions
          .filter((c) => c.status === 'paid' && new Date(c.at).getTime() >= monthMs)
          .reduce((a, c) => a + c.amount, 0),
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      // Feed do flywheel ao vivo (vendas + comissões, cross-company), já ordenado.
      feed: {
        sales: feed,
        commissions,
      },
      metrics: {
        // Métrica-norte: vendedores ativados.
        activatedSellers: activatedSellers.length,
        totalSellers,
        activationRate: totalSellers > 0 ? Math.round((activatedSellers.length / totalSellers) * 100) : 0,
        salesTodayCount,
        salesTodayValue,
        salesMonthCount,
        salesMonthValue,
        commissionPayable,
        commissionPaidMonth,
        mrrTotal,
      },
      funnel: {
        companiesTotal: roster.length,
        companiesReleased: releasedCompanies,
        companiesSelling: sellingCompanies,
        sellersTotal: totalSellers,
        sellersActivated: activatedSellers.length,
      },
      roster,
      sellers,
      // Sprint 2 — SÓ adições (campos existentes acima ficam intactos).
      events,
      health,
      // S5 — SÓ adições (o payload legado acima segue intacto até a aposentadoria S6):
      // KPIs do modelo crédito + funil de ativação cadastro→consumo→recarga.
      credits,
      activationFunnel,
    };
  }

  // ── Tail de eventos (trilha única MasterEvent — Sprint 2) ────────────────────
  private async buildEvents(): Promise<MasterEventItem[]> {
    const rows = await this.prisma.masterEvent.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: EVENTS_TAIL_SIZE,
      select: {
        id: true,
        type: true,
        severity: true,
        companyId: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    const companyNames = await this.resolveCompanyNames(
      rows.map((r) => r.companyId).filter((x): x is number => typeof x === 'number'),
    );

    return rows.map((row) => ({
      id: String(row.id),
      type: String(row.type || ''),
      severity: String(row.severity || 'info'),
      companyId: row.companyId ?? null,
      companyName: row.companyId
        ? companyNames.get(row.companyId) || `Empresa #${row.companyId}`
        : null,
      payload: parseEventPayload(row.payloadJson),
      createdAt: toIso(row.createdAt) || new Date().toISOString(),
    }));
  }

  // ── Faixa de saúde v1 (Sprint 2) — best-effort POR sub-bloco (erro → null) ──
  private async buildHealth(): Promise<HealthBlock> {
    const [whatsapp, billing, factory] = await Promise.all([
      this.buildWhatsappHealth().catch(() => null),
      this.buildBillingHealth().catch(() => null),
      this.buildFactoryHealth().catch(() => null),
    ]);
    return { whatsapp, billing, factory };
  }

  // Chips por estado lidos do MOTOR AO VIVO (WebwhatsBridgeService.listMotorInstances,
  // SÓ leitura — fonte única = motor, nunca o banco do app). Cache próprio de 60 s.
  // Motor desligado/não configurado → null (e o null também fica cacheado 60 s,
  // pra não martelar um motor caído a cada rebuild).
  private async buildWhatsappHealth(): Promise<WhatsappHealth | null> {
    const cached = this.whatsappHealthCache;
    if (cached && Date.now() - cached.at < WHATSAPP_HEALTH_TTL_MS) {
      return cached.value;
    }
    const instances = await this.webwhats.listMotorInstances();
    const value = instances === null ? null : this.countInstancesByState(instances);
    this.whatsappHealthCache = { at: Date.now(), value };
    return value;
  }

  // Defensivo aos DOIS formatos que o motor já devolveu: linha crua da tabela
  // Instance (`connectionStatus`) e o formato aninhado antigo (`instance.state`).
  private countInstancesByState(instances: any[]): WhatsappHealth {
    let open = 0;
    let connecting = 0;
    let closed = 0;
    let other = 0;
    for (const inst of instances) {
      const state = String(
        inst?.connectionStatus ??
          inst?.instance?.state ??
          inst?.instance?.status ??
          inst?.state ??
          inst?.status ??
          '',
      )
        .trim()
        .toLowerCase();
      if (state === 'open') open += 1;
      else if (state === 'connecting') connecting += 1;
      else if (state === 'close' || state === 'closed') closed += 1;
      else other += 1;
    }
    return {
      total: instances.length,
      open,
      connecting,
      closed,
      other,
      checkedAt: new Date().toISOString(),
    };
  }

  // Último webhook de pagamento processado — fonte: FinanceiroCharge.lastWebhookAt
  // (carimbado pelo FinanceiroService a cada webhook MP sincronizado, inclusive os
  // de assinatura, que viram charge). Sem webhook ainda → lastWebhookAt null.
  private async buildBillingHealth(): Promise<BillingHealth | null> {
    const row = await this.prisma.financeiroCharge.findFirst({
      where: { lastWebhookAt: { not: null } },
      orderBy: [{ lastWebhookAt: 'desc' }],
      select: { lastWebhookAt: true },
    });
    return { lastWebhookAt: toIso(row?.lastWebhookAt) };
  }

  // Fábrica respirando: último RadarLeadPool.lastSeenAt (lead novo/re-visto).
  private async buildFactoryHealth(): Promise<FactoryHealth | null> {
    const row = await this.prisma.radarLeadPool.findFirst({
      orderBy: [{ lastSeenAt: 'desc' }],
      select: { lastSeenAt: true },
    });
    return { lastLeadSeenAt: toIso(row?.lastSeenAt) };
  }

  // ── Feed de VENDAS (fonte da verdade: VendasLead cross-company) ──────────────
  private async buildSaleFeed(): Promise<SaleFeedItem[]> {
    const leads = await this.prisma.vendasLead.findMany({
      where: { saleStatus: { not: 'none' } },
      orderBy: [{ saleConfirmedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        companyId: true,
        assignedUserId: true,
        salePlanKey: true,
        saleValue: true,
        setupValue: true,
        commissionAmount: true,
        saleStatus: true,
        commissionStatus: true,
        saleConfirmedAt: true,
        updatedAt: true,
        name: true,
      },
    });

    const companyNames = await this.resolveCompanyNames(leads.map((l) => l.companyId));
    const sellerNames = await this.resolveUserNames(
      leads.map((l) => l.assignedUserId).filter((x): x is number => typeof x === 'number'),
    );

    return leads.map((lead) => {
      const companyName = companyNames.get(lead.companyId) || `Empresa #${lead.companyId}`;
      const sellerName = lead.assignedUserId
        ? sellerNames.get(lead.assignedUserId) || `Usuário #${lead.assignedUserId}`
        : 'Sem vendedor';
      const planTitle = lead.salePlanKey ? getCommercialPlanTitle(lead.salePlanKey) : null;
      const saleValue = money(lead.saleValue);
      const text = `${companyName} · ${sellerName} fechou ${planTitle || 'venda'} · R$ ${saleValue.toLocaleString(
        'pt-BR',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} · ${lead.saleStatus}`;
      return {
        leadId: lead.id,
        at: toIso(lead.saleConfirmedAt) || toIso(lead.updatedAt) || new Date().toISOString(),
        companyId: lead.companyId,
        companyName,
        sellerUserId: lead.assignedUserId ?? null,
        sellerName,
        planKey: lead.salePlanKey ?? null,
        planTitle,
        saleValue,
        setupValue: money(lead.setupValue),
        commissionAmount: money(lead.commissionAmount),
        saleStatus: String(lead.saleStatus || ''),
        commissionStatus: String(lead.commissionStatus || ''),
        text,
      };
    });
  }

  // ── Feed de COMISSÕES (VendasCommissionReceivable) ──────────────────────────
  private async buildCommissionFeed(): Promise<CommissionFeedItem[]> {
    const rows = await this.prisma.vendasCommissionReceivable.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        companyId: true,
        sellerUserId: true,
        amount: true,
        status: true,
        kind: true,
        dueAt: true,
        paidAt: true,
        updatedAt: true,
      },
    });

    const companyNames = await this.resolveCompanyNames(rows.map((r) => r.companyId));
    const sellerNames = await this.resolveUserNames(
      rows.map((r) => r.sellerUserId).filter((x): x is number => typeof x === 'number'),
    );

    const statusLabel: Record<string, string> = {
      payable: 'a pagar',
      paid: 'paga',
      canceled: 'cancelada',
      pending: 'pendente',
    };

    return rows.map((row) => {
      const companyName = companyNames.get(row.companyId) || `Empresa #${row.companyId}`;
      const sellerName = row.sellerUserId
        ? sellerNames.get(row.sellerUserId) || `Usuário #${row.sellerUserId}`
        : 'Sem vendedor';
      const amount = money(row.amount);
      const label = statusLabel[String(row.status)] || String(row.status);
      const text = `${companyName} · comissão de ${sellerName} · R$ ${amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} · ${label}`;
      return {
        id: row.id,
        at: toIso(row.paidAt) || toIso(row.updatedAt) || new Date().toISOString(),
        companyId: row.companyId,
        companyName,
        sellerUserId: row.sellerUserId ?? null,
        sellerName,
        amount,
        status: String(row.status || ''),
        kind: String(row.kind || ''),
        text,
      };
    });
  }

  // ── Totais de hoje/mês (C4 — TESTE-GERAL/CORRECOES.md) ──────────────────────
  // `buildSaleFeed`/`buildCommissionFeed` truncam em 60 registros (só para a
  // lista visual do feed). Os KPIs "Vendas hoje/mês" e "comissão paga no mês"
  // NÃO podem herdar esse corte — aqui é count/aggregate direto no banco,
  // cross-company, sem `take`. Replica a mesma regra de "data efetiva" do feed
  // (`saleConfirmedAt` OU, na ausência, `updatedAt`) via OR de filtros.
  private async buildSaleAndCommissionTotals(): Promise<SaleAndCommissionTotals> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const effectiveDateFilter = (threshold: Date) => ({
      OR: [
        { saleConfirmedAt: { gte: threshold } },
        { saleConfirmedAt: null, updatedAt: { gte: threshold } },
      ],
    });

    const [salesTodayAgg, salesMonthAgg, commissionPayableAgg, commissionPaidMonthAgg] =
      await Promise.all([
        this.prisma.vendasLead.aggregate({
          where: { saleStatus: { not: 'none' }, ...effectiveDateFilter(startOfDay) },
          _count: { _all: true },
          _sum: { saleValue: true },
        }),
        this.prisma.vendasLead.aggregate({
          where: { saleStatus: { not: 'none' }, ...effectiveDateFilter(startOfMonth) },
          _count: { _all: true },
          _sum: { saleValue: true },
        }),
        this.prisma.vendasCommissionReceivable.aggregate({
          where: { status: 'payable' },
          _sum: { amount: true },
        }),
        this.prisma.vendasCommissionReceivable.aggregate({
          where: {
            status: 'paid',
            OR: [
              { paidAt: { gte: startOfMonth } },
              { paidAt: null, updatedAt: { gte: startOfMonth } },
            ],
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      salesTodayCount: salesTodayAgg._count._all,
      salesTodayValue: money(salesTodayAgg._sum.saleValue),
      salesMonthCount: salesMonthAgg._count._all,
      salesMonthValue: money(salesMonthAgg._sum.saleValue),
      commissionPayable: money(commissionPayableAgg._sum.amount),
      commissionPaidMonth: money(commissionPaidMonthAgg._sum.amount),
    };
  }

  // ── Roster de empresas (status comercial + MRR) ─────────────────────────────
  private async buildRoster(nowMs: number): Promise<RosterCompany[]> {
    const companies = await this.prisma.company.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        slug: true,
        companyKind: true,
        // MASTER-REFAB S6 (10/07 noite): resolveCompanyAccessState lê accountType antes de
        // status — sem ele aqui, TODA empresa (inclusive enterprise real) normaliza pro
        // default 'credit' e o roster (MRR/billable) mente pra TODO mundo.
        accountType: true,
        status: true,
        isActive: true,
        paymentMethod: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
        courtesyReason: true,
        sellsHbxPlans: true,
        monthlyValueOverride: true,
        createdAt: true,
      },
    });

    // Contagens de vendedores por empresa (1 query agregada, defensiva).
    const sellerCounts = new Map<number, number>();
    const activatedCounts = new Map<number, number>();
    try {
      const sellers = await this.prisma.user.findMany({
        where: { role: 'USER', isSystemMaster: false, companyId: { not: null } },
        select: { companyId: true, onboardingStateJson: true, id: true },
      });
      const activatedByCompany = await this.deriveActivatedSellerIds(sellers);
      for (const s of sellers) {
        const cid = Number(s.companyId || 0);
        if (!cid) continue;
        sellerCounts.set(cid, (sellerCounts.get(cid) || 0) + 1);
        if (activatedByCompany.has(s.id)) {
          activatedCounts.set(cid, (activatedCounts.get(cid) || 0) + 1);
        }
      }
    } catch {
      /* sem contagem de vendedores — roster segue com 0 */
    }

    // S5 — saldo atual (fonte única: CreditWalletService, mesma régua da lista de
    // empresas do /master) + consumo 30d (Σ débitos do ledger) por empresa. Cada
    // leitura é defensiva: falha → saldo null/consumo 0, o roster nunca quebra.
    const creditsEnabled = isCreditsFeatureEnabled();
    let balanceByCompany = new Map<number, number>();
    const consumption30dByCompany = new Map<number, number>();
    if (creditsEnabled) {
      const companyIds = companies.map((c) => Number(c.id));
      try {
        balanceByCompany = await this.creditWallet.getBalancesByCompanyIds(companyIds);
      } catch {
        /* sem saldo — coluna mostra 0 (flag ON sem leitura) */
      }
      try {
        const since30d = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
        const grouped = await this.prisma.creditLedgerEntry.groupBy({
          by: ['companyId'],
          where: { companyId: { in: companyIds }, kind: 'debit', createdAt: { gte: since30d } },
          _sum: { amount: true },
        });
        for (const g of grouped as any[]) {
          consumption30dByCompany.set(Number(g.companyId), Number(g._sum?.amount || 0));
        }
      } catch {
        /* sem consumo — coluna mostra 0 */
      }
    }

    return companies.map((c) => {
      const snapshot: CompanyAccessSnapshot = {
        companyKind: c.companyKind,
        slug: c.slug,
        accountType: (c as any).accountType,
        status: c.status,
        isActive: c.isActive,
        paymentMethod: c.paymentMethod,
        selectedPlanKey: c.selectedPlanKey,
        trialEndsAt: c.trialEndsAt,
        billingGraceEndsAt: c.billingGraceEndsAt,
        courtesyEndsAt: c.courtesyEndsAt,
        courtesyReason: c.courtesyReason,
      };
      const access = resolveCompanyAccessState(snapshot, nowMs);
      const planKey = c.selectedPlanKey || null;
      const planTitle = getCommercialPlanTitle(planKey);
      // MRR: parcela acordada (override do master) vence o preço de catálogo;
      // só conta como receita recorrente quando a empresa está LIBERADA e paga.
      const catalogMonthly = planKey ? getCommercialPlanMonthlyPrice(planKey) : 0;
      const monthly = money(c.monthlyValueOverride ?? catalogMonthly);
      const billable = access.state === 'paying' || access.state === 'grace' || access.state === 'overdue';
      return {
        id: c.id,
        name: c.name,
        slug: c.slug ?? null,
        state: access.state,
        statusLabel: access.statusLabel,
        riskLevel: access.riskLevel,
        released: access.canUse,
        planKey,
        planTitle,
        mrr: billable ? monthly : 0,
        sellsHbxPlans: Boolean(c.sellsHbxPlans),
        sellerCount: sellerCounts.get(c.id) || 0,
        activatedSellerCount: activatedCounts.get(c.id) || 0,
        createdAt: toIso(c.createdAt),
        creditsBalance: creditsEnabled ? (balanceByCompany.get(c.id) ?? 0) : null,
        consumption30d: consumption30dByCompany.get(c.id) || 0,
      };
    });
  }

  // ── S5 — KPIs do modelo crédito (leitura pura, flag OFF → null) ──────────────
  // Recarga 30d + circulação REUSAM CreditsService.getMasterOverview (via DI — a
  // query mora LÁ, 1 fonte só). Burn 7d = Σ débitos (kind='debit') dos últimos 7
  // dias no ledger. "Empresas sem saldo" = MESMA régua da janela Créditos: tenants
  // cujo saldo agregado (getBalancesByCompanyIds; ausente = 0) é <= 0.
  private async buildCreditsBlock(): Promise<CreditsBlock | null> {
    if (!isCreditsFeatureEnabled()) return null;
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Braços embrulhados em closures async: um throw SÍNCRONO de um braço (ex.:
    // client sem o model em teste) vira rejeição tratada pelo Promise.all — nunca
    // deixa a promise de outro braço rejeitando órfã (unhandledRejection).
    const [creditsOverview, burnAgg, tenants] = await Promise.all([
      (async () => this.credits.getMasterOverview())(),
      (async () =>
        this.prisma.creditLedgerEntry.aggregate({
          where: { kind: 'debit', createdAt: { gte: since7d } },
          _sum: { amount: true },
        }))(),
      (async () =>
        this.prisma.company.findMany({
          where: { companyKind: COMPANY_KIND_TENANT },
          select: { id: true },
        }))(),
    ]);

    const tenantIds = tenants.map((t) => Number(t.id));
    const balances = await this.creditWallet.getBalancesByCompanyIds(tenantIds);
    const companiesNoBalance = tenantIds.filter((id) => (balances.get(id) || 0) <= 0).length;

    return {
      revenueRecharge30d: money(creditsOverview.revenueRecharge30d),
      revenueRecharge30dCount: Number(creditsOverview.revenueRecharge30dCount || 0),
      creditsInCirculation: Number(creditsOverview.creditsInCirculation || 0),
      burn7d: Number((burnAgg as any)._sum?.amount || 0),
      companiesNoBalance,
    };
  }

  // ── S5 — Funil de ativação: cadastros 30d → Ativou (1º consumo) → 1ª recarga ──
  // Coorte = tenants criados nos últimos 30d. "Ativou" = tem >=1 débito REAL no
  // ledger (kind='debit') — fonte escolhida e documentada no type ActivationFunnel.
  // "1ª recarga" = >=1 FinanceiroCharge APROVADA com o prefixo de description que só
  // a rota de recarga grava (mesmo predicado de CreditsService.getMasterOverview).
  // Flag de créditos OFF → null (funil de ativação é semântica do modelo crédito).
  private async buildActivationFunnel(): Promise<ActivationFunnel | null> {
    if (!isCreditsFeatureEnabled()) return null;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const cohort = await this.prisma.company.findMany({
      where: { companyKind: COMPANY_KIND_TENANT, createdAt: { gte: since30d } },
      select: { id: true },
    });
    const cohortIds = cohort.map((c) => Number(c.id));
    if (cohortIds.length === 0) {
      return { signups30d: 0, activated30d: 0, recharged30d: 0, activationRate: 0, rechargeRate: 0 };
    }

    // Mesmo padrão de closures async do buildCreditsBlock (sem rejeição órfã).
    const [debitGroups, rechargeGroups] = await Promise.all([
      (async () =>
        this.prisma.creditLedgerEntry.groupBy({
          by: ['companyId'],
          where: { companyId: { in: cohortIds }, kind: 'debit' },
          _count: { _all: true },
        }))(),
      (async () =>
        this.prisma.financeiroCharge.groupBy({
          by: ['companyId'],
          where: {
            companyId: { in: cohortIds },
            status: 'approved',
            description: { startsWith: 'Recarga de créditos' },
          },
          _count: { _all: true },
        }))(),
    ]);

    const signups30d = cohortIds.length;
    const activated30d = (debitGroups as any[]).length;
    const recharged30d = (rechargeGroups as any[]).length;
    return {
      signups30d,
      activated30d,
      recharged30d,
      activationRate: signups30d > 0 ? Math.round((activated30d / signups30d) * 100) : 0,
      rechargeRate: activated30d > 0 ? Math.round((recharged30d / activated30d) * 100) : 0,
    };
  }

  // ── Drill-down: vendedores (ativados + carteira + comissão) ──────────────────
  private async buildSellers(): Promise<SellerDrill[]> {
    const sellers = await this.prisma.user.findMany({
      where: { role: 'USER', isSystemMaster: false },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        companyId: true,
        onboardingStateJson: true,
      },
    });

    const activatedIds = await this.deriveActivatedSellerIds(sellers);
    const companyNames = await this.resolveCompanyNames(
      sellers.map((s) => s.companyId).filter((x): x is number => typeof x === 'number'),
    );

    // Métricas por vendedor: leads atribuídos, negócios fechados, comissão a pagar.
    const leadsAssigned = new Map<number, number>();
    const dealsClosed = new Map<number, number>();
    const commissionPayable = new Map<number, number>();
    try {
      const grouped = await this.prisma.vendasLead.groupBy({
        by: ['assignedUserId'],
        where: { assignedUserId: { not: null } },
        _count: { _all: true },
      });
      for (const g of grouped) {
        if (g.assignedUserId != null) leadsAssigned.set(g.assignedUserId, g._count._all);
      }
    } catch {
      /* sem contagem de leads */
    }
    try {
      const grouped = await this.prisma.vendasLead.groupBy({
        by: ['assignedUserId'],
        where: { assignedUserId: { not: null }, saleStatus: { not: 'none' } },
        _count: { _all: true },
      });
      for (const g of grouped) {
        if (g.assignedUserId != null) dealsClosed.set(g.assignedUserId, g._count._all);
      }
    } catch {
      /* sem contagem de vendas */
    }
    try {
      const grouped = await this.prisma.vendasCommissionReceivable.groupBy({
        by: ['sellerUserId'],
        where: { sellerUserId: { not: null }, status: 'payable' },
        _sum: { amount: true },
      });
      for (const g of grouped) {
        if (g.sellerUserId != null) commissionPayable.set(g.sellerUserId, money(g._sum.amount));
      }
    } catch {
      /* sem soma de comissão */
    }

    return sellers.map((s) => {
      const events = parseOnboardingEvents(s.onboardingStateJson);
      const activated = activatedIds.has(s.id);
      return {
        userId: s.id,
        name: s.name || s.username || s.email || `Usuário #${s.id}`,
        email: s.email ?? null,
        companyId: s.companyId ?? null,
        companyName: s.companyId ? companyNames.get(s.companyId) || null : null,
        activated,
        activatedAt: events[ACTIVATION_EVENT] || null,
        leadsAssigned: leadsAssigned.get(s.id) || 0,
        dealsClosed: dealsClosed.get(s.id) || 0,
        commissionPayable: commissionPayable.get(s.id) || 0,
      };
    });
  }

  // Derivação de "vendedor ativado" (1ª conversa iniciada). Carimbo
  // (onboardingStateJson.first_conversation_started) OU derivação barata:
  // vendedor com lead atribuído + chip de WhatsApp ativo na empresa — espelha
  // a lógica do OnboardingController.checklist (sem editar aquele arquivo).
  private async deriveActivatedSellerIds(
    sellers: Array<{ id: number; companyId: number | null; onboardingStateJson?: string | null }>,
  ): Promise<Set<number>> {
    const activated = new Set<number>();
    // 1) carimbos diretos
    for (const s of sellers) {
      const events = parseOnboardingEvents(s.onboardingStateJson);
      if (events[ACTIVATION_EVENT]) activated.add(s.id);
    }

    // 2) derivação: lead atribuído + chip ativo na empresa do vendedor.
    const pending = sellers.filter((s) => !activated.has(s.id) && s.companyId);
    if (pending.length === 0) return activated;

    try {
      const pendingIds = pending.map((s) => s.id);
      const companyIds = Array.from(
        new Set(pending.map((s) => Number(s.companyId)).filter(Boolean)),
      );

      const [leadGroups, activeSessions] = await Promise.all([
        this.prisma.vendasLead.groupBy({
          by: ['assignedUserId'],
          where: { assignedUserId: { in: pendingIds } },
          _count: { _all: true },
        }),
        this.prisma.whatsAppConnectionSession.findMany({
          where: { companyId: { in: companyIds }, status: 'active' },
          select: { companyId: true, userId: true },
        }),
      ]);

      const hasLead = new Set<number>();
      for (const g of leadGroups) {
        if (g.assignedUserId != null && g._count._all > 0) hasLead.add(g.assignedUserId);
      }

      // chip ativo: por vendedor (userId) OU compartilhado da empresa (userId null).
      const companyShared = new Set<number>();
      const userChip = new Set<number>();
      for (const sess of activeSessions) {
        if (sess.userId == null) companyShared.add(sess.companyId);
        else userChip.add(sess.userId);
      }

      for (const s of pending) {
        const cid = Number(s.companyId);
        const chipOk = userChip.has(s.id) || companyShared.has(cid);
        if (hasLead.has(s.id) && chipOk) activated.add(s.id);
      }
    } catch {
      /* sem derivação — fica só com os carimbos */
    }

    return activated;
  }

  // Helpers de nome (lote, defensivos).
  private async resolveCompanyNames(ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const unique = Array.from(new Set(ids.filter((x) => Number.isFinite(x) && x > 0)));
    if (unique.length === 0) return out;
    try {
      const rows = await this.prisma.company.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true },
      });
      for (const r of rows) out.set(r.id, r.name || `Empresa #${r.id}`);
    } catch {
      /* nomes opcionais */
    }
    return out;
  }

  private async resolveUserNames(ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const unique = Array.from(new Set(ids.filter((x) => Number.isFinite(x) && x > 0)));
    if (unique.length === 0) return out;
    try {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true, username: true, email: true },
      });
      for (const r of rows) {
        out.set(r.id, r.name || r.username || r.email || `Usuário #${r.id}`);
      }
    } catch {
      /* nomes opcionais */
    }
    return out;
  }
}
