import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjBaseQueryService } from './cnpj-base-query.service';

type MockRow = Record<string, any>;

function makeMockPrisma(opts: {
  companies?: MockRow[];
  count?: number;
  radarLeadRows?: MockRow[];
  leadContactRows?: MockRow[];
  cnaeRows?: MockRow[];
  statsRows?: MockRow[];
  hasTables?: Record<string, boolean>;
  captureWhere?: (where: any) => void;
} = {}) {
  const hasTables = opts.hasTables ?? {
    CnpjPublicCompany: true,
    RadarLeadPool: true,
    LeadContact: true,
    CnpjPublicCnae: true,
    CnpjBaseStats: true,
  };
  // Mock minimamente sensível a where.cnpj.in/notIn — o suficiente pra testar a composição
  // exclude+enrichment sem reimplementar um query engine (filtros de negócio ficam ingênuos,
  // só cnpj é honrado).
  const applyCnpjFilter = (rows: MockRow[], where: any) => {
    if (!where || !where.cnpj) return rows;
    let out = rows;
    if (where.cnpj.in) out = out.filter((r) => where.cnpj.in.includes(r.cnpj));
    if (where.cnpj.notIn) out = out.filter((r) => !where.cnpj.notIn.includes(r.cnpj));
    return out;
  };
  return {
    hasTable: async (name: string) => Boolean(hasTables[name]),
    cnpjPublicCompany: {
      count: async ({ where }: any) => {
        opts.captureWhere?.(where);
        if (opts.count != null) return opts.count;
        return applyCnpjFilter(opts.companies || [], where).length;
      },
      findMany: async ({ where }: any) => {
        opts.captureWhere?.(where);
        return applyCnpjFilter(opts.companies || [], where);
      },
    },
    radarLeadPool: {
      findMany: async () => opts.radarLeadRows || [],
    },
    leadContact: {
      findMany: async () => opts.leadContactRows || [],
    },
    cnpjPublicCnae: {
      findMany: async () => opts.cnaeRows || [],
    },
    cnpjBaseStats: {
      findMany: async () => opts.statsRows || [],
    },
  } as any;
}

const baseRow: MockRow = {
  cnpj: '11222333000181',
  razaoSocial: 'Pizzaria Teste LTDA',
  nomeFantasia: 'Pizzaria Teste',
  cnae: '5611-2/03',
  cnaeDescription: 'Lanchonetes',
  porte: 'ME',
  situacao: 'ativa',
  matrizFilial: 'matriz',
  capitalSocial: '15000',
  naturezaJuridica: '206-2',
  simples: true,
  mei: false,
  city: 'Fortaleza',
  state: 'CE',
  phone: '85992617022',
  phone2: null,
  email: 'contato@pizzaria.com',
  website: null,
  openedAt: new Date('2020-01-10'),
  firstSeenAt: new Date('2026-06-01'),
  phoneShareCount: 1,
  emailShareCount: 1,
  phoneDigits: '5585992617022',
};

test('query: state/city entram no WHERE (índice composto usado primeiro)', async () => {
  let capturedWhere: any = null;
  const prisma = makeMockPrisma({
    companies: [baseRow],
    captureWhere: (where) => { capturedWhere = where; },
  });
  const service = new CnpjBaseQueryService(prisma);
  await service.query({ cities: ['fortaleza'], states: ['CE'], limit: 20 });
  assert.equal(capturedWhere.state.in[0], 'CE');
  assert.equal(capturedWhere.normalizedCity.in[0], 'fortaleza');
});

test('query: devolve count + amostra com selo de qualidade', async () => {
  const prisma = makeMockPrisma({ companies: [baseRow], count: 42 });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.query({ limit: 20 });
  assert.equal(result.count, 42);
  assert.equal(result.sample.length, 1);
  assert.equal(result.sample[0].cnpj, baseRow.cnpj);
  // 85992617022 -> local 11 dígitos, 3º dígito '9' => celular provável (sem whatsapp validado no mock)
  assert.equal(result.sample[0].selo, 'celular_provavel');
});

test('query: anti-contador — phoneShareCount alto vira selo provavel_contador', async () => {
  const rowContador = { ...baseRow, phoneShareCount: 40 };
  const prisma = makeMockPrisma({ companies: [rowContador], count: 1 });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.query({ limit: 20, contato: { maxPhoneShare: 3 } });
  assert.equal(result.sample[0].selo, 'provavel_contador');
});

test('query: blocklist de e-mail de contador marca selo mesmo com share baixo', async () => {
  const rowContadorEmail = { ...baseRow, email: 'financeiro@escritoriocontabil.com.br', phoneShareCount: 1 };
  const prisma = makeMockPrisma({ companies: [rowContadorEmail], count: 1 });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.query({ limit: 20 });
  assert.equal(result.sample[0].selo, 'provavel_contador');
});

test('query: whatsapp validado (LeadContact) tem prioridade sobre celular_provavel', async () => {
  // valueNormalized/phoneDigits no banco já vêm SEM o prefixo 55 (normalizePhoneDigits aplicado
  // na escrita) — mesmo formato que a leitura usa pra comparar.
  const prisma = makeMockPrisma({
    companies: [baseRow],
    count: 1,
    leadContactRows: [{ valueNormalized: '85992617022' }],
  });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.query({ limit: 20 });
  assert.equal(result.sample[0].selo, 'whatsapp_validado');
});

test('query: excluirJaEntregues exclui cnpj com phoneDigits já em RadarLeadPool', async () => {
  const prisma = makeMockPrisma({
    companies: [baseRow],
    count: 1,
    radarLeadRows: [{ phoneDigits: '85992617022' }],
  });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.query({ limit: 20, excluirJaEntregues: true });
  assert.equal(result.excludedJaEntregues, 1);
});

// Filtros de presença digital (temInstagram/notaIAMin/semPresencaDigital/temWhatsAppValidado
// como CORTE de contagem) foram REMOVIDOS do query builder (correção de escopo 02/07, ordem do
// dono: "não oferecer filtro que o motor não entrega depois"). CnpjPublicCompany (base fria RFB,
// import-cnpj-dataset.js) nunca popula website/instagram/nota-IA — são OUTPUT do enriquecimento
// (RadarLeadPool), não filtro da base fria dos 28M. O selo de qualidade (whatsapp_validado/
// celular_provavel/fixo/provavel_contador) continua — é informativo na amostra, não corta o count.

test('query: regime é aceito no input mas NUNCA filtra (fase 2 RFB, coluna sempre NULL hoje)', async () => {
  let capturedWhere: any = null;
  const prisma = makeMockPrisma({
    companies: [baseRow],
    captureWhere: (where) => { capturedWhere = where; },
  });
  const service = new CnpjBaseQueryService(prisma);
  await service.query({ limit: 20, regime: 'lucro_real' });
  assert.equal(capturedWhere.regimeTributario, undefined);
});

test('query: tabela CnpjPublicCompany ausente -> ServiceUnavailableException', async () => {
  const prisma = makeMockPrisma({ hasTables: { CnpjPublicCompany: false } });
  const service = new CnpjBaseQueryService(prisma);
  await assert.rejects(() => service.query({}));
});

test('searchCities: distinct normalizedCity+state, query curta devolve vazio', async () => {
  const prisma = makeMockPrisma({});
  const service = new CnpjBaseQueryService(prisma);
  const short = await service.searchCities('f');
  assert.deepEqual(short.items, []);
});

test('searchCnaes: código numérico usa startsWith no catálogo', async () => {
  const prisma = makeMockPrisma({ cnaeRows: [{ codigo: '5611-2/03', descricao: 'Lanchonetes' }] });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.searchCnaes('5611');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].codigo, '5611-2/03');
});

test('getStats: agrupa por group, nunca faz GROUP BY ao vivo (só lê CnpjBaseStats)', async () => {
  const prisma = makeMockPrisma({
    statsRows: [
      { group: 'porte', key: 'ME', label: 'ME', count: 100, updatedAt: new Date('2026-07-01') },
      { group: 'porte', key: 'MEI', label: 'MEI', count: 200, updatedAt: new Date('2026-07-01') },
    ],
  });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.getStats();
  assert.equal(result.groups.porte.length, 2);
  assert.equal(result.groups.porte[0].count, 100);
});

test('materialize: sem LeadHarvestImportService injetado -> ServiceUnavailableException', async () => {
  const prisma = makeMockPrisma({ companies: [baseRow], count: 1 });
  const service = new CnpjBaseQueryService(prisma);
  await assert.rejects(() => service.materialize({ id: 1 }, {}));
});

test('materialize: chama LeadHarvestImportService com leads mapeados da CnpjPublicCompany', async () => {
  const prisma = makeMockPrisma({ companies: [baseRow], count: 1 });
  let capturedBody: any = null;
  const fakeImportService: any = {
    importBatchForUser: async (_user: any, body: any) => {
      capturedBody = body;
      return { batchId: body.batchId, counts: { accepted: 1, duplicates: 0, rejected: 0 } };
    },
  };
  const service = new CnpjBaseQueryService(prisma, fakeImportService);
  const result = await service.materialize({ id: 1, email: 'dono@hbx.com' }, { limit: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.requested, 1);
  assert.equal(capturedBody.leads[0].externalId, `cnpj:${baseRow.cnpj}`);
  assert.equal(capturedBody.leads[0].sourceProvider, 'cnpj_base_query');
});

// ─── VENDAS-REFAB S3 — countBase (count puro sobre a base 28M, sem amostra) ───────────────────
// Ambiente local NÃO tem os 28M carregados (só ~893 no pool RadarLeadPool) — estes testes provam
// a LÓGICA do count via mock do Prisma (N arbitrário), nunca um número fixo. A validação do
// número real (28M) é do dono na VPS após publish (CLAUDE.md: nunca inventar número).

test('countBase: conta a CnpjPublicCompany real filtrada (mock N), nao o pool', async () => {
  let capturedWhere: any = null;
  const prisma = makeMockPrisma({
    count: 6068, // N arbitrário só pra provar que o valor vem do count() da base, nao inventado
    captureWhere: (where) => { capturedWhere = where; },
  });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.countBase({ cities: ['fortaleza'], states: ['CE'] });
  assert.equal(result.available, true);
  assert.equal(result.count, 6068);
  assert.equal(capturedWhere.state.in[0], 'CE');
  assert.equal(capturedWhere.normalizedCity.in[0], 'fortaleza');
});

test('countBase: tabela CnpjPublicCompany ausente -> available false, count null (nunca lanca)', async () => {
  const prisma = makeMockPrisma({ hasTables: { CnpjPublicCompany: false } });
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.countBase({});
  assert.equal(result.available, false);
  assert.equal(result.count, null);
});

test('countBase: falha no count() da base -> available true, count null (degrade gracioso)', async () => {
  const prisma = makeMockPrisma({});
  prisma.cnpjPublicCompany.count = async () => { throw new Error('conexao caiu'); };
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.countBase({});
  assert.equal(result.available, true);
  assert.equal(result.count, null);
});

test('countBase: nunca usa amostra/query() — so chama count(), sem findMany', async () => {
  let findManyCalled = false;
  const prisma = makeMockPrisma({ count: 100 });
  const originalFindMany = prisma.cnpjPublicCompany.findMany;
  prisma.cnpjPublicCompany.findMany = async (...args: any[]) => { findManyCalled = true; return originalFindMany(...args); };
  const service = new CnpjBaseQueryService(prisma);
  const result = await service.countBase({ cnaes: ['5611203'] });
  assert.equal(result.count, 100);
  assert.equal(findManyCalled, false);
});
