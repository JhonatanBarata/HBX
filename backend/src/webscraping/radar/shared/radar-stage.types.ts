import type { RadarErrorCode } from './radar-error-codes';

export type RadarPipelineStage =
  | 'access'
  | 'quota'
  | 'input'
  | 'identity'
  | 'quality'
  | 'persistence'
  | 'delivery'
  | 'enrichment'
  | 'social'
  | 'email'
  | 'whatsapp'
  | 'site'
  | 'presentation'
  | 'vendas_sync'
  | 'provider_secondary'
  | 'cache'
  | 'history'
  | 'campaign_factory';

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
  code: RadarErrorCode;
  message: string;
  blocksDelivery: boolean;
  retryable: boolean;
  at: string;
};

export type RadarStageDiagnostic = {
  snapshot: RadarStageSnapshot;
  deliverable: boolean;
  deliveryBlockers: RadarStageIssue[];
  nonBlockingIssues: RadarStageIssue[];
};
