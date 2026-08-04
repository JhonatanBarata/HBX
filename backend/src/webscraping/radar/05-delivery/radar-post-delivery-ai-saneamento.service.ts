import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AI_SANEAMENTO_4B_STAGE,
  isRadarAiSaneamentoEnabled,
  type RadarMissionLeaseDto,
  RadarMissionQueueService,
} from '../missions/radar-mission-queue.service';
import {
  AI_SANEAMENTO_4B_CONTRACT_VERSION,
  AI_SANEAMENTO_4B_MODEL,
  AiSaneamentoService,
} from '../03-enrichment/ai-saneamento.service';

/**
 * Etapa 7 da árvore mestra (02/07, docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md):
 * "IA 7b saneia+ICP" soldada como disparo PÓS-ENTREGA e SÓ-ADITIVO — o card já foi entregue
 * ao vendedor (via `importRadarLeadToVendasForUser`) quando este serviço roda; ele nunca some
 * nem piora o card entregue, só GANHA um campo opcional (`metadataJson.aiSaneamento`).
 *
 * Semântica travada no briefing (resolve a contradição 7↔8 do desenho): nota baixa NÃO afeta
 * cards já entregues — ela só tem poder de bloquear a PROMOÇÃO ao estoque da fábrica (ver
 * `radar-core-delivery.mixin.ts` → `persistRadarLeadPoolBatch`, quarentena pré-estoque).
 *
 * Reusa `AiSaneamentoService.saneiaComNota()` (Ollama local, degrade gracioso já implementado
 * no serviço — NUNCA joga exceção pra cima). Gate: `HBX_RADAR_AI_SANEAMENTO_ENABLED` default
 * OFF (VPS não tem Ollama garantido; o dono liga local pros testes ao vivo). Timeout curto e
 * falha silenciosa: erro aqui NUNCA vira erro no card (regra absoluta de cards do Radar).
 *
 * Sprint 3 do Plano 16072026: a execução usa RadarMission durável no stage exclusivo
 * `ai_saneamento_4b_v1`. O enqueue continua fora do caminho crítico da entrega, mas restart,
 * retry, lease e dead-letter deixam de depender de memória/setTimeout.
 */

export type RadarPostDeliveryAiSaneamentoInput = {
  radarLeadId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  /**
   * CRÉDITO UNIVERSAL (PR11072026): empresa que puxou o lead pra Vendas (`context.companyId` de
   * `importRadarLeadToVendasForUser`) — tenant REAL, já validado por `resolveContext` antes da
   * entrega. Repassado ao gateway como ação `ai_batch`, grátis por padrão.
   */
  companyId?: number | null;
};

export type RadarPostDeliveryAiSaneamentoHost = {
  loadRadarLeadPoolRow: (radarLeadId: string) => Promise<{ id: string; metadataJson?: unknown } | null>;
  updateRadarLeadPoolMetadata: (radarLeadId: string, metadataJson: string) => Promise<void>;
  logger?: { warn?: (message: string) => void };
};

export type RadarAiSaneamentoOutcome = {
  status: 'completed' | 'skipped' | 'partial_error';
  reason?: string;
  nota?: number | null;
  execution?: {
    model: typeof AI_SANEAMENTO_4B_MODEL;
    contractVersion: typeof AI_SANEAMENTO_4B_CONTRACT_VERSION;
    promptVersion: 1;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    attempt: number;
  };
};

function envEnabled(name: string): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function compact(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function radarAiSaneamentoCanaryLeadIds(): string[] | null {
  if (process.env.HBX_RADAR_AI_SANEAMENTO_CANARY_LEAD_IDS === undefined) return null;
  return Array.from(new Set(
    String(process.env.HBX_RADAR_AI_SANEAMENTO_CANARY_LEAD_IDS)
      .split(',')
      .map((value) => compact(value))
      .filter(Boolean),
  ));
}

export function isRadarAiSaneamentoCanaryAllowed(radarLeadId: unknown): boolean {
  const allowlist = radarAiSaneamentoCanaryLeadIds();
  return allowlist === null || allowlist.includes(compact(radarLeadId));
}

@Injectable()
export class RadarPostDeliveryAiSaneamentoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarPostDeliveryAiSaneamentoService.name);
  private workerTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private tickActive = false;
  private lastReconcileAt = 0;
  private readonly workerId = `vps-ai-saneamento-4b:${process.pid}`;

  constructor(
    @Optional() private readonly aiSaneamento?: AiSaneamentoService,
    @Optional() private readonly missionQueue?: RadarMissionQueueService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    const everyMs = Math.min(
      Math.max(Number(process.env.HBX_RADAR_AI_SANEAMENTO_POLL_INTERVAL_MS) || 15_000, 5_000),
      5 * 60_000,
    );
    this.workerTimer = setInterval(() => {
      if (!isRadarAiSaneamentoEnabled()) return;
      void this.tickDurableWorker().catch((error: any) => {
        this.logger.warn(`[radar-ai-saneamento] worker durável falhou: ${String(error?.message || error)}`);
      });
    }, everyMs);
    this.workerTimer.unref?.();
    if (isRadarAiSaneamentoEnabled()) {
      void this.tickDurableWorker(true).catch(() => null);
    }
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = null;
  }

  private getAiSaneamento() {
    return this.aiSaneamento || new AiSaneamentoService();
  }

  isEnabled(): boolean {
    return envEnabled('HBX_RADAR_AI_SANEAMENTO_ENABLED');
  }

  /**
   * Materializa o saneamento pós-entrega SEM bloquear o caller (a entrega já respondeu ao vendedor).
   * No-op silencioso se a flag estiver OFF. Dedupe durável impede repetição. Nunca lança.
   */
  enqueue(input: RadarPostDeliveryAiSaneamentoInput, _host: RadarPostDeliveryAiSaneamentoHost) {
    if (!this.isEnabled()) return;
    const radarLeadId = compact(input?.radarLeadId);
    const name = compact(input?.name);
    if (!radarLeadId || !name || !this.missionQueue || !isRadarAiSaneamentoCanaryAllowed(radarLeadId)) return;
    // Não aguarda a escrita curta: entrega já concluiu. Restart entre persistência e enqueue é
    // coberto por reconcileDurableJobs(), portanto nenhum trabalho depende de memória/setTimeout.
    void this.missionQueue.enqueueAiSaneamento4b({
      radarLeadId,
      name,
      city: input.city || null,
      state: input.state || null,
      segment: input.segment || null,
      companyId: input.companyId ?? null,
      priority: 100,
    }).catch((error: any) => {
      this.logger.warn(`[radar-ai-saneamento] enqueue durável falhou lead=${radarLeadId}: ${String(error?.message || error)}`);
    });
  }

  async drain() {
    if (this.active || !isRadarAiSaneamentoEnabled() || !this.missionQueue || !this.prisma) return;
    this.active = true;
    try {
      while (true) {
        const leased = await this.missionQueue.lease({
          workerId: this.workerId,
          stages: [AI_SANEAMENTO_4B_STAGE],
          batchSize: 1,
        });
        const mission = leased.missions[0];
        if (!mission) break;
        await this.processDurableMission(mission);
      }
    } finally {
      this.active = false;
    }
  }

  private async tickDurableWorker(forceReconcile = false) {
    if (this.tickActive) return;
    this.tickActive = true;
    const reconcileEveryMs = Math.min(
      Math.max(Number(process.env.HBX_RADAR_AI_SANEAMENTO_RECONCILE_INTERVAL_MS) || 120_000, 30_000),
      30 * 60_000,
    );
    try {
      if (forceReconcile || Date.now() - this.lastReconcileAt >= reconcileEveryMs) {
        this.lastReconcileAt = Date.now();
        await this.reconcileDurableJobs();
      }
      await this.drain();
    } finally {
      this.tickActive = false;
    }
  }

  private async processDurableMission(mission: RadarMissionLeaseDto) {
    if (!this.missionQueue || !this.prisma) return;
    const payload = (mission.payload || {}) as Record<string, any>;
    if (payload.model !== AI_SANEAMENTO_4B_MODEL || Number(payload.promptVersion) !== 1) {
      await this.missionQueue.fail(
        mission.id,
        mission.leaseId,
        `contrato 4B incompatível: model=${String(payload.model || '-')} promptVersion=${String(payload.promptVersion || '-')}`,
        false,
      );
      return;
    }
    const firstHeartbeat = await this.missionQueue.heartbeat(mission.id, mission.leaseId);
    if (!firstHeartbeat.ok) return;
    const heartbeatEveryMs = Math.max(5_000, Number(mission.heartbeatSeconds || 10) * 1_000);
    const heartbeatTimer = setInterval(() => {
      void this.missionQueue?.heartbeat(mission.id, mission.leaseId).catch(() => ({ ok: false }));
    }, heartbeatEveryMs);
    heartbeatTimer.unref?.();
    const prisma = this.prisma as any;
    try {
      const outcome = await this.runOne({
        radarLeadId: String(payload.radarLeadId || ''),
        name: String(payload.name || ''),
        city: payload.city || null,
        state: payload.state || null,
        segment: payload.segment || null,
        companyId: payload.companyId ?? null,
      }, {
        loadRadarLeadPoolRow: (id: string) => prisma.radarLeadPool.findFirst({
          where: this.buildAiSaneamentoTenantWhere(id, payload.companyId),
          select: { id: true, metadataJson: true },
        }).catch(() => null),
        updateRadarLeadPoolMetadata: async (id: string, metadataJson: string) => {
          await this.persistAiSaneamentoMetadataCas({
            radarLeadId: id,
            companyId: payload.companyId,
            desiredMetadataJson: metadataJson,
          });
        },
        logger: this.logger,
      }, mission.attempts);
      const durableResult = {
        outcome: outcome.status === 'completed' ? 'completed' : outcome.status === 'skipped' ? 'no_result' : 'failed',
        reason: outcome.reason || null,
        nota: outcome.nota ?? null,
        model: AI_SANEAMENTO_4B_MODEL,
        contractVersion: AI_SANEAMENTO_4B_CONTRACT_VERSION,
        promptVersion: 1,
        execution: outcome.execution || null,
      };
      if (outcome.status === 'partial_error') {
        await this.missionQueue.fail(
          mission.id,
          mission.leaseId,
          `${outcome.reason || 'ia_indisponivel_ou_degradada'}; model=${AI_SANEAMENTO_4B_MODEL}; attempt=${mission.attempts}`,
          true,
        );
      } else {
        await this.missionQueue.complete(mission.id, mission.leaseId, durableResult);
      }
    } catch (error: any) {
      await this.missionQueue.fail(
        mission.id,
        mission.leaseId,
        `worker_4b: ${String(error?.message || error).slice(0, 400)}`,
        true,
      );
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * O 4B só pode tocar o pool global sem tenant ou um card ligado explicitamente à empresa da
   * missão. O vínculo por RadarLeadCompanyState também cobre cards compartilhados de forma
   * legítima; nenhum identificador de Vendas, telefone ou sourceHistoryId participa da resolução.
   */
  private buildAiSaneamentoTenantWhere(radarLeadId: string, rawCompanyId?: unknown) {
    const companyId = Math.trunc(Number(rawCompanyId) || 0) || null;
    return {
      id: radarLeadId,
      ...(companyId
        ? {
            OR: [
              { ownerCompanyId: companyId },
              { companyStates: { some: { companyId } } },
            ],
          }
        : {}),
    };
  }

  /**
   * Merge de metadata do 4B com compare-and-swap. Uma releitura seguida de UPDATE simples ainda
   * permite que o commit local grave `localDeepEnrich` entre as duas operações e seja apagado pelo
   * snapshot antigo. O CAS compara o metadataJson exato e recompõe somente `aiSaneamento` após
   * qualquer corrida; os demais blocos sempre vêm da leitura vencedora mais recente.
   */
  private async persistAiSaneamentoMetadataCas(input: {
    radarLeadId: string;
    companyId?: unknown;
    desiredMetadataJson: string;
  }) {
    if (!this.prisma) throw new Error('radar_ai_saneamento_prisma_indisponivel');
    const prisma = this.prisma as any;
    const desired = parseMaybeJsonObject(input.desiredMetadataJson);
    if (!desired.aiSaneamento || typeof desired.aiSaneamento !== 'object' || Array.isArray(desired.aiSaneamento)) {
      throw new Error('radar_ai_saneamento_metadata_invalido');
    }
    const tenantWhere = this.buildAiSaneamentoTenantWhere(input.radarLeadId, input.companyId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // tenant-scope-allow: escopo deliberado do 4B em buildAiSaneamentoTenantWhere (pool global sem dono OU card da empresa da missão).
      const latest = await prisma.radarLeadPool.findFirst({
        where: tenantWhere,
        select: { metadataJson: true },
      });
      if (!latest) throw new Error('radar_ai_saneamento_tenant_ou_card_invalido');

      const current = parseMaybeJsonObject(latest.metadataJson);
      // Outro worker 4B venceu a mesma missão enquanto este inferia. Preserva o primeiro resultado
      // materializado e trata a repetição como convergida, sem apagar qualquer bloco irmão.
      if (current?.aiSaneamento?.saneadoAt) return;
      const nextMetadataJson = JSON.stringify({
        ...current,
        aiSaneamento: desired.aiSaneamento,
      });
      // tenant-scope-allow: CAS sobre o mesmo tenantWhere deliberado do 4B (pool global sem dono OU card da empresa da missão).
      const updated = await prisma.radarLeadPool.updateMany({
        where: {
          ...tenantWhere,
          metadataJson: latest.metadataJson ?? null,
        },
        data: { metadataJson: nextMetadataJson },
      });
      if (Number(updated?.count || 0) > 0) return;
    }

    throw new Error('radar_ai_saneamento_metadata_em_contencao');
  }

  async reconcileDurableJobs(): Promise<{ scanned: number; enqueued: number }> {
    if (!isRadarAiSaneamentoEnabled() || !this.missionQueue || !this.prisma) return { scanned: 0, enqueued: 0 };
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return { scanned: 0, enqueued: 0 };
    const prisma = this.prisma as any;
    const lookbackHours = Math.min(
      Math.max(Number(process.env.HBX_RADAR_AI_SANEAMENTO_RECONCILE_LOOKBACK_HOURS) || 168, 1),
      24 * 30,
    );
    const batchSize = Math.min(
      Math.max(Number(process.env.HBX_RADAR_AI_SANEAMENTO_RECONCILE_BATCH_SIZE) || 500, 1),
      2_000,
    );
    const canaryLeadIds = radarAiSaneamentoCanaryLeadIds();
    const cursorKey = 'ai_saneamento_4b_reconciler_v1';
    const cursorDelegate = prisma.radarFactoryCursor;
    const cursor = cursorDelegate?.upsert
      ? await cursorDelegate.upsert({
          where: { key: cursorKey },
          create: { key: cursorKey, status: 'idle' },
          update: {},
          select: { lastRunId: true },
        }).catch(() => null)
      : null;
    const lastLeadId = canaryLeadIds !== null ? null : compact(cursor?.lastRunId) || null;
    const updatedAt = { gte: new Date(Date.now() - lookbackHours * 60 * 60_000) };
    // tenant-scope-allow: reconciler global do 4B varre o pool inteiro; cada missão preserva o ownerCompanyId do card.
    const readBatch = (afterId?: string | null) => prisma.radarLeadPool.findMany({
      where: {
        status: 'sent_to_vendas',
        ...(canaryLeadIds !== null ? { id: { in: canaryLeadIds } } : { updatedAt }),
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        segment: true,
        ownerCompanyId: true,
        metadataJson: true,
      },
    }).catch(() => []);
    let rows = await readBatch(lastLeadId);
    if (!rows.length && lastLeadId) rows = await readBatch(null);
    let enqueued = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (parseMaybeJsonObject(row?.metadataJson)?.aiSaneamento?.saneadoAt) continue;
      const queued = await this.missionQueue.enqueueAiSaneamento4b({
        radarLeadId: row?.id,
        name: row?.name,
        city: row?.city,
        state: row?.state,
        segment: row?.segment,
        companyId: row?.ownerCompanyId || null,
        priority: 100,
      });
      if (queued.created) enqueued += 1;
    }
    const lastScannedId = compact(rows[rows.length - 1]?.id) || null;
    if (lastScannedId && cursorDelegate?.update) {
      await cursorDelegate.update({
        where: { key: cursorKey },
        data: { lastRunId: lastScannedId, lastWorkedAt: new Date(), status: 'idle' },
      }).catch(() => null);
    }
    return { scanned: Array.isArray(rows) ? rows.length : 0, enqueued };
  }

  /**
   * Executa o saneamento para 1 lead e persiste o resultado — chamável direto (sem fila) por
   * quem já está fora do caminho síncrono de entrega (ex.: reprocessamento em lote).
   */
  async runOne(
    input: RadarPostDeliveryAiSaneamentoInput,
    host: RadarPostDeliveryAiSaneamentoHost,
    attempt = 1,
  ): Promise<RadarAiSaneamentoOutcome> {
    if (!this.isEnabled()) return { status: 'skipped', reason: 'disabled' };
    const radarLeadId = compact(input?.radarLeadId);
    const name = compact(input?.name);
    if (!radarLeadId || !name) return { status: 'skipped', reason: 'dados_insuficientes' };

    const startedAtDate = new Date();
    const finishExecution = () => {
      const finishedAtDate = new Date();
      return {
        model: AI_SANEAMENTO_4B_MODEL,
        contractVersion: AI_SANEAMENTO_4B_CONTRACT_VERSION,
        promptVersion: 1 as const,
        startedAt: startedAtDate.toISOString(),
        finishedAt: finishedAtDate.toISOString(),
        durationMs: Math.max(0, finishedAtDate.getTime() - startedAtDate.getTime()),
        attempt: Math.max(1, Math.trunc(Number(attempt) || 1)),
      };
    };

    const row = await host.loadRadarLeadPoolRow(radarLeadId).catch(() => null);
    if (!row) return { status: 'skipped', reason: 'card_nao_encontrado', execution: finishExecution() };

    const meta = parseMaybeJsonObject(row.metadataJson);
    // Idempotente: card já saneado não repete a chamada (mesmo padrão do worker manual/batch
    // `aiSaneamentoForMaster` — `aiSaneadoAt` marca "já processado", sem cursor dedicado).
    if (meta?.aiSaneamento?.saneadoAt) return { status: 'skipped', reason: 'ja_saneado', execution: finishExecution() };

    const result = await this.getAiSaneamento().saneiaComNota({
      name,
      city: input.city || null,
      state: input.state || null,
      segmentHint: input.segment || null,
      companyId: input.companyId ?? null,
    });

    if (!result.ok) return { status: 'partial_error', reason: 'ia_indisponivel_ou_degradada', execution: finishExecution() };

    const execution = finishExecution();

    // ADITIVO estrito: só grava em metadataJson.aiSaneamento, NUNCA sobrescreve `name`/`segment`
    // do RadarLeadPool nem qualquer campo já lido pelo card do vendedor (regra absoluta de
    // cards: campo novo é sempre opcional; card entregue nunca some/piora).
    const nextMeta = {
      ...meta,
      aiSaneamento: {
        nomeLimpo: result.nomeLimpo,
        segmento: result.segmento,
        nota: result.nota,
        razao: result.razao,
        saneadoAt: Date.now(),
        model: execution.model,
        contractVersion: execution.contractVersion,
        promptVersion: execution.promptVersion,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        durationMs: execution.durationMs,
        attempt: execution.attempt,
      },
    };
    await host.updateRadarLeadPoolMetadata(radarLeadId, JSON.stringify(nextMeta));
    return { status: 'completed', nota: result.nota, execution };
  }
}
