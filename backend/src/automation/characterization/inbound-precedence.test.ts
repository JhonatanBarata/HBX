import test from 'node:test';
import assert from 'node:assert/strict';

// S01 (MOTOR-ÚNICO) — caracterização do trecho messaging.service.ts:10040-10169.
// Objetivo: CONGELAR a ordem/precedência atual de quem responde um inbound
// humano (interrupt -> cadência -> assistente IA -> atendimento/menu), para que
// S06/S10 (InboundRouterService) consigam refatorar sem mudar comportamento.
//
// Estilo de mock copiado dos vizinhos (node:test + mocks manuais, sem
// framework novo): backend/src/assistente/conversation-assistant-runtime.service.test.ts
// e backend/src/cadencia/cadencia-gatilho.service.test.ts.
//
// Estratégia: `Object.create(MessagingService.prototype)` (mesmo truque do
// cadencia-gatilho.service.test.ts) para chamar o método privado
// `processPersistedInbound` de verdade, SEM instanciar a classe inteira nem
// tocar rede/WhatsApp/Prisma real. Mock só nas bordas (commercialContactControl,
// conversations, conversationAssistant, findRecoveryCustomerByPhone,
// handleAtendimentoInbound, logWhatsAppEvent) — a decisão de precedência em si
// (o corpo de processPersistedInbound) roda sem alteração.

import { MessagingService } from '../../messaging/messaging.service';
import { normalizeWhatsAppPhone } from '../../messaging/whatsapp-channel';

type ServiceOptions = {
  assistantEnabled?: boolean;
  assistantResult?: any;
  recoveryCustomer?: any;
  atendimentoResult?: any;
  queueOutboundResult?: any;
  queueOutboundThrows?: boolean;
};

function makeService(opts: ServiceOptions = {}) {
  const calls: string[] = [];
  const interruptArgs: any[] = [];
  const cadenciaArgs: any[] = [];
  const assistantPrepareArgs: any[] = [];
  const atendimentoArgs: any[] = [];
  const queueOutboundArgs: any[] = [];
  const markQueuedArgs: any[] = [];
  const markQueueFailedArgs: any[] = [];

  const svc: any = Object.create(MessagingService.prototype);

  svc.logger = { log() {}, warn() {}, error() {} };
  svc.logWhatsAppEvent = async () => {};

  svc.commercialContactControl = {
    interruptForInbound: async (input: any) => {
      calls.push('interrupt');
      interruptArgs.push(input);
    },
  };

  svc.conversations = {
    dispatchVendasCockpitProjection: async () => {},
    dispatchCadenciaInbound: async (input: any) => {
      calls.push('cadencia');
      cadenciaArgs.push(input);
    },
    queueOutboundForCompany: async (companyId: number, payload: any) => {
      calls.push('queue_outbound');
      queueOutboundArgs.push({ companyId, payload });
      if (opts.queueOutboundThrows) throw new Error('queue_failed');
      return opts.queueOutboundResult ?? { outboundMessageId: 999 };
    },
  };

  const assistantEnabled = opts.assistantEnabled ?? true;
  svc.conversationAssistant = assistantEnabled
    ? {
        prepareReply: async (input: any) => {
          calls.push('assistant');
          assistantPrepareArgs.push(input);
          return opts.assistantResult ?? { handled: false, reason: 'assistant_not_published' };
        },
        markQueued: async (input: any) => {
          calls.push('assistant_mark_queued');
          markQueuedArgs.push(input);
        },
        markQueueFailed: async (input: any) => {
          calls.push('assistant_mark_queue_failed');
          markQueueFailedArgs.push(input);
        },
      }
    : null;

  svc.findRecoveryCustomerByPhone = async () => opts.recoveryCustomer ?? null;

  svc.handleAtendimentoInbound = async (input: any) => {
    calls.push('atendimento');
    atendimentoArgs.push(input);
    return opts.atendimentoResult ?? { handled: true };
  };

  // Fora do escopo da precedência sob teste (recovery-fallback/legacy) — as
  // suítes abaixo sempre terminam em `atendimentoResult.handled: true`, então
  // este caminho nunca é exercitado; existe só para não quebrar se algum caso
  // futuro cair aqui.
  svc.resolveAtendimentoBotSanitizationContext = async () => ({ recoveryEnabled: false });
  svc.handleRecoveryInbound = async () => {
    calls.push('recovery');
  };

  return {
    svc,
    calls,
    interruptArgs,
    cadenciaArgs,
    assistantPrepareArgs,
    atendimentoArgs,
    queueOutboundArgs,
    markQueuedArgs,
    markQueueFailedArgs,
  };
}

function buildInput(overrides: Partial<Record<string, any>> = {}) {
  return {
    company: { id: 7, name: 'Empresa 7', timezone: 'America/Sao_Paulo' },
    from: '5511988887777',
    text: 'Oi, tudo bem?',
    inboundType: 'text',
    rawPayload: {},
    timestamp: new Date('2026-07-20T12:00:00.000Z'),
    externalMessageId: 'ext-1',
    inboundRow: { id: 55, conversationId: 10 },
    scope: 'webhook',
    provider: 'meta',
    sourceModule: 'atendimento',
    ...overrides,
  };
}

// a. Assistente publicado+armado+botActive -> assistente responde; atendimento NÃO é chamado.
test('assistente handled com reply responde e NAO chama o atendimento', async () => {
  const { svc, calls, atendimentoArgs, queueOutboundArgs, markQueuedArgs } = makeService({
    assistantResult: {
      handled: true,
      runId: 'run-1',
      reply: 'Posso ajudar!',
      publicName: 'Lia',
      source: 'ollama',
      vendasLeadId: 'lead-1',
    },
  });

  const result = await svc.processPersistedInbound(buildInput());

  assert.equal(result.matched, true);
  assert.equal(result.source, 'conversation_assistant');
  assert.equal(result.assistantRunId, 'run-1');
  assert.equal(atendimentoArgs.length, 0, 'atendimento nao deve ser chamado quando a IA respondeu');
  assert.equal(queueOutboundArgs.length, 1, 'resposta da IA deve ser enfileirada via queueOutboundForCompany');
  assert.equal(queueOutboundArgs[0].payload.sourceModule, 'conversation_assistant');
  assert.equal(markQueuedArgs.length, 1);
  assert.ok(calls.includes('assistant'));
});

// b. Assistente handled:true duplicate:true -> atendimento NÃO é chamado (sem resposta dupla).
test('claim duplicado da assistente nao produz resposta dupla nem chama atendimento', async () => {
  const { svc, atendimentoArgs, queueOutboundArgs } = makeService({
    assistantResult: { handled: true, duplicate: true, reason: 'assistant_reply_already_claimed' },
  });

  const result = await svc.processPersistedInbound(buildInput());

  assert.equal(result.matched, true);
  assert.equal(result.source, 'conversation_assistant');
  assert.equal(result.duplicate, true);
  assert.equal(atendimentoArgs.length, 0);
  assert.equal(queueOutboundArgs.length, 0, 'duplicate nao tem reply/runId prontos para enfileirar');
});

// c. Assistente não publicado (prepareReply handled:false) -> cai no atendimento.
test('assistente nao publicado cai no atendimento', async () => {
  const { svc, atendimentoArgs, calls } = makeService({
    assistantResult: { handled: false, reason: 'assistant_not_published' },
    atendimentoResult: { handled: true },
  });

  const result = await svc.processPersistedInbound(buildInput());

  assert.equal(result.matched, true);
  assert.equal(result.source, 'atendimento');
  assert.equal(atendimentoArgs.length, 1);
  assert.ok(calls.indexOf('assistant') < calls.indexOf('atendimento'));
});

// d. recoveryCustomer presente -> assistente NEM é consultado; atendimento/recovery trata.
test('recoveryCustomer presente pula a assistente e vai direto pro atendimento/recovery', async () => {
  const { svc, calls, atendimentoArgs } = makeService({
    recoveryCustomer: { id: 321, name: 'Cliente em cobranca' },
    atendimentoResult: { handled: true, delegatedToRecovery: true },
  });

  const result = await svc.processPersistedInbound(buildInput());

  assert.equal(result.matched, true);
  assert.equal(result.source, 'hbx_recovery');
  assert.equal(result.customerId, 321);
  assert.ok(!calls.includes('assistant'), 'assistente nao deve ser consultada quando ha recoveryCustomer');
  assert.equal(atendimentoArgs.length, 1);
  assert.equal(atendimentoArgs[0].recoveryCustomer?.id, 321);
});

// e. Inbound não-humano (auto-reply de prospecção classificado) -> nem cadência nem assistente.
test('auto-reply de prospeccao classificado nao aciona interrupt/cadencia/assistente', async () => {
  const { svc, calls } = makeService({
    atendimentoResult: { handled: true },
  });

  const result = await svc.processPersistedInbound(
    buildInput({ text: 'Esta e uma mensagem automatica de ausencia, em breve retornamos.' }),
  );

  assert.equal(result.matched, true);
  assert.ok(!calls.includes('interrupt'), 'auto-reply classificado nao deve invalidar contato comercial');
  assert.ok(!calls.includes('cadencia'), 'auto-reply classificado nao deve disparar gatilhos de cadencia');
  assert.ok(!calls.includes('assistant'), 'auto-reply classificado nao deve acionar a assistente');
});

// f. interruptForInbound é chamado ANTES de qualquer resposta, com o messageId certo.
test('interruptForInbound e chamado primeiro, com o messageId do inbound', async () => {
  const { svc, calls, interruptArgs } = makeService({
    assistantResult: {
      handled: true,
      runId: 'run-9',
      reply: 'Oi!',
      publicName: 'Lia',
      source: 'ollama',
    },
  });

  await svc.processPersistedInbound(buildInput());

  assert.equal(calls[0], 'interrupt');
  assert.equal(interruptArgs.length, 1);
  assert.equal(interruptArgs[0].inboundMessageId, 55);
  assert.equal(interruptArgs[0].companyId, 7);
  assert.equal(interruptArgs[0].from, normalizeWhatsAppPhone('5511988887777'));
  assert.ok(calls.indexOf('interrupt') < calls.indexOf('cadencia'));
  assert.ok(calls.indexOf('interrupt') < calls.indexOf('assistant'));
});

// Cobertura extra (dentro do espírito do item f): cadência sempre roda em
// paralelo (fire-and-forget) para inbound humano válido, mesmo quando quem
// acaba respondendo é a assistente.
test('dispatchCadenciaInbound roda para inbound humano valido antes da assistente decidir', async () => {
  const { svc, calls, cadenciaArgs } = makeService({
    assistantResult: { handled: false, reason: 'assistant_not_published' },
    atendimentoResult: { handled: true },
  });

  await svc.processPersistedInbound(buildInput({ text: 'Quero saber mais sobre o produto' }));

  assert.equal(cadenciaArgs.length, 1);
  assert.equal(cadenciaArgs[0].companyId, 7);
  assert.equal(cadenciaArgs[0].conversationId, 10);
  assert.ok(calls.indexOf('cadencia') < calls.indexOf('assistant'));
});
