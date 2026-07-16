import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarFabricaService } from './radar-fabrica.service';
import { SourceBudgetService } from '../../source-budget/source-budget.service';
import { isLocalRole } from '../../source-budget/role-guard';

/**
 * Aceite F2 (fábrica de enriquecimento), nível unitário — sem infra viva:
 *  - status/start/stop respeitam o contrato (sem budget → recusa; já rodando → não duplica).
 *  - TRAVA LEI Nº1: em papel local, nenhuma fonte paga é sequer tentável (paidAttempts fica 0).
 * O de-verdade ponta-a-ponta (5 leads RFB enriquecidos, R$0 comprovado no log) é o aceite AO VIVO
 * contra o Postgres + Ollama locais.
 */

// ── fake mínimo de PrismaService: só o que a fábrica toca ────────────────────────────────────────
function makeFakePrisma(opts: { hasFabrica?: boolean; rfb?: any[] } = {}) {
  const run: any = { key: 'main', running: false, stopRequested: false, budget: 0, processed: 0, materialized: 0, contactsWritten: 0, paidAttempts: 0 };
  const leads: any[] = [];
  const missions: any[] = [];
  const contacts: any[] = [];
  const rfb = opts.rfb || [];
  return {
    _run: run, _leads: leads, _missions: missions, _contacts: contacts,
    async hasTable(name: string) {
      if (name === 'RadarFabricaRun') return opts.hasFabrica !== false;
      return true;
    },
    radarFabricaRun: {
      async upsert() { return { ...run }; },
      async findUnique() { return { ...run }; },
      async update(args: any) { Object.assign(run, args.data); applyIncrements(run, args.data); return { ...run }; },
      async updateMany(args: any) { Object.assign(run, plainOnly(args.data)); applyIncrements(run, args.data); return { count: 1 }; },
    },
    cnpjPublicCompany: {
      async count() { return rfb.length; },
      async findMany(args: any) { return rfb.slice(args?.skip || 0, (args?.skip || 0) + (args?.take || 50)); },
    },
    radarLeadPool: {
      async findFirst(args: any) {
        const where = args?.where || {};
        return leads.find((l) => (where.placeId ? l.placeId === where.placeId : false) || (where.phoneDigits ? l.phoneDigits === where.phoneDigits : false)) || null;
      },
      async findUnique(args: any) { return leads.find((l) => l.id === args.where.id) || null; },
      async create(args: any) { const row = { id: `lead_${leads.length + 1}`, ...args.data }; leads.push(row); return { id: row.id, name: row.name }; },
      async update(args: any) { const row = leads.find((l) => l.id === args.where.id); if (row) Object.assign(row, args.data); return row; },
    },
    leadContact: {
      async count(args: any) { return contacts.filter((c) => c.radarLeadId === args.where.radarLeadId).length; },
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
      async groupBy() { return []; },
      async count() { return 0; },
      async findFirst() { return null; },
    },
    radarFactoryCursor: {
      async upsert() { return { key: 'main', enabled: true }; },
      async findUnique() { return { enabled: true }; }, // PARAR TUDO global desligado
    },
  } as any;
}

function plainOnly(data: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(data || {})) if (!(v && typeof v === 'object' && 'increment' in (v as any))) out[k] = v;
  return out;
}
function applyIncrements(target: any, data: any) {
  for (const [k, v] of Object.entries(data || {})) if (v && typeof v === 'object' && 'increment' in (v as any)) target[k] = Number(target[k] || 0) + Number((v as any).increment);
}

// mission queue fake: só isQueuePaused (global) + stats + enqueue
function makeFakeQueue() {
  return {
    async isQueuePaused() { return false; },
    async stats() { return { supported: true, paused: false, byStageStatus: [], lag: { queuedDue: 0, oldestQueuedAgeMs: 0 } }; },
    async enqueue() { return { created: true, missionId: 'm_x' }; },
  } as any;
}

function makeService(prisma: any) {
  const leadContactWrite = { async writeContacts() { return { written: 0, skipped: 0, rejected: [] }; } } as any;
  return new RadarFabricaService(prisma, makeFakeQueue(), leadContactWrite);
}

test('start sem budget → RECUSA (contrato do painel)', async () => {
  const prisma = makeFakePrisma({ rfb: [] });
  const svc = makeService(prisma);
  const r1 = await svc.start({});
  assert.equal(r1.started, false);
  assert.equal((r1 as any).reason, 'budget_obrigatorio');
  const r2 = await svc.start({ budget: 0 });
  assert.equal(r2.started, false);
});

test('start sem migration → indisponível', async () => {
  const prisma = makeFakePrisma({ hasFabrica: false });
  const svc = makeService(prisma);
  const r = await svc.start({ budget: 5 });
  assert.equal(r.started, false);
  assert.equal((r as any).reason, 'migration_ausente:RadarFabricaRun');
});

test('status sem delegate Prisma não finge fábrica offline nem contadores zerados', async () => {
  const prisma = makeFakePrisma();
  delete prisma.radarFabricaRun;
  const svc = makeService(prisma);
  const status = await svc.status();
  assert.equal(status.supported, false);
  assert.equal(status.unavailableReason, 'prisma_client_desatualizado');
});

test('status expõe a trava anti-pago e paidAttempts=0 (prova de R$0)', async () => {
  delete process.env.HBX_ROLE; // ausente → local
  const prisma = makeFakePrisma({ rfb: [{ cnpj: '11222333000181', razaoSocial: 'ACME LTDA', city: 'Fortaleza', state: 'CE' }] });
  const svc = makeService(prisma);
  const status = await svc.status();
  assert.equal(status.paidLocked, true, 'no local a trava deve estar ativa');
  assert.equal(status.paidAttempts, 0);
  assert.equal(status.rfbBaseCount, 1);
  assert.equal(isLocalRole(), true);
});

test('TRAVA: mesmo com budget, drena RFB sem NENHUMA tentativa paga (paidAttempts=0)', async () => {
  delete process.env.HBX_ROLE; // local
  delete process.env.HBX_AI_EXTRACTION_ENABLED; // sem IA neste unit — só L4 grátis
  // 3 empresas RFB com CNPJ válido (DV correto p/ o L4 não barrar formato)
  const rfb = [
    { cnpj: '11222333000181', razaoSocial: 'ACME UM LTDA', nomeFantasia: 'ACME 1', city: 'Fortaleza', state: 'CE', cnae: '4712100' },
    { cnpj: '11444777000161', razaoSocial: 'ACME DOIS LTDA', nomeFantasia: 'ACME 2', city: 'Fortaleza', state: 'CE', cnae: '4712100' },
  ];
  const prisma = makeFakePrisma({ rfb });
  const svc = makeService(prisma);
  const started = await svc.start({ budget: 2 });
  assert.equal(started.started, true);
  // drena em background — espera o laço terminar (curto no fake)
  await new Promise((r) => setTimeout(r, 200));
  const status = await svc.status();
  assert.equal(status.paidAttempts, 0, 'NENHUMA tentativa paga pode ocorrer no local');
  assert.equal(SourceBudgetService.serperAllowed(), false, 'Serper OFF no local');
  assert.ok(status.materialized >= 1, 'materializou lead(s) da RFB');
  assert.equal(prisma._leads.length >= 1, true);
});

test('budget 5000 alcança empresa após mais de 2000 registros já materializados', async () => {
  const rfb = Array.from({ length: 5_000 }, (_, index) => {
    const cnpj = String(index + 1).padStart(14, '0');
    return { cnpj, razaoSocial: `EMPRESA ${index + 1}` };
  });
  const prisma = makeFakePrisma({ rfb });

  // Simula uma retomada: os 4.999 primeiros registros já viraram lead em corridas anteriores.
  // O teste chama somente a seleção/materialização; não aciona fila, L4, rede ou scraping real.
  prisma._leads.push(...rfb.slice(0, 4_999).map((company, index) => ({
    id: `existing_${index + 1}`,
    placeId: `cnpj_public:${company.cnpj}`,
    name: company.razaoSocial,
  })));

  const svc = makeService(prisma);
  const lead = await (svc as any).materializeNextLead();

  assert.equal(lead?.cnpj, rfb[4_999].cnpj);
  assert.equal(prisma._leads.length, 5_000);
});

test('pedido de 5000 conclui o budget inteiro sem fila, rede ou scraping real', async () => {
  const rfb = Array.from({ length: 5_000 }, (_, index) => ({
    cnpj: String(index + 1).padStart(14, '0'),
    razaoSocial: `EMPRESA ${index + 1}`,
  }));
  const prisma = makeFakePrisma({ rfb });
  const svc = makeService(prisma) as any;

  // Isola somente o laço da fábrica: nenhuma missão é publicada e nenhum enriquecedor é chamado.
  svc.enqueueEnrichMission = async () => undefined;
  svc.processEnrichMissionForLead = async (leadId: string) => {
    await prisma.radarFabricaRun.updateMany({
      where: { key: 'main' },
      data: { processed: { increment: 1 }, lastLeadId: leadId },
    });
  };

  const started = await svc.start({ budget: 5_000 });
  assert.equal(started.started, true);

  const deadline = Date.now() + 10_000;
  while (prisma._run.running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(prisma._run.running, false, 'a corrida deve encerrar sozinha ao bater o budget');
  assert.equal(prisma._run.processed, 5_000);
  assert.equal(prisma._run.materialized, 5_000);
  assert.equal(prisma._leads.length, 5_000);
});

test('stop marca stopRequested (congela com segurança)', async () => {
  const prisma = makeFakePrisma({ rfb: [] });
  const svc = makeService(prisma);
  const r = await svc.stop();
  assert.equal(r.stopped, true);
  assert.equal(prisma._run.stopRequested, true);
});
