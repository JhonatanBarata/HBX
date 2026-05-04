import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { probeWebscrapingRuntime, type WebscrapingRuntimeDiagnostic } from '../modules/webscraping-runtime.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  normalizeCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';

const PLACES_NEW_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_NEW_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const MAX_QUANTITY = 20;
const HBX_PJ_MAX_QUANTITY = 100;
const HBX_PEOPLE_MAX_QUANTITY = 100;
const DEFAULT_HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';
const GLOBAL_CACHE_TTL_HOURS = 24;
const RECENT_HISTORY_LIMIT = 20;
const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type RuntimeStatus = 'online' | 'degraded';
type ExternalRuntimeStatus = 'online' | 'offline';
type SearchSource = 'history' | 'google' | 'hbx' | 'hybrid' | 'global_cache';
type WebscrapingEngine = 'google' | 'hbx';
type HbxTargetType = 'pj' | 'pf' | 'agenda_pf';
type SearchRunStatus = 'completed' | 'partial_error' | 'completed_with_errors';
type HbxEngineSearchOutput = {
  results: WebscrapingContactResult[];
  status: SearchRunStatus;
  message: string | null;
};

let cityCache: {
  loadedAt: number;
  items: string[];
} | null = null;

export type NativeRuntimeDiagnostic = {
  status: RuntimeStatus;
  code: string;
  message: string;
  googleApiKeyConfigured: boolean;
};

export type HbxRuntimeDiagnostic = {
  status: ExternalRuntimeStatus;
  code: string;
  message: string;
  healthUrl: string;
  httpStatus: number | null;
};

export type WebscrapingRuntimeResponse = {
  native: NativeRuntimeDiagnostic;
  hbx: HbxRuntimeDiagnostic;
  quota: {
    remainingSearches: number | null;
    dailyLimit: number | null;
    isTrialLimited: boolean;
    accessMode: 'plan' | 'blocked';
  };
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
    hbxTechnicalMessage: string;
    legacy: WebscrapingRuntimeDiagnostic | null;
  };
};

export type WebscrapingSearchFilters = {
  minRating: number | null;
  minReviews: number | null;
  onlyWithWebsite: boolean;
};

export type WebscrapingContactResult = {
  placeId: string;
  name: string;
  phone: string;
  phoneDigits: string;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  website: string | null;
  source?: string | null;
  score?: number | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
};

export type WebscrapingSearchResponse = {
  query: {
    city: string;
    state?: string | null;
    segment: string;
    quantity: number;
    engine: WebscrapingEngine;
    targetType: HbxTargetType;
    filters: WebscrapingSearchFilters;
  };
  meta: {
    historyId: string | null;
    source: SearchSource;
    reusedCount: number;
    fetchedCount: number;
    totalStoredCount?: number;
    status?: SearchRunStatus;
    message?: string | null;
    technicalCacheUsed: boolean;
    technicalCacheReusedCount: number;
    technicalCacheValidUntil: string | null;
  };
  results: Array<Omit<WebscrapingContactResult, 'placeId'>>;
};

export type WebscrapingHistorySummary = {
  id: string;
  city: string;
  segment: string;
  quantity: number;
  resultCount: number;
  filters: WebscrapingSearchFilters;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  preview: string[];
  scope: 'company' | 'global';
  sourceLabel: string;
  cacheValidUntil?: string | null;
};

export type SearchContactsInput = {
  city?: string;
  segment?: string;
  quantity: number;
  state?: string | null;
  engine?: WebscrapingEngine;
  targetType?: HbxTargetType;
  minRating?: number | null;
  minReviews?: number | null;
  onlyWithWebsite?: boolean;
};

type SearchPlacesCandidate = {
  placeId: string;
  name: string;
};

type PlaceDetails = {
  name: string;
  internationalPhoneNumber: string;
  formattedPhoneNumber: string;
  website: string;
  formattedAddress: string;
  rating: number | null;
  userRatingsTotal: number | null;
};

type SearchExecutionContext = {
  companyId: number;
  userId: number;
  user: any;
};

type NormalizedSearchInput = {
  city: string;
  state: string;
  segment: string;
  quantity: number;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  filters: WebscrapingSearchFilters;
  filtersJson: string;
  searchSignature: string;
  cacheSignature: string;
  normalizedCity: string;
  normalizedSegment: string;
};

type SearchExecutionOptions = {
  historyIdHint?: string;
};

type NormalizeSearchInputOptions = {
  allowMissingHbxState?: boolean;
};

type UsageEventType = 'EXECUTED' | 'GOOGLE_SEARCH_EXECUTED' | 'BLOCKED_DAILY_LIMIT';

type UsageExecutionMeta = {
  source?: SearchSource;
  reusedCount?: number;
  fetchedCount?: number;
  technicalCacheUsed?: boolean;
  technicalCacheReusedCount?: number;
};

type SearchHistoryRow = {
  id: string;
  userId: number;
  city: string;
  segment: string;
  quantity: number;
  filtersJson: string;
  searchSignature: string;
  resultCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  places: Array<{
    id: string;
    placeId: string;
    rank: number;
    name: string;
    phone: string;
    phoneDigits: string;
    rating: number | null;
    reviews: number;
    address: string;
    website: string;
    source?: string | null;
    score?: number | null;
    opportunityReason?: string | null;
  }>;
};

type GlobalCacheRow = {
  id: string;
  cacheSignature: string;
  normalizedCity: string;
  normalizedSegment: string;
  filtersJson: string;
  resultCount: number;
  cacheValidUntil: Date;
  createdAt: Date;
  updatedAt: Date;
  lastFetchedAt: Date;
  lastServedAt: Date;
  places: Array<{
    id: string;
    placeId: string;
    rank: number;
    name: string;
    phone: string;
    phoneDigits: string;
    rating: number | null;
    reviews: number;
    address: string;
    website: string;
  }>;
};

class GooglePlacesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function normalizePhoneDigits(raw: string | null | undefined) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function isLikelyValidBrPhone(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  return digits.length === 10 || digits.length === 11;
}

function isLikelyWhatsapp(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  if (digits.length !== 11) return false;
  const mobilePrefix = Number(digits[2] || '0');
  return Number.isFinite(mobilePrefix) && mobilePrefix >= 6;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampQuantity(value: number, maxQuantity = MAX_QUANTITY) {
  const safeMax = Math.max(1, Math.trunc(maxQuantity || MAX_QUANTITY));
  return Math.min(Math.max(Math.trunc(value || 0), 1), safeMax);
}

function normalizeLookupValue(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function isFallbackEligible(error: GooglePlacesApiError) {
  return ['google_api_not_enabled', 'google_request_denied', 'google_upstream_error'].includes(error.code);
}

function coerceBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function normalizeEngine(value: unknown): WebscrapingEngine {
  return String(value || '').trim().toLowerCase() === 'hbx' ? 'hbx' : 'google';
}

function normalizeTargetType(value: unknown): HbxTargetType {
  const targetType = String(value || '').trim().toLowerCase();
  if (targetType === 'pf' || targetType === 'agenda_pf') return targetType;
  return 'pj';
}

function maxQuantityFor(engine: WebscrapingEngine, targetType: HbxTargetType) {
  if (engine === 'google') return MAX_QUANTITY;
  return targetType === 'pj' ? HBX_PJ_MAX_QUANTITY : HBX_PEOPLE_MAX_QUANTITY;
}

function safeInteger(value: unknown, fallback = 0) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function formatCityWithState(city: string, state: string | null | undefined) {
  const safeCity = String(city || '').trim();
  const safeState = String(state || '').trim().toUpperCase();
  if (!safeCity || !safeState) return safeCity;
  if (new RegExp(`\\s-\\s${safeState}$`, 'i').test(safeCity)) return safeCity;
  return `${safeCity} - ${safeState}`;
}

@Injectable()
export class WebscrapingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRuntime(user: any): Promise<WebscrapingRuntimeResponse> {
    const native = this.inspectNativeRuntime();
    const hbx = await this.inspectHbxRuntime();
    const quota = await this.buildRuntimeQuota(user);
    if (!this.canSeeDiagnostics(user)) {
      return { native, hbx, quota };
    }

    let legacy: WebscrapingRuntimeDiagnostic | null = null;
    try {
      legacy = await probeWebscrapingRuntime();
    } catch {
      legacy = null;
    }

    return {
      native,
      hbx,
      quota,
      diagnostics: {
        checkedAt: new Date().toISOString(),
        nativeTechnicalMessage: this.buildNativeTechnicalMessage(native),
        hbxTechnicalMessage: this.buildHbxTechnicalMessage(hbx),
        legacy,
      },
    };
  }

  inspectNativeRuntime(): NativeRuntimeDiagnostic {
    const apiKey = this.getApiKey(false);
    if (!apiKey) {
      return {
        status: 'degraded',
        code: 'configuration_pending',
        message: 'Modulo temporariamente em configuracao.',
        googleApiKeyConfigured: false,
      };
    }

    return {
      status: 'online',
      code: 'ok',
      message: 'Busca nativa pronta para prospeccao.',
      googleApiKeyConfigured: true,
    };
  }

  async inspectHbxRuntime(): Promise<HbxRuntimeDiagnostic> {
    const engineUrl = this.getHbxScrapingEngineUrl();
    const healthUrl = `${engineUrl}/health`;

    try {
      const response = await fetch(healthUrl, {
        headers: { Accept: 'application/json,text/plain' },
        signal: AbortSignal.timeout(4000),
      });
      await response.text().catch(() => '');

      if (!response.ok) {
        return {
          status: 'offline',
          code: 'hbx_health_http_error',
          message: `Motor HBX respondeu HTTP ${response.status} no healthcheck.`,
          healthUrl,
          httpStatus: response.status,
        };
      }

      return {
        status: 'online',
        code: 'ok',
        message: 'Motor HBX Scraping online.',
        healthUrl,
        httpStatus: response.status,
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'TimeoutError';
      return {
        status: 'offline',
        code: isAbort ? 'hbx_health_timeout' : 'hbx_health_unreachable',
        message: isAbort
          ? 'Motor HBX Scraping nao respondeu ao healthcheck dentro do limite.'
          : 'Nao foi possivel alcancar o Motor HBX Scraping.',
        healthUrl,
        httpStatus: null,
      };
    }
  }

  async listBrazilianCities(query?: string, limit = 80) {
    const items = await this.loadBrazilianCities();
    const normalizedQuery = normalizeLookupValue(String(query || ''));
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 0), 1), 6000);

    const filtered = normalizedQuery
      ? items
          .map((city) => ({
            city,
            normalized: normalizeLookupValue(city),
          }))
          .filter((item) => item.normalized.includes(normalizedQuery))
          .sort((left, right) => {
            const leftStarts = left.normalized.startsWith(normalizedQuery) ? 0 : 1;
            const rightStarts = right.normalized.startsWith(normalizedQuery) ? 0 : 1;
            return leftStarts - rightStarts || left.city.localeCompare(right.city, 'pt-BR');
          })
          .map((item) => item.city)
      : items;

    return {
      items: filtered.slice(0, safeLimit),
      total: filtered.length,
    };
  }

  async searchContactsForUser(
    user: any,
    input: SearchContactsInput,
    options: SearchExecutionOptions = {},
  ): Promise<WebscrapingSearchResponse> {
    const context = this.resolveContext(user);
    const normalized = this.normalizeSearchInput(input);
    this.logSearchSelection(normalized);
    const historyEnabled = await this.supportsHistoryPersistence();
    const existingHistory = historyEnabled
      ? await this.findHistoryBySignature(context.companyId, normalized.searchSignature, options.historyIdHint, normalized)
      : null;
    const storedResults = this.sortContacts(this.restoreStoredResults(existingHistory));
    const globalCacheEnabled = await this.supportsGlobalCachePersistence();
    const globalCacheEntry = globalCacheEnabled
      ? await this.findGlobalCacheBySignature(normalized.cacheSignature)
      : null;
    const cachedPublicResults = this.sortContacts(this.restoreGlobalCacheResults(globalCacheEntry));

    if (storedResults.length >= normalized.quantity) {
      if (existingHistory) {
        await this.touchHistory(existingHistory.id, context.userId);
      }
      const response = this.buildSearchResponse(normalized, storedResults.slice(0, normalized.quantity), {
        historyId: existingHistory?.id || null,
        source: 'history',
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount: 0,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    if (normalized.engine === 'hbx') {
      const results = [...storedResults];
      const seenPhones = new Set(results.map((item) => item.phoneDigits).filter(Boolean));
      let fetchedCount = 0;

      let hbxResults: WebscrapingContactResult[] = [];
      let hbxStatus: SearchRunStatus = 'completed';
      let hbxMessage: string | null = null;
      let hbxError: unknown = null;
      try {
        const hbxOutput = await this.searchHbxEngine(normalized, Array.from(seenPhones));
        hbxResults = hbxOutput.results;
        hbxStatus = hbxOutput.status;
        hbxMessage = hbxOutput.message;
      } catch (error) {
        hbxError = error;
      }
      for (const mapped of hbxResults) {
        if (results.length >= normalized.quantity) break;
        if (!this.shouldKeepNewContact(mapped, results, seenPhones)) continue;
        seenPhones.add(mapped.phoneDigits);
        results.push(mapped);
        fetchedCount += 1;
      }

      const orderedResults = this.sortContacts(results).slice(0, normalized.quantity);
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, orderedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = storedResults.length > 0 && fetchedCount > 0 ? 'hybrid' : 'hbx';
      if (hbxError && orderedResults.length === 0) {
        throw hbxError;
      }
      const status: SearchRunStatus = hbxError ? 'partial_error' : hbxStatus;
      const message = hbxError
        ? `Busca parcial: ${orderedResults.length} cards encontrados antes do erro.`
        : hbxMessage;
      const response = this.buildSearchResponse(normalized, orderedResults, {
        historyId,
        source,
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount,
        totalStoredCount: orderedResults.length,
        status,
        message,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    const results = [...storedResults];
    const seenPhones = new Set(results.map((item) => item.phoneDigits).filter(Boolean));
    const seenPlaces = new Set(results.map((item) => item.placeId).filter(Boolean));
    let fetchedCount = 0;
    let technicalCacheReusedCount = 0;

    if (cachedPublicResults.length > 0) {
      for (const cached of cachedPublicResults) {
        if (results.length >= normalized.quantity) break;
        if (!cached.placeId || seenPlaces.has(cached.placeId)) continue;
        if (!cached.phoneDigits || seenPhones.has(cached.phoneDigits)) continue;
        if (!this.matchesFilters(cached, normalized.filters)) continue;

        seenPlaces.add(cached.placeId);
        seenPhones.add(cached.phoneDigits);
        results.push(cached);
        technicalCacheReusedCount += 1;
      }
    }

    if (technicalCacheReusedCount > 0 && globalCacheEntry) {
      await this.touchGlobalCache(globalCacheEntry.id);
    }

    if (results.length >= normalized.quantity) {
      const orderedCachedResults = this.sortContacts(results).slice(0, normalized.quantity);
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, orderedCachedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = storedResults.length > 0 ? 'hybrid' : 'global_cache';
      const response = this.buildSearchResponse(normalized, orderedCachedResults, {
        historyId,
        source,
        reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
        fetchedCount: 0,
        technicalCacheUsed: technicalCacheReusedCount > 0,
        technicalCacheReusedCount,
        technicalCacheValidUntil:
          globalCacheEntry?.cacheValidUntil instanceof Date ? globalCacheEntry.cacheValidUntil.toISOString() : null,
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    const apiKey = this.getApiKey(results.length === 0);
    if (!apiKey) {
      const orderedCachedResults = this.sortContacts(results).slice(0, normalized.quantity);
      const historyId = historyEnabled && orderedCachedResults.length > 0
        ? await this.persistHistory(context, normalized, orderedCachedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      if (orderedCachedResults.length > 0) {
        const source: SearchSource = technicalCacheReusedCount > 0
          ? storedResults.length > 0
            ? 'hybrid'
            : 'global_cache'
          : 'history';
        const response = this.buildSearchResponse(normalized, orderedCachedResults, {
          historyId,
          source,
          reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
          fetchedCount: 0,
          technicalCacheUsed: technicalCacheReusedCount > 0,
          technicalCacheReusedCount,
          technicalCacheValidUntil:
            globalCacheEntry?.cacheValidUntil instanceof Date ? globalCacheEntry.cacheValidUntil.toISOString() : null,
        });
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
        this.logSearchResult(normalized, response.results.length);
        return response;
      }
      throw this.buildConfigurationUnavailableError();
    }

    await this.assertGoogleDailyQuota(context, normalized);

    for (const candidateLimit of this.buildCandidateSteps(normalized.quantity)) {
      if (results.length >= normalized.quantity) break;
      const candidates = await this.searchPlaces(`${normalized.segment} em ${normalized.city}`, candidateLimit);

      for (const candidate of candidates) {
        if (results.length >= normalized.quantity) break;
        if (!candidate.placeId || seenPlaces.has(candidate.placeId)) continue;

        seenPlaces.add(candidate.placeId);
        const details = await this.getPlaceDetails(candidate.placeId);
        const mapped = this.mapContactResult(candidate, details);
        if (!mapped) continue;
        if (seenPhones.has(mapped.phoneDigits)) continue;
        if (!this.matchesFilters(mapped, normalized.filters)) continue;

        seenPhones.add(mapped.phoneDigits);
        results.push(mapped);
        fetchedCount += 1;
      }
    }

    const orderedResults = this.sortContacts(results).slice(0, normalized.quantity);
    if (globalCacheEnabled && (fetchedCount > 0 || (!globalCacheEntry && orderedResults.length > 0))) {
      await this.persistGlobalCache(normalized, orderedResults, globalCacheEntry?.id || null);
    }
    const historyId = historyEnabled
      ? await this.persistHistory(context, normalized, orderedResults, existingHistory?.id || null)
      : null;
    const source: SearchSource =
      storedResults.length > 0 || (technicalCacheReusedCount > 0 && fetchedCount > 0)
        ? 'hybrid'
        : technicalCacheReusedCount > 0
          ? 'global_cache'
          : 'google';

    const response = this.buildSearchResponse(normalized, orderedResults, {
      historyId,
      source,
      reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
      fetchedCount,
      technicalCacheUsed: technicalCacheReusedCount > 0,
      technicalCacheReusedCount,
      technicalCacheValidUntil:
        globalCacheEntry?.cacheValidUntil instanceof Date
          ? globalCacheEntry.cacheValidUntil.toISOString()
          : fetchedCount > 0 || (!globalCacheEntry && orderedResults.length > 0)
            ? this.buildGlobalCacheValidUntil().toISOString()
            : null,
    });
    await this.recordUsageLog(context, normalized, 'GOOGLE_SEARCH_EXECUTED', response.results.length, null, response.meta);
    this.logSearchResult(normalized, response.results.length);
    return response;
  }

  async listRecentHistoryForUser(user: any, limit = RECENT_HISTORY_LIMIT) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    const globalCacheEnabled = await this.supportsGlobalCachePersistence();
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 0), 1), RECENT_HISTORY_LIMIT);
    if (historyEnabled) {
      await this.pruneCompanyHistory(context.companyId, RECENT_HISTORY_LIMIT);
    }
    const readLimit = Math.max(safeLimit * 3, RECENT_HISTORY_LIMIT);
    const [rows, globalRows] = await Promise.all([
      historyEnabled
        ? this.prisma.webscrapingSearchHistory.findMany({
            where: { companyId: context.companyId },
            orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: readLimit,
            include: {
              places: {
                orderBy: [{ rank: 'asc' }],
                take: 3,
              },
            },
          })
        : Promise.resolve([] as any[]),
      globalCacheEnabled
        ? this.prisma.webscrapingGlobalCacheEntry.findMany({
            where: {
              cacheValidUntil: {
                gt: new Date(),
              },
            },
            orderBy: [{ lastServedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: readLimit,
            include: {
              places: {
                orderBy: [{ rank: 'asc' }],
                take: 3,
              },
            },
          })
        : Promise.resolve([] as any[]),
    ]);

    const itemsWithKeys = [
      ...rows.map((row) => {
        const options = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
        const state = options.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase();
        return {
          id: row.id,
          city: formatCityWithState(row.city, state) || 'Brasil',
          segment: row.segment,
          quantity: row.quantity,
          resultCount: row.resultCount,
          filters: options.filters,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          lastUsedAt: row.lastUsedAt.toISOString(),
          preview: row.places.map((place) => place.name).filter(Boolean),
          scope: 'company' as const,
          sourceLabel: options.engine === 'hbx' ? 'Historico HBX Scraping' : 'Historico da empresa',
          cacheValidUntil: null,
          dedupeKey: this.buildHistoryDedupeKey({
            city: row.city,
            state,
            segment: row.segment,
            filtersJson: row.filtersJson,
            searchSignature: row.searchSignature,
          }),
        };
      }),
      ...globalRows.map((row) => ({
        id: `global:${row.id}`,
        city: row.normalizedCity,
        segment: row.normalizedSegment,
        quantity: Math.min(Math.max(Math.trunc(row.resultCount || 0), 1), MAX_QUANTITY),
        resultCount: row.resultCount,
        filters: this.parseFiltersJson(row.filtersJson),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastUsedAt: row.lastServedAt.toISOString(),
        preview: row.places.map((place) => place.name).filter(Boolean),
        scope: 'global' as const,
        sourceLabel: 'Historico global',
        cacheValidUntil: row.cacheValidUntil.toISOString(),
        dedupeKey: this.buildHistoryDedupeKey({
          city: row.normalizedCity,
          segment: row.normalizedSegment,
          filtersJson: row.filtersJson,
          searchSignature: row.cacheSignature,
        }),
      })),
    ]
      .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime());

    const uniqueItems = new Map<string, (typeof itemsWithKeys)[number]>();
    for (const item of itemsWithKeys) {
      const current = uniqueItems.get(item.dedupeKey);
      if (!current || (current.scope === 'global' && item.scope === 'company')) {
        uniqueItems.set(item.dedupeKey, item);
      }
    }

    const items = Array.from(uniqueItems.values())
      .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime())
      .slice(0, safeLimit)
      .map(({ dedupeKey: _dedupeKey, ...item }) => item);

    return { items };
  }

  async reuseHistorySearchForUser(user: any, historyId: string) {
    const context = this.resolveContext(user);
    const normalizedHistoryId = String(historyId || '').trim();
    const isGlobalHistory = normalizedHistoryId.startsWith('global:');

    if (isGlobalHistory) {
      const globalCacheEnabled = await this.supportsGlobalCachePersistence();
      if (!globalCacheEnabled) {
        throw new NotFoundException('Historico global indisponivel neste ambiente.');
      }

      const row = await this.findGlobalCacheById(normalizedHistoryId.slice('global:'.length));
      if (!row) {
        throw new NotFoundException('Pesquisa global nao encontrada.');
      }

      const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.cacheSignature);
      const filters = parsedOptions.filters;
      const normalized = this.normalizeSearchInput(
        {
          city: row.normalizedCity,
          state: parsedOptions.state,
          segment: row.normalizedSegment,
          quantity: Math.min(Math.max(Math.trunc(row.resultCount || 0), 1), MAX_QUANTITY),
          engine: parsedOptions.engine,
          targetType: parsedOptions.targetType,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          onlyWithWebsite: filters.onlyWithWebsite,
        },
        { allowMissingHbxState: true },
      );
      const storedResults = this.sortContacts(this.restoreGlobalCacheResults(row)).slice(0, normalized.quantity);

      await this.touchGlobalCache(row.id);

      const response = this.buildSearchResponse(normalized, storedResults, {
        historyId: `global:${row.id}`,
        source: 'global_cache',
        reusedCount: storedResults.length,
        fetchedCount: 0,
        technicalCacheUsed: true,
        technicalCacheReusedCount: storedResults.length,
        technicalCacheValidUntil: row.cacheValidUntil.toISOString(),
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      return response;
    }

    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      throw new NotFoundException('Historico indisponivel neste ambiente.');
    }

    const row = await this.findHistoryById(context.companyId, normalizedHistoryId);
    if (!row) {
      throw new NotFoundException('Pesquisa anterior nao encontrada.');
    }

    const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
    const filters = parsedOptions.filters;
    const normalized = this.normalizeSearchInput(
      {
        city: row.city,
        state: parsedOptions.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        quantity: row.quantity,
        engine: parsedOptions.engine,
        targetType: parsedOptions.targetType,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyWithWebsite: filters.onlyWithWebsite,
      },
      { allowMissingHbxState: true },
    );
    const storedResults = this.sortContacts(this.restoreStoredResults(row)).slice(0, normalized.quantity);

    await this.touchHistory(row.id, context.userId);

    const response = this.buildSearchResponse(normalized, storedResults, {
      historyId: row.id,
      source: 'history',
      reusedCount: storedResults.length,
      fetchedCount: 0,
      technicalCacheUsed: false,
      technicalCacheReusedCount: 0,
      technicalCacheValidUntil: null,
    });
    await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
    return response;
  }

  async searchMoreHistoryForUser(user: any, historyId: string, quantity = HBX_PJ_MAX_QUANTITY) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      throw new NotFoundException('Historico indisponivel neste ambiente.');
    }

    const row = await this.findHistoryById(context.companyId, String(historyId || '').trim());
    if (!row) {
      throw new NotFoundException('Pesquisa anterior nao encontrada.');
    }

    const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
    if (parsedOptions.engine !== 'hbx') {
      throw new BadRequestException('Buscar mais sem repetir esta disponivel apenas para HBX Scraping.');
    }

    const filters = parsedOptions.filters;
    const normalized = this.normalizeSearchInput(
      {
        city: row.city,
        state: parsedOptions.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        quantity,
        engine: parsedOptions.engine,
        targetType: parsedOptions.targetType,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyWithWebsite: filters.onlyWithWebsite,
      },
      { allowMissingHbxState: parsedOptions.targetType === 'pj' },
    );

    const storedResults = this.sortContacts(this.restoreStoredResults(row));
    const excludePhoneDigits = Array.from(
      new Set(storedResults.map((item) => normalizePhoneDigits(item.phoneDigits || item.phone)).filter(Boolean)),
    );

    let newResults: WebscrapingContactResult[] = [];
    let hbxStatus: SearchRunStatus = 'completed';
    let hbxMessage: string | null = null;
    let hbxError: unknown = null;
    try {
      const hbxOutput = await this.searchHbxEngine(normalized, excludePhoneDigits);
      const hbxResults = hbxOutput.results;
      hbxStatus = hbxOutput.status;
      hbxMessage = hbxOutput.message;
      const allSeenPhones = new Set(excludePhoneDigits);
      const accepted: WebscrapingContactResult[] = [];
      for (const candidate of hbxResults) {
        if (accepted.length >= normalized.quantity) break;
        if (!this.shouldKeepNewContact(candidate, [...storedResults, ...accepted], allSeenPhones)) continue;
        allSeenPhones.add(candidate.phoneDigits);
        accepted.push(candidate);
      }
      newResults = this.sortContacts(accepted);
    } catch (error) {
      hbxError = error;
    }

    if (hbxError && storedResults.length === 0 && newResults.length === 0) {
      throw hbxError;
    }

    const mergedResults = this.sortContacts(this.mergeDedupedContacts([...storedResults, ...newResults]));
    const savedHistoryId = await this.persistHistory(context, normalized, mergedResults, row.id);
    const status: SearchRunStatus = hbxError ? 'partial_error' : hbxStatus;
    const message = hbxError
      ? `Busca parcial: ${newResults.length} cards encontrados antes do erro.`
      : hbxMessage || (newResults.length < normalized.quantity
          ? `Busca concluida com ${newResults.length} cards novos sem repetir.`
          : null);

    const response = this.buildSearchResponse(normalized, newResults, {
      historyId: savedHistoryId,
      source: newResults.length > 0 ? 'hbx' : 'history',
      reusedCount: 0,
      fetchedCount: newResults.length,
      totalStoredCount: mergedResults.length,
      status,
      message,
      technicalCacheUsed: false,
      technicalCacheReusedCount: 0,
      technicalCacheValidUntil: null,
    });
    await this.recordUsageLog(context, normalized, 'EXECUTED', newResults.length, message, response.meta);
    return response;
  }

  async exportContactsForUser(user: any, input: SearchContactsInput) {
    const response = await this.searchContactsForUser(user, input);
    const workbook = XLSX.utils.book_new();
    const rows = response.results.map((result) => ({
      Nome: result.name,
      Telefone: result.phone,
      Nota: result.rating ?? '',
      Avaliações: result.reviews,
      Endereco: result.address,
      Website: result.website ? 'Abrir site' : '',
      'Roteiro pronto': this.buildScriptText(result, response.query.city, response.query.segment, user),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 10 },
      { wch: 12 },
      { wch: 42 },
      { wch: 14 },
      { wch: 68 },
    ];

    response.results.forEach((result, index) => {
      const rowIndex = index + 2;
      const scriptText = this.buildScriptText(result, response.query.city, response.query.segment, user);
      const whatsappTarget = this.buildWhatsAppTarget(result.phoneDigits || result.phone, scriptText);

      if (whatsappTarget) {
        const cell = worksheet[`B${rowIndex}`] || { t: 's', v: result.phone };
        cell.t = 's';
        cell.v = result.phone;
        cell.l = { Target: whatsappTarget, Tooltip: 'Abrir conversa no WhatsApp' };
        worksheet[`B${rowIndex}`] = cell;
      }

      if (result.website) {
        const cell = worksheet[`F${rowIndex}`] || { t: 's', v: 'Abrir site' };
        cell.t = 's';
        cell.v = 'Abrir site';
        cell.l = { Target: result.website, Tooltip: 'Abrir site' };
        worksheet[`F${rowIndex}`] = cell;
      }
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

    return {
      buffer: XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        compression: true,
      }) as Buffer,
      filename: this.buildExportFilename(response.query.segment, response.query.city),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private resolveContext(user: any): SearchExecutionContext {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId, user };
  }

  private canUseWebscrapingRole(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    return Boolean(user?.isSystemMaster) || role === 'ADMIN';
  }

  private canSeeDiagnostics(user: any) {
    return this.canUseWebscrapingRole(user);
  }

  private startOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private startOfTomorrow(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }

  private resolveGoogleSearchesPerDay(company: any) {
    const planKey = normalizeCommercialPlanKey(company?.selectedPlanKey);
    return COMMERCIAL_PLAN_QUOTAS[planKey]?.googleSearchesPerDay ?? COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO].googleSearchesPerDay;
  }

  private companyHasPaidFeatureAccess(company: any) {
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const billingGraceEndsAt = company?.billingGraceEndsAt instanceof Date ? company.billingGraceEndsAt : null;
    const graceActive =
      subscriptionStatus === 'grace' && billingGraceEndsAt && billingGraceEndsAt.getTime() >= Date.now();

    if (paymentStatus === 'DISABLED' || paymentStatus === 'EXPIRED') return false;
    if (subscriptionStatus === 'canceled' || subscriptionStatus === 'expired') return false;
    if (onboardingStatus === 'suspended') return false;
    if (graceActive) return true;
    return (
      paymentStatus === 'PAID' ||
      paymentStatus === 'TRIAL' ||
      paymentStatus === 'MANUAL' ||
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'trialing' ||
      subscriptionStatus === 'manual' ||
      Boolean(company?.premiumAccess)
    );
  }

  private async supportsUsageLogPersistence() {
    return this.prisma.hasTable('WebscrapingUsageLog');
  }

  private async buildRuntimeQuota(user: any) {
    const context = this.resolveContext(user);
    if (!this.canUseWebscrapingRole(user)) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: true,
        accessMode: 'blocked' as const,
      };
    }
    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        onboardingStatus: true,
        paymentStatus: true,
        subscriptionStatus: true,
        premiumAccess: true,
        selectedPlanKey: true,
        billingGraceEndsAt: true,
      },
    });

    const dailyLimit = company ? this.resolveGoogleSearchesPerDay(company) : 0;

    if (!company) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: false,
        accessMode: 'blocked' as const,
      };
    }

    if (!this.companyHasPaidFeatureAccess(company)) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: true,
        accessMode: 'blocked' as const,
      };
    }

    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) {
      return {
        remainingSearches: dailyLimit,
        dailyLimit,
        isTrialLimited: true,
        accessMode: 'plan' as const,
      };
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayGoogleExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'GOOGLE_SEARCH_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    return {
      remainingSearches: Math.max(0, dailyLimit - todayGoogleExecutions),
      dailyLimit,
      isTrialLimited: true,
      accessMode: 'plan' as const,
    };
  }

  private async assertGoogleDailyQuota(context: SearchExecutionContext, input: NormalizedSearchInput) {
    if (!this.canUseWebscrapingRole(context.user)) {
      throw new ForbiddenException({
        code: 'webscraping_role_blocked',
        message: 'O webscraping fica restrito ao ADMIN da empresa. Usuarios comuns nao usam o motor nem veem este modulo.',
      });
    }
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        id: true,
        onboardingStatus: true,
        paymentStatus: true,
        subscriptionStatus: true,
        premiumAccess: true,
        selectedPlanKey: true,
        billingGraceEndsAt: true,
      },
    });

    const dailyLimit = company ? this.resolveGoogleSearchesPerDay(company) : 0;

    if (!company) return;
    if (!this.companyHasPaidFeatureAccess(company)) {
      await this.recordUsageLog(
        context,
        input,
        'BLOCKED_DAILY_LIMIT',
        0,
        'Empresa vencida ou sem acesso ativo. Regularize o plano para usar recursos pagos do HBX.',
      );
      throw new ForbiddenException({
        code: 'company_paid_access_required',
        message: 'Empresa vencida ou sem acesso ativo. Regularize o plano para usar recursos pagos do HBX.',
      });
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayGoogleExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'GOOGLE_SEARCH_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    if (dailyLimit > 0 && todayGoogleExecutions < dailyLimit) {
      return;
    }

    const planKey = normalizeCommercialPlanKey(company.selectedPlanKey);
    const message = planKey === COMMERCIAL_PLAN_KEYS.LITE
      ? 'O HBX Lite não inclui buscas Google diárias. Os motores gratuitos continuam liberados. Para buscas Google, escolha o HBX Padrão ou HBX Melhor.'
      : `${GOOGLE_DAILY_LIMIT_REACHED_MESSAGE} Seu plano permite ${dailyLimit} busca(s) Google por dia.`;
    await this.recordUsageLog(context, input, 'BLOCKED_DAILY_LIMIT', 0, message);
    throw new ForbiddenException({
      code: 'google_daily_limit_reached',
      message,
    });
  }

  private async recordUsageLog(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
    eventType: UsageEventType,
    resultCount: number,
    message?: string | null,
    executionMeta?: UsageExecutionMeta | null,
  ) {
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    const executedEvent = this.isExecutedUsageEvent(eventType);

    await this.prisma.webscrapingUsageLog.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        eventType,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        resultCount: Math.max(0, Math.trunc(resultCount || 0)),
        source: executedEvent ? executionMeta?.source || null : null,
        reusedCount:
          executedEvent ? Math.max(0, Math.trunc(executionMeta?.reusedCount || 0)) : 0,
        fetchedCount:
          executedEvent ? Math.max(0, Math.trunc(executionMeta?.fetchedCount || 0)) : 0,
        technicalCacheUsed: executedEvent ? Boolean(executionMeta?.technicalCacheUsed) : false,
        technicalCacheReusedCount:
          executedEvent
            ? Math.max(0, Math.trunc(executionMeta?.technicalCacheReusedCount || 0))
            : 0,
        searchSignature: input.searchSignature,
        message: String(message || '').trim() || null,
      },
    }).catch(() => null);
  }

  private buildNativeTechnicalMessage(runtime: NativeRuntimeDiagnostic) {
    if (!runtime.googleApiKeyConfigured) {
      return 'GOOGLE_PLACES_API_KEY ou WEBSCRAPING_GOOGLE_PLACES_API_KEY ausente no backend nativo.';
    }
    return 'Busca nativa habilitada e pronta para consultar Google Places.';
  }

  private buildHbxTechnicalMessage(runtime: HbxRuntimeDiagnostic) {
    if (runtime.status === 'online') {
      return `Motor HBX respondendo em ${runtime.healthUrl}.`;
    }
    return `${runtime.message} Verifique HBX_SCRAPING_ENGINE_URL ou o container hbx-scraping-engine.`;
  }

  private buildConfigurationUnavailableError() {
    return new ServiceUnavailableException({
      code: 'configuration_pending',
      message: 'Modulo temporariamente em configuracao.',
    });
  }

  private async loadBrazilianCities() {
    const now = Date.now();
    if (cityCache && now - cityCache.loadedAt < CITY_CACHE_TTL_MS) {
      return cityCache.items;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(IBGE_CITIES_URL, { signal: controller.signal });
    } catch {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Nao foi possivel carregar a lista de cidades do IBGE.',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Nao foi possivel carregar a lista de cidades do IBGE.',
      });
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Resposta inesperada ao carregar cidades do IBGE.',
      });
    }

    const items = payload
      .map((city: any) => {
        const name = String(city?.nome || '').trim();
        const uf = String(city?.microrregiao?.mesorregiao?.UF?.sigla || '').trim();
        return name && uf ? `${name} - ${uf}` : '';
      })
      .filter(Boolean)
      .sort((left: string, right: string) => left.localeCompare(right, 'pt-BR'));

    cityCache = {
      loadedAt: now,
      items,
    };

    return items;
  }

  private resolveCityState(cityInput: unknown, stateInput?: unknown) {
    const rawCity = String(cityInput || '').trim();
    const explicitState = String(stateInput || '').trim().toUpperCase();
    const cityWithUf = rawCity.match(/^(.*?)\s*[-,/]\s*([A-Za-z]{2})$/);

    if (cityWithUf) {
      return {
        city: cityWithUf[1].trim(),
        state: explicitState || cityWithUf[2].trim().toUpperCase(),
      };
    }

    return {
      city: rawCity,
      state: explicitState,
    };
  }

  private normalizeSearchInput(
    input: SearchContactsInput,
    options: NormalizeSearchInputOptions = {},
  ): NormalizedSearchInput {
    const engine = normalizeEngine(input.engine);
    const targetType = normalizeTargetType(input.targetType);
    const rawCity = String(input.city || '').trim();
    const parsedCityState = engine === 'hbx'
      ? this.resolveCityState(rawCity, input.state)
      : { city: rawCity, state: String(input.state || '').trim().toUpperCase() };
    const city = parsedCityState.city;
    const state = parsedCityState.state;
    const segment = String(input.segment || '').trim();
    const quantity = clampQuantity(input.quantity, maxQuantityFor(engine, targetType));

    if (!city) {
      if (!(engine === 'hbx' && targetType === 'pj')) {
        throw new BadRequestException('Cidade obrigatoria.');
      }
    }

    if (engine === 'hbx' && targetType !== 'pj' && !state && !options.allowMissingHbxState) {
      throw new BadRequestException('Estado obrigatorio para o motor HBX.');
    }

    if (!segment && !(engine === 'hbx' && targetType === 'agenda_pf')) {
      throw new BadRequestException('Segmento obrigatorio.');
    }

    const filters: WebscrapingSearchFilters = {
      minRating: this.normalizeMinRating(input.minRating),
      minReviews: this.normalizeMinReviews(input.minReviews),
      onlyWithWebsite: coerceBoolean(input.onlyWithWebsite),
    };
    const filtersJson = JSON.stringify({
      ...filters,
      engine,
      targetType,
      state,
    });
    const normalizedCity = normalizeLookupValue(city);
    const normalizedSegment = normalizeLookupValue(segment);

    return {
      city,
      state,
      segment,
      quantity,
      engine,
      targetType,
      filters,
      filtersJson,
      cacheSignature: [
        `engine:${engine}`,
        `targetType:${targetType}`,
        `city:${normalizedCity}`,
        `state:${normalizeLookupValue(state)}`,
        `segment:${normalizedSegment}`,
        `filters:${filtersJson}`,
      ].join('|'),
      searchSignature: [
        `engine:${engine}`,
        `targetType:${targetType}`,
        `city:${normalizedCity}`,
        `state:${normalizeLookupValue(state)}`,
        `segment:${normalizedSegment}`,
        ...(engine === 'hbx' ? [] : [`quantity:${quantity}`]),
        `filters:${filtersJson}`,
      ].join('|'),
      normalizedCity,
      normalizedSegment,
    };
  }

  private normalizeMinRating(value: unknown) {
    const numeric = toNumberOrNull(value);
    if (numeric == null) return null;
    return Math.min(Math.max(Number(numeric.toFixed(1)), 0), 5);
  }

  private normalizeMinReviews(value: unknown) {
    const numeric = toNumberOrNull(value);
    if (numeric == null) return null;
    return Math.max(0, Math.trunc(numeric));
  }

  private parseFiltersJson(raw: string | null | undefined): WebscrapingSearchFilters {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        minRating: this.normalizeMinRating(parsed?.minRating),
        minReviews: this.normalizeMinReviews(parsed?.minReviews),
        onlyWithWebsite: Boolean(parsed?.onlyWithWebsite),
      };
    } catch {
      return {
        minRating: null,
        minReviews: null,
        onlyWithWebsite: false,
      };
    }
  }

  private parseSearchOptionsJson(raw: string | null | undefined, signature?: string | null) {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      const parsedState = String(parsed?.state || '').trim().toUpperCase();
      const parsedEngine = parsed?.engine == null || parsed.engine === ''
        ? this.extractSignaturePart(signature, 'engine')
        : parsed.engine;
      const parsedTargetType = parsed?.targetType == null || parsed.targetType === ''
        ? this.extractSignaturePart(signature, 'targetType')
        : parsed.targetType;
      return {
        filters: {
          minRating: this.normalizeMinRating(parsed?.minRating),
          minReviews: this.normalizeMinReviews(parsed?.minReviews),
          onlyWithWebsite: Boolean(parsed?.onlyWithWebsite),
        },
        engine: normalizeEngine(parsedEngine),
        targetType: normalizeTargetType(parsedTargetType),
        state: parsedState || this.extractSignaturePart(signature, 'state').toUpperCase(),
      };
    } catch {
      return {
        filters: {
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        },
        engine: 'google' as WebscrapingEngine,
        targetType: 'pj' as HbxTargetType,
        state: this.extractSignaturePart(signature, 'state').toUpperCase(),
      };
    }
  }

  private buildHistoryDedupeKey(input: {
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    filtersJson?: string | null;
    searchSignature?: string | null;
    filters?: WebscrapingSearchFilters | null;
  }) {
    const parsed = this.parseSearchOptionsJson(input.filtersJson, input.searchSignature);
    const filters = input.filters || parsed.filters;
    const state = String(input.state || parsed.state || '').trim().toUpperCase();
    return [
      `engine:${parsed.engine}`,
      `targetType:${parsed.targetType}`,
      `city:${normalizeLookupValue(String(input.city || ''))}`,
      `state:${normalizeLookupValue(state)}`,
      `segment:${normalizeLookupValue(String(input.segment || ''))}`,
      `filters:${JSON.stringify(filters)}`,
    ].join('|');
  }

  private extractSignaturePart(signature: string | null | undefined, key: string) {
    const prefix = `${key}:`;
    const part = String(signature || '')
      .split('|')
      .find((item) => item.startsWith(prefix));
    return part ? part.slice(prefix.length).trim() : '';
  }

  private buildSearchResponse(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    meta: {
      historyId: string | null;
      source: SearchSource;
      reusedCount: number;
      fetchedCount: number;
      totalStoredCount?: number;
      status?: SearchRunStatus;
      message?: string | null;
      technicalCacheUsed: boolean;
      technicalCacheReusedCount: number;
      technicalCacheValidUntil: string | null;
    },
  ): WebscrapingSearchResponse {
    return {
      query: {
        city: input.city,
        state: input.state || null,
        segment: input.segment,
        quantity: input.quantity,
        engine: input.engine,
        targetType: input.targetType,
        filters: input.filters,
      },
      meta,
      results: results.map((result) => {
        const { placeId: _placeId, ...publicResult } = result;
        const opportunityScore = this.buildOpportunityScore(result);
        return {
          ...publicResult,
          score: publicResult.score == null ? opportunityScore : publicResult.score,
          opportunityScore,
          opportunityReason: publicResult.opportunityReason || this.buildOpportunityReason(result, input),
        };
      }),
    };
  }

  private restoreStoredResults(history: SearchHistoryRow | null): WebscrapingContactResult[] {
    if (!history?.places?.length) return [];
    return history.places.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      phone: place.phone,
      phoneDigits: place.phoneDigits,
      rating: place.rating == null ? null : Number(place.rating),
      reviews: Math.max(0, Math.trunc(place.reviews || 0)),
      address: place.address || null,
      website: place.website || null,
      source: place.source || null,
      score: toNumberOrNull(place.score),
      opportunityScore: toNumberOrNull(place.score),
      opportunityReason: place.opportunityReason || null,
    }));
  }

  private restoreGlobalCacheResults(entry: GlobalCacheRow | null): WebscrapingContactResult[] {
    if (!entry?.places?.length) return [];
    return entry.places.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      phone: place.phone,
      phoneDigits: place.phoneDigits,
      rating: place.rating == null ? null : Number(place.rating),
      reviews: Math.max(0, Math.trunc(place.reviews || 0)),
      address: place.address || null,
      website: place.website || null,
    }));
  }

  private matchesFilters(result: WebscrapingContactResult, filters: WebscrapingSearchFilters) {
    if (filters.minRating != null && (result.rating == null || result.rating < filters.minRating)) {
      return false;
    }
    if (filters.minReviews != null && (result.reviews || 0) < filters.minReviews) {
      return false;
    }
    if (filters.onlyWithWebsite && !String(result.website || '').trim()) {
      return false;
    }
    return true;
  }

  private buildOpportunityScore(result: WebscrapingContactResult) {
    const baseScore = Math.max(0, Math.min(100, Math.trunc(Number(result.score || 0) || 0)));
    const websiteBonus = result.website ? 8 : 0;
    const addressBonus = result.address ? 6 : 0;
    const reviewBonus = Math.min(10, Math.trunc((result.reviews || 0) / 20));
    const ratingBonus = result.rating == null ? 0 : Math.max(0, Math.min(8, Math.round((result.rating - 3.5) * 5)));
    return Math.max(0, Math.min(100, baseScore + websiteBonus + addressBonus + reviewBonus + ratingBonus));
  }

  private buildOpportunityReason(result: WebscrapingContactResult, input: NormalizedSearchInput) {
    const reasons: string[] = [];
    const segment = input.segment || (input.targetType === 'agenda_pf' ? 'agenda publica' : 'prospeccao');
    if (result.phoneDigits) reasons.push('telefone validado para abordagem imediata');
    if (result.website) reasons.push('site publico indica negocio ativo');
    if (result.address) reasons.push('endereco aumenta confianca e contexto local');
    if ((result.reviews || 0) > 0) reasons.push(`${result.reviews} avaliacoes sugerem demanda ativa`);
    if ((result.score || 0) >= 80) reasons.push('alta aderencia ao termo pesquisado');
    if (!reasons.length) reasons.push('contato publico relacionado ao criterio da busca');
    return `Boa oportunidade para ${segment}: ${reasons.slice(0, 3).join('; ')}.`;
  }

  private buildContactDedupeKeys(result: WebscrapingContactResult) {
    const name = normalizeLookupValue(result.name || '');
    const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
    const website = normalizeWebsiteKey(result.website);
    const cityOrAddress = normalizeLookupValue(String(result.address || ''));
    return [
      phone ? `phone:${phone}` : '',
      name && phone ? `name_phone:${name}:${phone}` : '',
      website ? `website:${website}` : '',
      name && cityOrAddress ? `name_location:${name}:${cityOrAddress}` : '',
    ].filter(Boolean);
  }

  private contactMatchesSeenKeys(result: WebscrapingContactResult, seenKeys: Set<string>) {
    return this.buildContactDedupeKeys(result).some((key) => seenKeys.has(key));
  }

  private shouldKeepNewContact(
    candidate: WebscrapingContactResult,
    existing: WebscrapingContactResult[],
    seenPhones: Set<string>,
  ) {
    if (!candidate.phoneDigits || seenPhones.has(candidate.phoneDigits)) return false;
    const seenKeys = new Set<string>();
    for (const item of existing) {
      for (const key of this.buildContactDedupeKeys(item)) seenKeys.add(key);
    }
    return !this.contactMatchesSeenKeys(candidate, seenKeys);
  }

  private mergeDedupedContacts(results: WebscrapingContactResult[]) {
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

  private sortContacts(results: WebscrapingContactResult[]) {
    return [...results].sort((left, right) => {
      const scoreDelta = (right.score || 0) - (left.score || 0);
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

  private buildCandidateSteps(quantity: number) {
    return Array.from(
      new Set([
        Math.min(Math.max(quantity * 2, quantity + 2), MAX_QUANTITY),
        Math.min(Math.max(quantity * 3, quantity + 4), MAX_QUANTITY),
        MAX_QUANTITY,
      ]),
    ).sort((left, right) => left - right);
  }

  private async supportsHistoryPersistence() {
    const [historyTable, placeTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingSearchHistory'),
      this.prisma.hasTable('WebscrapingSearchPlace'),
    ]);
    return historyTable && placeTable;
  }

  private async supportsGlobalCachePersistence() {
    const [cacheTable, placeTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingGlobalCacheEntry'),
      this.prisma.hasTable('WebscrapingGlobalCachePlace'),
    ]);
    return cacheTable && placeTable;
  }

  private buildGlobalCacheValidUntil(date = new Date()) {
    return new Date(date.getTime() + GLOBAL_CACHE_TTL_HOURS * 60 * 60 * 1000);
  }

  private async findHistoryBySignature(
    companyId: number,
    searchSignature: string,
    historyIdHint?: string,
    input?: NormalizedSearchInput,
  ): Promise<SearchHistoryRow | null> {
    if (historyIdHint) {
      const hinted = await this.findHistoryById(companyId, historyIdHint);
      if (hinted) return hinted as SearchHistoryRow;
    }

    const row = await this.prisma.webscrapingSearchHistory.findUnique({
      where: {
        companyId_searchSignature: {
          companyId,
          searchSignature,
        },
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });
    if (row) return row as SearchHistoryRow;

    if (!input) return null;

    const targetDedupeKey = this.buildHistoryDedupeKey({
      city: input.city,
      state: input.state,
      segment: input.segment,
      filtersJson: input.filtersJson,
      searchSignature: input.searchSignature,
      filters: input.filters,
    });
    const candidates = await this.prisma.webscrapingSearchHistory.findMany({
      where: { companyId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 80,
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    }).catch(() => []);
    return (candidates.find((candidate: any) => this.buildHistoryDedupeKey({
      city: candidate.city,
      state: this.extractSignaturePart(candidate.searchSignature, 'state').toUpperCase(),
      segment: candidate.segment,
      filtersJson: candidate.filtersJson,
      searchSignature: candidate.searchSignature,
    }) === targetDedupeKey) as SearchHistoryRow | undefined) || null;
  }

  private async findHistoryById(companyId: number, historyId: string): Promise<SearchHistoryRow | null> {
    const row = await this.prisma.webscrapingSearchHistory.findFirst({
      where: {
        id: String(historyId || '').trim(),
        companyId,
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });
    return (row as SearchHistoryRow | null) || null;
  }

  private isExecutedUsageEvent(eventType: UsageEventType) {
    return eventType === 'EXECUTED' || eventType === 'GOOGLE_SEARCH_EXECUTED';
  }

  private async findGlobalCacheBySignature(cacheSignature: string): Promise<GlobalCacheRow | null> {
    const row = await this.prisma.webscrapingGlobalCacheEntry.findUnique({
      where: {
        cacheSignature: String(cacheSignature || '').trim(),
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });

    if (!row) return null;
    if (!(row.cacheValidUntil instanceof Date) || row.cacheValidUntil.getTime() <= Date.now()) {
      return null;
    }
    return row as GlobalCacheRow;
  }

  private async findGlobalCacheById(cacheId: string): Promise<GlobalCacheRow | null> {
    const row = await this.prisma.webscrapingGlobalCacheEntry.findUnique({
      where: {
        id: String(cacheId || '').trim(),
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });

    if (!row) return null;
    if (!(row.cacheValidUntil instanceof Date) || row.cacheValidUntil.getTime() <= Date.now()) {
      return null;
    }
    return row as GlobalCacheRow;
  }

  private async touchHistory(historyId: string, userId: number) {
    await this.prisma.webscrapingSearchHistory.update({
      where: { id: historyId },
      data: {
        userId,
        lastUsedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async touchGlobalCache(cacheId: string) {
    await this.prisma.webscrapingGlobalCacheEntry.update({
      where: { id: cacheId },
      data: {
        lastServedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async pruneCompanyHistory(companyId: number, limit = RECENT_HISTORY_LIMIT) {
    const rows = await this.prisma.webscrapingSearchHistory.findMany({
      where: { companyId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 240,
      select: {
        id: true,
        city: true,
        segment: true,
        filtersJson: true,
        searchSignature: true,
      },
    }).catch(() => []);

    if (!rows.length) return;

    const seen = new Set<string>();
    const deleteIds: string[] = [];
    let kept = 0;

    for (const row of rows) {
      const dedupeKey = this.buildHistoryDedupeKey({
        city: row.city,
        state: this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        filtersJson: row.filtersJson,
        searchSignature: row.searchSignature,
      });
      if (seen.has(dedupeKey) || kept >= limit) {
        deleteIds.push(row.id);
        continue;
      }
      seen.add(dedupeKey);
      kept += 1;
    }

    if (deleteIds.length) {
      await this.prisma.webscrapingSearchHistory.deleteMany({
        where: {
          companyId,
          id: { in: deleteIds },
        },
      }).catch(() => null);
    }
  }

  private async persistHistory(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    existingHistoryId: string | null,
  ) {
    const now = new Date();
    const dedupedResults = this.mergeDedupedContacts(results);
    const placeRows = dedupedResults.map((result, index) => ({
      placeId: result.placeId,
      rank: index + 1,
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      rating: result.rating,
      reviews: safeInteger(result.reviews),
      address: result.address || '',
      website: result.website || '',
      source: result.source || null,
      score: result.score == null ? null : result.score,
      opportunityReason: result.opportunityReason || this.buildOpportunityReason(result, input),
    }));

    const saved = await this.prisma.webscrapingSearchHistory.upsert({
      where: {
        companyId_searchSignature: {
          companyId: context.companyId,
          searchSignature: input.searchSignature,
        },
      },
      create: {
        companyId: context.companyId,
        userId: context.userId,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        filtersJson: input.filtersJson,
        searchSignature: input.searchSignature,
        resultCount: dedupedResults.length,
        lastUsedAt: now,
        places: {
          create: placeRows,
        },
      },
      update: {
        userId: context.userId,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        filtersJson: input.filtersJson,
        resultCount: dedupedResults.length,
        lastUsedAt: now,
        places: {
          deleteMany: {},
          create: placeRows,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingHistoryId && existingHistoryId !== saved.id) {
      await this.prisma.webscrapingSearchHistory.delete({
        where: { id: existingHistoryId },
      }).catch(() => null);
    }

    await this.pruneCompanyHistory(context.companyId, RECENT_HISTORY_LIMIT);

    return saved.id;
  }

  private async persistGlobalCache(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    existingCacheId: string | null,
  ) {
    const now = new Date();
    const cacheValidUntil = this.buildGlobalCacheValidUntil(now);
    const placeRows = results.map((result, index) => ({
      placeId: result.placeId,
      rank: index + 1,
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      rating: result.rating,
      reviews: safeInteger(result.reviews),
      address: result.address || '',
      website: result.website || '',
    }));

    const saved = await this.prisma.webscrapingGlobalCacheEntry.upsert({
      where: {
        cacheSignature: input.cacheSignature,
      },
      create: {
        cacheSignature: input.cacheSignature,
        normalizedCity: input.normalizedCity,
        normalizedSegment: input.normalizedSegment,
        filtersJson: input.filtersJson,
        resultCount: results.length,
        cacheValidUntil,
        lastFetchedAt: now,
        lastServedAt: now,
        places: {
          create: placeRows,
        },
      },
      update: {
        normalizedCity: input.normalizedCity,
        normalizedSegment: input.normalizedSegment,
        filtersJson: input.filtersJson,
        resultCount: results.length,
        cacheValidUntil,
        lastFetchedAt: now,
        lastServedAt: now,
        places: {
          deleteMany: {},
          create: placeRows,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingCacheId && existingCacheId !== saved.id) {
      await this.prisma.webscrapingGlobalCacheEntry.delete({
        where: { id: existingCacheId },
      }).catch(() => null);
    }

    return saved.id;
  }

  private buildSpeakerName(user: any) {
    return String(user?.name || user?.username || '').trim() || '[SEU NOME]';
  }

  private buildCompanyName(user: any) {
    return String(
      (user?.masterContext?.active ? user?.masterContext?.companyName : user?.company?.name)
      || user?.company?.name
      || '',
    ).trim() || '[SUA EMPRESA]';
  }

  private buildScriptText(
    result: Omit<WebscrapingContactResult, 'placeId'>,
    city: string,
    segment: string,
    user: any,
  ) {
    return [
      `Oi, tudo bem? Aqui é ${this.buildSpeakerName(user)} da ${this.buildCompanyName(user)}.`,
      `Vi a ${result.name} em ${city} e trabalho com solução para ${segment.toLowerCase()}.`,
      'Posso te explicar em 1 minuto e ver se faz sentido para vocês?',
    ].join(' ');
  }

  private buildExportFilename(segment: string, city: string) {
    const normalize = (value: string) =>
      normalizeLookupValue(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const date = new Date().toISOString().slice(0, 10);
    return `prospeccao-${normalize(segment)}-${normalize(city)}-${date}.xlsx`;
  }

  private buildWhatsAppTarget(phone: string, scriptText: string) {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return '';
    return `https://wa.me/55${digits}?text=${encodeURIComponent(scriptText)}`;
  }

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
  ): Promise<HbxEngineSearchOutput> {
    const engineUrl = this.getHbxScrapingEngineUrl();
    let response: Response;
    const normalizedExcludePhoneDigits = Array.from(
      new Set(excludePhoneDigits.map((phone) => normalizePhoneDigits(phone)).filter(Boolean) as string[]),
    );

    try {
      const body: Record<string, unknown> = {
        city: input.city,
        state: input.state,
        segment: input.segment,
        targetType: input.targetType,
        limit: input.quantity,
        fresh: normalizedExcludePhoneDigits.length > 0,
      };
      if (normalizedExcludePhoneDigits.length > 0) {
        body.excludePhoneDigits = normalizedExcludePhoneDigits;
      }
      response = await fetch(`${engineUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'hbx_scraping_engine_unavailable',
        message: 'Motor HBX Scraping indisponivel.',
      });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'hbx_scraping_engine_unavailable',
        message: 'Motor HBX Scraping recusou a pesquisa.',
      });
    }

    const items = Array.isArray(payload?.results) ? payload.results : [];
    const results: WebscrapingContactResult[] = [];
    const seenPhones = new Set<string>();

    for (const item of items) {
      const mapped = this.mapHbxContactResult(item, input.targetType);
      if (!mapped) continue;
      if (normalizedExcludePhoneDigits.includes(mapped.phoneDigits)) continue;
      if (seenPhones.has(mapped.phoneDigits)) continue;
      seenPhones.add(mapped.phoneDigits);
      results.push(mapped);
      if (results.length >= input.quantity) break;
    }

    const payloadStatus = String(payload?.status || '').trim();
    const status: SearchRunStatus =
      payloadStatus === 'partial_error' || payloadStatus === 'completed_with_errors'
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
    };
  }

  private mapHbxContactResult(item: any, targetType: HbxTargetType): WebscrapingContactResult | null {
    const name = String(item?.name || '').trim();
    const phone = String(item?.phone || '').trim();
    const phoneDigits = normalizePhoneDigits(item?.phoneDigits || phone);

    if (!name || !phone || !isLikelyValidBrPhone(phoneDigits)) {
      return null;
    }

    const score = toNumberOrNull(item?.score);
    const source = String(item?.source || '').trim() || (targetType === 'pj' ? 'hbx_scraping:free_pj' : null);

    return {
      placeId: `hbx:${targetType}:${phoneDigits}`,
      name,
      phone,
      phoneDigits,
      rating: toNumberOrNull(item?.rating),
      reviews: item?.reviews == null ? null : safeInteger(item?.reviews),
      address: String(item?.address || '').trim() || null,
      website: String(item?.website || '').trim() || null,
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
    const apiStatus = String(data?.status || 'OK').trim().toUpperCase();
    if (apiStatus === 'OK' || apiStatus === 'ZERO_RESULTS') {
      return data;
    }

    throw this.buildGoogleApiError(httpStatus, data);
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
