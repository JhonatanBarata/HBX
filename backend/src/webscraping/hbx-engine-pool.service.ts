import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_HBX_ENGINE_COUNT = 3;
export const PRODUCTION_HBX_ENGINE_COUNT = 20;
export const HARD_HBX_ENGINE_MAX_COUNT = 200;
export const DEFAULT_HBX_ENGINE_MAX_COUNT = HARD_HBX_ENGINE_MAX_COUNT;
export const MAX_HBX_ENGINE_COUNT = HARD_HBX_ENGINE_MAX_COUNT;
const TURBO_OPERATIONAL_CONFIG_KEY = 'turbo_noturno';
const HEALTH_CHECK_TTL_MS = 30_000;

export type CapacityLevel = {
  activeEngineCount: number;
  googleEmergencyMode: boolean;
  queuedCount: number;
  runningCount: number;
  operationalStatus: 'healthy' | 'degraded';
  message: string | null;
  completedLast10Min: number;
  partialLast10Min: number;
  oldestQueuedAgeMinutes: number;
  isTurboEnabled: boolean;
  isTurboWindowActive: boolean;
  isTurboForcedNow: boolean;
  forcedUntil: string | null;
  nextTurboAt: string | null;
  scheduler?: HbxEngineSchedulerStatus;
};

export type HbxEngineLease = {
  engineId: string;
  engineIndex: number;
  url: string;
  lockedUntil: Date;
  googleEmergencyMode: boolean;
};

export type HbxEnginePurpose = 'manual' | 'radar_pull' | 'radar_digital' | 'lead_plus_enrichment' | 'vendas' | 'autonomous' | 'mass_data';
export type HbxEngineDesiredState = 'running' | 'draining' | 'stopped';
export type HbxEngineActualState = 'running' | 'exited' | 'missing' | 'starting';

export type HbxEngineSchedulerStatus = {
  configuredEngineCount?: number;
  configuredUrlsCount?: number;
  registryRowsCount?: number;
  eligibleEnginesCount?: number;
  activeEngineCount?: number;
  firstEligibleEngine?: string | null;
  lastEligibleEngine?: string | null;
  manualReservedEngines: number;
  clientPriorityActive: boolean;
  automaticAllowedEngines: number;
  factoryMinEngines: number;
  factoryMaxEngines: number | null;
  onlineHealthyEngines: number;
  memoryPressurePercent: number;
  googleMode: 'manual_only';
  manualDemandActive: boolean;
  productionMode: 'full' | 'reduced' | 'protected';
  statusCounts?: HbxEngineStatusCounts;
  factory?: HbxFactoryAllowance;
};

export type HbxFactoryAllowance = {
  allowedEngines: number;
  configuredEngineCount: number;
  maxEngines: number;
  minEngines: number;
  memoryGuardEngines: number;
  reservedEngines: number;
  memoryPressurePercent: number;
  reason: 'factory_disabled' | 'outside_factory_window' | 'outside_business_days' | 'emergency_stop' | 'memory_guard' | 'memory_stop' | 'client_priority' | 'manual_demand' | 'factory_max' | 'guided_location' | 'open';
  windowStatus: 'open' | 'closed' | 'disabled' | 'emergency_stop';
  enabled: boolean;
  forcedActive: boolean;
  emergencyStop: boolean;
  stopOutsideWindow: boolean;
  weekdaysOnly: boolean;
  weekendAlwaysOn: boolean;
  factoryState: string | null;
  factoryCity: string | null;
  timezone: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  nextStartAt: string | null;
  nextStopAt: string | null;
};

export type HbxEngineElasticSyncResult = {
  synced: boolean;
  configuredEngineCount: number;
  desiredRunningCount: number;
  updatedRunningCount: number;
  updatedStoppingCount: number;
  scheduler?: HbxEngineSchedulerStatus | null;
};

export type HbxEngineStatusCounts = {
  online: number;
  standby: number;
  busy: number;
  draining: number;
  stopped: number;
  cooldown: number;
  paused: number;
  offline: number;
  inactive: number;
  degraded: number;
  missing: number;
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
  manualPaused?: boolean | null;
  pausedUntil?: Date | null;
  lastCheckedAt?: Date | null;
  lastUsedAt?: Date | null;
};

type EngineActivityStats = {
  activeRunId: string | null;
  activeCampaignId: string | null;
  lastActivityAt: Date | null;
  processedLast10Min: number;
  errorCount: number;
};

export type HbxEngineDashboardEngine = {
  id: string;
  kind: 'hbx' | 'google';
  label: string;
  shortLabel: string;
  index: number | null;
  status: string;
  configured: boolean;
  active: boolean;
  online: boolean;
  busy: boolean;
  dimmed: boolean;
  url: string | null;
  lockUrl: string | null;
  localhostInProduction: boolean;
  lockedUntil: string | null;
  cooldownUntil: string | null;
  manualPaused: boolean;
  pausedUntil: string | null;
  desiredState: HbxEngineDesiredState;
  actualState: HbxEngineActualState;
  containerName: string | null;
  memoryRssMb: number | null;
  memoryEwmaMb: number | null;
  lastStartAt: string | null;
  lastStopAt: string | null;
  idleSince: string | null;
  drainUntil: string | null;
  priorityClass: 'client' | 'factory' | 'mixed';
  lastLeasePurpose: HbxEnginePurpose | null;
  leaseActive: boolean;
  stopEligible: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  detail: string;
  usagePercent: number;
  stateLabel: string;
  lastActivityAt: string | null;
  activeRunId: string | null;
  activeCampaignId: string | null;
  queueShare: number;
  processedLast10Min: number;
  errorCount: number;
  heartbeatAgeSeconds: number | null;
  isTurboEnabled: boolean;
  isTurboWindowActive: boolean;
  isTurboForcedNow: boolean;
  cardsFabricated: number;
  batches: number;
  duplicates: number;
  rejected: number;
  queue: number;
};

export type HbxEngineCapacityConfig = {
  configuredCount: number;
  maxCount: number;
  warmMin: number;
  governorEnabled: boolean;
  factoryStopped: boolean;
};

export type HbxEngineDashboardStatus = {
  generatedAt: string;
  capacity: CapacityLevel;
  engines: HbxEngineDashboardEngine[];
  diagnostics?: string[];
  enginePanels?: HbxEngineDashboardPanel[];
  capacityConfig?: HbxEngineCapacityConfig;
};

export type HbxEngineDashboardPanel = {
  id: string;
  label: string;
  range: string;
  total: number;
  onlineHealthy: number;
  eligible: number;
  busy: number;
  cooldown: number;
  offline: number;
  paused: number;
  standby: number;
  acquiredLast10Min: number;
  cardsFabricated: number;
  lastErrorSample: string | null;
  reason: string;
};

function parseIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function resolveListEngineCount(configuredCount = getConfiguredHbxEngineCount()) {
  return Math.min(
    Math.max(1, parseIntegerEnv('HBX_LIST_ENGINE_COUNT', configuredCount)),
    Math.max(1, configuredCount),
  );
}

export function getHbxEnginePurposeRange(purpose: HbxEnginePurpose, configuredCount = getConfiguredHbxEngineCount()) {
  const safeConfigured = Math.max(1, Math.trunc(Number(configuredCount || 1)));
  const listCount = resolveListEngineCount(safeConfigured);
  return {
    start: 0,
    endExclusive: listCount,
    label: `1-${listCount}`,
  };
}

export function getConfiguredHbxEngineCount(env: NodeJS.ProcessEnv = process.env): number {
  const defaultCount = isProductionEnvironment(env.NODE_ENV) ? PRODUCTION_HBX_ENGINE_COUNT : DEFAULT_HBX_ENGINE_COUNT;
  const fallback = clampInteger(env.HBX_ENGINE_DEFAULT_COUNT, defaultCount, 1, getConfiguredHbxEngineMaxCount(env));
  return clampInteger(env.HBX_ENGINE_COUNT, fallback, 1, getConfiguredHbxEngineMaxCount(env));
}

export function getConfiguredHbxEngineHardLimit(env: NodeJS.ProcessEnv = process.env): number {
  return clampInteger(env.HBX_ENGINE_HARD_LIMIT, HARD_HBX_ENGINE_MAX_COUNT, 1, HARD_HBX_ENGINE_MAX_COUNT);
}

export function getConfiguredHbxEngineMaxCount(env: NodeJS.ProcessEnv = process.env): number {
  const hardLimit = getConfiguredHbxEngineHardLimit(env);
  return clampInteger(env.HBX_ENGINE_MAX_COUNT, DEFAULT_HBX_ENGINE_MAX_COUNT, 1, hardLimit);
}

export function parseHostMemoryPressurePercent(raw: string) {
  const values = new Map<string, number>();
  for (const line of String(raw || '').split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)/);
    if (!match) continue;
    values.set(match[1], Number(match[2]));
  }

  const totalKb = values.get('MemTotal') || 0;
  const availableKb = values.get('MemAvailable') || 0;
  if (totalKb <= 0 || availableKb < 0) return null;

  const usedKb = Math.max(0, totalKb - availableKb);
  return Math.max(0, Math.min(100, Math.round((usedKb / totalKb) * 100)));
}

export function buildHbxEngineUrls(prefixOrBase: string, count = getConfiguredHbxEngineCount()) {
  const safeCount = clampInteger(count, DEFAULT_HBX_ENGINE_COUNT, 1, getConfiguredHbxEngineMaxCount());
  const base = String(prefixOrBase || '').trim().replace(/\/+$/, '');
  if (!base) return [];
  return Array.from({ length: safeCount }, (_, index) => {
    if (base.includes('{n}')) return base.replace(/\{n\}/g, String(index + 1));
    if (base.includes('{index}')) return base.replace(/\{index\}/g, String(index));
    if (base.includes('localhost')) return `${base}:${8001 + index}`;
    return `${base}-${index + 1}:8001`;
  });
}

export function buildLocalHbxEngineUrls(count = getConfiguredHbxEngineCount()) {
  return buildHbxEngineUrls('http://localhost', count);
}

export function buildDockerHbxEngineUrls(count = getConfiguredHbxEngineCount()) {
  return buildHbxEngineUrls('http://hbx-engine', count);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(Math.max(safe, min), max);
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000);
}

export function parseHbxEngineUrls(value: unknown, maxUrls = getConfiguredHbxEngineCount()) {
  const rawUrls = Array.isArray(value)
    ? value
    : (() => {
        const raw = String(value || '').trim();
        if (!raw) return [];
        if (raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            return [];
          }
        }
        if (raw.includes('{n}') || raw.includes('{index}')) {
          return buildHbxEngineUrls(raw, maxUrls);
        }
        return raw.split(',');
      })();

  return rawUrls
    .map((url) => String(url || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .slice(0, clampInteger(maxUrls, DEFAULT_HBX_ENGINE_COUNT, 1, getConfiguredHbxEngineMaxCount()));
}

function isProductionEnvironment(nodeEnv: unknown) {
  return String(nodeEnv || '').trim().toLowerCase() === 'production';
}

export function isHbxEngineLocalhostUrl(url: string) {
  return /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(url);
}

function sanitizeProductionEngineUrls(urls: string[], nodeEnv: unknown, replacementCount = urls.length) {
  if (!isProductionEnvironment(nodeEnv)) return urls;
  return urls.some(isHbxEngineLocalhostUrl) ? buildDockerHbxEngineUrls(replacementCount) : urls;
}

export function hasConfiguredHbxEngineUrlEnv(env: NodeJS.ProcessEnv = process.env) {
  const configuredCount = getConfiguredHbxEngineCount(env);
  const hasNumberedMassDataUrl = Array.from({ length: configuredCount }, (_, index) => (
    String(env[`HBX_MASS_DATA_ENGINE_URL_${index + 1}`] || '').trim()
  )).some(Boolean);

  return Boolean(
    String(env.HBX_ENGINE_URLS || '').trim()
      || String(env.HBX_MASS_DATA_ENGINE_URLS || '').trim()
      || hasNumberedMassDataUrl
      || String(env.HBX_SCRAPING_ENGINE_URL || '').trim(),
  );
}

export function resolveConfiguredHbxEngineUrls(
  env: NodeJS.ProcessEnv = process.env,
  databaseUrls: string[] = [],
) {
  const configuredCount = getConfiguredHbxEngineCount(env);
  const engineUrls = parseHbxEngineUrls(env.HBX_ENGINE_URLS, configuredCount);
  if (engineUrls.length) return sanitizeProductionEngineUrls(engineUrls, env.NODE_ENV, configuredCount);

  const massDataEngineUrls = parseHbxEngineUrls(env.HBX_MASS_DATA_ENGINE_URLS, configuredCount);
  if (massDataEngineUrls.length) return sanitizeProductionEngineUrls(massDataEngineUrls, env.NODE_ENV, configuredCount);

  const numberedMassDataUrls = parseHbxEngineUrls(
    Array.from({ length: configuredCount }, (_, index) => env[`HBX_MASS_DATA_ENGINE_URL_${index + 1}`]),
    configuredCount,
  );
  if (numberedMassDataUrls.length) return sanitizeProductionEngineUrls(numberedMassDataUrls, env.NODE_ENV, configuredCount);

  const scrapingEngineUrl = parseHbxEngineUrls(env.HBX_SCRAPING_ENGINE_URL, configuredCount);
  if (scrapingEngineUrl.length) {
    return sanitizeProductionEngineUrls(scrapingEngineUrl.slice(0, 1), env.NODE_ENV, 1);
  }

  const parsedDatabaseUrls = parseHbxEngineUrls(databaseUrls, configuredCount);
  if (parsedDatabaseUrls.length) return sanitizeProductionEngineUrls(parsedDatabaseUrls, env.NODE_ENV, configuredCount);

  return sanitizeProductionEngineUrls(buildLocalHbxEngineUrls(configuredCount), env.NODE_ENV, configuredCount);
}

@Injectable()
export class HbxEnginePoolService implements OnModuleInit {
  private readonly logger = new Logger(HbxEnginePoolService.name);
  private activeEngineCount = 1;
  private googleEmergencyMode = false;
  private lowQueueSinceByEngineCount = new Map<number, number>();
  private googleLowSince: number | null = null;
  private manualDemandUntil = 0;
  private lastSchedulerLogAt = 0;
  private lastSchedulerDetailLogAt = 0;
  private lastHighEngineAcquireAt = 0;
  private lastHighEngineDiagnosticAt = 0;
  private acquireCursorByPurpose = new Map<HbxEnginePurpose, number>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const urls = await this.getConfiguredEngineUrls().catch((error) => {
      this.logger.warn(`[hbx-engine-pool] failed to resolve configured engine urls: ${String((error as any)?.message || error)}`);
      return [];
    });
    this.logger.log(`[hbx-engine-pool] configured engine urls:\n${urls.map((url) => `- ${url}`).join('\n')}`);
  }

  async refreshEngineRegistryFromEnv() {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return [];
    const urls = await this.getConfiguredEngineUrls();
    const rows: EngineRegistryRow[] = [];

    for (const [index, url] of urls.entries()) {
      const id = `hbx-engine-${index + 1}`;
      const row = await (this.prisma as any).hbxEngineLock.upsert({
        where: { id },
        create: {
          id,
          engineIndex: index,
          url,
          status: 'standby',
        },
        update: {
          engineIndex: index,
          url,
        },
      });
      rows.push(row);
    }

    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        engineIndex: { lt: urls.length },
        status: 'inactive',
      },
      data: {
        status: 'standby',
        lastError: null,
        failureCount: 0,
        cooldownUntil: null,
      },
    }).catch(() => null);

    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        engineIndex: { lt: urls.length },
        cooldownUntil: { lt: new Date() },
      },
      data: {
        cooldownUntil: null,
        status: 'standby',
      },
    }).catch(() => null);

    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        engineIndex: { gte: urls.length },
        status: { not: 'inactive' },
      },
      data: {
        status: 'inactive',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
      },
    }).catch(() => null);

    return (this.prisma as any).hbxEngineLock.findMany({
      where: { engineIndex: { lt: urls.length } },
      orderBy: { engineIndex: 'asc' },
    }).catch(() => rows);
  }

  async healthCheckEngines() {
    const rows = await this.refreshEngineRegistryFromEnv();
    const now = new Date();
    const checkOne = async (row: EngineRegistryRow): Promise<EngineRegistryRow> => {
      const lastCheckedAt = row.lastCheckedAt instanceof Date ? row.lastCheckedAt : null;
      if (lastCheckedAt && Date.now() - lastCheckedAt.getTime() < HEALTH_CHECK_TTL_MS) {
        return row;
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
      const rawStatus = String(row.status || '').trim().toLowerCase();
      const desiredStopping = rawStatus === 'draining' || rawStatus === 'stopped';
      const paused = !desiredStopping && this.isEnginePaused(row, now.getTime());
      const pausedExpired = !row.manualPaused && row.pausedUntil instanceof Date && row.pausedUntil.getTime() <= now.getTime();
      const healthCooldownUntil = !paused && healthStatus === 'offline' && healthFailureCount >= 3
        ? new Date(Date.now() + Math.min(30, 2 ** healthFailureCount) * 60_000)
        : row.cooldownUntil || null;
      const isLocked = Boolean(row.lockedRunId && row.lockedUntil && row.lockedUntil.getTime() > Date.now());
      const inCooldown = !desiredStopping && Boolean(healthCooldownUntil && healthCooldownUntil.getTime() > Date.now());
      const status = rawStatus === 'stopped'
        ? 'stopped'
        : rawStatus === 'draining'
          ? isLocked ? 'draining' : 'stopped'
          : paused
        ? 'paused'
        : isLocked
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
          cooldownUntil: paused || desiredStopping ? null : healthCooldownUntil,
          ...(rawStatus === 'draining' && !isLocked ? { pausedUntil: null } : {}),
          ...(pausedExpired && !desiredStopping ? { pausedUntil: null } : {}),
          lastCheckedAt: now,
        },
      });
      return updated;
    };

    const checked: EngineRegistryRow[] = [];
    const concurrency = Math.min(Math.max(parseIntegerEnv('HBX_ENGINE_HEALTHCHECK_CONCURRENCY', 25), 1), 100);
    for (let index = 0; index < rows.length; index += concurrency) {
      const chunk = rows.slice(index, index + concurrency);
      const chunkResult = await Promise.all(chunk.map((row) => checkOne(row).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error || 'Healthcheck falhou.');
        return (this.prisma as any).hbxEngineLock.update({
          where: { id: row.id },
          data: {
            status: 'offline',
            lastHealthStatus: 'offline',
            lastError: message.slice(0, 500),
            failureCount: Math.min(Number(row.failureCount || 0) + 1, 6),
            lastCheckedAt: now,
          },
        }).catch(() => ({ ...row, status: 'offline', lastHealthStatus: 'offline', lastError: message }));
      })));
      checked.push(...chunkResult);
    }

    return checked.sort((left, right) => left.engineIndex - right.engineIndex);
  }

  async getCurrentCapacityLevel(): Promise<CapacityLevel> {
    const stats = await this.buildQueueStats();
    const operationalConfig = await this.getOperationalConfig();
    const turboEnabled = Boolean(operationalConfig?.enabled);
    const turboWindowActive = turboEnabled && this.isWithinConfiguredOperationalWindow(operationalConfig);
    const turboForcedNow = turboEnabled && this.isForcedTurboActive(operationalConfig);
    if (operationalConfig?.enabled) {
      if (this.isWithinOperationalWindow(operationalConfig)) {
        this.activeEngineCount = this.resolveOperationalEngineCount(operationalConfig);
        this.lowQueueSinceByEngineCount.clear();
      } else {
        this.activeEngineCount = 1;
        this.googleEmergencyMode = false;
        this.googleLowSince = null;
        this.lowQueueSinceByEngineCount.clear();
      }
    } else {
      const desiredEngineCount = this.resolveDesiredEngineCount(stats.queuedCount);
      this.activeEngineCount = Math.max(this.activeEngineCount, desiredEngineCount);
      this.applyHysteresis(stats.queuedCount);
    }
    this.activeEngineCount = Math.min(this.activeEngineCount, getConfiguredHbxEngineCount());

    const stuck = this.isQueueStuck(stats) && stats.runningCount >= this.activeEngineCount;
    const manualEmergencyDemandCount = await this.countManualGoogleEmergencyDemand().catch(() => 0);
    const emergencyDesired = manualEmergencyDemandCount >= this.googleEmergencyThreshold();
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

    const result: CapacityLevel = {
      activeEngineCount: this.activeEngineCount,
      googleEmergencyMode: this.googleEmergencyMode && !stuck,
      queuedCount: stats.queuedCount,
      runningCount: stats.runningCount,
      operationalStatus: stuck ? 'degraded' : 'healthy',
      message: stuck ? 'Fila de webscraping travada. Motores não estão entregando progresso.' : null,
      completedLast10Min: stats.completedLast10Min,
      partialLast10Min: stats.partialLast10Min,
      oldestQueuedAgeMinutes: stats.oldestQueuedAgeMinutes,
      isTurboEnabled: turboEnabled,
      isTurboWindowActive: turboWindowActive,
      isTurboForcedNow: turboForcedNow,
      forcedUntil: turboForcedNow ? this.serializeDate(this.getForcedUntilDate(operationalConfig)) : null,
      nextTurboAt: operationalConfig?.enabled ? this.nextOperationalWindowAt(operationalConfig) : null,
    };
    result.scheduler = await this.buildSchedulerStatus(result).catch(() => undefined);
    return result;
  }

  private buildEngineCapacityConfig(operationalConfig?: any): HbxEngineCapacityConfig {
    const metaStop = operationalConfig
      ? this.parseOperationalMetadata(operationalConfig.metadataJson).emergencyStop
      : false;
    const factoryStopped = Boolean(metaStop) || this.readBooleanEnv('HBX_FACTORY_EMERGENCY_STOP', false);
    return {
      configuredCount: getConfiguredHbxEngineCount(),
      maxCount: getConfiguredHbxEngineMaxCount(),
      warmMin: this.resolveElasticWarmMinEngines(),
      governorEnabled: ['1', 'true', 'yes', 'sim', 'on'].includes(
        String(process.env.HBX_ENGINE_GOVERNOR_ENABLED || '').trim().toLowerCase(),
      ),
      factoryStopped,
    };
  }

  async getDashboardEngineStatus(): Promise<HbxEngineDashboardStatus> {
    const generatedAt = new Date();
    const fallbackCapacity: CapacityLevel = {
      activeEngineCount: 1,
      googleEmergencyMode: false,
      queuedCount: 0,
      runningCount: 0,
      operationalStatus: 'healthy',
      message: null,
      completedLast10Min: 0,
      partialLast10Min: 0,
      oldestQueuedAgeMinutes: 0,
      isTurboEnabled: false,
      isTurboWindowActive: false,
      isTurboForcedNow: false,
      forcedUntil: null,
      nextTurboAt: null,
    };
    const configuredUrls = await this.getConfiguredEngineUrls();
    const operationalConfig = await this.getOperationalConfig().catch(() => null);

    if (!(await this.prisma.hasTable('HbxEngineLock'))) {
      const engines = this.buildDashboardEngines([], configuredUrls, fallbackCapacity, null, new Map(), operationalConfig);
      return {
        generatedAt: generatedAt.toISOString(),
        capacity: fallbackCapacity,
        engines,
        enginePanels: this.buildDashboardEnginePanels(engines, fallbackCapacity),
        diagnostics: ['Tabela HbxEngineLock ausente; painel mostra apenas URLs configuradas.'],
        capacityConfig: this.buildEngineCapacityConfig(operationalConfig),
      };
    }

    await this.cleanupExpiredLocks();
    const [capacity, rows, activeGoogleRun, activityStats] = await Promise.all([
      this.getCurrentCapacityLevel().catch(() => fallbackCapacity),
      this.healthCheckEngines().catch(() => [] as EngineRegistryRow[]),
      this.findActiveGoogleEmergencyRun().catch(() => null),
      this.buildEngineActivityStats().catch(() => new Map<string, EngineActivityStats>()),
    ]);

    const engines = this.buildDashboardEngines(rows, configuredUrls, capacity, activeGoogleRun, activityStats, operationalConfig);
    return {
      generatedAt: generatedAt.toISOString(),
      capacity,
      engines,
      enginePanels: this.buildDashboardEnginePanels(engines, capacity),
      diagnostics: this.buildDashboardEngineDiagnostics(rows, configuredUrls, capacity),
      capacityConfig: this.buildEngineCapacityConfig(operationalConfig),
    };
  }

  async getEligibleEnginesForCurrentQueue(purpose: HbxEnginePurpose = 'manual') {
    await this.cleanupExpiredLocks();
    const [capacity, engines] = await Promise.all([
      this.getCurrentCapacityLevel(),
      this.healthCheckEngines(),
    ]);
    const scheduler = await this.buildSchedulerStatus(capacity, engines).catch(() => capacity.scheduler || null);
    const eligible = this.resolveEligibleEngines(engines, capacity, scheduler, purpose);
    this.logSchedulerStatus(scheduler, {
      purpose,
      capacity,
      engines,
      eligible,
    });
    return eligible;
  }

  async acquireEngine(
    runId: string,
    companyId: number,
    userId: number,
    avoidEngineIdOrUrl?: string | { avoidEngineIdOrUrl?: string; purpose?: HbxEnginePurpose },
  ): Promise<HbxEngineLease | null> {
    const acquireOptions: { avoidEngineIdOrUrl?: string; purpose?: HbxEnginePurpose } = typeof avoidEngineIdOrUrl === 'object' && avoidEngineIdOrUrl !== null
      ? avoidEngineIdOrUrl
      : { avoidEngineIdOrUrl: avoidEngineIdOrUrl as string | undefined };
    const purpose = this.normalizePurpose(acquireOptions.purpose);
    if (!this.isAutomaticPurpose(purpose)) {
      this.manualDemandUntil = Date.now() + 30_000;
    }
    await this.cleanupExpiredLocks();
    const capacity = await this.getCurrentCapacityLevel();
    if (capacity.operationalStatus === 'degraded') {
      this.logger.warn(
        `[webscraping-capacity] ${capacity.message} queued=${capacity.queuedCount} running=${capacity.runningCount}`,
      );
      await this.logStuckQueueDetails();
      return null;
    }

    const avoid = String(acquireOptions.avoidEngineIdOrUrl || '').trim();
    const scheduler = capacity.scheduler || await this.buildSchedulerStatus(capacity).catch(() => null);
    if (this.isAutomaticPurpose(purpose) && scheduler && scheduler.automaticAllowedEngines <= 0) {
      this.logSchedulerStatus(scheduler);
      return null;
    }

    const eligible = this.rotateEligibleEngines((await this.getEligibleEnginesForCurrentQueue(purpose))
      .sort((left, right) => {
        const leftAvoided = avoid && (left.id === avoid || left.url === avoid) ? 1 : 0;
        const rightAvoided = avoid && (right.id === avoid || right.url === avoid) ? 1 : 0;
        return leftAvoided - rightAvoided || this.compareEngineAvailability(left, right);
      }), purpose);
    this.logHighEngineCoverage(purpose, eligible, scheduler);
    const lockedUntil = new Date(Date.now() + this.engineMaxBusyMinutes() * 60_000);

    for (const engine of eligible) {
      const isBusy = Boolean(engine.lockedRunId && engine.lockedUntil && engine.lockedUntil.getTime() > Date.now());
      if (isBusy) continue;

      const updated = await this.tryAcquireEngineLock(engine, runId, companyId, userId, lockedUntil);
      if (updated.count > 0) {
        if (engine.engineIndex >= 20) this.lastHighEngineAcquireAt = Date.now();
        this.acquireCursorByPurpose.set(purpose, engine.engineIndex + 1);
        if (scheduler) this.logSchedulerStatus(scheduler, { purpose, eligible, acquiredEngineId: engine.id, acquiredEngineIndex: engine.engineIndex });
        this.logger.log(`[engine-scheduler] acquired engine ${engine.id} purpose=${purpose} engineIndex=${engine.engineIndex + 1} eligible=${eligible.length} automaticAllowed=${scheduler?.automaticAllowedEngines ?? 'n/a'} activeEngineCount=${capacity.activeEngineCount}`);
        return {
          engineId: engine.id,
          engineIndex: engine.engineIndex,
          url: engine.url,
          lockedUntil,
          googleEmergencyMode: capacity.googleEmergencyMode,
        };
      }
    }

    if (!this.isAutomaticPurpose(purpose)) {
      const preempted = await this.preemptAutomaticEngineForClient(eligible);
      if (preempted) {
        const updated = await this.tryAcquireEngineLock(preempted, runId, companyId, userId, lockedUntil);
        if (updated.count > 0) {
          this.acquireCursorByPurpose.set(purpose, preempted.engineIndex + 1);
          this.logger.warn(`[engine-scheduler] client request preempted automatic engine ${preempted.id} purpose=${purpose}`);
          return {
            engineId: preempted.id,
            engineIndex: preempted.engineIndex,
            url: preempted.url,
            lockedUntil,
            googleEmergencyMode: capacity.googleEmergencyMode,
          };
        }
      }
      this.logger.warn(`[engine-scheduler] manual request waiting/freeing capacity purpose=${purpose}`);
    }
    return null;
  }

  private async tryAcquireEngineLock(
    engine: EngineRegistryRow,
    runId: string,
    companyId: number,
    userId: number,
    lockedUntil: Date,
  ) {
    return (this.prisma as any).hbxEngineLock.updateMany({
        where: {
          id: engine.id,
          status: { notIn: ['paused', 'draining', 'stopped', 'inactive', 'offline', 'cooldown', 'degraded'] },
          manualPaused: false,
          AND: [
            {
              OR: [
                { pausedUntil: null },
                { pausedUntil: { lt: new Date() } },
              ],
            },
          ],
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
  }

  private async preemptAutomaticEngineForClient(eligible: EngineRegistryRow[]) {
    const now = Date.now();
    const candidate = eligible
      .filter((engine) => engine.lockedRunId && engine.lockedUntil instanceof Date && engine.lockedUntil.getTime() > now)
      .filter((engine) => !this.isEngineDesiredStopping(engine))
      .filter((engine) => String(engine.lockedRunId || '').includes(':mass:'))
      .sort((left, right) => this.compareEngineAvailability(left, right))[0];
    if (!candidate) return null;

    await (this.prisma as any).webscrapingCampaignTask?.updateMany?.({
      where: {
        lockedByEngineId: candidate.id,
        status: 'running',
      },
      data: {
        status: 'queued',
        lockedByEngineId: null,
        lockedUntil: null,
        lastError: 'Motor liberado para pesquisa do cliente no Radar Digital.',
      },
    }).catch(() => null);

    const released = await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        id: candidate.id,
        lockedRunId: candidate.lockedRunId,
      },
      data: {
        status: 'online',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        lastError: null,
      },
    }).catch(() => ({ count: 0 }));
    if (released.count <= 0) return null;
    return {
      ...candidate,
      status: 'online',
      lockedRunId: null,
      lockedCompanyId: null,
      lockedUserId: null,
      lockedAt: null,
      lockedUntil: null,
    };
    }

  async releaseEngine(engineId: string) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const paused = this.isEnginePaused(current);
    const inCooldown = Boolean(current?.cooldownUntil instanceof Date && current.cooldownUntil.getTime() > Date.now());
    const degraded = String(current?.status || '') === 'degraded';
    const desiredStopping = this.isEngineDesiredStopping(current);
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: desiredStopping ? 'stopped' : paused ? 'paused' : inCooldown ? 'cooldown' : degraded ? 'degraded' : 'online',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        ...(desiredStopping ? { pausedUntil: null, cooldownUntil: null } : {}),
      },
    }).catch(() => null);
  }

  async markEngineBatchError(engineId: string, error: unknown) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const paused = this.isEnginePaused(current);
    const desiredStopping = this.isEngineDesiredStopping(current);
    const message = String((error as any)?.response?.message || (error as any)?.rawMessage || (error as any)?.message || error || 'Falha no lote HBX.');
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: desiredStopping ? 'stopped' : paused ? 'paused' : 'cooldown',
        lastError: message.slice(0, 500),
        cooldownUntil: paused || desiredStopping ? null : new Date(Date.now() + 60_000),
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        ...(desiredStopping ? { pausedUntil: null } : {}),
      },
    }).catch(() => null);
  }

  async markEngineBatchSuccess(engineId: string) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const paused = this.isEnginePaused(current);
    const desiredStopping = this.isEngineDesiredStopping(current);
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: desiredStopping ? 'stopped' : paused ? 'paused' : 'online',
        failureCount: 0,
        lastError: null,
        ...(desiredStopping ? { pausedUntil: null, cooldownUntil: null } : {}),
      },
    }).catch(() => null);
  }

  async markEngineFailed(engineId: string, error: unknown) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id: engineId } }).catch(() => null);
    const paused = this.isEnginePaused(current);
    const desiredStopping = this.isEngineDesiredStopping(current);
    const failureCount = Math.min(Number(current?.failureCount || 0) + 1, 6);
    const cooldownMinutes = Math.min(30, Math.max(2, 2 ** failureCount));
    const message = String((error as any)?.response?.message || (error as any)?.message || error || 'Falha no motor HBX.');
    await (this.prisma as any).hbxEngineLock.update({
      where: { id: engineId },
      data: {
        status: desiredStopping ? 'stopped' : paused ? 'paused' : 'cooldown',
        failureCount,
        cooldownUntil: paused || desiredStopping ? null : new Date(Date.now() + cooldownMinutes * 60_000),
        lastError: message.slice(0, 500),
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        ...(desiredStopping ? { pausedUntil: null } : {}),
      },
    }).catch(() => null);
  }

  async cleanupExpiredLocks() {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return;
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        status: 'draining',
        lockedRunId: { not: null },
        lockedUntil: { lt: new Date() },
      },
      data: {
        status: 'stopped',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        pausedUntil: null,
        cooldownUntil: null,
        lastError: 'Dreno concluido; motor aguardando parada fisica pelo governor.',
      },
    }).catch(() => null);
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: {
        lockedRunId: { not: null },
        lockedUntil: { lt: new Date() },
        status: { notIn: ['draining', 'stopped'] },
        manualPaused: false,
        OR: [
          { pausedUntil: null },
          { pausedUntil: { lt: new Date() } },
        ],
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

  async pauseEngine(engineId: string, options: { minutes?: number | null } = {}) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return this.getDashboardEngineStatus();
    const id = this.normalizeEngineId(engineId);
    if (!id) return this.getDashboardEngineStatus();
    await this.refreshEngineRegistryFromEnv().catch(() => []);
    const minutes = Math.max(0, Math.trunc(Number(options.minutes || 0)));
    const pausedUntil = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: { id },
      data: {
        status: 'paused',
        manualPaused: !pausedUntil,
        pausedUntil,
        cooldownUntil: null,
      },
    }).catch(() => null);
    return this.getDashboardEngineStatus();
  }

  async resumeEngine(engineId: string) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return this.getDashboardEngineStatus();
    const id = this.normalizeEngineId(engineId);
    if (!id) return this.getDashboardEngineStatus();
    await this.refreshEngineRegistryFromEnv().catch(() => []);
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id } }).catch(() => null);
    const locked = Boolean(current?.lockedUntil instanceof Date && current.lockedUntil.getTime() > Date.now());
    const offline = String(current?.lastHealthStatus || '').toLowerCase() === 'offline';
    const resumedStatus = locked ? 'busy' : offline ? 'offline' : Number(current?.engineIndex || 0) === 0 ? 'online' : 'standby';
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: { id },
      data: {
        status: resumedStatus,
        manualPaused: false,
        pausedUntil: null,
      },
    }).catch(() => null);
    return this.getDashboardEngineStatus();
  }

  async drainEngine(engineId: string, options: { seconds?: number | null } = {}) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return this.getDashboardEngineStatus();
    const id = this.normalizeEngineId(engineId);
    if (!id) return this.getDashboardEngineStatus();
    await this.refreshEngineRegistryFromEnv().catch(() => []);
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id } }).catch(() => null);
    if (!current) return this.getDashboardEngineStatus();

    const locked = this.isEngineCurrentlyBusy(current);
    const drainTimeoutSeconds = await this.resolveEngineDrainTimeoutSeconds(options.seconds);
    const drainUntil = locked ? new Date(Date.now() + drainTimeoutSeconds * 1000) : null;
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: { id },
      data: {
        status: locked ? 'draining' : 'stopped',
        manualPaused: false,
        pausedUntil: drainUntil,
        cooldownUntil: null,
        lastError: locked
          ? 'Drenando: novas leases bloqueadas ate o job atual terminar.'
          : 'Dreno concluido sem lease ativa; motor aguardando parada fisica pelo governor.',
      },
    }).catch(() => null);
    return this.getDashboardEngineStatus();
  }

  async stopEngine(engineId: string, options: { force?: boolean; seconds?: number | null } = {}) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return this.getDashboardEngineStatus();
    const id = this.normalizeEngineId(engineId);
    if (!id) return this.getDashboardEngineStatus();
    await this.refreshEngineRegistryFromEnv().catch(() => []);
    const current = await (this.prisma as any).hbxEngineLock.findUnique({ where: { id } }).catch(() => null);
    if (!current) return this.getDashboardEngineStatus();

    const locked = this.isEngineCurrentlyBusy(current);
    if (locked && !options.force) {
      return this.drainEngine(id, { seconds: options.seconds });
    }

    if (locked && options.force) {
      await this.requeueActiveLeaseForEngine(id, 'Lease devolvida para fila por parada forçada do motor.');
    }

    await (this.prisma as any).hbxEngineLock.updateMany({
      where: { id },
      data: {
        status: 'stopped',
        manualPaused: false,
        pausedUntil: null,
        cooldownUntil: null,
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        lastError: locked && options.force
          ? 'Motor parado apos devolver lease ativa para a fila.'
          : 'Motor aguardando parada fisica pelo governor.',
      },
    }).catch(() => null);
    return this.getDashboardEngineStatus();
  }

  async drainFactoryEngines(options: { force?: boolean; seconds?: number | null; reason?: string } = {}) {
    if (!(await this.prisma.hasTable('HbxEngineLock'))) return { affected: 0 };
    await this.refreshEngineRegistryFromEnv().catch(() => []);
    const [rows, scheduler] = await Promise.all([
      (this.prisma as any).hbxEngineLock.findMany({
        where: {
          id: { startsWith: 'hbx-engine-' },
          status: { notIn: ['stopped', 'inactive', 'offline'] },
        },
        orderBy: { engineIndex: 'asc' },
      }).catch(() => []),
      this.getSchedulerStatus().catch(() => null),
    ]);
    const manualReserved = Math.max(1, Math.trunc(Number(
      scheduler?.manualReservedEngines ?? this.resolveManualReservedEngines(getConfiguredHbxEngineCount()),
    )));
    let affected = 0;
    for (const row of rows) {
      const purpose = this.inferLeasePurpose(row);
      const factoryIndexed = Math.trunc(Number(row?.engineIndex || 0)) >= manualReserved;
      const factoryLease = purpose === 'mass_data' || purpose === 'autonomous';
      if (!factoryLease && !factoryIndexed) continue;
      if (options.force) {
        await this.stopEngine(row.id, { force: true, seconds: options.seconds });
      } else {
        await this.drainEngine(row.id, { seconds: options.seconds });
      }
      affected += 1;
    }
    if (affected > 0) {
      this.logger.warn(`[factory-stop] desired factory engines drained affected=${affected} force=${Boolean(options.force)} reason=${options.reason || 'factory_stop'}`);
    }
    return { affected };
  }

  async canUseGoogleEmergencyForRun() {
    const capacity = await this.getCurrentCapacityLevel();
    if (!capacity.googleEmergencyMode || capacity.operationalStatus === 'degraded') return false;
    return (await this.countGoogleEmergencyToday()) < this.googleEmergencyDailyLimit();
  }

  googleEmergencyMaxPerRun() {
    return parseIntegerEnv('HBX_GOOGLE_EMERGENCY_MAX_PER_RUN', 20);
  }

  async getSchedulerStatus() {
    const capacity = await this.getCurrentCapacityLevel().catch(() => null);
    return this.buildSchedulerStatus(capacity || undefined);
  }

  async syncElasticEngineDesiredStates(): Promise<HbxEngineElasticSyncResult> {
    const configuredEngineCount = getConfiguredHbxEngineCount();
    if (!(await this.prisma.hasTable('HbxEngineLock').catch(() => false))) {
      return {
        synced: false,
        configuredEngineCount,
        desiredRunningCount: this.resolveElasticWarmMinEngines(configuredEngineCount),
        updatedRunningCount: 0,
        updatedStoppingCount: 0,
        scheduler: null,
      };
    }

    await this.cleanupExpiredLocks();
    const [capacity, rows] = await Promise.all([
      this.getCurrentCapacityLevel(),
      this.healthCheckEngines(),
    ]);
    const scheduler = await this.buildSchedulerStatus(capacity, rows).catch(() => capacity.scheduler || null);
    const desiredRunningCount = this.resolveElasticDesiredRunningCount(capacity, scheduler);
    const result = await this.applyElasticDesiredStates(rows, desiredRunningCount);

    return {
      synced: true,
      configuredEngineCount,
      desiredRunningCount,
      updatedRunningCount: result.updatedRunningCount,
      updatedStoppingCount: result.updatedStoppingCount,
      scheduler,
    };
  }

  private normalizePurpose(value: unknown): HbxEnginePurpose {
    const purpose = String(value || '').trim().toLowerCase();
    if (purpose === 'radar_pull' || purpose === 'radar_digital' || purpose === 'lead_plus_enrichment' || purpose === 'vendas' || purpose === 'autonomous' || purpose === 'mass_data') {
      return purpose;
    }
    return 'manual';
  }

  private isAutomaticPurpose(purpose: HbxEnginePurpose) {
    return purpose === 'autonomous' || purpose === 'mass_data';
  }

  private resolveManualReservedEngines(configuredCount = getConfiguredHbxEngineCount()) {
    const configured = Math.max(1, Math.trunc(Number(configuredCount || 1)));
    const parsed = parseIntegerEnv(
      'HBX_CLIENT_RESERVED_ENGINES',
      parseIntegerEnv('HBX_MANUAL_RESERVED_ENGINES', 2),
    );
    if (configured <= 1) return 0;
    return Math.min(Math.max(0, parsed), configured - 1);
  }

  private resolveAutonomousMinEngines() {
    return Math.max(0, parseIntegerEnv('HBX_FACTORY_MIN_ENGINES', parseIntegerEnv('HBX_AUTONOMOUS_MIN_ENGINES', 1)));
  }

  private resolveElasticWarmMinEngines(configuredCount = getConfiguredHbxEngineCount()) {
    const configured = Math.max(1, Math.trunc(Number(configuredCount || 1)));
    const parsed = parseIntegerEnv(
      'HBX_ENGINE_WARM_MIN',
      parseIntegerEnv('HBX_FACTORY_IDLE_MIN_ENGINES', 1),
    );
    return Math.min(Math.max(1, parsed), configured);
  }

  private resolveElasticDesiredRunningCount(
    capacity?: CapacityLevel | null,
    scheduler?: HbxEngineSchedulerStatus | null,
  ) {
    const configuredCount = getConfiguredHbxEngineCount();
    const warmMin = this.resolveElasticWarmMinEngines(configuredCount);
    const automaticTarget = Math.max(0, Math.trunc(Number(scheduler?.automaticAllowedEngines || 0)));
    const activeTarget = Math.max(0, Math.trunc(Number(capacity?.activeEngineCount || 0)));
    const manualReserve = scheduler?.clientPriorityActive
      ? Math.max(0, Math.trunc(Number(scheduler.manualReservedEngines || 0)))
      : 0;
    const demandTarget = scheduler?.manualDemandActive
      ? Math.max(manualReserve, Math.min(activeTarget, configuredCount))
      : 0;
    return Math.min(
      configuredCount,
      Math.max(warmMin, manualReserve, automaticTarget, demandTarget),
    );
  }

  private async applyElasticDesiredStates(rows: EngineRegistryRow[], desiredRunningCount: number) {
    const configuredCount = getConfiguredHbxEngineCount();
    const target = Math.max(
      this.resolveElasticWarmMinEngines(configuredCount),
      Math.min(configuredCount, Math.trunc(Number(desiredRunningCount || 0))),
    );
    const nowMs = Date.now();
    const drainTimeoutSeconds = await this.resolveEngineDrainTimeoutSeconds().catch(() => 90);
    const drainUntil = new Date(nowMs + drainTimeoutSeconds * 1000);
    let updatedRunningCount = 0;
    let updatedStoppingCount = 0;

    for (const row of rows) {
      if (row.engineIndex >= configuredCount) continue;
      if (this.isEnginePaused(row, nowMs)) continue;
      const status = String(row.status || '').trim().toLowerCase();
      const busy = this.isEngineCurrentlyBusy(row, nowMs);
      const shouldRun = row.engineIndex < target;

      if (shouldRun) {
        if (['stopped', 'inactive', 'offline', 'cooldown', 'draining'].includes(status)) {
          const nextStatus = busy ? 'busy' : row.engineIndex === 0 ? 'online' : 'standby';
          const updated = await (this.prisma as any).hbxEngineLock.updateMany({
            where: { id: row.id },
            data: {
              status: nextStatus,
              manualPaused: false,
              pausedUntil: null,
              cooldownUntil: null,
              lastError: null,
            },
          }).catch(() => ({ count: 0 }));
          updatedRunningCount += Number(updated?.count || 0);
        }
        continue;
      }

      if (status === 'stopped' || status === 'inactive') continue;
      const updated = await (this.prisma as any).hbxEngineLock.updateMany({
        where: { id: row.id },
        data: busy
          ? {
              status: 'draining',
              manualPaused: false,
              pausedUntil: drainUntil,
              cooldownUntil: null,
              lastError: 'Governor elastico drenando motor acima do alvo atual.',
            }
          : {
              status: 'stopped',
              manualPaused: false,
              pausedUntil: null,
              cooldownUntil: null,
              lockedRunId: null,
              lockedCompanyId: null,
              lockedUserId: null,
              lockedAt: null,
              lockedUntil: null,
              lastError: 'Governor elastico reduziu capacidade ociosa.',
            },
      }).catch(() => ({ count: 0 }));
      updatedStoppingCount += Number(updated?.count || 0);
    }

    return { updatedRunningCount, updatedStoppingCount };
  }

  private resolveFactoryMaxEngines(configuredCount = getConfiguredHbxEngineCount()) {
    const raw = String(process.env.HBX_FACTORY_MAX_ENGINES || '').trim();
    if (!raw) return null;
    const parsed = parseIntegerEnv('HBX_FACTORY_MAX_ENGINES', configuredCount);
    return Math.max(0, Math.min(configuredCount, parsed));
  }

  private isWithinClientPriorityWindow(date = new Date()) {
    const start = Math.min(Math.max(parseIntegerEnv('HBX_RADAR_CLIENT_PRIORITY_START_HOUR', 8), 0), 23);
    const end = Math.min(Math.max(parseIntegerEnv('HBX_RADAR_CLIENT_PRIORITY_END_HOUR', 20), 0), 23);
    const hour = date.getHours();
    if (start === end) return true;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  private autonomousMaxMemoryPressurePercent() {
    return Math.min(Math.max(parseIntegerEnv('HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT', 82), 1), 100);
  }

  private factoryMemorySoftPressurePercent() {
    return this.readIntegerEnv(
      'HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT',
      this.readIntegerEnv('HBX_FACTORY_MEMORY_SOFT_PRESSURE', this.autonomousMaxMemoryPressurePercent(), 1, 100),
      1,
      100,
    );
  }

  private factoryMemoryHardPressurePercent(softPressure = this.factoryMemorySoftPressurePercent()) {
    const fallback = Math.max(softPressure, 85);
    const parsed = this.readIntegerEnv(
      'HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT',
      this.readIntegerEnv('HBX_FACTORY_MEMORY_HARD_PRESSURE', fallback, 1, 100),
      1,
      100,
    );
    return Math.max(softPressure, parsed);
  }

  private factoryMemoryPanicPressurePercent(hardPressure = this.factoryMemoryHardPressurePercent()) {
    const fallback = Math.max(hardPressure, 88);
    const parsed = this.readIntegerEnv(
      'HBX_FACTORY_MEMORY_PANIC_PRESSURE_PERCENT',
      this.readIntegerEnv('HBX_FACTORY_MEMORY_PANIC_PRESSURE', fallback, 1, 100),
      1,
      100,
    );
    return Math.max(hardPressure, parsed);
  }

  private resolveMemoryPressurePercent(operationalConfig?: any) {
    try {
      const hostPressure = parseHostMemoryPressurePercent(readFileSync('/proc/meminfo', 'utf8'));
      if (hostPressure != null) return hostPressure;
    } catch {
      // Non-Linux/dev fallback below.
    }

    const memory = process.memoryUsage();
    const envLimitMb = Number(String(process.env.HBX_MEMORY_LIMIT_MB || process.env.WEBSCRAPING_MEMORY_LIMIT_MB || '').trim());
    const targetGb = Number(operationalConfig?.memoryTargetGb || 0);
    const limitBytes = Number.isFinite(envLimitMb) && envLimitMb > 0
      ? envLimitMb * 1024 * 1024
      : Number.isFinite(targetGb) && targetGb > 0
        ? targetGb * 1024 * 1024 * 1024
        : 0;
    const rssPressure = limitBytes > 0 ? (memory.rss / limitBytes) * 100 : 0;
    return Math.max(0, Math.min(100, Math.round(rssPressure)));
  }

  private isHealthyEngine(engine: EngineRegistryRow, now = Date.now()) {
    if (this.isEngineLeaseBlocked(engine, now)) return false;
    if (this.isEnginePaused(engine, now)) return false;
    const status = String(engine.status || '').trim().toLowerCase();
    const health = String(engine.lastHealthStatus || engine.status || '').trim().toLowerCase();
    if (status === 'paused' || status === 'offline' || status === 'cooldown' || status === 'degraded') return false;
    if (health === 'offline') return false;
    if (engine.cooldownUntil instanceof Date && engine.cooldownUntil.getTime() > now) return false;
    return true;
  }

  private async hasManualDemand() {
    if (this.manualDemandUntil > Date.now()) return true;
    if (!(await this.prisma.hasTable('WebscrapingSearchRun').catch(() => false))) return false;
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.count) return false;
    const count = await delegate.count({
      where: {
        status: { in: ['queued', 'running'] },
        OR: [
          { assignedEngineId: null },
          { nextRetryAt: { lte: new Date() } },
        ],
      },
    }).catch(() => 0);
    return count > 0;
  }

  private async countManualGoogleEmergencyDemand() {
    if (!(await this.prisma.hasTable('WebscrapingSearchRun').catch(() => false))) return 0;
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.count) return 0;
    return delegate.count({
      where: {
        status: { in: ['queued', 'running'] },
      },
    }).catch(() => 0);
  }

  private async buildSchedulerStatus(
    capacity?: CapacityLevel | null,
    engineRows?: EngineRegistryRow[],
  ): Promise<HbxEngineSchedulerStatus> {
    const configuredCount = getConfiguredHbxEngineCount();
    const [engines, operationalConfig, manualDemandActive, configuredUrls] = await Promise.all([
      engineRows ? Promise.resolve(engineRows) : this.healthCheckEngines().catch(() => [] as EngineRegistryRow[]),
      this.getOperationalConfig().catch(() => null),
      this.hasManualDemand().catch(() => this.manualDemandUntil > Date.now()),
      this.getConfiguredEngineUrls().catch(() => [] as string[]),
    ]);
    const now = Date.now();
    const onlineHealthyEngines = engines
      .filter((engine) => engine.engineIndex < configuredCount)
      .filter((engine) => this.isHealthyEngine(engine, now))
      .length;
    const clientPriorityActive = this.isWithinClientPriorityWindow() || manualDemandActive;
    const manualReservedEngines = clientPriorityActive ? this.resolveManualReservedEngines(configuredCount) : 0;
    const memoryPressurePercent = this.resolveMemoryPressurePercent(operationalConfig);
    const factoryCapacity = Math.max(0, configuredCount - manualReservedEngines);
    const autonomousMin = Math.min(this.resolveAutonomousMinEngines(), factoryCapacity);
    const factoryMaxEngines = this.resolveFactoryMaxEngines(configuredCount);
    const factoryAllowance = this.resolveFactoryAllowedEngines({
      engineCount: configuredCount,
      onlineHealthyEngines: configuredCount,
      manualReservedEngines,
      clientPriorityActive,
      manualDemandActive,
      memoryPressurePercent,
      operationalConfig,
      factoryMaxEngines,
    });
    const degraded = String(capacity?.operationalStatus || '') === 'degraded';
    const activeTarget = Math.max(0, Math.min(configuredCount, Math.trunc(Number(capacity?.activeEngineCount || configuredCount))));
    let automaticAllowedEngines = degraded ? 0 : Math.min(factoryAllowance.allowedEngines, activeTarget);
    if (!manualDemandActive && !degraded) {
      automaticAllowedEngines = factoryAllowance.allowedEngines > 0
        ? Math.max(automaticAllowedEngines, Math.min(autonomousMin, factoryAllowance.allowedEngines, Math.max(activeTarget, autonomousMin)))
        : 0;
    }
    if (factoryMaxEngines != null) {
      automaticAllowedEngines = Math.min(automaticAllowedEngines, factoryMaxEngines);
    }
    automaticAllowedEngines = Math.max(0, Math.min(factoryCapacity, automaticAllowedEngines));
    const productionMode: HbxEngineSchedulerStatus['productionMode'] = manualDemandActive
      ? 'protected'
      : automaticAllowedEngines < factoryCapacity
        ? 'reduced'
        : 'full';
    const scheduler: HbxEngineSchedulerStatus = {
      configuredEngineCount: configuredCount,
      configuredUrlsCount: configuredUrls.length,
      registryRowsCount: engines.length,
      activeEngineCount: capacity?.activeEngineCount,
      manualReservedEngines,
      clientPriorityActive,
      automaticAllowedEngines,
      factoryMinEngines: autonomousMin,
      factoryMaxEngines: factoryAllowance.maxEngines,
      onlineHealthyEngines,
      memoryPressurePercent,
      googleMode: 'manual_only',
      manualDemandActive,
      productionMode,
      statusCounts: this.buildEngineStatusCounts(engines),
      factory: factoryAllowance,
    };
    const eligible = this.resolveEligibleEngines(engines, capacity || {
      activeEngineCount: configuredCount,
      googleEmergencyMode: false,
      queuedCount: 0,
      runningCount: 0,
      operationalStatus: 'healthy',
      message: null,
      completedLast10Min: 0,
      partialLast10Min: 0,
      oldestQueuedAgeMinutes: 0,
      isTurboEnabled: false,
      isTurboWindowActive: false,
      isTurboForcedNow: false,
      forcedUntil: null,
      nextTurboAt: null,
    }, scheduler, 'mass_data');
    scheduler.eligibleEnginesCount = eligible.length;
    scheduler.firstEligibleEngine = eligible[0]?.id || null;
    scheduler.lastEligibleEngine = eligible.at(-1)?.id || null;
    return scheduler;
  }

  private resolveEligibleEngines(
    engines: EngineRegistryRow[],
    capacity: CapacityLevel,
    scheduler: HbxEngineSchedulerStatus | null | undefined,
    purpose: HbxEnginePurpose,
  ) {
    const now = Date.now();
    const configuredCount = getConfiguredHbxEngineCount();
    const automatic = this.isAutomaticPurpose(purpose);
    const range = getHbxEnginePurposeRange(purpose, configuredCount);
    const activeLimit = automatic
      ? Math.max(0, Math.min(configuredCount, scheduler?.automaticAllowedEngines ?? capacity.activeEngineCount))
      : configuredCount;
    return engines
      .filter((engine) => engine.engineIndex < activeLimit)
      .filter((engine) => engine.engineIndex >= range.start && engine.engineIndex < range.endExclusive)
      .filter((engine) => !this.isEngineLeaseBlocked(engine, now))
      .filter((engine) => String(engine.lastHealthStatus || engine.status) !== 'offline')
      .filter((engine) => !engine.cooldownUntil || engine.cooldownUntil.getTime() <= now)
      .sort((left, right) => this.compareEngineAvailability(left, right));
  }

  private rotateEligibleEngines(eligible: EngineRegistryRow[], purpose: HbxEnginePurpose) {
    if (eligible.length <= 1) return eligible;
    const cursor = Math.max(0, Math.trunc(Number(this.acquireCursorByPurpose.get(purpose) || 0)));
    const firstAtOrAfterCursor = eligible.findIndex((engine) => engine.engineIndex >= cursor);
    const start = firstAtOrAfterCursor >= 0 ? firstAtOrAfterCursor : 0;
    return [...eligible.slice(start), ...eligible.slice(0, start)];
  }

  private buildEngineStatusCounts(engines: EngineRegistryRow[] = []): HbxEngineStatusCounts {
    const counts: HbxEngineStatusCounts = {
      online: 0,
      standby: 0,
      busy: 0,
      draining: 0,
      stopped: 0,
      cooldown: 0,
      paused: 0,
      offline: 0,
      inactive: 0,
      degraded: 0,
      missing: 0,
    };
    for (const engine of engines) {
      const status = String(engine?.status || 'missing').trim().toLowerCase();
      if (status in counts) {
        counts[status as keyof HbxEngineStatusCounts] += 1;
      } else {
        counts.missing += 1;
      }
    }
    return counts;
  }

  private summarizeHighEngineExclusions(engines: EngineRegistryRow[] = [], eligible: EngineRegistryRow[] = []) {
    const eligibleIds = new Set(eligible.map((engine) => engine.id));
    const highEngines = engines.filter((engine) => engine.engineIndex >= 20);
    const excluded = highEngines.filter((engine) => !eligibleIds.has(engine.id));
    const counts = {
      offline: 0,
      cooldown: 0,
      paused: 0,
      busy: 0,
      outsideActiveLimit: 0,
      other: 0,
    };
    const now = Date.now();
    for (const engine of excluded) {
      const status = String(engine.status || '').toLowerCase();
      const health = String(engine.lastHealthStatus || engine.status || '').toLowerCase();
      if (status === 'draining' || status === 'stopped') counts.paused += 1;
      else if (this.isEnginePaused(engine, now) || status === 'paused') counts.paused += 1;
      else if (health === 'offline' || status === 'offline') counts.offline += 1;
      else if (status === 'cooldown' || (engine.cooldownUntil instanceof Date && engine.cooldownUntil.getTime() > now)) counts.cooldown += 1;
      else if (this.isEngineCurrentlyBusy(engine, now)) counts.busy += 1;
      else counts.outsideActiveLimit += 1;
    }
    return counts;
  }

  private logHighEngineCoverage(
    purpose: HbxEnginePurpose,
    eligible: EngineRegistryRow[],
    scheduler?: HbxEngineSchedulerStatus | null,
  ) {
    if (!this.isAutomaticPurpose(purpose)) return;
    if (eligible.length <= 20 || Math.trunc(Number(scheduler?.automaticAllowedEngines || 0)) <= 20) return;
    const now = Date.now();
    if (this.lastHighEngineAcquireAt && now - this.lastHighEngineAcquireAt < 60_000) return;
    if (now - this.lastHighEngineDiagnosticAt < 60_000) return;
    this.lastHighEngineDiagnosticAt = now;
    const firstHigh = eligible.find((engine) => engine.engineIndex >= 20);
    this.logger.warn(
      `[engine-scheduler] eligible=${eligible.length}/${getConfiguredHbxEngineCount()} automaticAllowed=${scheduler?.automaticAllowedEngines ?? 'n/a'} but no acquired engine >20 in last minute; firstHighEligible=${firstHigh?.id || 'none'} activeEngineCount=${scheduler?.activeEngineCount ?? 'n/a'}`,
    );
  }

  private logSchedulerStatus(scheduler?: HbxEngineSchedulerStatus | null, context: {
    purpose?: HbxEnginePurpose;
    capacity?: CapacityLevel;
    engines?: EngineRegistryRow[];
    eligible?: EngineRegistryRow[];
    acquiredEngineId?: string;
    acquiredEngineIndex?: number;
  } = {}) {
    if (!scheduler) return;
    if (Date.now() - this.lastSchedulerLogAt < 15_000) return;
    this.lastSchedulerLogAt = Date.now();
    const engines = context.engines || [];
    const eligible = context.eligible || [];
    const counts = scheduler.statusCounts || this.buildEngineStatusCounts(engines);
    const firstEligible = eligible[0]?.id || scheduler.firstEligibleEngine || 'none';
    const lastEligible = eligible.at(-1)?.id || scheduler.lastEligibleEngine || 'none';
    this.logger.log(
      `[engine-scheduler] configured=${scheduler.configuredEngineCount ?? getConfiguredHbxEngineCount()} urls=${scheduler.configuredUrlsCount ?? 'n/a'} registry=${scheduler.registryRowsCount ?? engines.length} onlineHealthy=${scheduler.onlineHealthyEngines} eligible=${eligible.length || scheduler.eligibleEnginesCount || 0} activeEngineCount=${context.capacity?.activeEngineCount ?? scheduler.activeEngineCount ?? 'n/a'} automaticAllowed=${scheduler.automaticAllowedEngines} clientReserved=${scheduler.manualReservedEngines} pressure=${scheduler.memoryPressurePercent}% mode=${scheduler.productionMode} purpose=${context.purpose || 'n/a'} firstEligible=${firstEligible} lastEligible=${lastEligible} acquired=${context.acquiredEngineId || 'none'} counts=online:${counts.online},standby:${counts.standby},busy:${counts.busy},draining:${counts.draining},stopped:${counts.stopped},cooldown:${counts.cooldown},paused:${counts.paused},offline:${counts.offline},inactive:${counts.inactive}`,
    );
    if (scheduler.factory) {
      const factory = scheduler.factory;
      const window = factory.windowStatus === 'open' ? 'open' : 'closed';
      this.logger.log(
        `[factory-scheduler] window=${window} emergencyStop=${factory.emergencyStop} max=${factory.maxEngines} memoryGuard=${factory.memoryGuardEngines} automaticAllowed=${scheduler.automaticAllowedEngines} reason=${factory.reason} pressure=${factory.memoryPressurePercent}% clientPriority=${scheduler.clientPriorityActive} nextStart=${this.formatOperationalTime(factory.startHour, factory.startMinute)} nextStop=${this.formatOperationalTime(factory.endHour, factory.endMinute)}`,
      );
    }
    const shouldDetail = eligible.length < scheduler.automaticAllowedEngines || (scheduler.automaticAllowedEngines > 20 && !eligible.some((engine) => engine.engineIndex >= 20));
    if (!shouldDetail || Date.now() - this.lastSchedulerDetailLogAt < 45_000) return;
    this.lastSchedulerDetailLogAt = Date.now();
    const highReasons = this.summarizeHighEngineExclusions(engines, eligible);
    const sampleErrors = engines
      .filter((engine) => engine.engineIndex >= 20 && engine.lastError)
      .slice(0, 5)
      .map((engine) => `${engine.id}:${String(engine.lastError).slice(0, 120)}`);
    this.logger.warn(
      `[engine-scheduler-detail] eligible=${eligible.length}/${scheduler.configuredEngineCount ?? getConfiguredHbxEngineCount()} automaticAllowed=${scheduler.automaticAllowedEngines} reason21plus=offline:${highReasons.offline},cooldown:${highReasons.cooldown},paused:${highReasons.paused},busy:${highReasons.busy},outsideActiveLimit:${highReasons.outsideActiveLimit} sampleErrors=${sampleErrors.join(' | ') || 'none'}`,
    );
  }

  private buildDashboardEngines(
    rows: EngineRegistryRow[],
    configuredUrls: string[],
    capacity: CapacityLevel,
    activeGoogleRun: { googleEmergencyUsedCount: number; updatedAt?: Date | null } | null,
    activityStats: Map<string, EngineActivityStats>,
    operationalConfig: any,
  ): HbxEngineDashboardEngine[] {
    const byIndex = new Map(rows.map((row) => [row.engineIndex, row]));
    const now = Date.now();
    const hasActiveQueue = capacity.queuedCount > 0 || capacity.runningCount > 0;
    const engines: HbxEngineDashboardEngine[] = [];
    const engineCount = Math.max(configuredUrls.length, getConfiguredHbxEngineCount());
    const activeEngineCount = Math.max(1, Math.min(engineCount, capacity.activeEngineCount || 1));
    const nextTurboLabel = operationalConfig?.enabled ? this.formatOperationalTime(operationalConfig.startHour, operationalConfig.startMinute) : null;

    for (let index = 0; index < engineCount; index += 1) {
      const row = byIndex.get(index);
      const configured = Boolean(configuredUrls[index]);
      const rawStatus = String(row?.status || (configured ? (index === 0 ? 'online' : 'standby') : 'missing')).trim();
      const normalizedRawStatus = rawStatus.toLowerCase();
      const desiredState = this.resolveEngineDesiredState(row);
      const draining = desiredState === 'draining';
      const stopped = desiredState === 'stopped';
      const paused = !draining && !stopped && (this.isEnginePaused(row, now) || normalizedRawStatus === 'paused');
      const status = paused ? 'paused' : rawStatus;
      const lockUrl = String(row?.url || configuredUrls[index] || '').trim() || null;
      const locked = Boolean(row?.lockedUntil instanceof Date && row.lockedUntil.getTime() > now);
      const activity = activityStats.get(row?.id || `hbx-engine-${index + 1}`) || {
        activeRunId: null,
        activeCampaignId: null,
        lastActivityAt: null,
        processedLast10Min: 0,
        errorCount: 0,
      };
      const normalizedHealth = String(row?.lastHealthStatus || '').trim().toLowerCase();
      const actualState = this.resolveEngineActualState({ configured, desiredState, status, lastHealthStatus: row?.lastHealthStatus || null });
      const offlineByHealthcheck = configured && (status === 'offline' || normalizedHealth === 'offline');
      const inCooldown = !paused && !draining && !stopped && (status === 'cooldown' || Boolean(row?.cooldownUntil instanceof Date && row.cooldownUntil.getTime() > now));
      const availableForQueue = configured && !paused && !draining && !stopped && !offlineByHealthcheck && !['cooldown', 'degraded', 'missing'].includes(status);
      const queueActivated = availableForQueue && hasActiveQueue && index < activeEngineCount;
      const running = !paused && (locked || status === 'busy' || Boolean(activity.activeRunId || activity.activeCampaignId));
      const online = configured && !offlineByHealthcheck;
      const heartbeatAgeSeconds = row?.lastCheckedAt instanceof Date
        ? Math.max(0, Math.round((now - row.lastCheckedAt.getTime()) / 1000))
        : null;
      const queueShare = queueActivated ? Math.round(100 / activeEngineCount) : 0;
      const usagePercent = this.resolveDashboardUsagePercent({
        configured,
        online,
        running,
        queueActivated,
        inCooldown,
        paused,
        index,
        capacity,
        processedLast10Min: activity.processedLast10Min,
      });
      const baseStateLabel = this.resolveDashboardStateLabel({
        configured,
        online,
        running,
        queueActivated,
        inCooldown,
        paused,
        status,
        hasHealthcheck: Boolean(row?.lastCheckedAt),
        isTurboArmed: Boolean(operationalConfig?.enabled && !capacity.isTurboWindowActive && !capacity.isTurboForcedNow),
        nextTurboLabel,
      });
      const stateLabel = draining ? 'Drenando' : stopped ? 'Parado' : baseStateLabel;
      const lastActivityAt = activity.lastActivityAt || row?.lastUsedAt || row?.lastCheckedAt || null;
      const baseDetail = this.resolveDashboardEngineDetail({
        configured,
        online,
        running,
        queueActivated,
        inCooldown,
        paused,
        stateLabel,
        capacity,
        lastError: row?.lastError || null,
        forcedUntil: capacity.forcedUntil,
      });
      const detail = draining
        ? locked
          ? 'Drenando: novas leases bloqueadas ate o job atual terminar.'
          : 'Dreno concluido; motor aguardando parada fisica pelo governor.'
        : stopped
          ? 'Motor parado logicamente; o governor Docker pode desligar o container sem lease ativa.'
          : baseDetail;

      engines.push({
        id: row?.id || `hbx-engine-${index + 1}`,
        kind: 'hbx',
        label: `HBX Motor ${index + 1}`,
        shortLabel: `HBX ${index + 1}`,
        index,
        status: draining ? 'draining' : stopped ? 'stopped' : running ? 'busy' : status,
        configured,
        active: !paused && !draining && !stopped && (running || queueActivated || (capacity.isTurboForcedNow && index < activeEngineCount)),
        online,
        busy: running,
        dimmed: paused || draining || stopped || !(running || queueActivated || (capacity.isTurboForcedNow && index < activeEngineCount)),
        url: null,
        lockUrl,
        localhostInProduction: Boolean(lockUrl && isProductionEnvironment(process.env.NODE_ENV) && isHbxEngineLocalhostUrl(lockUrl)),
        lockedUntil: this.serializeDate(row?.lockedUntil),
        cooldownUntil: this.serializeDate(row?.cooldownUntil),
        manualPaused: Boolean(row?.manualPaused),
        pausedUntil: this.serializeDate(row?.pausedUntil),
        desiredState,
        actualState,
        containerName: row?.id || `hbx-engine-${index + 1}`,
        memoryRssMb: null,
        memoryEwmaMb: null,
        lastStartAt: null,
        lastStopAt: null,
        idleSince: !running && !queueActivated ? this.serializeDate(lastActivityAt) : null,
        drainUntil: draining ? this.serializeDate(row?.pausedUntil) : null,
        priorityClass: index < Math.max(1, this.resolveManualReservedEngines(getConfiguredHbxEngineCount())) ? 'mixed' : 'factory',
        lastLeasePurpose: this.inferLeasePurpose(row),
        leaseActive: locked,
        stopEligible: !locked,
        lastCheckedAt: this.serializeDate(row?.lastCheckedAt),
        lastError: row?.lastError || null,
        detail,
        usagePercent,
        stateLabel,
        lastActivityAt: this.serializeDate(lastActivityAt),
        activeRunId: activity.activeRunId || row?.lockedRunId || null,
        activeCampaignId: activity.activeCampaignId,
        queueShare,
        processedLast10Min: activity.processedLast10Min,
        errorCount: activity.errorCount + Number(row?.failureCount || 0),
        heartbeatAgeSeconds,
        isTurboEnabled: capacity.isTurboEnabled,
        isTurboWindowActive: capacity.isTurboWindowActive,
        isTurboForcedNow: capacity.isTurboForcedNow,
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        queue: 0,
      });
    }

    const googleActive = Boolean(capacity.googleEmergencyMode || activeGoogleRun);
    const googleDetail = googleActive
      ? `Google manual/fallback ativo. Fila ${capacity.queuedCount}, rodando ${capacity.runningCount}.`
      : 'Google reservado para pesquisa manual/fallback.';

    engines.push({
      id: 'google-engine',
      kind: 'google',
      label: 'Google Manual',
      shortLabel: 'Google',
      index: null,
      status: googleActive ? 'emergency' : 'standby',
      configured: true,
      active: googleActive,
      online: true,
      busy: googleActive,
      dimmed: !googleActive,
      url: null,
      lockUrl: null,
      localhostInProduction: false,
      lockedUntil: null,
      cooldownUntil: null,
      manualPaused: false,
      pausedUntil: null,
      desiredState: 'running',
      actualState: 'running',
      containerName: null,
      memoryRssMb: null,
      memoryEwmaMb: null,
      lastStartAt: null,
      lastStopAt: null,
      idleSince: null,
      drainUntil: null,
      priorityClass: 'client',
      lastLeasePurpose: activeGoogleRun ? 'manual' : null,
      leaseActive: googleActive,
      stopEligible: false,
      lastCheckedAt: activeGoogleRun?.updatedAt instanceof Date ? activeGoogleRun.updatedAt.toISOString() : null,
      lastError: null,
      detail: googleDetail,
      usagePercent: googleActive ? Math.min(100, 64 + Math.min(32, capacity.queuedCount)) : 4,
      stateLabel: googleActive ? 'Rodando' : 'Standby pronto',
      lastActivityAt: activeGoogleRun?.updatedAt instanceof Date ? activeGoogleRun.updatedAt.toISOString() : null,
      activeRunId: null,
      activeCampaignId: null,
      queueShare: googleActive ? 100 : 0,
      processedLast10Min: 0,
      errorCount: 0,
      heartbeatAgeSeconds: null,
      isTurboEnabled: capacity.isTurboEnabled,
      isTurboWindowActive: capacity.isTurboWindowActive,
      isTurboForcedNow: capacity.isTurboForcedNow,
      cardsFabricated: 0,
      batches: 0,
      duplicates: 0,
      rejected: 0,
      queue: 0,
    });

    return engines;
  }

  private buildDashboardEnginePanels(engines: HbxEngineDashboardEngine[], capacity: CapacityLevel): HbxEngineDashboardPanel[] {
    const hbxEngines = engines
      .filter((engine) => engine.kind === 'hbx' && typeof engine.index === 'number')
      .sort((left, right) => Number(left.index) - Number(right.index));
    const allowed = Math.max(0, Math.trunc(Number(capacity.scheduler?.automaticAllowedEngines || 0)));
    return Array.from({ length: Math.max(1, Math.ceil(Math.max(hbxEngines.length, getConfiguredHbxEngineCount()) / 20)) }, (_, panelIndex) => {
      const start = panelIndex * 20;
      const end = start + 19;
      const panelEngines = hbxEngines.filter((engine) => Number(engine.index) >= start && Number(engine.index) <= end);
      const onlineHealthy = panelEngines.filter((engine) => engine.configured && engine.online && !['paused', 'draining', 'stopped', 'cooldown', 'offline', 'inactive', 'missing', 'degraded'].includes(String(engine.status || '').toLowerCase())).length;
      const busy = panelEngines.filter((engine) => engine.busy || String(engine.status || '').toLowerCase() === 'busy').length;
      const cooldown = panelEngines.filter((engine) => String(engine.status || '').toLowerCase() === 'cooldown').length;
      const paused = panelEngines.filter((engine) => engine.manualPaused || ['paused', 'draining'].includes(String(engine.status || '').toLowerCase())).length;
      const offline = panelEngines.filter((engine) => !engine.online || ['stopped', 'offline', 'inactive', 'missing', 'degraded'].includes(String(engine.status || '').toLowerCase())).length;
      const standby = panelEngines.filter((engine) => ['online', 'standby'].includes(String(engine.status || '').toLowerCase()) && !engine.busy).length;
      const eligible = panelEngines.filter((engine) => Number(engine.index) < allowed && engine.online && !engine.manualPaused && !['paused', 'draining', 'stopped', 'cooldown', 'offline', 'inactive', 'missing', 'degraded'].includes(String(engine.status || '').toLowerCase())).length;
      const acquiredLast10Min = panelEngines.filter((engine) => Number(engine.processedLast10Min || 0) > 0 || engine.busy).length;
      const cardsFabricated = panelEngines.reduce((sum, engine) => sum + Math.max(0, Math.trunc(Number(engine.processedLast10Min || 0))), 0);
      const lastErrorSample = panelEngines.map((engine) => engine.lastError).find(Boolean) || null;
      const reason = capacity.scheduler?.factory?.reason || (capacity.queuedCount <= 0 ? 'sem_fila_suficiente' : eligible > 0 ? 'elegivel' : 'fora_do_limite');
      return {
        id: `panel-${panelIndex + 1}`,
        label: `Painel ${panelIndex + 1}`,
        range: `${start + 1}-${end + 1}`,
        total: panelEngines.length,
        onlineHealthy,
        eligible,
        busy,
        cooldown,
        offline,
        paused,
        standby,
        acquiredLast10Min,
        cardsFabricated,
        lastErrorSample,
        reason,
      };
    });
  }

  private buildDashboardEngineDiagnostics(rows: EngineRegistryRow[], configuredUrls: string[], capacity: CapacityLevel) {
    const scheduler = capacity.scheduler;
    const diagnostics: string[] = [];
    diagnostics.push(`Configurados: ${getConfiguredHbxEngineCount()} motores; URLs: ${configuredUrls.length}; registry: ${rows.length}.`);
    if (scheduler) {
      diagnostics.push(`Saudáveis: ${scheduler.onlineHealthyEngines}; elegíveis fábrica: ${scheduler.eligibleEnginesCount ?? 0}; allowed: ${scheduler.automaticAllowedEngines}; motivo: ${scheduler.factory?.reason || scheduler.productionMode}.`);
      if ((scheduler.eligibleEnginesCount || 0) < scheduler.automaticAllowedEngines) {
        const highReasons = this.summarizeHighEngineExclusions(rows, this.resolveEligibleEngines(rows, capacity, scheduler, 'mass_data'));
        diagnostics.push(`Elegibilidade 21+: offline=${highReasons.offline}, cooldown=${highReasons.cooldown}, paused=${highReasons.paused}, busy=${highReasons.busy}, foraLimite=${highReasons.outsideActiveLimit}.`);
      }
      if (scheduler.factory?.reason === 'outside_factory_window') diagnostics.push('Fábrica fora do horário: nenhum motor automático novo será adquirido.');
      if (scheduler.factory?.reason === 'emergency_stop') diagnostics.push('PARAR TUDO ativo: fábrica bloqueada até retomada da agenda.');
      if (scheduler.factory?.reason === 'memory_guard' || scheduler.factory?.reason === 'memory_stop') diagnostics.push(`Proteção de memória ativa: pressão ${scheduler.memoryPressurePercent}%.`);
    }
    return diagnostics;
  }

  private resolveDashboardUsagePercent(input: {
    configured: boolean;
    online: boolean;
    running: boolean;
    queueActivated: boolean;
    inCooldown: boolean;
    paused: boolean;
    index: number;
    capacity: CapacityLevel;
    processedLast10Min: number;
  }) {
    if (!input.configured || !input.online) return 0;
    if (input.paused) return 5;
    if (input.running) {
      return Math.min(100, 76 + Math.min(18, input.capacity.queuedCount * 2) + Math.min(6, input.processedLast10Min));
    }
    if (input.queueActivated) {
      return Math.min(85, 45 + Math.min(28, input.capacity.queuedCount * 3) + Math.min(12, input.index * 4));
    }
    if (input.inCooldown) return 12;
    return Math.min(18, 5 + input.index * 3 + Math.min(getConfiguredHbxEngineCount(), input.processedLast10Min));
  }

  private resolveDashboardStateLabel(input: {
    configured: boolean;
    online: boolean;
    running: boolean;
    queueActivated: boolean;
    inCooldown: boolean;
    paused: boolean;
    status: string;
    hasHealthcheck: boolean;
    isTurboArmed: boolean;
    nextTurboLabel: string | null;
  }) {
    const status = String(input.status || '').trim().toLowerCase();
    if (!input.configured) return 'Sem healthcheck';
    if (input.paused || status === 'paused') return 'Pausado pelo usuário';
    if (!input.online) return 'Offline';
    if (input.running) return 'Rodando';
    if (input.inCooldown || status === 'cooldown') return 'Cooldown';
    if (status === 'degraded') return 'Cooldown';
    if (input.queueActivated) return 'Aguardando fila';
    if (input.isTurboArmed && input.nextTurboLabel) return `Turbo armado para ${input.nextTurboLabel}`;
    if (!input.hasHealthcheck) return 'Sem healthcheck';
    return 'Standby pronto';
  }

  private resolveDashboardEngineDetail(input: {
    configured: boolean;
    online: boolean;
    running: boolean;
    queueActivated: boolean;
    inCooldown: boolean;
    paused: boolean;
    stateLabel: string;
    capacity: CapacityLevel;
    lastError: string | null;
    forcedUntil: string | null;
  }) {
    if (!input.configured) return 'Motor sem URL configurada no pool HBX.';
    if (input.paused) return 'Pausar no painel impede uso na fila, mas nao desliga o container.';
    if (!input.online) return input.lastError ? `Healthcheck falhou: ${input.lastError}` : 'Sem resposta no healthcheck.';
    if (input.inCooldown) return input.lastError ? `Cooldown ativo: ${input.lastError}` : 'Cooldown ativo apos falha recente.';
    if (input.running) return `Rodando agora. Fila ${input.capacity.queuedCount}, tarefas em execucao ${input.capacity.runningCount}.`;
    if (input.queueActivated) return `Elegivel para a fila. Fila ${input.capacity.queuedCount}, janela ativa.`;
    if (input.capacity.isTurboForcedNow) return `Turbo forcado ativo ate ${input.forcedUntil || 'a expiracao configurada'}, aguardando trabalho.`;
    if (input.stateLabel.startsWith('Turbo armado')) return `${input.stateLabel}. Motor pronto para entrar na proxima janela.`;
    return 'Standby pronto, aguardando trabalho.';
  }

  private async buildEngineActivityStats() {
    const result = new Map<string, EngineActivityStats>();
    const ensure = (engineId: string) => {
      const existing = result.get(engineId);
      if (existing) return existing;
      const created: EngineActivityStats = {
        activeRunId: null,
        activeCampaignId: null,
        lastActivityAt: null,
        processedLast10Min: 0,
        errorCount: 0,
      };
      result.set(engineId, created);
      return created;
    };
    const rememberActivity = (engineId: string, value?: Date | null) => {
      if (!value) return;
      const item = ensure(engineId);
      if (!item.lastActivityAt || item.lastActivityAt.getTime() < value.getTime()) {
        item.lastActivityAt = value;
      }
    };
    const tenMinutesAgo = minutesAgo(10);
    const now = new Date();

    if ((this.prisma as any).webscrapingCampaignTask && await this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false)) {
      const tasks = await (this.prisma as any).webscrapingCampaignTask.findMany({
        where: {
          lockedByEngineId: { not: null },
          OR: [
            { status: 'running' },
            { updatedAt: { gte: tenMinutesAgo } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        select: {
          id: true,
          campaignId: true,
          status: true,
          lockedByEngineId: true,
          lockedUntil: true,
          updatedAt: true,
          finishedAt: true,
          lastError: true,
        },
      }).catch(() => []);
      for (const task of tasks) {
        const engineId = String(task?.lockedByEngineId || '').trim();
        if (!engineId) continue;
        const item = ensure(engineId);
        rememberActivity(engineId, task.updatedAt instanceof Date ? task.updatedAt : null);
        if (String(task?.status || '') === 'running' && (!task.lockedUntil || task.lockedUntil.getTime() > now.getTime())) {
          item.activeCampaignId ||= String(task.campaignId || '') || null;
        }
        if (['completed', 'exhausted'].includes(String(task?.status || '')) && task.updatedAt instanceof Date && task.updatedAt >= tenMinutesAgo) {
          item.processedLast10Min += 1;
        }
        if (String(task?.status || '') === 'failed' || task.lastError) item.errorCount += 1;
      }
    }

    if ((this.prisma as any).webscrapingCampaignBatch && await this.prisma.hasTable('WebscrapingCampaignBatch').catch(() => false)) {
      const batches = await (this.prisma as any).webscrapingCampaignBatch.findMany({
        where: {
          engineId: { not: null },
          OR: [
            { finishedAt: { gte: tenMinutesAgo } },
            { startedAt: { gte: tenMinutesAgo } },
            { createdAt: { gte: tenMinutesAgo } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: {
          engineId: true,
          status: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
        },
      }).catch(() => []);
      for (const batch of batches) {
        const engineId = String(batch?.engineId || '').trim();
        if (!engineId) continue;
        const item = ensure(engineId);
        rememberActivity(engineId, batch.finishedAt instanceof Date ? batch.finishedAt : batch.startedAt instanceof Date ? batch.startedAt : batch.createdAt);
        const status = String(batch?.status || '').toLowerCase();
        if (['batch_success', 'empty_batch', 'completed'].includes(status)) item.processedLast10Min += 1;
        if (status.includes('error') || batch.errorMessage) item.errorCount += 1;
      }
    }

    if ((this.prisma as any).webscrapingSearchRun && await this.prisma.hasTable('WebscrapingSearchRun').catch(() => false)) {
      const runs = await (this.prisma as any).webscrapingSearchRun.findMany({
        where: {
          assignedEngineId: { not: null },
          OR: [
            { status: { in: ['queued', 'running'] } },
            { updatedAt: { gte: tenMinutesAgo } },
            { finishedAt: { gte: tenMinutesAgo } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          status: true,
          assignedEngineId: true,
          updatedAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      }).catch(() => []);
      for (const run of runs) {
        const engineId = String(run?.assignedEngineId || '').trim();
        if (!engineId) continue;
        const item = ensure(engineId);
        rememberActivity(engineId, run.updatedAt instanceof Date ? run.updatedAt : run.finishedAt instanceof Date ? run.finishedAt : null);
        if (['queued', 'running'].includes(String(run?.status || ''))) item.activeRunId ||= String(run.id || '') || null;
        if (['completed', 'partial_error', 'completed_insufficient_results'].includes(String(run?.status || '')) && run.updatedAt instanceof Date && run.updatedAt >= tenMinutesAgo) {
          item.processedLast10Min += 1;
        }
        if (String(run?.status || '') === 'failed' || run.errorMessage) item.errorCount += 1;
      }
    }

    return result;
  }

  private serializeDate(value?: Date | null) {
    return value instanceof Date ? value.toISOString() : null;
  }

  private normalizeEngineId(value: unknown) {
    const id = String(value || '').trim();
    return /^hbx-engine-\d+$/i.test(id) ? id.toLowerCase() : null;
  }

  private isEnginePaused(row?: Partial<EngineRegistryRow> | null, nowMs = Date.now()) {
    return Boolean(row?.manualPaused) || Boolean(row?.pausedUntil instanceof Date && row.pausedUntil.getTime() > nowMs);
  }

  private resolveEngineDesiredState(row?: Partial<EngineRegistryRow> | null): HbxEngineDesiredState {
    const status = String(row?.status || '').trim().toLowerCase();
    if (status === 'draining') return 'draining';
    if (status === 'stopped' || status === 'inactive') return 'stopped';
    return 'running';
  }

  private isEngineDesiredStopping(row?: Partial<EngineRegistryRow> | null) {
    const desiredState = this.resolveEngineDesiredState(row);
    return desiredState === 'draining' || desiredState === 'stopped';
  }

  private resolveEngineActualState(input: {
    configured: boolean;
    desiredState: HbxEngineDesiredState;
    status: string;
    lastHealthStatus?: string | null;
  }): HbxEngineActualState {
    if (!input.configured) return 'missing';
    const status = String(input.status || '').trim().toLowerCase();
    const health = String(input.lastHealthStatus || '').trim().toLowerCase();
    if (health === 'online') return 'running';
    if (status === 'stopped' || status === 'inactive' || status === 'offline' || health === 'offline') return 'exited';
    return input.desiredState === 'stopped' ? 'exited' : 'starting';
  }

  private isEngineLeaseBlocked(row?: Partial<EngineRegistryRow> | null, nowMs = Date.now()) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (this.isEnginePaused(row, nowMs)) return true;
    return ['paused', 'draining', 'stopped', 'inactive', 'offline', 'cooldown', 'degraded'].includes(status);
  }

  private inferLeasePurpose(row?: Partial<EngineRegistryRow> | null): HbxEnginePurpose | null {
    const value = String(row?.lockedRunId || '').trim().toLowerCase();
    if (!value) return null;
    if (value.includes(':mass:') || value.includes('mass_data') || value.includes('campaign')) return 'mass_data';
    if (value.includes('autonomous') || value.includes('factory')) return 'autonomous';
    if (value.includes('vendas')) return 'vendas';
    if (value.includes('lead_plus')) return 'lead_plus_enrichment';
    if (value.includes('radar')) return 'radar_digital';
    return 'manual';
  }

  private async resolveEngineDrainTimeoutSeconds(value?: number | null) {
    const operationalConfig = await this.getOperationalConfig().catch(() => null);
    const metadata = this.parseOperationalMetadata(operationalConfig?.metadataJson);
    const fallback = clampInteger(
      process.env.HBX_ENGINE_DRAIN_TIMEOUT_SECONDS,
      clampInteger(metadata.drainTimeoutSeconds, 90, 10, 900),
      10,
      900,
    );
    return clampInteger(value, fallback, 10, 900);
  }

  private async requeueActiveLeaseForEngine(engineId: string, reason: string) {
    const now = new Date();
    if ((this.prisma as any).webscrapingCampaignTask && await this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false)) {
      await (this.prisma as any).webscrapingCampaignTask.updateMany({
        where: {
          lockedByEngineId: engineId,
          status: 'running',
        },
        data: {
          status: 'queued',
          lockedByEngineId: null,
          lockedUntil: null,
          lastError: reason,
        },
      }).catch(() => null);
    }

    if ((this.prisma as any).webscrapingSearchRun && await this.prisma.hasTable('WebscrapingSearchRun').catch(() => false)) {
      await (this.prisma as any).webscrapingSearchRun.updateMany({
        where: {
          assignedEngineId: engineId,
          status: { in: ['queued', 'running'] },
        },
        data: {
          status: 'queued',
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          nextRetryAt: now,
          lastBatchStatus: 'queued_wait',
          lastBatchError: reason,
        },
      }).catch(() => null);
    }
  }

  private async getConfiguredEngineUrls() {
    const operationalConfig = await this.getOperationalConfig();
    const metadata = this.parseOperationalMetadata(operationalConfig?.metadataJson);
    const targetCount = Math.max(
      getConfiguredHbxEngineCount(process.env),
      clampInteger(operationalConfig?.engineCount, 0, 0, getConfiguredHbxEngineMaxCount()),
      clampInteger(metadata.factoryMaxEngines, 0, 0, getConfiguredHbxEngineMaxCount()),
      clampInteger(metadata.factoryMinEngines, 0, 0, getConfiguredHbxEngineMaxCount()),
    );
    const effectiveEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HBX_ENGINE_COUNT: String(targetCount || getConfiguredHbxEngineCount(process.env)),
    };

    if (hasConfiguredHbxEngineUrlEnv(effectiveEnv)) {
      const urls = resolveConfiguredHbxEngineUrls(effectiveEnv);
      if (urls.length >= targetCount) return urls;
      const fallbackUrls = sanitizeProductionEngineUrls(buildLocalHbxEngineUrls(targetCount), effectiveEnv.NODE_ENV, targetCount);
      return [...urls, ...fallbackUrls.slice(urls.length)];
    }

    const databaseUrls = parseHbxEngineUrls(operationalConfig?.engineUrlsJson);
    return resolveConfiguredHbxEngineUrls(effectiveEnv, databaseUrls);
  }

  private async getOperationalConfig() {
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) return null;
    const row = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
    }).catch(() => null);
    if (!row) return null;
    const metadata = this.parseOperationalMetadata(row.metadataJson);
    return {
      ...row,
      forcedUntil: metadata.forcedUntil,
    };
  }

  private parseMetadataBoolean(value: unknown, fallback: boolean) {
    if (value == null) return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'sim', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(normalized)) return false;
    return fallback;
  }

  private parseOperationalMetadata(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return {
        forcedUntil: typeof parsed?.forcedUntil === 'string' ? parsed.forcedUntil : null,
        emergencyStop: this.parseMetadataBoolean(parsed?.emergencyStop, false),
        stopOutsideWindow: this.parseMetadataBoolean(parsed?.stopOutsideWindow, true),
        weekdaysOnly: this.parseMetadataBoolean(parsed?.weekdaysOnly, false),
        weekendAlwaysOn: this.parseMetadataBoolean(parsed?.weekendAlwaysOn, false),
        factoryState: typeof parsed?.factoryState === 'string' ? parsed.factoryState.trim().toUpperCase() : '',
        factoryCity: typeof parsed?.factoryCity === 'string' ? parsed.factoryCity.trim() : '',
        timezone: typeof parsed?.timezone === 'string' && parsed.timezone.trim() ? parsed.timezone.trim() : null,
        factoryMaxEngines: Number.isFinite(Number(parsed?.factoryMaxEngines)) ? Math.trunc(Number(parsed.factoryMaxEngines)) : null,
        factoryMinEngines: Number.isFinite(Number(parsed?.factoryMinEngines)) ? Math.trunc(Number(parsed.factoryMinEngines)) : null,
        drainTimeoutSeconds: Number.isFinite(Number(parsed?.drainTimeoutSeconds)) ? Math.trunc(Number(parsed.drainTimeoutSeconds)) : null,
      };
    } catch {
      return { forcedUntil: null, emergencyStop: false, stopOutsideWindow: true, weekdaysOnly: false, weekendAlwaysOn: false, factoryState: '', factoryCity: '', timezone: null, factoryMaxEngines: null, factoryMinEngines: null, drainTimeoutSeconds: null };
    }
  }

  private getForcedUntilDate(config: any) {
    const raw = String(config?.forcedUntil || this.parseOperationalMetadata(config?.metadataJson).forcedUntil || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private isForcedTurboActive(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const forcedUntil = this.getForcedUntilDate(config);
    return Boolean(forcedUntil && forcedUntil.getTime() > date.getTime());
  }

  private isWithinConfiguredOperationalWindow(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const safe = (value: unknown, fallback: number, max: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 0), max) : fallback;
    };
    const current = date.getHours() * 60 + date.getMinutes();
    const start = safe(config?.startHour, 20, 23) * 60 + safe(config?.startMinute, 0, 59);
    const end = safe(config?.endHour, 8, 23) * 60 + safe(config?.endMinute, 0, 59);
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  private isWithinOperationalWindow(config: any, date = new Date()) {
    return this.isForcedTurboActive(config, date) || this.isWithinConfiguredOperationalWindow(config, date);
  }

  private nextOperationalWindowAt(config: any, date = new Date()) {
    if (!config?.enabled) return null;
    if (this.isWithinConfiguredOperationalWindow(config, date)) return date.toISOString();
    const current = date.getHours() * 60 + date.getMinutes();
    const start = clampInteger(config.startHour, 20, 0, 23) * 60
      + clampInteger(config.startMinute, 0, 0, 59);
    const minutesUntilStart = (start - current + 24 * 60) % (24 * 60) || 24 * 60;
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutesUntilStart, 0, 0);
    return next.toISOString();
  }

  private formatOperationalTime(hour: unknown, minute: unknown) {
    const safeHour = clampInteger(hour, 20, 0, 23);
    const safeMinute = clampInteger(minute, 0, 0, 59);
    return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const raw = String(process.env[name] || '').trim().toLowerCase();
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'sim', 'on'].includes(raw);
  }

  private readIntegerEnv(name: string, fallback: number, min: number, max: number) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) return fallback;
    return clampInteger(raw, fallback, min, max);
  }

  private getFactoryNowParts(timezone: string, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date).toLowerCase();
    return { hour: value('hour'), minute: value('minute'), weekday };
  }

  private isFactoryBusinessDay(timezone: string, date = new Date()) {
    const weekday = this.getFactoryNowParts(timezone, date).weekday;
    return weekday !== 'sat' && weekday !== 'sun';
  }

  private isFactoryWeekend(timezone: string, date = new Date()) {
    return !this.isFactoryBusinessDay(timezone, date);
  }

  private isWithinFactoryWindow(startHour: number, startMinute: number, endHour: number, endMinute: number, timezone: string, date = new Date()) {
    const now = this.getFactoryNowParts(timezone, date);
    const current = now.hour * 60 + now.minute;
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  private nextFactoryBoundary(startHour: number, startMinute: number, endHour: number, endMinute: number, timezone: string, boundary: 'start' | 'stop', date = new Date()) {
    const now = this.getFactoryNowParts(timezone, date);
    const current = now.hour * 60 + now.minute;
    const target = boundary === 'start' ? startHour * 60 + startMinute : endHour * 60 + endMinute;
    const minutesUntil = (target - current + 24 * 60) % (24 * 60) || 24 * 60;
    return new Date(date.getTime() + minutesUntil * 60_000).toISOString();
  }

  private resolveMemoryGuardEngines(maxEngines: number, pressure: number) {
    const safeMaxEngines = Math.max(0, Math.trunc(Number(maxEngines || 0)));
    if (safeMaxEngines <= 0) return 0;

    const safePressure = Math.max(0, Math.min(100, Math.trunc(Number(pressure || 0))));
    const softPressure = this.factoryMemorySoftPressurePercent();
    const hardPressure = this.factoryMemoryHardPressurePercent(softPressure);
    const panicPressure = this.factoryMemoryPanicPressurePercent(hardPressure);

    if (safePressure >= panicPressure) return 0;
    if (safePressure >= hardPressure) return Math.max(1, Math.floor(safeMaxEngines * 0.25));
    if (safePressure >= softPressure) return Math.max(1, Math.floor(safeMaxEngines * 0.6));
    return safeMaxEngines;
  }

  resolveFactoryAllowedEngines(input: {
    engineCount?: number;
    onlineHealthyEngines?: number;
    manualReservedEngines?: number;
    clientPriorityActive?: boolean;
    manualDemandActive?: boolean;
    memoryPressurePercent?: number;
    operationalConfig?: any;
    factoryMaxEngines?: number | null;
    date?: Date;
  } = {}): HbxFactoryAllowance {
    const configuredEngineCount = Math.max(1, Math.trunc(Number(input.engineCount || getConfiguredHbxEngineCount())));
    const config = input.operationalConfig || {};
    const metadata = this.parseOperationalMetadata(config?.metadataJson);
    const enabled = this.readBooleanEnv('HBX_FACTORY_ENABLED', config?.enabled == null ? true : Boolean(config.enabled));
    const timezone = String(process.env.HBX_FACTORY_TIMEZONE || metadata.timezone || 'America/Sao_Paulo').trim();
    const startHour = this.readIntegerEnv('HBX_FACTORY_START_HOUR', clampInteger(config?.startHour, 22, 0, 23), 0, 23);
    const startMinute = this.readIntegerEnv('HBX_FACTORY_START_MINUTE', clampInteger(config?.startMinute, 0, 0, 59), 0, 59);
    const endHour = this.readIntegerEnv('HBX_FACTORY_END_HOUR', clampInteger(config?.endHour, 7, 0, 23), 0, 23);
    const endMinute = this.readIntegerEnv('HBX_FACTORY_END_MINUTE', clampInteger(config?.endMinute, 0, 0, 59), 0, 59);
    const metadataMaxEngines = metadata.factoryMaxEngines == null
      ? configuredEngineCount
      : clampInteger(metadata.factoryMaxEngines, configuredEngineCount, 0, configuredEngineCount);
    const envMaxEngines = input.factoryMaxEngines == null
      ? null
      : clampInteger(input.factoryMaxEngines, configuredEngineCount, 0, configuredEngineCount);
    const maxEngines = envMaxEngines == null ? metadataMaxEngines : Math.min(metadataMaxEngines, envMaxEngines);
    const minEngines = metadata.factoryMinEngines == null
      ? maxEngines
      : clampInteger(metadata.factoryMinEngines, maxEngines, 0, maxEngines);
    const stopOutsideWindow = this.readBooleanEnv('HBX_FACTORY_STOP_OUTSIDE_WINDOW', config?.stopOutsideWindow == null ? metadata.stopOutsideWindow : Boolean(config.stopOutsideWindow));
    const weekdaysOnly = this.readBooleanEnv('HBX_FACTORY_WEEKDAYS_ONLY', config?.weekdaysOnly == null ? metadata.weekdaysOnly : Boolean(config.weekdaysOnly));
    const weekendAlwaysOn = this.readBooleanEnv('HBX_FACTORY_WEEKEND_ALWAYS_ON', config?.weekendAlwaysOn == null ? metadata.weekendAlwaysOn : Boolean(config.weekendAlwaysOn));
    const factoryState = String(metadata.factoryState || '').trim().toUpperCase();
    const factoryCity = String(metadata.factoryCity || '').trim();
    const guidedLocationActive = Boolean(factoryState && factoryCity);
    const emergencyStop = this.readBooleanEnv('HBX_FACTORY_EMERGENCY_STOP', Boolean(metadata.emergencyStop));
    const date = input.date || new Date();
    const forcedActive = this.isForcedTurboActive(config, date);
    const scheduleWindowOpen = this.isWithinFactoryWindow(startHour, startMinute, endHour, endMinute, timezone, date);
    const weekend = this.isFactoryWeekend(timezone, date);
    const businessDayOpen = !weekdaysOnly || !weekend;
    const weekendWindowOpen = weekendAlwaysOn && weekend;
    const open = forcedActive || !stopOutsideWindow || weekendWindowOpen || (scheduleWindowOpen && businessDayOpen);
    const memoryPressurePercent = Math.max(0, Math.min(100, Math.trunc(Number(input.memoryPressurePercent || 0))));
    const memoryGuardEngines = this.resolveMemoryGuardEngines(maxEngines, memoryPressurePercent);
    const nextStartAt = this.nextFactoryBoundary(startHour, startMinute, endHour, endMinute, timezone, 'start', date);
    const nextStopAt = this.nextFactoryBoundary(startHour, startMinute, endHour, endMinute, timezone, 'stop', date);
    const factoryCapacity = Math.max(0, Math.min(
      Math.max(0, Number(input.onlineHealthyEngines || 0)),
      configuredEngineCount,
    ));
    const reserveApplies = Boolean(input.clientPriorityActive || input.manualDemandActive);
    const requestedReservedEngines = Math.max(0, Math.trunc(Number(input.manualReservedEngines || 0)));
    const reservedEngines = reserveApplies
      ? Math.min(requestedReservedEngines, factoryCapacity)
      : 0;
    const capacityAfterReserve = Math.max(0, factoryCapacity - reservedEngines);
    const guardedMaxEngines = Math.min(maxEngines, memoryGuardEngines);
    const unreservedAllowedEngines = Math.min(factoryCapacity, guardedMaxEngines);

    let reason: HbxFactoryAllowance['reason'] = 'open';
    let windowStatus: HbxFactoryAllowance['windowStatus'] = open ? 'open' : 'closed';
    let allowedEngines = Math.min(capacityAfterReserve, guardedMaxEngines);
    if (!enabled) {
      allowedEngines = 0;
      reason = 'factory_disabled';
      windowStatus = 'disabled';
    } else if (emergencyStop) {
      allowedEngines = 0;
      reason = 'emergency_stop';
      windowStatus = 'emergency_stop';
    } else if (!open) {
      allowedEngines = 0;
      reason = weekdaysOnly && weekend && !weekendAlwaysOn ? 'outside_business_days' : 'outside_factory_window';
      windowStatus = 'closed';
    } else if (memoryGuardEngines <= 0 && maxEngines > 0) {
      allowedEngines = 0;
      reason = 'memory_stop';
    } else if (input.manualDemandActive && reservedEngines > 0 && allowedEngines < unreservedAllowedEngines) {
      reason = 'manual_demand';
    } else if (input.clientPriorityActive && reservedEngines > 0 && allowedEngines < unreservedAllowedEngines) {
      reason = 'client_priority';
    } else if (memoryGuardEngines < maxEngines) {
      reason = 'memory_guard';
    } else if (guidedLocationActive) {
      reason = 'guided_location';
      windowStatus = 'open';
    } else if (allowedEngines <= maxEngines) {
      reason = 'factory_max';
    }
    allowedEngines = Math.max(0, Math.min(factoryCapacity, allowedEngines));
    return {
      allowedEngines,
      configuredEngineCount,
      maxEngines,
      minEngines,
      memoryGuardEngines,
      reservedEngines,
      memoryPressurePercent,
      reason,
      windowStatus,
      enabled,
      forcedActive,
      emergencyStop,
      stopOutsideWindow,
      weekdaysOnly,
      weekendAlwaysOn,
      factoryState: factoryState || null,
      factoryCity: factoryCity || null,
      timezone,
      startHour,
      startMinute,
      endHour,
      endMinute,
      nextStartAt,
      nextStopAt,
    };
  }

  private resolveOperationalEngineCount(config: any) {
    const configured = clampInteger(config?.engineCount, getConfiguredHbxEngineCount(), 1, getConfiguredHbxEngineCount());
    const intensity = String(config?.intensity || 'turbo').trim().toLowerCase();
    if (intensity === 'economico' || intensity === 'econômico') return 1;
    if (intensity === 'normal') return Math.min(configured, 2);
    return configured;
  }

  private fullQueueThreshold() {
    return Math.max(1, parseIntegerEnv('HBX_CAPACITY_FULL_QUEUE_THRESHOLD', 100));
  }

  private idleQueueThreshold() {
    return Math.max(0, parseIntegerEnv('HBX_CAPACITY_IDLE_QUEUE_THRESHOLD', 5));
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
    const engineCount = getConfiguredHbxEngineCount();
    const queue = Math.max(0, Math.trunc(Number(queuedCount || 0)));
    if (queue <= 0) return 1;
    const fullThreshold = this.fullQueueThreshold();
    if (queue >= fullThreshold) return engineCount;
    const desired = Math.ceil((queue / fullThreshold) * engineCount);
    return Math.max(1, Math.min(engineCount, desired));
  }

  private applyHysteresis(queuedCount: number) {
    const now = Date.now();
    const desired = this.resolveDesiredEngineCount(queuedCount);
    const current = Math.max(1, Math.min(getConfiguredHbxEngineCount(), Math.trunc(Number(this.activeEngineCount || 1))));
    if (current <= desired) {
      this.lowQueueSinceByEngineCount.clear();
      return;
    }

    for (const key of Array.from(this.lowQueueSinceByEngineCount.keys())) {
      if (key !== current) this.lowQueueSinceByEngineCount.delete(key);
    }

    const lowSince = this.updateLowSince(this.lowQueueSinceByEngineCount.get(current) || null, true);
    this.lowQueueSinceByEngineCount.set(current, lowSince);
    if (now - lowSince < this.engineScaleDownHysteresisMs(current, queuedCount)) return;

    const next = queuedCount <= this.idleQueueThreshold()
      ? 1
      : Math.max(desired, current - 1);
    this.activeEngineCount = Math.max(1, Math.min(getConfiguredHbxEngineCount(), next));
    this.lowQueueSinceByEngineCount.delete(current);
  }

  private updateLowSince(current: number | null, condition: boolean) {
    if (!condition) return null;
    return current || Date.now();
  }

  private engineScaleDownHysteresisMs(engineCount: number, queuedCount: number) {
    if (queuedCount <= this.idleQueueThreshold()) return 15 * 60_000;
    if (engineCount <= 2) return 15 * 60_000;
    if (engineCount === 3) return 20 * 60_000;
    return 30 * 60_000;
  }

  private compareEngineAvailability(left: EngineRegistryRow, right: EngineRegistryRow) {
    const now = Date.now();
    const leftBusy = this.isEngineCurrentlyBusy(left, now) ? 1 : 0;
    const rightBusy = this.isEngineCurrentlyBusy(right, now) ? 1 : 0;
    if (leftBusy !== rightBusy) return leftBusy - rightBusy;

    const leftLastUsed = left.lastUsedAt instanceof Date ? left.lastUsedAt.getTime() : 0;
    const rightLastUsed = right.lastUsedAt instanceof Date ? right.lastUsedAt.getTime() : 0;
    if (leftLastUsed !== rightLastUsed) return leftLastUsed - rightLastUsed;

    return left.engineIndex - right.engineIndex;
  }

  private isEngineCurrentlyBusy(engine: EngineRegistryRow, now = Date.now()) {
    const locked = Boolean(engine.lockedRunId && engine.lockedUntil instanceof Date && engine.lockedUntil.getTime() > now);
    return locked || String(engine.status || '').trim().toLowerCase() === 'busy';
  }

  private async buildQueueStats() {
    const tenMinutesAgo = minutesAgo(10);
    const now = new Date();
    const hasCampaignTask = Boolean((this.prisma as any).webscrapingCampaignTask) && await this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false);
    const executableCampaignWhere = {
      status: { in: ['queued', 'running', 'partial_error'] },
      OR: [
        { nextRunAt: null },
        { nextRunAt: { lte: now } },
      ],
    };
    const [searchQueuedCount, searchRunningCount, searchCompletedLast10Min, partialLast10Min, oldestQueued, progressingRuns] = await Promise.all([
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
    const [taskQueuedCount, taskRunningCount, taskCompletedLast10Min, oldestTaskQueued] = hasCampaignTask
      ? await Promise.all([
          (this.prisma as any).webscrapingCampaignTask.count({
            where: {
              status: 'queued',
              campaign: executableCampaignWhere,
            },
          }),
          (this.prisma as any).webscrapingCampaignTask.count({
            where: {
              status: 'running',
              campaign: { status: { in: ['queued', 'running', 'partial_error'] } },
            },
          }),
          (this.prisma as any).webscrapingCampaignTask.count({ where: { status: { in: ['completed', 'exhausted'] }, finishedAt: { gte: tenMinutesAgo } } }),
          (this.prisma as any).webscrapingCampaignTask.findFirst({
            where: {
              status: 'queued',
              campaign: executableCampaignWhere,
            },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
        ])
      : [0, 0, 0, null];
    const oldestQueuedAgeMinutes = oldestQueued?.createdAt instanceof Date
      ? Math.max(0, (Date.now() - oldestQueued.createdAt.getTime()) / 60_000)
      : oldestTaskQueued?.createdAt instanceof Date
        ? Math.max(0, (Date.now() - oldestTaskQueued.createdAt.getTime()) / 60_000)
        : 0;
    return {
      queuedCount: searchQueuedCount + taskQueuedCount,
      runningCount: searchRunningCount + taskRunningCount,
      completedLast10Min: searchCompletedLast10Min + taskCompletedLast10Min,
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

  private async findActiveGoogleEmergencyRun() {
    if (!(await this.prisma.hasTable('WebscrapingSearchRun'))) return null;
    return (this.prisma as any).webscrapingSearchRun.findFirst({
      where: {
        status: { in: ['queued', 'running'] },
        googleEmergencyUsedCount: { gt: 0 },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        googleEmergencyUsedCount: true,
        updatedAt: true,
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
