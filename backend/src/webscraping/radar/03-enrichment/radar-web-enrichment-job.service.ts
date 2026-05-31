import { Injectable, Logger, Optional } from '@nestjs/common';
import { buildRadarLeadEnrichment } from '../../radar-lead-enrichment';
import type { HbxEngineSearchOutput, WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import { RadarEnrichmentJobPipelineService } from './radar-enrichment-job-pipeline.service';
import { RadarWebEnrichmentService, type RadarWebEnrichmentHost } from './radar-web-enrichment.service';
import { hasPoorRadarWebEnrichmentFields } from './radar-web-enrichment-priority';

export type RadarWebEnrichmentJobHost = {
  searchHbxEngine: (
    input: NormalizedSearchInput,
    existing: string[],
    engineUrl: string | undefined,
    options: { queryText?: string; batchLimit?: number; timeoutMs?: number },
  ) => Promise<HbxEngineSearchOutput>;
  getRadarWebsiteCrawlSource?: RadarWebEnrichmentHost['getRadarWebsiteCrawlSource'];
  logger?: { warn?: (message: string) => void };
  fetcher?: typeof fetch;
};

type RadarWebEnrichmentJob = {
  context: SearchExecutionContext;
  leadId: string;
  input: NormalizedSearchInput;
  engineUrl?: string | null;
  host: RadarWebEnrichmentJobHost;
};

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizePhoneDigits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function compact(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class RadarWebEnrichmentJobService {
  private readonly logger = new Logger(RadarWebEnrichmentJobService.name);
  private readonly queue: RadarWebEnrichmentJob[] = [];
  private readonly queuedIds = new Set<string>();
  private active = false;

  constructor(
    private readonly runs: RadarRunRepositoryService,
    @Optional() private readonly webEnrichment?: RadarWebEnrichmentService,
    @Optional() private readonly jobPipeline?: RadarEnrichmentJobPipelineService,
  ) {}

  private getWebEnrichment() {
    return this.webEnrichment || new RadarWebEnrichmentService();
  }

  private getJobPipeline() {
    return this.jobPipeline || new RadarEnrichmentJobPipelineService();
  }

  private getMaxPerBatch() {
    return parsePositiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_JOB_MAX_PER_BATCH', 40);
  }

  private getTimeoutMs() {
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_RADAR_WEB_ENRICHMENT_JOB_TIMEOUT_MS', 12_000));
  }

  enqueue(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
    leadIds: string[] = [],
    engineUrl: string | null | undefined,
    host: RadarWebEnrichmentJobHost,
  ) {
    if (!Array.isArray(leadIds) || !leadIds.length || input.targetType !== 'pj') return;
    const max = this.getMaxPerBatch();
    let queued = 0;
    for (const leadId of leadIds) {
      const normalizedLeadId = compact(leadId);
      if (!normalizedLeadId || this.queuedIds.has(normalizedLeadId)) continue;
      this.queuedIds.add(normalizedLeadId);
      this.queue.push({ context, leadId: normalizedLeadId, input, engineUrl, host });
      queued += 1;
      if (queued >= max) break;
    }
    if (!queued) return;
    this.logger.log(`[radar-web-enrichment] enfileirados=${queued} run=${runId}`);
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
          await this.markError(job.context, job.leadId, error);
          this.logger.warn(`[radar-web-enrichment] ignorado lead=${job.leadId}: ${String(error?.message || error)}`);
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

  async runForSavedLead(
    context: SearchExecutionContext,
    leadId: string,
    input: NormalizedSearchInput,
    engineUrl: string | null | undefined,
    host: RadarWebEnrichmentJobHost,
  ) {
    const item = await this.runs.loadRunItem(context, leadId);
    if (!item || item.status !== 'found' || input.targetType !== 'pj') {
      return { status: 'skipped', reason: 'item_indisponivel' };
    }
    const raw = parseMaybeJsonObject(item.rawJson);
    const baseLead = this.buildRunItemLead(item, raw, input);
    if (!hasPoorRadarWebEnrichmentFields(baseLead as any)) {
      await this.markSkipped(leadId, raw, 'card_ja_tem_sinais_suficientes');
      return { status: 'skipped', reason: 'card_ja_tem_sinais_suficientes' };
    }

    await this.markRunning(leadId, raw);
    const result = await this.getWebEnrichment().run({
      normalized: input,
      currentResults: [baseLead],
      host: {
        logger: host.logger,
        fetcher: host.fetcher,
        searchHbxEngine: host.searchHbxEngine,
        engineUrl: engineUrl || undefined,
        timeoutMs: this.getTimeoutMs(),
        getRadarWebsiteCrawlSource: host.getRadarWebsiteCrawlSource,
      },
    });

    if (result.results?.length) {
      const nextRaw = this.mergeResultRaw(raw, baseLead, result.results[0], result.reason || null);
      await this.runs.updateRunItemRawJson(leadId, nextRaw);
      return result;
    }

    const status = result.status === 'partial_error' ? 'partial_error' : 'skipped';
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'radar_web_enrichment',
        status,
        reason: result.reason || null,
        error: result.issue?.message || null,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: raw.leadStatus || 'qualified',
        deliveryStatus: raw.deliveryStatus || 'deliverable',
        enrichmentStatus: raw.enrichmentStatus || 'partial',
        socialStatus: raw.socialStatus || 'pending',
      }),
      radarWebEnrichment: {
        status,
        reason: result.reason || 'sem_dados_novos',
        finishedAt: new Date().toISOString(),
      },
      ...(result.issue ? {
        radarStageIssues: [
          ...(Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : []),
          result.issue,
        ],
      } : {}),
    });
    return result;
  }

  private buildRunItemLead(item: any, raw: Record<string, any>, input: NormalizedSearchInput): WebscrapingContactResult {
    return {
      ...raw,
      placeId: compact(item.placeId || raw.placeId || `radar:${item.id}`),
      name: compact(item.name || raw.name),
      phone: compact(item.phone || raw.phone),
      phoneDigits: normalizePhoneDigits(item.phoneDigits || raw.phoneDigits || item.phone || raw.phone),
      rating: raw.rating == null ? null : Number(raw.rating),
      reviews: raw.reviews == null ? null : safeInteger(raw.reviews),
      website: compact(item.website || raw.website) || null,
      address: compact(item.address || raw.address) || null,
      city: compact(item.city || raw.city || input.city) || null,
      state: compact(item.state || raw.state || input.state).toUpperCase() || null,
      segment: compact(item.segment || raw.segment || input.segment) || null,
      instagramUrl: compact(raw.instagramUrl) || null,
      facebookUrl: compact(raw.facebookUrl) || null,
      email: compact(raw.email) || null,
      socialStatus: compact(raw.socialStatus) || null,
      socialConfidence: raw.socialConfidence == null ? null : safeInteger(raw.socialConfidence),
      source: compact(item.source || raw.source || 'radar_database'),
      score: safeInteger(raw.score || raw.enrichmentScore),
    } as unknown as WebscrapingContactResult;
  }

  private mergeResultRaw(
    raw: Record<string, any>,
    baseLead: WebscrapingContactResult,
    result: WebscrapingContactResult,
    reason: string | null,
  ) {
    const merged = {
      ...baseLead,
      ...raw,
      website: compact(raw.website || result.website || baseLead.website) || null,
      instagramUrl: compact(raw.instagramUrl || result.instagramUrl || baseLead.instagramUrl) || null,
      facebookUrl: compact(raw.facebookUrl || result.facebookUrl || baseLead.facebookUrl) || null,
      email: compact(raw.email || (result as any).email || (baseLead as any).email) || null,
      emailStatus: compact(raw.emailStatus || (result as any).emailStatus) || null,
      emailSource: compact(raw.emailSource || (result as any).emailSource) || null,
      socialStatus: compact((result as any).socialStatus || raw.socialStatus) || null,
      socialConfidence: safeInteger((result as any).socialConfidence || raw.socialConfidence),
    };
    const enrichment = buildRadarLeadEnrichment({
      ...merged,
      now: new Date(),
    });
    const socialStatus = (merged.instagramUrl || merged.facebookUrl
      ? compact(merged.socialStatus) || enrichment.socialStatus || 'partial'
      : compact(raw.socialStatus) || 'pending') as any;
    return {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'radar_web_enrichment',
        status: 'completed',
        reason,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: raw.leadStatus || 'qualified',
        deliveryStatus: raw.deliveryStatus || 'deliverable',
        enrichmentStatus: 'partial',
        socialStatus,
      }),
      website: merged.website,
      instagramUrl: merged.instagramUrl,
      facebookUrl: merged.facebookUrl,
      email: merged.email,
      emailStatus: enrichment.emailStatus || merged.emailStatus,
      emailSource: enrichment.emailSource || merged.emailSource,
      emailConfidence: enrichment.emailConfidence,
      socialStatus,
      socialConfidence: Math.max(safeInteger(merged.socialConfidence), enrichment.socialConfidence),
      recommendedChannel: enrichment.recommendedChannel || raw.recommendedChannel || null,
      opportunityReason: enrichment.opportunityReason || raw.opportunityReason || null,
      enrichmentScore: enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      enrichmentJson: enrichment.enrichmentJson,
      evidenceJson: (result as any).evidenceJson || raw.evidenceJson || null,
      radarWebEnrichment: {
        status: 'completed',
        reason,
        sourceEngine: (result as any).sourceEngine || result.source || 'radar_web_enrichment',
        finishedAt: new Date().toISOString(),
      },
      signals: {
        ...(raw.signals || {}),
        website: merged.website,
        instagramUrl: merged.instagramUrl,
        facebookUrl: merged.facebookUrl,
        emailCandidate: merged.email,
        socialStatus,
      },
    };
  }

  private async markRunning(leadId: string, raw: Record<string, any>) {
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'radar_web_enrichment',
        status: 'running',
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: raw.leadStatus || 'qualified',
        deliveryStatus: raw.deliveryStatus || 'deliverable',
        enrichmentStatus: raw.enrichmentStatus || 'partial',
        socialStatus: raw.socialStatus || 'pending',
      }),
      radarWebEnrichment: {
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    });
  }

  private async markSkipped(leadId: string, raw: Record<string, any>, reason: string) {
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'radar_web_enrichment',
        status: 'skipped',
        reason,
      }),
      radarWebEnrichment: {
        status: 'skipped',
        reason,
        finishedAt: new Date().toISOString(),
      },
    }).catch(() => null);
  }

  private async markError(context: SearchExecutionContext, leadId: string, error: unknown) {
    const item = await this.runs.loadRunItem(context, leadId).catch(() => null);
    if (!item) return;
    const raw = parseMaybeJsonObject(item.rawJson);
    const issue = buildRadarStageIssue({
      stage: 'enrichment',
      operation: 'radar_web_enrichment',
      source: 'radar_web_enrichment',
      status: 'partial_error',
      code: 'radar_web_enrichment_failed',
      message: String((error as any)?.message || error || 'Falha no enriquecimento web.'),
      reason: String((error as any)?.message || error || 'Falha no enriquecimento web.'),
      retryable: true,
      blocksDelivery: false,
      leadId,
    });
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'radar_web_enrichment',
        status: 'partial_error',
        error,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: item.status === 'found' ? 'qualified' : raw.leadStatus,
        deliveryStatus: item.status === 'found' ? raw.deliveryStatus || 'deliverable' : raw.deliveryStatus,
        enrichmentStatus: 'partial',
        socialStatus: raw.socialStatus || 'pending',
        providerStatus: raw.providerStatus || 'available',
      }),
      radarWebEnrichment: {
        ...(raw.radarWebEnrichment || {}),
        status: 'partial_error',
        reason: issue.message,
        issue,
        finishedAt: new Date().toISOString(),
      },
      radarStageIssues: [
        ...(Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : []),
        issue,
      ],
    }).catch(() => null);
  }
}
