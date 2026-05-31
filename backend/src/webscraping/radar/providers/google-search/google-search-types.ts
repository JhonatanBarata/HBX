import type { RadarSocialNetwork } from '../../04-socials/radar-social-types';

export type GoogleTextualSearchIntent =
  | 'lead_discovery'
  | 'social_enrichment'
  | 'source_expansion';

export type GoogleTextualSearchRequest = {
  provider: 'google_textual';
  intent: GoogleTextualSearchIntent;
  queryText: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  network?: RadarSocialNetwork | null;
  limit: number;
  timeoutMs?: number | null;
  usePlacesApi: false;
};

export type GoogleTextualRawResult = {
  [key: string]: any;
  title?: string | null;
  snippet?: string | null;
  description?: string | null;
  url?: string | null;
  sourceUrl?: string | null;
  website?: string | null;
};

export type GoogleTextualSearchResult = GoogleTextualRawResult & {
  provider: 'google_textual';
  queryText: string;
  intent: GoogleTextualSearchIntent;
  placeId: string;
  name: string;
  phone: string;
  phoneDigits: string;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  website: string | null;
  source: string;
  sourceEngine: 'google_textual';
  sourceUrl: string | null;
  evidenceJson: Record<string, any>;
};

export type GoogleTextualSearchAdapter = (
  request: GoogleTextualSearchRequest,
) => Promise<{ results: GoogleTextualRawResult[] }>;
