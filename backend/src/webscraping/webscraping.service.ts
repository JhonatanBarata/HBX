import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { probeWebscrapingRuntime, type WebscrapingRuntimeDiagnostic } from '../modules/webscraping-runtime.util';
import { PrismaService } from '../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { buildLocalHbxEngineUrls, getConfiguredHbxEngineCount, HbxEnginePoolService, isHbxEngineLocalhostUrl, type HbxEngineLease, type HbxEnginePurpose } from './hbx-engine-pool.service';
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
const MASS_DATA_INTERNAL_SEGMENTS = [
  'empresas',
  'comércio',
  'serviços',
  'lojas',
  'whatsapp',
  'telefone',
  'restaurantes',
  'mercados',
  'oficinas',
  'auto peças',
  'salões de beleza',
  'barbearias',
  'cosméticos',
  'perfumarias',
  'farmácias',
  'clínicas',
  'dentistas',
  'pet shops',
  'materiais de construção',
  'papelarias',
  'lojas de roupas',
  'assistência técnica',
  'hotéis',
  'pousadas',
  'distribuidoras',
  'contabilidades',
  'imobiliárias',
  'academias',
];
const ACRE_CITIES_FALLBACK = [
  'Acrelândia',
  'Assis Brasil',
  'Brasiléia',
  'Bujari',
  'Capixaba',
  'Cruzeiro do Sul',
  'Epitaciolândia',
  'Feijó',
  'Jordão',
  'Mâncio Lima',
  'Manoel Urbano',
  'Marechal Thaumaturgo',
  'Plácido de Castro',
  'Porto Acre',
  'Porto Walter',
  'Rio Branco',
  'Rodrigues Alves',
  'Santa Rosa do Purus',
  'Sena Madureira',
  'Senador Guiomard',
  'Tarauacá',
  'Xapuri',
];
const AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK = [
  { city: 'São Paulo', state: 'SP' },
  { city: 'Rio de Janeiro', state: 'RJ' },
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Porto Alegre', state: 'RS' },
  { city: 'Florianópolis', state: 'SC' },
  { city: 'Salvador', state: 'BA' },
  { city: 'Recife', state: 'PE' },
  { city: 'Fortaleza', state: 'CE' },
  { city: 'Goiânia', state: 'GO' },
  { city: 'Brasília', state: 'DF' },
  { city: 'Vitória', state: 'ES' },
  { city: 'Cuiabá', state: 'MT' },
  { city: 'Campo Grande', state: 'MS' },
  { city: 'Manaus', state: 'AM' },
  { city: 'Belém', state: 'PA' },
  { city: 'São Luís', state: 'MA' },
  { city: 'João Pessoa', state: 'PB' },
  { city: 'Maceió', state: 'AL' },
  { city: 'Natal', state: 'RN' },
];
const AUTONOMOUS_MASS_DATA_DEFAULT_TASKS = 60;
const AUTONOMOUS_MASS_DATA_MAX_TASKS = 300;
const DEFAULT_MASS_DATA_ENGINE_URLS = buildLocalHbxEngineUrls();
const TURBO_OPERATIONAL_CONFIG_KEY = 'turbo_noturno';
const RADAR_PROTECTED_STATUSES = [
  'negative',
  'denied',
  'blocked',
  'opt_out',
  'optout',
  'do_not_contact',
  'complaint',
  'discarded',
  'hidden',
  'lost',
  'no_whatsapp',
  'invalid_whatsapp',
  'invalid_phone',
] as const;

type RuntimeStatus = 'online' | 'degraded';
type ExternalRuntimeStatus = 'online' | 'offline';
type SearchSource = 'history' | 'google' | 'hbx' | 'hybrid' | 'global_cache' | 'radar_database';
type WebscrapingEngine = 'google' | 'hbx';
type HbxTargetType = 'pj' | 'pf' | 'agenda_pf';
type SearchRunStatus = 'completed' | 'partial_error' | 'completed_with_errors' | 'completed_insufficient_results';
type WebscrapingSearchRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial_error'
  | 'completed_insufficient_results'
  | 'failed'
  | 'canceled';
type WebscrapingSearchRunItemStatus = 'found' | 'duplicate' | 'skipped' | 'invalid';
type HbxBatchStatus =
  | 'queued_wait'
  | 'running_batch'
  | 'batch_success'
  | 'empty_batch'
  | 'batch_error'
  | 'engine_error'
  | 'completed'
  | 'completed_insufficient_results'
  | 'failed'
  | 'canceled';
type HbxEngineSearchOutput = {
  results: WebscrapingContactResult[];
  status: SearchRunStatus;
  message: string | null;
  httpStatus: number | null;
  rawErrorMessage: string | null;
  rejectedCount: number;
  duplicateCount: number;
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

export type WebscrapingSearchRunResponse = {
  id: string;
  runId: string;
  status: WebscrapingSearchRunStatus;
  city: string;
  state: string | null;
  segment: string;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  targetQuantity: number;
  foundCount: number;
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorMessage: string | null;
  attemptCount: number;
  failedBatchCount: number;
  consecutiveEmptyBatchCount: number;
  consecutiveEngineErrorCount: number;
  lastBatchError: string | null;
  lastBatchStatus: HbxBatchStatus | null;
  nextRetryAt: string | null;
  lastQueryUsed: string | null;
  lastEngineUrl: string | null;
  assignedEngineId: string | null;
  assignedEngineIndex: number | null;
  batchLimit: number;
  maxAttempts: number;
  operationalStatus?: 'healthy' | 'degraded';
  operationalMessage?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  query: WebscrapingSearchResponse['query'];
  meta: WebscrapingSearchResponse['meta'] & {
    runId: string;
    duplicateCount: number;
    skippedCount: number;
    importedCount: number;
  };
  items: Array<{
    id: string;
    placeId: string;
    name: string;
    phone: string;
    phoneDigits: string;
    website: string | null;
    websiteKey: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    segment: string | null;
    source: string | null;
    status: WebscrapingSearchRunItemStatus;
    duplicateReason: string | null;
    createdAt: string;
  }>;
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
  excludePhoneDigits?: string[];
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
  excludePhoneDigits: string[];
};

type SearchExecutionOptions = {
  historyIdHint?: string;
  skipRadarLookup?: boolean;
  skipRadarPersist?: boolean;
  skipPrivateHistory?: boolean;
  skipTechnicalCache?: boolean;
  recordUsage?: boolean;
  hbxEngineUrl?: string;
  usageEventType?: UsageEventType;
  purpose?: HbxEnginePurpose;
};

type NormalizeSearchInputOptions = {
  allowMissingHbxState?: boolean;
};

type UsageEventType = 'EXECUTED' | 'GOOGLE_SEARCH_EXECUTED' | 'GOOGLE_EMERGENCY_EXECUTED' | 'BLOCKED_DAILY_LIMIT';

type UsageExecutionMeta = {
  source?: SearchSource;
  reusedCount?: number;
  fetchedCount?: number;
  technicalCacheUsed?: boolean;
  technicalCacheReusedCount?: number;
};

type RadarWebsiteStatus = 'none' | 'present' | 'social_only' | 'weak' | 'unreachable' | 'unknown';
type RadarOpportunityLevel = 'high' | 'medium' | 'low' | null;

type RadarFiltersInput = {
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  quantity?: number | null;
  limit?: number | null;
  page?: number | null;
  filterKey?: string | null;
  status?: string | null;
  ddd?: string | null;
  scoreRange?: string | null;
  source?: string | null;
  minRating?: number | null;
  minReviews?: number | null;
  noWebsite?: boolean | string | null;
  withWebsite?: boolean | string | null;
  weakWebsite?: boolean | string | null;
  validPhone?: boolean | string | null;
  likelyWhatsapp?: boolean | string | null;
  highOpportunity?: boolean | string | null;
  opportunityLevel?: string | null;
  includeHidden?: boolean | string | null;
  engine?: WebscrapingEngine | string | null;
  targetType?: HbxTargetType | string | null;
  desiredStock?: number | null;
  minimumStock?: number | null;
};

type RadarLeadEventType =
  | 'found'
  | 'imported_to_vendas'
  | 'contacted'
  | 'denied'
  | 'negative'
  | 'blocked'
  | 'opt_out'
  | 'discarded'
  | 'complaint'
  | 'no_answer'
  | 'no_whatsapp'
  | 'invalid_whatsapp'
  | 'hidden'
  | 'duplicate'
  | 'status_changed';

type RadarLeadStatus =
  | 'clean'
  | 'new'
  | 'approved'
  | 'sent_to_vendas'
  | 'in_attendance'
  | 'converted'
  | 'denied'
  | 'negative'
  | 'blocked'
  | 'opt_out'
  | 'discarded'
  | 'complaint'
  | 'no_answer'
  | 'no_whatsapp'
  | 'invalid_whatsapp'
  | 'duplicate'
  | 'rejected'
  | 'hidden';

type RadarCampaignInput = {
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  mode?: string | null;
  targetType?: HbxTargetType | 'both' | string | null;
  targetTotal?: number | null;
  batchSize?: number | null;
  maxAttemptsPerTask?: number | null;
  nightOnly?: boolean | string | null;
  allowedStartHour?: number | null;
  allowedEndHour?: number | null;
  timezone?: string | null;
};

type WebscrapingOperationalConfigInput = {
  enabled?: boolean | string | null;
  startHour?: number | null;
  startMinute?: number | null;
  endHour?: number | null;
  endMinute?: number | null;
  engineCount?: number | null;
  intensity?: string | null;
  memoryTargetGb?: number | null;
  batchSize?: number | null;
  maxAttemptsPerTask?: number | null;
  autonomousFillEnabled?: boolean | string | null;
  autonomousFillBatchSize?: number | null;
  forceNow?: boolean | string | null;
  forcedUntil?: string | null;
};

type MasterMassDataCampaignInput = RadarCampaignInput & WebscrapingOperationalConfigInput & {
  companyId?: number | string | null;
};

type AutonomousMassDataStrategyMode = 'guided' | 'automatic';
type AutonomousMassDataWorkReason = 'guided_filter' | 'low_stock' | 'low_duplicate_recent' | 'unexplored' | 'fallback_national';

type AutonomousMassDataWork = {
  mode: AutonomousMassDataStrategyMode;
  state: string;
  city: string;
  segment: string;
  targetType: HbxTargetType;
  desiredStock: number;
  minimumStock: number;
  reason: AutonomousMassDataWorkReason;
  stockCount: number;
};

type AutonomousMassDataCandidate = AutonomousMassDataWork & {
  key: string;
  taskExists: boolean;
  duplicateRatio: number;
  explored: boolean;
  lastWorkedAt: Date | null;
};

type NormalizedRadarFilters = {
  city: string;
  state: string;
  segment: string;
  normalizedCity: string;
  normalizedSegment: string;
  quantity: number;
  limit: number;
  page: number;
  filterKey: string;
  status: string;
  ddd: string;
  scoreRange: string;
  source: string;
  minRating: number | null;
  minReviews: number | null;
  noWebsite: boolean;
  withWebsite: boolean;
  weakWebsite: boolean;
  validPhone: boolean;
  likelyWhatsapp: boolean;
  opportunityLevel: RadarOpportunityLevel;
  includeHidden: boolean;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  desiredStock: number;
  minimumStock: number;
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

type HistoryPlaceColumnSupport = {
  source: boolean;
  score: boolean;
  opportunityReason: boolean;
};

class GooglePlacesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class HbxBatchError extends ServiceUnavailableException {
  constructor(
    readonly httpStatus: number | null,
    readonly rawMessage: string,
    readonly retryable: boolean,
    readonly code = 'hbx_batch_error',
  ) {
    super({
      code,
      message: rawMessage || 'Falha no lote do Motor HBX.',
      httpStatus,
      retryable,
    });
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

function inferWebsiteStatus(value: string | null | undefined): RadarWebsiteStatus {
  const website = String(value || '').trim();
  if (!website) return 'none';
  const host = getWebsiteHost(website);
  if (!host) return 'unknown';
  const socialHosts = [
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'youtube.com',
    'x.com',
    'twitter.com',
    'wa.me',
    'whatsapp.com',
  ];
  if (socialHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'social_only';
  const weakHosts = [
    'linktr.ee',
    'bio.link',
    'beacons.ai',
    'wixsite.com',
    'weebly.com',
    'blogspot.com',
    'wordpress.com',
    'sites.google.com',
    'business.site',
    'google.com',
    'google.com.br',
  ];
  if (weakHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'weak';
  return 'present';
}

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
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

function normalizeEnginePurpose(value: unknown): HbxEnginePurpose {
  const purpose = String(value || '').trim().toLowerCase();
  if (purpose === 'radar_pull' || purpose === 'vendas' || purpose === 'autonomous' || purpose === 'mass_data') {
    return purpose;
  }
  return 'manual';
}

function isAutomaticEnginePurpose(purpose: HbxEnginePurpose) {
  return purpose === 'autonomous' || purpose === 'mass_data';
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

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = toNumberOrNull(value);
  const parsed = numeric == null ? fallback : Math.trunc(numeric);
  return Math.min(Math.max(parsed, min), max);
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(String(process.env[name] || '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000);
}

function formatCityWithState(city: string, state: string | null | undefined) {
  const safeCity = String(city || '').trim();
  const safeState = String(state || '').trim().toUpperCase();
  if (!safeCity || !safeState) return safeCity;
  if (new RegExp(`\\s-\\s${safeState}$`, 'i').test(safeCity)) return safeCity;
  return `${safeCity} - ${safeState}`;
}

@Injectable()
export class WebscrapingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebscrapingService.name);
  private searchRunQueuePumpActive = false;
  private radarCampaignPumpActive = false;
  private radarCampaignTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private hbxEnginePool?: HbxEnginePoolService,
    @Optional() @Inject(forwardRef(() => VendasService))
    private readonly vendasService?: VendasService,
  ) {}

  onModuleInit() {
    this.radarCampaignTimer = setInterval(() => {
      void this.processNextRadarCampaigns();
    }, 30_000);
    setTimeout(() => {
      void this.recoverRadarCampaignWork();
    }, 1_000);
    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, 2_000);
    setTimeout(() => {
      void this.processNextRadarCampaigns();
    }, 2_000);
  }

  onModuleDestroy() {
    if (this.radarCampaignTimer) {
      clearInterval(this.radarCampaignTimer);
      this.radarCampaignTimer = null;
    }
  }

  private getEnginePool() {
    if (!this.hbxEnginePool) {
      this.hbxEnginePool = new HbxEnginePoolService(this.prisma);
    }
    return this.hbxEnginePool;
  }

  private async canAcquireHbxEngineFromPool() {
    return Boolean((this.prisma as any).hbxEngineLock?.updateMany)
      && await this.prisma.hasTable('HbxEngineLock').catch(() => false);
  }

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

  async startSearchRunForUser(user: any, input: SearchContactsInput) {
    const context = this.resolveContext(user);
    const normalized = this.normalizeSearchInput({
      ...input,
      engine: 'hbx',
      targetType: input?.targetType || 'pj',
    });
    await this.assertSearchRunPersistence();

    const canReadRadarDatabase = normalized.targetType === 'pj'
      ? await this.supportsRadarPersistence().catch(() => false)
      : false;
    const databaseResults = canReadRadarDatabase
      ? await this.listRadarContactsForSearch(context, normalized).catch(() => [])
      : [];

    if (databaseResults.length >= normalized.quantity) {
      const now = new Date();
      const run = await this.prisma.webscrapingSearchRun.create({
        data: {
          companyId: context.companyId,
          userId: context.userId,
          status: 'completed',
          city: normalized.city,
          state: normalized.state || null,
          segment: normalized.segment,
          engine: normalized.engine,
          targetType: normalized.targetType,
          targetQuantity: normalized.quantity,
          startedAt: now,
          finishedAt: now,
          errorMessage: 'Entregue do banco Radar/HBX. A frota M1-M4 nao foi acionada.',
        },
        select: {
          id: true,
          status: true,
          city: true,
          state: true,
          segment: true,
          engine: true,
          targetType: true,
          targetQuantity: true,
          createdAt: true,
        },
      });

      await this.saveSearchRunResults(
        context,
        normalized,
        run.id,
        databaseResults.slice(0, normalized.quantity),
        'radar_database',
      );
      await this.recalculateSearchRunCounters(run.id);
      await this.persistSearchRunHistoryIfPossible(run.id, normalized, context).catch(() => null);

      return {
        runId: run.id,
        id: run.id,
        status: run.status as WebscrapingSearchRunStatus,
        query: {
          city: run.city,
          state: run.state || null,
          segment: run.segment,
          quantity: run.targetQuantity,
          engine: normalizeEngine(run.engine),
          targetType: normalizeTargetType(run.targetType),
          filters: normalized.filters,
        },
        createdAt: run.createdAt.toISOString(),
      };
    }

    const run = await this.prisma.webscrapingSearchRun.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: 'queued',
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment,
        engine: normalized.engine,
        targetType: normalized.targetType,
        targetQuantity: normalized.quantity,
      },
      select: {
        id: true,
        status: true,
        city: true,
        state: true,
        segment: true,
        engine: true,
        targetType: true,
        targetQuantity: true,
        createdAt: true,
      },
    });

    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, 0);

    return {
      runId: run.id,
      id: run.id,
      status: run.status as WebscrapingSearchRunStatus,
      query: {
        city: run.city,
        state: run.state || null,
        segment: run.segment,
        quantity: run.targetQuantity,
        engine: normalizeEngine(run.engine),
        targetType: normalizeTargetType(run.targetType),
        filters: normalized.filters,
      },
      createdAt: run.createdAt.toISOString(),
    };
  }

  async getSearchRunForUser(user: any, runId: string): Promise<WebscrapingSearchRunResponse> {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Pesquisa nao encontrada.');
    const capacity = await this.getEnginePool().getCurrentCapacityLevel().catch(() => null);
    return this.buildSearchRunResponse(run, capacity || undefined);
  }

  async cancelSearchRunForUser(user: any, runId: string): Promise<WebscrapingSearchRunResponse> {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    const current = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });
    if (!current) throw new NotFoundException('Pesquisa nao encontrada.');

    if (!this.isTerminalSearchRunStatus(current.status)) {
      await this.prisma.webscrapingSearchRun.update({
        where: { id: current.id },
        data: {
          status: 'canceled',
          finishedAt: new Date(),
          errorMessage: 'Pesquisa cancelada pelo usuario.',
        },
      });
    }

    return this.getSearchRunForUser(user, current.id);
  }

  async searchContactsForUser(
    user: any,
    input: SearchContactsInput,
    options: SearchExecutionOptions = {},
  ): Promise<WebscrapingSearchResponse> {
    const context = this.resolveContext(user);
    const purpose = normalizeEnginePurpose(options.purpose);
    const requestedEngine = normalizeEngine(input?.engine);
    const safeInput: SearchContactsInput = isAutomaticEnginePurpose(purpose) && requestedEngine === 'google'
      ? { ...input, engine: 'hbx' }
      : input;
    if (safeInput !== input) {
      this.logger.warn(`[engine-scheduler] google blocked for ${purpose} purpose`);
      this.logger.warn('[autonomous-bank] skipped google for autonomous bank');
    }
    const normalized = this.normalizeSearchInput(safeInput);
    this.logSearchSelection(normalized);
    const hasExplicitExclusions = normalized.excludePhoneDigits.length > 0;
    const radarEnabled = !options.skipRadarLookup && normalized.targetType === 'pj'
      ? await this.supportsRadarPersistence()
      : false;
    const radarResults = radarEnabled
      ? await this.listRadarContactsForSearch(context, normalized)
      : [];
    const historyEnabled = !options.skipPrivateHistory && await this.supportsHistoryPersistence();
    const existingHistory = historyEnabled
      ? await this.findHistoryBySignature(context.companyId, normalized.searchSignature, options.historyIdHint, normalized)
      : null;
    const companyStoredResults = hasExplicitExclusions
      ? []
      : this.sortContacts(this.restoreStoredResults(existingHistory))
        .filter((result) => this.matchesFilters(result, normalized.filters));
    const storedResults = this.sortContacts(this.mergeDedupedContacts([...radarResults, ...companyStoredResults]))
      .filter((result) => this.matchesFilters(result, normalized.filters));
    const globalCacheEnabled = !options.skipTechnicalCache && await this.supportsGlobalCachePersistence();
    const globalCacheEntry = globalCacheEnabled
      ? await this.findGlobalCacheBySignature(normalized.cacheSignature)
      : null;
    const cachedPublicResults = this.sortContacts(this.restoreGlobalCacheResults(globalCacheEntry))
      .filter((result) => this.matchesFilters(result, normalized.filters));

    if (storedResults.length >= normalized.quantity) {
      if (existingHistory) {
        await this.touchHistory(existingHistory.id, context.userId);
      }
      const response = this.buildSearchResponse(normalized, storedResults.slice(0, normalized.quantity), {
        historyId: existingHistory?.id || null,
        source: this.buildStoredResultSource(radarResults, companyStoredResults),
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount: 0,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
      });
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    if (normalized.engine === 'hbx') {
      const results = [...storedResults];
      const seenPhones = new Set([
        ...storedResults.map((item) => item.phoneDigits).filter(Boolean),
        ...normalized.excludePhoneDigits,
      ]);
      let fetchedCount = 0;
      let acquiredLease: HbxEngineLease | null = null;
      let hbxEngineUrl = options.hbxEngineUrl;

      let hbxResults: WebscrapingContactResult[] = [];
      let hbxStatus: SearchRunStatus = 'completed';
      let hbxMessage: string | null = null;
      let hbxError: unknown = null;
      try {
        if (!hbxEngineUrl && await this.canAcquireHbxEngineFromPool()) {
          acquiredLease = await this.getEnginePool().acquireEngine(
            `sync:${purpose}:${context.companyId}:${context.userId}:${Date.now()}`,
            context.companyId,
            context.userId,
            { purpose },
          );
          if (!acquiredLease) {
            throw new ServiceUnavailableException('Aguardando motor HBX livre.');
          }
          hbxEngineUrl = acquiredLease.url;
        }
        const hbxOutput = await this.searchHbxEngine(normalized, Array.from(seenPhones), hbxEngineUrl);
        hbxResults = hbxOutput.results;
        hbxStatus = hbxOutput.status;
        hbxMessage = hbxOutput.message;
      } catch (error) {
        hbxError = error;
      } finally {
        if (acquiredLease) {
          await this.getEnginePool().releaseEngine(acquiredLease.engineId).catch(() => null);
        }
      }
      for (const mapped of hbxResults) {
        if (results.length >= normalized.quantity) break;
        if (!this.shouldKeepNewContact(mapped, results, seenPhones)) continue;
        if (!this.matchesFilters(mapped, normalized.filters)) continue;
        seenPhones.add(mapped.phoneDigits);
        results.push(mapped);
        fetchedCount += 1;
      }

      const orderedResults = this.sortContacts(results).slice(0, normalized.quantity);
      const historyResults = hasExplicitExclusions
        ? this.sortContacts(this.mergeDedupedContacts([...storedResults, ...results]))
        : orderedResults;
      if (!options.skipRadarPersist && orderedResults.length > 0) {
        await this.persistRadarLeadPoolBatch(normalized, orderedResults, normalized.engine);
      }
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, historyResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = fetchedCount > 0
        ? (storedResults.length > 0 ? 'hybrid' : 'hbx')
        : storedResults.length > 0
          ? this.buildStoredResultSource(radarResults, companyStoredResults)
          : 'hbx';
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
        totalStoredCount: historyResults.length,
        status,
        message,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
      });
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
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
      if (!options.skipRadarPersist && orderedCachedResults.length > 0) {
        await this.persistRadarLeadPoolBatch(normalized, orderedCachedResults, 'global_cache');
      }
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, orderedCachedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = technicalCacheReusedCount > 0
        ? (storedResults.length > 0 ? 'hybrid' : 'global_cache')
        : this.buildStoredResultSource(radarResults, companyStoredResults);
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
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
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
          : this.buildStoredResultSource(radarResults, companyStoredResults);
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
        if (options.recordUsage !== false) {
          await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
        }
        this.logSearchResult(normalized, response.results.length);
        return response;
      }
      throw this.buildConfigurationUnavailableError();
    }

    if (options.usageEventType !== 'GOOGLE_EMERGENCY_EXECUTED') {
      await this.assertGoogleDailyQuota(context, normalized);
    }

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
    if (!options.skipRadarPersist && orderedResults.length > 0) {
      await this.persistRadarLeadPoolBatch(normalized, orderedResults, normalized.engine);
    }
    if (globalCacheEnabled && (fetchedCount > 0 || (!globalCacheEntry && orderedResults.length > 0))) {
      await this.persistGlobalCache(normalized, orderedResults, globalCacheEntry?.id || null);
    }
    const historyId = historyEnabled
      ? await this.persistHistory(context, normalized, orderedResults, existingHistory?.id || null)
      : null;
    const source: SearchSource = fetchedCount > 0
      ? (storedResults.length > 0 || technicalCacheReusedCount > 0 ? 'hybrid' : 'google')
      : technicalCacheReusedCount > 0
        ? (storedResults.length > 0 ? 'hybrid' : 'global_cache')
        : storedResults.length > 0
          ? this.buildStoredResultSource(radarResults, companyStoredResults)
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
    if (options.recordUsage !== false) {
      await this.recordUsageLog(
        context,
        normalized,
        options.usageEventType || 'GOOGLE_SEARCH_EXECUTED',
        response.results.length,
        null,
        response.meta,
      );
    }
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
            select: {
              id: true,
              city: true,
              segment: true,
              quantity: true,
              resultCount: true,
              filtersJson: true,
              searchSignature: true,
              createdAt: true,
              updatedAt: true,
              lastUsedAt: true,
              places: {
                orderBy: [{ rank: 'asc' }],
                take: 3,
                select: {
                  name: true,
                },
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
      const storedResults = this.sortContacts(this.restoreGlobalCacheResults(row))
        .filter((result) => this.matchesFilters(result, normalized.filters))
        .slice(0, normalized.quantity);

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
    const storedResults = this.sortContacts(this.restoreStoredResults(row))
      .filter((result) => this.matchesFilters(result, normalized.filters))
      .slice(0, normalized.quantity);

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

  private async assertSearchRunPersistence() {
    const [runTable, itemTable, engineLockTable, attemptColumn, retryColumn] = await Promise.all([
      this.prisma.hasTable('WebscrapingSearchRun'),
      this.prisma.hasTable('WebscrapingSearchRunItem'),
      this.prisma.hasTable('HbxEngineLock'),
      this.prisma.hasColumn('WebscrapingSearchRun', 'attemptCount'),
      this.prisma.hasColumn('WebscrapingSearchRun', 'nextRetryAt'),
    ]);
    if (!runTable || !itemTable || !engineLockTable || !attemptColumn || !retryColumn) {
      throw new ServiceUnavailableException({
        code: 'webscraping_search_run_schema_missing',
        message: 'Estrutura de pesquisa incremental ainda nao foi aplicada no banco.',
      });
    }
  }

  private isTerminalSearchRunStatus(status: string | null | undefined) {
    return ['completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'].includes(
      String(status || '').trim(),
    );
  }

  private normalizeSearchRunStatus(status: unknown): WebscrapingSearchRunStatus {
    const normalized = String(status || '').trim();
    if (['queued', 'running', 'completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'].includes(normalized)) {
      return normalized as WebscrapingSearchRunStatus;
    }
    return 'queued';
  }

  private normalizeRunItemStatus(status: unknown): WebscrapingSearchRunItemStatus {
    const normalized = String(status || '').trim();
    if (['found', 'duplicate', 'skipped', 'invalid'].includes(normalized)) {
      return normalized as WebscrapingSearchRunItemStatus;
    }
    return 'found';
  }

  private buildRunInputFromRow(run: any): SearchContactsInput {
    return {
      city: String(run?.city || ''),
      state: String(run?.state || ''),
      segment: String(run?.segment || ''),
      quantity: Math.max(1, Math.trunc(Number(run?.targetQuantity || 1))),
      engine: normalizeEngine(run?.engine),
      targetType: normalizeTargetType(run?.targetType),
    };
  }

  private getHbxRunBatchLimit(targetQuantity: number) {
    const configured = parsePositiveIntegerEnv('HBX_SEARCH_RUN_BATCH_LIMIT', 10);
    const smallBatch = Math.min(20, Math.max(10, configured));
    return Math.max(1, Math.min(smallBatch, Math.trunc(Number(targetQuantity || 1))));
  }

  private getHbxRunMaxAttempts(targetQuantity: number, batchLimit: number) {
    const fallback = Math.max(8, Math.ceil(Math.max(1, targetQuantity) / Math.max(1, batchLimit)) * 2);
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_ATTEMPTS', fallback));
  }

  private getHbxRunMaxEmptyBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_EMPTY_BATCHES', 5));
  }

  private getHbxRunMaxFailedBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_FAILED_BATCHES', 6));
  }

  private getRadarCampaignMaxEmptyBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_RADAR_MAX_EMPTY_BATCHES', 12));
  }

  private getRadarCampaignMaxErrorBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_RADAR_MAX_ERROR_BATCHES', 8));
  }

  private getHbxBatchTimeoutMs() {
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_SEARCH_BATCH_TIMEOUT_MS', 35_000));
  }

  private getHbxRetryDelayMs(consecutiveEngineErrors: number) {
    const delays = [5_000, 15_000, 30_000, 60_000];
    return delays[Math.min(Math.max(1, consecutiveEngineErrors) - 1, delays.length - 1)];
  }

  private scheduleSearchRunPump(delayMs = 0) {
    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, Math.max(0, delayMs));
  }

  private async scheduleNextDueSearchRunPump() {
    const next = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        status: { in: ['queued', 'running'] },
        assignedEngineId: null,
        nextRetryAt: { not: null },
      },
      orderBy: { nextRetryAt: 'asc' },
      select: { nextRetryAt: true },
    }).catch(() => null);
    if (!(next?.nextRetryAt instanceof Date)) return;
    const delayMs = Math.min(60_000, Math.max(0, next.nextRetryAt.getTime() - Date.now()));
    this.scheduleSearchRunPump(delayMs);
  }

  private parseHbxRoleNiche(segment: string, targetType: HbxTargetType) {
    const raw = String(segment || '').replace(/\s+/g, ' ').trim();
    const withoutDdd = raw.replace(/\bDDD\s*\d{2}\b/gi, '').replace(/\s+/g, ' ').trim();
    const roles = ['consultor', 'corretor', 'vendedor', 'representante', 'autonomo', 'autonomo', 'prestador'];
    const normalized = normalizeLookupValue(withoutDdd);
    const role = roles.find((item) => normalized === item || normalized.startsWith(`${item} `))
      || (targetType === 'pf' || targetType === 'agenda_pf' ? 'consultor' : 'empresa');
    const niche = role && normalizeLookupValue(withoutDdd).startsWith(normalizeLookupValue(role))
      ? withoutDdd.slice(role.length).trim()
      : withoutDdd;
    return {
      role: role || withoutDdd || 'contato',
      niche: niche || withoutDdd || raw || 'contato',
    };
  }

  private extractDddFromSegment(segment: string) {
    const match = String(segment || '').match(/\bDDD\s*(\d{2})\b/i);
    return match?.[1] || '';
  }

  private compactQuery(parts: Array<string | null | undefined>) {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildHbxBatchQueries(input: NormalizedSearchInput) {
    const city = input.city;
    const state = input.state;
    const ddd = this.extractDddFromSegment(input.segment);
    const { role, niche } = this.parseHbxRoleNiche(input.segment, input.targetType);
    const queries = [
      this.compactQuery([role, niche, city, state, 'whatsapp']),
      this.compactQuery([role, niche, city, state, 'telefone']),
      this.compactQuery([niche, city, state, 'contato']),
      this.compactQuery([role, city, state, 'celular']),
      ddd ? this.compactQuery([role, niche, 'DDD', ddd]) : this.compactQuery([role, niche, city, state]),
    ];
    return Array.from(new Set(queries.filter(Boolean)));
  }

  private buildHbxBatchQuery(input: NormalizedSearchInput, attempt: number) {
    const queries = this.buildHbxBatchQueries(input);
    if (!queries.length) return input.segment;
    return queries[Math.max(0, attempt - 1) % queries.length];
  }

  private extractHbxHttpStatus(error: unknown) {
    const direct = Number((error as any)?.httpStatus ?? (error as any)?.response?.httpStatus ?? 0);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }

  private extractHbxErrorMessage(error: unknown) {
    const response = (error as any)?.response;
    const message = response?.message || (error as any)?.rawMessage || (error as any)?.message || error || 'Falha no lote.';
    return String(message || 'Falha no lote.').trim();
  }

  private isRetryableHbxError(error: unknown) {
    const httpStatus = this.extractHbxHttpStatus(error);
    if ([502, 503, 504].includes(Number(httpStatus))) return true;
    if ((error as any)?.retryable === true || (error as any)?.response?.retryable === true) return true;
    const normalized = this.extractHbxErrorMessage(error).toLowerCase();
    return [
      'timeout',
      'econnreset',
      'fetch failed',
      'socket hang up',
      'etimedout',
      'network',
    ].some((part) => normalized.includes(part));
  }

  private buildSearchRunProgressMessage(foundCount: number) {
    if (foundCount > 0) {
      return `Encontramos ${foundCount} contatos ate agora. Continuando busca em novos lotes...`;
    }
    return 'Lote processado sem cards aprovados. Continuando busca em novos lotes...';
  }

  private buildSearchRunRetryMessage(errorMessage: string, httpStatus: number | null, foundCount: number) {
    const statusText = httpStatus ? `${httpStatus}` : errorMessage;
    const suffix = foundCount > 0
      ? ` Encontramos ${foundCount} contatos ate agora.`
      : '';
    return `Ultimo lote falhou com ${statusText}, tentando novamente...${suffix}`;
  }

  private buildSearchRunInsufficientMessage(foundCount: number, attempts: number) {
    return `Busca parcial: ${foundCount} contatos encontrados. O motor tentou ${attempts} lotes, mas nao atingiu a meta.`;
  }

  private buildSearchRunNoCardsMessage(attempts: number, lastQuery: string | null | undefined) {
    const query = String(lastQuery || '').trim();
    return `Busca sem contatos aprovados apos ${attempts} lotes.${query ? ` Ultima query: ${query}.` : ''}`;
  }

  private logHbxBatch(data: {
    runId: string;
    attempt: number;
    batchLimit: number;
    query: string;
    engineUrl: string | null;
    httpStatus: number | null;
    errorMessage: string | null;
    approvedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    nextRetryAt: Date | null;
  }) {
    console.log(`[webscraping-hbx-batch] ${JSON.stringify({
      runId: data.runId,
      attempt: data.attempt,
      batchLimit: data.batchLimit,
      query: data.query,
      engineUrl: data.engineUrl,
      httpStatus: data.httpStatus,
      errorMessage: data.errorMessage,
      approvedCount: data.approvedCount,
      rejectedCount: data.rejectedCount,
      duplicateCount: data.duplicateCount,
      nextRetryAt: data.nextRetryAt ? data.nextRetryAt.toISOString() : null,
    })}`);
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
    dedup: Awaited<ReturnType<WebscrapingService['snapshotSearchRunDedup']>>,
    fallback: { runId: string; index: number; city: string; state: string; segment: string },
  ) {
    const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
    const websiteKey = normalizeWebsiteKey(result.website);
    const name = String(result.name || '').trim();
    const placeId = String(result.placeId || '').trim()
      || this.buildSyntheticRunPlaceId(fallback.runId, result, fallback.index);
    const compositeKey = this.buildRunCompositeKey({
      name,
      city: fallback.city,
      state: fallback.state,
      segment: fallback.segment,
    });

    if (!name || !phoneDigits) {
      return {
        placeId,
        phoneDigits,
        websiteKey,
        status: 'invalid' as WebscrapingSearchRunItemStatus,
        duplicateReason: !name ? 'Nome ausente.' : 'Telefone invalido ou ausente.',
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
    dedup.phoneDigits.add(phoneDigits);
    if (websiteKey) dedup.websiteKeys.add(websiteKey);
    if (compositeKey !== '|||') dedup.compositeKeys.add(compositeKey);
    return { placeId, phoneDigits, websiteKey, status: 'found' as const, duplicateReason: null };
  }

  private async saveSearchRunResults(
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
    runId: string,
    results: Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>,
    source: string | null,
    baseIndex = 0,
  ) {
    const dedup = await this.snapshotSearchRunDedup(runId);
    const counts = {
      found: 0,
      duplicate: 0,
      skipped: 0,
      invalid: 0,
    };
    for (const [index, result] of results.entries()) {
      const classified = this.classifyRunItem(result, dedup, {
        runId,
        index: baseIndex + index,
        city: normalized.city,
        state: normalized.state,
        segment: normalized.segment,
      });
      await this.prisma.webscrapingSearchRunItem.create({
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
          city: normalized.city || null,
          state: normalized.state || null,
          segment: normalized.segment || null,
          source: String(result.source || source || '').trim() || null,
          status: classified.status,
          duplicateReason: classified.duplicateReason,
          rawJson: JSON.stringify(result),
        },
      });
      if (classified.status === 'found') counts.found += 1;
      else if (classified.status === 'duplicate') counts.duplicate += 1;
      else if (classified.status === 'invalid') counts.invalid += 1;
      else counts.skipped += 1;
    }
    return counts;
  }

  private async recalculateSearchRunCounters(runId: string) {
    const [currentRun, rows] = await Promise.all([
      this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: { foundCount: true },
      }),
      this.prisma.webscrapingSearchRunItem.findMany({
        where: { runId },
        select: { status: true },
      }),
    ]);
    const foundCount = rows.filter((row) => row.status === 'found').length;
    const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
    const skippedCount = rows.filter((row) => row.status === 'skipped' || row.status === 'invalid').length;
    await this.prisma.webscrapingSearchRun.update({
      where: { id: runId },
      data: {
        foundCount,
        duplicateCount,
        skippedCount,
        ...(foundCount > safeInteger(currentRun?.foundCount) ? { lastFoundCountChangeAt: new Date() } : {}),
      },
    });
    return { foundCount, duplicateCount, skippedCount };
  }

  private async persistSearchRunHistoryIfPossible(runId: string, normalized: NormalizedSearchInput, context: SearchExecutionContext) {
    if (!(await this.supportsHistoryPersistence())) return null;
    const rows = await this.prisma.webscrapingSearchRunItem.findMany({
      where: {
        runId,
        status: 'found',
      },
      orderBy: { createdAt: 'asc' },
    });
    const results = rows.map((row) => this.mapRunItemToContact(row));
    if (!results.length) return null;
    return this.persistHistory(context, normalized, results, null).catch(() => null);
  }

  private async runGoogleEmergencyComplementIfEligible(
    runId: string,
    user: any,
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
  ) {
    if (normalized.targetType !== 'pj') return;
    if (!(await this.getEnginePool().canUseGoogleEmergencyForRun())) return;

    const current = await this.prisma.webscrapingSearchRun.findUnique({
      where: { id: runId },
      select: {
        foundCount: true,
        targetQuantity: true,
        googleEmergencyUsedCount: true,
      },
    });
    if (!current || current.foundCount >= current.targetQuantity || current.googleEmergencyUsedCount > 0) return;

    const quantity = Math.min(
      this.getEnginePool().googleEmergencyMaxPerRun(),
      Math.max(1, current.targetQuantity - current.foundCount),
    );
    const dedup = await this.snapshotSearchRunDedup(runId);
    const excludePhoneDigits = Array.from(dedup.phoneDigits);

    try {
      const response = await this.searchContactsForUser(
        user,
        {
          city: normalized.city,
          state: normalized.state,
          segment: normalized.segment,
          engine: 'google',
          targetType: 'pj',
          quantity,
          minRating: normalized.filters.minRating,
          minReviews: normalized.filters.minReviews,
          onlyWithWebsite: normalized.filters.onlyWithWebsite,
          excludePhoneDigits,
        },
        {
          skipPrivateHistory: true,
          skipTechnicalCache: true,
          skipRadarLookup: true,
          recordUsage: true,
          usageEventType: 'GOOGLE_EMERGENCY_EXECUTED',
          purpose: 'manual',
        },
      );
      const incoming = Array.isArray(response.results) ? response.results : [];
      if (incoming.length > 0) {
        await this.saveSearchRunResults(context, normalized, runId, incoming, 'google_emergency');
        await this.recalculateSearchRunCounters(runId);
      }
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          googleEmergencyUsedCount: { increment: incoming.length },
        },
      });
    } catch (error) {
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          errorMessage: `Google emergency falhou: ${String((error as any)?.message || error || 'erro desconhecido')}`,
        },
      }).catch(() => null);
    }
  }

  private buildQueueUser(run: any) {
    return {
      id: Number(run?.userId || 0),
      companyId: Number(run?.companyId || 0),
      role: 'ADMIN',
      isSystemMaster: false,
      masterContext: { active: false },
    };
  }

  private async processNextQueuedSearchRun() {
    if (this.searchRunQueuePumpActive) return;
    this.searchRunQueuePumpActive = true;
    try {
      await this.assertSearchRunPersistence();
      await this.getEnginePool().refreshEngineRegistryFromEnv();
      await this.getEnginePool().cleanupExpiredLocks();

      for (;;) {
        const now = new Date();
        const run = await this.prisma.webscrapingSearchRun.findFirst({
          where: {
            status: { in: ['queued', 'running'] },
            assignedEngineId: null,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
          orderBy: [
            { nextRetryAt: 'asc' },
            { createdAt: 'asc' },
          ],
        });
        if (!run) {
          await this.scheduleNextDueSearchRunPump();
          break;
        }

        const avoidEngineId = ['batch_error', 'engine_error'].includes(String(run.lastBatchStatus || ''))
          ? String(run.lastEngineUrl || run.assignedEngineId || '')
          : '';
        const lease = await this.getEnginePool().acquireEngine(
          run.id,
          run.companyId,
          run.userId,
          { avoidEngineIdOrUrl: avoidEngineId || undefined, purpose: 'manual' },
        );
        if (!lease) {
          const nextRetryAt = new Date(Date.now() + 5_000);
          await this.prisma.webscrapingSearchRun.update({
            where: { id: run.id },
            data: {
              status: run.foundCount > 0 ? 'running' : 'queued',
              assignedEngineId: null,
              assignedEngineUrl: null,
              assignedEngineIndex: null,
              lastBatchStatus: 'queued_wait',
              errorMessage: 'Aguardando motor livre.',
              nextRetryAt,
            },
          }).catch(() => null);
          this.scheduleSearchRunPump(5_000);
          break;
        }

        const claimed = await this.prisma.webscrapingSearchRun.updateMany({
          where: {
            id: run.id,
            status: { in: ['queued', 'running'] },
            assignedEngineId: null,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
          data: {
            status: 'running',
            assignedEngineId: lease.engineId,
            assignedEngineUrl: lease.url,
            assignedEngineIndex: lease.engineIndex,
            startedAt: run.startedAt || new Date(),
            nextRetryAt: null,
            lastEngineUrl: lease.url,
          },
        });

        if (claimed.count === 0) {
          await this.getEnginePool().releaseEngine(lease.engineId);
          continue;
        }

        const queueUser = this.buildQueueUser(run);
        const normalized = this.normalizeSearchInput(this.buildRunInputFromRow({ ...run, engine: 'hbx' }));
        this.scheduleSearchRunPump(0);
        setTimeout(() => {
          void this.processSearchRun(run.id, queueUser, normalized, lease);
        }, 0);
      }
    } finally {
      this.searchRunQueuePumpActive = false;
    }
  }

  private async processSearchRun(runId: string, user: any, initialInput?: NormalizedSearchInput, lease?: HbxEngineLease) {
    const context = this.resolveContext(user);
    const current = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: runId, companyId: context.companyId },
    });
    if (!current || this.isTerminalSearchRunStatus(current.status)) {
      if (lease) await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }

    const normalized = initialInput || this.normalizeSearchInput(this.buildRunInputFromRow(current));
    const batchLimit = this.getHbxRunBatchLimit(normalized.quantity);
    const maxAttempts = this.getHbxRunMaxAttempts(normalized.quantity, batchLimit);
    const maxEmptyBatches = this.getHbxRunMaxEmptyBatches();
    const maxFailedBatches = this.getHbxRunMaxFailedBatches();
    const attempt = safeInteger(current.attemptCount) + 1;
    const quantity = Math.min(batchLimit, Math.max(1, normalized.quantity - safeInteger(current.foundCount)));
    const queryUsed = this.buildHbxBatchQuery(normalized, attempt);
    const engineUrl = lease?.url || String(current.assignedEngineUrl || current.lastEngineUrl || this.getHbxScrapingEngineUrl());

    try {
      if (safeInteger(current.foundCount) >= normalized.quantity) {
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: 'completed',
            lastBatchStatus: 'completed',
            errorMessage: null,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
      }

      if (attempt > maxAttempts) {
        const counters = await this.recalculateSearchRunCounters(runId);
        const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
          ? 'completed_insufficient_results'
          : 'failed';
        const finalMessage = counters.foundCount > 0
          ? this.buildSearchRunInsufficientMessage(counters.foundCount, safeInteger(current.attemptCount))
          : this.buildSearchRunNoCardsMessage(safeInteger(current.attemptCount), current.lastQueryUsed);
        if (counters.foundCount > 0) {
          await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        }
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: finalStatus,
            lastBatchStatus: finalStatus,
            errorMessage: finalMessage,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
      }

      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: 'running',
          startedAt: current.startedAt || new Date(),
          assignedEngineId: lease?.engineId || current.assignedEngineId || null,
          assignedEngineUrl: lease?.url || current.assignedEngineUrl || null,
          assignedEngineIndex: lease?.engineIndex ?? current.assignedEngineIndex ?? null,
          attemptCount: { increment: 1 },
          lastBatchStatus: 'running_batch',
          lastBatchError: null,
          lastQueryUsed: queryUsed,
          lastEngineUrl: engineUrl,
          nextRetryAt: null,
          errorMessage: `Rodando lote ${attempt}/${maxAttempts}.`,
        },
      });

      const liveRun = await this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: {
          status: true,
          foundCount: true,
          targetQuantity: true,
        },
      });
      if (!liveRun || liveRun.status === 'canceled') return;
      if (this.isTerminalSearchRunStatus(liveRun.status)) return;
      if (safeInteger(liveRun.foundCount) >= safeInteger(liveRun.targetQuantity)) {
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: 'completed',
            lastBatchStatus: 'completed',
            errorMessage: null,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
      }

      const dedup = await this.snapshotSearchRunDedup(runId);
      const excludePhoneDigits = Array.from(dedup.phoneDigits);
      const batchInput: NormalizedSearchInput = {
        ...normalized,
        quantity,
      };
      const batchResponse = await this.searchHbxEngine(
        batchInput,
        excludePhoneDigits,
        engineUrl,
        {
          queryText: queryUsed,
          batchLimit: quantity,
          timeoutMs: this.getHbxBatchTimeoutMs(),
        },
      );
      const incoming = Array.isArray(batchResponse.results) ? batchResponse.results : [];
      const savedCounts = await this.saveSearchRunResults(
        context,
        normalized,
        runId,
        incoming,
        'hbx',
        safeInteger(current.attemptCount) * batchLimit,
      );

      if (lease) {
        await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      }

      const counters = await this.recalculateSearchRunCounters(runId);
      const approvedCount = savedCounts.found;
      const rejectedCount = batchResponse.rejectedCount + savedCounts.invalid + savedCounts.skipped;
      const duplicateCount = batchResponse.duplicateCount + savedCounts.duplicate;
      const consecutiveEmptyBatchCount = approvedCount === 0
        ? safeInteger(current.consecutiveEmptyBatchCount) + 1
        : 0;
      const reachedTarget = counters.foundCount >= normalized.quantity;
      const reachedMaxAttempts = attempt >= maxAttempts;
      const reachedMaxEmptyBatches = approvedCount === 0 && consecutiveEmptyBatchCount >= maxEmptyBatches;

      this.logHbxBatch({
        runId,
        attempt,
        batchLimit: quantity,
        query: queryUsed,
        engineUrl,
        httpStatus: batchResponse.httpStatus,
        errorMessage: batchResponse.rawErrorMessage,
        approvedCount,
        rejectedCount,
        duplicateCount,
        nextRetryAt: null,
      });

      if (reachedTarget) {
        await this.runGoogleEmergencyComplementIfEligible(runId, user, context, normalized);
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: 'completed',
            lastBatchStatus: 'completed',
            errorMessage: null,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            consecutiveEmptyBatchCount,
            consecutiveEngineErrorCount: 0,
            finishedAt: new Date(),
          },
        });
        return;
      }

      if (reachedMaxAttempts || reachedMaxEmptyBatches) {
        const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
          ? 'completed_insufficient_results'
          : 'failed';
        const finalMessage = counters.foundCount > 0
          ? this.buildSearchRunInsufficientMessage(counters.foundCount, attempt)
          : this.buildSearchRunNoCardsMessage(attempt, queryUsed);
        if (counters.foundCount > 0) {
          await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        }
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: finalStatus,
            lastBatchStatus: finalStatus,
            errorMessage: finalMessage,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            consecutiveEmptyBatchCount,
            consecutiveEngineErrorCount: 0,
            finishedAt: new Date(),
          },
        });
        return;
      }

      const message = this.buildSearchRunProgressMessage(counters.foundCount);
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: 'running',
          lastBatchStatus: approvedCount > 0 ? 'batch_success' : 'empty_batch',
          errorMessage: message,
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          consecutiveEmptyBatchCount,
          consecutiveEngineErrorCount: 0,
        },
      });
    } catch (error) {
      if (lease) {
        await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      }
      const counters = await this.recalculateSearchRunCounters(runId).catch(() => ({
        foundCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
      }));
      const httpStatus = this.extractHbxHttpStatus(error);
      const errorMessage = this.extractHbxErrorMessage(error);
      const retryable = this.isRetryableHbxError(error);
      const consecutiveEngineErrorCount = safeInteger(current.consecutiveEngineErrorCount) + 1;
      const failedBatchCount = safeInteger(current.failedBatchCount) + 1;
      const reachedMaxAttempts = attempt >= maxAttempts;
      const reachedMaxFailedBatches = consecutiveEngineErrorCount >= maxFailedBatches;
      const shouldRetry = retryable && !reachedMaxAttempts && !reachedMaxFailedBatches;
      const nextRetryAt = shouldRetry
        ? new Date(Date.now() + this.getHbxRetryDelayMs(consecutiveEngineErrorCount))
        : null;

      this.logHbxBatch({
        runId,
        attempt,
        batchLimit: quantity,
        query: queryUsed,
        engineUrl,
        httpStatus,
        errorMessage,
        approvedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        nextRetryAt,
      });

      if (shouldRetry) {
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: counters.foundCount > 0 ? 'running' : 'queued',
            failedBatchCount,
            consecutiveEngineErrorCount,
            lastBatchStatus: httpStatus ? 'batch_error' : 'engine_error',
            lastBatchError: errorMessage.slice(0, 1000),
            errorMessage: this.buildSearchRunRetryMessage(errorMessage, httpStatus, counters.foundCount),
            nextRetryAt,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
          },
        }).catch(() => null);
        return;
      }

      const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
        ? 'completed_insufficient_results'
        : 'failed';
      const finalMessage = counters.foundCount > 0
        ? this.buildSearchRunInsufficientMessage(counters.foundCount, attempt)
        : reachedMaxAttempts
          ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}.`
          : this.buildSearchRunNoCardsMessage(attempt, queryUsed);
      if (counters.foundCount > 0) {
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context).catch(() => null);
      }
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          failedBatchCount,
          consecutiveEngineErrorCount,
          lastBatchStatus: finalStatus === 'failed' ? 'failed' : 'completed_insufficient_results',
          lastBatchError: errorMessage.slice(0, 1000),
          errorMessage: finalMessage,
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          finishedAt: new Date(),
        },
      }).catch(() => null);
    } finally {
      if (lease) {
        await this.getEnginePool().releaseEngine(lease.engineId);
      }
      this.scheduleSearchRunPump(0);
    }
  }

  private mapRunItemToContact(item: any): WebscrapingContactResult {
    return {
      placeId: String(item.placeId || '').trim(),
      name: String(item.name || '').trim(),
      phone: String(item.phone || '').trim(),
      phoneDigits: normalizePhoneDigits(item.phoneDigits || item.phone),
      rating: null,
      reviews: null,
      address: String(item.address || '').trim() || null,
      website: String(item.website || '').trim() || null,
      source: String(item.source || '').trim() || null,
    };
  }

  private buildSearchRunResponse(run: any, capacity?: { operationalStatus: 'healthy' | 'degraded'; message: string | null }): WebscrapingSearchRunResponse {
    const engine = normalizeEngine(run.engine);
    const targetType = normalizeTargetType(run.targetType);
    const status = this.normalizeSearchRunStatus(run.status);
    const items = Array.isArray(run.items) ? run.items : [];
    const foundItems = items.filter((item) => item.status === 'found');
    const results = foundItems.map((item) => {
      const contact = this.mapRunItemToContact(item);
      const { placeId: _placeId, ...publicContact } = contact;
      return publicContact;
    });
    const query = {
      city: String(run.city || ''),
      state: run.state || null,
      segment: String(run.segment || ''),
      quantity: Math.max(1, Math.trunc(Number(run.targetQuantity || 1))),
      engine,
      targetType,
      filters: {
        minRating: null,
        minReviews: null,
        onlyWithWebsite: false,
      },
    };
    const foundSources = new Set(foundItems.map((item) => String(item.source || '').trim()).filter(Boolean));
    const source: SearchSource = foundSources.has('radar_database')
      ? (foundSources.size === 1 ? 'radar_database' : 'hybrid')
      : engine === 'hbx'
        ? 'hbx'
        : 'google';
    const databaseFirst = source === 'radar_database';
    const radarRunItemCount = foundItems.filter((item) => String(item.source || '').trim() === 'radar_database').length;
    const attemptCount = safeInteger(run.attemptCount);
    const batchLimit = this.getHbxRunBatchLimit(query.quantity);
    const maxAttempts = this.getHbxRunMaxAttempts(query.quantity, batchLimit);
    const foundCount = safeInteger(run.foundCount);
    const rawMessage = String(run.errorMessage || capacity?.message || '').trim();
    const guardedMessage = foundCount > 0 && /nenhum card valido/i.test(rawMessage)
      ? this.buildSearchRunInsufficientMessage(foundCount, attemptCount)
      : rawMessage || null;
    return {
      id: run.id,
      runId: run.id,
      status,
      city: query.city,
      state: query.state,
      segment: query.segment,
      engine,
      targetType,
      targetQuantity: query.quantity,
      foundCount: safeInteger(run.foundCount),
      importedCount: safeInteger(run.importedCount),
      duplicateCount: safeInteger(run.duplicateCount),
      skippedCount: safeInteger(run.skippedCount),
      errorMessage: guardedMessage,
      attemptCount,
      failedBatchCount: safeInteger(run.failedBatchCount),
      consecutiveEmptyBatchCount: safeInteger(run.consecutiveEmptyBatchCount),
      consecutiveEngineErrorCount: safeInteger(run.consecutiveEngineErrorCount),
      lastBatchError: run.lastBatchError || null,
      lastBatchStatus: run.lastBatchStatus || null,
      nextRetryAt: run.nextRetryAt instanceof Date ? run.nextRetryAt.toISOString() : null,
      lastQueryUsed: run.lastQueryUsed || null,
      lastEngineUrl: run.lastEngineUrl || run.assignedEngineUrl || null,
      assignedEngineId: run.assignedEngineId || null,
      assignedEngineIndex: Number.isInteger(run.assignedEngineIndex) ? Number(run.assignedEngineIndex) : null,
      batchLimit,
      maxAttempts,
      operationalStatus: capacity?.operationalStatus,
      operationalMessage: capacity?.message || null,
      startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : null,
      createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : new Date().toISOString(),
      query,
      meta: {
        runId: run.id,
        historyId: run.id,
        source,
        reusedCount: databaseFirst || source === 'hybrid' ? radarRunItemCount : 0,
        fetchedCount: Math.max(0, safeInteger(run.foundCount) - radarRunItemCount),
        totalStoredCount: safeInteger(run.foundCount),
        status:
          status === 'partial_error' || status === 'completed_insufficient_results'
            ? status
            : status === 'completed'
              ? 'completed'
              : undefined,
        message: guardedMessage,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
        duplicateCount: safeInteger(run.duplicateCount),
        skippedCount: safeInteger(run.skippedCount),
        importedCount: safeInteger(run.importedCount),
      },
      items: items.map((item) => ({
        id: item.id,
        placeId: String(item.placeId || ''),
        name: String(item.name || ''),
        phone: String(item.phone || ''),
        phoneDigits: String(item.phoneDigits || ''),
        website: item.website || null,
        websiteKey: item.websiteKey || null,
        address: item.address || null,
        city: item.city || null,
        state: item.state || null,
        segment: item.segment || null,
        source: item.source || null,
        status: this.normalizeRunItemStatus(item.status),
        duplicateReason: item.duplicateReason || null,
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date().toISOString(),
      })),
      results,
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
      ? 'O HBX List não inclui buscas Google diárias. Os motores gratuitos continuam liberados. Para buscas Google, escolha o HBX Lead ou HBX Full — Bot e IA.'
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
      onlyWithWebsite: false,
    };
    const filtersJson = JSON.stringify({
      ...filters,
      engine,
      targetType,
      state,
    });
    const excludePhoneDigits = Array.from(
      new Set(
        (Array.isArray(input.excludePhoneDigits) ? input.excludePhoneDigits : [])
          .map((phone) => normalizePhoneDigits(phone))
          .filter(Boolean) as string[],
      ),
    );
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
      excludePhoneDigits,
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
        onlyWithWebsite: false,
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
          onlyWithWebsite: false,
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
    return true;
  }

  private buildOpportunityScore(result: WebscrapingContactResult) {
    const websiteStatus = inferWebsiteStatus(result.website);
    let score = 0;
    if (websiteStatus === 'none') score += 35;
    if ((result.reviews || 0) >= 50) score += 25;
    if (result.rating != null && result.rating >= 4.2) score += 15;
    if (isLikelyValidBrPhone(result.phoneDigits || result.phone)) score += 10;
    if (isLikelyWhatsapp(result.phoneDigits || result.phone)) score += 10;
    if (websiteStatus === 'present') score -= 20;
    const engineScore = Math.max(0, Math.min(10, Math.trunc(Number(result.score || 0) / 10) || 0));
    return Math.max(0, Math.min(100, score + engineScore));
  }

  private buildOpportunityReason(result: WebscrapingContactResult, input: NormalizedSearchInput) {
    const reasons: string[] = [];
    const websiteStatus = inferWebsiteStatus(result.website);
    if (result.rating != null && result.rating >= 4.2) reasons.push('boa reputacao no Google');
    if ((result.reviews || 0) >= 50) reasons.push('muitas avaliacoes');
    if (websiteStatus === 'none') reasons.push('nenhum website encontrado');
    if (websiteStatus === 'social_only') reasons.push('presenca limitada a rede social');
    if (websiteStatus === 'weak') reasons.push('website fraco ou pagina provisoria');
    if (isLikelyWhatsapp(result.phoneDigits || result.phone)) reasons.push('telefone com alta chance de WhatsApp');
    if (websiteStatus === 'present' && reasons.length < 2) reasons.push('site encontrado, mas ainda pode ser trabalhado pelo relacionamento');
    if (!reasons.length) reasons.push(`contato publico aderente a ${input.segment || 'prospeccao'}`);
    const sentence = reasons.slice(0, 3).join(', ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
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
      const leftScore = left.opportunityScore ?? left.score ?? this.buildOpportunityScore(left);
      const rightScore = right.opportunityScore ?? right.score ?? this.buildOpportunityScore(right);
      const scoreDelta = rightScore - leftScore;
      if (scoreDelta !== 0) return scoreDelta;
      const ratingDelta = (right.rating || 0) - (left.rating || 0);
      if (ratingDelta !== 0) return ratingDelta;
      const reviewsDelta = (right.reviews || 0) - (left.reviews || 0);
      if (reviewsDelta !== 0) return reviewsDelta;
      if (Number(Boolean(right.website)) !== Number(Boolean(left.website))) {
        return Number(Boolean(left.website)) - Number(Boolean(right.website));
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

  private async supportsRadarPersistence() {
    if (!(this.prisma as any).radarLeadPool || !(this.prisma as any).radarLeadCompanyState) {
      return false;
    }
    const [poolTable, stateTable, statusColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool'),
      this.prisma.hasTable('RadarLeadCompanyState'),
      this.prisma.hasColumn('RadarLeadPool', 'status'),
    ]);
    return poolTable && stateTable && statusColumn;
  }

  private async supportsRadarCampaignPersistence() {
    if (!(this.prisma as any).webscrapingCampaign || !(this.prisma as any).webscrapingCampaignBatch) {
      return false;
    }
    const [campaignTable, batchTable, eventTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingCampaign'),
      this.prisma.hasTable('WebscrapingCampaignBatch'),
      this.prisma.hasTable('RadarLeadEvent'),
    ]);
    return campaignTable && batchTable && eventTable;
  }

  private async supportsMassDataCampaignPersistence() {
    return this.supportsRadarCampaignPersistence()
      .then(async (base) => base && Boolean((this.prisma as any).webscrapingCampaignTask) && await this.prisma.hasTable('WebscrapingCampaignTask'))
      .catch(() => false);
  }

  private normalizeRadarLeadStatus(value: unknown): RadarLeadStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'imported_to_vendas' || normalized === 'sent_to_vendas') return 'sent_to_vendas';
    if (normalized === 'em_atendimento' || normalized === 'atendimento') return 'in_attendance';
    if (normalized === 'won') return 'converted';
    if (normalized === 'optout' || normalized === 'do_not_contact') return 'opt_out';
    if (normalized === 'lost' || normalized === 'sem_interesse') return 'negative';
    if (normalized === 'descartado') return 'discarded';
    if (['clean', 'new', 'approved', 'in_attendance', 'converted', 'denied', 'negative', 'blocked', 'opt_out', 'discarded', 'complaint', 'no_answer', 'no_whatsapp', 'invalid_whatsapp', 'duplicate', 'rejected', 'hidden'].includes(normalized)) {
      return normalized as RadarLeadStatus;
    }
    return 'clean';
  }

  private isRadarProtectedStatus(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    const status = this.normalizeRadarLeadStatus(normalized);
    return (RADAR_PROTECTED_STATUSES as readonly string[]).includes(normalized) ||
      (RADAR_PROTECTED_STATUSES as readonly string[]).includes(status);
  }

  private resolveRadarLeadStatus(row: any): RadarLeadStatus {
    const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    return this.normalizeRadarLeadStatus(companyState?.status || row?.status || 'clean');
  }

  private extractDdd(value: string | null | undefined) {
    const digits = normalizePhoneDigits(value);
    return digits.length >= 10 ? digits.slice(0, 2) : '';
  }

  private extractExpectedDddsFromSegment(segment: string) {
    const matches = String(segment || '').match(/\bDDD\s*(\d{2})\b/gi) || [];
    return Array.from(new Set(matches.map((match) => match.replace(/\D/g, '').slice(0, 2)).filter(Boolean)));
  }

  private buildExpectedDdds(input: { segment?: string | null; city?: string | null; state?: string | null }) {
    const explicit = this.extractExpectedDddsFromSegment(String(input.segment || ''));
    if (explicit.length) return explicit;
    const cityKey = normalizeLookupValue(String(input.city || ''));
    const state = String(input.state || '').trim().toUpperCase();
    const known: Record<string, string> = {
      americana: '19',
      araras: '19',
      campinas: '19',
      limeira: '19',
      'rio claro': '19',
      'ribeirao preto': '16',
      'sao paulo': '11',
    };
    const ddd = known[cityKey] || known[cityKey.replace(/\s+-\s+[a-z]{2}$/i, '')] || '';
    if (ddd) return [ddd];
    if (state === 'SP') return [];
    return [];
  }

  private normalizeRadarFilters(input: RadarFiltersInput = {}): NormalizedRadarFilters {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const segment = String(input.segment || '').trim();
    const highOpportunity = coerceBoolean(input.highOpportunity);
    const rawOpportunityLevel = String(input.opportunityLevel || '').trim().toLowerCase();
    const opportunityLevel: RadarOpportunityLevel =
      highOpportunity || rawOpportunityLevel === 'high' || rawOpportunityLevel === 'alta'
        ? 'high'
        : rawOpportunityLevel === 'medium' || rawOpportunityLevel === 'media' || rawOpportunityLevel === 'média'
          ? 'medium'
          : rawOpportunityLevel === 'low' || rawOpportunityLevel === 'baixa'
            ? 'low'
            : null;

    return {
      city,
      state,
      segment,
      normalizedCity: normalizeLookupValue(city),
      normalizedSegment: normalizeLookupValue(segment),
      quantity: Math.min(Math.max(Math.trunc(Number(input.quantity || 20) || 20), 1), 100),
      limit: Math.min(Math.max(Math.trunc(Number(input.limit || input.quantity || 50) || 50), 1), 300),
      page: Math.min(Math.max(Math.trunc(Number(input.page || 1) || 1), 1), 1000),
      filterKey: String(input.filterKey || '').trim(),
      status: String(input.status || '').trim().toLowerCase(),
      ddd: String(input.ddd || '').replace(/\D/g, '').slice(0, 2),
      scoreRange: String(input.scoreRange || '').trim().toLowerCase(),
      source: String(input.source || '').trim(),
      minRating: this.normalizeMinRating(input.minRating),
      minReviews: this.normalizeMinReviews(input.minReviews),
      noWebsite: coerceBoolean(input.noWebsite),
      withWebsite: coerceBoolean(input.withWebsite),
      weakWebsite: coerceBoolean(input.weakWebsite),
      validPhone: coerceBoolean(input.validPhone),
      likelyWhatsapp: coerceBoolean(input.likelyWhatsapp),
      opportunityLevel,
      includeHidden: coerceBoolean(input.includeHidden),
      engine: normalizeEngine(input.engine),
      targetType: normalizeTargetType(input.targetType),
      desiredStock: Math.min(Math.max(Math.trunc(Number(input.desiredStock || 300) || 300), 20), 1000),
      minimumStock: Math.min(Math.max(Math.trunc(Number(input.minimumStock || 80) || 80), 1), 500),
    };
  }

  private buildStoredResultSource(radarResults: WebscrapingContactResult[], companyStoredResults: WebscrapingContactResult[]): SearchSource {
    if (radarResults.length > 0 && companyStoredResults.length > 0) return 'hybrid';
    if (radarResults.length > 0) return 'radar_database';
    return 'history';
  }

  private buildRadarOpportunityWhere(level: RadarOpportunityLevel) {
    if (level === 'high') return { gte: 70 };
    if (level === 'medium') return { gte: 45, lt: 70 };
    if (level === 'low') return { lt: 45 };
    return null;
  }

  private buildRadarWhere(
    filters: NormalizedRadarFilters,
    companyId?: number | null,
    options: { excludePhoneDigits?: string[]; requirePhone?: boolean; includeHidden?: boolean } = {},
  ) {
    const where: any = {};
    const and: any[] = [];

    if (filters.normalizedCity) where.normalizedCity = filters.normalizedCity;
    if (filters.state) where.state = filters.state;
    if (filters.normalizedSegment) where.normalizedSegment = filters.normalizedSegment;
    if (filters.minRating != null) where.rating = { gte: filters.minRating };
    if (filters.minReviews != null) where.reviews = { gte: filters.minReviews };
    if (filters.ddd) where.ddd = filters.ddd;
    if (filters.status) where.status = filters.status;
    if (filters.source) {
      and.push({
        OR: [
          { source: { contains: filters.source, mode: 'insensitive' } },
          { sourceEngine: { contains: filters.source, mode: 'insensitive' } },
          { sourceEngines: { contains: filters.source } },
        ],
      });
    }
    if (filters.scoreRange === 'high') where.opportunityScore = { gte: 70 };
    if (filters.scoreRange === 'medium') where.opportunityScore = { gte: 45, lt: 70 };
    if (filters.scoreRange === 'low') where.opportunityScore = { lt: 45 };

    if (filters.noWebsite) {
      where.websiteStatus = 'none';
    } else if (filters.weakWebsite) {
      where.websiteStatus = { in: ['weak', 'social_only'] };
    } else if (filters.withWebsite) {
      where.websiteStatus = { not: 'none' };
    }

    const opportunityWhere = this.buildRadarOpportunityWhere(filters.opportunityLevel);
    if (opportunityWhere) where.opportunityScore = opportunityWhere;

    if (filters.validPhone || options.requirePhone) {
      and.push({ phoneDigits: { not: null } });
    }

    const excludePhoneDigits = Array.from(new Set((options.excludePhoneDigits || []).map((phone) => normalizePhoneDigits(phone)).filter(Boolean)));
    if (excludePhoneDigits.length) {
      and.push({
        OR: [
          { phoneDigits: null },
          { phoneDigits: { notIn: excludePhoneDigits } },
        ],
      });
    }

    if (companyId && !(options.includeHidden || filters.includeHidden || filters.filterKey)) {
      and.push({
        companyStates: {
          none: {
            companyId,
            status: { in: [...RADAR_PROTECTED_STATUSES, 'imported_to_vendas', 'sent_to_vendas'] as any },
          },
        },
      });
      and.push({
        status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate'] as any },
      });
    }

    if (and.length) where.AND = and;
    return where;
  }

  private filterRadarRowsInMemory(rows: any[], filters: NormalizedRadarFilters) {
    return rows.filter((row) => {
      if (filters.likelyWhatsapp && !isLikelyWhatsapp(row?.phoneDigits || row?.phone)) return false;
      if (filters.validPhone && !isLikelyValidBrPhone(row?.phoneDigits || row?.phone)) return false;
      const status = this.resolveRadarLeadStatus(row);
      const ddd = String(row?.ddd || this.extractDdd(row?.phoneDigits || row?.phone));
      const expectedDdds = parseJsonArray(row?.expectedDddsJson);
      const score = safeInteger(row?.opportunityScore);
      const websiteStatus = String(row?.websiteStatus || inferWebsiteStatus(row?.website));
      const filterKey = filters.filterKey;
      if (filters.status && status !== this.normalizeRadarLeadStatus(filters.status)) return false;
      if (filterKey === 'new' || filterKey === 'clean') return status === 'clean' || status === 'new';
      if (filterKey === 'approved') return status === 'approved';
      if (filterKey === 'sent_to_vendas') return status === 'sent_to_vendas';
      if (filterKey === 'in_attendance') return status === 'in_attendance';
      if (filterKey === 'converted') return status === 'converted';
      if (filterKey === 'denied') return status === 'denied' || status === 'negative';
      if (filterKey === 'negative') return status === 'negative' || status === 'denied';
      if (filterKey === 'blocked') return status === 'blocked';
      if (filterKey === 'opt_out') return status === 'opt_out';
      if (filterKey === 'discarded') return status === 'discarded' || status === 'hidden';
      if (filterKey === 'complaint') return status === 'complaint';
      if (filterKey === 'no_answer') return status === 'no_answer';
      if (filterKey === 'no_whatsapp') return status === 'no_whatsapp' || status === 'invalid_whatsapp';
      if (filterKey === 'without_whatsapp') return !isLikelyWhatsapp(row?.phoneDigits || row?.phone);
      if (filterKey === 'likely_whatsapp') return isLikelyWhatsapp(row?.phoneDigits || row?.phone);
      if (filterKey === 'ddd_local') return expectedDdds.length > 0 && expectedDdds.includes(ddd);
      if (filterKey === 'ddd_mismatch') return status === 'rejected' && String(row?.rejectionReason || '') === 'ddd_mismatch';
      if (filterKey === 'score_high') return score >= 70;
      if (filterKey === 'score_medium') return score >= 45 && score < 70;
      if (filterKey === 'score_low') return score < 45;
      if (filterKey === 'no_website') return websiteStatus === 'none';
      if (filterKey === 'weak_website') return websiteStatus === 'weak' || websiteStatus === 'social_only';
      if (filterKey === 'with_website') return websiteStatus !== 'none';
      if (filterKey.startsWith('city:')) return normalizeLookupValue(String(row?.city || '')) === normalizeLookupValue(filterKey.slice(5));
      if (filterKey.startsWith('state:')) return String(row?.state || '').toUpperCase() === filterKey.slice(6).toUpperCase();
      if (filterKey.startsWith('segment:')) return normalizeLookupValue(String(row?.segment || '')) === normalizeLookupValue(filterKey.slice(8));
      if (filterKey.startsWith('source:')) {
        const sourceNeedle = normalizeLookupValue(filterKey.slice(7));
        const sourceValues = [row?.source, row?.sourceEngine, ...parseJsonArray(row?.sourceEngines)].map((value) => normalizeLookupValue(String(value || '')));
        return sourceValues.some((value) => value === sourceNeedle);
      }
      return true;
    });
  }

  private dedupeRadarRows(rows: any[]) {
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const row of rows) {
      const keys = [
        row?.phoneDigits ? `phone:${row.phoneDigits}` : '',
        row?.placeId ? `place:${row.placeId}` : '',
        row?.website ? `website:${normalizeWebsiteKey(row.website)}` : '',
      ].filter(Boolean);
      if (keys.some((key) => seen.has(key))) continue;
      keys.forEach((key) => seen.add(key));
      deduped.push(row);
    }
    return deduped;
  }

  private async queryRadarRowsForCompany(
    companyId: number,
    filters: NormalizedRadarFilters,
    options: { limit?: number; excludePhoneDigits?: string[]; requirePhone?: boolean; includeHidden?: boolean } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return [];
    const readLimit = Math.min(Math.max(Math.trunc(Number(options.limit || filters.limit) || filters.limit), 1), 1000);
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: this.buildRadarWhere(filters, companyId, options),
      orderBy: [
        { opportunityScore: 'desc' },
        { reviews: 'desc' },
        { rating: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: Math.min(readLimit * 4, 1000),
      include: {
        companyStates: {
          where: { companyId },
          take: 1,
          select: {
            status: true,
            vendasLeadId: true,
            lastActionAt: true,
            noAnswerCount: true,
            contactedCount: true,
            lastContactAt: true,
            complaintReason: true,
            deniedReason: true,
          },
        },
        events: {
          ...(companyId ? { where: { OR: [{ companyId }, { companyId: null }] } } : {}),
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            eventType: true,
            note: true,
            createdAt: true,
          },
        },
      },
    }).catch(() => []);
    return this.dedupeRadarRows(this.filterRadarRowsInMemory(rows, filters)).slice(0, readLimit);
  }

  private restoreRadarPoolResults(rows: any[]): WebscrapingContactResult[] {
    return rows.map((row) => ({
      placeId: row?.placeId || `radar:${row?.id}`,
      name: String(row?.name || 'Empresa sem nome'),
      phone: String(row?.phone || row?.phoneDigits || ''),
      phoneDigits: normalizePhoneDigits(row?.phoneDigits || row?.phone),
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: safeInteger(row?.reviews),
      address: row?.address || null,
      website: row?.website || null,
      source: 'radar_database',
      score: safeInteger(row?.opportunityScore),
      opportunityScore: safeInteger(row?.opportunityScore),
      opportunityReason: row?.opportunityReason || null,
    })).filter((row) => row.phoneDigits);
  }

  private async listRadarContactsForSearch(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
  ): Promise<WebscrapingContactResult[]> {
    const filters = this.normalizeRadarFilters({
      city: input.city,
      state: input.state,
      segment: input.segment,
      quantity: input.quantity,
      limit: Math.max(input.quantity * 3, 20),
      minRating: input.filters.minRating,
      minReviews: input.filters.minReviews,
      validPhone: true,
    });
    const rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(input.quantity * 3, 20),
      excludePhoneDigits: input.excludePhoneDigits,
      requirePhone: true,
    });
    return this.sortContacts(this.restoreRadarPoolResults(rows)).slice(0, input.quantity);
  }

  private buildRadarLeadPublic(row: any) {
    const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const status = this.resolveRadarLeadStatus(row);
    const ddd = String(row?.ddd || this.extractDdd(row?.phoneDigits || row?.phone));
    const recentEvents = Array.isArray(row?.events) ? row.events : [];
    return {
      id: String(row?.id || ''),
      placeId: row?.placeId || null,
      name: row?.name || '',
      phone: row?.phone || '',
      phoneDigits: row?.phoneDigits || '',
      ddd,
      expectedDdds: parseJsonArray(row?.expectedDddsJson),
      address: row?.address || null,
      city: row?.city || null,
      state: row?.state || null,
      segment: row?.segment || null,
      website: row?.website || null,
      websiteStatus: row?.websiteStatus || inferWebsiteStatus(row?.website),
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: safeInteger(row?.reviews),
      source: row?.source || null,
      sourceEngine: row?.sourceEngine || null,
      sourceUrl: row?.sourceUrl || null,
      sourceEngines: parseJsonArray(row?.sourceEngines),
      opportunityScore: safeInteger(row?.opportunityScore),
      opportunityReason: row?.opportunityReason || null,
      status,
      rejectionReason: row?.rejectionReason || null,
      complaintReason: companyState?.complaintReason || row?.complaintReason || null,
      deniedReason: companyState?.deniedReason || row?.deniedReason || null,
      noAnswerCount: safeInteger(companyState?.noAnswerCount ?? row?.noAnswerCount),
      contactedCount: safeInteger(companyState?.contactedCount ?? row?.contactedCount),
      lastContactAt: (companyState?.lastContactAt || row?.lastContactAt) instanceof Date
        ? (companyState?.lastContactAt || row?.lastContactAt).toISOString()
        : null,
      campaignId: row?.campaignId || null,
      historySummary: recentEvents.slice(0, 3).map((event: any) => ({
        id: String(event?.id || ''),
        eventType: String(event?.eventType || ''),
        note: event?.note || null,
        createdAt: event?.createdAt instanceof Date ? event.createdAt.toISOString() : null,
      })),
      globalNegativeCount: safeInteger(row?.globalNegativeCount),
      globalImportedCount: safeInteger(row?.globalImportedCount),
      globalContactedCount: safeInteger(row?.globalContactedCount),
      firstSeenAt: row?.firstSeenAt instanceof Date ? row.firstSeenAt.toISOString() : null,
      lastSeenAt: row?.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString() : null,
      companyStatus: companyState?.status || status,
      vendasLeadId: companyState?.vendasLeadId || null,
    };
  }

  private buildRadarFacet(key: string, label: string, count: number, tone = 'neutral') {
    return count > 0 ? { key, label, count, tone } : null;
  }

  private buildRadarAvailableFilters(rows: any[]) {
    const states = new Map<string, number>();
    const citiesByState = new Map<string, Map<string, number>>();
    const segments = new Map<string, number>();
    const ddds = new Map<string, number>();
    const statuses = new Map<string, number>();
    const scoreRanges = new Map<string, number>();

    for (const row of rows) {
      const state = String(row?.state || '').trim().toUpperCase();
      const city = String(row?.city || '').trim();
      const segment = String(row?.segment || '').trim();
      const phone = row?.phoneDigits || row?.phone;
      const ddd = String(row?.ddd || this.extractDdd(phone) || '').replace(/\D/g, '').slice(0, 2);
      const status = this.resolveRadarLeadStatus(row);
      const score = safeInteger(row?.opportunityScore);
      const scoreRange = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

      if (state) states.set(state, (states.get(state) || 0) + 1);
      if (state && city) {
        const stateCities = citiesByState.get(state) || new Map<string, number>();
        stateCities.set(city, (stateCities.get(city) || 0) + 1);
        citiesByState.set(state, stateCities);
      }
      if (segment) segments.set(segment, (segments.get(segment) || 0) + 1);
      if (ddd) ddds.set(ddd, (ddds.get(ddd) || 0) + 1);
      if (status) statuses.set(status, (statuses.get(status) || 0) + 1);
      scoreRanges.set(scoreRange, (scoreRanges.get(scoreRange) || 0) + 1);
    }

    const sortEntries = (left: [string, number], right: [string, number]) =>
      right[1] - left[1] || left[0].localeCompare(right[0], 'pt-BR');
    const toOptions = (entries: Iterable<[string, number]>) =>
      Array.from(entries)
        .sort(sortEntries)
        .map(([value, count]) => ({ value, label: value, count }));
    const cityOptionsByState: Record<string, Array<{ value: string; label: string; count: number }>> = {};
    for (const [state, cityCounts] of citiesByState.entries()) {
      cityOptionsByState[state] = toOptions(cityCounts.entries());
    }

    return {
      states: toOptions(states.entries()),
      citiesByState: cityOptionsByState,
      segments: toOptions(segments.entries()),
      ddds: toOptions(ddds.entries()),
      statuses: toOptions(statuses.entries()),
      scoreRanges: toOptions(scoreRanges.entries()),
    };
  }

  private buildRadarFacets(rows: any[]) {
    const statusCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const stateCounts = new Map<string, number>();
    const segmentCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const counters = {
      likelyWhatsapp: 0,
      withoutWhatsapp: 0,
      dddLocal: 0,
      dddMismatch: 0,
      scoreHigh: 0,
      scoreMedium: 0,
      scoreLow: 0,
      noWebsite: 0,
      weakWebsite: 0,
      withWebsite: 0,
    };

    for (const row of rows) {
      const status = this.resolveRadarLeadStatus(row);
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      const city = String(row?.city || '').trim();
      const state = String(row?.state || '').trim().toUpperCase();
      const segment = String(row?.segment || '').trim();
      if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      if (state) stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
      if (segment) segmentCounts.set(segment, (segmentCounts.get(segment) || 0) + 1);
      for (const source of [row?.sourceEngine, row?.source, ...parseJsonArray(row?.sourceEngines)].filter(Boolean)) {
        const normalizedSource = String(source || '').trim();
        if (normalizedSource) sourceCounts.set(normalizedSource, (sourceCounts.get(normalizedSource) || 0) + 1);
      }

      const phone = row?.phoneDigits || row?.phone;
      if (isLikelyWhatsapp(phone)) counters.likelyWhatsapp += 1;
      else counters.withoutWhatsapp += 1;
      const ddd = String(row?.ddd || this.extractDdd(phone));
      const expectedDdds = parseJsonArray(row?.expectedDddsJson);
      if (expectedDdds.length && expectedDdds.includes(ddd)) counters.dddLocal += 1;
      if (this.resolveRadarLeadStatus(row) === 'rejected' && String(row?.rejectionReason || '') === 'ddd_mismatch') counters.dddMismatch += 1;
      const score = safeInteger(row?.opportunityScore);
      if (score >= 70) counters.scoreHigh += 1;
      else if (score >= 45) counters.scoreMedium += 1;
      else counters.scoreLow += 1;
      const websiteStatus = String(row?.websiteStatus || inferWebsiteStatus(row?.website));
      if (websiteStatus === 'none') counters.noWebsite += 1;
      else counters.withWebsite += 1;
      if (websiteStatus === 'weak' || websiteStatus === 'social_only') counters.weakWebsite += 1;
    }

    const fixed = [
      this.buildRadarFacet('all', 'Todos', rows.length, 'neutral'),
      this.buildRadarFacet('new', 'Novos', (statusCounts.get('new') || 0) + (statusCounts.get('clean') || 0), 'info'),
      this.buildRadarFacet('clean', 'Limpos', (statusCounts.get('clean') || 0) + (statusCounts.get('new') || 0), 'info'),
      this.buildRadarFacet('approved', 'Aprovados', statusCounts.get('approved') || 0, 'success'),
      this.buildRadarFacet('sent_to_vendas', 'Já enviados para Vendas', statusCounts.get('sent_to_vendas') || 0, 'success'),
      this.buildRadarFacet('in_attendance', 'Em atendimento', statusCounts.get('in_attendance') || 0, 'info'),
      this.buildRadarFacet('converted', 'Convertidos', statusCounts.get('converted') || 0, 'success'),
      this.buildRadarFacet('negative', 'Negativos', (statusCounts.get('negative') || 0) + (statusCounts.get('denied') || 0), 'warning'),
      this.buildRadarFacet('blocked', 'Bloqueados', statusCounts.get('blocked') || 0, 'danger'),
      this.buildRadarFacet('opt_out', 'Opt-out', statusCounts.get('opt_out') || 0, 'danger'),
      this.buildRadarFacet('discarded', 'Descartados', (statusCounts.get('discarded') || 0) + (statusCounts.get('hidden') || 0), 'neutral'),
      this.buildRadarFacet('complaint', 'Reclamação', statusCounts.get('complaint') || 0, 'danger'),
      this.buildRadarFacet('no_answer', 'Não atenderam', statusCounts.get('no_answer') || 0, 'attention'),
      this.buildRadarFacet('no_whatsapp', 'Contato inválido', (statusCounts.get('no_whatsapp') || 0) + (statusCounts.get('invalid_whatsapp') || 0), 'danger'),
      this.buildRadarFacet('without_whatsapp', 'Sem WhatsApp', counters.withoutWhatsapp, 'neutral'),
      this.buildRadarFacet('likely_whatsapp', 'Com WhatsApp provável', counters.likelyWhatsapp, 'success'),
      this.buildRadarFacet('ddd_local', 'DDD local', counters.dddLocal, 'success'),
      this.buildRadarFacet('ddd_mismatch', 'DDD divergente', counters.dddMismatch, 'alert'),
      this.buildRadarFacet('score_high', 'Score alto', counters.scoreHigh, 'success'),
      this.buildRadarFacet('score_medium', 'Score médio', counters.scoreMedium, 'attention'),
      this.buildRadarFacet('score_low', 'Score baixo', counters.scoreLow, 'neutral'),
      this.buildRadarFacet('no_website', 'Sem site', counters.noWebsite, 'info'),
      this.buildRadarFacet('weak_website', 'Site fraco', counters.weakWebsite, 'warning'),
      this.buildRadarFacet('with_website', 'Com site', counters.withWebsite, 'success'),
    ].filter(Boolean);

    const dynamic = [
      ...Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`city:${label}`, label, count, 'city')),
      ...Array.from(stateCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`state:${label}`, label, count, 'state')),
      ...Array.from(segmentCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`segment:${label}`, label, count, 'segment')),
      ...Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => this.buildRadarFacet(`source:${label}`, label, count, 'source')),
    ].filter(Boolean);

    return [...fixed, ...dynamic];
  }

  async listRadarLeadsForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters({ ...input, engine: undefined });
    if (!(await this.supportsRadarPersistence())) {
      return { items: [], total: 0, facets: [], meta: { available: false, message: 'Banco do Radar ainda nao foi migrado neste ambiente.' } };
    }
    const baseFilters = { ...filters, filterKey: '', status: '' };
    const availabilityFilters = this.normalizeRadarFilters({
      ...input,
      engine: undefined,
      city: '',
      state: '',
      segment: '',
      filterKey: '',
      status: '',
    });
    const availableRows = await this.queryRadarRowsForCompany(context.companyId, availabilityFilters, {
      limit: 2000,
      includeHidden: true,
    });
    const allRows = await this.queryRadarRowsForCompany(context.companyId, baseFilters, {
      limit: 2000,
      includeHidden: true,
    });
    const filteredRows = filters.filterKey || filters.status || filters.ddd || filters.source || filters.scoreRange
      ? this.filterRadarRowsInMemory(allRows, filters)
      : allRows;
    const offset = (filters.page - 1) * filters.limit;
    const pageRows = filteredRows.slice(offset, offset + filters.limit);
    return {
      items: pageRows.map((row) => this.buildRadarLeadPublic(row)),
      total: filteredRows.length,
      facets: this.buildRadarFacets(allRows),
      meta: {
        available: true,
        page: filters.page,
        limit: filters.limit,
        filterKey: filters.filterKey || null,
        availableFilters: this.buildRadarAvailableFilters(availableRows),
      },
    };
  }

  async getRadarLeadForUser(user: any, radarLeadId: string) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
        events: {
          where: { OR: [{ companyId: context.companyId }, { companyId: null }] },
          orderBy: { createdAt: 'desc' },
          take: 80,
        },
      },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    return {
      item: this.buildRadarLeadPublic(row),
      events: (row.events || []).map((event: any) => ({
        id: event.id,
        eventType: event.eventType,
        note: event.note || null,
        statusFrom: event.statusFrom || null,
        statusTo: event.statusTo || null,
        createdByUserId: event.createdByUserId || null,
        createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : null,
      })),
    };
  }

  async listRadarDatabaseForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters({ ...input, engine: undefined });
    if (!(await this.supportsRadarPersistence())) {
      return {
        items: [],
        total: 0,
        meta: {
          available: false,
          message: 'Banco do Radar ainda nao foi migrado neste ambiente.',
        },
      };
    }
    const rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: filters.limit,
      includeHidden: filters.includeHidden,
    });
    return {
      items: rows.map((row) => this.buildRadarLeadPublic(row)),
      total: rows.length,
      meta: {
        available: true,
        filters: {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          noWebsite: filters.noWebsite,
          highOpportunity: filters.opportunityLevel === 'high',
          minRating: filters.minRating,
          minReviews: filters.minReviews,
        },
      },
    };
  }

  private async markRadarDelivered(companyId: number, userId: number, rows: any[]) {
    const now = new Date();
    for (const row of rows) {
      const existing = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      if (['imported_to_vendas', 'sent_to_vendas'].includes(String(existing?.status || '')) || this.isRadarProtectedStatus(existing?.status || row?.status)) continue;
      await (this.prisma as any).radarLeadCompanyState.upsert({
        where: {
          companyId_radarLeadId: {
            companyId,
            radarLeadId: row.id,
          },
        },
        create: {
          companyId,
          radarLeadId: row.id,
          status: 'delivered',
          lastActionAt: now,
        },
        update: {
          status: existing?.status && existing.status !== 'new' ? existing.status : 'delivered',
          lastActionAt: now,
        },
      }).catch(() => null);
    }
  }

  async pullRadarLeadsForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters(input);
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para puxar cards do Radar.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }

    let rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(filters.quantity, filters.minimumStock, 100),
      requirePhone: true,
    });
    const cleanStockBefore = rows.length;
    let replenish: any = {
      ran: false,
      cleanStockBefore,
      cleanStockAfter: cleanStockBefore,
      fetchedCount: 0,
    };

    if (cleanStockBefore < Math.max(filters.minimumStock, filters.quantity)) {
      try {
        replenish = await this.replenishRadarStockForUser(user, {
          ...input,
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          engine: filters.engine,
          targetType: filters.targetType,
        });
      } catch (error: any) {
        const errorMessage = String(error?.message || error);
        replenish = {
          ran: true,
          reason: 'replenish_failed_using_database',
          cleanStockBefore,
          cleanStockAfter: cleanStockBefore,
          fetchedCount: 0,
          error: errorMessage,
        };
        this.logger.warn(
          `[radar] reposicao falhou; usando estoque existente company=${context.companyId} city=${filters.normalizedCity} segment=${filters.normalizedSegment}: ${errorMessage}`,
        );
      }
      rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
        limit: Math.max(filters.quantity, filters.minimumStock, 100),
        requirePhone: true,
      });
    }

    const deliveredRows = rows.slice(0, filters.quantity);
    
    try {
      await this.markRadarDelivered(context.companyId, context.userId, deliveredRows);
    } catch (error: any) {
      this.logger.error(`[radar] failed to mark delivered: ${error?.message || error}`);
    }

    let items: any[] = [];
    try {
      items = deliveredRows.map((row) => this.buildRadarLeadPublic({ ...row, companyStates: [{ status: 'delivered' }] }));
    } catch (error: any) {
      this.logger.error(`[radar] failed to build public leads: ${error?.message || error}`);
      items = deliveredRows.map((row) => ({
        placeId: row?.placeId || `radar:${row?.id}`,
        name: String(row?.name || 'Empresa sem nome'),
        phone: row?.phone || row?.phoneDigits || '',
      }));
    }

    return {
      items,
      meta: {
        requestedQuantity: filters.quantity,
        deliveredCount: deliveredRows.length,
        cleanStockBefore,
        cleanStockAfter: rows.length,
        minimumStock: filters.minimumStock,
        desiredStock: filters.desiredStock,
        replenish,
      },
    };
  }

  private async getRadarStockConfig(filters: NormalizedRadarFilters) {
    if (!(await this.prisma.hasTable('RadarStockConfig'))) {
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    const existing = await (this.prisma as any).radarStockConfig.findUnique({
      where: {
        normalizedCity_state_normalizedSegment: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
        },
      },
    }).catch(() => null);
    if (!existing) {
      await (this.prisma as any).radarStockConfig.create({
        data: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          engine: filters.engine,
          targetType: filters.targetType,
          filtersJson: JSON.stringify({
            minRating: filters.minRating,
            minReviews: filters.minReviews,
            noWebsite: filters.noWebsite,
            weakWebsite: filters.weakWebsite,
            opportunityLevel: filters.opportunityLevel,
          }),
        },
      }).catch(() => null);
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    return {
      desiredStock: Math.max(1, Math.trunc(Number(existing.desiredStock || filters.desiredStock))),
      minimumStock: Math.max(1, Math.trunc(Number(existing.minimumStock || filters.minimumStock))),
      engine: normalizeEngine(existing.engine || filters.engine),
      targetType: normalizeTargetType(existing.targetType || filters.targetType),
    };
  }

  async replenishRadarStockForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters(input);
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para repor o estoque do Radar.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const stockConfig = await this.getRadarStockConfig(filters);
    const effectiveFilters = {
      ...filters,
      desiredStock: stockConfig.desiredStock,
      minimumStock: stockConfig.minimumStock,
      engine: stockConfig.engine,
      targetType: stockConfig.targetType,
    };
    const beforeRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: true,
    });
    const allKnownRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity, 1000),
      requirePhone: true,
      includeHidden: true,
    });
    const cleanStockBefore = beforeRows.length;
    if (cleanStockBefore >= effectiveFilters.minimumStock) {
      return {
        ran: false,
        reason: 'stock_above_minimum',
        cleanStockBefore,
        cleanStockAfter: cleanStockBefore,
        fetchedCount: 0,
        desiredStock: effectiveFilters.desiredStock,
        minimumStock: effectiveFilters.minimumStock,
      };
    }

    const fetchedResults: WebscrapingContactResult[] = [];
    const seenPhones = new Set(allKnownRows.map((row) => normalizePhoneDigits(row?.phoneDigits || row?.phone)).filter(Boolean));
    const shortage = Math.max(0, effectiveFilters.desiredStock - cleanStockBefore);
    let attempts = 0;
    while (fetchedResults.length < shortage && attempts < 6) {
      attempts += 1;
      const batchQuantity = Math.min(maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType), shortage - fetchedResults.length);
      const response = await this.searchContactsForUser(
        user,
        {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          quantity: Math.max(1, batchQuantity),
          engine: effectiveFilters.engine,
          targetType: effectiveFilters.targetType,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          excludePhoneDigits: Array.from(seenPhones),
        },
        {
          skipRadarLookup: true,
          skipPrivateHistory: true,
          skipTechnicalCache: true,
          recordUsage: false,
          purpose: 'radar_pull',
        },
      );
      const mappedResults = (response.results || []).map((result) => ({
        ...result,
        placeId: `radar_external:${normalizePhoneDigits(result.phoneDigits || result.phone) || result.name}`,
      })) as WebscrapingContactResult[];
      let acceptedInBatch = 0;
      for (const result of mappedResults) {
        const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
        if (!phone || seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        fetchedResults.push(result);
        acceptedInBatch += 1;
      }
      if (acceptedInBatch === 0) break;
    }

    if (fetchedResults.length) {
      try {
        await this.persistRadarLeadPoolBatch(
          {
            ...this.normalizeSearchInput({
              city: filters.city,
              state: filters.state,
              segment: filters.segment,
              quantity: Math.min(fetchedResults.length, maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType)),
              engine: effectiveFilters.engine,
              targetType: effectiveFilters.targetType,
              minRating: filters.minRating,
              minReviews: filters.minReviews,
            }),
            city: filters.city,
            state: filters.state,
            segment: filters.segment,
            normalizedCity: filters.normalizedCity,
            normalizedSegment: filters.normalizedSegment,
          },
          fetchedResults,
          effectiveFilters.engine,
        );
      } catch (error: any) {
        this.logger.error(`[radar] failed to persist batch: ${error?.message || error}`);
      }
    }

    const afterRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: true,
    });

    return {
      ran: true,
      reason: 'stock_below_minimum',
      cleanStockBefore,
      cleanStockAfter: afterRows.length,
      fetchedCount: fetchedResults.length,
      desiredStock: effectiveFilters.desiredStock,
      minimumStock: effectiveFilters.minimumStock,
      attempts,
    };
  }

  private async persistRadarLeadPoolBatch(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    sourceEngine: string,
    options: { campaignId?: string | null; strictLocalDdd?: boolean; sourceUrl?: string | null } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    const delegate = (this.prisma as any).radarLeadPool;
    const now = new Date();
    const expectedDdds = this.buildExpectedDdds(input);
    const strictLocalDdd = options.strictLocalDdd ?? input.targetType === 'pf';
    const counts = { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    for (const result of this.mergeDedupedContacts(results)) {
      const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
      const ddd = this.extractDdd(phoneDigits || result.phone);
      const placeId = result.placeId && !String(result.placeId).startsWith('radar:') && !String(result.placeId).startsWith('radar_external:')
        ? String(result.placeId)
        : null;
      if (!phoneDigits && !placeId) continue;
      const dddMismatch = strictLocalDdd && expectedDdds.length > 0 && ddd && !expectedDdds.includes(ddd);
      const websiteStatus = inferWebsiteStatus(result.website);
      const opportunityScore = this.buildOpportunityScore(result);
      const opportunityReason = result.opportunityReason || this.buildOpportunityReason(result, input);
      const existing = await delegate.findFirst({
        where: {
          OR: [
            ...(phoneDigits ? [{ phoneDigits }] : []),
            ...(placeId ? [{ placeId }] : []),
          ],
        },
      }).catch(() => null);
      if (existing?.id) counts.duplicateCount += 1;
      if (dddMismatch) counts.rejectedCount += 1;
      else counts.approvedCount += 1;
      const sourceEngines = Array.from(new Set([...parseJsonArray(existing?.sourceEngines), sourceEngine, result.source].filter(Boolean).map(String)));
      const data = {
        companyId: existing?.companyId || null,
        placeId: placeId || existing?.placeId || null,
        name: result.name || existing?.name || 'Empresa sem nome',
        phone: result.phone || existing?.phone || phoneDigits || null,
        phoneDigits: phoneDigits || existing?.phoneDigits || null,
        ddd: ddd || existing?.ddd || null,
        expectedDddsJson: expectedDdds.length ? JSON.stringify(expectedDdds) : existing?.expectedDddsJson || null,
        address: result.address || existing?.address || null,
        city: input.city || existing?.city || null,
        state: input.state || existing?.state || null,
        normalizedCity: input.normalizedCity,
        segment: input.segment || existing?.segment || null,
        normalizedSegment: input.normalizedSegment,
        website: result.website || existing?.website || null,
        websiteStatus,
        rating: result.rating == null ? existing?.rating ?? null : result.rating,
        reviews: Math.max(safeInteger(result.reviews), safeInteger(existing?.reviews)),
        source: result.source || existing?.source || sourceEngine || null,
        sourceEngine: sourceEngine || existing?.sourceEngine || null,
        sourceUrl: options.sourceUrl || existing?.sourceUrl || null,
        sourceEngines: JSON.stringify(sourceEngines),
        opportunityScore,
        opportunityReason,
        status: dddMismatch ? 'rejected' : existing?.status || 'clean',
        rejectionReason: dddMismatch ? 'ddd_mismatch' : existing?.rejectionReason || null,
        campaignId: options.campaignId || existing?.campaignId || null,
        metadataJson: JSON.stringify({
          targetType: input.targetType,
          expectedDdds,
          lastSourceEngine: sourceEngine,
        }),
        lastSeenAt: now,
      };
      if (existing?.id) {
        await delegate.update({
          where: { id: existing.id },
          data,
        }).catch(() => null);
      } else {
        await delegate.create({
          data: {
            ...data,
            firstSeenAt: now,
          },
        }).catch(() => null);
      }
      counts.savedCount += 1;
    }
    return counts;
  }

  private async recordRadarLeadEvent(input: {
    leadId: string;
    companyId?: number | null;
    userId?: number | null;
    eventType: RadarLeadEventType;
    note?: string | null;
    statusFrom?: string | null;
    statusTo?: string | null;
  }) {
    if (!(await this.prisma.hasTable('RadarLeadEvent'))) return null;
    return (this.prisma as any).radarLeadEvent.create({
      data: {
        leadId: input.leadId,
        companyId: input.companyId || null,
        eventType: input.eventType,
        note: String(input.note || '').trim() || null,
        statusFrom: input.statusFrom || null,
        statusTo: input.statusTo || null,
        createdByUserId: input.userId || null,
      },
    }).catch(() => null);
  }

  async addRadarLeadEventForUser(
    user: any,
    radarLeadId: string,
    input: { eventType?: RadarLeadEventType | string; note?: string | null } = {},
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');

    const eventType = String(input.eventType || '').trim().toLowerCase() as RadarLeadEventType;
    if (!['denied', 'complaint', 'no_answer', 'hidden', 'contacted'].includes(eventType)) {
      throw new BadRequestException('Evento do Radar invalido.');
    }

    const previousStatus = this.resolveRadarLeadStatus(row);
    const nextStatus: RadarLeadStatus =
      eventType === 'hidden'
        ? 'hidden'
        : eventType === 'contacted'
          ? previousStatus
          : eventType as RadarLeadStatus;
    const now = new Date();
    const note = String(input.note || '').trim();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status: nextStatus,
        lastActionAt: now,
        lastContactAt: eventType === 'contacted' || eventType === 'no_answer' ? now : null,
        noAnswerCount: eventType === 'no_answer' ? 1 : 0,
        contactedCount: eventType === 'contacted' ? 1 : 0,
        complaintReason: eventType === 'complaint' ? note || null : null,
        deniedReason: eventType === 'denied' ? note || null : null,
      },
      update: {
        status: nextStatus,
        lastActionAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null } : {}),
      },
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        lastSeenAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, globalContactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
      },
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType,
      note,
      statusFrom: previousStatus,
      statusTo: nextStatus,
    });
    return this.getRadarLeadForUser(user, row.id);
  }

  async importRadarLeadToVendasForUser(user: any, radarLeadId: string) {
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para importacao.');
    }
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');

    const imported = await this.vendasService.importWebscrapingLeadsForUser(user, {
      sourceHistoryId: `radar:${row.id}`,
      leads: [
        {
          sourceHistoryId: `radar:${row.id}`,
          name: row.name,
          phone: row.phone || row.phoneDigits,
          phoneDigits: row.phoneDigits || normalizePhoneDigits(row.phone),
          address: row.address || undefined,
          website: row.website || undefined,
          rating: row.rating ?? undefined,
          reviews: row.reviews ?? undefined,
          city: row.city || undefined,
          segment: row.segment || undefined,
          shortNote: row.opportunityReason || undefined,
        },
      ],
    } as any);
    const vendasLeadId = imported?.leads?.[0]?.id || null;
    const now = new Date();
    await (this.prisma as any).$transaction([
      (this.prisma as any).radarLeadCompanyState.upsert({
        where: {
          companyId_radarLeadId: {
            companyId: context.companyId,
            radarLeadId: row.id,
          },
        },
        create: {
          companyId: context.companyId,
          radarLeadId: row.id,
          vendasLeadId,
          status: 'sent_to_vendas',
          lastActionAt: now,
        },
        update: {
          vendasLeadId,
          status: 'sent_to_vendas',
          lastActionAt: now,
        },
      }),
      (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
        },
      }),
    ]).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'imported_to_vendas',
      statusFrom: this.normalizeRadarLeadStatus(row.status),
      statusTo: 'sent_to_vendas',
    });

    return {
      ok: true,
      radarLeadId: row.id,
      vendasLeadId,
      import: imported,
    };
  }

  async markRadarLeadsSentToVendasForUser(user: any, radarLeadIds: string[] = []) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) return { ok: false, updatedCount: 0 };
    const ids = Array.from(new Set((Array.isArray(radarLeadIds) ? radarLeadIds : []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 100);
    if (!ids.length) return { ok: true, updatedCount: 0 };
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { id: { in: ids } },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => []);
    const now = new Date();
    let updatedCount = 0;
    for (const row of rows || []) {
      const existing = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      if (this.isRadarProtectedStatus(existing?.status || row?.status)) continue;
      await (this.prisma as any).radarLeadCompanyState.upsert({
        where: {
          companyId_radarLeadId: {
            companyId: context.companyId,
            radarLeadId: row.id,
          },
        },
        create: {
          companyId: context.companyId,
          radarLeadId: row.id,
          status: 'sent_to_vendas',
          lastActionAt: now,
        },
        update: {
          status: 'sent_to_vendas',
          lastActionAt: now,
        },
      }).catch(() => null);
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
        },
      }).catch(() => null);
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'imported_to_vendas',
        statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
        statusTo: 'sent_to_vendas',
      });
      updatedCount += 1;
    }
    return { ok: true, updatedCount };
  }

  async getRadarContactProtectionForUser(user: any, input: { phone?: string | null; phoneDigits?: string | null }) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      return { blocked: false, reason: 'radar_unavailable' };
    }
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { blocked: false, reason: 'no_phone' };
    const row = await (this.prisma as any).radarLeadPool.findFirst({
      where: {
        OR: [
          { phoneDigits },
          { phoneDigits: phoneDigits.startsWith('55') ? phoneDigits.slice(2) : `55${phoneDigits}` },
        ],
      },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
      },
    }).catch(() => null);
    if (!row) return { blocked: false, reason: 'not_found' };
    const companyState = Array.isArray(row.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const status = this.normalizeRadarLeadStatus(companyState?.status || row.status);
    const blocked = this.isRadarProtectedStatus(status);
    return {
      blocked,
      status,
      radarLeadId: row.id,
      reason: blocked ? companyState?.negativeReason || companyState?.deniedReason || row.deniedReason || row.complaintReason || status : null,
    };
  }

  async markRadarContactDispositionForUser(
    user: any,
    input: {
      phone?: string | null;
      phoneDigits?: string | null;
      name?: string | null;
      city?: string | null;
      state?: string | null;
      segment?: string | null;
      status: string;
      reason?: string | null;
      source?: string | null;
    },
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) return { ok: false, reason: 'radar_unavailable' };
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { ok: false, reason: 'no_phone' };
    const now = new Date();
    let row = await (this.prisma as any).radarLeadPool.findFirst({
      where: { phoneDigits },
    }).catch(() => null);
    if (!row) {
      row = await (this.prisma as any).radarLeadPool.create({
        data: {
          name: String(input.name || 'Contato sem nome').trim() || 'Contato sem nome',
          phone: String(input.phone || phoneDigits).trim() || phoneDigits,
          phoneDigits,
          ddd: this.extractDdd(phoneDigits),
          city: String(input.city || '').trim() || null,
          state: String(input.state || '').trim().toUpperCase() || null,
          normalizedCity: normalizeLookupValue(String(input.city || '')),
          segment: String(input.segment || '').trim() || null,
          normalizedSegment: normalizeLookupValue(String(input.segment || '')),
          websiteStatus: 'unknown',
          source: input.source || 'vendas_automation',
          sourceEngine: 'vendas_automation',
          sourceEngines: JSON.stringify(['vendas_automation']),
          opportunityScore: 0,
          opportunityReason: 'Criado para proteger histórico operacional de Vendas.',
          status: 'clean',
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
    }
    return this.markRadarLeadNegativeForUser(user, row.id, {
      status: input.status,
      reason: input.reason || input.status,
      privateNotes: input.source || 'Vendas Automação',
    });
  }

  async markRadarLeadNegativeForUser(user: any, radarLeadId: string, input: { status?: string; reason?: string; privateNotes?: string } = {}) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const normalizedStatus = String(input.status || '').trim().toLowerCase();
    const status: RadarLeadStatus =
      normalizedStatus === 'discarded' || normalizedStatus === 'descartado'
        ? 'discarded'
        : normalizedStatus === 'blocked' || normalizedStatus === 'bloqueado'
          ? 'blocked'
          : normalizedStatus === 'opt_out' || normalizedStatus === 'optout'
            ? 'opt_out'
            : normalizedStatus === 'no_whatsapp'
              ? 'no_whatsapp'
              : normalizedStatus === 'invalid_whatsapp'
                ? 'invalid_whatsapp'
              : 'negative';
    const existing = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
    }).catch(() => null);
    const now = new Date();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
      update: {
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
    });
    if (!this.isRadarProtectedStatus(existing?.status)) {
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          status,
          deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : undefined,
          globalNegativeCount: { increment: 1 },
          lastSeenAt: now,
        },
      }).catch(() => null);
    }
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: status === 'discarded'
        ? 'discarded'
        : status === 'blocked'
          ? 'blocked'
          : status === 'opt_out'
            ? 'opt_out'
            : status === 'no_whatsapp' || status === 'invalid_whatsapp'
              ? 'no_answer'
              : 'negative',
      note: String(input.reason || '').trim() || null,
      statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
      statusTo: status,
    });
    return {
      ok: true,
      radarLeadId: row.id,
      status,
    };
  }

  private normalizeRadarCampaignInput(input: RadarCampaignInput = {}) {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const segment = String(input.segment || '').trim();
    const mode = String(input.mode || '').trim().toLowerCase() === 'mass_data' ? 'mass_data' : 'radar_database';
    const rawTargetType = String(input.targetType || '').trim().toLowerCase();
    const targetType = mode === 'mass_data' && rawTargetType === 'both' ? 'both' : normalizeTargetType(input.targetType);
    const targetTotal = Math.min(Math.max(Math.trunc(Number(input.targetTotal || (mode === 'mass_data' ? 0 : 100)) || 0), 0), 100_000);
    const configuredBatchSize = parsePositiveIntegerEnv('HBX_RADAR_BATCH_SIZE', mode === 'mass_data' ? 20 : 25);
    const batchSizeMax = mode === 'mass_data' ? 20 : 50;
    const batchSize = Math.min(Math.max(Math.trunc(Number(input.batchSize || configuredBatchSize) || configuredBatchSize), 1), batchSizeMax);
    const allowedStartHour = Math.min(Math.max(Math.trunc(Number(input.allowedStartHour ?? parsePositiveIntegerEnv('HBX_RADAR_NIGHT_START_HOUR', mode === 'mass_data' ? 20 : 0))), 0), 23);
    const allowedEndHour = Math.min(Math.max(Math.trunc(Number(input.allowedEndHour ?? parsePositiveIntegerEnv('HBX_RADAR_NIGHT_END_HOUR', mode === 'mass_data' ? 8 : 6))), 0), 23);
    const timezone = String(input.timezone || process.env.HBX_RADAR_NIGHT_TIMEZONE || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
    const nightOnly = input.nightOnly == null ? true : coerceBoolean(input.nightOnly);
    const maxAttemptsPerTask = Math.min(Math.max(Math.trunc(Number(input.maxAttemptsPerTask || 3) || 3), 1), 10);
    const maxAttempts = mode === 'mass_data' ? maxAttemptsPerTask : Math.max(Math.ceil(Math.max(1, targetTotal) / Math.max(1, batchSize)) * 3, 40);
    return {
      city,
      state,
      segment,
      mode,
      targetType,
      targetTotal,
      batchSize,
      maxAttempts,
      maxAttemptsPerTask,
      nightOnly,
      allowedStartHour,
      allowedEndHour,
      timezone,
    };
  }

  private getZonedHour(timezone: string, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
      return Number.isFinite(hour) ? hour : date.getHours();
    } catch {
      return date.getHours();
    }
  }

  private isWithinRadarWindow(campaign: any, date = new Date()) {
    if (!campaign?.nightOnly) return true;
    if (String(process.env.HBX_RADAR_NIGHT_WORKER_ENABLED || 'true').trim().toLowerCase() === 'false') return false;
    const start = safeInteger(campaign.allowedStartHour, 0);
    const end = safeInteger(campaign.allowedEndHour, 6);
    const hour = this.getZonedHour(String(campaign.timezone || 'America/Sao_Paulo'), date);
    if (start === end) return true;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  private nextRadarWindowAt(campaign: any, date = new Date()) {
    const next = new Date(date);
    const hour = this.getZonedHour(String(campaign.timezone || 'America/Sao_Paulo'), date);
    const start = safeInteger(campaign.allowedStartHour, 0);
    if (this.isWithinRadarWindow(campaign, date)) return date;
    const hoursUntilStart = (start - hour + 24) % 24 || 24;
    next.setHours(next.getHours() + hoursUntilStart, 0, 0, 0);
    return next;
  }

  private scheduleRadarCampaignPump(delayMs = 0) {
    setTimeout(() => {
      void this.processNextRadarCampaigns();
    }, Math.max(0, delayMs));
  }

  private buildRadarCampaignQuery(input: NormalizedSearchInput, attempt: number) {
    if (input.targetType === 'pj') {
      const queries = [
        this.compactQuery([input.segment, input.city, input.state, 'telefone']),
        this.compactQuery([input.segment, input.city, input.state, 'whatsapp']),
        this.compactQuery([input.segment, input.city, input.state, 'site oficial']),
        this.compactQuery([input.segment, 'perto de', input.city, input.state]),
      ].filter(Boolean);
      return queries[Math.max(0, attempt - 1) % queries.length] || input.segment;
    }
    return this.buildHbxBatchQuery(input, attempt);
  }

  private buildMassDataTaskQuery(city: string, state: string, segment: string, attempt: number) {
    const variation = Math.min(Math.max(Math.trunc(Number(attempt || 1)), 1), 3);
    if (variation === 1) return this.compactQuery([segment, city, state, 'telefone']);
    if (variation === 2) return this.compactQuery([segment, city, state, 'whatsapp']);
    return this.compactQuery([segment, city, state, 'contato']);
  }

  private async listMassDataCities(state: string, city?: string | null) {
    const normalizedState = String(state || '').trim().toUpperCase();
    const requestedCity = String(city || '').trim();
    if (requestedCity) return [requestedCity];
    try {
      const rows = await this.loadBrazilianCities();
      const suffix = ` - ${normalizedState}`;
      const cities = rows
        .filter((item) => item.endsWith(suffix))
        .map((item) => item.slice(0, -suffix.length).trim())
        .filter(Boolean);
      if (cities.length) return cities;
    } catch {
      // Fallback below keeps AC mass-data acceptance usable when IBGE is unavailable.
    }
    return normalizedState === 'AC' ? ACRE_CITIES_FALLBACK : [];
  }

  private getMassDataSegments(segment?: string | null) {
    const explicit = String(segment || '').trim();
    if (!explicit || ['aberto', 'todos', 'todas'].includes(normalizeLookupValue(explicit))) {
      return MASS_DATA_INTERNAL_SEGMENTS;
    }
    return [explicit, ...MASS_DATA_INTERNAL_SEGMENTS.filter((item) => normalizeLookupValue(item) !== normalizeLookupValue(explicit))];
  }

  private getMassDataTargetTypes(value: unknown): HbxTargetType[] {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'both' || normalized === 'pf_pj' || normalized === 'pj_pf') return ['pj', 'pf'];
    if (normalized === 'pf') return ['pf'];
    return ['pj'];
  }

  private async createMassDataTasks(campaignId: string, state: string, city: string | null, segment: string | null, targetType: unknown, maxAttempts: number) {
    const cities = await this.listMassDataCities(state, city);
    if (!cities.length) throw new BadRequestException('Nao encontrei cidades para o estado informado.');
    const segments = this.getMassDataSegments(segment);
    const targetTypes = this.getMassDataTargetTypes(targetType);
    let created = 0;
    for (const taskCity of cities) {
      for (const taskSegment of segments) {
        for (const taskTargetType of targetTypes) {
          const query = this.buildMassDataTaskQuery(taskCity, state, taskSegment, 1);
          const inserted = await (this.prisma as any).webscrapingCampaignTask.upsert({
            where: {
              campaignId_state_city_segment_targetType: {
                campaignId,
                state,
                city: taskCity,
                segment: taskSegment,
                targetType: taskTargetType,
              },
            },
            create: {
              campaignId,
              state,
              city: taskCity,
              segment: taskSegment,
              targetType: taskTargetType,
              query,
              maxAttempts,
            },
            update: {},
          });
          created += 1;
        }
      }
    }
    return { cityCount: cities.length, taskCount: created, segmentCount: segments.length, targetTypeCount: targetTypes.length };
  }

  private async listAutonomousMassDataLocations() {
    try {
      const rows = await this.loadBrazilianCities();
      const parsed = rows
        .map((item) => {
          const match = String(item || '').trim().match(/^(.*?)\s-\s([A-Za-z]{2})$/);
          return match ? { city: match[1].trim(), state: match[2].trim().toUpperCase() } : null;
        })
        .filter((item): item is { city: string; state: string } => Boolean(item?.city && item?.state));
      if (parsed.length) return parsed;
    } catch {
      // Fallback keeps the autonomous queue alive if IBGE is temporarily unavailable.
    }
    return AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK;
  }

  private deterministicHash(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private rotateMassDataPool<T>(items: T[], seed: string) {
    if (!items.length) return [];
    const offset = this.deterministicHash(seed) % items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
  }

  private autonomousRotationSeed(campaign: any, suffix: string, now = new Date()) {
    const hourBucket = now.toISOString().slice(0, 13);
    return [
      hourBucket,
      campaign?.id || 'no-campaign',
      campaign?.companyId || 'no-company',
      campaign?.state || '',
      campaign?.city || '',
      campaign?.segment || '',
      suffix,
    ].join('|');
  }

  private isExplicitMassDataSegment(value: unknown) {
    const normalized = normalizeLookupValue(String(value || ''));
    return Boolean(normalized && !['segmentos internos', 'aberto', 'todos', 'todas'].includes(normalized));
  }

  private async buildAutonomousMassDataLocationPool(campaign: any, now = new Date()) {
    const guidedState = String(campaign?.state || '').trim().toUpperCase();
    const guidedCity = String(campaign?.city || '').trim();
    if (guidedState && guidedCity) return [{ city: guidedCity, state: guidedState }];

    if (guidedState) {
      const cities = await this.listMassDataCities(guidedState, null).catch(() => []);
      if (cities.length) {
        return this.rotateMassDataPool(
          cities.map((city) => ({ city, state: guidedState })),
          this.autonomousRotationSeed(campaign, `state:${guidedState}`, now),
        );
      }
      const fallback = AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK.filter((item) => item.state === guidedState);
      if (fallback.length) return this.rotateMassDataPool(fallback, this.autonomousRotationSeed(campaign, `fallback-state:${guidedState}`, now));
    }

    const national = await this.listAutonomousMassDataLocations();
    const rotated = this.rotateMassDataPool(national, this.autonomousRotationSeed(campaign, 'national-location', now));
    if (guidedCity) {
      const cityKey = normalizeLookupValue(guidedCity);
      const matches = rotated.filter((item) => normalizeLookupValue(item.city) === cityKey);
      if (matches.length) return matches;
    }
    return rotated;
  }

  private buildAutonomousMassDataSegments(campaign: any, now = new Date()) {
    const explicitSegment = String(campaign?.segment || '').trim();
    const base = this.isExplicitMassDataSegment(explicitSegment)
      ? [explicitSegment, ...MASS_DATA_INTERNAL_SEGMENTS.filter((segment) => normalizeLookupValue(segment) !== normalizeLookupValue(explicitSegment))]
      : MASS_DATA_INTERNAL_SEGMENTS;
    return this.rotateMassDataPool(base, this.autonomousRotationSeed(campaign, 'segment', now));
  }

  private buildAutonomousMassDataCandidateKey(input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    return [
      String(input.state || '').trim().toUpperCase(),
      normalizeLookupValue(input.city),
      normalizeLookupValue(input.segment),
      normalizeTargetType(input.targetType),
    ].join('|');
  }

  private async hasMassDataTaskForCampaign(campaignId: string, input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    if (!campaignId) return false;
    const existingTask = await (this.prisma as any).webscrapingCampaignTask.findFirst({
      where: {
        campaignId,
        state: String(input.state || '').trim().toUpperCase(),
        city: input.city,
        segment: input.segment,
        targetType: input.targetType,
      },
      select: { id: true },
    }).catch(() => null);
    return Boolean(existingTask);
  }

  private async getAutonomousMassDataCombinationMetrics(input: {
    city: string;
    state: string;
    segment: string;
    targetType: HbxTargetType;
  }) {
    const normalizedCity = normalizeLookupValue(input.city);
    const normalizedSegment = normalizeLookupValue(input.segment);
    const state = String(input.state || '').trim().toUpperCase();
    const usableStockWhere = {
      normalizedCity,
      state,
      normalizedSegment,
      phoneDigits: { not: null },
      status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'hidden'] as any },
    };
    const [stockCount, taskHistory, recentBatch] = await Promise.all([
      (this.prisma as any).radarLeadPool.count({ where: usableStockWhere }).catch(() => 0),
      (this.prisma as any).webscrapingCampaignTask.findFirst({
        where: {
          state,
          city: input.city,
          segment: input.segment,
          targetType: input.targetType,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          foundCount: true,
          duplicateCount: true,
          rejectedCount: true,
          updatedAt: true,
        },
      }).catch(() => null),
      (this.prisma as any).webscrapingCampaignBatch.findFirst({
        where: {
          task: {
            state,
            city: input.city,
            segment: input.segment,
            targetType: input.targetType,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          approvedCount: true,
          duplicateCount: true,
          rejectedCount: true,
          createdAt: true,
        },
      }).catch(() => null),
    ]);
    const approved = safeInteger(recentBatch?.approvedCount) + safeInteger(taskHistory?.foundCount);
    const duplicate = safeInteger(recentBatch?.duplicateCount) + safeInteger(taskHistory?.duplicateCount);
    const rejected = safeInteger(recentBatch?.rejectedCount) + safeInteger(taskHistory?.rejectedCount);
    const total = Math.max(1, approved + duplicate + rejected);
    return {
      stockCount: safeInteger(stockCount),
      explored: Boolean(taskHistory),
      duplicateRatio: duplicate / total,
      lastWorkedAt: taskHistory?.updatedAt instanceof Date
        ? taskHistory.updatedAt
        : recentBatch?.createdAt instanceof Date
          ? recentBatch.createdAt
          : null,
    };
  }

  private async rankAutonomousMassDataWorkCandidates(
    campaign: any,
    options: { limit?: number; excludeKeys?: Set<string>; now?: Date } = {},
  ): Promise<AutonomousMassDataCandidate[]> {
    const now = options.now || new Date();
    const campaignId = String(campaign?.id || '').trim();
    const desiredStock = clampInteger(campaign?.desiredStock || campaign?.targetTotal, 300, 20, 1000);
    const minimumStock = Math.min(desiredStock, clampInteger(campaign?.minimumStock, 80, 1, 500));
    const hasGuidedFilter = Boolean(
      String(campaign?.state || '').trim()
      || String(campaign?.city || '').trim()
      || this.isExplicitMassDataSegment(campaign?.segment),
    );
    const mode: AutonomousMassDataStrategyMode = hasGuidedFilter ? 'guided' : 'automatic';
    const locationLimit = hasGuidedFilter ? 160 : 80;
    const candidateLimit = Math.min(Math.max(safeInteger(options.limit, 120), 20), 360);
    const locations = (await this.buildAutonomousMassDataLocationPool(campaign, now)).slice(0, locationLimit);
    const segments = this.buildAutonomousMassDataSegments(campaign, now);
    const targetTypes = this.rotateMassDataPool(this.getMassDataTargetTypes(campaign?.targetType || 'pj'), this.autonomousRotationSeed(campaign, 'target-type', now));
    const rawCandidates: Array<{ city: string; state: string; segment: string; targetType: HbxTargetType; key: string }> = [];
    const seen = new Set<string>();

    for (const location of locations) {
      const state = String(location.state || '').trim().toUpperCase();
      const city = String(location.city || '').trim();
      if (!state || !city) continue;
      for (const segment of segments) {
        for (const targetType of targetTypes) {
          const key = this.buildAutonomousMassDataCandidateKey({ state, city, segment, targetType });
          if (seen.has(key) || options.excludeKeys?.has(key)) continue;
          seen.add(key);
          rawCandidates.push({ state, city, segment, targetType, key });
          if (rawCandidates.length >= candidateLimit) break;
        }
        if (rawCandidates.length >= candidateLimit) break;
      }
      if (rawCandidates.length >= candidateLimit) break;
    }

    const scored: AutonomousMassDataCandidate[] = [];
    for (const candidate of rawCandidates) {
      const [taskExists, metrics] = await Promise.all([
        this.hasMassDataTaskForCampaign(campaignId, candidate),
        this.getAutonomousMassDataCombinationMetrics(candidate),
      ]);
      if (taskExists) continue;
      const lowStock = metrics.stockCount < minimumStock;
      const lowDuplicateRecent = metrics.explored && metrics.duplicateRatio <= 0.35;
      const reason: AutonomousMassDataWorkReason = hasGuidedFilter
        ? 'guided_filter'
        : lowStock
          ? 'low_stock'
          : lowDuplicateRecent
            ? 'low_duplicate_recent'
            : !metrics.explored
              ? 'unexplored'
              : 'fallback_national';
      scored.push({
        ...candidate,
        mode,
        desiredStock,
        minimumStock,
        reason,
        stockCount: metrics.stockCount,
        taskExists,
        duplicateRatio: metrics.duplicateRatio,
        explored: metrics.explored,
        lastWorkedAt: metrics.lastWorkedAt,
      });
    }

    return scored.sort((left, right) => {
      const reasonRank: Record<AutonomousMassDataWorkReason, number> = {
        guided_filter: 0,
        low_stock: 0,
        low_duplicate_recent: 1,
        unexplored: 2,
        fallback_national: 3,
      };
      const leftRank = reasonRank[left.reason] ?? 3;
      const rightRank = reasonRank[right.reason] ?? 3;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left.stockCount !== right.stockCount) return left.stockCount - right.stockCount;
      if (left.duplicateRatio !== right.duplicateRatio) return left.duplicateRatio - right.duplicateRatio;
      const leftWorked = left.lastWorkedAt ? left.lastWorkedAt.getTime() : 0;
      const rightWorked = right.lastWorkedAt ? right.lastWorkedAt.getTime() : 0;
      if (leftWorked !== rightWorked) return leftWorked - rightWorked;
      return left.key.localeCompare(right.key);
    });
  }

  private async resolveAutonomousMassDataWork(
    campaign: any = {},
    options: { excludeKeys?: Set<string>; now?: Date; log?: boolean; limit?: number } = {},
  ): Promise<AutonomousMassDataWork> {
    const candidates = await this.rankAutonomousMassDataWorkCandidates(campaign, {
      limit: options.limit || 120,
      excludeKeys: options.excludeKeys,
      now: options.now,
    });
    const selected = candidates[0];
    if (selected) {
      const work: AutonomousMassDataWork = {
        mode: selected.mode,
        state: selected.state,
        city: selected.city,
        segment: selected.segment,
        targetType: selected.targetType,
        desiredStock: selected.desiredStock,
        minimumStock: selected.minimumStock,
        reason: selected.reason,
        stockCount: selected.stockCount,
      };
      if (options.log) {
        const prefix = work.mode === 'guided' ? 'guided work selected' : 'automatic work selected';
        this.logger.log(`[autonomous-bank] ${prefix} state=${work.state} city=${work.city} segment=${work.segment} reason=${work.reason}`);
        this.logger.log('[autonomous-bank] skipped google for autonomous bank');
      }
      return work;
    }

    const fallback = this.rotateMassDataPool(AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK, this.autonomousRotationSeed(campaign, 'empty-fallback', options.now || new Date()))[0]
      || AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK[0];
    const segment = this.buildAutonomousMassDataSegments(campaign, options.now || new Date())[0] || MASS_DATA_INTERNAL_SEGMENTS[0];
    const work: AutonomousMassDataWork = {
      mode: this.isExplicitMassDataSegment(campaign?.segment) || String(campaign?.state || '').trim() || String(campaign?.city || '').trim() ? 'guided' : 'automatic',
      state: fallback.state,
      city: fallback.city,
      segment,
      targetType: this.getMassDataTargetTypes(campaign?.targetType || 'pj')[0] || 'pj',
      desiredStock: 300,
      minimumStock: 80,
      reason: 'fallback_national',
      stockCount: 0,
    };
    if (options.log) {
      const prefix = work.mode === 'guided' ? 'guided work selected' : 'automatic work selected';
      this.logger.log(`[autonomous-bank] ${prefix} state=${work.state} city=${work.city} segment=${work.segment} reason=${work.reason}`);
      this.logger.log('[autonomous-bank] skipped google for autonomous bank');
    }
    return work;
  }

  private async createAutonomousMassDataTasks(campaign: any, desiredCount: number) {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) return { created: 0, checked: 0 };
    const maxAttempts = Math.max(1, safeInteger(campaign?.maxAttempts, 3));
    const limit = Math.min(Math.max(safeInteger(desiredCount, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS), 1), AUTONOMOUS_MASS_DATA_MAX_TASKS);
    const ranked = await this.rankAutonomousMassDataWorkCandidates(campaign, { limit: Math.min(360, Math.max(80, limit * 3)) });
    const selectedForLog = ranked[0] || await this.resolveAutonomousMassDataWork(campaign, { log: false });
    let created = 0;
    let checked = ranked.length;

    for (const work of ranked) {
      if (created >= limit) break;
      const query = this.buildMassDataTaskQuery(work.city, work.state, work.segment, 1);
      const inserted = await (this.prisma as any).webscrapingCampaignTask.upsert({
        where: {
          campaignId_state_city_segment_targetType: {
            campaignId,
            state: work.state,
            city: work.city,
            segment: work.segment,
            targetType: work.targetType,
          },
        },
        create: {
          campaignId,
          state: work.state,
          city: work.city,
          segment: work.segment,
          targetType: work.targetType,
          query,
          maxAttempts,
        },
        update: {},
      }).catch(() => null);
      if (inserted) created += 1;
    }

    if (created > 0 && selectedForLog) {
      const mode = selectedForLog.mode || 'automatic';
      const prefix = mode === 'guided' ? 'guided work selected' : 'automatic work selected';
      this.logger.log(`[autonomous-bank] ${prefix} state=${selectedForLog.state} city=${selectedForLog.city} segment=${selectedForLog.segment} reason=${selectedForLog.reason}`);
      this.logger.log('[autonomous-bank] skipped google for autonomous bank');
    }
    return { created, checked };
  }

  private async recoverRadarCampaignWork() {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const now = new Date();
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { status: 'running', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { status: 'queued', lockedByEngineId: null, lockedUntil: null, lastError: 'Lock expirado e liberado na retomada.' },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: { in: ['running', 'partial_error', 'sleeping'] } },
      data: { status: 'queued', nextRunAt: now },
    }).catch(() => null);
    this.scheduleRadarCampaignPump(0);
  }

  private parseOperationalMetadata(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return {
        forcedUntil: typeof parsed?.forcedUntil === 'string' ? parsed.forcedUntil : null,
        forcedAt: typeof parsed?.forcedAt === 'string' ? parsed.forcedAt : null,
        autonomousFillEnabled: parsed?.autonomousFillEnabled == null ? true : coerceBoolean(parsed.autonomousFillEnabled),
        autonomousFillBatchSize: clampInteger(
          parsed?.autonomousFillBatchSize,
          AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
          1,
          AUTONOMOUS_MASS_DATA_MAX_TASKS,
        ),
      };
    } catch {
      return {
        forcedUntil: null,
        forcedAt: null,
        autonomousFillEnabled: true,
        autonomousFillBatchSize: AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
      };
    }
  }

  private getForcedUntilDate(config: any) {
    const raw = String(config?.forcedUntil || this.parseOperationalMetadata(config?.metadataJson).forcedUntil || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private isForcedOperationalWindow(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const forcedUntil = this.getForcedUntilDate(config);
    return Boolean(forcedUntil && forcedUntil.getTime() > date.getTime());
  }

  private isWithinConfiguredOperationalWindow(config: any, date = new Date()) {
    if (!config?.enabled) return false;
    const current = date.getHours() * 60 + date.getMinutes();
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const end = safeInteger(config.endHour, 8) * 60 + safeInteger(config.endMinute, 0);
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  private nextOperationalWindowEndAt(config: any, date = new Date()) {
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const end = safeInteger(config.endHour, 8) * 60 + safeInteger(config.endMinute, 0);
    const startAt = this.nextOperationalWindowAt({ ...config, forcedUntil: null }, date);
    const startDate = new Date(startAt);
    if (!Number.isFinite(startDate.getTime())) return new Date(date.getTime() + 2 * 60 * 60_000);
    const endDate = new Date(startDate);
    endDate.setHours(Math.floor(end / 60), end % 60, 0, 0);
    if (end <= start) endDate.setDate(endDate.getDate() + 1);
    if (this.isWithinConfiguredOperationalWindow(config, date)) {
      const currentEnd = new Date(date);
      currentEnd.setHours(Math.floor(end / 60), end % 60, 0, 0);
      if (end <= start && (date.getHours() * 60 + date.getMinutes()) >= start) currentEnd.setDate(currentEnd.getDate() + 1);
      if (end > start && currentEnd.getTime() <= date.getTime()) currentEnd.setDate(currentEnd.getDate() + 1);
      return currentEnd;
    }
    return endDate;
  }

  private buildForcedUntil(config: any, date = new Date()) {
    const windowEnd = this.nextOperationalWindowEndAt(config, date);
    return windowEnd.toISOString();
  }

  private normalizeOperationalConfigInput(input: WebscrapingOperationalConfigInput = {}, existingMetadataJson?: unknown) {
    const rawIntensity = String(input.intensity || 'turbo').trim().toLowerCase();
    const intensity = rawIntensity === 'economico' || rawIntensity === 'econômico'
      ? 'economico'
      : rawIntensity === 'normal'
        ? 'normal'
        : 'turbo';
    const base = {
      enabled: input.enabled == null ? true : coerceBoolean(input.enabled),
      preset: TURBO_OPERATIONAL_CONFIG_KEY,
      startHour: clampInteger(input.startHour, 20, 0, 23),
      startMinute: clampInteger(input.startMinute, 0, 0, 59),
      endHour: clampInteger(input.endHour, 8, 0, 23),
      endMinute: clampInteger(input.endMinute, 0, 0, 59),
      engineCount: clampInteger(input.engineCount, getConfiguredHbxEngineCount(), 1, getConfiguredHbxEngineCount()),
      intensity,
      memoryTargetGb: clampInteger(input.memoryTargetGb, 16, 1, 256),
      batchSize: clampInteger(input.batchSize, 20, 1, 20),
      maxAttemptsPerTask: clampInteger(input.maxAttemptsPerTask, 3, 1, 10),
      engineUrlsJson: JSON.stringify(DEFAULT_MASS_DATA_ENGINE_URLS),
    };
    const existingMetadata = this.parseOperationalMetadata(existingMetadataJson);
    const autonomousFillEnabled = input.autonomousFillEnabled == null
      ? existingMetadata.autonomousFillEnabled
      : coerceBoolean(input.autonomousFillEnabled);
    const autonomousFillBatchSize = clampInteger(
      input.autonomousFillBatchSize,
      existingMetadata.autonomousFillBatchSize,
      1,
      AUTONOMOUS_MASS_DATA_MAX_TASKS,
    );
    const explicitForcedUntil = String(input.forcedUntil || '').trim();
    const now = new Date();
    const forcedUntil = coerceBoolean(input.forceNow)
      ? this.buildForcedUntil(base, now)
      : explicitForcedUntil
        ? explicitForcedUntil
        : existingMetadata.forcedUntil && new Date(existingMetadata.forcedUntil).getTime() > now.getTime()
          ? existingMetadata.forcedUntil
          : null;
    return {
      ...base,
      metadataJson: JSON.stringify({
        forcedUntil,
        forcedAt: coerceBoolean(input.forceNow) ? now.toISOString() : existingMetadata.forcedAt,
        autonomousFillEnabled,
        autonomousFillBatchSize,
      }),
      forcedUntil,
      autonomousFillEnabled,
      autonomousFillBatchSize,
    };
  }

  private async getOperationalConfig() {
    const defaults = this.normalizeOperationalConfigInput();
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) {
      return { key: TURBO_OPERATIONAL_CONFIG_KEY, ...defaults, createdAt: null, updatedAt: null };
    }
    const row = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
    }).catch(() => null);
    if (!row) return { key: TURBO_OPERATIONAL_CONFIG_KEY, ...defaults, createdAt: null, updatedAt: null };
    const metadata = this.parseOperationalMetadata(row.metadataJson);
    return {
      key: row.key,
      enabled: Boolean(row.enabled),
      preset: row.preset || TURBO_OPERATIONAL_CONFIG_KEY,
      startHour: safeInteger(row.startHour, defaults.startHour),
      startMinute: safeInteger(row.startMinute, defaults.startMinute),
      endHour: safeInteger(row.endHour, defaults.endHour),
      endMinute: safeInteger(row.endMinute, defaults.endMinute),
      engineCount: Math.min(Math.max(safeInteger(row.engineCount, defaults.engineCount), 1), getConfiguredHbxEngineCount()),
      intensity: String(row.intensity || defaults.intensity),
      memoryTargetGb: safeInteger(row.memoryTargetGb, defaults.memoryTargetGb),
      batchSize: Math.min(Math.max(safeInteger(row.batchSize, defaults.batchSize), 1), 20),
      maxAttemptsPerTask: Math.min(Math.max(safeInteger(row.maxAttemptsPerTask, defaults.maxAttemptsPerTask), 1), 10),
      engineUrlsJson: row.engineUrlsJson || defaults.engineUrlsJson,
      metadataJson: row.metadataJson || null,
      forcedUntil: metadata.forcedUntil,
      forcedAt: metadata.forcedAt,
      autonomousFillEnabled: metadata.autonomousFillEnabled,
      autonomousFillBatchSize: metadata.autonomousFillBatchSize,
      isTurboForcedNow: Boolean(metadata.forcedUntil && new Date(metadata.forcedUntil).getTime() > Date.now()),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private async saveOperationalConfig(masterUserId: number, input: WebscrapingOperationalConfigInput = {}) {
    if (!(await this.prisma.hasTable('WebscrapingOperationalConfig').catch(() => false))) {
      throw new ServiceUnavailableException('Estrutura de configuracao operacional do Webscraping ainda nao foi aplicada no banco.');
    }
    const current = await (this.prisma as any).webscrapingOperationalConfig.findUnique({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
      select: { metadataJson: true },
    }).catch(() => null);
    const normalized = this.normalizeOperationalConfigInput(input, current?.metadataJson);
    const { forcedUntil, ...data } = normalized;
    const saved = await (this.prisma as any).webscrapingOperationalConfig.upsert({
      where: { key: TURBO_OPERATIONAL_CONFIG_KEY },
      create: {
        key: TURBO_OPERATIONAL_CONFIG_KEY,
        ...data,
        createdByUserId: masterUserId || null,
        updatedByUserId: masterUserId || null,
      },
      update: {
        ...data,
        updatedByUserId: masterUserId || null,
      },
    });
    return {
      key: saved.key,
      enabled: saved.enabled,
      preset: saved.preset,
      startHour: saved.startHour,
      startMinute: saved.startMinute,
      endHour: saved.endHour,
      endMinute: saved.endMinute,
      engineCount: saved.engineCount,
      intensity: saved.intensity,
      memoryTargetGb: saved.memoryTargetGb,
      batchSize: saved.batchSize,
      maxAttemptsPerTask: saved.maxAttemptsPerTask,
      forcedUntil,
      forcedAt: this.parseOperationalMetadata(saved.metadataJson).forcedAt,
      autonomousFillEnabled: this.parseOperationalMetadata(saved.metadataJson).autonomousFillEnabled,
      autonomousFillBatchSize: this.parseOperationalMetadata(saved.metadataJson).autonomousFillBatchSize,
      isTurboForcedNow: Boolean(forcedUntil && new Date(forcedUntil).getTime() > Date.now()),
      createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : null,
      updatedAt: saved.updatedAt instanceof Date ? saved.updatedAt.toISOString() : null,
    };
  }

  private isWithinOperationalWindow(config: any, date = new Date()) {
    return this.isForcedOperationalWindow(config, date) || this.isWithinConfiguredOperationalWindow(config, date);
  }

  private nextOperationalWindowAt(config: any, date = new Date()) {
    const next = new Date(date);
    if (this.isWithinConfiguredOperationalWindow(config, date)) return next.toISOString();
    const current = date.getHours() * 60 + date.getMinutes();
    const start = safeInteger(config.startHour, 20) * 60 + safeInteger(config.startMinute, 0);
    const minutesUntilStart = (start - current + 24 * 60) % (24 * 60) || 24 * 60;
    next.setMinutes(next.getMinutes() + minutesUntilStart, 0, 0);
    return next.toISOString();
  }

  private async resolveMasterCampaignContext(user: any, companyIdInput?: number | string | null) {
    const explicitCompanyId = Number(companyIdInput || 0) || 0;
    const contextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0) || 0;
    const userCompanyId = Number(user?.companyId || 0) || 0;
    let companyId = explicitCompanyId || contextCompanyId || userCompanyId;
    if (!companyId) {
      const company = await this.prisma.company.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      companyId = Number(company?.id || 0);
    }
    const userId = Number(user?.id || 0);
    if (!companyId) throw new BadRequestException('Nenhuma empresa ativa encontrada para vincular a campanha.');
    if (!userId) throw new ForbiddenException('Usuario MASTER nao identificado.');
    return { companyId, userId, user: { ...user, companyId } };
  }

  private formatTimeLabel(hour?: number | null, minute?: number | null) {
    const safeHour = clampInteger(hour, 20, 0, 23);
    const safeMinute = clampInteger(minute, 0, 0, 59);
    return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
  }

  private buildMasterLiveFeed(input: {
    campaigns: any[];
    latestLeads: any[];
    recentSearchRuns: any[];
    engines: any[];
    forcedTurboActive: boolean;
    forcedUntil: string | null;
    capacity: any;
    now: Date;
  }) {
    const items = [
      ...(input.forcedTurboActive ? [{
        id: `turbo-forced-${input.forcedUntil || input.now.toISOString()}`,
        type: 'turbo_forced',
        message: 'Turbo forcado ativo',
        detail: input.forcedUntil ? `Expira em ${new Date(input.forcedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Expiracao configurada no controle operacional.',
        createdAt: input.now.toISOString(),
      }] : []),
      ...input.engines
        .filter((engine: any) => engine.active || ['cooldown', 'offline', 'degraded'].includes(String(engine.status || '').toLowerCase()))
        .map((engine: any) => ({
          id: `engine-${engine.id}-${engine.lastActivityAt || engine.lastCheckedAt || input.now.toISOString()}`,
          type: engine.active ? 'motor_activated' : String(engine.status || '') === 'cooldown' ? 'cooldown' : String(engine.status || '') === 'offline' ? 'error' : 'motor_idle',
          message: `${engine.shortLabel || engine.id} · ${engine.stateLabel || engine.status}`,
          detail: engine.detail || null,
          createdAt: engine.lastActivityAt || engine.lastCheckedAt || input.now.toISOString(),
        })),
      ...input.latestLeads.map((lead: any) => ({
        id: `lead-${lead.id}`,
        type: 'lead_saved',
        message: `Card salvo: ${lead.name || 'Lead'}`,
        detail: [lead.city, lead.state, lead.segment, lead.phoneDigits].filter(Boolean).join(' • '),
        createdAt: lead.lastSeenAt instanceof Date ? lead.lastSeenAt.toISOString() : null,
      })),
      ...input.campaigns.flatMap((campaign: any) => [
        {
          id: `campaign-${campaign.id}`,
          type: String(campaign.status || '') === 'running' ? 'mass_data_started' : 'motor_idle',
          message: `Campanha ${campaign.status || 'ativa'}`,
          detail: [campaign.state, campaign.currentCity || campaign.city, campaign.segment || 'segmentos internos'].filter(Boolean).join(' • '),
          createdAt: campaign.updatedAt instanceof Date ? campaign.updatedAt.toISOString() : campaign.createdAt instanceof Date ? campaign.createdAt.toISOString() : null,
        },
        ...(campaign.tasks || []).slice(0, 12).map((task: any) => ({
          id: `task-${task.id}`,
          type: String(task.status || '') === 'running'
            ? 'task_started'
            : String(task.status || '') === 'completed'
              ? 'task_completed'
              : String(task.status || '') === 'failed'
                ? 'error'
                : String(task.status || '') === 'exhausted'
                  ? 'rejected'
                  : 'motor_idle',
          message: String(task.status || '') === 'running'
            ? `${task.lockedByEngineId || 'HBX'} coletando`
            : String(task.status || '') === 'completed'
              ? 'Tarefa concluida'
              : String(task.status || '') === 'failed'
                ? 'Tarefa com falha'
                : String(task.status || '') === 'exhausted'
                  ? 'Tarefa esgotada'
                  : 'Tarefa aguardando lote',
          detail: [task.city, task.state, task.segment, task.targetType].filter(Boolean).join(' • '),
          createdAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : null,
        })),
        ...(campaign.batches || []).slice(0, 8).map((batch: any) => ({
          id: `batch-${batch.id}`,
          type: String(batch.status || '').includes('error')
            ? 'error'
            : safeInteger(batch.duplicateCount) > 0
              ? 'duplicate_skipped'
              : safeInteger(batch.rejectedCount) > 0
                ? 'rejected'
                : 'task_completed',
          message: batch.engineId ? `${batch.engineId} finalizou lote` : 'Lote processado',
          detail: [
            batch.queryUsed,
            safeInteger(batch.approvedCount) ? `${safeInteger(batch.approvedCount)} aprovados` : null,
            safeInteger(batch.duplicateCount) ? `${safeInteger(batch.duplicateCount)} duplicados` : null,
            safeInteger(batch.rejectedCount) ? `${safeInteger(batch.rejectedCount)} rejeitados` : null,
            batch.errorMessage,
          ].filter(Boolean).join(' • '),
          createdAt: batch.finishedAt instanceof Date ? batch.finishedAt.toISOString() : batch.startedAt instanceof Date ? batch.startedAt.toISOString() : batch.createdAt instanceof Date ? batch.createdAt.toISOString() : null,
        })),
      ]),
      ...input.recentSearchRuns.map((run: any) => ({
        id: `run-${run.id}`,
        type: String(run.status || '') === 'running'
          ? 'task_started'
          : String(run.status || '') === 'queued'
            ? 'motor_idle'
            : String(run.status || '') === 'failed'
              ? 'error'
              : 'task_completed',
        message: run.assignedEngineId ? `${run.assignedEngineId} · busca ${run.status}` : `Busca ${run.status}`,
        detail: [
          run.city,
          run.state,
          run.segment,
          safeInteger(run.foundCount) ? `${safeInteger(run.foundCount)} cards` : null,
          run.lastBatchError,
        ].filter(Boolean).join(' • '),
        createdAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : null,
      })),
    ]
      .filter((item: any) => item.createdAt)
      .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 24);

    if (items.length > 0) return items;
    if (Number(input.capacity?.queuedCount || 0) > 0 || Number(input.capacity?.runningCount || 0) > 0) {
      return [{
        id: `waiting-${input.now.toISOString()}`,
        type: 'motor_idle',
        message: 'Aguardando proximo lote',
        detail: `Fila ${safeInteger(input.capacity?.queuedCount)} • rodando ${safeInteger(input.capacity?.runningCount)}`,
        createdAt: input.now.toISOString(),
      }];
    }
    if (input.campaigns.length > 0) {
      return [{
        id: `standby-${input.now.toISOString()}`,
        type: 'motor_idle',
        message: 'Motores em standby, aguardando trabalho',
        detail: 'Campanhas carregadas, sem lote em execucao neste instante.',
        createdAt: input.now.toISOString(),
      }];
    }
    return [];
  }

  private startOfLocalDay(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private toIso(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  private dashboardEngineStatus(engine: any): 'running' | 'waiting' | 'offline' | 'cooldown' | 'paused' {
    const status = String(engine?.status || '').trim().toLowerCase();
    const stateLabel = String(engine?.stateLabel || '').trim().toLowerCase();
    const pausedUntil = engine?.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;
    if (engine?.manualPaused || status === 'paused' || stateLabel.includes('pausado') || (Number.isFinite(pausedUntil) && pausedUntil > Date.now())) {
      return 'paused';
    }
    if (status === 'cooldown' || status === 'degraded' || stateLabel.includes('cooldown')) return 'cooldown';
    if (!engine?.configured || !engine?.online || ['offline', 'missing', 'error'].includes(status)) {
      return 'offline';
    }
    if (engine?.busy || engine?.activeRunId || engine?.activeCampaignId || status === 'busy' || status === 'running' || stateLabel.includes('rodando')) {
      return 'running';
    }
    return 'waiting';
  }

  private secondsUntil(value?: string | null, now = new Date()) {
    const parsed = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round((parsed - now.getTime()) / 1000));
  }

  async getMasterMassDataControl(user: any) {
    const now = new Date();
    const todayStart = this.startOfLocalDay(now);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const config = await this.getOperationalConfig();
    const tableSupport = await Promise.all([
      this.prisma.hasTable('WebscrapingCampaign').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignTask').catch(() => false),
      this.prisma.hasTable('WebscrapingCampaignBatch').catch(() => false),
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('WebscrapingSearchRun').catch(() => false),
    ]);
    const [hasCampaign, hasTask, hasBatch, hasLeadPool, hasSearchRun] = tableSupport;
    const databaseMessages: string[] = [];
    let databaseStatus: 'ok' | 'warning' | 'error' = 'ok';
    const markDatabaseWarning = () => {
      if ((databaseStatus as string) !== 'error') databaseStatus = 'warning';
    };
    const withDatabaseGuard = async <T>(label: string, fallback: T, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (error) {
        databaseStatus = 'error';
        const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
        databaseMessages.push(`${label}: ${message}`);
        return fallback;
      }
    };

    const engines = await this.getEnginePool().getDashboardEngineStatus().catch((error) => {
      markDatabaseWarning();
      databaseMessages.push(`Motores: ${error instanceof Error ? error.message : String(error || 'healthcheck indisponivel')}`);
      return null;
    });
    const capacity = engines?.capacity || null;
    const schedulerStatus = capacity?.scheduler || await this.getEnginePool().getSchedulerStatus().catch(() => null);
    const hbxEngines = (engines?.engines || []).filter((engine: any) => String(engine.id || '').startsWith('hbx-engine'));
    const configuredHbxEngines = hbxEngines.filter((engine: any) => engine.configured);
    const isPausedEngine = (engine: any) => {
      const pausedUntil = engine?.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;
      return Boolean(engine?.manualPaused)
        || String(engine?.status || '').toLowerCase() === 'paused'
        || String(engine?.stateLabel || '').toLowerCase().includes('pausado')
        || (Number.isFinite(pausedUntil) && pausedUntil > now.getTime());
    };
    const onlineHbxEngines = configuredHbxEngines.filter((engine: any) => engine.online);
    const pausedHbxEngines = configuredHbxEngines.filter((engine: any) => isPausedEngine(engine));
    const cooldownHbxEngines = configuredHbxEngines.filter((engine: any) => !isPausedEngine(engine) && this.dashboardEngineStatus(engine) === 'cooldown');
    const runningHbxEngines = configuredHbxEngines.filter((engine: any) => !isPausedEngine(engine) && this.dashboardEngineStatus(engine) === 'running');
    const offlineHbxEngines = configuredHbxEngines.filter((engine: any) => {
      if (isPausedEngine(engine) || this.dashboardEngineStatus(engine) === 'cooldown') return false;
      const status = String(engine.status || '').toLowerCase();
      return !engine.online || ['offline', 'missing', 'degraded', 'error'].includes(status);
    });
    const allOffline = configuredHbxEngines.length > 0 && offlineHbxEngines.length === configuredHbxEngines.length;
    const configuredEngineCount = getConfiguredHbxEngineCount();
    const totalConfiguredEngines = Math.max(configuredEngineCount, configuredHbxEngines.length);
    const activeEngineCount = Math.max(1, Math.min(configuredEngineCount, safeInteger(capacity?.activeEngineCount, safeInteger(config.engineCount, configuredEngineCount))));
    const activeQueue = safeInteger(capacity?.queuedCount) + safeInteger(capacity?.runningCount);

    const [campaigns, productionRows, cardsTodayCount, batchRows, taskStatusRows, errors24hParts] = await Promise.all([
      hasCampaign
        ? withDatabaseGuard('Campanhas', [], () => (this.prisma as any).webscrapingCampaign.findMany({
            where: { mode: 'mass_data' },
            orderBy: { createdAt: 'desc' },
            take: 6,
            include: {
              batches: { orderBy: { createdAt: 'desc' }, take: 8 },
              tasks: { orderBy: { updatedAt: 'desc' }, take: 500 },
            },
          }))
        : Promise.resolve([]),
      hasLeadPool
        ? withDatabaseGuard('Produção', [], () => (this.prisma as any).radarLeadPool.findMany({
            orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
            take: 24,
            select: {
              id: true,
              name: true,
              phone: true,
              phoneDigits: true,
              city: true,
              state: true,
              source: true,
              sourceEngine: true,
              status: true,
              lastSeenAt: true,
              createdAt: true,
            },
          }))
        : Promise.resolve([]),
      hasLeadPool
        ? withDatabaseGuard('Cards hoje', 0, () => (this.prisma as any).radarLeadPool.count({
            where: { createdAt: { gte: todayStart } },
          }))
        : Promise.resolve(0),
      hasBatch
        ? withDatabaseGuard('Lotes por motor', [], () => (this.prisma as any).webscrapingCampaignBatch.findMany({
            where: { createdAt: { gte: todayStart } },
            select: {
              engineId: true,
              approvedCount: true,
              duplicateCount: true,
              rejectedCount: true,
              status: true,
              errorMessage: true,
              finishedAt: true,
              startedAt: true,
              createdAt: true,
            },
            take: 5000,
          }))
        : Promise.resolve([]),
      hasTask
        ? withDatabaseGuard('Fila de tarefas', [], () => (this.prisma as any).webscrapingCampaignTask.groupBy({
            by: ['status'],
            _count: { _all: true },
          }))
        : Promise.resolve([]),
      Promise.all([
        hasCampaign
          ? withDatabaseGuard('Erros de campanha 24h', 0, () => (this.prisma as any).webscrapingCampaign.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
        hasTask
          ? withDatabaseGuard('Erros de tarefa 24h', 0, () => (this.prisma as any).webscrapingCampaignTask.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
        hasBatch
          ? withDatabaseGuard('Erros de lote 24h', 0, () => (this.prisma as any).webscrapingCampaignBatch.count({
              where: {
                createdAt: { gte: twentyFourHoursAgo },
                OR: [
                  { status: { contains: 'error' } },
                  { errorMessage: { not: null } },
                ],
              },
            }))
          : Promise.resolve(0),
        hasSearchRun
          ? withDatabaseGuard('Erros de busca 24h', 0, () => (this.prisma as any).webscrapingSearchRun.count({
              where: { status: 'failed', updatedAt: { gte: twentyFourHoursAgo } },
            }))
          : Promise.resolve(0),
      ]),
    ]);

    if (!hasLeadPool || !hasBatch || !hasTask) {
      markDatabaseWarning();
      databaseMessages.push('Algumas tabelas operacionais ainda não estão disponíveis para o painel completo.');
    }

    const statsByEngine = new Map<string, {
      cardsFabricated: number;
      batches: number;
      duplicates: number;
      rejected: number;
      lastError: string | null;
    }>();
    for (const row of batchRows as any[]) {
      const engineId = String(row?.engineId || '').trim();
      if (!engineId) continue;
      const current = statsByEngine.get(engineId) || {
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        lastError: null,
      };
      current.cardsFabricated += safeInteger(row?.approvedCount);
      current.batches += 1;
      current.duplicates += safeInteger(row?.duplicateCount);
      current.rejected += safeInteger(row?.rejectedCount);
      if (!current.lastError && row?.errorMessage) current.lastError = String(row.errorMessage).slice(0, 220);
      statsByEngine.set(engineId, current);
    }

    const queueByStatus = (taskStatusRows as any[]).reduce((acc: Record<string, number>, item: any) => {
      const status = String(item?.status || 'queued');
      acc[status] = safeInteger(item?._count?._all);
      return acc;
    }, {});

    const elapsedMinutesToday = Math.max(1, (now.getTime() - todayStart.getTime()) / 60_000);
    const cardsPerMinuteAvg = Math.round((safeInteger(cardsTodayCount) / elapsedMinutesToday) * 100) / 100;
    const forcedTurboActive = this.isForcedOperationalWindow(config, now);
    const scheduledTurboActive = this.isWithinConfiguredOperationalWindow(config, now);
    const turboEndsAt = forcedTurboActive
      ? this.toIso(config.forcedUntil)
      : this.nextOperationalWindowEndAt(config, now).toISOString();
    const criticalReason = allOffline
      ? 'Todos os motores HBX estão offline.'
      : String(capacity?.operationalStatus || '') === 'degraded'
        ? capacity?.message || 'Campanha travada sem progresso real.'
        : (databaseStatus as string) === 'error'
          ? 'Banco indisponível para o dashboard operacional.'
          : null;
    const currentMode = criticalReason
      ? 'CRÍTICO'
      : forcedTurboActive
        ? 'TURBO FORÇADO'
        : scheduledTurboActive
          ? 'TURBO NOTURNO'
          : activeQueue > 0
            ? 'FILA ATIVA'
            : 'STANDBY';
    const engineHealthStatus: 'ok' | 'warning' | 'error' = allOffline
      ? 'error'
      : offlineHbxEngines.length > 0
        ? 'warning'
        : 'ok';
    const queueStatus: 'ok' | 'warning' | 'error' = String(capacity?.operationalStatus || '') === 'degraded'
      ? 'error'
      : safeInteger(capacity?.oldestQueuedAgeMinutes) >= 5
        ? 'warning'
        : 'ok';
    const diagnosticsMessages = [
      activeQueue > 0 ? `Fila ativa com ${activeQueue} item(ns).` : 'Fila sem pendências.',
      databaseStatus === 'ok' ? 'Gravações no banco acessíveis.' : null,
      engineHealthStatus === 'ok' ? 'Motores com healthcheck saudável.' : null,
      pausedHbxEngines.length > 0 ? `${pausedHbxEngines.length} motor(es) pausado(s) pelo painel.` : null,
      ...databaseMessages,
      ...offlineHbxEngines.slice(0, getConfiguredHbxEngineCount()).map((engine: any) => `${engine.shortLabel || engine.id}: ${engine.lastError || engine.stateLabel || 'sem resposta'}`),
      criticalReason,
    ].filter(Boolean) as string[];

    const localhostLockWarnings = hbxEngines
      .filter((engine: any) => {
        const lockUrl = String(engine?.lockUrl || engine?.url || '').trim();
        return Boolean(engine?.localhostInProduction || (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && lockUrl && isHbxEngineLocalhostUrl(lockUrl)));
      })
      .map((engine: any) => ({
        route: engine.id || 'hbx-engine',
        statusCode: 0,
        message: 'Motor configurado com localhost em produção. Isso quebra o Docker. Corrigir URLs dos motores.',
        createdAt: now.toISOString(),
      }));

    const dashboardEngineCount = Math.max(totalConfiguredEngines, hbxEngines.length);
    const dashboardEngines = Array.from({ length: dashboardEngineCount }, (_, index) => {
      const engine = hbxEngines[index] || null;
      const id = String(engine?.id || `hbx-engine-${index + 1}`);
      const status = this.dashboardEngineStatus(engine);
      const productionStats = statsByEngine.get(id) || {
        cardsFabricated: 0,
        batches: 0,
        duplicates: 0,
        rejected: 0,
        lastError: null,
      };
      const queue = status === 'offline' || status === 'paused' || status === 'cooldown'
        ? 0
        : status === 'running'
          ? Math.max(1, safeInteger(engine?.queueShare) ? Math.ceil(activeQueue * (safeInteger(engine?.queueShare) / 100)) : safeInteger(capacity?.runningCount))
          : activeQueue > 0 && index < activeEngineCount
            ? Math.ceil(activeQueue / activeEngineCount)
            : 0;
      return {
        id,
        label: `M${index + 1}`,
        status,
        configured: Boolean(engine?.configured ?? index < totalConfiguredEngines),
        online: Boolean(engine?.online),
        busy: Boolean(engine?.busy || engine?.activeRunId || engine?.activeCampaignId),
        active: Boolean(engine?.active),
        usagePercent: safeInteger(engine?.usagePercent),
        stateLabel: engine?.stateLabel || null,
        detail: engine?.detail || null,
        cardsFabricated: productionStats.cardsFabricated,
        batches: productionStats.batches,
        duplicates: productionStats.duplicates,
        rejected: productionStats.rejected,
        queue,
        lastActivityAt: this.toIso(engine?.lastActivityAt || engine?.lastCheckedAt),
        activeCampaignId: engine?.activeCampaignId || null,
        lastError: engine?.lastError || productionStats.lastError || null,
        lockUrl: engine?.lockUrl || null,
        cooldownUntil: engine?.cooldownUntil || null,
        manualPaused: Boolean(engine?.manualPaused),
        pausedUntil: engine?.pausedUntil || null,
        localhostInProduction: Boolean(engine?.localhostInProduction),
      };
    });

    const warnings = [
      ...localhostLockWarnings,
      ...offlineHbxEngines.map((engine: any) => ({
        route: engine.id || 'hbx-engine',
        statusCode: 0,
        message: engine.lastError || engine.detail || 'Motor sem healthcheck.',
        createdAt: now.toISOString(),
      })),
      ...(String(capacity?.operationalStatus || '') === 'degraded'
        ? [{
            route: 'webscraping/capacity',
            statusCode: 0,
            message: capacity?.message || 'Fila travada sem progresso.',
            createdAt: now.toISOString(),
          }]
        : []),
      ...databaseMessages.map((message) => ({
        route: 'database',
        statusCode: 0,
        message,
        createdAt: now.toISOString(),
      })),
    ].slice(0, 8);
    const autonomousWork = hasTask
      ? await withDatabaseGuard<AutonomousMassDataWork | null>(
          'Estratégia autônoma',
          null,
          () => this.resolveAutonomousMassDataWork((campaigns as any[])[0] || {}, { now, limit: 40 }),
        )
      : null;

    return {
      generatedAt: now.toISOString(),
      turbo: {
        active: forcedTurboActive,
        scheduledActive: scheduledTurboActive,
        startedAt: forcedTurboActive ? this.toIso(config.forcedAt || config.updatedAt) : null,
        endsAt: turboEndsAt,
        remainingSeconds: forcedTurboActive ? this.secondsUntil(turboEndsAt, now) : 0,
        startLabel: this.formatTimeLabel(config.startHour, config.startMinute),
        endLabel: this.formatTimeLabel(config.endHour, config.endMinute),
      },
      summary: {
        cardsToday: safeInteger(cardsTodayCount),
        cardsPerMinuteAvg,
        activeQueue,
        errors24h: (errors24hParts as number[]).reduce((sum, value) => sum + safeInteger(value), 0),
        totalConfiguredEngines,
        onlineEngines: onlineHbxEngines.length,
        activeEngineLimit: activeEngineCount,
        runningEngines: runningHbxEngines.length,
        cooldownEngines: cooldownHbxEngines.length,
        pausedEngines: pausedHbxEngines.length,
        offlineEngines: offlineHbxEngines.length,
        totalEngines: totalConfiguredEngines,
      },
      scheduler: {
        manualReservedEngines: safeInteger(schedulerStatus?.manualReservedEngines),
        automaticAllowedEngines: safeInteger(schedulerStatus?.automaticAllowedEngines),
        memoryPressurePercent: safeInteger(schedulerStatus?.memoryPressurePercent),
        googleMode: 'manual_only',
        manualDemandActive: Boolean(schedulerStatus?.manualDemandActive),
        productionMode: schedulerStatus?.productionMode || 'full',
      },
      autonomousStrategy: {
        mode: autonomousWork?.mode || 'automatic',
        selectedState: autonomousWork?.state || null,
        selectedCity: autonomousWork?.city || null,
        selectedSegment: autonomousWork?.segment || null,
        reason: autonomousWork?.reason || 'fallback_national',
      },
      engines: dashboardEngines,
      production: (productionRows as any[]).map((row: any) => {
        const status = String(row?.status || '').toLowerCase();
        return {
          id: String(row?.id || ''),
          name: String(row?.name || 'Card sem nome'),
          phone: row?.phone || row?.phoneDigits || null,
          city: row?.city || null,
          state: row?.state || null,
          source: row?.source || row?.sourceEngine || null,
          createdAt: this.toIso(row?.lastSeenAt || row?.createdAt) || now.toISOString(),
          dbStatus: status === 'rejected' || status === 'duplicate' ? 'error' : row?.phone || row?.phoneDigits ? 'saved' : 'pending',
        };
      }),
      diagnostics: {
        queueStatus,
        databaseStatus,
        engineHealthStatus,
        messages: diagnosticsMessages.slice(0, 8),
      },
      warnings,
      status: {
        resumeEnabled: true,
        currentMode,
        critical: Boolean(criticalReason),
        criticalReason,
        nextTurboAt: this.nextOperationalWindowAt(config, now),
        localTime: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
        estimatedMemoryGb: Math.min(safeInteger(config.memoryTargetGb, 16), safeInteger(config.engineCount, 4) * 4),
        isTurboEnabled: Boolean(config.enabled),
        isTurboWindowActive: scheduledTurboActive,
        isTurboForcedNow: forcedTurboActive,
        forcedUntil: config.forcedUntil || null,
        operationalMessage: criticalReason
          || (forcedTurboActive
            ? `Turbo forçado ativo até ${this.formatTimeLabel(config.endHour, config.endMinute)}.`
            : `Turbo pronto. Ative para manter os motores até ${this.formatTimeLabel(config.endHour, config.endMinute)}.`),
      },
      config: {
        ...config,
        engineUrlsJson: undefined,
      },
      campaigns: (campaigns as any[]).map((campaign: any) => this.buildRadarCampaignResponse(campaign)),
      taskStatusCounts: queueByStatus,
    };
  }

  private async ensureAutonomousMassDataCampaign(user: any, config: any) {
    if (!config?.enabled || !config?.autonomousFillEnabled) return null;
    if (!(await this.supportsMassDataCampaignPersistence())) return null;
    const context = await this.resolveMasterCampaignContext(user, null);
    const active = await (this.prisma as any).webscrapingCampaign.findFirst({
      where: {
        companyId: context.companyId,
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    }).catch(() => null);
    if (active) return active;
    const campaign = await this.createRadarCampaignForUser(context.user, {
      mode: 'mass_data',
      state: '',
      city: '',
      segment: '',
      targetType: 'pj',
      targetTotal: config.autonomousFillBatchSize || AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
      batchSize: config.batchSize,
      maxAttemptsPerTask: config.maxAttemptsPerTask,
      nightOnly: true,
      allowedStartHour: config.startHour,
      allowedEndHour: config.endHour,
      timezone: 'America/Sao_Paulo',
    });
    this.logger.log(`[autonomous-bank] automatic campaign ensured campaign=${campaign?.id || 'created'} reason=no_guided_queue`);
    return campaign;
  }

  async saveMasterTurboConfig(user: any, input: WebscrapingOperationalConfigInput = {}) {
    const saved = await this.saveOperationalConfig(Number(user?.id || 0), input);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: {
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error', 'paused'] },
      },
      data: {
        nightOnly: true,
        allowedStartHour: saved.startHour,
        allowedEndHour: saved.endHour,
        batchSize: saved.batchSize,
        maxAttempts: saved.maxAttemptsPerTask,
      },
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: {
        mode: 'mass_data',
        status: { in: ['queued', 'running', 'sleeping', 'partial_error'] },
      },
      data: { nextRunAt: new Date() },
    }).catch(() => null);
    await this.ensureAutonomousMassDataCampaign(user, saved).catch((error) => {
      this.logger.warn(`[autonomous-bank] automatic campaign ensure failed: ${error instanceof Error ? error.message : String(error || 'erro desconhecido')}`);
    });
    this.scheduleRadarCampaignPump(0);
    return {
      config: saved,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async forceMasterTurboNow(user: any, input: WebscrapingOperationalConfigInput = {}) {
    return this.saveMasterTurboConfig(user, {
      ...input,
      enabled: true,
      forceNow: true,
    });
  }

  async createMasterMassDataCampaign(user: any, input: MasterMassDataCampaignInput = {}) {
    const config = await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: input.enabled ?? true,
      startHour: input.startHour,
      startMinute: input.startMinute,
      endHour: input.endHour,
      endMinute: input.endMinute,
      engineCount: input.engineCount,
      intensity: input.intensity,
      memoryTargetGb: input.memoryTargetGb,
      batchSize: input.batchSize,
      maxAttemptsPerTask: input.maxAttemptsPerTask,
      autonomousFillEnabled: input.autonomousFillEnabled,
      autonomousFillBatchSize: input.autonomousFillBatchSize,
    });
    const context = await this.resolveMasterCampaignContext(user, input.companyId);
    const campaign = await this.createRadarCampaignForUser(context.user, {
      mode: 'mass_data',
      state: input.state,
      city: input.city || '',
      segment: input.segment || '',
      targetType: input.targetType || 'pj',
      targetTotal: input.targetTotal || 0,
      batchSize: config.batchSize,
      maxAttemptsPerTask: config.maxAttemptsPerTask,
      nightOnly: true,
      allowedStartHour: config.startHour,
      allowedEndHour: config.endHour,
      timezone: 'America/Sao_Paulo',
    });
    return {
      campaign,
      control: await this.getMasterMassDataControl(user),
    };
  }

  async pauseRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id, mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error'] } },
      data: { status: 'paused', pausedAt: new Date(), nextRunAt: null },
    });
    return this.getMasterMassDataControl({});
  }

  async resumeRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    const row = await (this.prisma as any).webscrapingCampaign.findUnique({ where: { id } }).catch(() => null);
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    const sleeping = row.nightOnly && !this.isWithinRadarWindow(row);
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id },
      data: { status: sleeping ? 'sleeping' : 'queued', pausedAt: null, nextRunAt: sleeping ? this.nextRadarWindowAt(row) : new Date() },
    });
    this.scheduleRadarCampaignPump(0);
    return this.getMasterMassDataControl({});
  }

  async cancelRadarCampaignByMaster(campaignId: string) {
    const id = String(campaignId || '').trim();
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id, mode: 'mass_data', status: { notIn: ['completed', 'failed', 'canceled'] } },
      data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null },
    });
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaignId: id, status: { in: ['queued', 'running'] } },
      data: { status: 'canceled', lockedByEngineId: null, lockedUntil: null, finishedAt: new Date() },
    }).catch(() => null);
    return this.getMasterMassDataControl({});
  }

  private async recalculateRadarCampaignCounters(campaignId: string) {
    const [campaign, rows, batches] = await Promise.all([
      (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null),
      (this.prisma as any).radarLeadPool.findMany({
        where: { campaignId },
        select: {
          status: true,
        },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignBatch.findMany({
        where: { campaignId },
        select: {
          duplicateCount: true,
          rejectedCount: true,
        },
      }).catch(() => []),
    ]);
    const foundCount = rows.length;
    const approvedCount = rows.filter((row: any) => ['clean', 'new'].includes(String(row.status || 'clean'))).length;
    const duplicateRows = rows.filter((row: any) => String(row.status || '') === 'duplicate').length;
    const rejectedRows = rows.filter((row: any) => String(row.status || '') === 'rejected').length;
    const duplicateBatches = batches.reduce((sum: number, row: any) => sum + safeInteger(row.duplicateCount), 0);
    const rejectedBatches = batches.reduce((sum: number, row: any) => sum + safeInteger(row.rejectedCount), 0);
    const duplicateCount = Math.max(duplicateRows, duplicateBatches);
    const rejectedCount = Math.max(rejectedRows, rejectedBatches);
    const complaintCount = rows.filter((row: any) => String(row.status || '') === 'complaint').length;
    const deniedCount = rows.filter((row: any) => String(row.status || '') === 'denied').length;
    const noAnswerCount = rows.filter((row: any) => String(row.status || '') === 'no_answer').length;
    if (campaign) {
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          foundCount,
          approvedCount,
          duplicateCount,
          rejectedCount,
          complaintCount,
          deniedCount,
          noAnswerCount,
        },
      }).catch(() => null);
    }
    return { foundCount, approvedCount, duplicateCount, rejectedCount, complaintCount, deniedCount, noAnswerCount };
  }

  private buildRadarCampaignResponse(campaign: any) {
    const batches = Array.isArray(campaign?.batches) ? campaign.batches : [];
    const tasks = Array.isArray(campaign?.tasks) ? campaign.tasks : [];
    const taskStatusCounts = tasks.reduce((acc: Record<string, number>, task: any) => {
      const status = String(task?.status || 'queued');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const cityTaskStates = new Map<string, { total: number; terminal: number }>();
    const activeCities = new Set<string>();
    for (const task of tasks) {
      const city = String(task?.city || '').trim();
      if (!city) continue;
      const status = String(task?.status || '');
      const current = cityTaskStates.get(city) || { total: 0, terminal: 0 };
      current.total += 1;
      if (['completed', 'exhausted', 'failed', 'canceled'].includes(status)) current.terminal += 1;
      cityTaskStates.set(city, current);
      if (status === 'running') activeCities.add(city);
    }
    const completedCityCount = Array.from(cityTaskStates.values()).filter((item) => item.total > 0 && item.total === item.terminal).length;
    return {
      id: campaign.id,
      status: campaign.status,
      mode: campaign.mode,
      city: campaign.city,
      state: campaign.state || null,
      segment: campaign.segment,
      targetType: String(campaign.mode || '') === 'mass_data' && String(campaign.targetType || '').toLowerCase() === 'both'
        ? 'both'
        : normalizeTargetType(campaign.targetType),
      targetTotal: safeInteger(campaign.targetTotal),
      batchSize: safeInteger(campaign.batchSize),
      foundCount: safeInteger(campaign.foundCount),
      approvedCount: safeInteger(campaign.approvedCount),
      duplicateCount: safeInteger(campaign.duplicateCount),
      rejectedCount: safeInteger(campaign.rejectedCount),
      complaintCount: safeInteger(campaign.complaintCount),
      deniedCount: safeInteger(campaign.deniedCount),
      noAnswerCount: safeInteger(campaign.noAnswerCount),
      currentAttempt: safeInteger(campaign.currentAttempt),
      maxAttempts: safeInteger(campaign.maxAttempts),
      consecutiveEmptyBatchCount: safeInteger(campaign.consecutiveEmptyBatchCount),
      consecutiveErrorCount: safeInteger(campaign.consecutiveErrorCount),
      lastQueryUsed: campaign.lastQueryUsed || null,
      lastEngineUrl: String(campaign.mode || '') === 'mass_data' ? null : campaign.lastEngineUrl || null,
      lastErrorMessage: campaign.lastErrorMessage || null,
      taskStatusCounts,
      completedCityCount,
      currentCity: Array.from(activeCities)[0] || tasks[0]?.city || null,
      progressMessage: campaign.lastErrorMessage || (
        safeInteger(campaign.foundCount) > 0
          ? `Encontramos ${safeInteger(campaign.foundCount)} cards ate agora. Continuando nos proximos lotes.`
          : `Rodando lote ${Math.min(safeInteger(campaign.currentAttempt) + 1, safeInteger(campaign.maxAttempts))}/${safeInteger(campaign.maxAttempts)}.`
      ),
      nextRunAt: campaign.nextRunAt instanceof Date ? campaign.nextRunAt.toISOString() : null,
      nightOnly: Boolean(campaign.nightOnly),
      allowedStartHour: safeInteger(campaign.allowedStartHour),
      allowedEndHour: safeInteger(campaign.allowedEndHour),
      timezone: campaign.timezone || 'America/Sao_Paulo',
      startedAt: campaign.startedAt instanceof Date ? campaign.startedAt.toISOString() : null,
      pausedAt: campaign.pausedAt instanceof Date ? campaign.pausedAt.toISOString() : null,
      finishedAt: campaign.finishedAt instanceof Date ? campaign.finishedAt.toISOString() : null,
      createdAt: campaign.createdAt instanceof Date ? campaign.createdAt.toISOString() : null,
      updatedAt: campaign.updatedAt instanceof Date ? campaign.updatedAt.toISOString() : null,
      batches: batches.map((batch: any) => ({
        id: batch.id,
        status: batch.status,
        attemptNumber: safeInteger(batch.attemptNumber),
        engineId: batch.engineId || null,
        engineUrl: String(campaign.mode || '') === 'mass_data' ? null : batch.engineUrl || null,
        queryUsed: batch.queryUsed || null,
        batchSize: safeInteger(batch.batchSize),
        fetchedUrlCount: safeInteger(batch.fetchedUrlCount),
        parsedCount: safeInteger(batch.parsedCount),
        approvedCount: safeInteger(batch.approvedCount),
        duplicateCount: safeInteger(batch.duplicateCount),
        rejectedCount: safeInteger(batch.rejectedCount),
        errorMessage: batch.errorMessage || null,
        startedAt: batch.startedAt instanceof Date ? batch.startedAt.toISOString() : null,
        finishedAt: batch.finishedAt instanceof Date ? batch.finishedAt.toISOString() : null,
      })),
      tasks: tasks.map((task: any) => ({
        id: task.id,
        campaignId: task.campaignId,
        state: task.state,
        city: task.city,
        segment: task.segment,
        targetType: task.targetType || 'pj',
        query: task.query,
        status: task.status,
        attemptCount: safeInteger(task.attemptCount),
        maxAttempts: safeInteger(task.maxAttempts),
        foundCount: safeInteger(task.foundCount),
        duplicateCount: safeInteger(task.duplicateCount),
        rejectedCount: safeInteger(task.rejectedCount),
        lastError: task.lastError || null,
        lockedByEngineId: task.lockedByEngineId || null,
        lockedUntil: task.lockedUntil instanceof Date ? task.lockedUntil.toISOString() : null,
        startedAt: task.startedAt instanceof Date ? task.startedAt.toISOString() : null,
        finishedAt: task.finishedAt instanceof Date ? task.finishedAt.toISOString() : null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : null,
        updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : null,
      })),
    };
  }

  async createRadarCampaignForUser(user: any, input: RadarCampaignInput = {}) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de campanhas do Radar ainda nao foi aplicada no banco.');
    }
    const normalized = this.normalizeRadarCampaignInput(input);
    if (normalized.mode === 'mass_data' && !(await this.supportsMassDataCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de tarefas MASSA DE DADOS ainda nao foi aplicada no banco.');
    }
    if (normalized.mode !== 'mass_data' && !normalized.segment.trim()) throw new BadRequestException('Informe o nicho/segmento da campanha.');
    if (normalized.mode !== 'mass_data' && normalized.targetType !== 'pj' && (!normalized.city || !normalized.state)) {
      throw new BadRequestException('Cidade e estado sao obrigatorios para campanhas PF.');
    }
    const now = new Date();
    const sleeping = normalized.nightOnly && !this.isWithinRadarWindow(normalized, now);
    const campaign = await (this.prisma as any).webscrapingCampaign.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: sleeping ? 'sleeping' : 'queued',
        mode: normalized.mode,
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment || (normalized.mode === 'mass_data' ? 'segmentos internos' : ''),
        targetType: normalized.targetType,
        targetTotal: normalized.targetTotal,
        batchSize: normalized.batchSize,
        maxAttempts: normalized.maxAttempts,
        nightOnly: normalized.nightOnly,
        allowedStartHour: normalized.allowedStartHour,
        allowedEndHour: normalized.allowedEndHour,
        timezone: normalized.timezone,
        nextRunAt: sleeping ? this.nextRadarWindowAt(normalized, now) : now,
      },
      include: { batches: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (normalized.mode === 'mass_data') {
      const guidedByState = Boolean(normalized.state);
      const taskStats = guidedByState
        ? await this.createMassDataTasks(
            campaign.id,
            normalized.state,
            normalized.city || null,
            normalized.segment || null,
            normalized.targetType,
            normalized.maxAttemptsPerTask,
          )
        : await this.createAutonomousMassDataTasks(
            {
              ...campaign,
              state: normalized.state || null,
              city: normalized.city || null,
              segment: normalized.segment || null,
              targetType: normalized.targetType,
              targetTotal: normalized.targetTotal,
              maxAttempts: normalized.maxAttemptsPerTask,
            },
            normalized.targetTotal || AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
          );
      if (guidedByState) {
        this.logger.log(`[autonomous-bank] guided work selected state=${normalized.state} city=${normalized.city || '*'} segment=${normalized.segment || 'segmentos internos'} reason=guided_filter`);
      }
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaign.id },
        data: {
          targetTotal: normalized.targetTotal || safeInteger((taskStats as any).taskCount || (taskStats as any).created) * normalized.batchSize,
          maxAttempts: normalized.maxAttemptsPerTask,
          lastErrorMessage: guidedByState
            ? `MASSA DE DADOS pronta: ${(taskStats as any).cityCount} cidade(s), ${(taskStats as any).segmentCount} isca(s), ${(taskStats as any).targetTypeCount} tipo(s), ${(taskStats as any).taskCount} tarefa(s).`
            : `MASSA DE DADOS autônoma pronta: ${(taskStats as any).created} tarefa(s), ${(taskStats as any).checked} combinação(ões) avaliadas.`,
        },
      }).catch(() => null);
      const reloaded = await (this.prisma as any).webscrapingCampaign.findUnique({
        where: { id: campaign.id },
        include: {
          batches: { orderBy: { createdAt: 'desc' }, take: 10 },
          tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
        },
      });
      this.scheduleRadarCampaignPump(0);
      return this.buildRadarCampaignResponse(reloaded || campaign);
    }
    this.scheduleRadarCampaignPump(0);
    return this.buildRadarCampaignResponse(campaign);
  }

  async listRadarCampaignsForUser(user: any) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) return { items: [] };
    const rows = await (this.prisma as any).webscrapingCampaign.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        batches: { orderBy: { createdAt: 'desc' }, take: 5 },
        tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
      },
    });
    return { items: rows.map((row: any) => this.buildRadarCampaignResponse(row)) };
  }

  async getRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarCampaignPersistence())) {
      throw new ServiceUnavailableException('Estrutura de campanhas do Radar ainda nao foi aplicada no banco.');
    }
    const row = await (this.prisma as any).webscrapingCampaign.findFirst({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId },
      include: {
        batches: { orderBy: { createdAt: 'desc' }, take: 30 },
        tasks: { orderBy: { updatedAt: 'desc' }, take: 2000 },
      },
    });
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    return this.buildRadarCampaignResponse(row);
  }

  async pauseRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId, status: { in: ['queued', 'running', 'sleeping'] } },
      data: { status: 'paused', pausedAt: new Date(), nextRunAt: null },
    });
    return this.getRadarCampaignForUser(user, campaignId);
  }

  async resumeRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    const row = await (this.prisma as any).webscrapingCampaign.findFirst({ where: { id: String(campaignId || '').trim(), companyId: context.companyId } });
    if (!row) throw new NotFoundException('Campanha nao encontrada.');
    const sleeping = row.nightOnly && !this.isWithinRadarWindow(row);
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: row.id },
      data: { status: sleeping ? 'sleeping' : 'queued', pausedAt: null, nextRunAt: sleeping ? this.nextRadarWindowAt(row) : new Date() },
    });
    this.scheduleRadarCampaignPump(0);
    return this.getRadarCampaignForUser(user, campaignId);
  }

  async cancelRadarCampaignForUser(user: any, campaignId: string) {
    const context = this.resolveContext(user);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { id: String(campaignId || '').trim(), companyId: context.companyId, status: { notIn: ['completed', 'completed_insufficient_results', 'failed', 'canceled'] } },
      data: { status: 'canceled', finishedAt: new Date(), nextRunAt: null },
    });
    return this.getRadarCampaignForUser(user, campaignId);
  }

  private async processNextRadarCampaigns() {
    if (this.radarCampaignPumpActive) return;
    if (!(await this.supportsRadarCampaignPersistence().catch(() => false))) return;
    this.radarCampaignPumpActive = true;
    try {
      const [capacity, scheduler] = await Promise.all([
        this.getEnginePool().getCurrentCapacityLevel().catch(() => null),
        this.getEnginePool().getSchedulerStatus().catch(() => null),
      ]);
      const maxParallel = Math.min(
        Math.max(safeInteger(capacity?.activeEngineCount, parsePositiveIntegerEnv('HBX_RADAR_MAX_PARALLEL_ENGINES', getConfiguredHbxEngineCount())), 1),
        getConfiguredHbxEngineCount(),
      );
      const due = await (this.prisma as any).webscrapingCampaign.findMany({
        where: {
          OR: [
            {
              status: { in: ['queued', 'sleeping'] },
              OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
            },
            {
              status: { in: ['running', 'partial_error'] },
              nextRunAt: { lte: new Date() },
            },
          ],
        },
        orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
        take: maxParallel,
      });
      for (const campaign of due) {
        if (['completed', 'completed_insufficient_results', 'failed', 'canceled', 'paused'].includes(String(campaign.status))) continue;
        if (!this.isWithinRadarWindow(campaign)) {
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: { status: 'sleeping', nextRunAt: this.nextRadarWindowAt(campaign) },
          }).catch(() => null);
          continue;
        }
        if (String(campaign.mode || '') === 'mass_data') {
          await this.processMassDataCampaignQueue(campaign, Math.max(0, Math.min(maxParallel, safeInteger(scheduler?.automaticAllowedEngines, maxParallel))));
          continue;
        }
        const lease = await this.getEnginePool().acquireEngine(campaign.id, campaign.companyId, campaign.userId, { purpose: 'radar_pull' });
        if (!lease) {
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: { status: 'queued', nextRunAt: new Date(Date.now() + 10_000), lastErrorMessage: 'Aguardando motor livre.' },
          }).catch(() => null);
          continue;
        }
        void this.processRadarCampaignBatch(campaign.id, lease);
      }
    } finally {
      this.radarCampaignPumpActive = false;
    }
  }

  private async processMassDataCampaignQueue(campaign: any, maxParallel: number) {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const now = new Date();
    if (maxParallel <= 0) {
      this.logger.log(`[engine-scheduler] automatic production paused campaign=${campaign.id} reason=protected`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'running', nextRunAt: new Date(Date.now() + 15_000), lastErrorMessage: 'Produção protegida: aguardando capacidade sobrar.' },
      }).catch(() => null);
      return;
    }
    await (this.prisma as any).webscrapingCampaignTask.updateMany({
      where: { campaignId: campaign.id, status: 'running', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { status: 'queued', lockedByEngineId: null, lockedUntil: null, lastError: 'Lock expirado; tarefa devolvida para fila.' },
    }).catch(() => null);

    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: campaign.id },
      data: { status: 'running', startedAt: campaign.startedAt || now, nextRunAt: null },
    }).catch(() => null);

    const queuedTasks = await (this.prisma as any).webscrapingCampaignTask.count({
      where: { campaignId: campaign.id, status: 'queued' },
    }).catch(() => 0);
    if (safeInteger(queuedTasks) <= 0) {
      const config = await this.getOperationalConfig().catch(() => null);
      if (config?.autonomousFillEnabled) {
        const refill = await this.createAutonomousMassDataTasks(
          campaign,
          safeInteger(config.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS),
        );
        if (refill.created > 0) {
          await (this.prisma as any).webscrapingCampaign.update({
            where: { id: campaign.id },
            data: {
              lastErrorMessage: `Fila autônoma reabastecida: ${refill.created} nova(s) tarefa(s).`,
              nextRunAt: new Date(Date.now() + 1_000),
            },
          }).catch(() => null);
        }
      }
    }

    let started = 0;
    for (let index = 0; index < maxParallel; index += 1) {
      const lease = await this.getEnginePool().acquireEngine(
        `${campaign.id}:mass:${index}:${Date.now()}`,
        campaign.companyId,
        campaign.userId,
        { purpose: 'mass_data' },
      );
      if (!lease) break;
      const task = await this.claimNextMassDataTask(campaign.id, lease);
      if (!task) {
        await this.getEnginePool().releaseEngine(lease.engineId);
        break;
      }
      started += 1;
      void this.processMassDataTask(campaign.id, task.id, lease);
    }

    if (started === 0) {
      await this.refreshMassDataCampaignState(campaign.id);
    }
  }

  private async claimNextMassDataTask(campaignId: string, lease: HbxEngineLease) {
    const candidates = await (this.prisma as any).webscrapingCampaignTask.findMany({
      where: { campaignId, status: 'queued' },
      orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    }).catch(() => []);
    for (const task of candidates) {
      const updated = await (this.prisma as any).webscrapingCampaignTask.updateMany({
        where: { id: task.id, status: 'queued' },
        data: {
          status: 'running',
          lockedByEngineId: lease.engineId,
          lockedUntil: lease.lockedUntil,
          startedAt: task.startedAt || new Date(),
        },
      });
      if (updated.count > 0) {
        return (this.prisma as any).webscrapingCampaignTask.findUnique({ where: { id: task.id } });
      }
    }
    return null;
  }

  private async processMassDataTask(campaignId: string, taskId: string, lease: HbxEngineLease) {
    const task = await (this.prisma as any).webscrapingCampaignTask.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    }).catch(() => null);
    if (!task || !task.campaign || ['paused', 'canceled', 'completed', 'failed'].includes(String(task.campaign.status))) {
      await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }
    const attempt = safeInteger(task.attemptCount) + 1;
    const maxAttempts = Math.max(1, safeInteger(task.maxAttempts, 3));
    const normalized = this.normalizeSearchInput({
      city: task.city,
      state: task.state,
      segment: task.segment,
      quantity: Math.min(Math.max(safeInteger(task.campaign.batchSize, 20), 1), 20),
      engine: 'hbx',
      targetType: normalizeTargetType(task.targetType),
    });
    const queryUsed = this.buildMassDataTaskQuery(task.city, task.state, task.segment, attempt);
    let batch: any = null;
    try {
      batch = await (this.prisma as any).webscrapingCampaignBatch.create({
        data: {
          campaignId,
          taskId,
          status: 'running',
          attemptNumber: attempt,
          engineId: lease.engineId,
          engineUrl: lease.url,
          queryUsed,
          batchSize: normalized.quantity,
          startedAt: new Date(),
        },
      });
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: { attemptCount: { increment: 1 }, query: queryUsed, lockedUntil: lease.lockedUntil },
      });
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: { currentAttempt: { increment: 1 }, lastQueryUsed: queryUsed, lastEngineUrl: lease.url, lastErrorMessage: null },
      }).catch(() => null);

      const existingLeads = await (this.prisma as any).radarLeadPool.findMany({
        where: { phoneDigits: { not: null } },
        select: { phoneDigits: true, website: true, sourceUrl: true },
        take: 50_000,
      }).catch(() => []);
      const existingPhones = new Set<string>(existingLeads.map((row: any) => normalizePhoneDigits(row.phoneDigits)).filter(Boolean) as string[]);
      const output = await this.searchHbxEngine(
        normalized,
        Array.from(existingPhones),
        lease.url,
        {
          queryText: queryUsed,
          batchLimit: normalized.quantity,
          timeoutMs: this.getHbxBatchTimeoutMs(),
          excludeUrls: existingLeads.flatMap((row: any) => [row.website, row.sourceUrl]).map((url: any) => String(url || '').trim()).filter(Boolean),
        },
      );
      const newPhoneCount = output.results
        .map((result) => normalizePhoneDigits(result.phoneDigits || result.phone))
        .filter((phone) => phone && !existingPhones.has(phone)).length;
      const persisted = await this.persistRadarLeadPoolBatch(normalized, output.results, 'hbx_mass_data', {
        campaignId,
        strictLocalDdd: normalizeTargetType(task.targetType) === 'pf',
      });
      const batchRejectedCount = persisted.rejectedCount + safeInteger(output.rejectedCount);
      const duplicateCount = persisted.duplicateCount + safeInteger(output.duplicateCount);
      const finalTaskStatus = newPhoneCount > 0
        ? 'completed'
        : attempt >= maxAttempts
          ? 'exhausted'
          : 'queued';
      await (this.prisma as any).webscrapingCampaignBatch.update({
        where: { id: batch.id },
        data: {
          status: newPhoneCount > 0 ? 'completed' : 'empty_batch',
          approvedCount: newPhoneCount,
          duplicateCount,
          rejectedCount: batchRejectedCount,
          errorMessage: output.rawErrorMessage || null,
          parsedCount: Array.isArray(output.results) ? output.results.length : 0,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: {
          status: finalTaskStatus,
          foundCount: { increment: newPhoneCount },
          duplicateCount: { increment: duplicateCount },
          rejectedCount: { increment: batchRejectedCount },
          lastError: output.rawErrorMessage || null,
          lockedByEngineId: null,
          lockedUntil: null,
          finishedAt: ['completed', 'exhausted'].includes(finalTaskStatus) ? new Date() : null,
        },
      });
      await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      await this.refreshMassDataCampaignState(campaignId);
    } catch (error) {
      const message = this.extractHbxErrorMessage(error);
      if (batch?.id) {
        await (this.prisma as any).webscrapingCampaignBatch.update({
          where: { id: batch.id },
          data: { status: 'batch_error', errorMessage: message, finishedAt: new Date() },
        }).catch(() => null);
      }
      const exhausted = attempt >= maxAttempts;
      const retryable = this.isRetryableHbxError(error) || /timeout|fetch failed|econnreset|socket hang up/i.test(message);
      await (this.prisma as any).webscrapingCampaignTask.update({
        where: { id: taskId },
        data: {
          status: exhausted ? (retryable ? 'exhausted' : 'failed') : 'queued',
          lastError: message,
          lockedByEngineId: null,
          lockedUntil: null,
          finishedAt: exhausted ? new Date() : null,
        },
      }).catch(() => null);
      await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      await this.refreshMassDataCampaignState(campaignId);
    } finally {
      await this.getEnginePool().releaseEngine(lease.engineId);
      this.scheduleRadarCampaignPump(1_000);
    }
  }

  private async refreshMassDataCampaignState(campaignId: string) {
    if (!(await this.supportsMassDataCampaignPersistence())) return;
    const [campaign, grouped, batches, latestTask] = await Promise.all([
      (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null),
      (this.prisma as any).webscrapingCampaignTask.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { _all: true },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignBatch.findMany({
        where: { campaignId },
        select: { approvedCount: true, duplicateCount: true, rejectedCount: true },
      }).catch(() => []),
      (this.prisma as any).webscrapingCampaignTask.findFirst({
        where: { campaignId },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => null),
    ]);
    if (!campaign) return;
    const counts = new Map<string, number>(grouped.map((row: any) => [String(row.status), safeInteger(row._count?._all)]));
    const queued = counts.get('queued') || 0;
    const running = counts.get('running') || 0;
    const completed = counts.get('completed') || 0;
    const exhausted = counts.get('exhausted') || 0;
    const failed = counts.get('failed') || 0;
    const canceled = counts.get('canceled') || 0;
    const total = queued + running + completed + exhausted + failed + canceled;
    const approvedCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.approvedCount), 0);
    const duplicateCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.duplicateCount), 0);
    const rejectedCount = batches.reduce((sum: number, row: any) => sum + safeInteger(row.rejectedCount), 0);
    const reachedTarget = safeInteger(campaign.targetTotal) > 0 && approvedCount >= safeInteger(campaign.targetTotal);
    const done = total > 0 && queued === 0 && running === 0;
    const config = await this.getOperationalConfig().catch(() => null);
    const autonomousEnabled = String(campaign.mode || '') === 'mass_data' && Boolean(config?.autonomousFillEnabled);
    if (done && autonomousEnabled && !['paused', 'canceled', 'failed'].includes(String(campaign.status || ''))) {
      const refill = await this.createAutonomousMassDataTasks(
        campaign,
        safeInteger(config?.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS),
      );
      if (refill.created > 0) {
        await (this.prisma as any).webscrapingCampaign.update({
          where: { id: campaignId },
          data: {
            status: 'running',
            foundCount: approvedCount,
            approvedCount,
            duplicateCount,
            rejectedCount,
            lastErrorMessage: `Fila autônoma reabastecida: ${refill.created} nova(s) tarefa(s) sem dados puxados.`,
            nextRunAt: new Date(Date.now() + 1_000),
            finishedAt: null,
          },
        }).catch(() => null);
        return;
      }
    }
    const finalStatus = (!autonomousEnabled && reachedTarget) || done ? 'completed' : 'running';
    await (this.prisma as any).webscrapingCampaign.update({
      where: { id: campaignId },
      data: {
        status: finalStatus,
        foundCount: approvedCount,
        approvedCount,
        duplicateCount,
        rejectedCount,
        lastErrorMessage: latestTask
          ? `${latestTask.city}/${latestTask.state}: ${latestTask.segment} -> ${latestTask.status}`
          : done && autonomousEnabled
            ? 'Fila autônoma não encontrou novas combinações sem dados puxados.'
            : null,
        nextRunAt: finalStatus === 'completed' ? null : new Date(Date.now() + 1_000),
        finishedAt: finalStatus === 'completed' ? new Date() : null,
      },
    }).catch(() => null);
  }

  private async processRadarCampaignBatch(campaignId: string, lease: HbxEngineLease) {
    const campaign = await (this.prisma as any).webscrapingCampaign.findUnique({ where: { id: campaignId } }).catch(() => null);
    if (!campaign || ['paused', 'canceled', 'completed', 'completed_insufficient_results', 'failed'].includes(String(campaign.status))) {
      await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }
    const attempt = safeInteger(campaign.currentAttempt) + 1;
    const normalized = this.normalizeSearchInput({
      city: campaign.city,
      state: campaign.state || '',
      segment: campaign.segment,
      quantity: Math.min(Math.max(safeInteger(campaign.batchSize, 25), 1), 50),
      engine: 'hbx',
      targetType: normalizeTargetType(campaign.targetType),
    });
    const queryUsed = this.buildRadarCampaignQuery(normalized, attempt);
    let batch: any = null;
    try {
      batch = await (this.prisma as any).webscrapingCampaignBatch.create({
        data: {
          campaignId,
          status: 'running',
          attemptNumber: attempt,
          engineId: lease.engineId,
          engineUrl: lease.url,
          queryUsed,
          batchSize: normalized.quantity,
          startedAt: new Date(),
        },
      });
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'running',
          startedAt: campaign.startedAt || new Date(),
          currentAttempt: { increment: 1 },
          lastQueryUsed: queryUsed,
          lastEngineUrl: lease.url,
          nextRunAt: null,
        },
      });
      const existingLeads = await (this.prisma as any).radarLeadPool.findMany({
        where: {
          normalizedCity: normalized.normalizedCity,
          normalizedSegment: normalized.normalizedSegment,
          phoneDigits: { not: null },
        },
        select: { phoneDigits: true, website: true, sourceUrl: true },
        take: 10_000,
      }).catch(() => []);
      const excludeUrls = existingLeads
        .flatMap((row: any) => [row.website, row.sourceUrl])
        .map((url: any) => String(url || '').trim())
        .filter(Boolean);
      const output = await this.searchHbxEngine(
        normalized,
        existingLeads.map((row: any) => row.phoneDigits).filter(Boolean),
        lease.url,
        {
          queryText: queryUsed,
          batchLimit: normalized.quantity,
          timeoutMs: this.getHbxBatchTimeoutMs(),
          excludeUrls,
        },
      );
      const persisted = await this.persistRadarLeadPoolBatch(normalized, output.results, 'hbx_campaign', {
        campaignId,
        strictLocalDdd: normalized.targetType === 'pf',
      });
      await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      const empty = persisted.approvedCount === 0;
      const batchRejectedCount = persisted.rejectedCount + safeInteger(output.rejectedCount);
      const nextConsecutiveEmpty = empty ? safeInteger(campaign.consecutiveEmptyBatchCount) + 1 : 0;
      const reachedMaxEmptyBatches = empty && nextConsecutiveEmpty >= this.getRadarCampaignMaxEmptyBatches();
      await (this.prisma as any).webscrapingCampaignBatch.update({
        where: { id: batch.id },
        data: {
          status: empty ? 'empty_batch' : 'completed',
          approvedCount: persisted.approvedCount,
          duplicateCount: persisted.duplicateCount,
          rejectedCount: batchRejectedCount,
          errorMessage: output.rawErrorMessage || null,
          parsedCount: Array.isArray(output.results) ? output.results.length : 0,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      const counters = await this.recalculateRadarCampaignCounters(campaignId);
      const reachedTarget = counters.approvedCount >= safeInteger(campaign.targetTotal);
      const reachedAttempts = attempt >= safeInteger(campaign.maxAttempts);
      const finalStatus = reachedTarget
        ? 'completed'
        : reachedAttempts
          ? counters.foundCount > 0 ? 'completed_insufficient_results' : 'failed'
          : reachedMaxEmptyBatches
            ? 'completed_insufficient_results'
          : empty ? 'queued' : 'running';
      const terminal = ['completed', 'completed_insufficient_results', 'failed'].includes(finalStatus);
      const finalMessage = reachedTarget
        ? `Campanha concluida com ${counters.approvedCount} cards limpos.`
        : reachedAttempts && counters.foundCount === 0
          ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}.`
          : reachedMaxEmptyBatches
            ? `Campanha tentou ${attempt} lotes; os ultimos ${nextConsecutiveEmpty} vieram vazios. Ultima query: ${queryUsed}.`
            : empty
              ? `Lote ${attempt} sem cards aprovados. Tentando proxima query.`
              : `Encontramos ${counters.approvedCount} cards ate agora. Continuando nos proximos lotes.`;
      const nextRetryAt = terminal ? null : new Date(Date.now() + 1_000);
      this.logger.log(`[radar-campaign-batch] ${JSON.stringify({
        runId: campaignId,
        attempt,
        batchLimit: normalized.quantity,
        queryUsed,
        engineUrl: lease.url,
        httpStatus: output.httpStatus || null,
        errorMessage: output.rawErrorMessage || null,
        approvedCount: persisted.approvedCount,
        rejectedCount: batchRejectedCount,
        duplicateCount: persisted.duplicateCount,
        nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
      })}`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          consecutiveEmptyBatchCount: nextConsecutiveEmpty,
          consecutiveErrorCount: 0,
          lastErrorMessage: finalMessage,
          nextRunAt: nextRetryAt,
          finishedAt: terminal ? new Date() : null,
        },
      }).catch(() => null);
    } catch (error) {
      await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      const httpStatus = this.extractHbxHttpStatus(error);
      const message = this.extractHbxErrorMessage(error);
      const retryable = this.isRetryableHbxError(error);
      const counters = await this.recalculateRadarCampaignCounters(campaignId).catch(() => ({ foundCount: safeInteger(campaign.foundCount) }));
      const nextConsecutiveError = safeInteger(campaign.consecutiveErrorCount) + 1;
      const nextRunAt = new Date(Date.now() + (retryable ? this.getHbxRetryDelayMs(nextConsecutiveError) : 30_000));
      const reachedAttempts = attempt >= safeInteger(campaign.maxAttempts);
      const finalStatus = reachedAttempts
        ? counters.foundCount > 0 ? 'completed_insufficient_results' : 'failed'
        : counters.foundCount > 0 ? 'partial_error' : 'queued';
      const terminal = ['completed_insufficient_results', 'failed'].includes(finalStatus);
      const effectiveNextRunAt = terminal ? null : nextRunAt;
      if (batch?.id) {
        await (this.prisma as any).webscrapingCampaignBatch.update({
          where: { id: batch.id },
          data: {
            status: 'batch_error',
            errorMessage: message,
            finishedAt: new Date(),
          },
        }).catch(() => null);
      }
      this.logger.warn(`[radar-campaign-batch] ${JSON.stringify({
        runId: campaignId,
        attempt,
        batchLimit: safeInteger(campaign.batchSize, 25),
        queryUsed,
        engineUrl: lease.url,
        httpStatus,
        errorMessage: message,
        approvedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        nextRetryAt: effectiveNextRunAt ? effectiveNextRunAt.toISOString() : null,
      })}`);
      await (this.prisma as any).webscrapingCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          consecutiveErrorCount: nextConsecutiveError,
          lastErrorMessage: finalStatus === 'failed'
            ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}. Erro: ${message}`
            : terminal && counters.foundCount > 0
              ? `Busca parcial: ${counters.foundCount} cards encontrados. O motor tentou ${attempt} lotes, mas nao atingiu a meta.`
              : httpStatus ? `Ultimo lote falhou com ${httpStatus}. Tentando novamente.` : message,
          nextRunAt: effectiveNextRunAt,
          finishedAt: terminal ? new Date() : null,
        },
      }).catch(() => null);
    } finally {
      await this.getEnginePool().releaseEngine(lease.engineId);
      this.scheduleRadarCampaignPump(1_000);
    }
  }

  private async getHistoryPlaceColumnSupport(): Promise<HistoryPlaceColumnSupport> {
    const [source, score, opportunityReason] = await Promise.all([
      this.prisma.hasColumn('WebscrapingSearchPlace', 'source'),
      this.prisma.hasColumn('WebscrapingSearchPlace', 'score'),
      this.prisma.hasColumn('WebscrapingSearchPlace', 'opportunityReason'),
    ]);
    return { source, score, opportunityReason };
  }

  private buildHistoryPlaceSelect(columnSupport: HistoryPlaceColumnSupport) {
    return {
      id: true,
      placeId: true,
      rank: true,
      name: true,
      phone: true,
      phoneDigits: true,
      rating: true,
      reviews: true,
      address: true,
      website: true,
      ...(columnSupport.source ? { source: true } : {}),
      ...(columnSupport.score ? { score: true } : {}),
      ...(columnSupport.opportunityReason ? { opportunityReason: true } : {}),
    };
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
    const historyPlaceSelect = this.buildHistoryPlaceSelect(await this.getHistoryPlaceColumnSupport());
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
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
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
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
        },
      },
    }).catch(() => []);
    const exactCandidate = candidates.find((candidate: any) => this.buildHistoryDedupeKey({
      city: candidate.city,
      state: this.extractSignaturePart(candidate.searchSignature, 'state').toUpperCase(),
      segment: candidate.segment,
      filtersJson: candidate.filtersJson,
      searchSignature: candidate.searchSignature,
    }) === targetDedupeKey) as SearchHistoryRow | undefined;
    if (exactCandidate) return exactCandidate;

    return null;
  }

  private async findHistoryById(companyId: number, historyId: string): Promise<SearchHistoryRow | null> {
    const historyPlaceSelect = this.buildHistoryPlaceSelect(await this.getHistoryPlaceColumnSupport());
    const row = await this.prisma.webscrapingSearchHistory.findFirst({
      where: {
        id: String(historyId || '').trim(),
        companyId,
      },
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
        },
      },
    });
    return (row as SearchHistoryRow | null) || null;
  }

  private isExecutedUsageEvent(eventType: UsageEventType) {
    return eventType === 'EXECUTED' || eventType === 'GOOGLE_SEARCH_EXECUTED' || eventType === 'GOOGLE_EMERGENCY_EXECUTED';
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
    const historyPlaceColumns = await this.getHistoryPlaceColumnSupport();
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
      ...(historyPlaceColumns.source ? { source: result.source || null } : {}),
      ...(historyPlaceColumns.score ? { score: result.score == null ? null : result.score } : {}),
      ...(historyPlaceColumns.opportunityReason
        ? { opportunityReason: result.opportunityReason || this.buildOpportunityReason(result, input) }
        : {}),
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
        segment: input.segment,
        targetType: input.targetType,
        limit: batchLimit,
        fresh: normalizedExcludePhoneDigits.length > 0,
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
        [502, 503, 504].includes(response.status),
        'hbx_scraping_engine_http_error',
      );
    }

    const items = Array.isArray(payload?.results) ? payload.results : [];
    const results: WebscrapingContactResult[] = [];
    const seenPhones = new Set<string>();
    let rejectedCount = 0;
    let duplicateCount = 0;

    for (const item of items) {
      const mapped = this.mapHbxContactResult(item, input.targetType);
      if (!mapped) {
        rejectedCount += 1;
        continue;
      }
      if (normalizedExcludePhoneDigits.includes(mapped.phoneDigits)) {
        duplicateCount += 1;
        continue;
      }
      if (seenPhones.has(mapped.phoneDigits)) {
        duplicateCount += 1;
        continue;
      }
      seenPhones.add(mapped.phoneDigits);
      results.push(mapped);
      if (results.length >= batchLimit) break;
    }

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
      rejectedCount,
      duplicateCount,
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
