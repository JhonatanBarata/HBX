// LOGÍSTICA-MOBILE — geocode SERVER-SIDE pro cadastro de cliente (08/07).
//
// Diagnóstico original: o geocode que resolve o pino nasce no NAVEGADOR
// (frontend/src/app/entrega/geo.ts, Nominatim chamado direto do cliente) e falha em
// SILÊNCIO — rate-limit de 1 req/s, adblock/403, endereço sem match — e quando falha o
// front simplesmente não manda lat/lng. Sem pino, o geofence de chegada nunca arma
// ("0 aviso na chegada"). Este util dá ao backend um caminho PRÓPRIO de resolver a
// coordenada quando o navegador não conseguiu — best-effort, NUNCA lança, NUNCA trava
// o cadastro (tudo degrada pra null).
//
// ── FREIO DO GEOCODE (25/07, incidente empresa 41 / "Terra Hydra Mary") ────────────
// O que estava errado: pegávamos `hit[0]` do Nominatim (`limit=1`) e gravávamos como
// verdade. Em cidade de rua NUMERADA (Rio Claro/SP: "Rua 12", "Av. 84") o OSM não tem
// número de casa e a MESMA via existe em vários bairros — o Nominatim devolve o
// CENTROIDE de uma via qualquer, ignorando bairro e número. Medido em produção:
//   · "Rua 12, 752, Jardim Consolação, Rio Claro, SP" → Rua 12, Cidade Claret
//   · "Rua 12, 752, Rio Claro, SP"                    → Rua 12, Santa Cruz
//   · "Rua 12, Rio Claro, SP"                         → Rua DOZE, Jardim Olinda  (≠ rua!)
// Três bairros, quilômetros entre eles, NENHUM na porta real. Dos 3 clientes daquela
// base com GPS de entrega, 3 de 3 divergiam do geocode (2.991 m, 1.512 m, 650 m) e 154
// de 248 dividiam pino com outro cliente (endereços colapsados no centro da via).
//
// LEI: pino errado é PIOR que pino vazio — o entregador confia no pino e vai no lugar
// errado (combustível, hora, cliente sem água). Então agora o candidato só vira pino se
// PROVAR que é o endereço pedido (`escolherCandidatoConfiavel`); senão o cadastro fica
// SEM pino e o card acende a pendência "GPS", que a primeira entrega resolve com o GPS
// de ouro da porta (`realimentarCoordenada*` em LogisticaService).
//
// FALLBACK DE CIDADE REMOVIDO no mesmo movimento: gravar o centro do município como
// coordenada do cliente não é endereço, é ruído — na empresa 41 eram 45 clientes
// empilhados no MESMO ponto (-22.3984,-47.5546). Vira pendência, não pino.
//
// KILL-SWITCH DE REDE (`HBX_GEO_SERVER_ENABLED`): a chamada externa só dispara quando o
// env é '1' ou 'true'. DEFAULT OFF de propósito — testes ficam HERMÉTICOS (sem chamada
// flaky/lenta, sem martelar o Nominatim) e ops tem freio sem deploy.

import { resolverCnefe } from './cnefe-resolver.util';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_TIMEOUT_MS = 2500;
// Nominatim exige UA identificável com contato — sem isso, respostas ficam instáveis/
// bloqueadas silenciosamente pela usage policy deles.
const NOMINATIM_USER_AGENT = 'HBX-Logistica/1.0 (contato@hbxsystem.com.br)';
// Pedimos mais de um candidato porque o 1º frequentemente é a via errada: quem escolhe
// é `escolherCandidatoConfiavel`, não a ordem do Nominatim.
const NOMINATIM_LIMIT = 5;

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
  /**
   * 'cnefe' = a PORTA da base IBGE local (a casa, casando CEP+número);
   * 'cnefe_cep' = o ponto do TRECHO — acerta a rua, não a casa;
   * 'geocode' = Nominatim com freio.
   *
   * 🔴 12/08 — 'cnefe_cep' entrou aqui porque o resolver devolve DUAS precisões
   * (`porta` e `rua`, o vizinho de numeração) e as duas eram carimbadas como
   * 'cnefe'. Ver `resolveServerGeo`.
   */
  geoFonte: 'geocode' | 'cnefe' | 'cnefe_cep';
}

/** `address` do payload jsonv2 do Nominatim (só os campos que a validação usa). */
export interface NominatimCandidate {
  lat?: string | number;
  lon?: string | number;
  address?: Record<string, string | undefined>;
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

/**
 * 🔴 A ÚNICA RÉGUA DE "ISTO É UM PINO?" DA CASA (09/08).
 *
 * Ela existia DOZE vezes — oito no backend, quatro no app — e com DUAS regras
 * diferentes: nove recusavam 0,0 e três aceitavam. A que aceitava morava
 * justamente nos dois lugares que mais decidem: `hasNumericCoord` (aqui, que diz
 * "já tem pino, não precisa geocodificar") e `temCoordenadaValida`
 * (logistica-geo-fonte.util.ts, que ESCOLHE de qual fonte sai o pino). Com um
 * 0,0 gravado num LocalEntrega, aquela versão frouxa fazia as duas coisas que a
 * casa proíbe na mesma tacada: elegia o 0,0 como fonte e DESCARTAVA o pino bom
 * do perfil, e ainda travava o geocode do servidor com um "já tem pino" falso —
 * enquanto a rota (`hasCoord`) e o app jogavam a parada fora por não ser pino.
 * O cliente sumia do mapa e ninguém conseguia curá-lo.
 *
 * 0,0 é a Ilha Nula, no golfo da Guiné: é o que sobra quando um fix falha, um
 * import vem vazio ou um `Number(undefined || 0)` passa. Não é endereço de
 * ninguém — em produção hoje não existe nenhum, e é assim que tem que continuar.
 *
 * Faixa também entra: |lat|<=90 e |lng|<=180. Fora disso não é a Terra.
 */
export function pinoValido(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// ── Comparação de VIA (logradouro) ──────────────────────────────────────────────
// Abreviação é regra do BR, não capricho: a ficha do cliente vem "Av. 84", o OSM
// devolve "Avenida 84". Normalizamos o TIPO da via e comparamos o resto.
const TIPO_VIA: Array<[RegExp, string]> = [
  [/^(av|avn|avd|avenida)\b/, 'av'],
  [/^(r|rua)\b/, 'rua'],
  [/^(tv|trav|travessa)\b/, 'travessa'],
  [/^(rod|rodovia)\b/, 'rodovia'],
  [/^(est|estr|estrada)\b/, 'estrada'],
  [/^(al|alameda)\b/, 'alameda'],
  [/^(pc|pca|praca)\b/, 'praca'],
];

/** "Av. 84" → "av 84" · "AVENIDA 84" → "av 84" · "Rua 12" → "rua 12". */
export function normalizeVia(value: string | null | undefined): string {
  let v = normalizeLookupValue(value).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, canonico] of TIPO_VIA) {
    if (re.test(v)) {
      v = v.replace(re, canonico);
      break;
    }
  }
  return v.replace(/\s+/g, ' ').trim();
}

/**
 * As duas strings falam da MESMA via? Igualdade normalizada, ou uma contendo a outra
 * por PALAVRA INTEIRA ("av 84" ⊂ "av 84 sul"). Contenção por palavra inteira de
 * propósito: "rua 1" NÃO pode casar com "rua 12", e "rua 12" NÃO casa com "rua doze"
 * (foi exatamente o pulo do gato que jogou a Terra Hydra Mary a 3 km).
 */
export function viasCompativeis(pedida: string | null | undefined, candidata: string | null | undefined): boolean {
  const a = normalizeVia(pedida);
  const b = normalizeVia(candidata);
  if (!a || !b) return false;
  if (a === b) return true;
  const contemPalavra = (todo: string, parte: string) => new RegExp(`(^| )${escapeRegex(parte)}( |$)`).test(todo);
  return contemPalavra(a, b) || contemPalavra(b, a);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function soDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D+/g, '');
}

function cidadeDoCandidato(a: Record<string, string | undefined>): string {
  return normalizeLookupValue(a.city ?? a.town ?? a.village ?? a.municipality ?? a.city_district);
}

function bairroDoCandidato(a: Record<string, string | undefined>): string {
  return normalizeLookupValue(a.suburb ?? a.neighbourhood ?? a.quarter ?? a.hamlet ?? a.city_district);
}

function ufDoCandidato(a: Record<string, string | undefined>): string {
  const iso = String(a['ISO3166-2-lvl4'] ?? '').trim().toUpperCase();
  const m = /^BR-([A-Z]{2})$/.exec(iso);
  return m ? m[1] : '';
}

/**
 * FREIO (25/07) — escolhe entre os candidatos do Nominatim o PRIMEIRO que PROVA ser o
 * endereço pedido. Fail-closed: na dúvida devolve null (o cadastro fica sem pino).
 *
 * Exigências, todas obrigatórias:
 *  1. o pedido tem cidade + UF (sem isso não há como validar nada);
 *  2. o candidato bate cidade E UF;
 *  3. o candidato tem via (`road`) COMPATÍVEL com o logradouro pedido;
 *  4. e prova a precisão de UMA destas duas formas:
 *     a. número da casa igual ao pedido (precisão de porta — o ideal), OU
 *     b. bairro pedido igual ao bairro do candidato (precisão de rua-no-bairro).
 *
 * Sem bairro no pedido e sem número na resposta sobra "a via inteira, em algum lugar
 * da cidade" — que é exatamente o pino de loteria que este freio existe pra barrar.
 */
export function escolherCandidatoConfiavel(
  candidatos: NominatimCandidate[],
  input: ServerGeoAddressInput,
): { lat: number; lng: number } | null {
  const cidadePedida = normalizeLookupValue(input.cidade);
  const ufPedida = String(input.uf || '').trim().toUpperCase();
  if (!cidadePedida || !/^[A-Z]{2}$/.test(ufPedida)) return null;

  const viaPedida = input.endereco ?? '';
  const numeroPedido = soDigitos(input.numero);
  const bairroPedido = normalizeLookupValue(input.bairro);

  for (const cand of Array.isArray(candidatos) ? candidatos : []) {
    const a = cand?.address;
    if (!a || typeof a !== 'object') continue;

    const lat = Number(cand.lat);
    const lng = Number(cand.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    if (cidadeDoCandidato(a) !== cidadePedida) continue;
    if (ufDoCandidato(a) !== ufPedida) continue;
    if (!viasCompativeis(viaPedida, a.road)) continue;

    const numeroOk = Boolean(numeroPedido) && soDigitos(a.house_number) === numeroPedido;
    const bairroOk = Boolean(bairroPedido) && bairroDoCandidato(a) === bairroPedido;
    if (!numeroOk && !bairroOk) continue;

    return { lat, lng };
  }
  return null;
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

/** Kill-switch de rede: só a chamada externa passa por aqui; default OFF. */
function serverGeoNetworkEnabled(): boolean {
  const v = String(process.env.HBX_GEO_SERVER_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Nominatim server-side — best-effort, NUNCA lança (qualquer falha vira null). */
async function geocodeViaNominatim(input: ServerGeoAddressInput): Promise<{ lat: number; lng: number } | null> {
  // Gate de REDE: flag OFF (default) → retorna null SEM fetch. Testes ficam herméticos;
  // ops tem freio.
  if (!serverGeoNetworkEnabled()) return null;
  const query = buildNominatimQuery(input);
  if (query.length < 4) return null;
  try {
    const url =
      `${NOMINATIM_SEARCH_URL}?format=jsonv2&countrycodes=br&addressdetails=1` +
      `&limit=${NOMINATIM_LIMIT}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as NominatimCandidate[];
    // FREIO: quem escolhe é a validação, nunca a ordem do Nominatim.
    return escolherCandidatoConfiavel(Array.isArray(arr) ? arr : [], input);
  } catch {
    // timeout (AbortSignal.timeout), rede fora, JSON quebrado — degrada, nunca propaga.
    return null;
  }
}

/**
 * Resolve coordenada no SERVIDOR, best-effort, pra quando o navegador não mandou
 * lat/lng. Retorna `null` quando o geocode não PROVA o endereço (freio 25/07) — o
 * cadastro segue sem pino, o card acende pendência "GPS" e a primeira entrega grava a
 * porta real. Esta função só ADICIONA uma chance, nunca remove nem inventa.
 *
 * R9 (27/07) — a base CNEFE local tenta PRIMEIRO: (cep, numero) → porta do Censo,
 * sem rede externa e imune à loteria de via do Nominatim (fail-closed próprio, ver
 * cnefe-resolver.util.ts). Sem CEP/número, UF sem carga ou dúvida → Nominatim como
 * sempre. O CNEFE não depende do kill-switch HBX_GEO_SERVER_ENABLED (que é da REDE
 * externa); ele tem o próprio gate HBX_CNEFE_ENABLED.
 */
export async function resolveServerGeo(input: ServerGeoAddressInput): Promise<ServerGeoResult | null> {
  const porCnefe = await resolverCnefe({ cep: input.cep, numero: input.numero, endereco: input.endereco, uf: input.uf });
  if (porCnefe) {
    /* 🔴 O PINO DO VIZINHO NÃO SE VESTE DE PORTA (12/08, F4 do PR12082026).
       `resolverCnefe` devolve DUAS precisões: `porta` (a casa, casando CEP+número)
       e `rua` (o vizinho de numeração — até 200 números de distância e 400 m de
       dispersão, § escolherPinoRua). As duas viravam `geoFonte: 'cnefe'` aqui — e
       na escada da procedência (logistica-geo-fonte.util) 'cnefe' é a PORTA
       PROVADA: força 3, `geoFonteDaPorta` = true. Consequência medida em código:
       o ponto do VIZINHO ficava intocável pela cura do Censo (só troca o que está
       ABAIXO da porta), contava como "provado" no fechamento do dia e sumia com o
       convite de GPS — ou seja, mentia de porta e ainda bloqueava a correção que
       o consertaria. O nome certo dele já existia: `cnefe_cep`, "acerta a rua,
       não a casa" (força 2, substituível pela porta). */
    return {
      lat: porCnefe.lat,
      lng: porCnefe.lng,
      geoFonte: porCnefe.precisao === 'porta' ? 'cnefe' : 'cnefe_cep',
    };
  }
  const preciso = await geocodeViaNominatim(input);
  return preciso ? { ...preciso, geoFonte: 'geocode' } : null;
}
