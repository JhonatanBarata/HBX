import { Injectable } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../webscraping.service';
import type { NormalizedRadarFilters, NormalizedSearchInput, RadarChannelFilter, WebscrapingSearchRunItemStatus } from '../shared/radar-types';

export type RadarRunItemDedupSnapshot = {
  placeIds: Set<string>;
  phoneDigits: Set<string>;
  websiteKeys: Set<string>;
  compositeKeys: Set<string>;
};

export type RadarRunItemFilterHost = {
  isBlockedLeadOfficialWebsite: (value: string | null | undefined) => boolean;
  requiredChannelsForInput: (input?: NormalizedSearchInput | NormalizedRadarFilters | null) => RadarChannelFilter[];
  hasUsablePublicContactChannel: (candidate: Record<string, any>) => boolean;
  buildSyntheticRunPlaceId: (
    runId: string,
    result: Partial<WebscrapingContactResult>,
    index: number,
  ) => string;
  buildRunCompositeKey: (input: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
  }) => string;
};

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
export class RadarRunItemFilterService {
  classifyRunItem(
    result: Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null },
    dedup: RadarRunItemDedupSnapshot,
    fallback: { runId: string; index: number; city: string; state: string; segment: string },
    input: NormalizedSearchInput | NormalizedRadarFilters | undefined,
    host: RadarRunItemFilterHost,
  ) {
    const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
    const rawWebsite = String(result.website || '').trim();
    const websiteKey = rawWebsite && !host.isBlockedLeadOfficialWebsite(rawWebsite)
      ? normalizeWebsiteKey(rawWebsite)
      : '';
    const name = String(result.name || '').trim();
    const requiredChannels = host.requiredChannelsForInput(input as any);
    const hasRequiredSocial = Boolean(
      (requiredChannels.includes('instagram') && (result as any).instagramUrl)
      || (requiredChannels.includes('facebook') && (result as any).facebookUrl)
    );
    const hasUsablePublicContact = hasRequiredSocial || host.hasUsablePublicContactChannel(result as any);
    const placeId = String(result.placeId || '').trim()
      || host.buildSyntheticRunPlaceId(fallback.runId, result, fallback.index);
    const compositeKey = host.buildRunCompositeKey({
      name,
      city: fallback.city,
      state: fallback.state,
      segment: fallback.segment,
    });

    if (!name || !hasUsablePublicContact) {
      return {
        placeId,
        phoneDigits,
        websiteKey,
        status: 'invalid' as WebscrapingSearchRunItemStatus,
        duplicateReason: !name ? 'Nome ausente.' : 'Contato publico ausente.',
      };
    }
    if (placeId && dedup.placeIds.has(placeId)) {
      return { placeId, phoneDigits, websiteKey, status: 'duplicate' as const, duplicateReason: 'placeId repetido.' };
    }
    if (phoneDigits && dedup.phoneDigits.has(phoneDigits)) {
      return { placeId, phoneDigits, websiteKey, status: 'duplicate' as const, duplicateReason: 'Telefone repetido.' };
    }
    if (websiteKey && dedup.websiteKeys.has(websiteKey)) {
      return { placeId, phoneDigits, websiteKey, status: 'duplicate' as const, duplicateReason: 'Website repetido.' };
    }
    if (compositeKey !== '|||' && dedup.compositeKeys.has(compositeKey)) {
      return {
        placeId,
        phoneDigits,
        websiteKey,
        status: 'duplicate' as const,
        duplicateReason: 'Nome, cidade, estado e segmento repetidos.',
      };
    }

    dedup.placeIds.add(placeId);
    if (phoneDigits) dedup.phoneDigits.add(phoneDigits);
    if (websiteKey) dedup.websiteKeys.add(websiteKey);
    if (compositeKey !== '|||') dedup.compositeKeys.add(compositeKey);
    return { placeId, phoneDigits, websiteKey, status: 'found' as const, duplicateReason: null };
  }
}
