import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CadenciaService } from './cadencia.service';
import { CadenciaRotinaService } from './cadencia-rotina.service';

// WORM-13 — scheduler UNICO que aciona os dois runners (cadencia + rotinas).
// FREIO PRINCIPAL: so faz qualquer coisa se HBX_CADENCIA_RUNNER_ENABLED estiver
// ON. Enquanto OFF (default), este timer acorda mas os runners retornam
// 'runner_disabled' sem tocar em nada — nada auto-dispara em producao. O timer em
// si e barato; o gate real vive dentro de cada runner (fonte unica da flag).
const TICK_MS = Number(process.env.HBX_CADENCIA_TICK_MS || '60000') || 60000;
const RUNNER_FLAG = 'HBX_CADENCIA_RUNNER_ENABLED';

@Injectable()
export class CadenciaSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CadenciaSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly cadencia: CadenciaService,
    private readonly rotinas: CadenciaRotinaService,
  ) {}

  private get enabled(): boolean {
    const v = String(process.env[RUNNER_FLAG] || '').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  onModuleInit() {
    if (this.enabled) {
      this.logger.log(`[cadencia] runner LIGADO (${RUNNER_FLAG}=1) — tick ${TICK_MS}ms`);
    } else {
      this.logger.log(`[cadencia] runner DESLIGADO (${RUNNER_FLAG} off) — nada auto-dispara`);
    }
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.logger.warn(`[cadencia] tick falhou: ${String(e?.message || e)}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (!this.enabled) return; // freio: nada roda enquanto a flag estiver OFF
    if (this.running) return; // evita sobreposicao de ciclos
    this.running = true;
    try {
      const steps = await this.cadencia.runDueSteps();
      const routines = await this.rotinas.runDueRoutines();
      if ((steps as any)?.executed || (routines as any)?.ran) {
        this.logger.log(`[cadencia] tick — steps=${JSON.stringify(steps)} rotinas=${JSON.stringify(routines)}`);
      }
    } finally {
      this.running = false;
    }
  }
}
