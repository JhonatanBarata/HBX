import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildRadarLeadEnrichment } from '../../radar-lead-enrichment';
import { buildRadarSocialLookupQueries } from './radar-social-queries';
import { evaluateRadarSocialLookupCandidate } from './radar-social-matching';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';

type RadarSocialNetwork = 'instagram' | 'facebook';

export type RadarSocialLookupHost = {
  searchHbxEngine: (
    input: NormalizedSearchInput,
    existing: any[],
    engineUrl: string | undefined,
    options: { queryText: string; batchLimit: number; timeoutMs: number },
  ) => Promise<{ results: any[] }>;
  normalizeRadarSocialUrl: (value: unknown, network: RadarSocialNetwork) => string | null;
  pickRadarSocialUrl: (item: any, network: RadarSocialNetwork) => string | null;
};

type RadarSocialLookupJob = {
  context: SearchExecutionContext;
  leadId: string;
  input: NormalizedSearchInput;
  engineUrl?: string | null;
  host: RadarSocialLookupHost;
};

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
  ) {}

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
      const normalizedLeadId = String(leadId || '').trim();
      if (!normalizedLeadId || this.queuedIds.has(normalizedLeadId)) continue;
      this.queuedIds.add(normalizedLeadId);
      this.queue.push({
        context,
        leadId: normalizedLeadId,
        input,
        engineUrl: engineUrl || null,
        host,
      });
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
        await this.runForSavedLead(job.context, job.leadId, job.input, job.engineUrl, job.host).catch((error: any) => {
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

  async runForSavedLead(
    context: SearchExecutionContext,
    leadId: string,
    input: NormalizedSearchInput,
    engineUrl: string | null | undefined,
    host: RadarSocialLookupHost,
  ) {
    const item = await this.runs.loadRunItem(context, leadId);
    if (!item || item.status !== 'found' || input.targetType !== 'pj') return { status: 'skipped', reason: 'item_indisponivel' };
    const raw = parseMaybeJsonObject(item.rawJson);
    const baseLead = this.buildRunItemSocialLookupBase(item);
    const rawInstagramUrl = String(raw.instagramUrl || raw.signals?.instagramUrl || '').trim() || null;
    const rawFacebookUrl = String(raw.facebookUrl || raw.signals?.facebookUrl || '').trim() || null;
    const existingInstagram = host.normalizeRadarSocialUrl(rawInstagramUrl, 'instagram');
    const existingFacebook = host.normalizeRadarSocialUrl(rawFacebookUrl, 'facebook');
    if (existingInstagram && existingFacebook) return { status: 'skipped', reason: 'social_ja_presente' };

    const queries = buildRadarSocialLookupQueries(baseLead.name, baseLead.city || input.city);
    if (!queries.length) return { status: 'skipped', reason: 'identidade_incompleta' };

    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
      socialStatus: 'searching',
      socialConfidence: safeInteger(raw.socialConfidence),
      socialLookup: {
        status: 'searching',
        queries: queries.map((entry) => entry.query),
        startedAt: new Date().toISOString(),
      },
    });

    const attemptedQueries: string[] = [];
    const rejectedReasons: string[] = [];
    let engineFailed = false;
    let weakCandidate = false;
    let bestInstagram = existingInstagram || null;
    let bestFacebook = existingFacebook || null;
    let bestConfidence = Math.max(0, safeInteger(raw.socialConfidence));

    for (const entry of queries) {
      attemptedQueries.push(entry.query);
      try {
        const lookupInput: NormalizedSearchInput = {
          ...input,
          city: baseLead.city || input.city,
          state: baseLead.state || input.state,
          segment: baseLead.segment || input.segment,
          targetType: 'pj',
          quantity: 5,
          requiredChannels: [entry.network],
          channelMatchMode: 'any_required',
        };
        const output = await host.searchHbxEngine(
          lookupInput,
          [],
          engineUrl || undefined,
          {
            queryText: entry.query,
            batchLimit: 5,
            timeoutMs: this.getTimeoutMs(),
          },
        );
        for (const result of output.results || []) {
          const url = this.extractUrl(result, entry.network, host);
          const evaluated = evaluateRadarSocialLookupCandidate(
            baseLead,
            result,
            url,
            entry.network,
            host.normalizeRadarSocialUrl,
          );
          if (evaluated.accepted && evaluated.url) {
            if (entry.network === 'instagram') bestInstagram = evaluated.url;
            else bestFacebook = evaluated.url;
            bestConfidence = Math.max(bestConfidence, evaluated.confidence);
            break;
          }
          if (evaluated.confidence > 0) weakCandidate = true;
          rejectedReasons.push(`${entry.network}:${evaluated.reason}`);
        }
      } catch (error: any) {
        engineFailed = true;
        rejectedReasons.push(`${entry.network}:erro_motor:${String(error?.message || error).slice(0, 120)}`);
      }
    }

    const finalStatus = bestInstagram || bestFacebook
      ? 'found'
      : weakCandidate || engineFailed
        ? 'weak'
        : 'missing';
    const finalConfidence = finalStatus === 'found'
      ? Math.max(80, bestConfidence)
      : finalStatus === 'weak'
        ? Math.max(35, Math.min(69, bestConfidence || 35))
        : 0;
    const reason = bestInstagram || bestFacebook
      ? 'perfil_social_confiavel'
      : rejectedReasons.slice(0, 4).join('; ') || 'sem_resultado_social_confiavel';
    const enrichment = buildRadarLeadEnrichment({
      ...baseLead,
      ...raw,
      instagramUrl: bestInstagram,
      facebookUrl: bestFacebook,
      socialStatus: finalStatus,
      socialConfidence: finalConfidence,
      now: new Date(),
    });
    const nextInstagramUrl = enrichment.instagramUrl || bestInstagram || rawInstagramUrl || null;
    const nextFacebookUrl = enrichment.facebookUrl || bestFacebook || rawFacebookUrl || null;
    const nextRaw = {
      ...raw,
      instagramUrl: nextInstagramUrl,
      facebookUrl: nextFacebookUrl,
      socialStatus: enrichment.socialStatus,
      socialConfidence: enrichment.socialConfidence,
      recommendedChannel: enrichment.recommendedChannel || raw.recommendedChannel || null,
      opportunityReason: enrichment.opportunityReason || raw.opportunityReason || null,
      enrichmentScore: enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      enrichmentJson: enrichment.enrichmentJson,
      signals: {
        ...(raw.signals || {}),
        socialStatus: enrichment.socialStatus,
        instagramUrl: nextInstagramUrl,
        facebookUrl: nextFacebookUrl,
      },
      socialLookup: {
        status: enrichment.socialStatus,
        confidence: enrichment.socialConfidence,
        queries: attemptedQueries,
        reason,
        finishedAt: new Date().toISOString(),
      },
    };
    await this.runs.updateRunItemRawJson(leadId, nextRaw);
    await this.syncToVendasLead(context, baseLead, nextRaw);
    this.logger.log(`[radar-social] lead=${leadId} status=${enrichment.socialStatus} confidence=${enrichment.socialConfidence} queries=${attemptedQueries.join(' | ')} reason=${reason}`);
    return {
      status: enrichment.socialStatus,
      instagramUrl: nextRaw.instagramUrl,
      facebookUrl: nextRaw.facebookUrl,
      confidence: enrichment.socialConfidence,
      queries: attemptedQueries,
      reason,
    };
  }
}
