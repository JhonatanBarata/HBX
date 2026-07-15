import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategyMode } from './radar-lead-source.types';

export type RadarSearchStrategy = {
  mode: RadarSearchStrategyMode;
  targetCards: number;
  allowSecondaryProviders: boolean;
  allowAsyncSocial: boolean;
  maxProviderRounds: number;
  reason: string;
};

@Injectable()
export class RadarSearchStrategyService {
  resolve(input: NormalizedSearchInput, _context: { purpose?: string | null } = {}): RadarSearchStrategy {
    // Estratégias válidas pertencem exclusivamente às buscas solicitadas por clientes.
    if (input.freshness === 'live') {
      return {
        mode: 'quality',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: false,
        maxProviderRounds: 3,
        reason: 'live_prioriza_qualidade_e_atualidade',
      };
    }
    if (input.quantity >= 80 || input.freshness === 'hybrid') {
      return {
        mode: 'deep',
        targetCards: input.quantity,
        allowSecondaryProviders: true,
        allowAsyncSocial: false,
        maxProviderRounds: 5,
        reason: 'volume_alto_exige_fontes_complementares',
      };
    }
    return {
      mode: 'fast',
      targetCards: input.quantity,
      allowSecondaryProviders: input.engine === 'hbx',
        allowAsyncSocial: false,
      maxProviderRounds: 2,
      reason: 'busca_operacional_prioriza_banco_cache_e_hbx',
    };
  }
}
