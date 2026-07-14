import test from 'node:test';
import assert from 'node:assert/strict';

import { CommercialAutomationStateService } from './commercial-automation-state.service';

test('claim canônico permite uma única réplica executar o mesmo passo', async () => {
  const lockQueries: string[] = [];
  const enrollment = {
    id: 'enr-1',
    companyId: 7,
    leadId: 'lead-1',
    definitionKind: 'cadence',
    legacySource: 'cadencia_inscricao',
    legacyExecutionId: 'insc-1',
    status: 'active',
  };
  const step: any = {
    id: 'step-1',
    companyId: 7,
    leadId: 'lead-1',
    enrollmentId: 'enr-1',
    status: 'scheduled',
    leaseUntil: null,
  };
  const prisma: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
    $queryRawUnsafe: async (sql: string) => {
      lockQueries.push(sql);
      return [{ locked: 1 }];
    },
    automationEnrollment: {
      findFirst: async () => enrollment,
    },
    automationStepRun: {
      upsert: async () => ({ ...step }),
      updateMany: async () => {
        if (step.status !== 'scheduled') return { count: 0 };
        step.status = 'claimed';
        step.leaseUntil = new Date(Date.now() + 120_000);
        return { count: 1 };
      },
    },
    automationLedgerEvent: { upsert: async () => ({ id: 'ledger' }) },
  };
  const service = new CommercialAutomationStateService(prisma);
  const input = {
    companyId: 7,
    leadId: 'lead-1',
    legacySource: 'cadencia_inscricao',
    legacyExecutionId: 'insc-1',
    definitionKind: 'cadence' as const,
    definitionId: 'cad-1',
    stepKey: '0',
    sequence: 0,
    channel: 'whatsapp',
  };

  const results = await Promise.all([service.claimLegacyStep(input), service.claimLegacyStep(input)]);

  assert.equal(results.filter((result) => result.claimed).length, 1);
  assert.equal(results.filter((result) => !result.claimed).length, 1);
  assert.deepEqual(new Set(results.map((result) => result.stepRunId)), new Set(['step-1']));
  assert.ok(lockQueries.length >= 2);
  assert.ok(lockQueries.every((sql) => sql.includes('SELECT 1::integer AS locked FROM advisory_lock')));
});

test('inbound libera o slot e cancela passos ainda não executados', async () => {
  const ledger: any[] = [];
  const emailUpdates: any[] = [];
  const tx: any = {
    automationEnrollment: {
      findMany: async () => [{ id: 'enr-1', companyId: 7, leadId: 'lead-1', status: 'active' }],
      updateMany: async ({ data }: any) => {
        assert.equal(data.activeCommercialSlot, null);
        assert.equal(data.stopReason, 'inbound_received');
        return { count: 1 };
      },
    },
    automationStepRun: {
      updateMany: async ({ data }: any) => {
        assert.equal(data.status, 'canceled');
        assert.equal(data.errorCode, 'inbound_received');
        return { count: 2 };
      },
    },
    emailOutboundMessage: {
      updateMany: async (input: any) => {
        emailUpdates.push(input);
        return { count: 1 };
      },
    },
    automationLedgerEvent: {
      upsert: async ({ create }: any) => {
        ledger.push(create);
        return create;
      },
    },
  };
  const service = new CommercialAutomationStateService(tx);

  const result = await service.interruptForInbound(tx, {
    companyId: 7,
    leadIds: ['lead-1'],
    inboundMessageId: 99,
    timestamp: new Date('2026-07-13T12:00:00.000Z'),
  });

  assert.deepEqual(result, { canceledEnrollments: 1, canceledSteps: 2 });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].eventType, 'enrollment_interrupted_inbound');
  assert.match(ledger[0].idempotencyKey, /inbound:99/);
  assert.equal(emailUpdates.length, 1);
  assert.equal(emailUpdates[0].where.companyId, 7);
  assert.equal(emailUpdates[0].where.status, 'pending');
  assert.deepEqual(emailUpdates[0].where.automationStepRun.enrollmentId, { in: ['enr-1'] });
  assert.equal(emailUpdates[0].data.status, 'canceled');
});

test('falha definitiva do passo libera imediatamente o slot comercial', async () => {
  const enrollmentUpdates: any[] = [];
  const tx: any = {
    automationEnrollment: {
      updateMany: async (input: any) => {
        enrollmentUpdates.push(input);
        return { count: 1 };
      },
    },
    automationStepRun: {
      findFirst: async () => ({
        id: 'step-1',
        companyId: 7,
        leadId: 'lead-1',
        enrollmentId: 'enr-1',
        status: 'claimed',
      }),
      updateMany: async () => ({ count: 1 }),
    },
    automationLedgerEvent: { upsert: async () => ({ id: 'ledger' }) },
  };
  const service = new CommercialAutomationStateService(tx);

  await service.completeStep({
    companyId: 7,
    stepRunId: 'step-1',
    status: 'failed',
    errorCode: 'provider_retries_exhausted',
  });

  assert.equal(enrollmentUpdates.length, 1);
  assert.equal(enrollmentUpdates[0].data.status, 'failed');
  assert.equal(enrollmentUpdates[0].data.activeCommercialSlot, null);
});
