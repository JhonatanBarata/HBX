import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategy } from './radar-search-strategy.service';

export type RadarSearchSourceKind =
  | 'radar_database'
  | 'company_history'
  | 'global_cache'
  | 'hbx_engine'
  | 'google_textual'
  | 'google_places'
  | 'social_async'
  | 'site_crawl_light'
  | 'directories'
  | 'cnpj_public'
  | 'reprocess_discarded';

export type RadarSearchSourcePlanItem = {
  source: RadarSearchSourceKind;
  priority: number;
  enabled: boolean;
  implemented: boolean;
  stopWhenEnough: boolean;
  reason: string;
};

@Injectable()
export class RadarSourcePlannerService {
  plan(input: NormalizedSearchInput, strategy: RadarSearchStrategy, flags: {
    allowStoredLeadLookup?: boolean;
    radarEnabled?: boolean;
    historyEnabled?: boolean;
    globalCacheEnabled?: boolean;
    skipRadarLookup?: boolean;
    skipPrivateHistory?: boolean;
    skipTechnicalCache?: boolean;
    engine?: string | null;
  } = {}): RadarSearchSourcePlanItem[] {
    const allowStored = flags.allowStoredLeadLookup !== false && input.freshness !== 'live';
    const sources: RadarSearchSourcePlanItem[] = [
      {
        source: 'radar_database',
        priority: 10,
        enabled: allowStored && flags.skipRadarLookup !== true && input.targetType === 'pj' && flags.radarEnabled !== false,
        implemented: true,
        stopWhenEnough: true,
        reason: 'memoria_do_radar_e_primeira_fonte_de_oportunidade',
      },
      {
        source: 'company_history',
        priority: 20,
        enabled: allowStored && flags.skipPrivateHistory !== true && flags.historyEnabled !== false,
        implemented: true,
        stopWhenEnough: true,
        reason: 'historico_da_empresa_evitar_busca_repetida',
      },
      {
        source: 'global_cache',
        priority: 30,
        enabled: allowStored && flags.skipTechnicalCache !== true && flags.globalCacheEnabled !== false,
        implemented: true,
        stopWhenEnough: true,
        reason: 'cache_tecnico_reaproveita_busca_publica',
      },
      {
        source: 'hbx_engine',
        priority: 40,
        enabled: input.engine === 'hbx',
        implemented: true,
        stopWhenEnough: true,
        reason: 'motor_hbx_e_fonte_primaria_de_captura',
      },
      {
        source: 'google_textual',
        priority: 50,
        enabled: strategy.allowSecondaryProviders && input.engine === 'hbx',
        implemented: false,
        stopWhenEnough: false,
        reason: 'fase_6_pode_buscar_intencao_textual',
      },
      {
        source: 'google_places',
        priority: 60,
        enabled: input.engine === 'google' || (strategy.allowSecondaryProviders && input.engine === 'hbx'),
        implemented: true,
        stopWhenEnough: true,
        reason: input.engine === 'google' ? 'google_places_solicitado' : 'fallback_google_apos_hbx',
      },
      {
        source: 'social_async',
        priority: 70,
        enabled: strategy.allowAsyncSocial && input.targetType === 'pj',
        implemented: true,
        stopWhenEnough: false,
        reason: 'social_enriquece_depois_sem_bloquear_entrega',
      },
      {
        source: 'site_crawl_light',
        priority: 80,
        enabled: strategy.allowLightCrawl,
        implemented: false,
        stopWhenEnough: false,
        reason: 'fase_6_pode_extrair_contatos_do_site',
      },
      {
        source: 'directories',
        priority: 90,
        enabled: strategy.mode === 'profundo' || strategy.mode === 'fabrica_noturna',
        implemented: false,
        stopWhenEnough: false,
        reason: 'diretorio_e_fonte_de_descoberta_nao_card_final',
      },
      {
        source: 'cnpj_public',
        priority: 100,
        enabled: strategy.mode === 'fabrica_noturna',
        implemented: false,
        stopWhenEnough: false,
        reason: 'base_publica_alimenta_fabrica_noturna',
      },
      {
        source: 'reprocess_discarded',
        priority: 110,
        enabled: strategy.mode === 'profundo' || strategy.mode === 'fabrica_noturna',
        implemented: false,
        stopWhenEnough: false,
        reason: 'reprocessar_descartados_pode_recuperar_dados',
      },
    ];
    return sources.sort((left, right) => left.priority - right.priority);
  }
}
