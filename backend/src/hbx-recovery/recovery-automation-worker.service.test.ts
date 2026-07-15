import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryAutomationWorkerService } from './recovery-automation-worker.service';

test('inbound humano cancela passos Recovery e a outbox WhatsApp ainda pendente', async () => {
  const runUpdates: any[] = [];
  const outboundUpdates: any[] = [];
  const messageUpdates: any[] = [];
  const emailUpdates: any[] = [];
  const tx: any = {
    recoveryAutomationStepRun: { updateMany: async (args: any) => { runUpdates.push(args); return { count: 1 }; } },
    outboundMessage: { updateMany: async (args: any) => { outboundUpdates.push(args); return { count: 1 }; } },
    companyMessage: { updateMany: async (args: any) => { messageUpdates.push(args); return { count: 1 }; } },
    emailOutboundMessage: { updateMany: async (args: any) => { emailUpdates.push(args); return { count: 1 }; } },
  };
  const prisma: any = {
    companyConversation: { findFirst: async () => ({ customerProfileId: 'profile-1', contact: '+55 11 99999-0000' }) },
    hbxRecoveryCustomer: { findMany: async () => [{ id: 'customer-1', whatsappNumber: '5511999990000' }] },
    recoveryAutomationStepRun: {
      findMany: async () => [{ id: 'step-1', outboundMessageId: 91 }],
    },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = new RecoveryAutomationWorkerService(
    prisma,
    { setRecoveryAutomationHook: () => undefined } as any,
    {} as any,
  );

  await (service as any).onConversationEvent({
    companyId: 7,
    conversationId: 12,
    event: 'inbound',
    messageId: 31,
    validHumanInbound: true,
  });

  assert.equal(runUpdates[0].where.companyId, 7);
  assert.equal(runUpdates[0].data.status, 'canceled');
  assert.equal(runUpdates[0].data.cancelReason, 'customer_inbound');
  assert.deepEqual(outboundUpdates[0].where, { companyId: 7, id: { in: [91] }, status: 'PENDING' });
  assert.equal(messageUpdates[0].where.companyId, 7);
  assert.equal(messageUpdates[0].data.status, 'CANCELED');
  assert.equal(emailUpdates[0].where.companyId, 7);
  assert.deepEqual(emailUpdates[0].where.recoveryStepRunId, { in: ['step-1'] });
  assert.equal(emailUpdates[0].data.status, 'canceled');
});

test('etapa Recovery de e-mail entra na outbox durável com idempotência', async () => {
  const enqueued: any[] = [];
  const prisma: any = {
    recoveryAutomationStepRun: {
      findUnique: async () => ({
        id: 'step-email-1',
        companyId: 7,
        customerId: 'customer-1',
        stageId: 'stage-1',
        status: 'processing',
        channel: 'E-mail',
        stage: { id: 'stage-1', title: 'Lembrete', template: 'Olá {{cliente}}, pendência {{valor}}.', enabled: true },
        customer: {
          id: 'customer-1',
          name: 'Maria',
          clientName: 'Maria',
          whatsappNumber: '5511999990000',
          automationEnabled: true,
          openAmount: 42.5,
          status: 'OVERDUE',
          customerProfileId: 'profile-1',
          customerProfile: { name: 'Maria', email: 'maria@example.com' },
        },
        company: { name: 'Empresa', recoveryBotLiveAt: new Date(), logisticaConfig: { moduloRecoveryAtivo: true } },
      }),
    },
  };
  const service = new RecoveryAutomationWorkerService(
    prisma,
    { setRecoveryAutomationHook: () => undefined } as any,
    { enqueue: async (input: any) => { enqueued.push(input); return { id: 'mail-1' }; } } as any,
  );

  await (service as any).dispatchOne('step-email-1');

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].recoveryStepRunId, 'step-email-1');
  assert.equal(enqueued[0].idempotencyKey, 'recovery-email:step-email-1');
  assert.equal(enqueued[0].recipient, 'maria@example.com');
  assert.match(enqueued[0].bodyText, /Maria/);
  assert.match(enqueued[0].bodyText, /R\$\s*42,50/);
});
