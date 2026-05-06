import test from 'node:test';
import assert from 'node:assert/strict';

import { MessagingService } from './messaging.service';
import { DEFAULT_ATENDIMENTO_BOT_CONFIG } from '../inbox/atendimento-config';

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
    hbxRecoveryFlowStage: {
      findFirst: async () => null,
    },
    ...(overrides?.prisma || {}),
  } as any;

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
    (overrides?.hbxPresentationEmails || undefined) as any,
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
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
            { key: 'bot_ia', status: 'active', currentPeriodEnd: null },
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
  assert.equal(
    (queueCalls[0].payload as any).body,
    'Escolha abaixo como deseja continuar no Atendimento:\n\n1. Suporte\n2. Agendar visita\n3. Falar com atendente',
  );
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
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
            { key: 'bot_ia', status: 'active', currentPeriodEnd: null },
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
          commercialEntitlements: [
            { key: 'vendas', status: 'active', currentPeriodEnd: null },
            { key: 'bot_ia', status: 'active', currentPeriodEnd: null },
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
