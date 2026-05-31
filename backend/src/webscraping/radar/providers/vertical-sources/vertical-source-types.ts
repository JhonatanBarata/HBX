import type { NormalizedSearchInput } from '../../shared/radar-types';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';

export type VerticalSourceKind =
  | 'alimentacao'
  | 'clinicas'
  | 'imobiliarias'
  | 'automotivo'
  | 'hotelaria'
  | 'educacao'
  | 'beleza'
  | string;

export type VerticalSourceRecord = {
  name?: string | null;
  vertical?: VerticalSourceKind | null;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  address?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  whatsappUrl?: string | null;
  description?: string | null;
  raw?: Record<string, any> | null;
};

export type VerticalSourceSearchInput = {
  normalized: NormalizedSearchInput;
  strategies?: Array<Record<string, any>>;
  limit?: number;
  records?: VerticalSourceRecord[];
};

export type VerticalSourceProviderResult = {
  status: 'completed' | 'skipped' | 'partial_error';
  retryable: boolean;
  reason: string;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  results: WebscrapingContactResult[];
  issue?: {
    message: string;
    retryable: boolean;
    blocksDelivery: false;
  } | null;
};
