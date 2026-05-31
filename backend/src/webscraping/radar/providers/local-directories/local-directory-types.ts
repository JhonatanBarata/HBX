import type { NormalizedSearchInput } from '../../shared/radar-types';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';

export type LocalDirectoryRecord = {
  name?: string | null;
  phone?: string | null;
  website?: string | null;
  directoryUrl?: string | null;
  sourceName?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  address?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  description?: string | null;
  raw?: Record<string, any> | null;
};

export type LocalDirectorySearchInput = {
  normalized: NormalizedSearchInput;
  seeds?: string[];
  limit?: number;
  records?: LocalDirectoryRecord[];
};

export type LocalDirectoryProviderResult = {
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
