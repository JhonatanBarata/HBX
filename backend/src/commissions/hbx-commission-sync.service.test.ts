import test from 'node:test';
import assert from 'node:assert/strict';

import { HbxCommissionSyncService } from './hbx-commission-sync.service';

test('resolveClientState keeps trial pending without payable commission', () => {
  const service = new HbxCommissionSyncService({} as any);
  const state = (service as any).resolveClientState({
    status: 'trial',
    isActive: true,
    trialEndsAt: new Date('2026-12-31T12:00:00.000Z'),
    trialStartsAt: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'trial_started');
  assert.equal(state.commissionStatus, 'pending');
  assert.equal(state.recurring, false);
});

test('resolveClientState releases commission for paid customer', () => {
  const service = new HbxCommissionSyncService({} as any);
  const state = (service as any).resolveClientState({
    status: 'active',
    isActive: true,
    subscriptionCurrentPeriodStart: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'sale_confirmed');
  assert.equal(state.commissionStatus, 'payable');
  assert.equal(state.recurring, true);
});

test('generateSalesCompanyRecurringReceivables ignores trial leads', async () => {
  let seenWhere: any = null;
  const service = new HbxCommissionSyncService({
    company: {
      findUnique: async () => ({ commissionDueBusinessDays: 3 }),
    },
    vendasCommissionReceivable: {
      updateMany: async () => ({ count: 0 }),
    },
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [];
      },
    },
  } as any);

  await service.generateSalesCompanyRecurringReceivables(7);

  assert.equal(seenWhere.saleStatus, 'sale_confirmed');
});
