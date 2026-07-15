import type { LeadQualityV2SalesProfile } from '../../lead-quality-v2';

export type SearchSource = 'history' | 'google' | 'hbx' | 'hybrid' | 'global_cache' | 'radar_database';
export type WebscrapingEngine = 'google' | 'hbx';
export type HbxTargetType = 'pj' | 'pf' | 'agenda_pf';
export type WebscrapingSearchRunStatus =
  | 'queued'
  | 'running'
  | 'sleeping'
  | 'completed'
  | 'partial_error'
  | 'completed_insufficient_results'
  | 'failed'
  | 'canceled';
export type RadarOperationalState = 'funcionando' | 'pausado' | 'parado';

// Sugestão de expansão quando a oferta esgota (cidade/segmento secaram, não cota).
export type RadarExpansionSuggestion = {
  city: string;
  state: string | null;
  segment: string;
  deliveredCount: number;
  requestedQuantity: number;
  currentRadiusKm: number;
  nextRadiusKm: number | null;
  neighborSegments: string[];
  headline: string;
  widenReachLabel: string | null;
  widenSegmentLabel: string | null;
};

export type WebscrapingSearchRunItemStatus = 'found' | 'duplicate' | 'skipped' | 'invalid';

export type RadarWebsiteStatus = 'none' | 'present' | 'social_only' | 'weak' | 'unreachable' | 'unknown';
export type RadarOpportunityLevel = 'high' | 'medium' | 'low' | null;
export type RadarWhatsappCheckMode = 'off' | 'enrich' | 'only_valid';
export type RadarWhatsappCheckStatus = 'confirmed' | 'missing' | 'unverified';
export type RadarChannelFilter = 'whatsapp' | 'instagram' | 'email' | 'website' | 'phone' | 'facebook';
export type RadarChannelMatchMode = 'prefer' | 'any_required' | 'all_required';

export type RegionalCity = {
  city: string;
  state: string;
  normalizedCity: string;
  distanceKm: number;
};

export type SearchExecutionContext = {
  companyId: number;
  userId: number;
  user: any;
};

export type NormalizedSearchInput = {
  city: string;
  state: string;
  segment: string;
  radiusKm: number;
  originLat: number | null;
  originLng: number | null;
  regionalCities: RegionalCity[];
  quantity: number;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  filters: {
    minRating: number | null;
    minReviews: number | null;
    onlyWithWebsite: boolean;
    radiusKm?: number;
    scoreRange?: string | null;
  };
  filtersJson: string;
  searchSignature: string;
  cacheSignature: string;
  normalizedCity: string;
  normalizedSegment: string;
  excludePhoneDigits: string[];
  salesProfile: LeadQualityV2SalesProfile | null;
  preferredChannels: RadarChannelFilter[];
  requiredChannels: RadarChannelFilter[];
  channelMatchMode: RadarChannelMatchMode;
  freshness: 'live' | 'database_first' | 'hybrid';
};

export type NormalizedRadarFilters = {
  city: string;
  state: string;
  segment: string;
  radiusKm: number;
  originLat: number | null;
  originLng: number | null;
  regionalCities: RegionalCity[];
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
  stockOverride: boolean;
  whatsappCheckMode: RadarWhatsappCheckMode;
  preferredChannels: RadarChannelFilter[];
  requiredChannels: RadarChannelFilter[];
  channelMatchMode: RadarChannelMatchMode;
  freshness: 'live' | 'database_first' | 'hybrid';
  salesProfile: LeadQualityV2SalesProfile | null;
};

export type RadarSearchRunMetrics = {
  rawFoundCount: number;
  hardBlockedCount: number;
  negativeBlockedCount: number;
  duplicateBlockedCount: number;
  noChannelBlockedCount: number;
  genericNameBlockedCount: number;
  segmentHardMismatchBlockedCount: number;
  savedEligibleCount: number;
  savedReviewBackupCount: number;
  claimQualifiedCount: number;
  downgradedByQualityCount: number;
  urlsDiscovered: number;
  pagesFetched: number;
  parsedContacts: number;
  approvedContacts: number;
  reviewLowScore: number;
  downgradedToReview: number;
  rejectedLowScore?: number;
  rejectedBlockedDomain: number;
  rejectedInvalidPhone: number;
  rejectedGenericName: number;
  durationMs: number;
  engineId: string | null;
  engineIndex: number | null;
  sourceEngine: string | null;
  cacheHit: boolean;
  status: string;
};

export type RadarSearchRunMetricsPatch = Partial<RadarSearchRunMetrics> & {
  increment?: Partial<RadarSearchRunMetrics>;
  [key: string]: any;
};
