import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';

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

@Injectable()
export class GerencialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hbxCommissionSync: HbxCommissionSyncService,
  ) {}

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

  private async buildCommissionOverview(companyId: number, companyUsers: any[]) {
    const sellers = (companyUsers || []).filter((user) => String(user?.role || '').trim().toUpperCase() === 'USER');
    const sellerIds = sellers.map((user) => Number(user.id)).filter((id) => Number.isInteger(id) && id > 0);
    const sellerNames = this.sellerNameMap(companyUsers);
    const payouts = await this.fetchRecentCommissionPayouts(companyId, sellerNames);
    if (!sellerIds.length) {
      return {
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
        },
        sellers: [],
        recentClients: [],
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
        city: true,
        status: true,
        assignedUserId: true,
        saleStatus: true,
        saleValue: true,
        saleConfirmedAt: true,
        saleCanceledAt: true,
        commissionStatus: true,
        commissionPercentSnapshot: true,
        commissionBaseAmount: true,
        commissionAmount: true,
        commissionDueAt: true,
        commissionPaidAt: true,
        commissionRecurring: true,
        commissionPayoutId: true,
        updatedAt: true,
      },
    });

    const bySellerId = new Map<number, any[]>();
    for (const lead of leads) {
      const sellerId = Number(lead.assignedUserId || 0);
      if (!sellerId) continue;
      if (!bySellerId.has(sellerId)) bySellerId.set(sellerId, []);
      bySellerId.get(sellerId)?.push(lead);
    }

    const now = new Date();
    const summarize = (rows: any[]) => {
      const activeRows = rows.filter((row) => ['trial_started', 'sale_confirmed'].includes(String(row.saleStatus || '').toLowerCase()));
      const pendingRows = rows.filter((row) => String(row.saleStatus || '').toLowerCase() === 'activation_pending');
      const inactiveRows = rows.filter((row) => ['inactive', 'canceled'].includes(String(row.saleStatus || '').toLowerCase()));
      const payableRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'payable');
      const duePayableRows = payableRows.filter((row) => isDueCommission(row, now));
      const commissionPendingRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'pending');
      const paidRows = rows.filter((row) => normalizeCommissionStatus(row.commissionStatus) === 'paid');
      const recurringRows = activeRows.filter((row) => Boolean(row.commissionRecurring));
      const nextDue = payableRows
        .map((row) => row.commissionDueAt instanceof Date ? row.commissionDueAt : null)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0] || null;
      return {
        assignedCards: rows.length,
        activeClients: activeRows.length,
        pendingActivation: pendingRows.length,
        inactiveClients: inactiveRows.length,
        payableAmount: money(payableRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        duePayableAmount: money(duePayableRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        duePayableCount: duePayableRows.length,
        pendingAmount: money(commissionPendingRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        paidAmount: money(paidRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        recurringAmount: money(recurringRows.reduce((sum, row) => sum + money(row.commissionAmount), 0)),
        nextDueAt: nextDue ? nextDue.toISOString() : null,
      };
    };

    const sellerSummaries = sellers.map((seller) => {
      const rows = bySellerId.get(Number(seller.id)) || [];
      const summary = summarize(rows);
      return {
        userId: Number(seller.id),
        name: seller.name || seller.username || seller.email || `Vendedor #${seller.id}`,
        email: seller.email || null,
        phone: seller.phone || null,
        isActive: Boolean(seller.isActive),
        commissionPercent: money(seller.commissionPercent),
        ...summary,
        clients: rows.slice(0, 6).map((row) => ({
          leadId: row.id,
          name: row.name || row.phone || 'Cliente sem nome',
          phone: row.phone || null,
          city: row.city || null,
          saleStatus: row.saleStatus || 'none',
          commissionStatus: row.commissionStatus || 'none',
          saleValue: money(row.saleValue || row.commissionBaseAmount),
          commissionAmount: money(row.commissionAmount),
          commissionDueAt: row.commissionDueAt instanceof Date ? row.commissionDueAt.toISOString() : null,
          commissionPaidAt: row.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
          commissionPayoutId: row.commissionPayoutId || null,
          updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
        })),
      };
    });

    const allSummary = summarize(leads);
    return {
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
        nextDueAt: allSummary.nextDueAt,
      },
      sellers: sellerSummaries,
      recentClients: leads.slice(0, 12).map((row) => ({
        leadId: row.id,
        userId: Number(row.assignedUserId || 0) || null,
        name: row.name || row.phone || 'Cliente sem nome',
        phone: row.phone || null,
        city: row.city || null,
        saleStatus: row.saleStatus || 'none',
        commissionStatus: row.commissionStatus || 'none',
        saleValue: money(row.saleValue || row.commissionBaseAmount),
        commissionAmount: money(row.commissionAmount),
        commissionDueAt: row.commissionDueAt instanceof Date ? row.commissionDueAt.toISOString() : null,
        commissionPaidAt: row.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
        commissionPayoutId: row.commissionPayoutId || null,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      })),
      payouts,
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
          role: true,
          isActive: true,
          deactivatedAt: true,
          retentionUntil: true,
          createdAt: true,
        },
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

    const commission = await this.buildCommissionOverview(companyId, companyUsers);

    return {
      companyId,
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
    const data: any = {
      commissionStatus: status,
      commissionNote: typeof input?.commissionNote === 'string' ? input.commissionNote.trim() || null : undefined,
      commissionPaidAt: status === 'paid' ? now : null,
      commissionDueAt: status === 'payable' ? existing.commissionDueAt || addBusinessDays(now, 3) : existing.commissionDueAt,
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

    const grouped = new Map<number, typeof leads>();
    for (const lead of leads) {
      const ownerId = Math.trunc(Number(lead.assignedUserId || 0)) || 0;
      if (!ownerId) continue;
      if (!grouped.has(ownerId)) grouped.set(ownerId, []);
      grouped.get(ownerId)?.push(lead);
    }

    if (!grouped.size) {
      throw new BadRequestException(dueOnly ? 'Nenhuma comissão vencida para fechar.' : 'Nenhuma comissão a pagar para fechar.');
    }

    const referenceLabel = normalizeOptionalText(input?.referenceLabel, 120) || defaultPayoutReferenceLabel(now);
    const notes = normalizeOptionalText(input?.notes, 500);
    const createdByUserId = Math.trunc(Number(user?.id || 0)) || null;

    const payouts = await this.prisma.$transaction(async (tx) => {
      const created: any[] = [];
      for (const [ownerId, rows] of grouped.entries()) {
        const leadIds = rows.map((row) => row.id);
        const totalAmount = money(rows.reduce((sum, row) => sum + money(row.commissionAmount), 0));
        const payout = await tx.vendasCommissionPayout.create({
          data: {
            companyId,
            sellerUserId: ownerId,
            status: 'paid',
            leadCount: rows.length,
            totalAmount,
            referenceLabel,
            notes,
            paidAt: now,
            createdByUserId,
          },
        });

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

        await tx.vendasLeadTimelineEvent.createMany({
          data: rows.map((row) => ({
            leadId: row.id,
            eventType: 'commission_payout_paid',
            title: 'Comissão fechada em lote',
            description: `${referenceLabel}. Valor: R$ ${money(row.commissionAmount).toFixed(2)}.`,
            sourceType: 'gerencial_commission_payout',
            resultLabel: 'paid',
            createdByUserId,
          })),
        });

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
    return {
      ok: true,
      ...result,
      message: result.updatedLeads
        ? `${result.updatedLeads} comissão(ões) sincronizada(s) com clientes HBX.`
        : 'Nenhuma comissão nova para sincronizar agora.',
    };
  }
}
