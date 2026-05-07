import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { getConfiguredHbxEngineCount, isHbxEngineLocalhostUrl } from '../webscraping/hbx-engine-pool.service';

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
const DOCKER_CONTAINERS = [
  'hbx-backend',
  'hbx-postgres',
  'webscraping',
  'hbx-scraping-engine',
  ...Array.from({ length: getConfiguredHbxEngineCount() }, (_, index) => `hbx-engine-${index + 1}`),
  'hbx-frontend',
  'frontend',
  'nginx',
  'proxy',
];

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

  private startOfLocalDay(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private localHour(now = new Date()) {
    try {
      const value = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }).format(now);
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : now.getHours();
    } catch {
      return now.getHours();
    }
  }

  private async collectRadarProduction() {
    const now = new Date();
    const todayStart = this.startOfLocalDay(now);
    const lastHour = new Date(now.getTime() - 60 * 60_000);
    const lastTenMinutes = new Date(now.getTime() - 10 * 60_000);
    const [hasLeadPool, hasTask, hasBatch, hasEngineLock, hasOperationalConfig, hasRecoveryOpportunity] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignBatch').catch(() => false),
      this.prisma.hasTable('HbxEngineLock').catch(() => false),
      this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false),
      this.prisma.hasTable('RecoveryOpportunity').catch(() => false),
    ]);

    if (!hasLeadPool) {
      return {
        status: 'unavailable' as HealthStatus,
        note: 'RadarLeadPool ainda nao esta disponivel.',
        radar: {
          total: 0,
          cardsToday: 0,
          cardsLastHour: 0,
          cardsLast10Min: 0,
          premiumToday: 0,
        },
        queue: { queued: 0, running: 0, completed: 0, failed: 0, exhausted: 0 },
        engines: [],
        nightFactory: {
          enabled: false,
          status: 'indisponivel',
          leadsEnrichedToday: 0,
          premiumOpportunities: 0,
          recoveryOpportunities: 0,
          queue: 0,
        },
        alerts: [],
      };
    }

    const [
      total,
      cardsToday,
      cardsLastHour,
      cardsLast10Min,
      premiumToday,
      taskGroups,
      batchRows,
      engineRows,
      nightFactoryConfig,
      recoveryOpportunities,
    ] = await Promise.all([
      (this.prisma as any).radarLeadPool.count().catch(() => 0),
      (this.prisma as any).radarLeadPool.count({ where: { createdAt: { gte: todayStart } } }).catch(() => 0),
      (this.prisma as any).radarLeadPool.count({ where: { createdAt: { gte: lastHour } } }).catch(() => 0),
      (this.prisma as any).radarLeadPool.count({ where: { createdAt: { gte: lastTenMinutes } } }).catch(() => 0),
      (this.prisma as any).radarLeadPool.count({
        where: {
          updatedAt: { gte: todayStart },
          opportunityScore: { gte: 85 },
          status: { notIn: ['complaint', 'denied', 'hidden', 'rejected'] },
        },
      }).catch(() => 0),
      hasTask
        ? (this.prisma as any).webscrapingCampaignTask.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => [])
        : Promise.resolve([]),
      hasBatch
        ? (this.prisma as any).webscrapingCampaignBatch.findMany({
            where: { createdAt: { gte: todayStart } },
            select: {
              engineId: true,
              approvedCount: true,
              duplicateCount: true,
              rejectedCount: true,
              status: true,
              errorMessage: true,
              createdAt: true,
              finishedAt: true,
            },
            take: 5000,
          }).catch(() => [])
        : Promise.resolve([]),
      hasEngineLock
        ? (this.prisma as any).hbxEngineLock.findMany({
            orderBy: { engineIndex: 'asc' },
            select: {
              id: true,
              engineIndex: true,
              url: true,
              status: true,
              lastHealthStatus: true,
              lastError: true,
              lastCheckedAt: true,
              lastUsedAt: true,
            },
          }).catch(() => [])
        : Promise.resolve([]),
      hasOperationalConfig
        ? (this.prisma as any).webscrapingOperationalConfig.findUnique({ where: { key: 'night_factory' } }).catch(() => null)
        : Promise.resolve(null),
      hasRecoveryOpportunity
        ? (this.prisma as any).recoveryOpportunity.count({ where: { createdAt: { gte: todayStart } } }).catch(() => 0)
        : Promise.resolve(0),
    ]);

    const queue = (taskGroups as any[]).reduce((acc: Record<string, number>, item: any) => {
      acc[String(item?.status || 'queued')] = Number(item?._count?._all || 0);
      return acc;
    }, {});

    const byEngine = new Map<string, any>();
    for (const batch of batchRows as any[]) {
      const engineId = String(batch?.engineId || '').trim();
      if (!engineId) continue;
      const current = byEngine.get(engineId) || {
        id: engineId,
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        lastActivityAt: null,
        errors: 0,
      };
      current.cardsFabricated += Number(batch?.approvedCount || 0);
      current.batches += 1;
      current.duplicates += Number(batch?.duplicateCount || 0);
      current.rejected += Number(batch?.rejectedCount || 0);
      if (batch?.errorMessage || String(batch?.status || '').toLowerCase().includes('error')) current.errors += 1;
      const lastActivityAt = batch?.finishedAt instanceof Date ? batch.finishedAt : batch?.createdAt instanceof Date ? batch.createdAt : null;
      if (lastActivityAt && (!current.lastActivityAt || current.lastActivityAt.getTime() < lastActivityAt.getTime())) {
        current.lastActivityAt = lastActivityAt;
      }
      byEngine.set(engineId, current);
    }

    const productionStopped = Number(cardsLast10Min || 0) === 0 && Number(queue.queued || 0) > 0 && Number(queue.running || 0) === 0;
    const productionHint = productionStopped
      ? 'Fila travada: ha itens na fila, mas nada rodando.'
      : Number(cardsLast10Min || 0) > 0
        ? 'Producao saudavel: o RadarLeadPool esta crescendo.'
        : 'Motores descansando: sem producao recente.';

    const productionAlerts = [];
    const localhostLocks = (engineRows as any[]).filter((row) => isHbxEngineLocalhostUrl(String(row?.url || '')));
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && localhostLocks.length) {
      productionAlerts.push({
        id: 'hbx_engine_localhost_lock',
        severity: 'critical',
        title: 'HbxEngineLock usando localhost em producao',
        message: 'Motor configurado com localhost em produção. Isso quebra o Docker. Corrigir URLs dos motores.',
        action: 'corrigir URLs dos motores',
      });
    }
    if (productionStopped) {
      productionAlerts.push({
        id: 'radar_queue_stuck',
        severity: 'warning',
        title: 'Fila travada',
        message: 'Ha tarefas em queued e nenhuma em running. Verifique motores e locks.',
        action: 'ver motores HBX',
      });
    }

    const hour = this.localHour(now);
    const enabled = Boolean(nightFactoryConfig?.enabled);
    const nightStatus = enabled
      ? hour >= 0 && hour < 6 ? 'rodando' : 'dormindo'
      : 'pausado';

    return {
      status: 'ok' as HealthStatus,
      note: productionHint,
      radar: {
        total: Number(total || 0),
        cardsToday: Number(cardsToday || 0),
        cardsLastHour: Number(cardsLastHour || 0),
        cardsLast10Min: Number(cardsLast10Min || 0),
        premiumToday: Number(premiumToday || 0),
      },
      queue: {
        queued: Number(queue.queued || 0),
        running: Number(queue.running || 0),
        completed: Number(queue.completed || 0),
        failed: Number(queue.failed || 0),
        exhausted: Number(queue.exhausted || 0),
      },
      engines: (engineRows as any[]).map((row) => {
        const stats = byEngine.get(String(row?.id || '')) || {};
        return {
          id: String(row?.id || ''),
          label: `M${Number(row?.engineIndex || 0) + 1}`,
          status: String(row?.status || 'standby'),
          online: String(row?.lastHealthStatus || row?.status || '').toLowerCase() !== 'offline',
          cardsFabricated: Number(stats.cardsFabricated || 0),
          batches: Number(stats.batches || 0),
          duplicates: Number(stats.duplicates || 0),
          rejected: Number(stats.rejected || 0),
          lastActivityAt: stats.lastActivityAt instanceof Date ? stats.lastActivityAt.toISOString() : row?.lastUsedAt instanceof Date ? row.lastUsedAt.toISOString() : null,
          lockUrl: row?.url || null,
          localhostInProduction: String(process.env.NODE_ENV || '').toLowerCase() === 'production' && isHbxEngineLocalhostUrl(String(row?.url || '')),
          lastError: row?.lastError || null,
        };
      }),
      nightFactory: {
        enabled,
        status: nightStatus,
        nextWindow: '00:00-06:00 America/Sao_Paulo',
        leadsEnrichedToday: Number(premiumToday || 0),
        premiumOpportunities: Number(premiumToday || 0),
        recoveryOpportunities: Number(recoveryOpportunities || 0),
        queue: Number(queue.queued || 0),
      },
      alerts: productionAlerts,
    };
  }

  async getSystemHealth() {
    const generatedAt = new Date().toISOString();
    const apiStartedAt = process.hrtime.bigint();
    const [memory, load, disk, uptime, containers, postgres, errors, production] = await Promise.all([
      this.collectMemory(),
      this.collectLoad(),
      this.collectDisk(),
      this.collectUptime(),
      this.collectContainers(),
      this.collectPostgres(),
      this.collectBackendErrors(),
      this.collectRadarProduction(),
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
      production,
      nightFactory: production.nightFactory,
      alerts: production.alerts,
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
