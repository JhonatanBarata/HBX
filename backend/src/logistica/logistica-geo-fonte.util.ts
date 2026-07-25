// MULTILOCAL — escolhe a FONTE (LocalEntrega da entrega OU perfil do cliente) de onde
// tirar lat/lng/geoFonte, NUNCA misturando campos de fontes diferentes.
//
// Extraído em util próprio (25/07) porque o jeito ingênuo — cada campo com seu
// próprio `??` (`local?.lat ?? perfil?.lat`, `local?.lng ?? perfil?.lng`) — pode
// devolver a lat de uma fonte e a lng de outra, criando um pino no meio do nada:
// exatamente o "pino que mentia" que o freio do geocode (nucleo-geo.util.ts) matou.
// Pior ainda: `r.local ? r.local.lat : r.customerProfile.lat` (testar só a
// EXISTÊNCIA do objeto `local`, não se ele TEM coordenada) descarta um pino BOM do
// perfil sempre que o LocalEntrega existe sem lat/lng — caso real dos ~824
// registros que o backfill de 25/07 deixou com coordenada null de propósito.
//
// LEI (25/07, incidente empresa 41): pino errado é PIOR que pino vazio — mas um
// pino BOM que existe jamais pode ser descartado. Este helper resolve as duas leis
// juntas: escolhe a fonte inteira primeiro (local só vale com lat E lng válidos),
// depois tira lat/lng/geoFonte SEMPRE da mesma fonte escolhida.
export interface FonteGeoCoord {
  lat: number | null | undefined;
  lng: number | null | undefined;
  geoFonte?: string | null | undefined;
}

export interface CoordenadaResolvida {
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
}

/** Coordenada numérica válida (finita) nos dois eixos — nem null, nem undefined, nem NaN. */
function temCoordenadaValida(
  fonte: FonteGeoCoord | null | undefined,
): fonte is FonteGeoCoord & { lat: number; lng: number } {
  return (
    !!fonte &&
    typeof fonte.lat === 'number' &&
    Number.isFinite(fonte.lat) &&
    typeof fonte.lng === 'number' &&
    Number.isFinite(fonte.lng)
  );
}

/**
 * Resolve lat/lng/geoFonte pro MULTILOCAL: prioriza o LOCAL da entrega (cada porta
 * tem sua própria coordenada) — mas SÓ se ele tiver lat E lng válidos; senão a fonte
 * inteira cai pro PERFIL do cliente (legado). Nunca combina um campo de cada.
 *
 *  - local com lat+lng válidos            → usa o LOCAL inteiro.
 *  - local existe mas sem coord (ou parcial: só lat OU só lng) → usa o PERFIL inteiro.
 *  - nenhum dos dois tem coordenada válida → { lat: null, lng: null, geoFonte: null }.
 */
export function resolverCoordenadaMultilocal(
  local: FonteGeoCoord | null | undefined,
  perfil: FonteGeoCoord | null | undefined,
): CoordenadaResolvida {
  const fonte = temCoordenadaValida(local) ? local : temCoordenadaValida(perfil) ? perfil : null;
  return {
    lat: fonte ? fonte.lat : null,
    lng: fonte ? fonte.lng : null,
    geoFonte: fonte?.geoFonte ?? null,
  };
}
