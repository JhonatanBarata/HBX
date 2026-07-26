import { PrismaService } from '../prisma/prisma.service';
import type { ConversationsService } from '../messaging/conversations.service';
import { CommercialAutomationStateService } from '../automation/commercial-automation-state.service';

export const COMMERCIAL_WHATSAPP_SOURCE_MODULES = [
  'vendas_prospeccao_bot',
  'prospeccao_bot',
] as const;

export const COMMERCIAL_INBOUND_STOP_REASON = 'inbound_received';

const ACTIVE_BOT_JOB_STATUSES = ['pending', 'scheduled', 'sending', 'sent'] as const;
const ACTIVE_CADENCE_STATUSES = ['ativa', 'pausada'] as const;

type PrismaLike = PrismaService | Record<string, any>;

type CommercialOutboundRow = {
  id: number;
  status: string;
  sourceModule: string | null;
  createdAt?: Date | null;
  message?: {
    conversationId?: number | null;
    senderType?: string | null;
    variablesJson?: string | null;
  } | null;
};

export type CommercialAutomationConflict = {
  source: 'bot' | 'cadencia';
  id: string;
  status: string;
};

function parseRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function isHumanSender(value: unknown): boolean {
  return String(value || '').trim().toLowerCase() === 'human';
}

function isConversationReplyVariables(value: unknown): boolean {
  return String(parseRecord(value).purpose || '').trim().toLowerCase() === 'conversation_reply';
}

function isUniqueConstraintError(error: any): boolean {
  return String(error?.code || '').toUpperCase() === 'P2002';
}

/**
 * Adaptador de dual-write entre os runners legados e o estado canônico da Fase 3.
 * A exclusividade e os claims vivem no modelo canônico; consultas legadas ficam
 * como reconciliação fail-closed durante a migração.
 */
export class CommercialContactControlService {
  private readonly canonical: CommercialAutomationStateService;

  constructor(
    private readonly prisma: PrismaLike,
    private readonly conversations?: Pick<ConversationsService, 'dispatchVendasCockpitProjection'>,
  ) {
    this.canonical = new CommercialAutomationStateService(this.prisma);
  }

  isCommercialWhatsappSource(sourceModule: unknown): boolean {
    const source = String(sourceModule || '').trim().toLowerCase();
    return (COMMERCIAL_WHATSAPP_SOURCE_MODULES as readonly string[]).includes(source);
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

  private async findActiveConflict(tx: any, companyId: number, leadId: string): Promise<CommercialAutomationConflict | null> {
    const canonicalConflict = await this.canonical.findActiveConflict(tx, companyId, leadId);
    if (canonicalConflict) return canonicalConflict;

    const jobs = typeof tx?.vendasAutomationJob?.findMany === 'function'
      ? await tx.vendasAutomationJob.findMany({
          where: {
            companyId,
            leadId,
            status: { in: [...ACTIVE_BOT_JOB_STATUSES] },
            campaign: { status: 'running' },
          },
          select: { id: true, status: true, classification: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [];
    const activeJob = (jobs || []).find((job: any) => {
      if (String(job?.status || '') !== 'sent') return true;
      return String(job?.classification || '') !== COMMERCIAL_INBOUND_STOP_REASON;
    });
    if (activeJob?.id) {
      return { source: 'bot', id: String(activeJob.id), status: String(activeJob.status || '') };
    }

    const enrollment = typeof tx?.cadenciaInscricao?.findFirst === 'function'
      ? await tx.cadenciaInscricao.findFirst({
          where: { companyId, leadId, status: { in: [...ACTIVE_CADENCE_STATUSES] } },
          select: { id: true, status: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    if (enrollment?.id) {
      return { source: 'cadencia', id: String(enrollment.id), status: String(enrollment.status || '') };
    }
    return null;
  }

  async createVendasAutomationJob(input: {
    companyId: number;
    leadId: string;
    campaignId: string;
    data: Record<string, any>;
  }): Promise<{ created: boolean; row?: any; conflict?: CommercialAutomationConflict | { source: 'inbound'; id: string; status: string } }> {
    return this.transaction(async (tx) => {
      await this.lockLead(tx, input.companyId, input.leadId);

      const inboundMarker = typeof tx?.vendasAutomationJob?.findFirst === 'function'
        ? await tx.vendasAutomationJob.findFirst({
            where: {
              companyId: input.companyId,
              leadId: input.leadId,
              campaignId: input.campaignId,
              classification: COMMERCIAL_INBOUND_STOP_REASON,
            },
            select: { id: true, status: true },
            orderBy: { updatedAt: 'desc' },
          })
        : null;
      if (inboundMarker?.id) {
        return {
          created: false,
          conflict: { source: 'inbound' as const, id: String(inboundMarker.id), status: COMMERCIAL_INBOUND_STOP_REASON },
        };
      }

      const conflict = await this.findActiveConflict(tx, input.companyId, input.leadId);
      if (conflict) return { created: false, conflict };
      const enrollment = await this.canonical.reserveEnrollment(tx, {
        companyId: input.companyId,
        leadId: input.leadId,
        definitionKind: 'prospecting_campaign',
        definitionId: input.campaignId,
        legacySource: 'vendas_automation_job',
        snapshot: {
          campaignId: input.campaignId,
          scheduledAt: input.data?.scheduledAt || null,
          classification: input.data?.classification || null,
        },
        nextStepAt: input.data?.scheduledAt || null,
      });
      const row = await tx.vendasAutomationJob.create({ data: input.data });
      const linkedEnrollment = await this.canonical.attachLegacyExecution(tx, enrollment, String(row.id));
      await this.canonical.ensureStep(tx, {
        enrollment: linkedEnrollment,
        stepKey: 'first_contact',
        sequence: 0,
        channel: 'whatsapp',
        scheduledAt: input.data?.scheduledAt || null,
        idempotencyKey: `vendas_automation_job:${String(row.id)}:step:first_contact`,
      });
      return { created: true, row };
    });
  }

  async createCadenciaInscricao(input: {
    companyId: number;
    leadId: string;
    data: Record<string, any>;
  }): Promise<{ created: boolean; row?: any; alreadyEnrolled?: boolean; conflict?: CommercialAutomationConflict }> {
    return this.transaction(async (tx) => {
      await this.lockLead(tx, input.companyId, input.leadId);
      const cadenciaId = String(input.data?.cadenciaId || '').trim();
      const sameEnrollment = cadenciaId && typeof tx?.cadenciaInscricao?.findFirst === 'function'
        ? await tx.cadenciaInscricao.findFirst({
            where: {
              companyId: input.companyId,
              leadId: input.leadId,
              cadenciaId,
            },
            select: { id: true },
          })
        : null;
      if (sameEnrollment?.id) return { created: false, alreadyEnrolled: true };
      const conflict = await this.findActiveConflict(tx, input.companyId, input.leadId);
      if (conflict) return { created: false, conflict };
      try {
        const enrollment = await this.canonical.reserveEnrollment(tx, {
          companyId: input.companyId,
          leadId: input.leadId,
          definitionKind: 'cadence',
          definitionId: cadenciaId,
          legacySource: 'cadencia_inscricao',
          snapshot: {
            cadenciaId,
            responsavelId: input.data?.responsavelId || null,
          },
          currentStep: Number(input.data?.currentStep || 0),
          nextStepAt: input.data?.nextStepAt || null,
        });
        const row = await tx.cadenciaInscricao.create({ data: input.data });
        await this.canonical.attachLegacyExecution(tx, enrollment, String(row.id));
        return { created: true, row };
      } catch (error: any) {
        if (isUniqueConstraintError(error)) return { created: false, alreadyEnrolled: true };
        throw error;
      }
    });
  }

  async canVendasJobQueue(input: { companyId: number; leadId: string; jobId: string }): Promise<boolean> {
    const job = await (this.prisma as any).vendasAutomationJob.findFirst({
      where: { id: input.jobId, companyId: input.companyId, leadId: input.leadId },
      select: { status: true, classification: true },
    });
    return Boolean(
      job &&
      String(job.status || '') === 'sending' &&
      String(job.classification || '') !== COMMERCIAL_INBOUND_STOP_REASON,
    );
  }

  // S4 LEAD-CENTRICO (04-robozinho.md, "paradas globais"): pausa TODA inscrição de
  // cadência ativa/pausada de um lead, com motivo — usado quando o HUMANO assume
  // (status -> qualificado/encerrado) ou quando o card sai do Vendas (negativar/
  // excluir/opt-out). Espelha exatamente o que `cancelarInscricoes` (CadenciaService)
  // já faz por cadência+usuário, só que aqui é por LEAD inteiro e sem gate de
  // permissão (é um efeito colateral do ciclo de vida do lead, não uma ação de
  // gestão de automação). NUNCA toca em outbox/disjuntor/warmup — só o estado da
  // inscrição + o ledger canônico (auditoria: motivo + evidência).
  async pauseCommercialAutomationForLead(input: {
    companyId: number;
    leadId: string;
    reason: string;
  }): Promise<{ canceledCadencias: number }> {
    const where = {
      companyId: input.companyId,
      leadId: input.leadId,
      status: { in: [...ACTIVE_CADENCE_STATUSES] },
    };
    const affected = typeof (this.prisma as any)?.cadenciaInscricao?.findMany === 'function'
      ? await (this.prisma as any).cadenciaInscricao.findMany({ where, select: { id: true } })
      : [];
    if (!affected.length) return { canceledCadencias: 0 };
    await (this.prisma as any).cadenciaInscricao.updateMany({
      where,
      data: { status: 'cancelada', lastStepAt: new Date(), lastError: input.reason },
    });
    for (const row of affected) {
      await this.finishAutomationEnrollment({
        companyId: input.companyId,
        legacySource: 'cadencia_inscricao',
        legacyExecutionId: String(row.id),
        status: 'canceled',
        reason: input.reason,
      });
    }
    return { canceledCadencias: affected.length };
  }

  async canCadenciaRun(input: { companyId: number; leadId: string; inscricaoId: string }): Promise<boolean> {
    const enrollment = await (this.prisma as any).cadenciaInscricao.findFirst({
      where: { id: input.inscricaoId, companyId: input.companyId, leadId: input.leadId },
      select: { status: true, lastError: true },
    });
    return Boolean(enrollment && String(enrollment.status || '') === 'ativa');
  }

  claimVendasJobStep(input: {
    companyId: number;
    leadId: string;
    campaignId: string;
    jobId: string;
    scheduledAt?: Date | null;
  }) {
    return this.canonical.claimLegacyStep({
      companyId: input.companyId,
      leadId: input.leadId,
      legacySource: 'vendas_automation_job',
      legacyExecutionId: input.jobId,
      definitionKind: 'prospecting_campaign',
      definitionId: input.campaignId,
      stepKey: 'first_contact',
      sequence: 0,
      channel: 'whatsapp',
      scheduledAt: input.scheduledAt || null,
    });
  }

  claimCadenciaStep(input: {
    companyId: number;
    leadId: string;
    cadenciaId: string;
    inscricaoId: string;
    currentStep: number;
    channel: string;
    scheduledAt?: Date | null;
    snapshot?: Record<string, unknown> | null;
  }) {
    return this.canonical.claimLegacyStep({
      companyId: input.companyId,
      leadId: input.leadId,
      legacySource: 'cadencia_inscricao',
      legacyExecutionId: input.inscricaoId,
      definitionKind: 'cadence',
      definitionId: input.cadenciaId,
      stepKey: String(input.currentStep),
      sequence: input.currentStep,
      channel: input.channel,
      scheduledAt: input.scheduledAt || null,
      snapshot: input.snapshot,
    });
  }

  completeAutomationStep(input: {
    companyId: number;
    stepRunId?: string | null;
    status: 'succeeded' | 'skipped' | 'failed' | 'canceled' | 'scheduled';
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    if (!input.stepRunId) return Promise.resolve(null);
    return this.canonical.completeStep({ ...input, stepRunId: input.stepRunId });
  }

  syncAutomationStepFromOutbound(input: {
    companyId: number;
    outboundMessageId: number;
    status: 'queued' | 'dispatching' | 'succeeded' | 'failed' | 'canceled';
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    return this.canonical.syncStepFromOutbound(input);
  }

  finishAutomationEnrollment(input: {
    companyId: number;
    legacySource: string;
    legacyExecutionId: string;
    status: 'completed' | 'canceled' | 'failed' | 'paused' | 'active';
    reason?: string | null;
  }) {
    return this.canonical.finishEnrollmentByLegacy(input);
  }

  advanceAutomationEnrollment(input: {
    companyId: number;
    legacySource: string;
    legacyExecutionId: string;
    currentStep: number;
    nextStepAt?: Date | null;
  }) {
    return this.canonical.advanceEnrollmentByLegacy(input);
  }

  setAutomationDefinitionStatus(input: {
    companyId: number;
    definitionKind: 'prospecting_campaign' | 'cadence';
    definitionId: string;
    status: 'active' | 'paused' | 'completed' | 'canceled' | 'failed';
    reason?: string | null;
  }) {
    return this.canonical.setDefinitionStatus(input);
  }

  private async resolveLeadIds(tx: any, input: {
    companyId: number;
    conversationId: number;
    from: string;
  }): Promise<{ leadIds: Set<string>; conversation: any | null; canonicalLeadId: string | null }> {
    const leadIds = new Set<string>();
    const conversation = input.conversationId && typeof tx?.companyConversation?.findFirst === 'function'
      ? await tx.companyConversation.findFirst({
          where: { id: input.conversationId, companyId: input.companyId, channel: 'whatsapp' },
          select: { id: true, vendasLeadId: true, contact: true, metadata: true },
        })
      : null;
    const canonicalLeadId = String(conversation?.vendasLeadId || '').trim() || null;
    if (canonicalLeadId) {
      leadIds.add(canonicalLeadId);
      return { leadIds, conversation, canonicalLeadId };
    }

    const metadata = parseRecord(conversation?.metadata);
    const automation = parseRecord(metadata.vendasAutomation);
    const queue = parseRecord(metadata.vendasAgendaQueue);
    for (const value of [metadata.vendasLeadId, automation.leadId, queue.leadId]) {
      const leadId = String(value || '').trim();
      if (leadId) leadIds.add(leadId);
    }

    if (!leadIds.size && input.conversationId && typeof tx?.vendasAutomationJob?.findMany === 'function') {
      const jobs = await tx.vendasAutomationJob.findMany({
        where: { companyId: input.companyId, conversationId: input.conversationId },
        select: { leadId: true },
        take: 20,
      });
      for (const job of jobs || []) {
        const leadId = String(job?.leadId || '').trim();
        if (leadId) leadIds.add(leadId);
      }
    }

    // Telefone e apenas fallback exato e nao ambiguo. Nunca convertemos 55/DDI
    // aqui e nunca cancelamos dois leads porque compartilham/duplicam um numero.
    const candidates = Array.from(new Set([
      normalizeDigits(input.from),
      normalizeDigits(conversation?.contact),
    ].filter(Boolean)));
    if (!leadIds.size && candidates.length && typeof tx?.vendasLead?.findMany === 'function') {
      const leads = await tx.vendasLead.findMany({
        where: { companyId: input.companyId, phoneNormalized: { in: candidates } },
        select: { id: true },
        take: 2,
      });
      const uniqueIds: string[] = Array.from(new Set<string>(
        (leads || []).map((lead: any) => String(lead?.id || '').trim()).filter(Boolean),
      ));
      if (uniqueIds.length === 1) {
        leadIds.add(uniqueIds[0]);
      }
    }
    return { leadIds, conversation, canonicalLeadId: null };
  }

  private outboundMatches(row: CommercialOutboundRow, conversationId: number, leadIds: Set<string>): boolean {
    if (!this.isCommercialWhatsappSource(row.sourceModule)) return false;
    if (isHumanSender(row.message?.senderType)) return false;
    // Resposta imediata da assistente pertence a conversa corrente; nao e um
    // "proximo contato" da automacao e, portanto, nao deve ser interrompida.
    if (isConversationReplyVariables(row.message?.variablesJson)) return false;
    if (conversationId > 0 && Number(row.message?.conversationId || 0) === conversationId) return true;
    const variables = parseRecord(row.message?.variablesJson);
    const leadId = String(variables.leadId || '').trim();
    return Boolean(leadId && leadIds.has(leadId));
  }

  private async writeAuditOnce(tx: any, input: {
    companyId: number;
    event: string;
    message: string;
    inboundMessageId: number;
    metadata: Record<string, unknown>;
    level?: string;
  }): Promise<void> {
    if (typeof tx?.whatsAppAuditLog?.create !== 'function') return;
    const dedupeFragment = `\"inboundMessageId\":${Number(input.inboundMessageId)}`;
    const existing = typeof tx?.whatsAppAuditLog?.findFirst === 'function'
      ? await tx.whatsAppAuditLog.findFirst({
          where: {
            companyId: input.companyId,
            event: input.event,
            metadata: { contains: dedupeFragment },
          },
          select: { id: true },
        })
      : null;
    if (existing?.id) return;
    await tx.whatsAppAuditLog.create({
      data: {
        companyId: input.companyId,
        scope: 'commercial_contact_control',
        event: input.event,
        level: input.level || 'INFO',
        message: input.message,
        metadata: JSON.stringify({ inboundMessageId: input.inboundMessageId, ...input.metadata }),
      },
    });
  }

  async interruptForInbound(input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
    from: string;
    timestamp: Date;
  }): Promise<{
    leadIds: string[];
    canceledJobs: number;
    canceledSendingJobs: number;
    canceledCadencias: number;
    canceledEnrollments: number;
    canceledSteps: number;
    canceledOutbox: number;
    inFlightOutbox: number;
  }> {
    const transactionResult = await this.transaction(async (tx) => {
      const resolved = await this.resolveLeadIds(tx, input);
      const leadIds = resolved.leadIds;

      const outboundRows: CommercialOutboundRow[] = typeof tx?.outboundMessage?.findMany === 'function'
        ? await tx.outboundMessage.findMany({
            where: {
              companyId: input.companyId,
              sourceModule: { in: [...COMMERCIAL_WHATSAPP_SOURCE_MODULES] },
              status: { in: ['PENDING', 'SENDING'] },
            },
            select: {
              id: true,
              status: true,
              sourceModule: true,
              createdAt: true,
              message: { select: { conversationId: true, senderType: true, variablesJson: true } },
            },
            orderBy: { id: 'asc' },
            take: 500,
          })
        : [];
      if (!leadIds.size) {
        for (const row of outboundRows || []) {
          if (Number(row.message?.conversationId || 0) !== input.conversationId) continue;
          if (isConversationReplyVariables(row.message?.variablesJson)) continue;
          const leadId = String(parseRecord(row.message?.variablesJson).leadId || '').trim();
          if (leadId) leadIds.add(leadId);
        }
      }

      const sortedLeadIds = Array.from(leadIds).sort();
      for (const leadId of sortedLeadIds) await this.lockLead(tx, input.companyId, leadId);

      const pendingJobs = sortedLeadIds.length && typeof tx?.vendasAutomationJob?.updateMany === 'function'
        ? await tx.vendasAutomationJob.updateMany({
            where: {
              companyId: input.companyId,
              leadId: { in: sortedLeadIds },
              status: { in: ['pending', 'scheduled'] },
            },
            data: {
              status: 'canceled',
              archivedAt: input.timestamp,
              classification: COMMERCIAL_INBOUND_STOP_REASON,
              errorMessage: COMMERCIAL_INBOUND_STOP_REASON,
            },
          })
        : { count: 0 };

      let canceledSendingJobs = 0;
      if (sortedLeadIds.length && typeof tx?.vendasAutomationJob?.findMany === 'function') {
        const sendingJobs = await tx.vendasAutomationJob.findMany({
          where: { companyId: input.companyId, leadId: { in: sortedLeadIds }, status: 'sending' },
          select: { id: true },
          take: 100,
        });
        for (const job of sendingJobs || []) {
          const queuedMessage = typeof tx?.companyMessage?.findFirst === 'function'
            ? await tx.companyMessage.findFirst({
                where: {
                  companyId: input.companyId,
                  sourceModule: { in: [...COMMERCIAL_WHATSAPP_SOURCE_MODULES] },
                  variablesJson: { contains: `\"jobId\":\"${String(job.id)}\"` },
                },
                select: { id: true, outboundMessageId: true },
              })
            : null;
          const queuedOutbound = queuedMessage?.outboundMessageId
            ? (outboundRows || []).find((row) => Number(row.id) === Number(queuedMessage.outboundMessageId))
            : null;
          const safeToCancel = !queuedMessage?.id || String(queuedOutbound?.status || '') === 'PENDING';
          const canceled = await tx.vendasAutomationJob.updateMany({
            where: { id: job.id, companyId: input.companyId, status: 'sending' },
            data: {
              ...(safeToCancel ? { status: 'canceled', archivedAt: input.timestamp } : {}),
              classification: COMMERCIAL_INBOUND_STOP_REASON,
              errorMessage: COMMERCIAL_INBOUND_STOP_REASON,
              repliedAt: input.timestamp,
            },
          });
          if (safeToCancel) canceledSendingJobs += Number(canceled?.count || 0);
        }
      }

      if (sortedLeadIds.length && typeof tx?.vendasAutomationJob?.updateMany === 'function') {
        await tx.vendasAutomationJob.updateMany({
          where: { companyId: input.companyId, leadId: { in: sortedLeadIds }, status: 'sent' },
          data: { classification: COMMERCIAL_INBOUND_STOP_REASON, repliedAt: input.timestamp },
        });
      }

      const cadencias = sortedLeadIds.length && typeof tx?.cadenciaInscricao?.updateMany === 'function'
        ? await tx.cadenciaInscricao.updateMany({
            where: {
              companyId: input.companyId,
              leadId: { in: sortedLeadIds },
              status: { in: [...ACTIVE_CADENCE_STATUSES] },
            },
            data: {
              status: 'cancelada',
              lastStepAt: input.timestamp,
              lastError: COMMERCIAL_INBOUND_STOP_REASON,
            },
          })
        : { count: 0 };

      const canonicalCancellation = await this.canonical.interruptForInbound(tx, {
        companyId: input.companyId,
        leadIds: sortedLeadIds,
        inboundMessageId: input.inboundMessageId,
        timestamp: input.timestamp,
      });

      const matchingOutbox = (outboundRows || []).filter((row) => this.outboundMatches(row, input.conversationId, leadIds));
      const pendingOutboxIds = matchingOutbox.filter((row) => row.status === 'PENDING').map((row) => row.id);
      const inFlightOutboxIds = matchingOutbox.filter((row) => row.status === 'SENDING').map((row) => row.id);
      let canceledOutbox = 0;
      let canceledConversationIds: number[] = [];
      if (pendingOutboxIds.length && typeof tx?.outboundMessage?.updateMany === 'function') {
        const result = await tx.outboundMessage.updateMany({
          where: { id: { in: pendingOutboxIds }, companyId: input.companyId, status: 'PENDING' },
          data: {
            status: 'CANCELED',
            failedAt: null,
            lastError: COMMERCIAL_INBOUND_STOP_REASON,
            deliveryStatus: 'canceled',
          },
        });
        canceledOutbox = Number(result?.count || 0);
        if (canceledOutbox && typeof tx?.companyMessage?.updateMany === 'function') {
          await tx.companyMessage.updateMany({
            where: { outboundMessageId: { in: pendingOutboxIds }, companyId: input.companyId },
            data: { status: 'CANCELED', error: COMMERCIAL_INBOUND_STOP_REASON },
          });
        }
        if (canceledOutbox && typeof tx?.outboundMessage?.findMany === 'function') {
          const canceledRows = await tx.outboundMessage.findMany({
            where: {
              id: { in: pendingOutboxIds },
              companyId: input.companyId,
              status: 'CANCELED',
            },
            select: { message: { select: { conversationId: true } } },
            take: 500,
          });
          canceledConversationIds = Array.from(new Set<number>(
            (canceledRows || [])
              .map((row: any) => Number(row?.message?.conversationId || 0))
              .filter((conversationId: number) => conversationId > 0),
          ));
        }
      }

      await this.writeAuditOnce(tx, {
        companyId: input.companyId,
        event: 'commercial_contact_interrupted',
        message: 'Próximos contatos comerciais cancelados após mensagem recebida.',
        inboundMessageId: input.inboundMessageId,
        metadata: {
          conversationId: input.conversationId,
          leadIds: sortedLeadIds,
          canceledJobs: Number(pendingJobs?.count || 0),
          canceledSendingJobs,
          canceledCadencias: Number(cadencias?.count || 0),
          canceledEnrollments: canonicalCancellation.canceledEnrollments,
          canceledSteps: canonicalCancellation.canceledSteps,
          canceledOutbox,
          reason: COMMERCIAL_INBOUND_STOP_REASON,
        },
      });
      if (inFlightOutboxIds.length) {
        await this.writeAuditOnce(tx, {
          companyId: input.companyId,
          event: 'commercial_inbound_dispatch_race',
          level: 'WARN',
          message: 'Inbound recebido enquanto envio comercial já estava em processamento.',
          inboundMessageId: input.inboundMessageId,
          metadata: {
            conversationId: input.conversationId,
            outboundMessageIds: inFlightOutboxIds,
            reason: COMMERCIAL_INBOUND_STOP_REASON,
          },
        });
      }

      return {
        leadIds: sortedLeadIds,
        canceledJobs: Number(pendingJobs?.count || 0),
        canceledSendingJobs,
        canceledCadencias: Number(cadencias?.count || 0),
        canceledEnrollments: canonicalCancellation.canceledEnrollments,
        canceledSteps: canonicalCancellation.canceledSteps,
        canceledOutbox,
        inFlightOutbox: inFlightOutboxIds.length,
        canceledConversationIds,
      };
    });

    const { canceledConversationIds, ...result } = transactionResult;
    for (const conversationId of canceledConversationIds) {
      await this.conversations?.dispatchVendasCockpitProjection({
        companyId: input.companyId,
        conversationId,
        event: 'canceled',
      });
    }
    return result;
  }

  async validateBeforeCommercialDispatch(input: {
    companyId: number;
    conversationId: number | null;
    sourceModule?: string | null;
    senderType?: string | null;
    variablesJson?: string | null;
    outboundCreatedAt?: Date | null;
  }): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    if (!this.isCommercialWhatsappSource(input.sourceModule) || isHumanSender(input.senderType)) {
      return { allowed: true };
    }
    const variables = parseRecord(input.variablesJson);
    if (String(variables.purpose || '').trim().toLowerCase() === 'conversation_reply') {
      return { allowed: true };
    }
    const jobId = String(variables.jobId || '').trim();
    const inscricaoId = String(variables.cadenciaInscricaoId || '').trim();

    if (jobId && typeof (this.prisma as any)?.vendasAutomationJob?.findFirst === 'function') {
      const job = await (this.prisma as any).vendasAutomationJob.findFirst({
        where: { id: jobId, companyId: input.companyId },
        select: { status: true, classification: true, errorMessage: true },
      });
      const status = String(job?.status || '');
      const classification = String(job?.classification || '');
      if (classification === COMMERCIAL_INBOUND_STOP_REASON || String(job?.errorMessage || '') === COMMERCIAL_INBOUND_STOP_REASON) {
        return { allowed: false, reason: COMMERCIAL_INBOUND_STOP_REASON };
      }
      if (!job || !['sending', 'sent'].includes(status)) {
        return { allowed: false, reason: 'commercial_automation_inactive' };
      }
    }

    if (inscricaoId && typeof (this.prisma as any)?.cadenciaInscricao?.findFirst === 'function') {
      const enrollment = await (this.prisma as any).cadenciaInscricao.findFirst({
        where: { id: inscricaoId, companyId: input.companyId },
        select: { status: true, lastError: true },
      });
      if (String(enrollment?.lastError || '') === COMMERCIAL_INBOUND_STOP_REASON) {
        return { allowed: false, reason: COMMERCIAL_INBOUND_STOP_REASON };
      }
      // `concluida` pode ser o efeito normal do proprio enqueue do ultimo passo;
      // nao invalida a mensagem que acabou de entrar no outbox. Pausa/cancelamento
      // continuam fail-closed, e inbound_received vence pelo lastError acima.
      if (!enrollment || !['ativa', 'concluida'].includes(String(enrollment.status || ''))) {
        return { allowed: false, reason: 'commercial_automation_inactive' };
      }
    }

    const conversationId = Number(input.conversationId || 0);
    const leadId = String(variables.leadId || '').trim();
    if (
      conversationId > 0 &&
      leadId &&
      input.outboundCreatedAt &&
      typeof (this.prisma as any)?.vendasLeadTimelineEvent?.findFirst === 'function'
    ) {
      // Nunca usa CompanyMessage INBOUND cru: sincronizacao historica, recibo e
      // auto-reply tambem sao inbound. Somente o marcador idempotente publicado
      // apos as supressoes tecnicas confirma resposta humana valida.
      const inboundSignal = await (this.prisma as any).vendasLeadTimelineEvent.findFirst({
        where: {
          leadId,
          eventType: 'inbound_reply',
          sourceType: 'vendas_cockpit_projector',
          resultLabel: 'human_inbound_validated',
          idempotencyKey: { contains: `human-inbound:${conversationId}:` },
          createdAt: { gte: input.outboundCreatedAt },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (inboundSignal?.id) return { allowed: false, reason: COMMERCIAL_INBOUND_STOP_REASON };
    }

    return { allowed: true };
  }
}
