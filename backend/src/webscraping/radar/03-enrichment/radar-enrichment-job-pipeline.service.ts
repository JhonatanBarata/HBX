import { Injectable } from '@nestjs/common';
import type { RadarPipelineStage } from '../shared/radar-stage.types';

export type RadarAsyncEnrichmentJobType =
  | 'radar_web_enrichment'
  | 'social_lookup'
  | 'website_crawl_light'
  | 'email_enrichment'
  | 'whatsapp_check'
  | 'cnpj_enrichment'
  | 'opportunity_signal'
  | 'post_delivery_update';

export type RadarAsyncEnrichmentJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial_error'
  | 'failed'
  | 'skipped';

export type RadarAsyncEnrichmentJob = {
  type: RadarAsyncEnrichmentJobType;
  status: RadarAsyncEnrichmentJobStatus;
  retryable: boolean;
  traceId: string;
  stage: RadarPipelineStage;
  source: string;
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt: string;
  lastError?: string | null;
  reason?: string | null;
  attempts?: number;
};

const DEFAULT_POST_DELIVERY_JOB_TYPES: RadarAsyncEnrichmentJobType[] = [
  'radar_web_enrichment',
  'social_lookup',
  'email_enrichment',
  'whatsapp_check',
  'website_crawl_light',
  'cnpj_enrichment',
  'opportunity_signal',
  'post_delivery_update',
];

function toIsoString(value?: Date | string | null) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value || '').trim();
  return raw || new Date().toISOString();
}

function normalizeObject(raw: unknown): Record<string, any> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
}

function errorMessage(error: unknown) {
  return String((error as any)?.message || error || '').slice(0, 500) || null;
}

function makeTraceId(type: string, now: string) {
  return `radar:${type}:${now.replace(/[^0-9]/g, '').slice(0, 17)}`;
}

@Injectable()
export class RadarEnrichmentJobPipelineService {
  defaultPostDeliveryJobTypes() {
    return [...DEFAULT_POST_DELIVERY_JOB_TYPES];
  }

  normalizeJobType(type: string): RadarAsyncEnrichmentJobType {
    const normalized = String(type || '').trim().toLowerCase();
    const aliases: Record<string, RadarAsyncEnrichmentJobType> = {
      social: 'social_lookup',
      radar_web_enrichment: 'radar_web_enrichment',
      web_enrichment: 'radar_web_enrichment',
      email: 'email_enrichment',
      whatsapp: 'whatsapp_check',
      site: 'website_crawl_light',
      score_update: 'opportunity_signal',
      cnpj_public: 'cnpj_enrichment',
      cnpj: 'cnpj_enrichment',
    };
    const mapped = aliases[normalized] || normalized;
    if (this.isJobType(mapped)) return mapped;
    return 'opportunity_signal';
  }

  stageForJob(type: string): RadarPipelineStage {
    const jobType = this.normalizeJobType(type);
    const stages: Record<RadarAsyncEnrichmentJobType, RadarPipelineStage> = {
      social_lookup: 'social',
      radar_web_enrichment: 'enrichment',
      website_crawl_light: 'site',
      email_enrichment: 'email',
      whatsapp_check: 'whatsapp',
      cnpj_enrichment: 'enrichment',
      opportunity_signal: 'enrichment',
      post_delivery_update: 'post_delivery_update',
    };
    return stages[jobType];
  }

  sourceForJob(type: string) {
    const jobType = this.normalizeJobType(type);
    const sources: Record<RadarAsyncEnrichmentJobType, string> = {
      social_lookup: 'social_lookup',
      radar_web_enrichment: 'radar_web_enrichment',
      website_crawl_light: 'website_crawl_light',
      email_enrichment: 'email_enrichment',
      whatsapp_check: 'whatsapp_check',
      cnpj_enrichment: 'cnpj_public',
      opportunity_signal: 'opportunity_signal',
      post_delivery_update: 'post_delivery_update',
    };
    return sources[jobType];
  }

  mapStageToJobType(stage: RadarPipelineStage | string): RadarAsyncEnrichmentJobType {
    const normalized = String(stage || '').trim().toLowerCase();
    const mapping: Record<string, RadarAsyncEnrichmentJobType> = {
      social: 'social_lookup',
      radar_web_enrichment: 'radar_web_enrichment',
      email: 'email_enrichment',
      whatsapp: 'whatsapp_check',
      site: 'website_crawl_light',
      enrichment: 'opportunity_signal',
      post_delivery_update: 'post_delivery_update',
    };
    return mapping[normalized] || this.normalizeJobType(normalized);
  }

  buildJob(input: {
    type: RadarAsyncEnrichmentJobType | string;
    status?: RadarAsyncEnrichmentJobStatus;
    retryable?: boolean;
    traceId?: string | null;
    now?: Date | string | null;
    lastError?: string | null;
    reason?: string | null;
    attempts?: number;
  }): RadarAsyncEnrichmentJob {
    const now = toIsoString(input.now);
    const type = this.normalizeJobType(input.type);
    const status = input.status || 'queued';
    return {
      type,
      status,
      retryable: input.retryable ?? this.defaultRetryable(status),
      traceId: String(input.traceId || '').trim() || makeTraceId(type, now),
      stage: this.stageForJob(type),
      source: this.sourceForJob(type),
      queuedAt: status === 'queued' ? now : null,
      startedAt: status === 'running' ? now : null,
      finishedAt: ['completed', 'partial_error', 'failed', 'skipped'].includes(status) ? now : null,
      updatedAt: now,
      lastError: input.lastError || null,
      reason: input.reason || null,
      attempts: Math.max(0, Math.trunc(Number(input.attempts || 0) || 0)),
    };
  }

  buildJobs(input: {
    types?: Array<RadarAsyncEnrichmentJobType | string>;
    status?: RadarAsyncEnrichmentJobStatus;
    now?: Date | string | null;
  } = {}) {
    const types = Array.isArray(input.types) && input.types.length
      ? input.types
      : this.defaultPostDeliveryJobTypes();
    return types.map((type) => this.buildJob({ type, status: input.status || 'queued', now: input.now }));
  }

  markJob(input: {
    jobs?: unknown;
    type: RadarAsyncEnrichmentJobType | string;
    status: RadarAsyncEnrichmentJobStatus;
    now?: Date | string | null;
    error?: unknown;
    reason?: string | null;
    traceId?: string | null;
  }) {
    const now = toIsoString(input.now);
    const type = this.normalizeJobType(input.type);
    const jobs = this.normalizeJobs(input.jobs);
    const existing = jobs.find((job) => job.type === type);
    const next = {
      ...(existing || this.buildJob({ type, now })),
      type,
      status: input.status,
      retryable: this.defaultRetryable(input.status),
      traceId: String(input.traceId || existing?.traceId || '').trim() || makeTraceId(type, now),
      stage: this.stageForJob(type),
      source: this.sourceForJob(type),
      updatedAt: now,
      lastError: errorMessage(input.error) || existing?.lastError || null,
      reason: input.reason || existing?.reason || null,
      attempts: (existing?.attempts || 0) + (input.status === 'running' ? 1 : 0),
      ...(input.status === 'queued' ? { queuedAt: existing?.queuedAt || now } : {}),
      ...(input.status === 'running' ? { startedAt: now, finishedAt: null } : {}),
      ...(['completed', 'partial_error', 'failed', 'skipped'].includes(input.status) ? { finishedAt: now } : {}),
    };
    return [...jobs.filter((job) => job.type !== type), next];
  }

  withJobStatus(raw: unknown, input: {
    type: RadarAsyncEnrichmentJobType | string;
    status: RadarAsyncEnrichmentJobStatus;
    now?: Date | string | null;
    error?: unknown;
    reason?: string | null;
    traceId?: string | null;
  }) {
    const payload = normalizeObject(raw);
    const jobs = this.markJob({
      jobs: payload.asyncEnrichmentJobs || payload.postDeliveryJobs,
      ...input,
    });
    return {
      ...payload,
      asyncEnrichmentJobs: jobs,
      postDeliveryJobs: jobs,
      enrichmentJobSummary: this.summarize(jobs),
    };
  }

  summarize(jobs: unknown) {
    const normalized = this.normalizeJobs(jobs);
    const counts = normalized.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<RadarAsyncEnrichmentJobStatus, number>);
    return {
      total: normalized.length,
      queued: counts.queued || 0,
      running: counts.running || 0,
      completed: counts.completed || 0,
      partialError: counts.partial_error || 0,
      failed: counts.failed || 0,
      skipped: counts.skipped || 0,
      retryable: normalized.filter((job) => job.retryable).length,
    };
  }

  normalizeJobs(value: unknown): RadarAsyncEnrichmentJob[] {
    const jobs = Array.isArray(value) ? value : [];
    return jobs.map((job) => {
      const raw = normalizeObject(job);
      return this.buildJob({
        type: this.normalizeJobType(String(raw.type || raw.job || raw.stage || 'opportunity_signal')),
        status: this.normalizeStatus(raw.status),
        retryable: raw.retryable == null ? undefined : Boolean(raw.retryable),
        traceId: raw.traceId || null,
        now: raw.updatedAt || raw.queuedAt || raw.startedAt || raw.finishedAt || null,
        lastError: raw.lastError || null,
        reason: raw.reason || null,
        attempts: raw.attempts,
      });
    });
  }

  private normalizeStatus(status: unknown): RadarAsyncEnrichmentJobStatus {
    const normalized = String(status || '').trim().toLowerCase();
    if (['queued', 'running', 'completed', 'partial_error', 'failed', 'skipped'].includes(normalized)) {
      return normalized as RadarAsyncEnrichmentJobStatus;
    }
    if (normalized === 'scheduled' || normalized === 'pending') return 'queued';
    if (normalized === 'retryable' || normalized === 'error') return 'partial_error';
    return 'queued';
  }

  private defaultRetryable(status: RadarAsyncEnrichmentJobStatus) {
    return status === 'queued' || status === 'running' || status === 'partial_error' || status === 'failed';
  }

  private isJobType(value: string): value is RadarAsyncEnrichmentJobType {
    return [
      'social_lookup',
      'radar_web_enrichment',
      'website_crawl_light',
      'email_enrichment',
      'whatsapp_check',
      'cnpj_enrichment',
      'opportunity_signal',
      'post_delivery_update',
    ].includes(value);
  }
}
