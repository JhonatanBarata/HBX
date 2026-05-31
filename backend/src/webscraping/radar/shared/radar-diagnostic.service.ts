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
import type { RadarPipelineStage, RadarSourceDiagnostic, RadarStageIssue, RadarStageSnapshot } from './radar-stage.types';

function stringOrNull(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

@Injectable()
export class RadarDiagnosticService {
  snapshot(input: Partial<RadarStageSnapshot> & Record<string, any> = {}) {
    return buildRadarStageSnapshot(input);
  }

  issue(input: {
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

  sourceDiagnostic(input: {
    stage?: RadarPipelineStage | string | null;
    operation?: string | null;
    source?: string | null;
    status?: string | null;
    retryable?: boolean | null;
    blocksDelivery?: boolean | null;
    reason?: string | null;
    traceId?: string | null;
    runId?: string | null;
    leadId?: string | null;
    foundCount?: number | null;
    acceptedCount?: number | null;
    rejectedCount?: number | null;
    issue?: RadarStageIssue | null;
  }): RadarSourceDiagnostic {
    const issue = input.issue || null;
    const stage = stringOrNull(input.stage) || issue?.stage || 'search';
    const operation = stringOrNull(input.operation) || stringOrNull(issue?.operation) || 'execute';
    const source = stringOrNull(input.source) || stringOrNull(issue?.source);
    const status = stringOrNull(input.status) || stringOrNull(issue?.status) || (issue ? 'partial_error' : 'completed');
    const reason = stringOrNull(input.reason) || stringOrNull(issue?.reason) || stringOrNull(issue?.message) || status;
    return {
      stage,
      operation,
      source,
      status,
      retryable: input.retryable ?? issue?.retryable ?? false,
      blocksDelivery: input.blocksDelivery ?? issue?.blocksDelivery ?? false,
      reason,
      traceId: stringOrNull(input.traceId) || stringOrNull(issue?.traceId),
      runId: stringOrNull(input.runId) || stringOrNull(issue?.runId),
      leadId: stringOrNull(input.leadId) || stringOrNull(issue?.leadId),
      foundCount: safeInteger(input.foundCount),
      acceptedCount: safeInteger(input.acceptedCount),
      rejectedCount: safeInteger(input.rejectedCount),
      issue,
    };
  }

  normalizeSourceDiagnostics(
    diagnostics: Array<Record<string, any>> | null | undefined,
    defaults: Partial<RadarSourceDiagnostic> = {},
  ): RadarSourceDiagnostic[] {
    return (Array.isArray(diagnostics) ? diagnostics : []).map((diagnostic) => this.sourceDiagnostic({
      ...defaults,
      ...diagnostic,
      issue: diagnostic?.issue || null,
    }));
  }

  splitIssues(issues: Array<RadarStageIssue | Record<string, any>> | null | undefined) {
    const normalized = (Array.isArray(issues) ? issues : []).map((issue) => this.issue({
      stage: issue.stage || 'delivery',
      operation: issue.operation || null,
      source: issue.source || null,
      status: issue.status || null,
      code: issue.code || 'unknown',
      message: issue.message || issue.reason || null,
      reason: issue.reason || issue.message || null,
      retryable: issue.retryable,
      blocksDelivery: issue.blocksDelivery,
      traceId: issue.traceId || null,
      runId: issue.runId || null,
      leadId: issue.leadId || null,
      at: issue.at || null,
    }));
    return {
      issues: normalized,
      blockers: normalized.filter((issue) => issue.blocksDelivery),
      nonBlockingIssues: normalized.filter((issue) => !issue.blocksDelivery),
    };
  }
}
