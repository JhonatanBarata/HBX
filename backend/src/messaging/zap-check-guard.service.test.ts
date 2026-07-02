import test from 'node:test';
import assert from 'node:assert/strict';
import { ZapCheckGuardService } from './zap-check-guard.service';

/**
 * Aceite do freio do zap-gate (W4, PR02072026): cache TTL, rate limit em fila e disjuntor
 * fechado/aberto/meio-aberto — nível unitário, sem rede real (o de-verdade é o teste de
 * integração em webwhats-bridge.service.test.ts contra checkWhatsappNumbers).
 */

type FakeCacheRow = { phoneDigits: string; exists: boolean; remoteJid: string | null; checkedAt: Date };

function makeFakeDb(initial: FakeCacheRow[] = []) {
  const rows = new Map<string, FakeCacheRow>(initial.map((r) => [r.phoneDigits, { ...r }]));
  return {
    rows,
    whatsappNumberCheckCache: {
      async findMany(args: any) {
        const wanted: string[] = args?.where?.phoneDigits?.in || [];
        return wanted.filter((d) => rows.has(d)).map((d) => ({ ...rows.get(d)! }));
      },
      async upsert(args: any) {
        const key = args.where.phoneDigits;
        const existing = rows.get(key);
        const next: FakeCacheRow = existing
          ? { ...existing, ...args.update }
          : { phoneDigits: key, ...args.create };
        rows.set(key, next);
        return { ...next };
      },
    },
  };
}

function makeBrokenDb(message = 'tabela WhatsappNumberCheckCache derrubada') {
  const boom = async () => { throw new Error(message); };
  return { whatsappNumberCheckCache: { findMany: boom, upsert: boom } };
}

function injectDb(db: any) {
  (ZapCheckGuardService as any)._cacheDb = db;
}

function resetRuntime() {
  (ZapCheckGuardService as any)._windowStartedAt = 0;
  (ZapCheckGuardService as any)._windowCount = 0;
  (ZapCheckGuardService as any)._windowMs = 60_000;
  (ZapCheckGuardService as any)._queue = Promise.resolve();
  (ZapCheckGuardService as any)._breakerState = 'closed';
  (ZapCheckGuardService as any)._consecutiveErrors = 0;
  (ZapCheckGuardService as any)._openedUntil = 0;
  (ZapCheckGuardService as any)._halfOpenProbeInFlight = false;
}

// ── cache TTL: hit / miss / vencido ───────────────────────────────────────────────────────────

test('cache HIT: número checado há pouco tempo não dispara fetchReal', async () => {
  resetRuntime();
  injectDb(makeFakeDb([{ phoneDigits: '5511999990001', exists: true, remoteJid: '5511999990001@s.whatsapp.net', checkedAt: new Date() }]));
  process.env.HBX_ZAP_CHECK_TTL_HOURS = '168';
  let fetchCalls = 0;
  const { results, servedFromCache, fetchedFresh } = await ZapCheckGuardService.guardedCheck(
    ['5511999990001'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null })); },
  );
  assert.equal(fetchCalls, 0);
  assert.deepEqual(servedFromCache, ['5511999990001']);
  assert.deepEqual(fetchedFresh, []);
  assert.equal(results.get('5511999990001')?.exists, true);
  assert.equal(results.get('5511999990001')?.remoteJid, '5511999990001@s.whatsapp.net');
});

test('cache MISS: número nunca checado dispara fetchReal e grava resultado', async () => {
  resetRuntime();
  const db = makeFakeDb();
  injectDb(db);
  let fetchCalls = 0;
  const { results, fetchedFresh } = await ZapCheckGuardService.guardedCheck(
    ['5511999990002'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: `${d}@s.whatsapp.net` })); },
  );
  assert.equal(fetchCalls, 1);
  assert.deepEqual(fetchedFresh, ['5511999990002']);
  assert.equal(results.get('5511999990002')?.exists, true);
  // deu tempo do writeCache (fire-and-forget) rodar? garantimos via microtask flush.
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(db.rows.has('5511999990002'), 'resultado fresco deveria ter sido gravado no cache');
});

test('TTL vencido: entrada antiga no cache é tratada como miss e re-checa', async () => {
  resetRuntime();
  const stale = new Date(Date.now() - 200 * 60 * 60 * 1000); // 200h atrás, TTL default=168h
  injectDb(makeFakeDb([{ phoneDigits: '5511999990003', exists: false, remoteJid: null, checkedAt: stale }]));
  process.env.HBX_ZAP_CHECK_TTL_HOURS = '168';
  let fetchCalls = 0;
  const { fetchedFresh } = await ZapCheckGuardService.guardedCheck(
    ['5511999990003'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null })); },
  );
  assert.equal(fetchCalls, 1);
  assert.deepEqual(fetchedFresh, ['5511999990003']);
});

test('cache indisponível (banco fora): fail-open — segue pro fetchReal normalmente', async () => {
  resetRuntime();
  injectDb(makeBrokenDb());
  let fetchCalls = 0;
  const { results } = await ZapCheckGuardService.guardedCheck(
    ['5511999990004'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null })); },
  );
  assert.equal(fetchCalls, 1);
  assert.equal(results.get('5511999990004')?.exists, true);
});

// ── rate limit: fila espera, nunca descarta ──────────────────────────────────────────────────

test('rate limit: acima do teto por minuto, chamadas extras ESPERAM (não descartam)', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_MAX_PER_MIN = '2';
  // Janela reduzida SÓ pro teste (produção sempre usa 60s) — prova o mecanismo de espera sem
  // segurar o test runner por um minuto real.
  (ZapCheckGuardService as any)._windowMs = 150;
  const order: number[] = [];
  const startedAt = Date.now();
  const timestamps: number[] = [];
  const job = async (n: number) => {
    await ZapCheckGuardService.guardedCheck([`551199999900${n}`], async (pending) => {
      order.push(n);
      timestamps.push(Date.now() - startedAt);
      return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null }));
    });
  };
  // 3 chamadas concorrentes com teto=2/janela(150ms): a 3ª precisa esperar a janela seguinte
  // abrir vaga — todas as 3 completam (nenhuma é descartada).
  await Promise.all([job(1), job(2), job(3)]);
  assert.equal(order.length, 3, 'as 3 chamadas deveriam completar (fila espera, não descarta)');
  assert.ok(timestamps[2] >= 140, `a 3ª chamada deveria esperar a janela seguinte (levou ${timestamps[2]}ms)`);
  delete process.env.HBX_ZAP_CHECK_MAX_PER_MIN;
});

test('rate limit: dentro do teto, todas passam sem espera perceptível', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_MAX_PER_MIN = '20';
  const startedAt = Date.now();
  await Promise.all([1, 2, 3, 4, 5].map((n) =>
    ZapCheckGuardService.guardedCheck([`551188888800${n}`], async (pending) =>
      pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null }))),
  ));
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 2000, `5 chamadas dentro do teto de 20/min não deveriam esperar (levou ${elapsed}ms)`);
  delete process.env.HBX_ZAP_CHECK_MAX_PER_MIN;
});

// ── disjuntor: fechado → aberto → meio-aberto → fechado ──────────────────────────────────────

test('disjuntor abre após N erros consecutivos (threshold) e recusa sem tentar rede', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD = '3';
  process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN = '10';
  const failing = async () => { throw new Error('motor fora do ar'); };

  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(() => ZapCheckGuardService.guardedCheck([`551177777${i}0001`], failing));
  }
  assert.equal(ZapCheckGuardService.breakerState(), 'open');

  // Disjuntor aberto: NÃO tenta rede — devolve breakerOpen=true sem chamar fetchReal.
  let fetchCalls = 0;
  const { breakerOpen } = await ZapCheckGuardService.guardedCheck(
    ['5511999990099'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null })); },
  );
  assert.equal(breakerOpen, true);
  assert.equal(fetchCalls, 0, 'disjuntor aberto não deveria nem tentar a chamada real');

  delete process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD;
  delete process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN;
});

test('disjuntor meio-aberto: após o cooldown, deixa passar 1 prova; sucesso fecha', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD = '2';
  process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN = '10';
  const failing = async () => { throw new Error('motor fora do ar'); };
  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000001'], failing));
  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000002'], failing));
  assert.equal(ZapCheckGuardService.breakerState(), 'open');

  // Simula cooldown vencido voltando o relógio interno do disjuntor.
  (ZapCheckGuardService as any)._openedUntil = Date.now() - 1;
  assert.equal(ZapCheckGuardService.breakerState(), 'half_open');

  let fetchCalls = 0;
  const { breakerOpen, results } = await ZapCheckGuardService.guardedCheck(
    ['5511000000003'],
    async (pending) => { fetchCalls += 1; return pending.map((d) => ({ phoneDigits: d, exists: true, remoteJid: null })); },
  );
  assert.equal(fetchCalls, 1, 'meio-aberto deveria deixar 1 prova passar');
  assert.equal(breakerOpen, false);
  assert.equal(results.get('5511000000003')?.exists, true);
  assert.equal(ZapCheckGuardService.breakerState(), 'closed', 'prova bem-sucedida deveria fechar o disjuntor');

  delete process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD;
  delete process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN;
});

test('disjuntor meio-aberto: prova malsucedida reabre o cooldown imediatamente', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD = '2';
  process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN = '10';
  const failing = async () => { throw new Error('motor fora do ar'); };
  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000011'], failing));
  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000012'], failing));
  (ZapCheckGuardService as any)._openedUntil = Date.now() - 1;
  assert.equal(ZapCheckGuardService.breakerState(), 'half_open');

  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000013'], failing));
  assert.equal(ZapCheckGuardService.breakerState(), 'open', 'prova malsucedida deveria reabrir o disjuntor');
  const openedUntil = (ZapCheckGuardService as any)._openedUntil as number;
  assert.ok(openedUntil > Date.now() + 9 * 60_000, 'cooldown inteiro deveria ser reaplicado');

  delete process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD;
  delete process.env.HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN;
});

test('erro isolado (abaixo do threshold) não abre o disjuntor', async () => {
  resetRuntime();
  injectDb(makeFakeDb());
  process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD = '5';
  const failing = async () => { throw new Error('blip transiente'); };
  await assert.rejects(() => ZapCheckGuardService.guardedCheck(['5511000000021'], failing));
  assert.equal(ZapCheckGuardService.breakerState(), 'closed');
  delete process.env.HBX_ZAP_CHECK_BREAKER_THRESHOLD;
});
