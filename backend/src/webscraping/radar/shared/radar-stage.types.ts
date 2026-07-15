import type { RadarErrorCode } from './radar-error-codes';

export type RadarPipelineStage =
  | 'access'
  | 'input'
  | 'quota'
  | 'search'
  | 'provider_google'
  | 'provider_hbx'
  | 'filter'
  | 'quality_gate'
  | 'persistence'
  | 'delivery'
  | 'post_delivery_update'
  | 'enrichment'
  | 'social'
  | 'email'
  | 'whatsapp'
  | 'site'
  | 'presentation'
  | 'campaign'
  | 'factory';

export type RadarPipelineLeadStatus =
  | 'candidate'
  | 'qualified'
  | 'rejected'
  | 'duplicate'
  | 'negative'
  | 'protected'
  | 'invalid';

export type RadarPipelineDeliveryStatus =
  | 'pending'
  | 'deliverable'
  | 'delivered'
  | 'blocked'
  | 'error';

export type RadarPipelineEnrichmentStatus =
  | 'pending'
  | 'partial'
  | 'completed'
  | 'error'
  | 'skipped';

export type RadarPipelineSocialStatus =
  | 'pending'
  | 'searching'
  | 'found'
  | 'partial'
  | 'candidate_review'
  | 'missing'
  | 'weak'
  | 'error'
  | 'skipped';

export type RadarPipelineEmailStatus =
  | 'pending'
  | 'confirmed'
  | 'probable'
  | 'missing'
  | 'invalid'
  | 'unverified'
  | 'error'
  | 'skipped';

export type RadarPipelineWhatsappStatus =
  | 'pending'
  | 'confirmed'
  | 'missing'
  | 'unverified'
  | 'invalid'
  | 'error'
  | 'skipped';

export type RadarPipelineProviderStatus =
  | 'pending'
  | 'available'
  | 'degraded'
  | 'error'
  | 'skipped';

export type RadarStageSnapshot = {
  leadStatus: RadarPipelineLeadStatus;
  deliveryStatus: RadarPipelineDeliveryStatus;
  enrichmentStatus: RadarPipelineEnrichmentStatus;
  socialStatus: RadarPipelineSocialStatus;
  emailStatus: RadarPipelineEmailStatus;
  whatsappStatus: RadarPipelineWhatsappStatus;
  providerStatus: RadarPipelineProviderStatus;
};

export type RadarStageIssue = {
  stage: RadarPipelineStage;
  operation?: string | null;
  source?: string | null;
  status?: string | null;
  code: RadarErrorCode;
  message: string;
  reason?: string | null;
  blocksDelivery: boolean;
  retryable: boolean;
  traceId?: string | null;
  runId?: string | null;
  leadId?: string | null;
  at: string;
};

export type RadarSourceDiagnostic = {
  stage: RadarPipelineStage | string;
  operation: string;
  source: string | null;
  status: string;
  retryable: boolean;
  blocksDelivery: boolean;
  reason: string;
  traceId: string | null;
  runId: string | null;
  leadId: string | null;
  foundCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  issue?: RadarStageIssue | null;
};

export type RadarStageDiagnostic = {
  snapshot: RadarStageSnapshot;
  deliverable: boolean;
  deliveryBlockers: RadarStageIssue[];
  nonBlockingIssues: RadarStageIssue[];
};
