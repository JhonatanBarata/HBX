import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GATEWAY-WA S3 — FREIO DE ENVIO POR CHIP ("chip guardian")
 * (docs/PLANEJAMENTOS/GATEWAY-WA/GATEWAY-WA-sprint-3-freio-envio.md).
 *
 * CONTEXTO ($ / risco de ban): o loop de reconexão já morreu (disjuntor do motor). A 2ª máquina
 * clássica de ban é ENVIO: rajada em chip frio, volume fora do padrão do número. Hoje NÃO existe
 * nenhum freio de envio por chip — o dispatcher (polling 5s) manda o que estiver devido. Um cliente
 * que importar uma lista e disparar campanha bana o próprio chip com a NOSSA ferramenta.
 *
 * ESTE SERVIÇO decide, ANTES de despachar, se o envio pode sair AGORA ou deve ser REAGENDADO
 * (volta a PENDING com nextAttemptAt futuro — NUNCA descarta). Três limites por CHIP
 * (chave = whatsappConnectionSessionId, ou tenantKey/company como fallback):
 *   1. teto de envios ativos por MINUTO (janela deslizante de 60s);
 *   2. teto de envios ativos por HORA (janela deslizante de 3600s);
 *   3. espaçamento mínimo entre envios do mesmo chip + jitter.
 * Os tetos são MODULADOS por uma curva de WARM-UP pela idade da sessão (connectedAt): chip novo
 * começa com teto baixo e sobe em degraus ao longo de dias.
 *
 * FLAG (default OFF): só freia se `HBX_WA_SEND_THROTTLE_ENABLED === 'true'`. Sem a flag, `evaluate`
 * SEMPRE devolve `{ allow: true }` — comportamento de envio EXATAMENTE o atual.
 *
 * ISENÇÃO (regra de ouro): responder quem te chamou é o uso MAIS seguro do WhatsApp. Envio ligado a
 * uma conversa com INBOUND nas últimas 24h NÃO passa pelo freio. Detectado via a última mensagem
 * INBOUND da conversa (CompanyMessage.direction='INBOUND').
 *
 * Contadores (enviados/hora por chip, quantas seguradas) ficam em memória estática e são expostos
 * por `getStats()` para o serviço de frota (S1) e para log. 1 instância de backend = memória basta.
 *
 * TODAS as env têm DEFAULTS CONSERVADORES (números baixos): o objetivo é proteger o chip, não
 * espremer throughput. Calibração fina fica com o dono.
 */

type ChipCounter = {
  // timestamps (ms) dos envios ATIVOS liberados, para janela deslizante min/hora.
  sends: number[];
  lastSentAt: number;
  held: number; // quantas vezes o freio segurou (reagendou) este chip
};

export type WaSendThrottleDecision =
  | { allow: true; reason: 'disabled' | 'inbound_exempt' | 'within_caps' }
  | { allow: false; reason: 'per_minute_cap' | 'per_hour_cap' | 'min_spacing'; retryAfterMs: number };

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class WaSendThrottleService {
  private readonly logger = new Logger(WaSendThrottleService.name);

  // Estado por chip. Estático para sobreviver a qualquer re-instanciação de DI no processo (1
  // backend). Não persiste em banco de propósito — no restart o chip recomeça "limpo", o que é o
  // lado SEGURO (nunca solta rajada por causa de contador estale).
  private static readonly counters = new Map<string, ChipCounter>();
  private static heldTotal = 0;
  private static allowedTotal = 0;

  constructor(private readonly prisma: PrismaService) {}

  private isEnabled(): boolean {
    return String(process.env.HBX_WA_SEND_THROTTLE_ENABLED || '').trim().toLowerCase() === 'true';
  }

  // ── ENV (defaults CONSERVADORES) ────────────────────────────────────────────────────────────
  // Tetos do chip MADURO (fim da curva de warm-up). O chip novo recebe uma fração destes.
  private maturePerMinute(): number {
    return Math.max(1, integerEnv('HBX_WA_SEND_MAX_PER_MINUTE', 8));
  }
  private maturePerHour(): number {
    return Math.max(1, integerEnv('HBX_WA_SEND_MAX_PER_HOUR', 120));
  }
  // Espaçamento mínimo entre 2 envios ativos do MESMO chip (ms) + teto do jitter aleatório somado.
  private minSpacingMs(): number {
    return Math.max(0, integerEnv('HBX_WA_SEND_MIN_SPACING_MS', 4000));
  }
  private jitterMaxMs(): number {
    return Math.max(0, integerEnv('HBX_WA_SEND_JITTER_MS', 3000));
  }
  // Janela da curva de warm-up: nº de dias até o chip atingir o teto maduro.
  private warmupDays(): number {
    return Math.max(1, integerEnv('HBX_WA_SEND_WARMUP_DAYS', 14));
  }
  // Fração do teto liberada no 1º dia (chip recém-conectado). Ex.: 15 = 15% do teto maduro.
  private warmupFloorPct(): number {
    return Math.max(1, Math.min(100, integerEnv('HBX_WA_SEND_WARMUP_FLOOR_PCT', 15)));
  }
  // Janela de isenção por inbound recente (horas).
  private inboundExemptHours(): number {
    return Math.max(1, integerEnv('HBX_WA_SEND_INBOUND_EXEMPT_HOURS', 24));
  }
  // Quanto adiar (base, ms) quando o freio segura — some jitter para não sincronizar a fila.
  private rescheduleBaseMs(): number {
    return Math.max(1000, integerEnv('HBX_WA_SEND_RESCHEDULE_MS', 20000));
  }

  /**
   * Fator de warm-up em [floor..1] pela idade da sessão. Chip com connectedAt desconhecido é
   * tratado como MADURO=1 (legado/automação sem sessão) — o teto maduro já é conservador; não
   * penalizar quem não tem sessão evita travar automações antigas.
   */
  private warmupFactor(connectedAt: Date | null | undefined): number {
    if (!connectedAt) return 1;
    const ageMs = Date.now() - new Date(connectedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs <= 0) return this.warmupFloorPct() / 100;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const span = this.warmupDays();
    if (ageDays >= span) return 1;
    const floor = this.warmupFloorPct() / 100;
    // Rampa linear em degraus diários entre floor (dia 0) e 1 (dia = warmupDays).
    const stepDay = Math.floor(ageDays);
    const progressed = stepDay / span; // 0..(<1)
    return Math.min(1, floor + (1 - floor) * progressed);
  }

  private capsForFactor(factor: number): { perMinute: number; perHour: number } {
    return {
      perMinute: Math.max(1, Math.round(this.maturePerMinute() * factor)),
      perHour: Math.max(1, Math.round(this.maturePerHour() * factor)),
    };
  }

  private getCounter(key: string): ChipCounter {
    let counter = WaSendThrottleService.counters.get(key);
    if (!counter) {
      counter = { sends: [], lastSentAt: 0, held: 0 };
      WaSendThrottleService.counters.set(key, counter);
    }
    // Poda a janela para a última hora (a maior janela que consultamos).
    const cutoff = Date.now() - 60 * 60 * 1000;
    if (counter.sends.length) counter.sends = counter.sends.filter((ts) => ts >= cutoff);
    return counter;
  }

  private chipKey(input: { sessionId?: string | null; tenantKey?: string | null; companyId: number }): string {
    return (
      (input.sessionId && `session:${input.sessionId}`) ||
      (input.tenantKey && `tenant:${input.tenantKey}`) ||
      `company:${input.companyId}`
    );
  }

  /**
   * ISENÇÃO por inbound recente: a conversa recebeu uma mensagem INBOUND nas últimas N horas?
   * Best-effort — erro de banco NÃO isenta (volta false) mas também não trava: o pior caso é o
   * envio passar pelo freio normal. Sem conversationId não há como aferir → não isenta.
   */
  private async hasRecentInbound(companyId: number, conversationId: number | null): Promise<boolean> {
    if (!conversationId) return false;
    try {
      const cutoff = new Date(Date.now() - this.inboundExemptHours() * 60 * 60 * 1000);
      const inbound = await this.prisma.companyMessage.findFirst({
        where: {
          companyId,
          conversationId,
          direction: 'INBOUND',
          timestamp: { gte: cutoff },
        },
        select: { id: true },
        orderBy: { timestamp: 'desc' },
      });
      return Boolean(inbound);
    } catch (error) {
      this.logger.warn(`freio: falha ao checar inbound recente conv=${conversationId}: ${String((error as any)?.message || error)}`);
      return false;
    }
  }

  /**
   * Decisão do freio para UM envio ativo. Chamado por sendOne ANTES do dispatch.
   *   allow=true  → segue o envio normal.
   *   allow=false → reagendar (voltar a PENDING com nextAttemptAt = now + retryAfterMs).
   *
   * Ordem: flag OFF → allow; isenção inbound-24h → allow; senão aplica os 3 limites.
   * IMPORTANTE: só REGISTRA o envio (consome cota) quando allow=true — chamador que decidir não
   * enviar por outro motivo não estraga a contagem, pois só chama evaluate uma vez no caminho feliz.
   */
  async evaluate(input: {
    companyId: number;
    sessionId?: string | null;
    tenantKey?: string | null;
    connectedAt?: Date | null;
    conversationId?: number | null;
  }): Promise<WaSendThrottleDecision> {
    if (!this.isEnabled()) {
      return { allow: true, reason: 'disabled' };
    }

    // Isenção: responder quem te chamou (inbound recente) não passa pelo freio.
    if (await this.hasRecentInbound(input.companyId, input.conversationId ?? null)) {
      WaSendThrottleService.allowedTotal += 1;
      return { allow: true, reason: 'inbound_exempt' };
    }

    const key = this.chipKey({ sessionId: input.sessionId, tenantKey: input.tenantKey, companyId: input.companyId });
    const counter = this.getCounter(key);
    const now = Date.now();

    const factor = this.warmupFactor(input.connectedAt ?? null);
    const caps = this.capsForFactor(factor);

    // Espaçamento mínimo + jitter desde o último envio deste chip.
    const spacing = this.minSpacingMs() + Math.floor(Math.random() * (this.jitterMaxMs() + 1));
    if (counter.lastSentAt && now - counter.lastSentAt < spacing) {
      return this.hold(counter, 'min_spacing', spacing - (now - counter.lastSentAt));
    }

    // Teto por minuto (janela 60s).
    const minuteCount = counter.sends.filter((ts) => ts >= now - 60 * 1000).length;
    if (minuteCount >= caps.perMinute) {
      return this.hold(counter, 'per_minute_cap', this.rescheduleDelay());
    }

    // Teto por hora (janela 3600s).
    const hourCount = counter.sends.length; // já podado para 1h em getCounter
    if (hourCount >= caps.perHour) {
      return this.hold(counter, 'per_hour_cap', this.rescheduleDelay());
    }

    // Liberado: registra o envio (consome cota).
    counter.sends.push(now);
    counter.lastSentAt = now;
    WaSendThrottleService.allowedTotal += 1;
    return { allow: true, reason: 'within_caps' };
  }

  private hold(counter: ChipCounter, reason: 'per_minute_cap' | 'per_hour_cap' | 'min_spacing', suggestedMs: number): WaSendThrottleDecision {
    counter.held += 1;
    WaSendThrottleService.heldTotal += 1;
    const retryAfterMs = Math.max(1000, suggestedMs) + Math.floor(Math.random() * (this.jitterMaxMs() + 1));
    return { allow: false, reason, retryAfterMs };
  }

  private rescheduleDelay(): number {
    return this.rescheduleBaseMs() + Math.floor(Math.random() * (this.jitterMaxMs() + 1));
  }

  /**
   * Snapshot READ-ONLY para o serviço de frota (S1) e log. Só lê o estado estático — não muda
   * comportamento. `perChip` lista, por chip com atividade na última hora: enviados/hora,
   * enviados no último minuto, quantas mensagens o freio segurou.
   */
  getStats(): {
    enabled: boolean;
    matureCaps: { perMinute: number; perHour: number };
    warmup: { days: number; floorPct: number };
    minSpacingMs: number;
    inboundExemptHours: number;
    allowedTotal: number;
    heldTotal: number;
    perChip: Array<{ key: string; lastHour: number; lastMinute: number; held: number; lastSentAt: number }>;
  } {
    const now = Date.now();
    const perChip: Array<{ key: string; lastHour: number; lastMinute: number; held: number; lastSentAt: number }> = [];
    for (const [key, counter] of WaSendThrottleService.counters) {
      const lastHour = counter.sends.filter((ts) => ts >= now - 60 * 60 * 1000).length;
      const lastMinute = counter.sends.filter((ts) => ts >= now - 60 * 1000).length;
      if (lastHour === 0 && counter.held === 0) continue; // chip inativo, não polui o snapshot
      perChip.push({ key, lastHour, lastMinute, held: counter.held, lastSentAt: counter.lastSentAt });
    }
    return {
      enabled: this.isEnabled(),
      matureCaps: { perMinute: this.maturePerMinute(), perHour: this.maturePerHour() },
      warmup: { days: this.warmupDays(), floorPct: this.warmupFloorPct() },
      minSpacingMs: this.minSpacingMs(),
      inboundExemptHours: this.inboundExemptHours(),
      allowedTotal: WaSendThrottleService.allowedTotal,
      heldTotal: WaSendThrottleService.heldTotal,
      perChip,
    };
  }

  /** Só para testes: zera o estado estático entre casos. */
  static _resetForTest(): void {
    WaSendThrottleService.counters.clear();
    WaSendThrottleService.heldTotal = 0;
    WaSendThrottleService.allowedTotal = 0;
  }
}
