import type { CnpjBaseQueryInput } from './cnpj-base-query.service';

// LEADS-FINAL 03 (06/07) — ponte ÚNICA entre os "6 filtros que importam" da gaveta nova
// (docs/PLANEJAMENTOS/LEADS-FINAL/03-FILTROS-E-PESQUISAS-SALVAS.md) e o WHERE da base 28M
// (CnpjPublicCompany, cnpj-base-query.service.ts). Espelha o espirito de
// radar-base-availability.util.ts (a ponte da VITRINE) mas com o contrato PRÓPRIO do endpoint
// de contagem gratis (POST /webscraping/radar/count) — whitelist explicita, nunca aceita campo
// livre do usuario sem passar por um destes.

export type RadarCountFiltersInput = {
  uf?: string | null;
  estado?: string | null; // alias de uf (nome como o front do plano chama)
  city?: string | null;
  cidade?: string | null; // alias de city
  segment?: string | null;
  cnae?: string | null;
  porte?: string[] | null;
  situacao?: string | string[] | null;
  abertaDe?: string | null;
  abertaAte?: string | null;
  contato?: {
    temTelefone?: boolean | null;
    temEmail?: boolean | null;
  } | null;
};

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Mesma regra de extração de código CNAE puro usada em radar-base-availability.util.ts. */
function extractCnaeCode(segment: string): string | null {
  const match = segment.match(/\b\d{4,7}\b/);
  return match ? match[0] : null;
}

export function buildCnpjBaseQueryInputFromCountFilters(
  filters: RadarCountFiltersInput,
): CnpjBaseQueryInput {
  const state = firstNonEmpty(filters.uf, filters.estado).toUpperCase();
  const city = firstNonEmpty(filters.city, filters.cidade);
  const cnaeDireto = String(filters.cnae || '').trim();
  const segment = String(filters.segment || '').trim();

  const input: CnpjBaseQueryInput = {};
  if (state) input.states = [state];
  if (city) input.cities = [city];

  if (cnaeDireto) {
    input.cnaes = [cnaeDireto];
  } else if (segment) {
    const cnaeCode = extractCnaeCode(segment);
    if (cnaeCode) input.cnaes = [cnaeCode];
    else input.keyword = segment;
  }

  if (Array.isArray(filters.porte) && filters.porte.length) {
    const porte = filters.porte.map((p) => String(p || '').trim()).filter(Boolean);
    if (porte.length) input.porte = porte;
  }

  if (filters.situacao) {
    const situacoes = Array.isArray(filters.situacao) ? filters.situacao : [filters.situacao];
    const cleaned = situacoes.map((s) => String(s || '').trim()).filter(Boolean);
    if (cleaned.length) input.situacoes = cleaned;
  }

  if (filters.abertaDe) input.abertaDe = String(filters.abertaDe).trim();
  if (filters.abertaAte) input.abertaAte = String(filters.abertaAte).trim();

  const contato: CnpjBaseQueryInput['contato'] = {};
  if (filters.contato?.temTelefone) contato.comTelefone = true;
  if (filters.contato?.temEmail) contato.comEmail = true;
  if (Object.keys(contato).length) input.contato = contato;

  return input;
}
