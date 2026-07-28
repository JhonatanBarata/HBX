import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceBudgetService } from './source-budget.service';
import { RadarWebEnrichmentService } from '../radar/03-enrichment/radar-web-enrichment.service';

/**
 * Aceite do Sprint 3 MOTOR-RFB-FILA (governor físico por fonte), nível unitário:
 *  - PAGO é FAIL-CLOSED: contador ilegível (tabela derrubada/banco fora) → NÃO chama.
 *  - GRÁTIS é FAIL-OPEN: contagem best-effort nunca lança; semáforo é in-memory.
 *  - cap=2 no Brave → 2 passam, a 3ª degrada gracioso ([] sem chamada real).
 *  - Semáforo: no máx N chamadas simultâneas por fonte grátis.
 *  - 429/Retry-After: a fila da fonte espera o backoff antes do próximo disparo.
 * O fake de banco entra pelo mesmo furo do PrismaClient lazy estático (_counterDb) — nenhum
 * mock de rede/DI; o de-verdade é coberto pelo teste de aceite manual contra o Postgres local.
 */

type FakeRow = { source: string; yearMonth: string; count: number };

function makeFakeDb(initial: FakeRow[] = []) {
  const rows = new Map<string, FakeRow>(initial.map((r) => [`${r.source}|${r.yearMonth}`, { ...r }]));
  return {
    rows,
    sourceApiUsage: {
      async upsert(args: any) {
        const key = `${args.where.source_yearMonth.source}|${args.where.source_yearMonth.yearMonth}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            source: args.where.source_yearMonth.source,
            yearMonth: args.where.source_yearMonth.yearMonth,
            count: Number(args.create?.count || 0),
          };
          rows.set(key, row);
        } else if (args.update?.count?.increment) {
          row.count += Number(args.update.count.increment);
        }
        return { ...row };
      },
      async update(args: any) {
        const key = `${args.where.source_yearMonth.source}|${args.where.source_yearMonth.yearMonth}`;
        const row = rows.get(key);
        if (!row) throw new Error('row_not_found');
        if (args.data?.count?.increment) row.count += Number(args.data.count.increment);
        return { ...row };
      },
      async findMany(args: any) {
        const prefix = String(args?.where?.yearMonth?.startsWith || '');
        return Array.from(rows.values()).filter((r) => r.yearMonth.startsWith(prefix)).map((r) => ({ ...r }));
      },
    },
  };
}

function makeBrokenDb(message = 'tabela SourceApiUsage derrubada') {
  const boom = async () => { throw new Error(message); };
  return { sourceApiUsage: { upsert: boom, update: boom, findMany: boom } };
}

function injectDb(db: any) {
  (SourceBudgetService as any)._counterDb = db;
}

function resetGovernorRuntime() {
  (SourceBudgetService as any)._queues.clear();
  (SourceBudgetService as any)._lastCallAt.clear();
  (SourceBudgetService as any)._backoffUntil.clear();
  (SourceBudgetService as any)._activeSlots.clear();
  (SourceBudgetService as any)._slotWaiters.clear();
  (SourceBudgetService as any)._blockedLoggedAt.clear();
}

test('PAGO fail-closed: contador ilegível → tryConsumePaid bloqueia (não chama)', async () => {
  resetGovernorRuntime();
  injectDb(makeBrokenDb());
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), false);
  process.env.HBX_GOOGLE_PLACES_DAILY_CAP = '200';
  assert.equal(await SourceBudgetService.tryConsumePaid('google_places'), false);
});

test('GRÁTIS fail-open: contador ilegível → countFreeCall não lança e semáforo segue', async () => {
  resetGovernorRuntime();
  injectDb(makeBrokenDb());
  await SourceBudgetService.countFreeCall('brasilapi'); // não pode lançar
  const result = await SourceBudgetService.withFreeSlot('ddg', async () => 'fluiu');
  assert.equal(result, 'fluiu'); // fluxo grátis NÃO cai com banco fora
});

test('cap=2 no Brave: 2 consomem, a 3ª bloqueia; contador não passa do teto', async () => {
  resetGovernorRuntime();
  const db = makeFakeDb();
  injectDb(db);
  // Cap do teto pago só é exercível quando a trava de papel LIBERA (VPS). No local a trava recusa
  // ANTES do contador — cenário coberto pelo teste da trava logo abaixo.
  process.env.HBX_ROLE = 'vps';
  process.env.HBX_BRAVE_MONTHLY_CAP = '2';
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), true);
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), true);
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), false);
  const ym = new Date().toISOString().slice(0, 7);
  assert.equal(db.rows.get(`brave|${ym}`)?.count, 2);
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  delete process.env.HBX_ROLE;
});

test('teto DIÁRIO do Brave (F4 28/07): bloqueia no dia mesmo com o mês folgado', async () => {
  resetGovernorRuntime();
  const db = makeFakeDb();
  injectDb(db);
  process.env.HBX_ROLE = 'vps';
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  process.env.HBX_BRAVE_DAILY_CAP = '2';
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), true);
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), true);
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), false, 'a 3ª do DIA bloqueia com 898 sobrando no mês');
  const ym = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(db.rows.get(`brave|${ym}`)?.count, 2, 'mensal conta junto');
  assert.equal(db.rows.get(`brave|${day}`)?.count, 2, 'diário não passa do teto');
  process.env.HBX_BRAVE_DAILY_CAP = '30';
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  delete process.env.HBX_ROLE;
});

test('TRAVA LEI Nº1: HBX_ROLE=local recusa tryConsumePaid ANTES do contador (R$0)', async () => {
  resetGovernorRuntime();
  // banco QUEBRADO de propósito: se a trava não recusasse antes, o fail-closed do contador
  // também devolveria false — aqui a distinção é que NADA de banco é tocado. O ponto: no local,
  // pago é false SEM depender do contador.
  const db = makeFakeDb();
  injectDb(db);
  process.env.HBX_ROLE = 'local';
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  process.env.HBX_GOOGLE_PLACES_DAILY_CAP = '200';
  assert.equal(await SourceBudgetService.tryConsumePaid('brave'), false);
  assert.equal(await SourceBudgetService.tryConsumePaid('google_places'), false);
  // contador NÃO foi incrementado (trava cortou antes de tocar o banco)
  const ym = new Date().toISOString().slice(0, 7);
  assert.equal(db.rows.get(`brave|${ym}`), undefined);
  delete process.env.HBX_ROLE;
});

test('searchBrave degrada gracioso no teto: [] e ZERO chamada real na API', async () => {
  resetGovernorRuntime();
  const ym = new Date().toISOString().slice(0, 7);
  injectDb(makeFakeDb([{ source: 'brave', yearMonth: ym, count: 2 }]));
  process.env.HBX_BRAVE_MONTHLY_CAP = '2';
  process.env.HBX_BRAVE_MIN_INTERVAL_MS = '0';
  process.env.BRAVE_SEARCH_API_KEY = 'chave-de-teste';
  let realCalls = 0;
  const fetcher = (async () => {
    realCalls += 1;
    return { ok: true, status: 200, json: async () => ({ web: { results: [] } }), headers: { get: () => null } };
  }) as unknown as typeof fetch;
  const service = new RadarWebEnrichmentService();
  const results = await (service as any).searchBrave(fetcher, `query-teto-${Date.now()}`, 2000);
  assert.deepEqual(results, []);
  assert.equal(realCalls, 0);
  delete process.env.BRAVE_SEARCH_API_KEY;
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  delete process.env.HBX_BRAVE_MIN_INTERVAL_MS;
});

test('semáforo grátis: no máx N simultâneas por fonte (N=2 via env por fonte)', async () => {
  resetGovernorRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_SOURCE_DDG_MAX_CONCURRENCY = '2';
  let active = 0;
  let peak = 0;
  const job = () => SourceBudgetService.withFreeSlot('ddg', async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 25));
    active -= 1;
  });
  await Promise.all([job(), job(), job(), job(), job(), job()]);
  assert.equal(active, 0);
  assert.ok(peak <= 2, `pico de concorrência ${peak} passou do teto 2`);
  assert.ok(peak >= 2, 'teto de 2 deveria permitir 2 em voo (throughput, não fila única)');
  delete process.env.HBX_SOURCE_DDG_MAX_CONCURRENCY;
});

test('429/Retry-After: fila da fonte espera o backoff antes do próximo disparo', async () => {
  resetGovernorRuntime();
  injectDb(makeFakeDb());
  SourceBudgetService.reportRateLimited('searxng', 1); // 1s de backoff
  const startedAt = Date.now();
  await SourceBudgetService.schedule('searxng', async () => 'ok');
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 900, `disparou em ${elapsed}ms — deveria esperar ~1s de backoff`);
});

test('usageSnapshot: gauge bate com o contador e fail-closed aparece como allowed=false', async () => {
  resetGovernorRuntime();
  const ym = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  injectDb(makeFakeDb([
    { source: 'brave', yearMonth: ym, count: 123 },
    { source: 'google_places', yearMonth: today, count: 7 },
    { source: 'brasilapi', yearMonth: ym, count: 55 },
  ]));
  process.env.HBX_BRAVE_MONTHLY_CAP = '900';
  process.env.HBX_GOOGLE_PLACES_DAILY_CAP = '200';
  const snapshot = await SourceBudgetService.usageSnapshot();
  assert.equal(snapshot.ok, true);
  const brave = snapshot.sources.find((s) => s.source === 'brave');
  assert.equal(brave?.used, 123);
  assert.equal(brave?.cap, 900);
  assert.equal(brave?.allowed, true);
  const places = snapshot.sources.find((s) => s.source === 'google_places');
  assert.equal(places?.used, 7);
  assert.equal(places?.usedMonth, 7);
  const brasil = snapshot.sources.find((s) => s.source === 'brasilapi');
  assert.equal(brasil?.used, 55);

  injectDb(makeBrokenDb());
  const broken = await SourceBudgetService.usageSnapshot();
  assert.equal(broken.ok, false);
  assert.equal(broken.sources.find((s) => s.source === 'brave')?.allowed, false); // pago fail-closed
  assert.equal(broken.sources.find((s) => s.source === 'ddg')?.allowed, true);    // grátis segue
});
