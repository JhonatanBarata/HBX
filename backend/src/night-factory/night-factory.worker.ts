import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NightFactoryService } from './night-factory.service';
import { NightOrderService, type NightOrderFulfillSummary } from './night-order.service';

const TICK_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class NightFactoryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NightFactoryWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly nightFactoryService: NightFactoryService,
    private readonly nightOrderService: NightOrderService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    setTimeout(() => void this.tick(), 15_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    try {
      const result = await this.nightFactoryService.runScheduledTick();
      if (result && !result.skipped) {
        this.logger.log(`Night Factory tick processou ${result.stats?.processed || 0} lead(s).`);
        const summaries: NightOrderFulfillSummary[] = await this.nightOrderService.fulfillOpenOrders().catch(() => []);
        const delivered = summaries.reduce((total, summary) => total + summary.deliveredNow, 0);
        if (delivered > 0) {
          this.logger.log(`Encomendas noturnas: ${delivered} lead(s) entregues em ${summaries.length} encomenda(s).`);
        }
      }
    } catch (error) {
      this.logger.warn(`Night Factory tick falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
