import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadsBankService } from './leads-bank.service';

function createPrisma(options: {
  nationalTotal?: number;
  hasRfb?: boolean;
  hasPool?: boolean;
  activeCnpjs?: string[];
  rows?: any[];
  onNationalCount?: () => void;
  statsActiveTotal?: number | null;
  onStatsRead?: () => void;
} = {}) {
  const rows = options.rows || [];
  const active = new Set(options.activeCnpjs || []);
  return {
    hasTable: async (name: string) => name === 'CnpjPublicCompany'
      ? options.hasRfb !== false
      : name === 'CnpjBaseStats'
        ? options.statsActiveTotal !== undefined
        : name === 'RadarLeadPool'
          ? options.hasPool !== false
          : false,
    cnpjBaseStats: {
      findUnique: async ({ where }: any) => {
        assert.deepEqual(where?.group_key, { group: 'situacao', key: 'ativa' });
        options.onStatsRead?.();
        return options.statsActiveTotal == null ? null : { count: options.statsActiveTotal };
      },
    },
    cnpjPublicCompany: {
      count: async ({ where }: any) => {
        assert.equal(where?.situacao, 'ativa');
        options.onNationalCount?.();
        return options.nationalTotal ?? 6_068;
      },
      findMany: async ({ where }: any) => (where?.cnpj?.in || [])
        .filter((cnpj: string) => active.has(cnpj))
        .map((cnpj: string) => ({ cnpj })),
    },
    radarLeadPool: {
      findMany: async () => rows,
    },
  } as any;
}

test('expõe Total, Disponíveis e baseTotal como a mesma união exata e deduplicada', async () => {
  const activeCnpj = '11222333000181';
  const service = new LeadsBankService(createPrisma({
    activeCnpjs: [activeCnpj],
    rows: [
      { id: 'rfb-1', name: 'Já na RFB', metadataJson: JSON.stringify({ cnpj: activeCnpj }), createdAt: new Date() },
      { id: 'web-1', name: 'Exclusiva Motor', city: 'Campinas', state: 'SP', placeId: 'place-1', createdAt: new Date() },
      { id: 'web-dup', name: 'Duplicada', city: 'Campinas', state: 'SP', placeId: 'place-1', createdAt: new Date() },
    ],
  }));

  const result = await service.getLeadsBank();

  assert.equal(result.total, 6_069);
  assert.equal(result.universeTotal, 6_069);
  assert.equal(result.availableTotal, 6_069);
  assert.equal(result.baseTotal, 6_069);
  assert.equal(result.nationalActiveTotal, 6_068);
  assert.equal(result.poolExclusiveTotal, 1);
  assert.equal(result.unionExact, true);
});

test('sem pool operacional, o universo é a RFB ativa', async () => {
  const service = new LeadsBankService(createPrisma({ hasPool: false }));
  const result = await service.getLeadsBank();
  assert.equal(result.universeTotal, 6_068);
  assert.equal(result.poolExclusiveTotal, 0);
  assert.equal(result.available, true);
});

test('falha fechado quando a RFB está indisponível, sem inventar soma parcial', async () => {
  const service = new LeadsBankService(createPrisma({
    hasRfb: false,
    rows: [{ id: 'web-1', name: 'Exclusiva Motor', city: 'Campinas', state: 'SP', createdAt: new Date() }],
  }));
  const result = await service.getLeadsBank();
  assert.equal(result.total, null);
  assert.equal(result.availableTotal, null);
  assert.equal(result.unionExact, false);
  assert.equal(result.poolExclusiveTotal, null);
});

test('lead exclusivo novo incrementa imediatamente; apenas a contagem nacional usa cache', async () => {
  const rows: any[] = [];
  let countReads = 0;
  const service = new LeadsBankService(createPrisma({ rows, onNationalCount: () => { countReads += 1; } }));

  const before = await service.getLeadsBank();
  rows.push({ id: 'new', placeId: 'place-new', name: 'Nova do Motor', city: 'Campinas', state: 'SP', createdAt: new Date() });
  const after = await service.getLeadsBank();

  assert.equal(before.universeTotal, 6_068);
  assert.equal(after.universeTotal, 6_069);
  assert.equal(countReads, 1);
});

test('usa o agregado da carga RFB e não varre a tabela nacional quando a estatística existe', async () => {
  let statsReads = 0;
  let countReads = 0;
  const service = new LeadsBankService(createPrisma({
    statsActiveTotal: 28_000_000,
    onStatsRead: () => { statsReads += 1; },
    onNationalCount: () => { countReads += 1; },
  }));

  const result = await service.getLeadsBank();

  assert.equal(result.nationalActiveTotal, 28_000_000);
  assert.equal(result.universeTotal, 28_000_000);
  assert.equal(statsReads, 1);
  assert.equal(countReads, 0);
});

test('deduplica por qualquer alias e propaga a presença RFB para todo o componente', async () => {
  const activeCnpj = '11222333000181';
  const service = new LeadsBankService(createPrisma({
    nationalTotal: 28_000_000,
    activeCnpjs: [activeCnpj],
    rows: [
      {
        id: 'rfb',
        name: 'Empresa da Receita',
        city: 'Campinas',
        state: 'SP',
        placeId: 'place-rfb',
        website: 'https://rfb.example',
        metadataJson: JSON.stringify({ cnpj: activeCnpj }),
        createdAt: new Date(),
      },
      {
        id: 'motor-duplicate-rfb',
        name: 'Nome alternativo',
        city: 'Campinas',
        state: 'SP',
        website: 'https://www.rfb.example/contato',
        createdAt: new Date(),
      },
      {
        id: 'exclusive-with-place',
        name: 'Exclusiva',
        city: 'Campinas',
        state: 'SP',
        placeId: 'place-exclusive',
        website: 'https://exclusive.example',
        createdAt: new Date(),
      },
      {
        id: 'exclusive-with-site-only',
        name: 'Exclusiva nome alternativo',
        city: 'Campinas',
        state: 'SP',
        website: 'https://www.exclusive.example/sobre',
        createdAt: new Date(),
      },
    ],
  }));

  const result = await service.getLeadsBank();

  assert.equal(result.poolExclusiveTotal, 1);
  assert.equal(result.universeTotal, 28_000_001);
});
