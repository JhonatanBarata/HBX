"use client";

// ================================================================
// LOGÍSTICA-MOBILE — geocoding ZERO-CUSTO pro cadastro de cliente.
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

// ── Nominatim forward: texto → coordenada (pino do minimapa) ─────────────────
export async function geocodar(q: string): Promise<Ponto | null> {
  const query = (q || "").trim();
  if (query.length < 4) return null;
  try {
    const url = `${NOMINATIM}/search?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const arr = (await r.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
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
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
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
      uf: ufDoEstado(a.state, a["ISO3166-2-lvl4"]),
    };
  } catch {
    return null;
  }
}

// Nominatim devolve o estado por extenso ("Ceará") e, quase sempre, o código
// ISO ("BR-CE"). Preferimos o ISO; se faltar, caímos no mapa por nome.
const ESTADO_UF: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapá: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceará: "CE",
  "distrito federal": "DF",
  "espírito santo": "ES",
  goiás: "GO",
  maranhão: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  pará: "PA",
  paraíba: "PB",
  paraná: "PR",
  pernambuco: "PE",
  piauí: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondônia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "são paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function ufDoEstado(estado?: string, iso?: string): string {
  if (iso && /^BR-[A-Z]{2}$/.test(iso)) return iso.slice(3);
  const chave = (estado || "").trim().toLowerCase();
  return ESTADO_UF[chave] || "";
}

// ── Minimapa: iframe do OpenStreetMap com o pino no ponto ────────────────────
export function mapaEmbedUrl(p: Ponto): string {
  const d = 0.004; // ~450m de janela em volta do pino
  const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat}%2C${p.lng}`;
}
