// ============================================================================
// AI-SOS — o "GRITO" pro dono ligar o PC do 30B (pedido do dono, 11/07).
//
// O que é: watcher que mede a PRESSÃO da IA da VPS (4B, faixa realtime) e,
// quando ela aperta, avisa o master pelos canais que JÁ existem
// (MasterAlertService: e-mail + WhatsApp com teto diário + sino + trilha
// MasterEvent). O aviso pede UMA ação humana: ligar o desktop e o worker da
// ponte (hbx-owner/local-agent, HBX_PONTE_WORKER_ENABLED) — o 30B então puxa
// o trabalho pesado EM LOTE pela fila de missões. O 4B segue sendo o ÚNICO
// modelo do caminho crítico (decisão 11/07): o 30B NUNCA entra síncrono
// (é pull do desktop — rede não permite, contrato do concierge proíbe).
//
// Sinais (janela deslizante de 15 ticks de 1 min):
//   1. Recusas do GOVERNOR na faixa realtime (fila cheia/budget) — delta do
//      snapshot estático do AiGatewayService.
//   2. Falhas reais de extração do concierge (timeout/JSON inválido 2x) —
//      contador estático AiPressureSignals, reportado nos catch dos services.
//   3. Espera p95 da faixa realtime acima do teto.
//
// Padrão da casa (master-watch/cadencia-scheduler): setInterval em
// onModuleInit + flag de gate + guarda `running` + best-effort absoluto.
// Flag: HBX_AI_SOS_ENABLED (default OFF). Cooldown: rota 'ai.pressure_high'
// (throttle 360 min) + trava local — nunca metralha o dono.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { emitMasterEvent } from '../common/master-event';
import { MasterAlertService } from './master-alert.service';
import { AiPressureSignals } from './ai-pressure-signals';

const WINDOW_TICKS = 15; // 15 ticks × 1 min = janela de 15 minutos

function envOn(name: string) {
  return ['true', '1', 'yes', 'on', 'sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}
function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export type AiPressureSample = {
  refusedDelta: number;
  extractorFailsDelta: number;
  waitP95Ms: number;
};

export type AiPressureThresholds = {
  refusals15m: number;
  extractorFails15m: number;
  waitP95Ms: number; // 0 = desliga este sinal
};

export type AiPressureVerdict = {
  trigger: boolean;
  refusals: number;
  extractorFails: number;
  waitP95Ms: number;
  reasons: string[];
};

/** Avaliador PURO (testável offline): janela → veredito. */
export function evaluateAiPressure(samples: AiPressureSample[], thresholds: AiPressureThresholds): AiPressureVerdict {
  const refusals = samples.reduce((sum, s) => sum + Math.max(0, s.refusedDelta), 0);
  const extractorFails = samples.reduce((sum, s) => sum + Math.max(0, s.extractorFailsDelta), 0);
  const waitP95Ms = samples.length ? Math.max(...samples.map((s) => Math.max(0, s.waitP95Ms))) : 0;
  const reasons: string[] = [];
  if (thresholds.refusals15m > 0 && refusals >= thresholds.refusals15m) reasons.push(`recusas=${refusals}`);
  if (thresholds.extractorFails15m > 0 && extractorFails >= thresholds.extractorFails15m) reasons.push(`falhas_extrator=${extractorFails}`);
  if (thresholds.waitP95Ms > 0 && waitP95Ms >= thresholds.waitP95Ms) reasons.push(`p95=${waitP95Ms}ms`);
  return { trigger: reasons.length > 0, refusals, extractorFails, waitP95Ms, reasons };
}

@Injectable()
export class AiPressureWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiPressureWatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly window: AiPressureSample[] = [];
  private lastRefusedTotal: number | null = null;
  private lastExtractorTotal: number | null = null;
  private lastFiredAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAlert: MasterAlertService,
  ) {}

  onModuleInit() {
    if (!envOn('HBX_AI_SOS_ENABLED')) return;
    const tickMs = Math.max(15_000, envInt('HBX_AI_SOS_TICK_MS', 60_000));
    this.timer = setInterval(() => {
      void this.tick();
    }, tickMs);
    this.timer.unref?.();
    this.logger.log(`AI-SOS ligado (tick ${tickMs}ms, janela ${WINDOW_TICKS} ticks)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private thresholds(): AiPressureThresholds {
    return {
      refusals15m: envInt('HBX_AI_SOS_REFUSALS_15M', 3),
      extractorFails15m: envInt('HBX_AI_SOS_EXTRACTOR_FAILS_15M', 3),
      waitP95Ms: envInt('HBX_AI_SOS_WAIT_P95_MS', 20_000),
    };
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // 1. Deltas dos acumulados (boot/restart zera com segurança via max(0,...)).
      const snapshot: any = AiGatewayService.snapshot();
      const realtime: any = snapshot?.lanes?.realtime || {};
      const refusedTotal = Math.max(0, Math.trunc(Number(realtime.refusedTotal || 0)));
      const refusedDelta = this.lastRefusedTotal == null ? 0 : Math.max(0, refusedTotal - this.lastRefusedTotal);
      this.lastRefusedTotal = refusedTotal;

      const extractorTotal = AiPressureSignals.total();
      const extractorFailsDelta = this.lastExtractorTotal == null ? 0 : Math.max(0, extractorTotal - this.lastExtractorTotal);
      this.lastExtractorTotal = extractorTotal;

      this.window.push({ refusedDelta, extractorFailsDelta, waitP95Ms: Math.max(0, Number(realtime.waitP95Ms || 0)) });
      if (this.window.length > WINDOW_TICKS) this.window.splice(0, this.window.length - WINDOW_TICKS);

      // 2. Veredito.
      const verdict = evaluateAiPressure(this.window, this.thresholds());
      if (!verdict.trigger) return;

      // 3. Cooldown local (cinto + suspensório da rota com throttle 360min).
      const cooldownMs = Math.max(60_000, envInt('HBX_AI_SOS_COOLDOWN_MS', 6 * 60 * 60 * 1000));
      if (Date.now() - this.lastFiredAt < cooldownMs) return;
      this.lastFiredAt = Date.now();

      await this.fire(verdict);
    } catch (error) {
      this.logger.warn(`tick falhou: ${String((error as Error)?.message || error)}`);
    } finally {
      this.running = false;
    }
  }

  private async fire(verdict: AiPressureVerdict): Promise<void> {
    const companyId = envInt('MASTER_ALERT_WA_COMPANY_ID', 1) || 1;
    const missionQueueOn = envOn('HBX_MISSION_QUEUE_ENABLED');
    const p95s = (verdict.waitP95Ms / 1000).toFixed(1);

    const subject = 'HBX: IA apertou — liga o PC do 30B';
    const text = [
      'A IA do servidor começou a recusar/atrasar (últimos 15 min):',
      `• recusas: ${verdict.refusals} · falhas do concierge: ${verdict.extractorFails} · espera p95: ${p95s}s`,
      '',
      'Pra aliviar, liga o computador de casa (o ajudante 30B):',
      '1) Ligar o PC — o Ollama sobe sozinho',
      '2) Rodar: powershell hbx-owner\\local-agent\\start-owner.ps1',
      '   (o worker 30B ja sobe armado; painel http://localhost:3107 → Ponte)',
      '3) O painel precisa apontar pro servidor (HBX_OWNER_BACKEND_URL) —',
      '   sem isso o 30B ajuda so o ambiente local.',
      '',
      'O 30B puxa o trabalho pesado em segundo plano; o 4B continua',
      'atendendo os clientes ao vivo. Desligou o PC, tudo volta ao normal.',
      ...(missionQueueOn ? [] : ['', 'ATENÇÃO: HBX_MISSION_QUEUE_ENABLED está OFF na VPS — sem ela o 30B não recebe tarefas.']),
    ].join('\n');

    // Trilha tipada (cockpit) — state por hora: episódios distintos ficam na
    // história, o MESMO episódio na mesma hora não duplica.
    const eventId = await emitMasterEvent(this.prisma, {
      type: 'ai.pressure_high',
      severity: 'attention',
      companyId,
      dedupKey: 'ai-pressure',
      payload: {
        state: `h-${new Date().toISOString().slice(0, 13)}`,
        refusals: verdict.refusals,
        extractorFails: verdict.extractorFails,
        waitP95Ms: verdict.waitP95Ms,
        reasons: verdict.reasons.join(','),
        signals: AiPressureSignals.snapshot(),
      },
    });

    const delivered = await this.masterAlert.routeEvent({
      id: eventId,
      type: 'ai.pressure_high',
      severity: 'attention',
      companyId,
      dedupKey: 'ai-pressure',
      subject,
      text,
    });
    this.logger.warn(
      `GRITO AI-SOS disparado (${verdict.reasons.join(' ')}) — email=${delivered.email} whatsapp=${delivered.whatsapp} sino=${delivered.sino}`,
    );
  }
}
