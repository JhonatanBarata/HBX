import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parsePreferredSegments } from '../users/preferred-segments.util';

type HbxPulseScopeType = 'company' | 'user';

type HbxPulseScope = {
  type: HbxPulseScopeType;
  companyId: number;
  companyName: string | null;
  userId: number;
  role: string;
};

const WARMUP_MIN = 30;
const MIN_GAP_MIN = 25;
const DAILY_CAP = 6;
const QUIET_START_HOUR = 8;
const QUIET_END_HOUR = 21;
const DEFAULT_FORCE_SECONDS = 12;

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

  async generateNudgeForUser(user: any) {
    const scope = await this.resolveScope(user);
    if (scope.type !== 'user') return { notice: null };

    // Verificar mute (busca fresco para não depender do token)
    const freshUser = await this.prisma.user.findUnique({
      where: { id: scope.userId },
      select: { brainPushMutedAt: true },
    });
    if (freshUser?.brainPushMutedAt) return { notice: null, muted: true };

    // Janela de horário (hora local do servidor — Brasil UTC-3)
    const localHour = new Date().getUTCHours() - 3;
    const hour = ((localHour % 24) + 24) % 24;
    if (hour < QUIET_START_HOUR || hour >= QUIET_END_HOUR) return { notice: null };

    // Teto diário + gap mínimo
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const todayNotices = await this.prisma.$queryRaw<Array<{ count: bigint; last_at: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("createdAt") AS "last_at"
      FROM "MasterNotice"
      WHERE "companyId" = ${scope.companyId}
        AND "targetUserId" = ${scope.userId}
        AND "source" = 'brain'
        AND "createdAt" >= ${dayStart}
    `;
    const todayCount = Number(todayNotices[0]?.count ?? 0);
    if (todayCount >= DAILY_CAP) return { notice: null };
    const lastAt = todayNotices[0]?.last_at ? new Date(todayNotices[0].last_at) : null;
    if (lastAt) {
      const gapMs = Date.now() - lastAt.getTime();
      if (gapMs < MIN_GAP_MIN * 60 * 1000) return { notice: null };
    }

    const summary = await this.getSummaryForUser(user);
    const metrics = summary.metrics as any;

    // Dedup: nudgeKeys das últimas 6h
    const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const recentRows = await this.prisma.$queryRaw<Array<{ nudgeKey: string | null }>>`
      SELECT "nudgeKey" FROM "MasterNotice"
      WHERE "companyId" = ${scope.companyId}
        AND "targetUserId" = ${scope.userId}
        AND "source" = 'brain'
        AND "createdAt" >= ${since6h}
    `;
    const recentKeys = new Set(recentRows.map((r) => r.nudgeKey).filter(Boolean));

    // Candidatos de ângulo
    type Candidate = { nudgeKey: string; tone: string; title: string; body: string; payloadFn?: () => Promise<{ payload: any; body?: string } | null> };
    const candidates: Candidate[] = [];

    // ângulo-lead (estrela — prioridade)
    const prefs = parsePreferredSegments((user as any).preferredSegmentsJson);
    if (prefs.segments.length > 0 || prefs.cityRegion) {
      const leadResult = await this.findBestEnrichedLead(scope.companyId, prefs);
      if (leadResult && !recentKeys.has(`lead:${leadResult.id}`)) {
        candidates.unshift({
          nudgeKey: `lead:${leadResult.id}`,
          tone: 'success',
          title: 'Lead enriquecido no seu segmento',
          body: `Achei um lead bom: **${leadResult.name}** (${leadResult.normalizedCity}). Já enriquecido e pronto pra contato.`,
          payloadFn: async () => ({
            payload: { kind: 'lead', poolId: leadResult.id, name: leadResult.name, city: leadResult.normalizedCity, segment: leadResult.normalizedSegment, href: '/webscraping' },
          }),
        });
      }
    }

    // demais ângulos
    if (metrics.overdueReturns > 0 && !recentKeys.has('overdue-returns')) {
      candidates.push({ nudgeKey: 'overdue-returns', tone: 'warning', title: 'Retornos vencidos esperando você', body: `Você tem **${metrics.overdueReturns}** retorno${metrics.overdueReturns > 1 ? 's' : ''} vencido${metrics.overdueReturns > 1 ? 's' : ''}. Bora reativar?` });
    }
    if (metrics.stalledCards > 0 && !recentKeys.has('stalled-cards')) {
      candidates.push({ nudgeKey: 'stalled-cards', tone: 'info', title: 'Oportunidades paradas', body: `**${metrics.stalledCards}** oportunidade${metrics.stalledCards > 1 ? 's' : ''} parada${metrics.stalledCards > 1 ? 's' : ''} esperando você.` });
    }
    if (metrics.leadsWithoutFirstContact > 0 && !recentKeys.has('no-first-contact')) {
      candidates.push({ nudgeKey: 'no-first-contact', tone: 'info', title: 'Leads sem primeiro contato', body: `**${metrics.leadsWithoutFirstContact}** lead${metrics.leadsWithoutFirstContact > 1 ? 's' : ''} novo${metrics.leadsWithoutFirstContact > 1 ? 's' : ''} sem 1º contato. O primeiro a falar leva.` });
    }
    const topSeg = (metrics.opportunitiesBySegment || [])[0];
    if (topSeg && topSeg.count > 0 && !recentKeys.has('hot-segment')) {
      candidates.push({ nudgeKey: 'hot-segment', tone: 'info', title: `Segmento ${topSeg.segment} em alta`, body: `Seu segmento **${topSeg.segment}** está quente: ${topSeg.count} oportunidade${topSeg.count > 1 ? 's' : ''}.` });
    }
    if (metrics.pendingCommissionAmount > 0 && !recentKeys.has('commission-reach')) {
      candidates.push({ nudgeKey: 'commission-reach', tone: 'success', title: 'Comissão pendente no funil', body: `Tem **${formatCurrency(metrics.pendingCommissionAmount)}** de comissão pendente no seu funil.` });
    }

    if (candidates.length === 0) return { notice: null };

    // O ângulo-lead tem prioridade; entre os demais, escolha aleatória com peso uniforme
    const chosen = candidates[0].nudgeKey.startsWith('lead:')
      ? candidates[0]
      : candidates[Math.floor(Math.random() * candidates.length)];

    let payloadObj: any = null;
    let bodyFinal = chosen.body;
    if (chosen.payloadFn) {
      const r = await chosen.payloadFn();
      if (r) {
        payloadObj = r.payload;
        if (r.body) bodyFinal = r.body;
      }
    } else {
      payloadObj = { kind: 'vendas', href: '/vendas' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const id = randomUUID();
    const payloadJson = payloadObj ? JSON.stringify(payloadObj) : null;

    await this.prisma.$executeRaw`
      INSERT INTO "MasterNotice" (
        "id", "companyId", "audience", "title", "body", "tone",
        "forceSeconds", "startsAt", "expiresAt", "createdByUserId",
        "source", "targetUserId", "nudgeKey", "payloadJson",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${scope.companyId}, 'seller', ${chosen.title}, ${bodyFinal}, ${chosen.tone},
        ${DEFAULT_FORCE_SECONDS}, ${now}, ${expiresAt}, ${null}::integer,
        'brain', ${scope.userId}, ${chosen.nudgeKey}, ${payloadJson},
        ${now}, ${now}
      )
    `;

    return {
      notice: {
        id,
        audience: 'seller',
        title: chosen.title,
        body: bodyFinal,
        tone: chosen.tone,
        forceSeconds: DEFAULT_FORCE_SECONDS,
        startsAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdByUserId: null,
        acknowledged: false,
        acknowledgedAt: null,
        source: 'brain',
        nudgeKey: chosen.nudgeKey,
        payload: payloadObj,
      },
    };
  }

  private async findBestEnrichedLead(companyId: number, prefs: { segments: string[]; cityRegion: string | null }) {
    const segs = prefs.segments;
    const city = prefs.cityRegion;

    // Busca líder enriquecido não pego pela empresa neste segmento/cidade
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; name: string; normalizedCity: string; normalizedSegment: string;
    }>>`
      SELECT p."id", p."name", p."normalizedCity", p."normalizedSegment"
      FROM "RadarLeadPool" p
      WHERE p."lastEnrichedAt" IS NOT NULL
        AND p."opportunityScore" > 0
        AND p."status" = 'clean'
        ${segs.length > 0 ? Prisma.sql`AND p."normalizedSegment" = ANY(${segs}::text[])` : Prisma.sql``}
        ${city ? Prisma.sql`AND p."normalizedCity" ILIKE ${'%' + city + '%'}` : Prisma.sql``}
        AND NOT EXISTS (
          SELECT 1 FROM "RadarLeadCompanyState" s
          WHERE s."radarLeadId" = p."id"
            AND s."companyId" = ${companyId}
        )
      ORDER BY p."opportunityScore" DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async setPushMuted(user: any, muted: boolean) {
    const scope = await this.resolveScope(user);
    const now = muted ? new Date() : null;
    await this.prisma.user.update({
      where: { id: scope.userId },
      data: { brainPushMutedAt: now },
    });
    return { ok: true, muted };
  }
}
