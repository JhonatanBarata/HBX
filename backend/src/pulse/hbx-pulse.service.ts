import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type HbxPulseScopeType = 'company' | 'user';

type HbxPulseScope = {
  type: HbxPulseScopeType;
  companyId: number;
  companyName: string | null;
  userId: number;
  role: string;
};

const CLOSED_OR_INACTIVE_SALE_STATUSES = ['sale_confirmed', 'inactive', 'canceled'];
const PENDING_COMMISSION_STATUSES = ['pending', 'payable'];

function money(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(Math.max(0, numeric).toFixed(2));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(money(value));
}

function normalizeSegment(value: unknown) {
  const text = String(value || '').trim();
  return text || 'Sem segmento';
}

@Injectable()
export class HbxPulseService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummaryForUser(user: any) {
    const scope = await this.resolveScope(user);
    const now = new Date();

    const activeLeadWhere = this.buildLeadWhere(scope, {
      saleStatus: { notIn: CLOSED_OR_INACTIVE_SALE_STATUSES },
    });
    const overdueReturnWhere = this.buildLeadWhere(scope, {
      returnAt: { lte: now },
      saleStatus: { notIn: CLOSED_OR_INACTIVE_SALE_STATUSES },
    });
    const withoutFirstContactWhere = this.buildLeadWhere(scope, {
      status: 'novo',
      lastContactAt: null,
      saleStatus: { notIn: CLOSED_OR_INACTIVE_SALE_STATUSES },
    });
    const pendingActivationWhere = this.buildLeadWhere(scope, {
      saleStatus: 'activation_pending',
    });
    const leadCommissionWhere = this.buildLeadWhere(
      scope,
      { commissionStatus: { in: PENDING_COMMISSION_STATUSES } },
      { includeClosed: true },
    );
    const receivableCommissionWhere = this.buildReceivableWhere(scope);

    const [
      stalledCards,
      overdueReturns,
      leadsWithoutFirstContact,
      pendingActivationClients,
      leadCommission,
      receivableCommission,
      segmentRows,
    ] = await Promise.all([
      this.prisma.vendasLead.count({ where: activeLeadWhere }),
      this.prisma.vendasLead.count({ where: overdueReturnWhere }),
      this.prisma.vendasLead.count({ where: withoutFirstContactWhere }),
      this.prisma.vendasLead.count({ where: pendingActivationWhere }),
      this.prisma.vendasLead.aggregate({
        where: leadCommissionWhere,
        _count: { _all: true },
        _sum: { commissionAmount: true },
      }),
      this.prisma.vendasCommissionReceivable.aggregate({
        where: receivableCommissionWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.vendasLead.groupBy({
        by: ['segment'],
        where: activeLeadWhere,
        _count: { _all: true },
        _sum: { saleValue: true, commissionBaseAmount: true },
      }),
    ]);

    const opportunitiesBySegment = this.buildSegmentSummary(segmentRows);
    const pendingLeadCommissionAmount = money(leadCommission._sum.commissionAmount);
    const pendingReceivableAmount = money(receivableCommission._sum.amount);
    const pendingCommissionAmount = money(pendingLeadCommissionAmount + pendingReceivableAmount);
    const estimatedPotentialValue = money(
      opportunitiesBySegment.reduce((total, item) => total + item.estimatedPotentialValue, 0),
    );
    const pendingCommissionCount = Number(leadCommission._count._all || 0) + Number(receivableCommission._count._all || 0);

    const metrics = {
      stalledCards,
      overdueReturns,
      leadsWithoutFirstContact,
      pendingActivationClients,
      pendingCommissionCount,
      pendingCommissionAmount,
      pendingLeadCommissionAmount,
      pendingRecurringCommissionAmount: pendingReceivableAmount,
      estimatedPotentialValue,
      opportunitiesBySegment,
    };

    return {
      ok: true,
      generatedAt: now.toISOString(),
      scope: {
        type: scope.type,
        companyId: scope.companyId,
        companyName: scope.companyName,
        userId: scope.type === 'user' ? scope.userId : null,
        role: scope.role,
      },
      metrics,
      whatsappText: this.buildWhatsappText(metrics, scope),
    };
  }

  private async resolveScope(user: any): Promise<HbxPulseScope> {
    const userId = Number(user?.id || 0);
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');

    const masterContext = user?.masterContext || null;
    const masterContextCompanyId = Number(masterContext?.active ? masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || user?.company?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new ForbiddenException('Empresa nao identificada.');

    const role = String(user?.role || '').trim().toUpperCase() || 'USER';
    const isSystemMaster = Boolean(user?.isSystemMaster);
    const type: HbxPulseScopeType = role === 'USER' && !isSystemMaster ? 'user' : 'company';

    return {
      type,
      companyId: Number(company.id),
      companyName: company.name || null,
      userId,
      role: isSystemMaster ? 'USERMASTER' : role,
    };
  }

  private buildLeadWhere(
    scope: HbxPulseScope,
    extra: Prisma.VendasLeadWhereInput = {},
    options: { includeClosed?: boolean } = {},
  ): Prisma.VendasLeadWhereInput {
    const and: Prisma.VendasLeadWhereInput[] = [{ companyId: scope.companyId }];
    if (!options.includeClosed) {
      and.push({
        NOT: [
          { status: 'encerrado' },
          { closedAt: { not: null } },
        ],
      });
    }
    if (Object.keys(extra).length > 0) and.push(extra);
    if (scope.type === 'user') {
      and.push({
        OR: [
          { assignedUserId: scope.userId },
          { assignedUserId: null, createdByUserId: scope.userId },
        ],
      });
    }
    return { AND: and };
  }

  private buildReceivableWhere(scope: HbxPulseScope): Prisma.VendasCommissionReceivableWhereInput {
    return {
      companyId: scope.companyId,
      status: 'payable',
      ...(scope.type === 'user' ? { sellerUserId: scope.userId } : {}),
    };
  }

  private buildSegmentSummary(rows: Array<{
    segment: string | null;
    _count: { _all: number };
    _sum: { saleValue: number | null; commissionBaseAmount: number | null };
  }>) {
    return (rows || [])
      .map((row) => {
        const saleValue = money(row?._sum?.saleValue);
        const commissionBaseAmount = money(row?._sum?.commissionBaseAmount);
        return {
          segment: normalizeSegment(row?.segment),
          count: Number(row?._count?._all || 0),
          estimatedPotentialValue: money(Math.max(saleValue, commissionBaseAmount)),
        };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || b.estimatedPotentialValue - a.estimatedPotentialValue || a.segment.localeCompare(b.segment))
      .slice(0, 8);
  }

  private buildWhatsappText(metrics: any, scope: HbxPulseScope) {
    const topSegments = (metrics.opportunitiesBySegment || [])
      .slice(0, 3)
      .map((item: any) => `${item.segment} (${item.count})`)
      .join(', ');
    const scopeText = scope.type === 'user' ? ' na sua carteira' : ' na empresa';
    const parts = [
      `Hoje existem ${metrics.stalledCards} oportunidades paradas${scopeText}.`,
      `Retornos vencidos: ${metrics.overdueReturns}.`,
      `Leads sem primeiro contato: ${metrics.leadsWithoutFirstContact}.`,
      `Clientes pending activation: ${metrics.pendingActivationClients}.`,
      `Comissao pendente: ${formatCurrency(metrics.pendingCommissionAmount)}.`,
      `Valor potencial estimado: ${formatCurrency(metrics.estimatedPotentialValue)}.`,
    ];
    if (topSegments) parts.push(`Segmentos com mais oportunidade: ${topSegments}.`);
    parts.push('Acao sugerida: priorizar retornos vencidos e primeiro contato hoje.');
    return parts.join(' ');
  }
}
