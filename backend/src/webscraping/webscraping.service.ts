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

type RuntimeStatus = 'online' | 'degraded';
type SearchSource = 'history' | 'google' | 'hybrid';

export type NativeRuntimeDiagnostic = {
  status: RuntimeStatus;
  code: string;
  message: string;
  googleApiKeyConfigured: boolean;
};

export type WebscrapingRuntimeResponse = {
  native: NativeRuntimeDiagnostic;
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
    legacy: WebscrapingRuntimeDiagnostic | null;
  };
};

export type WebscrapingSearchFilters = {
  minRating: number | null;
  minReviews: number | null;
  onlyProbableWhatsApp: boolean;
  onlyWithWebsite: boolean;
};

export type WebscrapingContactResult = {
  placeId: string;
  name: string;
  phone: string;
  phoneDigits: string;
  probableWhatsApp: boolean;
  rating: number | null;
  reviews: number;
  address: string;
  website: string;
  googleMapsUrl: string;
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
};

export type SearchContactsInput = {
  city: string;
  segment: string;
  quantity: number;
  minRating?: number | null;
  minReviews?: number | null;
  onlyProbableWhatsApp?: boolean;
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
  url: string;
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
  normalizedCity: string;
  normalizedSegment: string;
};

type SearchExecutionOptions = {
  historyIdHint?: string;
};

type UsageEventType = 'EXECUTED' | 'BLOCKED_DAILY_LIMIT';

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
    probableWhatsApp: boolean;
    rating: number | null;
    reviews: number;
    address: string;
    website: string;
    googleMapsUrl: string;
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
    if (!this.canSeeDiagnostics(user)) {
      return { native };
    }

    let legacy: WebscrapingRuntimeDiagnostic | null = null;
    try {
      legacy = await probeWebscrapingRuntime();
    } catch {
      legacy = null;
    }

    return {
      native,
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

  async searchContactsForUser(
    user: any,
    input: SearchContactsInput,
    options: SearchExecutionOptions = {},
  ): Promise<WebscrapingSearchResponse> {
    const context = this.resolveContext(user);
    const normalized = this.normalizeSearchInput(input);
    await this.assertTrialDailyLimit(context, normalized);
    const historyEnabled = await this.supportsHistoryPersistence();
    const existingHistory = historyEnabled
      ? await this.findHistoryBySignature(context.companyId, normalized.searchSignature, options.historyIdHint)
      : null;
    const storedResults = this.sortContacts(this.restoreStoredResults(existingHistory));

    if (storedResults.length >= normalized.quantity) {
      if (existingHistory) {
        await this.touchHistory(existingHistory.id, context.userId);
      }
      const response = this.buildSearchResponse(normalized, storedResults.slice(0, normalized.quantity), {
        historyId: existingHistory?.id || null,
        source: 'history',
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount: 0,
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length);
      return response;
    }

    const apiKey = this.getApiKey(storedResults.length === 0);
    if (!apiKey) {
      if (existingHistory && storedResults.length > 0) {
        await this.touchHistory(existingHistory.id, context.userId);
        const response = this.buildSearchResponse(normalized, storedResults.slice(0, normalized.quantity), {
          historyId: existingHistory.id,
          source: 'history',
          reusedCount: Math.min(storedResults.length, normalized.quantity),
          fetchedCount: 0,
        });
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length);
        return response;
      }
      throw this.buildConfigurationUnavailableError();
    }

    const results = [...storedResults];
    const seenPhones = new Set(results.map((item) => item.phoneDigits).filter(Boolean));
    const seenPlaces = new Set(results.map((item) => item.placeId).filter(Boolean));
    let fetchedCount = 0;

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
    const historyId = historyEnabled
      ? await this.persistHistory(context, normalized, orderedResults, existingHistory?.id || null)
      : null;

    const response = this.buildSearchResponse(normalized, orderedResults, {
      historyId,
      source: storedResults.length > 0 ? 'hybrid' : 'google',
      reusedCount: storedResults.length,
      fetchedCount,
    });
    await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length);
    return response;
  }

  async listRecentHistoryForUser(user: any, limit = 8) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      return { items: [] as WebscrapingHistorySummary[] };
    }

    const rows = await this.prisma.webscrapingSearchHistory.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(Math.trunc(limit || 0), 1), 20),
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
          take: 3,
        },
      },
    });

    return {
      items: rows.map((row) => ({
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
      })),
    };
  }

  async reuseHistorySearchForUser(user: any, historyId: string) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      throw new NotFoundException('Historico indisponivel neste ambiente.');
    }

    const row = await this.prisma.webscrapingSearchHistory.findFirst({
      where: {
        id: String(historyId || '').trim(),
        companyId: context.companyId,
      },
    });

    if (!row) {
      throw new NotFoundException('Pesquisa anterior nao encontrada.');
    }

    const filters = this.parseFiltersJson(row.filtersJson);
    return this.searchContactsForUser(
      user,
      {
        city: row.city,
        segment: row.segment,
        quantity: row.quantity,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyProbableWhatsApp: filters.onlyProbableWhatsApp,
        onlyWithWebsite: filters.onlyWithWebsite,
      },
      { historyIdHint: row.id },
    );
  }

  async exportContactsForUser(user: any, input: SearchContactsInput) {
    const response = await this.searchContactsForUser(user, input);
    const workbook = XLSX.utils.book_new();
    const rows = response.results.map((result) => ({
      Nome: result.name,
      Telefone: result.phone,
      'WhatsApp provavel': result.probableWhatsApp ? 'Sim' : 'Nao',
      Nota: result.rating ?? '',
      Avaliacoes: result.reviews,
      Endereco: result.address,
      Website: result.website ? 'Abrir site' : '',
      'Google Maps': result.googleMapsUrl ? 'Abrir mapa' : '',
      'Roteiro pronto': this.buildScriptText(result, response.query.city, response.query.segment, user),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 10 },
      { wch: 12 },
      { wch: 42 },
      { wch: 14 },
      { wch: 16 },
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
        const cell = worksheet[`G${rowIndex}`] || { t: 's', v: 'Abrir site' };
        cell.t = 's';
        cell.v = 'Abrir site';
        cell.l = { Target: result.website, Tooltip: 'Abrir site' };
        worksheet[`G${rowIndex}`] = cell;
      }

      if (result.googleMapsUrl) {
        const cell = worksheet[`H${rowIndex}`] || { t: 's', v: 'Abrir mapa' };
        cell.t = 's';
        cell.v = 'Abrir mapa';
        cell.l = { Target: result.googleMapsUrl, Tooltip: 'Abrir mapa' };
        worksheet[`H${rowIndex}`] = cell;
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
    const companyId = Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId, user };
  }

  private canSeeDiagnostics(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    return Boolean(user?.isSystemMaster) || role === 'ADMIN';
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

  private async assertTrialDailyLimit(context: SearchExecutionContext, input: NormalizedSearchInput) {
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        id: true,
        onboardingStatus: true,
        paymentStatus: true,
        subscriptionStatus: true,
      },
    });

    if (!company || !this.isTrialDailyLimitedCompany(company)) {
      return;
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    if (todayExecutions < 1) {
      return;
    }

    const message = 'No free trial, o webscraping permite 1 busca por dia. Volte amanhã ou ative uma conta paga.';
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
  ) {
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    await this.prisma.webscrapingUsageLog.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        eventType,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        resultCount: Math.max(0, Math.trunc(resultCount || 0)),
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
      onlyProbableWhatsApp: coerceBoolean(input.onlyProbableWhatsApp),
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
        onlyProbableWhatsApp: Boolean(parsed?.onlyProbableWhatsApp),
        onlyWithWebsite: Boolean(parsed?.onlyWithWebsite),
      };
    } catch {
      return {
        minRating: null,
        minReviews: null,
        onlyProbableWhatsApp: false,
        onlyWithWebsite: false,
      };
    }
  }

  private buildSearchResponse(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    meta: {
      historyId: string | null;
      source: SearchSource;
      reusedCount: number;
      fetchedCount: number;
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
      probableWhatsApp: Boolean(place.probableWhatsApp),
      rating: place.rating == null ? null : Number(place.rating),
      reviews: Math.max(0, Math.trunc(place.reviews || 0)),
      address: place.address || '',
      website: place.website || '',
      googleMapsUrl: place.googleMapsUrl || '',
    }));
  }

  private matchesFilters(result: WebscrapingContactResult, filters: WebscrapingSearchFilters) {
    if (filters.minRating != null && (result.rating == null || result.rating < filters.minRating)) {
      return false;
    }
    if (filters.minReviews != null && result.reviews < filters.minReviews) {
      return false;
    }
    if (filters.onlyProbableWhatsApp && !result.probableWhatsApp) {
      return false;
    }
    if (filters.onlyWithWebsite && !String(result.website || '').trim()) {
      return false;
    }
    return true;
  }

  private sortContacts(results: WebscrapingContactResult[]) {
    return [...results].sort((left, right) => {
      if (Number(right.probableWhatsApp) !== Number(left.probableWhatsApp)) {
        return Number(right.probableWhatsApp) - Number(left.probableWhatsApp);
      }
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

  private async findHistoryBySignature(companyId: number, searchSignature: string, historyIdHint?: string): Promise<SearchHistoryRow | null> {
    if (historyIdHint) {
      const hinted = await this.prisma.webscrapingSearchHistory.findFirst({
        where: {
          id: String(historyIdHint || '').trim(),
          companyId,
        },
        include: {
          places: {
            orderBy: [{ rank: 'asc' }],
          },
        },
      });
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

  private async touchHistory(historyId: string, userId: number) {
    await this.prisma.webscrapingSearchHistory.update({
      where: { id: historyId },
      data: {
        userId,
        lastUsedAt: new Date(),
      },
    }).catch(() => null);
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
      probableWhatsApp: result.probableWhatsApp,
      rating: result.rating,
      reviews: result.reviews,
      address: result.address,
      website: result.website,
      googleMapsUrl: result.googleMapsUrl,
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
      `Oi, tudo bem? Aqui e ${this.buildSpeakerName(user)} da ${this.buildCompanyName(user)}.`,
      `Vi a ${result.name} em ${city} e trabalho com solucao para ${segment.toLowerCase()}.`,
      'Posso te explicar em 1 minuto e ver se faz sentido para voces?',
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
      probableWhatsApp: isLikelyWhatsapp(resolvedPhone),
      rating: toNumberOrNull(details.rating),
      reviews: Math.max(0, Math.trunc(toNumberOrNull(details.userRatingsTotal) || 0)),
      address: details.formattedAddress || '',
      website: details.website || '',
      googleMapsUrl: details.url || '',
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
          'googleMapsUri',
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
      url: String(data?.googleMapsUri || '').trim(),
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
        'url',
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
      url: String(result?.url || '').trim(),
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
