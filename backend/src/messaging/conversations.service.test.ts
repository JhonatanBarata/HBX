import test from 'node:test';
import assert from 'node:assert/strict';

import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

function createService(opts?: {
  inboundExists?: boolean;
  conversation?: Record<string, unknown> | null;
}) {
  const outboundCreateCalls: Array<Record<string, unknown>> = [];
  const messageCreateCalls: Array<Record<string, unknown>> = [];
  const conversationUpdateCalls: Array<Record<string, unknown>> = [];
  const conversation = opts?.conversation ?? {
    id: 10,
    companyId: 7,
    channel: 'whatsapp',
    contact: '+5511999990000',
    metadata: null,
  };

  const tx = {
    outboundMessage: {
      create: async ({ data }: any) => {
        outboundCreateCalls.push(data);
        return { id: 1001, ...data };
      },
    },
    companyMessage: {
      create: async ({ data }: any) => {
        messageCreateCalls.push(data);
        return { id: 2001, ...data };
      },
    },
    companyConversation: {
      update: async (input: Record<string, unknown>) => {
        conversationUpdateCalls.push(input);
        return input;
      },
    },
  };

  const prisma = {
    $executeRawUnsafe: async () => undefined,
    $transaction: async (callback: any) => callback(tx),
    hasTable: async () => false,
    hasColumn: async () => false,
    company: {
      findUnique: async () => ({
        id: 7,
        name: 'Empresa Teste',
        whatsappConnectionMode: 'TEMPORARY',
        whatsappModalStatus: 'CONNECTED',
        useMasterWhatsAppToken: false,
      }),
    },
    companyConversation: {
      findFirst: async () => conversation,
      findMany: async () => (conversation ? [conversation] : []),
      update: async (input: Record<string, unknown>) => ({ ...(conversation || {}), ...(input as any).data }),
      upsert: async () => conversation,
    },
    companyMessage: {
      findFirst: async ({ where }: any) => {
        if (where?.direction === 'INBOUND' && opts?.inboundExists) {
          return { id: 3001, timestamp: new Date() };
        }
        return null;
      },
    },
  } as any;

  return {
    service: new ConversationsService(prisma),
    outboundCreateCalls,
    messageCreateCalls,
    conversationUpdateCalls,
  };
}

test('queueOutboundForCompany blocks non-prospection bot from starting a WhatsApp conversation', async () => {
  const { service, outboundCreateCalls } = createService({ inboundExists: false });

  await assert.rejects(
    () =>
      service.queueOutboundForCompany(7, {
        conversationId: 10,
        to: '+55 11 99999-0000',
        body: 'Mensagem automatica',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        messageType: 'text',
      }),
    (error: any) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(String(error.message), /Bot nao pode iniciar conversa/);
      return true;
    },
  );
  assert.equal(outboundCreateCalls.length, 0);
});

test('queueOutboundForCompany allows atendimento bot after customer inbound exists', async () => {
  const { service, outboundCreateCalls, messageCreateCalls } = createService({ inboundExists: true });

  const result = await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Resposta automatica',
    sourceModule: 'atendimento_bot',
    senderType: 'bot',
    messageType: 'text',
  });

  assert.equal(result.status, 'PENDING');
  assert.equal(outboundCreateCalls.length, 1);
  assert.equal(messageCreateCalls.length, 1);
  assert.equal((messageCreateCalls[0] as any).senderType, 'bot');
});

test('queueOutboundForCompany reserves conversation start for explicit prospection bot modules', async () => {
  const { service, outboundCreateCalls } = createService({ inboundExists: false });

  const result = await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Mensagem de prospeccao autorizada',
    sourceModule: 'prospeccao_bot',
    senderType: 'bot',
    messageType: 'text',
  });

  assert.equal(result.status, 'PENDING');
  assert.equal(outboundCreateCalls.length, 1);
});
