import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type HbxDockerEngineInspect = {
  name: string;
  exists: boolean;
  running: boolean;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown';
};

export type HbxDockerEngineStats = {
  name: string;
  memoryRssMb: number | null;
};

export function isAllowedHbxEngineContainerName(name: unknown) {
  return /^hbx-engine-\d+$/.test(String(name || '').trim());
}

@Injectable()
export class HbxEngineDockerAdapterService {
  private readonly logger = new Logger(HbxEngineDockerAdapterService.name);

  private dockerCliPath() {
    return String(process.env.HBX_ENGINE_DOCKER_CLI_PATH || 'docker').trim() || 'docker';
  }

  private assertAllowedEngineName(name: string) {
    if (!isAllowedHbxEngineContainerName(name)) {
      throw new Error(`Container fora do escopo HBX: ${name}`);
    }
  }

  private async runDocker(args: string[], timeoutMs = 15_000) {
    const { stdout } = await execFileAsync(this.dockerCliPath(), args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return String(stdout || '').trim();
  }

  async inspectEngine(name: string): Promise<HbxDockerEngineInspect> {
    this.assertAllowedEngineName(name);
    try {
      const raw = await this.runDocker(['inspect', name, '--format', '{{json .}}']);
      const parsed = JSON.parse(raw);
      const state = parsed?.State || {};
      const health = state?.Health?.Status
        ? String(state.Health.Status).toLowerCase()
        : 'none';
      return {
        name,
        exists: true,
        running: Boolean(state.Running),
        status: String(state.Status || (state.Running ? 'running' : 'unknown')).toLowerCase(),
        health: ['healthy', 'unhealthy', 'starting', 'none'].includes(health)
          ? health as HbxDockerEngineInspect['health']
          : 'unknown',
      };
    } catch (error) {
      const message = String((error as any)?.stderr || (error as any)?.message || error || '');
      if (/no such object|no such container|not found/i.test(message)) {
        return { name, exists: false, running: false, status: 'missing', health: 'unknown' };
      }
      this.logger.warn(`[hbx-engine-docker] inspect falhou container=${name}: ${message.slice(0, 180)}`);
      return { name, exists: false, running: false, status: 'unknown', health: 'unknown' };
    }
  }

  async readEngineStats(name: string): Promise<HbxDockerEngineStats> {
    this.assertAllowedEngineName(name);
    try {
      const raw = await this.runDocker(['stats', '--no-stream', '--format', '{{json .}}', name], 10_000);
      const parsed = JSON.parse(raw);
      return {
        name,
        memoryRssMb: this.parseDockerMemoryMb(parsed?.MemUsage),
      };
    } catch {
      return { name, memoryRssMb: null };
    }
  }

  async startEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.runDocker(['start', name], 20_000);
  }

  async stopEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.runDocker(['stop', name], 30_000);
  }

  async restartEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.runDocker(['restart', name], 30_000);
  }

  private parseDockerMemoryMb(value: unknown) {
    const raw = String(value || '').split('/')[0]?.trim() || '';
    const match = raw.match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = match[2].toLowerCase();
    if (unit === 'kb' || unit === 'kib') return amount / 1024;
    if (unit === 'mb' || unit === 'mib') return amount;
    if (unit === 'gb' || unit === 'gib') return amount * 1024;
    if (unit === 'tb' || unit === 'tib') return amount * 1024 * 1024;
    if (unit === 'b') return amount / 1024 / 1024;
    return null;
  }
}
