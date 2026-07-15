import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import type { RadarPipelineStage } from '../shared/radar-stage.types';
import {
  RadarPostDeliveryUpdateService,
  type RadarPostDeliveryJob,
} from './radar-post-delivery-update.service';

function normalizeObject(raw: unknown): Record<string, any> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
}

function toIsoString(value?: Date | string | null) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value || '').trim();
  return raw || new Date().toISOString();
}

@Injectable()
export class RadarDeliveryOrchestratorService {
  constructor(
    @Optional() private readonly postDeliveryUpdate?: RadarPostDeliveryUpdateService,
  ) {}

  private getPostDeliveryUpdate() {
    return this.postDeliveryUpdate || new RadarPostDeliveryUpdateService();
  }

  buildDeliveredState(input: {
    lead?: any;
    imported?: any;
    vendasLeadId?: number | string | null;
    metadata?: unknown;
    enrichment?: unknown;
    now?: Date | string | null;
    jobs?: RadarPostDeliveryJob[];
  }) {
    const now = toIsoString(input.now);
    const metadata = normalizeObject(input.metadata);
    const enrichment = normalizeObject(input.enrichment);
    const raw = {
      ...metadata,
      ...enrichment,
      ...(input.lead || {}),
    };
    const persistedJobs = Array.isArray(raw.asyncEnrichmentJobs)
      ? raw.asyncEnrichmentJobs
      : Array.isArray(raw.postDeliveryJobs)
        ? raw.postDeliveryJobs
        : [];
    const pendingJobs = this.getPostDeliveryUpdate().buildPendingJobs({ now });
    const persistedByType = new Map(
      persistedJobs
        .filter((job: any) => job && String(job.type || '').trim())
        .map((job: any) => [String(job.type), job]),
    );
    const jobs = Array.isArray(input.jobs) && input.jobs.length
      ? input.jobs
      : [
          ...pendingJobs.map((job) => persistedByType.get(String(job.type)) || job),
          ...persistedJobs.filter((job: any) => !pendingJobs.some((pending) => String(pending.type) === String(job?.type))),
        ];
    const postDeliveryUpdate = this.getPostDeliveryUpdate().buildScheduledState({ now, jobs });
    const snapshot = buildRadarStageSnapshot({
      ...raw,
      leadStatus: 'qualified',
      deliveryStatus: 'delivered',
      enrichmentStatus: raw.enrichmentStatus || 'partial',
    });
    const vendasLeadId = input.vendasLeadId ?? input.imported?.leads?.[0]?.id ?? null;
    const patch = {
      ...snapshot,
      deliveredAt: now,
      deliveryDeliveredAt: now,
      vendasLeadId,
      asyncEnrichmentJobs: jobs,
      postDeliveryJobs: jobs,
      postDeliveryUpdate,
    };
    return {
      snapshot,
      jobs,
      postDeliveryUpdate,
      metadataPatch: patch,
      enrichmentPatch: patch,
    };
  }

  markPostDeliveryFailure(input: {
    metadata?: unknown;
    enrichment?: unknown;
    stage: RadarPipelineStage | string;
    error: unknown;
    now?: Date | string | null;
  }) {
    const metadata = this.getPostDeliveryUpdate().markRetryable({
      raw: input.metadata,
      stage: input.stage,
      error: input.error,
      now: input.now,
    });
    const enrichment = this.getPostDeliveryUpdate().markRetryable({
      raw: input.enrichment,
      stage: input.stage,
      error: input.error,
      now: input.now,
    });
    return { metadata, enrichment };
  }
}
