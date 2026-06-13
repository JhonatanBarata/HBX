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

  private parseInspectResult(name: string, parsed: any): HbxDockerEngineInspect {
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
  }

  async inspectEngine(name: string): Promise<HbxDockerEngineInspect> {
    this.assertAllowedEngineName(name);
    try {
      const raw = await this.runDocker(['inspect', name, '--format', '{{json .}}']);
      return this.parseInspectResult(name, JSON.parse(raw));
    } catch (error) {
      const message = String((error as any)?.stderr || (error as any)?.message || error || '');
      if (/no such object|no such container|not found/i.test(message)) {
        return { name, exists: false, running: false, status: 'missing', health: 'unknown' };
      }
      this.logger.warn(`[hbx-engine-docker] inspect falhou container=${name}: ${message.slice(0, 180)}`);
      return { name, exists: false, running: false, status: 'unknown', health: 'unknown' };
    }
  }

  async inspectEngines(names: string[]): Promise<Map<string, HbxDockerEngineInspect>> {
    const uniqueNames = Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
    for (const name of uniqueNames) this.assertAllowedEngineName(name);

    const result = new Map<string, HbxDockerEngineInspect>();
    if (!uniqueNames.length) return result;

    try {
      const raw = await this.runDocker(['inspect', '--format', '{{json .}}', ...uniqueNames], 20_000);
      for (const line of raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        const parsed = JSON.parse(line);
        const name = String(parsed?.Name || '').replace(/^\//, '');
        if (uniqueNames.includes(name)) result.set(name, this.parseInspectResult(name, parsed));
      }
      for (const name of uniqueNames) {
        if (!result.has(name)) result.set(name, { name, exists: false, running: false, status: 'missing', health: 'unknown' });
      }
      return result;
    } catch {
      for (const name of uniqueNames) {
        result.set(name, await this.inspectEngine(name));
      }
      return result;
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

  async readEnginesStats(names: string[]): Promise<Map<string, HbxDockerEngineStats>> {
    const uniqueNames = Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
    for (const name of uniqueNames) this.assertAllowedEngineName(name);

    const result = new Map<string, HbxDockerEngineStats>();
    for (const name of uniqueNames) result.set(name, { name, memoryRssMb: null });
    if (!uniqueNames.length) return result;

    try {
      const raw = await this.runDocker(['stats', '--no-stream', '--format', '{{json .}}', ...uniqueNames], 15_000);
      for (const line of raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        const parsed = JSON.parse(line);
        const name = String(parsed?.Name || '').trim();
        if (result.has(name)) result.set(name, { name, memoryRssMb: this.parseDockerMemoryMb(parsed?.MemUsage) });
      }
    } catch {
      await Promise.all(uniqueNames.map(async (name) => {
        result.set(name, await this.readEngineStats(name));
      }));
    }
    return result;
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
