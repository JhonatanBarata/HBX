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

const PLACES_NEW_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_NEW_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const MAX_QUANTITY = 20;
const GLOBAL_CACHE_TTL_HOURS = 24;
const TRIAL_DAILY_MOTOR_LIMIT = 2;
const RECENT_HISTORY_LIMIT = 20;
const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type RuntimeStatus = 'online' | 'degraded';
type SearchSource = 'history' | 'google' | 'hybrid' | 'global_cache';

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

export type WebscrapingRuntimeResponse = {
  native: NativeRuntimeDiagnostic;
  quota: {
    remainingSearches: number | null;
    dailyLimit: number | null;
    isTrialLimited: boolean;
    accessMode: 'full' | 'trial' | 'blocked';
  };
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
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
  reviews: number;
  address: string;
  website: string;
};

export type WebscrapingSearchResponse = {
  query: {
    city: string;
    segment: string;
    quantity: number;
    filters: WebscrapingSearchFilters;
  };
  meta: {
    historyId: string | null;
    source: SearchSource;
    reusedCount: number;
    fetchedCount: number;
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
  city: string;
  segment: string;
  quantity: number;
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
  segment: string;
  quantity: number;
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

type UsageEventType = 'EXECUTED' | 'MOTOR_EXECUTED' | 'BLOCKED_DAILY_LIMIT';

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

function clampQuantity(value: number) {
  return Math.min(Math.max(Math.trunc(value || 0), 1), MAX_QUANTITY);
}

function normalizeLookupValue(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

@Injectable()
export class WebscrapingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRuntime(user: any): Promise<WebscrapingRuntimeResponse> {
    const native = this.inspectNativeRuntime();
    const quota = await this.buildRuntimeQuota(user);
    if (!this.canSeeDiagnostics(user)) {
      return { native, quota };
    }

    let legacy: WebscrapingRuntimeDiagnostic | null = null;
    try {
      legacy = await probeWebscrapingRuntime();
    } catch {
      legacy = null;
    }

    return {
      native,
      quota,
      diagnostics: {
        checkedAt: new Date().toISOString(),
        nativeTechnicalMessage: this.buildNativeTechnicalMessage(native),
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
    const historyEnabled = await this.supportsHistoryPersistence();
    const existingHistory = historyEnabled
      ? await this.findHistoryBySignature(context.companyId, normalized.searchSignature, options.historyIdHint)
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
        return response;
      }
      throw this.buildConfigurationUnavailableError();
    }

    await this.assertTrialDailyLimit(context, normalized);

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
              await this.recordUsageLog(context, normalized, 'MOTOR_EXECUTED', response.results.length, null, response.meta);
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
      ...rows.map((row) => ({
        id: row.id,
        city: row.city,
        segment: row.segment,
        quantity: row.quantity,
        resultCount: row.resultCount,
        filters: this.parseFiltersJson(row.filtersJson),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        preview: row.places.map((place) => place.name).filter(Boolean),
        scope: 'company' as const,
        sourceLabel: 'Historico da empresa',
        cacheValidUntil: null,
        dedupeKey: this.buildHistoryDedupeKey({
          city: row.city,
          segment: row.segment,
          filtersJson: row.filtersJson,
        }),
      })),
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

      const filters = this.parseFiltersJson(row.filtersJson);
      const normalized = this.normalizeSearchInput({
        city: row.normalizedCity,
        segment: row.normalizedSegment,
        quantity: Math.min(Math.max(Math.trunc(row.resultCount || 0), 1), MAX_QUANTITY),
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyWithWebsite: filters.onlyWithWebsite,
      });
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

    const filters = this.parseFiltersJson(row.filtersJson);
    const normalized = this.normalizeSearchInput({
      city: row.city,
      segment: row.segment,
      quantity: row.quantity,
      minRating: filters.minRating,
      minReviews: filters.minReviews,
      onlyWithWebsite: filters.onlyWithWebsite,
    });
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

  private isTrialDailyLimitedCompany(company: any) {
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const premiumAccess = Boolean(company?.premiumAccess);
    if (
      premiumAccess ||
      onboardingStatus === 'active_paid' ||
      paymentStatus === 'PAID' ||
      paymentStatus === 'MANUAL' ||
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'manual'
    ) {
      return false;
    }
    return (
      onboardingStatus === 'active_trial' ||
      onboardingStatus === 'pending_email_confirmation' ||
      paymentStatus === 'TRIAL' ||
      subscriptionStatus === 'trialing'
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
      },
    });

    if (!company || !this.isTrialDailyLimitedCompany(company)) {
      return {
        remainingSearches: null,
        dailyLimit: null,
        isTrialLimited: false,
        accessMode: 'full' as const,
      };
    }

    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) {
      return {
        remainingSearches: TRIAL_DAILY_MOTOR_LIMIT,
        dailyLimit: TRIAL_DAILY_MOTOR_LIMIT,
        isTrialLimited: true,
        accessMode: 'trial' as const,
      };
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayMotorExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'MOTOR_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    return {
      remainingSearches: Math.max(0, TRIAL_DAILY_MOTOR_LIMIT - todayMotorExecutions),
      dailyLimit: TRIAL_DAILY_MOTOR_LIMIT,
      isTrialLimited: true,
      accessMode: 'trial' as const,
    };
  }

  private async assertTrialDailyLimit(context: SearchExecutionContext, input: NormalizedSearchInput) {
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
      },
    });

    if (!company || !this.isTrialDailyLimitedCompany(company)) {
      return;
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayMotorExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'MOTOR_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    if (todayMotorExecutions < TRIAL_DAILY_MOTOR_LIMIT) {
      return;
    }

    const message = `No free trial, o webscraping permite ${TRIAL_DAILY_MOTOR_LIMIT} usos do motor por dia. Reaproveitamentos nao contam. Volte amanha ou ative uma conta paga.`;
    await this.recordUsageLog(context, input, 'BLOCKED_DAILY_LIMIT', 0, message);
    throw new ForbiddenException({
      code: 'trial_daily_limit_reached',
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

  private normalizeSearchInput(input: SearchContactsInput): NormalizedSearchInput {
    const city = String(input.city || '').trim();
    const segment = String(input.segment || '').trim();
    const quantity = clampQuantity(input.quantity);

    if (!city) {
      throw new BadRequestException('Cidade obrigatoria.');
    }

    if (!segment) {
      throw new BadRequestException('Segmento obrigatorio.');
    }

    const filters: WebscrapingSearchFilters = {
      minRating: this.normalizeMinRating(input.minRating),
      minReviews: this.normalizeMinReviews(input.minReviews),
      onlyWithWebsite: coerceBoolean(input.onlyWithWebsite),
    };
    const filtersJson = JSON.stringify(filters);
    const normalizedCity = normalizeLookupValue(city);
    const normalizedSegment = normalizeLookupValue(segment);

    return {
      city,
      segment,
      quantity,
      filters,
      filtersJson,
      cacheSignature: [
        `city:${normalizedCity}`,
        `segment:${normalizedSegment}`,
        `filters:${filtersJson}`,
      ].join('|'),
      searchSignature: [
        `city:${normalizedCity}`,
        `segment:${normalizedSegment}`,
        `quantity:${quantity}`,
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

  private buildHistoryDedupeKey(input: {
    city?: string | null;
    segment?: string | null;
    filtersJson?: string | null;
    filters?: WebscrapingSearchFilters | null;
  }) {
    const filters = input.filters || this.parseFiltersJson(input.filtersJson);
    return [
      `city:${normalizeLookupValue(String(input.city || ''))}`,
      `segment:${normalizeLookupValue(String(input.segment || ''))}`,
      `filters:${JSON.stringify(filters)}`,
    ].join('|');
  }

  private buildSearchResponse(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    meta: {
      historyId: string | null;
      source: SearchSource;
      reusedCount: number;
      fetchedCount: number;
      technicalCacheUsed: boolean;
      technicalCacheReusedCount: number;
      technicalCacheValidUntil: string | null;
    },
  ): WebscrapingSearchResponse {
    return {
      query: {
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        filters: input.filters,
      },
      meta,
      results: results.map(({ placeId: _placeId, ...result }) => result),
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
      address: place.address || '',
      website: place.website || '',
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
      address: place.address || '',
      website: place.website || '',
    }));
  }

  private matchesFilters(result: WebscrapingContactResult, filters: WebscrapingSearchFilters) {
    if (filters.minRating != null && (result.rating == null || result.rating < filters.minRating)) {
      return false;
    }
    if (filters.minReviews != null && result.reviews < filters.minReviews) {
      return false;
    }
    if (filters.onlyWithWebsite && !String(result.website || '').trim()) {
      return false;
    }
    return true;
  }

  private sortContacts(results: WebscrapingContactResult[]) {
    return [...results].sort((left, right) => {
      const ratingDelta = (right.rating || 0) - (left.rating || 0);
      if (ratingDelta !== 0) return ratingDelta;
      if (right.reviews !== left.reviews) return right.reviews - left.reviews;
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

  private async findHistoryBySignature(companyId: number, searchSignature: string, historyIdHint?: string): Promise<SearchHistoryRow | null> {
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
    return (row as SearchHistoryRow | null) || null;
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
    return eventType === 'EXECUTED' || eventType === 'MOTOR_EXECUTED';
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
      },
    }).catch(() => []);

    if (!rows.length) return;

    const seen = new Set<string>();
    const deleteIds: string[] = [];
    let kept = 0;

    for (const row of rows) {
      const dedupeKey = this.buildHistoryDedupeKey({
        city: row.city,
        segment: row.segment,
        filtersJson: row.filtersJson,
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
    const placeRows = results.map((result, index) => ({
      placeId: result.placeId,
      rank: index + 1,
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      rating: result.rating,
      reviews: result.reviews,
      address: result.address,
      website: result.website,
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
        resultCount: results.length,
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
        resultCount: results.length,
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
      reviews: result.reviews,
      address: result.address,
      website: result.website,
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
