import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarTreeStatusService } from './radar-tree-status.service';

// ─── Fake PrismaService (só as formas de query que o serviço usa) ──────────────────────────────
type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gte' in cond && !(value instanceof Date && value.getTime() >= cond.gte.getTime())) return false;
      if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function createFakePrisma(data: {
  searchRuns?: Row[];
  cnpjPublicCompanies?: Row[];
  searchRunItems?: Row[];
  radarLeadPool?: Row[];
  missingTables?: string[];
} = {}) {
  const searchRuns = data.searchRuns || [];
  const cnpjPublicCompanies = data.cnpjPublicCompanies || [];
  const searchRunItems = data.searchRunItems || [];
  const radarLeadPool = data.radarLeadPool || [];
  const missingTables = new Set(data.missingTables || []);

  return {
    hasTable: async (name: string) => !missingTables.has(name),
    webscrapingSearchRun: {
      count: async ({ where }: any = {}) => searchRuns.filter((row) => matchesWhere(row, where || {})).length,
    },
    cnpjPublicCompany: {
      count: async () => cnpjPublicCompanies.length,
    },
    webscrapingSearchRunItem: {
      count: async ({ where }: any = {}) => searchRunItems.filter((row) => matchesWhere(row, where || {})).length,
    },
    radarLeadPool: {
      count: async ({ where }: any = {}) => radarLeadPool.filter((row) => matchesWhere(row, where || {})).length,
      findMany: async ({ where, take }: any = {}) => {
        const matched = radarLeadPool.filter((row) => matchesWhere(row, where || {}));
        return take ? matched.slice(0, take) : matched;
      },
    },
  } as any;
}

function withEnv(name: string, value: string | undefined, fn: () => Promise<void>) {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return fn().finally(() => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  });
}

const noopExternal = {
  web: async () => ({ alive: 3, ceiling: 20 }),
  missions: async () => ({ supported: true, paused: false, byStageStatus: [], lag: { queuedDue: 0, oldestQueuedAgeMs: 0 } }),
  vault: async () => ({ ok: true, sources: [] }),
  zapGate: () => ({ breakerState: 'closed' as const }),
};

test('RadarTreeStatusService.build: tolera bloco Prisma quebrado sem derrubar os outros', async () => {
  const prisma = createFakePrisma();
  // força o count de webscrapingSearchRun a explodir — só o bloco "seed" deve virar ok:false
  prisma.webscrapingSearchRun.count = async () => { throw new Error('conexao caiu'); };
  const service = new RadarTreeStatusService(prisma);

  const result = await service.build(noopExternal);

  assert.equal(result.seed.ok, false);
  if (result.seed.ok === false) assert.match(result.seed.error, /conexao caiu/);
  // os outros blocos seguem de pe
  assert.equal(result.rfb.ok, true);
  assert.equal(result.web.ok, true);
  assert.equal(result.missions.ok, true);
  assert.equal(result.vault.ok, true);
  assert.equal(result.zapGate.ok, true);
});

test('RadarTreeStatusService.build: bloco externo (web) quebrado nao derruba os blocos Prisma', async () => {
  const prisma = createFakePrisma();
  const service = new RadarTreeStatusService(prisma);

  const result = await service.build({
    ...noopExternal,
    web: async () => { throw new Error('engine pool indisponivel'); },
  });

  assert.equal(result.web.ok, false);
  if (result.web.ok === false) assert.match(result.web.error, /engine pool indisponivel/);
  assert.equal(result.rfb.ok, true);
  assert.equal(result.seed.ok, true);
});

test('RadarTreeStatusService.build: bloco sincrono (zapGate) quebrado vira ok:false sem lancar', async () => {
  const prisma = createFakePrisma();
  const service = new RadarTreeStatusService(prisma);

  const result = await service.build({
    ...noopExternal,
    zapGate: () => { throw new Error('disjuntor indisponivel'); },
  });

  assert.equal(result.zapGate.ok, false);
  if (result.zapGate.ok === false) assert.match(result.zapGate.error, /disjuntor indisponivel/);
});

test('RadarTreeStatusService.readRfb: reflete HBX_RADAR_CNPJ_PUBLIC_ENABLED pinado (isolamento de env)', async () => {
  await withEnv('HBX_RADAR_CNPJ_PUBLIC_ENABLED', 'true', async () => {
    const prisma = createFakePrisma({ cnpjPublicCompanies: [{}, {}, {}] });
    const service = new RadarTreeStatusService(prisma);
    const result = await service.build(noopExternal);
    assert.equal(result.rfb.ok, true);
    if (result.rfb.ok) {
      assert.equal(result.rfb.data.enabled, true);
      assert.equal(result.rfb.data.totalCompanies, 3);
    }
  });

  await withEnv('HBX_RADAR_CNPJ_PUBLIC_ENABLED', undefined, async () => {
    const prisma = createFakePrisma({ cnpjPublicCompanies: [{}] });
    const service = new RadarTreeStatusService(prisma);
    const result = await service.build(noopExternal);
    assert.equal(result.rfb.ok, true);
    if (result.rfb.ok) assert.equal(result.rfb.data.enabled, false);
  });
});

test('RadarTreeStatusService: bloco gates aproxima aceitos/rejeitados via WebscrapingSearchRunItem', async () => {
  const now = new Date();
  const prisma = createFakePrisma({
    searchRunItems: [
      { status: 'found', createdAt: now },
      { status: 'found', createdAt: now },
      { status: 'skipped', createdAt: now },
      { status: 'invalid', createdAt: now },
      { status: 'duplicate', createdAt: now }, // nem aceito nem rejeitado nessa aproximacao
    ],
  });
  const service = new RadarTreeStatusService(prisma);
  const result = await service.build(noopExternal);

  assert.equal(result.gates.ok, true);
  if (result.gates.ok) {
    assert.equal(result.gates.data.accepted, 2);
    assert.equal(result.gates.data.rejected, 2);
    assert.equal(result.gates.data.approx, true);
  }
});

test('RadarTreeStatusService: bloco fusion conta cards com 2+ sourceEngines', async () => {
  const now = new Date();
  const prisma = createFakePrisma({
    radarLeadPool: [
      { createdAt: now, sourceEngines: JSON.stringify(['cnpj_public', 'hbx_engine']) }, // fundido
      { createdAt: now, sourceEngines: JSON.stringify(['hbx_engine']) },
      { createdAt: now, sourceEngines: '[]' },
    ],
  });
  const service = new RadarTreeStatusService(prisma);
  const result = await service.build(noopExternal);

  assert.equal(result.fusion.ok, true);
  if (result.fusion.ok) {
    assert.equal(result.fusion.data.cardsToday, 3);
    assert.equal(result.fusion.data.fusedToday, 1);
    assert.equal(result.fusion.data.fusionPct, Math.round((1 / 3) * 1000) / 10);
  }
});

test('RadarTreeStatusService: bloco card faz split de sourceChain (rfb+web / web / rfb)', async () => {
  const now = new Date();
  const prisma = createFakePrisma({
    radarLeadPool: [
      { status: 'sent_to_vendas', updatedAt: now, sourceEngines: JSON.stringify(['cnpj_public', 'hbx_engine']), source: null },
      { status: 'sent_to_vendas', updatedAt: now, sourceEngines: JSON.stringify(['hbx_engine']), source: null },
      { status: 'sent_to_vendas', updatedAt: now, sourceEngines: JSON.stringify(['cnpj_public']), source: null },
      { status: 'sent_to_vendas', updatedAt: now, sourceEngines: '[]', source: null }, // unmapped
    ],
  });
  const service = new RadarTreeStatusService(prisma);
  const result = await service.build(noopExternal);

  assert.equal(result.card.ok, true);
  if (result.card.ok) {
    assert.equal(result.card.data.deliveredToday, 4);
    assert.deepEqual(result.card.data.split, { rfb_web: 1, web: 1, rfb: 1, unmapped: 1 });
  }
});

test('RadarTreeStatusService: tabela ausente (worktree sem migration) degrada pra zero, nao lanca', async () => {
  const prisma = createFakePrisma({ missingTables: ['RadarLeadPool', 'CnpjPublicCompany', 'WebscrapingSearchRun'] });
  const service = new RadarTreeStatusService(prisma);
  const result = await service.build(noopExternal);

  assert.equal(result.rfb.ok, true);
  if (result.rfb.ok) assert.equal(result.rfb.data.totalCompanies, 0);
  assert.equal(result.card.ok, true);
  if (result.card.ok) assert.equal(result.card.data.deliveredToday, 0);
  assert.equal(result.fusion.ok, true);
  if (result.fusion.ok) assert.equal(result.fusion.data.cardsToday, 0);
});
