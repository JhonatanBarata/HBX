// ============================================================================
// VIGIA DO DISCO DA VPS — o freio da CEGUEIRA (05/08/2026).
//
// O QUE ACONTECEU: a VPS de produção chegou a 162 GB de 194 GB (84%) e ninguém
// soube. O dono descobriu por acaso, num brainstorm sobre outro assunto. Não
// existia UM aviso. Vale aqui a mesma lei do CNEFE (23M endereços desligados 5
// dias em silêncio): "best-effort que engole erro precisa de alarme".
//
// O QUE FAZ: mede disco + RAM + swap do HOST a cada tick e, quando aperta,
// avisa o dono pelos canais que JÁ existem (MasterAlertService.routeEvent =
// e-mail + WhatsApp com teto diário + sino + trilha MasterEvent). Nada de
// sistema paralelo de monitoramento.
//
// COMO ELE VÊ O HOST DE DENTRO DO CONTAINER (medido na VPS em 05/08):
//   • disco  → fs.statfsSync('/'): o overlay do container fica NO MESMO
//     filesystem do host, então os números batem com o `df -h /` do dono
//     (194G / 68%). Sem spawn, sem parsing de texto.
//   • RAM/swap → /proc/meminfo: o container não tem limite de memória, logo o
//     /proc que ele lê é o do host (MemTotal 16 GB = a VPS inteira).
//   • "o quê encheu" → `docker system df` pelo socket já montado no compose
//     (/var/run/docker.sock) + tamanho das maiores tabelas do Postgres via
//     Prisma + (opcional) `du` nos diretórios expostos em /hostfs.
//
// LEI DO ALARME ÚTIL: alarme que não diz a CAUSA vira alarme ignorado. Por isso
// o texto sempre carrega os top consumidores. Eles são calculados SÓ na hora de
// disparar (lazy) — o tick normal é 2 leituras de arquivo, custo ~zero.
//
// TETO DESTE MÓDULO: ele só LÊ. Nunca roda prune, nunca apaga arquivo, nunca
// reinicia nada. Faxina é decisão humana do dono (mesmo teto do MasterWatch com
// chip caído). O freio que limpa mora no publish e no job da RFB.
//
// Padrão da casa (master-watch/ai-pressure-watch): setInterval em
// onModuleInit + gate de env + guarda de tick-em-voo + best-effort absoluto.
// ============================================================================

import { execFile } from 'child_process';
import { readFile, statfs } from 'fs/promises';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { emitMasterEvent } from '../common/master-event';
import { MasterAlertService } from './master-alert.service';

const GIB = 1024 * 1024 * 1024;

function envOn(name: string): boolean {
  return ['true', '1', 'yes', 'on', 'sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Avaliador PURO (testável offline): amostra + limiares → veredito.
// ─────────────────────────────────────────────────────────────────────────────

export type HostPressureSample = {
  diskUsedPct: number;      // 0..100, mesma conta do `df` (desconta reserva do root)
  diskTotalGib: number;
  diskFreeGib: number;
  memUsedPct: number;       // 0..100 sobre MemTotal, usando MemAvailable
  swapUsedPct: number;      // 0..100; -1 = host sem swap
};

export type HostPressureThresholds = {
  diskWarnPct: number;
  diskCritPct: number;
  memWarnPct: number;       // 0 desliga o sinal
  // Swap SÓ vira motivo junto com RAM apertada — ver comentário em
  // evaluateHostPressure(). 0 em qualquer um dos dois desliga o sinal.
  swapWarnPct: number;
  swapWithMemAbovePct: number;
};

export type HostPressureLevel = 'ok' | 'warning' | 'critical';

export type HostPressureVerdict = {
  level: HostPressureLevel;
  reasons: string[];
  // chave de "estado" pra dedup do MasterEvent: episódio novo só quando o
  // nível muda ou o disco anda de faixa de 1% — o MESMO estado não repete.
  state: string;
};

export function evaluateHostPressure(
  sample: HostPressureSample,
  thresholds: HostPressureThresholds,
): HostPressureVerdict {
  const reasons: string[] = [];
  let level: HostPressureLevel = 'ok';

  const disk = Number.isFinite(sample.diskUsedPct) ? sample.diskUsedPct : 0;
  if (thresholds.diskCritPct > 0 && disk >= thresholds.diskCritPct) {
    level = 'critical';
    reasons.push(`disco=${disk.toFixed(0)}% (crítico >=${thresholds.diskCritPct}%)`);
  } else if (thresholds.diskWarnPct > 0 && disk >= thresholds.diskWarnPct) {
    level = 'warning';
    reasons.push(`disco=${disk.toFixed(0)}% (aviso >=${thresholds.diskWarnPct}%)`);
  }

  // RAM e swap NUNCA promovem a crítico sozinhos: pico de memória passa, disco
  // cheio não passa. Eles entram como motivo adicional e, se o disco está ok,
  // no máximo levantam um "warning".
  const mem = Number.isFinite(sample.memUsedPct) ? sample.memUsedPct : 0;
  if (thresholds.memWarnPct > 0 && mem >= thresholds.memWarnPct) {
    if (level === 'ok') level = 'warning';
    reasons.push(`RAM=${mem.toFixed(0)}% (aviso >=${thresholds.memWarnPct}%)`);
  }

  // SWAP: medido na VPS em 05/08, os 4 GB de swap estão 100% cheios COM 9 GB de
  // RAM disponível. Isso é o estado NORMAL desta máquina (páginas frias que
  // subiram num pico antigo e nunca voltaram — o llama-server sozinho segura
  // 3,6 GB de RSS). Um alarme que dispara em "swap=100%" gritaria todo dia sem
  // nenhuma ação possível, e alarme que grita sempre é alarme que o dono
  // aprende a ignorar. Então swap só é motivo quando vem ACOMPANHADO de RAM
  // apertada — a combinação é que antecede OOM de verdade.
  const swap = Number.isFinite(sample.swapUsedPct) ? sample.swapUsedPct : -1;
  const swapCounts =
    thresholds.swapWarnPct > 0 &&
    thresholds.swapWithMemAbovePct > 0 &&
    swap >= thresholds.swapWarnPct &&
    mem >= thresholds.swapWithMemAbovePct;
  if (swapCounts) {
    if (level === 'ok') level = 'warning';
    reasons.push(`swap=${swap.toFixed(0)}% COM RAM=${mem.toFixed(0)}% (risco de OOM)`);
  }

  return { level, reasons, state: `${level}:d${Math.round(disk)}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitores (impuros, todos best-effort)
// ─────────────────────────────────────────────────────────────────────────────

export type TopConsumer = { label: string; detail: string };

@Injectable()
export class HostDiskWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HostDiskWatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastFiredAt = 0;
  private lastLevel: HostPressureLevel = 'ok';

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAlert: MasterAlertService,
  ) {}

  // Default: ON em produção, OFF em dev (mesma regra do MasterWatchService —
  // disco do PC de dev enche por outros motivos e não é assunto do dono).
  private isEnabled(): boolean {
    const raw = String(process.env.HBX_DISK_WATCH_ENABLED || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'sim'].includes(raw)) return true;
    if (['false', '0', 'no', 'off', 'nao'].includes(raw)) return false;
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  }

  private tickIntervalMs(): number {
    // 30 min: disco não enche em segundos. Piso de 5 min pra ninguém configurar
    // um tick que vira ruído de IO.
    return Math.max(5 * 60_000, envInt('HBX_DISK_WATCH_TICK_MS', 30 * 60_000));
  }

  private thresholds(): HostPressureThresholds {
    return {
      diskWarnPct: envInt('HBX_DISK_WATCH_WARN_PCT', 80),
      diskCritPct: envInt('HBX_DISK_WATCH_CRIT_PCT', 90),
      // RAM: a VPS opera hoje em ~44% de uso com o llama-server ligado (medido
      // 05/08: 9 GB disponíveis de 15,6 GB). 92% é aperto de verdade, não rotina.
      memWarnPct: envInt('HBX_DISK_WATCH_MEM_WARN_PCT', 92),
      swapWarnPct: envInt('HBX_DISK_WATCH_SWAP_WARN_PCT', 90),
      swapWithMemAbovePct: envInt('HBX_DISK_WATCH_SWAP_MEM_FLOOR_PCT', 85),
    };
  }

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.warn('vigia-de-disco DESLIGADO por env (HBX_DISK_WATCH_ENABLED) — zero ticks.');
      return;
    }
    const tickMs = this.tickIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, tickMs);
    this.timer.unref?.();
    const t = this.thresholds();
    this.logger.log(
      `vigia-de-disco LIGADO — tick ${tickMs / 60_000} min, aviso ${t.diskWarnPct}% / crítico ${t.diskCritPct}% ` +
        `(RAM ${t.memWarnPct}%, swap ${t.swapWarnPct}%).`,
    );
    // Primeira leitura logo no boot: se a VPS já subiu apertada, o dono sabe
    // agora e não no próximo tick (meia hora de silêncio é o bug original).
    setTimeout(() => { void this.tick(); }, 30_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Disco do host — `fs.statfs('/')` com a MESMA conta do `df` (desconta reserva do root). */
  async readDisk(): Promise<{ usedPct: number; totalGib: number; freeGib: number }> {
    const stat: any = await statfs('/');
    const bsize = Number(stat.bsize) || 4096;
    const blocks = Number(stat.blocks) || 0;
    const bfree = Number(stat.bfree) || 0;
    const bavail = Number(stat.bavail) || 0;
    const usedBlocks = Math.max(0, blocks - bfree);
    const denominator = usedBlocks + bavail;
    return {
      usedPct: denominator > 0 ? (usedBlocks / denominator) * 100 : 0,
      totalGib: (blocks * bsize) / GIB,
      freeGib: (bavail * bsize) / GIB,
    };
  }

  /** RAM/swap do host via /proc/meminfo (o container vê o /proc do host). */
  async readMemory(): Promise<{ memUsedPct: number; swapUsedPct: number; memTotalGib: number; memAvailGib: number }> {
    const raw = await readFile('/proc/meminfo', 'utf8');
    const kb = (key: string): number => {
      const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(raw);
      return match ? Number(match[1]) : 0;
    };
    const memTotal = kb('MemTotal');
    const memAvailable = kb('MemAvailable');
    const swapTotal = kb('SwapTotal');
    const swapFree = kb('SwapFree');
    return {
      memUsedPct: memTotal > 0 ? ((memTotal - memAvailable) / memTotal) * 100 : 0,
      swapUsedPct: swapTotal > 0 ? ((swapTotal - swapFree) / swapTotal) * 100 : -1,
      memTotalGib: (memTotal * 1024) / GIB,
      memAvailGib: (memAvailable * 1024) / GIB,
    };
  }

  private runCommand(cmd: string, args: string[], timeoutMs = 20_000): Promise<string> {
    return new Promise<string>((resolve) => {
      try {
        execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
          resolve(error ? '' : String(stdout || ''));
        });
      } catch {
        resolve('');
      }
    });
  }

  private dockerCli(): string {
    return String(process.env.HBX_ENGINE_DOCKER_CLI_PATH || '').trim() || 'docker';
  }

  /** `docker system df` — imagens/containers/volumes/cache com o quanto é recuperável. */
  async readDockerUsage(): Promise<TopConsumer[]> {
    const out = await this.runCommand(this.dockerCli(), ['system', 'df', '--format', '{{json .}}']);
    if (!out.trim()) return [];
    const rows: TopConsumer[] = [];
    for (const line of out.split('\n').map((l) => l.trim()).filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        const type = String(parsed.Type || '').trim();
        const size = String(parsed.Size || '').trim();
        const reclaimable = String(parsed.Reclaimable || '').trim();
        if (!type || !size) continue;
        rows.push({ label: `docker ${type}`, detail: `${size} (recuperável ${reclaimable || '?'})` });
      } catch { /* linha quebrada não derruba a leitura */ }
    }
    return rows;
  }

  /** Maiores tabelas do banco de produção + tamanho total (bloat mora aqui). */
  async readDatabaseUsage(): Promise<TopConsumer[]> {
    try {
      const total: any[] = await this.prisma.$queryRawUnsafe(
        'SELECT pg_size_pretty(pg_database_size(current_database())) AS size',
      );
      const tables: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT c.relname AS name, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'm')
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 5
      `);
      const rows: TopConsumer[] = [];
      if (total?.[0]?.size) rows.push({ label: 'banco hbx_prod (total)', detail: String(total[0].size) });
      for (const table of tables || []) {
        rows.push({ label: `tabela ${String(table.name)}`, detail: String(table.size) });
      }
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * `du` nos diretórios do host expostos read-only em /hostfs (opcional).
   * Sem os mounts, esta leitura simplesmente não aparece no alarme — o resto
   * (docker + banco) já cobre a maior parte do disco. Nunca é obrigatória.
   */
  async readHostFolders(): Promise<TopConsumer[]> {
    const root = String(process.env.HBX_DISK_WATCH_HOSTFS_ROOT || '/hostfs').trim();
    if (!root) return [];
    // `du -sk` só toca metadados; roda apenas quando o alarme vai disparar.
    const out = await this.runCommand('sh', ['-c', `du -sk ${root}/* 2>/dev/null | sort -rn | head -6`], 60_000);
    if (!out.trim()) return [];
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [kbRaw, ...pathParts] = line.split(/\s+/);
        const gib = (Number(kbRaw) || 0) / (1024 * 1024);
        return { label: `pasta ${pathParts.join(' ')}`, detail: `${gib.toFixed(1)} GiB` };
      });
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [disk, memory] = await Promise.all([this.readDisk(), this.readMemory()]);
      const sample: HostPressureSample = {
        diskUsedPct: disk.usedPct,
        diskTotalGib: disk.totalGib,
        diskFreeGib: disk.freeGib,
        memUsedPct: memory.memUsedPct,
        swapUsedPct: memory.swapUsedPct,
      };
      const verdict = evaluateHostPressure(sample, this.thresholds());

      if (verdict.level === 'ok') {
        // Voltou ao normal depois de um episódio: registra na trilha (sem zap)
        // pra o dono ver no cockpit que a faxina resolveu.
        if (this.lastLevel !== 'ok') {
          this.lastLevel = 'ok';
          await emitMasterEvent(this.prisma, {
            type: 'host.disk_recovered',
            severity: 'info',
            companyId: envInt('MASTER_ALERT_WA_COMPANY_ID', 1) || 1,
            dedupKey: 'host-disk',
            payload: { state: verdict.state, diskUsedPct: Math.round(disk.usedPct), freeGib: Number(disk.freeGib.toFixed(1)) },
          });
        }
        return;
      }

      // Cooldown local (cinto + suspensório do throttle da rota): crítico grita
      // mais vezes que aviso, mas nunca metralha.
      const cooldownMs = verdict.level === 'critical'
        ? Math.max(60_000, envInt('HBX_DISK_WATCH_CRIT_COOLDOWN_MS', 6 * 60 * 60 * 1000))
        : Math.max(60_000, envInt('HBX_DISK_WATCH_WARN_COOLDOWN_MS', 24 * 60 * 60 * 1000));
      const escalated = verdict.level === 'critical' && this.lastLevel !== 'critical';
      this.lastLevel = verdict.level;
      if (!escalated && Date.now() - this.lastFiredAt < cooldownMs) return;
      this.lastFiredAt = Date.now();

      await this.fire(verdict, sample, memory);
    } catch (error) {
      this.logger.warn(`tick falhou: ${String((error as Error)?.message || error)}`);
    } finally {
      this.running = false;
    }
  }

  private async fire(
    verdict: HostPressureVerdict,
    sample: HostPressureSample,
    memory: { memTotalGib: number; memAvailGib: number },
  ): Promise<void> {
    const companyId = envInt('MASTER_ALERT_WA_COMPANY_ID', 1) || 1;
    const critical = verdict.level === 'critical';
    const type = critical ? 'host.disk_critical' : 'host.disk_warning';

    // Só AGORA gasta IO pra descobrir o quê encheu — alarme sem causa é alarme
    // ignorado, mas medir a causa a cada tick é desperdício.
    const [docker, database, folders] = await Promise.all([
      this.readDockerUsage(),
      this.readDatabaseUsage(),
      this.readHostFolders(),
    ]);
    const consumers = [...docker, ...database, ...folders];

    const subject = critical
      ? `HBX CRÍTICO: disco da VPS em ${sample.diskUsedPct.toFixed(0)}%`
      : `HBX: disco da VPS em ${sample.diskUsedPct.toFixed(0)}%`;

    const text = [
      critical
        ? 'O disco da VPS de produção está CRÍTICO. Banco sem espaço para de escrever e derruba tudo.'
        : 'O disco da VPS de produção passou do limite de aviso.',
      '',
      `• disco: ${sample.diskUsedPct.toFixed(0)}% usado — livre ${sample.diskFreeGib.toFixed(1)} GiB de ${sample.diskTotalGib.toFixed(0)} GiB`,
      `• RAM: ${sample.memUsedPct.toFixed(0)}% usada — livre ${memory.memAvailGib.toFixed(1)} GiB de ${memory.memTotalGib.toFixed(0)} GiB`,
      sample.swapUsedPct >= 0 ? `• swap: ${sample.swapUsedPct.toFixed(0)}% usado` : '• swap: host sem swap',
      '',
      'O que está ocupando:',
      ...(consumers.length
        ? consumers.map((item) => `  - ${item.label}: ${item.detail}`)
        : ['  - não consegui medir (docker/banco/pastas indisponíveis nesta leitura)']),
      '',
      'Faxina segura (o vigia NUNCA apaga nada sozinho):',
      '  npm run docker:clean:vps        → imagens sem uso + cache de build antigo',
      '  node scripts/ops/vps-retention.js        → mostra o que a retenção apagaria (dry-run)',
      '  node scripts/ops/vps-retention.js --apply → aplica a retenção',
      '',
      `Motivos: ${verdict.reasons.join(' · ')}`,
    ].join('\n');

    const eventId = await emitMasterEvent(this.prisma, {
      type,
      severity: critical ? 'action_required' : 'attention',
      companyId,
      dedupKey: 'host-disk',
      payload: {
        state: verdict.state,
        diskUsedPct: Math.round(sample.diskUsedPct),
        diskFreeGib: Number(sample.diskFreeGib.toFixed(1)),
        diskTotalGib: Math.round(sample.diskTotalGib),
        memUsedPct: Math.round(sample.memUsedPct),
        swapUsedPct: Math.round(sample.swapUsedPct),
        reasons: verdict.reasons.join(','),
        topConsumers: consumers.slice(0, 12),
      },
    });

    const delivered = await this.masterAlert.routeEvent({
      id: eventId,
      type,
      severity: critical ? 'action_required' : 'attention',
      companyId,
      dedupKey: 'host-disk',
      subject,
      text,
    });
    this.logger.warn(
      `ALARME DE DISCO (${verdict.level}) ${sample.diskUsedPct.toFixed(0)}% — email=${delivered.email} whatsapp=${delivered.whatsapp} sino=${delivered.sino}`,
    );
  }
}
