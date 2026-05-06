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
  previousContactJob?: Record<string, unknown> | null;
  negativeJob?: Record<string, unknown> | null;
  scheduleLeads?: any[];
}) {
  const queueCalls: Array<Record<string, any>> = [];
  const jobUpdates: Array<Record<string, any>> = [];
  const stateCalls: Array<Record<string, any>> = [];
  const campaignStageUpdates: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  const createdJobBatches: Array<any[]> = [];
  let currentMetadata: Record<string, unknown> | null = overrides?.conversationMetadata ?? null;

  const prisma: any = {
    vendasAutomationCampaign: {
      findUnique: async () => buildCampaign(),
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
        if (where?.leadId && where?.OR?.some((item: any) => item?.status === 'replied_negative')) {
          return overrides?.negativeJob || null;
        }
        if (where?.leadId) return overrides?.previousContactJob || null;
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
        if (where?.id) return { id: where.id, companyId: 7, channel: 'whatsapp', contact: '+5511999998888', metadata: JSON.stringify(currentMetadata || {}) };
        if (currentMetadata === null) return null;
        return { id: 501, companyId: 7, channel: 'whatsapp', contact: '+5511999998888', metadata: JSON.stringify(currentMetadata || {}) };
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

  return { service, queueCalls, jobUpdates, stateCalls, campaignStageUpdates, events, createdJobBatches };
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
