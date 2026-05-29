import { Injectable } from '@nestjs/common';
import type { LeadQualityV2 } from '../../lead-quality-v2';
import type { LeadQualityResult, WebscrapingContactResult, WebscrapingSearchRunResponse } from '../../webscraping.service';
import type {
  HbxTargetType,
  NormalizedRadarFilters,
  RadarChannelFilter,
  RadarChannelMatchMode,
  SearchSource,
  WebscrapingEngine,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunStatus,
} from '../shared/radar-types';

export type RadarRunPresenterHost = {
  parseMaybeJsonObject: (value: unknown) => Record<string, any>;
  extractLeadQualityV2FromObject: (value: unknown) => LeadQualityV2 | null;
  extractLeadQualityFromObject: (value: unknown) => LeadQualityResult | null;
  buildRunInputFromRow: (run: any) => any;
  normalizeSearchRunStatus: (status: unknown) => WebscrapingSearchRunStatus;
  normalizeRunItemStatus: (status: unknown) => WebscrapingSearchRunItemStatus;
  normalizeRadarChannels: (value: unknown) => RadarChannelFilter[];
  normalizeChannelMatchMode: (value: unknown) => RadarChannelMatchMode;
  isRunItemQualityDeliverable: (item: any, input: NormalizedRadarFilters) => boolean;
  attachDeliveryClassification: (item: any, input: NormalizedRadarFilters, quality: LeadQualityResult | null, qualityV2: LeadQualityV2 | null) => any;
  stripListPremiumFields: (item: any, input: NormalizedRadarFilters) => any;
  normalizeRadiusKm: (value: unknown) => number;
  getHbxRunBatchLimit: (targetQuantity: number) => number;
  getHbxRunMaxAttempts: (targetQuantity: number, batchLimit: number) => number;
  buildSearchRunInsufficientMessage: (foundCount: number, attempts: number) => string;
  resolveRadarRunOperationalState: (
    run: any,
    status: WebscrapingSearchRunStatus,
    message: string | null,
  ) => { state: string; reason: string | null; message: string | null };
};

function normalizePhoneDigits(raw: string | null | undefined) {
  return String(raw || '').replace(/\D/g, '');
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeEngine(value: unknown): WebscrapingEngine {
  return value === 'hbx' ? 'hbx' : 'google';
}

function normalizeTargetType(value: unknown): HbxTargetType {
  return value === 'pf' || value === 'agenda_pf' ? value : 'pj';
}

@Injectable()
export class RadarRunPresenterService {
  mapRunItemToContact(item: any, host: RadarRunPresenterHost): WebscrapingContactResult {
    const raw = host.parseMaybeJsonObject(item?.rawJson);
    const enrichmentJson = host.parseMaybeJsonObject(item?.enrichmentJson || raw.enrichmentJson);
    return {
      ...(raw as any),
      placeId: String(item.placeId || raw.placeId || '').trim(),
      name: String(item.name || raw.name || '').trim(),
      phone: String(item.phone || raw.phone || '').trim(),
      phoneDigits: normalizePhoneDigits(item.phoneDigits || raw.phoneDigits || item.phone || raw.phone),
      rating: raw.rating == null ? null : Number(raw.rating),
      reviews: raw.reviews == null ? null : safeInteger(raw.reviews),
      address: String(item.address || raw.address || '').trim() || null,
      city: String(item.city || raw.city || '').trim() || null,
      state: String(item.state || raw.state || '').trim().toUpperCase() || null,
      segment: String(item.segment || raw.segment || raw.businessCategory || raw.category || '').trim() || null,
      businessCategory: String(raw.businessCategory || raw.category || item.segment || '').trim() || null,
      website: String(item.website || raw.website || '').trim() || null,
      instagramUrl: String(raw.instagramUrl || '').trim() || null,
      facebookUrl: String(raw.facebookUrl || '').trim() || null,
      email: String(raw.email || '').trim() || null,
      emailStatus: raw.emailStatus || raw.signals?.emailStatus || null,
      socialStatus: raw.socialStatus || raw.signals?.socialStatus || null,
      socialConfidence: raw.socialConfidence == null ? null : safeInteger(raw.socialConfidence),
      googleMapsUrl: String(raw.googleMapsUrl || raw.mapsUrl || raw.signals?.googleMapsUrl || '').trim() || null,
      whatsappStatus: raw.whatsappStatus || raw.whatsappCheckStatus || raw.signals?.whatsappStatus || null,
      whatsappCheckStatus: raw.whatsappCheckStatus || raw.whatsappStatus || raw.signals?.whatsappStatus || null,
      recommendedChannel: raw.recommendedChannel || raw.signals?.recommendedChannel || null,
      opportunityScore: raw.opportunityScore == null ? null : safeInteger(raw.opportunityScore),
      opportunityReason: String(raw.opportunityReason || '').trim() || null,
      enrichmentScore: raw.enrichmentScore == null ? null : safeInteger(raw.enrichmentScore),
      enrichmentJson: Object.keys(enrichmentJson).length ? enrichmentJson : raw.enrichmentJson || null,
      qualityV2: host.extractLeadQualityV2FromObject(raw) || host.extractLeadQualityV2FromObject(enrichmentJson) || raw.qualityV2 || enrichmentJson.qualityV2 || null,
      source: String(item.source || raw.source || '').trim() || null,
      quality: host.extractLeadQualityFromObject(raw),
    };
  }

  buildSearchRunResponse(
    run: any,
    capacity: { operationalStatus: 'healthy' | 'degraded'; message: string | null } | undefined,
    host: RadarRunPresenterHost,
  ): WebscrapingSearchRunResponse {
    const engine = normalizeEngine(run.engine);
    const targetType = normalizeTargetType(run.targetType);
    const status = host.normalizeSearchRunStatus(run.status);
    const metrics = parseJsonObject(run?.metricsJson);
    const items = Array.isArray(run.items) ? run.items : [];
    const foundItems = items.filter((item) => item.status === 'found');
    const runInput = host.buildRunInputFromRow(run);
    const requiredChannels: RadarChannelFilter[] = host.normalizeRadarChannels(runInput.requiredChannels);
    const channelMatchMode: RadarChannelMatchMode = host.normalizeChannelMatchMode(runInput.channelMatchMode);
    const qualityInput = {
      city: String(run.city || ''),
      state: String(run.state || ''),
      segment: String(run.segment || ''),
      targetType,
      preferredChannels: runInput.preferredChannels || [],
      requiredChannels,
      channelMatchMode,
      qualityMode: runInput.qualityMode || 'list',
      salesProfile: runInput.salesProfile || null,
    } as NormalizedRadarFilters;
    const deliverableFoundItems = foundItems.filter((item) => host.isRunItemQualityDeliverable(item, qualityInput));
    const requiredChannelRejectedCount = 0;
    const results = deliverableFoundItems.map((item) => {
      const contact = this.mapRunItemToContact(item, host);
      const { placeId: _placeId, ...publicContact } = contact;
      const qualityV2 = host.extractLeadQualityV2FromObject(contact) || null;
      return host.stripListPremiumFields(
        host.attachDeliveryClassification(publicContact, qualityInput, contact.quality || null, qualityV2),
        qualityInput,
      );
    });
    const query = {
      city: String(run.city || ''),
      state: run.state || null,
      segment: String(run.segment || ''),
      quantity: Math.max(1, Math.trunc(Number(run.targetQuantity || 1))),
      engine,
      targetType,
      filters: {
        minRating: null,
        minReviews: null,
        onlyWithWebsite: false,
        radiusKm: host.normalizeRadiusKm(metrics?.radiusKm),
      },
    };
    const foundSources = new Set(deliverableFoundItems.map((item) => String(item.source || '').trim()).filter(Boolean));
    const source: SearchSource = foundSources.has('radar_database')
      ? (foundSources.size === 1 ? 'radar_database' : 'hybrid')
      : engine === 'hbx'
        ? 'hbx'
        : 'google';
    const databaseFirst = source === 'radar_database';
    const radarRunItemCount = deliverableFoundItems.filter((item) => String(item.source || '').trim() === 'radar_database').length;
    const attemptCount = safeInteger(run.attemptCount);
    const batchLimit = host.getHbxRunBatchLimit(query.quantity);
    const maxAttempts = host.getHbxRunMaxAttempts(query.quantity, batchLimit);
    const foundCount = safeInteger(run.foundCount);
    const rawMessage = String(run.errorMessage || capacity?.message || '').trim();
    const guardedMessage = foundCount > 0 && /nenhum card valido/i.test(rawMessage)
        ? host.buildSearchRunInsufficientMessage(foundCount, attemptCount)
        : rawMessage || null;
    const operational = host.resolveRadarRunOperationalState(run, status, guardedMessage);
    return {
      id: run.id,
      runId: run.id,
      status,
      city: query.city,
      state: query.state,
      segment: query.segment,
      engine,
      targetType,
      targetQuantity: query.quantity,
      foundCount: safeInteger(run.foundCount),
      importedCount: safeInteger(run.importedCount),
      duplicateCount: safeInteger(run.duplicateCount),
      skippedCount: safeInteger(run.skippedCount),
      errorMessage: guardedMessage,
      attemptCount,
      failedBatchCount: safeInteger(run.failedBatchCount),
      consecutiveEmptyBatchCount: safeInteger(run.consecutiveEmptyBatchCount),
      consecutiveEngineErrorCount: safeInteger(run.consecutiveEngineErrorCount),
      lastBatchError: run.lastBatchError || null,
      lastBatchStatus: run.lastBatchStatus || null,
      nextRetryAt: run.nextRetryAt instanceof Date ? run.nextRetryAt.toISOString() : null,
      lastQueryUsed: run.lastQueryUsed || null,
      lastEngineUrl: run.lastEngineUrl || run.assignedEngineUrl || null,
      assignedEngineId: run.assignedEngineId || null,
      assignedEngineIndex: Number.isInteger(run.assignedEngineIndex) ? Number(run.assignedEngineIndex) : null,
      batchLimit,
      maxAttempts,
      operationalStatus: capacity?.operationalStatus,
      operationalMessage: capacity?.message || null,
      startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : null,
      createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : new Date().toISOString(),
      query,
      meta: {
        runId: run.id,
        historyId: run.id,
        source,
        reusedCount: databaseFirst || source === 'hybrid' ? radarRunItemCount : 0,
        fetchedCount: Math.max(0, safeInteger(run.foundCount) - radarRunItemCount),
        totalStoredCount: safeInteger(run.foundCount),
        status:
          status === 'partial_error' || status === 'completed_insufficient_results'
            ? status
            : status === 'completed'
              ? 'completed'
              : undefined,
        message: guardedMessage,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
        duplicateCount: safeInteger(run.duplicateCount),
        skippedCount: safeInteger(run.skippedCount),
        importedCount: safeInteger(run.importedCount),
        operationalState: operational.state as any,
        operationalReason: operational.reason,
        operationalMessage: operational.message,
        attempts: attemptCount,
        requiredChannels,
        channelMatchMode,
        requiredChannelRejectedCount,
        queryTaskCount: safeInteger(metrics?.searchScope?.taskCount),
        currentCity: metrics?.searchScope?.currentCity || null,
        currentSegment: metrics?.searchScope?.currentSegment || null,
        currentQuery: run.lastQueryUsed || null,
        approved: safeInteger(run.foundCount),
        skipped: safeInteger(run.skippedCount),
        duplicate: safeInteger(run.duplicateCount),
      },
      items: items.map((item) => {
        const raw = host.parseMaybeJsonObject(item?.rawJson);
        const enrichmentJson = host.parseMaybeJsonObject(item?.enrichmentJson || raw.enrichmentJson);
        const qualityV2 = host.extractLeadQualityV2FromObject(raw) || host.extractLeadQualityV2FromObject(enrichmentJson) || raw.qualityV2 || enrichmentJson.qualityV2 || null;
        const publicItem = {
          id: item.id,
          placeId: String(item.placeId || raw.placeId || ''),
          name: String(item.name || raw.name || ''),
          phone: String(item.phone || raw.phone || ''),
          phoneDigits: String(item.phoneDigits || raw.phoneDigits || ''),
          rating: raw.rating == null ? null : Number(raw.rating),
          reviews: raw.reviews == null ? null : safeInteger(raw.reviews),
          website: item.website || raw.website || null,
          instagramUrl: raw.instagramUrl || null,
          facebookUrl: raw.facebookUrl || null,
          email: raw.email || null,
          emailStatus: raw.emailStatus || raw.signals?.emailStatus || null,
          socialStatus: raw.socialStatus || raw.signals?.socialStatus || null,
          socialConfidence: raw.socialConfidence == null ? null : safeInteger(raw.socialConfidence),
          googleMapsUrl: raw.googleMapsUrl || raw.mapsUrl || raw.signals?.googleMapsUrl || null,
          whatsappStatus: raw.whatsappStatus || raw.whatsappCheckStatus || raw.signals?.whatsappStatus || null,
          whatsappCheckStatus: raw.whatsappCheckStatus || raw.whatsappStatus || raw.signals?.whatsappStatus || null,
          recommendedChannel: raw.recommendedChannel || raw.signals?.recommendedChannel || null,
          opportunityScore: raw.opportunityScore == null ? null : safeInteger(raw.opportunityScore),
          opportunityReason: raw.opportunityReason || null,
          enrichmentScore: raw.enrichmentScore == null ? null : safeInteger(raw.enrichmentScore),
          qualityV2,
          websiteKey: item.websiteKey || null,
          address: item.address || raw.address || null,
          city: item.city || raw.city || null,
          state: item.state || raw.state || null,
          segment: item.segment || raw.segment || null,
          source: item.source || raw.source || null,
          status: host.normalizeRunItemStatus(item.status),
          duplicateReason: item.duplicateReason || null,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date().toISOString(),
        };
        return host.stripListPremiumFields(
          host.attachDeliveryClassification(publicItem, qualityInput, raw.quality || null, qualityV2),
          qualityInput,
        );
      }),
      results,
    };
  }
}
