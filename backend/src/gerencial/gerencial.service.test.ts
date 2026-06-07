import test from 'node:test';
import assert from 'node:assert/strict';

import { GerencialService } from './gerencial.service';

function createGerencialService(existingLead: any) {
  let updatedData: any = null;
  const service = new GerencialService({
    company: {
      findUnique: async () => ({ commissionDueBusinessDays: 3 }),
    },
    user: {
      findFirst: async () => ({ commissionPercent: 20 }),
    },
    vendasLead: {
      findFirst: async () => existingLead,
      update: async ({ data }: any) => {
        updatedData = data;
        return {
          id: existingLead.id,
          ...existingLead,
          ...data,
          updatedAt: new Date('2026-06-07T12:00:00.000Z'),
        };
      },
    },
    $transaction: async (fn: any) => fn({
      vendasLead: {
        update: async ({ data }: any) => {
          updatedData = data;
          return {
            id: existingLead.id,
            ...existingLead,
            ...data,
            updatedAt: new Date('2026-06-07T12:00:00.000Z'),
          };
        },
      },
      vendasLeadTimelineEvent: {
        create: async () => ({}),
      },
    }),
  } as any, {} as any);

  return { service, getUpdatedData: () => updatedData };
}

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-gerencial',
    name: 'Cliente QA',
    assignedUserId: 99,
    assignedByUserId: 1,
    createdByUserId: 1,
    commissionPercentSnapshot: 20,
    saleStatus: 'activation_pending',
    saleValue: 99,
    salePlanKey: 'hbx_padrao',
    saleConfirmedAt: null,
    commissionBaseAmount: 99,
    commissionStatus: 'pending',
    commissionDueAt: null,
    commissionPaidAt: null,
    commissionPayoutId: null,
    ...overrides,
  };
}

test('updateClientSaleStatus keeps trial without commission amount', async () => {
  const { service, getUpdatedData } = createGerencialService(baseLead());

  const result = await service.updateClientSaleStatus(
    { companyId: 7, id: 1 },
    'lead-gerencial',
    { saleStatus: 'trial_started' },
  );

  assert.equal(result.saleStatus, 'trial_started');
  assert.equal(result.commissionStatus, 'pending');
  assert.equal(result.commissionAmount, 0);
  assert.equal(result.commissionDueAt, null);
  assert.equal(result.commissionRecurring, false);
  assert.equal(getUpdatedData().commissionAmount, 0);
});

test('updateClientSaleStatus calculates commission after payment confirmation', async () => {
  const { service } = createGerencialService(baseLead({ saleStatus: 'trial_started' }));

  const result = await service.updateClientSaleStatus(
    { companyId: 7, id: 1 },
    'lead-gerencial',
    { saleStatus: 'sale_confirmed' },
  );

  assert.equal(result.saleStatus, 'sale_confirmed');
  assert.equal(result.commissionStatus, 'payable');
  assert.equal(result.commissionAmount, 19.8);
  assert.ok(result.commissionDueAt);
  assert.equal(result.commissionRecurring, true);
});

test('updateCommissionStatus rejects payable commission before confirmed payment', async () => {
  const { service } = createGerencialService(baseLead({ saleStatus: 'trial_started' }));

  await assert.rejects(
    () => service.updateCommissionStatus(
      { companyId: 7, id: 1 },
      'lead-gerencial',
      { commissionStatus: 'payable' },
    ),
    /pagamento confirmado/i,
  );
});
