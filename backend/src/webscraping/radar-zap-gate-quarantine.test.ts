import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from './webscraping.service';

// Etapa 7 + porta 8 (árvore mestra 02/07, docs/PLANEJAMENTOS/PR02072026/W2-ia7b-etapa7-zapgate-porta8.md;
// porta 8 REESCRITA 03/07, docs/PLANEJAMENTOS/PR03072026/C2-zapgate-le-e-sinaliza-nunca-bloqueia.md):
// cobre a quarentena pré-estoque (persistRadarLeadPoolBatch) e o resolvedor de sinal de WhatsApp
// da entrega (resolveRadarWhatsappStatusForDelivery + applyRadarWhatsappStatusSignalToRow) — nunca
// bloqueia mais, só lê e sinaliza. Mesmo padrão de fixture de `webscraping.service.test.ts`
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


// ── Zap-gate porta 8 (resolveRadarWhatsappStatusForDelivery) ─────────────────────────
// REESCRITO 03/07 (decisão do dono): NADA bloqueia por WhatsApp. O motor só LÊ e SINALIZA —
// resolve o whatsappStatus verdadeiro do card; a entrega acontece SEMPRE.

test('zap-gate: exists:false ENTREGA com sinal missing, nunca bloqueia (sem flag de gate, sem legado)', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((n) => ({
    input: n,
    normalizedNumber: n,
    exists: false,
  }));
  const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
  assert.equal(result, 'missing');
});

test('zap-gate: numero SEM whatsapp (exists:false) resolve missing', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((n) => ({
    input: n,
    normalizedNumber: n,
    exists: false,
  }));
  const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
  assert.equal(result, 'missing');
});

test('zap-gate: numero COM whatsapp confirmado resolve confirmed', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((n) => ({
    input: n,
    normalizedNumber: n,
    exists: true,
  }));
  const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
  assert.equal(result, 'confirmed');
});

test('zap-gate: checker indisponivel (motor fora do ar, degrada p/ []) resolve unverified (fail-open)', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.radarCheckWhatsappNumbers = async () => []; // mesmo degrade de radarCheckWhatsappNumbers real
  const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
  assert.equal(result, 'unverified');
});

test('zap-gate: erro/timeout no check resolve unverified e NAO lanca (fail-open, nunca derruba a entrega)', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.radarCheckWhatsappNumbers = async () => {
    throw new Error('timeout do motor');
  };
  await assert.doesNotReject(async () => {
    const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: '19999990001' });
    assert.equal(result, 'unverified');
  });
});

test('zap-gate: ja confirmed em cache (enrichmentJson) resolve confirmed e pula a checagem viva', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  let called = false;
  service.radarCheckWhatsappNumbers = async () => { called = true; return []; };
  const result = await service.resolveRadarWhatsappStatusForDelivery({
    id: 'lead-1',
    phoneDigits: '19999990001',
    enrichmentJson: JSON.stringify({ whatsappStatus: 'confirmed' }),
  });
  assert.equal(result, 'confirmed');
  assert.equal(called, false);
});

test('zap-gate: sem telefone no card nao checa (retorna existente/null)', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  let called = false;
  service.radarCheckWhatsappNumbers = async () => { called = true; return []; };
  const result = await service.resolveRadarWhatsappStatusForDelivery({ id: 'lead-1', phoneDigits: null, phone: null });
  assert.equal(result, null);
  assert.equal(called, false);
});

test('zap-gate: claim valida ate 3 telefones em lote e nunca trata rfb_fax como WhatsApp', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const checked: string[] = [];
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => {
    checked.push(...numbers);
    return numbers.map((number) => ({ input: number, normalizedNumber: number, exists: number.endsWith('1') }));
  };
  const row: any = {
    id: 'lead-3x3',
    phoneDigits: '19999990001',
    metadataJson: JSON.stringify({
      phones: [
        { value: '19999990001', source: 'rfb_primary' },
        { value: '1933330002', source: 'rfb_secondary' },
        { value: '1933330003', source: 'rfb_fax' },
      ],
    }),
    enrichmentJson: '{}',
    contacts: [
      { kind: 'phone', value: '19999990001', source: 'rfb_primary' },
      { kind: 'phone', value: '1933330002', source: 'rfb_secondary' },
      { kind: 'phone', value: '1933330003', source: 'rfb_fax' },
    ],
  };
  const result = await service.resolveRadarWhatsappStatusForDelivery(row, 7);
  assert.equal(result, 'confirmed');
  assert.deepEqual(checked, ['19999990001', '1933330002']);
  assert.deepEqual(JSON.parse(row.metadataJson).phonesWhatsapp, {
    '19999990001': true,
    '1933330002': false,
  });
});

test('whatsapp only_valid legado vira enrich e nunca filtra telefone/lead', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  service.webwhatsBridge = {};
  service.radarCheckWhatsappNumbers = async (numbers: string[]) => numbers.map((number) => ({
    input: number,
    normalizedNumber: number,
    exists: false,
  }));
  const response = await service.applyRadarWhatsappCheck(
    { companyId: 7, userId: 11 },
    [{ id: 'a', phone: '19999990001' }, { id: 'b', phone: '19999990002' }],
    'only_valid',
  );
  assert.equal(response.items.length, 2);
  assert.equal(response.meta.effectiveMode, 'enrich');
  assert.deepEqual(response.items.map((item: any) => item.whatsappStatus), ['missing', 'missing']);
});

test('applyRadarWhatsappStatusSignalToRow: aplica missing seta whatsappStatus no enrichmentJson/metadataJson', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const row: any = { id: 'lead-1', enrichmentJson: JSON.stringify({}), metadataJson: JSON.stringify({}) };
  service.applyRadarWhatsappStatusSignalToRow(row, 'missing');
  assert.equal(JSON.parse(row.enrichmentJson).whatsappStatus, 'missing');
  assert.equal(JSON.parse(row.metadataJson).whatsappStatus, 'missing');
  assert.equal(row.whatsappStatus, 'missing');
});

test('applyRadarWhatsappStatusSignalToRow: aplicar missing num row ja confirmed NAO rebaixa', async () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const row: any = {
    id: 'lead-1',
    enrichmentJson: JSON.stringify({ whatsappStatus: 'confirmed' }),
    metadataJson: JSON.stringify({ whatsappStatus: 'confirmed' }),
  };
  service.applyRadarWhatsappStatusSignalToRow(row, 'missing');
  assert.equal(JSON.parse(row.enrichmentJson).whatsappStatus, 'confirmed');
  assert.equal(JSON.parse(row.metadataJson).whatsappStatus, 'confirmed');
  assert.equal(row.whatsappStatus, undefined);
});
