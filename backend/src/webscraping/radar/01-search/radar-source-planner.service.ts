import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategy } from './radar-search-strategy.service';
import type { RadarLeadSourceKind, RadarLeadSourceStep } from './radar-lead-source.types';

export type RadarSearchSourceKind = RadarLeadSourceKind;
export type RadarSearchSourcePlanItem = RadarLeadSourceStep;

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
    const enabledBySource: Record<RadarLeadSourceKind, boolean> = {
      radar_database: allowStored && flags.skipRadarLookup !== true && input.targetType === 'pj' && flags.radarEnabled !== false,
      company_history: allowStored && flags.skipPrivateHistory !== true && flags.historyEnabled !== false,
      global_cache: allowStored && flags.skipTechnicalCache !== true && flags.globalCacheEnabled !== false,
      hbx_engine: input.engine === 'hbx',
      google_textual: strategy.allowSecondaryProviders && input.engine === 'hbx',
      reprocess_missing_social: input.targetType === 'pj',
      reprocess_old_cards: input.targetType === 'pj',
      website_crawl_light: strategy.allowLightCrawl,
      local_directories_stub: strategy.mode === 'deep',
      cnpj_public_stub: strategy.mode === 'deep' || strategy.mode === 'night_factory',
    };
    const byStrategy: Record<string, RadarLeadSourceKind[]> = {
      fast: ['radar_database', 'company_history', 'global_cache', 'hbx_engine'],
      quality: ['radar_database', 'hbx_engine', 'google_textual', 'reprocess_missing_social'],
      deep: ['hbx_engine', 'google_textual', 'website_crawl_light', 'local_directories_stub', 'cnpj_public_stub'],
      night_factory: ['reprocess_old_cards', 'reprocess_missing_social', 'google_textual', 'website_crawl_light', 'cnpj_public_stub'],
    };
    const implemented = new Set<RadarLeadSourceKind>([
      'radar_database',
      'company_history',
      'global_cache',
      'hbx_engine',
      'google_textual',
      'reprocess_missing_social',
      'reprocess_old_cards',
      'website_crawl_light',
    ]);
    return (byStrategy[strategy.mode] || byStrategy.fast).map((source, index) => ({
      source,
      priority: (index + 1) * 10,
      enabled: Boolean(enabledBySource[source]),
      implemented: implemented.has(source),
      optional: !['access', 'input', 'quota'].includes(source),
      stopWhenEnough: ['radar_database', 'company_history', 'global_cache', 'hbx_engine'].includes(source),
      reason: this.reasonFor(source),
    }));
  }

  private reasonFor(source: RadarLeadSourceKind) {
    const reasons: Record<RadarLeadSourceKind, string> = {
      radar_database: 'memoria_do_radar_e_primeira_fonte_de_oportunidade',
      company_history: 'historico_da_empresa_evita_busca_repetida',
      global_cache: 'cache_tecnico_reaproveita_busca_publica',
      hbx_engine: 'motor_hbx_e_fonte_primaria_de_captura',
      google_textual: 'busca_textual_por_intencao_como_complemento_opcional',
      reprocess_missing_social: 'reprocessa_cards_sem_social_ou_com_status_fraco',
      reprocess_old_cards: 'reprocessa_cards_antigos_do_radar',
      website_crawl_light: 'crawl_leve_de_website_oficial_como_complemento_opcional',
      local_directories_stub: 'stub_explicito_diretorios_nao_sao_fonte_de_verdade',
      cnpj_public_stub: 'stub_explicito_base_cnpj_ainda_nao_executa',
    };
    return reasons[source];
  }
}
