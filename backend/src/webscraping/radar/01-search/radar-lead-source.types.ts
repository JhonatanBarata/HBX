import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import type { RadarPipelineStage, RadarStageIssue } from '../shared/radar-stage.types';

export type RadarLeadSourceKind =
  | 'radar_database'
  | 'company_history'
  | 'global_cache'
  | 'hbx_engine'
  | 'google_textual'
  | 'radar_web_enrichment'
  | 'website_crawl_light'
  | 'cnpj_public'
  | 'local_directory'
  | 'vertical_source'
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
  | 'deep';

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
  stage?: RadarPipelineStage | string;
  operation?: string;
  status: RadarLeadSourceStatus;
  retryable: boolean;
  blocksDelivery?: boolean;
  traceId?: string | null;
  runId?: string | null;
  leadId?: string | null;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reason: string;
  results: WebscrapingContactResult[];
  issue?: RadarStageIssue | null;
};
