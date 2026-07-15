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
import { RadarCnpjPublicSourceService } from './radar-cnpj-public-source.service';

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

// Furo 01/07 (docs/PLANEJAMENTOS/PR01072026/60-receita-no-run-cliente.md): run de cliente só
// falava com o motor web — a fonte cnpj_public (Receita) era inalcançável nesse fluxo. Marca em
// memória (por runId) quando a fonte já rodou 1x neste batch OU devolveu 0 aceitos no run, pra
// não repetir discovery/dataset a cada batch. Sem hook de "run concluiu" disponível sem tocar no
// loop de elasticidade (fora de escopo aqui) — limpeza best-effort por TTL: entradas mais velhas
// que RADAR_CNPJ_PUBLIC_STATE_TTL_MS são descartadas na próxima leitura/escrita do mesmo runId,
// e o Map nunca cresce sem limite porque cada leitura varre e descarta o que expirou.
const RADAR_CNPJ_PUBLIC_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const radarCnpjPublicClientRunState = new Map<string, { ranThisRun: boolean; zeroAccepted: boolean; updatedAt: number }>();

function pruneRadarCnpjPublicClientRunState(now: number) {
  for (const [key, value] of radarCnpjPublicClientRunState) {
    if (now - value.updatedAt > RADAR_CNPJ_PUBLIC_STATE_TTL_MS) {
      radarCnpjPublicClientRunState.delete(key);
    }
  }
}

function sanitizeRadarPostSaveInput(input: NormalizedSearchInput) {
  const filters = input?.filters || ({} as any);
  const allowedChannels = new Set(['whatsapp', 'instagram', 'email', 'website', 'phone', 'facebook']);
  const channelMatchMode = ['prefer', 'any_required', 'all_required'].includes(String(input?.channelMatchMode))
    ? input.channelMatchMode
    : 'prefer';
  const freshness = ['live', 'database_first', 'hybrid'].includes(String(input?.freshness)) ? input.freshness : 'live';
  return {
    city: String(input?.city || '').trim(),
    state: String(input?.state || '').trim().toUpperCase(),
    segment: String(input?.segment || '').trim(),
    radiusKm: Number(input?.radiusKm) || 0,
    originLat: input?.originLat == null ? null : Number.isFinite(Number(input.originLat)) ? Number(input.originLat) : null,
    originLng: input?.originLng == null ? null : Number.isFinite(Number(input.originLng)) ? Number(input.originLng) : null,
    regionalCities: (Array.isArray(input?.regionalCities) ? input.regionalCities : []).slice(0, 50).map((row) => ({
      city: String(row?.city || '').trim(),
      state: String(row?.state || '').trim().toUpperCase(),
      normalizedCity: String(row?.normalizedCity || '').trim(),
      distanceKm: Number(row?.distanceKm) || 0,
    })),
    quantity: Math.max(1, Math.trunc(Number(input?.quantity) || 1)),
    engine: input?.engine || 'hbx',
    targetType: input?.targetType || 'pj',
    filters: {
      minRating: filters.minRating == null ? null : Number(filters.minRating),
      minReviews: filters.minReviews == null ? null : Math.trunc(Number(filters.minReviews)),
      onlyWithWebsite: filters.onlyWithWebsite === true,
      ...(filters.radiusKm == null ? {} : { radiusKm: Number(filters.radiusKm) || 0 }),
    },
    normalizedCity: String(input?.normalizedCity || '').trim(),
    normalizedSegment: String(input?.normalizedSegment || '').trim(),
    preferredChannels: (Array.isArray(input?.preferredChannels) ? input.preferredChannels : []).map(String).filter((value) => allowedChannels.has(value)),
    requiredChannels: (Array.isArray(input?.requiredChannels) ? input.requiredChannels : []).map(String).filter((value) => allowedChannels.has(value)),
    channelMatchMode,
    freshness,
  };
}

function rehydrateRadarPostSaveInput(value: any): NormalizedSearchInput {
  const safe = sanitizeRadarPostSaveInput(value as NormalizedSearchInput);
  return {
    ...safe,
    filtersJson: JSON.stringify(safe.filters),
    searchSignature: '',
    cacheSignature: '',
    excludePhoneDigits: [],
    salesProfile: null,
  } as NormalizedSearchInput;
}

export class RadarCoreSearchLoopMixin {
  [key: string]: any;
  private enqueueRadarSocialLookupForSavedLeads(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
    leadIds: string[] = [],
    engineUrl?: string | null,
  ) {
    return this.getRadarSocialLookupService().enqueue(
      context,
      runId,
      input,
      leadIds,
      engineUrl,
      this.buildRadarSocialLookupHost(),
    );
  }

  /**
   * Fonte Receita (cnpj_public) soldada no run de cliente — aditivo, flag-gated
   * (docs/PLANEJAMENTOS/PR01072026/60-receita-no-run-cliente.md).
   *
   * CUTOVER ORDEM FIXA (P1, 02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md):
   * a lane do cliente é semente → RFB → web → fusão. Este método agora é chamado ANTES do
   * batch do motor web (ver processSearchRun) — RFB roda primeiro na ordem fixa 1→8 da árvore
   * mestra. Continua rodando no MÁXIMO 1x por run (ranThisRun/zeroAccepted); erro aqui NUNCA
   * bloqueia o batch web que vem depois (degrade gracioso).
   */
  private async runCnpjPublicSourceForClientRunIfEligible(
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
    runId: string,
    remainingQuantity: number,
    options: { deferPersistence?: boolean } = {},
  ): Promise<{ accepted: number; ran: boolean; results: WebscrapingContactResult[] }> {
    if (String(process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED).trim().toLowerCase() !== 'true') return { accepted: 0, ran: false, results: [] };
    if (normalized?.targetType !== 'pj') return { accepted: 0, ran: false, results: [] };
    if (remainingQuantity <= 0) return { accepted: 0, ran: false, results: [] };

    const now = Date.now();
    pruneRadarCnpjPublicClientRunState(now);
    const state = radarCnpjPublicClientRunState.get(runId);
    if (state?.ranThisRun || state?.zeroAccepted) return { accepted: 0, ran: false, results: [] };
    radarCnpjPublicClientRunState.set(runId, { ranThisRun: true, zeroAccepted: state?.zeroAccepted || false, updatedAt: now });

    try {
      const source = this.getRadarCnpjPublicSource
        ? this.getRadarCnpjPublicSource()
        : new RadarCnpjPublicSourceService();
      const limit = Math.max(1, Math.min(remainingQuantity, 20));
      const sourceResult = await source.run({
        normalized,
        limit,
        prisma: this.prisma,
      });
      const results = Array.isArray(sourceResult?.results) ? sourceResult.results : [];
      let accepted = 0;
      if (results.length && !options.deferPersistence) {
        const savedCounts = await this.saveSearchRunResults(
          context,
          normalized,
          runId,
          results,
          'cnpj_public',
        );
        await this.enqueueRadarPostSaveEnrichmentForSavedLeads(
          context,
          runId,
          normalized,
          savedCounts?.savedLeadIds,
          savedCounts?.savedWebEnrichmentLeadIds,
        );
        accepted = safeInteger(savedCounts?.found);
      } else if (options.deferPersistence) {
        // No fluxo principal a Receita continua rodando primeiro, mas só persiste depois
        // do motor para permitir a fusão canônica rfb↔web antes de nascer qualquer card.
        accepted = results.length;
      }
      if (accepted === 0) {
        radarCnpjPublicClientRunState.set(runId, { ranThisRun: true, zeroAccepted: true, updatedAt: now });
      }
      this.logger?.log?.(
        `[radar-cadeia] run ${runId}: 1=rfb found=${sourceResult?.foundCount ?? results.length} accepted=${accepted} reason=${sourceResult?.reason || '-'}`,
      );
      return { accepted, ran: true, results };
    } catch (error) {
      this.logger?.warn?.(
        `[radar-cnpj] fonte receita falhou sem derrubar o batch run=${runId}: ${String((error as any)?.message || error)}`,
      );
      return { accepted: 0, ran: true, results: [] };
    }
  }

  private enqueueRadarWebEnrichmentForSavedLeads(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
    leadIds: string[] = [],
    engineUrl?: string | null,
  ) {
    return this.getRadarWebEnrichmentJobService().enqueue(
      context,
      runId,
      input,
      leadIds,
      engineUrl,
      this.buildRadarWebEnrichmentJobHost(),
    );
  }

  /**
   * Fila durável do pós-save. O payload contém apenas contexto técnico e o filtro normalizado;
   * contato continua no item persistido e só é revelado pelos presenters depois da aquisição.
   * Sem RadarMission no ambiente, mantém o comportamento legado em memória como degradação.
   */
  private async enqueueRadarPostSaveEnrichmentForSavedLeads(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
    socialLeadIds: string[] = [],
    webLeadIds: string[] = [],
    engineUrl?: string | null,
  ) {
    const approvedIds = Array.from(new Set([
      ...(socialLeadIds || []),
      ...(webLeadIds || []),
    ].map(String).filter(Boolean)));
    const socialIds = approvedIds;
    const webIds = approvedIds;
    if (input.targetType !== 'pj' || !approvedIds.length) return;

    const queue = this.getMissionQueue();
    if (!queue.enabled()) {
      const paused = await queue.isQueuePaused(['enrich_search_item']);
      if (!paused) {
        this.enqueueRadarWebEnrichmentForSavedLeads(context, runId, input, webIds, engineUrl);
        this.enqueueRadarSocialLookupForSavedLeads(context, runId, input, socialIds, engineUrl);
      }
      return;
    }
    const durable = await queue.supportsMissionPersistence().catch(() => false);
    if (!durable) {
      const pausedWithoutPersistence = await queue.isQueuePaused(['enrich_search_item']);
      if (!pausedWithoutPersistence) {
        this.enqueueRadarWebEnrichmentForSavedLeads(context, runId, input, webIds, engineUrl);
        this.enqueueRadarSocialLookupForSavedLeads(context, runId, input, socialIds, engineUrl);
      }
      return;
    }
    const paused = await queue.isQueuePaused(['enrich_search_item']);

    const enqueueMode = async (mode: 'web' | 'social', leadId: string) => {
      const result = await queue.enqueue({
        stage: 'enrich_search_item',
        payload: {
          mode,
          companyId: Math.trunc(Number(context.companyId)),
          userId: Math.trunc(Number(context.userId)),
          runId,
          leadId,
          input: sanitizeRadarPostSaveInput(input),
        },
        dedupeKey: `run:${runId}:item:${leadId}:${mode}`,
        correlationId: runId,
        priority: mode === 'web' ? 20 : 10,
      });
      if (!result.missionId) throw new Error('RadarMission indisponível para o job pós-save.');
      await this.getRadarRunRepository().markEnrichmentJobState(context, leadId, {
        type: mode === 'web' ? 'radar_web_enrichment' : 'social_lookup',
        status: 'queued',
        traceId: result.missionId,
      });
    };

    let durableQueued = 0;
    for (const leadId of webIds) {
      try {
        await enqueueMode('web', leadId);
        durableQueued += 1;
      } catch (error) {
        this.logger?.warn?.(`[radar-post-save] fila durável web falhou item=${leadId}: ${String((error as any)?.message || error)}`);
        if (!paused) this.enqueueRadarWebEnrichmentForSavedLeads(context, runId, input, [leadId], engineUrl);
      }
    }
    for (const leadId of socialIds) {
      try {
        await enqueueMode('social', leadId);
        durableQueued += 1;
      } catch (error) {
        this.logger?.warn?.(`[radar-post-save] fila durável social falhou item=${leadId}: ${String((error as any)?.message || error)}`);
        if (!paused) this.enqueueRadarSocialLookupForSavedLeads(context, runId, input, [leadId], engineUrl);
      }
    }
    if (!paused && durableQueued > 0) setTimeout(() => { void this.drainRadarPostSaveEnrichmentQueue(); }, 0);
  }

  async drainRadarPostSaveEnrichmentQueue() {
    if ((this as any).radarPostSaveEnrichmentDrainActive) return;
    (this as any).radarPostSaveEnrichmentDrainActive = true;
    const queue = this.getMissionQueue();
    try {
      if (!queue.enabled()) return;
      for (let cycle = 0; cycle < 10; cycle += 1) {
        const leased = await queue.lease({
          workerId: `hbx-backend-post-save:${process.pid}`,
          stages: ['enrich_search_item'],
          batchSize: 10,
        });
        if (!leased.supported || !leased.missions.length) break;
        for (const mission of leased.missions) {
          let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
          let heartbeatInFlight: Promise<void> = Promise.resolve();
          let leaseLost = false;
          try {
            const firstHeartbeat = await queue.heartbeat(mission.id, mission.leaseId);
            if (!firstHeartbeat.ok) continue;
            const heartbeatMs = Math.max(5, Math.trunc(Number(mission.heartbeatSeconds) || 40)) * 1000;
            heartbeatTimer = setInterval(() => {
              heartbeatInFlight = queue.heartbeat(mission.id, mission.leaseId)
                .then((result) => { if (!result.ok) leaseLost = true; })
                .catch(() => { leaseLost = true; });
            }, heartbeatMs);
            heartbeatTimer.unref?.();

            const payload = mission.payload || {};
            const mode = String(payload.mode || '');
            const leadId = String(payload.leadId || '').trim();
            const companyId = Math.trunc(Number(payload.companyId || 0));
            const userId = Math.trunc(Number(payload.userId || 0));
            const missionContext = { companyId, userId, user: null } as SearchExecutionContext;
            const missionInput = rehydrateRadarPostSaveInput(payload.input);
            if (!leadId || !companyId || !userId || missionInput?.targetType !== 'pj') {
              await queue.fail(mission.id, mission.leaseId, 'payload_pos_save_invalido', false);
              continue;
            }
            if (mode === 'web') {
              await this.runRadarWebEnrichmentForSavedLead(missionContext, leadId, missionInput);
            } else if (mode === 'social') {
              await this.runRadarSocialLookupForSavedLead(missionContext, leadId, missionInput);
            } else {
              await queue.fail(mission.id, mission.leaseId, 'modo_pos_save_invalido', false);
              continue;
            }
            await heartbeatInFlight;
            if (!leaseLost) await queue.complete(mission.id, mission.leaseId, { mode, leadId });
          } catch (error) {
            await heartbeatInFlight.catch(() => undefined);
            if (!leaseLost) {
              const message = String((error as any)?.message || error);
              const failed = await queue.fail(mission.id, mission.leaseId, message, true);
              const payload = mission.payload || {};
              const leadId = String(payload.leadId || '').trim();
              const companyId = Math.trunc(Number(payload.companyId || 0));
              const userId = Math.trunc(Number(payload.userId || 0));
              const mode = String(payload.mode || '');
              if (leadId && companyId && userId && (mode === 'web' || mode === 'social')) {
                await this.getRadarRunRepository().markEnrichmentJobState(
                  { companyId, userId, user: null } as SearchExecutionContext,
                  leadId,
                  {
                    type: mode === 'web' ? 'radar_web_enrichment' : 'social_lookup',
                    status: failed.status === 'dead' ? 'failed' : 'queued',
                    error: message,
                    traceId: mission.id,
                  },
                ).catch(() => null);
              }
            }
          } finally {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }
      }
    } finally {
      (this as any).radarPostSaveEnrichmentDrainActive = false;
    }
  }

  private async drainRadarSocialLookupQueue() {
    return this.getRadarSocialLookupService().drain();
  }

  private async drainRadarWebEnrichmentQueue() {
    return this.getRadarWebEnrichmentJobService().drain();
  }

  async runRadarSocialLookupForSavedLead(
    context: SearchExecutionContext,
    leadId: string,
    input: NormalizedSearchInput,
    engineUrl?: string | null,
  ) {
    return this.getRadarSocialLookupService().runForSavedLead(
      context,
      leadId,
      input,
      engineUrl,
      this.buildRadarSocialLookupHost(),
    );
  }

  async runRadarWebEnrichmentForSavedLead(
    context: SearchExecutionContext,
    leadId: string,
    input: NormalizedSearchInput,
    engineUrl?: string | null,
  ) {
    return this.getRadarWebEnrichmentJobService().runForSavedLead(
      context,
      leadId,
      input,
      engineUrl,
      this.buildRadarWebEnrichmentJobHost(),
    );
  }

  private async recalculateSearchRunCounters(runId: string) {
    return this.getRadarRunRepository().recalculateCounters(runId);
  }

  private emptySearchRunMetrics(status = 'queued'): RadarSearchRunMetrics {
    return this.getRadarRunRepository().emptyMetrics(status);
  }

  private parseSearchRunMetrics(value: unknown): RadarSearchRunMetrics {
    return this.getRadarRunRepository().parseMetrics(value);
  }

  private classifyRunRejectionMetric(status: WebscrapingSearchRunItemStatus, reason?: string | null) {
    return this.getRadarRunRepository().classifyRejectionMetric(status, reason);
  }

  private async updateSearchRunMetrics(runId: string, patch: RadarSearchRunMetricsPatch) {
    return this.getRadarRunRepository().updateMetrics(runId, patch);
  }

  private buildSearchRunQualitySummary(run: any, deliveredCount: number) {
    return this.getRadarRunRepository().buildQualitySummary(run, deliveredCount);
  }

  private async recordSourceQualityFromRunItems(
    results: Array<Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }>,
    classifiedRows: Array<{ domain: string; sourceEngine: string; status: WebscrapingSearchRunItemStatus }>,
  ) {
    void results;
    const delegate = (this.prisma as any).webscrapingSourceQuality;
    if (!delegate || !(await this.prisma.hasTable('WebscrapingSourceQuality').catch(() => false))) return;
    const now = new Date();
    const grouped = new Map<string, { domain: string; sourceEngine: string; discoveredCount: number; fetchedCount: number; approvedCount: number; rejectedCount: number }>();
    for (const row of classifiedRows) {
      if (!row.domain) continue;
      const key = `${row.domain}|${row.sourceEngine}`;
      const current = grouped.get(key) || {
        domain: row.domain,
        sourceEngine: row.sourceEngine,
        discoveredCount: 0,
        fetchedCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
      };
      current.discoveredCount += 1;
      current.fetchedCount += 1;
      if (row.status === 'found') current.approvedCount += 1;
      else current.rejectedCount += 1;
      grouped.set(key, current);
    }
    await Promise.all(Array.from(grouped.values()).map(async (row) => {
      try {
        const saved = await delegate.upsert({
          where: { domain_sourceEngine: { domain: row.domain, sourceEngine: row.sourceEngine } },
          create: {
            ...row,
            approvalRate: row.approvedCount + row.rejectedCount > 0 ? row.approvedCount / (row.approvedCount + row.rejectedCount) : 0,
            lastSeenAt: now,
          },
          update: {
            discoveredCount: { increment: row.discoveredCount },
            fetchedCount: { increment: row.fetchedCount },
            approvedCount: { increment: row.approvedCount },
            rejectedCount: { increment: row.rejectedCount },
            lastSeenAt: now,
          },
        });
        const approved = safeInteger(saved?.approvedCount);
        const rejected = safeInteger(saved?.rejectedCount);
        const total = approved + rejected;
        await delegate.update({
          where: { id: saved.id },
          data: { approvalRate: total > 0 ? approved / total : 0 },
        }).catch(() => null);
      } catch (error: any) {
        this.logger.warn(`[radar-source-quality] falha ao registrar fonte=${row.domain}: ${String(error?.message || error)}`);
      }
    }));
  }

  private async recordSourceQualityFromEngineMetrics(sourceMetrics?: Array<Record<string, any>> | null) {
    const metrics = Array.isArray(sourceMetrics) ? sourceMetrics : [];
    if (!metrics.length) return;
    const delegate = (this.prisma as any).webscrapingSourceQuality;
    if (!delegate || !(await this.prisma.hasTable('WebscrapingSourceQuality').catch(() => false))) return;
    const now = new Date();
    await Promise.all(metrics.map(async (metric) => {
      const domain = String(metric?.domain || '').trim().toLowerCase();
      const sourceEngine = String(metric?.sourceEngine || metric?.source || 'hbx_scraping').trim() || 'hbx_scraping';
      if (!domain || domain === 'unknown') return;
      const approvedCount = safeInteger(metric?.approved ?? metric?.approvedCount);
      const rejectedCount = safeInteger(metric?.rejected ?? metric?.rejectedCount);
      const discoveredCount = safeInteger(metric?.discovered ?? metric?.discoveredCount);
      const fetchedCount = safeInteger(metric?.fetched ?? metric?.fetchedCount);
      try {
        const saved = await delegate.upsert({
          where: { domain_sourceEngine: { domain, sourceEngine } },
          create: {
            domain,
            sourceEngine,
            discoveredCount,
            fetchedCount,
            approvedCount,
            rejectedCount,
            approvalRate: approvedCount + rejectedCount > 0 ? approvedCount / (approvedCount + rejectedCount) : 0,
            lastSeenAt: now,
          },
          update: {
            discoveredCount: { increment: discoveredCount },
            fetchedCount: { increment: fetchedCount },
            approvedCount: { increment: approvedCount },
            rejectedCount: { increment: rejectedCount },
            lastSeenAt: now,
          },
        });
        const approved = safeInteger(saved?.approvedCount);
        const rejected = safeInteger(saved?.rejectedCount);
        const total = approved + rejected;
        await delegate.update({
          where: { id: saved.id },
          data: { approvalRate: total > 0 ? approved / total : 0 },
        }).catch(() => null);
      } catch (error: any) {
        this.logger.warn(`[radar-source-quality] falha ao registrar metrica fonte=${domain}: ${String(error?.message || error)}`);
      }
    }));
  }

  private async persistSearchRunHistoryIfPossible(runId: string, normalized: NormalizedSearchInput, context: SearchExecutionContext) {
    if (!(await this.supportsHistoryPersistence())) return null;
    const rows = await this.prisma.webscrapingSearchRunItem.findMany({
      where: {
        runId,
        status: 'found',
      },
      orderBy: { createdAt: 'asc' },
    });
    const qualityInput = {
      city: normalized.city,
      state: normalized.state,
      segment: normalized.segment,
      targetType: normalized.targetType,
      preferredChannels: normalized.preferredChannels,
      requiredChannels: normalized.requiredChannels,
      channelMatchMode: normalized.channelMatchMode,
      salesProfile: normalized.salesProfile,
    } as NormalizedRadarFilters;
    const results = rows
      .filter((row) => this.isRunItemQualityDeliverable(row, qualityInput))
      .map((row) => this.mapRunItemToContact(row));
    if (!results.length) return null;
    return this.persistHistory(context, normalized, results, null).catch(() => null);
  }

  // LIMPEZA-DESTRUTIVA L2 (04/07, docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md): a
  // família do gate de estoque do Vendas (getExplicitRadarVendasStockTarget/
  // isRadarVendasStockGatedRun/getRadarVendasStockSnapshotForRun/hasReachedRadarVendasStockTarget/
  // buildRadarVendasStockExhaustedMessage) foi deletada. O run de busca nunca mais para/pausa
  // olhando quantos cards estão pendentes no funil de Vendas — só busca até targetQuantity e
  // termina normal (completed / completed_insufficient_results / failed).

  private async runGoogleEmergencyComplementIfEligible(
    runId: string,
    user: any,
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
  ) {
    if (normalized.targetType !== 'pj') return;
    if (!(await this.getEnginePool().canUseGoogleEmergencyForRun())) return;

    const current = await this.prisma.webscrapingSearchRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        companyId: true,
        foundCount: true,
        targetQuantity: true,
        googleEmergencyUsedCount: true,
        metricsJson: true,
      },
    });
    if (!current || current.googleEmergencyUsedCount > 0) return;
    // LIMPEZA-DESTRUTIVA L2: sem gate de estoque — o complemento Google só olha
    // targetQuantity/foundCount do próprio run, nunca o funil de Vendas.
    if (current.foundCount >= current.targetQuantity) return;
    const missingCount = Math.max(1, current.targetQuantity - current.foundCount);

    const quantity = Math.min(
      this.getEnginePool().googleEmergencyMaxPerRun(),
      missingCount,
    );
    const dedup = await this.snapshotSearchRunDedup(runId);
    const excludePhoneDigits = Array.from(dedup.phoneDigits);

    try {
      const response = await this.searchContactsForUser(
        user,
        {
          city: normalized.city,
          state: normalized.state,
          segment: normalized.segment,
          engine: 'google',
          targetType: 'pj',
          quantity,
          minRating: normalized.filters.minRating,
          minReviews: normalized.filters.minReviews,
          onlyWithWebsite: normalized.filters.onlyWithWebsite,
          excludePhoneDigits,
        },
        {
          skipPrivateHistory: true,
          skipTechnicalCache: true,
          skipRadarLookup: true,
          recordUsage: true,
          usageEventType: 'GOOGLE_EMERGENCY_EXECUTED',
          purpose: 'manual',
        },
      );
      const incoming = Array.isArray(response.results) ? response.results : [];
      if (incoming.length > 0) {
        const savedCounts = await this.saveSearchRunResults(context, normalized, runId, incoming, 'google_emergency');
        await this.enqueueRadarPostSaveEnrichmentForSavedLeads(
          context,
          runId,
          normalized,
          savedCounts?.savedLeadIds,
          savedCounts?.savedWebEnrichmentLeadIds,
        );
        await this.recalculateSearchRunCounters(runId);
      }
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          googleEmergencyUsedCount: { increment: incoming.length },
        },
      });
    } catch (error) {
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          errorMessage: `Google emergency falhou: ${String((error as any)?.message || error || 'erro desconhecido')}`,
        },
      }).catch(() => null);
    }
  }

  private async buildQueueUser(run: any) {
    const userId = Number(run?.userId || 0);
    const companyId = Number(run?.companyId || 0);
    const user = userId && companyId
      ? await this.prisma.user.findFirst({
          where: { id: userId, companyId },
          select: {
            id: true,
            companyId: true,
            role: true,
            isSystemMaster: true,
            isActive: true,
            name: true,
            email: true,
            username: true,
            phone: true,
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        }).catch(() => null)
      : null;
    if (user?.id) {
      return {
        ...user,
        masterContext: { active: false },
      };
    }
    return {
      id: userId,
      companyId,
      role: 'ADMIN',
      isSystemMaster: false,
      masterContext: { active: false },
    };
  }

  private async requeueStaleAssignedSearchRunIfNeeded(run: any) {
    const status = this.normalizeSearchRunStatus(run?.status);
    const updatedAtMs = run?.updatedAt instanceof Date ? run.updatedAt.getTime() : 0;
    const staleBeforeMs = Date.now() - Math.max(this.getHbxBatchTimeoutMs() + 60_000, 180_000);
    if (status !== 'running' || !run?.assignedEngineId || !updatedAtMs || updatedAtMs >= staleBeforeMs) {
      return run;
    }
    await this.prisma.webscrapingSearchRun.updateMany({
      where: {
        id: run.id,
        status: 'running',
        assignedEngineId: { not: null },
      },
      data: {
        status: 'queued',
        assignedEngineId: null,
        assignedEngineUrl: null,
        assignedEngineIndex: null,
        lastBatchStatus: 'stale_requeued',
        lastBatchError: 'Lote travado reencaminhado automaticamente.',
        errorMessage: 'A busca demorou demais em um motor e foi retomada em outro.',
        nextRetryAt: new Date(),
      },
    }).catch(() => null);
    await this.getEnginePool().releaseEngine(String(run.assignedEngineId)).catch(() => null);
    this.scheduleSearchRunPump(0);
    return this.prisma.webscrapingSearchRun.findFirst({
      where: { id: run.id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }).catch(() => run);
  }

  private async processNextQueuedSearchRun() {
    if (this.searchRunQueuePumpActive) return;
    this.searchRunQueuePumpActive = true;
    try {
      await this.assertSearchRunPersistence();
      await this.getEnginePool().refreshEngineRegistryFromEnv();
      await this.getEnginePool().cleanupExpiredLocks();
      const staleRunningBefore = new Date(Date.now() - Math.max(this.getHbxBatchTimeoutMs() + 60_000, 180_000));
      await this.prisma.webscrapingSearchRun.updateMany({
        where: {
          status: 'running',
          assignedEngineId: { not: null },
          updatedAt: { lt: staleRunningBefore },
        },
        data: {
          status: 'queued',
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          lastBatchStatus: 'stale_requeued',
          lastBatchError: 'Lote travado reencaminhado automaticamente.',
          errorMessage: 'A busca demorou demais em um motor e foi retomada em outro.',
          nextRetryAt: new Date(),
        },
      }).catch(() => null);
      await this.resumeDuePausedRadarSearchRuns().catch((error: any) => {
        this.logger.warn(`[radar-run] falha ao avaliar pausas automaticas: ${String(error?.message || error)}`);
      });

      for (;;) {
        const now = new Date();
        const run = await this.prisma.webscrapingSearchRun.findFirst({
          where: {
            status: { in: ['queued', 'running'] },
            assignedEngineId: null,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
          orderBy: [
            { nextRetryAt: 'asc' },
            { createdAt: 'asc' },
          ],
        });
        if (!run) {
          await this.scheduleNextDueSearchRunPump();
          break;
        }
        // LIMPEZA-DESTRUTIVA L2: sem gate de estoque — o pump nunca mais para o run aqui
        // por causa do funil de Vendas.

        const avoidEngineId = ['batch_error', 'engine_error'].includes(String(run.lastBatchStatus || ''))
          ? String(run.lastEngineUrl || run.assignedEngineId || '')
          : '';
        const lease = await this.getEnginePool().acquireEngine(
          run.id,
          run.companyId,
          run.userId,
          { avoidEngineIdOrUrl: avoidEngineId || undefined, purpose: 'manual' },
        );
        if (!lease) {
          const nextRetryAt = new Date(Date.now() + 5_000);
          await this.prisma.webscrapingSearchRun.update({
            where: { id: run.id },
            data: {
              status: run.foundCount > 0 ? 'running' : 'queued',
              assignedEngineId: null,
              assignedEngineUrl: null,
              assignedEngineIndex: null,
              lastBatchStatus: 'queued_wait',
              errorMessage: 'Aguardando motor livre.',
              nextRetryAt,
            },
          }).catch(() => null);
          this.scheduleSearchRunPump(5_000);
          break;
        }

        const claimed = await this.prisma.webscrapingSearchRun.updateMany({
          where: {
            id: run.id,
            status: { in: ['queued', 'running'] },
            assignedEngineId: null,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
          data: {
            status: 'running',
            assignedEngineId: lease.engineId,
            assignedEngineUrl: lease.url,
            assignedEngineIndex: lease.engineIndex,
            startedAt: run.startedAt || new Date(),
            nextRetryAt: null,
            lastEngineUrl: lease.url,
          },
        });

        if (claimed.count === 0) {
          await this.getEnginePool().releaseEngine(lease.engineId);
          continue;
        }

        const queueUser = await this.buildQueueUser(run);
        const normalized = this.normalizeSearchInput(this.buildRunInputFromRow({ ...run, engine: 'hbx' }));
        this.scheduleSearchRunPump(0);
        setTimeout(() => {
          void this.processSearchRun(run.id, queueUser, normalized, lease);
        }, 0);
      }
    } finally {
      this.searchRunQueuePumpActive = false;
    }
  }

  private buildRadarFiltersFromNormalizedSearchInput(input: NormalizedSearchInput): NormalizedRadarFilters {
    return this.getRadarSearchInput().buildRadarFiltersFromNormalizedSearchInput(input, this.buildRadarSearchInputHost());
  }

  private async countExistingRequiredChannelMatchesForRun(
    context: SearchExecutionContext,
    runId: string,
    input: NormalizedSearchInput,
  ) {
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: runId, companyId: context.companyId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    }).catch(() => null);
    if (!run) return 0;
    const filters = this.buildRadarFiltersFromNormalizedSearchInput(input);
    const primaryItems = (run.items || []).filter((item: any) => this.isRunItemPrimaryDeliverable(item, filters));
    if (!primaryItems.length) return 0;
    const directMatches = primaryItems
      .map((item: any) => this.mapRunItemToContact(item))
      .filter((contact) => this.candidateHasRequiredChannels(contact as any, filters))
      .length;
    if (directMatches > 0) return Math.min(directMatches, input.quantity);
    const rows = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      primaryItems,
      this.getRequiredChannelCandidateWindow(input.quantity),
    );
    return rows.filter((row) => this.matchesRadarChannelFilters(row, filters)).slice(0, input.quantity).length;
  }

  private async processSearchRun(runId: string, user: any, initialInput?: NormalizedSearchInput, lease?: HbxEngineLease) {
    const context = this.resolveContext(user);
    const current = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: runId, companyId: context.companyId },
    });
    if (!current || this.isTerminalSearchRunStatus(current.status)) {
      if (lease) await this.getEnginePool().releaseEngine(lease.engineId);
      return;
    }
    // LIMPEZA-DESTRUTIVA L2 (04/07): sem gate de estoque do Vendas — o run nunca mais
    // para aqui por causa do funil; só busca até normalized.quantity/targetQuantity.
    const normalized = initialInput || this.normalizeSearchInput(this.buildRunInputFromRow(current));
    const hasRequiredEnrichmentGate = this.hasExplicitRequiredChannels(normalized);
    const batchLimit = this.getHbxRunBatchLimit(normalized.quantity);
    const queryTaskCount = this.buildHbxBatchQueryTasks(normalized).length;
    const maxAttempts = Math.max(this.getHbxRunMaxAttempts(normalized.quantity, batchLimit), queryTaskCount);
    const hasExpandedScope = normalized.radiusKm > 0 || this.getSearchCityTargets(normalized).length > 1 || this.splitHbxBatchSegments(normalized.segment).length > 1;
    const requiredSocialChannels = normalized.requiredChannels.filter((channel) => channel === 'instagram' || channel === 'facebook');
    const requiredCandidateWindow = hasRequiredEnrichmentGate
      ? this.getRequiredChannelCandidateWindow(normalized.quantity)
      : normalized.quantity;
    const maxEmptyBatches = hasExpandedScope
      ? Math.max(this.getHbxRunMaxEmptyBatches(), Math.min(Math.max(queryTaskCount, 1), 120))
      : this.getHbxRunMaxEmptyBatches();
    const maxFailedBatches = this.getHbxRunMaxFailedBatches();
    const maxStalledPartialBatches = this.getHbxRunMaxStalledPartialBatches();
    const attempt = safeInteger(current.attemptCount) + 1;
    const quantity = hasRequiredEnrichmentGate
      ? batchLimit
      : Math.min(batchLimit, Math.max(1, normalized.quantity - safeInteger(current.foundCount)));
    const attemptTask = this.buildHbxBatchAttemptTask(normalized, attempt);
    const attemptInput = attemptTask.input;
    const queryUsed = attemptTask.query;
    const engineUrl = lease?.url || String(current.assignedEngineUrl || current.lastEngineUrl || this.getHbxScrapingEngineUrl());
    // LIMPEZA-DESTRUTIVA L1 (04/07): pra TODO papel (inclusive USERMASTER/admin/master),
    // o run NUNCA importa/reivindica pro funil de Vendas sozinho. Este passo do ciclo só
    // enche a vitrine (RadarLeadPool com ownerCompanyId=null) e devolve se o run está
    // pausado por limite (semântica que já existia no ramo vendedor). O funil só recebe
    // card por puxada manual (send-to-vendas / mark-sent-to-vendas).
    const autoImportAndStopIfPaused = async (label: string) => {
      const latestForSync = await this.prisma.webscrapingSearchRun.findFirst({
        where: { id: runId, companyId: context.companyId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      }).catch(() => null);
      if (latestForSync) {
        await this.syncRadarSearchRunItemsToPool(context, latestForSync).catch((error: any) => {
          this.logger.warn(`[radar-run] sync (vitrine) ${label} ignorado run=${runId}: ${String(error?.message || error)}`);
        });
      }
      const latest = await this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: { id: true, status: true, lastBatchStatus: true, metricsJson: true },
      }).catch(() => null);
      return this.isSearchRunPausedByLimit(latest);
    };

    try {
      if (safeInteger(current.foundCount) >= normalized.quantity && this.hasCompletedHbxMinimumCoverage(normalized, safeInteger(current.attemptCount))) {
        const requiredChannelMatches = hasRequiredEnrichmentGate
          ? await this.countExistingRequiredChannelMatchesForRun(context, runId, normalized)
          : safeInteger(current.foundCount);
        if (requiredChannelMatches < normalized.quantity && safeInteger(current.foundCount) < requiredCandidateWindow) {
        } else {
          if (requiredChannelMatches >= normalized.quantity) {
            if (await autoImportAndStopIfPaused('final')) return;
          }
          const finalStatus: WebscrapingSearchRunStatus = requiredChannelMatches >= normalized.quantity
            ? 'completed'
            : 'completed_insufficient_results';
          const finalMessage = finalStatus === 'completed'
            ? null
            : this.buildSearchRunInsufficientMessage(safeInteger(current.foundCount), attempt);
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: finalStatus,
            lastBatchStatus: finalStatus,
            errorMessage: finalMessage,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
        }
      }

      if (attempt > maxAttempts) {
        const counters = await this.recalculateSearchRunCounters(runId);
        const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
          ? 'completed_insufficient_results'
          : 'failed';
        if (counters.foundCount > 0 && !hasRequiredEnrichmentGate) {
          const rested = await this.restSearchRunIfEligible(
            runId,
            current,
            counters.foundCount,
            normalized.quantity,
            'max_attempts_before_batch',
          );
          if (rested) return;
        }
        const finalMessage = counters.foundCount > 0
          ? this.buildSearchRunFilterReviewMessage(counters.foundCount, normalized.quantity)
          : this.buildSearchRunNoCardsMessage(safeInteger(current.attemptCount), current.lastQueryUsed);
        if (counters.foundCount > 0 && !hasRequiredEnrichmentGate) {
          if (await autoImportAndStopIfPaused('parcial')) return;
          await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        } else if (counters.foundCount > 0) {
          await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        }
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: finalStatus,
            lastBatchStatus: finalStatus,
            errorMessage: finalMessage,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
      }

      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: 'running',
          startedAt: current.startedAt || new Date(),
          assignedEngineId: lease?.engineId || current.assignedEngineId || null,
          assignedEngineUrl: lease?.url || current.assignedEngineUrl || null,
          assignedEngineIndex: lease?.engineIndex ?? current.assignedEngineIndex ?? null,
          attemptCount: { increment: 1 },
          lastBatchStatus: 'running_batch',
          lastBatchError: null,
          lastQueryUsed: queryUsed,
          lastEngineUrl: engineUrl,
          nextRetryAt: null,
          errorMessage: `Rodando lote ${attempt}/${maxAttempts}.`,
        },
      });
      await this.updateSearchRunMetrics(runId, {
        searchScope: attemptTask.searchScope,
      }).catch(() => null);

      const liveRun = await this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: {
          status: true,
          foundCount: true,
          targetQuantity: true,
        },
      });
      if (!liveRun || liveRun.status === 'canceled') return;
      if (this.isTerminalSearchRunStatus(liveRun.status)) return;
      if (
        safeInteger(liveRun.foundCount) >= safeInteger(liveRun.targetQuantity)
        && this.hasCompletedHbxMinimumCoverage(normalized, attempt - 1)
      ) {
        const requiredChannelMatches = hasRequiredEnrichmentGate
          ? await this.countExistingRequiredChannelMatchesForRun(context, runId, normalized)
          : safeInteger(liveRun.foundCount);
        if (requiredChannelMatches < safeInteger(liveRun.targetQuantity) && safeInteger(liveRun.foundCount) < requiredCandidateWindow) {
        } else {
        if (requiredChannelMatches >= safeInteger(liveRun.targetQuantity)) {
          if (await autoImportAndStopIfPaused('alvo')) return;
        }
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: requiredChannelMatches >= safeInteger(liveRun.targetQuantity) ? 'completed' : 'completed_insufficient_results',
            lastBatchStatus: requiredChannelMatches >= safeInteger(liveRun.targetQuantity) ? 'completed' : 'completed_insufficient_results',
            errorMessage: requiredChannelMatches >= safeInteger(liveRun.targetQuantity)
              ? null
              : this.buildSearchRunInsufficientMessage(safeInteger(liveRun.foundCount), attempt),
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            finishedAt: new Date(),
          },
        });
        return;
        }
      }

      const dedup = await this.snapshotSearchRunDedup(runId);
      const excludePhoneDigits = Array.from(dedup.phoneDigits);
      const batchInput: NormalizedSearchInput = {
        ...attemptInput,
        quantity,
      };
      const engineBatchInput: NormalizedSearchInput = {
        ...batchInput,
        requiredChannels: [],
        channelMatchMode: 'prefer',
      };

      // CUTOVER ORDEM FIXA (P1, 02/07): lane do cliente é semente → RFB → web → fusão (árvore
      // mestra, docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md). RFB roda ANTES do motor web
      // — antes rodava depois (furo do PR01072026/60), invertendo a prioridade "formais primeiro".
      // Erro/flag-off aqui nunca bloqueia o batch web que vem a seguir (degrade gracioso).
      const cnpjOutcome = await this.runCnpjPublicSourceForClientRunIfEligible(
        context,
        normalized,
        runId,
        Math.max(0, safeInteger(normalized.quantity) - safeInteger(current.foundCount)),
        { deferPersistence: true },
      ).catch(() => ({ accepted: 0, ran: false, results: [] }));

      const sendExplicitQuery = !this.hasIntentSensitiveDiscovery(batchInput) || this.isSocialDiscoveryQuery(queryUsed);
      let batchResponse;
      try {
        batchResponse = await this.searchHbxEngine(
          engineBatchInput,
          excludePhoneDigits,
          engineUrl,
          {
            queryText: sendExplicitQuery ? queryUsed : undefined,
            batchLimit: quantity,
            timeoutMs: this.isSocialDiscoveryQuery(queryUsed) ? this.getHbxSocialBatchTimeoutMs() : this.getHbxBatchTimeoutMs(),
          },
        );
      } catch (error) {
        // A fusão precisa esperar o motor; se ele cair, a Receita não pode ser perdida.
        // Persiste somente o lote oficial e mantém o erro do motor no fluxo de retry já existente.
        if (cnpjOutcome.results.length) {
          const rfbSaved = await this.saveSearchRunResults(
            context,
            batchInput,
            runId,
            cnpjOutcome.results,
            'cnpj_public',
          );
          await this.enqueueRadarPostSaveEnrichmentForSavedLeads(
            context,
            runId,
            batchInput,
            rfbSaved?.savedLeadIds,
            rfbSaved?.savedWebEnrichmentLeadIds,
          );
        }
        throw error;
      }
      const runAfterEngine = await this.prisma.webscrapingSearchRun.findUnique({
        where: { id: runId },
        select: { status: true },
      }).catch(() => null);
      if (!runAfterEngine || runAfterEngine.status === 'canceled') return;
      await this.updateSearchRunMetrics(runId, {
        engineId: lease?.engineId || current.assignedEngineId || null,
        engineIndex: lease?.engineIndex ?? current.assignedEngineIndex ?? null,
        sourceEngine: 'hbx',
        cacheHit: false,
        status: 'running',
        increment: {
          urlsDiscovered: batchResponse.urlsDiscovered,
          pagesFetched: batchResponse.pagesFetched,
        },
      });
      const webIncoming = Array.isArray(batchResponse.results) ? batchResponse.results : [];
      const canonicalBatch = this.getRadarResultMerger().mergeCanonicalRfbWithWeb({
        rfbResults: cnpjOutcome.results,
        webResults: webIncoming,
        city: batchInput.city,
        state: batchInput.state,
      });
      const incoming = canonicalBatch.results;
      const savedCounts = await this.saveSearchRunResults(
        context,
        batchInput,
        runId,
        incoming,
        null,
        safeInteger(current.attemptCount) * batchLimit,
        engineUrl,
      );
      await this.enqueueRadarPostSaveEnrichmentForSavedLeads(
        context,
        runId,
        batchInput,
        savedCounts?.savedLeadIds,
        savedCounts?.savedWebEnrichmentLeadIds,
        engineUrl,
      );
      if (lease) {
        await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      }

      const counters = await this.recalculateSearchRunCounters(runId);
      const approvedCount = savedCounts.found;
      const rejectedCount = batchResponse.rejectedCount + savedCounts.invalid + savedCounts.skipped;
      const duplicateCount = batchResponse.duplicateCount + savedCounts.duplicate;

      // Log da cadeia executada NA ORDEM (aceite do P1): mostra exatamente os motores e a
      // ordem real desta tentativa — RFB (se rodou) sempre antes do web.
      this.logger?.log?.(
        `[radar-cadeia] run ${runId} attempt ${attempt}: ordem=${cnpjOutcome.ran ? 'rfb->web' : 'web'} `
        + `rfb_candidates=${cnpjOutcome.accepted} fused=${canonicalBatch.matchedCount} `
        + `ambiguous=${canonicalBatch.ambiguousCount} web_unmatched=${canonicalBatch.unmatchedWebCount} accepted=${approvedCount}`,
      );

      if (approvedCount > 0) {
        if (await autoImportAndStopIfPaused('incremental')) return;
      }
      const consecutiveEmptyBatchCount = approvedCount === 0
        ? safeInteger(current.consecutiveEmptyBatchCount) + 1
        : 0;
      const requiredChannelMatches = hasRequiredEnrichmentGate && counters.foundCount >= normalized.quantity
        ? await this.countExistingRequiredChannelMatchesForRun(context, runId, normalized)
        : counters.foundCount;
      const reachedTargetBeforeCoverage = hasRequiredEnrichmentGate
        ? requiredChannelMatches >= normalized.quantity
        : counters.foundCount >= normalized.quantity;
      const reachedTarget = reachedTargetBeforeCoverage && this.hasCompletedHbxMinimumCoverage(normalized, attempt);
      const reachedRequiredCandidateWindow = hasRequiredEnrichmentGate && counters.foundCount >= requiredCandidateWindow;
      const reachedMaxAttempts = attempt >= maxAttempts;
      const completedSocialWarmup = !requiredSocialChannels.length || attempt >= Math.max(1, Math.ceil(Math.max(queryTaskCount, 1) * 0.3));
      const completedPrimaryTasksOnce = attempt >= Math.max(queryTaskCount, 1);
      const reachedMaxEmptyBatches = approvedCount === 0
        && consecutiveEmptyBatchCount >= maxEmptyBatches
        && completedSocialWarmup
        && (counters.foundCount <= 0 || completedPrimaryTasksOnce);
      const reachedStalledPartialTarget = approvedCount === 0
        && !hasRequiredEnrichmentGate
        && counters.foundCount > 0
        && counters.foundCount < normalized.quantity
        && counters.foundCount === safeInteger(current.foundCount)
        && counters.foundCount / Math.max(1, normalized.quantity) >= 0.8
        && consecutiveEmptyBatchCount >= maxStalledPartialBatches
        && completedSocialWarmup;
      const batchDebugMeta = `attempts=${attempt}/${maxAttempts}; queryTaskCount=${queryTaskCount}; currentCity=${attemptTask.searchScope?.currentCity || normalized.city}; currentSegment=${attemptTask.searchScope?.currentSegment || normalized.segment}; currentQuery=${queryUsed}; approved=${approvedCount}; skipped=${savedCounts.skipped + savedCounts.invalid + batchResponse.rejectedCount}; duplicate=${duplicateCount}`;

      this.logHbxBatch({
        runId,
        attempt,
        batchLimit: quantity,
        query: queryUsed,
        engineUrl,
        httpStatus: batchResponse.httpStatus,
        errorMessage: batchResponse.rawErrorMessage,
        approvedCount,
        rejectedCount,
        duplicateCount,
        nextRetryAt: null,
      });

      if (reachedTarget) {
        await this.runGoogleEmergencyComplementIfEligible(runId, user, context, normalized);
        if (await autoImportAndStopIfPaused('complemento')) return;
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: 'completed',
            lastBatchStatus: 'completed',
            errorMessage: null,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            consecutiveEmptyBatchCount,
            consecutiveEngineErrorCount: 0,
            finishedAt: new Date(),
          },
        });
        return;
      }

      if (reachedMaxAttempts || reachedMaxEmptyBatches || reachedRequiredCandidateWindow || reachedStalledPartialTarget) {
        const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
          ? 'completed_insufficient_results'
          : 'failed';
        if (counters.foundCount > 0 && !hasRequiredEnrichmentGate && !reachedRequiredCandidateWindow) {
          const rested = await this.restSearchRunIfEligible(
            runId,
            current,
            counters.foundCount,
            normalized.quantity,
            reachedStalledPartialTarget ? 'stalled_partial_target' : reachedMaxEmptyBatches ? 'max_empty_batches' : 'max_attempts',
          );
          if (rested) return;
        }
        const finalMessage = counters.foundCount > 0
          ? this.buildSearchRunFilterReviewMessage(counters.foundCount, normalized.quantity)
          : this.buildSearchRunNoCardsMessage(attempt, queryUsed);
        if (counters.foundCount > 0) {
          await this.persistSearchRunHistoryIfPossible(runId, normalized, context);
        }
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: finalStatus,
            lastBatchStatus: finalStatus,
            errorMessage: finalMessage,
            nextRetryAt: null,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
            consecutiveEmptyBatchCount,
            consecutiveEngineErrorCount: 0,
            finishedAt: new Date(),
          },
        });
        return;
      }

      const message = this.buildSearchRunProgressMessage(counters.foundCount);
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: 'running',
          lastBatchStatus: approvedCount > 0 ? 'batch_success' : 'empty_batch',
          errorMessage: message,
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          consecutiveEmptyBatchCount,
          consecutiveEngineErrorCount: 0,
        },
      });
    } catch (error) {
      if (lease) {
        await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      }
      const counters = await this.recalculateSearchRunCounters(runId).catch(() => ({
        foundCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
      }));
      const httpStatus = this.extractHbxHttpStatus(error);
      const errorMessage = this.extractHbxErrorMessage(error);
      const retryable = this.isRetryableHbxError(error);
      const consecutiveEngineErrorCount = safeInteger(current.consecutiveEngineErrorCount) + 1;
      const failedBatchCount = safeInteger(current.failedBatchCount) + 1;
      const reachedMaxAttempts = attempt >= maxAttempts;
      const reachedMaxFailedBatches = consecutiveEngineErrorCount >= maxFailedBatches;
      const shouldRetry = retryable && !reachedMaxAttempts && !reachedMaxFailedBatches;
      const nextRetryAt = shouldRetry
        ? new Date(Date.now() + this.getHbxRetryDelayMs(consecutiveEngineErrorCount))
        : null;

      this.logHbxBatch({
        runId,
        attempt,
        batchLimit: quantity,
        query: queryUsed,
        engineUrl,
        httpStatus,
        errorMessage,
        approvedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        nextRetryAt,
      });

      if (shouldRetry) {
        await this.prisma.webscrapingSearchRun.update({
          where: { id: runId },
          data: {
            status: counters.foundCount > 0 ? 'running' : 'queued',
            failedBatchCount,
            consecutiveEngineErrorCount,
            lastBatchStatus: httpStatus ? 'batch_error' : 'engine_error',
            lastBatchError: errorMessage.slice(0, 1000),
            errorMessage: this.buildSearchRunRetryMessage(errorMessage, httpStatus, counters.foundCount),
            nextRetryAt,
            assignedEngineId: null,
            assignedEngineUrl: null,
            assignedEngineIndex: null,
          },
        }).catch(() => null);
        return;
      }

      const finalStatus: WebscrapingSearchRunStatus = counters.foundCount > 0
        ? 'completed_insufficient_results'
        : 'failed';
      if (counters.foundCount > 0 && !hasRequiredEnrichmentGate) {
        const rested = await this.restSearchRunIfEligible(
          runId,
          current,
          counters.foundCount,
          normalized.quantity,
          reachedMaxAttempts ? 'error_max_attempts' : reachedMaxFailedBatches ? 'error_max_failed_batches' : 'engine_error',
        );
        if (rested) return;
      }
      const finalMessage = counters.foundCount > 0
        ? this.buildSearchRunFilterReviewMessage(counters.foundCount, normalized.quantity)
        : reachedMaxAttempts
          ? `Nenhum card valido foi encontrado apos ${attempt} lotes. Ultima query: ${queryUsed}.`
          : this.buildSearchRunNoCardsMessage(attempt, queryUsed);
      if (counters.foundCount > 0 && !hasRequiredEnrichmentGate) {
        if (await autoImportAndStopIfPaused('pos-erro')) return;
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context).catch(() => null);
      } else if (counters.foundCount > 0) {
        await this.persistSearchRunHistoryIfPossible(runId, normalized, context).catch(() => null);
      }
      await this.prisma.webscrapingSearchRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          failedBatchCount,
          consecutiveEngineErrorCount,
          lastBatchStatus: finalStatus === 'failed' ? 'failed' : 'completed_insufficient_results',
          lastBatchError: errorMessage.slice(0, 1000),
          errorMessage: finalMessage,
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          finishedAt: new Date(),
        },
      }).catch(() => null);
    } finally {
      if (lease) {
        await this.getEnginePool().releaseEngine(lease.engineId);
      }
      this.scheduleSearchRunPump(0);
    }
  }
}
