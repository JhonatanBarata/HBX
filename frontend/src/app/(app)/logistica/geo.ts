"use client";

// ================================================================
// LOGÍSTICA — geocoding ZERO-CUSTO pro cadastro de cliente (desktop).
// Mudou de casa em 06/08 junto do clientes-api.ts, quando a view mobile do
// navegador foi apagada; consumidor vivo = cockpit de endereços.
//  · buscarCep       — ViaCEP: CEP → rua/bairro/cidade/UF (sem chave, CORS ok).
//  · geocodar        — Nominatim (OSM) search: texto → {lat,lng} (pino do mapa).
//  · reverseGeocodar — Nominatim reverse: {lat,lng} → endereço (GPS → rua/nº).
//  · mapaEmbedUrl    — iframe OSM (minimapa com pino), sem lib nem chave.
//
// Nada disso passa pelo backend (apiFetch) — é chamada externa DIRETA do
// navegador. Falha SEMPRE degrada pra null: o cadastro nunca trava porque um
// serviço de mapa está fora do ar (o usuário ainda preenche à mão). Nominatim:
// teto de 1 req/s, uso leve (cadastro manual) — ok pela policy de uso justo;
// o Referer do navegador identifica a origem.
// ================================================================

const VIACEP = "https://viacep.com.br/ws";
const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface Ponto {
  lat: number;
  lng: number;
}

/** Só os dígitos de uma string ("01001-000" → "01001000"). */
export function soDigitos(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

/** "00000000" → "00000-000" (mantém parcial intacto durante a digitação). */
export function formatarCep(s: string): string {
  const d = soDigitos(s).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ── ViaCEP: CEP → endereço ───────────────────────────────────────────────────
export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export async function buscarCep(cepRaw: string): Promise<EnderecoCep | null> {
  const cep = soDigitos(cepRaw);
  if (cep.length !== 8) return null;
  try {
    const r = await fetch(`${VIACEP}/${cep}/json/`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (!j || j.erro) return null;
    return {
      cep: formatarCep(cep),
      logradouro: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      uf: j.uf || "",
    };
  } catch {
    return null;
  }
}

// ── Nominatim forward: endereço → coordenada (pino do minimapa) ──────────────
//
// FREIO (25/07, incidente empresa 41 / "Terra Hydra Mary"). Antes: `limit=1` e o
// primeiro palpite virava pino. Em cidade de rua NUMERADA (Rio Claro/SP: "Rua 12",
// "Av. 84") o OSM não tem número de casa e a MESMA via existe em vários bairros — o
// Nominatim devolve o CENTROIDE de uma via qualquer, ignorando número e bairro:
//   "Rua 12, 752, Jardim Consolação, Rio Claro, SP" → Rua 12, Cidade Claret
//   "Rua 12, 752, Rio Claro, SP"                    → Rua 12, Santa Cruz
//   "Rua 12, Rio Claro, SP"                         → Rua DOZE, Jardim Olinda (≠ rua!)
// Três bairros, quilômetros de distância, nenhum na porta real — e o pino errado foi
// parar no mapa do entregador, a 3 km do cliente.
//
// LEI: pino errado é PIOR que pino vazio. Agora o candidato só vira pino se PROVAR o
// endereço pedido; senão fica SEM pino, o card acende a pendência "GPS" e a primeira
// entrega grava a porta real pelo GPS do aparelho. Gêmeo server-side (MESMAS regras):
// backend/src/nucleo/nucleo-geo.util.ts#escolherCandidatoConfiavel.
export interface EnderecoPartes {
  logradouro: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}

interface CandidatoNominatim {
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
}

export async function geocodar(partes: EnderecoPartes): Promise<Ponto | null> {
  const rua = (partes.logradouro || "").trim();
  const cidade = (partes.cidade || "").trim();
  const uf = (partes.uf || "").trim();
  if (!rua || !cidade || !uf) return null; // sem isso não há como validar nada.
  const q = [
    [rua, (partes.numero || "").trim()].filter(Boolean).join(", "),
    (partes.bairro || "").trim(),
    cidade,
    uf,
    (partes.cep || "").trim(),
  ]
    .filter(Boolean)
    .join(", ");
  try {
    const url = `${NOMINATIM}/search?format=jsonv2&countrycodes=br&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const arr = (await r.json()) as CandidatoNominatim[];
    // Quem escolhe é a validação, NUNCA a ordem do Nominatim.
    return escolherCandidatoConfiavel(Array.isArray(arr) ? arr : [], partes);
  } catch {
    return null;
  }
}

/**
 * O PRIMEIRO candidato que prova ser o endereço pedido — ou null (fail-closed).
 * Exige, tudo junto: cidade + UF batendo, via compatível com o logradouro pedido e
 * ainda precisão comprovada por número da casa OU por bairro. Sem bairro no pedido e
 * sem número na resposta sobra "a via inteira, em algum lugar da cidade" — que é
 * exatamente o pino de loteria que este freio existe pra barrar.
 */
function escolherCandidatoConfiavel(cands: CandidatoNominatim[], partes: EnderecoPartes): Ponto | null {
  const cidadePedida = semAcento(partes.cidade);
  const ufPedida = (partes.uf || "").trim().toUpperCase();
  const numeroPedido = soDigitos(partes.numero || "");
  const bairroPedido = semAcento(partes.bairro || "");

  for (const c of cands) {
    const a = c?.address;
    if (!a) continue;
    const lat = Number(c.lat);
    const lng = Number(c.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const cidadeCand = semAcento(a.city || a.town || a.village || a.municipality || a.city_district || "");
    if (cidadeCand !== cidadePedida) continue;
    if (ufDoEstado(a["ISO3166-2-lvl4"]) !== ufPedida) continue;
    if (!viasCompativeis(partes.logradouro, a.road)) continue;

    const numeroOk = Boolean(numeroPedido) && soDigitos(a.house_number || "") === numeroPedido;
    const bairroCand = semAcento(a.suburb || a.neighbourhood || a.quarter || a.hamlet || a.city_district || "");
    const bairroOk = Boolean(bairroPedido) && bairroCand === bairroPedido;
    if (!numeroOk && !bairroOk) continue;

    return { lat, lng };
  }
  return null;
}

function semAcento(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Abreviação é regra do BR, não capricho: a ficha vem "Av. 84", o OSM devolve
// "Avenida 84". Normaliza o TIPO da via e compara o resto.
const TIPO_VIA: Array<[RegExp, string]> = [
  [/^(av|avn|avd|avenida)\b/, "av"],
  [/^(r|rua)\b/, "rua"],
  [/^(tv|trav|travessa)\b/, "travessa"],
  [/^(rod|rodovia)\b/, "rodovia"],
  [/^(est|estr|estrada)\b/, "estrada"],
  [/^(al|alameda)\b/, "alameda"],
  [/^(pc|pca|praca)\b/, "praca"],
];

function normalizeVia(v: string | undefined): string {
  let s = semAcento(v || "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, canonico] of TIPO_VIA) {
    if (re.test(s)) {
      s = s.replace(re, canonico);
      break;
    }
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Mesma via? Igualdade normalizada ou contenção por PALAVRA INTEIRA ("av 84" ⊂
 *  "av 84 sul"). Palavra inteira de propósito: "rua 1" não casa com "rua 12", e
 *  "rua 12" não casa com "rua doze" — foi esse pulo do gato que jogou o cliente a 3 km. */
function viasCompativeis(pedida: string | undefined, candidata: string | undefined): boolean {
  const a = normalizeVia(pedida);
  const b = normalizeVia(candidata);
  if (!a || !b) return false;
  if (a === b) return true;
  const contem = (todo: string, parte: string) =>
    new RegExp(`(^| )${parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(todo);
  return contem(a, b) || contem(b, a);
}

// ── Nominatim reverse: coordenada → endereço (fluxo "Usar este local") ───────
export interface EnderecoReverso {
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  hamlet?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  postcode?: string;
  "ISO3166-2-lvl4"?: string;
}

export async function reverseGeocodar(p: Ponto): Promise<EnderecoReverso | null> {
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${p.lat}&lon=${p.lng}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { address?: NominatimAddress };
    const a = j?.address;
    if (!a) return null;
    return {
      cep: formatarCep(a.postcode || ""),
      logradouro: a.road || a.pedestrian || a.footway || "",
      numero: a.house_number || "",
      bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || "",
      cidade: a.city || a.town || a.village || a.municipality || "",
      uf: ufDoEstado(a["ISO3166-2-lvl4"]),
    };
  } catch {
    return null;
  }
}

// FIX (25/07) — gêmeo do backend (nucleo-geo.util.ts#ufDoCandidato): só o código
// ISO conta. O fallback por nome do estado ("Ceará" → "CE") foi REMOVIDO — a tela
// não pode aceitar um candidato que o servidor recusaria (mesma regra em dois
// lugares, ou não é regra). Sem ISO válido, uf vazia = candidato descartado a
// jusante (viasCompativeis/numeroOk/bairroOk exigem cidade+UF batendo).
function ufDoEstado(iso?: string): string {
  const m = /^BR-([A-Z]{2})$/.exec(String(iso || "").trim().toUpperCase());
  return m ? m[1] : "";
}

// ── Minimapa: iframe do OpenStreetMap com o pino no ponto ────────────────────
export function mapaEmbedUrl(p: Ponto): string {
  const d = 0.004; // ~450m de janela em volta do pino
  const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat}%2C${p.lng}`;
}
