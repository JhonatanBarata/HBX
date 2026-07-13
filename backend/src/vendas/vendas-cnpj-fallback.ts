export type VendasRfbLeadIdentity = {
  name?: string | null;
  segment?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
};

export type VendasRfbCompanyCandidate = {
  cnpj?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  searchText?: string | null;
  phone?: string | null;
  phoneDigits?: string | null;
  email?: string | null;
  city?: string | null;
  normalizedCity?: string | null;
  state?: string | null;
  address?: string | null;
  situacao?: string | null;
  cnae?: string | null;
  cnaeDescription?: string | null;
  ownerName?: string | null;
};

export type VendasRfbMatch<T extends VendasRfbCompanyCandidate = VendasRfbCompanyCandidate> = {
  company: T;
  score: number;
  runnerUpScore: number | null;
  reasons: string[];
};

const LEGAL_AND_GENERIC_TOKENS = new Set([
  'a', 'as', 'o', 'os', 'de', 'da', 'das', 'do', 'dos', 'e',
  'brasil', 'grupo', 'empresa', 'empresas', 'servico', 'servicos',
  'comercio', 'comercial', 'consultoria', 'assessoria', 'escritorio',
  'contabilidade', 'contabilidades', 'contabil',
  'ltda', 'limitada', 'me', 'mei', 'eireli', 'sa', 's', 'sociedade',
]);

const ADDRESS_GENERIC_TOKENS = new Set([
  'rua', 'r', 'avenida', 'av', 'travessa', 'estrada', 'rodovia',
  'alameda', 'praca', 'largo', 'numero', 'n', 'bairro',
]);

export function normalizeRfbMatchText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function localPhoneDigits(value: unknown): string {
  const raw = digits(value);
  if (raw.startsWith('55') && (raw.length === 12 || raw.length === 13)) return raw.slice(2);
  return raw;
}

export function buildRfbPhoneCandidates(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    const local = localPhoneDigits(value);
    if (local.length === 10 || local.length === 11) candidates.add(local);

    // Celular atual: DDD + 9 + oito dígitos. Inclui a forma antiga sem o nono dígito.
    if (local.length === 11 && local[2] === '9') {
      candidates.add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    // Cadastro antigo da RFB: DDD + oito dígitos iniciados em 6-9.
    if (local.length === 10 && /[6-9]/.test(local[2] || '')) {
      candidates.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
  }
  return Array.from(candidates);
}

function tokens(value: unknown): string[] {
  return normalizeRfbMatchText(value)
    .split(' ')
    .filter((token) => token.length >= 3);
}

export function buildRfbNameTokens(name: unknown, segment?: unknown): string[] {
  const segmentTokens = new Set(tokens(segment));
  return Array.from(new Set(
    tokens(name).filter((token) =>
      !LEGAL_AND_GENERIC_TOKENS.has(token) &&
      !segmentTokens.has(token),
    ),
  )).slice(0, 6);
}

export function extractRfbAddressNumber(address: unknown): string | null {
  const found = normalizeRfbMatchText(address).match(/\b\d{1,6}\b/);
  return found?.[0] || null;
}

function buildAddressTokens(address: unknown): string[] {
  return Array.from(new Set(
    tokens(address).filter((token) =>
      !ADDRESS_GENERIC_TOKENS.has(token) &&
      !/^\d+$/.test(token),
    ),
  )).slice(0, 8);
}

function companyNames(candidate: VendasRfbCompanyCandidate): string[] {
  return [
    candidate.nomeFantasia,
    candidate.razaoSocial,
  ]
    .map(normalizeRfbMatchText)
    .filter(Boolean);
}

function candidatePhoneSet(candidate: VendasRfbCompanyCandidate): Set<string> {
  return new Set(buildRfbPhoneCandidates(candidate.phoneDigits, candidate.phone));
}

function scoreCandidate(
  lead: VendasRfbLeadIdentity,
  candidate: VendasRfbCompanyCandidate,
): { score: number; reasons: string[]; strongContact: boolean; strongIdentity: boolean } {
  let score = 0;
  const reasons: string[] = [];

  const leadPhoneSet = new Set(buildRfbPhoneCandidates(lead.phoneNormalized, lead.phone));
  const candidatePhones = candidatePhoneSet(candidate);
  const phoneMatch = Array.from(leadPhoneSet).some((phone) => candidatePhones.has(phone));
  if (phoneMatch) {
    score += 100;
    reasons.push('telefone_exato');
  }

  const leadEmail = String(lead.email || '').trim().toLowerCase();
  const candidateEmail = String(candidate.email || '').trim().toLowerCase();
  const emailMatch = Boolean(leadEmail && candidateEmail && leadEmail === candidateEmail);
  if (emailMatch) {
    score += 90;
    reasons.push('email_exato');
  }

  const leadName = normalizeRfbMatchText(lead.name);
  const names = companyNames(candidate);
  const exactName = Boolean(leadName && names.some((name) => name === leadName));
  const containedName = Boolean(
    leadName &&
    names.some((name) => name.includes(leadName) || leadName.includes(name)),
  );
  if (exactName) {
    score += 70;
    reasons.push('nome_exato');
  } else if (containedName) {
    score += 45;
    reasons.push('nome_contido');
  }

  const leadNameTokens = buildRfbNameTokens(lead.name, lead.segment);
  const candidateText = normalizeRfbMatchText(
    [candidate.nomeFantasia, candidate.razaoSocial, candidate.searchText]
      .filter(Boolean)
      .join(' '),
  );
  const matchedNameTokens = leadNameTokens.filter((token) =>
    candidateText.split(' ').includes(token),
  );
  const nameCoverage = leadNameTokens.length
    ? matchedNameTokens.length / leadNameTokens.length
    : 0;
  if (matchedNameTokens.length) {
    score += Math.round(nameCoverage * 40);
    reasons.push(`nome_tokens_${matchedNameTokens.length}`);
  }

  const leadCity = normalizeRfbMatchText(lead.city);
  const candidateCity = normalizeRfbMatchText(candidate.normalizedCity || candidate.city);
  const cityMatch = Boolean(leadCity && candidateCity && leadCity === candidateCity);
  if (cityMatch) {
    score += 20;
    reasons.push('cidade_exata');
  }

  const leadState = String(lead.state || '').trim().toUpperCase();
  const candidateState = String(candidate.state || '').trim().toUpperCase();
  const stateMatch = Boolean(leadState && candidateState && leadState === candidateState);
  if (stateMatch) {
    score += 10;
    reasons.push('uf_exata');
  }

  const leadAddressNumber = extractRfbAddressNumber(lead.address);
  const candidateAddress = normalizeRfbMatchText(candidate.address);
  const addressNumberMatch = Boolean(
    leadAddressNumber &&
    new RegExp(`\\b${leadAddressNumber}\\b`).test(candidateAddress),
  );
  if (addressNumberMatch) {
    score += 25;
    reasons.push('numero_endereco_exato');
  }

  const leadAddressTokens = buildAddressTokens(lead.address);
  const candidateAddressTokens = new Set(buildAddressTokens(candidate.address));
  const addressOverlap = leadAddressTokens.filter((token) => candidateAddressTokens.has(token)).length;
  if (addressOverlap) {
    score += Math.min(20, addressOverlap * 5);
    reasons.push(`endereco_tokens_${addressOverlap}`);
  }

  const active = ['ativa', 'ativo', 'active'].includes(
    normalizeRfbMatchText(candidate.situacao || 'ativa'),
  );
  if (active) score += 5;

  const strongContact = phoneMatch || emailMatch;
  const strongIdentity = Boolean(
    exactName ||
    (
      nameCoverage === 1 &&
      cityMatch &&
      (addressNumberMatch || addressOverlap >= 2)
    ),
  );

  return { score, reasons, strongContact, strongIdentity };
}

export function selectVendasRfbMatch<T extends VendasRfbCompanyCandidate>(
  lead: VendasRfbLeadIdentity,
  candidates: T[],
): VendasRfbMatch<T> | null {
  const unique = Array.from(
    new Map(
      (candidates || [])
        .filter((candidate) => digits(candidate?.cnpj).length === 14)
        .map((candidate) => [digits(candidate.cnpj), candidate]),
    ).values(),
  );

  const ranked = unique
    .map((company) => ({ company, ...scoreCandidate(lead, company) }))
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  if (!winner) return null;

  const runnerUpScore = ranked[1]?.score ?? null;
  const margin = runnerUpScore == null ? winner.score : winner.score - runnerUpScore;

  // Contato exato aceita com margem menor, mas telefone/e-mail compartilhado nunca vence por empate.
  if (winner.strongContact) {
    if (winner.score < 100 || margin < 15) return null;
  } else {
    // Sem contato exato, exige identidade forte e margem larga para não contaminar o CRM.
    if (!winner.strongIdentity || winner.score < 85 || margin < 20) return null;
  }

  return {
    company: winner.company,
    score: winner.score,
    runnerUpScore,
    reasons: winner.reasons,
  };
}

export function parseRfbJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, any>) };
  }
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {};
  } catch {
    return {};
  }
}
