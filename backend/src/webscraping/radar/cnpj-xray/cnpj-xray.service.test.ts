import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjXrayService, estimateCnpjXrayCost } from './cnpj-xray.service';

const VALID_1 = '11222333000181';
const VALID_2 = '11444777000161';

function makeFakePrisma(options: { hasXray?: boolean; companies?: any[] } = {}) {
  const jobs: any[] = [];
  const calls: string[] = [];
  const companies = options.companies || [];
  const fake = {
    _jobs: jobs,
    _calls: calls,
    async hasTable(name: string) {
      calls.push(`hasTable:${name}`);
      return name === 'CnpjXrayJob' ? options.hasXray !== false : false;
    },
    cnpjXrayJob: {
      async create({ data }: any) {
        calls.push('cnpjXrayJob.create');
        const row = { id: `job_${jobs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        jobs.push(row);
        return row;
      },
      async update({ where, data }: any) {
        calls.push('cnpjXrayJob.update');
        const row = jobs.find((item) => item.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      async findUnique({ where }: any) { return jobs.find((item) => item.id === where.id) || null; },
      async findMany({ take }: any) { return jobs.slice(0, take || 50); },
    },
    cnpjPublicCompany: {
      async findUnique({ where }: any) {
        calls.push('cnpjPublicCompany.findUnique');
        return companies.find((company) => company.cnpj === where.cnpj) || null;
      },
    },
    cnpjPublicPartner: {
      async findMany() {
        calls.push('cnpjPublicPartner.findMany');
        return [];
      },
    },
  };
  return fake as any;
}

function makeService(prisma: any) {
  const service = new CnpjXrayService(prisma);
  (service as any).writeXlsx = async (jobId: string) => ({ fileName: `${jobId}.xlsx`, filePath: `${jobId}.xlsx` });
  return service;
}

async function waitForJob(prisma: any) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline && prisma._jobs[0]?.status !== 'done' && prisma._jobs[0]?.status !== 'error') {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return prisma._jobs[0];
}

test('estimativa possui somente a camada cadastral', () => {
  const estimate = estimateCnpjXrayCost(20);
  assert.deepEqual(estimate.perLayer.map((layer) => layer.layer), ['cadastral']);
});

test('start sem migration fica indisponivel', async () => {
  const service = makeService(makeFakePrisma({ hasXray: false }));
  const result = await service.start({ cnpjs: [VALID_1] });
  assert.equal(result.started, false);
  assert.equal((result as any).reason, 'xray_indisponivel_migration_ausente');
});

test('start recusa lista vazia e lote sem CNPJ valido', async () => {
  const service = makeService(makeFakePrisma());
  assert.equal((await service.start({ cnpjs: [] })).started, false);
  const invalid = await service.start({ cnpjs: ['00000000000000', 'lixo'] });
  assert.equal(invalid.started, false);
  assert.equal((invalid as any).reason, 'nenhum_cnpj_valido');
});

test('lote deduplica CNPJ e persiste somente a camada cadastral', async () => {
  const prisma = makeFakePrisma({
    companies: [
      { cnpj: VALID_1, razaoSocial: 'ACME UM LTDA', city: 'Fortaleza', state: 'CE' },
      { cnpj: VALID_2, razaoSocial: 'ACME DOIS LTDA', city: 'Fortaleza', state: 'CE' },
    ],
  });
  const result = await makeService(prisma).start({ cnpjs: [VALID_1, VALID_2, VALID_1] });
  assert.equal(result.started, true);
  if (result.started) {
    assert.equal(result.validCount, 2);
    assert.equal(result.invalidCount, 1);
  }
  const job = await waitForJob(prisma);
  assert.equal(job.status, 'done');
  assert.equal(job.layers, JSON.stringify(['cadastral']));
  assert.equal(Object.prototype.hasOwnProperty.call(job, 'missionsQueued'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(job, 'aiDone'), false);
});

test('P0: Cnpj Xray nao faz fetch, crawl, materializacao, IA ou RadarMission pre-pull', async () => {
  const prisma = makeFakePrisma({
    companies: [{
      cnpj: VALID_1,
      razaoSocial: 'ACME UM LTDA',
      nomeFantasia: 'ACME',
      phone: '85999998888',
      phone2: '8533334444',
      email: 'contato@acme.test',
      fax: '8533339999',
      city: 'Fortaleza',
      state: 'CE',
    }],
  });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error('fetch proibido no Xray');
  }) as typeof fetch;
  try {
    const result = await makeService(prisma).start({ cnpjs: [VALID_1] });
    assert.equal(result.started, true);
    const job = await waitForJob(prisma);
    assert.equal(job.status, 'done');
    assert.equal(fetchCount, 0);
    assert.equal(prisma._calls.some((call: string) => /radarLeadPool|radarMission|leadContact/i.test(call)), false);
    assert.deepEqual(Array.from(new Set(prisma._calls.filter((call: string) => !call.startsWith('hasTable')))), [
      'cnpjXrayJob.create',
      'cnpjXrayJob.update',
      'cnpjPublicCompany.findUnique',
      'cnpjPublicPartner.findMany',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
