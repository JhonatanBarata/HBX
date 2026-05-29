import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../webscraping.service';

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
  return String(raw || '').replace(/\D/g, '');
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

@Injectable()
export class RadarDuplicateFilterService {
  buildContactDedupeKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const instagram = String(result.instagramUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const facebook = String(result.facebookUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const cityOrAddress = normalizeLookupValue(String(result.address || ''));
    return [
      phone ? `phone:${phone}` : '',
      name && phone ? `name_phone:${name}:${phone}` : '',
      website ? `website:${website}` : '',
      instagram ? `instagram:${instagram}` : '',
      facebook ? `facebook:${facebook}` : '',
      name && cityOrAddress ? `name_location:${name}:${cityOrAddress}` : '',
    ].filter(Boolean);
  }

  contactMatchesSeenKeys(result: WebscrapingContactResult, seenKeys: Set<string>) {
    return this.buildContactDedupeKeys(result).some((key) => seenKeys.has(key));
  }

  mergeDedupedContacts(results: WebscrapingContactResult[]) {
    const seenKeys = new Set<string>();
    const merged: WebscrapingContactResult[] = [];
    for (const result of results) {
      const keys = this.buildContactDedupeKeys(result);
      if (!keys.length || keys.some((key) => seenKeys.has(key))) continue;
      keys.forEach((key) => seenKeys.add(key));
      merged.push(result);
    }
    return merged;
  }

  sortContacts(results: WebscrapingContactResult[], host: RadarDuplicateSortHost) {
    return [...results].sort((left, right) => {
      const leftQualityV2 = host.extractLeadQualityV2FromObject(left as any);
      const rightQualityV2 = host.extractLeadQualityV2FromObject(right as any);
      const leftScore = leftQualityV2?.finalRankScore ?? left.opportunityScore ?? left.score ?? host.buildOpportunityScore(left);
      const rightScore = rightQualityV2?.finalRankScore ?? right.opportunityScore ?? right.score ?? host.buildOpportunityScore(right);
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
