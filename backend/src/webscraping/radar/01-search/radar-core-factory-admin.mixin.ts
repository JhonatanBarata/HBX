// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  randomUUID,
  XLSX,
  probeWebscrapingRuntime,
  buildHbxPresentationEmailDraft,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  isHbxEngineLocalhostUrl,
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  resolveCommercialPlanKeyForCapabilities,
  buildRadarLeadEnrichment,
  RADAR_LEAD_ENRICHMENT_VERSION,
  calculateLeadQualityV2,
  resolveRadarVisibilityFromQualityV2,
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
  PLACES_NEW_TEXT_SEARCH_URL,
  PLACES_NEW_DETAILS_URL,
  PLACES_TEXT_SEARCH_URL,
  PLACES_DETAILS_URL,
  MAX_QUANTITY,
  HBX_PJ_MAX_QUANTITY,
  HBX_PEOPLE_MAX_QUANTITY,
  DEFAULT_HBX_SCRAPING_ENGINE_URL,
  GLOBAL_CACHE_TTL_HOURS,
  RECENT_HISTORY_LIMIT,
  IBGE_CITIES_URL,
  CITY_CACHE_TTL_MS,
  MASS_DATA_INTERNAL_SEGMENTS,
  ACRE_CITIES_FALLBACK,
  AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK,
  AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
  AUTONOMOUS_MASS_DATA_MAX_TASKS,
  DEFAULT_MASS_DATA_ENGINE_URLS,
  TURBO_OPERATIONAL_CONFIG_KEY,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  GENERIC_DIRECTORY_NAMES,
  GENERIC_DIRECTORY_PREFIXES,
  GENERIC_DIRECTORY_CONTAINS,
  GENERIC_CATEGORY_HEADS,
  VERTICAL_TOKEN_GROUPS,
  GooglePlacesApiError,
  HbxBatchError,
  normalizePhoneDigits,
  isLikelyValidBrPhone,
  isLikelyWhatsapp,
  toNumberOrNull,
  clampQuantity,
  normalizeLookupValue,
  normalizeWebsiteKey,
  RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS,
  normalizeSocialProfileKey,
  looksLikeThirdPartySocialProfile,
  RADAR_SOCIAL_BLOCKED_PATH_PARTS,
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  socialHandleFromUrl,
  cityInitialsKey,
  socialTokenVariants,
  socialCategoryTokenVariants,
  hasTrustedEngineSocialSignal,
  socialProfileLooksCompatibleWithLead,
  getWebsiteHost,
  websiteHostLooksCompatibleWithLead,
  inferWebsiteStatus,
  RADAR_BAD_EMAIL_LOCAL_PARTS,
  RADAR_BAD_EMAIL_DOMAINS,
  RADAR_BAD_EMAIL_TLDS,
  normalizeBusinessEmail,
  parseJsonArray,
  parseJsonObject,
  isFallbackEligible,
  coerceBoolean,
  normalizeEngine,
  normalizeEnginePurpose,
  isAutomaticEnginePurpose,
  normalizeTargetType,
  parsePositiveInteger,
  maxQuantityFor,
  safeInteger,
  clampInteger,
  parsePositiveIntegerEnv,
  minutesAgo,
  formatCityWithState,
} from '../radar-core-method-imports';

import type {
  AutonomousMassDataCandidate,
  AutonomousMassDataStrategyMode,
  AutonomousMassDataWork,
  AutonomousMassDataWorkReason,
  ExternalRuntimeStatus,
  GlobalCacheRow,
  HbxBatchStatus,
  HbxDeliveryClassification,
  HbxDeliveryProduct,
  HbxEngineLease,
  HbxEnginePurpose,
  HbxEngineSearchOutput,
  HbxRuntimeDiagnostic,
  HistoryPlaceColumnSupport,
  HbxTargetType,
  HbxVisibilityTier,
  LeadQualityResult,
  LeadQualityStatus,
  LeadQualityV2,
  LeadQualityV2SalesProfile,
  MasterMassDataCampaignInput,
  NativeRuntimeDiagnostic,
  NormalizedRadarFilters,
  NormalizedSearchInput,
  NormalizeSearchInputOptions,
  PlaceDetails,
  RadarCampaignInput,
  RadarChannelFilter,
  RadarChannelMatchMode,
  RadarFiltersInput,
  RadarLeadEventType,
  RadarLeadStatus,
  RadarOperationalState,
  RadarOpportunityLevel,
  RadarSearchRunMetrics,
  RadarSearchRunMetricsPatch,
  RadarWebsiteStatus,
  RadarWhatsappCheckMode,
  RadarWhatsappCheckStatus,
  RegionalCity,
  RuntimeStatus,
  SearchContactsInput,
  SearchExecutionContext,
  SearchExecutionOptions,
  SearchHistoryRow,
  SearchPlacesCandidate,
  SearchRunStatus,
  SearchSource,
  UsageEventType,
  UsageExecutionMeta,
  WebscrapingContactResult,
  WebscrapingEngine,
  WebscrapingHistorySummary,
  WebscrapingOperationalConfigInput,
  WebscrapingRuntimeDiagnostic,
  WebscrapingRuntimeResponse,
  WebscrapingSearchFilters,
  WebscrapingSearchResponse,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunResponse,
  WebscrapingSearchRunStatus,
} from '../radar-core-method-imports';

export class RadarCoreFactoryAdminMixin {
  [key: string]: any;
  private startOfLocalDay(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private toIso(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  private dashboardEngineStatus(engine: any): 'running' | 'waiting' | 'offline' | 'cooldown' | 'paused' {
    const status = String(engine?.status || '').trim().toLowerCase();
    const stateLabel = String(engine?.stateLabel || '').trim().toLowerCase();
    const pausedUntil = engine?.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;
    if (engine?.manualPaused || status === 'paused' || stateLabel.includes('pausado') || (Number.isFinite(pausedUntil) && pausedUntil > Date.now())) {
      return 'paused';
    }
    if (status === 'cooldown' || status === 'degraded' || stateLabel.includes('cooldown')) return 'cooldown';
    if (!engine?.configured || !engine?.online || ['offline', 'missing', 'error'].includes(status)) {
      return 'offline';
    }
    if (engine?.busy || engine?.activeRunId || engine?.activeCampaignId || status === 'busy' || status === 'running' || stateLabel.includes('rodando')) {
      return 'running';
    }
    return 'waiting';
  }

  private secondsUntil(value?: string | null, now = new Date()) {
    const parsed = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round((parsed - now.getTime()) / 1000));
  }

  private getSaoPauloDayRange(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    const start = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00-03:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    return { start, end };
  }

  private async safeDelegateCount(delegateName: string, tableName: string, where?: any) {
    if (!(this.prisma as any)[delegateName]?.count || !(await this.prisma.hasTable(tableName).catch(() => false))) return 0;
    return (this.prisma as any)[delegateName].count(where ? { where } : undefined).catch(() => 0);
  }

  private serializeAuditDate(value: unknown) {
    return value instanceof Date ? value.toISOString() : null;
  }

  private parseSourceEngines(value: unknown) {
    return parseJsonArray(String(value || '[]'));
  }

  private async supportsRadarFactoryPersistence() {
    return Boolean((this.prisma as any).radarFactoryCursor)
      && Boolean((this.prisma as any).radarFactoryWorkLog)
      && await this.prisma.hasTable('RadarFactoryCursor').catch(() => false)
      && await this.prisma.hasTable('RadarFactoryWorkLog').catch(() => false);
  }

  private async getRadarFactoryCursor() {
    const fallback = {
      id: 'main',
      key: 'main',
      enabled: true,
      forcedOn: false,
      status: 'idle',
      currentState: null,
      currentCity: null,
      currentSegment: null,
      currentTargetType: 'pj',
      currentStateIndex: 0,
      currentCityIndex: 0,
      currentSegmentIndex: 0,
      currentTargetTypeIndex: 0,
      lastCampaignId: null,
      lastRunId: null,
      lastSavedCount: 0,
      lastDuplicateCount: 0,
      lastRejectedCount: 0,
      consecutiveEmptyCount: 0,
      consecutiveFailureCount: 0,
      lastError: null,
      reasonStopped: null,
      lastWorkedAt: null,
      nextRunAt: null,
      createdAt: null,
      updatedAt: null,
    };
    if (!(await this.supportsRadarFactoryPersistence())) return fallback;
    return (this.prisma as any).radarFactoryCursor.upsert({
      where: { key: 'main' },
      create: { key: 'main' },
      update: {},
    }).catch(() => fallback);
  }

  private getFactoryTargetTypes(): HbxTargetType[] {
    return ['pj', 'pf'];
  }

  private getFactoryWindowConfig() {
    return {
      startHour: clampInteger(process.env.HBX_FACTORY_START_HOUR, 22, 0, 23),
      startMinute: clampInteger(process.env.HBX_FACTORY_START_MINUTE, 0, 0, 59),
      endHour: clampInteger(process.env.HBX_FACTORY_END_HOUR, 7, 0, 23),
      endMinute: clampInteger(process.env.HBX_FACTORY_END_MINUTE, 0, 0, 59),
      timezone: String(process.env.HBX_FACTORY_TIMEZONE || 'America/Sao_Paulo'),
    };
  }

  private getFactoryGuidedLocation(config: any) {
    const metadata = this.parseOperationalMetadata(config?.metadataJson);
    const state = String(config?.factoryState || metadata.factoryState || '').trim().toUpperCase();
    const city = String(config?.factoryCity || metadata.factoryCity || '').trim();
    return state && city ? { state, city } : null;
  }

  private isFactoryWeekendByTimezone(timezone: string, date = new Date()) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date).toLowerCase();
    return weekday === 'sat' || weekday === 'sun';
  }

  private isWithinFactoryWindow(cursor: any, date = new Date()) {
    if (cursor?.forcedOn) return true;
    const window = this.getFactoryWindowConfig();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: window.timezone, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    const current = hour * 60 + minute;
    const start = window.startHour * 60 + window.startMinute;
    const end = window.endHour * 60 + window.endMinute;
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  private isFactoryAllowedNow(cursor: any, config: any, date = new Date()) {
    void cursor;
    void config;
    void date;
    return true;
  }

  private nextFactoryWindowAt(date = new Date()) {
    const window = this.getFactoryWindowConfig();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: window.timezone, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    const current = hour * 60 + minute;
    const start = window.startHour * 60 + window.startMinute;
    const minutesUntilStart = (start - current + 24 * 60) % (24 * 60) || 24 * 60;
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutesUntilStart, 0, 0);
    return next;
  }

  private async getFactoryLocationPool() {
    const locations = await this.listAutonomousMassDataLocations().catch(() => AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK);
    return locations.length ? locations : AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK;
  }

  private buildFactoryLinearIndex(input: {
    cityIndex: number;
    segmentIndex: number;
    targetTypeIndex: number;
    segmentCount: number;
    targetTypeCount: number;
  }) {
    return (input.cityIndex * input.segmentCount + input.segmentIndex) * input.targetTypeCount + input.targetTypeIndex;
  }

  private splitFactoryLinearIndex(linearIndex: number, segmentCount: number, targetTypeCount: number) {
    const perCity = Math.max(1, segmentCount * targetTypeCount);
    const cityIndex = Math.floor(linearIndex / perCity);
    const remainder = linearIndex % perCity;
    const segmentIndex = Math.floor(remainder / targetTypeCount);
    const targetTypeIndex = remainder % targetTypeCount;
    return { cityIndex, segmentIndex, targetTypeIndex };
  }

  private async getFactoryStockCount(input: { state: string; city: string; segment: string; targetType: HbxTargetType }) {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return 0;
    const where: any = {
      normalizedCity: normalizeLookupValue(input.city),
      state: String(input.state || '').trim().toUpperCase(),
      normalizedSegment: normalizeLookupValue(input.segment),
      phoneDigits: { not: null },
      status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'hidden'] as any },
    };
    if (await this.supportsRadarOwnershipPersistence()) {
      where.ownerCompanyId = null;
    }
    if (input.targetType === 'pf' || input.targetType === 'agenda_pf') {
      where.OR = [
        { metadataJson: { contains: `"targetType":"${input.targetType}"` } },
        { placeId: { startsWith: `hbx:${input.targetType}:` } },
      ];
    } else {
      where.OR = [
        { metadataJson: { contains: '"targetType":"pj"' } },
        { metadataJson: null },
      ];
    }
    return (this.prisma as any).radarLeadPool.count({ where }).catch(() => 0);
  }

  private async pickRadarFactoryMission(cursor: any, options: { previewOnly?: boolean } = {}) {
    const locations = await this.getFactoryLocationPool();
    const operationalConfig = await this.getOperationalConfig().catch(() => null);
    const guidedLocation = this.getFactoryGuidedLocation(operationalConfig);
    const segments = this.getMassDataSegments(null);
    const targetTypes = this.getFactoryTargetTypes();
    const missionLocations = guidedLocation ? [guidedLocation] : locations;
    const total = Math.max(1, missionLocations.length * segments.length * targetTypes.length);
    const start = this.buildFactoryLinearIndex({
      cityIndex: guidedLocation ? 0 : clampInteger(cursor?.currentCityIndex, 0, 0, Math.max(0, missionLocations.length - 1)),
      segmentIndex: clampInteger(cursor?.currentSegmentIndex, 0, 0, Math.max(0, segments.length - 1)),
      targetTypeIndex: clampInteger(cursor?.currentTargetTypeIndex, 0, 0, Math.max(0, targetTypes.length - 1)),
      segmentCount: segments.length,
      targetTypeCount: targetTypes.length,
    }) % total;
    const candidateLimit = options.previewOnly ? 1 : Math.min(total, 120);
    const candidates: any[] = [];
    const stateOrder = Array.from(new Set(missionLocations.map((item) => item.state)));

    for (let offset = 0; offset < candidateLimit; offset += 1) {
      const linear = (start + offset) % total;
      const indexes = this.splitFactoryLinearIndex(linear, segments.length, targetTypes.length);
      const location = missionLocations[indexes.cityIndex] || missionLocations[0];
      const segment = segments[indexes.segmentIndex] || segments[0] || 'empresas';
      const targetType = targetTypes[indexes.targetTypeIndex] || 'pj';
      const stockCount = options.previewOnly ? 0 : await this.getFactoryStockCount({
        state: location.state,
        city: location.city,
        segment,
        targetType,
      });
      const recentLog = options.previewOnly || !(await this.supportsRadarFactoryPersistence())
        ? null
        : await (this.prisma as any).radarFactoryWorkLog.findFirst({
            where: {
              state: location.state,
              city: location.city,
              segment,
              targetType,
            },
            orderBy: { createdAt: 'desc' },
            select: { status: true, savedCount: true, duplicateCount: true, rejectedCount: true, createdAt: true },
          }).catch(() => null);
      const recentBad = ['failed', 'empty', 'completed_insufficient_results'].includes(String(recentLog?.status || ''));
      const recentlyWorkedAt = recentLog?.createdAt instanceof Date ? recentLog.createdAt.getTime() : 0;
      candidates.push({
        state: location.state,
        city: location.city,
        segment,
        targetType,
        stockCount,
        recentBad,
        recentlyWorkedAt,
        indexes: {
          currentStateIndex: Math.max(0, stateOrder.indexOf(location.state)),
          currentCityIndex: indexes.cityIndex,
          currentSegmentIndex: indexes.segmentIndex,
          currentTargetTypeIndex: indexes.targetTypeIndex,
        },
        linear,
        offset,
      });
    }

    if (!candidates.length) return null;
    if (options.previewOnly) return candidates[0];
    return candidates.sort((left, right) => {
      const leftLow = left.stockCount < 80 ? 0 : 1;
      const rightLow = right.stockCount < 80 ? 0 : 1;
      if (leftLow !== rightLow) return leftLow - rightLow;
      if (left.stockCount !== right.stockCount) return left.stockCount - right.stockCount;
      if (left.recentBad !== right.recentBad) return left.recentBad ? 1 : -1;
      if (left.recentlyWorkedAt !== right.recentlyWorkedAt) return left.recentlyWorkedAt - right.recentlyWorkedAt;
      return left.offset - right.offset;
    })[0];
  }

  private async buildRadarFactoryNextPreview(cursor: any) {
    const preview = await this.pickRadarFactoryMission(cursor, { previewOnly: true }).catch(() => null);
    if (!preview) return null;
    return {
      state: preview.state,
      city: preview.city,
      segment: preview.segment,
      targetType: preview.targetType,
      label: [preview.state, preview.city, preview.segment, String(preview.targetType).toUpperCase()].filter(Boolean).join(' / '),
    };
  }

  private async buildNextFactoryCursorIndexes(cursor: any) {
    const operationalConfig = await this.getOperationalConfig().catch(() => null);
    const guidedLocation = this.getFactoryGuidedLocation(operationalConfig);
    const locations = guidedLocation ? [guidedLocation] : await this.getFactoryLocationPool();
    const segments = this.getMassDataSegments(null);
    const targetTypes = this.getFactoryTargetTypes();
    const total = Math.max(1, locations.length * segments.length * targetTypes.length);
    const current = this.buildFactoryLinearIndex({
      cityIndex: clampInteger(cursor?.currentCityIndex, 0, 0, Math.max(0, locations.length - 1)),
      segmentIndex: clampInteger(cursor?.currentSegmentIndex, 0, 0, Math.max(0, segments.length - 1)),
      targetTypeIndex: clampInteger(cursor?.currentTargetTypeIndex, 0, 0, Math.max(0, targetTypes.length - 1)),
      segmentCount: segments.length,
      targetTypeCount: targetTypes.length,
    });
    const indexes = this.splitFactoryLinearIndex((current + 1) % total, segments.length, targetTypes.length);
    const location = locations[indexes.cityIndex] || locations[0] || { state: null };
    const stateOrder = Array.from(new Set(locations.map((item) => item.state)));
    return {
      currentStateIndex: Math.max(0, stateOrder.indexOf(location.state)),
      currentCityIndex: indexes.cityIndex,
      currentSegmentIndex: indexes.segmentIndex,
      currentTargetTypeIndex: indexes.targetTypeIndex,
    };
  }

  private terminalCampaignStatuses() {
    return ['completed', 'completed_insufficient_results', 'failed', 'canceled'];
  }

  private async summarizeCampaignBatches(campaignId: string) {
    const batches = await (this.prisma as any).webscrapingCampaignBatch.findMany({
      where: { campaignId },
      select: {
        id: true,
        status: true,
        approvedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        errorMessage: true,
        finishedAt: true,
        createdAt: true,
      },
    }).catch(() => []);
    return batches.reduce((acc: any, batch: any) => {
      acc.savedCount += safeInteger(batch.approvedCount);
      acc.duplicateCount += safeInteger(batch.duplicateCount);
      acc.rejectedCount += safeInteger(batch.rejectedCount);
      if (String(batch.status || '').includes('error') || batch.errorMessage) acc.failedCount += 1;
      const at = batch.finishedAt instanceof Date ? batch.finishedAt : batch.createdAt instanceof Date ? batch.createdAt : null;
      if (at && (!acc.latestAt || acc.latestAt.getTime() < at.getTime())) {
        acc.latestAt = at;
        acc.latestBatchId = batch.id;
      }
      if (batch.errorMessage) acc.lastError = batch.errorMessage;
      return acc;
    }, { savedCount: 0, duplicateCount: 0, rejectedCount: 0, failedCount: 0, latestAt: null, latestBatchId: null, lastError: null });
  }

  private async syncRadarFactoryFinishedWork() {
    if (!(await this.supportsRadarFactoryPersistence()) || !(await this.supportsMassDataCampaignPersistence())) return;
    const logs = await (this.prisma as any).radarFactoryWorkLog.findMany({
      where: { status: 'running', campaignId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }).catch(() => []);
    for (const log of logs) {
      const campaign = await (this.prisma as any).webscrapingCampaign.findUnique({
        where: { id: log.campaignId },
      }).catch(() => null);
      if (!campaign || !this.terminalCampaignStatuses().includes(String(campaign.status || ''))) continue;
      const summary = await this.summarizeCampaignBatches(campaign.id);
      const duplicateRatio = summary.duplicateCount / Math.max(1, summary.savedCount + summary.duplicateCount + summary.rejectedCount);
      const failed = String(campaign.status || '') === 'failed' || (summary.failedCount > 0 && summary.savedCount === 0);
      const empty = summary.savedCount <= 0;
      const status = failed
        ? 'failed'
        : empty || String(campaign.status || '') === 'completed_insufficient_results'
          ? 'empty'
          : 'completed';
      await (this.prisma as any).radarFactoryWorkLog.update({
        where: { id: log.id },
        data: {
          runId: summary.latestBatchId || null,
          status,
          savedCount: summary.savedCount,
          duplicateCount: summary.duplicateCount,
          rejectedCount: summary.rejectedCount,
          errorMessage: summary.lastError || campaign.lastErrorMessage || null,
          finishedAt: summary.latestAt || campaign.finishedAt || new Date(),
        },
      }).catch(() => null);

      const cursor = await this.getRadarFactoryCursor();
      if (cursor?.lastCampaignId !== campaign.id) continue;
      const nextFailureCount = failed ? safeInteger(cursor.consecutiveFailureCount) + 1 : 0;
      const nextEmptyCount = empty ? safeInteger(cursor.consecutiveEmptyCount) + 1 : 0;
      const shouldAdvance = !failed || nextFailureCount >= 2 || duplicateRatio >= 0.65 || nextEmptyCount >= 1;
      const nextIndexes = shouldAdvance ? await this.buildNextFactoryCursorIndexes(cursor) : {};
      await (this.prisma as any).radarFactoryCursor.update({
        where: { key: 'main' },
        data: {
          ...nextIndexes,
          status: failed ? 'error' : 'idle',
          lastRunId: summary.latestBatchId || cursor.lastRunId || null,
          lastSavedCount: summary.savedCount,
          lastDuplicateCount: summary.duplicateCount,
          lastRejectedCount: summary.rejectedCount,
          consecutiveEmptyCount: nextEmptyCount,
          consecutiveFailureCount: nextFailureCount,
          lastError: failed ? (summary.lastError || campaign.lastErrorMessage || 'Campanha falhou.') : null,
          reasonStopped: failed
            ? 'Ãšltima campanha falhou. A fÃ¡brica vai tentar novamente ou pular apÃ³s o limite.'
            : duplicateRatio >= 0.65
              ? 'Duplicidade alta. PrÃ³xima missÃ£o deve trocar o eixo.'
              : empty
                ? 'Sem cards novos. PrÃ³xima missÃ£o deve trocar cidade, segmento ou tipo.'
                : null,
          lastWorkedAt: summary.latestAt || campaign.finishedAt || new Date(),
          nextRunAt: new Date(Date.now() + (failed && nextFailureCount < 2 ? 5 * 60_000 : 15_000)),
        },
      }).catch(() => null);
    }
  }

  private async resolveFactorySystemUser(user?: any) {
    if (Number(user?.id || 0) && Number(user?.companyId || user?.masterContext?.companyId || 0)) return user;
    const [systemUser, company] = await Promise.all([
      this.prisma.user.findFirst({
        where: { isActive: true, isSystemMaster: true },
        orderBy: { id: 'asc' },
        select: { id: true, companyId: true, role: true, isSystemMaster: true },
      }).catch(() => null),
      this.prisma.company.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      }).catch(() => null),
    ]);
    if (!systemUser?.id || !company?.id) return null;
    return {
      ...systemUser,
      companyId: Number(systemUser.companyId || company.id),
      masterContext: { active: true, companyId: company.id },
      isSystemMaster: true,
    };
  }

  async ensureNightFactoryWork(user?: any) {
    if (this.radarFactoryPumpActive) return { skipped: true, reason: 'factory_pump_active' };
    if (!(await this.supportsMassDataCampaignPersistence().catch(() => false))) {
      return { skipped: true, reason: 'mass_data_persistence_unavailable' };
    }
    this.radarFactoryPumpActive = true;
    try {
      await this.syncRadarFactoryFinishedWork();
      const cursor = await this.getRadarFactoryCursor();
      if (!cursor.enabled) {
        await (this.prisma as any).radarFactoryCursor?.update?.({
          where: { key: 'main' },
          data: { status: 'paused', reasonStopped: 'FÃ¡brica pausada manualmente.' },
        }).catch(() => null);
        return { skipped: true, reason: 'factory_disabled' };
      }
      const now = new Date();
      if (cursor.nextRunAt instanceof Date && cursor.nextRunAt.getTime() > now.getTime()) {
        return { skipped: true, reason: 'waiting_next_run_at' };
      }
      const config = await this.getOperationalConfig().catch(() => null);
      if (!this.isFactoryAllowedNow(cursor, config, now)) {
        const nextRunAt = this.nextFactoryWindowAt(now);
        await (this.prisma as any).radarFactoryCursor?.update?.({
          where: { key: 'main' },
          data: {
            status: 'idle',
            reasonStopped: 'Fora da janela noturna. Das 08:00 Ã s 20:00 o Radar Digital do cliente tem prioridade.',
            nextRunAt,
          },
        }).catch(() => null);
        return { skipped: true, reason: 'outside_factory_window', nextRunAt };
      }

      const scheduler = await this.getEnginePool().getSchedulerStatus().catch(() => null);
      if (safeInteger(scheduler?.automaticAllowedEngines) <= 0) {
        await (this.prisma as any).radarFactoryCursor?.update?.({
          where: { key: 'main' },
          data: {
            status: 'idle',
            reasonStopped: 'Sem motor disponÃ­vel para a fÃ¡brica sem afetar o Radar Digital.',
            nextRunAt: new Date(Date.now() + 60_000),
          },
        }).catch(() => null);
        return { skipped: true, reason: 'client_reserved_capacity' };
      }

      const activeCampaign = await (this.prisma as any).webscrapingCampaign.findFirst({
        where: {
          mode: 'mass_data',
          status: { in: ['queued', 'running', 'sleeping', 'partial_error'] },
        },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => null);
      if (activeCampaign) {
        const automaticAllowed = safeInteger(scheduler?.automaticAllowedEngines, getConfiguredHbxEngineCount());
        const queuedOrRunning = await (this.prisma as any).webscrapingCampaignTask.count({
          where: { campaignId: activeCampaign.id, status: { in: ['queued', 'running'] } },
        }).catch(() => 0);
        const desiredBacklog = Math.max(automaticAllowed * 2, safeInteger(config?.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS));
        let created = 0;
        if (automaticAllowed > 0 && safeInteger(queuedOrRunning) < desiredBacklog) {
          const refill = await this.createAutonomousMassDataTasks(
            {
              ...activeCampaign,
              targetTotal: desiredBacklog,
              maxAttempts: safeInteger(config?.maxAttemptsPerTask, 3),
            },
            desiredBacklog,
          ).catch(() => null);
          created = safeInteger((refill as any)?.created);
        }
        if (automaticAllowed > 0 && safeInteger(queuedOrRunning) + created < automaticAllowed) {
          this.logger.log(`[radar-factory] campanha ativa com pouca fila (${queuedOrRunning}+${created}/${automaticAllowed}); criando outra missÃ£o para ocupar motores.`);
        } else {
          await (this.prisma as any).radarFactoryCursor?.update?.({
            where: { key: 'main' },
            data: {
              status: 'running',
              lastCampaignId: activeCampaign.id,
              currentState: activeCampaign.state || cursor.currentState || null,
              currentCity: activeCampaign.city || cursor.currentCity || null,
              currentSegment: activeCampaign.segment || cursor.currentSegment || null,
              currentTargetType: activeCampaign.targetType || cursor.currentTargetType || 'pj',
              reasonStopped: null,
              nextRunAt: null,
            },
          }).catch(() => null);
          this.scheduleRadarCampaignPump(0);
          return { skipped: false, reason: 'active_campaign_exists', campaignId: activeCampaign.id };
        }
      }

      const mission = await this.pickRadarFactoryMission(cursor);
      const factoryUser = await this.resolveFactorySystemUser(user);
      if (!mission || !factoryUser) {
        await (this.prisma as any).radarFactoryCursor?.update?.({
          where: { key: 'main' },
          data: {
            status: 'error',
            reasonStopped: 'NÃ£o foi possÃ­vel escolher missÃ£o ou usuÃ¡rio/empresa para a fÃ¡brica.',
            lastError: 'factory_context_unavailable',
            nextRunAt: new Date(Date.now() + 5 * 60_000),
          },
        }).catch(() => null);
        return { skipped: true, reason: 'factory_context_unavailable' };
      }

      const targetTotal = clampInteger(
        process.env.HBX_FACTORY_CAMPAIGN_TARGET_TOTAL,
        safeInteger(config?.autonomousFillBatchSize, AUTONOMOUS_MASS_DATA_DEFAULT_TASKS),
        1,
        AUTONOMOUS_MASS_DATA_MAX_TASKS,
      );
      const campaign = await this.createRadarCampaignForUser(factoryUser, {
        mode: 'mass_data',
        state: mission.state,
        city: mission.city,
        segment: mission.segment,
        targetType: mission.targetType,
        targetTotal,
        batchSize: safeInteger(config?.batchSize, 20),
        maxAttemptsPerTask: safeInteger(config?.maxAttemptsPerTask, 3),
        nightOnly: !(cursor.forcedOn || this.getFactoryGuidedLocation(config)),
        allowedStartHour: this.getFactoryWindowConfig().startHour,
        allowedEndHour: this.getFactoryWindowConfig().endHour,
        timezone: 'America/Sao_Paulo',
      });
      await (this.prisma as any).radarFactoryCursor?.update?.({
        where: { key: 'main' },
        data: {
          ...mission.indexes,
          status: 'running',
          currentState: mission.state,
          currentCity: mission.city,
          currentSegment: mission.segment,
          currentTargetType: mission.targetType,
          lastCampaignId: campaign.id,
          lastRunId: null,
          lastError: null,
          reasonStopped: null,
          lastWorkedAt: new Date(),
          nextRunAt: null,
        },
      }).catch(() => null);
      if (await this.supportsRadarFactoryPersistence()) {
        await (this.prisma as any).radarFactoryWorkLog.create({
          data: {
            state: mission.state,
            city: mission.city,
            segment: mission.segment,
            targetType: mission.targetType,
            campaignId: campaign.id,
            status: 'running',
          },
        }).catch(() => null);
      }
      this.scheduleRadarCampaignPump(0);
      return { skipped: false, reason: 'campaign_created', campaignId: campaign.id, mission };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
      this.logger.warn(`[radar-factory] ensure failed: ${message}`);
      await (this.prisma as any).radarFactoryCursor?.update?.({
        where: { key: 'main' },
        data: {
          status: 'error',
          lastError: message,
          reasonStopped: 'Erro ao criar a prÃ³xima missÃ£o da fÃ¡brica.',
          nextRunAt: new Date(Date.now() + 5 * 60_000),
        },
      }).catch(() => null);
      return { skipped: true, reason: 'factory_error', error: message };
    } finally {
      this.radarFactoryPumpActive = false;
    }
  }

  async startRadarFactory(user: any) {
    const existingConfig = await this.getOperationalConfig().catch(() => null);
    const savedMaxEngines = safeInteger(existingConfig?.factoryMaxEngines, 0);
    const engineCount = Math.min(
      getConfiguredHbxEngineCount(),
      Math.max(0, savedMaxEngines || safeInteger(existingConfig?.engineCount, getConfiguredHbxEngineCount())),
    );
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: true, forcedOn: true, status: 'idle', reasonStopped: null },
        update: { enabled: true, forcedOn: true, status: 'idle', reasonStopped: null, lastError: null, nextRunAt: new Date() },
      }).catch(() => null);
    }
    await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: true,
      forceNow: true,
      emergencyStop: false,
      startHour: 0,
      startMinute: 0,
      endHour: 0,
      endMinute: 0,
      stopOutsideWindow: false,
      weekdaysOnly: false,
      weekendAlwaysOn: false,
      engineCount: Math.max(1, engineCount),
      maxEngines: engineCount,
      minEngines: engineCount,
      memoryTargetGb: 16,
      batchSize: 20,
      maxAttemptsPerTask: 3,
      autonomousFillEnabled: true,
      autonomousFillBatchSize: Math.min(AUTONOMOUS_MASS_DATA_MAX_TASKS, Math.max(AUTONOMOUS_MASS_DATA_DEFAULT_TASKS, engineCount * 4)),
    }).catch(() => null);
    await this.ensureNightFactoryWork(user);
    return this.getRadarFactoryStatus(user);
  }

  async stopRadarFactory(user: any) {
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'FÃ¡brica pausada manualmente.' },
        update: { enabled: false, forcedOn: false, status: 'paused', reasonStopped: 'FÃ¡brica pausada manualmente.', nextRunAt: null },
      }).catch(() => null);
    }
    await this.saveOperationalConfig(Number(user?.id || 0), {
      enabled: false,
      emergencyStop: true,
      forcedUntil: '',
    }).catch(() => null);
    await (this.prisma as any).webscrapingCampaign.updateMany({
      where: { mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error'] } },
      data: { status: 'paused', nextRunAt: null, lastErrorMessage: 'FÃ¡brica desligada manualmente.' },
    }).catch(() => null);
    return this.getRadarFactoryStatus(user);
  }

  async forceNextRadarFactoryMission(user: any) {
    const cursor = await this.getRadarFactoryCursor();
    const nextIndexes = await this.buildNextFactoryCursorIndexes(cursor).catch(() => ({}));
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main', enabled: true, forcedOn: true, status: 'idle', ...nextIndexes, nextRunAt: new Date() },
        update: { enabled: true, forcedOn: true, status: 'idle', ...nextIndexes, nextRunAt: new Date(), reasonStopped: 'PrÃ³xima missÃ£o forÃ§ada pelo MASTER.' },
      }).catch(() => null);
    }
    await this.ensureNightFactoryWork(user);
    return this.getRadarFactoryStatus(user);
  }

  async resetRadarFactoryCursor(user: any) {
    void user;
    if (await this.supportsRadarFactoryPersistence()) {
      await (this.prisma as any).radarFactoryCursor.upsert({
        where: { key: 'main' },
        create: { key: 'main' },
        update: {
          status: 'idle',
          currentState: null,
          currentCity: null,
          currentSegment: null,
          currentTargetType: 'pj',
          currentStateIndex: 0,
          currentCityIndex: 0,
          currentSegmentIndex: 0,
          currentTargetTypeIndex: 0,
          lastCampaignId: null,
          lastRunId: null,
          lastSavedCount: 0,
          lastDuplicateCount: 0,
          lastRejectedCount: 0,
          consecutiveEmptyCount: 0,
          consecutiveFailureCount: 0,
          lastError: null,
          reasonStopped: 'Cursor resetado pelo MASTER.',
          nextRunAt: new Date(),
        },
      }).catch(() => null);
    }
    return this.getRadarFactoryStatus(user);
  }

  async getRadarFactoryStatus(user?: any) {
    await this.syncRadarFactoryFinishedWork().catch(() => null);
    const now = new Date();
    const { start: todayStart, end: todayEnd } = this.getSaoPauloDayRange(now);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const [cursor, scheduler, activeCampaigns, failedRunsToday, cardsSavedToday, cardsSavedLastHour] = await Promise.all([
      this.getRadarFactoryCursor(),
      this.getEnginePool().getSchedulerStatus().catch(() => null),
      (this.prisma as any).webscrapingCampaign?.findMany
        ? (this.prisma as any).webscrapingCampaign.findMany({
            where: { mode: 'mass_data', status: { in: ['queued', 'running', 'sleeping', 'partial_error'] } },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          }).catch(() => [])
        : Promise.resolve([]),
      this.safeDelegateCount('webscrapingSearchRun', 'WebscrapingSearchRun', { status: 'failed', updatedAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool', { createdAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool', { createdAt: { gte: oneHourAgo } }),
    ]);
    const latestCampaign = activeCampaigns[0] || null;
    const duplicateRatio = (safeInteger(cursor.lastDuplicateCount) / Math.max(1, safeInteger(cursor.lastSavedCount) + safeInteger(cursor.lastDuplicateCount) + safeInteger(cursor.lastRejectedCount)));
    const nextMission = await this.buildRadarFactoryNextPreview(cursor).catch(() => null);
    return {
      enabled: Boolean(cursor.enabled),
      forcedOn: Boolean(cursor.forcedOn),
      status: cursor.status || 'idle',
      currentMission: {
        state: cursor.currentState || latestCampaign?.state || null,
        city: cursor.currentCity || latestCampaign?.city || null,
        segment: cursor.currentSegment || latestCampaign?.segment || null,
        targetType: cursor.currentTargetType || latestCampaign?.targetType || 'pj',
      },
      nextMission,
      cardsSavedToday,
      cardsSavedLastHour,
      duplicateRatio,
      failedRunsToday,
      activeCampaigns: activeCampaigns.map((campaign: any) => this.buildRadarCampaignResponse(campaign)),
      activeEngines: safeInteger(scheduler?.automaticAllowedEngines),
      reservedClientEngines: safeInteger(scheduler?.manualReservedEngines),
      schedule: scheduler?.factory || null,
      reasonStopped: cursor.reasonStopped || null,
      lastError: cursor.lastError || null,
      cursor: {
        currentStateIndex: safeInteger(cursor.currentStateIndex),
        currentCityIndex: safeInteger(cursor.currentCityIndex),
        currentSegmentIndex: safeInteger(cursor.currentSegmentIndex),
        currentTargetTypeIndex: safeInteger(cursor.currentTargetTypeIndex),
        lastCampaignId: cursor.lastCampaignId || null,
        lastRunId: cursor.lastRunId || null,
        lastSavedCount: safeInteger(cursor.lastSavedCount),
        lastDuplicateCount: safeInteger(cursor.lastDuplicateCount),
        lastRejectedCount: safeInteger(cursor.lastRejectedCount),
        consecutiveEmptyCount: safeInteger(cursor.consecutiveEmptyCount),
        consecutiveFailureCount: safeInteger(cursor.consecutiveFailureCount),
        lastWorkedAt: this.serializeAuditDate(cursor.lastWorkedAt),
        nextRunAt: this.serializeAuditDate(cursor.nextRunAt),
      },
      protection: {
        clientPriorityActive: Boolean(scheduler?.clientPriorityActive),
        manualReservedEngines: safeInteger(scheduler?.manualReservedEngines),
        automaticAllowedEngines: safeInteger(scheduler?.automaticAllowedEngines),
        reason: scheduler?.factory?.reason || null,
        windowStatus: scheduler?.factory?.windowStatus || null,
        maxEngines: scheduler?.factory?.maxEngines ?? null,
        memoryGuardEngines: scheduler?.factory?.memoryGuardEngines ?? null,
        message: safeInteger(scheduler?.manualReservedEngines) > 0
          ? 'Radar Digital tem motores reservados; a fÃ¡brica usa apenas o excedente.'
          : 'Radar Digital sem reserva configurada. Ajuste HBX_CLIENT_RESERVED_ENGINES.',
      },
      generatedAt: now.toISOString(),
    };
  }

  private buildEngineMeaning(input: {
    engine: any;
    hasActiveMission: boolean;
    cardsLast10Min: number;
    duplicatesToday: number;
    rejectedToday: number;
  }) {
    const status = String(input.engine?.status || '').trim().toLowerCase();
    const health = String(input.engine?.lastHealthStatus || '').trim().toLowerCase();
    const pausedUntil = input.engine?.pausedUntil instanceof Date ? input.engine.pausedUntil.getTime() : 0;
    const cooldownUntil = input.engine?.cooldownUntil instanceof Date ? input.engine.cooldownUntil.getTime() : 0;
    if (input.engine?.manualPaused || status === 'paused' || pausedUntil > Date.now()) return 'Pausado';
    if (status === 'offline' || health === 'offline') return 'Offline';
    if (status === 'cooldown' || cooldownUntil > Date.now()) return 'Em cooldown';
    if (status === 'busy' || input.engine?.lockedRunId) {
      if (input.cardsLast10Min > 0) return 'Salvando no banco';
      return 'Procurando cards';
    }
    if (input.engine?.lastError || status === 'degraded') return 'Erro no Ãºltimo lote';
    if (input.hasActiveMission) return 'Aguardando fila';
    return 'Sem missÃ£o ativa';
  }

  async getMasterDatabaseAudit(user?: any) {
    void user;
    await this.syncRadarFactoryFinishedWork().catch(() => null);
    const now = new Date();
    const { start: todayStart, end: todayEnd } = this.getSaoPauloDayRange(now);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);
    const negativeStatuses = ['negative', 'denied', 'blocked', 'opt_out', 'discarded', 'complaint', 'no_answer', 'no_whatsapp', 'invalid_whatsapp', 'hidden'];

    const [
      totalCards,
      cardsToday,
      cardsLastHour,
      cardsLast10Min,
      totalCompanyStates,
      negatives,
      sentToVendas,
      duplicatedItemsToday,
      rejectedItemsToday,
      campaignsQueued,
      campaignsRunning,
      campaignsCompletedToday,
      campaignsFailedToday,
      searchRunsQueued,
      searchRunsRunning,
      searchRunsFailedToday,
      searchRunsCompletedToday,
      foundItemsToday,
      latestCardsRaw,
      engineRowsRaw,
      factoryStatus,
      scheduler,
    ] = await Promise.all([
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool'),
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool', { createdAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool', { createdAt: { gte: oneHourAgo } }),
      this.safeDelegateCount('radarLeadPool', 'RadarLeadPool', { createdAt: { gte: tenMinutesAgo } }),
      this.safeDelegateCount('radarLeadCompanyState', 'RadarLeadCompanyState'),
      this.safeDelegateCount('radarLeadCompanyState', 'RadarLeadCompanyState', { status: { in: negativeStatuses as any } }),
      this.safeDelegateCount('radarLeadCompanyState', 'RadarLeadCompanyState', { status: 'sent_to_vendas' }),
      this.safeDelegateCount('webscrapingSearchRunItem', 'WebscrapingSearchRunItem', { status: 'duplicate', createdAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingSearchRunItem', 'WebscrapingSearchRunItem', { status: { in: ['skipped', 'invalid'] }, createdAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingCampaign', 'WebscrapingCampaign', { status: 'queued' }),
      this.safeDelegateCount('webscrapingCampaign', 'WebscrapingCampaign', { status: { in: ['running', 'sleeping', 'partial_error'] } }),
      this.safeDelegateCount('webscrapingCampaign', 'WebscrapingCampaign', { status: { in: ['completed', 'completed_insufficient_results'] }, updatedAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingCampaign', 'WebscrapingCampaign', { status: 'failed', updatedAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingSearchRun', 'WebscrapingSearchRun', { status: 'queued' }),
      this.safeDelegateCount('webscrapingSearchRun', 'WebscrapingSearchRun', { status: 'running' }),
      this.safeDelegateCount('webscrapingSearchRun', 'WebscrapingSearchRun', { status: 'failed', updatedAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingSearchRun', 'WebscrapingSearchRun', { status: { in: ['completed', 'completed_insufficient_results', 'partial_error'] }, updatedAt: { gte: todayStart, lt: todayEnd } }),
      this.safeDelegateCount('webscrapingSearchRunItem', 'WebscrapingSearchRunItem', { status: 'found', createdAt: { gte: todayStart, lt: todayEnd } }),
      (this.prisma as any).radarLeadPool?.findMany
        ? (this.prisma as any).radarLeadPool.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              name: true,
              phone: true,
              city: true,
              state: true,
              segment: true,
              website: true,
              websiteStatus: true,
              opportunityScore: true,
              sourceEngines: true,
              createdAt: true,
              updatedAt: true,
            },
          }).catch(() => [])
        : Promise.resolve([]),
      this.prisma.hasTable('HbxEngineLock').then((hasTable) => hasTable
        ? (this.prisma as any).hbxEngineLock.findMany({ orderBy: { engineIndex: 'asc' } }).catch(() => [])
        : []).catch(() => []),
      this.getRadarFactoryStatus(user).catch(() => null),
      this.getEnginePool().getSchedulerStatus().catch(() => null),
    ]);

    const hasActiveMission = campaignsQueued + campaignsRunning + searchRunsQueued + searchRunsRunning > 0;
    const batchRows = (this.prisma as any).webscrapingCampaignBatch?.findMany
      ? await (this.prisma as any).webscrapingCampaignBatch.findMany({
          where: {
            engineId: { not: null },
            OR: [
              { createdAt: { gte: todayStart, lt: todayEnd } },
              { finishedAt: { gte: todayStart, lt: todayEnd } },
            ],
          },
          select: {
            engineId: true,
            approvedCount: true,
            duplicateCount: true,
            rejectedCount: true,
            createdAt: true,
            finishedAt: true,
          },
        }).catch(() => [])
      : [];
    const itemRows = (this.prisma as any).webscrapingSearchRunItem?.findMany
      ? await (this.prisma as any).webscrapingSearchRunItem.findMany({
          where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { in: ['found', 'duplicate', 'skipped', 'invalid'] } },
          select: { status: true, createdAt: true, run: { select: { assignedEngineId: true } } },
          take: 2000,
        }).catch(() => [])
      : [];
    const engineStats = new Map<string, { cardsToday: number; cardsLast10Min: number; duplicatesToday: number; rejectedToday: number }>();
    const ensureEngineStats = (engineId: string) => {
      const current = engineStats.get(engineId);
      if (current) return current;
      const created = { cardsToday: 0, cardsLast10Min: 0, duplicatesToday: 0, rejectedToday: 0 };
      engineStats.set(engineId, created);
      return created;
    };
    for (const batch of batchRows) {
      const engineId = String(batch.engineId || '').trim();
      if (!engineId) continue;
      const stats = ensureEngineStats(engineId);
      const approved = safeInteger(batch.approvedCount);
      stats.cardsToday += approved;
      stats.duplicatesToday += safeInteger(batch.duplicateCount);
      stats.rejectedToday += safeInteger(batch.rejectedCount);
      const at = batch.finishedAt instanceof Date ? batch.finishedAt : batch.createdAt instanceof Date ? batch.createdAt : null;
      if (at && at >= tenMinutesAgo) stats.cardsLast10Min += approved;
    }
    for (const item of itemRows) {
      const engineId = String(item?.run?.assignedEngineId || '').trim();
      if (!engineId) continue;
      const stats = ensureEngineStats(engineId);
      if (item.status === 'found') {
        stats.cardsToday += 1;
        if (item.createdAt instanceof Date && item.createdAt >= tenMinutesAgo) stats.cardsLast10Min += 1;
      }
      if (item.status === 'duplicate') stats.duplicatesToday += 1;
      if (item.status === 'skipped' || item.status === 'invalid') stats.rejectedToday += 1;
    }

    const engineRows = Array.isArray(engineRowsRaw) ? engineRowsRaw : [];
    const motoresRegistrados = engineRows.length;
    const motoresOnline = engineRows.filter((engine: any) => !['offline', 'inactive'].includes(String(engine.status || '').toLowerCase()) && String(engine.lastHealthStatus || '') !== 'offline').length;
    const motoresBusy = engineRows.filter((engine: any) => String(engine.status || '').toLowerCase() === 'busy' || engine.lockedRunId).length;
    const motoresStandby = engineRows.filter((engine: any) => ['standby', 'online'].includes(String(engine.status || '').toLowerCase()) && !engine.lockedRunId).length;
    const motoresCooldown = engineRows.filter((engine: any) => String(engine.status || '').toLowerCase() === 'cooldown').length;
    const motoresErro = engineRows.filter((engine: any) => ['offline', 'degraded'].includes(String(engine.status || '').toLowerCase()) || engine.lastError).length;
    const motoresPausados = engineRows.filter((engine: any) => engine.manualPaused || String(engine.status || '').toLowerCase() === 'paused').length;

    const engines = engineRows.map((engine: any) => {
      const stats = engineStats.get(engine.id) || { cardsToday: 0, cardsLast10Min: 0, duplicatesToday: 0, rejectedToday: 0 };
      return {
        id: engine.id,
        engineIndex: engine.engineIndex,
        status: engine.status,
        lastHealthStatus: engine.lastHealthStatus || null,
        lockedRunId: engine.lockedRunId || null,
        lastError: engine.lastError || null,
        lastUsedAt: this.serializeAuditDate(engine.lastUsedAt),
        cooldownUntil: this.serializeAuditDate(engine.cooldownUntil),
        manualPaused: Boolean(engine.manualPaused),
        pausedUntil: this.serializeAuditDate(engine.pausedUntil),
        cardsLast10Min: stats.cardsLast10Min,
        cardsToday: stats.cardsToday,
        duplicatesToday: stats.duplicatesToday,
        rejectedToday: stats.rejectedToday,
        currentMeaning: this.buildEngineMeaning({ engine, hasActiveMission, ...stats }),
      };
    });

    const summary = {
      totalCards,
      cardsToday,
      cardsLastHour,
      cardsLast10Min,
      totalCompanyStates,
      negatives,
      sentToVendas,
      duplicatedItemsToday,
      rejectedItemsToday,
      campaignsQueued,
      campaignsRunning,
      campaignsCompletedToday,
      campaignsFailedToday,
      searchRunsQueued,
      searchRunsRunning,
      searchRunsFailedToday,
      searchRunsCompletedToday,
      motoresRegistrados,
      motoresOnline,
      motoresBusy,
      motoresStandby,
      motoresCooldown,
      motoresErro,
      motoresPausados,
    };

    const diagnostics: string[] = [];
    if (totalCards === 0) diagnostics.push('Nenhum card salvo no banco. Motor ligado nÃ£o significa card salvo.');
    if (motoresOnline > 0 && cardsLast10Min === 0) diagnostics.push('Motores vivos, mas sem produÃ§Ã£o recente.');
    if (campaignsQueued + campaignsRunning === 0) diagnostics.push('Motores acordados, mas sem missÃ£o ativa. A fÃ¡brica precisa criar a prÃ³xima campanha.');
    if (campaignsQueued + campaignsRunning === 0 && campaignsCompletedToday > 0) diagnostics.push('Todas as campanhas terminaram. Falta continuar automaticamente de onde parou.');
    if (searchRunsFailedToday > Math.max(3, searchRunsCompletedToday)) diagnostics.push('Muitas buscas falharam. Verificar motor, fila, timeout ou origem de scraping.');
    if (duplicatedItemsToday > Math.max(10, foundItemsToday)) diagnostics.push('Muitos duplicados. Trocar cidade, segmento ou tipo.');
    if (foundItemsToday > 0 && cardsToday === 0) diagnostics.push('Itens encontrados, mas persistÃªncia no RadarLeadPool pode estar falhando.');
    if (safeInteger(scheduler?.manualReservedEngines) <= 0) diagnostics.push('Radar Digital do cliente sem reserva de motor. Risco de 500/timeout.');
    if (scheduler?.factory?.reason) diagnostics.push(`FÃ¡brica: ${scheduler.factory.reason}; permitidos=${safeInteger(scheduler.automaticAllowedEngines)}; janela=${scheduler.factory.windowStatus}; max=${scheduler.factory.maxEngines}; memÃ³ria=${scheduler.factory.memoryPressurePercent}%.`);
    if (!diagnostics.length) diagnostics.push('Sem bloqueio crÃ­tico detectado agora.');

    const factoryCursor = factoryStatus?.cursor || {};
    const factory = {
      enabled: Boolean(factoryStatus?.enabled),
      status: factoryStatus?.status || 'idle',
      currentState: factoryStatus?.currentMission?.state || null,
      currentCity: factoryStatus?.currentMission?.city || null,
      currentSegment: factoryStatus?.currentMission?.segment || null,
      currentTargetType: factoryStatus?.currentMission?.targetType || 'pj',
      lastCampaignId: factoryCursor.lastCampaignId || null,
      lastRunId: factoryCursor.lastRunId || null,
      lastSavedCount: safeInteger(factoryCursor.lastSavedCount),
      lastDuplicateCount: safeInteger(factoryCursor.lastDuplicateCount),
      lastRejectedCount: safeInteger(factoryCursor.lastRejectedCount),
      consecutiveEmptyCount: safeInteger(factoryCursor.consecutiveEmptyCount),
      consecutiveFailureCount: safeInteger(factoryCursor.consecutiveFailureCount),
      lastError: factoryStatus?.lastError || null,
      lastWorkedAt: factoryCursor.lastWorkedAt || null,
      nextRunAt: factoryCursor.nextRunAt || null,
      reasonStopped: factoryStatus?.reasonStopped || null,
      nextMissionPreview: factoryStatus?.nextMission || null,
      schedule: scheduler?.factory || null,
    };

    const clientProtection = {
      reservedEngines: safeInteger(scheduler?.manualReservedEngines),
      clientPriorityActive: Boolean(scheduler?.clientPriorityActive),
      radarDigitalActiveRequests: scheduler?.manualDemandActive ? 1 : 0,
      factoryAllowedEngines: safeInteger(scheduler?.automaticAllowedEngines),
      manualReservedEngines: safeInteger(scheduler?.manualReservedEngines),
      automaticAllowedEngines: safeInteger(scheduler?.automaticAllowedEngines),
      factoryReason: scheduler?.factory?.reason || null,
      factoryWindowStatus: scheduler?.factory?.windowStatus || null,
      factoryMaxEngines: scheduler?.factory?.maxEngines ?? null,
      factoryMemoryGuardEngines: scheduler?.factory?.memoryGuardEngines ?? null,
      factoryNextStartAt: scheduler?.factory?.nextStartAt || null,
      factoryNextStopAt: scheduler?.factory?.nextStopAt || null,
      factoryEmergencyStop: Boolean(scheduler?.factory?.emergencyStop),
      message: safeInteger(scheduler?.manualReservedEngines) > 0
        ? 'Radar Digital protegido: a fÃ¡brica nÃ£o pode consumir os motores reservados do cliente.'
        : 'Radar Digital sem reserva configurada. Configure HBX_CLIENT_RESERVED_ENGINES=2.',
    };

    return {
      generatedAt: now.toISOString(),
      summary,
      latestCards: (latestCardsRaw || []).map((card: any) => ({
        id: card.id,
        name: card.name,
        phone: card.phone || null,
        city: card.city || null,
        state: card.state || null,
        segment: card.segment || null,
        website: card.website || null,
        websiteStatus: card.websiteStatus || null,
        opportunityScore: safeInteger(card.opportunityScore),
        sourceEngines: this.parseSourceEngines(card.sourceEngines),
        createdAt: this.serializeAuditDate(card.createdAt),
        updatedAt: this.serializeAuditDate(card.updatedAt),
      })),
      engines,
      factory,
      clientProtection,
      diagnostics,
    };
  }

  async listMasterDatabaseCards(user: any, input: RadarFiltersInput & { companyId?: number | null } = {}) {
    void user;
    if (!(await this.supportsRadarPersistence())) {
      return {
        items: [],
        total: 0,
        meta: {
          available: false,
          message: 'Banco do Radar ainda nao foi migrado neste ambiente.',
        },
      };
    }

    const targetCompanyId = Math.trunc(Number((input as any)?.companyId || 0)) || null;
    const targetTypeRaw = String((input as any)?.targetType || '').trim().toLowerCase();
    const includeAllTargetTypes = !targetTypeRaw || targetTypeRaw === 'both';
    const filters = this.normalizeRadarFilters({
      ...input,
      engine: undefined,
      targetType: includeAllTargetTypes ? 'pj' : input.targetType,
      includeHidden: targetCompanyId ? input.includeHidden : true,
    });
    const page = filters.page;
    const requestedLimit = Math.trunc(Number((input as any)?.limit || filters.limit) || filters.limit);
    const limit = Math.min(Math.max(requestedLimit, 1), 2000);
    const offset = (page - 1) * limit;
    const readLimit = Math.min(Math.max(limit * 10, 500), 5000);
    const companyStateSelect = {
      companyId: true,
      status: true,
      vendasLeadId: true,
      lastActionAt: true,
      noAnswerCount: true,
      contactedCount: true,
      lastContactAt: true,
      complaintReason: true,
      deniedReason: true,
      assignedUserId: true,
      assignedByUserId: true,
      assignedAt: true,
    };
    const hasExplicitFilters = Boolean(
      targetCompanyId
      || filters.normalizedCity
      || filters.state
      || filters.normalizedSegment
      || filters.filterKey
      || filters.status
      || filters.ddd
      || filters.scoreRange
      || filters.source
      || filters.minRating != null
      || filters.minReviews != null
      || filters.noWebsite
      || filters.withWebsite
      || filters.weakWebsite
      || filters.validPhone
      || filters.likelyWhatsapp
      || filters.opportunityLevel
      || (!includeAllTargetTypes && filters.targetType !== 'pj')
    );

    if (!hasExplicitFilters) {
      const where = this.buildRadarWhere(filters, null, { includeHidden: true });
      const [total, rows] = await Promise.all([
        (this.prisma as any).radarLeadPool.count({ where }).catch(() => 0),
        (this.prisma as any).radarLeadPool.findMany({
          where,
          orderBy: [
            { createdAt: 'desc' },
            { opportunityScore: 'desc' },
            { lastSeenAt: 'desc' },
          ],
          skip: offset,
          take: limit,
          include: {
            companyStates: {
              orderBy: { updatedAt: 'desc' },
              take: 3,
              select: companyStateSelect,
            },
            events: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                eventType: true,
                note: true,
                createdAt: true,
              },
            },
          },
        }).catch(() => []),
      ]);

      return {
        items: (rows || []).map((row: any) => ({
          ...this.buildRadarLeadPublic(row),
          targetType: this.resolveRadarLeadTargetType(row),
        })),
        total,
        meta: {
          available: true,
          page,
          limit,
          companyId: null,
          includeAllTargetTypes: true,
          truncated: false,
          filters: {
            city: '',
            state: '',
            segment: '',
            targetType: 'both',
            status: null,
            filterKey: null,
            ddd: null,
            scoreRange: null,
            noWebsite: false,
            highOpportunity: false,
          },
        },
      };
    }

    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: this.buildRadarWhere(filters, targetCompanyId, {
        includeHidden: !targetCompanyId || filters.includeHidden,
      }),
      orderBy: [
        { createdAt: 'desc' },
        { opportunityScore: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: readLimit,
      include: {
        companyStates: targetCompanyId
          ? {
              where: { companyId: targetCompanyId },
              take: 1,
              select: companyStateSelect,
            }
          : {
              orderBy: { updatedAt: 'desc' },
              take: 3,
              select: companyStateSelect,
            },
        events: targetCompanyId
          ? {
              where: { OR: [{ companyId: targetCompanyId }, { companyId: null }] },
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                eventType: true,
                note: true,
                createdAt: true,
              },
            }
          : {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                eventType: true,
                note: true,
                createdAt: true,
              },
            },
      },
    }).catch(() => []);

    const filteredRows = includeAllTargetTypes
      ? (rows || []).filter((row: any) => (
          this.filterRadarRowsInMemory([{ ...row, companyStates: row.companyStates || [], __master: true }], {
            ...filters,
            targetType: this.resolveRadarLeadTargetType(row),
          }).length > 0
        ))
      : this.filterRadarRowsInMemory(rows || [], filters);
    const dedupedRows = this.dedupeRadarRows(filteredRows);
    const pageRows = dedupedRows.slice(offset, offset + limit);

    return {
      items: pageRows.map((row) => ({
        ...this.buildRadarLeadPublic(row),
        targetType: this.resolveRadarLeadTargetType(row),
      })),
      total: dedupedRows.length,
      meta: {
        available: true,
        page,
        limit,
        companyId: targetCompanyId,
        includeAllTargetTypes,
        truncated: (rows || []).length >= readLimit,
        filters: {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          targetType: includeAllTargetTypes ? 'both' : filters.targetType,
          status: filters.status || null,
          filterKey: filters.filterKey || null,
          ddd: filters.ddd || null,
          scoreRange: filters.scoreRange || null,
          noWebsite: filters.noWebsite,
          highOpportunity: filters.opportunityLevel === 'high',
        },
      },
    };
  }

  async permanentDeleteMasterDatabaseCards(user: any, input: RadarFiltersInput & { companyId?: number | null; leadIds?: string[] } = {}) {
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }

    const masterUserId = Math.trunc(Number(user?.id || 0)) || null;
    const leadIds = Array.from(new Set((Array.isArray(input.leadIds) ? input.leadIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))).slice(0, 2000);
    if (!leadIds.length) throw new BadRequestException('Nenhum card selecionado para exclusao em massa.');

    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { id: { in: leadIds } },
      select: {
        id: true,
        placeId: true,
        phone: true,
        phoneDigits: true,
        name: true,
        companyId: true,
        ownerCompanyId: true,
      },
      take: 2000,
    }).catch(() => []);

    const ids = Array.from(new Set((rows || []).map((row: any) => String(row.id || '')).filter(Boolean)));
    if (!ids.length) return { ok: true, affected: 0, searchHistoryPlaces: 0, searchRunItems: 0, enrichments: 0, recoveryItems: 0 };

    const placeIds = Array.from(new Set((rows || []).map((row: any) => String(row.placeId || '').trim()).filter(Boolean)));
    const phoneDigits = Array.from(new Set((rows || [])
      .flatMap((row: any) => {
        const digits = normalizePhoneDigits(row.phoneDigits || row.phone);
        if (!digits) return [];
        return digits.startsWith('55') ? [digits, digits.slice(2)] : [digits, `55${digits}`];
      })
      .filter(Boolean) as string[]));
    const cardIdentityOr = [
      ...(phoneDigits.length ? [{ phoneDigits: { in: phoneDigits } }] : []),
      ...(placeIds.length ? [{ placeId: { in: placeIds } }] : []),
    ];

    let searchHistoryPlaces = 0;
    if (cardIdentityOr.length && (this.prisma as any).webscrapingSearchPlace?.deleteMany) {
      const result = await (this.prisma as any).webscrapingSearchPlace.deleteMany({
        where: { OR: cardIdentityOr },
      }).catch(() => ({ count: 0 }));
      searchHistoryPlaces = Number(result?.count || 0);
    }

    let searchRunItems = 0;
    if (cardIdentityOr.length && (this.prisma as any).webscrapingSearchRunItem?.deleteMany) {
      const result = await (this.prisma as any).webscrapingSearchRunItem.deleteMany({
        where: { OR: cardIdentityOr },
      }).catch(() => ({ count: 0 }));
      searchRunItems = Number(result?.count || 0);
    }

    let enrichments = 0;
    if ((this.prisma as any).radarLeadEnrichment?.deleteMany) {
      const result = await (this.prisma as any).radarLeadEnrichment.deleteMany({
        where: { OR: [{ radarLeadId: { in: ids } }, { sourceLeadPoolId: { in: ids } }] },
      }).catch(() => ({ count: 0 }));
      enrichments = Number(result?.count || 0);
    }

    let recoveryItems = 0;
    if ((this.prisma as any).recoveryOpportunity?.deleteMany) {
      const result = await (this.prisma as any).recoveryOpportunity.deleteMany({
        where: { sourceType: 'radar', sourceId: { in: ids } },
      }).catch(() => ({ count: 0 }));
      recoveryItems = Number(result?.count || 0);
    }

    const deleted = await (this.prisma as any).radarLeadPool.deleteMany({
      where: { id: { in: ids } },
    }).catch(() => ({ count: 0 }));

    await this.masterContextService.registerSupportAction({
      masterUserId: masterUserId || 0,
      companyId: null,
      scope: 'master_database',
      action: 'RADAR_DATABASE_CARDS_MASS_DELETED',
      severity: 'WARN',
      metadata: {
        requestedCount: leadIds.length,
        affected: Number(deleted?.count || 0),
        searchHistoryPlaces,
        searchRunItems,
        enrichments,
        recoveryItems,
      },
    }).catch(() => null);

    return {
      ok: true,
      affected: Number(deleted?.count || 0),
      searchHistoryPlaces,
      searchRunItems,
      enrichments,
      recoveryItems,
    };
  }

  async listMasterRadarExportTargets() {
    const rows = await (this.prisma as any).user.findMany({
      where: {
        isActive: true,
        isSystemMaster: false,
        companyId: { not: null },
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { companyId: 'asc' },
        { name: 'asc' },
        { email: 'asc' },
      ],
      take: 500,
    }).catch(() => []);

    return {
      items: (rows || [])
        .filter((row: any) => row?.companyId && row?.company?.isActive !== false)
        .map((row: any) => {
          const userName = String(row.name || row.username || row.email || `Usuario ${row.id}`).trim();
          const companyName = String(row.company?.name || `Empresa ${row.companyId}`).trim();
          return {
            userId: row.id,
            userName,
            userEmail: row.email || null,
            companyId: row.companyId,
            companyName,
            label: `${userName} - ${companyName}`,
          };
        }),
    };
  }

  async exportRadarCardsToTarget(
    masterUser: any,
    input: { leadIds?: string[]; userId?: number | null; companyId?: number | null } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const leadIds = Array.from(new Set((Array.isArray(input.leadIds) ? input.leadIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))).slice(0, 500);
    if (!leadIds.length) throw new BadRequestException('Selecione pelo menos um card para exportar.');

    const requestedUserId = Math.trunc(Number(input.userId || 0)) || null;
    const requestedCompanyId = Math.trunc(Number(input.companyId || 0)) || null;
    let targetUser: any = null;
    let targetCompany: any = null;
    if (requestedUserId) {
      targetUser = await (this.prisma as any).user.findFirst({
        where: { id: requestedUserId, isActive: true },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          companyId: true,
          company: { select: { id: true, name: true, isActive: true } },
        },
      });
      if (!targetUser?.companyId || targetUser?.company?.isActive === false) {
        throw new BadRequestException('Usuario de destino invalido ou sem empresa ativa.');
      }
      targetCompany = targetUser.company;
    } else if (requestedCompanyId) {
      targetCompany = await (this.prisma as any).company.findFirst({
        where: { id: requestedCompanyId, isActive: true },
        select: { id: true, name: true, isActive: true },
      });
      if (!targetCompany?.id) throw new BadRequestException('Empresa de destino invalida.');
    } else {
      throw new BadRequestException('Informe um usuario ou empresa de destino.');
    }

    const targetCompanyId = Number(targetUser?.companyId || targetCompany?.id || 0);
    const assignedUserId = targetUser?.id || null;
    const masterUserId = Math.trunc(Number(masterUser?.id || 0)) || null;
    const now = new Date();
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { id: { in: leadIds } },
      include: {
        companyStates: {
          where: { companyId: targetCompanyId },
          take: 1,
          select: {
            status: true,
            assignedUserId: true,
          },
        },
      },
    }).catch(() => []);

    let exportedCount = 0;
    let skippedCount = 0;
    let protectedCount = 0;
    const exportedIds: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const row of rows || []) {
      const existing = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      const existingStatus = this.normalizeRadarLeadStatus(existing?.status || row?.status);
      const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
      if (ownerCompanyId && ownerCompanyId !== targetCompanyId) {
        skippedCount += 1;
        protectedCount += 1;
        skipped.push({ id: row.id, reason: 'owned_by_other_company' });
        continue;
      }
      if (this.isRadarProtectedStatus(existing?.status || row?.status) || existingStatus === 'sent_to_vendas') {
        skippedCount += 1;
        protectedCount += 1;
        skipped.push({ id: row.id, reason: existingStatus });
        continue;
      }
      const nextStatus = existingStatus && !['clean', 'new'].includes(existingStatus) ? existingStatus : 'reserved';
      await this.claimRadarLeadForCompany(
        { companyId: targetCompanyId, userId: masterUserId || 0 } as SearchExecutionContext,
        row,
        {
          poolStatus: nextStatus,
          companyStatus: nextStatus,
          eventType: 'status_changed',
          note: assignedUserId
            ? `Exportado pelo MASTER para usuario ${assignedUserId}.`
            : `Exportado pelo MASTER para empresa ${targetCompanyId}.`,
          assignedUserId,
          assignedByUserId: masterUserId,
        },
      );
      exportedCount += 1;
      exportedIds.push(row.id);
    }
    skippedCount += Math.max(0, leadIds.length - (rows || []).length);

    return {
      ok: true,
      exportedCount,
      skippedCount,
      protectedCount,
      exportedIds,
      skipped,
      target: {
        userId: assignedUserId,
        userName: targetUser ? String(targetUser.name || targetUser.username || targetUser.email || '').trim() : null,
        companyId: targetCompanyId,
        companyName: targetCompany?.name || null,
      },
    };
  }

  buildRadarClientErrorResponse(user: any, route: string, error: unknown) {
    const status = Number((error as any)?.status || (error as any)?.statusCode || 500);
    const rawCode = String((error as any)?.response?.code || (error as any)?.code || '').trim();
    const code = rawCode
      || (status === 404 && route.includes('/webscraping/radar/search-runs/:id') ? 'RADAR_RUN_NOT_FOUND'
        : status === 403 ? 'MODULE_ACCESS_DENIED'
          : status === 400 ? 'RADAR_INVALID_FILTER'
            : 'RADAR_TEMPORARILY_UNAVAILABLE');
    const message = code === 'MODULE_ACCESS_DENIED'
      ? 'Acesso ao Radar Digital indisponÃ­vel para este usuÃ¡rio.'
      : code === 'SELLER_CARD_QUOTA_REACHED' || code === 'SELLER_QUOTA_PAUSED'
        ? String((error as any)?.response?.message || 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.')
      : code === 'NO_ENGINE_AVAILABLE'
        ? 'Motores ocupados. O sistema manteve sua busca na fila.'
        : code === 'RADAR_RUN_NOT_FOUND'
          ? 'Busca anterior encerrada. Radar pronto para uma nova pesquisa.'
          : code === 'RADAR_STOCK_EMPTY'
            ? 'Sem cards prontos para esse filtro. A reposiÃ§Ã£o foi solicitada.'
            : status === 400
              ? (error instanceof Error ? error.message : 'Revise os filtros do Radar Digital.')
              : 'Radar temporariamente indisponÃ­vel. Tente novamente em instantes.';
    const companyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0) || null;
    const userId = Number(user?.id || 0) || null;
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.warn(`[radar-digital] route=${route} status=${status} code=${code} userId=${userId || '-'} companyId=${companyId || '-'} error=${error instanceof Error ? error.message : String(error || '')}`);
    if (stack) this.logger.debug?.(`[radar-digital] stack route=${route} ${stack}`);
    return {
      items: [],
      total: 0,
      code,
      message,
      retryable: code !== 'RADAR_RUN_NOT_FOUND' && (status >= 500 || code === 'NO_ENGINE_AVAILABLE' || code === 'RADAR_STOCK_EMPTY'),
      meta: {
        available: false,
        route,
        status,
        activeCount: (error as any)?.response?.activeCount ?? null,
        effectiveLimit: (error as any)?.response?.effectiveLimit ?? null,
        availableSlots: (error as any)?.response?.availableSlots ?? null,
      },
    };
  }
}
