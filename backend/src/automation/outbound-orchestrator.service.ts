import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';

// ============================================================================
// S07 (MOTOR-ÚNICO) — OutboundOrchestratorService.
//
// Antes desta sprint havia agendadores proativos independentes, cada um com o
// seu próprio `setInterval` (ex.: CadenciaSchedulerService). Este service é o
// UM scheduler central: um timer só, que aciona os EXECUTORES REGISTRADOS em
// SÉRIE (nunca em paralelo — o chip WhatsApp é recurso único; dois executores
// mandando ao mesmo tempo é risco de conflito de sessão). Mesmo padrão
// anti-sobreposição (`running` guard) que o CadenciaSchedulerService antigo já
// usava.
//
// Executores NÃO são reescritos aqui (README "SALVAR", CONTRATO.md §2.1): cada
// dono de domínio (cadência, e no futuro outros) continua dono da sua própria
// execução e da sua própria flag — o orquestrador só decide A ORDEM e ISOLA
// falhas, nunca decide "se" um executor deve rodar além do que o próprio
// `isEnabled()` do executor disser (fonte única da flag preservada dentro de
// cada executor — nada liga sozinho pelo simples fato de estar registrado
// aqui).
//
// Erro de 1 executor é ISOLADO (try/catch por executor) — nunca derruba o
// tick dos outros.
// ============================================================================

/** Resultado de UM executor em UM tick. `didWork` é o sinal genérico que o
 * orquestrador usa pra decidir se vale logar o tick (padrão herdado do
 * CadenciaSchedulerService antigo: "só loga quando algo executou"). */
export type OutboundExecutorResult = {
  ok: boolean;
  didWork: boolean;
  detail?: Record<string, unknown> | string | null;
};

/** Contrato fixado em CONTRATO.md (S07): `{ key, isEnabled, tick }`. */
export interface OutboundExecutor {
  key: string;
  isEnabled(): boolean;
  tick(now: Date): Promise<OutboundExecutorResult>;
}

export const OUTBOUND_EXECUTORS = 'OUTBOUND_EXECUTORS';

export type OutboundExecutorTelemetry = {
  key: string;
  enabled: boolean;
  lastTickAt: string | null;
  lastResult: 'ok' | 'skipped' | 'error' | null;
};

// Mesmo env do timer antigo (cadencia-scheduler.service.ts): HBX_CADENCIA_TICK_MS,
// default 60000. NÃO renomeado aqui de propósito — rename de flags/envs é
// trabalho da S20 (CONTRATO.md §5.1, "flags novas nascem OFF" + rename só no
// fim), não desta sprint. Ler o MESMO nome de env preserva a cadência exata
// que a cadência já tinha em produção.
const TICK_MS = Number(process.env.HBX_CADENCIA_TICK_MS || '60000') || 60000;

@Injectable()
export class OutboundOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboundOrchestratorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly telemetry = new Map<string, OutboundExecutorTelemetry>();

  constructor(
    @Optional() @Inject(OUTBOUND_EXECUTORS) private readonly executors: OutboundExecutor[] = [],
  ) {
    for (const executor of this.executors) {
      this.telemetry.set(executor.key, { key: executor.key, enabled: false, lastTickAt: null, lastResult: null });
    }
  }

  onModuleInit() {
    const keys = this.executors.map((e) => e.key).join(', ') || '(nenhum)';
    this.logger.log(`[automation-orchestrator] iniciado — tick ${TICK_MS}ms — executores registrados: ${keys}`);
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        this.logger.warn(`[automation-orchestrator] tick falhou: ${String(e?.message || e)}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Privado de propósito — os testes (mesmo padrão dos vizinhos da pasta,
  // `Object.create(Service.prototype)` + cast `any`) chamam via `(svc as
  // any).tick(now)`, sem precisar de um wrapper público só-de-teste.
  private async tick(nowInput?: Date) {
    if (this.running) return; // guard anti-sobreposição — mesmo padrão do scheduler antigo
    this.running = true;
    const now = nowInput ?? new Date();
    const activity: Record<string, OutboundExecutorResult> = {};
    try {
      // SÉRIE, nunca Promise.all — chip é recurso único, executores não podem
      // mandar em paralelo.
      for (const executor of this.executors) {
        const enabled = this.safeIsEnabled(executor);
        if (!enabled) {
          this.telemetry.set(executor.key, { key: executor.key, enabled: false, lastTickAt: null, lastResult: null, ...preservePrevTick(this.telemetry.get(executor.key)) });
          continue;
        }
        try {
          const result = await executor.tick(now);
          this.telemetry.set(executor.key, {
            key: executor.key,
            enabled: true,
            lastTickAt: now.toISOString(),
            lastResult: result?.ok === false ? 'error' : result?.didWork ? 'ok' : 'skipped',
          });
          if (result?.didWork) activity[executor.key] = result;
        } catch (error: any) {
          // ISOLAMENTO: 1 executor falhando NÃO derruba o tick dos outros.
          this.logger.warn(`[automation-orchestrator] executor '${executor.key}' falhou: ${String(error?.message || error)}`);
          this.telemetry.set(executor.key, {
            key: executor.key,
            enabled: true,
            lastTickAt: now.toISOString(),
            lastResult: 'error',
          });
        }
      }
      // Log por tick só quando algo executou (padrão herdado do
      // CadenciaSchedulerService antigo: "so loga quando executed/ran").
      const keys = Object.keys(activity);
      if (keys.length > 0) {
        const summary = keys.map((k) => `${k}=${JSON.stringify(activity[k].detail ?? activity[k])}`).join(' ');
        this.logger.log(`[automation-orchestrator] tick — ${summary}`);
      }
    } finally {
      this.running = false;
    }
  }

  private safeIsEnabled(executor: OutboundExecutor): boolean {
    try {
      return Boolean(executor.isEnabled());
    } catch (error: any) {
      this.logger.warn(`[automation-orchestrator] isEnabled('${executor.key}') falhou: ${String(error?.message || error)}`);
      return false;
    }
  }

  /** S07: telemetria pro GET /automation/overview (`motor.executores`). */
  getTelemetry(): OutboundExecutorTelemetry[] {
    return this.executors.map(
      (executor) =>
        this.telemetry.get(executor.key) ?? { key: executor.key, enabled: false, lastTickAt: null, lastResult: null },
    );
  }
}

// Mantém lastTickAt/lastResult do ciclo anterior quando o executor está
// desligado neste tick (útil pro painel mostrar "última vez que rodou"), sem
// forjar um novo lastTickAt/lastResult que não aconteceu.
function preservePrevTick(prev?: OutboundExecutorTelemetry): Pick<OutboundExecutorTelemetry, 'lastTickAt' | 'lastResult'> {
  if (!prev) return { lastTickAt: null, lastResult: null };
  return { lastTickAt: prev.lastTickAt, lastResult: prev.lastResult };
}
