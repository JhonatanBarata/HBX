import { Injectable } from '@nestjs/common';
import type { LeadQualityV2 } from '../../lead-quality-v2';
import { looksLikeNonBusinessName, isRealisticBrPhone } from '../shared/radar-core-shared';
import type { LeadQualityResult } from '../shared/radar-core-shared';
import type { NormalizedRadarFilters, NormalizedSearchInput } from '../shared/radar-types';

export type RadarQualityGateResult = {
  deliverable: boolean;
  reason: string;
  qualityScore: number;
  missing: string[];
  blocksDelivery: boolean;
  qualityDecision: 'deliver' | 'deliver_with_pending_enrichment' | 'review' | 'reject';
  hardBlockers: string[];
  positiveSignals: string[];
  weakSignals: string[];
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

function isLikelyEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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
  return qualityV2.decision === 'discard';
}

function arrayValues(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean) : [];
}

function sourceEvidenceCount(candidate: Record<string, any>) {
  const engines = Array.isArray(candidate.sourceEngines) ? candidate.sourceEngines : [];
  const sourceEvidence = candidate.sourceEvidence && typeof candidate.sourceEvidence === 'object'
    ? Object.keys(candidate.sourceEvidence)
    : [];
  return new Set([...engines, ...sourceEvidence, candidate.source, candidate.sourceEngine].filter(Boolean)).size;
}

function buildReject(input: {
  reason: string;
  qualityScore: number;
  missing: string[];
  hardBlockers: string[];
  positiveSignals: string[];
  weakSignals: string[];
}): RadarQualityGateResult {
  return {
    deliverable: false,
    reason: input.reason,
    qualityScore: input.qualityScore,
    missing: input.missing,
    blocksDelivery: true,
    qualityDecision: 'reject',
    hardBlockers: input.hardBlockers,
    positiveSignals: input.positiveSignals,
    weakSignals: input.weakSignals,
  };
}

function buildReview(input: {
  reason: string;
  qualityScore: number;
  missing: string[];
  hardBlockers: string[];
  positiveSignals: string[];
  weakSignals: string[];
}): RadarQualityGateResult {
  return {
    deliverable: false,
    reason: input.reason,
    qualityScore: input.qualityScore,
    missing: input.missing,
    blocksDelivery: true,
    qualityDecision: 'review',
    hardBlockers: input.hardBlockers,
    positiveSignals: input.positiveSignals,
    weakSignals: input.weakSignals,
  };
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
    const emailStatus = normalizeKey(candidate.emailStatus);
    const socialStatus = normalizeKey(candidate.socialStatus);
    const website = normalizeText(candidate.website);
    const websiteStatus = normalizeKey(candidate.websiteStatus) || inferWebsiteStatus(website);
    const host = getWebsiteHost(candidate.sourceUrl || website);
    const hardBlockers: string[] = [];
    const positiveSignals: string[] = [];
    const weakSignals: string[] = [];
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
      hardBlockers.push('missing_name');
      return buildReject({ reason: 'Nome ausente.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }
    if (input.host.isGenericDirectoryName(name, { city: candidateCity || requestedCity, segment: requestedSegment })) {
      hardBlockers.push('generic_directory');
      return buildReject({ reason: 'Resultado generico ou diretorio.', qualityScore: 0, missing, hardBlockers, positiveSignals, weakSignals });
    }
    if (looksLikeNonBusinessName(name)) {
      hardBlockers.push('non_business_name');
      return buildReject({ reason: 'Nome nao parece empresa (titulo de pagina/portal global/idioma estrangeiro).', qualityScore: 0, missing, hardBlockers, positiveSignals, weakSignals });
    }
    if (requestedSegment && input.host.nameConflictsWithRequestedSegment(name, requestedSegment)) {
      hardBlockers.push('segment_mismatch');
      return buildReject({ reason: 'Nome indica outro segmento comercial.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }
    if (candidateState && requestedState && candidateState !== requestedState) {
      const regionalStates = Array.isArray((filters as any).regionalCities)
        ? new Set((filters as any).regionalCities.map((item: any) => normalizeText(item?.state).toUpperCase()).filter(Boolean))
        : new Set<string>();
      if (!regionalStates.has(candidateState)) {
        hardBlockers.push('state_conflict');
        return buildReject({ reason: 'UF fora do contexto da busca.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
      }
    }

    const phoneValid = isRealisticBrPhone(phoneDigits);
    const whatsappValid = (['confirmed', 'available', 'valid', 'exists', 'true'].includes(whatsappStatus) && isRealisticBrPhone(phoneDigits))
      || (isLikelyWhatsapp(phoneDigits) && isRealisticBrPhone(phoneDigits));
    const websiteValid = Boolean(
      website
      && websiteStatus === 'present'
      && !input.host.isBlockedLeadOfficialWebsite(website)
    );
    const hasPhoneButInvalid = Boolean(phoneDigits) && !phoneValid;
    const requiredChannels = arrayValues((filters as any).requiredChannels || (filters as any).salesProfile?.requiredChannels);
    const phoneIsPrimaryChannel = requiredChannels.some((channel) => ['phone', 'telefone', 'whatsapp'].includes(channel));
    if (hasPhoneButInvalid && phoneIsPrimaryChannel) {
      hardBlockers.push('invalid_primary_phone');
      return buildReject({ reason: 'Telefone invalido para canal principal.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }

    if (phoneValid) positiveSignals.push('phone_valid');
    else if (hasPhoneButInvalid) weakSignals.push('phone_invalid');
    if (whatsappValid) positiveSignals.push(whatsappStatus === 'confirmed' ? 'whatsapp_confirmed' : 'whatsapp_probable');
    else if (whatsappStatus) weakSignals.push(`whatsapp_${whatsappStatus}`);
    if (websiteValid) positiveSignals.push('website_own');
    else if (websiteStatus === 'weak' || websiteStatus === 'social_only') weakSignals.push(`website_${websiteStatus}`);
    else if (!website) weakSignals.push('website_missing');
    if (['found', 'confirmed'].includes(socialStatus)) positiveSignals.push('social_confirmed');
    else if (socialStatus === 'partial') positiveSignals.push('social_partial');
    else if (socialStatus) weakSignals.push(`social_${socialStatus}`);
    if (isLikelyEmail(candidate.email)) positiveSignals.push(emailStatus === 'confirmed' ? 'email_confirmed' : 'email_found');
    else if (!candidate.email) weakSignals.push('email_missing');
    if (candidate.address && String(candidate.address).trim().length >= 8) positiveSignals.push('address_present');
    if (sourceEvidenceCount(candidate) >= 2) positiveSignals.push('multi_source_evidence');
    else weakSignals.push('single_source_evidence');
    if (Number(candidate.rating) > 0 || Number(candidate.reviews) > 0) positiveSignals.push('rating_reviews_present');
    if (name && (candidateCity || requestedCity) && requestedSegment) positiveSignals.push('name_city_segment_coherent');

    const hasMinimumContact = phoneValid || whatsappValid || websiteValid || input.host.hasUsablePublicContactChannel(candidate);
    if (!hasMinimumContact) {
      missing.push('minimum_contact');
      hardBlockers.push('missing_minimum_contact');
      return buildReject({ reason: 'Contato minimo ausente.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }

    if (candidate.manualReviewRequired === true || normalizeKey(candidate.qualityDecision) === 'review') {
      hardBlockers.push('manual_review_required');
      return buildReview({ reason: 'Lead exige revisao manual.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }

    if (host && MARKETPLACE_HOST_HINTS.some((hint) => host.includes(hint)) && !websiteValid && !phoneValid && !whatsappValid) {
      hardBlockers.push('marketplace_without_own_contact');
      return buildReject({ reason: 'Marketplace ou listagem de terceiro sem contato proprio.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }

    if (input.quality?.status === 'invalid' || input.quality?.status === 'duplicate' || input.quality?.status === 'generic_directory') {
      hardBlockers.push(`quality_${input.quality.status}`);
      return buildReject({
        reason: input.quality.reasons?.[0] || input.quality.status,
        qualityScore,
        missing,
        hardBlockers,
        positiveSignals,
        weakSignals,
      });
    }
    if (qualityV2HardBlocks(input.qualityV2)) {
      hardBlockers.push(`quality_v2_${input.qualityV2?.discardReason || input.qualityV2?.decision || 'hard_block'}`);
      return buildReject({
        reason: input.qualityV2?.protectionReason || input.qualityV2?.discardReason || input.qualityV2?.reasons?.[0] || 'Bloqueado por qualidade.',
        qualityScore,
        missing,
        hardBlockers,
        positiveSignals,
        weakSignals,
      });
    }
    if (qualityScore < minQualityScore) {
      hardBlockers.push('quality_below_minimum');
      return buildReject({ reason: 'Qualidade abaixo do minimo.', qualityScore, missing, hardBlockers, positiveSignals, weakSignals });
    }

    const hasPendingEnrichment = weakSignals.some((signal) => (
      signal.startsWith('social_')
      || signal.startsWith('website_')
      || signal.startsWith('email_')
      || signal.startsWith('whatsapp_')
      || signal === 'single_source_evidence'
    ));
    const qualityDecision = hasPendingEnrichment ? 'deliver_with_pending_enrichment' : 'deliver';
    return {
      deliverable: true,
      reason: qualityDecision === 'deliver_with_pending_enrichment'
        ? 'Lead entregavel com enriquecimento pendente.'
        : 'Lead com qualidade minima para virar card.',
      qualityScore,
      missing,
      blocksDelivery: false,
      qualityDecision,
      hardBlockers,
      positiveSignals,
      weakSignals,
    };
  }
}
