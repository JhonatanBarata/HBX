import test from 'node:test';
import assert from 'node:assert/strict';

import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

function createService(opts?: {
  inboundExists?: boolean;
  conversation?: Record<string, unknown> | null;
  leadExists?: boolean;
  duplicateProviderMessage?: boolean;
  linkCount?: number;
  // PR20072026-CHIP (A3): sessão do senderUserId encontrada no banco (ou null pra simular
  // vendedor sem chip conectado) e modo de atendimento da empresa.
  senderSession?: Record<string, unknown> | null;
  whatsappAttendanceMode?: string;
  // 30/07 (gate do chip morto): estado da linha WhatsAppConnectionSession e leitura do MOTOR
  // AO VIVO. `motorInstances` undefined = motor sem leitura (default dos testes antigos).
  hasLiveSession?: boolean;
  motorInstances?: any[] | null;
}) {
  const outboundCreateCalls: Array<Record<string, unknown>> = [];
  const messageCreateCalls: Array<Record<string, unknown>> = [];
  const conversationUpdateCalls: Array<Record<string, unknown>> = [];
  const conversationLinkCalls: Array<Record<string, unknown>> = [];
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
      updateMany: async (input: Record<string, unknown>) => {
        conversationLinkCalls.push(input);
        return { count: opts?.linkCount ?? 1 };
      },
    },
    vendasLead: {
      findFirst: async () => (opts?.leadExists === false ? null : { id: 'lead-1' }),
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
        whatsappAttendanceMode: opts?.whatsappAttendanceMode ?? 'individual',
      }),
    },
    whatsAppConnectionSession: {
      findFirst: async () => (opts?.senderSession === undefined ? null : opts.senderSession),
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
      create: async ({ data }: any) => {
        if (opts?.duplicateProviderMessage) {
          const error: any = new Error('duplicate');
          error.code = 'P2002';
          throw error;
        }
        return { id: 4001, ...data };
      },
      findUnique: async () => ({
        id: 4001,
        companyId: 7,
        conversationId: 10,
        providerMessageId: 'wamid.duplicate',
      }),
    },
  } as any;

  const webwhatsBridge = {
    hasOperationalSession: async () => opts?.hasLiveSession ?? true,
    // 30/07: `/instance/fetchInstances` (SÓ LEITURA) usado pelo gate do chip morto.
    // null = sem leitura → o gate não recusa por falta de informação.
    listMotorInstances: async () => opts?.motorInstances ?? null,
  } as any;

  return {
    service: new ConversationsService(prisma, webwhatsBridge),
    outboundCreateCalls,
    messageCreateCalls,
    conversationUpdateCalls,
    conversationLinkCalls,
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

test('queueOutboundForCompany links a commercial conversation to the tenant lead before queueing', async () => {
  const { service, conversationLinkCalls } = createService();

  await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Mensagem comercial',
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    messageType: 'text',
    variables: { leadId: 'lead-1' },
  });

  assert.equal(conversationLinkCalls.length, 1);
  assert.equal((conversationLinkCalls[0] as any).where.companyId, 7);
  assert.equal((conversationLinkCalls[0] as any).data.vendasLeadId, 'lead-1');
});

test('queueOutboundForCompany rejects cross-tenant commercial lead links before queueing', async () => {
  const { service, outboundCreateCalls } = createService({ leadExists: false });

  await assert.rejects(
    () => service.queueOutboundForCompany(7, {
      conversationId: 10,
      to: '+55 11 99999-0000',
      body: 'Mensagem comercial',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      messageType: 'text',
      variables: { leadId: 'lead-other-tenant' },
    }),
    /nao pertence a esta empresa/,
  );
  assert.equal(outboundCreateCalls.length, 0);
});

// PR20072026-CHIP (A3): a conversa nasce ÓRFÃ (sem whatsappConnectionSessionId) quando a
// ponte agenda<->vendas cria a shell antes de a sessão do vendedor existir — era essa
// órfã que caía no fallback cego do bridge (chip do dono) no envio real. Aqui o
// companyMessage passa a resolver a identidade via payload.senderUserId quando a conversa
// não tem sessão própria.
test('queueOutboundForCompany (A3): conversa órfã resolve sessão pelo senderUserId e carimba o companyMessage', async () => {
  const { service, messageCreateCalls } = createService({
    inboundExists: true,
    whatsappAttendanceMode: 'individual',
    senderSession: { id: 'session-33', tenantKey: 'company-7-user-33', phoneNormalized: '5511988887777' },
  });

  await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Oi, tudo bem?',
    sourceModule: 'vendas_human',
    senderType: 'human',
    messageType: 'text',
    senderUserId: 33,
  });

  assert.equal(messageCreateCalls.length, 1);
  assert.equal((messageCreateCalls[0] as any).whatsappConnectionSessionId, 'session-33');
  assert.equal((messageCreateCalls[0] as any).sourceTenantKey, 'company-7-user-33');
  assert.equal((messageCreateCalls[0] as any).sourcePhoneNormalized, '5511988887777');
});

test('queueOutboundForCompany (A3): modo individual, senderUserId sem chip conectado — falha fechado (nunca cai pro chip de terceiro)', async () => {
  const { service, outboundCreateCalls } = createService({
    inboundExists: true,
    whatsappAttendanceMode: 'individual',
    senderSession: null,
  });

  await assert.rejects(
    () =>
      service.queueOutboundForCompany(7, {
        conversationId: 10,
        to: '+55 11 99999-0000',
        body: 'Oi',
        sourceModule: 'vendas_human',
        senderType: 'human',
        messageType: 'text',
        senderUserId: 33,
      }),
    /Chip do remetente não está conectado/,
  );
  assert.equal(outboundCreateCalls.length, 0);
});

test('queueOutboundForCompany (A3): modo shared, senderUserId sem sessão própria não é erro (ponteiro da empresa cobre)', async () => {
  const { service, messageCreateCalls } = createService({
    inboundExists: true,
    whatsappAttendanceMode: 'shared',
    senderSession: null,
  });

  await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Oi',
    sourceModule: 'vendas_human',
    senderType: 'human',
    messageType: 'text',
    senderUserId: 33,
  });

  assert.equal(messageCreateCalls.length, 1);
  assert.equal((messageCreateCalls[0] as any).whatsappConnectionSessionId, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 30/07 — GATE DO CHIP MORTO. Cena medida em prod: `Company.whatsappModalStatus`
// congelou em 'CONNECTED' (empresa 5, de 20/07 até 30/07) enquanto o chip estava
// caído; o gate antigo (`if (evolutionChannel && !modalConnected)`) usava essa coluna
// para PULAR a checagem de sessão viva, então cadência/bot/IA/recovery enfileiravam
// contra chip morto e só falhavam no dispatch, queimando retry do outbox.
// ─────────────────────────────────────────────────────────────────────────────

test('VACINA: motor diz chip CAIDO e a coluna da empresa diz CONNECTED — enfileiramento e RECUSADO', async () => {
  const { service, outboundCreateCalls, messageCreateCalls } = createService({
    inboundExists: true,
    // Banco mentindo dos dois lados: coluna CONNECTED (mock padrão) + linha de sessão "viva".
    hasLiveSession: true,
    motorInstances: [{ instance: { instanceName: 'company-7' }, connectionStatus: 'close' }],
  });

  await assert.rejects(
    () =>
      service.queueOutboundForCompany(7, {
        conversationId: 10,
        to: '+55 11 99999-0000',
        body: 'Mensagem contra chip morto',
        sourceModule: 'cadencia_bot',
        senderType: 'bot',
        messageType: 'text',
      }),
    (error: any) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(String(error.message), /WhatsApp desconectado/);
      return true;
    },
  );
  // Nada entrou no outbox → nenhuma tentativa/retry é queimada contra chip morto.
  assert.equal(outboundCreateCalls.length, 0);
  assert.equal(messageCreateCalls.length, 0);
});

test('NAO-REGRESSAO: motor com a instancia open enfileira normalmente', async () => {
  const { service, outboundCreateCalls } = createService({
    inboundExists: true,
    hasLiveSession: true,
    motorInstances: [{ instance: { instanceName: 'company-7-user-6' }, connectionStatus: 'open' }],
  });

  const result = await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Mensagem com chip vivo',
    sourceModule: 'cadencia_bot',
    senderType: 'bot',
    messageType: 'text',
  });

  assert.equal(result.status, 'PENDING');
  assert.equal(outboundCreateCalls.length, 1);
});

test('motor sem leitura (fora do ar) NAO recusa: cai na sessao viva do banco', async () => {
  const { service, outboundCreateCalls } = createService({
    inboundExists: true,
    hasLiveSession: true,
    motorInstances: null,
  });

  const result = await service.queueOutboundForCompany(7, {
    conversationId: 10,
    to: '+55 11 99999-0000',
    body: 'Motor mudo, sessao viva',
    sourceModule: 'atendimento_bot',
    senderType: 'bot',
    messageType: 'text',
  });

  assert.equal(result.status, 'PENDING');
  assert.equal(outboundCreateCalls.length, 1);
});

test('coluna CONNECTED nao abre portao sozinha: sem sessao viva o enqueue e recusado', async () => {
  const { service, outboundCreateCalls } = createService({
    inboundExists: true,
    hasLiveSession: false,
    motorInstances: [{ instance: { instanceName: 'company-7' }, connectionStatus: 'open' }],
  });

  await assert.rejects(
    () =>
      service.queueOutboundForCompany(7, {
        conversationId: 10,
        to: '+55 11 99999-0000',
        body: 'Sem sessao viva',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        messageType: 'text',
      }),
    /nao configurado para esta empresa/,
  );
  assert.equal(outboundCreateCalls.length, 0);
});

test('recordInboundMessage marks provider webhook replays as duplicates', async () => {
  const { service } = createService({ duplicateProviderMessage: true });

  const result = await service.recordInboundMessage({
    companyId: 7,
    from: '+55 11 99999-0000',
    body: 'Oi',
    providerMessageId: 'wamid.duplicate',
  });

  assert.equal(result.isNew, false);
  assert.equal(result.conversationId, 10);
});
