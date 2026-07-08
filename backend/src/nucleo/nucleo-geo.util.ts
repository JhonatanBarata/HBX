// LOGÍSTICA-MOBILE — geocode SERVER-SIDE pro cadastro de cliente (08/07).
//
// Diagnóstico: o geocode que hoje resolve o pino nasce no NAVEGADOR
// (frontend/src/app/entrega/geo.ts, Nominatim chamado direto do cliente) e falha em
// SILÊNCIO — rate-limit de 1 req/s, adblock/403, endereço sem match — e quando falha o
// front simplesmente não manda lat/lng. Sem pino, o geofence de chegada nunca arma
// ("0 aviso na chegada"). O backend em si (createConta/updateConta) sempre esteve
// correto: só nunca tinha um caminho PRÓPRIO de resolver a coordenada quando o
// navegador não conseguiu.
//
// Este util dá esse caminho, best-effort, em duas camadas (NUNCA lança, NUNCA trava o
// cadastro — tudo degrada pra null):
//   1) PRECISO  — Nominatim server-side. O Nominatim EXIGE um User-Agent identificável
//      (é por isso que o servidor é confiável e o navegador — sem controle de header —
//      não); timeout curto (2,5s) pra nunca segurar o cadastro.
//   2) FALLBACK — `BRAZIL_CITY_COORDINATES` (mesma tabela que o Radar usa em
//      radar-search-geo.service.ts#findBrazilCityCoordinate), custo ZERO (sem rede),
//      aproximado (centro da cidade). Não importamos aquele service (cross-module,
//      DI desnecessária) — a tabela é dado puro, segura de importar direto; o lookup é
//      replicado aqui enxuto (mesma normalização de acento/caixa).
//
// KILL-SWITCH DE REDE (`HBX_GEO_SERVER_ENABLED`): a camada 1 (a ÚNICA que faz rede) só
// dispara quando o env é '1' ou 'true'. DEFAULT OFF de propósito — dois ganhos:
//   · testes ficam HERMÉTICOS (sem chamada externa flaky/lenta, sem martelar o Nominatim);
//     com a flag OFF, `resolveServerGeo` cai direto no fallback determinístico de cidade.
//   · ops tem um freio: liga/desliga o geocode externo sem deploy.
// Em PROD, ligue `HBX_GEO_SERVER_ENABLED=true` no ambiente pra ter o geocode PRECISO.
// A camada 2 (fallback de cidade) segue SEMPRE ativa, com ou sem flag.

import { BRAZIL_CITY_COORDINATES } from '../webscraping/brazil-city-coordinates';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_TIMEOUT_MS = 2500;
// Nominatim exige UA identificável com contato — sem isso, respostas ficam instáveis/
// bloqueadas silenciosamente pela usage policy deles.
const NOMINATIM_USER_AGENT = 'HBX-Logistica/1.0 (contato@hbxsystem.com.br)';

export interface ServerGeoAddressInput {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

export interface ServerGeoResult {
  lat: number;
  lng: number;
  geoFonte: 'geocode' | 'cidade';
}

const DIACRITICS_RANGE_START = 0x0300;
const DIACRITICS_RANGE_END = 0x036f;

function normalizeLookupValue(value: string | null | undefined): string {
  const stripped = String(value || '')
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < DIACRITICS_RANGE_START || code > DIACRITICS_RANGE_END;
    })
    .join('');
  return stripped.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Coordenada numérica válida (não confunde 0,0 nem NaN com "sem pino"). */
export function hasNumericCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

/**
 * Lookup enxuto na tabela local de municípios — mesmo algoritmo do
 * `findBrazilCityCoordinate` de `radar-search-geo.service.ts`, replicado aqui pra não
 * injetar aquele service (cross-module). Custo zero, sem rede.
 */
export function findBrazilCityCoordinate(
  city: string | null | undefined,
  state: string | null | undefined,
): { lat: number; lng: number } | null {
  const normalizedCity = normalizeLookupValue(city);
  const normalizedState = String(state || '').trim().toUpperCase();
  if (!normalizedCity || !normalizedState) return null;
  const row = BRAZIL_CITY_COORDINATES.find(
    ([rowState, rowCity]) => rowState === normalizedState && normalizeLookupValue(rowCity) === normalizedCity,
  );
  if (!row) return null;
  return { lat: row[2], lng: row[3] };
}

function buildNominatimQuery(input: ServerGeoAddressInput): string {
  const parts = [
    [input.endereco, input.numero].filter((p) => typeof p === 'string' && p.trim().length > 0).join(', '),
    input.bairro,
    input.cidade,
    input.uf,
    input.cep,
  ].filter((part) => typeof part === 'string' && part.trim().length > 0);
  return parts.join(', ').trim();
}

/** Kill-switch de rede: só a CAMADA 1 (Nominatim) passa por aqui; default OFF. */
function serverGeoNetworkEnabled(): boolean {
  const v = String(process.env.HBX_GEO_SERVER_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Nominatim server-side — best-effort, NUNCA lança (qualquer falha vira null). */
async function geocodeViaNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  // Gate de REDE: flag OFF (default) → retorna null SEM fetch. `resolveServerGeo` cai
  // no fallback de cidade (determinístico). Testes ficam herméticos; ops tem freio.
  if (!serverGeoNetworkEnabled()) return null;
  if (query.length < 4) return null;
  try {
    const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    // timeout (AbortSignal.timeout), rede fora, JSON quebrado — degrada, nunca propaga.
    return null;
  }
}

/**
 * Resolve coordenada no SERVIDOR, best-effort, pra quando o navegador não mandou
 * lat/lng: 1) Nominatim (preciso) → 2) tabela local por cidade+UF (aproximado,
 * `geoFonte='cidade'`). Retorna `null` se as duas camadas falharem — o cadastro segue
 * sem pino, exatamente como hoje (esta função só ADICIONA uma chance, nunca remove).
 */
export async function resolveServerGeo(input: ServerGeoAddressInput): Promise<ServerGeoResult | null> {
  const query = buildNominatimQuery(input);
  const preciso = await geocodeViaNominatim(query);
  if (preciso) return { ...preciso, geoFonte: 'geocode' };

  const aproximado = findBrazilCityCoordinate(input.cidade, input.uf);
  if (aproximado) return { ...aproximado, geoFonte: 'cidade' };

  return null;
}
