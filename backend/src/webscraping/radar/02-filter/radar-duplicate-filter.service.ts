import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../webscraping.service';
import {
  resolveCanonicalLeadScore,
  resolveStrongCnpjIdentity,
} from '../../lead-quality-v2-resolver';

export type RadarDuplicateSortHost = {
  extractLeadQualityV2FromObject: (value: unknown) => { finalRankScore?: number | null } | null;
  buildOpportunityScore: (result: WebscrapingContactResult) => number;
};

function normalizeLookupValue(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(raw: string | null | undefined) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

function normalizeWebsiteKey(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function mergeCappedStrings(values: unknown[], max = 3, normalize: (value: string) => string = (value) => value.toLowerCase()) {
  const unique = new Map<string, string>();
  for (const raw of values.flatMap((value) => Array.isArray(value) ? value : [value])) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = normalize(value);
    if (key && !unique.has(key)) unique.set(key, value);
  }
  return Array.from(unique.values()).slice(0, max);
}

function mergeEvidence(leftValue: unknown, rightValue: unknown): Record<string, any> | null {
  const left = parseJsonRecord(leftValue);
  const right = parseJsonRecord(rightValue);
  if (!Object.keys(left).length && !Object.keys(right).length) return null;
  const merged: Record<string, any> = { ...left };
  const alternatives: Record<string, unknown[]> = {};
  for (const [key, incoming] of Object.entries(right)) {
    const current = merged[key];
    if (current === undefined || current === null || current === '') {
      merged[key] = incoming;
    } else if (Array.isArray(current) || Array.isArray(incoming)) {
      merged[key] = Array.from(new Set([
        ...(Array.isArray(current) ? current : [current]),
        ...(Array.isArray(incoming) ? incoming : [incoming]),
      ].map((item) => typeof item === 'string' ? item.trim() : item).filter(Boolean))).slice(0, 20);
    } else if (typeof current === 'object' && typeof incoming === 'object') {
      merged[key] = mergeEvidence(current, incoming);
    } else if (current !== incoming) {
      alternatives[key] = Array.from(new Set([current, incoming]));
    }
  }
  if (Object.keys(alternatives).length) {
    merged.evidenceAlternatives = {
      ...parseJsonRecord(merged.evidenceAlternatives),
      ...alternatives,
    };
  }
  return merged;
}

function mergeEvidenceValue(left: unknown, right: unknown): unknown {
  if (left === undefined || left === null || left === '') return right ?? null;
  if (right === undefined || right === null || right === '') return left;
  if (Array.isArray(left) || Array.isArray(right)) {
    const unique = new Map<string, unknown>();
    for (const value of [...(Array.isArray(left) ? left : [left]), ...(Array.isArray(right) ? right : [right])]) {
      const key = typeof value === 'string' ? value.trim().toLowerCase() : JSON.stringify(value);
      if (key && !unique.has(key)) unique.set(key, value);
    }
    return Array.from(unique.values()).slice(0, 20);
  }
  if (typeof left === 'object' && typeof right === 'object') return mergeEvidence(left, right);
  return left === right ? left : [left, right];
}

function buildWeakContactDedupeKeys(result: WebscrapingContactResult) {
  const name = normalizeLookupValue(result.name || '');
  const placeId = normalizeLookupValue(result.placeId || '');
  const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
  const website = normalizeWebsiteKey(result.website);
  const instagram = normalizeWebsiteKey(result.instagramUrl);
  const facebook = normalizeWebsiteKey(result.facebookUrl);
  const cityOrAddress = normalizeLookupValue(String(result.address || ''));
  return [
    placeId ? `place_id:${placeId}` : '',
    phone ? `phone:${phone}` : '',
    name && phone ? `name_phone:${name}:${phone}` : '',
    website ? `website:${website}` : '',
    instagram ? `instagram:${instagram}` : '',
    facebook ? `facebook:${facebook}` : '',
    name && cityOrAddress ? `name_location:${name}:${cityOrAddress}` : '',
  ].filter(Boolean);
}

function sameEntity(left: WebscrapingContactResult, right: WebscrapingContactResult) {
  const leftCnpj = resolveStrongCnpjIdentity(left);
  const rightCnpj = resolveStrongCnpjIdentity(right);
  if (leftCnpj && rightCnpj) return leftCnpj === rightCnpj;
  const leftKeys = new Set(buildWeakContactDedupeKeys(left));
  const sharedKeys = buildWeakContactDedupeKeys(right).filter((key) => leftKeys.has(key));
  const leftName = normalizeLookupValue(left.name || '');
  const rightName = normalizeLookupValue(right.name || '');
  if (!leftCnpj && !rightCnpj) {
    if (sharedKeys.some((key) => key.startsWith('place_id:'))) return true;
    if (!leftName || !rightName || leftName !== rightName) return false;
    // Rede/holding pode compartilhar site e redes entre filiais. Sem identidade
    // fiscal, exige telefone do mesmo nome ou nome+localização; URL isolada não cola.
    return sharedKeys.some((key) => key.startsWith('name_phone:') || key.startsWith('name_location:'));
  }

  // Um lado sem CNPJ só pode doar para a entidade fiscal quando o nome também
  // coincide. Telefone/domínio isolado pode ser compartilhado por grupo econômico.
  if (sharedKeys.some((key) => key.startsWith('place_id:'))) return true;
  if (!leftName || leftName !== rightName) return false;
  return sharedKeys.some((key) => key.startsWith('name_phone:') || key.startsWith('name_location:'));
}

function mergeSameEntity(left: WebscrapingContactResult, right: WebscrapingContactResult): WebscrapingContactResult {
  const merged = { ...left } as WebscrapingContactResult;
  const fillWhenMissing = [
    'placeId', 'name', 'address', 'website', 'instagramUrl', 'facebookUrl', 'email',
    'phone', 'phoneDigits', 'sourceUrl', 'googleMapsUrl', 'cnpj', 'cnae', 'razaoSocial',
  ];
  for (const field of fillWhenMissing) {
    if (!String((merged as any)[field] || '').trim() && String((right as any)[field] || '').trim()) {
      (merged as any)[field] = (right as any)[field];
    }
  }

  const emails = mergeCappedStrings([left.email, (left as any).emails, right.email, (right as any).emails]);
  const phones = mergeCappedStrings(
    [left.phone, left.phoneDigits, (left as any).phones, right.phone, right.phoneDigits, (right as any).phones],
    3,
    normalizePhoneDigits,
  );
  const websites = mergeCappedStrings([left.website, (left as any).websites, right.website, (right as any).websites], 3, normalizeWebsiteKey);
  const instagramUrls = mergeCappedStrings([left.instagramUrl, (left as any).instagramUrls, right.instagramUrl, (right as any).instagramUrls], 3, normalizeWebsiteKey);
  const facebookUrls = mergeCappedStrings([left.facebookUrl, (left as any).facebookUrls, right.facebookUrl, (right as any).facebookUrls], 3, normalizeWebsiteKey);
  if (emails.length) { merged.email = merged.email || emails[0]; (merged as any).emails = emails; }
  if (phones.length) {
    merged.phone = merged.phone || phones[0];
    merged.phoneDigits = normalizePhoneDigits(merged.phoneDigits || merged.phone || phones[0]);
    (merged as any).phones = phones;
  }
  if (websites.length) { merged.website = merged.website || websites[0]; (merged as any).websites = websites; }
  if (instagramUrls.length) { merged.instagramUrl = merged.instagramUrl || instagramUrls[0]; (merged as any).instagramUrls = instagramUrls; }
  if (facebookUrls.length) { merged.facebookUrl = merged.facebookUrl || facebookUrls[0]; (merged as any).facebookUrls = facebookUrls; }

  merged.evidenceJson = mergeEvidence(left.evidenceJson, right.evidenceJson);
  (merged as any).sourceEvidence = mergeEvidenceValue((left as any).sourceEvidence, (right as any).sourceEvidence);
  (merged as any).fieldEvidence = mergeEvidenceValue((left as any).fieldEvidence, (right as any).fieldEvidence);
  (merged as any).sources = mergeCappedStrings([(left as any).sources, left.source, (right as any).sources, right.source], 10);
  (merged as any).sourceEngines = mergeCappedStrings([(left as any).sourceEngines, left.sourceEngine, (right as any).sourceEngines, right.sourceEngine], 10);

  for (const scoreField of ['opportunityScore', 'score', 'enrichmentScore', 'rating', 'reviews']) {
    const leftScore = Number((left as any)[scoreField]);
    const rightScore = Number((right as any)[scoreField]);
    if (Number.isFinite(rightScore) && (!Number.isFinite(leftScore) || rightScore > leftScore)) {
      (merged as any)[scoreField] = (right as any)[scoreField];
    }
  }
  const leftQualityScore = resolveCanonicalLeadScore(left);
  const rightQualityScore = resolveCanonicalLeadScore(right);
  if (rightQualityScore > leftQualityScore && right.qualityV2) merged.qualityV2 = right.qualityV2;
  return merged;
}

@Injectable()
export class RadarDuplicateFilterService {
  buildContactDedupeKeys(result: WebscrapingContactResult) {
    const cnpj = resolveStrongCnpjIdentity(result);
    const weakKeys = buildWeakContactDedupeKeys(result);
    return cnpj
      ? [`cnpj:${cnpj}`, ...weakKeys.map((key) => `entity:${cnpj}:${key}`)]
      : weakKeys;
  }

  contactMatchesSeenKeys(result: WebscrapingContactResult, seenKeys: Set<string>) {
    return this.buildContactDedupeKeys(result).some((key) => seenKeys.has(key));
  }

  mergeDedupedContacts(results: WebscrapingContactResult[]) {
    const merged: WebscrapingContactResult[] = [];
    for (const result of results) {
      const existingIndex = merged.findIndex((candidate) => sameEntity(candidate, result));
      if (existingIndex < 0) merged.push({ ...result });
      else merged[existingIndex] = mergeSameEntity(merged[existingIndex], result);
    }
    return merged;
  }

  sortContacts(results: WebscrapingContactResult[], host: RadarDuplicateSortHost) {
    return [...results].sort((left, right) => {
      const leftQualityV2 = host.extractLeadQualityV2FromObject(left as any);
      const rightQualityV2 = host.extractLeadQualityV2FromObject(right as any);
      const leftScore = resolveCanonicalLeadScore(leftQualityV2 || left, () => host.buildOpportunityScore(left));
      const rightScore = resolveCanonicalLeadScore(rightQualityV2 || right, () => host.buildOpportunityScore(right));
      const scoreDelta = rightScore - leftScore;
      if (scoreDelta !== 0) return scoreDelta;
      const ratingDelta = (right.rating || 0) - (left.rating || 0);
      if (ratingDelta !== 0) return ratingDelta;
      const reviewsDelta = (right.reviews || 0) - (left.reviews || 0);
      if (reviewsDelta !== 0) return reviewsDelta;
      if (Number(Boolean(right.website)) !== Number(Boolean(left.website))) {
        return Number(Boolean(right.website)) - Number(Boolean(left.website));
      }
      return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
    });
  }
}
