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
 * QUAL fonte a regra multilocal escolheu — 'local', 'perfil' ou nenhuma. Extraído
 * (26/07) porque a conferência precisa ler o ENDEREÇO (cep/logradouro/cidade/uf) da
 * MESMA fonte de onde veio o pino: ler o CEP do perfil e a rua do local (ou vice-versa)
 * recria, no texto, exatamente o "pino Frankenstein" que este util nasceu pra matar.
 * `resolverCoordenadaMultilocal` usa esta função — as duas NUNCA podem divergir.
 */
export function fonteEscolhidaMultilocal(
  local: FonteGeoCoord | null | undefined,
  perfil: FonteGeoCoord | null | undefined,
): 'local' | 'perfil' | null {
  if (temCoordenadaValida(local)) return 'local';
  if (temCoordenadaValida(perfil)) return 'perfil';
  return null;
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
  const escolhida = fonteEscolhidaMultilocal(local, perfil);
  const fonte = escolhida === 'local' ? local! : escolhida === 'perfil' ? perfil! : null;
  return {
    lat: fonte ? fonte.lat : null,
    lng: fonte ? fonte.lng : null,
    geoFonte: fonte?.geoFonte ?? null,
  };
}

// ── TETO DE PRECISÃO DO GPS DE CADASTRO (25/07) ──────────────────────────────
//
// `geoFonte='gps_cadastro'` é a fonte INTOCÁVEL (logistica.service.ts:
// realimentarCoordenadaCliente/Local NUNCA reescrevem — "decisão humana
// explícita"). Até aqui ela era gravada SEM checar a precisão real do fix: um
// GPS de 300m capturado dentro de um galpão virava permanente, igual a um GPS
// de 5m na porta certa. `gpsDeOuro` (abaixo) já exige accuracy<=60m pra
// REALIMENTAR via entrega confirmada — mas o CADASTRO original nunca passava
// pelo mesmo crivo.
//
// Mesma constante para os DOIS lados (gpsDeOuro E a decisão de cadastro) —
// nada de "60" mágico repetido.
export const GPS_ACCURACY_LIMITE_METROS = 60;

/** accuracy numérica, finita, e dentro do teto — mesmo crivo do "GPS de ouro". */
export function gpsAccuracyDentroDoLimite(gpsAccuracy: unknown): boolean {
  return typeof gpsAccuracy === 'number' && Number.isFinite(gpsAccuracy) && gpsAccuracy <= GPS_ACCURACY_LIMITE_METROS;
}

export type GeoFonteCadastro = 'geocode' | 'gps_cadastro' | 'gps_impreciso';

/**
 * Decide a fonte a GRAVAR para uma coordenada de CADASTRO (perfil/local) que
 * chegou do cliente (app/site). Fail-closed (25/07, pedido do dono): quem
 * decide SE o fix é preciso o bastante pra virar `gps_cadastro` — a fonte
 * intocável — é SEMPRE o backend, nunca a alegação do cliente. Um chamador
 * batendo direto na API não pode se autodeclarar preciso.
 *
 * Regra:
 *  - `hasCoord=false`                → null (nenhuma coordenada, nada a decidir).
 *  - `geoFonteClient === 'geocode'`  → 'geocode' passa direto. Não é alegação
 *    de GPS preciso (vem do CEP/Nominatim, sempre foi aproximado por
 *    natureza) — nada a verificar aqui, `gpsAccuracy` não se aplica.
 *  - qualquer outro caso (cliente alegou 'gps_cadastro', mandou lixo, ou nem
 *    mandou `geoFonte` — o caso do app antigo que ainda não fala o contrato
 *    novo) → `gpsAccuracy` decide: numérico e <=60m vira 'gps_cadastro'
 *    (decisão humana intocável, como sempre foi); ausente/NaN/>60m vira
 *    'gps_impreciso' — guarda a coordenada (ordena rota), mas a realimentação
 *    por entrega confirmada PODE sobrescrever (não é intocável).
 */
export function decidirGeoFonteCadastro(
  hasCoord: boolean,
  geoFonteClient: string | null | undefined,
  gpsAccuracy: unknown,
): GeoFonteCadastro | null {
  if (!hasCoord) return null;
  if (geoFonteClient === 'geocode') return 'geocode';
  return gpsAccuracyDentroDoLimite(gpsAccuracy) ? 'gps_cadastro' : 'gps_impreciso';
}
