import test from 'node:test';
import assert from 'node:assert/strict';

import { ConversationAssistantRuntimeService } from './conversation-assistant-runtime.service';

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

test('assistente usa o nome público configurado pelo tenant', async () => withRuntimeFlag('true', async () => {
  let receivedConfig: any = null;
  const sandbox: any = {
    reply: async (config: any) => {
      receivedConfig = config;
      return { reply: 'Olá, posso ajudar?', source: 'test' };
    },
  };
  const service = new ConversationAssistantRuntimeService(basePrisma() as any, sandbox);

  const result = await service.prepareReply({
    companyId: 7,
    conversationId: 10,
    inboundMessageId: 55,
    text: 'Oi',
  });

  assert.equal(result.handled, true);
  assert.equal(result.handled && result.publicName, 'Lia');
  assert.equal(receivedConfig.nome, 'Lia');
}));

test('claim duplicado suprime uma segunda resposta e não chama o modelo', async () => withRuntimeFlag('true', async () => {
  let replyCalls = 0;
  const prisma = basePrisma({
    conversationAssistantRun: {
      create: async () => {
        const error: any = new Error('unique');
        error.code = 'P2002';
        throw error;
      },
      updateMany: async () => ({ count: 0 }),
    },
  });
  const service = new ConversationAssistantRuntimeService(prisma as any, {
    reply: async () => {
      replyCalls += 1;
      return { reply: 'não deveria', source: 'test' };
    },
  } as any);

  const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

  assert.equal(result.handled, true);
  assert.equal(result.handled && result.duplicate, true);
  assert.equal(replyCalls, 0);
}));

test('flag desligada não reivindica mensagem nem altera conversa', async () => withRuntimeFlag(undefined, async () => {
  let databaseCalls = 0;
  const service = new ConversationAssistantRuntimeService({
    assistenteConfig: { findUnique: async () => { databaseCalls += 1; return null; } },
  } as any, {} as any);

  const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

  assert.deepEqual(result, { handled: false, reason: 'assistant_runtime_disabled' });
  assert.equal(databaseCalls, 0);
}));
