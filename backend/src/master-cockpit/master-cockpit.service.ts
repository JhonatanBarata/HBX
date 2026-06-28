import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveCompanyAccessState,
  CompanyAccessSnapshot,
} from '../modules/company-access-state';
import {
  getCommercialPlanMonthlyPrice,
  getCommercialPlanTitle,
} from '../commercial-plans/commercial-plan-catalog';

// Cockpit do MASTER (Camada 5 do onboarding HBX). O system master OPERA a
// plataforma — este service só LÊ (cross-company) e agrega. NÃO escreve nada e
// NÃO duplica lógica de comissão/venda/team — apenas projeta os dados que esses
// donos já gravaram:
//   - Feed do flywheel: VendasLead (saleStatus/saleValue/commissionAmount…)
//   - Comissões: VendasCommissionReceivable (payable/paid/pending)
//   - Roster/MRR/status: Company + resolveCompanyAccessState + catálogo de planos
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

const ACTIVATION_EVENT = 'first_conversation_started';

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
  constructor(private readonly prisma: PrismaService) {}

  // Visão única do cockpit. Faz as leituras em paralelo e monta o payload.
  async overview(): Promise<any> {
    const nowMs = Date.now();
    const [feed, commissions, roster, sellers] = await Promise.all([
      this.buildSaleFeed().catch(() => [] as SaleFeedItem[]),
      this.buildCommissionFeed().catch(() => [] as CommissionFeedItem[]),
      this.buildRoster(nowMs).catch(() => [] as RosterCompany[]),
      this.buildSellers().catch(() => [] as SellerDrill[]),
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
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const dayMs = startOfDay.getTime();
    const monthMs = startOfMonth.getTime();

    const salesToday = feed.filter((f) => new Date(f.at).getTime() >= dayMs);
    const salesMonth = feed.filter((f) => new Date(f.at).getTime() >= monthMs);

    const commissionPayable = money(
      commissions.filter((c) => c.status === 'payable').reduce((a, c) => a + c.amount, 0),
    );
    const commissionPaidMonth = money(
      commissions
        .filter((c) => c.status === 'paid' && new Date(c.at).getTime() >= monthMs)
        .reduce((a, c) => a + c.amount, 0),
    );

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
        salesTodayCount: salesToday.length,
        salesTodayValue: money(salesToday.reduce((a, f) => a + f.saleValue, 0)),
        salesMonthCount: salesMonth.length,
        salesMonthValue: money(salesMonth.reduce((a, f) => a + f.saleValue, 0)),
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
    };
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

    return companies.map((c) => {
      const snapshot: CompanyAccessSnapshot = {
        companyKind: c.companyKind,
        slug: c.slug,
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
      };
    });
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
