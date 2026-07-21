import test from 'node:test';
import assert from 'node:assert/strict';

// S01 (MOTOR-ÚNICO) — caracterização do claim idempotente da assistente
// (ConversationAssistantRuntimeService.prepareReply). Congela: (1) claim
// duplicado (P2002) nunca produz segunda resposta; (2) conversa já assumida
// por humano (`humanAssigned:true`) nunca é respondida pela IA; (3) empresa
// sem `botArmedAt` (nao entitled) nunca é respondida pela IA.
//
// Mesmo estilo do vizinho backend/src/assistente/conversation-assistant-runtime.service.test.ts
// (node:test + mocks manuais de Prisma, sem framework novo, sem rede real).

import { ConversationAssistantRuntimeService } from '../../assistente/conversation-assistant-runtime.service';

function withRuntimeFlag<T>(value: string | undefined, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.HBX_ASSISTENTE_PUBLISH_ENABLED;
  if (value == null) delete process.env.HBX_ASSISTENTE_PUBLISH_ENABLED;
  else process.env.HBX_ASSISTENTE_PUBLISH_ENABLED = value;
  return callback().finally(() => {
    if (previous == null) delete process.env.HBX_ASSISTENTE_PUBLISH_ENABLED;
    else process.env.HBX_ASSISTENTE_PUBLISH_ENABLED = previous;
  });
}

function basePrisma(overrides: Record<string, any> = {}) {
  return {
    assistenteConfig: {
      findUnique: async () => ({
        nome: 'Lia',
        tom: 'normal',
        perfil: 'vendas',
        produtos: 'ERP',
        empresaNome: 'Empresa 7',
        fluxoJson: '{}',
        published: true,
      }),
    },
    company: { findUnique: async () => ({ botArmedAt: new Date() }) },
    companyConversation: {
      findFirst: async () => ({ id: 10, botActive: true, humanAssigned: false, vendasLeadId: 'lead-1' }),
    },
    conversationAssistantRun: {
      create: async () => ({ id: 'run-1' }),
      updateMany: async () => ({ count: 1 }),
    },
    companyMessage: { findMany: async () => [] },
    ...overrides,
  };
}

test('claim P2002 (outro processo ja assumiu) marca duplicate e nao chama o modelo', async () => withRuntimeFlag('true', async () => {
  let sandboxCalls = 0;
  const prisma = basePrisma({
    conversationAssistantRun: {
      create: async () => {
        const error: any = new Error('unique constraint');
        error.code = 'P2002';
        throw error;
      },
      updateMany: async () => ({ count: 0 }),
    },
  });
  const service = new ConversationAssistantRuntimeService(prisma as any, {
    reply: async () => {
      sandboxCalls += 1;
      return { reply: 'nao deveria responder', source: 'test' };
    },
  } as any);

  const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

  assert.equal(result.handled, true);
  assert.equal(result.handled && result.duplicate, true);
  assert.equal(result.handled && result.reason, 'assistant_reply_already_claimed');
  assert.equal(sandboxCalls, 0, 'claim duplicado nao deve gerar uma segunda chamada ao modelo');
}));

test('conversa ja com humano designado (humanAssigned:true) nao e respondida pela IA', async () => withRuntimeFlag('true', async () => {
  let claimCalls = 0;
  let sandboxCalls = 0;
  const prisma = basePrisma({
    companyConversation: {
      findFirst: async () => ({ id: 10, botActive: true, humanAssigned: true, vendasLeadId: 'lead-1' }),
    },
    conversationAssistantRun: {
      create: async () => {
        claimCalls += 1;
        return { id: 'run-1' };
      },
      updateMany: async () => ({ count: 1 }),
    },
  });
  const service = new ConversationAssistantRuntimeService(prisma as any, {
    reply: async () => {
      sandboxCalls += 1;
      return { reply: 'nao deveria responder', source: 'test' };
    },
  } as any);

  const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

  assert.equal(result.handled, false);
  assert.equal(result.handled === false && result.reason, 'assistant_conversation_inactive');
  assert.equal(claimCalls, 0, 'nao deve nem tentar reivindicar (claim) quando ha humano designado');
  assert.equal(sandboxCalls, 0);
}));

test('empresa sem botArmedAt (nao entitled) nao e respondida pela IA', async () => withRuntimeFlag('true', async () => {
  let claimCalls = 0;
  const prisma = basePrisma({
    company: { findUnique: async () => ({ botArmedAt: null }) },
    conversationAssistantRun: {
      create: async () => {
        claimCalls += 1;
        return { id: 'run-1' };
      },
      updateMany: async () => ({ count: 1 }),
    },
  });
  const service = new ConversationAssistantRuntimeService(prisma as any, {} as any);

  const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

  assert.equal(result.handled, false);
  assert.equal(result.handled === false && result.reason, 'assistant_not_entitled');
  assert.equal(claimCalls, 0, 'sem botArmedAt nao deve nem tentar reivindicar (claim)');
}));
