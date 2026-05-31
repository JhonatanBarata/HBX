import { Injectable } from '@nestjs/common';
import { buildRadarLeadEnrichment } from '../../radar-lead-enrichment';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { buildRadarStageSnapshot } from '../shared/radar-stage-result';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import type { SearchExecutionContext } from '../shared/radar-types';
import type { RadarSocialLookupResult } from './radar-social-types';

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

@Injectable()
export class RadarSocialResultWriterService {
  constructor(
    private readonly runs: RadarRunRepositoryService,
  ) {}

  async markSearching(leadId: string, item: any, raw: Record<string, any>, queries: string[]) {
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
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
    });
  }

  async markError(context: SearchExecutionContext, leadId: string, error: unknown) {
    const item = await this.runs.loadRunItem(context, leadId).catch(() => null);
    if (!item) return;
    const raw = parseMaybeJsonObject(item.rawJson);
    const issue = buildRadarStageIssue({
      stage: 'social',
      code: 'social_lookup_failed',
      message: String((error as any)?.message || error || 'Falha no enriquecimento social.'),
      retryable: true,
    });
    await this.runs.updateRunItemRawJson(leadId, {
      ...raw,
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
    }).catch(() => null);
  }

  async writeResult(context: SearchExecutionContext, leadId: string, item: any, baseLead: any, raw: Record<string, any>, result: RadarSocialLookupResult) {
    const enrichment = buildRadarLeadEnrichment({
      ...baseLead,
      ...raw,
      instagramUrl: result.instagramUrl,
      facebookUrl: result.facebookUrl,
      socialStatus: result.status,
      socialConfidence: result.confidence,
      now: new Date(),
    });
    const nextInstagramUrl = enrichment.instagramUrl || result.instagramUrl || raw.instagramUrl || null;
    const nextFacebookUrl = enrichment.facebookUrl || result.facebookUrl || raw.facebookUrl || null;
    const socialStatus = result.status === 'found' || result.status === 'partial' || result.status === 'candidate_review' || result.status === 'error'
      ? result.status
      : enrichment.socialStatus === 'unknown' ? 'missing' : enrichment.socialStatus;
    const issue = socialStatus === 'error'
      ? buildRadarStageIssue({
          stage: 'social',
          code: 'social_lookup_failed',
          message: result.reason,
          retryable: true,
        })
      : null;
    const nextRaw = {
      ...raw,
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
      enrichmentJson: enrichment.enrichmentJson,
      signals: {
        ...(raw.signals || {}),
        socialStatus,
        instagramUrl: nextInstagramUrl,
        facebookUrl: nextFacebookUrl,
      },
      socialLookup: {
        status: socialStatus,
        confidence: result.confidence,
        queries: result.queries,
        reason: result.reason,
        candidates: result.candidates || [],
        ...(issue ? { issue } : {}),
        finishedAt: new Date().toISOString(),
      },
      ...(issue
        ? { radarStageIssues: [...(Array.isArray(raw.radarStageIssues) ? raw.radarStageIssues : []), issue] }
        : {}),
    };
    await this.runs.updateRunItemRawJson(leadId, nextRaw);
    return nextRaw;
  }
}
