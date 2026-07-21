import test from 'node:test';
import assert from 'node:assert/strict';

import { AiIntentClassifierService } from './ai-intent-classifier.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';

// S05B — o fetch ao Ollama deste classificador foi extraído para o cliente
// único (ai-gateway/ollama-client.ts). Estes testes provam que a cadeia de env
// (SEM override próprio — só HBX_LLM_CLASSIFIER_*), o shape do body
// (format:'json', temperature 0.1, num_predict 80) e o comportamento em erro
// (NUNCA lança pro chamador — sempre `null`, caller cai no keyword) continuam
// intactos após a extração.

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

test('classify: flag desligada -> null, NUNCA toca rede', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: undefined }, async () => {
    let called = false;
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      const svc = new AiIntentClassifierService();
      const result = await svc.classify({ text: 'oi' });
      assert.equal(result, null);
      assert.equal(called, false);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('classify: usa HBX_LLM_CLASSIFIER_MODEL (sem env propria) + format json + temperature 0.1 + num_predict 80', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true', HBX_LLM_CLASSIFIER_MODEL: 'qwen3:4b' }, async () => {
    let capturedBody: any = null;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ message: { content: '{"remetente":"humano","intencao":"INTERESSE"}' } }) };
    };
    try {
      const svc = new AiIntentClassifierService();
      const result = await svc.classify({ text: 'quero sim', companyId: 3 });
      assert.equal(result?.model, 'qwen3:4b');
      assert.equal(capturedBody.format, 'json');
      assert.equal(capturedBody.options.temperature, 0.1);
      assert.equal(capturedBody.options.num_predict, 80);
      assert.equal(capturedBody.think, false);
      assert.equal(result?.intent?.kind, 'positive');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('classify: HTTP nao-ok -> null (caller cai no keyword), erro NUNCA propaga', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true' }, async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    try {
      const svc = new AiIntentClassifierService();
      const result = await svc.classify({ text: 'oi' });
      assert.equal(result, null);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('classify: recusa cedo do governor (orçamento condenado) -> null, erro NUNCA propaga', async () => {
  await withEnv(
    {
      HBX_LLM_CLASSIFIER_ENABLED: 'true',
      // orçamento do classificador (mesmo valor pras 2 chamadas — o 1º pedido nem checa
      // orçamento, pois pega o slot na hora; o 2º acha o slot ocupado e recusa cedo).
      HBX_LLM_CLASSIFIER_TIMEOUT_MS: '3000',
      HBX_AI_GATEWAY_ENABLED: 'true',
      HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '1',
      HBX_AI_GATEWAY_REALTIME_MAX_QUEUE: '32',
      HBX_AI_GATEWAY_REALTIME_TYPICAL_MS: '5000', // espera prevista (5000) + típico (5000) > 3000
    },
    async () => {
      AiGatewayService.resetForTest();
      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        await new Promise((r) => setTimeout(r, 200));
        return { ok: true, status: 200, json: async () => ({ message: { content: '{"remetente":"humano","intencao":"INTERESSE"}' } }) };
      };
      try {
        const svc = new AiIntentClassifierService();
        const first = svc.classify({ text: 'primeira' });
        await new Promise((r) => setTimeout(r, 10)); // garante que o 1º pegou o slot
        const second = await svc.classify({ text: 'segunda' });
        assert.equal(second, null, 'recusado cedo -> null (fallback keyword), sem lancar');
        await first;
      } finally {
        (global as any).fetch = originalFetch;
      }
    },
  );
});
