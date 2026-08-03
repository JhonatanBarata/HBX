import test from 'node:test';
import assert from 'node:assert/strict';

import { MessagingService } from './messaging.service';
import { AiIntentClassifierService } from '../bot/intent/ai-intent-classifier.service';
import { IntentEngineService } from '../bot/intent/intent-engine.service';
import { DEFAULT_ATENDIMENTO_AGENDA_CONFIG, DEFAULT_ATENDIMENTO_BOT_CONFIG } from '../inbox/atendimento-config';
import { BotConfigStoreService } from '../bot/config/bot-config-store.service';
import { VendasContactSuppressionService } from '../vendas/vendas-contact-suppression.service';
import { extractSlotsDeterministic } from '../concierge/recepcionista-slots';

// PR05072026 (timing humano): pina o piso de silêncio da fase 1 em 0 para este
// arquivo de teste inteiro — sem isso, cada teste que passa por
// handleVendasAutomationInbound esperaria de verdade 2-6s reais (setTimeout), o
// que deixaria a suíte lenta sem testar nada de novo (a ordem/clamp das fases já
// tem cobertura isolada e determinística em vendas/prospecting-bot-timing.test.ts).
// Host/worktree não têm `.env` carregado neste processo de teste — pinar aqui.
process.env.HBX_PROSPECTING_SILENCE_FLOOR_MIN_MS = '0';
process.env.HBX_PROSPECTING_SILENCE_FLOOR_MAX_MS = '0';

const COMPLETED_ATENDIMENTO_BOT_CONFIG = {
  ...DEFAULT_ATENDIMENTO_BOT_CONFIG,
  setup: {
    completed: true,
    completedAt: '2026-04-15T10:00:00.000Z',
    botType: 'vendas',
    channelMode: 'QR',
    provider: 'evolution',
    configuredFrom: 'test',
  },
  routingRules: {
    ...DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules,
    globalBotEnabled: true,
  },
};

function createService(overrides?: Partial<Record<string, any>>) {
  const queueCalls: Array<Record<string, unknown>> = [];
  const conversationStateCalls: Array<Record<string, unknown>> = [];
  const auditCalls: Array<Record<string, unknown>> = [];
  const companyMessageUpdateCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    hasTable: async () => false,
    hasColumn: async () => false,
    company: {
      findFirst: async ({ where }: any) => {
        if (String(where?.whatsappPhoneNumberId || '') === 'phone-number-id') {
          return { id: 7, whatsappPhoneNumberId: 'phone-number-id' };
        }
        return null;
      },
      findUnique: async ({ where }: any) => ({
        id: Number(where?.id || 7),
        name: 'HBX Solutions',
        timezone: 'America/Sao_Paulo',
      }),
    },
    companyConversation: {
      findFirst: async () => null,
    },
    companyMessage: {
      count: async () => 0,
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 501, ...data }),
      update: async (input: Record<string, unknown>) => {
        companyMessageUpdateCalls.push(input);
        return input;
      },
    },
    atendimentoCustomer: {
      findUnique: async () => null,
    },
    atendimentoAppointment: {
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => ({ id: 1, ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    hbxRecoveryFlowStage: {
      findFirst: async () => null,
    },
    // BotConfig vazio por padrão nos testes: o BotConfigStoreService cai no fallback
    // legado (hbxRecoveryFlowStage acima) — mesmo comportamento de antes da migração,
    // simulando uma empresa ainda não migrada (dual-read).
    botConfig: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: any) => ({ id: 'bot-config-test', ...data }),
    },
    // ENTREVISTA no lugar do pino botArmedAt (31/07/2026): o entitlement da IA
    // comercial lê a casa. Default = completa (empresa liberada); o teste de
    // "sem entitlement" sobrepõe com null.
    vendasComercialConfig: {
      findUnique: async () => ({
        aiNome: 'Lia',
        aiIdentidade: 'nome_proprio',
        aiUserId: null,
        empresaFazTexto: 'Vendemos solucoes de gestao.',
        catalogoJson: JSON.stringify({
          oQueVendemos: 'Sistema de gestao',
          capacidades: [{ ganho: 'Organiza vendas', resolve: ['bagunca'] }],
          paraQuem: ['PMEs'],
          ancoraDePreco: null,
        }),
      }),
    },
    ...(overrides?.prisma || {}),
  } as any;

  // INTENTENGINE S3: instancia o store REAL sobre o prisma mockado — os testes que
  // mockam hbxRecoveryFlowStage continuam valendo via fallback legado do dual-read,
  // sem duplicar a lógica de leitura aqui.
  const botConfigStore = overrides?.botConfigStore ?? new BotConfigStoreService(prisma);

  const conversations = {
    queueOutboundForCompany: async (companyId: number, payload: Record<string, unknown>) => {
      queueCalls.push({ companyId, payload });
      return { outboundMessageId: 999, conversationId: payload.conversationId || 42 };
    },
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, unknown>) => {
      conversationStateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    ...(overrides?.conversations || {}),
  } as any;

  const audit = {
    log: async (payload: Record<string, unknown>) => {
      auditCalls.push(payload);
    },
    ...(overrides?.audit || {}),
  } as any;

  const inboxRealtime = {
    publish: () => undefined,
    subscribe: () => () => undefined,
    ...(overrides?.inboxRealtime || {}),
  } as any;

  const service = new MessagingService(
    prisma,
    (overrides?.sessions || {}) as any,
    (overrides?.orchestrator || {}) as any,
    (overrides?.drafts || {}) as any,
    conversations,
    audit,
    (overrides?.mercadoPagoClient || {}) as any,
    (overrides?.cadastrosService || {}) as any,
    (overrides?.customerProfileService || {}) as any,
    ({ sendText: async () => undefined, ...(overrides?.webwhatsBridge || {}) } as any),
    inboxRealtime,
    (overrides?.intentEngine || new IntentEngineService(prisma, new AiIntentClassifierService())) as any,
    // GATEWAY-WA S3: freio de envio. Default nos testes = passa tudo (flag OFF na prática) —
    // não muda o comportamento coberto pelos casos existentes.
    ({ evaluate: async () => ({ allow: true, reason: 'disabled' }), getStats: () => ({}), ...(overrides?.waSendThrottle || {}) } as any),
    (overrides?.hbxPresentationEmails || undefined) as any,
    botConfigStore as any,
  );

  return {
    service,
    prisma,
    queueCalls,
    conversationStateCalls,
    auditCalls,
    companyMessageUpdateCalls,
  };
}

function buildVendasEmailJob(overrides?: Record<string, any>) {
  return {
    id: 'job-email-1',
    companyId: 7,
    campaignId: 'campaign-1',
    leadId: 'lead-1',
    status: 'sent',
    campaign: {
      id: 'campaign-1',
      segment: 'clinicas',
      positiveIntentKeywordsJson: null,
      negativeIntentKeywordsJson: null,
      filtersJson: null,
    },
    lead: {
      id: 'lead-1',
      companyId: 7,
      customerProfileId: 'profile-1',
      name: 'Joao Cliente',
      phone: '+5519998877766',
      phoneNormalized: '5519998877766',
      email: null,
      segment: 'clinicas',
      status: 'contato',
    },
    ...(overrides || {}),
  };
}

function buildHbxDelivery(overrides?: Record<string, any>) {
  return {
    ok: true,
    sentAt: '2026-05-08T19:00:00.000Z',
    recipientName: 'Joao Cliente',
    recipientEmail: 'contato@empresa.com.br',
    subject: 'Apresentacao HBX System',
    attachment: { originalName: 'apresentacao-hbx.pptx', uploadedAt: '2026-05-01T10:00:00.000Z', size: 123 },
    businessCard: null,
    copyRecipients: ['barataimports@gmail.com'],
    delivery: {
      ok: true,
      queued: true,
      transport: 'resend',
      previewUrl: null,
      messageId: 'resend_xxx',
      accepted: ['contato@empresa.com.br', 'barataimports@gmail.com'],
      rejected: [],
      from: 'HBX <jhonatan@hbxsystem.com.br>',
      replyTo: null,
      errorCode: null,
      errorMessage: null,
    },
    sentBy: null,
    source: 'bot',
    ...(overrides || {}),
  };
}

test('handleVendasAutomationInbound sends HBX presentation by email and schedules 48 business hours follow-up', async () => {
  const metadata = {
    cliente: 'Joao Cliente',
    vendasAgendaQueue: {
      active: true,
      leadId: 'lead-1',
      sourceModule: 'vendas',
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      status: 'contato',
    },
  };
  const sendCalls: Array<Record<string, unknown>> = [];
  const profileUpdates: Array<Record<string, unknown>> = [];
  const leadUpdates: Array<Record<string, unknown>> = [];
  const inboundMetaCalls: Array<Record<string, unknown>> = [];
  const { service, queueCalls, conversationStateCalls } = createService({
    prisma: {
      vendasAutomationJob: {
        findFirst: async () => buildVendasEmailJob(),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify(metadata),
        }),
      },
      customerProfile: {
        findFirst: async () => ({ id: 'profile-1', notes: 'Nota antiga' }),
        update: async (input: Record<string, unknown>) => {
          profileUpdates.push(input);
          return input;
        },
      },
      vendasLead: {
        update: async (input: Record<string, unknown>) => {
          leadUpdates.push(input);
          return input;
        },
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    },
    hbxPresentationEmails: {
      sendPresentationToContact: async (input: Record<string, unknown>) => {
        sendCalls.push(input);
        return buildHbxDelivery();
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 88,
    from: '+55 19 99887-7766',
    text: 'Pode mandar no meu email contato@empresa.com.br',
    timestamp: new Date('2026-05-08T19:00:00.000Z'),
    metadata,
    setInboundMeta: async (sourceModule: string, isComplaint: boolean) => {
      inboundMetaCalls.push({ sourceModule, isComplaint });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.classification, 'email_sent');
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].recipientEmail, 'contato@empresa.com.br');
  assert.equal(sendCalls[0].recipientName, 'Joao Cliente');
  assert.equal(queueCalls.length, 1);
  assert.match(String((queueCalls[0].payload as any).body), /Acabei de enviar/);
  assert.equal(conversationStateCalls.length, 1);
  const nextMetadata = (conversationStateCalls[0].payload as any).metadata;
  assert.equal(nextMetadata.hbxEmailFlow.status, 'sent');
  assert.equal(nextMetadata.hbxEmailFlow.messageId, 'resend_xxx');
  assert.equal(nextMetadata.vendasAgendaQueue.status, 'email_enviado');
  assert.equal(nextMetadata.vendasAgendaQueue.returnAt, '2026-05-18T13:00:00.000Z');
  assert.equal(nextMetadata.vendasAgendaQueue.draftMessage, 'Oi {{nome}}, tudo bem? Conseguiu ver a apresentação do HBX que te enviei por e-mail?');
  assert.equal((profileUpdates[0] as any).data.email, 'contato@empresa.com.br');
  assert.match(String((profileUpdates[0] as any).data.notes), /Apresentacao HBX enviada por e-mail/);
  assert.equal((leadUpdates[0] as any).data.email, 'contato@empresa.com.br');
  assert.equal((leadUpdates[0] as any).data.returnAt.toISOString(), '2026-05-18T13:00:00.000Z');
  assert.equal(inboundMetaCalls[0].sourceModule, 'vendas_prospeccao_email_enviado');
});

test('handleVendasAutomationInbound asks for email when intent has no address', async () => {
  const metadata = {
    vendasAgendaQueue: { active: true, leadId: 'lead-1', sourceModule: 'vendas' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    },
    hbxPresentationEmails: {
      sendPresentationToContact: async () => {
        throw new Error('should not send without email');
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 89,
    from: '+55 19 99887-7766',
    text: 'Pode mandar por email?',
    timestamp: new Date('2026-05-06T13:00:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'email_missing');
  assert.equal(queueCalls.length, 1);
  assert.equal((queueCalls[0].payload as any).body, 'Perfeito. Qual e-mail devo usar para te enviar a apresentação do HBX?');
  assert.equal((queueCalls[0].payload as any).flowState.metadata.hbxEmailFlow.status, 'awaiting_email');
});

test('handleVendasAutomationInbound asks for a valid email when candidate is invalid', async () => {
  const metadata = {
    vendasAgendaQueue: { active: true, leadId: 'lead-1', sourceModule: 'vendas' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 90,
    from: '+55 19 99887-7766',
    text: 'email: contato@empresa',
    timestamp: new Date('2026-05-06T13:00:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'email_invalid');
  assert.equal((queueCalls[0].payload as any).body, 'Esse e-mail parece invalido. Pode me passar o e-mail completo para envio?');
  assert.deepEqual((queueCalls[0].payload as any).flowState.metadata.hbxEmailFlow.invalidEmailCandidates, ['contato@empresa']);
});

test('handleVendasAutomationInbound suppresses recent duplicate HBX email send', async () => {
  const metadata = {
    hbxEmailFlow: {
      status: 'sent',
      recipientEmail: 'contato@empresa.com.br',
      sentAt: '2026-05-06T12:30:00.000Z',
    },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', sourceModule: 'vendas' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    },
    hbxPresentationEmails: {
      sendPresentationToContact: async () => {
        throw new Error('duplicate should not send');
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 91,
    from: '+55 19 99887-7766',
    text: 'manda no contato@empresa.com.br',
    timestamp: new Date('2026-05-06T13:00:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'email_duplicate_recent');
  assert.equal(queueCalls.length, 1);
  assert.match(String((queueCalls[0].payload as any).body), /já foi enviada/);
});

test('handleVendasAutomationInbound routes to human when email provider fails', async () => {
  const metadata = {
    vendasAgendaQueue: { active: true, leadId: 'lead-1', sourceModule: 'vendas' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
    },
    hbxPresentationEmails: {
      sendPresentationToContact: async () => buildHbxDelivery({
        ok: false,
        delivery: {
          ...buildHbxDelivery().delivery,
          ok: false,
          messageId: null,
          errorCode: 'MAIL_DISABLED_LOCALLY',
          errorMessage: 'Email logged locally.',
        },
      }),
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 92,
    from: '+55 19 99887-7766',
    text: 'me envia no email contato@empresa.com.br',
    timestamp: new Date('2026-05-06T13:00:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'email_failed');
  assert.equal(queueCalls.length, 1);
  assert.equal((queueCalls[0].payload as any).flowState.humanAssigned, true);
  assert.match(String((queueCalls[0].payload as any).body), /problema para enviar/);
});

test('handleVendasAutomationInbound marks explicit negative on lead without moving queue', async () => {
  const metadata = {
    humanAssigned: true,
    vendasAutomation: {
      jobId: 'job-email-1',
      leadId: 'lead-1',
      status: 'neutral',
      humanAssigned: true,
    },
    vendasAgendaQueue: {
      active: true,
      leadId: 'lead-1',
      automationJobId: 'job-email-1',
      queueTarget: 'atendimento',
      routeTarget: 'atendimento',
      humanAssigned: true,
    },
    vendasProspeccao: {
      stage: 'reply_received',
    },
  };
  const jobUpdates: Array<Record<string, unknown>> = [];
  const leadUpdates: Array<Record<string, unknown>> = [];
  const timelineEvents: Array<Record<string, unknown>> = [];
  const inboundMetaCalls: Array<Record<string, unknown>> = [];
  const tx = {
    vendasAutomationJob: {
      updateMany: async (input: Record<string, unknown>) => {
        jobUpdates.push(input);
        return { count: (input as any)?.where?.id === 'job-email-1' ? 1 : 0 };
      },
    },
    vendasLead: {
      updateMany: async (input: Record<string, unknown>) => {
        leadUpdates.push(input);
        return { count: 1 };
      },
    },
    vendasLeadTimelineEvent: {
      createMany: async (input: Record<string, unknown>) => {
        timelineEvents.push(input);
        return { count: 1 };
      },
    },
  };
  const { service, conversationStateCalls } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
      vendasAutomationJob: {
        findFirst: async () => buildVendasEmailJob(),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify(metadata),
        }),
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 93,
    from: '+55 19 99887-7766',
    text: 'Não tenho interesse, obrigada',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async (sourceModule: string, isComplaint: boolean) => {
      inboundMetaCalls.push({ sourceModule, isComplaint });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.classification, 'negative');
  assert.equal(inboundMetaCalls[0].sourceModule, 'vendas_prospeccao_negativo');
  assert.equal(jobUpdates.length, 2);
  assert.equal((jobUpdates[0] as any).data.status, 'replied_negative');
  assert.equal((leadUpdates[0] as any).data.status, 'encerrado');
  assert.equal((leadUpdates[0] as any).data.outcome, 'no_interest');
  assert.equal(timelineEvents.length, 1);
  assert.equal(conversationStateCalls.length, 1);
  const nextState = conversationStateCalls[0].payload as any;
  assert.equal(nextState.flowResult, 'prospection_negative');
  assert.equal(nextState.metadata.queueTarget, undefined);
  assert.equal(nextState.metadata.routeTarget, undefined);
  assert.equal(nextState.metadata.inboxManualQueueOverride, undefined);
  assert.equal(nextState.metadata.inboxLocalDeleted, undefined);
  assert.equal(nextState.metadata.doNotContact, true);
  assert.equal(nextState.metadata.optOut, false);
  assert.equal(nextState.metadata.blacklisted, false);
  assert.equal(nextState.metadata.vendasAutomation.outcome, 'no_interest');
  assert.equal(nextState.metadata.vendasProspeccao.stage, 'negative_reply');
});

// INTENTENGINE S1: migrado de vendas-automation.service.test.ts (cópia morta
// classifyProspectingInbound deletada). O caminho VIVO é handleVendasAutomationInbound.
test('handleVendasAutomationInbound treats bot menu as auto-reply, not negative', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1' },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const jobUpdates: Array<Record<string, any>> = [];
  const leadUpdates: Array<Record<string, any>> = [];
  const inboundMetaCalls: Array<Record<string, unknown>> = [];
  const { service, conversationStateCalls } = createService({
    prisma: {
      vendasAutomationJob: {
        findFirst: async () => buildVendasEmailJob(),
        update: async (input: Record<string, any>) => {
          jobUpdates.push(input);
          return input;
        },
        updateMany: async (input: Record<string, any>) => {
          jobUpdates.push(input);
          return { count: 0 };
        },
      },
      vendasLead: {
        update: async (input: Record<string, any>) => {
          leadUpdates.push(input);
          return input;
        },
        updateMany: async (input: Record<string, any>) => {
          leadUpdates.push(input);
          return { count: 1 };
        },
      },
      companyConversation: {
        findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }),
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 1,
    from: '+5519998877766',
    text: 'Olá, eu sou a Ivet. Digite o número correspondente para selecionar uma das opções.',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async (sourceModule: string, isComplaint: boolean) => {
      inboundMetaCalls.push({ sourceModule, isComplaint });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.classification, 'bot_menu_detected');
  assert.equal(inboundMetaCalls[0].sourceModule, 'vendas_prospeccao_auto_reply');
  assert.ok(jobUpdates.some((call) => call.data?.classification === 'bot_menu_detected'));
  assert.equal(jobUpdates.some((call) => call.data?.status === 'replied_negative'), false);
  assert.equal(leadUpdates.length, 0, 'auto-reply nao movimenta pipeline');
  assert.equal(conversationStateCalls.length, 1);
  assert.equal((conversationStateCalls[0].payload as any).flowResult, 'prospection_auto_reply');
  assert.equal((conversationStateCalls[0].payload as any).metadata.vendasProspeccao.stage, 'sent_waiting');
});

test('handleVendasAutomationInbound turns explicit no-interest into opt-out block', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1' },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const jobUpdates: Array<Record<string, any>> = [];
  const inboundMetaCalls: Array<Record<string, unknown>> = [];
  const tx = {
    vendasAutomationJob: {
      updateMany: async (input: Record<string, any>) => {
        jobUpdates.push(input);
        return { count: input?.where?.id === 'job-email-1' ? 1 : 0 };
      },
    },
    vendasLead: { updateMany: async () => ({ count: 1 }) },
    vendasLeadTimelineEvent: { createMany: async () => ({ count: 1 }) },
  };
  const { service } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
      vendasAutomationJob: {
        findFirst: async () => buildVendasEmailJob(),
      },
      companyConversation: {
        findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }),
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 1,
    from: '+5519998877766',
    text: 'Não tenho interesse, por favor remover.',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async (sourceModule: string, isComplaint: boolean) => {
      inboundMetaCalls.push({ sourceModule, isComplaint });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.classification, 'opt_out');
  assert.equal(inboundMetaCalls[0].sourceModule, 'vendas_prospeccao_opt_out');
  assert.ok(
    jobUpdates.some((call) => call.data?.status === 'replied_negative' && call.data?.classification === 'opt_out'),
  );
});

test('inbound humano avanca somente prospeccao para qualificacao e mantem legado em contato', async () => {
  const leadCalls: any[] = [];
  const timelineCalls: any[] = [];
  const tx = {
    vendasLead: {
      updateMany: async (input: any) => {
        leadCalls.push(input);
        return { count: 1 };
      },
    },
    vendasLeadTimelineEvent: {
      createMany: async (input: any) => {
        timelineCalls.push(input);
        return { count: 1 };
      },
    },
  };
  const { service } = createService();

  assert.equal(await (service as any).advanceVendasLeadFromProspectingOnHumanInbound(tx, {
    companyId: 7,
    leadId: 'lead-1',
    jobId: 'job-1',
    inboundMessageId: 900,
    lastResult: 'Interesse pelo WhatsApp',
  }), true);

  assert.equal(leadCalls[0].data.pipelineStage, 'qualificacao');
  assert.equal(leadCalls[0].data.status, 'contato');
  assert.deepEqual(leadCalls[0].where.OR, [
    { pipelineStage: 'prospeccao' },
    { pipelineStage: null, status: 'novo' },
  ]);
  assert.match(timelineCalls[0].data[0].idempotencyKey, /job-1:900$/);
});

test('inbound humano nao regride lead que ja saiu da prospeccao', async () => {
  let timelineCreated = false;
  const tx = {
    vendasLead: { updateMany: async () => ({ count: 0 }) },
    vendasLeadTimelineEvent: {
      createMany: async () => {
        timelineCreated = true;
        return { count: 1 };
      },
    },
  };
  const { service } = createService();

  assert.equal(await (service as any).advanceVendasLeadFromProspectingOnHumanInbound(tx, {
    companyId: 7,
    leadId: 'lead-qualified',
    jobId: 'job-2',
    inboundMessageId: 901,
    lastResult: 'Resposta recebida',
  }), false);
  assert.equal(timelineCreated, false);
});

test('Meta Cloud duplicate webhook does not repeat inbound orchestration', async () => {
  const projectionCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    conversations: {
      recordInboundMessage: async () => ({ id: 901, conversationId: 42, isNew: false }),
      dispatchVendasCockpitProjection: async (input: Record<string, unknown>) => {
        projectionCalls.push(input);
      },
    },
  });
  let processCalls = 0;
  (service as any).updateInboundConversationMetadata = async () => undefined;
  (service as any).processPersistedInbound = async () => {
    processCalls += 1;
    return { matched: true };
  };

  const result = await (service as any).handleInboundMessage({
    companyId: 7,
    customerPhone: '+5511998877766',
    text: 'Oi novamente',
    messageType: 'text',
    timestamp: new Date('2026-07-13T12:00:00.000Z'),
    externalMessageId: 'wamid.duplicate-1',
    rawPayload: {},
  });

  assert.equal(processCalls, 0);
  assert.equal(result.duplicate, true);
  assert.deepEqual(projectionCalls[0], {
    companyId: 7,
    conversationId: 42,
    event: 'inbound',
    messageId: 901,
    validHumanInbound: false,
  });
});

test('historical WebWhats inbound refreshes preview without qualifying the lead', async () => {
  const projectionCalls: Array<Record<string, unknown>> = [];
  const cadenciaCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    conversations: {
      dispatchVendasCockpitProjection: async (input: Record<string, unknown>) => {
        projectionCalls.push(input);
      },
      // Resposta recuperada por sync (chip esteve fora do ar) ainda move o FUNIL
      // (caso Atacadão 30/07) — o hook nunca envia WhatsApp, então é seguro.
      dispatchCadenciaInbound: async (input: Record<string, unknown>) => {
        cadenciaCalls.push(input);
      },
    },
  });

  const result = await (service as any).processPersistedInbound({
    company: { id: 7, name: 'Empresa Sete', timezone: 'America/Sao_Paulo' },
    from: '+5511998877766',
    text: 'Mensagem antiga',
    inboundType: 'text',
    rawPayload: {},
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
    externalMessageId: 'webwhats:company-7:historical-1',
    inboundRow: { id: 902, conversationId: 42 },
    scope: 'webwhats_sync',
    provider: 'WEBWHATS',
    sourceModule: 'webwhats_sync',
  });

  assert.equal(result.botSuppressed, true);
  assert.deepEqual(projectionCalls[0], {
    companyId: 7,
    conversationId: 42,
    event: 'inbound',
    messageId: 902,
    validHumanInbound: false,
  });
  assert.equal(cadenciaCalls.length, 1, 'resposta recente recuperada por sync move o funil');
  assert.equal(cadenciaCalls[0].conversationId, 42);
});

test('upsertAtendimentoCustomerLocal reuses known customer profile before syncing atendimento projection', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-1' };
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({
        id: 'profile-existing',
        name: 'Cliente conhecido',
        status: 'active',
      }),
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Cliente conhecido',
    conversationId: 42,
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, 'profile-existing');
  assert.equal(upsertCalls[0].route, 'atendimento');
});

test('upsertAtendimentoCustomerLocal creates provisional profile for unknown inbound number', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const profileCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-2' };
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async (input: Record<string, unknown>) => {
        profileCalls.push(input);
        return { id: 'profile-new', status: 'provisional', name: input.name ?? null };
      },
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99811-2233',
    name: 'Contato novo',
    conversationId: 99,
  });

  assert.equal(profileCalls.length, 1);
  assert.equal(profileCalls[0].status, 'provisional');
  assert.equal(profileCalls[0].externalSource, 'whatsapp_bot');
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, 'profile-new');
});

test('upsertAtendimentoCustomerLocal preserves atendimento sync when profile resolution fails', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: 'registry-3' };
      },
    },
    customerProfileService: {
      normalizePhone: () => '5519998000000',
      upsertProfile: async () => {
        throw new Error('db temporarily unavailable');
      },
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99800-0000',
    name: 'Sem regressao',
    conversationId: 77,
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].customerProfileId, null);
  assert.equal(upsertCalls[0].route, 'atendimento');
});

test('upsertAtendimentoCustomerLocal persists confirmed inbound state into CustomerProfile', async () => {
  const profileStateCalls: Array<Record<string, unknown>> = [];
  const registryCalls: Array<Record<string, unknown>> = [];
  const inboundAt = new Date('2026-04-15T10:00:00.000Z');
  const { service } = createService({
    cadastrosService: {
      upsertCustomerRegistry: async (input: Record<string, unknown>) => {
        registryCalls.push(input);
        return { id: 'registry-4' };
      },
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertAtendimentoProfileState: async (input: Record<string, unknown>) => {
        profileStateCalls.push(input);
        return { id: 'profile-shared', ...input };
      },
    },
  });

  await (service as any).upsertAtendimentoCustomerLocal({
    companyId: 7,
    phone: '+55 19 99887-7766',
    name: 'Carlos Eduardo',
    registrationStatus: 'confirmed',
    conversationId: 42,
    nameSource: 'confirmed_inbound',
    inboundAt,
    metadata: {
      atendimentoBlockedAt: '2026-04-15T09:55:00.000Z',
      atendimentoBlockedReason: 'Fila humana manual',
    },
  });

  assert.equal(profileStateCalls.length, 1);
  assert.equal(profileStateCalls[0].confirmedName, 'Carlos Eduardo');
  assert.equal(profileStateCalls[0].profileName, null);
  assert.equal(profileStateCalls[0].nameConfirmed, true);
  assert.equal(profileStateCalls[0].nameSource, 'confirmed_inbound');
  assert.deepEqual(profileStateCalls[0].inboundAt, inboundAt);
  assert.equal(profileStateCalls[0].botOff, true);
  assert.equal(profileStateCalls[0].botOffReason, 'Fila humana manual');
  assert.ok(profileStateCalls[0].botOffAt instanceof Date);
  assert.equal(registryCalls.length, 1);
  assert.equal(registryCalls[0].customerProfileId, 'profile-shared');
  assert.deepEqual(registryCalls[0].lastMessageAt, inboundAt);
});

test('handleInboundProxyMessage normalizes template inbound as text before persistence', async () => {
  const { service } = createService();
  let captured: Record<string, unknown> | null = null;
  (service as any).handleInboundMessage = async (input: Record<string, unknown>) => {
    captured = input;
    return { ok: true };
  };

  const result = await service.handleInboundProxyMessage({
    whatsappPhoneNumberId: 'phone-number-id',
    from: '+55 19 99887-7766',
    text: 'Cliente respondeu ao template',
    inboundType: 'template',
    rawPayload: { source: 'proxy' },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured?.companyId, 7);
  assert.equal(captured?.messageType, 'text');
  assert.equal(captured?.text, 'Cliente respondeu ao template');
});

test('handleInboundProxyMessage discards unmapped company without invoking persistence', async () => {
  const { service } = createService({
    prisma: {
      company: {
        findFirst: async () => null,
      },
    },
  });
  let called = false;
  (service as any).handleInboundMessage = async () => {
    called = true;
  };

  const result = await service.handleInboundProxyMessage({
    whatsappPhoneNumberId: 'missing-company',
    from: '+5519998877766',
    text: 'oi',
    inboundType: 'text',
  });

  assert.deepEqual(result, { ok: true, discarded: true });
  assert.equal(called, false);
});

test('handleAtendimentoInbound enters the Vendas agenda bot gate and opens the main menu after manual reply', async () => {
  const { service, queueCalls, conversationStateCalls, companyMessageUpdateCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          name: 'HBX Solutions',
          timezone: 'America/Sao_Paulo',
          whatsappConnectionMode: 'TEMPORARY',
          trialModuleSelection: null,
          paymentStatus: 'PAID',
          subscriptionStatus: 'active',
          onboardingStatus: 'active_paid',
          trialEndsAt: null,
          botArmedAt: new Date(),
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
          ],
        }),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify({
            cliente: 'Carlos',
            vendasAgendaQueue: {
              active: true,
              leadId: 'lead-1',
              sourceModule: 'vendas',
              sourceBlock: 'today',
              manualSent: true,
              manualSentAt: '2026-04-15T10:00:00.000Z',
              botEntryPending: true,
            },
          }),
          currentFlow: 'atendimento_whatsapp_hibrido',
          currentStep: 'atendimento_humano',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
        }),
      },
      atendimentoCustomer: {
        findUnique: async () => ({
          name: 'Carlos',
          registrationStatus: 'confirmed',
          customerProfile: { name: 'Carlos' },
        }),
      },
      companyMessage: {
        count: async () => 2,
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 501, ...data }),
        update: async (input: Record<string, unknown>) => {
          companyMessageUpdateCalls.push(input);
          return input;
        },
      },
      hbxRecoveryFlowStage: {
        findFirst: async ({ where }: any) =>
          where?.channel === '__ATENDIMENTO_BOT_CONFIG__'
            ? { template: JSON.stringify(COMPLETED_ATENDIMENTO_BOT_CONFIG) }
            : null,
      },
    },
    cadastrosService: {
      upsertCustomerRegistry: async () => ({ id: 'registry-1' }),
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({ id: 'profile-1', name: 'Carlos', status: 'active' }),
    },
  });

  const result = await (service as any).handleAtendimentoInbound({
    companyId: 7,
    from: '+55 19 99887-7766',
    text: 'Tenho interesse',
    conversationId: 42,
    inboundMessageId: 88,
    timestamp: new Date('2026-04-15T10:05:00.000Z'),
    company: { id: 7, name: 'HBX Solutions', timezone: 'America/Sao_Paulo' },
    recoveryCustomer: null,
    rawPayload: {},
  });

  assert.equal(result.handled, true);
  assert.equal(result.vendasAgendaBotGate, true);
  assert.equal(queueCalls.length, 1);
  assert.equal((queueCalls[0].payload as any).sourceModule, 'atendimento_bot');
  assert.equal((queueCalls[0].payload as any).flowState.currentStep, 'menu_principal');
  assert.match(String((queueCalls[0].payload as any).body), /Sou o assistente da HBX Solutions/);
  assert.match(String((queueCalls[0].payload as any).body), /1\. Agendar com Glauco/);
  assert.match(String((queueCalls[0].payload as any).body), /2\. Suporte tecnico/);
  assert.doesNotMatch(String((queueCalls[0].payload as any).body), /Assunto pessoal/);
  assert.equal(conversationStateCalls.length, 1);
  assert.equal((conversationStateCalls[0].payload as any).humanAssigned, false);
  assert.equal((conversationStateCalls[0].payload as any).botActive, true);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    true,
  );
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
  assert.equal((conversationStateCalls[0].payload as any).metadata.cliente, 'Carlos');
  assert.equal(companyMessageUpdateCalls.length, 1);
  assert.equal((companyMessageUpdateCalls[0] as any).data.sourceModule, 'atendimento_bot');
});

test('handleAtendimentoInbound asks for the name first when the Vendas agenda reply has no confirmed identity', async () => {
  const { service, queueCalls, conversationStateCalls, companyMessageUpdateCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          name: 'HBX Solutions',
          timezone: 'America/Sao_Paulo',
          whatsappConnectionMode: 'TEMPORARY',
          trialModuleSelection: null,
          paymentStatus: 'PAID',
          subscriptionStatus: 'active',
          onboardingStatus: 'active_paid',
          trialEndsAt: null,
          botArmedAt: new Date(),
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
          ],
        }),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify({
            vendasAgendaQueue: {
              active: true,
              leadId: 'lead-2',
              sourceModule: 'vendas',
              sourceBlock: 'today',
              manualSent: true,
              manualSentAt: '2026-04-15T10:00:00.000Z',
              botEntryPending: true,
            },
          }),
          currentFlow: 'atendimento_whatsapp_hibrido',
          currentStep: 'atendimento_humano',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
        }),
      },
      atendimentoCustomer: {
        findUnique: async () => ({
          name: 'Contato novo',
          registrationStatus: 'pending_confirmation',
          customerProfile: { name: null },
        }),
      },
      companyMessage: {
        count: async () => 2,
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 502, ...data }),
        update: async (input: Record<string, unknown>) => {
          companyMessageUpdateCalls.push(input);
          return input;
        },
      },
      hbxRecoveryFlowStage: {
        findFirst: async ({ where }: any) =>
          where?.channel === '__ATENDIMENTO_BOT_CONFIG__'
            ? { template: JSON.stringify(COMPLETED_ATENDIMENTO_BOT_CONFIG) }
            : null,
      },
    },
    cadastrosService: {
      upsertCustomerRegistry: async () => ({ id: 'registry-2' }),
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({ id: 'profile-2', name: 'Contato novo', status: 'provisional' }),
    },
  });

  const result = await (service as any).handleAtendimentoInbound({
    companyId: 7,
    from: '+55 19 99811-2233',
    text: 'Oi',
    conversationId: 42,
    inboundMessageId: 89,
    timestamp: new Date('2026-04-15T10:06:00.000Z'),
    company: { id: 7, name: 'HBX Solutions', timezone: 'America/Sao_Paulo' },
    recoveryCustomer: null,
    rawPayload: {},
  });

  assert.equal(result.handled, true);
  assert.equal(result.nameGate, true);
  assert.equal(queueCalls.length, 1);
  assert.equal(
    (queueCalls[0].payload as any).body,
    'Oi, tudo bem? Antes de continuar, como posso te chamar?',
  );
  assert.equal((queueCalls[0].payload as any).flowState.currentStep, 'coletando_nome');
  assert.equal((queueCalls[0].payload as any).messageType, 'text');
  assert.equal(conversationStateCalls.length, 1);
  assert.equal((conversationStateCalls[0].payload as any).humanAssigned, false);
  assert.equal((conversationStateCalls[0].payload as any).botActive, true);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    true,
  );
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
  assert.equal((conversationStateCalls[0].payload as any).metadata.cliente, undefined);
  assert.equal(companyMessageUpdateCalls.length, 1);
  assert.equal((companyMessageUpdateCalls[0] as any).data.sourceModule, 'atendimento_bot');
});

test('handleAtendimentoInbound handles Recovery menu actions inside Atendimento', async () => {
  const recoveryMetadata = {
    cliente: 'Carlos',
    atendimentoRecoveryIntroPending: true,
    recoveryCustomerId: 'recovery-1',
  };
  const { service, queueCalls, conversationStateCalls, companyMessageUpdateCalls } = createService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          name: 'HBX Solutions',
          timezone: 'America/Sao_Paulo',
          whatsappConnectionMode: 'TEMPORARY',
          trialModuleSelection: null,
          paymentStatus: 'PAID',
          subscriptionStatus: 'active',
          onboardingStatus: 'active_paid',
          trialEndsAt: null,
          botArmedAt: new Date(),
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
          ],
        }),
      },
      companyModule: {
        findFirst: async () => ({ id: 321 }),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify(recoveryMetadata),
          currentFlow: 'atendimento_whatsapp_hibrido',
          currentStep: 'recovery_detectado',
          flowResult: null,
          botActive: true,
          humanAssigned: false,
        }),
      },
      atendimentoCustomer: {
        findUnique: async () => ({
          name: 'Carlos',
          registrationStatus: 'confirmed',
          customerProfile: { name: 'Carlos' },
        }),
      },
      companyMessage: {
        count: async () => 3,
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 503, ...data }),
        update: async (input: Record<string, unknown>) => {
          companyMessageUpdateCalls.push(input);
          return input;
        },
      },
      hbxRecoveryFlowStage: {
        findFirst: async ({ where }: any) =>
          where?.channel === '__ATENDIMENTO_BOT_CONFIG__'
            ? { template: JSON.stringify(COMPLETED_ATENDIMENTO_BOT_CONFIG) }
            : null,
      },
    },
    cadastrosService: {
      upsertCustomerRegistry: async () => ({ id: 'registry-recovery' }),
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({ id: 'profile-recovery', name: 'Carlos', status: 'active' }),
    },
  });

  let delegatedToRecovery = false;
  (service as any).handleRecoveryInbound = async () => {
    delegatedToRecovery = true;
    throw new Error('should not delegate Atendimento Recovery menu actions');
  };

  const result = await (service as any).handleAtendimentoInbound({
    companyId: 7,
    from: '+55 19 99887-7766',
    text: 'Pagar agora',
    conversationId: 42,
    inboundMessageId: 90,
    timestamp: new Date('2026-04-15T10:07:00.000Z'),
    company: { id: 7, name: 'HBX Solutions', timezone: 'America/Sao_Paulo' },
    recoveryCustomer: {
      id: 'recovery-1',
      clientName: 'Carlos',
      openAmount: 480,
    },
    rawPayload: {
      type: 'button',
      interactive: {
        button_reply: {
          id: 'atendimento_recovery_detected_pay_now_2',
          title: 'Pagar agora',
        },
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.recoveryGate, true);
  assert.equal(result.recoveryAction, 'pay_now');
  assert.equal(delegatedToRecovery, false);
  assert.equal(queueCalls.length, 2);
  assert.equal(
    (queueCalls[0].payload as any).body,
    'Perfeito. Vou gerar a acao financeira para voce seguir agora.',
  );
  assert.equal((queueCalls[0].payload as any).sourceModule, 'atendimento_bot');
  assert.equal((queueCalls[1].payload as any).flowState.currentStep, 'pos_acao');
  assert.match(
    String((queueCalls[1].payload as any).body),
    /Se precisar, posso continuar pelo Atendimento/,
  );
  assert.equal(conversationStateCalls.length, 1);
  assert.equal(
    (conversationStateCalls[0].payload as any).metadata.atendimentoRecoveryIntroPending,
    false,
  );
  assert.equal(companyMessageUpdateCalls.length, 1);
  assert.equal((companyMessageUpdateCalls[0] as any).data.sourceModule, 'atendimento_bot');
});

// ---------------------------------------------------------------------------
// INTENTENGINE Sprint 2 — NLU do Atendimento (catálogo fechado + trava de confiança).
// ---------------------------------------------------------------------------

function createAtendimentoNluTestBase(overrides?: Record<string, any>) {
  const { prisma: prismaOverrides, ...restOverrides } = overrides || {};
  return createService({
    ...restOverrides,
    prisma: {
      company: {
        findUnique: async () => ({
          id: 7,
          name: 'HBX Solutions',
          timezone: 'America/Sao_Paulo',
          whatsappConnectionMode: 'TEMPORARY',
          trialModuleSelection: null,
          paymentStatus: 'PAID',
          subscriptionStatus: 'active',
          onboardingStatus: 'active_paid',
          trialEndsAt: null,
          botArmedAt: new Date(),
          commercialEntitlements: [{ key: 'vendas', status: 'active', currentPeriodEnd: null }],
        }),
      },
      companyConversation: {
        findFirst: async () => ({
          id: 42,
          metadata: JSON.stringify({ cliente: 'Carlos' }),
          currentFlow: 'atendimento_whatsapp_hibrido',
          currentStep: 'menu_principal',
          flowResult: null,
          botActive: true,
          humanAssigned: false,
        }),
        update: async () => ({}),
      },
      atendimentoCustomer: {
        findUnique: async () => ({
          name: 'Carlos',
          registrationStatus: 'confirmed',
          customerProfile: { name: 'Carlos' },
        }),
      },
      companyMessage: {
        count: async () => 2,
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 501, ...data }),
        update: async () => ({}),
      },
      hbxRecoveryFlowStage: {
        findFirst: async ({ where }: any) =>
          where?.channel === '__ATENDIMENTO_BOT_CONFIG__'
            ? { template: JSON.stringify(COMPLETED_ATENDIMENTO_BOT_CONFIG) }
            : null,
      },
      ...(prismaOverrides || {}),
    },
    cadastrosService: {
      upsertCustomerRegistry: async () => ({ id: 'registry-1' }),
    },
    customerProfileService: {
      normalizePhone: (phone: string) => String(phone || '').replace(/\D/g, '').slice(-13),
      upsertProfile: async () => ({ id: 'profile-1', name: 'Carlos', status: 'active' }),
    },
  });
}

function buildAtendimentoInboundInput(text: string) {
  return {
    companyId: 7,
    from: '+55 19 99887-7766',
    text,
    conversationId: 42,
    inboundMessageId: 91,
    timestamp: new Date('2026-04-15T10:07:00.000Z'),
    company: { id: 7, name: 'HBX Solutions', timezone: 'America/Sao_Paulo' },
    recoveryCustomer: null,
    rawPayload: {},
  };
}

test('NLU atendimento: frase natural resolve para a ação e executa (mesmo caminho de um clique de botão)', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    let receivedActions: any[] = [];
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async (input: any) => {
        receivedActions = input.actions;
        return { actionId: 'talk_human', confidence: 0.9 };
      },
    };

    const { service, queueCalls } = createAtendimentoNluTestBase({ intentEngine });

    const result = await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('meu ar tá vazando, preciso falar com alguém'),
    );

    assert.equal(result.handled, true);
    assert.equal(queueCalls.length, 1);
    assert.equal((queueCalls[0].payload as any).sourceModule, 'atendimento_human');
    assert.ok(
      receivedActions.some((action) => action.actionId === 'talk_human'),
      'catálogo enviado ao LLM deve incluir a ação habilitada talk_human',
    );
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('NLU atendimento: confiança abaixo do limiar cai no menu (comportamento atual intacto)', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async () => ({ actionId: 'talk_human', confidence: 0.4 }),
    };

    const { service, queueCalls } = createAtendimentoNluTestBase({ intentEngine });

    const result = await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('sei la, talvez'),
    );

    assert.equal(result.handled, true);
    assert.equal(queueCalls.length, 1);
    assert.notEqual((queueCalls[0].payload as any).sourceModule, 'atendimento_human');
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('NLU atendimento: timeout/erro do classificador cai no menu', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async () => {
        throw new Error('timeout simulado');
      },
    };

    const { service, queueCalls } = createAtendimentoNluTestBase({ intentEngine });

    const result = await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('frase qualquer que não bate em nada'),
    );

    assert.equal(result.handled, true);
    assert.equal(queueCalls.length, 1);
    assert.notEqual((queueCalls[0].payload as any).sourceModule, 'atendimento_human');
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('NLU atendimento: classificador retorna null (JSON inválido/rótulo fora do catálogo) cai no menu', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async () => null,
    };

    const { service, queueCalls } = createAtendimentoNluTestBase({ intentEngine });

    const result = await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('blablabla sem sentido nenhum'),
    );

    assert.equal(result.handled, true);
    assert.equal(queueCalls.length, 1);
    assert.notEqual((queueCalls[0].payload as any).sourceModule, 'atendimento_human');
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('NLU atendimento: flag OFF nunca chama o classificador e cai no menu', async () => {
  delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  let called = false;
  const intentEngine = {
    isAtendimentoNluEnabled: () => false,
    classifyAtendimentoAction: async () => {
      called = true;
      return { actionId: 'talk_human', confidence: 0.99 };
    },
  };

  const { service, queueCalls } = createAtendimentoNluTestBase({ intentEngine });

  const result = await (service as any).handleAtendimentoInbound(
    buildAtendimentoInboundInput('quero falar com alguém urgente'),
  );

  assert.equal(result.handled, true);
  assert.equal(called, false, 'com a flag off o NLU nunca deve ser chamado');
  assert.equal(queueCalls.length, 1);
  assert.notEqual((queueCalls[0].payload as any).sourceModule, 'atendimento_human');
});

test('NLU atendimento: sem ENTREVISTA completa nunca chama o classificador', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    let called = false;
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async () => {
        called = true;
        return { actionId: 'talk_human', confidence: 0.99 };
      },
    };

    // "Armar bot" morreu (31/07/2026): o gate comercial é a entrevista da casa
    // (VendasComercialConfig). Sem linha = entrevista incompleta = IA muda.
    const { service } = createAtendimentoNluTestBase({
      intentEngine,
      prisma: {
        vendasComercialConfig: { findUnique: async () => null },
      },
    });

    await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('quero falar com alguém urgente'),
    );

    assert.equal(called, false, 'sem entrevista completa o NLU nunca deve ser chamado');
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('NLU atendimento: ação DESABILITADA no catálogo do tenant não é oferecida ao LLM', async () => {
  process.env.HBX_ATENDIMENTO_NLU_ENABLED = 'true';
  try {
    let receivedActions: any[] = [];
    const intentEngine = {
      isAtendimentoNluEnabled: () => true,
      classifyAtendimentoAction: async (input: any) => {
        receivedActions = input.actions;
        return null;
      },
    };

    const disabledCatalogConfig = {
      ...COMPLETED_ATENDIMENTO_BOT_CONFIG,
      actionCatalog: COMPLETED_ATENDIMENTO_BOT_CONFIG.actionCatalog.map((action: any) =>
        action.actionId === 'talk_human' ? { ...action, enabled: false } : action,
      ),
    };

    const { service } = createAtendimentoNluTestBase({
      intentEngine,
      prisma: {
        hbxRecoveryFlowStage: {
          findFirst: async ({ where }: any) =>
            where?.channel === '__ATENDIMENTO_BOT_CONFIG__'
              ? { template: JSON.stringify(disabledCatalogConfig) }
              : null,
        },
      },
    });

    await (service as any).handleAtendimentoInbound(
      buildAtendimentoInboundInput('quero falar com alguém urgente'),
    );

    assert.ok(receivedActions.length > 0, 'outras ações habilitadas continuam sendo oferecidas');
    assert.ok(
      !receivedActions.some((action) => action.actionId === 'talk_human'),
      'talk_human está desabilitada e não deve chegar ao catálogo oferecido ao LLM',
    );
  } finally {
    delete process.env.HBX_ATENDIMENTO_NLU_ENABLED;
  }
});

test('Recepcionista IA dynamic menu hides unavailable agenda, recovery and appointment actions', async () => {
  const { service } = createService();

  const menu = (service as any).buildDynamicReceptionMenu({
    canShowAgenda: false,
    canShowReschedule: false,
    canShowCancelAppointment: false,
    canShowRecovery: false,
    canShowSupport: true,
    canShowTalkToOwner: true,
    canShowSupplier: true,
    canShowPersonal: true,
  });

  assert.deepEqual(
    menu.map((option: any) => option.actionKey),
    ['technical_support', 'talk_owner', 'supplier_contact'],
  );
});

test('Recepcionista IA dynamic menu shows reschedule and cancel only with future appointment', async () => {
  const { service } = createService();

  const menu = (service as any).buildDynamicReceptionMenu({
    canShowAgenda: false,
    canShowReschedule: true,
    canShowCancelAppointment: true,
    canShowRecovery: false,
    canShowSupport: true,
    canShowTalkToOwner: true,
    canShowSupplier: false,
    canShowPersonal: true,
  });

  assert.deepEqual(
    menu.map((option: any) => option.actionKey),
    ['reschedule_service', 'cancel_appointment', 'technical_support', 'talk_owner'],
  );
});

test('Agenda simples offers business-day 09-13 slots and skips occupied days', async () => {
  const startsAt = new Date('2026-05-11T12:00:00.000Z');
  const { service } = createService({
    prisma: {
      atendimentoAppointment: {
        count: async ({ where }: any) =>
          startsAt >= where.startsAt.gte && startsAt < where.startsAt.lt ? 1 : 0,
      },
    },
  });

  const group = DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[0];
  const options = await (service as any).buildSimpleAgendaOptions({
    companyId: 7,
    group,
    config: DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
    fromDate: new Date('2026-05-08T12:00:00.000Z'),
  });

  assert.equal(options.length, 5);
  assert.equal(options[0].startTime, '09:00');
  assert.equal(options[0].endTime, '13:00');
  assert.notEqual(options[0].isoDate, '2026-05-11');
  assert.ok(options.every((option: any) => !['6', '0'].includes(String(new Date(`${option.isoDate}T12:00:00`).getDay()))));
});

// ---------------------------------------------------------------------------
// Webwhats status update (messages.update with keyId) — Bug fix regression tests
// ---------------------------------------------------------------------------

function createServiceForStatusTest(opts?: { resolveMeta?: boolean }) {
  const outboundUpdateCalls: Array<Record<string, unknown>> = [];
  const messageUpdateCalls: Array<Record<string, unknown>> = [];
  const webhookEventCalls: Array<Record<string, unknown>> = [];
  const projectionCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    hasTable: async () => false,
    hasColumn: async () => false,
    company: {
      findUnique: async ({ where }: any) => {
        if (where?.id === 2) return { id: 2, name: 'Empresa Dois', timezone: 'America/Sao_Paulo' };
        return null;
      },
      findFirst: async () => opts?.resolveMeta
        ? { id: 2, name: 'Empresa Dois', timezone: 'America/Sao_Paulo' }
        : null,
    },
    whatsAppWebhookEvent: {
      create: async ({ data }: any) => {
        webhookEventCalls.push(data);
        return { id: 1, ...data };
      },
    },
    companyMessage: {
      count: async () => 0,
      findFirst: async () => null,
      findMany: async ({ where }: any) => {
        // Simulate that the outbound message lives in conversationId 10
        const providerIds: string[] = where?.providerMessageId?.in ?? [];
        const hit = providerIds.some(
          (id) =>
            id === 'webwhats:company-2-user-36:3EB077C40CDBE832E3CDE3' ||
            id === 'webwhats:company-2:3EB077C40CDBE832E3CDE3',
        );
        return hit || (opts?.resolveMeta && providerIds.includes('wamid.meta-1'))
          ? [{ conversationId: 10 }]
          : [];
      },
      create: async ({ data }: any) => ({ id: 501, ...data }),
      update: async (input: Record<string, unknown>) => input,
      updateMany: async (input: Record<string, unknown>) => {
        messageUpdateCalls.push(input);
        return { count: 1 };
      },
    },
    companyConversation: {
      findFirst: async () => null,
    },
    atendimentoCustomer: {
      findUnique: async () => null,
    },
    atendimentoAppointment: {
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => ({ id: 1, ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    hbxRecoveryFlowStage: {
      findFirst: async () => null,
    },
    outboundMessage: {
      updateMany: async (input: Record<string, unknown>) => {
        outboundUpdateCalls.push(input);
        return { count: 1 };
      },
    },
    whatsAppLog: {
      create: async () => null,
    },
  } as any;

  const conversations = {
    queueOutboundForCompany: async () => ({ outboundMessageId: 999, conversationId: 42 }),
    updateConversationState: async () => null,
    dispatchVendasCockpitProjection: async (input: Record<string, unknown>) => {
      projectionCalls.push(input);
    },
  } as any;

  const audit = { log: async () => undefined } as any;

  const inboxRealtime = {
    publish: () => undefined,
    subscribe: () => () => undefined,
  } as any;

  const service = new MessagingService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    conversations,
    audit,
    {} as any,
    {} as any,
    {} as any,
    { sendText: async () => undefined } as any,
    inboxRealtime,
    new IntentEngineService(prisma, new AiIntentClassifierService()) as any,
    // GATEWAY-WA S3: freio de envio (não é exercido no caminho de status deste teste).
    { evaluate: async () => ({ allow: true, reason: 'disabled' }), getStats: () => ({}) } as any,
    undefined as any,
    undefined as any,
  );

  return { service, outboundUpdateCalls, messageUpdateCalls, webhookEventCalls, projectionCalls };
}

test('webwhats messages.update with keyId sets OUTBOUND to FAILED (Bug fix: keyId was ignored)', async () => {
  const { service, outboundUpdateCalls, messageUpdateCalls, projectionCalls } = createServiceForStatusTest();

  // Real payload shape observed live: keyId at data-level, status at data-level
  const payload = {
    event: 'messages.update',
    instance: 'company-2-user-36',
    data: {
      keyId: '3EB077C40CDBE832E3CDE3',
      remoteJid: '5519997024884@s.whatsapp.net',
      fromMe: true,
      status: 'ERROR',
    },
  };

  await (service as any).handleWebwhatsWebhookEvent(payload, {});

  // outboundMessage.updateMany must have been called with FAILED status
  assert.ok(outboundUpdateCalls.length >= 1, 'outboundMessage.updateMany should have been called');
  const outboundCall = outboundUpdateCalls[0] as any;
  assert.equal(outboundCall.data?.status, 'FAILED', 'OUTBOUND status should be FAILED');
  assert.ok(outboundCall.data?.failedAt instanceof Date, 'OUTBOUND failedAt should be set');

  // The providerMessageId candidates must include the per-user tenantKey variant
  const providerIds: string[] = outboundCall.where?.providerMessageId?.in ?? [];
  assert.ok(
    providerIds.includes('webwhats:company-2-user-36:3EB077C40CDBE832E3CDE3'),
    `Expected per-user tenantKey candidate in ${JSON.stringify(providerIds)}`,
  );

  // companyMessage.updateMany must also reflect FAILED
  assert.ok(messageUpdateCalls.length >= 1, 'companyMessage.updateMany should have been called');
  const msgCall = messageUpdateCalls[0] as any;
  assert.equal(msgCall.data?.status, 'FAILED', 'Message status should be FAILED');
  assert.deepEqual(projectionCalls[0], {
    companyId: 2,
    conversationId: 10,
    event: 'failed',
  });
});

test('webwhats messages.update with keyId sets OUTBOUND to DELIVERED', async () => {
  const { service, outboundUpdateCalls, messageUpdateCalls } = createServiceForStatusTest();

  const payload = {
    event: 'messages.update',
    instance: 'company-2-user-36',
    data: {
      keyId: '3EB077C40CDBE832E3CDE3',
      remoteJid: '5519997024884@s.whatsapp.net',
      fromMe: true,
      status: 'DELIVERY_ACK',
    },
  };

  await (service as any).handleWebwhatsWebhookEvent(payload, {});

  assert.ok(outboundUpdateCalls.length >= 1, 'outboundMessage.updateMany should have been called');
  const outboundCall = outboundUpdateCalls[0] as any;
  assert.equal(outboundCall.data?.status, 'DELIVERED', 'OUTBOUND status should be DELIVERED');
  assert.ok(outboundCall.data?.deliveredAt instanceof Date, 'OUTBOUND deliveredAt should be set');

  assert.ok(messageUpdateCalls.length >= 1, 'companyMessage.updateMany should have been called');
  const msgCall = messageUpdateCalls[0] as any;
  assert.equal(msgCall.data?.status, 'DELIVERED', 'Message status should be DELIVERED');
});

test('Meta Cloud status is tenant-scoped and rebuilds the Vendas cockpit', async () => {
  const { service, outboundUpdateCalls, messageUpdateCalls, projectionCalls } =
    createServiceForStatusTest({ resolveMeta: true });
  (service as any).verifyWebhookSignature = () => true;

  const result = await service.handleWhatsAppWebhook({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: 'meta-phone-2', display_phone_number: '+5511999990000' },
          statuses: [{ id: 'wamid.meta-1', status: 'sent', timestamp: '1770000000' }],
        },
      }],
    }],
  });

  assert.equal(result.statusesHandled, 1);
  assert.equal((outboundUpdateCalls[0] as any).where.companyId, 2);
  assert.deepEqual((outboundUpdateCalls[0] as any).where.status.notIn, ['DELIVERED', 'READ', 'FAILED']);
  assert.equal((outboundUpdateCalls[0] as any).data.status, 'SENT');
  assert.equal((messageUpdateCalls[0] as any).where.companyId, 2);
  assert.equal((messageUpdateCalls[0] as any).data.status, 'SENT');
  assert.deepEqual(projectionCalls[0], {
    companyId: 2,
    conversationId: 10,
    event: 'sent',
  });
});

// ---------------------------------------------------------------------------
// INTENTENGINE S4 — reaper de SENDING órfão (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint4.md)
// ---------------------------------------------------------------------------

function createServiceForReaperTest(stuckMessages: Array<Record<string, any>>) {
  const outboundMessageUpdateCalls: Array<Record<string, unknown>> = [];
  const outboundAttemptUpdateCalls: Array<Record<string, unknown>> = [];
  const companyMessageUpdateManyCalls: Array<Record<string, unknown>> = [];
  const projectionCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    hasTable: async () => false,
    hasColumn: async () => false,
    outboundMessage: {
      findMany: async ({ where }: any) => {
        if (where?.status !== 'SENDING') return [];
        return stuckMessages;
      },
      update: async ({ where, data }: any) => {
        outboundMessageUpdateCalls.push({ where, data });
        return { id: where.id, ...data };
      },
    },
    outboundAttempt: {
      update: async ({ where, data }: any) => {
        outboundAttemptUpdateCalls.push({ where, data });
        return { id: where.id, ...data };
      },
    },
    companyMessage: {
      updateMany: async (input: Record<string, unknown>) => {
        companyMessageUpdateManyCalls.push(input);
        return { count: 1 };
      },
    },
  } as any;

  const conversations = {
    queueOutboundForCompany: async () => ({ outboundMessageId: 999, conversationId: 42 }),
    dispatchVendasCockpitProjection: async (input: Record<string, unknown>) => {
      projectionCalls.push(input);
    },
  } as any;
  const audit = { log: async () => undefined } as any;
  const inboxRealtime = { publish: () => undefined, subscribe: () => () => undefined } as any;

  const service = new MessagingService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    conversations,
    audit,
    {} as any,
    {} as any,
    {} as any,
    { sendText: async () => undefined } as any,
    inboxRealtime,
    new IntentEngineService(prisma, new AiIntentClassifierService()) as any,
    { evaluate: async () => ({ allow: true, reason: 'disabled' }), getStats: () => ({}) } as any,
    undefined as any,
    undefined as any,
  );

  return {
    service,
    outboundMessageUpdateCalls,
    outboundAttemptUpdateCalls,
    companyMessageUpdateManyCalls,
    projectionCalls,
  };
}

test('reaper: SENDING travada SEM attempt registrado volta para PENDING (re-enfileira)', async () => {
  const oldEnough = new Date(Date.now() - 20 * 60 * 1000); // 20min > default 10min
  const { service, outboundMessageUpdateCalls, companyMessageUpdateManyCalls, projectionCalls } = createServiceForReaperTest([
    { id: 101, companyId: 7, attemptCount: 0, createdAt: oldEnough, attempts: [], message: { id: 501, conversationId: 42 } },
  ]);

  const result = await service.reapStuckSendingMessages();

  assert.equal(result.requeued, 1);
  assert.equal(result.failed, 0);
  assert.equal(outboundMessageUpdateCalls.length, 1);
  const call = outboundMessageUpdateCalls[0] as any;
  assert.equal(call.where.id, 101);
  assert.equal(call.data.status, 'PENDING');
  assert.ok(call.data.nextAttemptAt instanceof Date);
  assert.ok(call.data.nextAttemptAt.getTime() > Date.now(), 'nextAttemptAt deve ser no futuro (backoff)');

  assert.equal(companyMessageUpdateManyCalls.length, 1);
  assert.equal((companyMessageUpdateManyCalls[0] as any).data.status, 'QUEUED');
  assert.deepEqual(projectionCalls[0], {
    companyId: 7,
    conversationId: 42,
    event: 'queued',
    messageId: 501,
  });
});

test('reaper: SENDING travada COM attempt registrado sem resultado vira FAILED (stuck_unknown_outcome)', async () => {
  const oldEnough = new Date(Date.now() - 20 * 60 * 1000);
  const { service, outboundMessageUpdateCalls, outboundAttemptUpdateCalls, companyMessageUpdateManyCalls, projectionCalls } =
    createServiceForReaperTest([
      {
        id: 202,
        companyId: 7,
        attemptCount: 1,
        createdAt: oldEnough,
        attempts: [{ id: 555, startedAt: oldEnough, finishedAt: null, httpStatus: null, responseBody: null }],
        message: { id: 502, conversationId: 43 },
      },
    ]);

  const result = await service.reapStuckSendingMessages();

  assert.equal(result.requeued, 0);
  assert.equal(result.failed, 1);

  assert.equal(outboundAttemptUpdateCalls.length, 1);
  const attemptCall = outboundAttemptUpdateCalls[0] as any;
  assert.equal(attemptCall.where.id, 555);
  assert.equal(attemptCall.data.success, false);
  assert.equal(attemptCall.data.error, 'stuck_unknown_outcome');
  assert.ok(attemptCall.data.finishedAt instanceof Date);

  assert.equal(outboundMessageUpdateCalls.length, 1);
  const msgCall = outboundMessageUpdateCalls[0] as any;
  assert.equal(msgCall.where.id, 202);
  assert.equal(msgCall.data.status, 'FAILED');
  assert.equal(msgCall.data.lastError, 'stuck_unknown_outcome');
  assert.ok(msgCall.data.failedAt instanceof Date);

  assert.equal(companyMessageUpdateManyCalls.length, 1);
  assert.equal((companyMessageUpdateManyCalls[0] as any).data.status, 'FAILED');
  assert.deepEqual(projectionCalls[0], {
    companyId: 7,
    conversationId: 43,
    event: 'failed',
    messageId: 502,
  });
});

test('reaper: SENDING recente (dentro da janela) não é tocada', async () => {
  const recentlyStarted = new Date(Date.now() - 2 * 60 * 1000); // 2min < default 10min
  const { service, outboundMessageUpdateCalls, outboundAttemptUpdateCalls, companyMessageUpdateManyCalls } =
    createServiceForReaperTest([
      {
        id: 303,
        attemptCount: 1,
        createdAt: recentlyStarted,
        attempts: [{ id: 777, startedAt: recentlyStarted, finishedAt: null, httpStatus: null, responseBody: null }],
      },
    ]);

  const result = await service.reapStuckSendingMessages();

  assert.equal(result.requeued, 0);
  assert.equal(result.failed, 0);
  assert.equal(outboundMessageUpdateCalls.length, 0);
  assert.equal(outboundAttemptUpdateCalls.length, 0);
  assert.equal(companyMessageUpdateManyCalls.length, 0);
});

test('reaper: mensagem PENDING normal não entra na varredura (findMany já filtra por status=SENDING)', async () => {
  // O reaper só consulta outboundMessage.findMany com where.status === 'SENDING' — o mock
  // de createServiceForReaperTest devolve [] para qualquer outro status, simulando isso.
  const { service, outboundMessageUpdateCalls, outboundAttemptUpdateCalls, companyMessageUpdateManyCalls } =
    createServiceForReaperTest([]);

  const result = await service.reapStuckSendingMessages();

  assert.equal(result.requeued, 0);
  assert.equal(result.failed, 0);
  assert.equal(outboundMessageUpdateCalls.length, 0);
  assert.equal(outboundAttemptUpdateCalls.length, 0);
  assert.equal(companyMessageUpdateManyCalls.length, 0);
});

// ---------------------------------------------------------------------------
// BUGFIX (09/07, incidente Josefino) — BUG 3: syncLogisticaEntregaWhatsappOutcome
// espelha o desfecho REAL (SENT/FAILED) do sendOne na Entrega.whatsappStatus.
// Testado direto (método privado) em vez de simular o worker sendOne inteiro
// (webwhats bridge, throttle, etc.) — o que importa aqui é o CONTRATO: no-op
// fora da logística, grava o desfecho quando é da logística, nunca lança.
// ---------------------------------------------------------------------------

function createServiceForLogisticaSyncTest() {
  const entregaUpdateCalls: any[] = [];
  const { service } = createService({
    prisma: {
      entrega: {
        update: async (args: any) => {
          entregaUpdateCalls.push(args);
          return { id: args.where.id, ...args.data };
        },
      },
    },
  });
  return { service, entregaUpdateCalls };
}

test('syncLogisticaEntregaWhatsappOutcome: no-op quando variables.module não é logistica', async () => {
  const { service, entregaUpdateCalls } = createServiceForLogisticaSyncTest();
  await (service as any).syncLogisticaEntregaWhatsappOutcome(
    { module: 'vendas_prospeccao_bot', entregaId: 'entrega-1' },
    'enviado',
  );
  assert.equal(entregaUpdateCalls.length, 0, 'outbound de outro módulo não deve tocar Entrega');
});

test('syncLogisticaEntregaWhatsappOutcome: no-op quando falta entregaId', async () => {
  const { service, entregaUpdateCalls } = createServiceForLogisticaSyncTest();
  await (service as any).syncLogisticaEntregaWhatsappOutcome({ module: 'logistica' }, 'enviado');
  assert.equal(entregaUpdateCalls.length, 0);
});

test('syncLogisticaEntregaWhatsappOutcome: SENT real → grava whatsappStatus=enviado, motivo null', async () => {
  const { service, entregaUpdateCalls } = createServiceForLogisticaSyncTest();
  await (service as any).syncLogisticaEntregaWhatsappOutcome(
    { module: 'logistica', event: 'entregue', entregaId: 'entrega-42' },
    'enviado',
  );
  assert.equal(entregaUpdateCalls.length, 1);
  assert.equal(entregaUpdateCalls[0].where.id, 'entrega-42');
  assert.equal(entregaUpdateCalls[0].data.whatsappStatus, 'enviado');
  assert.equal(entregaUpdateCalls[0].data.whatsappMotivo, null);
});

test('syncLogisticaEntregaWhatsappOutcome: FAILED real (ex.: "Webwhats Bad Request") → grava falhou + motivo', async () => {
  const { service, entregaUpdateCalls } = createServiceForLogisticaSyncTest();
  await (service as any).syncLogisticaEntregaWhatsappOutcome(
    { module: 'logistica', event: 'entregue', entregaId: 'entrega-42' },
    'falhou',
    'Webwhats Bad Request',
  );
  assert.equal(entregaUpdateCalls.length, 1);
  assert.equal(entregaUpdateCalls[0].data.whatsappStatus, 'falhou');
  assert.equal(entregaUpdateCalls[0].data.whatsappMotivo, 'Webwhats Bad Request');
});

test('syncLogisticaEntregaWhatsappOutcome: falha do prisma.entrega.update NUNCA lança (best-effort)', async () => {
  const { service } = createService({
    prisma: {
      entrega: {
        update: async () => {
          throw new Error('db off');
        },
      },
    },
  });
  await assert.doesNotReject(
    (service as any).syncLogisticaEntregaWhatsappOutcome(
      { module: 'logistica', entregaId: 'entrega-99' },
      'enviado',
    ),
  );
});

test('créditos: prospecção, atendimento, assistente e recovery automáticos entram como Automação', () => {
  const { service } = createService();
  const sources = [
    'vendas_prospeccao_bot',
    'vendas_prospeccao_email_bot',
    'prospeccao_bot',
    'atendimento_bot',
    'conversation_assistant',
    'hbx_recovery_automation',
  ];
  for (const sourceModule of sources) {
    assert.equal(
      (service as any).isCreditAutomationMessage({ sourceModule, message: { senderType: 'bot' } }),
      true,
      sourceModule,
    );
  }
});

test('créditos: respostas humanas, manuais e mensagens fora da allowlist não entram como Automação', () => {
  const { service } = createService();
  const messages = [
    { sourceModule: 'hbx_recovery_human', message: { senderType: 'human' } },
    { sourceModule: 'atendimento_manual', message: { senderType: 'human' } },
    { sourceModule: 'vendas', message: { senderType: 'human' } },
    { sourceModule: 'resumo_diario', message: { senderType: 'system' } },
  ];
  for (const message of messages) {
    assert.equal((service as any).isCreditAutomationMessage(message), false, message.sourceModule);
  }
});

// ================================================================
// ESCRITA DA SUPRESSÃO (30/07/2026) — vacina do buraco medido em produção:
// `applyAutoSuppressionForClosedLead` não tinha UM chamador de produção, e o
// opt-out do bot fechava o lead gravando `doNotContact` só no metadata da
// CONVERSA — que ninguém consulta antes de disparar. Estes testes usam o
// serviço de supressão REAL sobre um armazém em memória: escreve pelo caminho
// de produção e LÊ com `isSuppressed`, exatamente como a cadência lê.
// ================================================================

function createSuppressionStore() {
  const rows: any[] = [];
  const matchesKeys = (row: any, where: any) => {
    const or = Array.isArray(where?.OR) ? where.OR : [];
    if (!or.length) return false;
    return or.some((clause: any) => {
      if (String(clause.contactType) !== String(row.contactType)) return false;
      const key = clause.contactKey;
      if (key && typeof key === 'object' && Array.isArray(key.in)) return key.in.includes(row.contactKey);
      return String(key) === String(row.contactKey);
    });
  };
  const isActive = (row: any) =>
    row.expiresAt === null || row.expiresAt === undefined || new Date(row.expiresAt).getTime() > Date.now();
  return {
    rows,
    model: {
      createMany: async ({ data }: any) => {
        const list = Array.isArray(data) ? data : [data];
        for (const item of list) rows.push({ ...item, createdAt: new Date() });
        return { count: list.length };
      },
      findFirst: async ({ where }: any) =>
        rows.filter((row) => matchesKeys(row, where) && isActive(row)).slice(-1)[0] || null,
      findMany: async ({ where }: any) => rows.filter((row) => matchesKeys(row, where) && isActive(row)),
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter(
          (row) =>
            matchesKeys(row, where) &&
            isActive(row) &&
            (where.originCompanyId === undefined || row.originCompanyId === where.originCompanyId),
        );
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      },
    },
  };
}

function buildNegativeReplyTx(leadUpdates: Array<Record<string, any>>) {
  return {
    vendasAutomationJob: {
      updateMany: async (input: any) => ({ count: input?.where?.id === 'job-email-1' ? 1 : 0 }),
    },
    vendasLead: {
      updateMany: async (input: any) => {
        leadUpdates.push(input);
        return { count: 1 };
      },
    },
    vendasLeadTimelineEvent: { createMany: async () => ({ count: 1 }) },
  };
}

test('opt-out do bot grava a marca global do contato (consultavel por isSuppressed) e o motivo no lead', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1' },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const store = createSuppressionStore();
  const leadUpdates: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) => fn(buildNegativeReplyTx(leadUpdates)),
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      customerProfile: { findUnique: async () => ({ cnpj: '12.345.678/0001-90' }) },
      vendasContactSuppression: store.model,
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 1,
    from: '+5519998877766',
    text: 'Não tenho interesse, por favor remover.',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'opt_out');
  // motivo estruturado passou a ser gravado no lead (antes ficava null)
  assert.equal((leadUpdates[0] as any).data.closureReason, 'sem_interesse');
  assert.equal((leadUpdates[0] as any).data.outcome, 'opt_out');

  // a marca global existe, e PERMANENTE (opt_out) e cobre telefone + cnpj
  const phoneRow = store.rows.find((row) => row.contactType === 'phone');
  assert.ok(phoneRow, 'marca de telefone tinha que existir');
  assert.equal(phoneRow.reason, 'opt_out');
  assert.equal(phoneRow.expiresAt, null, 'opt_out e permanente');
  assert.equal(phoneRow.originCompanyId, 7);
  assert.equal(phoneRow.originLeadId, 'lead-1');
  assert.ok(store.rows.some((row) => row.contactType === 'cnpj' && row.contactKey === '12345678000190'));

  // O QUE A CADENCIA VE: mesma leitura do portao publicado em 7943c9f2.
  const reader = new VendasContactSuppressionService({ vendasContactSuppression: store.model } as any);
  const hit = await reader.isSuppressed({ phone: '+55 19 99887-7766' });
  assert.equal(hit.suppressed, true, 'quem pediu para sair tem que aparecer barrado na proxima tentativa');
});

test('resposta negativa SEM pedido explicito marca com dosagem menor (sem_interesse, com validade)', async () => {
  const metadata = {
    humanAssigned: true,
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1', status: 'neutral', humanAssigned: true },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1', humanAssigned: true },
  };
  const store = createSuppressionStore();
  const leadUpdates: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) => fn(buildNegativeReplyTx(leadUpdates)),
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      customerProfile: { findUnique: async () => null },
      vendasContactSuppression: store.model,
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 93,
    from: '+55 19 99887-7766',
    text: 'Não tenho interesse, obrigada',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'negative');
  const phoneRow = store.rows.find((row) => row.contactType === 'phone');
  assert.ok(phoneRow, 'negativa tambem marca');
  assert.equal(phoneRow.reason, 'sem_interesse');
  assert.ok(phoneRow.expiresAt instanceof Date, 'sem_interesse resfria, nao e permanente');
});

test('sinal positivo (interessado/convertido) NUNCA grava marca de supressao', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1' },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const store = createSuppressionStore();
  const { service } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) =>
        fn({
          vendasAutomationJob: { updateMany: async () => ({ count: 1 }), update: async (i: any) => i },
          vendasLead: { updateMany: async () => ({ count: 1 }), update: async (i: any) => i },
          vendasLeadTimelineEvent: { createMany: async () => ({ count: 1 }), create: async (i: any) => i },
        }),
      vendasAutomationJob: {
        findFirst: async () => buildVendasEmailJob(),
        update: async (i: any) => i,
        updateMany: async () => ({ count: 1 }),
      },
      vendasLead: { update: async (i: any) => i, updateMany: async () => ({ count: 1 }) },
      vendasLeadTimelineEvent: { create: async (i: any) => i, createMany: async () => ({ count: 1 }) },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      customerProfile: { findUnique: async () => null },
      vendasContactSuppression: store.model,
    },
  });

  await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 5,
    from: '+5519998877766',
    text: 'Tenho interesse sim, pode me explicar melhor?',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(store.rows.length, 0, 'lead que demonstra interesse nao pode ser suprimido');
});

test('marca do contato e best-effort: falha ao gravar NAO derruba o encerramento do lead', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1' },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const leadUpdates: Array<Record<string, any>> = [];
  const { service } = createService({
    prisma: {
      $transaction: async (fn: (client: unknown) => unknown) => fn(buildNegativeReplyTx(leadUpdates)),
      vendasAutomationJob: { findFirst: async () => buildVendasEmailJob() },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      customerProfile: {
        findUnique: async () => {
          throw new Error('perfil fora do ar');
        },
      },
      vendasContactSuppression: {
        createMany: async () => {
          throw new Error('banco fora do ar');
        },
      },
    },
  });

  const result = await (service as any).handleVendasAutomationInbound({
    companyId: 7,
    conversationId: 42,
    inboundMessageId: 1,
    from: '+5519998877766',
    text: 'Não tenho interesse, por favor remover.',
    timestamp: new Date('2026-05-06T17:21:00.000Z'),
    metadata,
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.handled, true);
  assert.equal(result.classification, 'opt_out');
  assert.equal(leadUpdates.length, 1, 'o lead foi encerrado mesmo com a marquinha falhando');
});

test('pitch pos-pre-mensagem nao se apresenta com nome de outro tenant (fim do "Jhonatan" cravado)', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1', preMessageAwaitingReply: true },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      company: { findUnique: async () => ({ id: 7, name: 'Padaria do Ze' }) },
      user: { findFirst: async () => ({ id: 3, name: 'Marcia', companyId: 7 }) },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      // Sem persona configurada: o {{funcionario}} cai no criador da campanha
      // (fallback) — o cenário original deste teste. Persona vencendo é coberto
      // pelo teste seguinte.
      vendasComercialConfig: { findUnique: async () => null },
    },
  });

  await (service as any).sendVendasPitchAfterPreMessage(
    { companyId: 7, conversationId: 42, from: '+5519998877766', metadata },
    {
      ...buildVendasEmailJob(),
      campaign: { id: 'campaign-1', companyId: 7, createdByUserId: 3, filtersJson: null },
    },
  );

  const body = String((queueCalls[0] as any)?.payload?.body || '');
  assert.ok(body.length > 0, 'pitch tinha que ser enfileirado');
  assert.equal(body.includes('Jhonatan'), false, 'nenhum tenant pode se apresentar com o nome do dono da HBX');
  assert.ok(body.includes('Marcia'), 'nome do responsavel pela campanha entra via {{funcionario}}');
  assert.ok(body.includes('Padaria do Ze'), 'nome da empresa entra via {{empresa}}');
});

// 🔴 03/08/2026 — REGRA VIRADA PELO DONO: "a persona tem q puxar o nome da
// pessoa logada". Este teste cobrava o contrário (persona da empresa ganhando de
// quem criou a campanha) e agora cobra o novo.
//
// O que mudou no MUNDO, não no código: a empresa passou a ter um chip POR
// vendedora (`company-N-user-M`). A lei nunca foi "uma empresa, um nome" — é
// "UM NÚMERO, UM NOME". Com a identidade presa à empresa, cinco vendedoras
// assinariam todas "Jhonatan": o lead abordado pela Bianca seria respondido por
// outro nome, no mesmo número. A persona da empresa continua valendo onde não há
// pessoa atrás do envio (Atendimento, Recovery) — coberto em
// persona-ia-por-pessoa.test.ts.
test('pitch pos-pre-mensagem assina com a DONA DA CAMPANHA, mesmo com persona de empresa', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1', preMessageAwaitingReply: true },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      company: { findUnique: async () => ({ id: 7, name: 'Padaria do Ze' }) },
      user: { findFirst: async () => ({ id: 3, name: 'Marcia', companyId: 7 }) },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      // Persona 'Lia' vem do harness base (vendasComercialConfig default).
    },
  });

  await (service as any).sendVendasPitchAfterPreMessage(
    { companyId: 7, conversationId: 42, from: '+5519998877766', metadata },
    {
      ...buildVendasEmailJob(),
      campaign: { id: 'campaign-1', companyId: 7, createdByUserId: 3, filtersJson: null },
    },
  );

  const body = String((queueCalls[0] as any)?.payload?.body || '');
  assert.ok(body.includes('Marcia'), 'quem manda a mensagem e quem assina — o chip e dela');
  assert.equal(body.includes('Lia'), false, 'a persona da empresa nao fala pelo numero de uma pessoa');
});

// ============================================================================
// CASA DO RISCO — o "digitando..." dos 2 envios automáticos (03/08/2026)
//
// Bug corrigido aqui: os dois call sites de computeVendasFollowUpTypingDelayMs
// passavam `job.campaign` (objeto) no lugar do companyId e esqueciam o `await`.
// O objeto virava NaN -> getConfig(NaN) caía no catch -> knobs DEFAULT (8s+12s),
// e a Promise não-aguardada era serializada como {} no variablesJson. Nada
// quebrava: o tempo de digitação só ignorava, em silêncio, o ajuste do dono.
//
// Como os testes abaixo provam as DUAS coisas de uma vez:
//   - o mock de vendasComercialConfig só devolve os knobs para companyId === 7
//     (com NaN devolve null) -> se o companyId errado voltar, caem os defaults;
//   - a casa é pinada em typingSeconds=3 / variance=0, ou seja teto de 3000ms,
//     e o corpo é longo o bastante pra que o cálculo por caractere (50-80ms/char)
//     SEMPRE estoure esse teto -> o valor esperado é exatamente 3000, sem sorteio;
//   - com o default (8+12 = teto de 20000ms) o mesmo corpo cairia entre ~10s e
//     ~16s, nunca 3000; e sem `await` o valor nem número seria.
// ============================================================================

/** Casa do risco pinada: teto de digitação = 3s, sem variância, só para a empresa 7. */
function vendasComercialConfigDaEmpresa7() {
  return {
    findUnique: async ({ where }: any) =>
      Number(where?.companyId) === 7
        ? {
            aiNome: 'Lia',
            aiIdentidade: 'nome_proprio',
            aiUserId: null,
            typingSeconds: 3,
            typingVarianceSeconds: 0,
          }
        : null,
  };
}

const TETO_DIGITACAO_DA_EMPRESA_MS = 3000;
// 200 chars: 200 * 50ms/char = 10000ms de piso -> estoura tanto o teto da empresa
// (3000) quanto qualquer valor "acidentalmente igual" a ele.
const CORPO_LONGO = 'a'.repeat(200);

test('continuidade qualificada: typingDelayMs enfileirado sai dos knobs da EMPRESA (numero, nao Promise nem default)', async () => {
  const metadata = {
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      vendasLead: {
        findFirst: async () => ({
          qualificacaoJson: null,
          status: 'contato',
          closedAt: null,
          wasClosedBefore: false,
        }),
      },
      vendasComercialConfig: vendasComercialConfigDaEmpresa7(),
    },
    intentEngine: {
      classifyIntentWithFallback: async () => ({ intent: { kind: 'positive' }, autoReply: false }),
    },
  });

  // O gerador (catálogo + IA) tem cobertura própria; aqui só o corpo importa.
  (service as any).generateVendasQualifiedReply = async () => ({ body: CORPO_LONGO });
  (service as any).persistVendasQualificacaoAfterReply = async () => undefined;

  const result = await (service as any).handleVendasQualifiedContinuation(
    {
      companyId: 7,
      conversationId: 42,
      inboundMessageId: 88,
      from: '+5519998877766',
      text: 'quero saber mais',
      metadata,
      setInboundMeta: async () => undefined,
    },
    buildVendasEmailJob(),
  );

  assert.equal(result?.classification, 'qualified_continuation');
  const typingDelayMs = (queueCalls[0]?.payload as any)?.variables?.typingDelayMs;
  assert.equal(typeof typingDelayMs, 'number', 'sem await isto seria uma Promise (serializada como {} no variablesJson)');
  assert.equal(
    typingDelayMs,
    TETO_DIGITACAO_DA_EMPRESA_MS,
    'o teto de digitação tem que vir da casa do risco da empresa 7, não do default 8s+12s',
  );
});

test('pitch pos-pre-mensagem: typingDelayMs enfileirado sai dos knobs da EMPRESA (numero, nao Promise nem default)', async () => {
  const metadata = {
    vendasAutomation: { jobId: 'job-email-1', leadId: 'lead-1', preMessageAwaitingReply: true },
    vendasAgendaQueue: { active: true, leadId: 'lead-1', automationJobId: 'job-email-1' },
  };
  const { service, queueCalls } = createService({
    prisma: {
      company: { findUnique: async () => ({ id: 7, name: 'Padaria do Ze' }) },
      user: { findFirst: async () => ({ id: 3, name: 'Marcia', companyId: 7 }) },
      companyConversation: { findFirst: async () => ({ id: 42, metadata: JSON.stringify(metadata) }) },
      vendasComercialConfig: vendasComercialConfigDaEmpresa7(),
    },
  });

  await (service as any).sendVendasPitchAfterPreMessage(
    { companyId: 7, conversationId: 42, from: '+5519998877766', metadata },
    {
      ...buildVendasEmailJob(),
      campaign: { id: 'campaign-1', companyId: 7, createdByUserId: 3, filtersJson: null },
    },
  );

  const body = String((queueCalls[0]?.payload as any)?.body || '');
  // Guarda da premissa do teto: com menos de 61 chars o cálculo por caractere não
  // estouraria os 3000ms e o valor esperado deixaria de ser determinístico.
  assert.ok(body.length > 60, `pitch curto demais (${body.length} chars) para este teste ser determinístico`);
  const typingDelayMs = (queueCalls[0]?.payload as any)?.variables?.typingDelayMs;
  assert.equal(typeof typingDelayMs, 'number', 'sem await isto seria uma Promise (serializada como {} no variablesJson)');
  assert.equal(
    typingDelayMs,
    TETO_DIGITACAO_DA_EMPRESA_MS,
    'o teto de digitação tem que vir da casa do risco da empresa 7, não do default 8s+12s',
  );
});

// ============================================================================
// RECEPCIONISTA IA — 31/07/2026 (ordem do dono).
// "O cliente entra em contato, se apresenta, ai o IA/bot ja comeca o cadastro."
// A cena que estes testes travam: desconhecido escreve -> a empresa se
// apresenta e CADASTRA, em vez de despejar menu; e o que a pessoa responde so
// vira nome se for nome de verdade.
// ============================================================================

function montarRecepcionista(opts?: {
  identity?: Record<string, any>;
  currentStep?: string | null;
  metadata?: Record<string, any>;
}) {
  const { service, queueCalls, conversationStateCalls } = createService();
  const cadastros: Array<Record<string, any>> = [];
  const eventos: Array<Record<string, any>> = [];

  (service as any).resolveAtendimentoIdentityState = async () => ({
    profileId: null,
    name: null,
    confirmedName: null,
    isConfirmed: false,
    registrationStatus: null,
    botOff: false,
    botOffReason: null,
    ...(opts?.identity || {}),
  });
  (service as any).upsertAtendimentoCustomerLocal = async (input: Record<string, any>) => {
    cadastros.push(input);
  };
  (service as any).appendAtendimentoSystemEvent = async (input: Record<string, any>) => {
    eventos.push(input);
  };
  (service as any).updateAtendimentoConversationState = async (
    _companyId: number,
    conversationId: number,
    state: Record<string, any>,
    metadata: Record<string, any>,
  ) => {
    conversationStateCalls.push({ conversationId, state, metadata });
  };
  (service as any).logWhatsAppEvent = async () => undefined;
  // TESTE NAO FALA COM REDE. O gate e o que esta sob teste aqui; o cerebro da
  // IA tem cobertura propria em recepcionista-slots.test.ts. Sem este stub, a
  // mensagem "rica" vaza pro Ollama real e o teste leva 10s (ou passa/falha
  // conforme a GPU do momento) — teste que depende de rede nao e teste.
  (service as any).recepcionista = {
    extrairSlots: async (texto: string) => ({
      slots: extractSlotsDeterministic(texto),
      fonte: 'regra' as const,
    }),
  };

  const chamar = (text: string, metadata?: Record<string, any>) =>
    (service as any).tryRecepcionistaGate({
      companyId: 7,
      from: '+5519998877766',
      text,
      conversationId: 42,
      company: { id: 7, name: 'Padaria Central' },
      conversation: { currentStep: opts?.currentStep ?? null },
      metadata: metadata ?? opts?.metadata ?? {},
      inboundProfileName: null,
      timestamp: new Date('2026-07-31T12:00:00.000Z'),
      setInboundMeta: async () => undefined,
    });

  return { service, chamar, cadastros, eventos, queueCalls, conversationStateCalls };
}

test('RECEPCIONISTA: desconhecido manda "oi" e a empresa se APRESENTA em vez de jogar menu', async () => {
  const { chamar, queueCalls, conversationStateCalls } = montarRecepcionista();

  const resultado = await chamar('oi');

  assert.equal(resultado?.handled, true, 'a recepcao tinha que assumir a mensagem');
  const enviada = String((queueCalls.at(-1) as any)?.payload?.body || '');
  assert.match(enviada, /Padaria Central/, 'a empresa precisa se identificar');
  assert.match(enviada, /Com quem eu falo/i, 'precisa perguntar quem e');
  // Fica no passo de recepcao pra proxima mensagem continuar o cadastro.
  assert.equal((conversationStateCalls.at(-1) as any)?.state?.currentStep, 'recepcao');
  assert.equal((conversationStateCalls.at(-1) as any)?.metadata?.recepcionistaPerguntas, 1);
});

test('RECEPCIONISTA: cliente responde o nome e o CADASTRO nasce ali', async () => {
  const { chamar, cadastros, eventos, conversationStateCalls } = montarRecepcionista({
    currentStep: 'recepcao',
    // Estado real depois da 1a pergunta: a recepcao ja perguntou o NOME.
    metadata: { recepcionistaPerguntas: 1, recepcionistaAguardando: 'nome' },
  });

  await chamar('Jhonatan');

  assert.equal(cadastros.length, 1, 'nao cadastrou o cliente');
  assert.equal(cadastros[0].name, 'Jhonatan');
  assert.equal(cadastros[0].registrationStatus, 'confirmed');
  assert.equal(cadastros[0].nameSource, 'recepcionista_ia');
  // O nome vira a identidade HBX da conversa (a lei do inbox.service).
  assert.equal((conversationStateCalls.at(-1) as any)?.metadata?.cliente, 'Jhonatan');
  assert.equal(eventos.some((e) => e.eventType === 'recepcionista_cadastrou'), true);
});

test('RECEPCIONISTA: "quero saber o preco" NAO vira nome de cliente', async () => {
  // Este era o bug do fluxo antigo de coleta: o que a pessoa digitasse virava
  // o nome dela, pra sempre, e ia pro funil assim.
  const { chamar, cadastros } = montarRecepcionista({
    currentStep: 'recepcao',
    // Estado real depois da 1a pergunta: a recepcao ja perguntou o NOME.
    metadata: { recepcionistaPerguntas: 1, recepcionistaAguardando: 'nome' },
  });

  await chamar('quero saber o preco');

  assert.deepEqual(cadastros, [], 'cadastrou um pedido como se fosse nome de gente');
});

test('RECEPCIONISTA: quem se apresenta INTEIRO nao e perguntado nada', async () => {
  const { chamar, cadastros, conversationStateCalls } = montarRecepcionista();

  // Nome + empresa + assunto na primeira mensagem: a recepcao cadastra e sai
  // do caminho (devolve null pro fluxo normal seguir com o menu).
  const resultado = await chamar('Oi, aqui e o Jhonatan da Padaria Central, queria um orcamento');

  assert.equal(resultado, null, 'nao podia segurar quem ja disse tudo');
  assert.equal(cadastros.length, 1);
  assert.equal(cadastros[0].name, 'Jhonatan');
  const ultimo = conversationStateCalls.at(-1) as any;
  assert.equal(ultimo?.metadata?.recepcionistaAssunto, 'orcamento');
  assert.equal(ultimo?.metadata?.recepcionistaEmpresa, 'Padaria Central');
  assert.equal(ultimo?.state?.currentStep, 'menu_principal', 'tinha que devolver pro fluxo normal');
});

test('RECEPCIONISTA: cliente JA cadastrado nao e interrogado de novo', async () => {
  const { chamar, queueCalls } = montarRecepcionista({
    identity: { isConfirmed: true, confirmedName: 'Jhonatan' },
  });

  const resultado = await chamar('bom dia');

  assert.equal(resultado, null, 'a recepcao nao pode assumir conversa de cliente conhecido');
  assert.deepEqual(queueCalls, [], 'nao pode mandar mensagem nenhuma');
});

test('RECEPCIONISTA: teto de 2 perguntas — quem nao responde vai pro fluxo normal', async () => {
  const { chamar, queueCalls } = montarRecepcionista({
    currentStep: 'recepcao',
    // Ja perguntou as duas vezes permitidas.
    metadata: { recepcionistaPerguntas: 2 },
  });

  const resultado = await chamar('...');

  assert.equal(resultado, null, 'passou do teto e continuou entrevistando');
  assert.deepEqual(queueCalls, [], 'nao pode fazer uma terceira pergunta');
});
