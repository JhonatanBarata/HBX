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

@Injectable()
export class RadarVendasSyncService {
  private readonly logger = new Logger(RadarVendasSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => VendasService))
    private readonly vendasService?: VendasService,
  ) {}

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
      // CRÉDITOS — saldo esgotado / acesso pausado por crédito também PARA a auto-distribuição
      // em lote (senão o loop tenta cada card da fila e falha um a um, sem sentido).
      || code.includes('credit_balance_exhausted')
      || code.includes('company_access_paused')
      || message.includes('saldo de créditos')
      || message.includes('saldo de creditos')
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
