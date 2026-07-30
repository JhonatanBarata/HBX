import { PrismaClient } from '@prisma/client';

/**
 * ZapCheckGuardService — FREIO FÍSICO do zap-gate (W4, PR02072026,
 * docs/PLANEJAMENTOS/PR02072026/W4-freio-zapgate.md).
 *
 * Contexto (docs/Rules/MOTOR.md L5 "risco ban → NÃO mexer na reconexão" +
 * docs/Rules/WHATSAPP.md): já perdemos chip em jun/26 por volume anômalo no motor Webwhats. O
 * zap-gate (`applyRadarWhatsappCheck` → `WebwhatsBridgeService.checkWhatsappNumbers`) vai virar
 * porta obrigatória da entrega do Radar (W2, em paralelo) + M6 da fábrica → milhares de checks.
 * O SourceBudgetService (Sprint 3) freia DINHEIRO/fontes externas; ninguém freava o zap-gate.
 *
 * Este serviço NUNCA fala com o motor diretamente — ele só decide SE/QUANDO o
 * WebwhatsBridgeService pode chamar, e lembra o resultado. Três camadas, nesta ordem:
 *   1. CACHE (TTL, persistente): número já checado há menos de HBX_ZAP_CHECK_TTL_HOURS
 *      (default 168 = 7 dias) não re-checa — responde do cache. Sobrevive a restart (tabela
 *      WhatsappNumberCheckCache), igual ao padrão do SourceApiUsage.
 *   2. RATE LIMIT (fila global em memória): no máx HBX_ZAP_CHECK_MAX_PER_MIN (default 20)
 *      chamadas reais por minuto ao motor. Excedente ESPERA na fila (nunca descarta) —
 *      1 instância de backend, fila em memória basta.
 *   3. DISJUNTOR (próprio, independente do disjuntor de leitura do bridge):
 *      HBX_ZAP_CHECK_BREAKER_THRESHOLD erros consecutivos (default 5) → abre por
 *      HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN minutos (default 10). Aberto = recusa ANTES de
 *      chamar o motor (chamador trata como indisponível). Meio-aberto após o cooldown: deixa
 *      passar 1 chamada de prova; sucesso fecha o disjuntor, falha reabre o cooldown inteiro.
 *
 * POLÍTICA DE FALHA: erro no freio (banco fora pro cache) NUNCA impede a chamada — cache é
 * best-effort (fail-open), igual à contagem grátis do SourceBudgetService. Quem trata "não deu
 * pra confirmar" é o CHAMADOR (Radar degrada pra unverified; Inbox recusa pedindo retry) — este
 * serviço não decide isso, só freia o VOLUME físico.
 *
 * PADRÃO (mesmo do SourceBudgetService, "provou funcionar"): tudo ESTÁTICO + PrismaClient LAZY
 * — estado estático serve a TODA instância do processo; o cache persiste em banco e sobrevive a
 * restart/recreate.
 */

export type ZapCheckCachedResult = {
  phoneDigits: string;
  exists: boolean;
  remoteJid: string | null;
  checkedAt: Date;
};

type BreakerState = 'closed' | 'open' | 'half_open';

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class ZapCheckGuardService {
  // ── cache TTL persistente (PrismaClient LAZY, compartilhado com todo o processo) ────────────
  private static _cacheDb: PrismaClient | null = null;
  private static cacheDb(): PrismaClient {
    if (!ZapCheckGuardService._cacheDb) {
      ZapCheckGuardService._cacheDb = new PrismaClient();
    }
    return ZapCheckGuardService._cacheDb;
  }

  static ttlHours(): number {
    return Math.max(1, integerEnv('HBX_ZAP_CHECK_TTL_HOURS', 168));
  }

  private static ttlMs(): number {
    return ZapCheckGuardService.ttlHours() * 60 * 60 * 1000;
  }

  /**
   * Lê o cache pros números pedidos. Só devolve entradas DENTRO do TTL — as vencidas são
   * tratadas como cache-miss (o chamador re-checa). Erro de banco = [] (fail-open: não impede a
   * checagem real, só perde a chance de servir do cache desta vez).
   */
  static async readCache(phoneDigitsList: string[]): Promise<Map<string, ZapCheckCachedResult>> {
    const result = new Map<string, ZapCheckCachedResult>();
    const unique = Array.from(new Set(phoneDigitsList.filter(Boolean)));
    if (!unique.length) return result;
    try {
      const db = ZapCheckGuardService.cacheDb() as any;
      const rows = await db.whatsappNumberCheckCache.findMany({
        where: { phoneDigits: { in: unique } },
      });
      const cutoff = Date.now() - ZapCheckGuardService.ttlMs();
      for (const row of rows || []) {
        const checkedAt = new Date(row.checkedAt);
        if (checkedAt.getTime() < cutoff) continue; // TTL vencido = cache-miss
        result.set(row.phoneDigits, {
          phoneDigits: row.phoneDigits,
          exists: Boolean(row.exists),
          remoteJid: row.remoteJid ?? null,
          checkedAt,
        });
      }
    } catch {
      /* fail-open: cache indisponível não impede a checagem real */
    }
    return result;
  }

  /** Grava/atualiza o resultado no cache. Best-effort — erro de banco nunca lança. */
  static async writeCache(results: Array<{ phoneDigits: string; exists: boolean; remoteJid: string | null }>): Promise<void> {
    if (!results.length) return;
    try {
      const db = ZapCheckGuardService.cacheDb() as any;
      const now = new Date();
      await Promise.all(
        results
          .filter((r) => r.phoneDigits)
          .map((r) =>
            db.whatsappNumberCheckCache.upsert({
              where: { phoneDigits: r.phoneDigits },
              create: { phoneDigits: r.phoneDigits, exists: r.exists, remoteJid: r.remoteJid, checkedAt: now },
              update: { exists: r.exists, remoteJid: r.remoteJid, checkedAt: now },
            }).catch(() => null),
          ),
      );
    } catch {
      /* fail-open: falha ao gravar não derruba o fluxo — só perde o cache desta rodada */
    }
  }

  // ── rate limit global (fila em memória, 1 instância de backend basta) ───────────────────────
  static maxPerMinute(): number {
    return Math.max(1, integerEnv('HBX_ZAP_CHECK_MAX_PER_MIN', 20));
  }

  private static _windowStartedAt = 0;
  private static _windowCount = 0;
  private static _queue: Promise<void> = Promise.resolve();
  // Tamanho da janela do rate limit — SEMPRE 60s em produção. Overridable só por teste (evita
  // um teste precisar esperar 60s reais pra provar que a fila espera em vez de descartar).
  private static _windowMs = 60_000;

  /**
   * Serializa uma "unidade de checagem real" (1 chamada HTTP ao motor, que pode cobrir vários
   * números de uma vez) respeitando o teto por minuto — janela deslizante simples (reseta a
   * cada 60s). Excedente ESPERA (nunca descarta) até a janela seguinte abrir vaga.
   *
   * 🔴 29/07 — `maxWaitMs` existe porque esta espera estava DENTRO do request HTTP do usuário.
   * Medido em prod: puxar 25 leads com o banco zerado (nenhum número em cache) estourou o teto
   * no 11º; a espera pela janela seguinte segurou a resposta por 51s, o proxy cortou e o
   * navegador levou 500 num trabalho que tinha dado certo. O freio está certo — o chip precisa
   * dele; errado era quem pagava a conta. Com teto, quem chama de um request de usuário desiste
   * cedo e degrada pro caminho SEGURO que já existe (`breakerOpen: true` → não verificado).
   * Sem `maxWaitMs` o comportamento é o de sempre: espera o que precisar (worker/fila de fundo).
   *
   * Devolve `true` quando conseguiu a vaga, `false` quando desistiu no teto — desistir NÃO
   * consome vaga da janela nem toca no disjuntor (não houve erro, houve fila).
   */
  private static async acquireRateSlot(maxWaitMs?: number): Promise<boolean> {
    const deadline = Number.isFinite(Number(maxWaitMs)) && Number(maxWaitMs) > 0
      ? Date.now() + Number(maxWaitMs)
      : null;
    const myTurn = ZapCheckGuardService._queue;
    let releaseNext: () => void = () => {};
    ZapCheckGuardService._queue = new Promise<void>((resolve) => { releaseNext = resolve; });
    await myTurn;
    try {
      const cap = ZapCheckGuardService.maxPerMinute();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const now = Date.now();
        const windowMs = ZapCheckGuardService._windowMs;
        if (now - ZapCheckGuardService._windowStartedAt >= windowMs) {
          ZapCheckGuardService._windowStartedAt = now;
          ZapCheckGuardService._windowCount = 0;
        }
        if (ZapCheckGuardService._windowCount < cap) {
          ZapCheckGuardService._windowCount += 1;
          return true;
        }
        if (deadline !== null && now >= deadline) return false;
        let waitMs = Math.max(25, ZapCheckGuardService._windowStartedAt + windowMs - now);
        // Nunca dorme além do prazo: acorda no deadline pra devolver a desistência na hora.
        if (deadline !== null) waitMs = Math.min(waitMs, Math.max(1, deadline - now));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } finally {
      releaseNext();
    }
  }

  // ── disjuntor próprio (independente do disjuntor de leitura do WebwhatsBridgeService) ───────
  private static _breakerState: BreakerState = 'closed';
  private static _consecutiveErrors = 0;
  private static _openedUntil = 0;
  private static _halfOpenProbeInFlight = false;

  static breakerThreshold(): number {
    return Math.max(1, integerEnv('HBX_ZAP_CHECK_BREAKER_THRESHOLD', 5));
  }

  static breakerCooldownMs(): number {
    return Math.max(1, integerEnv('HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN', 10)) * 60_000;
  }

  /** Estado atual do disjuntor, já considerando a transição open → half_open pelo relógio. */
  static breakerState(): BreakerState {
    if (ZapCheckGuardService._breakerState === 'open') {
      if (Date.now() >= ZapCheckGuardService._openedUntil) {
        return 'half_open';
      }
      return 'open';
    }
    return ZapCheckGuardService._breakerState;
  }

  /**
   * true = pode tentar a chamada real agora (fechado, ou meio-aberto liberando a ÚNICA prova).
   * false = disjuntor aberto — o chamador NUNCA tenta a rede (evita loop de retry no motor).
   */
  static allowRealCall(): boolean {
    const state = ZapCheckGuardService.breakerState();
    if (state === 'closed') return true;
    if (state === 'open') return false;
    // half_open: só 1 prova em voo por vez.
    if (ZapCheckGuardService._halfOpenProbeInFlight) return false;
    ZapCheckGuardService._halfOpenProbeInFlight = true;
    return true;
  }

  /**
   * 🔴 Devolve a prova meio-aberta SEM veredito — a chamada real nem aconteceu.
   * Existe porque `allowRealCall()` marca `_halfOpenProbeInFlight = true` ANTES do rate limit:
   * se o guard desistir na fila (maxWaitMs), ninguém chamaria `reportSuccess`/`reportFailure` e
   * a prova ficaria em voo PARA SEMPRE — `allowRealCall()` passaria a recusar toda checagem de
   * WhatsApp até o backend reiniciar. Nunca conta erro (não houve falha, houve fila): o estado
   * segue meio-aberto e a próxima tentativa pega a prova.
   */
  static releaseHalfOpenProbe(): void {
    ZapCheckGuardService._halfOpenProbeInFlight = false;
  }

  /** Chamada real teve sucesso: zera erros e fecha o disjuntor. */
  static reportSuccess(): void {
    ZapCheckGuardService._consecutiveErrors = 0;
    ZapCheckGuardService._breakerState = 'closed';
    ZapCheckGuardService._openedUntil = 0;
    ZapCheckGuardService._halfOpenProbeInFlight = false;
  }

  /**
   * Chamada real falhou: conta erro consecutivo. No threshold, abre o disjuntor pelo cooldown
   * inteiro. Falha durante a prova meio-aberta reabre o cooldown na hora (não espera acumular
   * threshold de novo — 1 prova malsucedida já é sinal suficiente de que ainda está ruim).
   */
  static reportFailure(): void {
    const wasHalfOpenProbe = ZapCheckGuardService._halfOpenProbeInFlight;
    ZapCheckGuardService._halfOpenProbeInFlight = false;
    ZapCheckGuardService._consecutiveErrors += 1;
    if (wasHalfOpenProbe || ZapCheckGuardService._consecutiveErrors >= ZapCheckGuardService.breakerThreshold()) {
      ZapCheckGuardService._breakerState = 'open';
      ZapCheckGuardService._openedUntil = Date.now() + ZapCheckGuardService.breakerCooldownMs();
    }
  }

  /**
   * Envelope único: cache → rate limit → disjuntor → chamada real → grava cache.
   *
   * `fetchReal(pending)` recebe só os números que precisam de checagem de verdade (não estavam
   * frescos no cache) e deve devolver o resultado bruto de cada um (mesmo formato de
   * WebwhatsWhatsappNumberCheckResult, mas aqui só os 3 campos que o cache guarda).
   *
   * Disjuntor ABERTO: NÃO lança daqui (nem tenta a rede) — devolve `breakerOpen: true` no
   * envelope com os números pendentes de fora de `results` (só o que já veio do cache fica lá).
   * Quem chama (WebwhatsBridgeService) decide o que fazer com isso — hoje ele transforma
   * `breakerOpen: true` num erro WEBWHATS_UNAVAILABLE, que os consumidores de cima já sabem
   * tratar (Radar degrada pra unverified; Inbox recusa pedindo retry).
   *
   * Erro NA CHAMADA REAL (fetchReal lança): reporta falha ao disjuntor e RELANÇA pro chamador —
   * 1 tentativa real por rodada, sem retry interno aqui (quem decide re-tentar é o chamador, e
   * só na próxima requisição do usuário, nunca em loop automático).
   */
  static async guardedCheck(
    phoneDigitsList: string[],
    fetchReal: (pending: string[]) => Promise<Array<{ phoneDigits: string; exists: boolean; remoteJid: string | null }>>,
    options?: { maxWaitMs?: number },
  ): Promise<{
    results: Map<string, ZapCheckCachedResult>;
    servedFromCache: string[];
    fetchedFresh: string[];
    breakerOpen: boolean;
  }> {
    const unique = Array.from(new Set(phoneDigitsList.filter(Boolean)));
    const results = new Map<string, ZapCheckCachedResult>();
    if (!unique.length) {
      return { results, servedFromCache: [], fetchedFresh: [], breakerOpen: false };
    }

    const cached = await ZapCheckGuardService.readCache(unique);
    const pending = unique.filter((digits) => !cached.has(digits));
    for (const [digits, value] of cached) results.set(digits, value);

    if (!pending.length) {
      return { results, servedFromCache: Array.from(cached.keys()), fetchedFresh: [], breakerOpen: false };
    }

    if (!ZapCheckGuardService.allowRealCall()) {
      return {
        results,
        servedFromCache: Array.from(cached.keys()),
        fetchedFresh: [],
        breakerOpen: true,
      };
    }

    // Fila cheia e o chamador tem prazo (request de usuário): devolve pelo MESMO caminho de
    // degrade do disjuntor aberto — sem tocar a rede e sem marcar falha, porque não houve
    // falha nenhuma, só espera. O lead entra não verificado e o worker confirma depois.
    if (!(await ZapCheckGuardService.acquireRateSlot(options?.maxWaitMs))) {
      // A prova meio-aberta que `allowRealCall()` acabou de reservar volta pro bolso: sem isto
      // ela ficaria em voo pra sempre e mataria toda checagem de WhatsApp até o próximo boot.
      ZapCheckGuardService.releaseHalfOpenProbe();
      return {
        results,
        servedFromCache: Array.from(cached.keys()),
        fetchedFresh: [],
        breakerOpen: true,
      };
    }

    try {
      const fresh = await fetchReal(pending);
      ZapCheckGuardService.reportSuccess();
      const now = new Date();
      for (const row of fresh) {
        if (!row?.phoneDigits) continue;
        results.set(row.phoneDigits, {
          phoneDigits: row.phoneDigits,
          exists: Boolean(row.exists),
          remoteJid: row.remoteJid ?? null,
          checkedAt: now,
        });
      }
      void ZapCheckGuardService.writeCache(fresh);
      return { results, servedFromCache: Array.from(cached.keys()), fetchedFresh: pending, breakerOpen: false };
    } catch (error) {
      ZapCheckGuardService.reportFailure();
      throw error;
    }
  }

  /**
   * Snapshot READ-ONLY do freio para diagnóstico operacional.
   * Só LÊ o estado estático já mantido pelas camadas acima — não muda comportamento, não zera
   * contador, não altera o disjuntor. `breakerState()` já resolve a transição open→half_open pelo
   * relógio, então o snapshot nunca mostra "open" vencido como se ainda estivesse aberto.
   */
  static getStats(): {
    ttlHours: number;
    maxPerMinute: number;
    windowCount: number;
    windowStartedAt: number;
    breakerState: BreakerState;
    breakerThreshold: number;
    breakerCooldownMs: number;
    consecutiveErrors: number;
    openedUntil: number;
    halfOpenProbeInFlight: boolean;
  } {
    return {
      ttlHours: ZapCheckGuardService.ttlHours(),
      maxPerMinute: ZapCheckGuardService.maxPerMinute(),
      windowCount: ZapCheckGuardService._windowCount,
      windowStartedAt: ZapCheckGuardService._windowStartedAt,
      breakerState: ZapCheckGuardService.breakerState(),
      breakerThreshold: ZapCheckGuardService.breakerThreshold(),
      breakerCooldownMs: ZapCheckGuardService.breakerCooldownMs(),
      consecutiveErrors: ZapCheckGuardService._consecutiveErrors,
      openedUntil: ZapCheckGuardService._openedUntil,
      halfOpenProbeInFlight: ZapCheckGuardService._halfOpenProbeInFlight,
    };
  }
}
