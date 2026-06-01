import { Injectable, Optional } from '@nestjs/common';
import {
  RadarEnrichmentJobPipelineService,
  type RadarAsyncEnrichmentJob,
  type RadarAsyncEnrichmentJobType,
} from '../03-enrichment/radar-enrichment-job-pipeline.service';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import type { RadarPipelineStage, RadarStageIssue } from '../shared/radar-stage.types';

export type RadarPostDeliveryJobType = RadarAsyncEnrichmentJobType;

export type RadarPostDeliveryJob = RadarAsyncEnrichmentJob;

export type RadarPostDeliveryUpdateState = {
  status: 'scheduled' | 'completed' | 'retryable';
  retryable: boolean;
  scheduledAt?: string;
  completedAt?: string;
  updatedAt: string;
  jobs: RadarPostDeliveryJob[];
  asyncEnrichmentJobs?: RadarPostDeliveryJob[];
  lastError?: {
    stage: string;
    message: string;
    at: string;
  };
};

function toIsoString(value?: Date | string | null) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value || '').trim();
  return raw || new Date().toISOString();
}

function normalizeObject(raw: unknown): Record<string, any> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
}

@Injectable()
export class RadarPostDeliveryUpdateService {
  private readonly jobPipeline: RadarEnrichmentJobPipelineService;

  constructor(@Optional() jobPipeline?: RadarEnrichmentJobPipelineService) {
    this.jobPipeline = jobPipeline || new RadarEnrichmentJobPipelineService();
  }

  buildPendingJobs(input: {
    now?: Date | string | null;
    include?: RadarPostDeliveryJobType[];
  } = {}): RadarPostDeliveryJob[] {
    const include: RadarPostDeliveryJobType[] = Array.isArray(input.include) && input.include.length
      ? input.include
      : this.jobPipeline.defaultPostDeliveryJobTypes();
    return this.jobPipeline.buildJobs({ types: include, status: 'queued', now: input.now });
  }

  buildScheduledState(input: {
    now?: Date | string | null;
    jobs?: RadarPostDeliveryJob[];
  } = {}): RadarPostDeliveryUpdateState {
    const now = toIsoString(input.now);
    const jobs = Array.isArray(input.jobs) && input.jobs.length ? input.jobs : this.buildPendingJobs({ now });
    return {
      status: 'scheduled',
      retryable: false,
      scheduledAt: now,
      updatedAt: now,
      jobs,
      asyncEnrichmentJobs: jobs,
    };
  }

  buildCompletedState(previous: unknown, now?: Date | string | null): RadarPostDeliveryUpdateState {
    const current = normalizeObject(previous);
    const updatedAt = toIsoString(now);
    const jobs = Array.isArray(current.jobs) ? current.jobs : this.buildPendingJobs({ now: updatedAt });
    return {
      ...current,
      status: 'completed',
      retryable: false,
      completedAt: updatedAt,
      updatedAt,
      jobs: jobs.map((job: RadarPostDeliveryJob) => ({ ...job, status: 'completed', retryable: false, finishedAt: updatedAt, updatedAt })),
      asyncEnrichmentJobs: jobs.map((job: RadarPostDeliveryJob) => ({ ...job, status: 'completed', retryable: false, finishedAt: updatedAt, updatedAt })),
    };
  }

  buildRetryableState(input: {
    previous?: unknown;
    stage: RadarPipelineStage | string;
    error: unknown;
    now?: Date | string | null;
  }): RadarPostDeliveryUpdateState {
    const current = normalizeObject(input.previous);
    const updatedAt = toIsoString(input.now);
    const jobs = Array.isArray(current.jobs) ? current.jobs : this.buildPendingJobs({ now: updatedAt });
    const stage = String(input.stage || 'post_delivery_update');
    const failedType = this.jobPipeline.mapStageToJobType(stage);
    const nextJobs = this.jobPipeline.markJob({
      jobs,
      type: failedType,
      status: 'partial_error',
      error: input.error,
      now: updatedAt,
    });
    return {
      ...current,
      status: 'retryable',
      retryable: true,
      updatedAt,
      jobs: nextJobs,
      asyncEnrichmentJobs: nextJobs,
      lastError: {
        stage,
        message: String((input.error as any)?.message || input.error || 'Falha pos-entrega.'),
        at: updatedAt,
      },
    };
  }

  buildRetryableIssue(input: {
    stage: RadarPipelineStage | string;
    error: unknown;
    now?: Date | string | null;
  }): RadarStageIssue {
    const stage = String(input.stage || 'post_delivery_update');
    return buildRadarStageIssue({
      stage,
      operation: 'post_delivery_update',
      source: stage,
      status: 'partial_error',
      code: stage === 'social' ? 'social_lookup_failed' : `${stage}_failed`,
      message: String((input.error as any)?.message || input.error || 'Falha pos-entrega.'),
      reason: String((input.error as any)?.message || input.error || 'Falha pos-entrega.'),
      retryable: true,
      blocksDelivery: false,
      at: input.now || null,
    });
  }

  markRetryable(input: {
    raw?: unknown;
    stage: RadarPipelineStage | string;
    error: unknown;
    now?: Date | string | null;
  }) {
    const raw = normalizeObject(input.raw);
    const issue = this.buildRetryableIssue(input);
    const issues = Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : [];
    const postDeliveryUpdate = this.buildRetryableState({
      previous: raw.postDeliveryUpdate,
      stage: input.stage,
      error: input.error,
      now: input.now,
    });
    return {
      ...raw,
      ...this.jobPipeline.withJobStatus(raw, {
        type: this.jobPipeline.mapStageToJobType(input.stage),
        status: 'partial_error',
        error: input.error,
        now: input.now,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: raw.leadStatus || 'qualified',
        deliveryStatus: raw.deliveryStatus || 'delivered',
        enrichmentStatus: raw.enrichmentStatus || 'partial',
        socialStatus: input.stage === 'social' ? 'error' : raw.socialStatus,
      }),
      postDeliveryUpdate,
      radarStageIssues: [...issues, issue],
    };
  }
}
