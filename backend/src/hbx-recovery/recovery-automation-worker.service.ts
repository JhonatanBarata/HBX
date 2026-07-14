import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailOutboxService } from '../mail/email-outbox.service';
import {
  ConversationsService,
  RecoveryAutomationHookInput,
} from '../messaging/conversations.service';
import { PrismaService } from '../prisma/prisma.service';

const TICK_MS = 15_000;
const LEASE_MS = 60_000;

function workerEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.HBX_RECOVERY_AUTOMATION_WORKER_ENABLED || '').trim().toLowerCase(),
  );
}

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

@Injectable()
export class RecoveryAutomationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecoveryAutomationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly emailOutbox: EmailOutboxService,
  ) {}

  onModuleInit() {
    // A barreira de inbound fica ativa mesmo se o dispatcher estiver desligado:
    // uma fila deixada por execução anterior nunca pode continuar após resposta.
    this.conversations.setRecoveryAutomationHook((input) => this.onConversationEvent(input));
    if (!workerEnabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    this.conversations.setRecoveryAutomationHook(null);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (!workerEnabled() || this.running) return;
    this.running = true;
    try {
      await this.recoverExpiredClaims();
      await this.materializeDueSteps();
      await this.dispatchDueSteps();
    } catch (error: any) {
      this.logger.warn(`Recovery automation tick falhou: ${String(error?.message || error)}`);
    } finally {
      this.running = false;
    }
  }

  private async recoverExpiredClaims() {
    // tenant-scope-allow: varredura global do worker; cada linha preserva seu companyId.
    await this.prisma.recoveryAutomationStepRun.updateMany({
      where: { status: 'processing', leaseUntil: { lt: new Date() } },
      data: {
        status: 'unknown',
        leaseUntil: null,
        lastErrorCode: 'dispatch_outcome_unknown',
        lastErrorMessage: 'O processo caiu durante o despacho; o envio não será repetido automaticamente.',
      },
    });
  }

  private async materializeDueSteps() {
    // tenant-scope-allow: dispatcher global seleciona somente tenants com opt-in persistido.
    const customers = await this.prisma.hbxRecoveryCustomer.findMany({
      where: { automationEnabled: true, status: 'OVERDUE', openAmount: { gt: 0 } },
      include: {
        company: { select: { recoveryBotLiveAt: true, logisticaConfig: { select: { moduloRecoveryAtivo: true } } } },
        debtItems: {
          where: { status: 'open', openAmount: { gt: 0 } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          take: 1,
          select: { id: true, debtCaseId: true, dueDate: true, createdAt: true },
        },
      },
      take: 200,
    });

    for (const customer of customers) {
      if (!customer.company.recoveryBotLiveAt || !customer.company.logisticaConfig?.moduloRecoveryAtivo) continue;
      const anchor = customer.debtItems[0];
      const anchorDate = anchor?.dueDate || anchor?.createdAt || customer.createdAt;
      // Todos os itens da mesma dívida apontam para o mesmo DebtCase. Usar o item
      // mais antigo como ciclo faria uma quitação parcial recriar toda a cadência
      // quando o próximo item virasse a âncora.
      const cycleKey = anchor?.debtCaseId || anchor?.id || `legacy-${anchorDate.toISOString().slice(0, 10)}`;
      const stages = await this.prisma.hbxRecoveryFlowStage.findMany({
        where: { companyId: customer.companyId, enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      for (const stage of stages) {
        const dueAt = new Date(anchorDate.getTime() + Math.max(0, stage.daysAfter) * 86_400_000);
        await this.prisma.recoveryAutomationStepRun.upsert({
          where: {
            companyId_customerId_stageId_cycleKey: {
              companyId: customer.companyId,
              customerId: customer.id,
              stageId: stage.id,
              cycleKey,
            },
          },
          create: {
            companyId: customer.companyId,
            customerId: customer.id,
            stageId: stage.id,
            cycleKey,
            channel: stage.channel,
            dueAt,
          },
          update: {},
        });
      }
    }
  }

  private async dispatchDueSteps() {
    // tenant-scope-allow: claim global da fila; o dispatch revalida tenant e opt-in.
    const rows = await this.prisma.recoveryAutomationStepRun.findMany({
      where: { status: 'pending', dueAt: { lte: new Date() } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 20,
      select: { id: true, companyId: true },
    });
    for (const row of rows) {
      const claimed = await this.prisma.recoveryAutomationStepRun.updateMany({
        where: { id: row.id, companyId: row.companyId, status: 'pending', dueAt: { lte: new Date() } },
        data: { status: 'processing', attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (claimed.count === 1) await this.dispatchOne(row.id);
    }
  }

  private async dispatchOne(id: string) {
    const row = await this.prisma.recoveryAutomationStepRun.findUnique({
      where: { id },
      include: {
        stage: true,
        customer: { include: { customerProfile: { select: { name: true, email: true } } } },
        company: { select: { name: true, recoveryBotLiveAt: true, logisticaConfig: { select: { moduloRecoveryAtivo: true } } } },
      },
    });
    if (!row || row.status !== 'processing') return;
    if (
      !row.company.recoveryBotLiveAt ||
      !row.company.logisticaConfig?.moduloRecoveryAtivo ||
      row.customer.automationEnabled === false ||
      row.customer.openAmount <= 0 ||
      row.customer.status !== 'OVERDUE' ||
      row.stage.enabled === false
    ) {
      await this.cancelStep(row.companyId, row.id, 'recovery_inactive');
      return;
    }

    const body = this.render(row.stage.template, {
      cliente: row.customer.clientName || row.customer.name || row.customer.customerProfile?.name || 'Cliente',
      empresa: row.company.name || 'Empresa',
      valor: Number(row.customer.openAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    });
    const channel = String(row.channel || '').trim().toLowerCase();
    try {
      if (channel.includes('mail') || channel.includes('e-mail') || channel === 'email') {
        const recipient = String(row.customer.customerProfile?.email || '').trim();
        if (!recipient) {
          await this.failStep(row.companyId, row.id, 'customer_email_missing', 'Cliente sem e-mail cadastrado.');
          return;
        }
        await this.emailOutbox.enqueue({
          companyId: row.companyId,
          recoveryStepRunId: row.id,
          recipient,
          subject: String(row.stage.title || 'Regularização financeira'),
          bodyText: body,
          sourceModule: 'hbx_recovery_automation',
          purpose: 'recovery',
          idempotencyKey: `recovery-email:${row.id}`,
          metadata: { customerId: row.customerId, stageId: row.stageId },
        });
        return;
      }

      const queued = await this.conversations.queueOutboundForCompany(row.companyId, {
        to: row.customer.whatsappNumber,
        contactId: row.customer.id,
        body,
        messageType: channel.includes('template') ? 'template' : 'text',
        templateName: channel.includes('template') ? this.templateName(row.stage.title) : undefined,
        sourceModule: 'hbx_recovery_automation',
        senderType: 'bot',
        variables: { botType: 'recovery', recoveryCustomerId: row.customerId, recoveryStepRunId: row.id },
        flowState: { currentFlow: 'cobranca_recovery', currentStep: row.stage.title, botActive: true },
      });
      await this.prisma.$transaction([
        this.prisma.recoveryAutomationStepRun.update({
          where: { id: row.id },
          data: { status: 'queued', outboundMessageId: queued.outboundMessageId, leaseUntil: null },
        }),
        this.prisma.companyConversation.updateMany({
          where: { id: queued.conversationId, companyId: row.companyId },
          data: { customerProfileId: row.customer.customerProfileId },
        }),
      ]);
    } catch (error: any) {
      await this.failStep(row.companyId, row.id, 'dispatch_failed', String(error?.message || error));
    }
  }

  private render(template: string, vars: Record<string, string>) {
    let value = String(template || 'Olá {{cliente}}, identificamos uma pendência de {{valor}}.');
    for (const [key, replacement] of Object.entries(vars)) {
      value = value.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), replacement);
    }
    return value.trim();
  }

  private templateName(title: string) {
    return String(title || 'recovery')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'recovery';
  }

  private cancelStep(companyId: number, id: string, reason: string) {
    return this.prisma.recoveryAutomationStepRun.updateMany({
      where: { id, companyId, status: { in: ['pending', 'processing', 'queued'] } },
      data: { status: 'canceled', canceledAt: new Date(), cancelReason: reason, leaseUntil: null },
    });
  }

  private failStep(companyId: number, id: string, code: string, message: string) {
    return this.prisma.recoveryAutomationStepRun.updateMany({
      where: { id, companyId, status: { in: ['processing', 'queued'] } },
      data: { status: 'failed', leaseUntil: null, lastErrorCode: code, lastErrorMessage: message.slice(0, 1000) },
    });
  }

  private async onConversationEvent(input: RecoveryAutomationHookInput) {
    if (input.event === 'inbound' && input.validHumanInbound) {
      await this.cancelForInbound(input.companyId, input.conversationId);
      return;
    }
    if (!input.messageId || !['sent', 'delivery', 'failed', 'canceled'].includes(input.event)) return;
    const message = await this.prisma.companyMessage.findFirst({
      where: { id: input.messageId, companyId: input.companyId },
      select: { outboundMessageId: true },
    });
    if (!message?.outboundMessageId) return;
    const run = await this.prisma.recoveryAutomationStepRun.findFirst({
      where: { companyId: input.companyId, outboundMessageId: message.outboundMessageId },
      select: { id: true, companyId: true },
    });
    if (!run) return;
    if (input.event === 'sent' || input.event === 'delivery') {
      await this.prisma.recoveryAutomationStepRun.updateMany({
        where: { id: run.id, companyId: run.companyId, status: { in: ['queued', 'processing'] } },
        data: { status: 'sent', sentAt: new Date(), leaseUntil: null, lastErrorCode: null, lastErrorMessage: null },
      });
    } else {
      await this.failStep(run.companyId, run.id, `whatsapp_${input.event}`, `Envio ${input.event}.`);
    }
  }

  private async cancelForInbound(companyId: number, conversationId: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { customerProfileId: true, contact: true },
    });
    if (!conversation) return;
    const candidates = await this.prisma.hbxRecoveryCustomer.findMany({
      where: {
        companyId,
        ...(conversation.customerProfileId
          ? { customerProfileId: conversation.customerProfileId }
          : { whatsappNumber: conversation.contact }),
      },
      select: { id: true, whatsappNumber: true },
    });
    const phone = digits(conversation.contact);
    const ids = candidates
      .filter((candidate) => Boolean(conversation.customerProfileId) || !phone || digits(candidate.whatsappNumber) === phone)
      .map((candidate) => candidate.id);
    if (!ids.length) return;

    const queuedRuns = await this.prisma.recoveryAutomationStepRun.findMany({
      where: { companyId, customerId: { in: ids }, status: { in: ['pending', 'processing', 'queued'] } },
      select: { id: true, outboundMessageId: true },
    });
    const outboundIds = queuedRuns.map((run) => run.outboundMessageId).filter((id): id is number => Boolean(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryAutomationStepRun.updateMany({
        where: {
          companyId,
          id: { in: queuedRuns.map((run) => run.id) },
          status: { in: ['pending', 'processing', 'queued'] },
        },
        data: { status: 'canceled', canceledAt: new Date(), cancelReason: 'customer_inbound', leaseUntil: null },
      });
      await tx.emailOutboundMessage.updateMany({
        where: {
          companyId,
          recoveryStepRunId: { in: queuedRuns.map((run) => run.id) },
          status: 'pending',
        },
        data: {
          status: 'canceled',
          lastErrorCode: 'customer_inbound',
          lastErrorMessage: 'Cancelado após resposta do cliente.',
        },
      });
      if (outboundIds.length) {
        await tx.outboundMessage.updateMany({
          where: { companyId, id: { in: outboundIds }, status: 'PENDING' },
          data: { status: 'CANCELED', lastError: 'Cancelado após resposta do cliente.' },
        });
        await tx.companyMessage.updateMany({
          where: { companyId, outboundMessageId: { in: outboundIds }, status: 'QUEUED' },
          data: { status: 'CANCELED', error: 'Cancelado após resposta do cliente.' },
        });
      }
    });
  }
}
