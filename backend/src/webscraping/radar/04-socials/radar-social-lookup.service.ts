import { Injectable, Logger, Optional } from '@nestjs/common';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import { RadarSocialOrchestratorService } from './radar-social-orchestrator.service';
import { RadarSocialResultWriterService } from './radar-social-result-writer.service';
import { RadarSocialJobService } from './radar-social-job.service';
import type { RadarSocialLookupHost, RadarSocialLookupJob } from './radar-social-types';

export type { RadarSocialLookupHost } from './radar-social-types';

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

@Injectable()
export class RadarSocialLookupService {
  private readonly logger = new Logger(RadarSocialLookupService.name);
  private readonly queue: RadarSocialLookupJob[] = [];
  private readonly queuedIds = new Set<string>();
  private active = false;

  constructor(
    private readonly runs: RadarRunRepositoryService,
    @Optional() private readonly orchestrator?: RadarSocialOrchestratorService,
    @Optional() private readonly resultWriter?: RadarSocialResultWriterService,
    @Optional() private readonly jobs?: RadarSocialJobService,
  ) {}

  private getResultWriter() {
    return this.resultWriter || new RadarSocialResultWriterService(this.runs);
  }

  private getOrchestrator() {
    return this.orchestrator || new RadarSocialOrchestratorService(this.runs, this.getResultWriter());
  }

  private getJobs() {
    return this.jobs || new RadarSocialJobService();
  }

  private getMaxPerBatch() {
    return parsePositiveIntegerEnv('HBX_RADAR_SOCIAL_LOOKUP_MAX_PER_BATCH', 100);
  }

  private getTimeoutMs() {
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_RADAR_SOCIAL_LOOKUP_TIMEOUT_MS', 15_000));
  }

  enqueue(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
    leadIds: string[] = [],
    engineUrl: string | null | undefined,
    host: RadarSocialLookupHost,
  ) {
    if (!Array.isArray(leadIds) || !leadIds.length || input.targetType !== 'pj') return;
    const max = this.getMaxPerBatch();
    let queued = 0;
    for (const leadId of leadIds) {
      const normalizedLeadId = this.getJobs().key(leadId);
      if (!normalizedLeadId || this.queuedIds.has(normalizedLeadId)) continue;
      const job = this.getJobs().buildJob({
        context,
        leadId: normalizedLeadId,
        normalizedInput: input,
        engineUrl,
        host,
      });
      if (!job) continue;
      this.queuedIds.add(normalizedLeadId);
      this.queue.push(job);
      queued += 1;
      if (queued >= max) break;
    }
    if (!queued) return;
    this.logger.log(`[radar-social] enfileirados=${queued} run=${runId}`);
    setTimeout(() => {
      void this.drain();
    }, 0);
  }

  async drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!job) continue;
        this.queuedIds.delete(job.leadId);
        await this.runForSavedLead(job.context, job.leadId, job.input, job.engineUrl, job.host).catch(async (error: any) => {
          await this.markSocialLookupError(job, error);
          this.logger.warn(`[radar-social] lookup ignorado lead=${job.leadId}: ${String(error?.message || error)}`);
        });
      }
    } finally {
      this.active = false;
      if (this.queue.length) {
        setTimeout(() => {
          void this.drain();
        }, 0);
      }
    }
  }

  private async markSocialLookupError(job: RadarSocialLookupJob, error: unknown) {
    await this.getResultWriter().markError(job.context, job.leadId, error);
  }

  async runForSavedLead(
    context: SearchExecutionContext,
    leadId: string,
    input: NormalizedSearchInput,
    engineUrl: string | null | undefined,
    host: RadarSocialLookupHost,
  ) {
    return this.getOrchestrator().runForSavedLead({
      context,
      leadId,
      normalizedInput: input,
      engineUrl,
      host,
      timeoutMs: this.getTimeoutMs(),
      writer: this.getResultWriter(),
    });
  }
}
