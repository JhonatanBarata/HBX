import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarDuplicateFieldDonationService } from './radar-duplicate-field-donation.service';
import { RadarCoreQualityEnrichmentMixin } from './radar-core-quality-enrichment.mixin';
import { RadarRunItemFilterService } from '../02-filter/radar-run-item-filter.service';

// Fusão por campo no dedup web×receita (PR01072026/80): o duplicado DOA os campos
// vazios do sobrevivente antes de morrer como 'duplicate'. Fill-empty: nunca
// sobrescreve valor não-nulo. Proveniência mergedFrom na evidência. Falha no merge
// nunca derruba o save.

function normalizeForKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCompositeKey(row: { name?: string | null; city?: string | null; state?: string | null; segment?: string | null }) {
  return [
    normalizeForKey(row.name),
    normalizeForKey(row.city),
    String(row.state || '').trim().toUpperCase(),
    normalizeForKey(row.segment),
  ].join('|');
}

function rowMatches(row: any, where: Record<string, any>): boolean {
  return Object.entries(where || {}).every(([key, value]) => {
    if (key === 'OR') return Array.isArray(value) && value.some((clause) => rowMatches(row, clause));
    return String(row?.[key] ?? '') === String(value ?? '');
  });
}

function makeFakeDb(options: { runItems?: any[]; poolRows?: any[] } = {}) {
  const runItems = [...(options.runItems || [])];
  const poolRows = [...(options.poolRows || [])];
  const runItemUpdates: any[] = [];
  const poolUpdates: any[] = [];
  const created: any[] = [];
  const prisma = {
    webscrapingSearchRunItem: {
      findMany: async ({ where }: any) => runItems.filter((row) => rowMatches(row, where)),
      findFirst: async ({ where }: any) => runItems.find((row) => rowMatches(row, where)) || null,
      create: async ({ data }: any) => {
        const row = { id: `created-${created.length + 1}`, ...data };
        created.push(row);
        runItems.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runItems.find((item) => String(item.id) === String(where.id));
        if (!row) throw new Error(`run item ${where.id} nao encontrado`);
        runItemUpdates.push({ where, data });
        Object.assign(row, data);
        return row;
      },
    },
    radarLeadPool: {
      findFirst: async ({ where }: any) => poolRows.find((row) => rowMatches(row, where)) || null,
      update: async ({ where, data }: any) => {
        const row = poolRows.find((item) => String(item.id) === String(where.id));
        if (!row) throw new Error(`pool row ${where.id} nao encontrada`);
        poolUpdates.push({ where, data });
        Object.assign(row, data);
        return row;
      },
    },
  };
  return { prisma, runItems, poolRows, runItemUpdates, poolUpdates, created };
}

function makeLogger() {
  const warns: string[] = [];
  return { logger: { warn: (msg: string) => warns.push(msg) }, warns };
}

function webSurvivorRow(overrides: any = {}) {
  return {
    id: 'item-web-1',
    runId: 'run-1',
    placeId: 'gmaps:abc123',
    name: 'Pizza It',
    phone: '(64) 99999-0000',
    phoneDigits: '64999990000',
    website: 'https://pizzait.com.br',
    websiteKey: 'pizzait.com.br',
    address: null,
    city: 'Rio Verde',
    state: 'GO',
    segment: 'pizzaria',
    source: 'hbx_engine',
    status: 'found',
    rawJson: JSON.stringify({ name: 'Pizza It', website: 'https://pizzait.com.br', phone: '(64) 99999-0000' }),
    ...overrides,
  };
}

function receitaDuplicateResult(overrides: any = {}) {
  return {
    placeId: 'cnpj_public:11222333000181',
    name: 'PIZZA IT',
    phone: '64999990000',
    phoneDigits: '64999990000',
    website: null,
    email: 'contato@pizzait.com.br',
    address: 'Rua X, 100, Centro, Rio Verde, GO',
    cnpj: '11222333000181',
    legalName: 'PIZZA IT LTDA',
    cnae: '5611201',
    cnaeDescription: 'Restaurantes e similares',
    source: 'cnpj_public',
    evidenceJson: { cnpjPublic: { cnpj: '11222333000181', situacao: 'ativa' } },
    ...overrides,
  };
}

test('receita chega depois: web sobrevivente ganha cnpj/razao no rawJson; site intacto', async () => {
  const db = makeFakeDb({ runItems: [webSurvivorRow()] });
  const { logger, warns } = makeLogger();
  const service = new RadarDuplicateFieldDonationService();

  const result = await service.donate({
    prisma: db.prisma,
    logger,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'cnpj_public:11222333000181', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'Telefone repetido.',
  });

  assert.equal(result.survivorId, 'item-web-1');
  assert.ok(result.donatedFields.includes('cnpj'));
  assert.ok(result.donatedFields.includes('legalName'));
  assert.ok(result.donatedFields.includes('cnae'));
  assert.ok(result.donatedFields.includes('companySituation'));
  assert.ok(result.donatedFields.includes('email'));
  assert.ok(result.donatedFields.includes('address'));
  assert.equal(db.runItemUpdates.length, 1);
  const data = db.runItemUpdates[0].data;
  // Site do web intacto: doador nem tem website, e coluna nao entra no update.
  assert.equal(data.website, undefined);
  assert.equal(data.phone, undefined, 'fone valido do sobrevivente nunca e trocado');
  assert.equal(data.address, 'Rua X, 100, Centro, Rio Verde, GO');
  const raw = JSON.parse(data.rawJson);
  assert.equal(raw.cnpj, '11222333000181');
  assert.equal(raw.legalName, 'PIZZA IT LTDA');
  assert.equal(raw.companySituation, 'ativa');
  assert.equal(raw.website, 'https://pizzait.com.br', 'website do sobrevivente preservado no rawJson');
  assert.equal(warns.length, 0);
});

test('web chega depois: receita sobrevivente ganha website/instagram; cnpj intacto', async () => {
  const receitaSurvivor = webSurvivorRow({
    id: 'item-receita-1',
    placeId: 'cnpj_public:11222333000181',
    source: 'cnpj_public',
    website: null,
    websiteKey: null,
    address: 'Rua X, 100, Centro, Rio Verde, GO',
    rawJson: JSON.stringify({ name: 'PIZZA IT', cnpj: '11222333000181', legalName: 'PIZZA IT LTDA' }),
  });
  const db = makeFakeDb({ runItems: [receitaSurvivor] });
  const { logger, warns } = makeLogger();
  const service = new RadarDuplicateFieldDonationService();

  const webDuplicate = {
    placeId: 'gmaps:abc123',
    name: 'Pizza It',
    phone: '(64) 99999-0000',
    phoneDigits: '64999990000',
    website: 'https://pizzait.com.br',
    instagramUrl: 'https://instagram.com/pizzait',
    source: 'hbx_engine',
  };

  const result = await service.donate({
    prisma: db.prisma,
    logger,
    runId: 'run-1',
    duplicate: webDuplicate,
    classified: { placeId: 'gmaps:abc123', phoneDigits: '64999990000', websiteKey: 'pizzait.com.br' },
    duplicateReason: 'Telefone repetido.',
  });

  assert.equal(result.survivorId, 'item-receita-1');
  assert.ok(result.donatedFields.includes('website'));
  assert.ok(result.donatedFields.includes('instagramUrl'));
  assert.equal(db.runItemUpdates.length, 1);
  const data = db.runItemUpdates[0].data;
  assert.equal(data.website, 'https://pizzait.com.br');
  assert.equal(data.websiteKey, 'pizzait.com.br', 'websiteKey recalculado junto com a doacao do site');
  const raw = JSON.parse(data.rawJson);
  assert.equal(raw.instagramUrl, 'https://instagram.com/pizzait');
  assert.equal(raw.cnpj, '11222333000181', 'cnpj do sobrevivente intacto');
  assert.equal(raw.legalName, 'PIZZA IT LTDA', 'razao do sobrevivente intacta');
  assert.equal(warns.length, 0);
});

test('campo nao-nulo NUNCA sobrescrito: fone do web nao e trocado pelo frio da RFB', async () => {
  const survivor = webSurvivorRow({
    rawJson: JSON.stringify({
      name: 'Pizza It',
      website: 'https://pizzait.com.br',
      email: 'quente@pizzait.com.br',
      cnpj: '99887766000155',
    }),
  });
  const db = makeFakeDb({ runItems: [survivor] });
  const service = new RadarDuplicateFieldDonationService();

  const result = await service.donate({
    prisma: db.prisma,
    logger: null,
    runId: 'run-1',
    duplicate: receitaDuplicateResult({
      phone: '6433330000',
      phoneDigits: '6433330000',
      website: 'https://site-da-rfb.com.br',
      email: 'frio@rfb.gov.br',
    }),
    classified: { placeId: 'cnpj_public:11222333000181', phoneDigits: '6433330000', websiteKey: 'site-da-rfb.com.br' },
    duplicateReason: 'Nome, cidade, estado e segmento repetidos.',
    compositeKey: buildCompositeKey({ name: 'PIZZA IT', city: 'Rio Verde', state: 'GO', segment: 'pizzaria' }),
    buildRunCompositeKey: buildCompositeKey,
  });

  assert.equal(result.survivorId, 'item-web-1', 'lookup composite acha o sobrevivente recalculando a chave');
  assert.equal(db.runItemUpdates.length, 1);
  const data = db.runItemUpdates[0].data;
  assert.equal(data.phone, undefined, 'fone valido do web preservado');
  assert.equal(data.phoneDigits, undefined);
  assert.equal(data.website, undefined, 'website nao-nulo preservado');
  const raw = JSON.parse(data.rawJson);
  assert.equal(raw.email, 'quente@pizzait.com.br', 'email nao-nulo preservado');
  assert.equal(raw.cnpj, '99887766000155', 'cnpj ja existente preservado');
  assert.equal(raw.website, 'https://pizzait.com.br');
  // So o que estava vazio entrou.
  assert.ok(result.donatedFields.includes('legalName'));
  assert.ok(result.donatedFields.includes('address'));
  assert.ok(!result.donatedFields.includes('cnpj'));
  assert.ok(!result.donatedFields.includes('email'));
  assert.ok(!result.donatedFields.includes('phone'));
  assert.ok(!result.donatedFields.includes('website'));
});

test('mergedFrom gravado na evidencia do sobrevivente com proveniencia', async () => {
  const db = makeFakeDb({ runItems: [webSurvivorRow()] });
  const service = new RadarDuplicateFieldDonationService();

  await service.donate({
    prisma: db.prisma,
    logger: null,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'cnpj_public:11222333000181', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'Telefone repetido.',
  });

  const raw = JSON.parse(db.runItemUpdates[0].data.rawJson);
  assert.ok(Array.isArray(raw.mergedFrom));
  assert.equal(raw.mergedFrom.length, 1);
  assert.equal(raw.mergedFrom[0].source, 'cnpj_public');
  assert.equal(raw.mergedFrom[0].placeId, 'cnpj_public:11222333000181');
  assert.ok(Array.isArray(raw.mergedFrom[0].donatedFields));
  assert.ok(raw.mergedFrom[0].donatedFields.includes('cnpj'));
  assert.ok(raw.mergedFrom[0].mergedAt);
});

test('doacao com lookup falhando: nao propaga, warn logado', async () => {
  const { logger, warns } = makeLogger();
  const service = new RadarDuplicateFieldDonationService();
  const prisma = {
    webscrapingSearchRunItem: {
      findFirst: async () => {
        throw new Error('banco fora do ar');
      },
      findMany: async () => {
        throw new Error('banco fora do ar');
      },
      update: async () => {
        throw new Error('nao deveria chegar aqui');
      },
    },
  };

  const result = await service.donate({
    prisma,
    logger,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'cnpj_public:11222333000181', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'Telefone repetido.',
  });

  assert.equal(result.survivorId, null);
  assert.deepEqual(result.donatedFields, []);
  assert.ok(warns.some((w) => w.includes('[radar-fusao-dedup]') && w.includes('banco fora do ar')));
});

test('pool: doacao fill-empty nas colunas + metadataJson aditivo (padrao L4) + mergedFrom', async () => {
  const poolRow = {
    id: 'pool-1',
    placeId: 'gmaps:abc123',
    phoneDigits: '64999990000',
    website: 'https://pizzait.com.br',
    email: null,
    instagramUrl: null,
    facebookUrl: null,
    address: 'Av. Ja Tem, 10',
    socialStatus: 'missing',
    metadataJson: JSON.stringify({ targetType: 'pj', cnae: '9999999' }),
  };
  const db = makeFakeDb({ runItems: [webSurvivorRow()], poolRows: [poolRow] });
  const service = new RadarDuplicateFieldDonationService();

  const result = await service.donate({
    prisma: db.prisma,
    logger: null,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'cnpj_public:11222333000181', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'Telefone repetido.',
  });

  assert.ok(result.poolDonatedFields.includes('email'));
  assert.ok(result.poolDonatedFields.includes('metadata.cnpj'));
  assert.ok(result.poolDonatedFields.includes('metadata.razaoSocial'));
  assert.ok(!result.poolDonatedFields.includes('address'), 'address nao-nulo do pool preservado');
  assert.ok(!result.poolDonatedFields.includes('metadata.cnae'), 'cnae ja existente no metadata preservado');
  assert.equal(db.poolUpdates.length, 1);
  const data = db.poolUpdates[0].data;
  assert.equal(data.email, 'contato@pizzait.com.br');
  assert.equal(data.website, undefined, 'website nao-nulo do pool preservado');
  assert.equal(data.address, undefined);
  const metadata = JSON.parse(data.metadataJson);
  assert.equal(metadata.targetType, 'pj', 'metadata existente preservado (aditivo)');
  assert.equal(metadata.cnae, '9999999');
  assert.equal(metadata.cnpj, '11222333000181');
  assert.equal(metadata.razaoSocial, 'PIZZA IT LTDA');
  assert.equal(metadata.companySituation, 'ativa');
  assert.ok(Array.isArray(metadata.mergedFrom));
  assert.equal(metadata.mergedFrom[0].source, 'cnpj_public');
});

test('pool: doa fone quando pool esta sem fone valido e digitos estao livres', async () => {
  const survivor = webSurvivorRow({ phone: '', phoneDigits: '' });
  const poolTarget = {
    id: 'pool-1',
    placeId: 'gmaps:abc123',
    phoneDigits: null,
    phone: null,
    website: null,
    email: null,
    address: null,
    metadataJson: null,
  };
  const db = makeFakeDb({ runItems: [survivor], poolRows: [poolTarget] });
  const service = new RadarDuplicateFieldDonationService();

  const result = await service.donate({
    prisma: db.prisma,
    logger: null,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'gmaps:abc123', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'placeId repetido.',
  });

  assert.equal(result.survivorId, 'item-web-1');
  assert.ok(result.donatedFields.includes('phone'), 'sobrevivente sem fone valido recebe o fone do descartado');
  assert.ok(result.poolDonatedFields.includes('phone'));
  const data = db.poolUpdates[0].data;
  assert.equal(data.phoneDigits, '64999990000');
});

test('pool: fone NAO doado quando outra linha do pool ja e dona dos digitos (unique)', async () => {
  const survivor = webSurvivorRow({ phone: '', phoneDigits: '' });
  const poolTarget = {
    id: 'pool-1',
    placeId: 'gmaps:abc123',
    phoneDigits: null,
    phone: null,
    website: null,
    email: null,
    address: null,
    metadataJson: null,
  };
  const poolOwnerOfDigits = {
    id: 'pool-2',
    placeId: 'gmaps:outro',
    phoneDigits: '64999990000',
  };
  const db = makeFakeDb({ runItems: [survivor], poolRows: [poolTarget, poolOwnerOfDigits] });
  const service = new RadarDuplicateFieldDonationService();

  const result = await service.donate({
    prisma: db.prisma,
    logger: null,
    runId: 'run-1',
    duplicate: receitaDuplicateResult(),
    classified: { placeId: 'gmaps:abc123', phoneDigits: '64999990000', websiteKey: '' },
    duplicateReason: 'placeId repetido.',
  });

  assert.equal(result.survivorId, 'item-web-1');
  assert.ok(!result.poolDonatedFields.includes('phone'), 'digitos ja pertencem a outra linha do pool');
  assert.ok(result.poolDonatedFields.includes('email'), 'demais campos seguem doados');
});

// ---------------------------------------------------------------------------
// Integração: wiring real dentro do saveSearchRunResults (mixin) — o duplicado
// continua persistido como 'duplicate' (auditoria) e o save nunca cai por causa
// da doação.
// ---------------------------------------------------------------------------

function makeSaveInstance(db: ReturnType<typeof makeFakeDb>, options: { donationService?: any } = {}) {
  const instance: any = new (RadarCoreQualityEnrichmentMixin as any)();
  const warns: string[] = [];
  instance.logger = {
    log: () => undefined,
    warn: (msg: string) => warns.push(msg),
  };
  instance.prisma = db.prisma;
  instance.getRadarRunItemFilter = () => new RadarRunItemFilterService();
  instance.buildRadarRunItemFilterHost = () => ({
    isBlockedLeadOfficialWebsite: () => false,
    requiredChannelsForInput: () => [],
    hasUsablePublicContactChannel: (candidate: any) => Boolean(
      String(candidate.phone || candidate.phoneDigits || '').trim()
      || candidate.website
      || candidate.email
      || candidate.instagramUrl
      || candidate.facebookUrl,
    ),
    buildSyntheticRunPlaceId: (runId: string, _result: any, index: number) => `radar:${runId}:${index}`,
    buildRunCompositeKey: (row: any) => instance.buildRunCompositeKey(row),
  });
  instance.getRadarWebSourceGate = () => ({ evaluate: () => ({ passed: true, reason: null }) });
  instance.getRadarQualityGate = () => ({ evaluate: () => ({ deliverable: true, reason: null }) });
  instance.buildRadarQualityGateHost = () => ({});
  instance.getRadarSharedNormalizer = () => ({
    parseMaybeJsonObject: (value: any) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  });
  instance.extractLeadQualityFromObject = () => null;
  instance.extractLeadQualityV2FromObject = () => null;
  instance.evaluateResultQualityForInput = () => ({ status: 'approved', billable: true, reasons: [] });
  instance.getCandidateQualityV2 = () => null;
  instance.shouldApplyQualityV2Gate = () => false;
  instance.getResultSegmentForRejected = () => null;
  instance.classifyRunRejectionMetric = () => 'rejectedGenericName';
  instance.recordSourceQualityFromRunItems = async () => undefined;
  instance.updateSearchRunMetrics = async () => undefined;
  instance.getRadarDuplicateFieldDonation = () => options.donationService || new RadarDuplicateFieldDonationService();
  return { instance, warns };
}

const saveNormalized = {
  city: 'Rio Verde',
  state: 'GO',
  segment: 'pizzaria',
  quantity: 10,
  targetType: 'pj',
  normalizedCity: 'rio verde',
  normalizedSegment: 'pizzaria',
} as any;

test('saveSearchRunResults: receita duplicada doa cnpj ao web sobrevivente e segue persistida como duplicate', async () => {
  const db = makeFakeDb({ runItems: [webSurvivorRow()] });
  const { instance } = makeSaveInstance(db);

  const counts = await instance.saveSearchRunResults(
    { companyId: 1 },
    saveNormalized,
    'run-1',
    [receitaDuplicateResult()],
    'cnpj_public',
  );

  assert.equal(counts.duplicate, 1, 'duplicado continua contado como duplicate');
  assert.equal(db.created.length, 1, 'duplicado continua persistido (auditoria)');
  assert.equal(db.created[0].status, 'duplicate');
  assert.equal(db.created[0].duplicateReason, 'Telefone repetido.');
  // Doação aconteceu ANTES da persistência do duplicado.
  assert.equal(db.runItemUpdates.length, 1);
  assert.equal(String(db.runItemUpdates[0].where.id), 'item-web-1');
  const raw = JSON.parse(db.runItemUpdates[0].data.rawJson);
  assert.equal(raw.cnpj, '11222333000181');
  assert.ok(Array.isArray(raw.mergedFrom));
});

test('saveSearchRunResults: doacao explodindo nao derruba o save — duplicado persiste, warn logado', async () => {
  const db = makeFakeDb({ runItems: [webSurvivorRow()] });
  const { instance, warns } = makeSaveInstance(db, {
    donationService: {
      donate: async () => {
        throw new Error('doacao explodiu');
      },
    },
  });

  const counts = await instance.saveSearchRunResults(
    { companyId: 1 },
    saveNormalized,
    'run-1',
    [receitaDuplicateResult()],
    'cnpj_public',
  );

  assert.equal(counts.duplicate, 1);
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].status, 'duplicate');
  assert.ok(warns.some((w) => w.includes('[radar-fusao-dedup]') && w.includes('doacao explodiu')));
});

test('saveSearchRunResults: lookup do banco falhando dentro do servico — save segue normal', async () => {
  const db = makeFakeDb({ runItems: [webSurvivorRow()] });
  const originalFindFirst = db.prisma.webscrapingSearchRunItem.findFirst;
  db.prisma.webscrapingSearchRunItem.findFirst = async () => {
    throw new Error('lookup caiu');
  };
  const { instance, warns } = makeSaveInstance(db);

  const counts = await instance.saveSearchRunResults(
    { companyId: 1 },
    saveNormalized,
    'run-1',
    [receitaDuplicateResult()],
    'cnpj_public',
  );

  db.prisma.webscrapingSearchRunItem.findFirst = originalFindFirst;
  assert.equal(counts.duplicate, 1);
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].status, 'duplicate');
  assert.equal(db.runItemUpdates.length, 0, 'nenhuma doacao aplicada quando o lookup falha');
  assert.ok(warns.some((w) => w.includes('[radar-fusao-dedup]') && w.includes('lookup caiu')));
});
