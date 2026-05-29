import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
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
