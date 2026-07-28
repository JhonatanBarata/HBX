import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarSearchSessionService } from './radar-search-session.service';

// REFUNDAÇÃO F1 (28/07): a máquina de estados da sessão server-side, nível unitário.
// Fakes in-memory (mesmo estilo do source-budget.service.test.ts): nenhum banco/DI real.

type Row = Record<string, any>;

function makeFakePrisma() {
  const sessions = new Map<string, Row>();
  const runs = new Map<string, Row>();
  let seq = 0;
  const matches = (row: Row, where: Row): boolean => Object.entries(where || {}).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((sub) => matches(row, sub));
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ('in' in cond) return (cond as any).in.includes(row[key]);
      if ('not' in cond) return row[key] !== (cond as any).not && !((cond as any).not === null && row[key] == null);
      if ('gte' in cond) return row[key] instanceof Date && row[key] >= (cond as any).gte;
      return true;
    }
    return row[key] === cond;
  });
  return {
    sessions,
    runs,
    radarSearchSession: {
      async create({ data }: any) {
        const id = `sess-${++seq}`;
        const row = { id, currentRunId: null, pauseReason: null, message: null, filtersJson: null,
          foundTotal: 0, foundSinceResume: 0, cursorIndex: 0, targetTotal: 0, pauseAfterLeads: 0,
          startedAt: new Date(), finishedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        sessions.set(id, row);
        return { ...row };
      },
      async findFirst({ where }: any) {
        const found = [...sessions.values()].filter((row) => matches(row, where));
        found.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return found[0] ? { ...found[0] } : null;
      },
      async findMany({ where }: any) {
        return [...sessions.values()].filter((row) => matches(row, where)).map((row) => ({ ...row }));
      },
      async update({ where, data }: any) {
        const row = sessions.get(where.id);
        if (!row) throw new Error('session_not_found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },
    webscrapingSearchRun: {
      async findFirst({ where }: any) {
        const row = runs.get(where.id);
        return row ? { ...row } : null;
      },
    },
    user: {
      async findFirst() {
        return { id: 6, companyId: 5, role: 'USERMASTER', isSystemMaster: false, isActive: true,
          name: 'Teste', email: 't@t', username: 'teste', phone: null, company: { id: 5, name: 'T', slug: 't' } };
      },
    },
  };
}

function makeFakeWebscraping(prisma: ReturnType<typeof makeFakePrisma>) {
  let runSeq = 0;
  const startCalls: Row[] = [];
  const cancelCalls: string[] = [];
  return {
    startCalls,
    cancelCalls,
    failNextStart: false as boolean,
    async startRadarSearchRunForUser(_user: any, input: Row) {
      if (this.failNextStart) { this.failNextStart = false; throw new Error('motor indisponível'); }
      startCalls.push(input);
      const id = `run-${++runSeq}`;
      prisma.runs.set(id, { id, status: 'running', foundCount: 0, errorMessage: null });
      return { id, status: 'running' };
    },
    async getRadarSearchRunForUser(_user: any, runId: string) {
      return prisma.runs.get(runId) ? { ...prisma.runs.get(runId) } : null;
    },
    async cancelSearchRunForUser(_user: any, runId: string) {
      cancelCalls.push(runId);
      const run = prisma.runs.get(runId);
      if (run) run.status = 'canceled';
      return { id: runId, status: 'canceled' };
    },
  };
}

function makeService() {
  const prisma = makeFakePrisma();
  const webscraping = makeFakeWebscraping(prisma);
  const service = new RadarSearchSessionService(prisma as any, webscraping as any);
  return { prisma, webscraping, service };
}

const USER = { id: 6, companyId: 5 };
const TWO_CITIES = {
  cities: [{ city: 'Aguaí', state: 'SP' }, { city: 'Águas da Prata', state: 'SP' }],
  segment: 'distribuidora de agua',
  quantity: 10,
};

test('startSession: cria a sessão e já dispara a cidade 1 pelo caminho oficial do run', async () => {
  const { webscraping, service } = makeService();
  const result: any = await service.startSessionForUser(USER, TWO_CITIES);
  assert.equal(result.status, 'running');
  assert.equal(result.cityCount, 2);
  assert.equal(webscraping.startCalls.length, 1);
  assert.equal(webscraping.startCalls[0].city, 'Aguaí');
  assert.equal(webscraping.startCalls[0].segment, 'distribuidora de agua');
  assert.equal(result.currentRunId, 'run-1');
});

test('tick com run em voo: não faz nada (o pump cuida do meio)', async () => {
  const { webscraping, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  await service.tick(created.id);
  await service.tick(created.id);
  assert.equal(webscraping.startCalls.length, 1, 'nenhum run novo enquanto o atual roda');
});

test('run completa → dobra contadores, avança cursor e inicia a próxima cidade sozinho', async () => {
  const { prisma, webscraping, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  prisma.runs.get('run-1')!.status = 'completed';
  prisma.runs.get('run-1')!.foundCount = 7;
  await service.tick(created.id);
  const session = prisma.sessions.get(created.id)!;
  assert.equal(session.cursorIndex, 1);
  assert.equal(session.foundTotal, 7);
  assert.equal(webscraping.startCalls.length, 2, 'cidade 2 disparada');
  assert.equal(webscraping.startCalls[1].city, 'Águas da Prata');
  const cities = JSON.parse(session.citiesJson);
  assert.equal(cities[0].status, 'completed');
  assert.equal(cities[0].foundCount, 7);
});

test('pauseAfterLeads: pausa SOZINHO antes da próxima cidade; resume zera e continua', async () => {
  const { prisma, webscraping, service } = makeService();
  const created: any = await service.startSessionForUser(USER, { ...TWO_CITIES, pauseAfterLeads: 5 });
  prisma.runs.get('run-1')!.status = 'completed';
  prisma.runs.get('run-1')!.foundCount = 6; // >= 5
  await service.tick(created.id);
  let session = prisma.sessions.get(created.id)!;
  assert.equal(session.status, 'paused');
  assert.equal(session.pauseReason, 'pause_after_leads');
  assert.equal(webscraping.startCalls.length, 1, 'cidade 2 NÃO começa pausada');

  const resumed: any = await service.resumeSessionForUser(USER, created.id);
  assert.equal(resumed.status, 'running');
  await service.tick(created.id);
  session = prisma.sessions.get(created.id)!;
  assert.equal(session.foundSinceResume, 0);
  assert.equal(webscraping.startCalls.length, 2, 'retomada continua de onde parou');
});

test('todas as cidades terminam → sessão completed com resumo', async () => {
  const { prisma, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  prisma.runs.get('run-1')!.status = 'completed';
  prisma.runs.get('run-1')!.foundCount = 3;
  await service.tick(created.id);
  prisma.runs.get('run-2')!.status = 'completed_insufficient_results';
  prisma.runs.get('run-2')!.foundCount = 2;
  await service.tick(created.id);
  const session = prisma.sessions.get(created.id)!;
  assert.equal(session.status, 'completed');
  assert.equal(session.foundTotal, 5);
  assert.ok(session.finishedAt);
});

test('cidade que falha ao INICIAR não trava o trabalho: marca failed e segue pra próxima', async () => {
  const { prisma, webscraping, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  prisma.runs.get('run-1')!.status = 'completed';
  prisma.runs.get('run-1')!.foundCount = 1;
  webscraping.failNextStart = true;
  await service.tick(created.id); // dobra run-1 e falha ao iniciar cidade 2
  let session = prisma.sessions.get(created.id)!;
  const cities = JSON.parse(session.citiesJson);
  assert.equal(cities[1].status, 'failed');
  await service.tick(created.id); // cursor além do fim → fecha
  session = prisma.sessions.get(created.id)!;
  assert.equal(session.status, 'completed', 'houve cidade ok → completed');
});

test('run cancelado POR FORA → sessão acompanha e encerra (nada de recriar em loop)', async () => {
  const { prisma, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  prisma.runs.get('run-1')!.status = 'canceled';
  await service.tick(created.id);
  const session = prisma.sessions.get(created.id)!;
  assert.equal(session.status, 'canceled');
});

test('sessão nova SUBSTITUI a anterior: antiga canceled + run vivo cancelado', async () => {
  const { prisma, webscraping, service } = makeService();
  const first: any = await service.startSessionForUser(USER, TWO_CITIES);
  const second: any = await service.startSessionForUser(USER, { ...TWO_CITIES, segment: 'padaria' });
  const old = prisma.sessions.get(first.id)!;
  assert.equal(old.status, 'canceled');
  assert.deepEqual(webscraping.cancelCalls, ['run-1']);
  assert.equal(prisma.sessions.get(second.id)!.status, 'running');
});

test('cancel manual: sessão canceled + run vivo cancelado', async () => {
  const { prisma, webscraping, service } = makeService();
  const created: any = await service.startSessionForUser(USER, TWO_CITIES);
  const result: any = await service.cancelSessionForUser(USER, created.id);
  assert.equal(result.status, 'canceled');
  assert.deepEqual(webscraping.cancelCalls, ['run-1']);
  assert.equal(prisma.sessions.get(created.id)!.status, 'canceled');
});

test('getActiveSession devolve a sessão viva com o run atual embutido (re-hidratação de 1 GET)', async () => {
  const { prisma, service } = makeService();
  await service.startSessionForUser(USER, TWO_CITIES);
  prisma.runs.get('run-1')!.foundCount = 4;
  const active: any = await service.getActiveSessionForUser(USER);
  assert.equal(active.status, 'running');
  assert.equal(active.currentRun?.id, 'run-1');
  assert.equal(active.foundTotal, 4, 'conta o run vivo no total');
  assert.equal(active.currentCity.city, 'Aguaí');
});
