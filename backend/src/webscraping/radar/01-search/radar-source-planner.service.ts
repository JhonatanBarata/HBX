import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategy } from './radar-search-strategy.service';
import type { RadarLeadSourceKind, RadarLeadSourceStep } from './radar-lead-source.types';

export type RadarSearchSourceKind = RadarLeadSourceKind;
export type RadarSearchSourcePlanItem = RadarLeadSourceStep;

// Cutover ordem fixa (P1, 02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md /
// docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md, lei nº3: "sem caminho legado convivendo").
// Default OFF: as rotas legadas (radar_database-first, google_textual, local_directory,
// vertical_source) saem da rota do CLIENTE (fast/quality/deep). Ligar HBX_LEGACY_SOURCES=true
// traz tudo de volta (rollback barato).
// F0 (02/07): modo `night_factory` REMOVIDO junto com a fábrica de descoberta autônoma.
const RADAR_LEGACY_CLIENT_SOURCES = new Set<RadarLeadSourceKind>([
  'radar_database',
  'google_textual',
  'local_directory',
  'vertical_source',
]);

function legacySourcesEnabled() {
  return String(process.env.HBX_LEGACY_SOURCES || '').trim().toLowerCase() === 'true';
}

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
    // C1 (calibracao round-2, 01/07): cnpj_public e fonte local/gratis (Receita) — nao ha
    // razao pra ficar deep-only; o freio real ja mora dentro do proprio service (flag
    // HBX_RADAR_CNPJ_PUBLIC_ENABLED, ver radar-cnpj-public-source.service.ts). Runs de
    // cliente (mode 'quality'/'fast') reconstroem input sem freshness e nunca alcancavam
    // a Receita. Habilita em QUALQUER modo pra targetType pj quando a flag estiver ligada.
    // Cutover P1 (02/07): prioridade agora vem ANTES do hbx_engine (ordem fixa RFB->web,
    // ver byStrategy abaixo — antes vinha depois).
    const cnpjPublicEnabledByFlag = String(process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED || '').trim().toLowerCase() === 'true';
    const cnpjPublicEnabled = input.targetType === 'pj' && cnpjPublicEnabledByFlag;
    // HBX_LEGACY_SOURCES (default OFF, P1): as 4 fontes legadas só habilitam com a flag ligada.
    // (F0: modo night_factory removido — não há mais exceção de fábrica que force o legado.)
    const legacyAllowedHere = legacySourcesEnabled();
    const enabledBySource: Record<RadarLeadSourceKind, boolean> = {
      radar_database: legacyAllowedHere && allowStored && flags.skipRadarLookup !== true && input.targetType === 'pj' && flags.radarEnabled !== false,
      company_history: allowStored && flags.skipPrivateHistory !== true && flags.historyEnabled !== false,
      global_cache: allowStored && flags.skipTechnicalCache !== true && flags.globalCacheEnabled !== false,
      hbx_engine: input.engine === 'hbx',
      google_textual: legacyAllowedHere && strategy.allowSecondaryProviders && input.engine === 'hbx',
      radar_web_enrichment: false,
      reprocess_missing_social: input.targetType === 'pj',
      reprocess_old_cards: input.targetType === 'pj',
      website_crawl_light: strategy.allowLightCrawl,
      cnpj_public: cnpjPublicEnabled,
      local_directory: legacyAllowedHere && input.targetType === 'pj' && strategy.mode === 'deep',
      vertical_source: legacyAllowedHere && input.targetType === 'pj' && strategy.mode === 'deep',
      local_directories_stub: strategy.mode === 'deep',
      cnpj_public_stub: strategy.mode === 'deep',
    };
    // Cutover ordem fixa (P1): lane do cliente é semente → RFB (cnpj_public) → web (hbx_engine)
    // → portas → fusão → crawl. cnpj_public agora vem ANTES do hbx_engine em fast/quality/deep
    // (antes vinha depois — furo da ordem descrito na árvore mestra, caixa "2-SELECT RFB
    // primeiro"). radar_database/company_history/global_cache continuam antes (memória local,
    // não é rede — sempre mais barato checar o que já se tem antes de qualquer busca nova).
    const byStrategy: Record<string, RadarLeadSourceKind[]> = {
      fast: ['radar_database', 'company_history', 'global_cache', 'cnpj_public', 'hbx_engine'],
      quality: ['radar_database', 'cnpj_public', 'hbx_engine', 'google_textual', 'reprocess_missing_social'],
      deep: ['cnpj_public', 'hbx_engine', 'google_textual', 'website_crawl_light', 'local_directory', 'vertical_source'],
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
      'cnpj_public',
      'local_directory',
      'vertical_source',
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
      radar_web_enrichment: 'enriquecimento_explicito_pos_entrega',
      reprocess_missing_social: 'reprocessa_cards_sem_social_ou_com_status_fraco',
      reprocess_old_cards: 'reprocessa_cards_antigos_do_radar',
      website_crawl_light: 'crawl_leve_de_website_oficial_como_complemento_opcional',
      cnpj_public: 'base_publica_cnpj_como_descoberta_opcional_sem_inventar_contato',
      local_directory: 'diretorios_locais_como_descoberta_opcional_de_baixa_confianca',
      vertical_source: 'fontes_verticais_por_segmento_como_descoberta_opcional_sem_confirmar_contato_sozinha',
      local_directories_stub: 'stub_explicito_diretorios_nao_sao_fonte_de_verdade',
      cnpj_public_stub: 'stub_explicito_base_cnpj_ainda_nao_executa',
    };
    return reasons[source];
  }
}
