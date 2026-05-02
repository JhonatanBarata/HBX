import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const execFileAsync = promisify(execFile);

type HealthStatus = 'ok' | 'error' | 'unavailable';

type CommandResult = {
  status: HealthStatus;
  raw: string;
  error?: string;
};

const COMMAND_TIMEOUT_MS = 3500;
const MAX_ERROR_LINES = 30;
const MAX_LINE_LENGTH = 700;
const LOG_TAIL_BYTES = 160 * 1024;
const DOCKER_CONTAINERS = ['hbx-backend', 'hbx-postgres', 'webscraping', 'hbx-scraping-engine'];

function normalizeOutput(value: unknown) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function summarizeCommandError(error: unknown) {
  if (!error || typeof error !== 'object') return 'Comando indisponivel.';
  const err = error as { code?: unknown; message?: unknown; stderr?: unknown };
  const stderr = normalizeOutput(err.stderr);
  if (stderr) return stderr.split('\n')[0].slice(0, 220);
  if (err.code === 'ENOENT') return 'Comando nao encontrado no runtime.';
  const message = normalizeOutput(err.message);
  return message ? message.split('\n')[0].slice(0, 220) : 'Comando indisponivel.';
}

function redactSensitiveText(input: string) {
  return String(input || '')
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1***@')
    .replace(/(mysql:\/\/)[^\s@]+@/gi, '$1***@')
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, '$1***@')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ***')
    .replace(/\b(authorization|cookie|set-cookie|database_url|direct_url|password|passwd|pwd|secret|token|access_token|api_key|apikey)\b\s*[:=]\s*["']?[^"'\s,;]+/gi, '$1=***')
    .replace(/\b(x-api-key|x-auth-token)\b\s*[:=]\s*["']?[^"'\s,;]+/gi, '$1=***');
}

function isErrorLine(line: string) {
  return /\b(error|exception|failed|failure|fatal|warn|unhandled|timeout|prisma|erro|falha)\b/i.test(line);
}

function parseDockerStats(raw: string) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, cpu, memory, memoryPercent, netIo, blockIo, pids] = line.split('|');
      return {
        name: name || '-',
        cpu: cpu || '-',
        memory: memory || '-',
        memoryPercent: memoryPercent || '-',
        netIo: netIo || '-',
        blockIo: blockIo || '-',
        pids: pids || '-',
      };
    });
}

function parseMemInfo(raw: string) {
  const values = new Map<string, number>();
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)/);
    if (!match) continue;
    values.set(match[1], Number(match[2]));
  }
  const totalKb = values.get('MemTotal') || 0;
  const availableKb = values.get('MemAvailable') || 0;
  const usedKb = Math.max(0, totalKb - availableKb);
  const usagePercent = totalKb > 0 ? Math.round((usedKb / totalKb) * 1000) / 10 : null;
  return {
    totalKb,
    availableKb,
    usedKb,
    usagePercent,
  };
}

function parseLoadAverage(raw: string) {
  const parts = raw.trim().split(/\s+/);
  return {
    oneMinute: parts[0] || null,
    fiveMinutes: parts[1] || null,
    fifteenMinutes: parts[2] || null,
  };
}

function parseDisk(raw: string) {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const row = lines.length > 1 ? lines[1].split(/\s+/) : [];
  return {
    filesystem: row[0] || null,
    size: row[1] || null,
    used: row[2] || null,
    available: row[3] || null,
    usagePercent: row[4] || null,
    mount: row[5] || null,
  };
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function summarizeUserAgent(value: unknown) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const browser =
    normalized.match(/(Chrome|CriOS|Firefox|FxiOS|Safari|Edg|OPR)\/[\d.]+/i)?.[0] ||
    normalized.match(/(WhatsApp|Instagram|FBAN)\/?[\w.]*/i)?.[0] ||
    null;
  const os =
    normalized.match(/Windows NT [\d.]+/i)?.[0] ||
    normalized.match(/Android [\d.]+/i)?.[0] ||
    normalized.match(/iPhone OS [\d_]+/i)?.[0]?.replace(/_/g, '.') ||
    normalized.match(/Mac OS X [\d_]+/i)?.[0]?.replace(/_/g, '.') ||
    normalized.match(/Linux/i)?.[0] ||
    null;
  return [browser, os].filter(Boolean).join(' - ') || normalized.slice(0, 120);
}

@Injectable()
export class SystemHealthService {
  constructor(private readonly prisma: PrismaService) {}

  private async runCommand(command: string, args: string[]): Promise<CommandResult> {
    try {
      const { stdout } = await execFileAsync(command, args, {
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 256 * 1024,
      });
      return {
        status: 'ok',
        raw: normalizeOutput(stdout),
      };
    } catch (error) {
      return {
        status: 'unavailable',
        raw: '',
        error: summarizeCommandError(error),
      };
    }
  }

  private async readFileCommand(filePath: string): Promise<CommandResult> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return {
        status: 'ok',
        raw: normalizeOutput(raw),
      };
    } catch (error) {
      return {
        status: 'unavailable',
        raw: '',
        error: summarizeCommandError(error),
      };
    }
  }

  private async collectMemory() {
    const free = await this.runCommand('free', ['-h']);
    const meminfo = await this.readFileCommand('/proc/meminfo');
    return {
      status: free.status === 'ok' || meminfo.status === 'ok' ? 'ok' : 'unavailable',
      raw: free.raw || meminfo.raw,
      source: free.raw ? 'free -h' : '/proc/meminfo',
      parsed: meminfo.raw ? parseMemInfo(meminfo.raw) : null,
      error: free.raw || meminfo.raw ? undefined : free.error || meminfo.error,
    };
  }

  private async collectLoad() {
    const uptime = await this.runCommand('uptime', []);
    const loadavg = await this.readFileCommand('/proc/loadavg');
    return {
      status: uptime.status === 'ok' || loadavg.status === 'ok' ? 'ok' : 'unavailable',
      raw: uptime.raw || loadavg.raw,
      loadavg: loadavg.raw || null,
      parsed: loadavg.raw ? parseLoadAverage(loadavg.raw) : null,
      error: uptime.raw || loadavg.raw ? undefined : uptime.error || loadavg.error,
    };
  }

  private async collectDisk() {
    const disk = await this.runCommand('df', ['-h', '/']);
    return {
      ...disk,
      parsed: disk.raw ? parseDisk(disk.raw) : null,
    };
  }

  private async collectUptime() {
    const pretty = await this.runCommand('uptime', ['-p']);
    const proc = await this.readFileCommand('/proc/uptime');
    const seconds = Number(proc.raw.split(/\s+/)[0]);
    return {
      status: pretty.status === 'ok' || proc.status === 'ok' ? 'ok' : 'unavailable',
      raw: pretty.raw || proc.raw,
      seconds: Number.isFinite(seconds) ? Math.floor(seconds) : null,
      formatted: pretty.raw || formatDuration(seconds),
      error: pretty.raw || proc.raw ? undefined : pretty.error || proc.error,
    };
  }

  private async collectContainers() {
    const result = await this.runCommand('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}',
      ...DOCKER_CONTAINERS,
    ]);

    if (result.status !== 'ok') {
      return {
        status: 'unavailable' as HealthStatus,
        note: 'Docker stats indisponivel dentro do container sem acesso seguro ao runtime Docker. Nao montar docker.sock; habilitar depois via script externo seguro se necessario.',
        raw: '',
        items: DOCKER_CONTAINERS.map((name) => ({
          name,
          status: 'unavailable',
          cpu: '-',
          memory: '-',
          memoryPercent: '-',
          netIo: '-',
          blockIo: '-',
          pids: '-',
        })),
        error: result.error,
      };
    }

    const parsed = parseDockerStats(result.raw);
    const byName = new Map(parsed.map((item) => [item.name, item]));
    return {
      status: 'ok' as HealthStatus,
      note: null,
      raw: result.raw,
      items: DOCKER_CONTAINERS.map((name) => byName.get(name) || {
        name,
        status: 'unavailable',
        cpu: '-',
        memory: '-',
        memoryPercent: '-',
        netIo: '-',
        blockIo: '-',
        pids: '-',
      }),
    };
  }

  private async collectPostgres() {
    const startedAt = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const responseMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        status: 'ok' as HealthStatus,
        responseMs: Math.round(responseMs),
      };
    } catch (error) {
      const responseMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        status: 'error' as HealthStatus,
        responseMs: Math.round(responseMs),
        error: error instanceof Error ? redactSensitiveText(error.message).slice(0, 220) : 'Falha ao consultar Postgres.',
      };
    }
  }

  private async collectBackendErrors() {
    const cwd = process.cwd();
    const candidates = [
      process.env.HBX_BACKEND_LOG_PATH,
      path.join(cwd, 'logs', 'backend.log'),
      path.join(cwd, 'logs', 'app.log'),
      '/app/logs/backend.log',
      '/var/log/hbx/backend.log',
    ].filter(Boolean) as string[];

    for (const filePath of candidates) {
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        const handle = await fs.open(filePath, 'r');
        try {
          const length = Math.min(LOG_TAIL_BYTES, stat.size);
          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, Math.max(0, stat.size - length));
          const lines = buffer
            .toString('utf8')
            .split(/\r?\n/)
            .map((line) => redactSensitiveText(line.trim()).slice(0, MAX_LINE_LENGTH))
            .filter((line) => line && isErrorLine(line))
            .slice(-MAX_ERROR_LINES);

          return {
            status: 'ok' as HealthStatus,
            source: 'backend-log',
            lines,
            note: lines.length ? null : 'Nenhum erro recente encontrado no arquivo de log configurado.',
          };
        } finally {
          await handle.close();
        }
      } catch {
        // Try next known path.
      }
    }

    return {
      status: 'unavailable' as HealthStatus,
      source: null,
      lines: [],
      note: 'Logs locais do backend nao estao disponiveis neste runtime. Em Docker, ler docker logs exigiria acesso ao runtime; nao foi habilitado para evitar expor docker.sock.',
    };
  }

  async getSystemHealth() {
    const generatedAt = new Date().toISOString();
    const apiStartedAt = process.hrtime.bigint();
    const [memory, load, disk, uptime, containers, postgres, errors] = await Promise.all([
      this.collectMemory(),
      this.collectLoad(),
      this.collectDisk(),
      this.collectUptime(),
      this.collectContainers(),
      this.collectPostgres(),
      this.collectBackendErrors(),
    ]);
    const apiResponseMs = Number(process.hrtime.bigint() - apiStartedAt) / 1_000_000;

    return {
      generatedAt,
      memory,
      load,
      disk,
      uptime,
      containers,
      postgres,
      api: {
        status: 'ok' as HealthStatus,
        responseMs: Math.round(apiResponseMs),
        processUptimeSeconds: Math.floor(process.uptime()),
      },
      errors,
    };
  }

  async listActiveSessions() {
    const now = new Date();
    const onlineCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const recentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const sessions = await this.prisma.authSession.findMany({
      where: {
        OR: [
          { lastSeenAt: { gte: todayStart } },
          { lastSeenAt: { gte: recentCutoff } },
          { revokedAt: null, expiresAt: { gte: now } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        userAgent: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            role: true,
            isSystemMaster: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const items = sessions.map((session) => {
      const lastSeenAt = session.lastSeenAt instanceof Date ? session.lastSeenAt : new Date(session.lastSeenAt);
      const idleMinutes = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 60000));
      const online = !session.revokedAt && session.expiresAt.getTime() >= now.getTime() && lastSeenAt.getTime() >= onlineCutoff.getTime();
      return {
        userId: session.user.id,
        userName: session.user.name || session.user.username || session.user.email || `Usuario ${session.user.id}`,
        email: session.user.email || null,
        companyId: session.user.companyId || session.user.company?.id || null,
        companyName: session.user.company?.name || null,
        role: session.user.role,
        isSystemMaster: Boolean(session.user.isSystemMaster),
        sessionId: session.id,
        lastSeenAt: lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        online,
        idleMinutes,
        userAgent: summarizeUserAgent(session.userAgent),
      };
    });

    const active15Cutoff = new Date(now.getTime() - 15 * 60 * 1000);
    return {
      generatedAt: now.toISOString(),
      counters: {
        onlineNow: items.filter((item) => item.online).length,
        activeLast15Min: items.filter((item) => new Date(item.lastSeenAt).getTime() >= active15Cutoff.getTime()).length,
        activeToday: items.filter((item) => new Date(item.lastSeenAt).getTime() >= todayStart.getTime()).length,
      },
      sessions: items,
    };
  }
}
