export type LeadFingerprintInput = {
  companyId: string | number;
  normalizedPhone?: string | null;
  googlePlaceId?: string | null;
  websiteDomain?: string | null;
  normalizedName?: string | null;
  city?: string | null;
  state?: string | null;
};

function cleanFingerprintPart(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return normalized || null;
}

export function normalizeCommercialWebsiteDomain(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const hostname = new URL(withProtocol).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim() || null;
  }
}

export function buildLeadFingerprints(input: LeadFingerprintInput): string[] {
  const companyId = String(input.companyId || '').trim();
  if (!companyId) return [];

  const fingerprints: string[] = [];
  const normalizedPhone = cleanFingerprintPart(input.normalizedPhone);
  if (normalizedPhone) fingerprints.push(`phone:${companyId}:${normalizedPhone}`);

  const googlePlaceId = cleanFingerprintPart(input.googlePlaceId);
  if (googlePlaceId) fingerprints.push(`place:${companyId}:${googlePlaceId}`);

  const websiteDomain = cleanFingerprintPart(input.websiteDomain);
  if (websiteDomain) fingerprints.push(`domain:${companyId}:${websiteDomain}`);

  const normalizedName = cleanFingerprintPart(input.normalizedName);
  const city = cleanFingerprintPart(input.city);
  if (normalizedName && city) {
    const state = cleanFingerprintPart(input.state) || '';
    fingerprints.push(`name-city:${companyId}:${normalizedName}:${city}:${state}`);
  }

  return Array.from(new Set(fingerprints));
}
