import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommercialAutomationStateService } from '../automation/commercial-automation-state.service';
import { CreditActionUsageService } from '../credits/credit-action-usage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyMailerService, COMPANY_EMAIL_NOT_CONFIGURED } from './company-mailer.service';

const LEASE_MS = 60_000;
const TICK_MS = 4_000;

function enabled() {
  const raw = String(process.env.HBX_EMAIL_OUTBOX_WORKER_ENABLED ?? process.env.HBX_CADENCIA_EMAIL_ENABLED ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

@Injectable()
export class EmailOutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailOutboxWorkerService.name);
  private readonly canonical: CommercialAutomationStateService;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: CompanyMailerService,
    private readonly creditUsage: CreditActionUsageService,
  ) {
    this.canonical = new CommercialAutomationStateService(prisma);
  }

  onModuleInit() {
    if (!enabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running || !enabled()) return;
    this.running = true;
    try {
      await this.recoverUnknown();
      // tenant-scope-allow: claim global do worker; cada mensagem carrega companyId.
      const rows = await (this.prisma as any).emailOutboundMessage.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }).catch(() => []);
      for (const row of rows) {
        const claim = await (this.prisma as any).emailOutboundMessage.updateMany({
          where: { id: row.id, status: 'pending', nextAttemptAt: { lte: new Date() } },
          data: { status: 'processing', attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + LEASE_MS) },
        });
        if (claim.count === 1) await this.deliver(row.id);
      }
    } finally {
      this.running = false;
    }
  }

  private async recoverUnknown() {
    // tenant-scope-allow: recuperação global de leases; não lê conteúdo entre tenants.
    const expired = await (this.prisma as any).emailOutboundMessage.findMany({
      where: { status: 'processing', leaseUntil: { lt: new Date() } },
      select: { id: true, companyId: true, automationStepRunId: true, recoveryStepRunId: true },
      take: 20,
    }).catch(() => []);
    for (const row of expired) {
      await (this.prisma as any).emailOutboundMessage.updateMany({
        where: { id: row.id, status: 'processing' },
        data: {
          status: 'unknown',
          leaseUntil: null,
          lastErrorCode: 'smtp_outcome_unknown',
          lastErrorMessage: 'O processo caiu durante o SMTP; o envio não será repetido automaticamente.',
        },
      });
      await this.completeStep(row, 'failed', 'smtp_outcome_unknown', 'Resultado do envio de e-mail desconhecido.');
    }
  }

  private async deliver(id: string) {
    const row = await (this.prisma as any).emailOutboundMessage.findUnique({ where: { id } });
    if (!row || row.status !== 'processing') return;

    if (row.automationStepRunId) {
      const step = await (this.prisma as any).automationStepRun.findFirst({
        where: { id: row.automationStepRunId, companyId: row.companyId },
        select: { status: true },
      });
      if (!step || ['canceled', 'failed', 'skipped'].includes(step.status)) {
        await (this.prisma as any).emailOutboundMessage.update({
          where: { id },
          data: { status: 'canceled', leaseUntil: null, lastErrorCode: 'automation_step_inactive' },
        });
        return;
      }
    }
    if (row.recoveryStepRunId) {
      const step = await (this.prisma as any).recoveryAutomationStepRun.findFirst({
        where: { id: row.recoveryStepRunId, companyId: row.companyId },
        select: { status: true },
      });
      if (!step || ['canceled', 'failed'].includes(step.status)) {
        await (this.prisma as any).emailOutboundMessage.update({
          where: { id },
          data: { status: 'canceled', leaseUntil: null, lastErrorCode: 'recovery_step_inactive' },
        });
        return;
      }
    }

    const reservation = await this.creditUsage.authorize({
      companyId: row.companyId,
      actionKey: 'whatsapp_auto_send',
      refId: `email:${row.id}`,
      userId: row.requestedByUserId,
      metadata: { channel: 'email', sourceModule: row.sourceModule },
    });
    if (!reservation.allowed) {
      await this.fail(row, 'credit_unavailable', 'Saldo de créditos insuficiente para a Automação.');
      return;
    }

    const attempt = await (this.prisma as any).emailOutboundAttempt.create({
      data: { outboundMessageId: row.id, status: 'started' },
    });
    try {
      const result = await this.mailer.sendForCompany(row.companyId, {
        to: row.recipient,
        subject: row.subject,
        text: row.bodyText,
      });
      if (result.ok) {
        const now = new Date();
        await (this.prisma as any).$transaction([
          (this.prisma as any).emailOutboundAttempt.update({
            where: { id: attempt.id },
            data: { status: 'sent', providerMessageId: result.messageId, finishedAt: now },
          }),
          (this.prisma as any).emailOutboundMessage.update({
            where: { id: row.id },
            data: { status: 'sent', sentAt: now, leaseUntil: null, providerMessageId: result.messageId, lastErrorCode: null, lastErrorMessage: null },
          }),
        ]);
        if (row.leadId) {
          await (this.prisma as any).vendasLeadTimelineEvent.create({
            data: {
              leadId: row.leadId,
              eventType: 'automation_email_sent',
              title: `E-mail automático enviado: ${row.subject}`.slice(0, 200),
              description: `Enviado para ${row.recipient}`,
              sourceType: 'automacao',
            },
          }).catch(() => null);
        }
        await this.completeStep(row, 'succeeded');
        return;
      }

      if (result.errorCode === COMPANY_EMAIL_NOT_CONFIGURED) {
        await reservation.release?.().catch(() => undefined);
        await (this.prisma as any).emailOutboundAttempt.update({
          where: { id: attempt.id },
          data: { status: 'failed', errorCode: result.errorCode, errorMessage: result.errorMessage, finishedAt: new Date() },
        });
        await this.fail(row, result.errorCode, result.errorMessage || 'E-mail da empresa não configurado.');
        return;
      }

      // O SMTP pode ter aceitado antes de devolver erro de transporte. Não repetir cegamente.
      await (this.prisma as any).emailOutboundAttempt.update({
        where: { id: attempt.id },
        data: { status: 'unknown', errorCode: result.errorCode, errorMessage: result.errorMessage, finishedAt: new Date() },
      });
      await this.unknown(row, result.errorCode || 'smtp_outcome_unknown', result.errorMessage || 'Resultado SMTP desconhecido.');
    } catch (error: any) {
      const message = String(error?.message || error);
      await (this.prisma as any).emailOutboundAttempt.update({
        where: { id: attempt.id },
        data: { status: 'unknown', errorCode: 'smtp_outcome_unknown', errorMessage: message, finishedAt: new Date() },
      }).catch(() => null);
      await this.unknown(row, 'smtp_outcome_unknown', message);
    }
  }

  private async fail(row: any, code: string, message: string) {
    await (this.prisma as any).emailOutboundMessage.update({
      where: { id: row.id },
      data: { status: 'failed', leaseUntil: null, lastErrorCode: code, lastErrorMessage: message },
    });
    await this.completeStep(row, 'failed', code, message);
  }

  private async unknown(row: any, code: string, message: string) {
    await (this.prisma as any).emailOutboundMessage.update({
      where: { id: row.id },
      data: { status: 'unknown', leaseUntil: null, lastErrorCode: code, lastErrorMessage: message },
    });
    await this.completeStep(row, 'failed', code, message);
    this.logger.warn(`email_outcome_unknown id=${row.id} company=${row.companyId}`);
  }

  private async completeStep(row: any, status: 'succeeded' | 'failed', errorCode?: string, errorMessage?: string) {
    if (row.automationStepRunId) {
      await this.canonical.completeStep({
        companyId: row.companyId,
        stepRunId: row.automationStepRunId,
        status,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
      });
    }
    if (row.recoveryStepRunId) {
      await (this.prisma as any).recoveryAutomationStepRun.updateMany({
        where: { id: row.recoveryStepRunId, companyId: row.companyId, status: { in: ['queued', 'processing'] } },
        data: status === 'succeeded'
          ? { status: 'sent', sentAt: new Date(), leaseUntil: null, lastErrorCode: null, lastErrorMessage: null }
          : { status: 'failed', leaseUntil: null, lastErrorCode: errorCode || 'email_failed', lastErrorMessage: errorMessage || null },
      });
    }
  }
}
