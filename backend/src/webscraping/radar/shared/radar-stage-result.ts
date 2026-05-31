import { buildRadarStageIssue } from './radar-stage-policy';
import type {
  RadarPipelineStage,
  RadarPipelineDeliveryStatus,
  RadarPipelineEmailStatus,
  RadarPipelineEnrichmentStatus,
  RadarPipelineLeadStatus,
  RadarPipelineProviderStatus,
  RadarPipelineSocialStatus,
  RadarPipelineWhatsappStatus,
  RadarStageDiagnostic,
  RadarStageIssue,
  RadarStageSnapshot,
} from './radar-stage.types';
import type { RadarErrorCode } from './radar-error-codes';

export type RadarStageResult<T = unknown> = {
  ok: boolean;
  stage?: RadarPipelineStage | string;
  operation?: string;
  code?: RadarErrorCode;
  data?: T;
  error?: unknown;
  canContinue?: boolean;
  blocksDelivery: boolean;
  retryable: boolean;
  publicMessage?: string;
  technicalMessage?: string;
  traceId?: string;
  runId?: string;
  leadId?: string;
  companyId?: number | string;
  userId?: number | string;
  engineId?: string;
  provider?: string;
  value?: T;
  issue?: RadarStageIssue;
};

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

export function normalizeRadarLeadStageStatus(value: unknown): RadarPipelineLeadStatus {
  return normalizeEnum(value, ['candidate', 'qualified', 'rejected', 'duplicate', 'negative', 'protected', 'invalid'], 'candidate');
}

export function normalizeRadarDeliveryStatus(value: unknown): RadarPipelineDeliveryStatus {
  return normalizeEnum(value, ['pending', 'deliverable', 'delivered', 'blocked', 'error'], 'pending');
}

export function normalizeRadarEnrichmentStatus(value: unknown): RadarPipelineEnrichmentStatus {
  return normalizeEnum(value, ['pending', 'partial', 'completed', 'error', 'skipped'], 'pending');
}

export function normalizeRadarSocialStatus(value: unknown): RadarPipelineSocialStatus {
  return normalizeEnum(value, ['pending', 'searching', 'found', 'partial', 'candidate_review', 'missing', 'weak', 'error', 'skipped'], 'pending');
}

export function normalizeRadarEmailStatus(value: unknown): RadarPipelineEmailStatus {
  return normalizeEnum(value, ['pending', 'confirmed', 'probable', 'missing', 'invalid', 'unverified', 'error', 'skipped'], 'pending');
}

export function normalizeRadarWhatsappStatus(value: unknown): RadarPipelineWhatsappStatus {
  return normalizeEnum(value, ['pending', 'confirmed', 'missing', 'unverified', 'invalid', 'error', 'skipped'], 'pending');
}

export function normalizeRadarProviderStatus(value: unknown): RadarPipelineProviderStatus {
  return normalizeEnum(value, ['pending', 'available', 'degraded', 'error', 'skipped'], 'pending');
}

export function buildRadarStageSnapshot(input: Partial<RadarStageSnapshot> & Record<string, any> = {}): RadarStageSnapshot {
  const socialStatus = input.socialStatus || (input.instagramUrl || input.facebookUrl ? 'found' : undefined);
  const emailStatus = input.email ? input.emailStatus || 'confirmed' : input.emailStatus;
  const whatsappStatus = input.whatsappStatus || input.whatsappCheckStatus;
  const deliveryStatus = input.deliveryStatus || (input.delivered ? 'delivered' : input.deliverable ? 'deliverable' : undefined);
  const leadStatus = input.leadStatus || (deliveryStatus === 'deliverable' || deliveryStatus === 'delivered' ? 'qualified' : undefined);

  return {
    leadStatus: normalizeRadarLeadStageStatus(leadStatus),
    deliveryStatus: normalizeRadarDeliveryStatus(deliveryStatus),
    enrichmentStatus: normalizeRadarEnrichmentStatus(input.enrichmentStatus),
    socialStatus: normalizeRadarSocialStatus(socialStatus),
    emailStatus: normalizeRadarEmailStatus(emailStatus),
    whatsappStatus: normalizeRadarWhatsappStatus(whatsappStatus || 'unverified'),
    providerStatus: normalizeRadarProviderStatus(input.providerStatus || 'available'),
  };
}

export function radarStageOk<T>(value: T, snapshot?: Partial<RadarStageSnapshot>): RadarStageResult<T> & { snapshot?: RadarStageSnapshot } {
  return {
    ok: true,
    blocksDelivery: false,
    retryable: false,
    canContinue: true,
    data: value,
    value,
    ...(snapshot ? { snapshot: buildRadarStageSnapshot(snapshot) } : {}),
  };
}

export function radarStageError(input: Parameters<typeof buildRadarStageIssue>[0]): RadarStageResult<never> {
  const issue = buildRadarStageIssue(input);
  return {
    ok: false,
    stage: issue.stage,
    code: issue.code,
    error: issue,
    canContinue: !issue.blocksDelivery,
    blocksDelivery: issue.blocksDelivery,
    retryable: issue.retryable,
    issue,
  };
}

export function buildRadarStageDiagnostic(input: {
  snapshot?: Partial<RadarStageSnapshot> & Record<string, any>;
  issues?: RadarStageIssue[];
}): RadarStageDiagnostic {
  const snapshot = buildRadarStageSnapshot(input.snapshot || {});
  const issues = Array.isArray(input.issues) ? input.issues : [];
  const deliveryBlockers = issues.filter((issue) => issue.blocksDelivery);
  return {
    snapshot,
    deliverable: snapshot.deliveryStatus !== 'blocked' && !deliveryBlockers.length,
    deliveryBlockers,
    nonBlockingIssues: issues.filter((issue) => !issue.blocksDelivery),
  };
}
