/**
 * AiGatewayService — GOVERNOR-IA (§9 do PLANO-HIBRIDO-30B, 05/07).
 *
 * REGRA ABSOLUTA do dono: "não chega paulada de perguntas pros IAs; tem que ter fila pra eles não
 * explodirem". Ponto ÚNICO de passagem de TODA chamada de IA do backend ao Ollama. NÃO é fila FIFO
 * única (isso consagraria o atropelo que o CHIP 5 mediu: bot p95 31–38s atrás de 50 raios-X); é
 * fila com 2 FAIXAS e prioridade absoluta pro tempo real.
 *
 * O DADO que motiva (RESULTADO-CHIP5): com o Ollama enfileirando sozinho (NUM_PARALLEL=2 + fila
 * interna), um lote de cards (batch) estrangula o classificador do bot (realtime, gate 9s). A fila
 * única/FIFO consagraria o atropelo. Este governor RESOLVE isso na borda do backend, ANTES do
 * Ollama: realtime passa na frente, batch cede a vez e espera realtime esvaziar (sem starvation
 * eterna — processa quando não há realtime aguardando).
 *
 * ─── 2 FAIXAS ───────────────────────────────────────────────────────────────────────────────────
 *  realtime  (bot ai-intent-classifier, intent-engine NLU, assistente sandbox): PRIORIDADE
 *            ABSOLUTA. Concorrência default 2 (casa com OLLAMA_NUM_PARALLEL=2 da VPS).
 *  batch     (xray-note, saneamento, extração): concorrência 1. PAUSA enquanto houver realtime
 *            ESPERANDO ou EXECUTANDO — não começa um job novo se há realtime na área. Sem
 *            starvation: quando a fila realtime esvazia, o batch admitido roda até o fim. O realtime
 *            que chega no meio de UM job batch em voo espera esse único job (concorrência 1 do batch
 *            garante que o realtime nunca fica atrás de mais de 1 batch), mas ganha a frente de todo
 *            batch AINDA não iniciado.
 *
 * ─── RECUSA CEDO (não trava fundo) ──────────────────────────────────────────────────────────────
 *  Cada chamada informa seu ORÇAMENTO (o timeout do próprio caller). Se a espera prevista
 *  (fila à frente × latência típica da faixa) + latência típica de UM job estoura o orçamento,
 *  a chamada NEM ENTRA na fila — devolve recusa imediata e o caller cai no fallback que JÁ TEM
 *  (keyword/roteiro/nota-null/EMPTY_RESULT). Fila com profundidade máxima por faixa (estouro =
 *  recusa graciosa). NUNCA lança exceção nova pros callers — o contrato de degradação não muda:
 *  `run()` devolve `{ ok:false, refused:true }` e o caller trata como "IA indisponível".
 *
 * ─── FLAG ───────────────────────────────────────────────────────────────────────────────────────
 *  HBX_AI_GATEWAY_ENABLED. Default ON (ver justificativa no RESULTADO-GOVERNOR.md): sob carga baixa
 *  o comportamento é IDÊNTICO ao de hoje (admissão imediata, sem espera, sem recusa) — o governor só
 *  MORDE em rajada, que é exatamente o cenário que o dono mandou resolver. OFF = passa direto (o
 *  grupo de controle do teste de aceite, que reproduz o atropelo).
 *
 * ─── PADRÃO DA CASA ─────────────────────────────────────────────────────────────────────────────
 *  Espelha o SourceBudgetService: classe com estado ESTÁTICO (serve toda instância do processo, sem
 *  DI em cada call-site — os callers batch são instanciados na mão com `new`), telemetria via
 *  snapshot estático exposto no tree-status (:3107 já consome), envs como fonte de verdade.
 */

export type AiGatewayLane = 'realtime' | 'batch';

export type AiGatewayRefusalReason = 'queue_full' | 'budget_exceeded';

/**
 * Resultado de `run()`. Discriminated union — NUNCA lança pro caller. `refused:true` quando a
 * chamada foi recusada CEDO (fila cheia ou espera condenada) → o caller cai no fallback dele.
 * Erro DENTRO do `fn` (rede/timeout do Ollama) NÃO é recusa: propaga como sempre (o caller já
 * trata no try/catch dele) — o gateway só governa a ADMISSÃO, não muda o contrato de erro.
 */
export type AiGatewayRunResult<T> =
  | { ok: true; value: T; refused: false }
  | { ok: false; value: null; refused: true; reason: AiGatewayRefusalReason };

// ─── CRÉDITO UNIVERSAL (PR10072026) — medição de uso por empresa ─────────────────────────────
/**
 * Contexto OPCIONAL de uso, passado pelo caller que SABE a empresa dona da chamada. O gateway
 * não conhece crédito nem banco: só repassa ao listener registrado no boot pelo módulo de
 * créditos (CreditMeterService). Sem listener, sem contexto ou sem companyId válido → nada
 * acontece (byte-idêntico ao comportamento anterior). Emite SÓ quando `fn` teve SUCESSO
 * (uso real de IA); recusa cedo e erro não são uso.
 */
export type AiGatewayUsageContext = {
  companyId?: number | null;
  /** Default por faixa: realtime → 'ai_realtime', batch → 'ai_batch'. */
  actionKey?: string;
  units?: number;
};

export type AiGatewayUsageEvent = {
  lane: AiGatewayLane;
  companyId: number;
  actionKey: string;
  /** IA não tem id natural por chamada — ref única por processo (uso é evento, não entidade). */
  refId: string;
  units: number;
};

type LaneWaiter = { resolve: () => void; enqueuedAt: number };

type LaneRuntime = {
  active: number;
  waiters: LaneWaiter[];
  waitSamples: number[];
  accepted: number;
  refusedQueueFull: number;
  refusedBudget: number;
  completed: number;
};

const TRUTHY = new Set(['true', '1', 'on', 'yes', 'sim']);

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Máx de amostras de espera guardadas por faixa (janela deslizante do p95). */
const WAIT_SAMPLE_WINDOW = 200;

export class AiGatewayService {
  // ── flag ────────────────────────────────────────────────────────────────────────────────────
  /**
   * Default ON. Sob carga baixa é no-op (admissão imediata); só morde em rajada. OFF = bypass total
   * (grupo de controle). `HBX_AI_GATEWAY_ENABLED` é a fonte de verdade; ausente = ligado.
   */
  static isEnabled(): boolean {
    const raw = String(process.env.HBX_AI_GATEWAY_ENABLED ?? '').trim().toLowerCase();
    if (!raw) return true; // default ON
    return TRUTHY.has(raw);
  }

  // ── parâmetros por faixa (env é a fonte de verdade) ───────────────────────────────────────────
  /** realtime: concorrência default 2 (casa com OLLAMA_NUM_PARALLEL=2 da VPS). batch: 1. */
  static laneConcurrency(lane: AiGatewayLane): number {
    return lane === 'realtime'
      ? envInt('HBX_AI_GATEWAY_REALTIME_CONCURRENCY', 2)
      : envInt('HBX_AI_GATEWAY_BATCH_CONCURRENCY', 1);
  }

  /** Profundidade máxima da fila de ESPERA por faixa (estouro = recusa graciosa por queue_full). */
  static laneQueueDepth(lane: AiGatewayLane): number {
    return lane === 'realtime'
      ? envInt('HBX_AI_GATEWAY_REALTIME_MAX_QUEUE', 8)
      : envInt('HBX_AI_GATEWAY_BATCH_MAX_QUEUE', 64);
  }

  /**
   * Latência TÍPICA de UM job da faixa (ms), usada só na conta de recusa-cedo (espera prevista).
   * NÃO é timeout — é a estimativa "quanto costuma demorar" pra decidir se vale entrar na fila.
   * realtime: bot p95 ~6,8s parado (CHIP 5) → default 7000. batch: xray/saneamento p50 ~10–23s,
   * default conservador 20000 (o batch tem orçamento largo; superestimar só recusa mais cedo).
   */
  static laneTypicalLatencyMs(lane: AiGatewayLane): number {
    return lane === 'realtime'
      ? envInt('HBX_AI_GATEWAY_REALTIME_TYPICAL_MS', 7000)
      : envInt('HBX_AI_GATEWAY_BATCH_TYPICAL_MS', 20000);
  }

  // ── medição de uso (CRÉDITO UNIVERSAL) ─────────────────────────────────────────────────────
  private static usageListener: ((usage: AiGatewayUsageEvent) => void) | null = null;
  private static usageSeq = 0;

  /** Registrado 1x no boot pelo módulo de créditos (CreditMeterService); null desliga. */
  static setUsageListener(listener: ((usage: AiGatewayUsageEvent) => void) | null) {
    AiGatewayService.usageListener = listener;
  }

  /** Best-effort ABSOLUTO: medição nunca pode afetar a chamada de IA. */
  private static emitUsage(lane: AiGatewayLane, usage: AiGatewayUsageContext | undefined, value: unknown) {
    try {
      const listener = AiGatewayService.usageListener;
      if (!listener || !usage) return;
      // fetch RESOLVE em HTTP 4xx/5xx (só rejeita em rede/timeout) — todos os call-sites
      // devolvem Response. Resposta não-ok não é inferência real: não conta como uso (senão
      // uma noite de Ollama devolvendo 500 infla exatamente o número que precifica a fase 2).
      const okFlag = (value as { ok?: unknown } | null | undefined)?.ok;
      if (typeof okFlag === 'boolean' && !okFlag) return;
      const companyId = Math.trunc(Number(usage.companyId ?? 0));
      if (!Number.isFinite(companyId) || companyId <= 0) return;
      AiGatewayService.usageSeq += 1;
      listener({
        lane,
        companyId,
        actionKey: String(usage.actionKey || '').trim() || (lane === 'realtime' ? 'ai_realtime' : 'ai_batch'),
        refId: `ai-${process.pid}-${Date.now().toString(36)}-${AiGatewayService.usageSeq}`,
        units: Math.max(1, Math.trunc(Number(usage.units ?? 1)) || 1),
      });
    } catch {
      // medição nunca derruba IA
    }
  }

  // ── estado por faixa (estático — serve todo o processo, sem DI por call-site) ──────────────────
  private static readonly lanes: Record<AiGatewayLane, LaneRuntime> = {
    realtime: { active: 0, waiters: [], waitSamples: [], accepted: 0, refusedQueueFull: 0, refusedBudget: 0, completed: 0 },
    batch: { active: 0, waiters: [], waitSamples: [], accepted: 0, refusedQueueFull: 0, refusedBudget: 0, completed: 0 },
  };

  private static lane(lane: AiGatewayLane): LaneRuntime {
    return AiGatewayService.lanes[lane];
  }

  /** Há realtime ESPERANDO (aguardando slot) OU EXECUTANDO? Batch pausa enquanto isso for verdade. */
  private static realtimeInPlay(): boolean {
    const rt = AiGatewayService.lanes.realtime;
    return rt.active > 0 || rt.waiters.length > 0;
  }

  // ── conta de recusa-cedo ──────────────────────────────────────────────────────────────────────
  /**
   * Espera PREVISTA (ms) antes de este pedido conseguir um slot, dada a fila à frente. Aproximação
   * honesta: (jobs à frente na fila de espera desta faixa) distribuídos pelos slots de concorrência,
   * × latência típica de um job. Batch soma ainda a espera imposta pelo realtime pendente (batch
   * pausa por realtime), estimada pelo backlog realtime.
   */
  private static predictedWaitMs(lane: AiGatewayLane): number {
    const runtime = AiGatewayService.lane(lane);
    const concurrency = Math.max(1, AiGatewayService.laneConcurrency(lane));
    const typical = AiGatewayService.laneTypicalLatencyMs(lane);

    const aheadInQueue = runtime.waiters.length;
    const busyOverflow = Math.max(0, runtime.active - concurrency + 1); // +1 = este pedido disputando
    const rounds = Math.ceil((aheadInQueue + busyOverflow) / concurrency);
    let wait = Math.max(0, rounds) * typical;

    if (lane === 'batch') {
      // Batch cede a vez ao realtime: enquanto houver realtime pendente, o batch não começa. Estima
      // a espera adicional pelo backlog realtime (em voo + esperando) × latência típica do realtime.
      const rt = AiGatewayService.lanes.realtime;
      const rtConc = Math.max(1, AiGatewayService.laneConcurrency('realtime'));
      const rtBacklog = rt.active + rt.waiters.length;
      const rtRounds = Math.ceil(rtBacklog / rtConc);
      wait += Math.max(0, rtRounds) * AiGatewayService.laneTypicalLatencyMs('realtime');
    }
    return wait;
  }

  // ── p95 de espera ─────────────────────────────────────────────────────────────────────────────
  private static recordWait(lane: AiGatewayLane, waitMs: number) {
    const runtime = AiGatewayService.lane(lane);
    runtime.waitSamples.push(waitMs);
    if (runtime.waitSamples.length > WAIT_SAMPLE_WINDOW) {
      runtime.waitSamples.splice(0, runtime.waitSamples.length - WAIT_SAMPLE_WINDOW);
    }
  }

  private static p95(samples: number[]): number {
    if (!samples.length) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return Math.round(sorted[Math.max(0, idx)]);
  }

  // ── semáforo com prioridade (o coração do governor) ───────────────────────────────────────────
  /**
   * Tenta admitir o pedido. Devolve `{ waitedMs }` (0 = pegou slot na hora, >0 = esperou na fila) ou
   * `{ refused }` (recusa cedo — o caller cai no fallback). Quando entra na fila, a promise só
   * resolve via `pump()`, que já contabiliza o slot em `active` ANTES de acordar — ou seja, quem é
   * acordado JÁ tem o slot (o admit NÃO reincrementa `active`; ele só mede a espera).
   */
  private static admit(lane: AiGatewayLane, budgetMs: number): Promise<{ waitedMs: number } | { refused: AiGatewayRefusalReason }> {
    const runtime = AiGatewayService.lane(lane);

    if (AiGatewayService.canStartNow(lane)) {
      runtime.active += 1;
      runtime.accepted += 1;
      AiGatewayService.recordWait(lane, 0);
      return Promise.resolve({ waitedMs: 0 });
    }

    // Vai ter que esperar. Recusa CEDO se a fila está cheia ou a espera prevista condena o orçamento.
    if (runtime.waiters.length >= AiGatewayService.laneQueueDepth(lane)) {
      runtime.refusedQueueFull += 1;
      return Promise.resolve({ refused: 'queue_full' });
    }
    const predicted = AiGatewayService.predictedWaitMs(lane);
    // Espera prevista + 1 job típico não pode passar do orçamento do caller (senão o job entra na
    // fila só pra dar timeout lá na frente — desperdício). Recusa AGORA e deixa o fallback assumir.
    if (predicted + AiGatewayService.laneTypicalLatencyMs(lane) > budgetMs) {
      runtime.refusedBudget += 1;
      return Promise.resolve({ refused: 'budget_exceeded' });
    }

    const enqueuedAt = Date.now();
    return new Promise<{ waitedMs: number }>((resolve) => {
      runtime.waiters.push({
        enqueuedAt,
        resolve: () => {
          // pump() já fez `active += 1` para nós; aqui só medimos a espera e contabilizamos.
          const waitedMs = Date.now() - enqueuedAt;
          runtime.accepted += 1;
          AiGatewayService.recordWait(lane, waitedMs);
          resolve({ waitedMs });
        },
      });
    });
  }

  /** Pode começar AGORA? Slot livre na faixa E (se batch) nenhum realtime em jogo. */
  private static canStartNow(lane: AiGatewayLane): boolean {
    const runtime = AiGatewayService.lane(lane);
    const concurrency = Math.max(1, AiGatewayService.laneConcurrency(lane));
    if (runtime.active >= concurrency) return false;
    if (lane === 'batch' && AiGatewayService.realtimeInPlay()) return false;
    return true;
  }

  /** Libera o slot ao terminar (sucesso OU erro do fn) e reavalia a fila. */
  private static release(lane: AiGatewayLane) {
    const runtime = AiGatewayService.lane(lane);
    runtime.active = Math.max(0, runtime.active - 1);
    runtime.completed += 1;
    AiGatewayService.pump();
  }

  /**
   * Reavalia AMBAS as faixas e acorda quem pode rodar, respeitando prioridade:
   *  1. Drena o realtime primeiro (até a concorrência dele). Cada waiter acordado JÁ ganha o slot
   *     (active += 1 aqui) para não haver corrida entre acordar e reincrementar.
   *  2. Só então libera batch — e batch só avança se NÃO houver realtime em jogo (prioridade
   *     absoluta + anti-atropelo). Assim que um realtime volta a esperar, o batch para de ser
   *     liberado (mas o batch JÁ em voo termina — não é preempção, é não-início).
   * Idempotente e reentrante: chamado a cada release e a cada nova entrada na fila.
   */
  static pump() {
    // 1) realtime primeiro
    const rt = AiGatewayService.lanes.realtime;
    const rtConc = Math.max(1, AiGatewayService.laneConcurrency('realtime'));
    while (rt.active < rtConc && rt.waiters.length > 0) {
      const next = rt.waiters.shift()!;
      rt.active += 1; // o slot é DESTE waiter — reservado antes de acordar (sem corrida)
      next.resolve();
    }

    // 2) batch, só se realtime não estiver em jogo
    const batch = AiGatewayService.lanes.batch;
    const batchConc = Math.max(1, AiGatewayService.laneConcurrency('batch'));
    while (
      batch.active < batchConc &&
      batch.waiters.length > 0 &&
      !AiGatewayService.realtimeInPlay()
    ) {
      const next = batch.waiters.shift()!;
      batch.active += 1;
      next.resolve();
    }
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────────────────────────
  /**
   * PONTO ÚNICO: envolve TODA chamada de IA. `fn` é o fetch cru do caller (prompt/params/semântica
   * intactos — o gateway envolve, não muda o conteúdo). `budgetMs` = o timeout do próprio caller.
   *
   *  - Flag OFF → executa `fn` DIRETO, sem fila, sem recusa: byte-idêntico ao de hoje (grupo de
   *    controle do teste de aceite).
   *  - Flag ON → admite pela faixa; se recusado cedo, devolve `{ refused:true }` (o caller cai no
   *    fallback dele). Se admitido, roda `fn` no slot e libera ao terminar (mesmo em erro).
   *
   * NUNCA lança por causa do gateway. Se `fn` lançar (Ollama fora/ timeout), a exceção PROPAGA como
   * sempre — o caller já a trata no try/catch existente. Só a ADMISSÃO é governada aqui.
   *
   * `usage` (opcional, CRÉDITO UNIVERSAL): quem tem a empresa à mão informa e o sucesso vira
   * evento de medição (ver emitUsage). Omitir = comportamento idêntico ao anterior.
   */
  static async run<T>(
    lane: AiGatewayLane,
    budgetMs: number,
    fn: () => Promise<T>,
    usage?: AiGatewayUsageContext,
  ): Promise<AiGatewayRunResult<T>> {
    if (!AiGatewayService.isEnabled()) {
      const value = await fn();
      AiGatewayService.emitUsage(lane, usage, value);
      return { ok: true, value, refused: false };
    }

    const admission = await AiGatewayService.admit(lane, Math.max(0, Number(budgetMs) || 0));
    if ('refused' in admission) {
      return { ok: false, value: null, refused: true, reason: admission.refused };
    }

    try {
      const value = await fn();
      AiGatewayService.emitUsage(lane, usage, value);
      return { ok: true, value, refused: false };
    } finally {
      AiGatewayService.release(lane);
    }
  }

  // ── telemetria (gauge do :3107 / tree-status) ─────────────────────────────────────────────────
  /**
   * Snapshot por faixa: aceitas / recusadas-cedo (por motivo) / aguardando / em voo / p95 de espera.
   * Mesmo espírito do `SourceBudgetService.usageSnapshot()` — consumido pelo tree-status.
   */
  static snapshot() {
    const laneGauge = (lane: AiGatewayLane) => {
      const r = AiGatewayService.lane(lane);
      return {
        lane,
        concurrency: AiGatewayService.laneConcurrency(lane),
        queueDepthCap: AiGatewayService.laneQueueDepth(lane),
        active: r.active,
        waiting: r.waiters.length,
        accepted: r.accepted,
        refusedQueueFull: r.refusedQueueFull,
        refusedBudget: r.refusedBudget,
        refusedTotal: r.refusedQueueFull + r.refusedBudget,
        completed: r.completed,
        waitP95Ms: AiGatewayService.p95(r.waitSamples),
      };
    };
    return {
      enabled: AiGatewayService.isEnabled(),
      generatedAt: new Date().toISOString(),
      lanes: {
        realtime: laneGauge('realtime'),
        batch: laneGauge('batch'),
      },
    };
  }

  // ── teste: reset do estado estático entre casos (mesmo furo do SourceBudget) ──────────────────
  /** Zera contadores e filas — usado só nos testes de aceite/regressão. */
  static resetForTest() {
    for (const lane of ['realtime', 'batch'] as AiGatewayLane[]) {
      const r = AiGatewayService.lane(lane);
      r.active = 0;
      r.waiters = [];
      r.waitSamples = [];
      r.accepted = 0;
      r.refusedQueueFull = 0;
      r.refusedBudget = 0;
      r.completed = 0;
    }
  }
}
