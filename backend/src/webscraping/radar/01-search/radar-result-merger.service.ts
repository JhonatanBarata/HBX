import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';

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
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

@Injectable()
export class RadarResultMergerService {
  buildKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const instagram = String(result.instagramUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const facebook = String(result.facebookUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const location = normalizeLookupValue(String(result.address || result.city || ''));
    return [
      phone ? `phone:${phone}` : '',
      name && phone ? `name_phone:${name}:${phone}` : '',
      website ? `website:${website}` : '',
      instagram ? `instagram:${instagram}` : '',
      facebook ? `facebook:${facebook}` : '',
      name && location ? `name_location:${name}:${location}` : '',
    ].filter(Boolean);
  }

  mergeSources(sources: Array<{ source: string; results: WebscrapingContactResult[] }>) {
    const seen = new Set<string>();
    const merged: WebscrapingContactResult[] = [];
    const counts: Record<string, number> = {};
    for (const source of sources) {
      counts[source.source] = 0;
      for (const result of source.results || []) {
        const keys = this.buildKeys(result);
        if (!keys.length || keys.some((key) => seen.has(key))) continue;
        keys.forEach((key) => seen.add(key));
        merged.push({
          ...result,
          source: result.source || source.source,
          sourceEngines: Array.from(new Set([
            ...(Array.isArray((result as any).sourceEngines) ? (result as any).sourceEngines : []),
            source.source,
          ].filter(Boolean))),
        } as any);
        counts[source.source] += 1;
      }
    }
    return { results: merged, counts };
  }

  shouldAppend(candidate: WebscrapingContactResult, existing: WebscrapingContactResult[], options: {
    requirePublicContact?: (candidate: WebscrapingContactResult) => boolean;
  } = {}) {
    if (options.requirePublicContact && !options.requirePublicContact(candidate)) return false;
    const seen = new Set(existing.flatMap((item) => this.buildKeys(item)));
    return !this.buildKeys(candidate).some((key) => seen.has(key));
  }
}
