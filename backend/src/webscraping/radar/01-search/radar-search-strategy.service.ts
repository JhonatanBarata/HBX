import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';

export type RadarSearchStrategyMode = 'rapido' | 'qualidade' | 'profundo' | 'fabrica_noturna';

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
  resolve(input: NormalizedSearchInput, context: { purpose?: string | null } = {}): RadarSearchStrategy {
    const purpose = String(context.purpose || '').trim().toLowerCase();
    if (purpose.includes('factory') || purpose.includes('mass_data') || purpose.includes('campaign')) {
      return {
        mode: 'fabrica_noturna',
        targetCards: Math.max(input.quantity, 100),
        allowSecondaryProviders: true,
        allowAsyncSocial: true,
        allowLightCrawl: true,
        maxProviderRounds: 6,
        reason: 'fabrica_precisa_repor_estoque_com_multiplas_fontes',
      };
    }
    if (input.qualityMode === 'lead_plus' || input.freshness === 'live') {
      return {
        mode: 'qualidade',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: true,
        allowLightCrawl: false,
        maxProviderRounds: 3,
        reason: 'lead_plus_ou_live_prioriza_qualidade_e_atualidade',
      };
    }
    if (input.quantity >= 80 || input.freshness === 'hybrid') {
      return {
        mode: 'profundo',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: true,
        allowLightCrawl: true,
        maxProviderRounds: 5,
        reason: 'volume_alto_exige_fontes_complementares',
      };
    }
    return {
      mode: 'rapido',
      targetCards: input.quantity,
      allowSecondaryProviders: input.engine === 'hbx',
      allowAsyncSocial: true,
      allowLightCrawl: false,
      maxProviderRounds: 2,
      reason: 'busca_operacional_prioriza_banco_cache_e_hbx',
    };
  }
}
