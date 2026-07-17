import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from '../../webscraping.service';

const COMPANY_ID = 7;
const USER_ID = 11;
const RADAR_ID = 'radar-race-1';
const VENDAS_ID = 'vendas-race-1';

function baseRadarRow(overrides: Record<string, any> = {}) {
  return {
    id: RADAR_ID,
    companyStates: [],
    placeId: 'place-race-1',
    name: 'Empresa Corrida',
    phone: null,
    phoneDigits: null,
    email: null,
    website: null,
    address: null,
    rating: null,
    reviews: 0,
    city: 'Campinas',
    state: 'SP',
    segment: 'servicos',
    sourceUrl: 'https://fonte.example/empresa',
    status: 'clean',
    metadataJson: JSON.stringify({ sibling: { preserve: true } }),
    enrichmentJson: JSON.stringify({ siblingEnrichment: { preserve: true } }),
    ...overrides,
  };
}

function prepareDeliveryService(input: {
  prisma: any;
  vendasService: any;
  commercialUsageLimits?: any;
  missionEnqueue?: (payload: any) => Promise<any>;
}) {
  const service = new WebscrapingService(
    input.prisma,
    undefined,
    undefined,
    input.vendasService,
    undefined,
    input.commercialUsageLimits,
  ) as any;

  service.resolveContext = () => ({ companyId: COMPANY_ID, userId: USER_ID });
  service.assertSellerTeamPolicyAccess = async () => undefined;
  service.supportsRadarPersistence = async () => true;
  service.supportsRadarOwnershipPersistence = async () => false;
  service.isRadarProtectedStatus = () => false;
  service.resolveRadarWhatsappStatusForDelivery = async () => null;
  service.getTeamPolicyRequiredRadarChannels = async () => [];
  service.extractLeadQualityFromObject = () => ({ status: 'valid', reasons: [] });
  service.extractLeadQualityV2FromObject = () => null;
  service.isListDeliverableCard = () => true;
  service.classifyCardDelivery = () => ({
    deliveryProduct: 'list',
    visibilityTier: 'list_basic',
    billable: true,
    debitEligible: true,
  });
  service.isCardDeliveryEligibleForVendas = () => true;
  service.claimRadarLeadForCompany = async () => undefined;
  service.canUseRadarSmartLeadFields = async () => false;
  service.getRadarDeliveryOrchestrator = () => ({
    buildDeliveredState: ({ metadata, enrichment }: any) => ({
      metadataPatch: { deliveryMarker: 'sent_to_vendas' },
      enrichmentPatch: { deliveryMarker: 'sent_to_vendas' },
      jobs: [],
      metadata,
      enrichment,
    }),
  });
  service.getRadarPostDeliveryVendasUpdate = () => ({
    recordEnrichmentJobStates: async () => undefined,
  });
  service.recordRadarLeadEvent = async () => undefined;
  service.getMissionQueue = () => ({
    enqueueLocalDeepEnrichment: input.missionEnqueue || (async () => ({ enqueued: false, reason: 'already_completed' })),
  });
  service.enqueueRadarPostDeliveryAiSaneamento = () => undefined;
  service.materializeNucleoFromRadarLead = async () => undefined;
  service._bumpSegmentAffinity = async () => undefined;
  return service;
}

test('entrega propaga falha da transação de consolidação depois de criar e reservar o card', async () => {
  const transactionError = new Error('consolidacao explodiu');
  let imported = 0;
  let reserved = 0;
  let released = 0;
  const prisma = {
    radarLeadPool: {
      findUnique: async () => baseRadarRow(),
      update: async () => ({}),
    },
    radarLeadCompanyState: {
      upsert: async () => ({}),
    },
    $transaction: async () => {
      throw transactionError;
    },
  };
  const vendasService = {
    importWebscrapingLeadsForUser: async () => {
      imported += 1;
      return { ok: true, leads: [{ id: VENDAS_ID }] };
    },
  };
  const commercialUsageLimits = {
    assertSellerActiveCardSlots: async () => undefined,
    reserveLeadDeliveryCredit: async () => {
      reserved += 1;
      return { applied: true, debited: 1 };
    },
    releaseLeadDeliveryCredit: async () => {
      released += 1;
    },
  };
  const service = prepareDeliveryService({ prisma, vendasService, commercialUsageLimits });

  await assert.rejects(
    service.importRadarLeadToVendasForUser(
      { id: USER_ID, companyId: COMPANY_ID, role: 'ADMIN' },
      RADAR_ID,
      { debitOnImport: true },
    ),
    (error: any) => error === transactionError,
  );

  assert.equal(imported, 1, 'o card de Vendas já foi criado antes da consolidação');
  assert.equal(reserved, 1, 'o crédito já foi reservado antes da consolidação');
  assert.equal(released, 0, 'não libera crédito de um card já criado; o retry usa a mesma usageKey');
});

test('entrega converge dados locais frescos por vínculo tenant-safe e preserva metadata concorrente', async () => {
  const initialRow = baseRadarRow();
  const dbRadar: any = baseRadarRow();
  const state = { companyId: COMPANY_ID, radarLeadId: RADAR_ID, vendasLeadId: VENDAS_ID };
  const vendasCard: Record<string, any> = {
    id: VENDAS_ID,
    companyId: COMPANY_ID,
    email: null,
    phone: null,
    phoneNormalized: null,
    website: null,
    address: null,
    rating: null,
    reviews: 0,
  };
  let initialRead = true;
  let stateLinked = false;
  let casAttempt = 0;
  const poolUpdates: any[] = [];
  const vendasUpdates: any[] = [];
  const vendasFinds: any[] = [];
  let missionEnqueues = 0;

  const prisma = {
    radarLeadPool: {
      findUnique: async () => {
        if (initialRead) {
          initialRead = false;
          return structuredClone(initialRow);
        }
        return {
          ...structuredClone(dbRadar),
          companyStates: stateLinked ? [structuredClone(state)] : [],
        };
      },
      update: async ({ data }: any) => {
        poolUpdates.push(structuredClone(data));
        dbRadar.status = data.status || dbRadar.status;
        dbRadar.lastSeenAt = data.lastSeenAt || dbRadar.lastSeenAt;
        return structuredClone(dbRadar);
      },
      updateMany: async ({ where, data }: any) => {
        casAttempt += 1;
        if (casAttempt === 1) {
          // Outra finalização local vence depois da leitura fresca: o CAS deve reler, jamais
          // apagar esse bloco nem forçar uma nova passada do modelo.
          dbRadar.metadataJson = JSON.stringify({
            sibling: { preserve: true },
            localDeepEnrich: { missionId: 'mission-local-2', committedAt: '2026-07-16T23:59:00.000Z' },
          });
          return { count: 0 };
        }
        assert.equal(where.id, RADAR_ID);
        assert.equal(where.metadataJson, dbRadar.metadataJson);
        assert.equal(where.enrichmentJson, dbRadar.enrichmentJson);
        dbRadar.metadataJson = data.metadataJson;
        dbRadar.enrichmentJson = data.enrichmentJson;
        return { count: 1 };
      },
    },
    radarLeadCompanyState: {
      upsert: async ({ where, create, update }: any) => {
        assert.deepEqual(where.companyId_radarLeadId, { companyId: COMPANY_ID, radarLeadId: RADAR_ID });
        assert.equal(create.vendasLeadId, VENDAS_ID);
        assert.equal(update.vendasLeadId, VENDAS_ID);
        stateLinked = true;
        return structuredClone(state);
      },
    },
    leadContact: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.radarLeadId, RADAR_ID);
        assert.equal(where.kind, 'whatsapp');
        assert.equal(where.createdByMissionId, 'mission-local-2');
        assert.ok(where.valueNormalized.in.includes('19999990000'));
        return { id: 'contact-whatsapp-confirmed' };
      },
    },
    vendasLead: {
      findFirst: async (args: any) => {
        vendasFinds.push(structuredClone(args));
        return args?.where?.id === VENDAS_ID && args?.where?.companyId === COMPANY_ID
          ? { id: VENDAS_ID }
          : null;
      },
      updateMany: async (args: any) => {
        vendasUpdates.push(structuredClone(args));
        Object.assign(vendasCard, args.data);
        return { count: 1 };
      },
    },
    $transaction: async (operations: any[]) => Promise.all(operations),
  };
  const vendasService = {
    importWebscrapingLeadsForUser: async (_user: any, dto: any) => {
      assert.equal(dto.leads[0].email, undefined, 'a importação começou com o snapshot antigo');
      // Commit local termina antes de o vínculo tenant-safe existir. O writer atualiza o Radar,
      // mas ainda não consegue alcançar o card de Vendas.
      Object.assign(dbRadar, {
        email: 'contato@empresa.example',
        phone: '(19) 99999-0000',
        phoneDigits: '19999990000',
        website: 'https://empresa.example',
        address: 'Rua Teste, 123',
        rating: 4.8,
        reviews: 321,
        metadataJson: JSON.stringify({
          sibling: { preserve: true },
          localDeepEnrich: { missionId: 'mission-local-1' },
        }),
      });
      return { ok: true, leads: [{ id: VENDAS_ID }] };
    },
  };
  const service = prepareDeliveryService({
    prisma,
    vendasService,
    missionEnqueue: async () => {
      missionEnqueues += 1;
      return { enqueued: false, reason: 'already_completed' };
    },
  });

  const result = await service.importRadarLeadToVendasForUser(
    { id: USER_ID, companyId: COMPANY_ID, role: 'ADMIN' },
    RADAR_ID,
  );

  assert.equal(result.ok, true);
  assert.equal(result.vendasLeadId, VENDAS_ID);
  assert.equal(casAttempt, 2, 'a consolidação releu o Radar depois de detectar escrita concorrente');
  assert.ok(poolUpdates.every((data) => !Object.hasOwn(data, 'metadataJson') && !Object.hasOwn(data, 'enrichmentJson')));
  const finalMetadata = JSON.parse(dbRadar.metadataJson);
  assert.equal(finalMetadata.sibling.preserve, true);
  assert.equal(finalMetadata.localDeepEnrich.missionId, 'mission-local-2');
  assert.equal(finalMetadata.deliveryMarker, 'sent_to_vendas');

  assert.deepEqual(
    {
      email: vendasCard.email,
      phone: vendasCard.phone,
      phoneNormalized: vendasCard.phoneNormalized,
      website: vendasCard.website,
      address: vendasCard.address,
      rating: vendasCard.rating,
      reviews: vendasCard.reviews,
    },
    {
      email: 'contato@empresa.example',
      phone: '(19) 99999-0000',
      phoneNormalized: '19999990000',
      website: 'https://empresa.example',
      address: 'Rua Teste, 123',
      rating: 4.8,
      reviews: 321,
    },
  );
  assert.equal(vendasFinds.length, 1);
  assert.deepEqual(vendasFinds[0].where, { id: VENDAS_ID, companyId: COMPANY_ID });
  assert.ok(vendasUpdates.length >= 6);
  assert.ok(vendasUpdates.every((entry) => entry.where.id === VENDAS_ID && entry.where.companyId === COMPANY_ID));
  assert.equal(missionEnqueues, 1, 'mantém apenas o enqueue idempotente já existente após a entrega');
});
