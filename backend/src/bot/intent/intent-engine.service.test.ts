import test from 'node:test';
import assert from 'node:assert/strict';

import { IntentEngineService } from './intent-engine.service';
import { AiIntentClassifierService } from './ai-intent-classifier.service';

/**
 * INTENTENGINE Sprint 2 — cobertura da lógica REAL de `classifyAtendimentoAction`
 * (prompt/parse/timeout/trava de confiança), mockando `global.fetch` — sem rede,
 * sem Ollama de verdade. Os testes de integração com `handleAtendimentoInbound`
 * (mockando o `IntentEngineService` inteiro) vivem em
 * `../../messaging/messaging.service.test.ts`.
 */

const ACTIONS = [
  { actionId: 'schedule_service', title: 'Agendar com Glauco', description: 'Mostra horarios livres.' },
  { actionId: 'talk_human', title: 'Falar com atendente', description: 'Encaminha para fila humana.' },
];

function createIntentDecisionRecorder() {
  const calls: Array<Record<string, unknown>> = [];
  const prisma = {
    intentDecision: {
      create: async ({ data }: any) => {
        calls.push(data);
        return { id: calls.length, ...data };
      },
    },
  } as any;
  return { prisma, calls };
}

function mockFetchOnce(handler: () => { ok: boolean; status?: number; body?: unknown }) {
  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    const result = handler();
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: async () => result.body,
    } as any;
  };
  return () => {
    (global as any).fetch = originalFetch;
  };
}

test('classifyAtendimentoAction: flag desligada nunca chama a rede e devolve null', async () => {
  delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  const { prisma, calls } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  let fetchCalled = false;
  const restore = mockFetchOnce(() => {
    fetchCalled = true;
    return { ok: true, body: { message: { content: '{"acao":"talk_human","confianca":0.9}' } } };
  });
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'quero falar com alguém',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
    assert.equal(fetchCalled, false, 'com a flag off a rede nunca deve ser chamada');
    assert.equal(calls.length, 0, 'sem flag ligada não há decisão para gravar');
  } finally {
    restore();
  }
});

test('classifyAtendimentoAction: rótulo dentro do catálogo com confiança alta é aceito', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  process.env.HBX_ATENDIMENTO_NLU_MIN_CONF = '0.75';
  const { prisma, calls } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({
    ok: true,
    body: { message: { content: '{"acao":"talk_human","confianca":0.92}' } },
  }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'quero falar com alguém',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.deepEqual(result, { actionId: 'talk_human', confidence: 0.92 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].flow, 'atendimento');
    assert.equal(calls[0].label, 'talk_human');
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
    delete process.env.HBX_ATENDIMENTO_NLU_MIN_CONF;
  }
});

test('classifyAtendimentoAction: confiança abaixo do limiar devolve null mas grava a decisão descartada', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  process.env.HBX_ATENDIMENTO_NLU_MIN_CONF = '0.75';
  const { prisma, calls } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({
    ok: true,
    body: { message: { content: '{"acao":"talk_human","confianca":0.3}' } },
  }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'sei la',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
    assert.equal(calls.length, 1, 'decisão descartada por baixa confiança ainda é gravada (dataset de calibração)');
    assert.match(String(calls[0].label), /:descartado$/);
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
    delete process.env.HBX_ATENDIMENTO_NLU_MIN_CONF;
  }
});

test('classifyAtendimentoAction: actionId fora do catálogo enviado é descartado (null)', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const { prisma, calls } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({
    ok: true,
    body: { message: { content: '{"acao":"acao_inventada_fora_do_catalogo","confianca":0.95}' } },
  }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'texto qualquer',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].label, 'sem_match:descartado');
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('classifyAtendimentoAction: JSON inválido do LLM devolve null', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const { prisma } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({
    ok: true,
    body: { message: { content: 'isso não é json nenhum' } },
  }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'texto qualquer',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('classifyAtendimentoAction: HTTP de erro (Ollama indisponível) devolve null sem lançar', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const { prisma } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({ ok: false, status: 503, body: {} }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'texto qualquer',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('classifyAtendimentoAction: exceção de rede (timeout) devolve null sem lançar', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const { prisma } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    throw new Error('timeout simulado');
  };
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'texto qualquer',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(result, null);
  } finally {
    (global as any).fetch = originalFetch;
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('classifyAtendimentoAction: sem texto ou sem ações disponíveis devolve null sem chamar rede', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const { prisma } = createIntentDecisionRecorder();
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  let fetchCalled = false;
  const restore = mockFetchOnce(() => {
    fetchCalled = true;
    return { ok: true, body: { message: { content: '{"acao":"talk_human","confianca":0.9}' } } };
  });
  try {
    const emptyText = await service.classifyAtendimentoAction({
      text: '   ',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    const emptyActions = await service.classifyAtendimentoAction({
      text: 'quero falar com alguém',
      actions: [],
      context: { companyId: 7, conversationId: 42 },
    });
    assert.equal(emptyText, null);
    assert.equal(emptyActions, null);
    assert.equal(fetchCalled, false);
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('classifyAtendimentoAction: falha ao gravar IntentDecision não quebra a classificação (best-effort)', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  const prisma = {
    intentDecision: {
      create: async () => {
        throw new Error('banco indisponível');
      },
    },
  } as any;
  const service = new IntentEngineService(prisma, new AiIntentClassifierService());

  const restore = mockFetchOnce(() => ({
    ok: true,
    body: { message: { content: '{"acao":"talk_human","confianca":0.92}' } },
  }));
  try {
    const result = await service.classifyAtendimentoAction({
      text: 'quero falar com alguém',
      actions: ACTIONS,
      context: { companyId: 7, conversationId: 42 },
    });
    assert.deepEqual(result, { actionId: 'talk_human', confidence: 0.92 });
  } finally {
    restore();
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});
