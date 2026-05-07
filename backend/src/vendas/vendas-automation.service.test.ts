import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasAutomationService } from './vendas-automation.service';

const FALLBACK_MESSAGE =
  'Oi, tudo bem? Sou o Jhonatan, da HBX. Vi sua empresa no Google e queria te mostrar uma ferramenta que ajuda a organizar contatos, orçamentos e retornos pelo WhatsApp. Tenho 30 dias grátis, sem compromisso. Faz sentido eu te mostrar?';

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
    intervalMinutes: 12,
    dailyLimit: 30,
    minLeadBuffer: 1,
    desiredLeadBuffer: 1,
    maxAttemptsPerLead: 3,
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
  scheduleLeads?: any[];
}) {
  const queueCalls: Array<Record<string, any>> = [];
  const jobUpdates: Array<Record<string, any>> = [];
  const stateCalls: Array<Record<string, any>> = [];
  const campaignStageUpdates: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  const createdJobBatches: Array<any[]> = [];
  const scheduleCalls: string[] = [];
  let currentMetadata: Record<string, unknown> | null = overrides?.conversationMetadata ?? null;
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
      count: async () => 0,
      findMany: async ({ where }: any = {}) => {
        if (where?.campaignId) return [];
        return [];
      },
      findFirst: async ({ where }: any = {}) => {
        if (where?.sentAt) {
          return overrides?.latestSentJob || null;
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
        return { id: where.id, ...data };
      },
      updateMany: async () => ({ count: 0 }),
      createMany: async ({ data }: any) => {
        createdJobBatches.push(data);
        return { count: data.length };
      },
      create: async ({ data }: any) => ({ id: 'review-job-1', ...data }),
    },
    vendasLead: {
      findMany: async () => overrides?.scheduleLeads || [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async () => ({ count: 0 }),
    },
    vendasLeadTimelineEvent: {
      create: async ({ data }: any) => ({ id: 'event-1', ...data }),
    },
    companyConversation: {
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

  const conversations = {
    getOrCreateConversationForContact: async () => ({ id: 501, metadata: JSON.stringify(currentMetadata || {}) }),
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, any>) => {
      currentMetadata = payload.metadata || currentMetadata;
      stateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    queueOutboundForCompany: async (companyId: number, payload: Record<string, any>) => {
      queueCalls.push({ companyId, payload });
      return { conversationId: 501 };
    },
  };

  const inboxRealtime = {
    publish: (payload: Record<string, any>) => events.push(payload),
  };

  const service = new VendasAutomationService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    conversations as any,
    inboxRealtime as any,
    {} as any,
  ) as any;
  service.isInsideWorkingHours = () => true;
  const originalScheduleJobsForCampaign = service.scheduleJobsForCampaign.bind(service);
  service.scheduleJobsForCampaign = async (campaignId: string) => {
    scheduleCalls.push(campaignId);
    return originalScheduleJobsForCampaign(campaignId);
  };

  return { service, queueCalls, jobUpdates, stateCalls, campaignStageUpdates, events, createdJobBatches, scheduleCalls };
}

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
  assert.ok(jobUpdates.some((call) => call.data.status === 'skipped' && call.data.classification === 'needs_review'));
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
        vendasProspeccao: { stage: 'sent_waiting', firstOutboundAt: '2026-05-05T10:00:00.000Z' },
        vendasAgendaQueue: { manualSent: true, manualSentAt: '2026-05-05T10:00:00.000Z' },
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

test('lead without script and campaign without template uses DEFAULT_MESSAGE_TEMPLATE', async () => {
  const { service, queueCalls } = createService({
    conversationMetadata: null,
    campaign: { messageTemplate: '   ' },
  });
  const campaign = buildCampaign({ messageTemplate: '   ' });
  const lead = buildLead({ segment: campaign.segment, scriptText: '', roteiro: '', messageTemplate: '' });

  await service.processDueJob(buildJob({ campaign, lead, leadId: lead.id }));

  assert.equal(queueCalls.length, 1);
  assert.ok(queueCalls[0].payload.body.startsWith('Oi, tudo bem? Aqui é Jhonatan da HBX.'));
  assert.ok(queueCalls[0].payload.body.includes('Empresa Teste em Sao Paulo'));
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

  assert.equal(result.outcome, 'deferred');
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
