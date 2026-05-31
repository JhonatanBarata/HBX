export type RadarWebEnrichmentPriorityInput = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  phoneDigits?: string | null;
  website?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  source?: string | null;
  score?: number | null;
  enrichmentScore?: number | null;
  index?: number | null;
};

export type RadarWebEnrichmentPriority = {
  id: string;
  score: number;
  reasons: string[];
  index: number;
};

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeText(raw: unknown) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(raw: unknown) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function hasUsableWebsite(value: unknown) {
  const raw = compact(value).toLowerCase();
  if (!raw) return false;
  return !/(^|\.)(instagram|facebook|fb|wa|whatsapp)\.com\b/.test(raw)
    && !/(^|\.)(google|maps|linktr\.ee|bio\.link|ifood|marketplace|catalogo|guiamais|apontador|solutudo)\b/.test(raw);
}

function hasGenericDirectorySource(value: unknown) {
  return /(directory|diretor|catalogo|guiamais|apontador|solutudo|google|maps|marketplace|ifood)/i.test(String(value || ''));
}

function hasStrongBusinessName(value: unknown) {
  const tokens = normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !['ltda', 'mei', 'me', 'eireli', 'servicos', 'comercio'].includes(token));
  return tokens.length >= 2 || Boolean(tokens[0] && tokens[0].length >= 5);
}

export function hasPoorRadarWebEnrichmentFields(input: RadarWebEnrichmentPriorityInput) {
  const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
  if (phoneDigits.length < 10) return false;
  return !hasUsableWebsite(input.website)
    || !compact(input.email)
    || !compact(input.instagramUrl || input.facebookUrl);
}

export function scoreRadarWebEnrichmentCandidate(input: RadarWebEnrichmentPriorityInput): RadarWebEnrichmentPriority {
  const reasons: string[] = [];
  let score = 0;
  const id = compact(input.id);
  const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);

  if (!id || phoneDigits.length < 10) {
    return { id, score: -1, reasons: ['sem_id_ou_telefone_minimo'], index: safeInteger(input.index) };
  }

  if (!compact(input.instagramUrl || input.facebookUrl)) {
    score += 45;
    reasons.push('sem_social');
  }
  if (!hasUsableWebsite(input.website)) {
    score += 30;
    reasons.push('sem_site_oficial');
  }
  if (!compact(input.email)) {
    score += 18;
    reasons.push('sem_email');
  }
  if (['pending', 'missing', 'error', 'weak', 'candidate_review', 'searching'].includes(normalizeText(input.socialStatus))) {
    score += 12;
    reasons.push('social_pendente_ou_fraco');
  }
  if (hasStrongBusinessName(input.name)) {
    score += 10;
    reasons.push('nome_buscavel');
  }
  const qualityScore = Math.max(safeInteger(input.score), safeInteger(input.enrichmentScore));
  if (qualityScore >= 70) {
    score += 8;
    reasons.push('score_forte');
  } else if (qualityScore >= 50) {
    score += 4;
    reasons.push('score_ok');
  }
  if (/hbx|radar_database|company_history/i.test(String(input.source || ''))) {
    score += 4;
    reasons.push('fonte_confiavel');
  }
  if (hasGenericDirectorySource(input.source) || !hasStrongBusinessName(input.name)) {
    score -= 20;
    reasons.push('risco_baixa_precisao');
  }

  return { id, score, reasons, index: safeInteger(input.index) };
}

export function rankRadarWebEnrichmentCandidates(inputs: RadarWebEnrichmentPriorityInput[]) {
  return inputs
    .map((input, index) => ({
      priority: scoreRadarWebEnrichmentCandidate({ ...input, index: input.index ?? index }),
      poor: hasPoorRadarWebEnrichmentFields(input),
    }))
    .filter((item) => item.poor && item.priority.id && item.priority.score > 0)
    .map((item) => item.priority)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
