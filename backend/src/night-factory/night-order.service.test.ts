import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightOrderController } from './night-order.controller';
import { NightOrderService, saoPauloDateKey } from './night-order.service';

function createUser(overrides: Record<string, any> = {}) {
  return {
    id: 9,
    companyId: 7,
    company: { id: 7, name: 'HBX' },
    masterContext: { active: false },
    ...overrides,
  };
}

function createLead(index: number, overrides: Record<string, any> = {}) {
  return {
    id: `lead-${index}`,
    name: `Clinica ${index}`,
    phone: `1999999000${index}`,
    phoneDigits: `551999999000${index}`,
    city: 'Piracicaba',
    state: 'SP',
    normalizedCity: 'piracicaba',
    segment: 'clinica',
    normalizedSegment: 'clinica',
    status: 'clean',
    companyId: null,
    email: `contato@clinica${index}.com.br`,
    emailStatus: 'confirmed',
    emailConfidence: 90 - index,
    website: `https://clinica${index}.com.br`,
    websiteStatus: 'present',
    opportunityScore: 80 - index,
    updatedAt: new Date(Date.now() - index * 1000),
    ...overrides,
  };
}

function createPrisma(options: { leads?: any[]; orders?: any[]; deliveries?: any[] } = {}) {
  const leads = options.leads || [];
  const orders = [...(options.orders || [])];
  const deliveries = [...(options.deliveries || [])];
  let orderSeq = orders.length;
  let deliverySeq = deliveries.length;

  const matchesWhere = (lead: any, where: any) => {
    if (where.status?.notIn?.includes(String(lead.status || '').toLowerCase())) return false;
    if (where.normalizedSegment && lead.normalizedSegment !== where.normalizedSegment) return false;
    if (where.normalizedCity && lead.normalizedCity !== where.normalizedCity) return false;
    if (where.emailStatus?.in && !where.emailStatus.in.includes(lead.emailStatus)) return false;
    if (where.id?.notIn?.includes(lead.id)) return false;
    if (where.id?.in && !where.id.in.includes(lead.id)) return false;
    if (Array.isArray(where.OR)) {
      const orOk = where.OR.some((clause: any) => {
        if ('companyId' in clause) {
          return clause.companyId === null ? lead.companyId === null : lead.companyId === clause.companyId;
        }
        return false;
      });
      if (!orOk) return false;
    }
    return true;
  };

  const prisma: any = {
    hasTable: async (name: string) => ['NightOrder', 'NightOrderDelivery', 'RadarLeadPool'].includes(name),
    nightOrder: {
      create: async ({ data }: any) => {
        orderSeq += 1;
        const order = { id: `order-${orderSeq}`, deliveredTotal: 0, lastDeliveryDate: null, ...data };
        orders.push(order);
        return order;
      },
      findUnique: async ({ where }: any) => orders.find((order) =>
        (where.id && order.id === where.id) || (where.idempotencyKey && order.idempotencyKey === where.idempotencyKey),
      ) || null,
      findMany: async ({ where }: any = {}) => orders.filter((order) => {
        if (where?.status && order.status !== where.status) return false;
        if (where?.companyId && order.companyId !== where.companyId) return false;
        return true;
      }),
      update: async ({ where, data }: any) => {
        const order = orders.find((item) => item.id === where.id);
        if (order) Object.assign(order, data);
        return order;
      },
    },
    nightOrderDelivery: {
      findUnique: async ({ where }: any) => deliveries.find((delivery) =>
        delivery.nightOrderId === where.nightOrderId_reportDate.nightOrderId
        && delivery.reportDate === where.nightOrderId_reportDate.reportDate,
      ) || null,
      findMany: async ({ where }: any = {}) => deliveries.filter((delivery) =>
        !where?.nightOrderId || delivery.nightOrderId === where.nightOrderId,
      ),
      upsert: async ({ where, create, update }: any) => {
        const existing = deliveries.find((delivery) =>
          delivery.nightOrderId === where.nightOrderId_reportDate.nightOrderId
          && delivery.reportDate === where.nightOrderId_reportDate.reportDate,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        deliverySeq += 1;
        const delivery = { id: `delivery-${deliverySeq}`, ...create };
        deliveries.push(delivery);
        return delivery;
      },
    },
    radarLeadPool: {
      findMany: async ({ where, take }: any = {}) => leads
        .filter((lead) => matchesWhere(lead, where || {}))
        .slice(0, take || leads.length),
    },
    __orders: orders,
    __deliveries: deliveries,
  };
  return prisma;
}

test('controller de encomendas exige JwtAuthGuard', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, NightOrderController) || [];
  assert.equal(guards.includes(JwtAuthGuard), true);
});

test('create normaliza segmento, clampa quota e respeita idempotencyKey', async () => {
  const prisma = createPrisma();
  const service = new NightOrderService(prisma);

  const order = await service.create(createUser(), { segment: '  Clínica  ', dailyQuota: 9999, idempotencyKey: 'pedido-1' });
  assert.equal(order.segment, 'Clínica');
  assert.equal(order.dailyQuota, 100);
  assert.equal(order.status, 'open');

  const repeated = await service.create(createUser(), { segment: 'Outra coisa', idempotencyKey: 'pedido-1' });
  assert.equal(repeated.id, order.id);
  assert.equal(prisma.__orders.length, 1);
});

test('fulfillment entrega so leads com email valido do segmento e respeita quota', async () => {
  const leads = [
    createLead(1),
    createLead(2),
    createLead(3, { emailStatus: 'missing', email: null }),
    createLead(4, { normalizedSegment: 'oficina' }),
    createLead(5),
    createLead(6),
  ];
  const prisma = createPrisma({ leads });
  const service = new NightOrderService(prisma);
  await service.create(createUser(), { segment: 'clinica', dailyQuota: 3 });

  const summaries = await service.fulfillOpenOrders({ companyId: 7 });

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].deliveredNow, 3);
  assert.equal(summaries[0].quotaMet, true);
  const ids = JSON.parse(prisma.__deliveries[0].leadIdsJson);
  assert.equal(ids.length, 3);
  assert.ok(!ids.includes('lead-3'));
  assert.ok(!ids.includes('lead-4'));
});

test('fulfillment nao repete lead entre noites (dedupe por encomenda)', async () => {
  const leads = [createLead(1), createLead(2), createLead(3)];
  const prisma = createPrisma({ leads });
  const service = new NightOrderService(prisma);
  const order = await service.create(createUser(), { segment: 'clinica', dailyQuota: 2 });

  await service.fulfillOpenOrders({ companyId: 7, now: new Date('2026-06-11T05:00:00-03:00') });
  const night1 = JSON.parse(prisma.__deliveries[0].leadIdsJson);
  assert.equal(night1.length, 2);

  await service.fulfillOpenOrders({ companyId: 7, now: new Date('2026-06-12T05:00:00-03:00') });
  const night2Delivery = prisma.__deliveries.find((delivery: any) => delivery.reportDate === '2026-06-12');
  const night2 = JSON.parse(night2Delivery.leadIdsJson);
  assert.equal(night2.length, 1);
  assert.ok(!night1.includes(night2[0]));

  const stored = prisma.__orders.find((item: any) => item.id === order.id);
  assert.equal(stored.deliveredTotal, 3);
});

test('encomenda pausada nao recebe entrega e quota cheia nao duplica', async () => {
  const leads = [createLead(1), createLead(2)];
  const prisma = createPrisma({ leads });
  const service = new NightOrderService(prisma);
  const order = await service.create(createUser(), { segment: 'clinica', dailyQuota: 2 });

  await service.setStatus(createUser(), order.id, 'paused');
  const paused = await service.fulfillOpenOrders({ companyId: 7 });
  assert.equal(paused.length, 0);

  await service.setStatus(createUser(), order.id, 'open');
  await service.fulfillOpenOrders({ companyId: 7 });
  const again = await service.fulfillOpenOrders({ companyId: 7 });
  assert.equal(again[0].deliveredNow, 0);
  assert.equal(again[0].quotaMet, true);
});

test('usuario de outra empresa nao acessa a encomenda', async () => {
  const prisma = createPrisma();
  const service = new NightOrderService(prisma);
  const order = await service.create(createUser(), { segment: 'clinica' });

  await assert.rejects(
    () => service.getProgress(createUser({ companyId: 99, company: { id: 99 } }), order.id),
    /outra empresa/i,
  );
});

test('saoPauloDateKey gera chave YYYY-MM-DD', () => {
  assert.match(saoPauloDateKey(new Date('2026-06-12T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});
