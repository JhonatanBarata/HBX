import { Injectable } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import type { RadarPipelineStage, RadarStageIssue } from '../shared/radar-stage.types';

export type RadarPostDeliveryJobType =
  | 'social'
  | 'email'
  | 'whatsapp'
  | 'site'
  | 'score_update'
  | 'post_delivery_update';

export type RadarPostDeliveryJob = {
  type: RadarPostDeliveryJobType;
  status: 'pending' | 'scheduled' | 'completed' | 'retryable' | 'skipped';
  retryable: boolean;
  scheduledAt: string;
};

export type RadarPostDeliveryUpdateState = {
  status: 'scheduled' | 'completed' | 'retryable';
  retryable: boolean;
  scheduledAt?: string;
  completedAt?: string;
  updatedAt: string;
  jobs: RadarPostDeliveryJob[];
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
  buildPendingJobs(input: {
    now?: Date | string | null;
    include?: RadarPostDeliveryJobType[];
  } = {}): RadarPostDeliveryJob[] {
    const scheduledAt = toIsoString(input.now);
    const include: RadarPostDeliveryJobType[] = Array.isArray(input.include) && input.include.length
      ? input.include
      : ['social', 'email', 'whatsapp', 'site', 'score_update', 'post_delivery_update'];
    return include.map((type) => ({
      type,
      status: 'scheduled',
      retryable: true,
      scheduledAt,
    }));
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
      jobs: jobs.map((job: RadarPostDeliveryJob) => ({ ...job, status: 'completed', retryable: false })),
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
    return {
      ...current,
      status: 'retryable',
      retryable: true,
      updatedAt,
      jobs: jobs.map((job: RadarPostDeliveryJob) => (
        job.type === stage || (stage === 'enrichment' && job.type === 'post_delivery_update')
          ? { ...job, status: 'retryable', retryable: true }
          : job
      )),
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
      code: stage === 'social' ? 'social_lookup_failed' : `${stage}_failed`,
      message: String((input.error as any)?.message || input.error || 'Falha pos-entrega.'),
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
