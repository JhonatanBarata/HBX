import {
  isRadarDeliveryBlockingErrorCode,
  isRadarNonBlockingErrorCode,
  normalizeRadarErrorCode,
  type RadarErrorCode,
} from './radar-error-codes';
import type { RadarPipelineStage, RadarStageIssue } from './radar-stage.types';

export const RADAR_NEVER_BLOCK_DELIVERY_STAGES = [
  'enrichment',
  'social',
  'email',
  'whatsapp',
  'site',
  'presentation',
  'post_delivery_update',
] as const satisfies readonly RadarPipelineStage[];

export const RADAR_DELIVERY_GATE_STAGES = [
  'access',
  'input',
  'quota',
  'filter',
  'quality_gate',
  'persistence',
  'delivery',
] as const satisfies readonly RadarPipelineStage[];

export const RADAR_NEVER_BLOCK_DELIVERY_STAGE_ALIASES = [
  'provider_secondary',
  'optional_provider',
  'email_enrichment',
  'whatsapp_check',
  'website_enrichment',
  'vendas_sync',
  'cache',
  'history',
] as const;

const RADAR_STAGE_ALIASES: Record<string, RadarPipelineStage> = {
  quality: 'quality_gate',
  identity: 'filter',
  email_enrichment: 'email',
  whatsapp_check: 'whatsapp',
  website_enrichment: 'site',
  vendas_sync: 'post_delivery_update',
  provider_secondary: 'search',
  optional_provider: 'search',
  cache: 'search',
  history: 'search',
};

export function normalizeRadarPipelineStage(stage: unknown): RadarPipelineStage | string {
  const normalized = String(stage || '').trim().toLowerCase();
  return RADAR_STAGE_ALIASES[normalized] || normalized;
}

export function isRadarNeverBlockDeliveryStage(stage: unknown): stage is typeof RADAR_NEVER_BLOCK_DELIVERY_STAGES[number] {
  const normalized = normalizeRadarPipelineStage(stage);
  return (RADAR_NEVER_BLOCK_DELIVERY_STAGES as readonly string[]).includes(String(normalized))
    || (RADAR_NEVER_BLOCK_DELIVERY_STAGE_ALIASES as readonly string[]).includes(String(stage || '').trim().toLowerCase());
}

export function isRadarDeliveryGateStage(stage: unknown): stage is typeof RADAR_DELIVERY_GATE_STAGES[number] {
  return (RADAR_DELIVERY_GATE_STAGES as readonly string[]).includes(String(normalizeRadarPipelineStage(stage)));
}

export function shouldRadarIssueBlockDelivery(input: {
  stage: RadarPipelineStage | string;
  code?: RadarErrorCode | null;
  blocksDelivery?: boolean | null;
}) {
  if (isRadarNeverBlockDeliveryStage(input.stage)) return false;
  if (input.blocksDelivery === true) return true;
  if (isRadarNonBlockingErrorCode(input.code)) return false;
  return isRadarDeliveryGateStage(input.stage) && isRadarDeliveryBlockingErrorCode(input.code);
}

export function buildRadarStageIssue(input: {
  stage: RadarPipelineStage | string;
  operation?: string | null;
  source?: string | null;
  status?: string | null;
  code: RadarErrorCode;
  message?: string | null;
  reason?: string | null;
  retryable?: boolean | null;
  blocksDelivery?: boolean | null;
  traceId?: string | null;
  runId?: string | null;
  leadId?: string | null;
  at?: Date | string | null;
}): RadarStageIssue {
  const code = normalizeRadarErrorCode(input.code) || 'unknown';
  const stage = normalizeRadarPipelineStage(input.stage);
  const blocksDelivery = shouldRadarIssueBlockDelivery({
    stage,
    code,
    blocksDelivery: input.blocksDelivery,
  });
  const at = input.at instanceof Date
    ? input.at.toISOString()
    : String(input.at || '').trim() || new Date().toISOString();

  return {
    stage: String(stage || 'delivery') as RadarPipelineStage,
    operation: String(input.operation || '').trim() || null,
    source: String(input.source || '').trim() || null,
    status: String(input.status || '').trim() || null,
    code,
    message: String(input.message || code || 'Radar stage issue.').trim(),
    reason: String(input.reason || input.message || code || '').trim() || null,
    blocksDelivery,
    retryable: input.retryable !== false && !blocksDelivery,
    traceId: String(input.traceId || '').trim() || null,
    runId: String(input.runId || '').trim() || null,
    leadId: String(input.leadId || '').trim() || null,
    at,
  };
}
