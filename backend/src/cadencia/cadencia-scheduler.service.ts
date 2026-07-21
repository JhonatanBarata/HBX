import { Injectable } from '@nestjs/common';
import { CadenciaService } from './cadencia.service';
import { CadenciaRotinaService } from './cadencia-rotina.service';
import type { OutboundExecutor, OutboundExecutorResult } from '../automation/outbound-orchestrator.service';

// WORM-13 — S07 (MOTOR-ÚNICO): este service NÃO tem mais timer próprio. Quem
// dá o tick agora é o OutboundOrchestratorService
// (backend/src/automation/outbound-orchestrator.service.ts) — UM scheduler
// central pra todos os executores de outbound, rodando em SÉRIE (chip é
// recurso único). `AutomationModule` injeta `CadenciaSchedulerService` só pra
// chamar `getExecutors()` e registrar os dois executores abaixo.
//
// O CORPO de `runDueSteps`/`runDueRoutines` (cadencia.service.ts,
// cadencia-rotina.service.ts) NÃO foi tocado — só a assinatura de registro
// mudou. FREIO PRINCIPAL preservado: os dois só fazem algo se
// HBX_CADENCIA_RUNNER_ENABLED estiver ON. O getter `enabled` abaixo é a MESMA
// checagem que o timer antigo fazia ANTES de sequer chamar os runners (evita
// entrar na camada de serviço à toa quando a flag está OFF); cada runner
// TAMBÉM checa a flag por dentro (fonte única do valor da flag — o env — não
// muda; a dupla checagem já existia antes desta sprint, só mudou de dono).
const RUNNER_FLAG = 'HBX_CADENCIA_RUNNER_ENABLED';

@Injectable()
export class CadenciaSchedulerService {
  constructor(
    private readonly cadencia: CadenciaService,
    private readonly rotinas: CadenciaRotinaService,
  ) {}

  private get enabled(): boolean {
    const v = String(process.env[RUNNER_FLAG] || '').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  /** S07: os dois executores que o OutboundOrchestratorService registra no
   * lugar do timer próprio que este service tinha antes. */
  getExecutors(): OutboundExecutor[] {
    return [this.buildStepsExecutor(), this.buildRoutinesExecutor()];
  }

  private buildStepsExecutor(): OutboundExecutor {
    return {
      key: 'cadencia_steps',
      isEnabled: () => this.enabled,
      tick: async (now: Date): Promise<OutboundExecutorResult> => {
        const result: any = await this.cadencia.runDueSteps(now);
        return {
          ok: result?.ok !== false,
          didWork: Boolean(result?.executed),
          detail: result,
        };
      },
    };
  }

  private buildRoutinesExecutor(): OutboundExecutor {
    return {
      key: 'cadencia_rotinas',
      isEnabled: () => this.enabled,
      tick: async (now: Date): Promise<OutboundExecutorResult> => {
        const result: any = await this.rotinas.runDueRoutines(now);
        return {
          ok: result?.ok !== false,
          didWork: Boolean(result?.ran),
          detail: result,
        };
      },
    };
  }
}
