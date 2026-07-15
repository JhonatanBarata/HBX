import { Injectable, Logger, Optional } from '@nestjs/common';
import { buildRadarSocialLookupQueries } from './radar-social-query-planner';
import { RadarSocialCandidateExtractor } from './radar-social-candidate-extractor';
import { RadarSocialCandidateScorer } from './radar-social-candidate-scorer';
import { RadarSocialResultWriterService } from './radar-social-result-writer.service';
import { RadarRunRepositoryService } from '../persistence/radar-run-repository.service';
import { GoogleSearchProviderService } from '../providers/google-search/google-search-provider.service';
import type { NormalizedSearchInput, SearchExecutionContext } from '../shared/radar-types';
import type {
  RadarSocialCandidateScore,
  RadarSocialLookupHost,
  RadarSocialLookupResult,
} from './radar-social-types';

function normalizePhoneDigits(raw: string | null | undefined) {
  return String(raw || '').replace(/\D/g, '');
}

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
export class RadarSocialOrchestratorService {
  private readonly logger = new Logger(RadarSocialOrchestratorService.name);
  private readonly extractor = new RadarSocialCandidateExtractor();
  private readonly scorer = new RadarSocialCandidateScorer();

  constructor(
    private readonly runs: RadarRunRepositoryService,
    @Optional() private readonly writer?: RadarSocialResultWriterService,
    @Optional() private readonly googleSearchProvider?: GoogleSearchProviderService,
  ) {}

  private getGoogleSearchProvider() {
    return this.googleSearchProvider || new GoogleSearchProviderService();
  }

  private buildRunItemSocialLookupBase(item: any) {
    const raw = parseMaybeJsonObject(item?.rawJson);
    return {
      ...raw,
      placeId: String(item?.placeId || raw.placeId || '').trim(),
      name: String(item?.name || raw.name || '').trim(),
      legalName: String(raw.legalName || raw.razaoSocial || raw.companyLegalName || '').trim(),
      phone: String(item?.phone || raw.phone || '').trim(),
      phoneDigits: normalizePhoneDigits(item?.phoneDigits || raw.phoneDigits || item?.phone || raw.phone),
      website: String(item?.website || raw.website || '').trim() || null,
      address: String(item?.address || raw.address || '').trim() || null,
      city: String(item?.city || raw.city || '').trim() || null,
      state: String(item?.state || raw.state || '').trim().toUpperCase() || null,
      segment: String(item?.segment || raw.segment || raw.businessCategory || raw.category || '').trim() || null,
    };
  }

  async runForSavedLead(input: {
    context: SearchExecutionContext;
    leadId: string;
    normalizedInput: NormalizedSearchInput;
    engineUrl?: string | null;
    host: RadarSocialLookupHost;
    timeoutMs: number;
    writer: RadarSocialResultWriterService;
  }): Promise<RadarSocialLookupResult | { status: 'skipped'; reason: string }> {
    const item = await this.runs.loadRunItem(input.context, input.leadId);
    if (!item || item.status !== 'found' || input.normalizedInput.targetType !== 'pj') {
      return { status: 'skipped', reason: 'item_indisponivel' };
    }
    const raw = parseMaybeJsonObject(item.rawJson);
    const baseLead = this.buildRunItemSocialLookupBase(item);
    const rawInstagramUrl = String(raw.instagramUrl || raw.signals?.instagramUrl || '').trim() || null;
    const rawFacebookUrl = String(raw.facebookUrl || raw.signals?.facebookUrl || '').trim() || null;
    const existingInstagram = input.host.normalizeRadarSocialUrl(rawInstagramUrl, 'instagram');
    const existingFacebook = input.host.normalizeRadarSocialUrl(rawFacebookUrl, 'facebook');
    if (existingInstagram && existingFacebook) {
      await input.writer.markSkipped(input.context, input.leadId, item, raw, 'social_ja_presente');
      return { status: 'skipped', reason: 'social_ja_presente' };
    }

    const queries = buildRadarSocialLookupQueries(baseLead);
    if (!queries.length) {
      await input.writer.markSkipped(input.context, input.leadId, item, raw, 'identidade_incompleta');
      return { status: 'skipped', reason: 'identidade_incompleta' };
    }
    const socialRequests = this.getGoogleSearchProvider().buildSocialRequests(baseLead, queries, {
      limit: 5,
      timeoutMs: input.timeoutMs,
    });
    const socialRequestsByKey = new Map(
      socialRequests.map((request) => [`${request.network || ''}:${request.queryText.toLowerCase()}`, request]),
    );
    await input.writer.markSearching(input.context, input.leadId, item, raw, queries.map((entry) => entry.query));

    const attemptedQueries: string[] = [];
    const rejectedReasons: string[] = [];
    const reviewCandidates: RadarSocialCandidateScore[] = [];
    const acceptedCandidates: RadarSocialCandidateScore[] = [];
    const rejectedCandidates: RadarSocialCandidateScore[] = [];
    let engineFailed = false;
    let bestInstagram = existingInstagram || null;
    let bestFacebook = existingFacebook || null;
    let bestConfidence = Math.max(0, safeInteger(raw.socialConfidence));
    let consecutiveEngineFailures = 0;

    for (const entry of queries) {
      attemptedQueries.push(entry.query);
      try {
        const textualRequest = socialRequestsByKey.get(`${entry.network}:${entry.query.toLowerCase()}`);
        const lookupInput: NormalizedSearchInput = {
          ...input.normalizedInput,
          city: baseLead.city || input.normalizedInput.city,
          state: baseLead.state || input.normalizedInput.state,
          segment: baseLead.segment || input.normalizedInput.segment,
          targetType: 'pj',
          quantity: 5,
          requiredChannels: [entry.network],
          channelMatchMode: 'any_required',
        };
        const output = await input.host.searchHbxEngine(
          lookupInput,
          [],
          input.engineUrl || undefined,
          {
            queryText: textualRequest?.queryText || entry.query,
            batchLimit: textualRequest?.limit || 5,
            timeoutMs: textualRequest?.timeoutMs || input.timeoutMs,
          },
        );
        const normalizedResults = textualRequest
          ? this.getGoogleSearchProvider().normalizeTextualResults(output.results || [], textualRequest)
          : output.results || [];
        for (const result of normalizedResults) {
          consecutiveEngineFailures = 0;
          const candidates = this.extractor.extract(result, entry.network, input.host);
          if (!candidates.length) {
            rejectedReasons.push(`${entry.network}:sem_url_social`);
            continue;
          }
          for (const candidate of candidates) {
            const scored = {
              ...this.scorer.score(baseLead, candidate),
              query: entry.query,
              layer: entry.layer,
              source: candidate.source,
            };
            if (scored.accepted && scored.url) {
              acceptedCandidates.push(scored);
              if (entry.network === 'instagram') bestInstagram = scored.url;
              else bestFacebook = scored.url;
              bestConfidence = Math.max(bestConfidence, scored.confidence);
              break;
            }
            if (scored.status === 'candidate_review') {
              reviewCandidates.push(scored);
              bestConfidence = Math.max(bestConfidence, scored.confidence);
            } else {
              rejectedCandidates.push(scored);
              rejectedReasons.push(`${entry.network}:${scored.reason}`);
            }
          }
        }
      } catch (error: any) {
        engineFailed = true;
        consecutiveEngineFailures += 1;
        rejectedReasons.push(`${entry.network}:erro_motor:${String(error?.message || error).slice(0, 120)}`);
      }
      if (bestInstagram && bestFacebook) break;
      if (consecutiveEngineFailures >= 6 && !bestInstagram && !bestFacebook) break;
    }

    const hasConfirmed = Boolean(bestInstagram || bestFacebook);
    const status: RadarSocialLookupResult['status'] = bestInstagram && bestFacebook
      ? 'found'
      : hasConfirmed
        ? 'partial'
        : reviewCandidates.length
          ? 'candidate_review'
          : engineFailed
            ? 'error'
            : 'missing';
    const confidence = hasConfirmed
      ? Math.max(status === 'found' ? 85 : 75, bestConfidence)
      : status === 'candidate_review'
        ? Math.max(60, Math.min(74, bestConfidence))
        : 0;
    const reason = status === 'found'
      ? 'perfis_sociais_confirmados'
      : status === 'partial'
        ? 'perfil_social_parcial_confirmado'
        : status === 'candidate_review'
          ? 'perfil_social_para_revisao'
          : rejectedReasons.slice(0, 6).join('; ') || 'sem_resultado_social_confiavel';
    const result: RadarSocialLookupResult = {
      status,
      instagramUrl: bestInstagram,
      facebookUrl: bestFacebook,
      confidence,
      queries: attemptedQueries,
      reason,
      candidates: reviewCandidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
      acceptedCandidates: acceptedCandidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
      rejectedCandidates: rejectedCandidates.sort((a, b) => b.confidence - a.confidence).slice(0, 10),
    };
    await input.writer.writeResult(input.context, input.leadId, item, baseLead, raw, result);
    this.logger.log(`[radar-social] lead=${input.leadId} status=${status} confidence=${confidence} queries=${attemptedQueries.join(' | ')} reason=${reason}`);
    return result;
  }
}
