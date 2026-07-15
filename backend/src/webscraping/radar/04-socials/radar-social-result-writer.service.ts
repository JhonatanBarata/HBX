import { Injectable, Optional } from '@nestjs/common';
import { buildRadarLeadEnrichment } from '../../radar-lead-enrichment';
import { RadarEnrichmentJobPipelineService } from '../03-enrichment/radar-enrichment-job-pipeline.service';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import type { SearchExecutionContext } from '../shared/radar-types';
import type { RadarSocialCandidateScore, RadarSocialLookupResult } from './radar-social-types';

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
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

function normalizeSocialCandidates(candidates: RadarSocialCandidateScore[] | undefined, reviewStatus: 'confirmed' | 'possible') {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  return candidates
    .map((candidate) => ({
      network: candidate.network,
      url: String(candidate.url || '').trim() || null,
      status: reviewStatus,
      confidence: safeInteger(candidate.confidence),
      reason: String(candidate.reason || '').trim() || null,
      source: String(candidate.source || '').trim() || null,
      query: String(candidate.query || '').trim() || null,
      layer: candidate.layer || null,
    }))
    .filter((candidate) => {
      if (!candidate.network || !candidate.url) return false;
      const key = `${candidate.network}:${candidate.url.toLowerCase().replace(/\/+$/, '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

@Injectable()
export class RadarSocialResultWriterService {
  constructor(
    private readonly runs: RadarRunRepositoryService,
    @Optional() private readonly jobPipeline?: RadarEnrichmentJobPipelineService,
  ) {}

  private getJobPipeline() {
    return this.jobPipeline || new RadarEnrichmentJobPipelineService();
  }

  async markSearching(
    contextOrLeadId: SearchExecutionContext | string,
    leadIdOrItem: any,
    itemOrRaw: any,
    rawOrQueries: Record<string, any> | string[],
    maybeQueries?: string[],
  ) {
    const legacyCall = typeof contextOrLeadId === 'string';
    const context = legacyCall ? null : contextOrLeadId;
    const leadId = legacyCall ? contextOrLeadId : String(leadIdOrItem || '');
    const item = legacyCall ? leadIdOrItem : itemOrRaw;
    const raw = (legacyCall ? itemOrRaw : rawOrQueries) as Record<string, any>;
    const queries = (legacyCall ? rawOrQueries : maybeQueries) as string[];
    const nextRaw = {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'social_lookup',
        status: 'running',
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: 'qualified',
        deliveryStatus: raw.deliveryStatus || 'deliverable',
        enrichmentStatus: 'partial',
        socialStatus: 'searching',
      }),
      socialStatus: 'searching',
      socialConfidence: safeInteger(raw.socialConfidence),
      socialLookup: {
        status: 'searching',
        queries,
        startedAt: new Date().toISOString(),
      },
    };
    if (context) await this.runs.syncEnrichmentJobSnapshot(context, item, nextRaw, 'social_lookup');
    else await this.runs.updateRunItemRawJson(leadId, nextRaw);
  }

  async markSkipped(context: SearchExecutionContext, leadId: string, item: any, raw: Record<string, any>, reason: string) {
    const nextRaw = {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'social_lookup',
        status: 'skipped',
        reason,
      }),
      socialLookup: {
        ...(raw.socialLookup || {}),
        status: 'skipped',
        reason,
        finishedAt: new Date().toISOString(),
      },
    };
    await this.runs.syncEnrichmentJobSnapshot(context, item, nextRaw, 'social_lookup').catch(() => null);
  }

  async markError(context: SearchExecutionContext, leadId: string, error: unknown) {
    const item = await this.runs.loadRunItem(context, leadId).catch(() => null);
    if (!item) return;
    const raw = parseMaybeJsonObject(item.rawJson);
    const issue = buildRadarStageIssue({
      stage: 'social',
      operation: 'social_lookup',
      source: 'social',
      status: 'error',
      code: 'social_lookup_failed',
      message: String((error as any)?.message || error || 'Falha no enriquecimento social.'),
      reason: String((error as any)?.message || error || 'Falha no enriquecimento social.'),
      retryable: true,
      leadId,
    });
    const nextRaw = {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'social_lookup',
        status: 'partial_error',
        error,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: item.status === 'found' ? 'qualified' : raw.leadStatus,
        deliveryStatus: item.status === 'found' ? raw.deliveryStatus || 'deliverable' : raw.deliveryStatus,
        enrichmentStatus: 'partial',
        socialStatus: 'error',
        providerStatus: raw.providerStatus || 'available',
      }),
      socialStatus: 'error',
      socialLookup: {
        ...(raw.socialLookup || {}),
        status: 'error',
        reason: issue.message,
        issue,
        finishedAt: new Date().toISOString(),
      },
      radarStageIssues: [
        ...(Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : []),
        issue,
      ],
    };
    await this.runs.syncEnrichmentJobSnapshot(context, item, nextRaw, 'social_lookup').catch(() => null);
  }

  async writeResult(context: SearchExecutionContext, leadId: string, item: any, baseLead: any, raw: Record<string, any>, result: RadarSocialLookupResult) {
    const confirmedSocialCandidates = normalizeSocialCandidates(result.acceptedCandidates, 'confirmed');
    const possibleSocialCandidates = normalizeSocialCandidates(result.candidates, 'possible');
    const enrichment = buildRadarLeadEnrichment({
      ...baseLead,
      ...raw,
      instagramUrl: result.instagramUrl,
      facebookUrl: result.facebookUrl,
      socialStatus: result.status,
      socialConfidence: result.confidence,
      now: new Date(),
    });
    const enrichmentPayload = parseMaybeJsonObject(enrichment.enrichmentJson);
    const nextEnrichmentJson = JSON.stringify({
      ...enrichmentPayload,
      signals: {
        ...(enrichmentPayload.signals || {}),
        possibleSocialCandidates,
        confirmedSocialCandidates,
      },
      socialLookup: {
        status: result.status,
        confidence: result.confidence,
        reason: result.reason,
        queries: result.queries,
        possibleSocialCandidates,
        confirmedSocialCandidates,
      },
    });
    const nextInstagramUrl = enrichment.instagramUrl || result.instagramUrl || raw.instagramUrl || null;
    const nextFacebookUrl = enrichment.facebookUrl || result.facebookUrl || raw.facebookUrl || null;
    const socialStatus = result.status === 'found' || result.status === 'partial' || result.status === 'candidate_review' || result.status === 'error'
      ? result.status
      : enrichment.socialStatus === 'unknown' ? 'missing' : enrichment.socialStatus;
    const issue = socialStatus === 'error'
      ? buildRadarStageIssue({
          stage: 'social',
          operation: 'social_lookup',
          source: 'social',
          status: 'error',
          code: 'social_lookup_failed',
          message: result.reason,
          reason: result.reason,
          retryable: true,
          leadId,
        })
      : null;
    const nextRaw = {
      ...raw,
      ...this.getJobPipeline().withJobStatus(raw, {
        type: 'social_lookup',
        status: socialStatus === 'error' ? 'partial_error' : 'completed',
        error: issue?.message || null,
        reason: result.reason,
      }),
      ...buildRadarStageSnapshot({
        ...raw,
        leadStatus: 'qualified',
        deliveryStatus: raw.deliveryStatus || 'deliverable',
        enrichmentStatus: 'partial',
        socialStatus,
      }),
      instagramUrl: nextInstagramUrl,
      facebookUrl: nextFacebookUrl,
      socialStatus,
      socialConfidence: result.confidence,
      recommendedChannel: enrichment.recommendedChannel || raw.recommendedChannel || null,
      opportunityReason: enrichment.opportunityReason || raw.opportunityReason || null,
      enrichmentScore: enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      enrichmentJson: nextEnrichmentJson,
      possibleSocialCandidates,
      confirmedSocialCandidates,
      signals: {
        ...(raw.signals || {}),
        socialStatus,
        instagramUrl: nextInstagramUrl,
        facebookUrl: nextFacebookUrl,
        possibleSocialCandidates,
        confirmedSocialCandidates,
      },
      socialLookup: {
        status: socialStatus,
        confidence: result.confidence,
        queries: result.queries,
        reason: result.reason,
        candidates: result.candidates || [],
        acceptedCandidates: result.acceptedCandidates || [],
        rejectedCandidates: result.rejectedCandidates || [],
        possibleSocialCandidates,
        confirmedSocialCandidates,
        ...(issue ? { issue } : {}),
        finishedAt: new Date().toISOString(),
      },
      ...(issue
        ? { radarStageIssues: [...(Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : []), issue] }
        : {}),
    };
    await this.runs.syncEnrichmentJobSnapshot(context, item, nextRaw, 'social_lookup');
    return nextRaw;
  }
}
