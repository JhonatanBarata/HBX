// S2 LEAD-CENTRICO (25/07 — docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/02-radar-limpo.md):
// "se o sistema não explica por que a empresa entrou, ele não sabe por que ela entrou" (regra
// do PDF endossada pelo dono). Motivo de inclusão POR CARD, gravado em
// metadataJson.inclusionReasons no delivery (radar-core-delivery.mixin.ts) e exposto em
// buildRadarLeadPublic. Função pura, sem dependência do service gigante — fácil de testar
// isolada. Vocabulário curto e estável (front mapeia código → rótulo PT-BR no badge).
export type RadarInclusionReasonsInput = {
  requestedSegment?: string | null;
  requestedCity?: string | null;
  requestedState?: string | null;
  resultCity?: string | null;
  resultState?: string | null;
  source?: string | null;
  sourceEngine?: string | null;
  phoneDigits?: string | null;
  whatsappStatus?: string | null;
  website?: string | null;
  sourceEngines?: string[] | null;
};

const CNPJ_PUBLIC_SOURCE_KEYS = new Set(['cnpj_public']);
const WHATSAPP_POSITIVE_STATUSES = new Set(['confirmed', 'available', 'valid', 'exists', 'true']);

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isCnpjPublicSource(input: RadarInclusionReasonsInput): boolean {
  return CNPJ_PUBLIC_SOURCE_KEYS.has(normalizeKey(input.sourceEngine))
    || CNPJ_PUBLIC_SOURCE_KEYS.has(normalizeKey(input.source));
}

export function buildRadarLeadInclusionReasons(input: RadarInclusionReasonsInput): string[] {
  const reasons: string[] = [];
  const requestedSegment = String(input.requestedSegment || '').trim();

  if (requestedSegment) {
    // Porta da Receita (CNAE real) x lane web (nome/CNAE textual, sem certidão) — motivo
    // diferente porque a evidência é diferente (S2: CNAE volta a ser filtro DURO só na
    // porta da Receita; a lane web usa o mesmo mapa de exclusão, mas não tem CNAE oficial).
    reasons.push(isCnpjPublicSource(input) ? 'cnae_compativel' : 'nome_combina_segmento');
  } else {
    reasons.push('sem_segmento_pedido');
  }

  const requestedCity = normalizeKey(input.requestedCity);
  const requestedState = normalizeKey(input.requestedState);
  const resultCity = normalizeKey(input.resultCity);
  const resultState = normalizeKey(input.resultState);
  const cityOk = !requestedCity || !resultCity || requestedCity === resultCity;
  const stateOk = !requestedState || !resultState || requestedState === resultState;
  if (cityOk && stateOk && (requestedCity || requestedState)) {
    reasons.push('cidade_uf_ok');
  }

  if (String(input.phoneDigits || '').replace(/\D/g, '').length >= 10) {
    reasons.push('telefone_presente');
  }
  if (WHATSAPP_POSITIVE_STATUSES.has(normalizeKey(input.whatsappStatus))) {
    reasons.push('whatsapp_confirmado');
  }
  if (String(input.website || '').trim()) {
    reasons.push('website_proprio');
  }
  if (Array.isArray(input.sourceEngines) && input.sourceEngines.length > 1) {
    reasons.push('multiplas_fontes');
  }

  return reasons;
}
