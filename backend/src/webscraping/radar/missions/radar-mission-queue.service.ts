import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── SPRINT 4 MOTOR-RFB-FILA (02/07) — fila de missões real ─────────────────────────────────────
// Substitui o controle por loops (factoryPump/cursor/lock) por fila com: retry+backoff, lease com
// TTL/heartbeat, dead-letter e pausa que pausa. Formato da PONTE: a fila mora na VPS e o nó LOCAL
// PUXA missão por HTTP (pull, nunca push) — ver RadarMissionsController (/modules/owner/missions).
// A família de bugs caros (pump moendo cidade esgotada, lease órfão → deadlock todos-busy, Parar que
// não para, demanda falsa religando motor) era toda sintoma da fila improvisada.

// `enrich_lead` (F2, 02/07): missão da FÁBRICA DE ENRIQUECIMENTO. Diferente das etapas da lane de
// pesquisa (alvo→…→card), ela pega um lead JÁ existente na base (materializado da lista RFB local) e
// completa contato/site/social/sócio — SEMPRE grátis no local (trava Lei nº1), sempre via
// LeadContactWriteService (gate anti-alucinação). Ver RadarFabricaService.
export const RADAR_MISSION_STAGES = ['alvo', 'receita', 'base_rica', 'cerebro', 'validacao_zap', 'card', 'enrich_lead', 'enrich_search_item'] as const;
export type RadarMissionStage = (typeof RADAR_MISSION_STAGES)[number];

/** Estágios que a PONTE (worker local do 30B) processa por lease/HTTP. Os demais são da fábrica in-process. */
export const PONTE_MISSION_STAGES: readonly RadarMissionStage[] = ['enrich_lead'];

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

export function isMissionQueueEnabled(env: NodeJS.ProcessEnv = process.env) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.HBX_MISSION_QUEUE_ENABLED || '').trim().toLowerCase());
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
};

@Injectable()
export class RadarMissionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarMissionQueueService.name);
  private supportsCache: { at: number; value: boolean } | null = null;
  private sweeperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Sweeper de lease vencido: mesmo sem ninguém dar lease (nó local desligado), missão presa em
    // 'leased' volta pra fila sozinha em ~TTL. kill -9 com N missões no ar → tudo re-enfileirado ~2min.
    this.sweeperTimer = setInterval(() => {
      if (!isMissionQueueEnabled()) return;
      void this.reviveExpiredLeases().catch(() => 0);
    }, 60_000);
    this.sweeperTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweeperTimer) clearInterval(this.sweeperTimer);
    this.sweeperTimer = null;
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
    if (requestedStages.length > 0 && requestedStages.every((stage) => stage === 'enrich_search_item')) {
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

  /** Emissão idempotente: dedupeKey vivo (queued/leased) não duplica; terminal (completed/dead/canceled) re-arma. */
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
    };
    if (input.dedupeKey) {
      const existing = await db.radarMission.findUnique({
        where: { stage_dedupeKey: { stage: input.stage, dedupeKey: input.dedupeKey } },
        select: { id: true, status: true },
      }).catch(() => null);
      if (existing) {
        if (['queued', 'leased'].includes(String(existing.status))) return { created: false, missionId: existing.id };
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
    const stages = (input.stages || []).filter((stage) => (RADAR_MISSION_STAGES as readonly string[]).includes(stage));
    // Sinal elástico sempre acompanha o lease (mesmo pausado/vazio) — é como o worker decide o freio.
    const [activity, lag] = await Promise.all([this.getActivitySnapshot(), this.getQueueLagSnapshot()]);
    if (await this.isQueuePaused(stages)) return { supported: true, paused: true, missions: [], activity, lag };
    await this.reviveExpiredLeases().catch(() => 0);

    const db = this.prisma as any;
    const now = new Date();
    const batchSize = Math.min(Math.max(1, Math.trunc(Number(input.batchSize) || 1)), 20);
    const ttlMs = Math.min(Math.max(Number(input.leaseTtlMs) || resolveMissionLeaseTtlMs(), 30_000), 900_000);
    const where: any = { status: 'queued', nextAttemptAt: { lte: now } };
    if (stages.length) where.stage = { in: stages };
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
  async heartbeat(missionId: string, leaseId: string): Promise<{ ok: boolean; reason?: string }> {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    const updated = await (this.prisma as any).radarMission.updateMany({
      where: { id: String(missionId || ''), leaseId: String(leaseId || ''), status: 'leased' },
      data: { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + resolveMissionLeaseTtlMs()) },
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

  /** retryable=true re-enfileira com backoff; retryable=false OU tentativas esgotadas → dead-letter. */
  async fail(missionId: string, leaseId: string, error?: string | null, retryable = true): Promise<{ ok: boolean; status?: string; idempotent?: boolean; reason?: string }> {
    if (!(await this.supportsMissionPersistence())) return { ok: false, reason: 'unsupported' };
    const db = this.prisma as any;
    const id = String(missionId || '');
    const lease = String(leaseId || '');
    const row = await db.radarMission.findFirst({
      where: { id, leaseId: lease, status: 'leased' },
      select: { attempts: true, maxAttempts: true },
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
    const exhausted = !retryable || attempts >= maxAttempts;
    const message = String(error || 'falha sem mensagem').slice(0, 500);
    const updated = await db.radarMission.updateMany({
      where: { id, leaseId: lease, status: 'leased' },
      data: exhausted
        ? { status: 'dead', lastError: message, leaseExpiresAt: null }
        : {
            status: 'queued',
            lastError: message,
            nextAttemptAt: new Date(Date.now() + computeMissionBackoffMs(attempts)),
            leaseExpiresAt: null,
          },
    }).catch(() => ({ count: 0 }));
    if (!updated.count) return { ok: false, reason: 'stale_lease' };
    return { ok: true, status: exhausted ? 'dead' : 'queued' };
  }

  /**
   * Lease vencido volta pra fila SOZINHO (ou vira dead se esgotou tentativas). Guarda pelo
   * leaseExpiresAt lido: heartbeat concorrente muda o campo → o updateMany deste sweep não casa
   * e a missão viva NÃO é derrubada.
   */
  async reviveExpiredLeases(): Promise<number> {
    if (!(await this.supportsMissionPersistence())) return 0;
    const db = this.prisma as any;
    const now = new Date();
    const expired = await db.radarMission.findMany({
      where: { status: 'leased', leaseExpiresAt: { lt: now } },
      select: { id: true, attempts: true, maxAttempts: true, leaseExpiresAt: true },
      take: 200,
    }).catch(() => []);
    let revived = 0;
    for (const row of expired) {
      const attempts = Math.max(1, Number(row.attempts) || 1);
      const maxAttempts = Math.max(1, Number(row.maxAttempts) || resolveMissionMaxAttempts());
      const exhausted = attempts >= maxAttempts;
      const updated = await db.radarMission.updateMany({
        where: { id: row.id, status: 'leased', leaseExpiresAt: row.leaseExpiresAt },
        data: exhausted
          ? { status: 'dead', lastError: 'lease expirado sem heartbeat; tentativas esgotadas.', leaseExpiresAt: null }
          : {
              status: 'queued',
              lastError: 'lease expirado sem heartbeat; missão devolvida pra fila.',
              nextAttemptAt: new Date(Date.now() + computeMissionBackoffMs(attempts)),
              leaseExpiresAt: null,
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
    const where: any = { status: 'dead' };
    if (input.stage) where.stage = input.stage;
    if (input.ids?.length) where.id = { in: input.ids.slice(0, 200) };
    const updated = await (this.prisma as any).radarMission.updateMany({
      where,
      data: { status: 'queued', attempts: 0, nextAttemptAt: new Date(), lastError: null, leaseId: null, leasedBy: null, leaseExpiresAt: null },
    }).catch(() => ({ count: 0 }));
    return { redriven: Number(updated?.count || 0) };
  }

  async stats() {
    if (!(await this.supportsMissionPersistence())) return { supported: false, paused: true, byStageStatus: [], lag: { queuedDue: 0, oldestQueuedAgeMs: 0 } };
    const db = this.prisma as any;
    const [grouped, paused, lag, activity] = await Promise.all([
      db.radarMission.groupBy({ by: ['stage', 'status'], _count: { _all: true } }).catch(() => []),
      this.isQueuePaused(),
      this.getQueueLagSnapshot(),
      this.getActivitySnapshot(),
    ]);
    return {
      supported: true,
      paused,
      byStageStatus: (grouped as any[]).map((row) => ({
        stage: String(row.stage),
        status: String(row.status),
        count: Number(row?._count?._all || 0),
      })),
      lag,
      activity,
    };
  }

  /** Lag da fila (profundidade × idade) — insumo da escala da frota no lugar da demanda sintética. */
  async getQueueLagSnapshot(): Promise<RadarMissionQueueLag> {
    if (!(await this.supportsMissionPersistence())) return { queuedDue: 0, oldestQueuedAgeMs: 0 };
    const db = this.prisma as any;
    const now = new Date();
    const [queuedDue, oldest] = await Promise.all([
      db.radarMission.count({ where: { status: 'queued', nextAttemptAt: { lte: now } } }).catch(() => 0),
      db.radarMission.findFirst({
        where: { status: 'queued', nextAttemptAt: { lte: now } },
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
