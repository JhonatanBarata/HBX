import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';

export type RadarSocialNetwork = 'instagram' | 'facebook';

export type RadarSocialLookupHost = {
  searchHbxEngine: (
    input: NormalizedSearchInput,
    existing: any[],
    engineUrl: string | undefined,
    options: { queryText: string; batchLimit: number; timeoutMs: number },
  ) => Promise<{ results: any[] }>;
  normalizeRadarSocialUrl: (value: unknown, network: RadarSocialNetwork) => string | null;
  pickRadarSocialUrl: (item: any, network: RadarSocialNetwork) => string | null;
};

export type RadarSocialLookupJob = {
  context: SearchExecutionContext;
  leadId: string;
  input: NormalizedSearchInput;
  engineUrl?: string | null;
  host: RadarSocialLookupHost;
};

export type RadarSocialQueryLayer =
  | 'full_name_city_state'
  | 'full_name_city_state_site_operator'
  | 'brand_city'
  | 'brand_city_state'
  | 'brand_city_segment'
  | 'legal_name_city'
  | 'phone_masked'
  | 'phone_digits'
  | 'domain'
  | 'domain_site_operator'
  | 'site_operator'
  | 'site_operator_segment'
  | 'whatsapp_intent'
  | 'agenda_intent'
  | 'address_city'
  | 'probable_handle'
  | 'simplified_name';

export type RadarSocialLookupQuery = {
  network: RadarSocialNetwork;
  query: string;
  layer: RadarSocialQueryLayer;
};

export type RadarSocialCandidate = {
  network: RadarSocialNetwork;
  url: string | null;
  source: string;
  result: any;
  rawText: string;
  sourceField?: string | null;
};

export type RadarSocialCandidateScore = {
  accepted: boolean;
  status: 'confirmed' | 'candidate_review' | 'rejected';
  confidence: number;
  reason: string;
  url: string | null;
  network: RadarSocialNetwork;
  source?: string | null;
  query?: string | null;
  layer?: RadarSocialQueryLayer | null;
};

export type RadarSocialLookupResult = {
  status: 'found' | 'partial' | 'candidate_review' | 'missing' | 'error';
  instagramUrl: string | null;
  facebookUrl: string | null;
  confidence: number;
  queries: string[];
  reason: string;
  candidates?: RadarSocialCandidateScore[];
  acceptedCandidates?: RadarSocialCandidateScore[];
  rejectedCandidates?: RadarSocialCandidateScore[];
};
