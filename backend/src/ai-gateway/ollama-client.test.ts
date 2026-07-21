import test from 'node:test';
import assert from 'node:assert/strict';

import { callOllamaChat, OllamaGatewayRefusedError } from './ollama-client';
import { AiGatewayService } from './ai-gateway.service';

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

function mockFetch(handler: (url: string, init: any) => { ok: boolean; status?: number; body?: unknown }) {
  const originalFetch = global.fetch;
  let capturedUrl = '';
  let capturedBody: any = null;
  (global as any).fetch = async (url: string, init: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    const result = handler(url, init);
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 500), json: async () => result.body };
  };
  return {
    restore: () => {
      (global as any).fetch = originalFetch;
    },
    getUrl: () => capturedUrl,
    getBody: () => capturedBody,
  };
}

/**
 * S05B — cliente Ollama único (backend/src/ai-gateway/ollama-client.ts). Prova
 * o contrato que os 3 chamadores (concierge/assistente/classificador) agora
 * herdam: 1 fetch a `${baseUrl}/api/chat`, passando pelo GOVERNOR-IA, com
 * erro SEMPRE lançado pro caller decidir o fallback (nunca engolido aqui).
 */

test('callOllamaChat: monta o body com model/temperature/numPredict/format do CALLER e bate na URL certa', async () => {
  AiGatewayService.resetForTest();
  const mock = mockFetch(() => ({ ok: true, body: { message: { content: 'oi' } } }));
  try {
    const reply = await callOllamaChat({
      baseUrl: 'http://host.docker.internal:11434/',
      model: 'qwen2.5:7b',
      timeoutMs: 9000,
      messages: [{ role: 'user', content: 'ping' }],
      format: 'json',
      temperature: 0.1,
      numPredict: 80,
    });
    assert.equal(reply, 'oi');
    assert.equal(mock.getUrl(), 'http://host.docker.internal:11434/api/chat', 'barra final do baseUrl removida');
    const body = mock.getBody();
    assert.equal(body.model, 'qwen2.5:7b');
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.format, 'json');
    assert.equal(body.options.temperature, 0.1);
    assert.equal(body.options.num_predict, 80);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'ping' }]);
  } finally {
    mock.restore();
  }
});

test('callOllamaChat: sem `format` no caller -> body NAO tem o campo (contrato do assistente/Copiloto)', async () => {
  AiGatewayService.resetForTest();
  const mock = mockFetch(() => ({ ok: true, body: { message: { content: 'ok' } } }));
  try {
    await callOllamaChat({
      baseUrl: 'http://host.docker.internal:11434',
      model: 'qwen2.5:7b',
      timeoutMs: 12000,
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.4,
      numPredict: 220,
    });
    const body = mock.getBody();
    assert.equal('format' in body, false);
  } finally {
    mock.restore();
  }
});

test('callOllamaChat: resposta sem message.content -> string vazia (nunca undefined/null)', async () => {
  AiGatewayService.resetForTest();
  const mock = mockFetch(() => ({ ok: true, body: {} }));
  try {
    const reply = await callOllamaChat({
      baseUrl: 'http://x:11434',
      model: 'm',
      timeoutMs: 5000,
      messages: [],
      temperature: 0.1,
      numPredict: 10,
    });
    assert.equal(reply, '');
  } finally {
    mock.restore();
  }
});

test('callOllamaChat: HTTP nao-ok -> lanca Error("Ollama HTTP <status>") pro caller tratar', async () => {
  AiGatewayService.resetForTest();
  const mock = mockFetch(() => ({ ok: false, status: 503 }));
  try {
    await assert.rejects(
      callOllamaChat({ baseUrl: 'http://x:11434', model: 'm', timeoutMs: 5000, messages: [], temperature: 0.1, numPredict: 10 }),
      /Ollama HTTP 503/,
    );
  } finally {
    mock.restore();
  }
});

// Recusa-cedo por ORÇAMENTO (mesma técnica de ai-gateway.service.test.ts "RECUSA-CEDO por
// orçamento condenado"): 1 slot ocupado por um job "longo" + TYPICAL_MS alto faz a espera
// prevista do 2º pedido estourar o budget dele -> refusa ANTES de entrar na fila/bater na rede.
const REFUSAL_ENV = {
  HBX_AI_GATEWAY_ENABLED: 'true',
  HBX_AI_GATEWAY_REALTIME_CONCURRENCY: '1',
  HBX_AI_GATEWAY_REALTIME_MAX_QUEUE: '32',
  HBX_AI_GATEWAY_REALTIME_TYPICAL_MS: '5000',
};

test('callOllamaChat: governor recusa (orçamento condenado) -> lanca OllamaGatewayRefusedError, NUNCA chama fetch', async () => {
  await withEnv(REFUSAL_ENV, async () => {
    AiGatewayService.resetForTest();
    let fetchCalls = 0;
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      fetchCalls += 1;
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, status: 200, json: async () => ({ message: { content: 'devagar' } }) };
    };
    try {
      const first = callOllamaChat({
        baseUrl: 'http://x:11434',
        model: 'm',
        timeoutMs: 999999,
        messages: [],
        temperature: 0.1,
        numPredict: 10,
      });
      await new Promise((r) => setTimeout(r, 10)); // garante que o 1º pegou o slot
      await assert.rejects(
        callOllamaChat({
          baseUrl: 'http://x:11434',
          model: 'm',
          timeoutMs: 3000, // orçamento apertado: espera prevista (5000) + típico (5000) > 3000
          messages: [],
          temperature: 0.1,
          numPredict: 10,
        }),
        (error: unknown) => error instanceof OllamaGatewayRefusedError,
      );
      await first;
      assert.equal(fetchCalls, 1, 'a chamada recusada NUNCA chega a bater na rede');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('callOllamaChat: `refusedMessage` do caller vira o texto da excecao de recusa', async () => {
  await withEnv(REFUSAL_ENV, async () => {
    AiGatewayService.resetForTest();
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, status: 200, json: async () => ({ message: { content: 'devagar' } }) };
    };
    try {
      const first = callOllamaChat({ baseUrl: 'http://x:11434', model: 'm', timeoutMs: 999999, messages: [], temperature: 0.1, numPredict: 10 });
      await new Promise((r) => setTimeout(r, 10));
      await assert.rejects(
        callOllamaChat({
          baseUrl: 'http://x:11434',
          model: 'm',
          timeoutMs: 3000,
          messages: [],
          temperature: 0.1,
          numPredict: 10,
          refusedMessage: 'governor recusou a chamada de IA (fila cheia) — caindo no fluxo por chips',
        }),
        /caindo no fluxo por chips/,
      );
      await first;
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});
