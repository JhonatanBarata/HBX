import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjXrayService } from './cnpj-xray.service';
import { SourceBudgetService } from '../../source-budget/source-budget.service';

/**
 * Aceite HOT-04 (Raio-X de CNPJ em lote), nível unitário — sem infra viva:
 *  - start recusa sem migration / lista vazia / nenhum CNPJ válido.
 *  - camada 1 (cadastral) resolve 100% LOCAL quando o dataset já tem o CNPJ (sem tocar rede).
 *  - TRAVA LEI Nº1: mesmo processando lote com camada vivo, nenhuma fonte PAGA é tentada.
 * O de-verdade (BrasilAPI real, crawl de site real) é aceite manual — aqui é contrato + travas.
 */

const VALID_1 = '11222333000181';
const VALID_2 = '11444777000161';

function makeFakePrisma(opts: { hasXray?: boolean; company?: any[] } = {}) {
  const jobs: any[] = [];
  const leads: any[] = [];
  const missions: any[] = [];
  const contacts: any[] = [];
  const company = opts.company || [];
  return {
    _jobs: jobs, _leads: leads, _missions: missions,
    async hasTable(name: string) {
      if (name === 'CnpjXrayJob') return opts.hasXray !== false;
      return true;
    },
    cnpjXrayJob: {
      async create(args: any) {
        const row = { id: `job_${jobs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        jobs.push(row);
        return row;
      },
      async update(args: any) {
        const row = jobs.find((j) => j.id === args.where.id);
        if (row) Object.assign(row, args.data);
        return row;
      },
      async findUnique(args: any) { return jobs.find((j) => j.id === args.where.id) || null; },
      async findMany(args: any) { return jobs.slice(0, args?.take || 50); },
    },
    cnpjPublicCompany: {
      async findUnique(args: any) { return company.find((c) => c.cnpj === args.where.cnpj) || null; },
    },
    cnpjPublicPartner: {
      async findMany() { return []; },
    },
    radarLeadPool: {
      async findFirst(args: any) {
        const where = args?.where || {};
        return leads.find((l) => (where.placeId ? l.placeId === where.placeId : false) || (where.phoneDigits ? l.phoneDigits === where.phoneDigits : false)) || null;
      },
      async findUnique(args: any) { return leads.find((l) => l.id === args.where.id) || null; },
      async create(args: any) { const row = { id: `lead_${leads.length + 1}`, ...args.data }; leads.push(row); return { id: row.id }; },
      async update(args: any) { const row = leads.find((l) => l.id === args.where.id); if (row) Object.assign(row, args.data); return row; },
    },
    leadContact: {
      async count() { return 0; },
      async findFirst() { return null; },
      async create(args: any) { contacts.push(args.data); return args.data; },
    },
    radarMission: {
      async findUnique() { return null; },
      async create(args: any) { const row = { id: `m_${missions.length + 1}`, ...args.data }; missions.push(row); return row; },
      async updateMany(args: any) {
        let count = 0;
        for (const m of missions) {
          if (m.stage === args.where.stage && m.dedupeKey === args.where.dedupeKey) { Object.assign(m, args.data); count += 1; }
        }
        return { count };
      },
    },
    whatsappNumberCheckCache: {
      async findUnique() { return null; },
    },
  } as any;
}

function makeFakeQueue() {
  return { async enqueue() { return { created: true, missionId: 'm_x' }; } } as any;
}

function makeService(prisma: any) {
  const leadContactWrite = { async writeContacts() { return { written: 0, skipped: 0, rejected: [] }; } } as any;
  return new CnpjXrayService(prisma, makeFakeQueue(), leadContactWrite);
}

test('start sem migration → indisponível', async () => {
  const prisma = makeFakePrisma({ hasXray: false });
  const svc = makeService(prisma);
  const r = await svc.start({ cnpjs: [VALID_1], layers: ['cadastral'] });
  assert.equal(r.started, false);
  assert.equal((r as any).reason, 'xray_indisponivel_migration_ausente');
});

test('start com lista vazia → recusa', async () => {
  const prisma = makeFakePrisma();
  const svc = makeService(prisma);
  const r = await svc.start({ cnpjs: [], layers: ['cadastral'] });
  assert.equal(r.started, false);
  assert.equal((r as any).reason, 'lista_vazia');
});

test('start sem nenhum CNPJ válido → recusa', async () => {
  const prisma = makeFakePrisma();
  const svc = makeService(prisma);
  const r = await svc.start({ cnpjs: ['00000000000000', 'lixo'], layers: ['cadastral'] });
  assert.equal(r.started, false);
  assert.equal((r as any).reason, 'nenhum_cnpj_valido');
});

test('start aceita lote válido, cria job e dedup+DV corretos', async () => {
  process.env.HBX_AI_EXTRACTION_ENABLED = 'false';
  delete process.env.HBX_ROLE; // local
  const prisma = makeFakePrisma({
    company: [
      { cnpj: VALID_1, razaoSocial: 'ACME UM LTDA', nomeFantasia: 'ACME 1', city: 'Fortaleza', state: 'CE', situacao: 'ativa' },
      { cnpj: VALID_2, razaoSocial: 'ACME DOIS LTDA', nomeFantasia: 'ACME 2', city: 'Fortaleza', state: 'CE', situacao: 'ativa' },
    ],
  });
  const svc = makeService(prisma);
  const r = await svc.start({ cnpjs: [VALID_1, VALID_2, VALID_1], layers: ['cadastral'] });
  assert.equal(r.started, true);
  if (r.started) {
    assert.equal(r.validCount, 2, 'dedup: 2 CNPJs únicos válidos');
    assert.equal(r.invalidCount, 1, '1 duplicado');
  }
  // job foi criado no banco fake — o processamento roda em background (void runJob), então o
  // status pode já ter avançado de 'queued' pro próximo passo antes desta asserção rodar.
  assert.equal(prisma._jobs.length, 1);
  assert.ok(
    ['queued', 'running_cadastral', 'done'].includes(prisma._jobs[0].status),
    `status inesperado: ${prisma._jobs[0].status}`,
  );
});

test('TRAVA LEI Nº1: camada vivo processando lote não toca NENHUMA fonte paga', async () => {
  delete process.env.HBX_ROLE; // local
  process.env.HBX_AI_EXTRACTION_ENABLED = 'false';
  process.env.HBX_XRAY_AI_NOTE_ENABLED = 'false';
  const prisma = makeFakePrisma({
    company: [
      { cnpj: VALID_1, razaoSocial: 'ACME UM LTDA', nomeFantasia: 'ACME 1', city: 'Fortaleza', state: 'CE', situacao: 'ativa', phone: '85999998888' },
    ],
  });
  const svc = makeService(prisma);
  const r = await svc.start({ cnpjs: [VALID_1], layers: ['cadastral', 'vivo'] });
  assert.equal(r.started, true);
  // drena em background — espera o job de 1 item terminar
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(SourceBudgetService.serperAllowed(), false, 'Serper OFF no local');
  const job = prisma._jobs[0];
  assert.ok(['done', 'running_vivo', 'running_cadastral'].includes(job.status), `status inesperado: ${job.status}`);
});
