import { PrismaService } from '../prisma/prisma.service';

export const AUTOMATION_COMMERCIAL_SLOT = 'commercial';
export const AUTOMATION_INBOUND_STOP_REASON = 'inbound_received';

const ACTIVE_BOT_STATUSES = ['pending', 'scheduled', 'sending', 'sent'];
const ACTIVE_CADENCE_STATUSES = ['ativa', 'pausada'];

type PrismaLike = PrismaService | Record<string, any>;

export type CanonicalAutomationConflict = {
  source: 'bot' | 'cadencia';
  id: string;
  status: string;
};

function json(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function sourceForKind(kind: unknown): 'bot' | 'cadencia' {
  return String(kind || '') === 'cadence' ? 'cadencia' : 'bot';
}

/**
 * Fonte canônica da Fase 3. Os serviços legados continuam dirigindo os runners
 * durante o dual-write, mas exclusividade, passo lógico e ledger deixam de
 * depender de metadata de conversa.
 *
 * A classe aceita PrismaLike para preservar os testes unitários antigos. Quando
 * um mock ainda não expõe as tabelas novas, ela opera em modo de compatibilidade
 * e a guarda legada continua fail-closed.
 */
export class CommercialAutomationStateService {
  constructor(private readonly prisma: PrismaLike) {}

  supports(client: any = this.prisma): boolean {
    return Boolean(client?.automationEnrollment && client?.automationStepRun && client?.automationLedgerEvent);
  }

  private async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (typeof (this.prisma as any).$transaction === 'function') {
      return (this.prisma as any).$transaction((tx: any) => callback(tx));
    }
    return callback(this.prisma as any);
  }

  private async lockLead(tx: any, companyId: number, leadId: string): Promise<void> {
    if (typeof tx?.$queryRawUnsafe !== 'function') return;
    // A função do Postgres retorna `void`, tipo que o Prisma não desserializa.
    // O CTE mantém o lock transacional e projeta apenas um inteiro suportado.
    await tx.$queryRawUnsafe(
      'WITH advisory_lock AS (SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))) SELECT 1::integer AS locked FROM advisory_lock',
      Number(companyId),
      String(leadId),
    );
  }

  async writeLedger(tx: any, input: {
    companyId: number;
    leadId: string;
    enrollmentId?: string | null;
    stepRunId?: string | null;
    eventType: string;
    source: string;
    statusFrom?: string | null;
    statusTo?: string | null;
    idempotencyKey: string;
    occurredAt?: Date;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    if (typeof tx?.automationLedgerEvent?.upsert !== 'function') return;
    const data = {
      companyId: input.companyId,
      leadId: input.leadId,
      enrollmentId: input.enrollmentId || null,
      stepRunId: input.stepRunId || null,
      eventType: input.eventType,
      source: input.source,
      statusFrom: input.statusFrom || null,
      statusTo: input.statusTo || null,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt || new Date(),
      metadataJson: json(input.metadata),
    };
    await tx.automationLedgerEvent.upsert({
      where: {
        companyId_idempotencyKey: {
          companyId: input.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: data,
      update: {},
    });
  }

  private async terminalizeStaleEnrollment(tx: any, enrollment: any): Promise<boolean> {
    const source = sourceForKind(enrollment?.definitionKind);
    let active = false;
    let legacyStatus = '';
    if (source === 'bot' && enrollment?.legacyExecutionId && typeof tx?.vendasAutomationJob?.findFirst === 'function') {
      const job = await tx.vendasAutomationJob.findFirst({
        where: {
          id: enrollment.legacyExecutionId,
          companyId: enrollment.companyId,
          leadId: enrollment.leadId,
        },
        select: { status: true, classification: true },
      });
      legacyStatus = String(job?.status || 'missing');
      active = Boolean(
        job &&
        ACTIVE_BOT_STATUSES.includes(legacyStatus) &&
        String(job.classification || '') !== AUTOMATION_INBOUND_STOP_REASON,
      );
    } else if (source === 'cadencia' && enrollment?.legacyExecutionId && typeof tx?.cadenciaInscricao?.findFirst === 'function') {
      const row = await tx.cadenciaInscricao.findFirst({
        where: {
          id: enrollment.legacyExecutionId,
          companyId: enrollment.companyId,
          leadId: enrollment.leadId,
        },
        select: { status: true },
      });
      legacyStatus = String(row?.status || 'missing');
      active = Boolean(row && ACTIVE_CADENCE_STATUSES.includes(legacyStatus));
    } else {
      // Enrollment sem executor legado é uma reserva em criação e continua ativo.
      return false;
    }
    if (active) return false;

    const now = new Date();
    const terminalStatus = legacyStatus === 'cancelada' || legacyStatus === 'canceled' ? 'canceled' : 'completed';
    const updated = await tx.automationEnrollment.updateMany({
      where: {
        id: enrollment.id,
        companyId: enrollment.companyId,
        activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
      },
      data: {
        status: terminalStatus,
        activeCommercialSlot: null,
        completedAt: terminalStatus === 'completed' ? now : null,
        canceledAt: terminalStatus === 'canceled' ? now : null,
        stopReason: `legacy_${legacyStatus || 'missing'}`,
        version: { increment: 1 },
      },
    });
    if (Number(updated?.count || 0) > 0) {
      await this.writeLedger(tx, {
        companyId: enrollment.companyId,
        leadId: enrollment.leadId,
        enrollmentId: enrollment.id,
        eventType: 'enrollment_reconciled_terminal',
        source: 'commercial_automation_state',
        statusFrom: enrollment.status,
        statusTo: terminalStatus,
        idempotencyKey: `enrollment:${enrollment.id}:legacy-terminal:${legacyStatus || 'missing'}`,
        metadata: { legacyStatus },
      });
    }
    return Number(updated?.count || 0) > 0;
  }

  private async terminalizeEnrollmentForStep(
    tx: any,
    row: any,
    status: 'failed' | 'canceled',
    reason: string | null | undefined,
    now: Date,
  ): Promise<void> {
    const updated = await tx.automationEnrollment.updateMany({
      where: {
        id: row.enrollmentId,
        companyId: row.companyId,
        activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
        status: { in: ['active', 'paused'] },
      },
      data: {
        status,
        activeCommercialSlot: null,
        canceledAt: status === 'canceled' ? now : null,
        stopReason: reason || `step_${status}`,
        lastError: status === 'failed' ? reason || 'step_failed' : null,
        version: { increment: 1 },
      },
    });
    if (Number(updated?.count || 0) === 0) return;
    await this.writeLedger(tx, {
      companyId: row.companyId,
      leadId: row.leadId,
      enrollmentId: row.enrollmentId,
      stepRunId: row.id,
      eventType: `enrollment_${status}`,
      source: 'commercial_automation_state',
      statusTo: status,
      idempotencyKey: `enrollment:${row.enrollmentId}:${status}:step:${row.id}`,
      occurredAt: now,
      metadata: reason ? { reason } : null,
    });
  }

  async findActiveConflict(tx: any, companyId: number, leadId: string): Promise<CanonicalAutomationConflict | null> {
    if (!this.supports(tx) || typeof tx?.automationEnrollment?.findFirst !== 'function') return null;
    const enrollment = await tx.automationEnrollment.findFirst({
      where: {
        companyId,
        leadId,
        activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
        status: { in: ['active', 'paused'] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!enrollment) return null;
    if (await this.terminalizeStaleEnrollment(tx, enrollment)) return null;
    return {
      source: sourceForKind(enrollment.definitionKind),
      id: String(enrollment.legacyExecutionId || enrollment.id),
      status: String(enrollment.status || 'active'),
    };
  }

  async reserveEnrollment(tx: any, input: {
    companyId: number;
    leadId: string;
    definitionKind: 'prospecting_campaign' | 'cadence';
    definitionId: string;
    legacySource: string;
    snapshot?: Record<string, unknown> | null;
    currentStep?: number;
    nextStepAt?: Date | null;
  }): Promise<any | null> {
    if (!this.supports(tx) || typeof tx?.automationEnrollment?.create !== 'function') return null;
    const row = await tx.automationEnrollment.create({
      data: {
        companyId: input.companyId,
        leadId: input.leadId,
        definitionKind: input.definitionKind,
        definitionId: input.definitionId,
        definitionSnapshotJson: json(input.snapshot),
        legacySource: input.legacySource,
        status: 'active',
        activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
        currentStep: Math.max(0, Number(input.currentStep || 0)),
        nextStepAt: input.nextStepAt || null,
      },
    });
    await this.writeLedger(tx, {
      companyId: input.companyId,
      leadId: input.leadId,
      enrollmentId: row.id,
      eventType: 'enrollment_created',
      source: input.legacySource,
      statusTo: 'active',
      idempotencyKey: `enrollment:${row.id}:created`,
      metadata: { definitionKind: input.definitionKind, definitionId: input.definitionId },
    });
    return row;
  }

  async attachLegacyExecution(tx: any, enrollment: any, legacyExecutionId: string): Promise<any | null> {
    if (!enrollment?.id || typeof tx?.automationEnrollment?.update !== 'function') return enrollment || null;
    return tx.automationEnrollment.update({
      where: { id: enrollment.id },
      data: { legacyExecutionId },
    });
  }

  async ensureStep(tx: any, input: {
    enrollment: any;
    stepKey: string;
    sequence: number;
    channel: string;
    scheduledAt?: Date | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<any | null> {
    if (!input.enrollment?.id || typeof tx?.automationStepRun?.upsert !== 'function') return null;
    const create = {
      companyId: input.enrollment.companyId,
      leadId: input.enrollment.leadId,
      enrollmentId: input.enrollment.id,
      stepKey: input.stepKey,
      sequence: input.sequence,
      attemptNumber: 1,
      channel: input.channel,
      purpose: 'commercial_contact',
      status: 'scheduled',
      idempotencyKey: input.idempotencyKey,
      scheduledAt: input.scheduledAt || null,
      metadataJson: json(input.metadata),
    };
    const row = await tx.automationStepRun.upsert({
      where: {
        companyId_idempotencyKey: {
          companyId: input.enrollment.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create,
      update: {},
    });
    await this.writeLedger(tx, {
      companyId: input.enrollment.companyId,
      leadId: input.enrollment.leadId,
      enrollmentId: input.enrollment.id,
      stepRunId: row.id,
      eventType: 'step_scheduled',
      source: String(input.enrollment.legacySource || 'commercial_automation'),
      statusTo: 'scheduled',
      idempotencyKey: `step:${row.id}:scheduled`,
      metadata: { stepKey: input.stepKey, channel: input.channel },
    });
    return row;
  }

  async claimLegacyStep(input: {
    companyId: number;
    leadId: string;
    legacySource: string;
    legacyExecutionId: string;
    definitionKind: 'prospecting_campaign' | 'cadence';
    definitionId: string;
    stepKey: string;
    sequence: number;
    channel: string;
    scheduledAt?: Date | null;
    snapshot?: Record<string, unknown> | null;
    leaseMs?: number;
  }): Promise<{ supported: boolean; claimed: boolean; alreadyExecuted: boolean; stepRunId: string | null }> {
    if (!this.supports()) return { supported: false, claimed: true, alreadyExecuted: false, stepRunId: null };
    return this.transaction(async (tx) => {
      await this.lockLead(tx, input.companyId, input.leadId);
      let enrollment = await tx.automationEnrollment.findFirst({
        where: {
          companyId: input.companyId,
          leadId: input.leadId,
          legacySource: input.legacySource,
          legacyExecutionId: input.legacyExecutionId,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!enrollment) {
        const conflict = await this.findActiveConflict(tx, input.companyId, input.leadId);
        if (conflict) return { supported: true, claimed: false, alreadyExecuted: false, stepRunId: null };
        enrollment = await this.reserveEnrollment(tx, {
          companyId: input.companyId,
          leadId: input.leadId,
          definitionKind: input.definitionKind,
          definitionId: input.definitionId,
          legacySource: input.legacySource,
          snapshot: input.snapshot,
          currentStep: input.sequence,
          nextStepAt: input.scheduledAt,
        });
        enrollment = await this.attachLegacyExecution(tx, enrollment, input.legacyExecutionId);
      }
      if (!enrollment || !['active', 'paused'].includes(String(enrollment.status || ''))) {
        return { supported: true, claimed: false, alreadyExecuted: false, stepRunId: null };
      }
      const step = await this.ensureStep(tx, {
        enrollment,
        stepKey: input.stepKey,
        sequence: input.sequence,
        channel: input.channel,
        scheduledAt: input.scheduledAt,
        idempotencyKey: `${input.legacySource}:${input.legacyExecutionId}:step:${input.stepKey}`,
      });
      if (!step) return { supported: true, claimed: false, alreadyExecuted: false, stepRunId: null };
      const status = String(step.status || '');
      if (['queued', 'dispatching', 'succeeded', 'skipped'].includes(status)) {
        return { supported: true, claimed: false, alreadyExecuted: true, stepRunId: step.id };
      }
      if (['failed', 'canceled'].includes(status)) {
        return { supported: true, claimed: false, alreadyExecuted: false, stepRunId: step.id };
      }
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + Math.max(30_000, Number(input.leaseMs || 120_000)));
      const claimed = await tx.automationStepRun.updateMany({
        where: {
          id: step.id,
          companyId: input.companyId,
          OR: [
            { status: 'scheduled' },
            { status: 'claimed', leaseUntil: { lt: now } },
          ],
        },
        data: {
          status: 'claimed',
          claimedAt: now,
          leaseUntil,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (Number(claimed?.count || 0) === 1) {
        await this.writeLedger(tx, {
          companyId: input.companyId,
          leadId: input.leadId,
          enrollmentId: enrollment.id,
          stepRunId: step.id,
          eventType: 'step_claimed',
          source: input.legacySource,
          statusFrom: status || 'scheduled',
          statusTo: 'claimed',
          idempotencyKey: `step:${step.id}:claimed:${now.toISOString()}`,
        });
      }
      return {
        supported: true,
        claimed: Number(claimed?.count || 0) === 1,
        alreadyExecuted: false,
        stepRunId: step.id,
      };
    });
  }

  async completeStep(input: {
    companyId: number;
    stepRunId: string | null | undefined;
    status: 'succeeded' | 'skipped' | 'failed' | 'canceled' | 'scheduled';
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    if (!input.stepRunId || !this.supports()) return;
    await this.transaction(async (tx) => {
      const row = await tx.automationStepRun.findFirst({
        where: { id: input.stepRunId, companyId: input.companyId },
      });
      if (!row) return;
      const terminal = ['succeeded', 'skipped', 'failed', 'canceled'].includes(input.status);
      const now = new Date();
      const result = await tx.automationStepRun.updateMany({
        where: {
          id: row.id,
          companyId: input.companyId,
          ...(input.status === 'scheduled'
            ? { status: 'claimed' }
            : { status: { notIn: ['succeeded', 'failed', 'canceled'] } }),
        },
        data: {
          status: input.status,
          leaseUntil: null,
          completedAt: terminal ? now : null,
          canceledAt: input.status === 'canceled' ? now : null,
          errorCode: input.errorCode || null,
          errorMessage: input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        },
      });
      if (Number(result?.count || 0) > 0) {
        await this.writeLedger(tx, {
          companyId: row.companyId,
          leadId: row.leadId,
          enrollmentId: row.enrollmentId,
          stepRunId: row.id,
          eventType: input.status === 'scheduled' ? 'step_released' : `step_${input.status}`,
          source: 'commercial_automation_state',
          statusFrom: row.status,
          statusTo: input.status,
          idempotencyKey: `step:${row.id}:${input.status}:${now.toISOString()}`,
          metadata: input.errorCode ? { errorCode: input.errorCode } : null,
        });
        if (input.status === 'failed' || input.status === 'canceled') {
          await this.terminalizeEnrollmentForStep(
            tx,
            row,
            input.status,
            input.errorMessage || input.errorCode,
            now,
          );
        }
      }
    });
  }

  async syncStepFromOutbound(input: {
    companyId: number;
    outboundMessageId: number;
    status: 'queued' | 'dispatching' | 'succeeded' | 'failed' | 'canceled';
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    if (!this.supports() || !Number(input.outboundMessageId || 0)) return;
    await this.transaction(async (tx) => {
      const row = await tx.automationStepRun.findFirst({
        where: { companyId: input.companyId, outboundMessageId: input.outboundMessageId },
      });
      if (!row) return;
      const current = String(row.status || '');
      if (['succeeded', 'failed', 'canceled'].includes(current)) return;
      const now = new Date();
      const terminal = ['succeeded', 'failed', 'canceled'].includes(input.status);
      const updated = await tx.automationStepRun.updateMany({
        where: {
          id: row.id,
          companyId: input.companyId,
          status: { notIn: ['succeeded', 'failed', 'canceled'] },
        },
        data: {
          status: input.status,
          leaseUntil: null,
          queuedAt: input.status === 'queued' ? row.queuedAt || now : row.queuedAt,
          completedAt: terminal ? now : null,
          canceledAt: input.status === 'canceled' ? now : null,
          errorCode: input.errorCode || null,
          errorMessage: input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        },
      });
      if (Number(updated?.count || 0) > 0) {
        await this.writeLedger(tx, {
          companyId: row.companyId,
          leadId: row.leadId,
          enrollmentId: row.enrollmentId,
          stepRunId: row.id,
          eventType: `outbound_${input.status}`,
          source: 'whatsapp_outbox',
          statusFrom: current,
          statusTo: input.status,
          idempotencyKey: `outbound:${input.outboundMessageId}:step:${input.status}`,
          metadata: input.errorCode ? { errorCode: input.errorCode } : null,
        });
        if (input.status === 'failed' || input.status === 'canceled') {
          await this.terminalizeEnrollmentForStep(
            tx,
            row,
            input.status,
            input.errorMessage || input.errorCode,
            now,
          );
        }
      }
    });
  }

  async setDefinitionStatus(input: {
    companyId: number;
    definitionKind: 'prospecting_campaign' | 'cadence';
    definitionId: string;
    status: 'active' | 'paused' | 'completed' | 'canceled' | 'failed';
    reason?: string | null;
  }): Promise<void> {
    if (!this.supports()) return;
    await this.transaction(async (tx) => {
      const rows = await tx.automationEnrollment.findMany({
        where: {
          companyId: input.companyId,
          definitionKind: input.definitionKind,
          definitionId: input.definitionId,
          activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
          status: { in: ['active', 'paused'] },
        },
        select: { id: true, companyId: true, leadId: true, status: true },
        take: 500,
      });
      const now = new Date();
      const active = input.status === 'active' || input.status === 'paused';
      for (const row of rows || []) {
        const updated = await tx.automationEnrollment.updateMany({
          where: { id: row.id, companyId: input.companyId, status: row.status },
          data: {
            status: input.status,
            activeCommercialSlot: active ? AUTOMATION_COMMERCIAL_SLOT : null,
            pausedAt: input.status === 'paused' ? now : null,
            completedAt: input.status === 'completed' ? now : null,
            canceledAt: input.status === 'canceled' ? now : null,
            stopReason: input.reason || null,
            lastError: input.status === 'failed' ? input.reason || null : null,
            version: { increment: 1 },
          },
        });
        if (Number(updated?.count || 0) === 0 || row.status === input.status) continue;
        await this.writeLedger(tx, {
          companyId: input.companyId,
          leadId: row.leadId,
          enrollmentId: row.id,
          eventType: `enrollment_${input.status}`,
          source: 'automation_definition',
          statusFrom: row.status,
          statusTo: input.status,
          idempotencyKey: `enrollment:${row.id}:definition:${input.status}:${now.toISOString()}`,
          occurredAt: now,
          metadata: input.reason ? { reason: input.reason } : null,
        });
      }
    });
  }

  async finishEnrollmentByLegacy(input: {
    companyId: number;
    legacySource: string;
    legacyExecutionId: string;
    status: 'completed' | 'canceled' | 'failed' | 'paused' | 'active';
    reason?: string | null;
  }): Promise<void> {
    if (!this.supports()) return;
    await this.transaction(async (tx) => {
      const row = await tx.automationEnrollment.findFirst({
        where: {
          companyId: input.companyId,
          legacySource: input.legacySource,
          legacyExecutionId: input.legacyExecutionId,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!row) return;
      const now = new Date();
      const active = input.status === 'active' || input.status === 'paused';
      await tx.automationEnrollment.updateMany({
        where: { id: row.id, companyId: input.companyId },
        data: {
          status: input.status,
          activeCommercialSlot: active ? AUTOMATION_COMMERCIAL_SLOT : null,
          pausedAt: input.status === 'paused' ? now : null,
          completedAt: input.status === 'completed' ? now : null,
          canceledAt: input.status === 'canceled' ? now : null,
          stopReason: input.reason || null,
          lastError: input.status === 'failed' ? input.reason || null : null,
          version: { increment: 1 },
        },
      });
      await this.writeLedger(tx, {
        companyId: row.companyId,
        leadId: row.leadId,
        enrollmentId: row.id,
        eventType: `enrollment_${input.status}`,
        source: input.legacySource,
        statusFrom: row.status,
        statusTo: input.status,
        idempotencyKey: `enrollment:${row.id}:${input.status}:${now.toISOString()}`,
        metadata: input.reason ? { reason: input.reason } : null,
      });
    });
  }

  async advanceEnrollmentByLegacy(input: {
    companyId: number;
    legacySource: string;
    legacyExecutionId: string;
    currentStep: number;
    nextStepAt?: Date | null;
  }): Promise<void> {
    if (!this.supports()) return;
    await (this.prisma as any).automationEnrollment.updateMany({
      where: {
        companyId: input.companyId,
        legacySource: input.legacySource,
        legacyExecutionId: input.legacyExecutionId,
        status: 'active',
      },
      data: {
        currentStep: Math.max(0, Number(input.currentStep || 0)),
        nextStepAt: input.nextStepAt || null,
        version: { increment: 1 },
      },
    });
  }

  async interruptForInbound(tx: any, input: {
    companyId: number;
    leadIds: string[];
    inboundMessageId: number;
    timestamp: Date;
  }): Promise<{ canceledEnrollments: number; canceledSteps: number }> {
    if (!this.supports(tx) || !input.leadIds.length) return { canceledEnrollments: 0, canceledSteps: 0 };
    const enrollments = await tx.automationEnrollment.findMany({
      where: {
        companyId: input.companyId,
        leadId: { in: input.leadIds },
        activeCommercialSlot: AUTOMATION_COMMERCIAL_SLOT,
        status: { in: ['active', 'paused'] },
      },
      select: { id: true, companyId: true, leadId: true, status: true },
      take: 500,
    });
    const enrollmentIds = (enrollments || []).map((row: any) => row.id);
    const steps = enrollmentIds.length
      ? await tx.automationStepRun.updateMany({
          where: {
            companyId: input.companyId,
            enrollmentId: { in: enrollmentIds },
            status: { in: ['scheduled', 'claimed', 'queued'] },
          },
          data: {
            status: 'canceled',
            canceledAt: input.timestamp,
            completedAt: input.timestamp,
            leaseUntil: null,
            errorCode: AUTOMATION_INBOUND_STOP_REASON,
            errorMessage: AUTOMATION_INBOUND_STOP_REASON,
          },
        })
      : { count: 0 };
    if (enrollmentIds.length && typeof tx?.emailOutboundMessage?.updateMany === 'function') {
      await tx.emailOutboundMessage.updateMany({
        where: {
          companyId: input.companyId,
          status: 'pending',
          automationStepRun: { enrollmentId: { in: enrollmentIds } },
        },
        data: {
          status: 'canceled',
          lastErrorCode: AUTOMATION_INBOUND_STOP_REASON,
          lastErrorMessage: 'Cancelado após resposta do cliente.',
        },
      });
    }
    const updated = enrollmentIds.length
      ? await tx.automationEnrollment.updateMany({
          where: { id: { in: enrollmentIds }, companyId: input.companyId },
          data: {
            status: 'canceled',
            activeCommercialSlot: null,
            canceledAt: input.timestamp,
            stopReason: AUTOMATION_INBOUND_STOP_REASON,
            version: { increment: 1 },
          },
        })
      : { count: 0 };
    for (const enrollment of enrollments || []) {
      await this.writeLedger(tx, {
        companyId: input.companyId,
        leadId: enrollment.leadId,
        enrollmentId: enrollment.id,
        eventType: 'enrollment_interrupted_inbound',
        source: 'commercial_contact_control',
        statusFrom: enrollment.status,
        statusTo: 'canceled',
        idempotencyKey: `inbound:${input.inboundMessageId}:enrollment:${enrollment.id}`,
        occurredAt: input.timestamp,
        metadata: { reason: AUTOMATION_INBOUND_STOP_REASON },
      });
    }
    return {
      canceledEnrollments: Number(updated?.count || 0),
      canceledSteps: Number(steps?.count || 0),
    };
  }
}
