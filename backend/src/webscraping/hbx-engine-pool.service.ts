import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HBX_ENGINE_URL = 'http://localhost:8001';
const HEALTH_CHECK_TTL_MS = 30_000;

type CapacityLevel = {
  activeEngineCount: number;
  googleEmergencyMode: boolean;
  queuedCount: number;
  runningCount: number;
  operationalStatus: 'healthy' | 'degraded';
  message: string | null;
  completedLast10Min: number;
  partialLast10Min: number;
  oldestQueuedAgeMinutes: number;
};

export type HbxEngineLease = {
  engineId: string;
  engineIndex: number;
  url: string;
  lockedUntil: Date;
  googleEmergencyMode: boolean;
};

type EngineRegistryRow = {
  id: string;
  engineIndex: number;
  url: string;
  status: string;
  lastHealthStatus?: string | null;
  lastError?: string | null;
  failureCount?: number | null;
  lockedRunId?: string | null;
  lockedUntil?: Date | null;
  cooldownUntil?: Date | null;
  lastCheckedAt?: Date | null;
};

function parseIntegerEnv(name: string, fallback: number) {
  const parsed = Number(String(process.env[name] || '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000);
}

@Injectable()
export class HbxEnginePoolService {
  private readonly logger = new Logger(HbxEnginePoolService.name);
  private activeEngineCount = 1;
  private googleEmergencyMode = false;
  private engine2LowSince: number | null = null;
  private engine3LowSince: number | null = null;
  private engine4LowSince: number | null = null;
  private googleLowSince: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async refreshEngineRegistryFromEnv() {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return [];
    const urls = this.getConfiguredEngineUrls();
    const rows: EngineRegistryRow[] = [];

    for (const [index, url] of urls.entries()) {
      const id = `hbx-engine-${index + 1}`;
      const row = await (this.prisma as any).hbxEngineLock.upsert({
        where: { id },
        create: {
          id,
          engineIndex: index,
          url,
          status: index === 0 ? 'online' : 'standby',
        },
        update: {
          engineIndex: index,
          url,
        },
      });
      rows.push(row);
    }

    return rows;
  }

  async healthCheckEngines() {
    const rows = await this.refreshEngineRegistryFromEnv();
    const now = new Date();
    const checked: EngineRegistryRow[] = [];

    for (const row of rows) {
      const lastCheckedAt = row.lastCheckedAt instanceof Date ? row.lastCheckedAt : null;
      if (lastCheckedAt && Date.now() - lastCheckedAt.getTime() < HEALTH_CHECK_TTL_MS) {
        checked.push(row);
        continue;
      }

      let healthStatus = 'offline';
      let lastError: string | null = null;
      try {
        const response = await fetch(`${String(row.url).replace(/\/+$/, '')}/health`, {
          headers: { Accept: 'application/json,text/plain' },
          signal: AbortSignal.timeout(3500),
        });
        await response.text().catch(() => '');
        healthStatus = response.ok ? 'online' : 'offline';
        if (!response.ok) lastError = `Healthcheck HTTP ${response.status}`;
      } catch (error) {
        healthStatus = 'offline';
        lastError = error instanceof Error ? error.message : String(error || 'Healthcheck falhou.');
      }

      const healthFailureCount = healthStatus === 'offline'
        ? Math.min(Number(row.failureCount || 0) + 1, 6)
        : 0;
      const healthCooldownUntil = healthStatus === 'offline' && healthFailureCount >= 3
        ? new Date(Date.now() + Math.min(30, 2 ** healthFailureCount) * 60_000)
        : row.cooldownUntil || null;
      const isLocked = Boolean(row.lockedRunId && row.lockedUntil && row.lockedUntil.getTime() > Date.now());
      const inCooldown = Boolean(healthCooldownUntil && healthCooldownUntil.getTime() > Date.now());
      const status = isLocked
        ? 'busy'
        : inCooldown
          ? 'cooldown'
          : healthStatus === 'online'
            ? row.engineIndex === 0 ? 'online' : 'standby'
            : 'offline';

      const updated = await (this.prisma as any).hbxEngineLock.update({
        where: { id: row.id },
        data: {
          status,
          lastHealthStatus: healthStatus,
          lastError,
          failureCount: healthFailureCount,
          cooldownUntil: healthCooldownUntil,
          lastCheckedAt: now,
        },
      });
      checked.push(updated);
    }

    return checked;
  }

  async getCurrentCapacityLevel(): Promise<CapacityLevel> {
    const stats = await this.buildQueueStats();
    const desiredEngineCount = this.resolveDesiredEngineCount(stats.queuedCount);
    this.activeEngineCount = Math.max(this.activeEngineCount, desiredEngineCount);
    this.applyHysteresis(stats.queuedCount);

    const stuck = this.isQueueStuck(stats);
    const emergencyDesired = stats.queuedCount >= this.googleEmergencyThreshold();
    if (emergencyDesired && !stuck) {
      this.googleEmergencyMode = true;
      this.googleLowSince = null;
    } else if (this.googleEmergencyMode) {
      if (stats.queuedCount <= 25) {
        this.googleLowSince ||= Date.now();
        if (Date.now() - this.googleLowSince >= 30 * 60_000) {
          this.googleEmergencyMode = false;
          this.googleLowSince = null;
        }
      } else {
        this.googleLowSince = null;
      }
    }

    return {
      activeEngineCount: this.activeEngineCount,
      googleEmergencyMode: this.googleEmergencyMode && !stuck,
      queuedCount: stats.queuedCount,
      runningCount: stats.runningCount,
      operationalStatus: stuck ? 'degraded' : 'healthy',
      message: stuck ? 'Fila de webscraping travada. Motores não estão entregando progresso.' : null,
      completedLast10Min: stats.completedLast10Min,
      partialLast10Min: stats.partialLast10Min,
      oldestQueuedAgeMinutes: stats.oldestQueuedAgeMinutes,
    };
  }

  async getEligibleEnginesForCurrentQueue() {
    await this.cleanupExpiredLocks();
    const [capacity, engines] = await Promise.all([
      this.getCurrentCapacityLevel(),
      this.healthCheckEngines(),
    ]);
    const now = Date.now();
    return engines
      .filter((engine) => engine.engineIndex < capacity.activeEngineCount)
      .filter((engine) => String(engine.lastHealthStatus || engine.status) !== 'offline')
      .filter((engine) => !engine.cooldownUntil || engine.cooldownUntil.getTime() <= now)
      .sort((left, right) => left.engineIndex - right.engineIndex);
  }

  async acquireEngine(runId: string, companyId: number, userId: number, avoidEngineIdOrUrl?: string): Promise<HbxEngineLease | null> {
    await this.cleanupExpiredLocks();
    const capacity = await this.getCurrentCapacityLevel();
    if (capacity.operationalStatus === 'degraded') {
      this.logger.warn(
        `[webscraping-capacity] ${capacity.message} queued=${capacity.queuedCount} running=${capacity.runningCount}`,
      );
      await this.logStuckQueueDetails();
      return null;
    }

    const avoid = String(avoidEngineIdOrUrl || '').trim();
    const eligible = (await this.getEligibleEnginesForCurrentQueue())
      .sort((left, right) => {
        const leftAvoided = avoid && (left.id === avoid || left.url === avoid) ? 1 : 0;
        const rightAvoided = avoid && (right.id === avoid || right.url === avoid) ? 1 : 0;
        return leftAvoided - rightAvoided || left.engineIndex - right.engineIndex;
      });
    const lockedUntil = new Date(Date.now() + this.engineMaxBusyMinutes() * 60_000);

    for (const engine of eligible) {
      const isBusy = Boolean(engine.lockedRunId && engine.lockedUntil && engine.lockedUntil.getTime() > Date.now());
      if (isBusy) continue;

      const updated = await (this.prisma as any).hbxEngineLock.updateMany({
        where: {
          id: engine.id,
          OR: [
            { lockedRunId: null },
            { lockedUntil: { lt: new Date() } },
          ],
        },
        data: {
          status: 'busy',
          lockedRunId: runId,
          lockedCompanyId: companyId,
          lockedUserId: userId,
          lockedAt: new Date(),
          lockedUntil,
          lastUsedAt: new Date(),
        },
      });
      if (updated.count > 0) {
        return {
          engineId: engine.id,
          engineIndex: engine.engineIndex,
          url: engine.url,
          lockedUntil,
          googleEmergencyMode: capacity.googleEmergencyMode,
        };
      }
    }

    return null;
  }

  async releaseEngine(engineId: string) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const inCooldown = Boolean(current?.cooldownUntil instanceof Date && current.cooldownUntil.getTime() > Date.now());
    const degraded = String(current?.status || '') === 'degraded';
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: inCooldown ? 'cooldown' : degraded ? 'degraded' : 'online',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
      },
    }).catch(() => null);
  }

  async markEngineBatchError(engineId: string, error: unknown) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const message = String((error as any)?.response?.message || (error as any)?.rawMessage || (error as any)?.message || error || 'Falha no lote HBX.');
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: 'degraded',
        lastError: message.slice(0, 500),
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
      },
    }).catch(() => null);
  }

  async markEngineBatchSuccess(engineId: string) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: 'online',
        failureCount: 0,
        lastError: null,
      },
    }).catch(() => null);
  }

  async markEngineFailed(engineId: string, error: unknown) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const failureCount = Math.min(Number(current?.failureCount || 0) + 1, 6);
    const cooldownMinutes = Math.min(30, Math.max(2, 2 ** failureCount));
    const message = String((error as any)?.response?.message || (error as any)?.message || error || 'Falha no motor HBX.');
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: 'cooldown',
        failureCount,
        cooldownUntil: new Date(Date.now() + cooldownMinutes * 60_000),
        lastError: message.slice(0, 500),
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
      },
    }).catch(() => null);
  }

  async cleanupExpiredLocks() {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        lockedRunId: { not: null },
        lockedUntil: { lt: new Date() },
      },
      data: {
        status: 'online',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        lastError: 'Lock expirado e liberado automaticamente.',
      },
    }).catch(() => null);
  }

  async canUseGoogleEmergencyForRun() {
    const capacity = await this.getCurrentCapacityLevel();
    if (!capacity.googleEmergencyMode || capacity.operationalStatus === 'degraded') return false;
    return (await this.countGoogleEmergencyToday()) < this.googleEmergencyDailyLimit();
  }

  googleEmergencyMaxPerRun() {
    return parseIntegerEnv('HBX_GOOGLE_EMERGENCY_MAX_PER_RUN', 20);
  }

  private getConfiguredEngineUrls() {
    const rawUrls = String(process.env.HBX_ENGINE_URLS || '').trim();
    const urls = rawUrls
      ? rawUrls.split(',').map((url) => url.trim()).filter(Boolean)
      : [String(process.env.HBX_SCRAPING_ENGINE_URL || DEFAULT_HBX_ENGINE_URL).trim()];
    return urls.slice(0, 4).map((url) => url.replace(/\/+$/, ''));
  }

  private engine2Threshold() {
    return parseIntegerEnv('HBX_CAPACITY_ENGINE_2_QUEUE_THRESHOLD', 3);
  }

  private engine3Threshold() {
    return parseIntegerEnv('HBX_CAPACITY_ENGINE_3_QUEUE_THRESHOLD', 10);
  }

  private engine4Threshold() {
    return parseIntegerEnv('HBX_CAPACITY_ENGINE_4_QUEUE_THRESHOLD', 20);
  }

  private googleEmergencyThreshold() {
    return parseIntegerEnv('HBX_GOOGLE_EMERGENCY_QUEUE_THRESHOLD', 50);
  }

  private googleEmergencyDailyLimit() {
    return parseIntegerEnv('HBX_GOOGLE_EMERGENCY_DAILY_LIMIT', 500);
  }

  private queueStuckMinutes() {
    return parseIntegerEnv('HBX_QUEUE_STUCK_MINUTES', 10);
  }

  private engineMaxBusyMinutes() {
    return parseIntegerEnv('HBX_ENGINE_MAX_BUSY_MINUTES', 15);
  }

  private resolveDesiredEngineCount(queuedCount: number) {
    if (queuedCount >= this.engine4Threshold()) return 4;
    if (queuedCount >= this.engine3Threshold()) return 3;
    if (queuedCount >= this.engine2Threshold()) return 2;
    return 1;
  }

  private applyHysteresis(queuedCount: number) {
    const now = Date.now();
    this.engine2LowSince = this.updateLowSince(this.engine2LowSince, queuedCount <= 1);
    this.engine3LowSince = this.updateLowSince(this.engine3LowSince, queuedCount <= 5);
    this.engine4LowSince = this.updateLowSince(this.engine4LowSince, queuedCount <= 10);

    if (this.activeEngineCount >= 4 && this.engine4LowSince && now - this.engine4LowSince >= 30 * 60_000) {
      this.activeEngineCount = 3;
      this.engine4LowSince = null;
    }
    if (this.activeEngineCount >= 3 && this.engine3LowSince && now - this.engine3LowSince >= 20 * 60_000) {
      this.activeEngineCount = 2;
      this.engine3LowSince = null;
    }
    if (this.activeEngineCount >= 2 && this.engine2LowSince && now - this.engine2LowSince >= 15 * 60_000) {
      this.activeEngineCount = 1;
      this.engine2LowSince = null;
    }
  }

  private updateLowSince(current: number | null, condition: boolean) {
    if (!condition) return null;
    return current || Date.now();
  }

  private async buildQueueStats() {
    const tenMinutesAgo = minutesAgo(10);
    const [queuedCount, runningCount, completedLast10Min, partialLast10Min, oldestQueued, progressingRuns] = await Promise.all([
      (this.prisma as any).webscrapingSearchRun.count({ where: { status: 'queued' } }),
      (this.prisma as any).webscrapingSearchRun.count({ where: { status: 'running' } }),
      (this.prisma as any).webscrapingSearchRun.count({ where: { status: 'completed', finishedAt: { gte: tenMinutesAgo } } }),
      (this.prisma as any).webscrapingSearchRun.count({ where: { status: 'partial_error', finishedAt: { gte: tenMinutesAgo } } }),
      (this.prisma as any).webscrapingSearchRun.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      (this.prisma as any).webscrapingSearchRun.count({
        where: {
          status: 'running',
          lastFoundCountChangeAt: { gte: minutesAgo(Math.min(5, this.queueStuckMinutes())) },
        },
      }),
    ]);
    const oldestQueuedAgeMinutes = oldestQueued?.createdAt instanceof Date
      ? Math.max(0, (Date.now() - oldestQueued.createdAt.getTime()) / 60_000)
      : 0;
    return {
      queuedCount,
      runningCount,
      completedLast10Min,
      partialLast10Min,
      progressingRuns,
      oldestQueuedAgeMinutes,
    };
  }

  private isQueueStuck(stats: Awaited<ReturnType<HbxEnginePoolService['buildQueueStats']>>) {
    return (
      stats.queuedCount > 0 &&
      stats.runningCount > 0 &&
      stats.completedLast10Min === 0 &&
      stats.partialLast10Min === 0 &&
      stats.progressingRuns === 0 &&
      stats.oldestQueuedAgeMinutes > this.queueStuckMinutes()
    );
  }

  private async countGoogleEmergencyToday() {
    if (!(await this.prisma.hasTable('WebscrapingUsageLog'))) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return (this.prisma as any).webscrapingUsageLog.count({
      where: {
        eventType: 'GOOGLE_EMERGENCY_EXECUTED',
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });
  }

  private async logStuckQueueDetails() {
    try {
      const [engines, stuckRuns] = await Promise.all([
        (this.prisma as any).hbxEngineLock.findMany({
          where: {
            OR: [
              { status: { in: ['busy', 'offline', 'degraded', 'cooldown'] } },
              { lastHealthStatus: 'offline' },
            ],
          },
          orderBy: { engineIndex: 'asc' },
          select: {
            id: true,
            engineIndex: true,
            status: true,
            lastHealthStatus: true,
            lockedRunId: true,
            lockedUntil: true,
            cooldownUntil: true,
            lastError: true,
          },
        }),
        (this.prisma as any).webscrapingSearchRun.findMany({
          where: {
            status: { in: ['queued', 'running'] },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
          select: {
            id: true,
            status: true,
            companyId: true,
            userId: true,
            foundCount: true,
            assignedEngineId: true,
            errorMessage: true,
            createdAt: true,
            startedAt: true,
            lastFoundCountChangeAt: true,
          },
        }),
      ]);
      this.logger.warn(`[webscraping-capacity] motores ocupados/offline=${JSON.stringify(engines)}`);
      this.logger.warn(`[webscraping-capacity] runs travadas=${JSON.stringify(stuckRuns)}`);
    } catch (error) {
      this.logger.warn(`[webscraping-capacity] falha ao registrar detalhes da fila travada: ${String((error as any)?.message || error)}`);
    }
  }
}
