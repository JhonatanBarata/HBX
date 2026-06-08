// @ts-nocheck
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
} from '../../radar-core-method-imports';

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
} from '../../radar-core-method-imports';

export class RadarCoreProviderMixin {
  [key: string]: any;
  private getApiKey(required = true) {
    const apiKey = String(
      process.env.GOOGLE_PLACES_API_KEY || process.env.WEBSCRAPING_GOOGLE_PLACES_API_KEY || '',
    ).trim();

    if (!apiKey && required) {
      throw this.buildConfigurationUnavailableError();
    }

    return apiKey;
  }

  private getHbxScrapingEngineUrl() {
    return String(process.env.HBX_SCRAPING_ENGINE_URL || DEFAULT_HBX_SCRAPING_ENGINE_URL)
      .trim()
      .replace(/\/+$/, '');
  }

  private logSearchSelection(input: NormalizedSearchInput) {
    console.log(
      `[webscraping] engine=${input.engine} targetType=${input.targetType} requested=${input.quantity}`,
    );
  }

  private logSearchResult(input: NormalizedSearchInput, returned: number) {
    console.log(
      `[webscraping] engine=${input.engine} targetType=${input.targetType} requested=${input.quantity} returned=${returned}`,
    );
  }

  private async searchHbxEngine(
    input: NormalizedSearchInput,
    excludePhoneDigits: string[] = [],
    engineUrlOverride?: string,
    options: { queryText?: string; batchLimit?: number; timeoutMs?: number; excludeUrls?: string[] } = {},
  ): Promise<HbxEngineSearchOutput> {
    const engineUrl = String(engineUrlOverride || this.getHbxScrapingEngineUrl()).trim().replace(/\/+$/, '');
    let response: Response;
    const normalizedExcludePhoneDigits = Array.from(
      new Set(excludePhoneDigits.map((phone) => normalizePhoneDigits(phone)).filter(Boolean) as string[]),
    );
    const batchLimit = Math.max(1, Math.min(100, Math.trunc(Number(options.batchLimit || input.quantity || 1))));
    const queryText = String(options.queryText || '').replace(/\s+/g, ' ').trim();
    const normalizedExcludeUrls = Array.from(
      new Set((options.excludeUrls || []).map((url) => String(url || '').trim().replace(/\/+$/, '')).filter(Boolean)),
    );

    try {
      const body: Record<string, unknown> = {
        city: input.city,
        state: input.state,
        radiusKm: input.radiusKm,
        originLat: input.originLat,
        originLng: input.originLng,
        segments: this.splitHbxBatchSegments(input.segment),
        segment: input.segment,
        targetType: input.targetType,
        limit: batchLimit,
        quantity: batchLimit,
        fresh: normalizedExcludePhoneDigits.length > 0,
        freshness: input.freshness,
        preferredChannels: input.preferredChannels,
        requiredChannels: input.requiredChannels,
        channelMatchMode: input.channelMatchMode,
        salesProfile: input.salesProfile || null,
        ...(input.salesProfile?.whatDoYouSell ? { whatDoYouSell: input.salesProfile.whatDoYouSell } : {}),
        ...(input.salesProfile?.offerCategory ? { offerCategory: input.salesProfile.offerCategory } : {}),
        ...(input.salesProfile?.targetAudience ? { targetAudience: input.salesProfile.targetAudience } : {}),
        ...(input.salesProfile?.targetSegments ? { targetSegments: input.salesProfile.targetSegments } : {}),
        ...(input.salesProfile?.avoidSegments ? { avoidSegments: input.salesProfile.avoidSegments } : {}),
        ...((input.salesProfile as any)?.hardRejectSegments ? { hardRejectSegments: (input.salesProfile as any).hardRejectSegments } : {}),
        ...(input.salesProfile?.leadPreferences ? { leadPreferences: input.salesProfile.leadPreferences } : {}),
        ...(input.salesProfile?.negativeRules ? { negativeRules: input.salesProfile.negativeRules } : {}),
      };
      if (queryText) {
        body.query = queryText;
        body.batchLimit = batchLimit;
      }
      if (normalizedExcludePhoneDigits.length > 0) {
        body.excludePhoneDigits = normalizedExcludePhoneDigits;
      }
      if (normalizedExcludeUrls.length > 0) {
        body.excludeUrls = normalizedExcludeUrls;
      }
      response = await fetch(`${engineUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1_000, Math.trunc(Number(options.timeoutMs || this.getHbxBatchTimeoutMs())))),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Motor HBX Scraping indisponivel.');
      const retryable = this.isRetryableHbxError(error) || /timeout|fetch failed|econnreset|socket hang up/i.test(message);
      throw new HbxBatchError(null, message || 'Motor HBX Scraping indisponivel.', retryable, 'hbx_scraping_engine_unavailable');
    }

    const rawText = typeof (response as any).text === 'function'
      ? await response.text().catch(() => '')
      : '';
    const payload = rawText
      ? (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return {};
          }
        })()
      : await response.json().catch(() => ({}));
    if (!response.ok) {
      const payloadMessage = String(payload?.detail || payload?.message || payload?.error || '').trim();
      const rawMessage = rawText || payloadMessage || `Motor HBX Scraping recusou a pesquisa com HTTP ${response.status}.`;
      throw new HbxBatchError(
        response.status,
        rawMessage,
        [500, 502, 503, 504].includes(response.status),
        'hbx_scraping_engine_http_error',
      );
    }

    const payloadStats = payload?.stats && typeof payload.stats === 'object' ? payload.stats : {};
    const items = Array.isArray(payload?.results) ? payload.results : [];
    const results: WebscrapingContactResult[] = [];
    const seenPhones = new Set<string>();
    let rejectedCount = 0;
    let duplicateCount = 0;

    for (const item of items) {
      const mapped = this.mapHbxContactResult(item, input);
      if (!mapped) {
        rejectedCount += 1;
        continue;
      }
      const mappedKey = mapped.phoneDigits || mapped.instagramUrl || mapped.facebookUrl || mapped.website || mapped.placeId;
      if (mapped.phoneDigits && normalizedExcludePhoneDigits.includes(mapped.phoneDigits)) {
        duplicateCount += 1;
        continue;
      }
      if (mappedKey && seenPhones.has(mappedKey)) {
        duplicateCount += 1;
        continue;
      }
      if (mappedKey) seenPhones.add(mappedKey);
      results.push(mapped);
      if (results.length >= batchLimit) break;
    }
    await this.enrichHbxSearchResultsInlineSocial(input, results, engineUrl).catch((error: any) => {
      this.logger?.warn?.(`[radar-inline-social] falha optional: ${String(error?.message || error)}`);
    });

    const payloadStatus = String(payload?.status || '').trim();
    const status: SearchRunStatus =
      payloadStatus === 'partial_error' || payloadStatus === 'completed_with_errors' || payloadStatus === 'completed_insufficient_results'
        ? payloadStatus
        : 'completed';
    const errors = Array.isArray(payload?.errors) ? payload.errors.filter(Boolean) : [];
    return {
      results,
      status,
      message:
        status === 'completed_with_errors' && errors.length > 0
          ? `Busca parcial: ${results.length} cards encontrados; ${errors.length} fonte(s) falharam.`
          : null,
      httpStatus: response.status,
      rawErrorMessage: errors.length > 0 ? errors.join('; ') : null,
      urlsDiscovered: safeInteger(payloadStats?.urlsDiscovered ?? payload?.urlsDiscovered ?? payload?.urls_discovered ?? payload?.discoveredCount ?? items.length),
      pagesFetched: safeInteger(payloadStats?.pagesFetched ?? payload?.pagesFetched ?? payload?.pages_fetched ?? payload?.fetchedCount ?? items.length),
      parsedContacts: safeInteger(payloadStats?.parsedContacts ?? payloadStats?.parsed ?? payload?.parsedContacts ?? payload?.parsed_contacts ?? items.length),
      queriesGenerated: Array.isArray(payloadStats?.queriesGenerated)
        ? payloadStats.queriesGenerated.map((query: unknown) => String(query || '').trim()).filter(Boolean)
        : [],
      sourceMetrics: Array.isArray(payloadStats?.sourceMetrics) ? payloadStats.sourceMetrics : [],
      missingRequiredChannel: safeInteger(payloadStats?.missingRequiredChannel ?? payload?.missingRequiredChannel),
      approvedCount: safeInteger(payloadStats?.approved ?? payloadStats?.approvedContacts ?? results.length),
      rejectedCount,
      duplicateCount,
    };
  }

  private shouldRunInlineSocialEnrichment(input: NormalizedSearchInput, results: WebscrapingContactResult[]) {
    if (String(process.env.HBX_RADAR_INLINE_SOCIAL_ENRICHMENT_ENABLED || 'false').trim().toLowerCase() !== 'true') return false;
    if (input.targetType !== 'pj') return false;
    if (!Array.isArray(results) || !results.length) return false;
    return true;
  }

  private getInlineSocialEngineUrls(primaryEngineUrl: string, needed: number) {
    const primary = String(primaryEngineUrl || this.getHbxScrapingEngineUrl()).trim().replace(/\/+$/, '');
    const configured = Math.max(1, getConfiguredHbxEngineCount());
    const maxEngines = Math.max(1, Math.min(configured, parsePositiveIntegerEnv('HBX_RADAR_INLINE_SOCIAL_MAX_ENGINES', 30), Math.max(1, needed)));
    const urls: string[] = [];
    const add = (url: string) => {
      const normalized = String(url || '').trim().replace(/\/+$/, '');
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    };
    add(primary);
    if (/hbx-engine-\d+/i.test(primary) || /hbx-scraping-engine/i.test(primary) || /hbx-engine/i.test(primary)) {
      for (let index = 1; index <= maxEngines; index += 1) add(`http://hbx-engine-${index}:8001`);
    } else if (/localhost:\d+/i.test(primary)) {
      for (const url of buildLocalHbxEngineUrls(maxEngines)) add(url);
    }
    return urls.slice(0, maxEngines);
  }

  private async enrichHbxSearchResultsInlineSocial(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    engineUrl: string,
  ) {
    if (!this.shouldRunInlineSocialEnrichment(input, results)) return;
    const limit = Math.max(0, Math.min(results.length, parsePositiveIntegerEnv('HBX_RADAR_INLINE_SOCIAL_LIMIT', 30)));
    if (!limit) return;
    const candidates = results
      .filter((result: any) => result?.name && (!result.instagramUrl || !result.facebookUrl))
      .slice(0, limit);
    if (!candidates.length) return;
    const engineUrls = this.getInlineSocialEngineUrls(engineUrl, candidates.length);
    const budgetSeconds = Math.max(8, Math.min(45, parsePositiveIntegerEnv('HBX_RADAR_INLINE_SOCIAL_TIME_BUDGET_SECONDS', 28)));
    const timeoutMs = Math.max(12_000, Math.min(60_000, (budgetSeconds + 8) * 1_000));
    await Promise.all(candidates.map(async (result: any, index: number) => {
      const targetEngineUrl = engineUrls[index % engineUrls.length] || engineUrls[0] || engineUrl;
      try {
        const response = await fetch(`${String(targetEngineUrl).replace(/\/+$/, '')}/enrich-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: result.name || '',
            phone: result.phone || '',
            phoneDigits: result.phoneDigits || '',
            city: result.city || input.city || '',
            state: result.state || input.state || '',
            segment: result.segment || input.segment || '',
            website: result.website || null,
            email: result.email || null,
            instagramUrl: result.instagramUrl || null,
            facebookUrl: result.facebookUrl || null,
            preferredChannels: ['instagram'],
            requiredChannels: [],
            timeBudgetSeconds: budgetSeconds,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload || typeof payload !== 'object') return;
        const instagramUrl = String(payload.instagramUrl || '').trim();
        const facebookUrl = String(payload.facebookUrl || '').trim();
        if (instagramUrl && !result.instagramUrl) result.instagramUrl = instagramUrl;
        if (facebookUrl && !result.facebookUrl) result.facebookUrl = facebookUrl;
        if (instagramUrl || facebookUrl) {
          result.socialStatus = String(payload.socialStatus || result.socialStatus || 'found').trim() || 'found';
          result.socialConfidence = Math.max(safeInteger(result.socialConfidence), safeInteger(payload.socialConfidence, 80));
          result.enrichmentJson = {
            ...(typeof result.enrichmentJson === 'object' && result.enrichmentJson ? result.enrichmentJson : {}),
            inlineSocial: {
              status: result.socialStatus,
              confidence: result.socialConfidence,
              engine: targetEngineUrl,
            },
          } as any;
        }
      } catch (error: any) {
        this.logger?.warn?.(`[radar-inline-social] optional falhou card=${result?.name || 'unknown'}: ${String(error?.message || error)}`);
      }
    }));
  }

  private normalizeRadarSocialUrl(value: unknown, network: 'instagram' | 'facebook') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      const expectedHost = network === 'instagram' ? 'instagram.com' : 'facebook.com';
      const alternateHost = network === 'facebook' ? 'fb.com' : '';
      if (host !== expectedHost && !host.endsWith(`.${expectedHost}`) && (!alternateHost || (host !== alternateHost && !host.endsWith(`.${alternateHost}`)))) {
        return null;
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (!parts.length) return null;
      if (parts.some((part) => RADAR_SOCIAL_BLOCKED_PATH_PARTS.has(normalizeLookupValue(part)))) return null;
      parsed.protocol = 'https:';
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  private pickRadarSocialUrl(item: any, network: 'instagram' | 'facebook') {
    const explicitKeys = network === 'instagram'
      ? ['instagramUrl', 'instagram', 'instagram_url', 'igUrl', 'ig']
      : ['facebookUrl', 'facebook', 'facebook_url', 'fbUrl', 'fb'];
    const genericKeys = ['socialUrl', 'socialProfileUrl', 'profileUrl', 'url', 'href', 'link', 'sourceUrl', '_pageUrl', 'pageUrl', 'website'];
    for (const key of [...explicitKeys, ...genericKeys]) {
      const url = this.normalizeRadarSocialUrl(item?.[key], network);
      if (url && !looksLikeThirdPartySocialProfile(url)) return url;
    }
    return null;
  }

  private mapHbxContactResult(item: any, inputOrTargetType: HbxTargetType | NormalizedSearchInput): WebscrapingContactResult | null {
    const targetType = typeof inputOrTargetType === 'string' ? inputOrTargetType : inputOrTargetType.targetType;
    const requiredChannels = typeof inputOrTargetType === 'string' ? [] : this.requiredChannelsForInput(inputOrTargetType);
    const name = String(item?.name || '').trim();
    if (typeof inputOrTargetType !== 'string' && this.isGenericDirectoryName(name, {
      city: item?.city || inputOrTargetType.city,
      segment: item?.segment || item?.businessCategory || item?.category || inputOrTargetType.segment,
    })) {
      return null;
    }
    const phone = String(item?.phone || '').trim();
    const phoneDigits = normalizePhoneDigits(item?.phoneDigits || phone);
    const instagramUrl = this.pickRadarSocialUrl(item, 'instagram');
    const facebookUrl = this.pickRadarSocialUrl(item, 'facebook');
    const hasRequiredSocial = Boolean(
      (requiredChannels.includes('instagram') && instagramUrl)
      || (requiredChannels.includes('facebook') && facebookUrl)
    );
    const hasUsablePublicContact = hasRequiredSocial
      || this.hasUsablePublicContactChannel({ ...item, phone, phoneDigits, instagramUrl, facebookUrl });

    if (!name || !hasUsablePublicContact) {
      return null;
    }

    const score = toNumberOrNull(item?.score);
    const source = String(item?.source || '').trim() || (targetType === 'pj' ? 'hbx_scraping:free_pj' : null);
    const fallbackIdentity = normalizeLookupValue(instagramUrl || facebookUrl || item?.website || name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const city = String(item?.city || '').trim() || null;
    const state = String(item?.state || '').trim().toUpperCase() || null;
    const segment = String(item?.segment || item?.businessCategory || item?.category || '').trim() || null;
    const title = String(item?.title || '').trim() || null;
    const description = String(item?.description || '').trim() || null;
    const snippet = String(item?.snippet || '').trim() || null;

    return {
      placeId: phoneDigits ? `hbx:${targetType}:${phoneDigits}` : `hbx:${targetType}:social:${fallbackIdentity || 'profile'}`,
      name,
      phone: phone || phoneDigits || '',
      phoneDigits: phoneDigits || '',
      rating: toNumberOrNull(item?.rating),
      reviews: item?.reviews == null ? null : safeInteger(item?.reviews),
      address: String(item?.address || '').trim() || null,
      city,
      state,
      segment,
      businessCategory: String(item?.businessCategory || item?.category || '').trim() || null,
      title,
      description,
      snippet,
      website: String(item?.website || '').trim() || null,
      instagramUrl,
      facebookUrl,
      email: String(item?.email || '').trim() || null,
      emailStatus: String(item?.emailStatus || '').trim() || null,
      socialStatus: String(item?.socialStatus || '').trim() || null,
      socialConfidence: item?.socialConfidence == null ? null : safeInteger(item?.socialConfidence),
      evidenceJson: item?.evidenceJson || null,
      enrichmentJson: item?.enrichmentJson || null,
      rejectReasons: Array.isArray(item?.rejectReasons) ? item.rejectReasons : null,
      qualityReason: String(item?.qualityReason || '').trim() || null,
      visibilityTier: String(item?.visibilityTier || '').trim() || null,
      deliveryProduct: String(item?.deliveryProduct || '').trim() || null,
      recommendedChannel: String(item?.recommendedChannel || '').trim() || null,
      sourceEngine: String(item?.sourceEngine || source || 'hbx_scraping').trim(),
      sourceUrl: String(item?.sourceUrl || item?._pageUrl || '').trim() || null,
      source,
      score,
    };
  }

  private async searchPlaces(query: string, limit: number): Promise<SearchPlacesCandidate[]> {
    const apiKey = this.getApiKey();

    try {
      return await this.searchPlacesNewApi(query, limit, apiKey);
    } catch (error) {
      if (!(error instanceof GooglePlacesApiError) || !isFallbackEligible(error)) {
        throw this.translateGooglePlacesError(error);
      }
    }

    return this.searchPlacesLegacyApi(query, limit, apiKey);
  }

  private async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const apiKey = this.getApiKey();

    try {
      return await this.getPlaceDetailsNewApi(placeId, apiKey);
    } catch (error) {
      if (!(error instanceof GooglePlacesApiError) || !isFallbackEligible(error)) {
        throw this.translateGooglePlacesError(error);
      }
    }

    return this.getPlaceDetailsLegacyApi(placeId, apiKey);
  }

  private mapContactResult(candidate: SearchPlacesCandidate, details: PlaceDetails): WebscrapingContactResult | null {
    const resolvedPhone = details.internationalPhoneNumber || details.formattedPhoneNumber;
    if (!isLikelyValidBrPhone(resolvedPhone)) return null;

    const phoneDigits = normalizePhoneDigits(resolvedPhone);
    if (!phoneDigits) return null;

    return {
      placeId: candidate.placeId,
      name: details.name || candidate.name || '',
      phone: resolvedPhone,
      phoneDigits,
      rating: toNumberOrNull(details.rating),
      reviews: Math.max(0, Math.trunc(toNumberOrNull(details.userRatingsTotal) || 0)),
      address: details.formattedAddress || '',
      website: details.website || '',
    };
  }

  private async searchPlacesNewApi(query: string, limit: number, apiKey: string): Promise<SearchPlacesCandidate[]> {
    const response = await fetch(PLACES_NEW_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        pageSize: Math.max(1, Math.min(limit, MAX_QUANTITY)),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorData = data?.error || {};
      const message = String(errorData?.message || '').trim();
      const status = String(errorData?.status || '').trim().toUpperCase();
      throw this.buildGoogleApiError(response.status, {
        status: status === 'PERMISSION_DENIED' || status === 'FAILED_PRECONDITION' ? 'REQUEST_DENIED' : status,
        error_message: message,
      });
    }

    const places = Array.isArray(data?.places) ? data.places : [];
    return places
      .map((place: any) => ({
        placeId: String(place?.id || '').trim(),
        name: String(place?.displayName?.text || '').trim(),
      }))
      .filter((place) => place.placeId)
      .slice(0, limit);
  }

  private async getPlaceDetailsNewApi(placeId: string, apiKey: string): Promise<PlaceDetails> {
    const response = await fetch(`${PLACES_NEW_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=pt-BR`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'websiteUri',
          'formattedAddress',
          'rating',
          'userRatingCount',
        ].join(','),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorData = data?.error || {};
      const message = String(errorData?.message || '').trim();
      const status = String(errorData?.status || '').trim().toUpperCase();
      throw this.buildGoogleApiError(response.status, {
        status: status === 'PERMISSION_DENIED' || status === 'FAILED_PRECONDITION' ? 'REQUEST_DENIED' : status,
        error_message: message,
      });
    }

    return {
      name: String(data?.displayName?.text || '').trim(),
      internationalPhoneNumber: String(data?.internationalPhoneNumber || '').trim(),
      formattedPhoneNumber: String(data?.nationalPhoneNumber || '').trim(),
      website: String(data?.websiteUri || '').trim(),
      formattedAddress: String(data?.formattedAddress || '').trim(),
      rating: toNumberOrNull(data?.rating),
      userRatingsTotal: toNumberOrNull(data?.userRatingCount),
    };
  }

  private async searchPlacesLegacyApi(query: string, limit: number, apiKey: string): Promise<SearchPlacesCandidate[]> {
    const url = new URL(PLACES_TEXT_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'pt-BR');

    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException('Busca temporariamente indisponivel.');
    }

    const parsed = this.parseLegacyGoogleResponse(response.status, data);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return results
      .map((place: any) => ({
        placeId: String(place?.place_id || '').trim(),
        name: String(place?.name || '').trim(),
      }))
      .filter((place) => place.placeId)
      .slice(0, limit);
  }

  private async getPlaceDetailsLegacyApi(placeId: string, apiKey: string): Promise<PlaceDetails> {
    const url = new URL(PLACES_DETAILS_URL);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set(
      'fields',
      [
        'name',
        'international_phone_number',
        'formatted_phone_number',
        'website',
        'formatted_address',
        'rating',
        'user_ratings_total',
      ].join(','),
    );

    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException('Busca temporariamente indisponivel.');
    }

    const parsed = this.parseLegacyGoogleResponse(response.status, data);
    const result = parsed?.result || {};
    return {
      name: String(result?.name || '').trim(),
      internationalPhoneNumber: String(result?.international_phone_number || '').trim(),
      formattedPhoneNumber: String(result?.formatted_phone_number || '').trim(),
      website: String(result?.website || '').trim(),
      formattedAddress: String(result?.formatted_address || '').trim(),
      rating: toNumberOrNull(result?.rating),
      userRatingsTotal: toNumberOrNull(result?.user_ratings_total),
    };
  }

  private parseLegacyGoogleResponse(httpStatus: number, data: any) {
    return this.getRadarGoogleResponse().parseLegacyGoogleResponse(
      httpStatus,
      data,
      (status, errorData) => this.buildGoogleApiError(status, errorData),
    );
  }

  private buildGoogleApiError(httpStatus: number, data: { status?: string; error_message?: string }) {
    const apiStatus = String(data?.status || '').trim().toUpperCase();
    const errorMessage = String(data?.error_message || '').trim();
    const normalizedMessage = errorMessage.toLowerCase();

    if (httpStatus === 429 || apiStatus === 'OVER_QUERY_LIMIT') {
      return new GooglePlacesApiError('google_quota_exceeded', 'Google Places recusou a consulta por limite de quota.');
    }

    if (apiStatus === 'REQUEST_DENIED') {
      if (normalizedMessage.includes('api key') && (normalizedMessage.includes('invalid') || normalizedMessage.includes('not valid'))) {
        return new GooglePlacesApiError('google_api_key_invalid', 'Google Places rejeitou a chave configurada.');
      }

      if (
        normalizedMessage.includes('referer')
        || normalizedMessage.includes('ip')
        || normalizedMessage.includes('restriction')
        || normalizedMessage.includes('authorized')
      ) {
        return new GooglePlacesApiError('google_api_key_restricted', 'Google Places bloqueou a chave por restricao de uso.');
      }

      if (normalizedMessage.includes('billing')) {
        return new GooglePlacesApiError('google_billing_required', 'Google Places exige billing ativo.');
      }

      if (normalizedMessage.includes('not enabled') || normalizedMessage.includes('not authorized to use this api')) {
        return new GooglePlacesApiError('google_api_not_enabled', 'Google Places API nao esta habilitada.');
      }

      return new GooglePlacesApiError('google_request_denied', errorMessage || 'Google Places recusou a consulta atual.');
    }

    if (apiStatus === 'INVALID_REQUEST') {
      return new GooglePlacesApiError('google_invalid_request', 'Google Places recusou a consulta por parametros invalidos.');
    }

    return new GooglePlacesApiError(
      'google_upstream_error',
      errorMessage || `Google Places retornou status ${apiStatus || 'desconhecido'}.`,
    );
  }

  private translateGooglePlacesError(error: unknown): never {
    if (error instanceof GooglePlacesApiError) {
      if (['google_api_key_invalid', 'google_api_key_restricted', 'google_billing_required', 'google_api_not_enabled'].includes(error.code)) {
        throw this.buildConfigurationUnavailableError();
      }

      if (error.code === 'google_invalid_request') {
        throw new BadRequestException('Nao foi possivel interpretar a busca informada.');
      }

      throw new ServiceUnavailableException({
        code: error.code,
        message:
          error.code === 'google_quota_exceeded'
            ? 'Busca temporariamente indisponivel. Tente novamente em instantes.'
            : 'Busca temporariamente indisponivel.',
      });
    }

    throw error;
  }
}
