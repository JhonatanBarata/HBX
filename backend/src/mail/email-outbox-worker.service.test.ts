import test from 'node:test';
import assert from 'node:assert/strict';

import { EmailOutboxWorkerService } from './email-outbox-worker.service';

function harness(input: {
  stepStates?: string[];
  mailResult?: any;
}) {
  const row = {
    id: 'email-1',
    companyId: 7,
    leadId: null,
    automationStepRunId: input.stepStates ? 'step-1' : null,
    recoveryStepRunId: null,
    requestedByUserId: 12,
    recipient: 'cliente@example.com',
    subject: 'Contato',
    bodyText: 'Olá',
    sourceModule: 'vendas_prospeccao_email_bot',
    status: 'processing',
  };
  const messageUpdates: any[] = [];
  const attemptUpdates: any[] = [];
  let stepRead = 0;
  let releases = 0;
  let sends = 0;
  const prisma: any = {
    emailOutboundMessage: {
      findFirst: async () => row,
      updateMany: async (args: any) => {
        messageUpdates.push(args);
        return { count: 1 };
      },
    },
    emailOutboundAttempt: {
      create: async () => ({ id: 'attempt-1' }),
      update: async (args: any) => {
        attemptUpdates.push(args);
        return args;
      },
    },
    automationStepRun: {
      findFirst: async () => ({ status: input.stepStates?.[stepRead++] || 'active' }),
    },
  };
  const mailer: any = {
    sendForCompany: async () => {
      sends += 1;
      return input.mailResult;
    },
  };
  const creditUsage: any = {
    authorize: async () => ({
      allowed: true,
      release: async () => {
        releases += 1;
      },
    }),
  };
  return {
    service: new EmailOutboxWorkerService(prisma, mailer, creditUsage),
    messageUpdates,
    attemptUpdates,
    get releases() { return releases; },
    get sends() { return sends; },
  };
}

test('inbound entre débito e SMTP cancela o e-mail, estorna e não chama o provedor', async () => {
  const ctx = harness({ stepStates: ['active', 'canceled'] });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.sends, 0);
  assert.equal(ctx.releases, 1);
  assert.equal(ctx.messageUpdates.at(-1).where.companyId, 7);
  assert.equal(ctx.messageUpdates.at(-1).data.status, 'canceled');
  assert.equal(ctx.attemptUpdates.at(-1).data.errorCode, 'automation_step_inactive');
});

test('resultado SMTP incerto fica unknown, sem retry cego e sem estorno', async () => {
  const ctx = harness({
    mailResult: { ok: false, errorCode: 'ECONNRESET', errorMessage: 'socket closed' },
  });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.sends, 1);
  assert.equal(ctx.releases, 0);
  assert.equal(ctx.messageUpdates.at(-1).data.status, 'unknown');
  assert.equal(ctx.attemptUpdates.at(-1).data.status, 'unknown');
});

test('falha confirmada de destinatário estorna o crédito e encerra como failed', async () => {
  const ctx = harness({
    mailResult: {
      ok: false,
      errorCode: 'COMPANY_EMAIL_RECIPIENT_REJECTED',
      errorMessage: 'Destinatário recusado',
    },
  });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.sends, 1);
  assert.equal(ctx.releases, 1);
  assert.equal(ctx.messageUpdates.at(-1).data.status, 'failed');
  assert.equal(ctx.attemptUpdates.at(-1).data.status, 'failed');
});
