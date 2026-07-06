import test from 'node:test';
import assert from 'node:assert/strict';
import { AiGatewayService } from './ai-gateway.service';

/**
 * ACEITE do GOVERNOR-IA (§9 do PLANO-HIBRIDO-30B). O Ollama é MOCKADO por uma função com latência
 * simulada — o teste não toca rede. Provamos a regra absoluta do dono ("fila com faixas, realtime
 * na frente, batch cede sem morrer de fome") de forma determinística.
 *
 *  1. RAJADA: 20 batch + 5 realtime simultâneas → as 5 realtime fecham dentro do orçamento e o
 *     batch cede a vez (completa DEPOIS). Starvation reversa coberta (batch não morre de fome).
 *  2. GRUPO DE CONTROLE (gateway OFF): reproduz o atropelo — realtime espera atrás de batch.
 *  3. RECUSA-CEDO: fila cheia / espera condenada → o caller recebe recusa (fallback) SEM erro.
 */

// Envs por caso: o host/worktree não tem .env garantido (ver MEMORY.md).
function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

/** "Ollama" mockado: dorme `ms` e devolve um marcador. Registra pico de concorrência real. */
function makeFakeOllama() {
  const state = { inFlight: 0, peakInFlight: 0, calls: 0 };
  const call = (ms: number, tag: string) => async () => {
    state.calls += 1;
    state.inFlight += 1;
    state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);
    await new Promise((r) => setTimeout(r, ms));
    state.inFlight -= 1;
    return tag;
  };
  return { state, call };
}

test('RAJADA: 5 realtime fecham dentro do orçamento; 20 batch cedem e completam depois', async () => {
  await withEnv(
    {
      HBX_AI_GATEWAY_ENABLED: 'true',
      HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '2',
      HBX_AI_GATEWAY_BATCH_CONCURRENCY: '1',
      HBX_AI_GATEWAY_REALTIME_MAX_QUEUE: '16',
      HBX_AI_GATEWAY_BATCH_MAX_QUEUE: '64',
      // latências típicas baixas pra a conta de recusa-cedo NÃO recusar as realtime deste teste.
      HBX_AI_GATEWAY_REALTIME_TYPICAL_MS: '40',
      HBX_AI_GATEWAY_BATCH_TYPICAL_MS: '60',
    },
    async () => {
      AiGatewayService.resetForTest();
      const ollama = makeFakeOllama();

      const BATCH_LATENCY = 60;
      const REALTIME_LATENCY = 30;
      const REALTIME_BUDGET = 9000; // gate do bot

      // Dispara 20 batch primeiro (chegam "antes"), depois as 5 realtime — a rajada clássica do
      // CHIP 5: o bot chega no meio de um lote de cards.
      const batchPromises: Array<Promise<{ tag: string; at: number }>> = [];
      for (let i = 0; i < 20; i += 1) {
        batchPromises.push(
          AiGatewayService.run('batch', 120000, ollama.call(BATCH_LATENCY, `batch-${i}`)).then((res) => ({
            tag: res.ok ? (res.value as string) : `refused:${(res as any).reason}`,
            at: Date.now(),
          })),
        );
      }

      // Um tick depois, entram as realtime (bot).
      await new Promise((r) => setTimeout(r, 5));
      const realtimeStart = Date.now();
      const realtimePromises: Array<Promise<{ tag: string; elapsed: number }>> = [];
      for (let i = 0; i < 5; i += 1) {
        realtimePromises.push(
          AiGatewayService.run('realtime', REALTIME_BUDGET, ollama.call(REALTIME_LATENCY, `rt-${i}`)).then((res) => ({
            tag: res.ok ? (res.value as string) : `refused:${(res as any).reason}`,
            elapsed: Date.now() - realtimeStart,
          })),
        );
      }

      const realtimeResults = await Promise.all(realtimePromises);
      const realtimeDoneAt = Date.now();

      // (a) TODAS as 5 realtime completam (nenhuma recusada) e DENTRO do orçamento de 9s.
      for (const r of realtimeResults) {
        assert.match(r.tag, /^rt-\d$/, `realtime deveria completar, veio "${r.tag}"`);
        assert.ok(r.elapsed < REALTIME_BUDGET, `realtime fechou em ${r.elapsed}ms, acima do gate de ${REALTIME_BUDGET}ms`);
      }
      // As 5 realtime fecham rápido (2 de concorrência × ~30ms × 3 rodadas ≈ <200ms), NÃO atrás dos
      // 20 batch (que a 1 de concorrência levariam ~1200ms). Prova o furo na frente.
      assert.ok(realtimeDoneAt - realtimeStart < 400, `realtime demorou ${realtimeDoneAt - realtimeStart}ms — deveria passar na frente do lote`);

      // (b) o batch CEDE mas não morre: todas as 20 completam depois.
      const batchResults = await Promise.all(batchPromises);
      const completedBatch = batchResults.filter((b) => /^batch-\d+$/.test(b.tag));
      assert.equal(completedBatch.length, 20, 'starvation reversa: todo batch deve completar quando o realtime esvazia');

      // (c) concorrência real nunca passou de realtime(2) + batch(1) = 3 no pico.
      assert.ok(ollama.state.peakInFlight <= 3, `pico de concorrência ${ollama.state.peakInFlight} passou do teto 3`);
    },
  );
});

test('GRUPO DE CONTROLE (gateway OFF): reproduz o atropelo — realtime espera atrás do batch', async () => {
  await withEnv({ HBX_AI_GATEWAY_ENABLED: 'false' }, async () => {
    AiGatewayService.resetForTest();
    const ollama = makeFakeOllama();

    // Com o gateway OFF, run() é bypass: chama fn() direto. Se dispararmos 20 batch + 5 realtime
    // simultâneas, TODAS entram em voo ao mesmo tempo (o gateway não serializa nada) — reproduzindo
    // a contenção que o CHIP 5 mediu (nada segura o lote pra ceder a vez ao bot).
    const all: Array<Promise<unknown>> = [];
    for (let i = 0; i < 20; i += 1) all.push(AiGatewayService.run('batch', 120000, ollama.call(50, `batch-${i}`)));
    for (let i = 0; i < 5; i += 1) all.push(AiGatewayService.run('realtime', 9000, ollama.call(50, `rt-${i}`)));
    await Promise.all(all);

    // A prova do atropelo: 25 chamadas em voo ao mesmo tempo (governor não interveio).
    assert.equal(ollama.state.peakInFlight, 25, `OFF deveria deixar todas as 25 em voo (atropelo); pico foi ${ollama.state.peakInFlight}`);
  });
});

test('RECUSA-CEDO por fila cheia: excedente recebe refused (fallback), sem lançar', async () => {
  await withEnv(
    {
      HBX_AI_GATEWAY_ENABLED: 'true',
      HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '1',
      HBX_AI_GATEWAY_REALTIME_MAX_QUEUE: '2', // 1 em voo + 2 na fila = 3; o 4º é recusado
      HBX_AI_GATEWAY_REALTIME_TYPICAL_MS: '10',
    },
    async () => {
      AiGatewayService.resetForTest();
      const ollama = makeFakeOllama();
      // 4 realtime de uma vez, orçamento largo (não é budget que recusa, é a fila cheia).
      const results = await Promise.all([
        AiGatewayService.run('realtime', 999999, ollama.call(80, 'a')),
        AiGatewayService.run('realtime', 999999, ollama.call(80, 'b')),
        AiGatewayService.run('realtime', 999999, ollama.call(80, 'c')),
        AiGatewayService.run('realtime', 999999, ollama.call(80, 'd')),
      ]);
      const refused = results.filter((r) => !r.ok);
      assert.equal(refused.length, 1, 'com 1 slot + fila 2, o 4º pedido deve ser recusado cedo');
      assert.equal((refused[0] as any).reason, 'queue_full');
      // Recusa é graciosa: `ok:false`, nunca exceção. Os outros 3 completaram.
      assert.equal(results.filter((r) => r.ok).length, 3);
    },
  );
});

test('RECUSA-CEDO por orçamento condenado: espera prevista > budget → refused budget_exceeded', async () => {
  await withEnv(
    {
      HBX_AI_GATEWAY_ENABLED: 'true',
      HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '1',
      HBX_AI_GATEWAY_REALTIME_MAX_QUEUE: '32', // fila FUNDA: não é queue_full, é o budget que corta
      HBX_AI_GATEWAY_REALTIME_TYPICAL_MS: '5000', // cada job ~5s típico
    },
    async () => {
      AiGatewayService.resetForTest();
      const ollama = makeFakeOllama();
      // 1º ocupa o slot (job longo). Os próximos com orçamento APERTADO (3s) veem espera prevista
      // (>=5s de 1 rodada + 5s do próprio job) > 3s → recusa por budget_exceeded, sem entrar na fila.
      const running = AiGatewayService.run('realtime', 999999, ollama.call(200, 'longo'));
      await new Promise((r) => setTimeout(r, 10)); // garante que o 1º pegou o slot
      const tight = await AiGatewayService.run('realtime', 3000, ollama.call(50, 'apertado'));
      assert.equal(tight.ok, false);
      assert.equal((tight as any).reason, 'budget_exceeded');
      await running;
    },
  );
});

test('flag OFF: run() é bypass byte-idêntico — chama fn e devolve ok, sem tocar contadores', async () => {
  await withEnv({ HBX_AI_GATEWAY_ENABLED: 'false' }, async () => {
    AiGatewayService.resetForTest();
    let called = false;
    const res = await AiGatewayService.run('batch', 1000, async () => {
      called = true;
      return 'valor';
    });
    assert.equal(called, true);
    assert.equal(res.ok, true);
    assert.equal((res as any).value, 'valor');
    // OFF não passa pela admissão: accepted continua 0.
    assert.equal(AiGatewayService.snapshot().lanes.batch.accepted, 0);
  });
});

test('erro DENTRO do fn propaga (não vira refused) e o slot é liberado', async () => {
  await withEnv({ HBX_AI_GATEWAY_ENABLED: 'true', HBX_AI_GATEWAY_BATCH_CONCURRENCY: '1' }, async () => {
    AiGatewayService.resetForTest();
    await assert.rejects(
      AiGatewayService.run('batch', 60000, async () => {
        throw new Error('ollama fora');
      }),
      /ollama fora/,
    );
    // slot liberado: o próximo batch roda na hora.
    const ok = await AiGatewayService.run('batch', 60000, async () => 'ok');
    assert.equal(ok.ok, true);
    assert.equal(AiGatewayService.snapshot().lanes.batch.active, 0);
  });
});

test('snapshot: gauge por faixa com aceitas/recusadas/aguardando/p95', async () => {
  await withEnv(
    { HBX_AI_GATEWAY_ENABLED: 'true', HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '2', HBX_AI_GATEWAY_BATCH_CONCURRENCY: '1' },
    async () => {
      AiGatewayService.resetForTest();
      const ollama = makeFakeOllama();
      await Promise.all([
        AiGatewayService.run('realtime', 9000, ollama.call(20, 'a')),
        AiGatewayService.run('realtime', 9000, ollama.call(20, 'b')),
        AiGatewayService.run('batch', 60000, ollama.call(20, 'c')),
      ]);
      const snap = AiGatewayService.snapshot();
      assert.equal(snap.enabled, true);
      assert.equal(snap.lanes.realtime.concurrency, 2);
      assert.equal(snap.lanes.batch.concurrency, 1);
      assert.equal(snap.lanes.realtime.accepted, 2);
      assert.equal(snap.lanes.batch.accepted, 1);
      assert.equal(snap.lanes.realtime.active, 0);
      assert.equal(snap.lanes.batch.active, 0);
      assert.ok(typeof snap.lanes.realtime.waitP95Ms === 'number');
    },
  );
});
