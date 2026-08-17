// Tipos do módulo puro radar-shelf-query.mjs (a fonte é o .mjs — testável com
// `node --test` sem transpilar; este arquivo só descreve o contrato pro TSX).

export declare const MAX_SHELF_CITY_TARGETS: number;
export declare const SHELF_AGGREGATE_CAP: number;
export declare const RADAR_SESSION_LIVE_STATUSES: readonly string[];

export type ShelfGeoTarget = { city: string; state: string };

export declare function buildShelfGeoTargets(opts: {
  geoMode: string;
  uf: string;
  cities: string[];
}): ShelfGeoTarget[];

export declare function buildShelfRequests(opts: {
  /** filtros salvos já restaurados do localStorage? false/ausente => null (não consultar). */
  hydrated: boolean;
  which?: string;
  page?: number;
  limit?: number;
  segment?: string;
  geoMode?: string;
  uf?: string;
  cities?: string[];
  alcance?: string;
  origin?: { lat: number; lng: number } | null;
  minRating?: string;
  minReviews?: string;
  requiredChannels?: readonly string[];
  channelMatchMode?: string;
}): URLSearchParams[] | null;

export declare function mergeShelfResults<T>(settled: Array<PromiseSettledResult<T>>): {
  ok: boolean;
  error: string | null;
  responses: T[];
  partial: boolean;
};

export declare function deriveRadarBackendMessage(opts: {
  sessionStatus?: string | null;
  sessionMessage?: string | null;
  runOperationalMessage?: string | null;
  runMessage?: string | null;
}): string;

// LOTE 4 (17/08): o relatório por cidade da sessão. Espelha RadarSessionCity do backend
// (radar/sessions/radar-search-session.service.ts) — todo campo de lane é OPCIONAL porque
// sessão em voo no deploy não tem nenhum deles.
export type RadarSessionCityInput = {
  city?: string;
  state?: string | null;
  status?: string;
  runId?: string | null;
  foundCount?: number;
  message?: string | null;
  rfbCount?: number;
  webCount?: number;
  rfbAvailable?: number;
};

export type RadarCityReportLine = {
  key: string;
  /** "Valinhos/SP" (a UF é opcional). */
  nome: string;
  /** Sempre o foundCount do run — nunca a soma das lanes (existe `outros` fora da copy). */
  total: number;
  /** "Receita 8 · Web 3", ou null quando a sessão não tem nenhum dos dois números. */
  lanes: string | null;
  vazia: boolean;
  /** Motivo da cidade zerada: mensagem do servidor, ou o derivado do metricsJson. */
  motivo: string | null;
};

export declare function buildRadarCityReport(
  cities?: RadarSessionCityInput[] | null,
): RadarCityReportLine[];
