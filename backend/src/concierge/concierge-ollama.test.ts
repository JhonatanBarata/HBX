import test from 'node:test';
import assert from 'node:assert/strict';

import {
  callConciergeExtractor,
  conciergeAiEnabled,
  conciergeFeatureEnabled,
  conciergeModel,
  conciergeOllamaBaseUrl,
  conciergeTimeoutMs,
} from './concierge-ollama';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

// S05B — concierge-ollama.ts virou wrapper fino sobre o cliente único
// (ai-gateway/ollama-client.ts). Estes testes provam que a cadeia de env
// PRÓPRIA do Concierge (HBX_AI_CONCIERGE_*) continua intacta e que o
// comportamento em erro (SEMPRE lança pro caller decidir o fallback por chips)
// não mudou com a extração do fetch.

function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void> | void) {
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

test('conciergeModel: cadeia HBX_AI_CONCIERGE_MODEL -> HBX_LLM_CLASSIFIER_MODEL -> default', async () => {
  await withEnv({ HBX_AI_CONCIERGE_MODEL: 'qwen3:4b', HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b' }, () => {
    assert.equal(conciergeModel(), 'qwen3:4b', 'env propria do concierge vence');
  });
  await withEnv({ HBX_AI_CONCIERGE_MODEL: undefined, HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b-classificador' }, () => {
    assert.equal(conciergeModel(), 'qwen2.5:7b-classificador', 'sem env propria, cai na do classificador');
  });
  await withEnv({ HBX_AI_CONCIERGE_MODEL: undefined, HBX_LLM_CLASSIFIER_MODEL: undefined }, () => {
    assert.equal(conciergeModel(), 'qwen2.5:7b', 'sem nenhuma env, default');
  });
});

test('conciergeTimeoutMs: cadeia HBX_AI_CONCIERGE_TIMEOUT_MS -> HBX_LLM_CLASSIFIER_TIMEOUT_MS -> 12000', async () => {
  await withEnv({ HBX_AI_CONCIERGE_TIMEOUT_MS: '5000', HBX_LLM_CLASSIFIER_TIMEOUT_MS: '9000' }, () => {
    assert.equal(conciergeTimeoutMs(), 5000);
  });
  await withEnv({ HBX_AI_CONCIERGE_TIMEOUT_MS: undefined, HBX_LLM_CLASSIFIER_TIMEOUT_MS: '9000' }, () => {
    assert.equal(conciergeTimeoutMs(), 9000);
  });
  await withEnv({ HBX_AI_CONCIERGE_TIMEOUT_MS: undefined, HBX_LLM_CLASSIFIER_TIMEOUT_MS: undefined }, () => {
    assert.equal(conciergeTimeoutMs(), 12000);
  });
});

test('conciergeFeatureEnabled/conciergeAiEnabled: flags proprias, independentes', async () => {
  await withEnv({ HBX_AI_CONCIERGE_ENABLED: 'true', HBX_LLM_CLASSIFIER_ENABLED: undefined }, () => {
    assert.equal(conciergeFeatureEnabled(), true);
    assert.equal(conciergeAiEnabled(), false);
  });
});

test('conciergeOllamaBaseUrl: HBX_LLM_CLASSIFIER_URL sem barra final', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_URL: 'http://host.docker.internal:11434///' }, () => {
    assert.equal(conciergeOllamaBaseUrl(), 'http://host.docker.internal:11434');
  });
});

test('callConciergeExtractor: IA desligada -> lanca SEM tocar rede (fallback = chips no caller)', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: undefined }, async () => {
    let called = false;
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      await assert.rejects(
        callConciergeExtractor([{ role: 'user', content: 'oi' }]),
        /IA local desligada/,
      );
      assert.equal(called, false);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('callConciergeExtractor: chama o Ollama com format json + temperature 0.1 + num_predict 220 (contrato preservado)', async () => {
  AiGatewayService.resetForTest();
  await withEnv(
    { HBX_LLM_CLASSIFIER_ENABLED: 'true', HBX_AI_CONCIERGE_MODEL: 'qwen3:4b', HBX_AI_CONCIERGE_TIMEOUT_MS: '4000' },
    async () => {
      let capturedBody: any = null;
      const originalFetch = global.fetch;
      (global as any).fetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ message: { content: '{"intent":"radar_search"}' } }) };
      };
      try {
        const raw = await callConciergeExtractor([{ role: 'user', content: 'quero academias em bh' }], { companyId: 7 });
        assert.equal(raw, '{"intent":"radar_search"}');
        assert.equal(capturedBody.model, 'qwen3:4b');
        assert.equal(capturedBody.format, 'json');
        assert.equal(capturedBody.options.temperature, 0.1);
        assert.equal(capturedBody.options.num_predict, 220);
        assert.equal(capturedBody.think, false);
      } finally {
        (global as any).fetch = originalFetch;
      }
    },
  );
});

test('callConciergeExtractor: HTTP nao-ok propaga erro pro caller (extractWithRetry decide o retry/fallback)', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true' }, async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    try {
      await assert.rejects(callConciergeExtractor([{ role: 'user', content: 'oi' }]), /Ollama HTTP 500/);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});
