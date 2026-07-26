import test from 'node:test';
import assert from 'node:assert/strict';

import { EmailOutboxWorkerService } from './email-outbox-worker.service';

function harness(input: {
  stepStates?: string[];
  mailResult?: any;
  leadId?: string | null;
  bodyHtml?: string | null;
  withCommercialLog?: boolean;
}) {
  const row = {
    id: 'email-1',
    companyId: 7,
    leadId: input.leadId ?? null,
    automationStepRunId: input.stepStates ? 'step-1' : null,
    recoveryStepRunId: null,
    requestedByUserId: 12,
    recipient: 'cliente@example.com',
    subject: 'Contato',
    bodyText: 'Olá',
    bodyHtml: input.bodyHtml ?? null,
    sourceModule: 'vendas_prospeccao_email_bot',
    status: 'processing',
  };
  const messageUpdates: any[] = [];
  const attemptUpdates: any[] = [];
  const commercialLogCalls: any[] = [];
  const timelineCalls: any[] = [];
  let stepRead = 0;
  let releases = 0;
  let sends = 0;
  const sendPayloads: any[] = [];
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
    ...(input.withCommercialLog
      ? {
          commercialEmailMessageLog: {
            create: async (args: any) => {
              commercialLogCalls.push(args?.data ?? args);
              return {};
            },
          },
          vendasLeadTimelineEvent: {
            create: async (args: any) => {
              timelineCalls.push(args?.data ?? args);
              return {};
            },
          },
        }
      : {}),
  };
  const mailer: any = {
    sendForCompany: async (companyId: number, payload: any) => {
      sends += 1;
      sendPayloads.push({ companyId, payload });
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
    commercialLogCalls,
    timelineCalls,
    sendPayloads,
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

// ================================================================
// S6 LEAD-CENTRICO (06-email-v1.md): HTML da assinatura passa pro transporte +
// bounce permanente invalida o e-mail do lead (não tenta de novo).
// ================================================================

test('bodyHtml (assinatura sóbria da cadência) é passado pro CompanyMailerService', async () => {
  const ctx = harness({
    bodyHtml: '<div>assinatura</div>',
    mailResult: { ok: true, queued: true, transport: 'smtp', messageId: 'mid-1', accepted: ['cliente@example.com'], rejected: [] },
  });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.sends, 1);
  assert.equal(ctx.sendPayloads[0].payload.html, '<div>assinatura</div>');
});

test('rejeição do destinatário (bounce síncrono) grava supressão + evento na história do lead', async () => {
  const ctx = harness({
    leadId: 'lead-1',
    withCommercialLog: true,
    mailResult: {
      ok: false,
      errorCode: 'COMPANY_EMAIL_RECIPIENT_REJECTED',
      errorMessage: 'Destinatário recusado',
    },
  });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.commercialLogCalls.length, 1, 'grava a supressão pra não tentar de novo');
  assert.equal(ctx.commercialLogCalls[0].status, 'do_not_contact');
  assert.equal(ctx.commercialLogCalls[0].recipientEmail, 'cliente@example.com');
  assert.equal(ctx.commercialLogCalls[0].vendasLeadId, 'lead-1');
  assert.equal(ctx.timelineCalls.length, 1, 'registra evento na história do lead (nunca caixa de entrada)');
  assert.equal(ctx.timelineCalls[0].eventType, 'email_bounced');
  assert.equal(ctx.timelineCalls[0].leadId, 'lead-1');
});

test('e-mail NÃO configurado (config do tenant) NÃO conta como bounce do endereço', async () => {
  const ctx = harness({
    leadId: 'lead-1',
    withCommercialLog: true,
    mailResult: {
      ok: false,
      errorCode: 'COMPANY_EMAIL_NOT_CONFIGURED',
      errorMessage: 'E-mail da empresa não configurado.',
    },
  });

  await (ctx.service as any).deliver('email-1', 7);

  assert.equal(ctx.commercialLogCalls.length, 0, 'config ausente é problema do tenant, não do endereço do contato');
  assert.equal(ctx.timelineCalls.length, 0);
});
