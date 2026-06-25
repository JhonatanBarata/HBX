import { Injectable, Logger } from '@nestjs/common';
import { request as httpRequest } from 'http';
import { execFile } from 'child_process';
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

// Gerência de container do motor tem DOIS caminhos:
//  1) ops-control (HTTP, OPS_CONTROL_TOKEN) — caminho "remoto" original.
//  2) docker LOCAL (socket /var/run/docker.sock + binário) — quando o backend roda no MESMO host
//     com o socket montado (caso da VPS). Preferimos ops-control SE houver token; senão caímos no
//     docker local. Sem token e sem socket, degrada (igual antes: governor só loga falha).
// Motivo do fallback: na VPS o OPS_CONTROL_TOKEN nunca foi setado → todo start/stop/inspect falhava
// ("OPS_CONTROL_TOKEN ausente"), o governor ficava CEGO (spam de start) e o "Parar" do painel não
// parava nada. O backend roda como root com o socket montado, então o docker local resolve.
// Contrato público idêntico — governor/telemetria/pool não mudam.
@Injectable()
export class HbxEngineDockerAdapterService {
  private readonly logger = new Logger(HbxEngineDockerAdapterService.name);

  private opsConfig() {
    const url = String(process.env.OPS_CONTROL_URL || 'http://hbx-ops-control:3099').replace(/\/+$/, '');
    const token = String(process.env.OPS_CONTROL_TOKEN || '').trim();
    return { url, token };
  }

  private localDockerCliPath() {
    return String(process.env.HBX_ENGINE_DOCKER_CLI_PATH || '').trim();
  }

  // Usa docker local quando NÃO há token de ops-control mas há um CLI de docker configurado
  // (socket montado). Com token, mantém o caminho remoto original.
  private useLocalDocker() {
    return !this.opsConfig().token && Boolean(this.localDockerCliPath());
  }

  private assertAllowedEngineName(name: string) {
    if (!isAllowedHbxEngineContainerName(name)) {
      throw new Error(`Container fora do escopo HBX: ${name}`);
    }
  }

  private runDockerLocal(args: string[], timeoutMs = 20_000): Promise<string> {
    const cli = this.localDockerCliPath() || 'docker';
    return new Promise<string>((resolve, reject) => {
      execFile(cli, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`docker ${args.join(' ')} -> ${String(stderr || error.message).slice(0, 180)}`));
          return;
        }
        resolve(String(stdout || ''));
      });
    });
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

  private async fetchContainersOps(): Promise<Map<string, any>> {
    const data = await this.opsRequest<{ containers?: any[] }>('GET', '/api/containers', 20_000);
    const list = Array.isArray(data?.containers) ? data.containers : [];
    const byName = new Map<string, any>();
    for (const item of list) {
      const name = String(item?.name || '').replace(/^\//, '').trim();
      if (name) byName.set(name, item);
    }
    return byName;
  }

  // docker ps -a → mesma forma {name, state, status} que o ops-control devolve (memUsage ausente →
  // memória fica null, tratada pelo guard de memória, igual ao caminho ops em erro).
  private async fetchContainersLocal(): Promise<Map<string, any>> {
    const out = await this.runDockerLocal(['ps', '-a', '--no-trunc', '--format', '{{.Names}}\t{{.State}}\t{{.Status}}'], 20_000);
    const byName = new Map<string, any>();
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, state, status] = trimmed.split('\t');
      const cleanName = String(name || '').replace(/^\//, '').trim();
      if (cleanName) byName.set(cleanName, { name: cleanName, state: String(state || '').trim(), status: String(status || '').trim() });
    }
    return byName;
  }

  private fetchContainers(): Promise<Map<string, any>> {
    return this.useLocalDocker() ? this.fetchContainersLocal() : this.fetchContainersOps();
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
    if (this.useLocalDocker()) {
      await this.runDockerLocal(['start', name], 20_000);
      return;
    }
    await this.opsRequest('POST', `/api/containers/${encodeURIComponent(name)}/start`, 20_000);
  }

  async stopEngine(name: string) {
    this.assertAllowedEngineName(name);
    if (this.useLocalDocker()) {
      await this.runDockerLocal(['stop', name], 30_000);
      return;
    }
    await this.opsRequest('POST', `/api/containers/${encodeURIComponent(name)}/stop`, 30_000);
  }

  async restartEngine(name: string) {
    this.assertAllowedEngineName(name);
    if (this.useLocalDocker()) {
      await this.runDockerLocal(['restart', name], 30_000);
      return;
    }
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
