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
  const now = new Date('2026-04-13T12:00:00.000Z');
  const tomorrow = new Date('2026-04-14T12:00:00.000Z');
  const realDateNow = Date.now;
  Date.now = () => now.getTime();

  try {
    const rows = [
      {
        id: 'lead-today',
        companyId: 7,
        name: 'Carlos',
        phone: '+5511998877766',
        phoneNormalized: '5511998877766',
        status: 'novo',
        nextAction: 'Retomar hoje',
        returnAt: now,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: 'lead-no-phone',
        companyId: 7,
        name: 'Sem Telefone',
        phone: null,
        phoneNormalized: null,
        status: 'retorno',
        nextAction: 'Retomar hoje',
        returnAt: now,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: 'lead-future',
        companyId: 7,
        name: 'Amanha',
        phone: '+5511988877766',
        phoneNormalized: '5511988877766',
        status: 'retorno',
        nextAction: 'Falar amanha',
        returnAt: tomorrow,
        updatedAt: now,
        createdAt: now,
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
    assert.match(
      String((updateConversationStateCalls[0].payload as any).metadata.vendasAgendaQueue.draftMessage || ''),
      /HBX Vendas/i,
    );
  } finally {
    Date.now = realDateNow;
  }
});

test('syncTodayAgendaForUser deactivates stale agendamento items when the lead is no longer in Hoje', async () => {
  const now = new Date('2026-04-13T12:00:00.000Z');
  const tomorrow = new Date('2026-04-14T12:00:00.000Z');
  const realDateNow = Date.now;
  Date.now = () => now.getTime();

  try {
    const rows = [
      {
        id: 'lead-old',
        companyId: 7,
        name: 'Carlos',
        phone: '+5511998877766',
        phoneNormalized: '5511998877766',
        status: 'retorno',
        nextAction: 'Falar depois',
        returnAt: tomorrow,
        updatedAt: now,
        createdAt: now,
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
  } finally {
    Date.now = realDateNow;
  }
});
