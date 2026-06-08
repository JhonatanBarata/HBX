import {
  normalizeBusinessEmail,
  normalizePhoneDigits,
  normalizeWebsiteKey,
  RADAR_BAD_EMAIL_DOMAINS,
  RADAR_BAD_EMAIL_LOCAL_PARTS,
  RADAR_BAD_EMAIL_TLDS,
} from '../radar/shared/radar-core-shared';
import type {
  EmailHarvestStatus,
  HarvestEvidence,
  HarvestSourceMode,
  HarvestSourceRisk,
  HarvestValidationIssue,
  LeadHarvestEmailStatus,
} from './lead-harvest.types';

const SOURCE_MODES = new Set<HarvestSourceMode>(['production', 'local_lab', 'imported_lab']);
const LEAD_EMAIL_STATUSES = new Set<LeadHarvestEmailStatus>(['public_found', 'found_on_site', 'probable', 'missing', 'invalid']);
const EMAIL_STATUSES = new Set<EmailHarvestStatus>(['public_found', 'probable', 'invalid', 'blocked_domain']);
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;

export function compactHarvestText(value: unknown, maxLength = 500) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, maxLength) : '';
}

export function nullableHarvestText(value: unknown, maxLength = 500) {
  const text = compactHarvestText(value, maxLength);
  return text || null;
}

export function normalizeHarvestSourceMode(value: unknown, fallback: HarvestSourceMode = 'production'): HarvestSourceMode {
  const mode = String(value || '').trim().toLowerCase();
  return SOURCE_MODES.has(mode as HarvestSourceMode) ? mode as HarvestSourceMode : fallback;
}

export function normalizeHarvestSourceRisk(sourceMode: HarvestSourceMode, value?: unknown): HarvestSourceRisk {
  const risk = String(value || '').trim().toLowerCase();
  if (risk === 'official' || risk === 'experimental') return risk;
  return sourceMode === 'production' ? 'official' : 'experimental';
}

export function normalizeHarvestPersistedSourceMode(sourceMode: HarvestSourceMode, persistedImport?: boolean) {
  return persistedImport && sourceMode === 'local_lab' ? 'imported_lab' : sourceMode;
}

export function normalizeHarvestUrl(value: unknown) {
  const raw = compactHarvestText(value, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, parsed.pathname === '/' ? '' : '/');
  } catch {
    return '';
  }
}

export function normalizeHarvestWebsite(value: unknown) {
  const url = normalizeHarvestUrl(value);
  return url || null;
}

export function normalizeHarvestDomain(value: unknown) {
  const raw = compactHarvestText(value, 1000).toLowerCase();
  if (!raw) return '';
  const email = raw.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (email?.[1]) return email[1].replace(/^www\./, '');
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return normalizeWebsiteKey(raw).split('/')[0] || '';
  }
}

export function normalizeHarvestPhone(value: unknown) {
  const digits = normalizePhoneDigits(String(value || ''));
  return digits || null;
}

export function normalizeHarvestConfidence(value: unknown, fallback = 0) {
  const raw = typeof value === 'number' ? value : Number(String(value || '').replace(',', '.'));
  const parsed = Number.isFinite(raw) ? raw : fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function normalizeLeadHarvestEmailStatus(value: unknown, hasEmail: boolean): LeadHarvestEmailStatus {
  const status = String(value || '').trim().toLowerCase();
  if (LEAD_EMAIL_STATUSES.has(status as LeadHarvestEmailStatus)) return status as LeadHarvestEmailStatus;
  return hasEmail ? 'probable' : 'missing';
}

export function normalizeEmailHarvestStatus(value: unknown, hasEmail: boolean, blocked: boolean): EmailHarvestStatus {
  if (blocked) return 'blocked_domain';
  const status = String(value || '').trim().toLowerCase();
  if (EMAIL_STATUSES.has(status as EmailHarvestStatus)) return status as EmailHarvestStatus;
  return hasEmail ? 'public_found' : 'invalid';
}

export function extractRawHarvestEmail(value: unknown) {
  const raw = compactHarvestText(value, 1000).toLowerCase();
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.toLowerCase() || '';
}

export function getHarvestEmailBlockReason(value: unknown): HarvestValidationIssue | null {
  const email = extractRawHarvestEmail(value);
  if (!email) {
    return { code: 'invalid_email', field: 'email', message: 'E-mail ausente ou invalido.' };
  }
  const [local, domain] = email.split('@');
  const tld = String(domain || '').split('.').pop() || '';
  if (!local || !domain) {
    return { code: 'invalid_email', field: 'email', message: 'E-mail ausente ou invalido.' };
  }
  if (RADAR_BAD_EMAIL_DOMAINS.has(domain) || RADAR_BAD_EMAIL_TLDS.has(tld)) {
    return { code: 'blocked_domain', field: 'email', message: 'Dominio de e-mail bloqueado para importacao.' };
  }
  if (RADAR_BAD_EMAIL_LOCAL_PARTS.has(local)) {
    return { code: 'invalid_email', field: 'email', message: 'E-mail generico ou tecnico nao aceito.' };
  }
  return null;
}

export function normalizeHarvestEmail(value: unknown) {
  return normalizeBusinessEmail(String(value || '')) || '';
}

export function sanitizeHarvestObject(value: unknown, depth = 0): HarvestEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return {};
  const output: HarvestEvidence = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, any>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (rawValue == null) continue;
    if (Array.isArray(rawValue)) {
      output[key] = rawValue
        .slice(0, 50)
        .map((item) => (item && typeof item === 'object' ? sanitizeHarvestObject(item, depth + 1) : item))
        .filter((item) => item != null);
      continue;
    }
    if (typeof rawValue === 'object') {
      const nested = sanitizeHarvestObject(rawValue, depth + 1);
      if (Object.keys(nested).length) output[key] = nested;
      continue;
    }
    output[key] = typeof rawValue === 'string' ? rawValue.slice(0, 2000) : rawValue;
  }
  return output;
}

export function hasHarvestEvidence(value: unknown) {
  return Object.keys(sanitizeHarvestObject(value)).length > 0;
}

export function requiredHarvestIssue(code: HarvestValidationIssue['code'], field: string, message: string, externalId?: string | null) {
  return { code, field, message, externalId: externalId || null };
}
