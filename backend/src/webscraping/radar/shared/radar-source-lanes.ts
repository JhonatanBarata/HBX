// Lanes de ORIGEM do card (03/07/2026 — conserto do medidor sourceChain que mentia dos 2 lados):
// tabela ÚNICA rfb/web que antes vivia TRIPLICADA (03-enrichment/radar-core-quality-enrichment,
// 06-presentation/radar-core-presentation e radar-tree-status) e desconhecia os rótulos reais
// que o motor Python emite (`hbx_scraping:free_pj`, `hbx_scraping:web`, `hbx_agenda:*`...).
//
// Vocabulário:
// - sourceChain  = quem DESCOBRIU o lead ("rfb", "web" ou "rfb+web" — fusão REAL de descoberta).
// - enrichedBy   = quem só ENRIQUECEU (informação separada, opcional — enriquecimento NUNCA
//                  vira fusão de descoberta no medidor).
// Rótulos internos de processo/banco (current, radar_database, company_history,
// vendas_automation...) NÃO têm lane: processar ou relembrar não equivale a descobrir.

export type RadarSourceLane = 'rfb' | 'web';

export const RADAR_SOURCE_CHAIN_LANE: Record<string, RadarSourceLane> = {
  cnpj_public: 'rfb',
  cnpj_public_stub: 'rfb',
  hbx_engine: 'web',
  hbx: 'web',
  google_textual: 'web',
  google_emergency: 'web',
  website_crawl_light: 'web',
  radar_web_enrichment: 'web',
  local_directory: 'web',
  local_directories_stub: 'web',
  vertical_source: 'web',
};

export function radarSourceLaneOf(value: unknown): RadarSourceLane | null {
  const key = String(value || '').trim();
  if (!key) return null;
  if (RADAR_SOURCE_CHAIN_LANE[key]) return RADAR_SOURCE_CHAIN_LANE[key];
  // Variantes reais do motor Python (schemas.py/search_service.py/agenda_sources.py):
  // hbx_scraping, hbx_scraping:web, hbx_scraping:free_pj, hbx_scraping:social_*,
  // hbx_scraping_social, hbx_agenda:web, hbx_agenda:abctelefonos. Prefixo cobre todas —
  // O prefixo cobre somente fontes reais do motor; rótulos internos continuam sem lane.
  if (key.startsWith('hbx_scraping') || key.startsWith('hbx_agenda')) return 'web';
  return null;
}

export function radarSourceLanesOf(engines: Array<unknown>): Set<RadarSourceLane> {
  const lanes = new Set<RadarSourceLane>();
  for (const engine of engines || []) {
    const lane = radarSourceLaneOf(engine);
    if (lane) lanes.add(lane);
  }
  return lanes;
}

/** Cadeia ordenada rfb→web a partir de rótulos crus. Nada mapeável → null (campo opcional). */
export function buildRadarSourceChainFromEngines(engines: Array<unknown>): string | null {
  const lanes = radarSourceLanesOf(engines);
  if (!lanes.size) return null;
  const ordered: string[] = [];
  if (lanes.has('rfb')) ordered.push('rfb');
  if (lanes.has('web')) ordered.push('web');
  return ordered.join('+');
}

/** Lanes de enriquecimento em array ordenado (pro campo opcional `enrichedBy` do card). */
export function radarEnrichedByLanesOf(engines: Array<unknown>): string[] {
  const lanes = radarSourceLanesOf(engines);
  const ordered: string[] = [];
  if (lanes.has('rfb')) ordered.push('rfb');
  if (lanes.has('web')) ordered.push('web');
  return ordered;
}

// ————— Separação DESCOBERTA × ENRIQUECIMENTO no merge de pré-save (03-enrichment) —————
// O RadarResultMergerService carimba o rótulo do GRUPO em `sourceEngines` de todo resultado
// que passa por ele. No 01-search isso é correto (grupos = fontes de descoberta); no merge de
// enriquecimento pré-save isso é a carona que inflava a "fusão" (53,8% fictício medido 03/07):
// lead descoberto SÓ pela Receita saía com `radar_web_enrichment` (e o rótulo do lote) no array.
// O protocolo: tirar snapshot ANTES do merge, e DEPOIS devolver `sourceEngines` = descoberta e
// mover o que o merge adicionou pra `enrichmentEngines` (nada é descartado — só re-etiquetado).

export const RADAR_DISCOVERY_SNAPSHOT_FIELD = '__radarDiscoveryEngines';

// Rótulos SINTÉTICOS do merger (grupos internos), não fontes de descoberta — nunca persistir.
const RADAR_SYNTHETIC_MERGE_LABELS = new Set(['current']);

function cleanEngineLabels(values: Array<unknown>): string[] {
  return Array.from(new Set(
    (values || [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && !RADAR_SYNTHETIC_MERGE_LABELS.has(value)),
  ));
}

/** Engines de DESCOBERTA de um resultado: o acumulado do 01-search ou, sem ele, a identidade
 *  própria (`source`/`sourceEngine` — ex.: `hbx_scraping:free_pj` que o motor Python emite). */
export function radarDiscoveryEnginesOf(result: Record<string, any>): string[] {
  const engines = cleanEngineLabels(Array.isArray(result?.sourceEngines) ? result.sourceEngines : []);
  if (engines.length) return engines;
  const identity = String(result?.source || result?.sourceEngine || '').trim();
  return identity && !RADAR_SYNTHETIC_MERGE_LABELS.has(identity) ? [identity] : [];
}

export function tagRadarDiscoverySnapshot<T extends Record<string, any>>(results: T[]): T[] {
  return (results || []).map((result) => ({
    ...result,
    [RADAR_DISCOVERY_SNAPSHOT_FIELD]: radarDiscoveryEnginesOf(result),
  }));
}

/**
 * Pós-merge de enriquecimento: restaura `sourceEngines` = snapshot de descoberta e acumula em
 * `enrichmentEngines` o que o merge adicionou (exceto o rótulo do próprio lote, que é artefato
 * do merger, não contribuição). Resultado SEM snapshot (lead novo que só o enriquecimento viu)
 * fica como está — descoberta dele é o próprio enriquecimento.
 */
export function splitRadarDiscoveryFromEnrichment<T extends Record<string, any>>(
  item: T,
  mergeLabel: string,
): T {
  const output: Record<string, any> = { ...item };
  const snapshot = output[RADAR_DISCOVERY_SNAPSHOT_FIELD];
  delete output[RADAR_DISCOVERY_SNAPSHOT_FIELD];
  if (!Array.isArray(snapshot)) return output as T;
  const discovery = cleanEngineLabels(snapshot);
  const discoverySet = new Set(discovery);
  const current = cleanEngineLabels(Array.isArray(output.sourceEngines) ? output.sourceEngines : []);
  const added = current.filter((engine) => !discoverySet.has(engine) && engine !== mergeLabel);
  output.sourceEngines = discovery;
  if (added.length) {
    output.enrichmentEngines = Array.from(new Set([
      ...(Array.isArray(item.enrichmentEngines) ? item.enrichmentEngines.map(String) : []),
      ...added,
    ]));
  }
  return output as T;
}
