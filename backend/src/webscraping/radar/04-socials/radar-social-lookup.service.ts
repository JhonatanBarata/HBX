import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import { RadarSocialOrchestratorService } from './radar-social-orchestrator.service';
import { RadarSocialResultWriterService } from './radar-social-result-writer.service';
import { RadarSocialJobService } from './radar-social-job.service';
import type { RadarSocialLookupHost, RadarSocialLookupJob, RadarSocialNetwork } from './radar-social-types';

export type { RadarSocialLookupHost } from './radar-social-types';

function normalizePhoneDigits(raw: string | null | undefined) {
  return String(raw || '').replace(/\D/g, '');
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

@Injectable()
export class RadarSocialLookupService {
  private readonly logger = new Logger(RadarSocialLookupService.name);
  private readonly queue: RadarSocialLookupJob[] = [];
  private readonly queuedIds = new Set<string>();
  private active = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: RadarRunRepositoryService,
    @Optional() private readonly orchestrator?: RadarSocialOrchestratorService,
    @Optional() private readonly resultWriter?: RadarSocialResultWriterService,
    @Optional() private readonly jobs?: RadarSocialJobService,
  ) {}

  private getResultWriter() {
    return this.resultWriter || new RadarSocialResultWriterService(this.prisma, this.runs);
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

  private buildRunItemSocialLookupBase(item: any) {
    const raw = parseMaybeJsonObject(item?.rawJson);
    return {
      ...raw,
      placeId: String(item?.placeId || raw.placeId || '').trim(),
      name: String(item?.name || raw.name || '').trim(),
      phone: String(item?.phone || raw.phone || '').trim(),
      phoneDigits: normalizePhoneDigits(item?.phoneDigits || raw.phoneDigits || item?.phone || raw.phone),
      website: String(item?.website || raw.website || '').trim() || null,
      address: String(item?.address || raw.address || '').trim() || null,
      city: String(item?.city || raw.city || '').trim() || null,
      state: String(item?.state || raw.state || '').trim().toUpperCase() || null,
      segment: String(item?.segment || raw.segment || raw.businessCategory || raw.category || '').trim() || null,
    };
  }

  private async syncToVendasLead(
    context: SearchExecutionContext,
    lead: any,
    nextRaw: Record<string, any>,
  ) {
    const instagramUrl = String(nextRaw.instagramUrl || '').trim();
    const facebookUrl = String(nextRaw.facebookUrl || '').trim();
    if (!instagramUrl && !facebookUrl) return;
    const leadDelegate = (this.prisma as any).vendasLead;
    const eventDelegate = (this.prisma as any).vendasLeadTimelineEvent;
    if (!leadDelegate?.findFirst || !eventDelegate?.create) return;
    const phoneDigits = normalizePhoneDigits(lead?.phoneDigits || lead?.phone);
    const name = String(lead?.name || '').trim();
    const city = String(lead?.city || '').trim();
    const where = phoneDigits
      ? {
          companyId: context.companyId,
          phoneNormalized: phoneDigits,
          sourceType: 'webscraping',
        }
      : {
          companyId: context.companyId,
          sourceType: 'webscraping',
          name,
          city,
        };
    const vendasLead = await leadDelegate.findFirst({
      where,
      select: { id: true },
    }).catch(() => null);
    if (!vendasLead?.id) return;
    await eventDelegate.create({
      data: {
        leadId: vendasLead.id,
        eventType: 'radar_enrichment',
        title: 'Redes sociais encontradas pelo Radar',
        description: JSON.stringify({
          instagramUrl: instagramUrl || null,
          facebookUrl: facebookUrl || null,
          socialStatus: nextRaw.socialStatus || 'found',
          socialConfidence: safeInteger(nextRaw.socialConfidence),
          recommendedChannel: nextRaw.recommendedChannel || null,
          opportunityReason: nextRaw.opportunityReason || null,
          enrichmentStatus: 'completed',
          enrichment: nextRaw.enrichmentJson || null,
        }),
        sourceType: 'radar_enrichment',
        resultLabel: nextRaw.recommendedChannel || 'social',
        createdByUserId: context.userId || null,
      },
    }).catch(() => null);
  }

  private extractUrl(result: any, network: RadarSocialNetwork, host: RadarSocialLookupHost) {
    return host.pickRadarSocialUrl(result, network)
      || host.normalizeRadarSocialUrl(network === 'instagram' ? result?.instagramUrl : result?.facebookUrl, network)
      || null;
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
