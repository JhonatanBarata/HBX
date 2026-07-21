import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assistenteModel,
  assistenteOllamaBaseUrl,
  assistenteOllamaEnabled,
  assistenteTimeoutMs,
  callAssistenteOllama,
} from './assistente-ollama';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

// S05B — assistente-ollama.ts virou wrapper fino sobre o cliente único
// (ai-gateway/ollama-client.ts), compartilhado pelo sandbox ("Teste sua IA") E
// pelo Copiloto (copiloto.service.ts usa a MESMA callAssistenteOllama). Estes
// testes provam que a cadeia de env PRÓPRIA (HBX_ASSISTENTE_*) e o
// comportamento em erro (sempre lança pro caller cair no roteiro/fallback)
// continuam intactos após a extração do fetch.

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

test('assistenteModel: cadeia HBX_ASSISTENTE_MODEL -> HBX_LLM_CLASSIFIER_MODEL -> default', async () => {
  await withEnv({ HBX_ASSISTENTE_MODEL: 'qwen3:4b', HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b' }, () => {
    assert.equal(assistenteModel(), 'qwen3:4b');
  });
  await withEnv({ HBX_ASSISTENTE_MODEL: undefined, HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b-classificador' }, () => {
    assert.equal(assistenteModel(), 'qwen2.5:7b-classificador');
  });
  await withEnv({ HBX_ASSISTENTE_MODEL: undefined, HBX_LLM_CLASSIFIER_MODEL: undefined }, () => {
    assert.equal(assistenteModel(), 'qwen2.5:7b');
  });
});

test('assistenteTimeoutMs: cadeia HBX_ASSISTENTE_TIMEOUT_MS -> HBX_LLM_CLASSIFIER_TIMEOUT_MS -> 12000', async () => {
  await withEnv({ HBX_ASSISTENTE_TIMEOUT_MS: '5000', HBX_LLM_CLASSIFIER_TIMEOUT_MS: '9000' }, () => {
    assert.equal(assistenteTimeoutMs(), 5000);
  });
  await withEnv({ HBX_ASSISTENTE_TIMEOUT_MS: undefined, HBX_LLM_CLASSIFIER_TIMEOUT_MS: undefined }, () => {
    assert.equal(assistenteTimeoutMs(), 12000);
  });
});

test('assistenteOllamaBaseUrl: compartilhada com o classificador, sem barra final', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_URL: 'http://x:11434/' }, () => {
    assert.equal(assistenteOllamaBaseUrl(), 'http://x:11434');
  });
});

test('assistenteOllamaEnabled: mesma flag do classificador (1 Ollama so)', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true' }, () => assert.equal(assistenteOllamaEnabled(), true));
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: undefined }, () => assert.equal(assistenteOllamaEnabled(), false));
});

test('callAssistenteOllama: IA desligada -> lanca SEM tocar rede (sandbox/Copiloto caem no fallback deles)', async () => {
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: undefined }, async () => {
    let called = false;
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      await assert.rejects(callAssistenteOllama([{ role: 'user', content: 'oi' }]), /classificador IA desligado/);
      assert.equal(called, false);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('callAssistenteOllama: default temperature 0.4 / numPredict 220, SEM campo format (contrato preservado)', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true', HBX_ASSISTENTE_MODEL: 'qwen3:4b' }, async () => {
    let capturedBody: any = null;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ message: { content: 'resposta' } }) };
    };
    try {
      const raw = await callAssistenteOllama([{ role: 'user', content: 'quero saber mais' }], { companyId: 9 });
      assert.equal(raw, 'resposta');
      assert.equal(capturedBody.model, 'qwen3:4b');
      assert.equal(capturedBody.options.temperature, 0.4);
      assert.equal(capturedBody.options.num_predict, 220);
      assert.equal('format' in capturedBody, false);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('callAssistenteOllama: opts.temperature/numPredict/timeoutMs sobrescrevem o default do caller (Copiloto usa isso)', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true' }, async () => {
    let capturedBody: any = null;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ message: { content: '{"rascunho":"oi"}' } }) };
    };
    try {
      await callAssistenteOllama([{ role: 'user', content: 'x' }], { temperature: 0.5, numPredict: 260, actionKey: 'ai_realtime' });
      assert.equal(capturedBody.options.temperature, 0.5);
      assert.equal(capturedBody.options.num_predict, 260);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('callAssistenteOllama: HTTP nao-ok propaga erro pro caller (sandbox cai no roteiro; Copiloto mostra "indisponivel")', async () => {
  AiGatewayService.resetForTest();
  await withEnv({ HBX_LLM_CLASSIFIER_ENABLED: 'true' }, async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    try {
      await assert.rejects(callAssistenteOllama([{ role: 'user', content: 'oi' }]), /Ollama HTTP 503/);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});
