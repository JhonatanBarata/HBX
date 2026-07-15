import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RadarEnrichmentJobPipelineService,
  type RadarAsyncEnrichmentJobStatus,
  type RadarAsyncEnrichmentJobType,
} from '../03-enrichment/radar-enrichment-job-pipeline.service';
import type { RadarSearchRunMetrics, RadarSearchRunMetricsPatch, SearchExecutionContext, WebscrapingSearchRunItemStatus } from '../shared/radar-types';
import { normalizeLookupValue } from '../04-socials/radar-social-matching';

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
export class RadarRunRepositoryService {
  private readonly logger = new Logger(RadarRunRepositoryService.name);
  private readonly enrichmentJobs = new RadarEnrichmentJobPipelineService();

  constructor(private readonly prisma: PrismaService) {}

  async loadRunItem(context: SearchExecutionContext, leadId: string) {
    const delegate = (this.prisma as any).webscrapingSearchRunItem;
    if (!delegate) return null;
    const byUnique = typeof delegate.findUnique === 'function'
      ? await delegate.findUnique({ where: { id: leadId } }).catch(() => null)
      : null;
    if (byUnique && Number(byUnique.companyId) === Number(context.companyId)) return byUnique;
    const byFirst = typeof delegate.findFirst === 'function'
      ? await delegate.findFirst({ where: { id: leadId, companyId: context.companyId } }).catch(() => null)
      : null;
    if (byFirst) return byFirst;
    if (typeof delegate.findMany !== 'function') return null;
    const rows = await delegate.findMany({ where: { id: leadId, companyId: context.companyId }, take: 1 }).catch(() => []);
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async updateRunItemRawJson(leadId: string, nextRaw: Record<string, any>) {
    const delegate = (this.prisma as any).webscrapingSearchRunItem;
    if (!delegate?.update) return null;
    return delegate.update({
      where: { id: leadId },
      data: { rawJson: JSON.stringify(nextRaw) },
    }).catch(() => null);
  }

  async markEnrichmentJobState(
    context: SearchExecutionContext,
    leadId: string,
    input: {
      type: RadarAsyncEnrichmentJobType;
      status: RadarAsyncEnrichmentJobStatus;
      reason?: string | null;
      error?: unknown;
      traceId?: string | null;
    },
  ) {
    const item = await this.loadRunItem(context, leadId);
    if (!item) return null;
    const raw = parseMaybeJsonObject(item.rawJson);
    const nextRaw = {
      ...raw,
      ...this.enrichmentJobs.withJobStatus(raw, input),
    };
    await this.syncEnrichmentJobSnapshot(context, item, nextRaw, input.type);
    return nextRaw;
  }

  async syncEnrichmentJobSnapshot(
    context: SearchExecutionContext,
    item: any,
    nextRaw: Record<string, any>,
    type: RadarAsyncEnrichmentJobType,
  ) {
    const leadId = String(item?.id || '').trim();
    if (!leadId) return null;
    const incomingJobs = this.enrichmentJobs.normalizeJobs(nextRaw.asyncEnrichmentJobs || nextRaw.postDeliveryJobs);
    const incomingJob = incomingJobs.find((entry) => entry.type === type);
    if (!incomingJob) return nextRaw;
    const statusPriority: Record<string, number> = {
      queued: 0,
      pending: 0,
      unknown: 0,
      unverified: 0,
      running: 1,
      searching: 1,
      error: 2,
      partial_error: 2,
      failed: 2,
      skipped: 3,
      missing: 3,
      none: 3,
      invalid: 3,
      broken: 3,
      unreachable: 3,
      weak: 4,
      social_only: 4,
      partial: 4,
      probable: 4,
      candidate_review: 4,
      completed: 5,
      enriched: 5,
      found: 5,
      confirmed: 5,
      present: 5,
    };
    const mergeNonDestructive = (current: any, incoming: any, key = ''): any => {
      if (incoming == null || incoming === '') return current == null ? incoming : current;
      if (current == null || current === '') return incoming;
      if (Array.isArray(current) && Array.isArray(incoming)) {
        const seen = new Set<string>();
        return [...current, ...incoming].filter((entry) => {
          const signature = typeof entry === 'string' ? entry : JSON.stringify(entry);
          if (seen.has(signature)) return false;
          seen.add(signature);
          return true;
        });
      }
      if (
        typeof current === 'object'
        && typeof incoming === 'object'
        && !Array.isArray(current)
        && !Array.isArray(incoming)
      ) {
        const merged = { ...current };
        for (const [childKey, value] of Object.entries(incoming)) {
          merged[childKey] = mergeNonDestructive(current[childKey], value, childKey);
        }
        return merged;
      }
      if (key.toLowerCase().endsWith('status')) {
        const currentPriority = statusPriority[String(current).toLowerCase()];
        const incomingPriority = statusPriority[String(incoming).toLowerCase()];
        if (currentPriority != null && incomingPriority != null && currentPriority > incomingPriority) return current;
      }
      if (typeof current === 'number' && typeof incoming === 'number' && /(confidence|score|attempts)$/i.test(key)) {
        return Math.max(current, incoming);
      }
      return incoming;
    };

    const itemDelegate = (this.prisma as any).webscrapingSearchRunItem;
    let persistedItem = item;
    let persistedRaw: Record<string, any> | null = null;
    let jobs: ReturnType<RadarEnrichmentJobPipelineService['normalizeJobs']> = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const freshItem = await this.loadRunItem(context, leadId);
      if (!freshItem) return null;
      const currentRaw = parseMaybeJsonObject(freshItem.rawJson);
      const mergedRaw = mergeNonDestructive(currentRaw, nextRaw);
      const currentJobs = this.enrichmentJobs.normalizeJobs(currentRaw.asyncEnrichmentJobs || currentRaw.postDeliveryJobs);
      jobs = [
        ...currentJobs.filter((entry) => entry.type !== type),
        incomingJob,
      ];
      persistedRaw = {
        ...mergedRaw,
        asyncEnrichmentJobs: jobs,
        postDeliveryJobs: jobs,
        enrichmentJobSummary: this.enrichmentJobs.summarize(jobs),
      };
      const updated = await itemDelegate.updateMany({
        where: { id: leadId, rawJson: freshItem.rawJson ?? null },
        data: { rawJson: JSON.stringify(persistedRaw) },
      }).catch(() => ({ count: 0 }));
      if (Number(updated?.count || 0) > 0) {
        persistedItem = freshItem;
        break;
      }
      persistedRaw = null;
    }
    if (!persistedRaw) throw new Error(`Concorrência ao sincronizar enriquecimento do item ${leadId}.`);

    const job = jobs.find((entry) => entry.type === type)!;
    const snapshot = {
      asyncEnrichmentJobs: jobs,
      postDeliveryJobs: jobs,
      enrichmentJobSummary: this.enrichmentJobs.summarize(jobs),
    };

    const poolDelegate = (this.prisma as any).radarLeadPool;
    const poolKeys = [
      persistedItem.placeId ? { placeId: String(persistedItem.placeId) } : null,
      persistedItem.phoneDigits ? { phoneDigits: String(persistedItem.phoneDigits) } : null,
    ].filter(Boolean);
    let pool: any = null;
    if (poolDelegate && poolKeys.length) {
      let poolFound = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = await poolDelegate.findFirst({
          where: { OR: poolKeys },
          select: {
            id: true,
            website: true,
            websiteStatus: true,
            email: true,
            emailStatus: true,
            emailSource: true,
            emailConfidence: true,
            instagramUrl: true,
            facebookUrl: true,
            socialStatus: true,
            socialConfidence: true,
            recommendedChannel: true,
            opportunityReason: true,
            lastEnrichedAt: true,
            metadataJson: true,
            enrichmentJson: true,
            signalsJson: true,
            evidenceJson: true,
            companyStates: {
              where: { companyId: context.companyId },
              select: { vendasLeadId: true },
              take: 1,
            },
          },
        }).catch(() => null);
        if (!candidate?.id) break;
        poolFound = true;
        const currentMetadata = parseMaybeJsonObject(candidate.metadataJson);
        const currentEnrichment = parseMaybeJsonObject(candidate.enrichmentJson);
        const currentSignals = parseMaybeJsonObject(candidate.signalsJson);
        const currentEvidence = parseMaybeJsonObject(candidate.evidenceJson);
        const currentPoolJobs = this.enrichmentJobs.normalizeJobs(
          currentMetadata.asyncEnrichmentJobs
          || currentMetadata.postDeliveryJobs
          || currentEnrichment.asyncEnrichmentJobs
          || currentEnrichment.postDeliveryJobs,
        );
        const poolJobs = [...currentPoolJobs.filter((entry) => entry.type !== type), job];
        const poolJobSnapshot = {
          asyncEnrichmentJobs: poolJobs,
          postDeliveryJobs: poolJobs,
          enrichmentJobSummary: this.enrichmentJobs.summarize(poolJobs),
        };
        const usefulSnapshot = {
          website: persistedRaw.website || null,
          websiteStatus: persistedRaw.websiteStatus || null,
          email: persistedRaw.email || null,
          emailStatus: persistedRaw.emailStatus || null,
          emailSource: persistedRaw.emailSource || null,
          emailConfidence: persistedRaw.emailConfidence ?? null,
          instagramUrl: persistedRaw.instagramUrl || null,
          facebookUrl: persistedRaw.facebookUrl || null,
          socialStatus: persistedRaw.socialStatus || null,
          socialConfidence: persistedRaw.socialConfidence ?? null,
          recommendedChannel: persistedRaw.recommendedChannel || null,
          opportunityReason: persistedRaw.opportunityReason || null,
        };
        const metadata = mergeNonDestructive(currentMetadata, { ...usefulSnapshot, ...poolJobSnapshot });
        const enrichment = mergeNonDestructive(
          currentEnrichment,
          { ...parseMaybeJsonObject(persistedRaw.enrichmentJson), ...usefulSnapshot, ...poolJobSnapshot },
        );
        const signals = mergeNonDestructive(
          currentSignals,
          parseMaybeJsonObject(persistedRaw.signalsJson || persistedRaw.signals),
        );
        const evidence = mergeNonDestructive(
          currentEvidence,
          parseMaybeJsonObject(persistedRaw.evidenceJson),
        );
        const data = {
          website: candidate.website || persistedRaw.website || null,
          websiteStatus: mergeNonDestructive(candidate.websiteStatus, persistedRaw.websiteStatus, 'websiteStatus') || 'unknown',
          email: candidate.email || persistedRaw.email || null,
          emailStatus: mergeNonDestructive(candidate.emailStatus, persistedRaw.emailStatus, 'emailStatus') || 'missing',
          emailSource: !candidate.emailSource || ['none', 'missing', 'unknown', 'unverified'].includes(String(candidate.emailSource).toLowerCase())
            ? persistedRaw.emailSource || candidate.emailSource || null
            : candidate.emailSource,
          emailConfidence: Math.max(Number(candidate.emailConfidence || 0), Number(persistedRaw.emailConfidence || 0)),
          instagramUrl: candidate.instagramUrl || persistedRaw.instagramUrl || null,
          facebookUrl: candidate.facebookUrl || persistedRaw.facebookUrl || null,
          socialStatus: mergeNonDestructive(candidate.socialStatus, persistedRaw.socialStatus, 'socialStatus') || null,
          socialConfidence: Math.max(Number(candidate.socialConfidence || 0), Number(persistedRaw.socialConfidence || 0)),
          recommendedChannel: candidate.recommendedChannel || persistedRaw.recommendedChannel || null,
          opportunityReason: candidate.opportunityReason || persistedRaw.opportunityReason || null,
          lastEnrichedAt: ['completed', 'skipped', 'partial_error', 'failed'].includes(String(job.status))
            ? (() => {
                const parsed = persistedRaw.lastEnrichedAt ? new Date(persistedRaw.lastEnrichedAt) : new Date();
                return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
              })()
            : candidate.lastEnrichedAt || null,
          metadataJson: JSON.stringify(metadata),
          enrichmentJson: JSON.stringify(enrichment),
          signalsJson: JSON.stringify(signals),
          evidenceJson: JSON.stringify(evidence),
        };
        const updated = await poolDelegate.updateMany({
          where: {
            id: candidate.id,
            metadataJson: candidate.metadataJson ?? null,
            enrichmentJson: candidate.enrichmentJson ?? null,
          },
          data,
        }).catch(() => ({ count: 0 }));
        if (Number(updated?.count || 0) > 0) {
          pool = { ...candidate, ...data };
          break;
        }
      }
      if (poolFound && !pool) throw new Error(`Concorrência ao sincronizar enriquecimento do pool ${leadId}.`);
    }

    let vendasLeadId = String(pool?.companyStates?.[0]?.vendasLeadId || persistedRaw.vendasLeadId || '').trim() || null;
    if (!vendasLeadId && persistedItem.phoneDigits) {
      const vendasLead = await (this.prisma as any).vendasLead?.findUnique?.({
        where: {
          companyId_phoneNormalized: {
            companyId: context.companyId,
            phoneNormalized: String(persistedItem.phoneDigits),
          },
        },
        select: { id: true },
      }).catch(() => null);
      vendasLeadId = String(vendasLead?.id || '').trim() || null;
    }
    if (!vendasLeadId) return persistedRaw;

    const timeline = (this.prisma as any).vendasLeadTimelineEvent;
    if (!timeline) return persistedRaw;
    const idempotencyKey = `radar_enrichment:${type}`;
    const title = type === 'social_lookup' ? 'Enriquecimento social do Radar' : 'Enriquecimento web do Radar';
    const existing = await timeline.findFirst({
      where: { leadId: vendasLeadId, idempotencyKey },
      select: { id: true, description: true },
    }).catch(() => null);
    const timelineAt = new Date();
    const usefulTimelineSnapshot = {
      radarSearchRunItemId: leadId,
      radarLeadId: pool?.id || null,
      website: persistedRaw.website || pool?.website || null,
      email: persistedRaw.email || pool?.email || null,
      emailStatus: persistedRaw.emailStatus || null,
      instagramUrl: persistedRaw.instagramUrl || pool?.instagramUrl || null,
      facebookUrl: persistedRaw.facebookUrl || pool?.facebookUrl || null,
      socialStatus: persistedRaw.socialStatus || pool?.socialStatus || null,
      socialConfidence: Math.max(Number(persistedRaw.socialConfidence || 0), Number(pool?.socialConfidence || 0)),
      recommendedChannel: persistedRaw.recommendedChannel || pool?.recommendedChannel || null,
      opportunityReason: persistedRaw.opportunityReason || pool?.opportunityReason || null,
      enrichmentStatus: job.status,
      enrichment: parseMaybeJsonObject(persistedRaw.enrichmentJson || pool?.enrichmentJson),
      signals: parseMaybeJsonObject(persistedRaw.signalsJson || persistedRaw.signals || pool?.signalsJson),
      evidence: parseMaybeJsonObject(persistedRaw.evidenceJson || pool?.evidenceJson),
      possibleSocialCandidates: Array.isArray(persistedRaw.possibleSocialCandidates) ? persistedRaw.possibleSocialCandidates : [],
      confirmedSocialCandidates: Array.isArray(persistedRaw.confirmedSocialCandidates) ? persistedRaw.confirmedSocialCandidates : [],
      asyncEnrichmentJobs: jobs,
      postDeliveryJobs: jobs,
      job,
      enrichmentJobSummary: snapshot.enrichmentJobSummary,
      updatedAt: timelineAt.toISOString(),
    };
    const description = JSON.stringify(
      mergeNonDestructive(parseMaybeJsonObject(existing?.description), usefulTimelineSnapshot),
    );
    const data = {
      eventType: `radar_enrichment_${type}`,
      title,
      description,
      sourceType: 'radar_enrichment',
      resultLabel: job.status,
      createdByUserId: context.userId,
      idempotencyKey,
      createdAt: timelineAt,
    };
    if (existing?.id) {
      await timeline.update({ where: { id: existing.id }, data }).catch(() => null);
    } else {
      await timeline.create({ data: { leadId: vendasLeadId, ...data } }).catch(() => null);
    }
    return persistedRaw;
  }

  async recalculateCounters(runId: string) {
    const [currentRun, rows] = await Promise.all([
      this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: { foundCount: true },
      }),
      this.prisma.webscrapingSearchRunItem.findMany({
        where: { runId },
        select: { status: true },
      }),
    ]);
    const foundCount = rows.filter((row) => row.status === 'found').length;
    const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
    const skippedCount = rows.filter((row) => row.status === 'skipped' || row.status === 'invalid').length;
    await this.prisma.webscrapingSearchRun.update({
      where: { id: runId },
      data: {
        foundCount,
        duplicateCount,
        skippedCount,
        ...(foundCount > safeInteger(currentRun?.foundCount) ? { lastFoundCountChangeAt: new Date() } : {}),
      },
    });
    return { foundCount, duplicateCount, skippedCount };
  }

  emptyMetrics(status = 'queued'): RadarSearchRunMetrics {
    return {
      rawFoundCount: 0,
      hardBlockedCount: 0,
      negativeBlockedCount: 0,
      duplicateBlockedCount: 0,
      noChannelBlockedCount: 0,
      genericNameBlockedCount: 0,
      segmentHardMismatchBlockedCount: 0,
      savedListBasicCount: 0,
      savedReviewBackupCount: 0,
      leadPlusQualifiedCount: 0,
      downgradedByQualityCount: 0,
      urlsDiscovered: 0,
      pagesFetched: 0,
      parsedContacts: 0,
      approvedContacts: 0,
      reviewLowScore: 0,
      downgradedToReview: 0,
      rejectedBlockedDomain: 0,
      rejectedInvalidPhone: 0,
      rejectedGenericName: 0,
      durationMs: 0,
      engineId: null,
      engineIndex: null,
      sourceEngine: null,
      cacheHit: false,
      status,
    };
  }

  parseMetrics(value: unknown): RadarSearchRunMetrics {
    const parsed = parseMaybeJsonObject(value);
    const base = this.emptyMetrics(String(parsed?.status || 'queued'));
    return {
      ...base,
      rawFoundCount: safeInteger(parsed?.rawFoundCount),
      hardBlockedCount: safeInteger(parsed?.hardBlockedCount),
      negativeBlockedCount: safeInteger(parsed?.negativeBlockedCount),
      duplicateBlockedCount: safeInteger(parsed?.duplicateBlockedCount),
      noChannelBlockedCount: safeInteger(parsed?.noChannelBlockedCount),
      genericNameBlockedCount: safeInteger(parsed?.genericNameBlockedCount),
      segmentHardMismatchBlockedCount: safeInteger(parsed?.segmentHardMismatchBlockedCount),
      savedListBasicCount: safeInteger(parsed?.savedListBasicCount),
      savedReviewBackupCount: safeInteger(parsed?.savedReviewBackupCount),
      leadPlusQualifiedCount: safeInteger(parsed?.leadPlusQualifiedCount),
      downgradedByQualityCount: safeInteger(parsed?.downgradedByQualityCount),
      urlsDiscovered: safeInteger(parsed?.urlsDiscovered),
      pagesFetched: safeInteger(parsed?.pagesFetched),
      parsedContacts: safeInteger(parsed?.parsedContacts),
      approvedContacts: safeInteger(parsed?.approvedContacts),
      reviewLowScore: safeInteger(parsed?.reviewLowScore ?? parsed?.rejectedLowScore),
      downgradedToReview: safeInteger(parsed?.downgradedToReview ?? parsed?.downgradedByQualityCount),
      rejectedBlockedDomain: safeInteger(parsed?.rejectedBlockedDomain),
      rejectedInvalidPhone: safeInteger(parsed?.rejectedInvalidPhone),
      rejectedGenericName: safeInteger(parsed?.rejectedGenericName),
      durationMs: safeInteger(parsed?.durationMs),
      engineId: parsed?.engineId ? String(parsed.engineId) : null,
      engineIndex: Number.isInteger(parsed?.engineIndex) ? Number(parsed.engineIndex) : null,
      sourceEngine: parsed?.sourceEngine ? String(parsed.sourceEngine) : null,
      cacheHit: Boolean(parsed?.cacheHit),
      status: String(parsed?.status || base.status),
    };
  }

  classifyRejectionMetric(status: WebscrapingSearchRunItemStatus, reason?: string | null) {
    const normalized = normalizeLookupValue(String(reason || ''));
    if (status === 'duplicate') return 'duplicateBlockedCount';
    if (status === 'invalid' || normalized.includes('contato publico ausente') || normalized.includes('no_actionable_channel')) return 'noChannelBlockedCount';
    if (normalized.includes('generico') || normalized.includes('generic') || normalized.includes('lista') || normalized.includes('diretorio')) return 'genericNameBlockedCount';
    if (normalized.includes('segment_hard_mismatch')) return 'segmentHardMismatchBlockedCount';
    if (normalized.includes('blocked') || normalized.includes('bloque') || normalized.includes('opt-out') || normalized.includes('negative')) return 'negativeBlockedCount';
    return 'reviewLowScore';
  }

  async updateMetrics(runId: string, patch: RadarSearchRunMetricsPatch) {
    try {
      const delegate = (this.prisma as any).webscrapingSearchRun;
      const current = await delegate.findUnique({
        where: { id: runId },
        select: { metricsJson: true, startedAt: true, finishedAt: true, status: true },
      });
      const rawMetrics = parseMaybeJsonObject(current?.metricsJson);
      const metrics = this.parseMetrics(rawMetrics);
      for (const [key, value] of Object.entries(patch.increment || {})) {
        if (typeof value === 'number') {
          (metrics as any)[key] = safeInteger((metrics as any)[key]) + safeInteger(value);
        }
      }
      const patchWithoutIncrement = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'increment'));
      const next = {
        ...rawMetrics,
        ...metrics,
        ...patchWithoutIncrement,
      } as Record<string, any>;
      const startedAt = current?.startedAt instanceof Date ? current.startedAt.getTime() : 0;
      const finishedAt = current?.finishedAt instanceof Date ? current.finishedAt.getTime() : Date.now();
      if (!next.durationMs && startedAt) next.durationMs = Math.max(0, finishedAt - startedAt);
      await delegate.update({
        where: { id: runId },
        data: { metricsJson: JSON.stringify(next) },
      });
      return next;
    } catch (error: any) {
      this.logger.warn(`[radar-metrics] falha ao atualizar metricas run=${runId}: ${String(error?.message || error)}`);
      return null;
    }
  }

  buildQualitySummary(run: any, deliveredCount: number) {
    const metrics = this.parseMetrics(run?.metricsJson);
    const hardBlocked = safeInteger(metrics.hardBlockedCount)
      + safeInteger(metrics.negativeBlockedCount)
      + safeInteger(metrics.duplicateBlockedCount)
      + safeInteger(metrics.noChannelBlockedCount)
      + safeInteger(metrics.genericNameBlockedCount)
      + safeInteger(metrics.segmentHardMismatchBlockedCount);
    const review = safeInteger(metrics.savedReviewBackupCount) + safeInteger(metrics.reviewLowScore) + safeInteger(metrics.downgradedByQualityCount);
    const durationMs = metrics.durationMs || (
      run?.startedAt instanceof Date
        ? Math.max(0, (run?.finishedAt instanceof Date ? run.finishedAt.getTime() : Date.now()) - run.startedAt.getTime())
        : 0
    );
    return {
      found: Math.max(deliveredCount, safeInteger(run?.foundCount)),
      approved: deliveredCount,
      rejected: hardBlocked,
      discarded: hardBlocked,
      durationMs,
      label: `${deliveredCount} cards salvos${hardBlocked > 0 ? ` â€¢ ${hardBlocked} bloqueados por regra dura` : ''}${review > 0 ? ` â€¢ ${review} em revisao` : ''}`,
    };
  }
}
