import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HbxEngineDockerAdapterService } from './hbx-engine-docker-adapter.service';
import { HbxEnginePoolService, getConfiguredHbxEngineCount, type HbxEngineDesiredState } from './hbx-engine-pool.service';
import { HbxEngineTelemetryService, type HbxEngineContainerTelemetry } from './hbx-engine-telemetry.service';

export type HbxEngineGovernorActionType = 'start' | 'stop' | 'restart' | 'mark_stopped';

export type HbxEngineGovernorInput = {
  name: string;
  desiredState: HbxEngineDesiredState;
  leaseActive: boolean;
  containerExists: boolean;
  containerRunning: boolean;
  health: HbxEngineContainerTelemetry['health'];
  drainUntilMs?: number | null;
  lastActionAtMs?: number | null;
};

export type HbxEngineGovernorDecision = {
  name: string;
  action: HbxEngineGovernorActionType;
  reason: string;
};

export function shouldEnableHbxEngineGovernor(env: NodeJS.ProcessEnv = process.env) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(env.HBX_ENGINE_GOVERNOR_ENABLED || '').trim().toLowerCase());
}

export function resolveHbxEngineDesiredState(status: unknown): HbxEngineDesiredState {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'draining') return 'draining';
  if (normalized === 'stopped' || normalized === 'inactive') return 'stopped';
  return 'running';
}

export function decideHbxEngineGovernorActions(input: {
  engines: HbxEngineGovernorInput[];
  nowMs?: number;
  cooldownMs?: number;
}): HbxEngineGovernorDecision[] {
  const nowMs = Math.max(0, Math.trunc(Number(input.nowMs || Date.now())));
  const cooldownMs = Math.max(0, Math.trunc(Number(input.cooldownMs || 0)));
  const actions: HbxEngineGovernorDecision[] = [];

  for (const engine of input.engines) {
    const lastActionAtMs = Math.max(0, Math.trunc(Number(engine.lastActionAtMs || 0)));
    const coolingDown = lastActionAtMs > 0 && nowMs - lastActionAtMs < cooldownMs;
    const dockerAction = (action: HbxEngineGovernorActionType, reason: string) => {
      if (coolingDown) return;
      actions.push({ name: engine.name, action, reason });
    };

    if (engine.desiredState === 'running') {
      if (!engine.containerExists || !engine.containerRunning) {
        dockerAction('start', engine.containerExists ? 'desired_running_container_exited' : 'desired_running_container_missing');
      } else if (engine.health === 'unhealthy') {
        dockerAction('restart', 'desired_running_unhealthy');
      }
      continue;
    }

    if (engine.desiredState === 'draining') {
      if (engine.leaseActive) continue;
      if (engine.containerRunning) {
        dockerAction('stop', 'drain_complete_stop_container');
      } else {
        actions.push({ name: engine.name, action: 'mark_stopped', reason: 'drain_complete_container_not_running' });
      }
      continue;
    }

    if (engine.desiredState === 'stopped') {
      if (engine.leaseActive) continue;
      if (engine.containerRunning) {
        dockerAction('stop', 'desired_stopped_container_running');
      }
    }
  }

  return actions;
}

@Injectable()
export class HbxEngineGovernorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HbxEngineGovernorService.name);
  private readonly lastActionAtByEngine = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: HbxEnginePoolService,
    private readonly telemetry: HbxEngineTelemetryService,
    private readonly docker: HbxEngineDockerAdapterService,
  ) {}

  onModuleInit() {
    if (!shouldEnableHbxEngineGovernor()) return;
    const intervalMs = this.governorIntervalMs();
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => {
        this.logger.warn(`[hbx-engine-governor] tick falhou: ${String((error as any)?.message || error).slice(0, 180)}`);
      });
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`[hbx-engine-governor] enabled intervalMs=${intervalMs} cooldownMs=${this.governorCooldownMs()}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(options: { ignoreEnabled?: boolean } = {}) {
    if (!options.ignoreEnabled && !shouldEnableHbxEngineGovernor()) {
      return { enabled: false, actions: [] as HbxEngineGovernorDecision[] };
    }
    if (this.running) return { enabled: true, skipped: 'already_running', actions: [] as HbxEngineGovernorDecision[] };
    if (!(await this.prisma.hasTable('HbxEngineLock').catch(() => false))) {
      return { enabled: true, skipped: 'missing_table', actions: [] as HbxEngineGovernorDecision[] };
    }

    this.running = true;
    try {
      if (typeof (this.pool as any).syncElasticEngineDesiredStates === 'function') {
        await (this.pool as any).syncElasticEngineDesiredStates().catch(() => null);
      } else {
        await this.pool.refreshEngineRegistryFromEnv().catch(() => []);
      }
      const rows = await (this.prisma as any).hbxEngineLock.findMany({
        where: { engineIndex: { lt: getConfiguredHbxEngineCount() } },
        orderBy: { engineIndex: 'asc' },
      }).catch(() => []);
      const names = rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean);
      const telemetry = await this.telemetry.getEngineTelemetry(names);
      const nowMs = Date.now();
      const engines: HbxEngineGovernorInput[] = rows.map((row: any) => {
        const container = telemetry.get(String(row.id));
        return {
          name: String(row.id),
          desiredState: resolveHbxEngineDesiredState(row.status),
          leaseActive: Boolean(row.lockedRunId && row.lockedUntil instanceof Date && row.lockedUntil.getTime() > nowMs),
          containerExists: Boolean(container?.exists),
          containerRunning: Boolean(container?.running),
          health: container?.health || 'unknown',
          drainUntilMs: row.pausedUntil instanceof Date ? row.pausedUntil.getTime() : null,
          lastActionAtMs: this.lastActionAtByEngine.get(String(row.id)) || null,
        };
      });
      const actions = decideHbxEngineGovernorActions({
        engines,
        nowMs,
        cooldownMs: this.governorCooldownMs(),
      });

      for (const action of actions) {
        await this.applyAction(action).catch((error) => {
          this.logger.warn(`[hbx-engine-governor] action=${action.action} container=${action.name} falhou: ${String((error as any)?.message || error).slice(0, 180)}`);
        });
      }

      return { enabled: true, actions };
    } finally {
      this.running = false;
    }
  }

  private async applyAction(action: HbxEngineGovernorDecision) {
    if (action.action === 'start') {
      await this.docker.startEngine(action.name);
      this.rememberAction(action);
      await this.updateEngineAfterAction(action, { status: 'standby', lastError: null });
      return;
    }
    if (action.action === 'restart') {
      await this.docker.restartEngine(action.name);
      this.rememberAction(action);
      await this.updateEngineAfterAction(action, { status: 'standby', lastError: 'Governor reiniciou motor HBX sem healthcheck saudavel.' });
      return;
    }
    if (action.action === 'stop') {
      await this.docker.stopEngine(action.name);
      this.rememberAction(action);
      await this.updateEngineAfterAction(action, {
        status: 'stopped',
        lockedRunId: null,
        lockedCompanyId: null,
        lockedUserId: null,
        lockedAt: null,
        lockedUntil: null,
        pausedUntil: null,
        cooldownUntil: null,
        lastError: 'Governor parou container HBX conforme estado desejado.',
      });
      return;
    }
    await this.updateEngineAfterAction(action, {
      status: 'stopped',
      pausedUntil: null,
      cooldownUntil: null,
      lastError: 'Governor confirmou motor parado apos dreno.',
    });
  }

  private rememberAction(action: HbxEngineGovernorDecision) {
    this.lastActionAtByEngine.set(action.name, Date.now());
    this.logger.log(`[hbx-engine-governor] action=${action.action} container=${action.name} reason=${action.reason}`);
  }

  private async updateEngineAfterAction(action: HbxEngineGovernorDecision, data: Record<string, unknown>) {
    await (this.prisma as any).hbxEngineLock.updateMany({
      where: { id: action.name },
      data,
    }).catch(() => null);
  }

  private governorIntervalMs() {
    const parsed = Number(String(process.env.HBX_ENGINE_GOVERNOR_INTERVAL_SECONDS || '').trim());
    const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    return Math.min(Math.max(Math.trunc(seconds), 10), 300) * 1000;
  }

  private governorCooldownMs() {
    const parsed = Number(String(process.env.HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS || '').trim());
    const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
    return Math.min(Math.max(Math.trunc(seconds), 0), 1800) * 1000;
  }
}
