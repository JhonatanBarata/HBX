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
  'vendas_sync',
  'provider_secondary',
  'cache',
  'history',
  'campaign_factory',
] as const satisfies readonly RadarPipelineStage[];

export const RADAR_DELIVERY_GATE_STAGES = [
  'access',
  'quota',
  'input',
  'identity',
  'quality',
  'persistence',
  'delivery',
] as const satisfies readonly RadarPipelineStage[];

export function isRadarNeverBlockDeliveryStage(stage: unknown): stage is typeof RADAR_NEVER_BLOCK_DELIVERY_STAGES[number] {
  return (RADAR_NEVER_BLOCK_DELIVERY_STAGES as readonly string[]).includes(String(stage || '').trim());
}

export function isRadarDeliveryGateStage(stage: unknown): stage is typeof RADAR_DELIVERY_GATE_STAGES[number] {
  return (RADAR_DELIVERY_GATE_STAGES as readonly string[]).includes(String(stage || '').trim());
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
  code: RadarErrorCode;
  message?: string | null;
  retryable?: boolean | null;
  blocksDelivery?: boolean | null;
  at?: Date | string | null;
}): RadarStageIssue {
  const code = normalizeRadarErrorCode(input.code) || 'unknown';
  const blocksDelivery = shouldRadarIssueBlockDelivery({
    stage: input.stage,
    code,
    blocksDelivery: input.blocksDelivery,
  });
  const at = input.at instanceof Date
    ? input.at.toISOString()
    : String(input.at || '').trim() || new Date().toISOString();

  return {
    stage: String(input.stage || 'delivery') as RadarPipelineStage,
    code,
    message: String(input.message || code || 'Radar stage issue.').trim(),
    blocksDelivery,
    retryable: input.retryable !== false && !blocksDelivery,
    at,
  };
}
