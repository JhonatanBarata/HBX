import { Injectable, Logger } from '@nestjs/common';
import { request as httpRequest } from 'http';
import { URL } from 'url';

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

// Gerência de container do motor vai pela porta CERTA da arquitetura: o ops-control
// (único serviço com acesso ao Docker, socket montado de propósito). O backend NÃO
// chama `docker` direto (em container ele nem tem o binário/socket → spawn ENOENT).
// Contrato público idêntico ao adapter antigo — governor/telemetria/pool não mudam.
@Injectable()
export class HbxEngineDockerAdapterService {
  private readonly logger = new Logger(HbxEngineDockerAdapterService.name);

  private opsConfig() {
    const url = String(process.env.OPS_CONTROL_URL || 'http://hbx-ops-control:3099').replace(/\/+$/, '');
    const token = String(process.env.OPS_CONTROL_TOKEN || '').trim();
    return { url, token };
  }

  private assertAllowedEngineName(name: string) {
    if (!isAllowedHbxEngineContainerName(name)) {
      throw new Error(`Container fora do escopo HBX: ${name}`);
    }
  }

  private opsRequest<T = any>(method: 'GET' | 'POST', path: string, timeoutMs = 15_000): Promise<T> {
    const { url, token } = this.opsConfig();
    if (!token) return Promise.reject(new Error('OPS_CONTROL_TOKEN ausente no backend.'));
    const target = new URL(`${url}${path}`);
    return new Promise<T>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: target.hostname,
          port: target.port || 80,
          path: target.pathname + target.search,
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: timeoutMs,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            if (raw.length < 1_000_000) raw += chunk.toString('utf8');
          });
          res.on('end', () => {
            const code = res.statusCode || 0;
            if (code < 200 || code >= 300) {
              reject(new Error(`ops-control ${method} ${path} -> HTTP ${code}`));
              return;
            }
            try {
              resolve((raw ? JSON.parse(raw) : {}) as T);
            } catch {
              reject(new Error('ops-control devolveu resposta não-JSON.'));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('ops-control timeout')));
      req.on('error', reject);
      req.end();
    });
  }

  private async fetchContainers(): Promise<Map<string, any>> {
    const data = await this.opsRequest<{ containers?: any[] }>('GET', '/api/containers', 20_000);
    const list = Array.isArray(data?.containers) ? data.containers : [];
    const byName = new Map<string, any>();
    for (const item of list) {
      const name = String(item?.name || '').replace(/^\//, '').trim();
      if (name) byName.set(name, item);
    }
    return byName;
  }

  private mapContainer(name: string, container: any): HbxDockerEngineInspect {
    if (!container) {
      return { name, exists: false, running: false, status: 'missing', health: 'unknown' };
    }
    const state = String(container.state || '').trim().toLowerCase();
    const running = state === 'running';
    return {
      name,
      exists: true,
      running,
      // ps não traz healthcheck do Docker (motor não declara HEALTHCHECK) → 'none', igual ao
      // que `docker inspect` retornava no caminho antigo. Saúde real do motor é via HTTP no pool.
      status: state || String(container.status || 'unknown').toLowerCase(),
      health: 'none',
    };
  }

  async inspectEngine(name: string): Promise<HbxDockerEngineInspect> {
    this.assertAllowedEngineName(name);
    try {
      const byName = await this.fetchContainers();
      return this.mapContainer(name, byName.get(name));
    } catch (error) {
      const message = String((error as any)?.message || error || '');
      this.logger.warn(`[hbx-engine-ops] inspect falhou container=${name}: ${message.slice(0, 180)}`);
      return { name, exists: false, running: false, status: 'unknown', health: 'unknown' };
    }
  }

  async inspectEngines(names: string[]): Promise<Map<string, HbxDockerEngineInspect>> {
    const uniqueNames = Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
    for (const name of uniqueNames) this.assertAllowedEngineName(name);

    const result = new Map<string, HbxDockerEngineInspect>();
    if (!uniqueNames.length) return result;

    try {
      const byName = await this.fetchContainers();
      for (const name of uniqueNames) result.set(name, this.mapContainer(name, byName.get(name)));
    } catch (error) {
      const message = String((error as any)?.message || error || '');
      this.logger.warn(`[hbx-engine-ops] inspect em lote falhou: ${message.slice(0, 180)}`);
      for (const name of uniqueNames) {
        result.set(name, { name, exists: false, running: false, status: 'unknown', health: 'unknown' });
      }
    }
    return result;
  }

  async readEngineStats(name: string): Promise<HbxDockerEngineStats> {
    this.assertAllowedEngineName(name);
    try {
      const byName = await this.fetchContainers();
      return { name, memoryRssMb: this.parseDockerMemoryMb(byName.get(name)?.memUsage) };
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
      const byName = await this.fetchContainers();
      for (const name of uniqueNames) {
        result.set(name, { name, memoryRssMb: this.parseDockerMemoryMb(byName.get(name)?.memUsage) });
      }
    } catch {
      // mantém memoryRssMb null (tratado pelo guard de memória).
    }
    return result;
  }

  async startEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.opsRequest('POST', `/api/containers/${encodeURIComponent(name)}/start`, 20_000);
  }

  async stopEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.opsRequest('POST', `/api/containers/${encodeURIComponent(name)}/stop`, 30_000);
  }

  async restartEngine(name: string) {
    this.assertAllowedEngineName(name);
    await this.opsRequest('POST', `/api/containers/${encodeURIComponent(name)}/restart`, 30_000);
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
