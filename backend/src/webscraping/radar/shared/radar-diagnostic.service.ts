import { Injectable } from '@nestjs/common';
import { buildRadarStageIssue } from './radar-stage-policy';
import {
  buildRadarStageDiagnostic,
  buildRadarStageSnapshot,
  radarStageError,
  radarStageOk,
  type RadarStageResult,
} from './radar-stage-result';
import type { RadarErrorCode } from './radar-error-codes';
import type { RadarPipelineStage, RadarStageIssue, RadarStageSnapshot } from './radar-stage.types';

@Injectable()
export class RadarDiagnosticService {
  snapshot(input: Partial<RadarStageSnapshot> & Record<string, any> = {}) {
    return buildRadarStageSnapshot(input);
  }

  issue(input: {
    stage: RadarPipelineStage | string;
    code: RadarErrorCode;
    message?: string | null;
    retryable?: boolean | null;
    blocksDelivery?: boolean | null;
    at?: Date | string | null;
  }) {
    return buildRadarStageIssue(input);
  }

  ok<T>(value: T, snapshot?: Partial<RadarStageSnapshot>): RadarStageResult<T> & { snapshot?: RadarStageSnapshot } {
    return radarStageOk(value, snapshot);
  }

  error(input: Parameters<typeof buildRadarStageIssue>[0]) {
    return radarStageError(input);
  }

  diagnostic(input: {
    snapshot?: Partial<RadarStageSnapshot> & Record<string, any>;
    issues?: RadarStageIssue[];
  }) {
    return buildRadarStageDiagnostic(input);
  }
}
