import { Injectable } from '@nestjs/common';
import type { LeadQualityV2 } from '../../lead-quality-v2';
import type { LeadQualityResult } from '../shared/radar-core-shared';
import type { NormalizedRadarFilters, NormalizedSearchInput } from '../shared/radar-types';

export type RadarQualityGateResult = {
  deliverable: boolean;
  reason: string;
  qualityScore: number;
  missing: string[];
  blocksDelivery: boolean;
};

export type RadarQualityGateHost = {
  isGenericDirectoryName: (name: unknown, context?: { city?: unknown; segment?: unknown }) => boolean;
  nameConflictsWithRequestedSegment: (name: unknown, segment: unknown) => boolean;
  hasUsablePublicContactChannel: (candidate: Record<string, any>) => boolean;
  isBlockedLeadOfficialWebsite: (value: string | null | undefined) => boolean;
};

const MARKETPLACE_HOST_HINTS = [
  'catalogo',
  'getninjas',
  'ifood',
  'mercadolivre',
  'olx',
  'portal',
  'solutudo',
  'telelistas',
];

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(raw: string | null | undefined) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function isLikelyValidBrPhone(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  return digits.length === 10 || digits.length === 11;
}

function isLikelyWhatsapp(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  if (digits.length !== 11) return false;
  return Number(digits[2] || '0') >= 6;
}

function getWebsiteHost(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function inferWebsiteStatus(value: string | null | undefined) {
  const host = getWebsiteHost(value);
  if (!host) return 'none';
  if (['instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com'].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return 'social_only';
  }
  if (['linktr.ee', 'bio.link', 'wixsite.com', 'business.site', 'sites.google.com'].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return 'weak';
  }
  return 'present';
}

function clampScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function qualityV2HardBlocks(qualityV2?: LeadQualityV2 | null) {
  if (!qualityV2) return false;
  if (qualityV2.decision === 'protect') return true;
  return qualityV2.decision === 'discard'
    && ['protected_status', 'duplicate', 'generic_name', 'no_actionable_channel', 'invalid_phone'].includes(String(qualityV2.discardReason || ''));
}

@Injectable()
export class RadarQualityGateService {
  evaluate(input: {
    candidate: Record<string, any>;
    filters?: NormalizedSearchInput | NormalizedRadarFilters | null;
    quality?: LeadQualityResult | null;
    qualityV2?: LeadQualityV2 | null;
    host: RadarQualityGateHost;
    minQualityScore?: number | null;
  }): RadarQualityGateResult {
    const candidate = input.candidate || {};
    const filters = input.filters || {};
    const missing: string[] = [];
    const name = normalizeText(candidate.name);
    const requestedCity = normalizeText((filters as any).city);
    const requestedState = normalizeText((filters as any).state).toUpperCase();
    const candidateCity = normalizeText(candidate.city);
    const candidateState = normalizeText(candidate.state).toUpperCase();
    const requestedSegment = normalizeText((filters as any).segment);
    const phoneDigits = normalizePhoneDigits(candidate.phoneDigits || candidate.phone || candidate.phoneNormalized);
    const whatsappStatus = normalizeKey(candidate.whatsappStatus || candidate.whatsappCheckStatus || candidate.signals?.whatsappStatus);
    const website = normalizeText(candidate.website);
    const websiteStatus = normalizeKey(candidate.websiteStatus) || inferWebsiteStatus(website);
    const host = getWebsiteHost(candidate.sourceUrl || website);
    const qualityScore = clampScore(
      input.qualityV2?.finalRankScore
      ?? input.quality?.commercialScore
      ?? candidate.opportunityScore
      ?? candidate.score
      ?? candidate.enrichmentScore,
    );
    const minQualityScore = Math.max(0, Math.min(100, Number(input.minQualityScore ?? 25) || 0));

    if (!name) missing.push('name');
    if (!requestedCity && !candidateCity) missing.push('city');
    if (!requestedState && !candidateState) missing.push('state');

    if (!name) {
      return { deliverable: false, reason: 'Nome ausente.', qualityScore, missing, blocksDelivery: true };
    }
    if (input.host.isGenericDirectoryName(name, { city: candidateCity || requestedCity, segment: requestedSegment })) {
      return { deliverable: false, reason: 'Resultado generico ou diretorio.', qualityScore: 0, missing, blocksDelivery: true };
    }
    if (requestedSegment && input.host.nameConflictsWithRequestedSegment(name, requestedSegment)) {
      return { deliverable: false, reason: 'Nome indica outro segmento comercial.', qualityScore, missing, blocksDelivery: true };
    }
    if (candidateState && requestedState && candidateState !== requestedState) {
      const regionalStates = Array.isArray((filters as any).regionalCities)
        ? new Set((filters as any).regionalCities.map((item: any) => normalizeText(item?.state).toUpperCase()).filter(Boolean))
        : new Set<string>();
      if (!regionalStates.has(candidateState)) {
        return { deliverable: false, reason: 'UF fora do contexto da busca.', qualityScore, missing, blocksDelivery: true };
      }
    }

    const phoneValid = isLikelyValidBrPhone(phoneDigits);
    const whatsappValid = ['confirmed', 'available', 'valid', 'exists', 'true'].includes(whatsappStatus) || isLikelyWhatsapp(phoneDigits);
    const websiteValid = Boolean(
      website
      && websiteStatus === 'present'
      && !input.host.isBlockedLeadOfficialWebsite(website)
    );
    const hasMinimumContact = phoneValid || whatsappValid || websiteValid || input.host.hasUsablePublicContactChannel(candidate);
    if (!hasMinimumContact) {
      missing.push('minimum_contact');
      return { deliverable: false, reason: 'Contato minimo ausente.', qualityScore, missing, blocksDelivery: true };
    }

    if (host && MARKETPLACE_HOST_HINTS.some((hint) => host.includes(hint)) && !websiteValid && !phoneValid && !whatsappValid) {
      return { deliverable: false, reason: 'Marketplace ou listagem de terceiro sem contato proprio.', qualityScore, missing, blocksDelivery: true };
    }

    if (input.quality?.status === 'invalid' || input.quality?.status === 'duplicate' || input.quality?.status === 'generic_directory') {
      return {
        deliverable: false,
        reason: input.quality.reasons?.[0] || input.quality.status,
        qualityScore,
        missing,
        blocksDelivery: true,
      };
    }
    if (qualityV2HardBlocks(input.qualityV2)) {
      return {
        deliverable: false,
        reason: input.qualityV2?.protectionReason || input.qualityV2?.discardReason || input.qualityV2?.reasons?.[0] || 'Bloqueado por qualidade.',
        qualityScore,
        missing,
        blocksDelivery: true,
      };
    }
    if (qualityScore < minQualityScore) {
      return {
        deliverable: false,
        reason: 'Qualidade abaixo do minimo.',
        qualityScore,
        missing,
        blocksDelivery: true,
      };
    }

    return {
      deliverable: true,
      reason: 'Lead com qualidade minima para virar card.',
      qualityScore,
      missing,
      blocksDelivery: false,
    };
  }
}
