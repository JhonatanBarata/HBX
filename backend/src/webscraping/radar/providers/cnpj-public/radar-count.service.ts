import { Injectable, Logger } from '@nestjs/common';
import { CnpjBaseQueryService } from './cnpj-base-query.service';
import { buildCnpjBaseQueryInputFromCountFilters, RadarCountFiltersInput } from './radar-count-filters.util';

// LEADS-FINAL 03 — "contagem gratis" da gaveta de filtros (POST /webscraping/radar/count).
// Escopo estrito: SÓ conta, NUNCA devolve amostra/contato (o teaser é so o numero). Reusa
// CnpjBaseQueryService.countBase (mesmo caminho ja usado pela vitrine em
// radar-core-presentation.mixin.ts) — nao reimplementa SELECT nem WHERE aqui, so mapeia o
// contrato dos "6 filtros que importam" (radar-count-filters.util.ts) e aplica o teto de custo.
//
// Teto (plano, secao "Riscos"/"EXPLAIN"): acima de RADAR_COUNT_CEILING o front nunca ve o numero
// exato — devolve o teto com `approx:true` (UI pinta "10.000+"). O count em si NUNCA lanca:
// sem a base carregada no ambiente (local) o CnpjBaseQueryService ja degrada pra
// `{ available:false, count:null }`; aqui so' repassamos + aplicamos o teto por cima.
export const RADAR_COUNT_CEILING = 10_000;

export type RadarCountResult = {
  available: boolean;
  count: number | null;
  approx?: boolean;
};

@Injectable()
export class RadarCountService {
  private readonly logger = new Logger(RadarCountService.name);

  constructor(private readonly cnpjBaseQuery: CnpjBaseQueryService) {}

  async count(filters: RadarCountFiltersInput): Promise<RadarCountResult> {
    const input = buildCnpjBaseQueryInputFromCountFilters(filters || {});

    const result = await this.cnpjBaseQuery.countBase(input).catch((error) => {
      this.logger.warn(`countBase falhou: ${error?.message || error}`);
      return { available: false, count: null };
    });
    if (!result.available || result.count == null) return result;
    if (result.count > RADAR_COUNT_CEILING) {
      return { available: true, count: RADAR_COUNT_CEILING, approx: true };
    }
    return result;
  }
}
