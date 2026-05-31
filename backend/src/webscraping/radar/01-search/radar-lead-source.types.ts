import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import type { RadarStageIssue } from '../shared/radar-stage.types';

export type RadarLeadSourceKind =
  | 'radar_database'
  | 'company_history'
  | 'global_cache'
  | 'hbx_engine'
  | 'google_textual'
  | 'reprocess_missing_social'
  | 'reprocess_old_cards'
  | 'website_crawl_light'
  | 'local_directories_stub'
  | 'cnpj_public_stub';

export type RadarLeadSourceStatus =
  | 'completed'
  | 'partial_error'
  | 'skipped'
  | 'failed';

export type RadarSearchStrategyMode =
  | 'fast'
  | 'quality'
  | 'deep'
  | 'night_factory';

export type RadarLeadSourceStep = {
  source: RadarLeadSourceKind;
  priority: number;
  enabled: boolean;
  implemented: boolean;
  stopWhenEnough: boolean;
  optional: boolean;
  reason: string;
};

export type RadarLeadSourceResult = {
  source: RadarLeadSourceKind;
  status: RadarLeadSourceStatus;
  retryable: boolean;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reason: string;
  results: WebscrapingContactResult[];
  issue?: RadarStageIssue | null;
};
