import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isMasterOperationalCompanySlug } from '../commercial-plans/seat-billing.util';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';
import { getCommercialPlanMonthlyPrice } from '../commercial-plans/commercial-plan-catalog';

function requireCompanyIdFromUser(user: any): number {
  const companyId = Number(user?.companyId);
  if (!companyId) throw new ForbiddenException('Company context required');
  return companyId;
}

function money(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(Math.max(0, numeric).toFixed(2));
}

function normalizeCommissionStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  if (['pending', 'payable', 'paid', 'canceled'].includes(status)) return status;
  return 'none';
}

function normalizeSaleStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  if (['activation_pending', 'trial_started', 'sale_confirmed', 'inactive', 'canceled'].includes(status)) return status;
  return 'none';
}

function saleStatusLabel(status: string) {
  if (status === 'activation_pending') return 'Aguardando ativação';
  if (status === 'trial_started') return 'Trial iniciado';
  if (status === 'sale_confirmed') return 'Pagamento confirmado';
  if (status === 'inactive') return 'Cliente inativo';
  if (status === 'canceled') return 'Cancelado';
  return 'Sem venda';
}

function addBusinessDays(date: Date, days: number) {
  const next = new Date(date);
  let added = 0;
  while (added < days) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return next;
}

function normalizeCommissionDueBusinessDays(value: unknown) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(30, Math.max(0, numeric));
}

function canManageCommissionSettings(user: any) {
  return Boolean(user?.isSystemMaster);
}

function normalizeOptionalText(value: unknown, maxLength = 500) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function defaultPayoutReferenceLabel(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `Fechamento ${day}/${month}/${year}`;
}

function isDueCommission(row: any, now: Date) {
  if (normalizeCommissionStatus(row?.commissionStatus) !== 'payable') return false;
  if (money(row?.commissionAmount) <= 0) return false;
  return !(row?.commissionDueAt instanceof Date) || row.commissionDueAt.getTime() <= now.getTime();
}

function isDueReceivable(row: any, now: Date) {
  if (normalizeCommissionStatus(row?.status) !== 'payable') return false;
  if (money(row?.amount) <= 0) return false;
  return !(row?.dueAt instanceof Date) || row.dueAt.getTime() <= now.getTime();
}

@Injectable()
export class GerencialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hbxCommissionSync: HbxCommissionSyncService,
  ) {}

  private async resolveCommissionDueBusinessDays(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { commissionDueBusinessDays: true },
    }).catch(() => null);
    return normalizeCommissionDueBusinessDays(company?.commissionDueBusinessDays);
  }

  private sellerNameMap(companyUsers: any[]) {
    return new Map(
      (companyUsers || [])
        .map((user) => [
          Number(user?.id || 0),
          user?.name || user?.username || user?.email || `Vendedor #${user?.id}`,
        ] as const)
        .filter(([id]) => Number.isInteger(id) && id > 0),
    );
  }

  private async fetchRecentCommissionPayouts(companyId: number, sellerNames: Map<number, string>) {
    const payouts = await this.prisma.vendasCommissionPayout.findMany({
      where: { companyId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        sellerUserId: true,
        status: true,
        leadCount: true,
        totalAmount: true,
        referenceLabel: true,
        notes: true,
        paidAt: true,
        createdAt: true,
        createdByUserId: true,
      },
    });

    return payouts.map((payout) => ({
      id: payout.id,
      sellerUserId: Number(payout.sellerUserId || 0) || null,
      sellerName: sellerNames.get(Number(payout.sellerUserId || 0)) || 'Vendedor removido',
      status: payout.status || 'paid',
      leadCount: Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
      totalAmount: money(payout.totalAmount),
      referenceLabel: payout.referenceLabel || null,
      notes: payout.notes || null,
      paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
      createdAt: payout.createdAt instanceof Date ? payout.createdAt.toISOString() : null,
      createdByUserId: Number(payout.createdByUserId || 0) || null,
    }));
  }

  private async buildCommissionOverview(companyId: number, companyUsers: any[], settings?: { dueBusinessDays?: number }) {
    const dueBusinessDays = normalizeCommissionDueBusinessDays(settings?.dueBusinessDays);
    const sellers = (companyUsers || []).filter((user) => String(user?.role || '').trim().toUpperCase() === 'USER');
    const sellerIds = sellers.map((user) => Number(user.id)).filter((id) => Number.isInteger(id) && id > 0);
    const sellerNames = this.sellerNameMap(companyUsers);
    const payouts = await this.fetchRecentCommissionPayouts(companyId, sellerNames);
    if (!sellerIds.length) {
      return {
        settings: {
          dueBusinessDays,
        },
        totals: {
          sellers: 0,
          activeClients: 0,
          pendingActivation: 0,
          inactiveClients: 0,
          payableAmount: 0,
          duePayableAmount: 0,
          duePayableCount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          recurringAmount: 0,
          inheritedAmount: 0,
          inheritedCount: 0,
        },
        sellers: [],
        recentClients: [],
        payroll: [],
        payouts,
      };
    }

    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId,
        assignedUserId: { in: sellerIds },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1000,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        city: true,
        segment: true,
        status: true,
        assignedUserId: true,
        saleStatus: true,
        saleValue: true,
        salePlanKey: true,
        saleConfirmedAt: true,
        saleCanceledAt: true,
        commissionStatus: true,
        commissionPercentSnapshot: true,
        commissionBaseAmount: true,
        commissionAmount: true,
        commissionDueAt: true,
        commissionPaidAt: true,
        commissionRecurring: true,
        commissionNote: true,
        commissionLinkedCompanyId: true,
        commissionLinkedAt: true,
        commissionAutoSyncedAt: true,
        commissionSyncSource: true,
        commissionPayoutId: true,
        updatedAt: true,
      },
    });

    const receivables = await this.prisma.vendasCommissionReceivable.findMany({
      where: {
        companyId,
        sellerUserId: { in: sellerIds },
      },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
      take: 1000,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            city: true,
            segment: true,
            saleStatus: true,
            salePlanKey: true,
            commissionLinkedCompanyId: true,
            commissionLinkedAt: true,
            commissionSyncSource: true,
          },
        },
      },
    });

    const bySellerId = new Map<number, any[]>();
    for (const lead of leads) {
      const sellerId = Number(lead.assignedUserId || 0);
      if (!sellerId) continue;
      if (!bySellerId.has(sellerId)) bySellerId.set(sellerId, []);
      bySellerId.get(sellerId)?.push(lead);
    }

    const receivablesBySellerId = new Map<number, any[]>();
    for (const receivable of receivables) {
      const sellerId = Number(receivable.sellerUserId || 0);
      if (!sellerId) continue;
      if (!receivablesBySellerId.has(sellerId)) receivablesBySellerId.set(sellerId, []);
      receivablesBySellerId.get(sellerId)?.push(receivable);
    }

    const leadClientPayload = (row: any) => ({
      leadId: row.id,
      name: row.name || row.phone || 'Cliente sem nome',
      phone: row.phone || null,
      email: row.email || null,
      city: row.city || null,
      segment: row.segment || null,
      saleStatus: row.saleStatus || 'none',
      salePlanKey: row.salePlanKey || null,
      commissionStatus: row.commissionStatus || 'none',
      saleValue: money(row.saleValue || row.commissionBaseAmount),
      commissionAmount: money(row.commissionAmount),
      commissionDueAt: row.commissionDueAt instanceof Date ? row.commissionDueAt.toISOString() : null,
      commissionPaidAt: row.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
      commissionNote: row.commissionNote || null,
      commissionLinkedCompanyId: Number(row.commissionLinkedCompanyId || 0) || null,
      commissionLinkedAt: row.commissionLinkedAt instanceof Date ? row.commissionLinkedAt.toISOString() : null,
      commissionAutoSyncedAt: row.commissionAutoSyncedAt instanceof Date ? row.commissionAutoSyncedAt.toISOString() : null,
      commissionSyncSource: row.commissionSyncSource || null,
      commissionPayoutId: row.commissionPayoutId || null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    });

    const receivableClientPayload = (row: any) => ({
      leadId: row.leadId || row.lead?.id,
      receivableId: row.id,
      name: row.lead?.name || row.lead?.phone || (String(row.kind || '').startsWith('inheritance_') ? 'Comissão herdada' : 'Comissão recorrente'),
      phone: row.lead?.phone || null,
      email: row.lead?.email || null,
      city: row.lead?.city || null,
      segment: row.lead?.segment || null,
      saleStatus: row.lead?.saleStatus || 'sale_confirmed',
      salePlanKey: row.lead?.salePlanKey || null,
      commissionStatus: row.status || 'payable',
      saleValue: money(row.baseAmount),
      commissionAmount: money(row.amount),
      commissionDueAt: row.dueAt instanceof Date ? row.dueAt.toISOString() : null,
      commissionPaidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      commissionPayoutId: row.payoutId || null,
      commissionLinkedCompanyId: Number(row.lead?.commissionLinkedCompanyId || 0) || null,
      commissionLinkedAt: row.lead?.commissionLinkedAt instanceof Date ? row.lead.commissionLinkedAt.toISOString() : null,
      commissionSyncSource: row.lead?.commissionSyncSource || null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      recurringCycleKey: row.cycleKey || null,
      commissionKind: row.kind || 'recurring',
      isInherited: String(row.kind || '').startsWith('inheritance_'),
      isRecurring: String(row.kind || 'recurring').includes('recurring'),
    });

    const now = new Date();
    const summarize = (rows: any[], receivableRows: any[] = []) => {
      const activeRows = rows.filter((row) => ['trial_started', 'sale_confirmed'].includes(String(row.saleStatus || '').toLowerCase()));
      const pendingRows = rows.filter((row) => String(row.saleStatus || '').toLowerCase() === 'activation_pending');
      const inactiveRows = rows.filter((row) => ['inactive', 'canceled'].includes(String(row.saleStatus || '').toLowerCase()));
      const payableRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'payable');
      const payableReceivables = receivableRows.filter((row) => normalizeCommissionStatus(row.status) === 'payable');
      const duePayableRows = payableRows.filter((row) => isDueCommission(row, now));
      const duePayableReceivables = payableReceivables.filter((row) => isDueReceivable(row, now));
      const commissionPendingRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'pending');
      const paidRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'paid');
      const paidReceivables = receivableRows.filter((row) => normalizeCommissionStatus(row.status) === 'paid');
      const recurringRows = activeRows.filter((row) => Boolean(row.commissionRecurring));
      const recurringReceivables = receivableRows.filter((row) => String(row.kind || 'recurring').includes('recurring'));
      const inheritedReceivables = receivableRows.filter((row) => String(row.kind || '').startsWith('inheritance_'));
      const nextDue = [
        ...payableRows.map((row) => row.commissionDueAt instanceof Date ? row.commissionDueAt : null),
        ...payableReceivables.map((row) => row.dueAt instanceof Date ? row.dueAt : null),
      ]
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0] || null;
      return {
        assignedCards: rows.length,
        activeClients: activeRows.length,
        pendingActivation: pendingRows.length,
        inactiveClients: inactiveRows.length,
        payableAmount: money(
          payableRows.reduce((sum, row) => sum + money(row.commissionAmount), 0) +
          payableReceivables.reduce((sum, row) => sum + money(row.amount), 0),
        ),
        duePayableAmount: money(
          duePayableRows.reduce((sum, row) => sum + money(row.commissionAmount), 0) +
          duePayableReceivables.reduce((sum, row) => sum + money(row.amount), 0),
        ),
        duePayableCount: duePayableRows.length + duePayableReceivables.length,
        pendingAmount: money(commissionPendingRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        paidAmount: money(
          paidRows.reduce((sum, row) => sum + money(row.commissionAmount), 0) +
          paidReceivables.reduce((sum, row) => sum + money(row.amount), 0),
        ),
        recurringAmount: money(
          recurringRows.reduce((sum, row) => sum + money(row.commissionAmount), 0) +
          recurringReceivables.reduce((sum, row) => sum + money(row.amount), 0),
        ),
        inheritedAmount: money(inheritedReceivables.reduce((sum, row) => sum + money(row.amount), 0)),
        inheritedCount: inheritedReceivables.length,
        nextDueAt: nextDue ? nextDue.toISOString() : null,
      };
    };

    const sellerSummaries = sellers.map((seller) => {
      const rows = bySellerId.get(Number(seller.id)) || [];
      const sellerReceivables = receivablesBySellerId.get(Number(seller.id)) || [];
      const summary = summarize(rows, sellerReceivables);
      return {
        userId: Number(seller.id),
        name: seller.name || seller.username || seller.email || `Vendedor #${seller.id}`,
        email: seller.email || null,
        phone: seller.phone || null,
        isActive: Boolean(seller.isActive),
        commissionPercent: money(seller.commissionPercent),
        ...summary,
        clients: [
          ...sellerReceivables.slice(0, 3).map((row) => receivableClientPayload(row)),
          ...rows.slice(0, 6).map((row) => leadClientPayload(row)),
        ].slice(0, 6),
      };
    });

    const allSummary = summarize(leads, receivables);
    const payroll = sellerSummaries
      .filter((seller) => seller.duePayableAmount > 0 || seller.payableAmount > 0 || seller.pendingAmount > 0 || seller.inheritedAmount > 0)
      .map((seller) => ({
        sellerUserId: seller.userId,
        sellerName: seller.name,
        sellerEmail: seller.email,
        sellerPhone: seller.phone,
        isActive: seller.isActive,
        commissionPercent: seller.commissionPercent,
        duePayableAmount: seller.duePayableAmount,
        duePayableCount: seller.duePayableCount,
        payableAmount: seller.payableAmount,
        pendingAmount: seller.pendingAmount,
        recurringAmount: seller.recurringAmount,
        inheritedAmount: seller.inheritedAmount,
        inheritedCount: seller.inheritedCount,
        activeClients: seller.activeClients,
        pendingActivation: seller.pendingActivation,
        inactiveClients: seller.inactiveClients,
        assignedCards: seller.assignedCards,
        nextDueAt: seller.nextDueAt,
        status: seller.duePayableAmount > 0 ? 'due' : seller.payableAmount > 0 ? 'payable' : 'pending',
      }))
      .sort((a, b) => {
        if (b.duePayableAmount !== a.duePayableAmount) return b.duePayableAmount - a.duePayableAmount;
        if (b.payableAmount !== a.payableAmount) return b.payableAmount - a.payableAmount;
        return a.sellerName.localeCompare(b.sellerName);
      });

    return {
      settings: {
        dueBusinessDays,
      },
      totals: {
        sellers: sellers.length,
        activeClients: allSummary.activeClients,
        pendingActivation: allSummary.pendingActivation,
        inactiveClients: allSummary.inactiveClients,
        payableAmount: allSummary.payableAmount,
        duePayableAmount: allSummary.duePayableAmount,
        duePayableCount: allSummary.duePayableCount,
        pendingAmount: allSummary.pendingAmount,
        paidAmount: allSummary.paidAmount,
        recurringAmount: allSummary.recurringAmount,
        inheritedAmount: allSummary.inheritedAmount,
        inheritedCount: allSummary.inheritedCount,
        nextDueAt: allSummary.nextDueAt,
      },
      sellers: sellerSummaries,
      recentClients: [
        ...receivables.slice(0, 6).map((row) => ({
          ...receivableClientPayload(row),
          userId: Number(row.sellerUserId || 0) || null,
        })),
        ...leads.slice(0, 12).map((row) => ({
          ...leadClientPayload(row),
          userId: Number(row.assignedUserId || 0) || null,
        })),
      ].slice(0, 12),
      activationQueue: leads
        .filter((row) => String(row.saleStatus || '').toLowerCase() === 'activation_pending')
        .slice(0, 30)
        .map((row) => ({
          ...leadClientPayload(row),
          userId: Number(row.assignedUserId || 0) || null,
        })),
      payroll,
      payouts,
    };
  }

  private async buildOperationAudit(companyId: number, companyUsers: any[], commission: any, options?: { isHbxSellerNetwork?: boolean }) {
    const roleOf = (user: any) => {
      const normalized = String(user?.role || '').trim().toUpperCase();
      if (user?.isSystemMaster || normalized === 'USERMASTER') return 'USERMASTER';
      return normalized === 'ADMIN' ? 'ADMIN' : 'USER';
    };
    const users = companyUsers || [];
    const activeSellers = users.filter((user) => roleOf(user) === 'USER' && Boolean(user?.isActive));
    const activeAdmins = users.filter((user) => roleOf(user) === 'ADMIN' && Boolean(user?.isActive));
    const masters = users.filter((user) => roleOf(user) === 'USERMASTER');
    const configuredSellers = activeSellers.filter((user) => money(user?.commissionPercent) > 0);
    const referralEnabledSellers = activeSellers.filter((user) => Boolean(user?.canRegisterHbxSellers));
    const isHbxSellerNetwork = Boolean(options?.isHbxSellerNetwork);
    const now = new Date();

    const [
      totalCards,
      assignedCards,
      unassignedCards,
      newCards,
      contactedCards,
      activePipeline,
      dueReturns,
      wonClients,
      pendingActivation,
      inactiveClients,
    ] = await Promise.all([
      this.prisma.vendasLead.count({ where: { companyId } }),
      this.prisma.vendasLead.count({ where: { companyId, assignedUserId: { not: null } } }),
      this.prisma.vendasLead.count({ where: { companyId, assignedUserId: null } }),
      this.prisma.vendasLead.count({ where: { companyId, status: 'novo' } }),
      this.prisma.vendasLead.count({ where: { companyId, status: { in: ['contato', 'retorno', 'qualificado', 'encerrado'] } } }),
      this.prisma.vendasLead.count({ where: { companyId, status: { in: ['novo', 'contato', 'retorno', 'qualificado'] } } }),
      this.prisma.vendasLead.count({
        where: {
          companyId,
          status: { in: ['contato', 'retorno', 'qualificado'] },
          returnAt: { lte: now },
        },
      }),
      this.prisma.vendasLead.count({ where: { companyId, saleStatus: { in: ['trial_started', 'sale_confirmed'] } } }),
      this.prisma.vendasLead.count({ where: { companyId, saleStatus: 'activation_pending' } }),
      this.prisma.vendasLead.count({ where: { companyId, saleStatus: { in: ['inactive', 'canceled'] } } }),
    ]);

    const duePayableAmount = money(commission?.totals?.duePayableAmount);
    const payableAmount = money(commission?.totals?.payableAmount);
    const checklist = [
      {
        key: 'admin_control',
        title: 'Admin/USERMASTER no controle',
        status: activeAdmins.length || masters.length ? 'ok' : 'blocked',
        value: `${activeAdmins.length} admin(s), ${masters.length} USERMASTER`,
        hint: activeAdmins.length || masters.length ? 'Controle administrativo disponível.' : 'Cadastre ao menos um ADMIN ativo.',
      },
      {
        key: 'seller_access',
        title: 'Vendedores ativos',
        status: activeSellers.length ? 'ok' : 'blocked',
        value: `${activeSellers.length} vendedor(es)`,
        hint: activeSellers.length ? 'Equipe pronta para receber cards.' : 'Cadastre vendedores pelo Gerencial.',
      },
      {
        key: 'seller_commission',
        title: 'Comissão configurada',
        status: !activeSellers.length ? 'blocked' : configuredSellers.length === activeSellers.length ? 'ok' : 'warning',
        value: `${configuredSellers.length}/${activeSellers.length} configurado(s)`,
        hint: configuredSellers.length === activeSellers.length ? 'Comissões principais preenchidas.' : 'Preencha a porcentagem de comissão dos vendedores.',
      },
      {
        key: 'card_distribution',
        title: 'Cards distribuídos',
        status: assignedCards > 0 ? 'ok' : totalCards > 0 ? 'warning' : 'blocked',
        value: `${assignedCards}/${totalCards} card(s)`,
        hint: assignedCards > 0 ? 'Cards já têm dono comercial.' : totalCards > 0 ? 'Distribua cards do Radar para vendedores.' : 'Gere ou importe cards antes de vender.',
      },
      {
        key: 'returns',
        title: 'Retornos em dia',
        status: dueReturns > 0 ? 'warning' : 'ok',
        value: `${dueReturns} retorno(s) vencido(s)`,
        hint: dueReturns > 0 ? 'Existem contatos que precisam de retorno.' : 'Nenhum retorno vencido agora.',
      },
      {
        key: 'payroll',
        title: 'Folha de comissão',
        status: duePayableAmount > 0 ? 'warning' : 'ok',
        value: `Liberado R$ ${duePayableAmount.toFixed(2)}`,
        hint: duePayableAmount > 0 ? 'Pague e feche o lote no Gerencial.' : 'Nenhuma comissão liberada para baixar.',
      },
      ...(isHbxSellerNetwork
        ? [{
            key: 'hbx_referral',
            title: 'Rede HBX',
            status: referralEnabledSellers.length || activeSellers.length === 0 ? 'ok' : 'warning',
            value: `${referralEnabledSellers.length} vendedor(es) podem indicar`,
            hint: referralEnabledSellers.length ? 'Indicação e comissão herdada disponíveis.' : 'Autorize quem pode cadastrar vendedores indicados.',
          }]
        : []),
    ];

    const readinessPoints = checklist.reduce((sum, item) => sum + (item.status === 'ok' ? 1 : item.status === 'warning' ? 0.5 : 0), 0);
    const blockedCount = checklist.filter((item) => item.status === 'blocked').length;
    const warningCount = checklist.filter((item) => item.status === 'warning').length;

    return {
      updatedAt: now.toISOString(),
      readinessScore: Math.round((readinessPoints / checklist.length) * 100),
      status: blockedCount ? 'setup' : warningCount ? 'attention' : 'ready',
      team: {
        activeSellers: activeSellers.length,
        activeAdmins: activeAdmins.length,
        usermasters: masters.length,
        configuredSellers: configuredSellers.length,
        referralEnabledSellers: referralEnabledSellers.length,
      },
      pipeline: {
        totalCards,
        assignedCards,
        unassignedCards,
        newCards,
        contactedCards,
        activePipeline,
        dueReturns,
        wonClients,
        pendingActivation,
        inactiveClients,
      },
      finance: {
        payableAmount,
        duePayableAmount,
        pendingAmount: money(commission?.totals?.pendingAmount),
        inheritedAmount: money(commission?.totals?.inheritedAmount),
        payrollRows: Array.isArray(commission?.payroll) ? commission.payroll.length : 0,
      },
      checklist,
      nextActions: checklist
        .filter((item) => item.status !== 'ok')
        .map((item) => ({ key: item.key, title: item.title, hint: item.hint }))
        .slice(0, 5),
    };
  }

  async overview(user: any) {
    const companyId = requireCompanyIdFromUser(user);
    await this.hbxCommissionSync.syncSalesCompanyCommissions(companyId, { source: 'gerencial_overview' }).catch(() => null);

    const [
      totalConversations,
      totalMessages,
      inboundCount,
      outboundCount,
      totalComplaints,
      recentMessages,
      companyUsers,
      company,
      companyContacts,
      surveys,
    ] = await Promise.all([
      this.prisma.companyConversation.count({ where: { companyId } }),
      this.prisma.companyMessage.count({ where: { companyId } }),
      this.prisma.companyMessage.count({ where: { companyId, direction: 'INBOUND' } }),
      this.prisma.companyMessage.count({ where: { companyId, direction: 'OUTBOUND' } }),
      this.prisma.companyMessage.count({ where: { companyId, isComplaint: true } as any }),
      this.prisma.companyMessage.findMany({
        where: { companyId },
        orderBy: { timestamp: 'desc' },
        take: 100,
        include: {
          conversation: {
            select: { id: true, contact: true, channel: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { companyId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          phone: true,
          commissionPercent: true,
          canRegisterHbxSellers: true,
          sellerReferralCommissionPercent: true,
          referredByUserId: true,
          referredByCommissionPercentSnapshot: true,
          referredByUser: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
            },
          },
          role: true,
          isSystemMaster: true,
          isActive: true,
          deactivatedAt: true,
          retentionUntil: true,
          createdAt: true,
        },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, slug: true, commissionDueBusinessDays: true },
      }),
      this.prisma.companyConversation.findMany({ where: { companyId }, select: { contact: true } }),
      this.prisma.satisfactionSurvey.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          conversation: {
            include: {
              customer: {
                select: { phone: true, name: true },
              },
            },
          },
        },
      }),
    ]);

    const contactSet = new Set(companyContacts.map((item) => String(item.contact || '').trim()));
    const companySurveys = surveys
      .filter((item) => contactSet.has(String(item?.conversation?.customer?.phone || '').trim()))
      .map((item) => ({
        id: item.id,
        rating: item.rating,
        feedback: item.feedback,
        createdAt: item.createdAt,
        customerPhone: item.conversation?.customer?.phone || null,
        customerName: item.conversation?.customer?.name || null,
      }));

    const commissionDueBusinessDays = normalizeCommissionDueBusinessDays(company?.commissionDueBusinessDays);
    const commission = await this.buildCommissionOverview(companyId, companyUsers, { dueBusinessDays: commissionDueBusinessDays });
    const isHbxSellerNetwork = company ? isMasterOperationalCompanySlug(company.slug) : false;
    const operationAudit = await this.buildOperationAudit(companyId, companyUsers, commission, { isHbxSellerNetwork });

    return {
      companyId,
      currentUser: {
        id: Math.trunc(Number(user?.id || 0)) || null,
        role: user?.isSystemMaster ? 'USERMASTER' : String(user?.role || '').trim().toUpperCase(),
        isSystemMaster: Boolean(user?.isSystemMaster),
        canManageCommissionSettings: canManageCommissionSettings(user),
      },
      company: company
        ? {
          id: company.id,
          name: company.name,
          isHbxSellerNetwork,
        }
        : null,
      totals: {
        conversations: totalConversations,
        messages: totalMessages,
        inbound: inboundCount,
        outbound: outboundCount,
        complaints: totalComplaints,
        users: companyUsers.length,
        surveys: companySurveys.length,
      },
      users: companyUsers,
      commission,
      operationAudit,
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        timestamp: m.timestamp,
        conversation: m.conversation ? { id: m.conversation.id, contact: m.conversation.contact, channel: m.conversation.channel } : undefined,
        isComplaint: Boolean((m as any).isComplaint),
      })),
      surveys: companySurveys,
    };
  }

  async updateCommissionSettings(user: any, input: { commissionDueBusinessDays?: number | string | null }) {
    const companyId = requireCompanyIdFromUser(user);
    if (!canManageCommissionSettings(user)) {
      throw new ForbiddenException('Somente USERMASTER pode alterar o prazo de comissão.');
    }
    const rawDays = input?.commissionDueBusinessDays;
    const numericDays = Math.trunc(Number(rawDays));
    if (!Number.isFinite(numericDays) || numericDays < 0 || numericDays > 30) {
      throw new BadRequestException('Informe um prazo D+ entre 0 e 30 dias úteis.');
    }
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        commissionDueBusinessDays: numericDays,
      },
      select: {
        id: true,
        commissionDueBusinessDays: true,
      },
    });
    return {
      ok: true,
      settings: {
        dueBusinessDays: normalizeCommissionDueBusinessDays(company.commissionDueBusinessDays),
      },
    };
  }

  async markComplaint(user: any, messageId: number, isComplaint: boolean) {
    const companyId = requireCompanyIdFromUser(user);
    const msg = await this.prisma.companyMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.companyId !== companyId) throw new NotFoundException('Message not found');
    await this.prisma.companyMessage.update({ where: { id: messageId }, data: { isComplaint } as any });
    return { ok: true };
  }

  async updateCommissionStatus(user: any, leadId: string, input: { commissionStatus?: string | null; commissionNote?: string | null }) {
    const companyId = requireCompanyIdFromUser(user);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const status = normalizeCommissionStatus(input?.commissionStatus);
    if (!['pending', 'payable', 'paid', 'canceled'].includes(status)) {
      throw new BadRequestException('Status de comissão inválido.');
    }
    const existing = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      select: { id: true, commissionDueAt: true, saleStatus: true },
    });
    if (!existing) throw new NotFoundException('Lead comercial nao encontrado.');
    const now = new Date();
    const dueBusinessDays = await this.resolveCommissionDueBusinessDays(companyId);
    const data: any = {
      commissionStatus: status,
      commissionNote: typeof input?.commissionNote === 'string' ? input.commissionNote.trim() || null : undefined,
      commissionPaidAt: status === 'paid' ? now : null,
      commissionDueAt: status === 'payable' ? existing.commissionDueAt || addBusinessDays(now, dueBusinessDays) : existing.commissionDueAt,
      commissionRecurring: ['trial_started', 'sale_confirmed'].includes(String(existing.saleStatus || '').toLowerCase()) && status !== 'canceled',
      commissionPayoutId: status === 'paid' ? undefined : null,
    };
    if (status === 'canceled') data.commissionRecurring = false;
    const updated = await this.prisma.vendasLead.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        commissionStatus: true,
        commissionPaidAt: true,
        commissionDueAt: true,
        commissionAmount: true,
        commissionPayoutId: true,
      },
    });
    return {
      ok: true,
      leadId: updated.id,
      commissionStatus: updated.commissionStatus,
      commissionAmount: money(updated.commissionAmount),
      commissionPaidAt: updated.commissionPaidAt instanceof Date ? updated.commissionPaidAt.toISOString() : null,
      commissionDueAt: updated.commissionDueAt instanceof Date ? updated.commissionDueAt.toISOString() : null,
      commissionPayoutId: updated.commissionPayoutId || null,
    };
  }

  async updateClientSaleStatus(user: any, leadId: string, input: { saleStatus?: string | null; commissionNote?: string | null }) {
    const companyId = requireCompanyIdFromUser(user);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const saleStatus = normalizeSaleStatus(input?.saleStatus);
    if (!['activation_pending', 'trial_started', 'sale_confirmed', 'inactive', 'canceled'].includes(saleStatus)) {
      throw new BadRequestException('Status de venda inválido.');
    }

    const existing = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      select: {
        id: true,
        name: true,
        assignedUserId: true,
        assignedByUserId: true,
        createdByUserId: true,
        commissionPercentSnapshot: true,
        saleStatus: true,
        saleValue: true,
        salePlanKey: true,
        saleConfirmedAt: true,
        commissionBaseAmount: true,
        commissionStatus: true,
        commissionDueAt: true,
        commissionPaidAt: true,
        commissionPayoutId: true,
      },
    });
    if (!existing) throw new NotFoundException('Lead comercial nao encontrado.');

    const now = new Date();
    const dueBusinessDays = await this.resolveCommissionDueBusinessDays(companyId);
    const assignedUserId = Math.trunc(Number(existing.assignedUserId || 0)) || 0;
    const owner = assignedUserId
      ? await this.prisma.user.findFirst({
          where: { id: assignedUserId, companyId },
          select: { commissionPercent: true },
        }).catch(() => null)
      : null;
    const percentSnapshot = Number(existing.commissionPercentSnapshot || 0);
    const commissionPercent = Math.min(
      100,
      Math.max(0, Number.isFinite(percentSnapshot) && percentSnapshot > 0 ? percentSnapshot : Number(owner?.commissionPercent || 0) || 0),
    );
    const baseAmount = money(
      money(existing.saleValue) ||
      money(existing.commissionBaseAmount) ||
      getCommercialPlanMonthlyPrice(existing.salePlanKey),
    );
    const commissionAmount = money((baseAmount * commissionPercent) / 100);
    const confirmsSale = ['trial_started', 'sale_confirmed'].includes(saleStatus);
    const endsSale = ['inactive', 'canceled'].includes(saleStatus);
    const currentCommissionStatus = normalizeCommissionStatus(existing.commissionStatus);
    const keepPaid = currentCommissionStatus === 'paid' && !endsSale;
    const commissionStatus = keepPaid
      ? 'paid'
      : confirmsSale
        ? (commissionAmount > 0 ? 'payable' : 'pending')
        : saleStatus === 'activation_pending'
          ? 'pending'
          : 'canceled';
    const confirmedAt = confirmsSale
      ? (existing.saleConfirmedAt instanceof Date ? existing.saleConfirmedAt : now)
      : null;
    const commissionDueAt = commissionStatus === 'payable'
      ? (existing.commissionDueAt instanceof Date ? existing.commissionDueAt : addBusinessDays(confirmedAt || now, dueBusinessDays))
      : (keepPaid ? existing.commissionDueAt : null);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: {
          saleStatus,
          saleValue: baseAmount,
          saleConfirmedAt: confirmedAt,
          saleCanceledAt: endsSale ? now : null,
          commissionStatus,
          commissionBaseAmount: baseAmount,
          commissionAmount,
          commissionDueAt,
          commissionPaidAt: keepPaid ? existing.commissionPaidAt : null,
          commissionRecurring: confirmsSale && commissionStatus !== 'canceled',
          commissionPayoutId: keepPaid ? existing.commissionPayoutId : null,
          commissionNote: typeof input?.commissionNote === 'string' ? input.commissionNote.trim() || null : undefined,
        },
        select: {
          id: true,
          name: true,
          saleStatus: true,
          saleValue: true,
          commissionStatus: true,
          commissionAmount: true,
          commissionDueAt: true,
          commissionPaidAt: true,
          commissionRecurring: true,
          updatedAt: true,
        },
      });

      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: existing.id,
          eventType: 'activation_status_updated',
          title: 'Implantação atualizada',
          description: `Gerencial marcou o cliente como ${saleStatusLabel(saleStatus)}. Comissão: ${commissionStatus}.`,
          sourceType: 'gerencial_activation',
          statusFrom: normalizeSaleStatus(existing.saleStatus),
          statusTo: saleStatus,
          resultLabel: commissionStatus,
          createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
        },
      });

      return row;
    });

    return {
      ok: true,
      leadId: updated.id,
      name: updated.name || null,
      saleStatus: updated.saleStatus,
      saleStatusLabel: saleStatusLabel(normalizeSaleStatus(updated.saleStatus)),
      saleValue: money(updated.saleValue),
      commissionStatus: updated.commissionStatus,
      commissionAmount: money(updated.commissionAmount),
      commissionDueAt: updated.commissionDueAt instanceof Date ? updated.commissionDueAt.toISOString() : null,
      commissionPaidAt: updated.commissionPaidAt instanceof Date ? updated.commissionPaidAt.toISOString() : null,
      commissionRecurring: Boolean(updated.commissionRecurring),
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : null,
    };
  }

  async createCommissionPayout(user: any, input: {
    sellerUserId?: number | null;
    dueOnly?: boolean | null;
    referenceLabel?: string | null;
    notes?: string | null;
  }) {
    const companyId = requireCompanyIdFromUser(user);
    const sellerUserId = Math.trunc(Number(input?.sellerUserId || 0)) || null;
    const dueOnly = input?.dueOnly !== false;
    const now = new Date();

    if (sellerUserId) {
      const seller = await this.prisma.user.findFirst({
        where: {
          id: sellerUserId,
          companyId,
          role: 'USER',
        },
        select: { id: true },
      });
      if (!seller) throw new BadRequestException('Vendedor inválido para este fechamento.');
    }

    const dueFilter = dueOnly
      ? {
          OR: [
            { commissionDueAt: { lte: now } },
            { commissionDueAt: null },
          ],
      }
      : {};
    const receivableDueFilter = dueOnly
      ? {
          OR: [
            { dueAt: { lte: now } },
            { dueAt: null },
          ],
        }
      : {};

    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId,
        ...(sellerUserId ? { assignedUserId: sellerUserId } : { assignedUserId: { not: null } }),
        commissionStatus: 'payable',
        commissionAmount: { gt: 0 },
        ...dueFilter,
      },
      orderBy: [{ assignedUserId: 'asc' }, { commissionDueAt: 'asc' }, { updatedAt: 'asc' }],
      take: 5000,
      select: {
        id: true,
        assignedUserId: true,
        commissionAmount: true,
        commissionDueAt: true,
        name: true,
      },
    });

    const receivables = await this.prisma.vendasCommissionReceivable.findMany({
      where: {
        companyId,
        ...(sellerUserId ? { sellerUserId } : { sellerUserId: { not: null } }),
        status: 'payable',
        amount: { gt: 0 },
        ...receivableDueFilter,
      },
      orderBy: [{ sellerUserId: 'asc' }, { dueAt: 'asc' }, { updatedAt: 'asc' }],
      take: 5000,
      select: {
        id: true,
        leadId: true,
        sellerUserId: true,
        amount: true,
        dueAt: true,
        cycleKey: true,
      },
    });

    const grouped = new Map<number, { leads: any[]; receivables: any[] }>();
    const ensureGroup = (ownerId: number) => {
      if (!grouped.has(ownerId)) grouped.set(ownerId, { leads: [], receivables: [] });
      return grouped.get(ownerId)!;
    };
    for (const lead of leads) {
      const ownerId = Math.trunc(Number(lead.assignedUserId || 0)) || 0;
      if (!ownerId) continue;
      ensureGroup(ownerId).leads.push(lead);
    }
    for (const receivable of receivables) {
      const ownerId = Math.trunc(Number(receivable.sellerUserId || 0)) || 0;
      if (!ownerId) continue;
      ensureGroup(ownerId).receivables.push(receivable);
    }

    if (!grouped.size) {
      throw new BadRequestException(dueOnly ? 'Nenhuma comissão liberada para fechar.' : 'Nenhuma comissão a pagar para fechar.');
    }

    const referenceLabel = normalizeOptionalText(input?.referenceLabel, 120) || defaultPayoutReferenceLabel(now);
    const notes = normalizeOptionalText(input?.notes, 500);
    const createdByUserId = Math.trunc(Number(user?.id || 0)) || null;

    const payouts = await this.prisma.$transaction(async (tx) => {
      const created: any[] = [];
      for (const [ownerId, group] of grouped.entries()) {
        const leadIds = group.leads.map((row) => row.id);
        const receivableIds = group.receivables.map((row) => row.id);
        const commissionCount = leadIds.length + receivableIds.length;
        if (!commissionCount) continue;
        const totalAmount = money(
          group.leads.reduce((sum, row) => sum + money(row.commissionAmount), 0) +
          group.receivables.reduce((sum, row) => sum + money(row.amount), 0),
        );
        const payout = await tx.vendasCommissionPayout.create({
          data: {
            companyId,
            sellerUserId: ownerId,
            status: 'paid',
            leadCount: commissionCount,
            totalAmount,
            referenceLabel,
            notes,
            paidAt: now,
            createdByUserId,
          },
        });

        if (leadIds.length) {
          await tx.vendasLead.updateMany({
            where: {
              companyId,
              id: { in: leadIds },
              commissionStatus: 'payable',
            },
            data: {
              commissionStatus: 'paid',
              commissionPaidAt: now,
              commissionPayoutId: payout.id,
            },
          });
        }

        if (receivableIds.length) {
          await tx.vendasCommissionReceivable.updateMany({
            where: {
              companyId,
              id: { in: receivableIds },
              status: 'payable',
            },
            data: {
              status: 'paid',
              paidAt: now,
              payoutId: payout.id,
            },
          });
        }

        const timelineEvents = [
          ...group.leads.map((row) => ({
            leadId: row.id,
            eventType: 'commission_payout_paid',
            title: 'Comissão fechada em lote',
            description: `${referenceLabel}. Valor: R$ ${money(row.commissionAmount).toFixed(2)}.`,
            sourceType: 'gerencial_commission_payout',
            resultLabel: 'paid',
            createdByUserId,
          })),
          ...group.receivables.map((row) => ({
            leadId: row.leadId,
            eventType: 'commission_recurring_payout_paid',
            title: 'Comissão recorrente fechada',
            description: `${referenceLabel}. Ciclo ${row.cycleKey || 'recorrente'}. Valor: R$ ${money(row.amount).toFixed(2)}.`,
            sourceType: 'gerencial_commission_payout',
            resultLabel: 'paid',
            createdByUserId,
          })),
        ].filter((event) => Boolean(event.leadId));

        if (timelineEvents.length) {
          await tx.vendasLeadTimelineEvent.createMany({ data: timelineEvents });
        }

        created.push(payout);
      }
      return created;
    });

    const totalLeadCount = payouts.reduce((sum, payout) => sum + Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)), 0);
    const totalAmount = money(payouts.reduce((sum, payout) => sum + money(payout.totalAmount), 0));

    return {
      ok: true,
      message: `${totalLeadCount} comissão(ões) fechada(s) em ${payouts.length} lote(s). Total: R$ ${totalAmount.toFixed(2)}.`,
      totalLeadCount,
      totalAmount,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        sellerUserId: Number(payout.sellerUserId || 0) || null,
        status: payout.status || 'paid',
        leadCount: Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
        totalAmount: money(payout.totalAmount),
        referenceLabel: payout.referenceLabel || null,
        paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
      })),
    };
  }

  async syncHbxClientCommissions(user: any) {
    const companyId = requireCompanyIdFromUser(user);
    const result = await this.hbxCommissionSync.syncSalesCompanyCommissions(companyId, { source: 'gerencial_manual_sync' });
    const createdReceivables = Number((result as any).createdReceivables || 0) || 0;
    const createdInheritedReceivables = Number((result as any).createdInheritedReceivables || 0) || 0;
    const updatedInheritedReceivables = Number((result as any).updatedInheritedReceivables || 0) || 0;
    const canceledReceivables = Number((result as any).canceledReceivables || 0) || 0;
    const totalChanges = Number(result.updatedLeads || 0) + createdReceivables + createdInheritedReceivables + updatedInheritedReceivables + canceledReceivables;
    return {
      ok: true,
      ...result,
      message: totalChanges
        ? `${Number(result.updatedLeads || 0)} cliente(s) sincronizado(s), ${createdReceivables} recorrência(s), ${createdInheritedReceivables + updatedInheritedReceivables} herdada(s) e ${canceledReceivables} cancelada(s).`
        : 'Nenhuma comissão nova para sincronizar agora.',
    };
  }
}
