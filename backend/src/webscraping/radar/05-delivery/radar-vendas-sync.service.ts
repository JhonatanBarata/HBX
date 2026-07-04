import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VendasService } from '../../../vendas/vendas.service';

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

  getLimitPauseRetryDelayMs(reason?: string | null) {
    const normalized = String(reason || '').toLowerCase();
    if (normalized.includes('quota') || normalized.includes('card_limit') || normalized.includes('limite')) {
      return Math.max(60_000, parsePositiveIntegerEnv('HBX_RADAR_CARD_LIMIT_PAUSE_RETRY_MS', 5 * 60_000));
    }
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_RADAR_VENDAS_PAUSE_RETRY_MS', 15_000));
  }

  // LIMPEZA-DESTRUTIVA L2 (04/07): o gate de estoque do Vendas (`vendas_stock_limit*`) foi
  // deletado — a busca nunca mais pausa por estoque do funil. O que sobra aqui é a pausa
  // por COTA COMERCIAL DA EMPRESA (`vendas_card_limit_start`/`quota`), decidida pelo Master
  // via CommercialUsageLimitsService — único freio de quantidade que segue vivo.
  isSearchRunPausedByLimit(run: any, normalizeSearchRunStatus: (status: unknown) => string) {
    const status = normalizeSearchRunStatus(run?.status);
    if (status !== 'sleeping') return false;
    const metrics = parseJsonObject(run?.metricsJson);
    const reason = String(run?.lastBatchStatus || metrics?.radarPauseReason || metrics?.autoImportBlockedReason || '').toLowerCase();
    return reason.includes('card_limit')
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
      || message.includes('limite diário')
      || message.includes('limite mensal')
      || message.includes('trava diaria')
      || message.includes('trava diária')
      || message.includes('contador reinicia')
      || message.includes('quota');
  }

  // LIMPEZA-DESTRUTIVA L1 (04/07): `autoImportSearchRunToVendas` (a máquina de reivindicar
  // o run pro funil de Vendas sozinho) foi deletada. O run só enche a vitrine via
  // syncRadarSearchRunItemsToPool (host); o funil só recebe card por puxada manual.
  // LIMPEZA-DESTRUTIVA L2 (04/07): `getPendingCount`/`getPendingCountForSeller`/
  // `getRunStockTarget`/`assertCanFeed` (o gate de estoque em si) foram deletados —
  // já não tinham mais razão de existir sem o gate que os consumia.
}
