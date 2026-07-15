type JsonRecord = Record<string, any>;

function asRecord(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function scoreOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function qualityCandidates(value: unknown) {
  const direct = asRecord(value);
  const raw = asRecord(direct.rawJson);
  const enrichment = asRecord(direct.enrichmentJson);
  const metadata = asRecord(direct.metadataJson);
  const evidence = asRecord(direct.evidenceJson);
  return [
    direct.version === 'lead-quality-v2' || scoreOrNull(direct.finalRankScore) !== null ? direct : null,
    direct.qualityV2,
    direct.signals?.qualityV2,
    raw.qualityV2,
    raw.signals?.qualityV2,
    enrichment.qualityV2,
    enrichment.signals?.qualityV2,
    metadata.qualityV2,
    metadata.signals?.qualityV2,
    evidence.qualityV2,
    evidence.signals?.qualityV2,
  ].filter(Boolean);
}

/** Fonte canônica de ranking: Quality V2 sempre vence scores legados, inclusive quando vale zero. */
export function resolveLeadQualityV2FinalRankScore(value: unknown): number | null {
  for (const candidate of qualityCandidates(value)) {
    const score = scoreOrNull(asRecord(candidate).finalRankScore);
    if (score !== null) return score;
  }
  return null;
}

export function resolveCanonicalLeadScore(value: unknown, fallback?: () => number): number {
  const qualityV2Score = resolveLeadQualityV2FinalRankScore(value);
  if (qualityV2Score !== null) return qualityV2Score;

  const direct = asRecord(value);
  const evidence = asRecord(direct.evidenceJson);
  for (const candidate of [direct.opportunityScore, direct.score, direct.enrichmentScore, evidence.finalScore, evidence.score]) {
    const score = scoreOrNull(candidate);
    if (score !== null) return score;
  }
  return scoreOrNull(fallback?.()) ?? 0;
}

function isValidBrazilianCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[12])) return false;
  const second = calculateDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(digits[13]);
}

export function resolveStrongCnpjIdentity(value: unknown): string | null {
  const direct = asRecord(value);
  const evidence = asRecord(direct.evidenceJson);
  const metadata = asRecord(direct.metadataJson);
  const raw = asRecord(direct.rawJson);
  const candidates = [
    direct.cnpj,
    direct.cnpjDigits,
    direct.document,
    direct.company?.cnpj,
    evidence.cnpj,
    evidence.cnpjPublic?.cnpj,
    metadata.cnpj,
    metadata.cnpjPublic?.cnpj,
    raw.cnpj,
  ];
  for (const candidate of candidates) {
    const digits = String(candidate || '').replace(/\D/g, '');
    if (isValidBrazilianCnpj(digits)) return digits;
  }
  return null;
}
