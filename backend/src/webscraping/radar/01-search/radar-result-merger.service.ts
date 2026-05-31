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

function normalizeWebsiteDomain(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
  }
}

function isWeakSocialStatus(value: unknown) {
  return ['', 'missing', 'error', 'candidate_review', 'weak', 'pending', 'searching', 'skipped'].includes(
    String(value || '').trim().toLowerCase(),
  );
}

function isOwnWebsite(value: unknown) {
  const domain = normalizeWebsiteDomain(String(value || ''));
  if (!domain) return false;
  return !/(^|\.)?(instagram|facebook|google|maps|linktr|bio\.link|ifood|tripadvisor|apontador|guiamais|catalogo|marketplace)/i.test(domain);
}

function firstPresent<T>(...values: T[]) {
  return values.find((value) => value != null && String(value).trim() !== '') ?? null;
}

@Injectable()
export class RadarResultMergerService {
  buildKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const domain = normalizeWebsiteDomain(result.website);
    const instagram = String(result.instagramUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const facebook = String(result.facebookUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    const city = normalizeLookupValue(String((result as any).city || ''));
    const location = normalizeLookupValue(String(result.address || result.city || ''));
    return [
      result.placeId ? `place:${String(result.placeId).trim()}` : '',
      phone ? `phone:${phone}` : '',
      name && phone ? `name_phone:${name}:${phone}` : '',
      website ? `website:${website}` : '',
      domain ? `domain:${domain}` : '',
      instagram ? `instagram:${instagram}` : '',
      facebook ? `facebook:${facebook}` : '',
      name && city ? `name_city:${name}:${city}` : '',
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
        if (!keys.length) continue;
        const existing = merged.find((item) => this.buildKeys(item).some((key) => keys.includes(key)));
        if (existing) {
          this.mergeInto(existing, result, source.source);
          this.buildKeys(existing).forEach((key) => seen.add(key));
          continue;
        }
        keys.forEach((key) => seen.add(key));
        merged.push(this.withSource(result, source.source));
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

  private withSource(result: WebscrapingContactResult, source: string): WebscrapingContactResult {
    return {
      ...result,
      source: result.source || source,
      sourceEngines: Array.from(new Set([
        ...(Array.isArray((result as any).sourceEngines) ? (result as any).sourceEngines : []),
        source,
      ].filter(Boolean))),
      sourceEvidence: {
        ...((result as any).sourceEvidence || {}),
        [source]: {
          placeId: result.placeId || null,
          phoneDigits: result.phoneDigits || null,
          website: result.website || null,
          instagramUrl: result.instagramUrl || null,
          facebookUrl: result.facebookUrl || null,
          email: result.email || null,
          whatsappStatus: (result as any).whatsappStatus || (result as any).whatsappCheckStatus || null,
        },
      },
    } as any;
  }

  private mergeInto(target: WebscrapingContactResult, incoming: WebscrapingContactResult, source: string) {
    const merged = this.withSource(incoming, source) as any;
    const targetAny = target as any;
    target.phone = firstPresent(target.phone, incoming.phone) || '';
    target.phoneDigits = normalizePhoneDigits(firstPresent(target.phoneDigits, incoming.phoneDigits, incoming.phone) as string) || target.phoneDigits;
    if (!target.website || (!isOwnWebsite(target.website) && isOwnWebsite(incoming.website))) {
      target.website = incoming.website || target.website;
    }
    target.instagramUrl = firstPresent(target.instagramUrl, incoming.instagramUrl) as any;
    target.facebookUrl = firstPresent(target.facebookUrl, incoming.facebookUrl) as any;
    target.email = firstPresent((target as any).email, (incoming as any).email) as any;
    if ((!targetAny.whatsappStatus || targetAny.whatsappStatus !== 'confirmed') && (incoming as any).whatsappStatus) {
      targetAny.whatsappStatus = (incoming as any).whatsappStatus;
    }
    if (isWeakSocialStatus(targetAny.socialStatus) && !isWeakSocialStatus((incoming as any).socialStatus)) {
      targetAny.socialStatus = (incoming as any).socialStatus;
    }
    target.source = target.source || incoming.source || source;
    targetAny.sourceEngines = Array.from(new Set([
      ...(Array.isArray(targetAny.sourceEngines) ? targetAny.sourceEngines : []),
      ...(Array.isArray(merged.sourceEngines) ? merged.sourceEngines : []),
      source,
    ].filter(Boolean)));
    targetAny.sourceEvidence = {
      ...(targetAny.sourceEvidence || {}),
      ...(merged.sourceEvidence || {}),
    };
  }
}
