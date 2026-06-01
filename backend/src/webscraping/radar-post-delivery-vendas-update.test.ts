import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';

const context = { companyId: 7, userId: 9, user: {} } as any;

function createPrismaMock(overrides: Record<string, any> = {}) {
  const updates: any[] = [];
  const timelineEvents: any[] = [];
  return {
    updates,
    timelineEvents,
    radarLeadCompanyState: {
      findUnique: async () => ({ vendasLeadId: 'vendas-1' }),
    },
    vendasLead: {
      findUnique: async () => overrides.currentLead || {
        id: 'vendas-1',
        email: null,
        website: null,
        address: null,
        rating: null,
        reviews: 0,
        shortNote: null,
        nextAction: null,
      },
      update: async (input: any) => {
        updates.push(input);
        return { id: input.where.id, ...input.data };
      },
    },
    vendasLeadTimelineEvent: {
      findMany: async (input: any) => timelineEvents
        .filter((event) => event.leadId === input.where.leadId && event.sourceType === input.where.sourceType)
        .filter((event) => {
          if (input.where.eventType?.in) return input.where.eventType.in.includes(event.eventType);
          if (input.where.eventType) return event.eventType === input.where.eventType;
          return true;
        })
        .filter((event) => input.where.resultLabel ? event.resultLabel === input.where.resultLabel : true)
        .map((event) => ({ id: event.id || event.eventType, eventType: event.eventType })),
      createMany: async (input: any) => {
        timelineEvents.push(...input.data);
        return { count: input.data.length };
      },
      create: async (input: any) => {
        timelineEvents.push(input.data);
        return input.data;
      },
    },
    ...overrides,
  };
}

test('post-delivery update complementa Vendas sem sobrescrever dado existente', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const prisma = createPrismaMock({
    currentLead: {
      id: 'vendas-1',
      email: 'existente@empresa.com.br',
      website: null,
      address: null,
      rating: 4.1,
      reviews: 10,
      shortNote: null,
      nextAction: null,
    },
  });
  const result = await service.syncAfterRadarEnrichment({
    prisma,
    context,
    row: { id: 'radar-1', companyStates: [{ vendasLeadId: 'vendas-1' }] },
    data: {
      email: 'novo@empresa.com.br',
      website: 'https://empresa.com.br',
      address: 'Rua Um, 123',
      rating: 4.6,
      reviews: 41,
      instagramUrl: 'https://instagram.com/empresa',
      emailStatus: 'confirmed',
      whatsappStatus: 'probable',
      opportunityReason: 'Tem site, mas o atendimento pode melhorar.',
      recommendedChannel: 'whatsapp',
      nextBestAction: 'chamar_no_whatsapp',
      websiteStatus: 'present',
    },
    compactEnrichment: { source: 'radar' },
  });

  assert.equal(result.status, 'completed');
  assert.equal(prisma.updates.length, 1);
  assert.equal(prisma.updates[0].data.email, undefined);
  assert.equal(prisma.updates[0].data.website, 'https://empresa.com.br');
  assert.equal(prisma.updates[0].data.address, 'Rua Um, 123');
  assert.equal(prisma.updates[0].data.rating, 4.6);
  assert.equal(prisma.updates[0].data.reviews, 41);
  assert.equal(prisma.updates[0].data.nextAction, 'chamar_no_whatsapp');
  assert.equal(prisma.timelineEvents.some((event: any) => event.eventType === 'radar_social_found'), true);
  assert.equal(prisma.timelineEvents.some((event: any) => event.eventType === 'radar_email_found'), true);
  assert.equal(prisma.timelineEvents.some((event: any) => event.eventType === 'radar_whatsapp_probable'), true);
  assert.equal(prisma.timelineEvents.some((event: any) => event.eventType === 'radar_opportunity_detected'), true);
  assert.equal(prisma.timelineEvents.some((event: any) => event.eventType === 'radar_site_analyzed'), true);
  assert.equal(prisma.timelineEvents.some((event: any) => event.sourceType === 'radar_enrichment'), true);
});

test('post-delivery update retorna retryable quando Vendas falha', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const prisma = createPrismaMock({
    vendasLead: {
      findUnique: async () => ({ id: 'vendas-1' }),
      update: async () => {
        throw new Error('Vendas indisponivel');
      },
    },
  });
  const result = await service.syncAfterRadarEnrichment({
    prisma,
    context,
    row: { id: 'radar-1', companyStates: [{ vendasLeadId: 'vendas-1' }] },
    data: { website: 'https://empresa.com.br' },
  });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.retryable, true);
  assert.match(String(result.error), /Vendas indisponivel/);
});

test('post-delivery update sem Vendas vinculado fica skipped', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const prisma = createPrismaMock({
    radarLeadCompanyState: { findUnique: async () => ({ vendasLeadId: null }) },
  });
  const result = await service.syncAfterRadarEnrichment({
    prisma,
    context,
    row: { id: 'radar-1', companyStates: [] },
    data: { email: 'contato@empresa.com.br' },
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.retryable, false);
  assert.equal(result.reason, 'vendas_lead_nao_vinculado');
});

test('post-delivery update resolve Vendas por rawJson ou telefone do run item', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const direct = await service.resolveVendasLeadId({
    prisma: createPrismaMock({
      radarLeadCompanyState: { findUnique: async () => ({ vendasLeadId: null }) },
    }),
    context,
    row: {
      id: 'run-item-1',
      rawJson: JSON.stringify({ vendasLeadId: 'vendas-direto' }),
    },
  });
  const byPhone = await service.resolveVendasLeadId({
    prisma: createPrismaMock({
      radarLeadCompanyState: { findUnique: async () => ({ vendasLeadId: null }) },
      vendasLead: {
        findUnique: async (input: any) => (
          input.where.companyId_phoneNormalized.phoneNormalized === '19999990001'
            ? { id: 'vendas-telefone' }
            : null
        ),
        update: async () => null,
      },
    }),
    context,
    row: {
      id: 'run-item-2',
      phone: '(19) 99999-0001',
      rawJson: JSON.stringify({ deliveryStatus: 'delivered' }),
    },
  });

  assert.equal(direct, 'vendas-direto');
  assert.equal(byPhone, 'vendas-telefone');
});

test('post-delivery status de enriquecimento nao duplica evento', async () => {
  const service = new RadarPostDeliveryVendasUpdateService();
  const prisma = createPrismaMock();
  const input = {
    prisma,
    context,
    row: { id: 'radar-1', companyStates: [{ vendasLeadId: 'vendas-1' }] },
    status: 'processing' as const,
    payload: { reason: 'completando_redes_site_email' },
  };

  await service.recordEnrichmentStatus(input);
  await service.recordEnrichmentStatus(input);

  assert.equal(prisma.timelineEvents.length, 1);
  assert.equal(prisma.timelineEvents[0].eventType, 'radar_enrichment');
  assert.equal(prisma.timelineEvents[0].resultLabel, 'processing');
});

test('post-delivery Vendas update fica isolado em 05-delivery', () => {
  const service = readFileSync(join(process.cwd(), 'src/webscraping/radar/05-delivery/radar-post-delivery-vendas-update.service.ts'), 'utf8');
  const presentation = readFileSync(join(process.cwd(), 'src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts'), 'utf8');

  assert.equal(/vendasLeadTimelineEvent\.create|vendasLead\.update/.test(service), true);
  assert.equal(/vendasLeadTimelineEvent\.create|vendasLead\.update/.test(presentation), false);
  assert.equal(/importedCount/.test(service), false);
});
