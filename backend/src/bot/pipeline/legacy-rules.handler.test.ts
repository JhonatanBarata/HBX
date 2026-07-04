import test from 'node:test';
import assert from 'node:assert/strict';

import { LegacyRulesInboundHandler } from './legacy-rules.handler';
import type { InboundContext } from './inbound-handler';

// INTENTENGINE Sprint 5 (PR-1) — testes de CARACTERIZAÇÃO do trecho legado extraído
// (session orchestrator + AutoReplyRule) de `MessagingService.processPersistedInbound`.
//
// Estes testes fixam os EFEITOS observáveis do trecho: transições de estado da sessão, o
// que é gravado em inboundMessage, o que é enfileirado em outbound (corpo/ordem/módulo), o
// agendamento (nextAttemptAt) e o shape de retorno. Devem passar IDÊNTICOS antes e depois
// da extração — são a rede de segurança do 1:1.

type Session = { id: number; state: string };

function buildCtx(overrides?: Partial<InboundContext>): InboundContext {
  return {
    company: { id: 7, name: 'HBX Solutions', timezone: 'America/Sao_Paulo' },
    companyId: 7,
    from: '5519999999999',
    text: 'oi',
    inboundType: 'text',
    conversationId: 42,
    inboundRow: { id: 501, conversationId: 42 },
    timestamp: new Date('2026-07-03T12:00:00.000Z'),
    scope: 'webhook',
    provider: 'WHATSAPP_CLOUD',
    sourceModule: 'whatsapp_webhook',
    rawPayload: undefined,
    externalMessageId: null,
    ...(overrides || {}),
  };
}

function buildDeps(opts?: {
  session?: Session;
  decision?: any;
  rules?: any[];
}) {
  const session: Session = opts?.session ?? { id: 900, state: 'NEW' };

  const sessionUpdateCalls: Array<{ sessionId: number; patch: any }> = [];
  const draftUpsertCalls: Array<Record<string, unknown>> = [];
  const inboundCreateCalls: Array<Record<string, unknown>> = [];
  const outboundUpdateCalls: Array<Record<string, unknown>> = [];
  const queueCalls: Array<{ companyId: number; payload: Record<string, unknown> }> = [];

  const sessions = {
    getOrCreateActiveSession: async () => session,
    updateSession: async (sessionId: number, patch: any) => {
      sessionUpdateCalls.push({ sessionId, patch });
      return { ...session, ...patch };
    },
  } as any;

  const orchestrator = {
    decide: (_input: { state: string; text: string }) =>
      opts?.decision ?? { nextState: session.state, reply: null, draftItems: null, context: undefined },
  } as any;

  const drafts = {
    upsertForSession: async (input: Record<string, unknown>) => {
      draftUpsertCalls.push(input);
      return { id: 1 };
    },
  } as any;

  let outboundSeq = 1000;
  const conversations = {
    queueOutboundForCompany: async (companyId: number, payload: Record<string, unknown>) => {
      queueCalls.push({ companyId, payload });
      return { outboundMessageId: outboundSeq++, conversationId: 42 };
    },
  } as any;

  const prisma = {
    inboundMessage: {
      create: async ({ data }: any) => {
        inboundCreateCalls.push(data);
        return { id: 1, ...data };
      },
    },
    autoReplyRule: {
      findMany: async () => opts?.rules ?? [],
    },
    outboundMessage: {
      update: async (input: Record<string, unknown>) => {
        outboundUpdateCalls.push(input);
        return input;
      },
    },
  } as any;

  const handler = new LegacyRulesInboundHandler(prisma, sessions, orchestrator, drafts, conversations);

  return {
    handler,
    session,
    sessionUpdateCalls,
    draftUpsertCalls,
    inboundCreateCalls,
    outboundUpdateCalls,
    queueCalls,
  };
}

test('legacy-rules: decision.reply enfileira 1 outbound "atendimento" e retorna enqueued:1', async () => {
  const deps = buildDeps({
    session: { id: 900, state: 'NEW' },
    decision: { nextState: 'AWAITING_MENU', reply: 'Olá!', draftItems: null, context: undefined },
  });

  const res = await deps.handler.handle(buildCtx({ text: 'oi' }));

  // transição de estado gravada (nextState != session.state)
  assert.deepEqual(deps.sessionUpdateCalls, [{ sessionId: 900, patch: { state: 'AWAITING_MENU' } }]);
  // inboundMessage gravado com companyId/from/body
  assert.deepEqual(deps.inboundCreateCalls, [{ companyId: 7, from: '5519999999999', body: 'oi' }]);
  // 1 outbound enfileirado, sourceModule atendimento, sem agendamento (sem at)
  assert.equal(deps.queueCalls.length, 1);
  assert.deepEqual(deps.queueCalls[0], {
    companyId: 7,
    payload: { to: '5519999999999', body: 'Olá!', sourceModule: 'atendimento', messageType: 'text' },
  });
  // reply não passa pelo caminho de outboundMessage.update
  assert.equal(deps.outboundUpdateCalls.length, 0);
  assert.deepEqual(res, { handled: true, result: { matched: true, sessionId: 900, state: 'AWAITING_MENU', enqueued: 1 } });
});

test('legacy-rules: draftItems chama drafts.upsertForSession antes do inbound.create', async () => {
  const deps = buildDeps({
    session: { id: 901, state: 'AWAITING_MENU' },
    decision: {
      nextState: 'AWAITING_CONFIRMATION',
      reply: 'Recebi seu pedido, confirma?',
      draftItems: { rawText: 'quero 2' },
      context: undefined,
    },
  });

  await deps.handler.handle(buildCtx({ text: 'quero 2' }));

  assert.deepEqual(deps.draftUpsertCalls, [{ companyId: 7, sessionId: 901, items: { rawText: 'quero 2' } }]);
  assert.deepEqual(deps.inboundCreateCalls, [{ companyId: 7, from: '5519999999999', body: 'quero 2' }]);
});

test('legacy-rules: sem reply e sem regra casada retorna matched:false com sessionId/state', async () => {
  const deps = buildDeps({
    session: { id: 902, state: 'NEW' },
    decision: { nextState: 'NEW', reply: null, draftItems: null, context: undefined },
    rules: [],
  });

  const res = await deps.handler.handle(buildCtx({ text: 'qualquer coisa' }));

  // sem transição de estado
  assert.equal(deps.sessionUpdateCalls.length, 0);
  // inbound ainda é gravado
  assert.deepEqual(deps.inboundCreateCalls, [{ companyId: 7, from: '5519999999999', body: 'qualquer coisa' }]);
  // nada enfileirado
  assert.equal(deps.queueCalls.length, 0);
  assert.deepEqual(res, { handled: true, result: { matched: false, sessionId: 902, state: 'NEW' } });
});

test('legacy-rules: AutoReplyRule casada (CONTAINS) enfileira responses em ordem e agenda por delaySeconds', async () => {
  const deps = buildDeps({
    session: { id: 903, state: 'NEW' },
    decision: { nextState: 'NEW', reply: null, draftItems: null, context: undefined },
    rules: [
      {
        id: 55,
        matchType: 'CONTAINS',
        pattern: 'preço',
        caseInsensitive: true,
        responses: [
          { order: 1, delaySeconds: 0, template: 'Segue o {{companyName}}' },
          { order: 0, delaySeconds: 5, template: '{{greeting}}!' },
        ],
      },
    ],
  });

  const res = await deps.handler.handle(buildCtx({ text: 'Qual o PREÇO?' }));

  // 2 responses, ORDENADAS por order (0 antes de 1)
  assert.equal(deps.queueCalls.length, 2);
  // primeiro o order:0 (greeting), depois order:1 (companyName)
  assert.equal(deps.queueCalls[0].payload.body, `${greetingFor('America/Sao_Paulo')}!`);
  assert.equal(deps.queueCalls[0].payload.sourceModule, 'atendimento');
  assert.equal(deps.queueCalls[0].payload.messageType, 'text');
  assert.ok(deps.queueCalls[0].payload.at instanceof Date, 'payload.at deve ser Date (agendado)');
  assert.equal(deps.queueCalls[1].payload.body, 'Segue o HBX Solutions');
  // cada outbound enfileirado recebe outboundMessage.update com nextAttemptAt
  assert.equal(deps.outboundUpdateCalls.length, 2);
  for (const call of deps.outboundUpdateCalls) {
    assert.ok((call as any).data?.nextAttemptAt instanceof Date);
  }
  assert.deepEqual(res, {
    handled: true,
    result: { matched: true, ruleId: 55, sessionId: 903, state: 'NEW', enqueued: 2 },
  });
});

test('legacy-rules: EXACT respeita caseInsensitive:false (não casa se caixa difere)', async () => {
  const deps = buildDeps({
    session: { id: 904, state: 'NEW' },
    decision: { nextState: 'NEW', reply: null, draftItems: null, context: undefined },
    rules: [
      { id: 60, matchType: 'EXACT', pattern: 'MENU', caseInsensitive: false, responses: [{ order: 0, delaySeconds: 0, template: 'x' }] },
    ],
  });

  const res = await deps.handler.handle(buildCtx({ text: 'menu' }));

  assert.equal(deps.queueCalls.length, 0);
  assert.deepEqual(res, { handled: true, result: { matched: false, sessionId: 904, state: 'NEW' } });
});

// Reproduz o cálculo de cumprimento exatamente como computeGreeting(timezone) do serviço,
// para o teste não depender do horário do relógio da máquina de CI.
function greetingFor(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
