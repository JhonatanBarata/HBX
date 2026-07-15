import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategyMode } from './radar-lead-source.types';

export type RadarSearchStrategy = {
  mode: RadarSearchStrategyMode;
  targetCards: number;
  allowSecondaryProviders: boolean;
  allowAsyncSocial: boolean;
  allowLightCrawl: boolean;
  maxProviderRounds: number;
  reason: string;
};

@Injectable()
export class RadarSearchStrategyService {
  resolve(input: NormalizedSearchInput, _context: { purpose?: string | null } = {}): RadarSearchStrategy {
    // Modo `night_factory` REMOVIDO (F0, 02/07): a fábrica de descoberta autônoma foi demolida.
    // Nenhum purpose factory/mass_data/campaign produz mais estratégia — os callers viviam nos
    // mixins mass-data/campaign-planner/factory-admin, já deletados. Rotas de cliente: fast/quality/deep.
    if (input.freshness === 'live') {
      return {
        mode: 'quality',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: true,
        allowLightCrawl: false,
        maxProviderRounds: 3,
        reason: 'live_prioriza_qualidade_e_atualidade',
      };
    }
    if (input.quantity >= 80 || input.freshness === 'hybrid') {
      return {
        mode: 'deep',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: true,
        allowLightCrawl: true,
        maxProviderRounds: 5,
        reason: 'volume_alto_exige_fontes_complementares',
      };
    }
    return {
      mode: 'fast',
      targetCards: input.quantity,
      allowSecondaryProviders: input.engine === 'hbx',
      allowAsyncSocial: true,
      allowLightCrawl: false,
      maxProviderRounds: 2,
      reason: 'busca_operacional_prioriza_banco_cache_e_hbx',
    };
  }
}
