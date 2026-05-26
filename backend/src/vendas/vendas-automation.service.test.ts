import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasAutomationService } from './vendas-automation.service';
import { SAFE_FIRST_CONTACT_TEMPLATE } from './prospecting-safety';

const FALLBACK_MESSAGE = SAFE_FIRST_CONTACT_TEMPLATE.replace('{{cliente}}', 'Empresa Teste').replace('{{cidade}}', 'Sao Paulo');
  
function buildCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 'campaign-1',
    companyId: 7,
    createdByUserId: 99,
    status: 'running',
    city: 'Sao Paulo',
    state: 'SP',
    segment: 'clínica odontológica',
    messageTemplate: 'Mensagem segmentada para {{segmento}}',
    intervalMinutes: 20,
    dailyLimit: 15,
    minLeadBuffer: 1,
    desiredLeadBuffer: 1,
    maxAttemptsPerLead: 1,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:30',
    typingSeconds: 0,
    typingVarianceSeconds: 0,
    filtersJson: '{}',
    positiveIntentKeywordsJson: null,
    negativeIntentKeywordsJson: null,
    optOutMessage: null,
    ...overrides,
  };
}

function buildLead(overrides?: Record<string, unknown>) {
  return {
    id: 'lead-1',
    companyId: 7,
    name: 'Empresa Teste',
    phone: '+5511999998888',
    phoneNormalized: '5511999998888',
    status: 'novo',
    segment: 'restaurante',
    city: 'Sao Paulo',
    attemptCount: 0,
    lastContactAt: null,
    wasClosedBefore: false,
    closedAt: null,
    sourceType: 'webscraping',
    sourceSignature: 'clínica odontológica|Sao Paulo',
    ...overrides,
  };
}

function buildJob(overrides?: Record<string, unknown>) {
  const campaign = buildCampaign((overrides?.campaign as Record<string, unknown>) || {});
  const lead = buildLead((overrides?.lead as Record<string, unknown>) || {});
  return {
    id: 'job-1',
    campaignId: campaign.id,
    companyId: campaign.companyId,
    leadId: lead.id,
    status: 'scheduled',
    scheduledAt: new Date(),
    classification: null,
    campaign,
    lead,
    ...overrides,
  };
}

function createService(overrides?: {
  conversationMetadata?: Record<string, unknown> | null;
  conversationMetadataByPhone?: Record<string, Record<string, unknown> | null>;
  campaign?: Record<string, unknown>;
  previousContactJob?: Record<string, unknown> | null;
  previousContactJobsByLeadId?: Record<string, Record<string, unknown> | null>;
  negativeJob?: Record<string, unknown> | null;
  negativeJobsByLeadId?: Record<string, Record<string, unknown> | null>;
  latestSentJob?: Record<string, unknown> | null;
  successfulSendsToday?: number;
  hbotActive?: boolean;
  providerError?: string | null;
  activeProspectionConversations?: Array<Record<string, unknown>>;
  sentFirstContactMessagesToday?: string[];
  inboundJob?: Record<string, any> | null;
  realNegativeBlocksToday?: number;
  scheduleLeads?: any[];
  scheduleLeadsByCall?: any[][];
  searchResponse?: Record<string, any>;
  searchError?: string | null;
}) {
  const queueCalls: Array<Record<string, any>> = [];
  const jobUpdates: Array<Record<string, any>> = [];
  const jobUpdateManyCalls: Array<Record<string, any>> = [];
  const stateCalls: Array<Record<string, any>> = [];
  const campaignStageUpdates: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  const createdJobBatches: Array<any[]> = [];
  const scheduleCalls: string[] = [];
  const searchCalls: Array<Record<string, any>> = [];
  const importCalls: Array<Record<string, any>> = [];
  let scheduleLeadFindManyCalls = 0;
  let currentMetadata: Record<string, unknown> | null = overrides?.conversationMetadata ?? null;
  let successfulSendsToday = overrides?.successfulSendsToday || 0;
  let latestSentAt = overrides?.latestSentJob?.sentAt instanceof Date ? overrides.latestSentJob.sentAt : null;
  const campaignFixture = buildCampaign(overrides?.campaign || {});

  function metadataForWhere(where: any) {
    const byPhone = overrides?.conversationMetadataByPhone || {};
    const serialized = JSON.stringify(where || {});
    for (const [phone, metadata] of Object.entries(byPhone)) {
      const digits = String(phone || '').replace(/\D/g, '');
      if ((digits && serialized.includes(digits)) || serialized.includes(phone)) {
        return metadata;
      }
    }
    return currentMetadata;
  }

  const prisma: any = {
    vendasAutomationCampaign: {
      findUnique: async () => campaignFixture,
      findMany: async () => [campaignFixture],
      updateMany: async ({ data }: any) => {
        campaignStageUpdates.push(data);
        return { count: 1 };
      },
    },
    vendasAutomationJob: {
      count: async ({ where }: any = {}) => {
        if (where?.OR?.some((item: any) => item?.status === 'replied_negative')) return overrides?.realNegativeBlocksToday || 0;
        if (where?.sentAt?.gte) return successfulSendsToday;
        return 0;
      },
      findMany: async ({ where }: any = {}) => {
        if (where?.campaignId) return [];
        return [];
      },
      findFirst: async ({ where }: any = {}) => {
        if ((where?.id || where?.OR) && overrides?.inboundJob) return overrides.inboundJob;
        if (where?.sentAt) {
          return latestSentAt ? { sentAt: latestSentAt } : overrides?.latestSentJob || null;
        }
        if (where?.scheduledAt) {
          return null;
        }
        if (where?.leadId && where?.OR?.some((item: any) => item?.status === 'replied_negative')) {
          return (overrides?.negativeJobsByLeadId as any)?.[where.leadId] || overrides?.negativeJob || null;
        }
        if (where?.leadId) return (overrides?.previousContactJobsByLeadId as any)?.[where.leadId] || overrides?.previousContactJob || null;
        return null;
      },
      update: async ({ where, data }: any) => {
        jobUpdates.push({ where, data });
        if (data?.status === 'sent' && data?.sentAt instanceof Date) {
          successfulSendsToday += 1;
          latestSentAt = data.sentAt;
        }
        return { id: where.id, ...data };
      },
      updateMany: async ({ where, data }: any = {}) => {
        jobUpdateManyCalls.push({ where, data });
        return { count: 1 };
      },
      createMany: async ({ data }: any) => {
        createdJobBatches.push(data);
        return { count: data.length };
      },
      create: async ({ data }: any) => ({ id: 'review-job-1', ...data }),
    },
    vendasLead: {
      findMany: async () => {
        if (overrides?.scheduleLeadsByCall) {
          const result = overrides.scheduleLeadsByCall[scheduleLeadFindManyCalls] || [];
          scheduleLeadFindManyCalls += 1;
          return result;
        }
        return overrides?.scheduleLeads || [];
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
    },
    vendasLeadTimelineEvent: {
      create: async ({ data }: any) => ({ id: 'event-1', ...data }),
    },
    companyConversation: {
      findMany: async ({ select }: any = {}) => {
        if (select?.metadata && overrides?.sentFirstContactMessagesToday) {
          return overrides.sentFirstContactMessagesToday.map((draftMessage, index) => ({
            metadata: JSON.stringify({
              vendasAutomation: { sentAt: new Date(Date.now() - index * 60000).toISOString() },
              vendasAgendaQueue: { draftMessage },
            }),
          }));
        }
        return overrides?.activeProspectionConversations || [];
      },
      findFirst: async ({ where }: any = {}) => {
        const metadata = metadataForWhere(where);
        if (where?.id) return { id: where.id, companyId: 7, channel: 'whatsapp', contact: '+5511999998888', metadata: JSON.stringify(metadata || {}) };
        if (metadata === null) return null;
        return { id: 501, companyId: 7, channel: 'whatsapp', contact: '+5511999998888', metadata: JSON.stringify(metadata || {}) };
      },
    },
    user: {
      findFirst: async () => ({ id: 99, name: 'Jhonatan', companyId: 7, company: { id: 7, name: 'HBX' } }),
    },
    company: {
      findUnique: async () => ({ id: 7, name: 'HBX' }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
  };

  const inboxService = {
    getBotConfig: async () => ({
      routingRules: { globalBotEnabled: overrides?.hbotActive !== false },
      setup: { completed: true },
    }),
  };

  const webscrapingService = {
    pullRadarLeadsForUser: async (user: any, input: Record<string, any>) => {
      searchCalls.push({ user, input });
      if (overrides?.searchError) throw new Error(overrides.searchError);
      const response = overrides?.searchResponse || {
        query: { city: input.city, segment: input.segment },
        results: [],
        meta: { historyId: null },
      };
      return {
        items: (response.results || []).map((item: any, index: number) => ({
          id: item.radarLeadId || `radar-${index + 1}`,
          ...item,
        })),
        meta: { deliveredCount: (response.results || []).length },
      };
    },
    markRadarLeadsSentToVendasForUser: async () => ({ ok: true, updatedCount: 0 }),
    getRadarContactProtectionForUser: async () => ({ blocked: false }),
    markRadarContactDispositionForUser: async () => ({ ok: true }),
    searchContactsForUser: async (user: any, input: Record<string, any>) => {
      searchCalls.push({ user, input });
      if (overrides?.searchError) throw new Error(overrides.searchError);
      return overrides?.searchResponse || {
        query: { city: input.city, segment: input.segment },
        results: [],
        meta: { historyId: null },
      };
    },
  };

  const vendasService = {
    importWebscrapingLeadsForUser: async (user: any, input: Record<string, any>) => {
      importCalls.push({ user, input });
      return { imported: input?.leads?.length || 0 };
    },
  };

  const conversations = {
    getOrCreateConversationForContact: async () => ({ id: 501, metadata: JSON.stringify(currentMetadata || {}) }),
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, any>) => {
      currentMetadata = payload.metadata || currentMetadata;
      stateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    queueOutboundForCompany: async (companyId: number, payload: Record<string, any>) => {
      if (overrides?.providerError) {
        throw new Error(overrides.providerError);
      }
      queueCalls.push({ companyId, payload });
      return { conversationId: 501 };
    },
  };

  const inboxRealtime = {
    publish: (payload: Record<string, any>) => events.push(payload),
  };
  const commercialPlansService = {
    assertAssistedSetupCompleteForCompany: async () => true,
  };

  const service = new VendasAutomationService(
    prisma,
    inboxService as any,
    webscrapingService as any,
    vendasService as any,
    conversations as any,
    inboxRealtime as any,
    commercialPlansService as any,
  ) as any;
  service.isInsideWorkingHours = () => true;
  const originalScheduleJobsForCampaign = service.scheduleJobsForCampaign.bind(service);
  service.scheduleJobsForCampaign = async (campaignId: string) => {
    scheduleCalls.push(campaignId);
    return originalScheduleJobsForCampaign(campaignId);
  };

  return { service, queueCalls, jobUpdates, jobUpdateManyCalls, stateCalls, campaignStageUpdates, events, createdJobBatches, scheduleCalls, searchCalls, importCalls };
}

test('cancelQueuedJobsAfterSearchChange archives stale pending automation jobs', async () => {
  const { service, jobUpdateManyCalls } = createService();

  await service.cancelQueuedJobsAfterSearchChange('campaign-1');

  assert.equal(jobUpdateManyCalls.length, 1);
  assert.deepEqual(jobUpdateManyCalls[0].where, {
    campaignId: 'campaign-1',
    status: { in: ['pending', 'scheduled', 'sending'] },
  });
  assert.equal(jobUpdateManyCalls[0].data.status, 'canceled');
  assert.equal(jobUpdateManyCalls[0].data.errorMessage, 'Busca da campanha alterada. Fila anterior cancelada.');
  assert.ok(jobUpdateManyCalls[0].data.archivedAt instanceof Date);
});

test('processDueJob sends segment mismatch lead with safe generic fallback when first contact was never sent', async () => {
  const { service, queueCalls, jobUpdates, stateCalls, events } = createService({ conversationMetadata: {} });

  await service.processDueJob(buildJob());

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, FALLBACK_MESSAGE);
  assert.ok(jobUpdates.some((call) => call.data.status === 'sent' && call.data.classification === 'segment_mismatch_fallback'));
  const finalMetadata = stateCalls.at(-1)?.payload.metadata;
  assert.equal(finalMetadata.vendasProspeccao.stage, 'sent_waiting');
  assert.equal(finalMetadata.vendasProspeccao.mismatchReason, 'segment_mismatch_fallback');
  assert.equal(finalMetadata.vendasAgendaQueue.draftMessage, FALLBACK_MESSAGE);
  assert.ok(events.some((event) => event.automation?.text === 'Segmento divergente: usando mensagem genérica segura.'));
});

test('processDueJob does not repeat first contact for segment mismatch lead with outbound history', async () => {
  const { service, queueCalls, jobUpdates, stateCalls } = createService({
    conversationMetadata: {
      vendasProspeccao: { stage: 'sent_waiting', firstOutboundAt: '2026-05-05T10:00:00.000Z' },
      vendasAgendaQueue: { manualSent: true, manualSentAt: '2026-05-05T10:00:00.000Z' },
    },
  });

  await service.processDueJob(buildJob());

  assert.equal(queueCalls.length, 0);
  assert.ok(jobUpdates.some((call) => call.data.status === 'skipped' && call.data.classification === 'first_contact_already_sent'));
  assert.equal(stateCalls.at(-1)?.payload.metadata.vendasProspeccao.stage, 'needs_review');
});

test('processDueJob does not send segment mismatch lead with negative reply or opt-out', async () => {
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadata: {
      optOut: true,
      doNotContact: true,
      vendasProspeccao: { stage: 'negative_reply' },
    },
  });

  await service.processDueJob(buildJob());

  assert.equal(queueCalls.length, 0);
  assert.ok(jobUpdates.some((call) => call.data.status === 'skipped' && call.data.classification === 'negative_or_opt_out'));
});

test('processDueJob does not send segment mismatch lead without WhatsApp phone', async () => {
  const { service, queueCalls, jobUpdates } = createService({ conversationMetadata: null });

  await service.processDueJob(buildJob({ lead: { phone: null, phoneNormalized: null } }));

  assert.equal(queueCalls.length, 0);
  assert.ok(jobUpdates.some((call) => call.data.status === 'skipped' && call.data.errorMessage === 'Lead sem telefone valido.'));
});

test('processDueJob keeps segment mismatch lead visible with draft fallback when auto-send permission is missing', async () => {
  const { service, queueCalls, jobUpdates, stateCalls, events } = createService({
    conversationMetadata: {
      requiresOptIn: true,
    },
  });

  await service.processDueJob(buildJob());

  assert.equal(queueCalls.length, 0);
  assert.ok(
    jobUpdates.some(
      (call) => call.data.status === 'skipped' && call.data.classification === 'segment_mismatch_fallback_draft',
    ),
  );
  const finalMetadata = stateCalls.at(-1)?.payload.metadata;
  assert.equal(finalMetadata.vendasProspeccao.stage, 'pending_send');
  assert.equal(finalMetadata.vendasProspeccao.mismatchReason, 'segment_mismatch_fallback');
  assert.equal(finalMetadata.vendasAgendaQueue.draftMessage, FALLBACK_MESSAGE);
  assert.equal(finalMetadata.vendasAgendaQueue.botEligible, false);
  assert.equal(finalMetadata.vendasAgendaQueue.botEntryPending, false);
  assert.ok(events.some((event) => event.automation?.text === 'Segmento divergente: usando mensagem genérica segura.'));
});

test('scheduleJobsForCampaign queues eligible segment mismatch fallback instead of waiting for new valid contacts', async () => {
  const lead = buildLead();
  const { service, stateCalls, campaignStageUpdates, createdJobBatches } = createService({
    conversationMetadata: null,
    scheduleLeads: [lead],
  });

  await service.scheduleJobsForCampaign('campaign-1');

  assert.equal(createdJobBatches.length, 1);
  assert.equal(createdJobBatches[0][0].leadId, lead.id);
  assert.equal(createdJobBatches[0][0].classification, 'segment_mismatch_fallback');
  assert.equal(stateCalls.at(-1)?.payload.metadata.vendasProspeccao.mismatchReason, 'segment_mismatch_fallback');
  assert.equal(stateCalls.at(-1)?.payload.metadata.vendasAgendaQueue.draftMessage, FALLBACK_MESSAGE);
  assert.ok(campaignStageUpdates.some((data) => String(data.lastStatusText || '').includes('1 contatos na fila.')));
  assert.ok(!campaignStageUpdates.some((data) => String(data.lastStatusText || '').includes('Aguardando novos contatos válidos.')));
});

test('scheduleJobsForCampaign falls back to broader webscraping pool when exact source has no cards', async () => {
  const lead = buildLead({ id: 'lead-broader', sourceSignature: 'outro ramo|Outra Cidade' });
  const { service, campaignStageUpdates, createdJobBatches } = createService({
    conversationMetadata: null,
    scheduleLeadsByCall: [[], [lead]],
  });

  await service.scheduleJobsForCampaign('campaign-1');

  assert.equal(createdJobBatches.length, 1);
  assert.equal(createdJobBatches[0][0].leadId, 'lead-broader');
  assert.ok(campaignStageUpdates.some((data) => String(data.lastStatusText || '').includes('ramo próximo')));
});

test('scrapeImportAndSchedule blocks incomplete campaign config before calling webscraping', async () => {
  const { service, campaignStageUpdates, searchCalls } = createService({
    campaign: { segment: '' },
  });

  await service.scrapeImportAndSchedule('campaign-1', undefined, 'refill');

  assert.equal(searchCalls.length, 0);
  assert.ok(campaignStageUpdates.some((data) => String(data.lastError || '').includes('segmento')));
  assert.ok(campaignStageUpdates.some((data) => String(data.lastStatusText || '').includes('Revise a configuração')));
});

test('scrapeImportAndSchedule records webscraping failures in campaign status', async () => {
  const { service, campaignStageUpdates, searchCalls } = createService({
    searchError: 'Segmento obrigatorio.',
  });

  await assert.rejects(() => service.scrapeImportAndSchedule('campaign-1', undefined, 'refill'), /Segmento obrigatorio/);

  assert.equal(searchCalls.length, 1);
  assert.ok(campaignStageUpdates.some((data) => data.lastError === 'Segmento obrigatorio.'));
  assert.ok(campaignStageUpdates.some((data) => String(data.lastStatusText || '').includes('Busca de contatos falhou')));
});

test('runWorkerCycle sends due jobs before running refill', async () => {
  const campaign = buildCampaign();
  const lead = buildLead({ segment: campaign.segment });
  const jobs = [buildJob({ id: 'job-due', campaign, lead, leadId: lead.id })];
  const { service, queueCalls } = createService({ conversationMetadata: null });
  let refillSawSent = false;

  service.archiveNoResponseJobs = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.refillCampaignsIfNeeded = async () => {
    refillSawSent = queueCalls.length === 1;
  };

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(refillSawSent, true);
});

test('runWorkerCycle skips needs_review job and sends the next valid lead in the same cycle', async () => {
  const campaign = buildCampaign();
  const reviewLead = buildLead({
    id: 'lead-review',
    phone: '+551100000001',
    phoneNormalized: '551100000001',
    segment: 'restaurante',
  });
  const validLead = buildLead({
    id: 'lead-valid',
    phone: '+551100000002',
    phoneNormalized: '551100000002',
    segment: campaign.segment,
  });
  const jobs = [
    buildJob({ id: 'job-review', campaign, lead: reviewLead, leadId: reviewLead.id }),
    buildJob({ id: 'job-valid', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadataByPhone: {
      '551100000001': {
        vendasProspeccao: { stage: 'needs_review' },
      },
      '551100000002': {},
    },
  });

  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-valid');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-review' && call.data.status === 'skipped' && call.data.classification === 'needs_review'));
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-valid' && call.data.status === 'sent'));
});

test('lead without scriptText uses campaign messageTemplate', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({
    messageTemplate: 'Olá {{cliente}}, aqui é {{funcionario}} da {{empresa}} falando sobre {{segmento}}.',
  });
  const lead = buildLead({ segment: campaign.segment, scriptText: '   ' });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Olá Empresa Teste, aqui é Jhonatan da HBX falando sobre clínica odontológica.');
});

test('campaign template can use smart lead company summary variable', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({
    messageTemplate: 'Olá, falo na empresa {{empresaresumo}}?',
  });
  const lead = buildLead({
    name: 'empresa de maquinas agrícolas e pesados LTDA',
    segment: campaign.segment,
    scriptText: '   ',
  });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Olá, falo na empresa Agrícolas e Pesados?');
});

test('lead without script and campaign without template uses DEFAULT_MESSAGE_TEMPLATE', async () => {
  const { service, queueCalls } = createService({
    conversationMetadata: null,
    campaign: { messageTemplate: '   ' },
  });
  const campaign = buildCampaign({ messageTemplate: '   ' });
  const lead = buildLead({ segment: campaign.segment, scriptText: '', roteiro: '', messageTemplate: '' });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, FALLBACK_MESSAGE);
});

test('first contact message with URL is sent without URL', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({
    messageTemplate: 'Oi {{cliente}}, veja aqui: https://hbxsystem.com.br/vendas/automacao?tab=prospeccao',
  });
  const lead = buildLead({ segment: campaign.segment });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body.includes('https://'), false);
  assert.equal(queueCalls[0].payload.body.includes('hbxsystem.com.br'), false);
});

test('Cadastre aqui followed by URL is removed from first contact', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({
    messageTemplate: 'Oi {{cliente}}, posso te mandar uma ideia rápida?\nCadastre aqui: https://hbxsystem.com.br/vendas/automacao',
  });
  const lead = buildLead({ segment: campaign.segment });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Oi Empresa Teste, posso te mandar uma ideia rápida?');
});

test('old saved campaign template with link is sanitized at final send', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({
    messageTemplate: 'Oi {{cliente}} em {{cidade}}. Link: www.hbxsystem.com.br/vendas/automacao',
  });
  const lead = buildLead({ segment: campaign.segment });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Oi Empresa Teste em Sao Paulo.');
});

test('repeated first contact automatically uses safe variant without link', async () => {
  const repeated = 'Oi, tudo bem? Vi a Empresa Teste em Sao Paulo. Posso te mandar uma ideia rápida para organizar contatos e retornos no WhatsApp?';
  const { service, queueCalls } = createService({
    conversationMetadata: null,
    sentFirstContactMessagesToday: [repeated, repeated, repeated],
  });
  const campaign = buildCampaign({ messageTemplate: SAFE_FIRST_CONTACT_TEMPLATE });
  const lead = buildLead({ segment: campaign.segment });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.notEqual(queueCalls[0].payload.body, repeated);
  assert.equal(queueCalls[0].payload.body.includes('http'), false);
});

test('intervalMinutes defers the second send but still prepares future jobs', async () => {
  const sentAt = new Date();
  const futureLead = buildLead({
    id: 'lead-future',
    phone: '+551100000003',
    phoneNormalized: '551100000003',
    segment: 'clínica odontológica',
  });
  const { service, queueCalls, jobUpdates, scheduleCalls, createdJobBatches } = createService({
    conversationMetadata: null,
    latestSentJob: { sentAt },
    campaign: { desiredLeadBuffer: 2, intervalMinutes: 12 },
    scheduleLeads: [futureLead],
  });
  const campaign = buildCampaign({ desiredLeadBuffer: 2, intervalMinutes: 12 });
  const lead = buildLead({ segment: campaign.segment });

  const result = await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(result.outcome, 'blocked');
  assert.equal(queueCalls.length, 0);
  const deferredUpdate = jobUpdates.find((call) => call.where.id === 'job-1' && call.data.scheduledAt instanceof Date);
  assert.ok(deferredUpdate);
  assert.ok(deferredUpdate.data.scheduledAt.getTime() >= sentAt.getTime() + 12 * 60000);
  assert.ok(scheduleCalls.includes('campaign-1'));
  assert.equal(createdJobBatches.length, 1);
  assert.equal(createdJobBatches[0][0].leadId, 'lead-future');
});

test('first_contact_already_sent is skipped and campaign can continue', async () => {
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadata: {
      vendasProspeccao: { stage: 'sent_waiting', firstOutboundAt: '2026-05-05T10:00:00.000Z' },
      vendasAgendaQueue: { manualSent: true },
    },
  });
  const campaign = buildCampaign();
  const lead = buildLead({ segment: campaign.segment });

  const result = await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(result.outcome, 'skipped');
  assert.equal(result.classification, 'first_contact_already_sent');
  assert.equal(queueCalls.length, 0);
  assert.ok(jobUpdates.some((call) => call.data.status === 'skipped' && call.data.classification === 'first_contact_already_sent'));
});

test('segment_mismatch_fallback_draft stays visible and worker prepares the next valid lead', async () => {
  const campaign = buildCampaign();
  const draftLead = buildLead({
    id: 'lead-draft',
    phone: '+551100000004',
    phoneNormalized: '551100000004',
    segment: 'restaurante',
  });
  const validLead = buildLead({
    id: 'lead-next',
    phone: '+551100000005',
    phoneNormalized: '551100000005',
    segment: campaign.segment,
  });
  const jobs = [
    buildJob({ id: 'job-draft', campaign, lead: draftLead, leadId: draftLead.id }),
    buildJob({ id: 'job-next', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates, stateCalls } = createService({
    conversationMetadataByPhone: {
      '551100000004': { requiresOptIn: true },
      '551100000005': {},
    },
  });

  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-next');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-draft' && call.data.status === 'skipped' && call.data.classification === 'segment_mismatch_fallback_draft'));
  assert.ok(stateCalls.some((call) => call.payload.metadata.vendasProspeccao.stage === 'pending_send'));
});

test('dailyLimit=10 and maxAttemptsPerLead=1 allows 10 different successful sends, then blocks the 11th', async () => {
  const campaign = buildCampaign({ dailyLimit: 10, maxAttemptsPerLead: 1, intervalMinutes: 12 });
  const phones = Array.from({ length: 11 }, (_, index) => `55119999988${String(index).padStart(2, '0')}`);
  const { service, queueCalls } = createService({
    campaign,
    conversationMetadataByPhone: Object.fromEntries(phones.map((phone) => [phone, {}])),
  });
  service.getNextAllowedSendAt = async () => null;

  const outcomes: string[] = [];
  for (let index = 0; index < 11; index += 1) {
    const lead = buildLead({
      id: `lead-${index + 1}`,
      phone: `+${phones[index]}`,
      phoneNormalized: phones[index],
      segment: campaign.segment,
      attemptCount: 0,
    });
    const result = await service.processDueJob(buildJob({ id: `job-${index + 1}`, campaign, lead, leadId: lead.id }));
    outcomes.push(result.outcome);
  }

  assert.equal(queueCalls.length, 10);
  assert.equal(outcomes.slice(0, 10).every((outcome) => outcome === 'sent_success'), true);
  assert.equal(outcomes[10], 'blocked');
});

test('needs_review skip does not consume credit or cooldown and worker sends next eligible lead', async () => {
  const campaign = buildCampaign({ dailyLimit: 10, maxAttemptsPerLead: 1 });
  const reviewLead = buildLead({ id: 'lead-review-2', phone: '+551100000011', phoneNormalized: '551100000011', segment: campaign.segment });
  const validLead = buildLead({ id: 'lead-valid-2', phone: '+551100000012', phoneNormalized: '551100000012', segment: campaign.segment });
  const jobs = [
    buildJob({ id: 'job-review-2', campaign, lead: reviewLead, leadId: reviewLead.id }),
    buildJob({ id: 'job-valid-2', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadataByPhone: {
      '551100000011': { vendasProspeccao: { stage: 'needs_review' } },
      '551100000012': {},
    },
  });
  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);
  service.getNextAllowedSendAt = async () => null;

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-valid-2');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-review-2' && call.data.classification === 'needs_review'));
});

test('lead without WhatsApp is skipped without credit and next eligible lead is used', async () => {
  const campaign = buildCampaign({ maxAttemptsPerLead: 1 });
  const badLead = buildLead({ id: 'lead-no-whatsapp', phone: null, phoneNormalized: null, segment: campaign.segment });
  const validLead = buildLead({ id: 'lead-after-no-whatsapp', phone: '+551100000022', phoneNormalized: '551100000022', segment: campaign.segment });
  const jobs = [
    buildJob({ id: 'job-no-whatsapp', campaign, lead: badLead, leadId: badLead.id }),
    buildJob({ id: 'job-after-no-whatsapp', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({ conversationMetadataByPhone: { '551100000022': {} } });
  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);
  service.getNextAllowedSendAt = async () => null;

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-after-no-whatsapp');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-no-whatsapp' && call.data.classification === 'invalid_whatsapp'));
});

test('already contacted lead is skipped without credit and next eligible lead is used', async () => {
  const campaign = buildCampaign({ maxAttemptsPerLead: 1 });
  const contactedLead = buildLead({ id: 'lead-contacted', phone: '+551100000031', phoneNormalized: '551100000031', segment: campaign.segment });
  const validLead = buildLead({ id: 'lead-after-contacted', phone: '+551100000032', phoneNormalized: '551100000032', segment: campaign.segment });
  const jobs = [
    buildJob({ id: 'job-contacted', campaign, lead: contactedLead, leadId: contactedLead.id }),
    buildJob({ id: 'job-after-contacted', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadataByPhone: {
      '551100000031': { vendasProspeccao: { firstOutboundAt: '2026-05-05T10:00:00.000Z' } },
      '551100000032': {},
    },
  });
  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);
  service.getNextAllowedSendAt = async () => null;

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-after-contacted');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-contacted' && call.data.classification === 'first_contact_already_sent'));
});

test('opt-out or negative lead is skipped without credit and next eligible lead is used', async () => {
  const campaign = buildCampaign({ maxAttemptsPerLead: 1 });
  const optOutLead = buildLead({ id: 'lead-optout', phone: '+551100000041', phoneNormalized: '551100000041', segment: campaign.segment });
  const validLead = buildLead({ id: 'lead-after-optout', phone: '+551100000042', phoneNormalized: '551100000042', segment: campaign.segment });
  const jobs = [
    buildJob({ id: 'job-optout', campaign, lead: optOutLead, leadId: optOutLead.id }),
    buildJob({ id: 'job-after-optout', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({
    conversationMetadataByPhone: {
      '551100000041': { optOut: true, vendasProspeccao: { stage: 'negative_reply' } },
      '551100000042': {},
    },
  });
  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);
  service.getNextAllowedSendAt = async () => null;

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-after-optout');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-optout' && call.data.classification === 'negative_or_opt_out'));
});

test('provider failure does not count as dailyLimit success', async () => {
  const campaign = buildCampaign({ dailyLimit: 1 });
  const { service, queueCalls, jobUpdates } = createService({ conversationMetadata: null, providerError: 'provider offline' });
  service.getNextAllowedSendAt = async () => null;
  const lead = buildLead({ segment: campaign.segment });

  const result = await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));
  const sentToday = await service.countSuccessfulSendsToday(campaign.id, campaign.companyId);

  assert.equal(result.outcome, 'failed_no_credit');
  assert.equal(queueCalls.length, 0);
  assert.equal(sentToday, 0);
  assert.ok(jobUpdates.some((call) => call.data.status === 'failed'));
});

test('intervalMinutes uses only successful sentAt jobs and ignores skipped or failed jobs', async () => {
  const sentAt = new Date(Date.now() - 2 * 60000);
  const { service, jobUpdates } = createService({
    latestSentJob: { sentAt },
    conversationMetadata: null,
    campaign: { intervalMinutes: 12 },
  });
  const campaign = buildCampaign({ intervalMinutes: 12 });
  const lead = buildLead({ segment: campaign.segment });

  const result = await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(result.outcome, 'blocked');
  const deferredUpdate = jobUpdates.find((call) => call.where.id === 'job-1' && call.data.scheduledAt instanceof Date);
  assert.ok(deferredUpdate);
  assert.ok(deferredUpdate.data.scheduledAt.getTime() >= sentAt.getTime() + 12 * 60000);
});

test('sentToday=9 with dailyLimit=10 sends one more and then blocks real sends', async () => {
  const campaign = buildCampaign({ dailyLimit: 10, maxAttemptsPerLead: 1 });
  const { service, queueCalls } = createService({
    successfulSendsToday: 9,
    campaign,
    conversationMetadataByPhone: {
      '551100000051': {},
      '551100000052': {},
    },
  });
  service.getNextAllowedSendAt = async () => null;
  const firstLead = buildLead({ id: 'lead-allowed-last', phone: '+551100000051', phoneNormalized: '551100000051', segment: campaign.segment });
  const secondLead = buildLead({ id: 'lead-blocked-limit', phone: '+551100000052', phoneNormalized: '551100000052', segment: campaign.segment });

  const first = await service.processDueJob(buildJob({ id: 'job-allowed-last', campaign, lead: firstLead, leadId: firstLead.id }));
  const second = await service.processDueJob(buildJob({ id: 'job-blocked-limit', campaign, lead: secondLead, leadId: secondLead.id }));

  assert.equal(first.outcome, 'sent_success');
  assert.equal(second.outcome, 'blocked');
  assert.equal(queueCalls.length, 1);
});

test('maxAttemptsPerLead=1 blocks same lead repetition but not different leads', async () => {
  const campaign = buildCampaign({ maxAttemptsPerLead: 1 });
  const repeatedLead = buildLead({ id: 'lead-repeat', phone: '+551100000061', phoneNormalized: '551100000061', segment: campaign.segment, attemptCount: 1 });
  const validLead = buildLead({ id: 'lead-different', phone: '+551100000062', phoneNormalized: '551100000062', segment: campaign.segment, attemptCount: 0 });
  const jobs = [
    buildJob({ id: 'job-repeat', campaign, lead: repeatedLead, leadId: repeatedLead.id }),
    buildJob({ id: 'job-different', campaign, lead: validLead, leadId: validLead.id }),
  ];
  const { service, queueCalls, jobUpdates } = createService({ conversationMetadataByPhone: { '551100000062': {} } });
  service.archiveNoResponseJobs = async () => null;
  service.refillCampaignsIfNeeded = async () => null;
  service.prepareCampaignBuffersDuringCooldown = async () => null;
  service.findNextDueJob = async () => jobs.shift() || null;
  service.findNextDueJobForCampaign = async () => (jobs[0] ? { id: jobs[0].id } : null);
  service.getNextAllowedSendAt = async () => null;

  await service.runWorkerCycle();

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.variables.leadId, 'lead-different');
  assert.ok(jobUpdates.some((call) => call.where.id === 'job-repeat' && call.data.classification === 'first_contact_already_sent'));
});

test('lead pre-script has priority over campaign messageTemplate and defaults', async () => {
  const { service, queueCalls } = createService({ conversationMetadata: null });
  const campaign = buildCampaign({ messageTemplate: 'Template da campanha {{cliente}}' });
  const lead = buildLead({ segment: campaign.segment, scriptText: 'Roteiro do lead para {{cliente}}.' });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Roteiro do lead para Empresa Teste.');
});

test('safe first contact defaults do not contain links and keep tomorrow limits', async () => {
  const campaign = buildCampaign();

  assert.equal(SAFE_FIRST_CONTACT_TEMPLATE.includes('http'), false);
  assert.equal(SAFE_FIRST_CONTACT_TEMPLATE.includes('hbxsystem.com.br'), false);
  assert.equal(campaign.dailyLimit, 15);
  assert.equal(campaign.maxAttemptsPerLead, 1);
});

test('auto reply menu is not classified as negative reply', async () => {
  const campaign = buildCampaign();
  const lead = buildLead({ segment: campaign.segment });
  const job = buildJob({ status: 'sent', campaign, lead, leadId: lead.id });
  const { service, jobUpdates, stateCalls } = createService({ inboundJob: job });
  const inboundMetaCalls: Array<Record<string, unknown>> = [];

  const result = await service.classifyProspectingInbound({
    companyId: 7,
    conversationId: 501,
    messageId: 1,
    from: lead.phone,
    text: 'Olá, eu sou a Ivet. Digite o número correspondente para selecionar uma das opções.',
    timestamp: new Date(),
    metadata: { vendasAutomation: { jobId: job.id }, vendasAgendaQueue: { automationJobId: job.id } },
    setInboundMeta: async (sourceModule: string, isComplaint: boolean) => {
      inboundMetaCalls.push({ sourceModule, isComplaint });
    },
  });

  assert.equal(result.classification, 'bot_menu_detected');
  assert.equal(inboundMetaCalls[0].sourceModule, 'vendas_prospeccao_auto_reply');
  assert.ok(jobUpdates.some((call) => call.data.classification === 'bot_menu_detected'));
  assert.equal(stateCalls.at(-1)?.payload.metadata.vendasAgendaQueue.status, 'awaiting_human');
  assert.equal(jobUpdates.some((call) => call.data.status === 'replied_negative'), false);
});

test('explicit no-interest reply becomes negative opt-out block', async () => {
  const campaign = buildCampaign();
  const lead = buildLead({ segment: campaign.segment });
  const job = buildJob({ status: 'sent', campaign, lead, leadId: lead.id });
  const { service, jobUpdates } = createService({ inboundJob: job });

  const result = await service.classifyProspectingInbound({
    companyId: 7,
    conversationId: 501,
    messageId: 1,
    from: lead.phone,
    text: 'Não tenho interesse, por favor remover.',
    timestamp: new Date(),
    metadata: { vendasAutomation: { jobId: job.id }, vendasAgendaQueue: { automationJobId: job.id } },
    setInboundMeta: async () => undefined,
  });

  assert.equal(result.classification, 'opt_out');
  assert.ok(jobUpdates.some((call) => call.data.status === 'replied_negative' && call.data.classification === 'opt_out'));
});

test('campaign pauses when real negative limit is reached before sending', async () => {
  const campaign = buildCampaign();
  const lead = buildLead({ segment: campaign.segment });
  const { service, queueCalls, campaignStageUpdates } = createService({
    conversationMetadata: null,
    realNegativeBlocksToday: 3,
  });

  const result = await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(result.outcome, 'blocked');
  assert.equal(result.reason, 'real_negative_safety_pause');
  assert.equal(queueCalls.length, 0);
  assert.ok(campaignStageUpdates.some((data) => data.status === 'paused' && String(data.lastStatusText || '').includes('negativas')));
});
