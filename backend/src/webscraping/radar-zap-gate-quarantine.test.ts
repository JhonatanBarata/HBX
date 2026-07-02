import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from './webscraping.service';

// Etapa 7 + porta 8 (árvore mestra 02/07, docs/PLANEJAMENTOS/PR02072026/W2-ia7b-etapa7-zapgate-porta8.md):
// cobre a quarentena pré-estoque (persistRadarLeadPoolBatch) e o zap-gate da entrega
// (enforceRadarZapGateForDelivery). Mesmo padrão de fixture de `webscraping.service.test.ts`
// (createPrisma simplificado, service instanciado direto sem Nest DI).

function createPrisma(overrides?: Record<string, any>) {
  return {
    hasTable: async () => true,
    hasColumn: async () => true,
    company: {
      findUnique: async () => ({
        id: 7,
        isActive: true,
        onboardingStatus: 'active_paid',
        paymentStatus: 'PAID',
        subscriptionStatus: 'active',
      }),
    },
    webscrapingSearchHistory: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'history-1' }),
      delete: async () => null,
    },
    webscrapingUsageLog: {
      count: async () => 0,
      create: async () => ({ id: 'usage-1' }),
    },
    webscrapingGlobalCacheEntry: {
      findUnique: async () => null,
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      upsert: async () => ({ id: 'global-cache-1' }),
      delete: async () => null,
    },
    ...(overrides || {}),
  } as any;
}

function withEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

// ── Quarentena pré-estoque (persistRadarLeadPoolBatch) ──────────────────────────────

test('quarentena: card da FABRICA (hbx_mass_data) com nota IA <=3 ja salva NAO promove pra clean', async () => {
  const saved: any[] = [];
  const existing = {
    id: 'radar-quarentena-1',
    status: 'clean',
    phoneDigits: '19999990002',
    metadataJson: JSON.stringify({ aiSaneamento: { nota: 2, razao: 'Nome generico de diretorio' } }),
  };
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => existing,
      create: async ({ data }: any) => { saved.push(data); return { id: 'radar-quarentena-1', ...data }; },
      update: async ({ where, data }: any) => { saved.push(data); return { id: where.id, ...data }; },
    },
  })) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    freshness: 'live',
  });

  const counts = await service.persistRadarLeadPoolBatch(normalized, [{
    name: 'Barbearia X',
    phone: '(19) 99999-0002',
    phoneDigits: '19999990002',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx_scraping:free_pj',
  }], 'hbx_mass_data', {});

  assert.equal(counts.savedCount, 1);
  assert.equal(saved[0].status, 'rejected');
  assert.equal(saved[0].rejectionReason, 'ai_score_low');
});

test('quarentena: mesma nota baixa NAO afeta a lane sincrona do cliente (sourceEngine hbx)', async () => {
  const saved: any[] = [];
  const existing = {
    id: 'radar-cliente-1',
    status: 'clean',
    phoneDigits: '19999990003',
    metadataJson: JSON.stringify({ aiSaneamento: { nota: 1, razao: 'lixo' } }),
  };
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => existing,
      create: async ({ data }: any) => { saved.push(data); return { id: 'radar-cliente-1', ...data }; },
      update: async ({ where, data }: any) => { saved.push(data); return { id: where.id, ...data }; },
    },
  })) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    freshness: 'live',
  });

  const counts = await service.persistRadarLeadPoolBatch(normalized, [{
    name: 'Barbearia X',
    phone: '(19) 99999-0003',
    phoneDigits: '19999990003',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx_scraping:free_pj',
  }], 'hbx', {});

  assert.equal(counts.savedCount, 1);
  // lane do cliente (sourceEngine='hbx') nunca é alvo da quarentena — status normal.
  assert.notEqual(saved[0].rejectionReason, 'ai_score_low');
});

test('quarentena: card novo da fabrica SEM nota IA ainda (primeira vez) promove normal pra clean', async () => {
  const saved: any[] = [];
  const service = new WebscrapingService(createPrisma({
    radarLeadCompanyState: {},
    radarLeadPool: {
      findFirst: async () => null,
      create: async ({ data }: any) => { saved.push(data); return { id: 'radar-novo-1', ...data }; },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  })) as any;
  const normalized = service.normalizeSearchInput({
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    freshness: 'live',
  });

  const counts = await service.persistRadarLeadPoolBatch(normalized, [{
    name: 'Barbearia Nova',
    phone: '(19) 99999-0004',
    phoneDigits: '19999990004',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
    source: 'hbx_scraping:free_pj',
  }], 'hbx_mass_data', {});

  assert.equal(counts.savedCount, 1);
  assert.equal(saved[0].status, 'clean');
});

// ── Zap-gate porta 8 (enforceRadarZapGateForDelivery) ────────────────────────────────

test('zap-gate: flag OFF (HBX_RADAR_ZAP_GATE_REQUIRED=false) nunca bloqueia — rollback barato', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'false', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    service.radarCheckWhatsappNumbers = async () => {
      throw new Error('nao deveria ser chamado com a flag off');
    };
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result.blocked, false);
  });
});

test('zap-gate: numero SEM whatsapp (exists:false) BLOQUEIA a entrega', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((n) => ({
      input: n,
      normalizedNumber: n,
      exists: false,
    }));
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result.blocked, true);
    assert.ok(result.message);
  });
});

test('zap-gate: numero COM whatsapp confirmado libera a entrega', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((n) => ({
      input: n,
      normalizedNumber: n,
      exists: true,
    }));
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result.blocked, false);
  });
});

test('zap-gate: checker indisponivel (motor fora do ar, degrada p/ []) NAO bloqueia (fail-open)', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    service.radarCheckWhatsappNumbers = async () => []; // mesmo degrade de radarCheckWhatsappNumbers real
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result.blocked, false);
  });
});

test('zap-gate: erro/timeout no check NAO bloqueia (fail-open, nunca derruba a entrega)', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    service.radarCheckWhatsappNumbers = async () => {
      throw new Error('timeout do motor');
    };
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result.blocked, false);
  });
});

test('zap-gate: ja confirmed em cache (enrichmentJson) pula a checagem viva', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    let called = false;
    service.radarCheckWhatsappNumbers = async () => { called = true; return []; };
    const result = await service.enforceRadarZapGateForDelivery({
      id: 'lead-1',
      phoneDigits: '19999990001',
      enrichmentJson: JSON.stringify({ whatsappStatus: 'confirmed' }),
    });
    assert.equal(result.blocked, false);
    assert.equal(called, false);
  });
});

test('zap-gate: sem telefone no card nunca bloqueia (nada pra checar)', async () => {
  await withEnv('HBX_RADAR_ZAP_GATE_REQUIRED', 'true', async () => {
    const service = new WebscrapingService(createPrisma()) as any;
    const result = await service.enforceRadarZapGateForDelivery({ id: 'lead-1', phoneDigits: null, phone: null });
    assert.equal(result.blocked, false);
  });
});
