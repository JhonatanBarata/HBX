import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasConversationService } from './vendas-conversation.service';

const USER = {
  id: 9,
  companyId: 7,
  role: 'ADMIN',
  isSystemMaster: false,
};

function createHarness(options: { projectedSnapshot?: any; readOnlySnapshot?: any; leadStatus?: string | null; leadPipelineStage?: string | null } = {}) {
  let writes = 0;
  let rebuilds = 0;
  let readOnlyDerivations = 0;
  const sends: any[] = [];
  const leadUpdates: any[] = [];
  const timelineEvents: any[] = [];
  const conversation = {
    id: 44,
    companyId: 7,
    channel: 'whatsapp',
    contact: '+5511999990000',
    vendasLeadId: 'lead-1',
    vendasLeadLinkedAt: new Date('2026-07-13T12:00:00.000Z'),
    vendasLeadLinkSource: 'explicit_create',
    lastMessageAt: new Date('2026-07-13T12:01:00.000Z'),
    updatedAt: new Date('2026-07-13T12:01:00.000Z'),
  };
  const snapshot = options.projectedSnapshot || {
    conversation: { id: '44', exists: true },
    engagement: {
      state: 'awaiting_reply',
      hasSuccessfulOutbound: true,
      hasInboundMessage: false,
      hasInboundReply: false,
      firstSuccessfulOutboundAt: '2026-07-13T12:01:00.000Z',
      lastOutboundAt: '2026-07-13T12:01:00.000Z',
      lastOutboundStatus: 'SENT',
      lastInboundAt: null,
      lastMessageAt: '2026-07-13T12:01:00.000Z',
      lastMessageDirection: 'outbound',
      lastMessageStatus: 'SENT',
      lastMessagePreview: 'Oi',
      failureReason: null,
    },
  };

  const prisma = {
    user: {
      findUnique: async () => ({
        ...USER,
        isActive: true,
        deactivatedAt: null,
        company: { id: 7, name: 'Empresa', companyKind: 'tenant' },
      }),
    },
    vendasLead: {
      findFirst: async () => ({
        id: 'lead-1',
        companyId: 7,
        assignedUserId: 9,
        createdByUserId: 9,
        name: 'Lead',
        phone: '+5511999990000',
        phoneNormalized: '5511999990000',
        status: options.leadStatus === undefined ? 'novo' : options.leadStatus,
        pipelineStage: options.leadPipelineStage === undefined ? 'prospeccao' : options.leadPipelineStage,
      }),
      findMany: async () => [{ id: 'lead-1' }],
      updateMany: async (args: any) => {
        leadUpdates.push(args);
        return { count: 1 };
      },
    },
    vendasLeadTimelineEvent: {
      createMany: async (args: any) => {
        timelineEvents.push(args);
        return { count: 1 };
      },
    },
    companyConversation: {
      findFirst: async ({ where }: any) => where?.vendasLeadId === 'lead-1' ? conversation : null,
      findMany: async () => [],
      update: async () => {
        writes += 1;
        return conversation;
      },
      create: async () => {
        writes += 1;
        return conversation;
      },
    },
    vendasLeadCockpitState: { findUnique: async () => null },
    vendasAutomationJob: { findFirst: async () => null },
    companyMessage: { findMany: async () => [] },
  } as any;
  const inbox = {
    sendMessage: async (...args: any[]) => {
      sends.push(args);
      return {};
    },
  } as any;
  const projector = {
    getCockpitStatesForLeads: async () => new Map([['lead-1', snapshot]]),
    getCockpitStateForLeadReadOnly: async () => {
      readOnlyDerivations += 1;
      return options.readOnlySnapshot || snapshot;
    },
    rebuildLead: async () => {
      rebuilds += 1;
      return snapshot;
    },
  } as any;

  const webwhatsBridge = { listMotorInstances: async () => [] } as any;

  return {
    service: new VendasConversationService(prisma, inbox, projector, webwhatsBridge),
    get writes() { return writes; },
    get rebuilds() { return rebuilds; },
    get readOnlyDerivations() { return readOnlyDerivations; },
    sends,
    leadUpdates,
    timelineEvents,
  };
}

test('abrir conversa vinculada e uma leitura pura', async () => {
  const harness = createHarness();
  const result = await harness.service.getConversationForUser({ ...USER }, 'lead-1');

  assert.equal(result.conversation.id, '44');
  assert.equal(result.engagement.state, 'awaiting_reply');
  assert.equal(harness.writes, 0);
  assert.equal(harness.rebuilds, 0);
  assert.equal(harness.sends.length, 0);
});

test('GET deriva estado atual sem escrita quando a projeção persistida aponta para outra conversa', async () => {
  const harness = createHarness({
    projectedSnapshot: {
      conversation: { id: null, exists: false },
      engagement: { state: 'no_conversation' },
    },
    readOnlySnapshot: {
      conversation: { id: '44', exists: true },
      engagement: {
        state: 'failed',
        lastMessageStatus: 'FAILED',
        failureReason: 'provider down',
      },
    },
  });

  const result = await harness.service.getConversationForUser({ ...USER }, 'lead-1');

  assert.equal(result.conversation.id, '44');
  assert.equal(result.engagement.state, 'failed');
  assert.equal(result.engagement.failureReason, 'provider down');
  assert.equal(harness.readOnlyDerivations, 1);
  assert.equal(harness.writes, 0);
  assert.equal(harness.rebuilds, 0);
});

test('envio pelo Vendas permanece humano e entra pela outbox do Inbox', async () => {
  const harness = createHarness();
  await harness.service.sendMessageForUser({ ...USER }, 'lead-1', '  Olá  ');

  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0][1], 44);
  assert.equal(harness.sends[0][2], 'Olá');
  assert.equal(harness.sends[0][3].sourceModule, 'vendas_human');
  assert.equal(harness.sends[0][3].variables.purpose, 'human_reply');
  assert.equal(harness.rebuilds, 1);
});

// ============================================================================
// VACINA DA CENA MEDIDA EM PROD (06/08/2026, empresa 5): Tagliágua, Bella Água e
// J Água Mineral receberam WhatsApp de verdade em 30/07 (Message OUTBOUND
// `vendas_human`, conversa vinculada) e uma semana depois os 3 cards seguiam em
// "Sem contato" — status novo, attemptCount 0, lastContactAt NULL. Resultado
// prático: a vendedora reenvia pra quem já recebeu (= máquina de ban) e o
// relatório de leads trabalhados marca ZERO num dia inteiro de trabalho.
// ============================================================================

test('envio manual MOVE o card: novo → "Contato feito", com lastContactAt e tentativa', async () => {
  const harness = createHarness();
  await harness.service.sendMessageForUser({ ...USER }, 'lead-1', 'Bom dia, tudo bem?');

  assert.equal(harness.leadUpdates.length, 1, 'o envio TEM que marcar o lead');
  const update = harness.leadUpdates[0];
  assert.equal(update.data.status, 'contato');
  assert.ok(update.data.lastContactAt instanceof Date, 'lastContactAt é o que o relatório lê');
  assert.deepEqual(update.data.attemptCount, { increment: 1 });
  assert.equal(update.where.id, 'lead-1');
  assert.equal(update.where.companyId, 7);
  assert.equal(update.where.status, 'novo', 'trava de corrida: só move se ainda estiver em novo');

  assert.equal(harness.timelineEvents.length, 1, 'a ficha mostra POR QUE o card andou');
  assert.equal(harness.timelineEvents[0].data[0].statusTo, 'contato');
});

test('envio manual nunca REBAIXA: lead que já respondeu fica em "Respondeu"', async () => {
  const harness = createHarness({
    leadStatus: 'retorno',
    projectedSnapshot: {
      conversation: { id: '44', exists: true },
      engagement: { state: 'replied', hasInboundReply: true },
    },
  });
  await harness.service.sendMessageForUser({ ...USER }, 'lead-1', 'Oi, consigo te ligar hoje?');

  const update = harness.leadUpdates[0];
  assert.equal(update.data.status, undefined, 'retorno não volta pra contato');
  assert.equal(update.data.attemptCount, undefined, 'quem já respondeu não é mais "tentativa"');
  assert.ok(update.data.lastContactAt instanceof Date, 'mas a data do último contato é fato');
  assert.equal(harness.timelineEvents.length, 0, 'card não andou = sem evento de etapa');
});

test('marca de contato é best-effort: falhar nela NÃO transforma envio feito em erro', async () => {
  const harness = createHarness();
  (harness as any).service['prisma'].vendasLead.updateMany = async () => {
    throw new Error('banco caiu depois do envio');
  };

  await harness.service.sendMessageForUser({ ...USER }, 'lead-1', 'Bom dia');
  assert.equal(harness.sends.length, 1, 'a mensagem saiu — o vendedor não pode ver "falhou" e reenviar');
});

// PR20072026-CHIP (A4): a shell da conversa nascia ÓRFÃ (sem whatsappConnectionSessionId)
// quando o vendedor não tinha sessão 'active' no banco — causa raiz do vazamento 20/07
// (a shell órfã caiu no fallback cego do bridge no envio, chip do dono). resolveCreationSession
// agora recusa criar a shell órfã em modo INDIVIDUAL, mas confere o MOTOR AO VIVO antes de
// recusar (a causa real era drift banco x motor: sessão 'open' no motor, não 'active' no banco).
function buildCreationSessionHarness(options: {
  companyRow: any;
  sessionRow?: any;
  motorInstances?: any[];
}) {
  const prisma = {
    company: {
      findUnique: async () => options.companyRow,
    },
    whatsAppConnectionSession: {
      findFirst: async () => options.sessionRow ?? null,
    },
  } as any;
  const webwhatsBridge = {
    listMotorInstances: async () => options.motorInstances ?? [],
  } as any;
  return new VendasConversationService(prisma, {} as any, {} as any, webwhatsBridge) as any;
}

test('resolveCreationSession (individual, sem sessão no banco e motor fechado): falha fechado, não cria shell órfã', async () => {
  const service = buildCreationSessionHarness({
    companyRow: { whatsappAttendanceMode: 'individual', whatsappStatus: 'CONNECTED', currentWhatsappConnectionSessionId: null },
    sessionRow: null,
    motorInstances: [], // motor não reporta nenhuma instância aberta pro vendedor
  });

  await assert.rejects(
    () => service.resolveCreationSession({ companyId: 5, userId: 33 }, { id: 'lead-x', assignedUserId: 33 }),
    /Chip do vendedor não conectado/,
  );
});

test('resolveCreationSession (individual, drift banco x motor): banco não tem sessão mas motor mostra open — tolera, não falha', async () => {
  const service = buildCreationSessionHarness({
    companyRow: { whatsappAttendanceMode: 'individual', whatsappStatus: 'DISCONNECTED', currentWhatsappConnectionSessionId: null },
    sessionRow: null, // banco diz que não há sessão active (o drift real do incidente)
    motorInstances: [
      { instance: { instanceName: 'company-5-user-33', state: 'open' } },
    ],
  });

  const session = await service.resolveCreationSession({ companyId: 5, userId: 33 }, { id: 'lead-x', assignedUserId: 33 });
  assert.equal(session, null);
});

test('resolveCreationSession (individual, sessão resolvível no banco): usa a sessão do vendedor normalmente', async () => {
  const sessionRow = { id: 'session-33', tenantKey: 'company-5-user-33', phoneNormalized: '5511999990000' };
  const service = buildCreationSessionHarness({
    companyRow: { whatsappAttendanceMode: 'individual', whatsappStatus: 'CONNECTED', currentWhatsappConnectionSessionId: null },
    sessionRow,
  });

  const session = await service.resolveCreationSession({ companyId: 5, userId: 33 }, { id: 'lead-x', assignedUserId: 33 });
  assert.equal(session?.id, 'session-33');
});

test('resolveCreationSession (shared): comportamento do ponteiro da empresa não muda (sem sessão do vendedor não é bug)', async () => {
  const service = buildCreationSessionHarness({
    companyRow: { whatsappAttendanceMode: 'shared', whatsappStatus: 'CONNECTED', currentWhatsappConnectionSessionId: null },
    sessionRow: null,
  });

  // Não deve nem consultar o motor em modo shared — comportamento preservado (isMetaConnected
  // cobre o caso, aqui simulado por whatsappStatus CONNECTED).
  const session = await service.resolveCreationSession({ companyId: 5, userId: 33 }, { id: 'lead-x', assignedUserId: 33 });
  assert.equal(session, null);
});
