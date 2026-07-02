import { PrismaClient } from '@prisma/client';

/**
 * SourceBudgetService — FREIO ÚNICO por fonte (Sprint 3 MOTOR-RFB-FILA, 02/07).
 *
 * Generaliza o disjuntor mensal do Brave (30/06, incidente "estourou 1000") num governor FÍSICO,
 * persistente e por fonte. Substitui 3 mecanismos com furos diferentes: o disjuntor Brave local
 * do radar-web-enrichment, o throttle solto de 700ms da BrasilAPI no L4 e complementa a heurística
 * de pressão da frota com um teto ESTÁTICO por fonte grátis (dado medido: 20 motores na mesma
 * fonte = timeout; 6–8 = ótimo).
 *
 * PADRÃO (o mesmo que provou funcionar no disjuntor Brave): tudo ESTÁTICO + PrismaClient LAZY.
 * Os serviços de enriquecimento são instanciados na mão (`new`) em vários call-sites → injetar
 * Prisma via DI quebraria; estado estático serve a TODA instância do processo e o contador
 * persistido em banco (tabela SourceApiUsage) sobrevive a restart/recreate.
 *
 * POLÍTICA DE FALHA (regra do sprint):
 *   PAGO  (brave, google_places, serper) → FAIL-CLOSED: erro ao ler o contador = NÃO chama.
 *   GRÁTIS (brasilapi, ddg, bing, searxng) → FAIL-OPEN: contagem é best-effort; blip de banco
 *   nunca derruba o fluxo grátis.
 *
 * NÃO confundir com enrichment-cost: aquele é orçamento COMERCIAL por plano do cliente; este é
 * o teto FÍSICO por fonte (chave/IP). Os dois coexistem — um lead pode ter saldo no plano e a
 * fonte estar fisicamente esgotada (e vice-versa).
 *
 * Serper NÃO é interceptado aqui: a chamada vive no motor Python. O governor só REPASSA o
 * orçamento por env (HBX_ENRICH_ALLOW_PAID via resolveEnrichmentPaidFlags → request do motor)
 * e reflete o estado no gauge.
 */

export type SourceBudgetSource =
  | 'brave'
  | 'brasilapi'
  | 'serper'
  | 'google_places'
  | 'ddg'
  | 'bing'
  | 'searxng';

type SourceUsageGauge = {
  source: SourceBudgetSource;
  tier: 'paid' | 'free';
  period: 'month' | 'day' | 'engine';
  cap: number | null;
  used: number | null;
  usedMonth: number | null;
  periodKey: string;
  concurrencyCap: number | null;
  activeNow: number | null;
  minIntervalMs: number | null;
  backoffUntil: string | null;
  allowed: boolean;
  counterError: boolean;
};

const PAID_SOURCES = new Set<SourceBudgetSource>(['brave', 'google_places', 'serper']);
const FREE_SEARCH_SOURCES: SourceBudgetSource[] = ['ddg', 'bing', 'searxng'];
const TRUTHY = new Set(['true', '1', 'on', 'yes', 'sim']);

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class SourceBudgetService {
  // ── contador persistente (PrismaClient LAZY, compartilhado com todo o processo) ─────────────
  private static _counterDb: PrismaClient | null = null;
  private static counterDb(): PrismaClient {
    if (!SourceBudgetService._counterDb) {
      SourceBudgetService._counterDb = new PrismaClient();
    }
    return SourceBudgetService._counterDb;
  }

  // throttle do log de "teto atingido/fail-closed" — 1x/min por fonte, igual ao disjuntor Brave
  private static readonly _blockedLoggedAt = new Map<string, number>();
  private static logBlocked(source: SourceBudgetSource, message: string) {
    const now = Date.now();
    const last = SourceBudgetService._blockedLoggedAt.get(source) || 0;
    if (now - last < 60_000) return;
    SourceBudgetService._blockedLoggedAt.set(source, now);
    // eslint-disable-next-line no-console
    console.warn(`[source-governor] ${source}: ${message}`);
  }

  // ── tetos por fonte (env é a fonte de verdade; <=0 = sem teto, escape hatch explícito) ──────
  /** Brave: teto MENSAL — env herdada do disjuntor original (default 900, margem sob os ~1000). */
  static braveMonthlyCap(): number {
    return integerEnv('HBX_BRAVE_MONTHLY_CAP', 900);
  }
  /** Google Places: teto DIÁRIO físico (fonte de emergência — nunca metralhar buscador pago). */
  static googlePlacesDailyCap(): number {
    return integerEnv('HBX_GOOGLE_PLACES_DAILY_CAP', 200);
  }
  /** Serper: OFF por default — mesma env que o resolveEnrichmentPaidFlags repassa ao motor. */
  static serperAllowed(): boolean {
    return TRUTHY.has(String(process.env.HBX_ENRICH_ALLOW_PAID ?? '').trim().toLowerCase());
  }
  /**
   * Teto de CONCORRÊNCIA por fonte GRÁTIS (GATE G2 — número final é decisão do dono; default 8,
   * o "6–8 = ótimo" medido). Vale pro semáforo local E como clamp da frota dentro da elasticidade.
   * Override por fonte: HBX_SOURCE_<FONTE>_MAX_CONCURRENCY (ex.: HBX_SOURCE_DDG_MAX_CONCURRENCY).
   */
  static freeSourceConcurrencyCap(source?: SourceBudgetSource): number {
    if (source) {
      const specific = integerEnv(`HBX_SOURCE_${source.toUpperCase()}_MAX_CONCURRENCY`, 0);
      if (specific > 0) return specific;
    }
    return integerEnv('HBX_SOURCE_FREE_MAX_CONCURRENCY', 8);
  }
  /**
   * Clamp da FROTA (motores simultâneos raspando fonte grátis) — mesmo número do teto de
   * concorrência (cada motor ≈ 1 busca em voo, HBX_WEB_SEARCH_CONCURRENCY=1). Consumido pelo
   * resolveSourceHeadroomEngineCount do hbx-engine-pool: entra DENTRO da elasticidade, não é
   * mecanismo novo de parada. <=0 = sem clamp.
   */
  static freeSourceEngineCeiling(): number {
    return integerEnv('HBX_SOURCE_FREE_MAX_CONCURRENCY', 8);
  }

  // ── chave de período ─────────────────────────────────────────────────────────────────────────
  private static currentYearMonth(): string {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
  }
  private static currentDay(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  }
  private static periodKeyFor(source: SourceBudgetSource): string {
    return source === 'google_places'
      ? SourceBudgetService.currentDay()
      : SourceBudgetService.currentYearMonth();
  }

  // ── fila serializada + intervalo mínimo por fonte (substitui os throttles ad-hoc) ───────────
  private static readonly _queues = new Map<string, Promise<void>>();
  private static readonly _lastCallAt = new Map<string, number>();
  private static readonly _backoffUntil = new Map<string, number>();

  private static minIntervalMs(source: SourceBudgetSource): number {
    if (source === 'brave') return Math.max(0, integerEnv('HBX_BRAVE_MIN_INTERVAL_MS', 1100));
    if (source === 'brasilapi') return Math.max(0, integerEnv('HBX_BRASILAPI_MIN_INTERVAL_MS', 700));
    return 0;
  }

  /**
   * 429/Retry-After: a fonte pediu pra segurar — a fila daquela fonte espera o backoff vencer
   * antes do próximo disparo (teto de 120s pra nunca pendurar o fluxo por header maluco).
   */
  static reportRateLimited(source: SourceBudgetSource, retryAfterSeconds?: number | null) {
    const seconds = Number.isFinite(Number(retryAfterSeconds)) && Number(retryAfterSeconds) > 0
      ? Math.min(120, Number(retryAfterSeconds))
      : 30;
    const until = Date.now() + seconds * 1000;
    const current = SourceBudgetService._backoffUntil.get(source) || 0;
    if (until > current) SourceBudgetService._backoffUntil.set(source, until);
    SourceBudgetService.logBlocked(source, `429 da fonte — backoff de ${seconds}s antes do próximo disparo.`);
  }

  /**
   * 1 chamada em voo por fonte + intervalo mínimo entre disparos + respeito ao backoff de 429.
   * Erro num item não quebra a fila (mesma blindagem do disjuntor original).
   */
  static schedule<T>(source: SourceBudgetSource, fn: () => Promise<T>): Promise<T> {
    const previous = SourceBudgetService._queues.get(source) || Promise.resolve();
    const queued = previous.then(async () => {
      const minInterval = SourceBudgetService.minIntervalMs(source);
      const readyAt = Math.max(
        (SourceBudgetService._lastCallAt.get(source) || 0) + minInterval,
        SourceBudgetService._backoffUntil.get(source) || 0,
      );
      const wait = readyAt - Date.now();
      if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      SourceBudgetService._lastCallAt.set(source, Date.now());
      return fn();
    });
    SourceBudgetService._queues.set(source, queued.then(() => undefined, () => undefined));
    return queued;
  }

  // ── gate PAGO (fail-closed) ──────────────────────────────────────────────────────────────────
  /**
   * true = pode chamar (e o contador do período já foi incrementado); false = NÃO chama.
   * FAIL-CLOSED: qualquer erro lendo/gravando o contador (tabela ausente, banco fora) bloqueia a
   * fonte paga — "fonte paga sem contador NÃO chama". Check-then-increment igual ao disjuntor
   * original (para o Brave a fila do schedule() já serializa; overshoot por corrida é desprezível
   * e limitado à concorrência do processo).
   */
  static async tryConsumePaid(source: 'brave' | 'google_places'): Promise<boolean> {
    const cap = source === 'brave'
      ? SourceBudgetService.braveMonthlyCap()
      : SourceBudgetService.googlePlacesDailyCap();
    if (cap <= 0) return true; // sem teto (escolha explícita do dono via env)
    try {
      const periodKey = SourceBudgetService.periodKeyFor(source);
      const db = SourceBudgetService.counterDb() as any;
      const row = await db.sourceApiUsage.upsert({
        where: { source_yearMonth: { source, yearMonth: periodKey } },
        create: { source, yearMonth: periodKey, count: 0 },
        update: {},
      });
      if (Number(row?.count || 0) >= cap) {
        SourceBudgetService.logBlocked(source, `teto atingido (${row.count}/${cap} no período ${periodKey}) — chamadas pausadas até virar o período.`);
        return false;
      }
      await db.sourceApiUsage.update({
        where: { source_yearMonth: { source, yearMonth: periodKey } },
        data: { count: { increment: 1 } },
      });
      return true;
    } catch (error) {
      SourceBudgetService.logBlocked(source, `FAIL-CLOSED: erro no contador (${String((error as any)?.message || error).slice(0, 120)}) — fonte paga não chama sem contador.`);
      return false;
    }
  }

  // ── contagem GRÁTIS (fail-open, best-effort) ────────────────────────────────────────────────
  /** Incrementa o contador do período pra fonte grátis — nunca lança, nunca bloqueia. */
  static async countFreeCall(source: 'brasilapi' | 'ddg' | 'bing' | 'searxng'): Promise<void> {
    try {
      const periodKey = SourceBudgetService.periodKeyFor(source);
      const db = SourceBudgetService.counterDb() as any;
      await db.sourceApiUsage.upsert({
        where: { source_yearMonth: { source, yearMonth: periodKey } },
        create: { source, yearMonth: periodKey, count: 1 },
        update: { count: { increment: 1 } },
      });
    } catch { /* best-effort — grátis é FAIL-OPEN, blip de banco não derruba o fluxo */ }
  }

  // ── semáforo de CONCORRÊNCIA por fonte grátis (in-memory, fail-open) ────────────────────────
  private static readonly _activeSlots = new Map<string, number>();
  private static readonly _slotWaiters = new Map<string, Array<() => void>>();

  static activeFreeSlots(source: SourceBudgetSource): number {
    return SourceBudgetService._activeSlots.get(source) || 0;
  }

  /**
   * No máx N chamadas simultâneas por fonte grátis (default 8 — GATE G2). Excedente espera em
   * FIFO em memória; sem banco no caminho = fail-open por construção.
   */
  static async withFreeSlot<T>(source: 'ddg' | 'bing' | 'searxng', fn: () => Promise<T>): Promise<T> {
    const cap = SourceBudgetService.freeSourceConcurrencyCap(source);
    if (cap > 0) {
      while ((SourceBudgetService._activeSlots.get(source) || 0) >= cap) {
        await new Promise<void>((resolve) => {
          const waiters = SourceBudgetService._slotWaiters.get(source) || [];
          waiters.push(resolve);
          SourceBudgetService._slotWaiters.set(source, waiters);
        });
      }
    }
    SourceBudgetService._activeSlots.set(source, (SourceBudgetService._activeSlots.get(source) || 0) + 1);
    void SourceBudgetService.countFreeCall(source);
    try {
      return await fn();
    } finally {
      SourceBudgetService._activeSlots.set(source, Math.max(0, (SourceBudgetService._activeSlots.get(source) || 0) - 1));
      const waiters = SourceBudgetService._slotWaiters.get(source) || [];
      const next = waiters.shift();
      if (next) next();
    }
  }

  // ── snapshot pro gauge do cockpit (usado/teto/período por fonte) ────────────────────────────
  static async usageSnapshot(): Promise<{
    ok: boolean;
    generatedAt: string;
    month: string;
    counterError: boolean;
    sources: SourceUsageGauge[];
  }> {
    const month = SourceBudgetService.currentYearMonth();
    const today = SourceBudgetService.currentDay();
    let rows: Array<{ source: string; yearMonth: string; count: number }> = [];
    let counterError = false;
    try {
      const db = SourceBudgetService.counterDb() as any;
      rows = await db.sourceApiUsage.findMany({
        where: { yearMonth: { startsWith: month } },
      });
    } catch {
      counterError = true;
    }
    const usedFor = (source: string, periodKey: string) => {
      if (counterError) return null;
      const row = rows.find((r) => r.source === source && r.yearMonth === periodKey);
      return Number(row?.count || 0);
    };
    const monthTotal = (source: string) => {
      if (counterError) return null;
      return rows.filter((r) => r.source === source).reduce((sum, r) => sum + Number(r.count || 0), 0);
    };
    const backoffIso = (source: SourceBudgetSource) => {
      const until = SourceBudgetService._backoffUntil.get(source) || 0;
      return until > Date.now() ? new Date(until).toISOString() : null;
    };

    const braveCap = SourceBudgetService.braveMonthlyCap();
    const placesCap = SourceBudgetService.googlePlacesDailyCap();
    const sources: SourceUsageGauge[] = [
      {
        source: 'brave', tier: 'paid', period: 'month',
        cap: braveCap > 0 ? braveCap : null,
        used: usedFor('brave', month), usedMonth: usedFor('brave', month), periodKey: month,
        concurrencyCap: null, activeNow: null,
        minIntervalMs: SourceBudgetService.minIntervalMs('brave'),
        backoffUntil: backoffIso('brave'),
        allowed: !counterError && (braveCap <= 0 || Number(usedFor('brave', month) || 0) < braveCap),
        counterError,
      },
      {
        source: 'google_places', tier: 'paid', period: 'day',
        cap: placesCap > 0 ? placesCap : null,
        used: usedFor('google_places', today), usedMonth: monthTotal('google_places'), periodKey: today,
        concurrencyCap: null, activeNow: null,
        minIntervalMs: null,
        backoffUntil: backoffIso('google_places'),
        allowed: !counterError && (placesCap <= 0 || Number(usedFor('google_places', today) || 0) < placesCap),
        counterError,
      },
      {
        // Serper roda DENTRO do motor Python — aqui só o repasse (env) e a visibilidade.
        source: 'serper', tier: 'paid', period: 'engine',
        cap: null, used: null, usedMonth: null, periodKey: month,
        concurrencyCap: null, activeNow: null, minIntervalMs: null, backoffUntil: null,
        allowed: SourceBudgetService.serperAllowed(),
        counterError: false,
      },
      {
        source: 'brasilapi', tier: 'free', period: 'month',
        cap: null, used: usedFor('brasilapi', month), usedMonth: usedFor('brasilapi', month), periodKey: month,
        concurrencyCap: null, activeNow: null,
        minIntervalMs: SourceBudgetService.minIntervalMs('brasilapi'),
        backoffUntil: backoffIso('brasilapi'),
        allowed: true,
        counterError,
      },
      ...FREE_SEARCH_SOURCES.map((source): SourceUsageGauge => ({
        source, tier: 'free', period: 'month',
        cap: null, used: usedFor(source, month), usedMonth: usedFor(source, month), periodKey: month,
        concurrencyCap: SourceBudgetService.freeSourceConcurrencyCap(source),
        activeNow: SourceBudgetService.activeFreeSlots(source),
        minIntervalMs: null,
        backoffUntil: backoffIso(source),
        allowed: true,
        counterError,
      })),
    ];

    return {
      ok: !counterError,
      generatedAt: new Date().toISOString(),
      month,
      counterError,
      sources,
    };
  }

  /** true quando a fonte é paga (política fail-closed). Exposto p/ testes/documentação viva. */
  static isPaidSource(source: SourceBudgetSource): boolean {
    return PAID_SOURCES.has(source);
  }
}
