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

function clampedPositiveIntegerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

class RadarSocialBudgetDeadlineError extends Error {
  constructor() {
    super('radar_social_budget_deadline');
    this.name = 'RadarSocialBudgetDeadlineError';
  }
}

function runWithinDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RadarSocialBudgetDeadlineError()), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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

  private getMaxQueriesPerJob() {
    return clampedPositiveIntegerEnv('HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES', 8, 1, 12);
  }

  private getJobBudgetMs() {
    return clampedPositiveIntegerEnv('HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS', 45_000, 1_000, 90_000);
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

    // O planner continua produzindo todas as estratégias em ordem de prioridade, mas um job
    // nunca pode monopolizar a fila: quantidade e relógio têm limites independentes e seguros.
    const plannedQueries = buildRadarSocialLookupQueries(baseLead);
    const maxQueries = this.getMaxQueriesPerJob();
    if (!plannedQueries.length) {
      await input.writer.markSkipped(input.context, input.leadId, item, raw, 'identidade_incompleta');
      return { status: 'skipped', reason: 'identidade_incompleta' };
    }
    const socialRequests = this.getGoogleSearchProvider().buildSocialRequests(baseLead, plannedQueries, {
      limit: 5,
      timeoutMs: input.timeoutMs,
    });
    const socialRequestsByKey = new Map(
      socialRequests.map((request) => [`${request.network || ''}:${request.queryText.toLowerCase()}`, request]),
    );
    const safeQueryWindow = plannedQueries
      .filter((entry) => !(entry.network === 'instagram' ? existingInstagram : existingFacebook))
      .slice(0, maxQueries);
    await input.writer.markSearching(input.context, input.leadId, item, raw, safeQueryWindow.map((entry) => entry.query));

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
    let budgetExhausted = false;
    const deadlineAt = Date.now() + this.getJobBudgetMs();

    for (const entry of plannedQueries) {
      if (entry.network === 'instagram' ? bestInstagram : bestFacebook) continue;
      if (attemptedQueries.length >= maxQueries) break;
      const remainingMs = deadlineAt - Date.now();
      // searchHbxEngine usa timeout mínimo de 1s. Não começa uma nova consulta quando não há
      // janela suficiente, evitando ultrapassar o orçamento por causa desse clamp inferior.
      if (remainingMs < 1_000) {
        budgetExhausted = true;
        break;
      }
      attemptedQueries.push(entry.query);
      try {
        const textualRequest = socialRequestsByKey.get(`${entry.network}:${entry.query.toLowerCase()}`);
        const queryTimeoutMs = Math.max(1_000, Math.min(
          remainingMs,
          safeInteger(textualRequest?.timeoutMs, input.timeoutMs),
          input.timeoutMs,
        ));
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
        const output = await runWithinDeadline(input.host.searchHbxEngine(
          lookupInput,
          [],
          input.engineUrl || undefined,
          {
            queryText: textualRequest?.queryText || entry.query,
            batchLimit: textualRequest?.limit || 5,
            timeoutMs: queryTimeoutMs,
          },
        // O motor recebe o timeout da consulta; esta segunda barreira cobre somente o relógio
        // total do job caso algum adaptador ignore ou não consiga abortar o request individual.
        ), remainingMs);
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
        if (error instanceof RadarSocialBudgetDeadlineError) {
          budgetExhausted = true;
          rejectedReasons.push('orcamento_social_esgotado');
          break;
        }
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
          : engineFailed && !budgetExhausted
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
          : budgetExhausted
            ? 'orcamento_social_esgotado_sem_resultado_confirmado'
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
