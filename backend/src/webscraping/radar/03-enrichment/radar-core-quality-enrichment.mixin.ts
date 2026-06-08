// @ts-nocheck
import {
  hasPoorRadarWebEnrichmentFields,
  scoreRadarWebEnrichmentCandidate,
} from './radar-web-enrichment-priority';
import { RadarWebEnrichmentService } from './radar-web-enrichment.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  randomUUID,
  XLSX,
  probeWebscrapingRuntime,
  buildHbxPresentationEmailDraft,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  isHbxEngineLocalhostUrl,
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  resolveCommercialPlanKeyForCapabilities,
  buildRadarLeadEnrichment,
  RADAR_LEAD_ENRICHMENT_VERSION,
  calculateLeadQualityV2,
  resolveRadarVisibilityFromQualityV2,
  PLACES_NEW_TEXT_SEARCH_URL,
  PLACES_NEW_DETAILS_URL,
  PLACES_TEXT_SEARCH_URL,
  PLACES_DETAILS_URL,
  MAX_QUANTITY,
  HBX_PJ_MAX_QUANTITY,
  HBX_PEOPLE_MAX_QUANTITY,
  DEFAULT_HBX_SCRAPING_ENGINE_URL,
  GLOBAL_CACHE_TTL_HOURS,
  RECENT_HISTORY_LIMIT,
  IBGE_CITIES_URL,
  CITY_CACHE_TTL_MS,
  MASS_DATA_INTERNAL_SEGMENTS,
  ACRE_CITIES_FALLBACK,
  AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK,
  AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
  AUTONOMOUS_MASS_DATA_MAX_TASKS,
  DEFAULT_MASS_DATA_ENGINE_URLS,
  TURBO_OPERATIONAL_CONFIG_KEY,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  GENERIC_DIRECTORY_NAMES,
  GENERIC_DIRECTORY_PREFIXES,
  GENERIC_DIRECTORY_CONTAINS,
  GENERIC_CATEGORY_HEADS,
  VERTICAL_TOKEN_GROUPS,
  GooglePlacesApiError,
  HbxBatchError,
  normalizePhoneDigits,
  isLikelyValidBrPhone,
  isLikelyWhatsapp,
  toNumberOrNull,
  clampQuantity,
  normalizeLookupValue,
  normalizeWebsiteKey,
  RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS,
  normalizeSocialProfileKey,
  looksLikeThirdPartySocialProfile,
  RADAR_SOCIAL_BLOCKED_PATH_PARTS,
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  socialHandleFromUrl,
  cityInitialsKey,
  socialTokenVariants,
  socialCategoryTokenVariants,
  hasTrustedEngineSocialSignal,
  socialProfileLooksCompatibleWithLead,
  getWebsiteHost,
  websiteHostLooksCompatibleWithLead,
  inferWebsiteStatus,
  RADAR_BAD_EMAIL_LOCAL_PARTS,
  RADAR_BAD_EMAIL_DOMAINS,
  RADAR_BAD_EMAIL_TLDS,
  normalizeBusinessEmail,
  parseJsonArray,
  parseJsonObject,
  isFallbackEligible,
  coerceBoolean,
  normalizeEngine,
  normalizeEnginePurpose,
  isAutomaticEnginePurpose,
  normalizeTargetType,
  parsePositiveInteger,
  maxQuantityFor,
  safeInteger,
  clampInteger,
  parsePositiveIntegerEnv,
  minutesAgo,
  formatCityWithState,
  buildRadarStageSnapshot,
} from '../radar-core-method-imports';

import type {
  AutonomousMassDataCandidate,
  AutonomousMassDataStrategyMode,
  AutonomousMassDataWork,
  AutonomousMassDataWorkReason,
  ExternalRuntimeStatus,
  GlobalCacheRow,
  HbxBatchStatus,
  HbxDeliveryClassification,
  HbxDeliveryProduct,
  HbxEngineLease,
  HbxEnginePurpose,
  HbxEngineSearchOutput,
  HbxRuntimeDiagnostic,
  HistoryPlaceColumnSupport,
  HbxTargetType,
  HbxVisibilityTier,
  LeadQualityResult,
  LeadQualityStatus,
  LeadQualityV2,
  LeadQualityV2SalesProfile,
  MasterMassDataCampaignInput,
  NativeRuntimeDiagnostic,
  NormalizedRadarFilters,
  NormalizedSearchInput,
  NormalizeSearchInputOptions,
  PlaceDetails,
  RadarCampaignInput,
  RadarChannelFilter,
  RadarChannelMatchMode,
  RadarFiltersInput,
  RadarLeadEventType,
  RadarLeadStatus,
  RadarOperationalState,
  RadarOpportunityLevel,
  RadarSearchRunMetrics,
  RadarSearchRunMetricsPatch,
  RadarWebsiteStatus,
  RadarWhatsappCheckMode,
  RadarWhatsappCheckStatus,
  RegionalCity,
  RuntimeStatus,
  SearchContactsInput,
  SearchExecutionContext,
  SearchExecutionOptions,
  SearchHistoryRow,
  SearchPlacesCandidate,
  SearchRunStatus,
  SearchSource,
  UsageEventType,
  UsageExecutionMeta,
  WebscrapingContactResult,
  WebscrapingEngine,
  WebscrapingHistorySummary,
  WebscrapingOperationalConfigInput,
  WebscrapingRuntimeDiagnostic,
  WebscrapingRuntimeResponse,
  WebscrapingSearchFilters,
  WebscrapingSearchResponse,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunResponse,
  WebscrapingSearchRunStatus,
} from '../radar-core-method-imports';

export class RadarCoreQualityEnrichmentMixin {
  [key: string]: any;
  private normalizeQualityText(value: unknown) {
    return String(value || '').trim();
  }

  private parseMaybeJsonObject(value: unknown): Record<string, any> {
    return this.getRadarSharedNormalizer().parseMaybeJsonObject(value);
  }

  private normalizeLeadQuality(value: unknown): LeadQualityResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, any>;
    const status = String(raw.status || '').trim() as LeadQualityStatus;
    if (!['approved', 'segment_mismatch', 'weak_contact', 'generic_directory', 'invalid', 'duplicate'].includes(status)) return null;
    return {
      status,
      billable: raw.billable !== false && status === 'approved',
      segmentMatchScore: safeInteger(raw.segmentMatchScore),
      contactQualityScore: safeInteger(raw.contactQualityScore),
      commercialScore: safeInteger(raw.commercialScore),
      reasons: Array.isArray(raw.reasons)
        ? raw.reasons.map((reason) => String(reason || '').trim()).filter(Boolean)
        : [],
    };
  }

  private extractLeadQualityFromObject(value: unknown): LeadQualityResult | null {
    const direct = this.parseMaybeJsonObject(value);
    const candidates = [
      direct?.quality,
      direct?.signals?.quality,
      this.parseMaybeJsonObject(direct?.rawJson)?.quality,
      this.parseMaybeJsonObject(direct?.rawPayload)?.quality,
      this.parseMaybeJsonObject(direct?.enrichmentJson)?.quality,
      this.parseMaybeJsonObject(direct?.enrichmentJson)?.signals?.quality,
    ];
    for (const candidate of candidates) {
      const quality = this.normalizeLeadQuality(candidate);
      if (quality) return quality;
    }
    return null;
  }

  private collectQualityEvidence(candidate: Record<string, any>) {
    const rawJson = this.parseMaybeJsonObject(candidate.rawJson);
    const rawPayload = this.parseMaybeJsonObject(candidate.rawPayload);
    const enrichmentJson = this.parseMaybeJsonObject(candidate.enrichmentJson);
    const fields = [
      candidate.name,
      candidate.website,
      candidate.address,
      candidate.source,
      candidate.opportunityReason,
      candidate.businessCategory,
      candidate.category,
      candidate.types,
      candidate.snippet,
      candidate.description,
      rawJson,
      rawPayload,
      enrichmentJson,
    ];
    return fields
      .map((field) => {
        if (!field) return '';
        if (Array.isArray(field)) return field.join(' ');
        if (typeof field === 'object') return JSON.stringify(field);
        return String(field);
      })
      .filter(Boolean)
      .join(' ');
  }

  private extractSegmentTokens(segment: string) {
    const stopwords = new Set(SEGMENT_STOPWORDS.map((word) => normalizeLookupValue(word)));
    const tokens = normalizeLookupValue(segment)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopwords.has(token));
    const expanded = tokens.flatMap((token) => {
      const variants = [token];
      if (token.endsWith('es') && token.length > 4) variants.push(token.slice(0, -2));
      if (token.endsWith('s') && token.length > 4) variants.push(token.slice(0, -1));
      return variants.filter((item) => item.length >= 3 && !stopwords.has(item));
    });
    return Array.from(new Set(expanded));
  }

  private buildSegmentAliases(segment: string) {
    const normalizedSegment = normalizeLookupValue(segment);
    const tokens = this.extractSegmentTokens(segment);
    const aliases = new Set<string>(tokens);
    for (const [key, values] of Object.entries(SEGMENT_ALIASES)) {
      const normalizedKey = normalizeLookupValue(key);
      if (normalizedSegment.includes(normalizedKey) || values.some((value) => normalizedSegment.includes(normalizeLookupValue(value)))) {
        values.forEach((value) => aliases.add(normalizeLookupValue(value)));
        aliases.add(normalizedKey);
      }
    }
    return Array.from(aliases).filter(Boolean);
  }

  private qualityKey(value: unknown) {
    return normalizeLookupValue(String(value || ''))
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private segmentNameVariants(segment: unknown) {
    const key = this.qualityKey(segment);
    if (!key) return [];
    const variants = new Set<string>([key]);
    const [first, ...rest] = key.split(' ');
    if (rest.length && !first.endsWith('s')) variants.add([`${first}s`, ...rest].join(' '));
    if (key.endsWith('s') && key.length > 4) variants.add(key.slice(0, -1));
    else variants.add(`${key}s`);
    return Array.from(variants).filter(Boolean);
  }

  private isCategoryLocationTitle(nameKey: string, cityKey = '', segment?: unknown) {
    const heads = new Set([...GENERIC_CATEGORY_HEADS.map((item) => this.qualityKey(item)), ...this.segmentNameVariants(segment)]);
    for (const head of heads) {
      if (!head) continue;
      if (nameKey === head) return true;
      if (nameKey.startsWith(`${head} em `)) return true;
      if (cityKey && nameKey === `${head} em ${cityKey}`) return true;
      if (cityKey && head.endsWith('s') && nameKey === `${head} ${cityKey}`) return true;
      if (cityKey && nameKey.startsWith(`${head} em ${cityKey} `)) return true;
    }
    return /^(10|20|30|40|50)\s+melhores\s+/.test(nameKey);
  }

  private nameConflictsWithRequestedSegment(name: unknown, segment: unknown) {
    const nameKey = this.qualityKey(name);
    const segmentKey = this.qualityKey(segment);
    if (!nameKey || !segmentKey) return false;
    const requestedGroups = Object.entries(VERTICAL_TOKEN_GROUPS)
      .filter(([, tokens]) => tokens.some((token) => segmentKey.includes(this.qualityKey(token))))
      .map(([group]) => group);
    const nameGroups = Object.entries(VERTICAL_TOKEN_GROUPS)
      .filter(([, tokens]) => tokens.some((token) => new RegExp(`\\b${this.qualityKey(token)}\\b`).test(nameKey)))
      .map(([group]) => group);
    return Boolean(nameGroups.length && requestedGroups.length && nameGroups.every((group) => !requestedGroups.includes(group)));
  }

  private isGenericDirectoryName(name: unknown, context?: { city?: unknown; segment?: unknown }) {
    const raw = String(name || '');
    if (/&[#a-zA-Z0-9]+;/.test(raw)) return true;
    const normalized = this.qualityKey(raw);
    if (!normalized) return false;
    if (/^([a-z])\1{2,}$/.test(normalized)) return true;
    const cityKey = this.qualityKey(context?.city);
    const segmentVariants = this.segmentNameVariants(context?.segment);
    const genericNames = [
      ...GENERIC_DIRECTORY_NAMES.map((item) => this.qualityKey(item)),
      ...segmentVariants,
      ...segmentVariants.map((segment) => cityKey ? `${segment} em ${cityKey}` : '').filter(Boolean),
    ];
    if (genericNames.some((generic) => normalized === generic)) return true;
    if (GENERIC_DIRECTORY_CONTAINS.some((generic) => normalized.includes(this.qualityKey(generic)))) {
      return true;
    }
    if (this.isCategoryLocationTitle(normalized, cityKey, context?.segment)) return true;
    if (GENERIC_DIRECTORY_PREFIXES.some((prefix) => normalized.startsWith(this.qualityKey(prefix)))) return true;
    return ['lista telefonica', 'lista telefonica', 'guia comercial', 'guia telefone', 'lista de empresas', 'anuncie aqui']
      .some((generic) => normalized.startsWith(`${generic} `) || normalized.includes(` ${generic} `));
  }

  private scoreSegmentMatch(candidate: Record<string, any>, requestedSegment: string) {
    const segmentTokens = this.extractSegmentTokens(requestedSegment);
    const aliases = this.buildSegmentAliases(requestedSegment);
    if (!segmentTokens.length && !aliases.length) return { score: 80, reasons: ['Segmento amplo sem tokens especificos.'] };

    const name = normalizeLookupValue(String(candidate.name || ''));
    const categoryText = normalizeLookupValue([
      candidate.businessCategory,
      candidate.category,
      Array.isArray(candidate.types) ? candidate.types.join(' ') : candidate.types,
    ].filter(Boolean).join(' '));
    const snippetText = normalizeLookupValue([
      candidate.snippet,
      candidate.description,
      candidate.address,
      candidate.opportunityReason,
      this.parseMaybeJsonObject(candidate.enrichmentJson),
      this.parseMaybeJsonObject(candidate.rawJson),
      this.parseMaybeJsonObject(candidate.rawPayload),
    ].map((part) => typeof part === 'object' ? JSON.stringify(part) : String(part || '')).join(' '));
    const weakText = normalizeLookupValue([candidate.website, candidate.source].filter(Boolean).join(' '));
    const reasons: string[] = [];
    let score = 0;

    if (aliases.some((alias) => alias && name.includes(alias))) {
      score = Math.max(score, 85);
      reasons.push('Nome contem evidencia forte do segmento.');
    }
    if (segmentTokens.some((token) => name.includes(token))) {
      score = Math.max(score, 72);
      reasons.push('Nome contem token do segmento.');
    }
    if (aliases.some((alias) => alias && categoryText.includes(alias))) {
      score = Math.max(score, 80);
      reasons.push('Categoria contem evidencia forte do segmento.');
    }
    if (aliases.some((alias) => alias && snippetText.includes(alias))) {
      score = Math.max(score, 76);
      reasons.push('Descricao/snippet contem evidencia do segmento.');
    }
    if (segmentTokens.some((token) => categoryText.includes(token) || snippetText.includes(token))) {
      score = Math.max(score, 70);
      reasons.push('Categoria ou descricao contem token do segmento.');
    }
    if (segmentTokens.some((token) => weakText.includes(token)) || aliases.some((alias) => alias && weakText.includes(alias))) {
      score = Math.max(score, 55);
      reasons.push('Website/source contem evidencia fraca do segmento.');
    }
    const hasHygieneBlock = this.isGenericDirectoryName(candidate.name, { city: candidate.city, segment: requestedSegment })
      || this.nameConflictsWithRequestedSegment(candidate.name, requestedSegment);
    if (!score && safeInteger(candidate.score) >= 50 && !hasHygieneBlock) {
      score = 60;
      reasons.push('Motor HBX classificou o card como aderente ao segmento.');
    }
    if (!score) {
      score = 25;
      reasons.push('Sem evidencia suficiente de aderencia ao segmento.');
    }
    return { score: Math.min(score, 100), reasons };
  }

  private evaluateLeadQuality(
    candidate: Partial<WebscrapingContactResult> & Record<string, any>,
    input: {
      requestedSegment: string;
      requestedCity?: string | null;
      requestedState?: string | null;
      targetType?: HbxTargetType;
      requiredChannels?: string[] | null;
      channelMatchMode?: RadarChannelMatchMode | string | null;
    },
  ): LeadQualityResult {
    const name = this.normalizeQualityText(candidate.name);
    const phoneDigits = normalizePhoneDigits(candidate.phoneDigits || candidate.phone);
    const hasUsablePublicContact = this.hasUsablePublicContactChannel(candidate);
    const reasons: string[] = [];

    if (!name) {
      return {
        status: 'invalid',
        billable: false,
        segmentMatchScore: 0,
        contactQualityScore: 0,
        commercialScore: 0,
        reasons: ['Nome ausente.'],
      };
    }
    if (this.isGenericDirectoryName(name, { city: input.requestedCity, segment: input.requestedSegment })) {
      return {
        status: 'generic_directory',
        billable: false,
        segmentMatchScore: 0,
        contactQualityScore: 0,
        commercialScore: 0,
        reasons: ['Nome generico ou resultado de lista telefonica.'],
      };
    }
    if (input.targetType === 'pj' && this.nameConflictsWithRequestedSegment(name, input.requestedSegment)) {
      return {
        status: 'segment_mismatch',
        billable: false,
        segmentMatchScore: 0,
        contactQualityScore: 0,
        commercialScore: 0,
        reasons: ['Nome indica outro segmento comercial.'],
      };
    }
    if (!hasUsablePublicContact) {
      return {
        status: 'invalid',
        billable: false,
        segmentMatchScore: 0,
        contactQualityScore: 0,
        commercialScore: 0,
        reasons: ['Contato publico ausente.'],
      };
    }
    if (phoneDigits && !isLikelyValidBrPhone(phoneDigits) && !hasUsablePublicContact) {
      return {
        status: 'weak_contact',
        billable: false,
        segmentMatchScore: 0,
        contactQualityScore: 20,
        commercialScore: 0,
        reasons: ['Telefone invalido ou fraco.'],
      };
    }

    const segment = this.scoreSegmentMatch(candidate, input.requestedSegment);
    const segmentMatchScore = input.targetType === 'pj' ? segment.score : Math.max(segment.score, 65);
    reasons.push(...segment.reasons);
    let contactQualityScore = 0;
    contactQualityScore += isLikelyValidBrPhone(phoneDigits) ? 50 : hasUsablePublicContact ? 55 : 0;
    if (isLikelyWhatsapp(phoneDigits)) contactQualityScore += 20;
    const websiteStatus = inferWebsiteStatus(candidate.website);
    const hasSocial = Boolean(this.normalizeQualityText(candidate.instagramUrl || candidate.facebookUrl));
    if (websiteStatus !== 'none' || hasSocial) contactQualityScore += 15;
    if (!phoneDigits && hasUsablePublicContact) reasons.push('Canal publico encontrado sem telefone.');
    if ((Number(candidate.rating || 0) >= 4.2 && safeInteger(candidate.reviews) >= 10) || safeInteger(candidate.reviews) >= 20) {
      contactQualityScore += 10;
    }
    contactQualityScore = Math.min(contactQualityScore, 100);
    const baseOpportunityScore = safeInteger(candidate.opportunityScore ?? candidate.score);
    const commercialScore = Math.round(
      segmentMatchScore * 0.45 +
      contactQualityScore * 0.35 +
      baseOpportunityScore * 0.20,
    );

    let status: LeadQualityStatus = 'approved';
    if (input.targetType === 'pj' && segmentMatchScore < 55) status = 'segment_mismatch';
    else if (contactQualityScore < 50) status = 'weak_contact';
    else if (commercialScore < 60) status = segment.score < 55 ? 'segment_mismatch' : 'weak_contact';

    if (status !== 'approved') {
      if (status === 'segment_mismatch') reasons.push('Lead sem aderencia minima ao segmento solicitado.');
      if (status === 'weak_contact') reasons.push('Contato insuficiente para entrega billable.');
    }

    return {
      status,
      billable: status === 'approved',
      segmentMatchScore,
      contactQualityScore,
      commercialScore: status === 'approved' ? Math.min(commercialScore, 100) : Math.max(0, Math.min(commercialScore, 59)),
      reasons: Array.from(new Set(reasons.filter(Boolean))),
    };
  }

  private evaluateResultQualityForInput(candidate: Record<string, any>, input: NormalizedSearchInput | NormalizedRadarFilters) {
    return this.evaluateLeadQuality(candidate as any, {
      requestedSegment: String(input.segment || ''),
      requestedCity: input.city || null,
      requestedState: input.state || null,
      targetType: normalizeTargetType((input as any).targetType),
      requiredChannels: null,
      channelMatchMode: null,
    });
  }

  private isApprovedLeadQuality(quality: LeadQualityResult | null | undefined) {
    return quality?.status === 'approved' && quality.billable !== false;
  }

  private isListLeadQualityDeliverable(quality: LeadQualityResult | null | undefined) {
    if (!quality) return true;
    return !['invalid', 'duplicate'].includes(quality.status);
  }

  private buildQualityReason(
    quality: LeadQualityResult | null | undefined,
    qualityV2: LeadQualityV2 | null | undefined,
    fallback: string,
  ) {
    const v2Reason = qualityV2?.protectionReason || qualityV2?.discardReason || qualityV2?.reasons?.[0];
    const qualityReason = quality?.reasons?.[0] || quality?.status;
    return String(v2Reason || qualityReason || fallback).trim();
  }

  private requiredChannelsForInput(input?: NormalizedSearchInput | NormalizedRadarFilters | null) {
    return this.normalizeRadarChannels((input as any)?.requiredChannels || []);
  }

  private hasExplicitRequiredChannels(input?: NormalizedSearchInput | NormalizedRadarFilters | null) {
    return this.requiredChannelsForInput(input).length > 0;
  }

  private withoutPrimarySocialRequiredChannels<T extends NormalizedSearchInput | NormalizedRadarFilters | undefined | null>(input: T): T {
    if (!input) return input;
    const enrichmentRequiredChannels = new Set<RadarChannelFilter>(['instagram', 'facebook', 'email', 'website']);
    const requiredChannels = this.requiredChannelsForInput(input).filter((channel) => !enrichmentRequiredChannels.has(channel));
    return {
      ...(input as any),
      requiredChannels,
      salesProfile: {
        ...((input as any).salesProfile || {}),
        requiredChannels,
      },
    } as T;
  }

  private isQualityV2HardBlockForList(qualityV2: LeadQualityV2 | null | undefined, input?: NormalizedSearchInput | NormalizedRadarFilters) {
    if (!qualityV2 || !this.shouldApplyQualityV2Gate(input)) return false;
    if (qualityV2.decision === 'protect') return true;
    return qualityV2.decision === 'discard'
      && qualityV2.discardReason === 'segment_mismatch'
      && safeInteger(qualityV2.segmentFitScore) < 25;
  }

  private isListDeliverableCard(
    candidate: Record<string, any>,
    input: NormalizedSearchInput | NormalizedRadarFilters,
    quality?: LeadQualityResult | null,
    qualityV2?: LeadQualityV2 | null,
  ) {
    const effectiveQuality = quality ?? this.getCandidateQuality(candidate, input);
    const effectiveQualityV2 = qualityV2 ?? this.extractLeadQualityV2FromObject(candidate) ?? this.getCandidateQualityV2(candidate, input);
    const gate = this.getRadarQualityGate().evaluate({
      candidate,
      filters: input,
      quality: effectiveQuality,
      qualityV2: effectiveQualityV2,
      host: this.buildRadarQualityGateHost(),
    });
    return gate.deliverable;
  }

  private classifyCardDelivery(
    candidate: Record<string, any>,
    input: NormalizedSearchInput | NormalizedRadarFilters,
    quality?: LeadQualityResult | null,
    qualityV2?: LeadQualityV2 | null,
  ): HbxDeliveryClassification {
    const deliveryProduct: HbxDeliveryProduct = 'list';
    const effectiveQuality = quality ?? this.getCandidateQuality(candidate, input);
    const effectiveQualityV2 = qualityV2 ?? this.extractLeadQualityV2FromObject(candidate) ?? this.getCandidateQualityV2(candidate, input);
    const qualityReason = (fallback: string) => this.buildQualityReason(effectiveQuality, effectiveQualityV2, fallback);
    const qualityGate = this.getRadarQualityGate().evaluate({
      candidate,
      filters: input,
      quality: effectiveQuality,
      qualityV2: effectiveQualityV2,
      host: this.buildRadarQualityGateHost(),
    });
    const visibility = this.shouldApplyQualityV2Gate(input)
      ? resolveRadarVisibilityFromQualityV2({
          lead: candidate,
          quality: effectiveQualityV2,
          requestedSegment: (input as any)?.segment,
        })
      : {
          visibilityTier: 'list_basic' as const,
          hardBlocked: false,
          blockReason: null,
          rankScore: safeInteger((candidate as any)?.opportunityScore ?? (candidate as any)?.score),
          debitEligible: true,
        };

    if (!qualityGate.deliverable || visibility.hardBlocked || !this.isListLeadQualityDeliverable(effectiveQuality)) {
      return {
        visibilityTier: 'blocked',
        billable: false,
        debitEligible: false,
        deliveryProduct,
        qualityReason: qualityGate.reason || visibility.blockReason || qualityReason('Bloqueado por qualidade, risco ou aderencia.'),
      };
    }
    if (!this.hasUsablePublicContactChannel(candidate)) {
      return {
        visibilityTier: 'candidate',
        billable: false,
        debitEligible: false,
        deliveryProduct,
        qualityReason: 'Contato publico ausente.',
      };
    }

    return {
      visibilityTier: visibility.visibilityTier === 'review_backup' ? 'review_backup' : 'list_basic',
      billable: visibility.visibilityTier !== 'review_backup',
      debitEligible: visibility.visibilityTier !== 'review_backup',
      deliveryProduct,
      qualityReason: qualityReason('Card valido para entrega.'),
    };
  }

  private isCardDeliveryEligibleForVendas(
    delivery: HbxDeliveryClassification | null | undefined,
    _candidate?: Record<string, any> | null,
    _qualityV2?: LeadQualityV2 | null,
  ) {
    if (!delivery) return false;
    if (!delivery.debitEligible || !delivery.billable) return false;
    return delivery.visibilityTier === 'list_basic';
  }

  private attachDeliveryClassification<T extends Record<string, any>>(
    contact: T,
    input: NormalizedSearchInput | NormalizedRadarFilters,
    quality?: LeadQualityResult | null,
    qualityV2?: LeadQualityV2 | null,
  ): T & HbxDeliveryClassification {
    return {
      ...contact,
      ...this.classifyCardDelivery(contact, input, quality, qualityV2),
    };
  }

  private isPrimarySearchRunQualityDeliverable(
    candidate: Record<string, any>,
    input: NormalizedSearchInput,
    quality: LeadQualityResult | null | undefined,
  ) {
    return this.isListDeliverableCard(candidate, input, quality, this.extractLeadQualityV2FromObject(candidate));
  }

  private buildDeliverableResultEntries(input: NormalizedSearchInput, results: WebscrapingContactResult[]) {
    return results
      .map((result) => ({
        result,
        qualityV2: this.getCandidateQualityV2(result as any, input),
        quality: this.getCandidateQuality(result as any, input),
      }))
      .filter(({ result, quality, qualityV2 }) => {
        return this.isListDeliverableCard(result as any, input, quality, qualityV2);
      });
  }

  private countDeliverableResults(input: NormalizedSearchInput, results: WebscrapingContactResult[]) {
    return this.buildDeliverableResultEntries(input, results).length;
  }

  private normalizeLeadQualityV2(value: unknown): LeadQualityV2 | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, any>;
    const decision = String(raw.decision || '').trim() as LeadQualityV2['decision'];
    if (raw.version !== 'lead-quality-v2' || !['deliver', 'review', 'discard', 'protect'].includes(decision)) return null;
    return {
      version: 'lead-quality-v2',
      identityScore: safeInteger(raw.identityScore),
      segmentFitScore: safeInteger(raw.segmentFitScore),
      contactabilityScore: safeInteger(raw.contactabilityScore),
      commercialIntentScore: safeInteger(raw.commercialIntentScore),
      freshnessScore: safeInteger(raw.freshnessScore),
      riskScore: safeInteger(raw.riskScore),
      opportunityScore: safeInteger(raw.opportunityScore),
      finalRankScore: safeInteger(raw.finalRankScore),
      decision,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.map((reason) => String(reason || '').trim()).filter(Boolean) : [],
      discardReason: raw.discardReason ? String(raw.discardReason) : null,
      protectionReason: raw.protectionReason ? String(raw.protectionReason) : null,
      recommendedChannel: ['whatsapp', 'email', 'call', 'instagram', 'facebook', 'review', 'discard'].includes(String(raw.recommendedChannel || ''))
        ? raw.recommendedChannel
        : 'review',
      channelAvailability: raw.channelAvailability && typeof raw.channelAvailability === 'object' && !Array.isArray(raw.channelAvailability)
        ? {
          whatsapp: raw.channelAvailability.whatsapp === true,
          instagram: raw.channelAvailability.instagram === true,
          email: raw.channelAvailability.email === true,
          website: raw.channelAvailability.website === true,
          phone: raw.channelAvailability.phone === true,
          facebook: raw.channelAvailability.facebook === true,
        }
        : undefined,
      productFit: {
        listFit: safeInteger(raw.productFit?.listFit),
        leadFit: safeInteger(raw.productFit?.leadFit),
        botFit: safeInteger(raw.productFit?.botFit),
        recoveryFit: safeInteger(raw.productFit?.recoveryFit),
        websiteFit: safeInteger(raw.productFit?.websiteFit),
      },
    };
  }

  private extractLeadQualityV2FromObject(value: unknown): LeadQualityV2 | null {
    const direct = this.parseMaybeJsonObject(value);
    const rawJson = this.parseMaybeJsonObject(direct.rawJson);
    const enrichmentJson = this.parseMaybeJsonObject(direct.enrichmentJson);
    const metadataJson = this.parseMaybeJsonObject(direct.metadataJson);
    const candidates = [
      direct.qualityV2,
      direct.signals?.qualityV2,
      rawJson.qualityV2,
      rawJson.signals?.qualityV2,
      enrichmentJson.qualityV2,
      enrichmentJson.signals?.qualityV2,
      metadataJson.qualityV2,
      metadataJson.signals?.qualityV2,
    ];
    for (const candidate of candidates) {
      const qualityV2 = this.normalizeLeadQualityV2(candidate);
      if (qualityV2) return qualityV2;
    }
    return null;
  }

  private getCandidateQualityV2(candidate: Record<string, any>, input?: NormalizedSearchInput | NormalizedRadarFilters) {
    const salesProfile = input ? this.buildLeadQualitySalesProfileFromFilters(input) : null;
    const existing = this.extractLeadQualityV2FromObject(candidate)
      || this.extractLeadQualityV2FromObject(candidate.rawJson)
      || this.extractLeadQualityV2FromObject(candidate.enrichmentJson)
      || this.extractLeadQualityV2FromObject(candidate.metadataJson);
    if (existing && !salesProfile) return existing;
    return calculateLeadQualityV2({
      lead: candidate,
      enrichment: this.parseMaybeJsonObject(candidate.enrichmentJson),
      context: {
        requestedSegment: input ? String(input.segment || '') : String(candidate.segment || ''),
        requestedCity: input?.city || candidate.city || null,
        requestedState: input?.state || candidate.state || null,
        targetType: (input as any)?.targetType || null,
        salesProfile,
      },
    });
  }

  private shouldApplyQualityV2Gate(input?: NormalizedSearchInput | NormalizedRadarFilters) {
    const targetType = normalizeTargetType((input as any)?.targetType);
    return targetType === 'pj';
  }

  private isQualityV2Deliverable(qualityV2: LeadQualityV2, input?: NormalizedSearchInput | NormalizedRadarFilters) {
    if (!this.shouldApplyQualityV2Gate(input)) return true;
    if (qualityV2.decision === 'protect' || qualityV2.decision === 'discard') return false;
    return true;
  }

  private stripListPremiumFields<T extends Record<string, any>>(contact: T, _input?: NormalizedSearchInput | NormalizedRadarFilters): T {
    const clean = { ...contact };
    const hadPremiumSignal = Boolean(
      clean.instagramUrl
      || clean.facebookUrl
      || clean.email
      || clean.recommendedChannel
      || clean.emailConfidence
      || clean.emailSource
      || clean.opportunityReason
      || clean.opportunityScore
      || clean.enrichmentScore
      || clean.painType
      || clean.painLabel
      || clean.painPitch
      || clean.evidenceJson
      || clean.sourceConfidence
      || clean.actionPlan
      || clean.qualityV2,
    );
    [
      'score',
      'recommendedChannel',
      'emailConfidence',
      'emailSource',
      'opportunityReason',
      'painType',
      'painLabel',
      'painPitch',
      'enrichmentJson',
      'quality',
      'qualityV2',
      'evidenceJson',
      'sourceConfidence',
      'actionPlan',
      'firstMessage',
      'nextBestAction',
      'qualityReason',
      'rejectReasons',
    ].forEach((key) => delete clean[key]);
    (clean as any).premiumLocked = true;
    (clean as any).premiumFeatureStatus = 'locked';
    (clean as any).premiumTeaser = hadPremiumSignal;
    return clean as T;
  }

  private candidateHasRequiredChannel(candidate: Record<string, any>, channel: RadarChannelFilter, qualityV2?: LeadQualityV2 | null) {
    const raw = this.parseMaybeJsonObject(candidate?.rawJson);
    const enrichment = this.parseMaybeJsonObject(candidate?.enrichmentJson || raw.enrichmentJson);
    const metadata = this.parseMaybeJsonObject(candidate?.metadataJson || raw.metadataJson);
    const merged: Record<string, any> = {
      ...enrichment,
      ...metadata,
      ...raw,
      ...candidate,
      signals: {
        ...(enrichment.signals || {}),
        ...(metadata.signals || {}),
        ...(raw.signals || {}),
        ...(candidate.signals || {}),
      },
    };
    const existingQuality = qualityV2
      || this.extractLeadQualityV2FromObject(candidate)
      || this.extractLeadQualityV2FromObject(raw)
      || this.extractLeadQualityV2FromObject(enrichment)
      || this.extractLeadQualityV2FromObject(metadata);
    const availability = existingQuality?.channelAvailability;
    const qualityValue = availability && typeof availability === 'object' && typeof availability[channel] === 'boolean'
      ? availability[channel]
      : null;
    const phoneValue = merged.phoneDigits || merged.phone || merged.phoneNormalized;
    const whatsappStatus = String(merged.whatsappStatus || merged.whatsappCheckStatus || merged.signals?.whatsappStatus || '').trim().toLowerCase();
    const emailStatus = String(merged.emailStatus || merged.signals?.emailStatus || '').trim().toLowerCase();
    const businessEmail = normalizeBusinessEmail(merged.email || merged.signals?.email);
    const website = String(merged.website || '').trim();
    const websiteStatusRaw = String(merged.websiteStatus || merged.signals?.websiteStatus || '').trim().toLowerCase();
    const websiteStatus = website && (!websiteStatusRaw || websiteStatusRaw === 'none')
      ? inferWebsiteStatus(website)
      : (websiteStatusRaw || inferWebsiteStatus(website));
    const instagramUrl = String(merged.instagramUrl || merged.signals?.instagramUrl || '').trim();
    const facebookUrl = String(merged.facebookUrl || merged.signals?.facebookUrl || '').trim();
    const instagramUsable = Boolean(
      instagramUrl
      && !looksLikeThirdPartySocialProfile(instagramUrl)
      && socialProfileLooksCompatibleWithLead(merged, instagramUrl),
    );
    const facebookUsable = Boolean(
      facebookUrl
      && !looksLikeThirdPartySocialProfile(facebookUrl)
      && socialProfileLooksCompatibleWithLead(merged, facebookUrl),
    );
    const websiteUsable = Boolean(
      website
      && !this.isBlockedLeadOfficialWebsite(website)
      && websiteHostLooksCompatibleWithLead(merged, website)
      && !['broken', 'unreachable', 'none', 'social_only'].includes(websiteStatus),
    );

    if (channel === 'instagram') return instagramUsable;
    if (channel === 'facebook') return facebookUsable;
    if (channel === 'website') return websiteUsable;
    if (channel === 'email') return qualityValue !== false && Boolean(businessEmail) && !['missing', 'invalid'].includes(emailStatus);
    if (channel === 'phone') return qualityValue === true && isLikelyValidBrPhone(phoneValue) || isLikelyValidBrPhone(phoneValue);
    if (channel === 'whatsapp') {
      return (qualityValue === true && isLikelyValidBrPhone(phoneValue))
        || (['confirmed', 'available', 'valid', 'exists', 'true'].includes(whatsappStatus) && isLikelyValidBrPhone(phoneValue))
        || isLikelyWhatsapp(phoneValue);
    }
    return false;
  }

  private candidateHasRequiredChannels(candidate: Record<string, any>, input?: NormalizedSearchInput | NormalizedRadarFilters, qualityV2?: LeadQualityV2 | null) {
    const required = this.requiredChannelsForInput(input);
    const mode = this.normalizeChannelMatchMode((input as any)?.channelMatchMode);
    if (!required.length || mode === 'prefer') return true;
    const matches = required.map((channel) => this.candidateHasRequiredChannel(candidate, channel, qualityV2));
    return mode === 'all_required' ? matches.every(Boolean) : matches.some(Boolean);
  }

  private hasUsablePublicContactChannel(candidate: Record<string, any>) {
    const merged = {
      ...candidate,
      ...this.parseMaybeJsonObject(candidate?.rawJson),
      ...this.parseMaybeJsonObject(candidate?.enrichmentJson),
      ...this.parseMaybeJsonObject(candidate?.metadataJson),
    };
    const phoneDigits = normalizePhoneDigits(merged.phoneDigits || merged.phone || merged.phoneNormalized);
    if (isLikelyValidBrPhone(phoneDigits)) return true;
    const instagramUrl = String(merged.instagramUrl || merged.signals?.instagramUrl || '').trim();
    if (instagramUrl && !looksLikeThirdPartySocialProfile(instagramUrl) && socialProfileLooksCompatibleWithLead(merged, instagramUrl)) return true;
    const facebookUrl = String(merged.facebookUrl || merged.signals?.facebookUrl || '').trim();
    if (facebookUrl && !looksLikeThirdPartySocialProfile(facebookUrl) && socialProfileLooksCompatibleWithLead(merged, facebookUrl)) return true;
    const emailStatus = String(merged.emailStatus || merged.signals?.emailStatus || '').trim().toLowerCase();
    const email = normalizeBusinessEmail(merged.email || merged.emailCandidate || merged.signals?.email || merged.signals?.emailCandidate);
    if (email && !['missing', 'invalid'].includes(emailStatus)) return true;
    const website = String(merged.website || '').trim();
    if (
      website
      && inferWebsiteStatus(website) === 'present'
      && !this.isBlockedLeadOfficialWebsite(website)
      && websiteHostLooksCompatibleWithLead(merged, website)
    ) return true;
    const mapsUrl = String(merged.googleMapsUrl || merged.mapsUrl || merged.signals?.googleMapsUrl || '').trim();
    if (mapsUrl && /^https?:\/\/(?:www\.)?(?:google\.[^/]+\/maps|maps\.app\.goo\.gl)\//i.test(mapsUrl)) return true;
    const sourceUrl = String(merged.sourceUrl || merged._pageUrl || '').trim();
    return Boolean(sourceUrl && /^https?:\/\//i.test(sourceUrl) && !this.isBlockedLeadOfficialWebsite(sourceUrl));
  }

  private canDeliverRequiredSocialWithoutPhone(input?: Partial<NormalizedSearchInput | NormalizedRadarFilters> | null) {
    const required = this.requiredChannelsForInput(input as any);
    const mode = this.normalizeChannelMatchMode((input as any)?.channelMatchMode);
    return mode !== 'prefer' && required.some((channel) => ['instagram', 'facebook', 'email', 'website'].includes(channel));
  }

  private getCandidateQuality(candidate: Record<string, any>, input: NormalizedSearchInput | NormalizedRadarFilters) {
    const existing = this.extractLeadQualityFromObject(candidate)
      || this.extractLeadQualityFromObject(candidate.rawJson)
      || this.extractLeadQualityFromObject(candidate.enrichmentJson)
      || this.extractLeadQualityFromObject(candidate.metadataJson);
    if (existing) return existing;
    return this.evaluateResultQualityForInput(candidate, input);
  }

  private isRunItemQualityDeliverable(item: any, input: NormalizedSearchInput | NormalizedRadarFilters) {
    if (String(item?.status || '') !== 'found') return false;
    const raw = this.parseMaybeJsonObject(item?.rawJson);
    const candidate = { ...raw, ...item };
    const qualityV2 = this.extractLeadQualityV2FromObject(candidate) || this.getCandidateQualityV2(candidate, input);
    const quality = this.getCandidateQuality(candidate, input);
    if (!this.isListDeliverableCard(candidate, input, quality, qualityV2)) return false;
    return this.isCardDeliveryEligibleForVendas(this.classifyCardDelivery(candidate, input, quality, qualityV2), candidate, qualityV2);
  }

  private isRunItemPrimaryDeliverable(item: any, input: NormalizedSearchInput | NormalizedRadarFilters) {
    return this.isRunItemQualityDeliverable(item, input);
  }

  private hasRequiredSocialChannelsFilter(input?: NormalizedSearchInput | NormalizedRadarFilters | null) {
    return this.requiredChannelsForInput(input).some((channel) => channel === 'instagram' || channel === 'facebook');
  }

  private hasRequiredEnrichmentChannelsFilter(input?: NormalizedSearchInput | NormalizedRadarFilters | null) {
    return this.requiredChannelsForInput(input).some((channel) => (
      channel === 'instagram'
      || channel === 'facebook'
      || channel === 'email'
      || channel === 'website'
    ));
  }

  private getRequiredChannelCandidateWindow(targetQuantity: number) {
    const quantity = Math.max(1, safeInteger(targetQuantity));
    return Math.min(120, Math.max(40, quantity * 12));
  }

  private getRequiredChannelEnrichmentBatchLimit(targetQuantity: number) {
    const quantity = Math.max(1, safeInteger(targetQuantity));
    return Math.min(60, Math.max(40, quantity * 40));
  }

  private getResultSegmentForRejected(result: Record<string, any>) {
    const segment = this.normalizeQualityText(result.segment || result.businessCategory || result.category);
    return segment || null;
  }

  private buildSyntheticRunPlaceId(runId: string, result: Partial<WebscrapingContactResult>, index: number) {
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    if (phone) return `run:${runId}:${phone}`;
    const base = normalizeLookupValue(`${result.name || 'card'}:${result.website || ''}:${index}`);
    return `run:${runId}:${base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || index}`;
  }

  private buildRunCompositeKey(input: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
  }) {
    return [
      normalizeLookupValue(String(input.name || '')),
      normalizeLookupValue(String(input.city || '')),
      String(input.state || '').trim().toUpperCase(),
      normalizeLookupValue(String(input.segment || '')),
    ].join('|');
  }

  private async snapshotSearchRunDedup(runId: string) {
    const rows = await this.prisma.webscrapingSearchRunItem.findMany({
      where: { runId },
      select: {
        placeId: true,
        phoneDigits: true,
        websiteKey: true,
        name: true,
        city: true,
        state: true,
        segment: true,
      },
    });
    return {
      rows,
      placeIds: new Set(rows.map((row) => String(row.placeId || '').trim()).filter(Boolean)),
      phoneDigits: new Set(rows.map((row) => normalizePhoneDigits(row.phoneDigits)).filter(Boolean)),
      websiteKeys: new Set(rows.map((row) => String(row.websiteKey || '').trim()).filter(Boolean)),
      compositeKeys: new Set(rows.map((row) => this.buildRunCompositeKey(row)).filter((key) => key !== '|||')),
    };
  }

  private classifyRunItem(
    result: Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null },
    dedup: Awaited<ReturnType<RadarWebscrapingCoreService['snapshotSearchRunDedup']>>,
    fallback: { runId: string; index: number; city: string; state: string; segment: string },
    input?: NormalizedSearchInput | NormalizedRadarFilters,
  ) {
    return this.getRadarRunItemFilter().classifyRunItem(
      result,
      dedup,
      fallback,
      input,
      this.buildRadarRunItemFilterHost(),
    );
  }

  private shouldRunFreePreSaveEnrichment(
    normalized: NormalizedSearchInput,
    results: Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>,
  ) {
    if (!Array.isArray(results) || !results.length) return false;
    if (normalized.targetType !== 'pj') return false;
    if (!this.hasRequiredEnrichmentChannelsFilter(normalized)) return false;
    if (!results.some((result) => !this.candidateHasRequiredChannels(result as any, normalized))) return false;
    const flag = String(process.env.HBX_RADAR_PRE_SAVE_FREE_ENRICHMENT_ENABLED || 'true').trim().toLowerCase();
    return !['false', '0', 'off', 'no'].includes(flag);
  }

  private async enrichSearchRunResultsBeforeSave(
    normalized: NormalizedSearchInput,
    results: Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>,
    source: string | null,
    engineUrl?: string | null,
  ) {
    if (!this.shouldRunFreePreSaveEnrichment(normalized, results)) return results;
    try {
      const maxCards = this.getRequiredChannelEnrichmentBatchLimit(normalized.quantity);
      const enrichment = await new RadarWebEnrichmentService(this.getRadarWebsiteCrawlSource()).run({
        normalized: {
          ...normalized,
          freshness: 'live',
        },
        currentResults: results as WebscrapingContactResult[],
        maxCards,
        host: {
          logger: this.logger,
          fetcher: globalThis.fetch,
          engineUrl: engineUrl || this.getHbxScrapingEngineUrl(),
          timeoutMs: this.getRadarClientRequestTimeoutMs(),
          getRadarWebsiteCrawlSource: () => this.getRadarWebsiteCrawlSource(),
          searchHbxEngine: (input, existing, targetEngineUrl, options) => this.searchHbxEngine(
            {
              ...input,
              freshness: 'live',
            },
            existing,
            targetEngineUrl || engineUrl || this.getHbxScrapingEngineUrl(),
            options,
          ),
        },
      });
      if (!Array.isArray(enrichment?.results) || !enrichment.results.length) return results;
      const merged = this.getRadarResultMerger().mergeSources([
        {
          source: String(source || 'hbx_engine') as any,
          results: results as WebscrapingContactResult[],
        },
        {
          source: 'radar_web_enrichment',
          results: enrichment.results as WebscrapingContactResult[],
        },
      ]);
      return Array.isArray(merged?.results) && merged.results.length
        ? merged.results as Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>
        : results;
    } catch (error) {
      this.logger?.warn?.(`[radar-free-enrichment] pre-save falhou sem bloquear lote: ${String((error as any)?.message || error)}`);
      return results;
    }
  }

  private async saveSearchRunResults(
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
    runId: string,
    results: Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>,
    source: string | null,
    baseIndex = 0,
    enrichmentEngineUrl?: string | null,
  ) {
    const resultsToSave = await this.enrichSearchRunResultsBeforeSave(normalized, results, source, enrichmentEngineUrl);
    const dedup = await this.snapshotSearchRunDedup(runId);
    const counts = {
      found: 0,
      duplicate: 0,
      skipped: 0,
      invalid: 0,
      savedLeadIds: [] as string[],
      savedWebEnrichmentLeadIds: [] as string[],
      savedWebEnrichmentCandidates: [] as Array<{ id: string; score: number; reasons: string[]; index: number }>,
    };
    const metricIncrements: Partial<RadarSearchRunMetrics> = {
      rawFoundCount: 0,
      parsedContacts: 0,
      approvedContacts: 0,
      reviewLowScore: 0,
      downgradedToReview: 0,
      rejectedBlockedDomain: 0,
      rejectedInvalidPhone: 0,
      rejectedGenericName: 0,
    };
    const sourceQualityRows: Array<{ domain: string; sourceEngine: string; status: WebscrapingSearchRunItemStatus }> = [];
    for (const [index, result] of resultsToSave.entries()) {
      const resultCity = String((result as any).city || normalized.city || '').trim();
      const resultState = String((result as any).state || normalized.state || '').trim().toUpperCase();
      const resultSegment = String((result as any).segment || (result as any).businessCategory || (result as any).category || '').trim() || normalized.segment;
      const classified = this.classifyRunItem(result, dedup, {
        runId,
        index: baseIndex + index,
        city: resultCity,
        state: resultState,
        segment: resultSegment,
      }, normalized);
      const resultForQuality = {
        ...(result as any),
        city: resultCity || normalized.city,
        state: resultState || normalized.state,
        segment: resultSegment || normalized.segment,
      };
      const quality = classified.status === 'found'
        ? this.evaluateResultQualityForInput(resultForQuality, normalized)
        : this.extractLeadQualityFromObject(result as any);
      const qualityV2 = classified.status === 'found'
        ? this.getCandidateQualityV2(resultForQuality, normalized)
        : this.extractLeadQualityV2FromObject(result as any);
      const qualityGate = this.getRadarQualityGate().evaluate({
        candidate: resultForQuality,
        filters: normalized,
        quality,
        qualityV2,
        host: this.buildRadarQualityGateHost(),
      });
      const qualityDeliverable = classified.status === 'found' && qualityGate.deliverable;
      const finalStatus: WebscrapingSearchRunItemStatus = classified.status === 'found' && !qualityDeliverable
        ? 'skipped'
        : classified.status;
      const duplicateReason = classified.status === 'found' && !qualityDeliverable
        ? qualityGate.reason || quality.reasons.join('; ') || quality.status
        : classified.duplicateReason;
      const resultInstagramUrl = String((result as any).instagramUrl || '').trim();
      const resultFacebookUrl = String((result as any).facebookUrl || '').trim();
      const resultWebsite = String((result as any).website || '').trim();
      const resultEmail = String((result as any).email || '').trim();
      const resultSocialStatus = String((result as any).socialStatus || '').trim();
      const enrichmentMissingFields = finalStatus === 'found'
        ? [
            !resultInstagramUrl ? 'instagram' : null,
            !resultFacebookUrl ? 'facebook' : null,
            !resultWebsite ? 'site' : null,
            !resultEmail ? 'email' : null,
          ].filter(Boolean)
        : [];
      const enrichmentStatus = finalStatus === 'found'
        ? enrichmentMissingFields.length > 0 ? 'pending' : 'completed'
        : 'skipped';
      const socialStatus = finalStatus === 'found' && !resultInstagramUrl && !resultFacebookUrl
        ? 'pending'
        : resultInstagramUrl || resultFacebookUrl
          ? resultSocialStatus || 'found'
          : resultSocialStatus || null;
      const rawPayload = {
        ...resultForQuality,
        ...buildRadarStageSnapshot({
          ...resultForQuality,
          leadStatus: finalStatus === 'found' ? 'qualified' : finalStatus === 'duplicate' ? 'duplicate' : 'rejected',
          deliveryStatus: finalStatus === 'found' ? 'deliverable' : 'blocked',
          enrichmentStatus,
          socialStatus: socialStatus || undefined,
          providerStatus: 'available',
        }),
        ...(enrichmentMissingFields.length > 0
          ? {
              enrichmentQueued: true,
              enrichmentMissingFields,
              clientStatusLabel: 'Card entregue',
              clientStatusMessage: 'Contato principal aprovado. O Radar vai completar redes sociais, site e e-mail em segundo plano.',
            }
          : {}),
        ...(socialStatus ? { socialStatus } : {}),
        ...((resultInstagramUrl || resultFacebookUrl) && (result as any).socialConfidence == null ? { socialConfidence: 80 } : {}),
        ...(quality ? { quality, qualityV2, qualityGate } : {}),
      };
      const rawJson = JSON.stringify(rawPayload);
      const segment = finalStatus === 'found'
        ? resultSegment || null
        : this.getResultSegmentForRejected(result as any);
      const savedItem = await this.prisma.webscrapingSearchRunItem.create({
        data: {
          runId,
          companyId: context.companyId,
          placeId: classified.placeId,
          name: String(result.name || '').trim(),
          phone: String(result.phone || '').trim(),
          phoneDigits: classified.phoneDigits,
          website: String(result.website || '').trim() || null,
          websiteKey: classified.websiteKey || null,
          address: String(result.address || '').trim() || null,
          city: resultCity || null,
          state: resultState || null,
          segment,
          source: String(result.source || source || '').trim() || null,
          status: finalStatus,
          duplicateReason,
          rawJson,
        },
      });
      if (
        finalStatus === 'found'
        && normalized.targetType === 'pj'
        && savedItem?.id
        && (!resultInstagramUrl || !resultFacebookUrl)
      ) {
        counts.savedLeadIds.push(String(savedItem.id));
      }
      if (finalStatus === 'found' && normalized.targetType === 'pj' && savedItem?.id) {
        const webEnrichmentInput = {
          id: String(savedItem.id),
          name: result.name,
          phone: result.phone,
          phoneDigits: classified.phoneDigits || result.phoneDigits,
          website: result.website,
          email: (result as any).email,
          instagramUrl: resultInstagramUrl,
          facebookUrl: resultFacebookUrl,
          socialStatus,
          source: String(result.source || source || ''),
          score: (result as any).score,
          enrichmentScore: (result as any).enrichmentScore,
          index: baseIndex + index,
        };
        if (hasPoorRadarWebEnrichmentFields(webEnrichmentInput)) {
          counts.savedWebEnrichmentCandidates.push(scoreRadarWebEnrichmentCandidate(webEnrichmentInput));
        }
      }
      metricIncrements.parsedContacts = safeInteger(metricIncrements.parsedContacts) + 1;
      metricIncrements.rawFoundCount = safeInteger(metricIncrements.rawFoundCount) + 1;
      if (finalStatus === 'found') counts.found += 1;
      else if (finalStatus === 'duplicate') counts.duplicate += 1;
      else if (finalStatus === 'invalid') counts.invalid += 1;
      else counts.skipped += 1;
      if (finalStatus === 'found') {
        metricIncrements.approvedContacts = safeInteger(metricIncrements.approvedContacts) + 1;
        const visibility = this.shouldApplyQualityV2Gate(normalized)
          ? resolveRadarVisibilityFromQualityV2({
              lead: result,
              quality: qualityV2,
              requestedSegment: normalized.segment,
            })
          : {
              visibilityTier: 'list_basic' as const,
              hardBlocked: false,
              blockReason: null,
              rankScore: safeInteger((result as any)?.opportunityScore ?? (result as any)?.score),
              debitEligible: true,
            };
        if (visibility.visibilityTier === 'list_basic') {
          metricIncrements.savedListBasicCount = safeInteger(metricIncrements.savedListBasicCount) + 1;
        } else if (visibility.visibilityTier === 'review_backup') {
          metricIncrements.savedReviewBackupCount = safeInteger(metricIncrements.savedReviewBackupCount) + 1;
          metricIncrements.downgradedByQualityCount = safeInteger(metricIncrements.downgradedByQualityCount) + 1;
        }
      } else {
        const metricKey = this.classifyRunRejectionMetric(finalStatus, duplicateReason);
        (metricIncrements as any)[metricKey] = safeInteger((metricIncrements as any)[metricKey]) + 1;
        if (String(metricKey).endsWith('BlockedCount')) {
          metricIncrements.hardBlockedCount = safeInteger(metricIncrements.hardBlockedCount) + 1;
        }
      }
      const domain = getWebsiteHost((result as any).sourceUrl || result.website);
      if (domain) {
        sourceQualityRows.push({
          domain,
          sourceEngine: String((result as any).sourceEngine || result.source || source || '').trim() || 'unknown',
          status: finalStatus,
        });
      }
    }
    await this.recordSourceQualityFromRunItems(resultsToSave, sourceQualityRows);
    await this.updateSearchRunMetrics(runId, { increment: metricIncrements });
    counts.savedWebEnrichmentLeadIds = counts.savedWebEnrichmentCandidates
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((candidate) => candidate.id);
    delete (counts as any).savedWebEnrichmentCandidates;
    return counts;
  }
}
