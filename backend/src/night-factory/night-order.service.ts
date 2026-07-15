import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ORDER_BLOCKED_LEAD_STATUSES = [
  'complaint',
  'denied',
  'hidden',
  'rejected',
  'blocked',
  'discarded',
  'negative',
  'opt_out',
  'optout',
  'invalid',
  'invalid_phone',
];
const VALID_ORDER_STATUSES = ['open', 'paused', 'done', 'canceled'];
const NO_WEBSITE_STATUSES = ['none', 'social_only', 'unreachable'];

function safeText(value: unknown, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeKey(value: unknown) {
  return safeText(value, 200)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(normalized);
}

function parseLeadIds(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((id) => String(id || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function hasLikelyMobile(phoneDigits: unknown) {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  return national.length === 11 && national[2] === '9';
}

export function saoPauloDateKey(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type NightOrderFulfillSummary = {
  orderId: string;
  segment: string;
  deliveredNow: number;
  deliveredToday: number;
  dailyQuota: number;
  quotaMet: boolean;
};

@Injectable()
export class NightOrderService {
  private readonly logger = new Logger(NightOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async storageAvailable() {
    const [orders, deliveries, pool] = await Promise.all([
      this.prisma.hasTable('NightOrder').catch(() => false),
      this.prisma.hasTable('NightOrderDelivery').catch(() => false),
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
    ]);
    return orders && deliveries && pool;
  }

  private resolveScope(user: any) {
    const companyId = Number(
      user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId ?? user?.company?.id,
    ) || 0;
    if (!companyId) {
      throw new ForbiddenException('Encomenda noturna exige empresa identificada.');
    }
    return { companyId, userId: Number(user?.id || 0) || null };
  }

  async create(user: any, input: Record<string, any> = {}) {
    if (!(await this.storageAvailable())) {
      throw new BadRequestException('Encomenda noturna ainda não está disponível neste ambiente.');
    }
    const scope = this.resolveScope(user);
    const segment = safeText(input.segment, 120);
    if (!segment) throw new BadRequestException('Informe o segmento da encomenda.');

    const idempotencyKey = safeText(input.idempotencyKey, 160) || null;
    if (idempotencyKey) {
      const existing = await (this.prisma as any).nightOrder.findUnique({ where: { idempotencyKey } }).catch(() => null);
      if (existing) return this.mapOrder(existing);
    }

    const order = await (this.prisma as any).nightOrder.create({
      data: {
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        segment,
        normalizedSegment: normalizeKey(segment),
        city: safeText(input.city, 120) || null,
        state: safeText(input.state, 8) || null,
        normalizedCity: normalizeKey(input.city) || null,
        requireEmail: coerceBoolean(input.requireEmail, true),
        requireWhatsapp: coerceBoolean(input.requireWhatsapp, false),
        onlyWithoutWebsite: coerceBoolean(input.onlyWithoutWebsite, false),
        dailyQuota: clampInt(input.dailyQuota, 10, 1, 100),
        status: 'open',
        idempotencyKey,
        metadataJson: JSON.stringify({ createdVia: 'api', requestedAt: new Date().toISOString() }),
      },
    });
    this.logger.log(`[night-order] criada order=${order.id} company=${scope.companyId} segmento="${segment}" quota=${order.dailyQuota}`);
    return this.mapOrder(order);
  }

  async list(user: any) {
    if (!(await this.storageAvailable())) return { generatedAt: new Date().toISOString(), items: [] };
    const scope = this.resolveScope(user);
    const orders = await (this.prisma as any).nightOrder.findMany({
      where: { companyId: scope.companyId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    }).catch(() => []);
    const today = saoPauloDateKey();
    const items = await Promise.all(orders.map(async (order: any) => {
      const delivery = await this.findDelivery(order.id, today);
      return { ...this.mapOrder(order), deliveredToday: Number(delivery?.quantity || 0) };
    }));
    return { generatedAt: new Date().toISOString(), items };
  }

  async getProgress(user: any, orderId: string) {
    const scope = this.resolveScope(user);
    const order = await this.findOwnedOrder(scope.companyId, orderId);
    const deliveries = await (this.prisma as any).nightOrderDelivery.findMany({
      where: { nightOrderId: order.id },
      orderBy: [{ reportDate: 'desc' }],
      take: 7,
    }).catch(() => []);
    const today = saoPauloDateKey();
    const todayDelivery = deliveries.find((delivery: any) => delivery.reportDate === today) || null;
    const leadIds = parseLeadIds(todayDelivery?.leadIdsJson);
    const leads = leadIds.length
      ? await (this.prisma as any).radarLeadPool.findMany({ where: { id: { in: leadIds } }, take: leadIds.length }).catch(() => [])
      : [];
    const byId = new Map(leads.map((lead: any) => [String(lead.id), lead]));
    return {
      order: this.mapOrder(order),
      today: {
        reportDate: today,
        delivered: Number(todayDelivery?.quantity || 0),
        dailyQuota: order.dailyQuota,
        quotaMet: Number(todayDelivery?.quantity || 0) >= order.dailyQuota,
        items: leadIds.map((id) => byId.get(id)).filter(Boolean).map((lead: any) => this.mapDeliveredLead(lead)),
      },
      recentNights: deliveries.map((delivery: any) => ({
        reportDate: delivery.reportDate,
        quantity: delivery.quantity,
      })),
    };
  }

  async setStatus(user: any, orderId: string, status: string) {
    const scope = this.resolveScope(user);
    const normalized = normalizeKey(status);
    if (!VALID_ORDER_STATUSES.includes(normalized)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }
    const order = await this.findOwnedOrder(scope.companyId, orderId);
    const updated = await (this.prisma as any).nightOrder.update({
      where: { id: order.id },
      data: { status: normalized },
    });
    return this.mapOrder(updated);
  }

  async fulfillForUser(user: any) {
    const scope = this.resolveScope(user);
    const summaries = await this.fulfillOpenOrders({ companyId: scope.companyId });
    return { ranAt: new Date().toISOString(), summaries };
  }

  // Cumpre encomendas abertas com o estoque já enriquecido do pool.
  // Dedupe por encomenda: lead entregue uma vez nunca repete em noites seguintes.
  async fulfillOpenOrders(options: { companyId?: number | null; now?: Date } = {}): Promise<NightOrderFulfillSummary[]> {
    if (!(await this.storageAvailable())) return [];
    const today = saoPauloDateKey(options.now || new Date());
    const orders = await (this.prisma as any).nightOrder.findMany({
      where: {
        status: 'open',
        ...(options.companyId ? { companyId: options.companyId } : {}),
      },
      orderBy: [{ updatedAt: 'asc' }],
      take: 50,
    }).catch(() => []);

    const summaries: NightOrderFulfillSummary[] = [];
    for (const order of orders) {
      try {
        summaries.push(await this.fulfillOrder(order, today));
      } catch (error) {
        this.logger.warn(`[night-order] fulfillment falhou order=${order.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return summaries;
  }

  private async fulfillOrder(order: any, today: string): Promise<NightOrderFulfillSummary> {
    const existingDelivery = await this.findDelivery(order.id, today);
    const deliveredToday = Number(existingDelivery?.quantity || 0);
    const remaining = Math.max(0, Number(order.dailyQuota || 0) - deliveredToday);
    if (!remaining) {
      return {
        orderId: order.id,
        segment: order.segment,
        deliveredNow: 0,
        deliveredToday,
        dailyQuota: order.dailyQuota,
        quotaMet: true,
      };
    }

    const alreadyDeliveredIds = await this.collectDeliveredLeadIds(order.id);
    const where: Record<string, any> = {
      status: { notIn: ORDER_BLOCKED_LEAD_STATUSES },
      normalizedSegment: order.normalizedSegment,
      OR: [{ companyId: null }, { companyId: order.companyId }],
      ...(alreadyDeliveredIds.size ? { id: { notIn: Array.from(alreadyDeliveredIds) } } : {}),
    };
    if (order.normalizedCity) where.normalizedCity = order.normalizedCity;
    if (order.requireEmail) where.emailStatus = { in: ['confirmed', 'probable'] };
    if (order.onlyWithoutWebsite) {
      where.AND = [{ OR: [{ website: null }, { websiteStatus: { in: NO_WEBSITE_STATUSES } }] }];
    }

    const candidates = await (this.prisma as any).radarLeadPool.findMany({
      where,
      orderBy: [{ emailConfidence: 'desc' }, { opportunityScore: 'desc' }, { updatedAt: 'desc' }],
      take: remaining * 3,
    }).catch(() => []);

    const picked = candidates
      // WhatsApp exigido = celular provável; confirmado de verdade só via Webwhats (MOTOR.md).
      .filter((lead: any) => !order.requireWhatsapp || hasLikelyMobile(lead.phoneDigits || lead.phone))
      .slice(0, remaining);

    if (!picked.length) {
      return {
        orderId: order.id,
        segment: order.segment,
        deliveredNow: 0,
        deliveredToday,
        dailyQuota: order.dailyQuota,
        quotaMet: deliveredToday >= order.dailyQuota,
      };
    }

    const mergedIds = [...parseLeadIds(existingDelivery?.leadIdsJson), ...picked.map((lead: any) => String(lead.id))];
    const stats = {
      emailsConfirmed: picked.filter((lead: any) => lead.emailStatus === 'confirmed').length,
      emailsProbable: picked.filter((lead: any) => lead.emailStatus === 'probable').length,
      withWebsite: picked.filter((lead: any) => Boolean(lead.website)).length,
    };

    await (this.prisma as any).nightOrderDelivery.upsert({
      where: { nightOrderId_reportDate: { nightOrderId: order.id, reportDate: today } },
      create: {
        nightOrderId: order.id,
        companyId: order.companyId,
        reportDate: today,
        quantity: mergedIds.length,
        leadIdsJson: JSON.stringify(mergedIds),
        statsJson: JSON.stringify(stats),
      },
      update: {
        quantity: mergedIds.length,
        leadIdsJson: JSON.stringify(mergedIds),
        statsJson: JSON.stringify(stats),
      },
    });
    await (this.prisma as any).nightOrder.update({
      where: { id: order.id },
      data: {
        deliveredTotal: Number(order.deliveredTotal || 0) + picked.length,
        lastDeliveryDate: today,
      },
    }).catch(() => null);

    const deliveredNowTotal = mergedIds.length;
    this.logger.log(`[night-order] order=${order.id} entregues_agora=${picked.length} hoje=${deliveredNowTotal}/${order.dailyQuota}`);
    return {
      orderId: order.id,
      segment: order.segment,
      deliveredNow: picked.length,
      deliveredToday: deliveredNowTotal,
      dailyQuota: order.dailyQuota,
      quotaMet: deliveredNowTotal >= order.dailyQuota,
    };
  }

  private async collectDeliveredLeadIds(orderId: string) {
    const rows = await (this.prisma as any).nightOrderDelivery.findMany({
      where: { nightOrderId: orderId },
      select: { leadIdsJson: true },
      take: 400,
    }).catch(() => []);
    const ids = new Set<string>();
    rows.forEach((row: any) => parseLeadIds(row.leadIdsJson).forEach((id) => ids.add(id)));
    return ids;
  }

  private async findDelivery(orderId: string, reportDate: string) {
    return (this.prisma as any).nightOrderDelivery.findUnique({
      where: { nightOrderId_reportDate: { nightOrderId: orderId, reportDate } },
    }).catch(() => null);
  }

  private async findOwnedOrder(companyId: number, orderId: string) {
    const order = await (this.prisma as any).nightOrder.findUnique({ where: { id: String(orderId || '') } }).catch(() => null);
    if (!order) throw new NotFoundException('Encomenda não encontrada.');
    if (Number(order.companyId) !== companyId) throw new ForbiddenException('Encomenda pertence a outra empresa.');
    return order;
  }

  private mapOrder(order: any) {
    return {
      id: order.id,
      segment: order.segment,
      city: order.city,
      state: order.state,
      requireEmail: Boolean(order.requireEmail),
      requireWhatsapp: Boolean(order.requireWhatsapp),
      onlyWithoutWebsite: Boolean(order.onlyWithoutWebsite),
      dailyQuota: order.dailyQuota,
      status: order.status,
      deliveredTotal: order.deliveredTotal,
      lastDeliveryDate: order.lastDeliveryDate || null,
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    };
  }

  private mapDeliveredLead(lead: any) {
    return {
      id: String(lead.id),
      name: lead.name,
      city: lead.city || lead.normalizedCity || null,
      state: lead.state || null,
      phone: lead.phone || lead.phoneDigits || null,
      email: lead.email || null,
      emailStatus: lead.emailStatus || 'missing',
      emailConfidence: Number(lead.emailConfidence || 0),
      website: lead.website || null,
      painType: lead.painType || null,
      painLabel: lead.painLabel || null,
      recommendedChannel: lead.recommendedChannel || null,
      opportunityScore: Number(lead.opportunityScore || 0),
    };
  }
}
