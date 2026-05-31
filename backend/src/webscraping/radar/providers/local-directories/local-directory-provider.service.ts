import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';
import type { LocalDirectoryProviderResult, LocalDirectoryRecord, LocalDirectorySearchInput } from './local-directory-types';

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeWebsite(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (/(^|\.)?(guiamais|apontador|telelistas|solutudo|catalogo|facebook|instagram|google|maps)\./i.test(host)) return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function matchesLocation(record: LocalDirectoryRecord, city: unknown, state: unknown) {
  const requestedCity = normalizeText(city);
  const requestedState = String(state || '').trim().toUpperCase();
  const recordCity = normalizeText(record.city);
  const recordState = String(record.state || '').trim().toUpperCase();
  if (requestedCity && recordCity && requestedCity !== recordCity) return false;
  if (requestedState && recordState && requestedState !== recordState) return false;
  return true;
}

function matchesSegment(record: LocalDirectoryRecord, segment: unknown) {
  const requested = normalizeText(segment);
  if (!requested) return true;
  const haystack = normalizeText([record.name, record.segment, record.description].filter(Boolean).join(' '));
  const tokens = requested.split(/\s+/).filter((token) => token.length >= 4);
  const variants = tokens.flatMap((token) => (token.endsWith('s') ? [token, token.slice(0, -1)] : [token, `${token}s`]));
  return !variants.length || variants.some((token) => token.length >= 4 && haystack.includes(token));
}

@Injectable()
export class LocalDirectoryProviderService {
  async search(input: LocalDirectorySearchInput): Promise<LocalDirectoryProviderResult> {
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) {
      return {
        status: 'skipped',
        retryable: false,
        reason: 'local_directory_provider_sem_base_configurada',
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        results: [],
      };
    }

    const limit = Math.max(1, Math.min(100, Number(input.limit || 20) || 20));
    const accepted: WebscrapingContactResult[] = [];
    let rejectedCount = 0;
    for (const record of records) {
      if (!matchesLocation(record, input.normalized.city, input.normalized.state) || !matchesSegment(record, input.normalized.segment)) {
        rejectedCount += 1;
        continue;
      }
      const mapped = this.toContactResult(record, input.normalized);
      if (!mapped) {
        rejectedCount += 1;
        continue;
      }
      accepted.push(mapped);
      if (accepted.length >= limit) break;
    }

    return {
      status: 'completed',
      retryable: false,
      reason: accepted.length ? 'local_directory_records_normalizados' : 'local_directory_sem_registros_compativeis',
      foundCount: records.length,
      acceptedCount: accepted.length,
      rejectedCount,
      results: accepted,
    };
  }

  toContactResult(record: LocalDirectoryRecord, normalized: { city?: string | null; state?: string | null; segment?: string | null }): WebscrapingContactResult | null {
    const name = String(record.name || '').trim();
    if (!name) return null;
    const phoneDigits = normalizePhoneDigits(record.phone);
    const ownWebsite = normalizeWebsite(record.website);
    return {
      placeId: `local_directory:${normalizeText(record.sourceName || 'directory')}:${normalizeText(name)}:${phoneDigits || normalizeText(record.city)}`,
      name,
      phone: record.phone || '',
      phoneDigits,
      rating: null,
      reviews: null,
      address: record.address || null,
      website: ownWebsite,
      email: record.email || null,
      city: record.city || normalized.city || null,
      state: record.state || normalized.state || null,
      segment: normalized.segment || record.segment || null,
      source: 'local_directory',
      sourceEngine: 'local_directory',
      sourceUrl: record.directoryUrl || null,
      directoryConfidence: 42,
      socialStatus: record.instagramUrl || record.facebookUrl ? 'candidate_review' : undefined,
      evidenceJson: {
        localDirectory: {
          sourceName: record.sourceName || null,
          directoryUrl: record.directoryUrl || null,
          confidence: 42,
          officialWebsiteCandidate: ownWebsite,
          socialCandidates: {
            instagramUrl: record.instagramUrl || null,
            facebookUrl: record.facebookUrl || null,
          },
          raw: record.raw || null,
        },
      },
    } as any;
  }
}
