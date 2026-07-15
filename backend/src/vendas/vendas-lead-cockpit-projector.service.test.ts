import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasLeadCockpitProjectorService } from './vendas-lead-cockpit-projector.service';

const at = (minute: number) => new Date(`2026-07-13T12:${String(minute).padStart(2, '0')}:00.000Z`);

function message(input: {
  id: number;
  conversationId?: number;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  minute: number;
  body?: string;
  outboxStatus?: string | null;
  deliveryStatus?: string | null;
  error?: string | null;
  messageType?: string;
  senderType?: string;
  variablesJson?: string | null;
}) {
  return {
    id: input.id,
    conversationId: input.conversationId || 101,
    direction: input.direction,
    messageType: input.messageType || 'text',
    senderType: input.senderType || (input.direction === 'OUTBOUND' ? 'human' : 'contact'),
    body: input.body || `mensagem-${input.id}`,
    status: input.status,
    error: input.error || null,
    variablesJson: input.variablesJson || null,
    timestamp: at(input.minute),
    outboundMessage:
      input.direction === 'OUTBOUND'
        ? {
            status: input.outboxStatus ?? input.status,
            deliveryStatus: input.deliveryStatus || null,
            sentAt: ['SENT', 'DELIVERED', 'READ'].includes(input.status) ? at(input.minute) : null,
            deliveredAt: input.status === 'DELIVERED' ? at(input.minute) : null,
            readAt: input.status === 'READ' ? at(input.minute) : null,
            failedAt: input.status === 'FAILED' ? at(input.minute) : null,
            lastError: input.error || null,
          }
        : null,
  };
}

function conversation(input: {
  id?: number;
  leadId?: string | null;
  contact?: string;
  metadata?: unknown;
  messages?: any[];
}) {
  const id = input.id || 101;
  return {
    id,
    companyId: 7,
    vendasLeadId: input.leadId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    contact: input.contact || '+5511999990000',
    sourcePhoneNormalized: null,
    lastMessageAt: at(30),
    updatedAt: at(30),
    createdAt: at(0),
    messages: (input.messages || []).map((row) => ({ ...row, conversationId: id })),
  };
}

function harness(input: {
  leads?: any[];
  conversations?: any[];
  jobs?: any[];
  persisted?: any[];
  replySignals?: any[];
} = {}) {
  const leads = input.leads || [
    { id: 'lead-1', companyId: 7, phone: null, phoneNormalized: null },
  ];
  const conversations = input.conversations || [];
  const jobs = input.jobs || [];
  const persisted = [...(input.persisted || [])];
  const replySignals = [...(input.replySignals || [])];
  const calls = {
    leadFindMany: 0,
    conversationFindMany: 0,
    jobFindMany: 0,
    timelineFindMany: 0,
    cockpitFindMany: 0,
    cockpitWrites: 0,
    leadUpdates: 0,
    timelineWrites: 0,
  };

  const prisma = {
    vendasLead: {
      findMany: async ({ where, select }: any) => {
        calls.leadFindMany += 1;
        if (where?.id?.in) {
          return leads.filter((lead) => lead.companyId === where.companyId && where.id.in.includes(lead.id));
        }
        if (where?.phoneNormalized?.in) {
          return leads
            .filter((lead) => lead.companyId === where.companyId && where.phoneNormalized.in.includes(lead.phoneNormalized))
            .map((lead) => ({ id: lead.id, phoneNormalized: lead.phoneNormalized }));
        }
        if (select?.id) return leads.filter((lead) => lead.companyId === where.companyId);
        return [];
      },
      findFirst: async ({ where }: any) =>
        leads.find((lead) => lead.id === where.id && lead.companyId === where.companyId) || null,
      update: async () => {
        calls.leadUpdates += 1;
        throw new Error('projector must not update VendasLead');
      },
    },
    vendasAutomationJob: {
      findMany: async ({ where }: any) => {
        calls.jobFindMany += 1;
        return jobs.filter(
          (job) => job.companyId === where.companyId && where.leadId.in.includes(job.leadId) && job.conversationId,
        );
      },
      findFirst: async ({ where }: any) =>
        jobs.find((job) => job.companyId === where.companyId && job.conversationId === where.conversationId) || null,
    },
    companyConversation: {
      findMany: async ({ where }: any) => {
        calls.conversationFindMany += 1;
        return conversations.filter((row) => row.companyId === where.companyId);
      },
      findFirst: async ({ where }: any) =>
        conversations.find((row) => row.id === where.id && row.companyId === where.companyId) || null,
    },
    companyMessage: {
      findFirst: async ({ where }: any) => {
        for (const row of conversations) {
          const found = row.messages.find(
            (item: any) => item.id === where.id && row.id === where.conversationId && row.companyId === where.companyId,
          );
          if (found) {
            return {
              ...found,
              conversation: {
                id: row.id,
                companyId: row.companyId,
                channel: 'whatsapp',
                vendasLeadId: row.vendasLeadId,
                metadata: row.metadata,
              },
            };
          }
        }
        return null;
      },
    },
    vendasLeadTimelineEvent: {
      findMany: async ({ where }: any) => {
        calls.timelineFindMany += 1;
        return replySignals.filter(
          (event) => where.leadId.in.includes(event.leadId) && event.sourceType === where.sourceType,
        );
      },
      createMany: async ({ data }: any) => {
        calls.timelineWrites += 1;
        for (const event of data) {
          if (!replySignals.some((current) => current.leadId === event.leadId && current.idempotencyKey === event.idempotencyKey)) {
            replySignals.push(event);
          }
        }
        return { count: data.length };
      },
    },
    vendasLeadCockpitState: {
      findMany: async ({ where }: any) => {
        calls.cockpitFindMany += 1;
        return persisted.filter((row) => row.companyId === where.companyId && where.leadId.in.includes(row.leadId));
      },
      findFirst: async ({ where }: any) =>
        persisted.find((row) => row.companyId === where.companyId && row.conversationId === where.conversationId) || null,
      upsert: async ({ where, create, update }: any) => {
        calls.cockpitWrites += 1;
        const index = persisted.findIndex((row) => row.leadId === where.leadId);
        const row = index >= 0 ? { ...persisted[index], ...update } : { ...create };
        if (index >= 0) persisted[index] = row;
        else persisted.push(row);
        return row;
      },
      createMany: async () => {
        calls.cockpitWrites += 1;
        throw new Error('GET projection must stay read-only');
      },
    },
  } as any;

  return {
    service: new VendasLeadCockpitProjectorService(prisma),
    calls,
    replySignals,
    persisted,
  };
}

test('batch getter derives missing rows without writes or per-lead queries', async () => {
  const queued = conversation({
    leadId: 'lead-1',
    messages: [message({ id: 1, direction: 'OUTBOUND', status: 'QUEUED', outboxStatus: 'PENDING', minute: 1 })],
  });
  const { service, calls } = harness({
    leads: [
      { id: 'lead-1', companyId: 7, phone: null, phoneNormalized: null },
      { id: 'lead-2', companyId: 7, phone: null, phoneNormalized: null },
    ],
    conversations: [queued],
  });

  const snapshots = await service.getCockpitStatesForLeads(7, ['lead-1', 'lead-2']);

  assert.equal(snapshots.get('lead-1')?.engagement.state, 'queued');
  assert.deepEqual(snapshots.get('lead-1')?.conversation, { id: '101', exists: true });
  assert.equal(snapshots.get('lead-2')?.engagement.state, 'no_conversation');
  assert.equal(calls.cockpitWrites, 0);
  assert.equal(calls.leadFindMany, 1);
  assert.equal(calls.conversationFindMany, 1);
  assert.equal(calls.jobFindMany, 1);
  assert.equal(calls.timelineFindMany, 1);
});

test('outbound status maps to queue states and successful delivery never changes the lead pipeline', async () => {
  const cases = [
    { messageStatus: 'QUEUED', outboxStatus: 'PENDING', expected: 'queued' },
    { messageStatus: 'SENDING', outboxStatus: 'SENDING', expected: 'sending' },
    { messageStatus: 'SENT', outboxStatus: 'SENT', expected: 'awaiting_reply' },
    { messageStatus: 'DELIVERED', outboxStatus: 'SENT', expected: 'awaiting_reply' },
    { messageStatus: 'READ', outboxStatus: 'SENT', expected: 'awaiting_reply' },
    { messageStatus: 'FAILED', outboxStatus: 'FAILED', expected: 'failed' },
    { messageStatus: 'QUEUED', outboxStatus: 'CANCELLED', expected: 'canceled' },
  ];

  for (const item of cases) {
    const row = conversation({
      leadId: 'lead-1',
      messages: [
        message({
          id: 1,
          direction: 'OUTBOUND',
          status: item.messageStatus,
          outboxStatus: item.outboxStatus,
          error: item.expected === 'failed' ? 'provider down' : null,
          minute: 1,
        }),
      ],
    });
    const { service, calls } = harness({ conversations: [row] });
    const snapshot = await service.rebuildLead(7, 'lead-1');
    assert.equal(snapshot.engagement.state, item.expected);
    assert.equal(calls.leadUpdates, 0);
    if (item.expected === 'failed') assert.equal(snapshot.engagement.failureReason, 'provider down');
  }
});

test('raw inbound is observable but only an explicit idempotent signal marks a human reply', async () => {
  const row = conversation({
    leadId: 'lead-1',
    messages: [
      message({ id: 10, direction: 'OUTBOUND', status: 'SENT', minute: 10 }),
      message({ id: 11, direction: 'INBOUND', status: 'RECEIVED', minute: 11, body: 'Tenho interesse' }),
    ],
  });
  const { service, replySignals } = harness({ conversations: [row] });

  const raw = await service.rebuildLead(7, 'lead-1');
  assert.equal(raw.engagement.hasInboundMessage, true);
  assert.equal(raw.engagement.hasInboundReply, false);
  assert.equal(raw.engagement.state, 'awaiting_reply');

  const replied = await service.signalValidHumanInbound(7, 'lead-1', 101, 11);
  assert.equal(replied.engagement.hasInboundReply, true);
  assert.equal(replied.engagement.state, 'replied');
  assert.equal(replySignals.length, 1);
  assert.equal(replySignals[0].idempotencyKey, 'vendas-cockpit:human-inbound:101:11');

  await service.signalValidHumanInbound(7, 'lead-1', 101, 11);
  assert.equal(replySignals.length, 1);
});

test('eventos tecnicos, reacoes e mensagens apagadas nao criam engajamento comercial', async () => {
  const row = conversation({
    leadId: 'lead-1',
    messages: [
      message({ id: 20, direction: 'OUTBOUND', status: 'SENT', minute: 10, messageType: 'system_event' }),
      message({ id: 21, direction: 'INBOUND', status: 'RECEIVED', minute: 11, messageType: 'reaction' }),
      message({
        id: 22,
        direction: 'INBOUND',
        status: 'RECEIVED',
        minute: 12,
        variablesJson: '{"isDeleted":true}',
      }),
    ],
  });
  const { service } = harness({ conversations: [row] });

  const snapshot = await service.rebuildLead(7, 'lead-1');
  assert.equal(snapshot.engagement.state, 'no_messages');
  assert.equal(snapshot.engagement.hasSuccessfulOutbound, false);
  assert.equal(snapshot.engagement.hasInboundMessage, false);
  assert.equal(snapshot.engagement.lastMessageId, null);
});

test('outbound real com senderType system continua visivel quando possui outbox', async () => {
  const row = conversation({
    leadId: 'lead-1',
    messages: [
      message({
        id: 23,
        direction: 'OUTBOUND',
        status: 'SENT',
        minute: 13,
        senderType: 'system',
      }),
    ],
  });
  const { service } = harness({ conversations: [row] });

  const snapshot = await service.rebuildLead(7, 'lead-1');
  assert.equal(snapshot.engagement.state, 'awaiting_reply');
  assert.equal(snapshot.engagement.hasSuccessfulOutbound, true);
});

test('a newer outbound wins the current state while hasInboundReply remains historical', async () => {
  const row = conversation({
    leadId: 'lead-1',
    messages: [
      message({ id: 10, direction: 'OUTBOUND', status: 'SENT', minute: 10 }),
      message({ id: 11, direction: 'INBOUND', status: 'RECEIVED', minute: 11 }),
    ],
  });
  const { service } = harness({ conversations: [row] });
  await service.signalValidHumanInbound(7, 'lead-1', 101, 11);

  row.messages.push(
    message({ id: 12, direction: 'OUTBOUND', status: 'QUEUED', outboxStatus: 'PENDING', minute: 12 }),
  );
  const snapshot = await service.rebuildLead(7, 'lead-1');
  assert.equal(snapshot.engagement.state, 'queued');
  assert.equal(snapshot.engagement.hasInboundReply, true);
});

test('dual-read uses an explicit automation job without writing the canonical FK', async () => {
  const legacyConversation = conversation({ id: 301, leadId: null, messages: [] });
  const { service, calls } = harness({
    conversations: [legacyConversation],
    jobs: [{ companyId: 7, leadId: 'lead-1', conversationId: 301, updatedAt: at(2), createdAt: at(1) }],
  });

  const states = await service.getCockpitStatesForLeads(7, ['lead-1']);
  assert.deepEqual(states.get('lead-1')?.conversation, { id: '301', exists: true });
  assert.equal(states.get('lead-1')?.engagement.state, 'no_messages');
  assert.equal(legacyConversation.vendasLeadId, null);
  assert.equal(calls.cockpitWrites, 0);
});

test('read-only snapshot bypasses stale persisted projection for an existing conversation', async () => {
  const existing = conversation({
    id: 302,
    leadId: null,
    messages: [message({ id: 31, conversationId: 302, direction: 'OUTBOUND', status: 'SENT', minute: 3 })],
  });
  const { service, calls } = harness({
    conversations: [existing],
    persisted: [{
      leadId: 'lead-1',
      companyId: 7,
      conversationId: null,
      engagementState: 'no_conversation',
      version: 1,
    }],
  });

  const snapshot = await service.getCockpitStateForLeadReadOnly(7, 'lead-1', 302);

  assert.deepEqual(snapshot.conversation, { id: '302', exists: true });
  assert.equal(snapshot.engagement.state, 'awaiting_reply');
  assert.equal(snapshot.engagement.lastMessageStatus, 'SENT');
  assert.equal(calls.cockpitWrites, 0);
});

test('phone fallback is fail-closed when more than one conversation matches in the tenant', async () => {
  const leads = [{ id: 'lead-1', companyId: 7, phone: '+55 11 99999-0000', phoneNormalized: '5511999990000' }];
  const { service } = harness({
    leads,
    conversations: [
      conversation({ id: 401, leadId: null, contact: '+5511999990000' }),
      conversation({ id: 402, leadId: null, contact: '5511999990000' }),
    ],
  });

  const states = await service.getCockpitStatesForLeads(7, ['lead-1']);
  assert.deepEqual(states.get('lead-1')?.conversation, { id: null, exists: false });
  assert.equal(states.get('lead-1')?.engagement.state, 'no_conversation');
});
