import test from 'node:test';
import assert from 'node:assert/strict';

import { VendasService } from './vendas.service';

function normalizePhone(raw: unknown) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? digits.slice(-13) : null;
}

function createService(overrides?: Partial<Record<string, any>>) {
  const getOrCreateCalls: Array<Record<string, unknown>> = [];
  const updateConversationStateCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    vendasLead: {
      findMany: async () => [],
      ...(overrides?.vendasLead || {}),
    },
    companyConversation: {
      findFirst: async () => null,
      findMany: async () => [],
      ...(overrides?.companyConversation || {}),
    },
    ...(overrides?.prisma || {}),
  } as any;

  const customerProfileService = {
    normalizePhone,
    ...(overrides?.customerProfileService || {}),
  } as any;

  const conversations = {
    getOrCreateConversationForContact: async (companyId: number, contact: string) => {
      getOrCreateCalls.push({ companyId, contact });
      return { id: 501, metadata: null, contact };
    },
    updateConversationState: async (companyId: number, conversationId: number, payload: Record<string, unknown>) => {
      updateConversationStateCalls.push({ companyId, conversationId, payload });
      return { id: conversationId, ...payload };
    },
    ...(overrides?.conversations || {}),
  } as any;

  const service = new VendasService(prisma, customerProfileService, conversations);
  return { service, getOrCreateCalls, updateConversationStateCalls };
}

test('syncTodayAgendaForUser mirrors today leads into Inbox agendamento and skips leads without phone', async () => {
  const now = new Date();
  const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const tomorrowAtNoon = new Date(todayAtNoon);
  tomorrowAtNoon.setDate(tomorrowAtNoon.getDate() + 1);

  const rows = [
    {
      id: 'lead-today',
      companyId: 7,
      name: 'Carlos',
      phone: '+5511998877766',
      phoneNormalized: '5511998877766',
      status: 'novo',
      nextAction: 'Retomar hoje',
      returnAt: todayAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
    {
      id: 'lead-no-phone',
      companyId: 7,
      name: 'Sem Telefone',
      phone: null,
      phoneNormalized: null,
      status: 'retorno',
      nextAction: 'Retomar hoje',
      returnAt: todayAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
    {
      id: 'lead-future',
      companyId: 7,
      name: 'Amanha',
      phone: '+5511988877766',
      phoneNormalized: '5511988877766',
      status: 'retorno',
      nextAction: 'Falar amanha',
      returnAt: tomorrowAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
  ];

  const { service, getOrCreateCalls, updateConversationStateCalls } = createService({
    vendasLead: {
      findMany: async () => rows,
    },
  });

  const result = await service.syncTodayAgendaForUser({ companyId: 7, id: 99 });

  assert.equal(result.activated, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.deactivated, 0);
  assert.equal(result.skippedWithoutPhone, 1);
  assert.equal(getOrCreateCalls.length, 1);
  assert.deepEqual(getOrCreateCalls[0], { companyId: 7, contact: '+5511998877766' });
  assert.equal(updateConversationStateCalls.length, 1);
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.active,
    true,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftPending,
    true,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.sourceModule,
    'vendas',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.sourceBlock,
    'today',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.status,
    'novo',
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.manualSent,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
  assert.match(
    String((updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftMessage || ''),
    /HBX Vendas/i,
  );
});

test('syncTodayAgendaForUser deactivates stale agendamento items when the lead is no longer in Hoje', async () => {
  const now = new Date();
  const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const tomorrowAtNoon = new Date(todayAtNoon);
  tomorrowAtNoon.setDate(tomorrowAtNoon.getDate() + 1);

  const rows = [
    {
      id: 'lead-old',
      companyId: 7,
      name: 'Carlos',
      phone: '+5511998877766',
      phoneNormalized: '5511998877766',
      status: 'retorno',
      nextAction: 'Falar depois',
      returnAt: tomorrowAtNoon,
      updatedAt: todayAtNoon,
      createdAt: todayAtNoon,
    },
  ];

  const { service, updateConversationStateCalls } = createService({
    vendasLead: {
      findMany: async () => rows,
    },
    companyConversation: {
      findMany: async () => [
        {
          id: 888,
          contact: '+5511998877766',
          metadata: JSON.stringify({
            vendasAgendaQueue: {
              active: true,
              leadId: 'lead-old',
              draftPending: true,
            },
          }),
        },
      ],
    },
  });

  const result = await service.syncTodayAgendaForUser({ companyId: 7, id: 99 });

  assert.equal(result.activated, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.deactivated, 1);
  assert.equal(updateConversationStateCalls.length, 1);
  assert.equal(updateConversationStateCalls[0].conversationId, 888);
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.active,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftPending,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEligible,
    false,
  );
  assert.equal(
    (updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.botEntryPending,
    false,
  );
});
