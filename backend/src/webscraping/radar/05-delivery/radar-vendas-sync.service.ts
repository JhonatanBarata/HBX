import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VendasService } from '../../../vendas/vendas.service';
import type { SearchExecutionContext } from '../shared/radar-types';

export type RadarVendasSyncHost = {
  getPendingCount: (companyId: number) => Promise<number>;
  resolveContext: (user: any) => SearchExecutionContext;
  syncRadarSearchRunItemsToPool: (context: SearchExecutionContext, run: any) => Promise<void>;
  buildRadarFiltersFromSearchRun: (run: any) => any;
  isRunItemPrimaryDeliverable: (item: any, filters: any) => boolean;
  findRadarPoolRowsForRunItems: (companyId: number, items: any[], limit: number) => Promise<any[]>;
  normalizeRadarLeadStatus: (value: unknown) => string;
  isRadarProtectedStatus: (value: unknown) => boolean;
  importRadarLeadToVendasForUser: (user: any, radarLeadId: string, input?: any) => Promise<any>;
  stopSearchRunIfVendasStockLimitReached: (run: any, reason?: string) => Promise<boolean>;
  stopSearchRunAutoImportBlocked: (run: any, reason?: string) => Promise<boolean>;
};

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

@Injectable()
export class RadarVendasSyncService {
  private readonly logger = new Logger(RadarVendasSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => VendasService))
    private readonly vendasService?: VendasService,
  ) {}

  async getPendingCount(companyId: number) {
    if (!this.vendasService || typeof (this.vendasService as any).getPendingVendasCardCountForCompany !== 'function') return 0;
    return this.vendasService.getPendingVendasCardCountForCompany(companyId).catch((error: any) => {
      this.logger.warn(`[radar-vendas] falha ao contar cards pendentes company=${companyId}: ${String(error?.message || error)}`);
      return 0;
    });
  }

  getRunStockTarget(run: any) {
    const metrics = parseJsonObject(run?.metricsJson);
    const explicitTarget = safeInteger(
      metrics?.vendasStockTarget
      || metrics?.desiredStock
      || metrics?.stockTarget
      || metrics?.targetStock,
    );
    return Math.max(0, explicitTarget || safeInteger(run?.targetQuantity));
  }

  getLimitPauseRetryDelayMs(reason?: string | null) {
    const normalized = String(reason || '').toLowerCase();
    if (normalized.includes('quota') || normalized.includes('card_limit') || normalized.includes('limite')) {
      return Math.max(60_000, parsePositiveIntegerEnv('HBX_RADAR_CARD_LIMIT_PAUSE_RETRY_MS', 5 * 60_000));
    }
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_RADAR_VENDAS_PAUSE_RETRY_MS', 15_000));
  }

  isSearchRunPausedByLimit(run: any, normalizeSearchRunStatus: (status: unknown) => string) {
    const status = normalizeSearchRunStatus(run?.status);
    if (status !== 'sleeping') return false;
    const metrics = parseJsonObject(run?.metricsJson);
    const reason = String(run?.lastBatchStatus || metrics?.radarPauseReason || metrics?.autoImportBlockedReason || '').toLowerCase();
    return reason.includes('vendas_stock_limit')
      || reason.includes('vendas_card_limit')
      || reason.includes('card_limit')
      || reason.includes('quota')
      || reason.includes('limit');
  }

  summarizeAutoImportFailures(failures: Array<{ reason: string }>) {
    const counts = new Map<string, number>();
    for (const failure of failures) {
      const reason = String(failure.reason || 'erro_desconhecido');
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([reason, count]) => ({ reason, count })).slice(0, 6);
  }

  isAutoImportLimitError(error: any) {
    const code = String(error?.response?.code || error?.code || '').toLowerCase();
    const message = String(error?.response?.message || error?.message || error || '').toLowerCase();
    return code.includes('limit')
      || code.includes('quota')
      || message.includes('limite diario')
      || message.includes('limite diÃ¡rio')
      || message.includes('limite mensal')
      || message.includes('trava diaria')
      || message.includes('trava diÃ¡ria')
      || message.includes('contador reinicia')
      || message.includes('quota');
  }

  async assertCanFeed(context: SearchExecutionContext) {
    const pendingCount = await this.getPendingCount(context.companyId);
    return {
      pendingCount,
      remaining: null,
    };
  }

  async autoImportSearchRunToVendas(user: any, runId: string, host: RadarVendasSyncHost) {
    if (!this.vendasService) return { ran: false, importedCount: 0, pendingCount: 0, remaining: null };
    const context = host.resolveContext(user);
    let pendingCount = await host.getPendingCount(context.companyId);
    const remaining = null;

    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) return { ran: false, importedCount: 0, pendingCount, remaining };
    const stockTarget = this.getRunStockTarget(run);
    if (stockTarget > 0 && pendingCount >= stockTarget) {
      await host.stopSearchRunIfVendasStockLimitReached(run, 'vendas_stock_limit_before_import');
      return {
        ran: true,
        importedCount: 0,
        processedCount: 0,
        pendingCount,
        remaining,
        blocked: true,
        failures: [{ reason: 'vendas_stock_limit' }],
      };
    }

    await host.syncRadarSearchRunItemsToPool(context, run).catch((error: any) => {
      this.logger.warn(`[radar-vendas] sync antes do auto-import falhou run=${run.id}: ${String(error?.message || error)}`);
    });

    const filters = host.buildRadarFiltersFromSearchRun(run);
    const primaryFoundItems = (run.items || []).filter((item: any) => host.isRunItemPrimaryDeliverable(item, filters));
    if (!primaryFoundItems.length) {
      return { ran: true, importedCount: 0, pendingCount, remaining, failures: [] };
    }
    const requestedQuantity = Math.max(safeInteger(run.targetQuantity), 1);
    const candidateLookupLimit = requestedQuantity;
    const orderedRows = await host.findRadarPoolRowsForRunItems(
      context.companyId,
      primaryFoundItems,
      candidateLookupLimit,
    );
    const failures: Array<{ reason: string }> = [];
    if (orderedRows.length < primaryFoundItems.length) {
      failures.push({ reason: 'card_nao_materializado_no_pool' });
    }

    let importedCount = 0;
    let processedCount = 0;
    let blockedByLimit = false;
    for (const row of orderedRows.slice(0, requestedQuantity)) {
      pendingCount = await host.getPendingCount(context.companyId);
      if (stockTarget > 0 && pendingCount >= stockTarget) {
        await host.stopSearchRunIfVendasStockLimitReached(run, 'vendas_stock_limit_during_import');
        failures.push({ reason: 'vendas_stock_limit' });
        blockedByLimit = true;
        break;
      }
      const state = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      const status = host.normalizeRadarLeadStatus(state?.status || row?.status);
      if (status === 'sent_to_vendas' || host.isRadarProtectedStatus(status)) {
        failures.push({ reason: status === 'sent_to_vendas' ? 'ja_enviado_para_vendas' : 'estado_protegido' });
        continue;
      }
      try {
        const imported = await host.importRadarLeadToVendasForUser(user, row.id, { skipWhatsappValidation: true });
        processedCount += 1;
        pendingCount = await host.getPendingCount(context.companyId);
        importedCount += Math.max(0, safeInteger(imported?.import?.deliveredCount));
      } catch (error: any) {
        const reason = String(error?.response?.code || error?.code || 'falha_importacao_vendas');
        failures.push({ reason });
        this.logger.warn(`[radar-vendas] auto-import ignorou lead=${row?.id || '-'} run=${run.id}: ${String(error?.message || error)}`);
        if (this.isAutoImportLimitError(error)) {
          await host.stopSearchRunAutoImportBlocked(run, reason || 'vendas_card_limit');
          blockedByLimit = true;
          break;
        }
      }
    }

    if (processedCount > 0) {
      await this.prisma.webscrapingSearchRun.update({
        where: { id: run.id },
        data: {
          importedCount: { increment: processedCount },
        },
      }).catch(() => null);
    }
    const finalPendingCount = await host.getPendingCount(context.companyId);
    if (!blockedByLimit && stockTarget > 0 && finalPendingCount >= stockTarget) {
      await host.stopSearchRunIfVendasStockLimitReached(run, 'vendas_stock_limit_after_import');
      failures.push({ reason: 'vendas_stock_limit' });
      blockedByLimit = true;
    }
    return {
      ran: true,
      importedCount,
      processedCount,
      pendingCount: finalPendingCount,
      remaining: null,
      blocked: blockedByLimit,
      failures: this.summarizeAutoImportFailures(failures),
    };
  }
}
