import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── SPRINT 4 MOTOR-RFB-FILA (02/07) — fila de missões real ─────────────────────────────────────
// Substitui o controle por loops (factoryPump/cursor/lock) por fila com: retry+backoff, lease com
// TTL/heartbeat, dead-letter e pausa que pausa. Formato da PONTE: a fila mora na VPS e o nó LOCAL
// PUXA missão por HTTP (pull, nunca push) — ver RadarMissionsController (/modules/owner/missions).
// A família de bugs caros (pump moendo cidade esgotada, lease órfão → deadlock todos-busy, Parar que
// não para, demanda falsa religando motor) era toda sintoma da fila improvisada.

// `enrich_lead` permanece legado da fábrica até o cutover autorizado. O worker residencial novo
// recebe exclusivamente `local_deep_enrich_v1`; o saneamento rápido do VPS usa
// `ai_saneamento_4b_v1`. Os três contratos não disputam consumidor.
export const LOCAL_DEEP_ENRICH_CONTRACT_VERSION = 'local_deep_enrich_v1' as const;
export const LOCAL_DEEP_ENRICH_PROMPT_VERSION = 'local_deep_enrich_30b_prompt_v1' as const;
export const LOCAL_DEEP_ENRICH_STAGE = LOCAL_DEEP_ENRICH_CONTRACT_VERSION;
export const AI_SANEAMENTO_4B_STAGE = 'ai_saneamento_4b_v1' as const;
export const RADAR_MISSION_STAGES = [
  'alvo',
  'receita',
  'base_rica',
  'cerebro',
  'validacao_zap',
  'card',
  'enrich_lead',
  'enrich_search_item',
  AI_SANEAMENTO_4B_STAGE,
  LOCAL_DEEP_ENRICH_STAGE,
] as const;
export type RadarMissionStage = (typeof RADAR_MISSION_STAGES)[number];

/** Contrato público do Owner: o worker residencial nunca recebe stages internos/legados do VPS. */
export const PONTE_MISSION_STAGES: readonly RadarMissionStage[] = [LOCAL_DEEP_ENRICH_STAGE];

/** Consumidores do VPS também trabalham somente com allowlist explícita. */
export const VPS_MISSION_STAGES: readonly RadarMissionStage[] = ['enrich_search_item', AI_SANEAMENTO_4B_STAGE];

export const RADAR_MISSION_PAYLOAD_VERSION = 1;

export type RadarMissionLeaseDto = {
  id: string;
  stage: RadarMissionStage;
  payloadVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  leaseId: string;
  leaseExpiresAt: string;
  heartbeatSeconds: number;
};

export type RadarMissionActivitySnapshot = {
  /** usuários com sessão vista nos últimos N minutos (sinal de "gente ativa" pro freio elástico) */
  activeUsers: number;
  /** janela usada (min) — o worker decide o freio, o backend só informa o número honesto */
  windowMinutes: number;
};

export type RadarMissionLeaseResult = {
  supported: boolean;
  paused: boolean;
  missions: RadarMissionLeaseDto[];
  /** sinal elástico: nº de usuários ativos + lag da fila viajam junto do lease (worker freia, não o backend) */
  activity?: RadarMissionActivitySnapshot;
  lag?: RadarMissionQueueLag;
};

export type RadarMissionQueueLag = {
  queuedDue: number;
  oldestQueuedAgeMs: number;
};

export type LocalDeepEnrichmentEnqueueInput = {
  radarLeadId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  sourceUrl?: string | null;
  identityKey?: string | null;
  companyId?: number | null;
  requestedByUserId?: number | null;
  runId?: string | null;
  correlationId?: string | null;
  priority?: number | null;
  priorityReason?: 'new_lead' | 'reconciled' | 'delivered';
};

export type AiSaneamento4bEnqueueInput = {
  radarLeadId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  companyId?: number | null;
  correlationId?: string | null;
  priority?: number | null;
};

export const LOCAL_DEEP_ENRICH_CONSUMER_KIND = 'owner_local' as const;
export const AI_SANEAMENTO_4B_CONSUMER_KIND = 'vps' as const;
const LOCAL_DEEP_ENRICH_EXCLUDED_STATUSES = new Set([
  'denied',
  'complaint',
  'duplicate',
  'hidden',
  'invalidated',
  'negative',
  'no_answer',
  'blocked',
  'discarded',
  'do_not_contact',
  'rejected',
]);

export function isMissionQueueEnabled(env: NodeJS.ProcessEnv = process.env) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.HBX_MISSION_QUEUE_ENABLED || '').trim().toLowerCase());
}

export function isLocalDeepEnrichmentQueueEnabled(env: NodeJS.ProcessEnv = process.env) {
  return isMissionQueueEnabled(env)
    && ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED || '').trim().toLowerCase());
}

export function isRadarAiSaneamentoEnabled(env: NodeJS.ProcessEnv = process.env) {
  return isMissionQueueEnabled(env)
    && ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.HBX_RADAR_AI_SANEAMENTO_ENABLED || '').trim().toLowerCase());
}

function compactMissionText(value: unknown, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * `null` significa rollout amplo. Set vazio significa gate explicitamente definido sem nenhum lead
 * autorizado (fail-closed). IDs permanecem opacos: o serviço só compara/hash e nunca os registra.
 */
export function resolveLocalDeepEnrichmentCanaryLeadIds(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> | null {
  if (env.HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS === undefined) return null;
  return new Set(
    String(env.HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS || '')
      .split(',')
      .map((value) => compactMissionText(value, 200))
      .filter(Boolean),
  );
}

export function isLocalDeepEnrichmentCanaryLeadAllowed(
  radarLeadId: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  const allowedIds = resolveLocalDeepEnrichmentCanaryLeadIds(env);
  return allowedIds === null || allowedIds.has(compactMissionText(radarLeadId, 200));
}

function normalizedWorkValue(value: unknown) {
  return compactMissionText(value, 2_000).toLocaleLowerCase('pt-BR').replace(/\/+$/, '');
}

export function buildLocalDeepEnrichmentWorkIdentity(
  input: LocalDeepEnrichmentEnqueueInput,
  versions: { contractVersion?: string; promptVersion?: string } = {},
) {
  const radarLeadId = compactMissionText(input.radarLeadId, 200);
  const contractVersion = compactMissionText(versions.contractVersion, 120) || LOCAL_DEEP_ENRICH_CONTRACT_VERSION;
  const promptVersion = compactMissionText(versions.promptVersion, 120) || LOCAL_DEEP_ENRICH_PROMPT_VERSION;
  const material = [
    `contract:${contractVersion}`,
    `prompt:${promptVersion}`,
    normalizedWorkValue(input.identityKey),
    normalizedWorkValue(input.name),
    normalizedWorkValue(input.website),
    normalizedWorkValue(input.sourceUrl),
    normalizedWorkValue(input.city),
    normalizedWorkValue(input.state),
  ].join('\n');
  const workHash = createHash('sha256').update(material).digest('hex');
  const workVersion = (Number.parseInt(workHash.slice(0, 8), 16) & 0x7fffffff) || 1;
  return {
    radarLeadId,
    workHash,
    workVersion,
    dedupeKey: `radar:${radarLeadId}:work:${workVersion}`,
    contractVersion,
    promptVersion,
  };
}

export const LOCAL_DEEP_ENRICH_RECONCILER_CURSOR_VERSION = 2 as const;
export type LocalDeepEnrichmentReconcilerCursor = {
  version: typeof LOCAL_DEEP_ENRICH_RECONCILER_CURSOR_VERSION;
  phase: 'backfill' | 'incremental';
  afterId: string | null;
  watermarkAt: string;
};

export function initialLocalDeepEnrichmentReconcilerCursor(now = new Date()): LocalDeepEnrichmentReconcilerCursor {
  return {
    version: LOCAL_DEEP_ENRICH_RECONCILER_CURSOR_VERSION,
    phase: 'backfill',
    afterId: null,
    // O incremental volta até o início do backfill para capturar alterações concorrentes.
    watermarkAt: now.toISOString(),
  };
}

export function parseLocalDeepEnrichmentReconcilerCursor(
  value: unknown,
  now = new Date(),
): LocalDeepEnrichmentReconcilerCursor {
  try {
    const parsed = JSON.parse(String(value || ''));
    const watermarkMs = Date.parse(String(parsed?.watermarkAt || ''));
    if (
      Number(parsed?.version) === LOCAL_DEEP_ENRICH_RECONCILER_CURSOR_VERSION
      && ['backfill', 'incremental'].includes(String(parsed?.phase || ''))
      && Number.isFinite(watermarkMs)
    ) {
      return {
        version: LOCAL_DEEP_ENRICH_RECONCILER_CURSOR_VERSION,
        phase: parsed.phase,
        afterId: compactMissionText(parsed.afterId, 200) || null,
        watermarkAt: new Date(watermarkMs).toISOString(),
      };
    }
  } catch {
    // Cursor ausente/legado/corrompido reinicia o backfill completo; nunca pula leads.
  }
  return initialLocalDeepEnrichmentReconcilerCursor(now);
}

export function encodeLocalDeepEnrichmentReconcilerCursor(cursor: LocalDeepEnrichmentReconcilerCursor) {
  return JSON.stringify(cursor);
}

function buildLocalDeepEnrichmentReconcilerCursorKey(canaryLeadIds: ReadonlySet<string> | null) {
  if (canaryLeadIds === null) return 'local_deep_enrich_reconciler_v2';
  const scopeHash = createHash('sha256')
    .update([...canaryLeadIds].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
  return `local_deep_enrich_reconciler_v2_canary_${scopeHash}`;
}

export function resolveMissionLeaseTtlMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(String(env.HBX_MISSION_LEASE_TTL_SECONDS ?? '').trim(), 10);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
  return Math.min(Math.max(seconds, 30), 900) * 1000;
}

export function resolveMissionMaxAttempts(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(String(env.HBX_MISSION_MAX_ATTEMPTS ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 3;
}

/**
 * Janela (min) do sinal de "usuário ativo" que o freio elástico da PONTE respeita. Alinhada ao
 * onlineCutoff das sessões ativas (ActiveSessionsService = 5min): sessão vista há ≤5min = gente
 * mexendo agora → o worker cede a vez. Configurável, capado em [1, 60].
 */
export function resolveMissionActivityWindowMinutes(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(String(env.HBX_PONTE_ACTIVITY_WINDOW_MINUTES ?? '').trim(), 10);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  return Math.min(Math.max(minutes, 1), 60);
}

/** Backoff exponencial com teto: 30s · 2^(attempts-1), cap 15min. attempts=1 → 30s; 2 → 60s; 3 → 120s… */
export function computeMissionBackoffMs(attempts: number, baseMs = 30_000, capMs = 15 * 60_000) {
  const n = Math.max(1, Math.trunc(Number(attempts) || 1));
  const exp = baseMs * Math.pow(2, n - 1);
  return Math.min(Math.max(baseMs, exp), capMs);
}

/**
 * Escala da frota pelo LAG REAL da fila (profundidade × idade) em vez de "demanda" sintética.
 * fila vazia → 0 (frota fica no warm; mata a "demanda falsa religando motor");
 * fila com item devido → min(profundidade, teto permitido);
 * item mais velho ≥ ageFullPressureMs (default 10min) → pressão total = teto permitido.
 * O teto por fonte/proteções (allowedEngines, sprint 3) vale ACIMA de qualquer escala — nunca é excedido.
 */
export function computeMissionLagEngineTarget(input: {
  queuedDue: number;
  oldestQueuedAgeMs: number;
  allowedEngines: number;
  ageFullPressureMs?: number;
}) {
  const allowed = Math.max(0, Math.trunc(Number(input.allowedEngines) || 0));
  const queuedDue = Math.max(0, Math.trunc(Number(input.queuedDue) || 0));
  if (allowed <= 0 || queuedDue <= 0) return 0;
  const ageFullPressureMs = Math.max(60_000, Math.trunc(Number(input.ageFullPressureMs || 10 * 60_000)));
  if (Math.max(0, Number(input.oldestQueuedAgeMs) || 0) >= ageFullPressureMs) return allowed;
  return Math.min(allowed, Math.max(1, queuedDue));
}

type EnqueueInput = {
  stage: RadarMissionStage;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
  correlationId?: string | null;
  maxAttempts?: number | null;
  priority?: number | null;
  companyId?: number | null;
  radarLeadId?: string | null;
  requestedByUserId?: number | null;
  runId?: string | null;
  workVersion?: number | null;
  consumerKind?: string | null;
  /** Legado rearma terminal; contratos versionados novos mantêm terminal imutável. */
  rearmTerminal?: boolean;
};

@Injectable()
export class RadarMissionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarMissionQueueService.name);
  private supportsCache: { at: number; value: boolean } | null = null;
  private sweeperTimer: ReturnType<typeof setInterval> | null = null;
  private reconcilerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Sweeper de lease vencido: mesmo sem ninguém dar lease (nó local desligado), missão presa em
    // 'leased' volta pra fila sozinha em ~TTL. kill -9 com N missões no ar → tudo re-enfileirado ~2min.
    this.sweeperTimer = setInterval(() => {
      if (!isMissionQueueEnabled()) return;
      void this.reviveExpiredLeases().catch(() => 0);
    }, 60_000);
    this.sweeperTimer.unref?.();

    const reconcileEveryMs = Math.min(
      Math.max(Number(process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_INTERVAL_MS) || 120_000, 30_000),
      30 * 60_000,
    );
    this.reconcilerTimer = setInterval(() => {
      if (!isLocalDeepEnrichmentQueueEnabled()) return;
      void this.reconcileLocalDeepEnrichmentMissions().catch((error: any) => {
        this.logger.warn(`[local-deep-enrich] reconciliador falhou sem afetar Radar: ${String(error?.message || error)}`);
      });
    }, reconcileEveryMs);
    this.reconcilerTimer.unref?.();
    if (isLocalDeepEnrichmentQueueEnabled()) {
      void this.reconcileLocalDeepEnrichmentMissions().catch(() => ({ scanned: 0, enqueued: 0 }));
    }
  }

  onModuleDestroy() {
    if (this.sweeperTimer) clearInterval(this.sweeperTimer);
    this.sweeperTimer = null;
    if (this.reconcilerTimer) clearInterval(this.reconcilerTimer);
    this.reconcilerTimer = null;
  }

  enabled() {
    return isMissionQueueEnabled();
  }

  async supportsMissionPersistence(): Promise<boolean> {
    const now = Date.now();
    if (this.supportsCache && now - this.supportsCache.at < 60_000) return this.supportsCache.value;
    const value = await this.prisma.hasTable('RadarMission').catch(() => false);
    this.supportsCache = { at: now, value };
    return value;
  }

  /**
   * A pausa do RadarFactoryCursor pertence à fábrica/background. O enriquecimento pós-save de uma
   * pesquisa manual (`enrich_search_item`) tem ciclo próprio no backend e não pode herdar esse freio.
   * Sem filtro de estágio, preserva o comportamento fail-closed usado pela fábrica e pelo painel.
   */
  async isQueuePaused(stages?: RadarMissionStage[] | null): Promise<boolean> {
    const requestedStages = (stages || []).filter((stage) =>
      (RADAR_MISSION_STAGES as readonly string[]).includes(stage),
    );
    const independentStages: readonly RadarMissionStage[] = [
      'enrich_search_item',
      AI_SANEAMENTO_4B_STAGE,
      LOCAL_DEEP_ENRICH_STAGE,
    ];
    if (requestedStages.length > 0 && requestedStages.every((stage) => independentStages.includes(stage))) {
      return false;
    }
    const hasCursor = await this.prisma.hasTable('RadarFactoryCursor').catch(() => false);
    if (!hasCursor) return true;
    const cursorDelegate = this.prisma.radarFactoryCursor;
    if (!cursorDelegate?.upsert) return true;
    const cursor = await cursorDelegate
      .upsert({
        where: { key: 'main' },
        create: { key: 'main' },
        update: {},
        select: { enabled: true },
      })
      .catch(() => null);
    return !cursor || cursor.enabled !== true;
  }

  /** Emissão idempotente. Contratos novos passam `rearmTerminal:false`; retry nunca cria outra missão. */
  async enqueue(input: EnqueueInput): Promise<{ created: boolean; missionId: string | null }> {
    if (!(await this.supportsMissionPersistence())) return { created: false, missionId: null };
    const db = this.prisma as any;
    const now = new Date();
    const data = {
      stage: input.stage,
      status: 'queued',
      priority: Math.trunc(Number(input.priority) || 0),
      payloadVersion: RADAR_MISSION_PAYLOAD_VERSION,
      payloadJson: input.payload as any,
      dedupeKey: input.dedupeKey || null,
      correlationId: input.correlationId || null,
      attempts: 0,
      maxAttempts: Math.max(1, Math.trunc(Number(input.maxAttempts) || resolveMissionMaxAttempts())),
      nextAttemptAt: now,
      leaseId: null,
      leasedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      lastError: null,
      resultJson: null,
      completedAt: null,
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.radarLeadId !== undefined ? { radarLeadId: input.radarLeadId } : {}),
      ...(input.requestedByUserId !== undefined ? { requestedByUserId: input.requestedByUserId } : {}),
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.workVersion !== undefined ? { workVersion: input.workVersion } : {}),
      ...(input.consumerKind !== undefined ? { consumerKind: input.consumerKind } : {}),
    };
    if (input.dedupeKey) {
      const existing = await db.radarMission.findUnique({
        where: { stage_dedupeKey: { stage: input.stage, dedupeKey: input.dedupeKey } },
        select: { id: true, status: true, priority: true },
      }).catch(() => null);
      if (existing) {
        if (['queued', 'leased'].includes(String(existing.status))) {
          if (String(existing.status) === 'queued' && Math.trunc(Number(input.priority) || 0) >= Number(existing.priority || 0)) {
            await db.radarMission.updateMany({
              where: { id: existing.id, status: 'queued' },
              data: {
                priority: Math.trunc(Number(input.priority) || 0),
                payloadJson: input.payload as any,
                correlationId: input.correlationId || null,
                ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
                ...(input.requestedByUserId !== undefined ? { requestedByUserId: input.requestedByUserId } : {}),
                ...(input.runId !== undefined ? { runId: input.runId } : {}),
              },
            }).catch(() => ({ count: 0 }));
          }
          return { created: false, missionId: existing.id };
        }
        if (input.rearmTerminal === false) return { created: false, missionId: existing.id };
        await db.radarMission.update({ where: { id: existing.id }, data }).catch(() => null);
        return { created: true, missionId: existing.id };
      }
    }
    try {
      const created = await db.radarMission.create({ data });
      return { created: true, missionId: created.id };
    } catch (error) {
      // corrida no unique (stage, dedupeKey) → outro emissor ganhou; devolve o existente.
      if (input.dedupeKey) {
        const existing = await db.radarMission.findUnique({
          where: { stage_dedupeKey: { stage: input.stage, dedupeKey: input.dedupeKey } },
          select: { id: true },
        }).catch(() => null);
        if (existing) return { created: false, missionId: existing.id };
      }
      throw error;
    }
  }

  async enqueueLocalDeepEnrichment(input: LocalDeepEnrichmentEnqueueInput): Promise<{ created: boolean; missionId: string | null }> {
    if (!isLocalDeepEnrichmentQueueEnabled()) return { created: false, missionId: null };
    const identity = buildLocalDeepEnrichmentWorkIdentity(input);
    const name = compactMissionText(input.name, 300);
    if (!identity.radarLeadId || !name) return { created: false, missionId: null };
    if (!isLocalDeepEnrichmentCanaryLeadAllowed(identity.radarLeadId)) {
      return { created: false, missionId: null };
    }
    // Decisão visual/produto aprovada: invalidado é terminal e não volta para pesquisa nem com
    // novo workVersion. Uma correção futura exige ação contratual explícita, não redrive genérico.
    const db = (this.prisma as any).radarMission;
    const [invalidated, canceled] = await Promise.all([
      db.findFirst({
        where: {
          stage: LOCAL_DEEP_ENRICH_STAGE,
          radarLeadId: identity.radarLeadId,
          status: 'dead',
          lastPhase: 'invalidated',
        },
        select: { id: true },
      }).catch(() => null),
      db.findFirst({
        where: {
          stage: LOCAL_DEEP_ENRICH_STAGE,
          radarLeadId: identity.radarLeadId,
          status: 'canceled',
        },
        select: { id: true },
      }).catch(() => null),
    ]);
    const priorInvalidation = invalidated || canceled;
    if (priorInvalidation?.id) return { created: false, missionId: String(priorInvalidation.id) };
    const companyId = Math.trunc(Number(input.companyId) || 0) || null;
    const requestedByUserId = Math.trunc(Number(input.requestedByUserId) || 0) || null;
    const runId = compactMissionText(input.runId, 200) || null;
    const correlationId = compactMissionText(input.correlationId, 200)
      || `local-deep:${identity.radarLeadId}:${identity.workVersion}`;
    const priorityReason = input.priorityReason || 'new_lead';
    const priority = Math.trunc(Number(input.priority) || (priorityReason === 'delivered' ? 100 : 0));
    return this.enqueue({
      stage: LOCAL_DEEP_ENRICH_STAGE,
      dedupeKey: identity.dedupeKey,
      correlationId,
      priority,
      rearmTerminal: false,
      companyId,
      radarLeadId: identity.radarLeadId,
      requestedByUserId,
      runId,
      workVersion: identity.workVersion,
      consumerKind: LOCAL_DEEP_ENRICH_CONSUMER_KIND,
      payload: {
        contractVersion: identity.contractVersion,
        promptVersion: identity.promptVersion,
        consumerKind: LOCAL_DEEP_ENRICH_CONSUMER_KIND,
        radarLeadId: identity.radarLeadId,
        companyId,
        requestedByUserId,
        runId,
        correlationId,
        workVersion: identity.workVersion,
        workHash: identity.workHash,
        priorityReason,
        lead: {
          name,
          city: compactMissionText(input.city, 160) || null,
          state: compactMissionText(input.state, 8).toUpperCase() || null,
          segment: compactMissionText(input.segment, 200) || null,
          website: compactMissionText(input.website, 1_000) || null,
          sourceUrl: compactMissionText(input.sourceUrl, 1_000) || null,
          identityKey: compactMissionText(input.identityKey, 500) || null,
        },
      },
    });
  }

  async enqueueAiSaneamento4b(input: AiSaneamento4bEnqueueInput): Promise<{ created: boolean; missionId: string | null }> {
    if (!isRadarAiSaneamentoEnabled()) return { created: false, missionId: null };
    const radarLeadId = compactMissionText(input.radarLeadId, 200);
    const name = compactMissionText(input.name, 300);
    if (!radarLeadId || !name) return { created: false, missionId: null };
    const promptVersion = 1;
    return this.enqueue({
      stage: AI_SANEAMENTO_4B_STAGE,
      dedupeKey: `radar:${radarLeadId}:prompt:${promptVersion}`,
      correlationId: compactMissionText(input.correlationId, 200) || `ai-4b:${radarLeadId}:${promptVersion}`,
      priority: Math.trunc(Number(input.priority) || 100),
      rearmTerminal: false,
      companyId: Math.trunc(Number(input.companyId) || 0) || null,
      radarLeadId,
      workVersion: promptVersion,
      consumerKind: AI_SANEAMENTO_4B_CONSUMER_KIND,
      payload: {
        contractVersion: AI_SANEAMENTO_4B_STAGE,
        promptVersion,
        model: 'qwen3:4b-instruct',
        radarLeadId,
        name,
        city: compactMissionText(input.city, 160) || null,
        state: compactMissionText(input.state, 8).toUpperCase() || null,
        segment: compactMissionText(input.segment, 200) || null,
        companyId: Math.trunc(Number(input.companyId) || 0) || null,
      },
    });
  }

  private async redriveRetryableLocalFailures(limit = 200): Promise<number> {
    const db = this.prisma as any;
    const rows = await db.radarMission.findMany({
      where: { stage: LOCAL_DEEP_ENRICH_STAGE, status: 'dead' },
      select: { id: true, attempts: true, lastPhase: true },
      take: Math.min(Math.max(1, Math.trunc(Number(limit) || 200)), 2_000),
    });
    let redriven = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      // Só `fail(..., retryable:false)` marca invalidated. Dead legado sem esse marcador era técnico.
      if (String(row?.lastPhase || '') === 'invalidated') continue;
      const attempts = Math.max(1, Number(row?.attempts) || 1);
      const updated = await db.radarMission.updateMany({
        where: { id: row.id, status: 'dead' },
        data: {
          status: 'queued',
          nextAttemptAt: new Date(Date.now() + computeMissionBackoffMs(attempts)),
          leaseId: null,
          leasedBy: null,
          leaseExpiresAt: null,
          lastPhase: 'retry_backoff',
        },
      });
      redriven += Number(updated?.count || 0);
    }
    return redriven;
  }

  async reconcileLocalDeepEnrichmentMissions(): Promise<{ scanned: number; enqueued: number }> {
    if (!isLocalDeepEnrichmentQueueEnabled()) return { scanned: 0, enqueued: 0 };
    const canaryLeadIds = resolveLocalDeepEnrichmentCanaryLeadIds();
    const [hasLeadPool, hasCursorTable] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarFactoryCursor').catch(() => false),
    ]);
    if (!hasLeadPool) return { scanned: 0, enqueued: 0 };
    if (!hasCursorTable) throw new Error('local_deep_enrich_reconciler_cursor_table_missing');

    const db = this.prisma as any;
    const cursorDelegate = db.radarFactoryCursor;
    if (!cursorDelegate?.upsert || !cursorDelegate?.update) {
      throw new Error('local_deep_enrich_reconciler_cursor_delegate_missing');
    }
    const batchSize = Math.min(
      Math.max(Number(process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_BATCH_SIZE) || 500, 1),
      2_000,
    );
    const startedAt = new Date();
    const initialCursor = initialLocalDeepEnrichmentReconcilerCursor(startedAt);
    // Cada escopo tem cursor próprio. Alterar/remover o canário inicia/retoma o backfill correto,
    // sem gravar os IDs do gate no banco ou em logs.
    const cursorKey = buildLocalDeepEnrichmentReconcilerCursorKey(canaryLeadIds);
    const cursorRow = await cursorDelegate.upsert({
      where: { key: cursorKey },
      create: {
        key: cursorKey,
        status: 'local-backfill',
        lastRunId: encodeLocalDeepEnrichmentReconcilerCursor(initialCursor),
      },
      update: {},
      select: { lastRunId: true },
    });
    const cursor = parseLocalDeepEnrichmentReconcilerCursor(cursorRow?.lastRunId, startedAt);
    const select = {
      id: true,
      name: true,
      city: true,
      state: true,
      segment: true,
      website: true,
      sourceUrl: true,
      placeId: true,
      phoneDigits: true,
      ownerCompanyId: true,
      campaignId: true,
      status: true,
      updatedAt: true,
    };
    const canaryIds = canaryLeadIds === null ? null : [...canaryLeadIds];
    const rows = cursor.phase === 'backfill'
      ? await db.radarLeadPool.findMany({
          where: canaryIds === null
            ? (cursor.afterId ? { id: { gt: cursor.afterId } } : {})
            : { id: { in: canaryIds, ...(cursor.afterId ? { gt: cursor.afterId } : {}) } },
          orderBy: { id: 'asc' },
          take: batchSize,
          select,
        })
      : await db.radarLeadPool.findMany({
          where: {
            ...(canaryIds === null ? {} : { id: { in: canaryIds } }),
            OR: [
              { updatedAt: { gt: new Date(cursor.watermarkAt) } },
              {
                updatedAt: new Date(cursor.watermarkAt),
                id: { gt: cursor.afterId || '' },
              },
            ],
          },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: batchSize,
          select,
        });

    await this.redriveRetryableLocalFailures();
    let enqueued = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const status = compactMissionText(row?.status, 80).toLowerCase();
      if (LOCAL_DEEP_ENRICH_EXCLUDED_STATUSES.has(status)) continue;
      const outcome = await this.enqueueLocalDeepEnrichment({
        radarLeadId: row?.id,
        name: row?.name,
        city: row?.city,
        state: row?.state,
        segment: row?.segment,
        website: row?.website,
        sourceUrl: row?.sourceUrl,
        identityKey: row?.placeId || row?.phoneDigits || null,
        companyId: row?.ownerCompanyId || null,
        runId: row?.campaignId || null,
        priority: status === 'sent_to_vendas' ? 100 : 0,
        priorityReason: status === 'sent_to_vendas' ? 'delivered' : 'reconciled',
      });
      if (outcome.created) enqueued += 1;
    }

    const lastRow = rows[rows.length - 1] || null;
    let nextCursor: LocalDeepEnrichmentReconcilerCursor;
    if (cursor.phase === 'backfill') {
      nextCursor = rows.length < batchSize
        ? { ...cursor, phase: 'incremental', afterId: null }
        : { ...cursor, afterId: compactMissionText(lastRow?.id, 200) || cursor.afterId };
    } else if (lastRow?.updatedAt instanceof Date) {
      nextCursor = {
        ...cursor,
        afterId: compactMissionText(lastRow.id, 200) || null,
        watermarkAt: lastRow.updatedAt.toISOString(),
      };
    } else {
      nextCursor = cursor;
    }
    await cursorDelegate.update({
      where: { key: cursorKey },
      data: {
        lastRunId: encodeLocalDeepEnrichmentReconcilerCursor(nextCursor),
        lastWorkedAt: new Date(),
        status: nextCursor.phase === 'backfill' ? 'local-backfill' : 'local-incremental',
      },
    });
    return { scanned: Array.isArray(rows) ? rows.length : 0, enqueued };
  }

  /**
   * Lease em LOTE com claim otimista (updateMany status 'queued' → 'leased'): quem atualizar primeiro
   * leva; perdedor pula pro próximo candidato. attempts incrementa NO lease (tentativa = vez em que
   * a missão saiu da fila) — crash sem fail() ainda conta a tentativa via revive.
   */
  async lease(input: {
    workerId: string;
    stages?: RadarMissionStage[] | null;
    batchSize?: number | null;
    correlationId?: string | null;
    leaseTtlMs?: number | null;
  }): Promise<RadarMissionLeaseResult> {
    if (!(await this.supportsMissionPersistence())) return { supported: false, paused: false, missions: [] };
    const stages = Array.from(new Set((input.stages || [])
      .filter((stage) => (RADAR_MISSION_STAGES as readonly string[]).includes(stage))))
      .filter((stage) => stage === LOCAL_DEEP_ENRICH_STAGE
        ? isLocalDeepEnrichmentQueueEnabled()
        : stage === AI_SANEAMENTO_4B_STAGE
          ? isRadarAiSaneamentoEnabled()
          : true);
    // Nunca interpretar lista vazia como "todos": cada consumidor declara sua allowlist.
    if (!stages.length) return { supported: true, paused: false, missions: [] };
    // Sinal elástico sempre acompanha o lease (mesmo pausado/vazio) — é como o worker decide o freio.
    const [activity, lag] = await Promise.all([this.getActivitySnapshot(), this.getQueueLagSnapshot(stages)]);
    if (await this.isQueuePaused(stages)) return { supported: true, paused: true, missions: [], activity, lag };
    await this.reviveExpiredLeases().catch(() => 0);

    const db = this.prisma as any;
    const now = new Date();
    const batchSize = Math.min(Math.max(1, Math.trunc(Number(input.batchSize) || 1)), 20);
    const ttlMs = Math.min(Math.max(Number(input.leaseTtlMs) || resolveMissionLeaseTtlMs(), 30_000), 900_000);
    const where: any = { status: 'queued', nextAttemptAt: { lte: now } };
    where.stage = { in: stages };
    if (input.correlationId) where.correlationId = input.correlationId;

    const isPostSaveEnrichment = stages.length === 1 && stages[0] === 'enrich_search_item';
    const candidates = await db.radarMission.findMany({
      where,
      // No pós-save, todos os jobs já estão vencidos pelo filtro acima; FIFO impede que uma
      // chegada contínua de web volte a empurrar social para o fim. Outros estágios preservam
      // a política geral de prioridade da fábrica.
      orderBy: isPostSaveEnrichment
        ? [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }]
        : [{ priority: 'desc' }, { nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: batchSize * 3,
    }).catch(() => []);

    const missions: RadarMissionLeaseDto[] = [];
    for (const candidate of candidates) {
      if (missions.length >= batchSize) break;
      const leaseId = randomUUID();
      const leaseExpiresAt = new Date(Date.now() + ttlMs);
      const claimed = await db.radarMission.updateMany({
        where: { id: candidate.id, status: 'queued' },
        data: {
          status: 'leased',
          leaseId,
          leasedBy: String(input.workerId || 'unknown').slice(0, 120),
          leaseExpiresAt,
          heartbeatAt: new Date(),
          attempts: { increment: 1 },
          ...([AI_SANEAMENTO_4B_STAGE, LOCAL_DEEP_ENRICH_STAGE].includes(candidate.stage)
            ? { startedAt: new Date(), lastPhase: 'leased' }
            : {}),
        },
      }).catch(() => ({ count: 0 }));
      if (!claimed.count) continue;
      missions.push({
        id: candidate.id,
        stage: candidate.stage,
        payloadVersion: Number(candidate.payloadVersion) || RADAR_MISSION_PAYLOAD_VERSION,
        payload: (candidate.payloadJson || {}) as Record<string, unknown>,
        attempts: (Number(candidate.attempts) || 0) + 1,
        maxAttempts: Number(candidate.maxAttempts) || resolveMissionMaxAttempts(),
        leaseId,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        heartbeatSeconds: Math.max(10, Math.trunc(ttlMs / 3000)),
      });
    }
    return { supported: true, paused: false, missions, activity, lag };
  }

  /** Heartbeat estende o lease (+TTL). Só o dono do lease vivo consegue — leaseId é a prova. */
  async heartbeat(
    missionId: string,
    leaseId: string,
    requestedTtlMs?: number | null,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    // O consumidor renova pelo mesmo TTL que pediu no lease. Sem isso, o worker local recebia
    // 15 minutos no primeiro claim, mas o primeiro heartbeat encurtava a missão para 2 minutos.
    // O clamp preserva o limite absoluto da fila e chamadas antigas continuam no TTL padrão.
    const ttlMs = Math.min(
      Math.max(Number(requestedTtlMs) || resolveMissionLeaseTtlMs(), 30_000),
      900_000,
    );
    const updated = await (this.prisma as any).radarMission.updateMany({
      where: { id: String(missionId || ''), leaseId: String(leaseId || ''), status: 'leased' },
      data: { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + ttlMs) },
    }).catch(() => ({ count: 0 }));
    return updated.count > 0 ? { ok: true } : { ok: false, reason: 'stale_lease' };
  }

  /**
   * Contexto (stage + payload) da missão sob o lease vivo — pro handler de complete aplicar o
   * resultado ANTES de marcar completa. Só devolve se o lease casa e a missão está 'leased'
   * (idempotência: se já completou com o MESMO lease, devolve `alreadyCompleted` pra pular a aplicação
   * e responder ok sem reprocessar).
   */
  async getLeasedContext(missionId: string, leaseId: string): Promise<
    { ok: true; stage: RadarMissionStage; payload: Record<string, unknown>; alreadyCompleted?: boolean } | { ok: false; reason: string }
  > {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    const db = this.prisma as any;
    const id = String(missionId || '');
    const lease = String(leaseId || '');
    const row = await db.radarMission.findUnique({
      where: { id },
      select: { stage: true, payloadJson: true, status: true, leaseId: true },
    }).catch(() => null);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.leaseId !== lease) return { ok: false, reason: 'stale_lease' };
    if (row.status === 'completed') {
      return { ok: true, stage: row.stage, payload: (row.payloadJson || {}) as Record<string, unknown>, alreadyCompleted: true };
    }
    if (row.status !== 'leased') return { ok: false, reason: 'stale_lease' };
    return { ok: true, stage: row.stage, payload: (row.payloadJson || {}) as Record<string, unknown> };
  }

  /** Idempotente: repetir complete com o MESMO leaseId de quem completou devolve ok sem tocar nada. */
  async complete(missionId: string, leaseId: string, result?: Record<string, unknown> | null): Promise<{ ok: boolean; idempotent?: boolean; reason?: string }> {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    const db = this.prisma as any;
    const id = String(missionId || '');
    const lease = String(leaseId || '');
    const updated = await db.radarMission.updateMany({
      where: { id, leaseId: lease, status: 'leased' },
      data: {
        status: 'completed',
        resultJson: (result || null) as any,
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastError: null,
      },
    }).catch(() => ({ count: 0 }));
    if (updated.count > 0) return { ok: true };
    const row = await db.radarMission.findUnique({ where: { id }, select: { status: true, leaseId: true } }).catch(() => null);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.status === 'completed' && row.leaseId === lease) return { ok: true, idempotent: true };
    return { ok: false, reason: 'stale_lease' };
  }

  /**
   * retryable=true re-enfileira com backoff. No stage local, falha técnica nunca vira terminal por
   * contagem de tentativas; apenas retryable=false (conteúdo/contrato inválido) marca invalidated.
   */
  async fail(missionId: string, leaseId: string, error?: string | null, retryable = true): Promise<{ ok: boolean; status?: string; idempotent?: boolean; reason?: string }> {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    const db = this.prisma as any;
    const id = String(missionId || '');
    const lease = String(leaseId || '');
    const row = await db.radarMission.findFirst({
      where: { id, leaseId: lease, status: 'leased' },
      select: { attempts: true, maxAttempts: true, stage: true },
    }).catch(() => null);
    if (!row) {
      const current = await db.radarMission.findUnique({ where: { id }, select: { status: true, leaseId: true } }).catch(() => null);
      if (!current) return { ok: false, reason: 'not_found' };
      if (current.leaseId === lease && ['queued', 'dead'].includes(String(current.status))) {
        return { ok: true, status: current.status, idempotent: true };
      }
      return { ok: false, reason: 'stale_lease' };
    }
    const attempts = Math.max(1, Number(row.attempts) || 1);
    const maxAttempts = Math.max(1, Number(row.maxAttempts) || resolveMissionMaxAttempts());
    const isLocalDeepEnrichment = row.stage === LOCAL_DEEP_ENRICH_STAGE;
    const exhausted = !retryable || (!isLocalDeepEnrichment && attempts >= maxAttempts);
    const message = String(error || 'falha sem mensagem').slice(0, 500);
    const updated = await db.radarMission.updateMany({
      where: { id, leaseId: lease, status: 'leased' },
      data: exhausted
        ? {
            status: 'dead',
            lastError: message,
            leaseExpiresAt: null,
            ...(isLocalDeepEnrichment ? { lastPhase: 'invalidated' } : {}),
          }
        : {
            status: 'queued',
            lastError: message,
            nextAttemptAt: new Date(Date.now() + computeMissionBackoffMs(attempts)),
            leaseExpiresAt: null,
            ...(isLocalDeepEnrichment ? { lastPhase: 'retry_backoff' } : {}),
          },
    }).catch(() => ({ count: 0 }));
    if (!updated.count) return { ok: false, reason: 'stale_lease' };
    return { ok: true, status: exhausted ? 'dead' : 'queued' };
  }

  /**
   * Lease vencido volta pra fila SOZINHO (stage local nunca morre por falha técnica). Guarda pelo
   * leaseExpiresAt lido: heartbeat concorrente muda o campo → o updateMany deste sweep não casa
   * e a missão viva NÃO é derrubada.
   */
  async reviveExpiredLeases(): Promise<number> {
    if (!(await this.supportsMissionPersistence())) return 0;
    const db = this.prisma as any;
    const now = new Date();
    const expired = await db.radarMission.findMany({
      where: { status: 'leased', leaseExpiresAt: { lt: now } },
      select: { id: true, stage: true, attempts: true, maxAttempts: true, leaseExpiresAt: true },
      take: 200,
    }).catch(() => []);
    let revived = 0;
    for (const row of expired) {
      const attempts = Math.max(1, Number(row.attempts) || 1);
      const maxAttempts = Math.max(1, Number(row.maxAttempts) || resolveMissionMaxAttempts());
      const isLocalDeepEnrichment = row.stage === LOCAL_DEEP_ENRICH_STAGE;
      const exhausted = !isLocalDeepEnrichment && attempts >= maxAttempts;
      const updated = await db.radarMission.updateMany({
        where: { id: row.id, status: 'leased', leaseExpiresAt: row.leaseExpiresAt },
        data: exhausted
          ? { status: 'dead', lastError: 'lease expirado sem heartbeat; tentativas esgotadas.', leaseExpiresAt: null }
          : {
              status: 'queued',
              lastError: 'lease expirado sem heartbeat; missão devolvida pra fila.',
              nextAttemptAt: new Date(Date.now() + computeMissionBackoffMs(attempts)),
              leaseExpiresAt: null,
              ...(isLocalDeepEnrichment ? { lastPhase: 'retry_backoff' } : {}),
            },
      }).catch(() => ({ count: 0 }));
      revived += Number(updated?.count || 0);
    }
    if (revived > 0) this.logger.warn(`[mission-queue] ${revived} lease(s) vencido(s) re-enfileirado(s)/dead pelo sweeper`);
    return revived;
  }

  /** Redrive do dead-letter: volta missões 'dead' pra fila com tentativas zeradas. */
  async redriveDead(input: { stage?: RadarMissionStage | null; ids?: string[] | null } = {}): Promise<{ redriven: number }> {
    if (!(await this.supportsMissionPersistence())) return { redriven: 0 };
    if (input.stage === LOCAL_DEEP_ENRICH_STAGE) return { redriven: 0 };
    const where: any = { status: 'dead', stage: input.stage || { not: LOCAL_DEEP_ENRICH_STAGE } };
    if (input.ids?.length) where.id = { in: input.ids.slice(0, 200) };
    const updated = await (this.prisma as any).radarMission.updateMany({
      where,
      data: { status: 'queued', attempts: 0, nextAttemptAt: new Date(), lastError: null, leaseId: null, leasedBy: null, leaseExpiresAt: null },
    }).catch(() => ({ count: 0 }));
    return { redriven: Number(updated?.count || 0) };
  }

  async stats() {
    if (!(await this.supportsMissionPersistence())) {
      return {
        supported: false,
        paused: true,
        byStageStatus: [],
        lag: { queuedDue: 0, oldestQueuedAgeMs: 0 },
        ai4b: this.emptyAi4bMetrics(),
      };
    }
    const db = this.prisma as any;
    const [grouped, paused, lag, activity, ai4bNoResult] = await Promise.all([
      db.radarMission.groupBy({ by: ['stage', 'status'], _count: { _all: true } }).catch(() => []),
      this.isQueuePaused(),
      this.getQueueLagSnapshot(),
      this.getActivitySnapshot(),
      db.radarMission.count({
        where: {
          stage: AI_SANEAMENTO_4B_STAGE,
          status: 'completed',
          OR: [
            { resultJson: { path: ['outcome'], equals: 'no_result' } },
            { resultJson: { path: ['outcome'], equals: 'skipped' } },
          ],
        },
      }).catch(() => 0),
    ]);
    const normalizedGroups = (grouped as any[]).map((row) => ({
      stage: String(row.stage),
      status: String(row.status),
      count: Number(row?._count?._all || 0),
    }));
    const countAi4b = (status: string) => normalizedGroups
      .filter((row) => row.stage === AI_SANEAMENTO_4B_STAGE && row.status === status)
      .reduce((sum, row) => sum + row.count, 0);
    const ai4bCompleted = countAi4b('completed');
    const ai4bDead = countAi4b('dead');
    return {
      supported: true,
      paused,
      byStageStatus: normalizedGroups,
      lag,
      activity,
      ai4b: {
        model: 'qwen3:4b-instruct',
        processed: ai4bCompleted + ai4bDead,
        completed: Math.max(0, ai4bCompleted - (Number(ai4bNoResult) || 0)),
        noResult: Number(ai4bNoResult) || 0,
        failures: ai4bDead,
        queued: countAi4b('queued'),
        processing: countAi4b('leased'),
      },
    };
  }

  private emptyAi4bMetrics() {
    return {
      model: 'qwen3:4b-instruct',
      processed: 0,
      completed: 0,
      noResult: 0,
      failures: 0,
      queued: 0,
      processing: 0,
    };
  }

  /** Lag da fila (profundidade × idade) — insumo da escala da frota no lugar da demanda sintética. */
  async getQueueLagSnapshot(stages?: RadarMissionStage[] | null): Promise<RadarMissionQueueLag> {
    if (!(await this.supportsMissionPersistence())) return { queuedDue: 0, oldestQueuedAgeMs: 0 };
    const db = this.prisma as any;
    const now = new Date();
    const where: any = { status: 'queued', nextAttemptAt: { lte: now } };
    const requestedStages = (stages || []).filter((stage) => (RADAR_MISSION_STAGES as readonly string[]).includes(stage));
    if (requestedStages.length) where.stage = { in: requestedStages };
    const [queuedDue, oldest] = await Promise.all([
      db.radarMission.count({ where }).catch(() => 0),
      db.radarMission.findFirst({
        where,
        orderBy: { nextAttemptAt: 'asc' },
        select: { nextAttemptAt: true, createdAt: true },
      }).catch(() => null),
    ]);
    const oldestAt = oldest?.nextAttemptAt instanceof Date ? oldest.nextAttemptAt : oldest?.createdAt instanceof Date ? oldest.createdAt : null;
    return {
      queuedDue: Number(queuedDue) || 0,
      oldestQueuedAgeMs: oldestAt ? Math.max(0, now.getTime() - oldestAt.getTime()) : 0,
    };
  }

  /**
   * Sinal elástico de "gente ativa" REAPROVEITANDO o que já existe: conta sessões AuthSession com
   * lastSeenAt na janela (mesmo campo que o JWT toca a cada request e que o ActiveSessionsService
   * usa). Não é scheduler novo — é uma leitura leve que viaja junto do lease pro worker DECIDIR o
   * freio (o backend só informa o número honesto; quem cede a vez é o worker da ponte).
   * Degrada gracioso: sem tabela/erro → activeUsers 0 (nunca trava o lease por causa deste sinal).
   */
  async getActivitySnapshot(): Promise<RadarMissionActivitySnapshot> {
    const windowMinutes = resolveMissionActivityWindowMinutes();
    const hasTable = await this.prisma.hasTable('AuthSession').catch(() => false);
    if (!hasTable) return { activeUsers: 0, windowMinutes };
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    const activeUsers = await (this.prisma as any).authSession
      .count({ where: { lastSeenAt: { gte: cutoff }, revokedAt: null } })
      .catch(() => 0);
    return { activeUsers: Math.max(0, Number(activeUsers) || 0), windowMinutes };
  }
}
