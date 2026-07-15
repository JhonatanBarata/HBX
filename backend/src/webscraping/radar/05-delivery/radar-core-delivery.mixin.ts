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
  ACRE_CITIES_FALLBACK,
  TURBO_OPERATIONAL_CONFIG_KEY,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  buildRadarNeighborSegments,
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
  normalizeTargetType,
  parsePositiveInteger,
  maxQuantityFor,
  safeInteger,
  clampInteger,
  parsePositiveIntegerEnv,
  minutesAgo,
  formatCityWithState,
} from '../radar-core-method-imports';
import { incrementAffinity } from '../../../users/segment-affinity.util';
import { isBillingOwnerActor } from '../../../access/actor-kind';
import { extractCnpjFromRadarLead } from '../../../nucleo/nucleo-ingestao';

import type {
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
import {
  getTeamPolicyRequiredChannelList,
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
} from '../../../team/team-policy-persistence';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import { radarDiscoveryEnginesOf } from '../shared/radar-source-lanes';

export class RadarCoreDeliveryMixin {
  private _leadContactWrite: LeadContactWriteService | null = null;
  private getLeadContactWrite(): LeadContactWriteService {
    if (!this._leadContactWrite) this._leadContactWrite = new LeadContactWriteService();
    return this._leadContactWrite;
  }
  [key: string]: any;
  private async getTeamPolicyRequiredRadarChannels(userIdRaw: unknown): Promise<RadarChannelFilter[]> {
    const userId = Math.trunc(Number(userIdRaw || 0));
    if (!userId) return [];
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    return this.normalizeRadarChannels(getTeamPolicyRequiredChannelList(policy));
  }

  private async assertSellerTeamPolicyAccess(user: any, accessKey: string, message: string) {
    if (!this.isCompanySellerUser(user)) return;
    const userId = Math.trunc(Number(user?.id || 0));
    if (!userId) return;
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    if (resolveTeamPolicyAccessAllowed(policy, accessKey) === false) {
      throw new ForbiddenException(message);
    }
  }

  // RBAC Sprint 1: enforcement de chaves criticas que atingem tambem o GERENTE
  // (role=ADMIN com canViewBilling=false). O toggle do Gerencial deixa de ser
  // decorativo: um `false` explicito na politica bloqueia INCLUSIVE ADMIN. O
  // system_master nunca e bloqueado (nao tem politica persistida; guard extra
  // por seguranca). Caminhos de sistema/cron NAO passam por aqui (sem user).
  private async assertTeamPolicyAccessAnyRole(user: any, accessKey: string, message: string) {
    if (user?.isSystemMaster) return;
    const userId = Math.trunc(Number(user?.id || 0));
    if (!userId) return;
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    if (resolveTeamPolicyAccessAllowed(policy, accessKey) === false) {
      throw new ForbiddenException(message);
    }
  }

  private async applyTeamPolicyRadarFilters<T extends { requiredChannels?: any; channelMatchMode?: any }>(
    context: SearchExecutionContext,
    filters: T,
  ): Promise<T> {
    const required = await this.getTeamPolicyRequiredRadarChannels(context.userId);
    if (!required.length) return filters;
    const mergedRequired = Array.from(new Set([
      ...this.normalizeRadarChannels((filters as any).requiredChannels || []),
      ...required,
    ]));
    return {
      ...filters,
      requiredChannels: mergedRequired,
      channelMatchMode: 'all_required',
    };
  }

  private buildNormalizedSearchInputFromRadarFilters(filters: NormalizedRadarFilters): NormalizedSearchInput {
    return this.getRadarSearchInput().buildNormalizedSearchInputFromRadarFilters(filters, this.buildRadarSearchInputHost());
  }

  private isTerminalRadarSearchRunStatus(status: string | null | undefined) {
    return this.isTerminalSearchRunStatus(status);
  }

  private resolveRadarRunOperationalState(run: any, status: WebscrapingSearchRunStatus, message: string | null): {
    state: RadarOperationalState;
    reason: string | null;
    message: string | null;
  } {
    return this.getRadarRunPresenter().resolveRadarRunOperationalState(run, status, message);
  }

  private buildRadarSearchRunMessage(run: any, deliveredCount: number, requestedQuantity: number) {
    return this.getRadarRunPresenter().buildRadarSearchRunMessage(
      run,
      deliveredCount,
      requestedQuantity,
      (status) => this.normalizeSearchRunStatus(status),
    );
  }

  private buildRadarFiltersFromSearchRun(run: any) {
    return this.getRadarSearchInput().buildRadarFiltersFromSearchRun(run, this.buildRadarSearchInputHost());
  }

  private async findRadarPoolRowsForRunItems(companyId: number, items: any[], limit: number) {
    if (!(await this.supportsRadarPersistence())) return [];
    const foundItems = (Array.isArray(items) ? items : []).filter((item) => String(item?.status || '') === 'found');
    const phoneOrder = foundItems.map((item) => normalizePhoneDigits(item?.phoneDigits || item?.phone)).filter(Boolean);
    const placeOrder = foundItems.map((item) => String(item?.placeId || '').trim()).filter(Boolean);
    const phoneSet = new Set(phoneOrder);
    const placeSet = new Set(placeOrder);
    if (!phoneSet.size && !placeSet.size) return [];
    const or: any[] = [];
    if (phoneSet.size) or.push({ phoneDigits: { in: Array.from(phoneSet) } });
    if (placeSet.size) or.push({ placeId: { in: Array.from(placeSet) } });
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { OR: or },
      take: Math.min(Math.max(limit * 4, 100), 1000),
      include: {
        contacts: {
          orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
        },
        companyStates: {
          where: { companyId },
          take: 1,
          select: {
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
          },
        },
        events: {
          where: { OR: [{ companyId }, { companyId: null }] },
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
    const usableRows = rows.filter((row: any) => {
      const state = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      return !this.isRadarProtectedStatus(state?.status || row?.status);
    });
    const byPhone = new Map<string, any>();
    const byPlace = new Map<string, any>();
    for (const row of usableRows) {
      const phone = normalizePhoneDigits(row?.phoneDigits || row?.phone);
      const placeId = String(row?.placeId || '').trim();
      if (phone && !byPhone.has(phone)) byPhone.set(phone, row);
      if (placeId && !byPlace.has(placeId)) byPlace.set(placeId, row);
    }
    const ordered: any[] = [];
    const seen = new Set<string>();
    for (const item of foundItems) {
      const phone = normalizePhoneDigits(item?.phoneDigits || item?.phone);
      const placeId = String(item?.placeId || '').trim();
      const row = (phone && byPhone.get(phone)) || (placeId && byPlace.get(placeId));
      if (!row?.id || seen.has(String(row.id))) continue;
      seen.add(String(row.id));
      ordered.push(row);
      if (ordered.length >= limit) break;
    }
    return ordered;
  }

  private summarizeAutoImportFailures(failures: Array<{ reason: string }>) {
    return this.getRadarVendasSyncService().summarizeAutoImportFailures(failures);
  }

  private async syncRadarSearchRunItemsToPool(context: SearchExecutionContext, run: any) {
    if (!(await this.supportsRadarPersistence())) return;
    const normalized = await this.applyTeamPolicyRadarFilters(context, this.normalizeSearchInput({
      city: String(run?.city || ''),
      state: String(run?.state || ''),
      segment: String(run?.segment || ''),
      radiusKm: this.normalizeRadiusKm(parseJsonObject(run?.metricsJson)?.radiusKm),
      originLat: this.normalizeCoordinate(parseJsonObject(run?.metricsJson)?.originLat),
      originLng: this.normalizeCoordinate(parseJsonObject(run?.metricsJson)?.originLng),
      quantity: Math.max(1, safeInteger(run?.targetQuantity)),
      engine: 'hbx',
      targetType: normalizeTargetType(run?.targetType),
      salesProfile: parseJsonObject(run?.metricsJson)?.salesProfile || null,
      ...this.buildChannelFiltersJson(parseJsonObject(parseJsonObject(run?.metricsJson)?.channelFilters || {})),
    }));
    const qualityInput = {
      city: normalized.city,
      state: normalized.state,
      segment: normalized.segment,
      targetType: normalized.targetType,
      regionalCities: normalized.regionalCities,
      preferredChannels: normalized.preferredChannels,
      requiredChannels: normalized.requiredChannels,
      channelMatchMode: normalized.channelMatchMode,
      salesProfile: normalized.salesProfile,
    } as NormalizedRadarFilters;
    const foundItems = (Array.isArray(run?.items) ? run.items : [])
      .filter((item: any) => this.isRunItemPrimaryDeliverable(item, qualityInput));
    if (!foundItems.length) return;
    const contacts = foundItems
      .map((item: any) => this.mapRunItemToContact(item))
      .filter((item: WebscrapingContactResult) => this.hasUsablePublicContactChannel(item as any));

    if (contacts.some((item) => String(item.source || '') !== 'radar_database')) {
      const groups = new Map<string, WebscrapingContactResult[]>();
      for (const contact of contacts) {
        const city = String((contact as any).city || normalized.city || '').trim();
        const state = String((contact as any).state || normalized.state || '').trim().toUpperCase();
        const segment = String((contact as any).segment || normalized.segment || '').trim();
        const key = `${state}|${normalizeLookupValue(city)}|${normalizeLookupValue(segment)}`;
        const current = groups.get(key) || [];
        current.push(contact);
        groups.set(key, current);
      }
      for (const groupContacts of groups.values()) {
        const first = groupContacts[0] as any;
        const groupInput = this.normalizeSearchInput({
          city: first.city || normalized.city,
          state: first.state || normalized.state,
          segment: first.segment || normalized.segment,
          radiusKm: normalized.radiusKm,
          originLat: normalized.originLat,
          originLng: normalized.originLng,
          quantity: Math.max(1, groupContacts.length),
          engine: 'hbx',
          targetType: normalized.targetType,
          salesProfile: normalized.salesProfile,
          preferredChannels: normalized.preferredChannels,
          requiredChannels: normalized.requiredChannels,
          channelMatchMode: normalized.channelMatchMode,
        });
        await this.persistRadarLeadPoolBatch(groupInput, groupContacts, 'hbx').catch((error: any) => {
          this.logger.warn(`[radar-run] falha ao sincronizar lote no RadarLeadPool run=${run?.id || '-'}: ${String(error?.message || error)}`);
        });
      }
    }

    // LIMPEZA-DESTRUTIVA L1 (04/07): o run NUNCA reivindica pro funil, pra NENHUM papel
    // (inclusive USERMASTER/admin/master). Este método só enche a vitrine (pool com
    // ownerCompanyId=null) — o funil só recebe card por PUXADA MANUAL
    // (send-to-vendas). Ver docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md.
  }

  // A busca e gratuita e mascarada. Limites comerciais e capacidade do vendedor
  // pertencem exclusivamente a puxada debitada; nunca pausam nem reduzem a descoberta.
  private isRadarAutoImportLimitError(error: any) {
    return this.getRadarVendasSyncService().isAutoImportLimitError(error);
  }

  private buildSearchProcessSnapshot(run: any, input: {
    progress?: number;
    items?: any[];
    counters?: Record<string, number>;
  } = {}) {
    const rawStatus = this.normalizeSearchRunStatus(run?.status);
    const terminal = this.isTerminalRadarSearchRunStatus(rawStatus);
    const processStatus = rawStatus === 'failed' || rawStatus === 'canceled'
      ? 'failed'
      : rawStatus === 'completed_insufficient_results' || rawStatus === 'partial_error'
        ? 'partial'
        : rawStatus === 'completed'
          ? 'completed'
          : rawStatus === 'queued' || rawStatus === 'sleeping'
            ? 'starting'
            : 'running';
    const metrics = parseJsonObject(run?.metricsJson);
    const coverage = parseJsonObject(metrics?.sourceCoverage);
    const publicCoverage = Object.fromEntries(['rfb', 'motor'].map((key) => {
      const state = parseJsonObject(coverage?.[key]);
      const status = ['pending', 'running', 'completed', 'failed'].includes(String(state?.status || ''))
        ? String(state.status)
        : 'pending';
      return [key, {
        attempted: state?.attempted === true,
        succeeded: state?.succeeded === true,
        status,
        found: safeInteger(state?.found),
      }];
    }));
    const matchedCount = safeInteger(run?.foundCount);
    const duplicateCount = safeInteger(run?.duplicateCount);
    const discardedCount = safeInteger(run?.skippedCount);
    const processedCount = matchedCount + duplicateCount + discardedCount;
    const pipelineStageStatus = terminal ? 'completed' : processedCount > 0 ? 'running' : 'pending';
    const normalizeStage = (key: 'rfb' | 'motor', label: string) => {
      const state = parseJsonObject(coverage?.[key]);
      const status = state?.status === 'completed'
        ? 'completed'
        : state?.status === 'failed'
          ? 'failed'
          : state?.status === 'running'
            ? 'running'
            : 'pending';
      return {
        key,
        label,
        status,
        detail: state?.attempted ? `${safeInteger(state?.found)} encontrado(s)` : null,
      };
    };
    const events = [
      run?.createdAt ? { key: 'search_queued', label: 'Busca enfileirada', status: 'completed', at: run.createdAt.toISOString() } : null,
      coverage?.rfb?.attemptedAt ? { key: 'rfb_attempted', label: 'Consulta à Receita iniciada', status: coverage.rfb.status, at: coverage.rfb.attemptedAt } : null,
      coverage?.motor?.attemptedAt ? { key: 'motor_attempted', label: 'Motor iniciado', status: coverage.motor.status, at: coverage.motor.attemptedAt } : null,
      terminal && run?.finishedAt ? { key: 'search_finished', label: 'Busca finalizada', status: processStatus, at: run.finishedAt.toISOString() } : null,
    ].filter(Boolean);
    const recentLeads = Array.isArray(input.items) ? input.items.slice(-8) : [];
    return {
      operationId: String(run?.id || ''),
      mode: 'search',
      status: processStatus,
      progress: Math.max(0, Math.min(100, safeInteger(input.progress))),
      stages: [
        { key: 'queued', label: 'Preparando pesquisa', status: run?.startedAt ? 'completed' : 'running', detail: null },
        normalizeStage('rfb', 'Consultando a Receita Federal'),
        normalizeStage('motor', 'Consultando o motor HBX'),
        {
          key: 'cross_deduplicate',
          label: 'Cruzando e removendo duplicados',
          status: pipelineStageStatus,
          detail: processedCount > 0 ? `${duplicateCount} duplicado(s) identificado(s)` : null,
        },
        {
          key: 'validate_eligibility',
          label: 'Validando elegibilidade',
          status: pipelineStageStatus,
          detail: processedCount > 0 ? `${discardedCount} descartado(s) pelos critérios` : null,
        },
        { key: 'publishing', label: 'Publicando empresas aprovadas', status: terminal ? 'completed' : matchedCount > 0 ? 'running' : 'pending', detail: matchedCount > 0 ? `${matchedCount} aprovado(s)` : null },
      ],
      counters: {
        scanned: safeInteger(metrics?.rawFoundCount),
        matched: matchedCount,
        duplicates: duplicateCount,
        discarded: discardedCount,
        approved: matchedCount,
        ...(input.counters || {}),
      },
      currentLead: recentLeads.length ? recentLeads[recentLeads.length - 1] : null,
      recentLeads,
      events,
      sourceCoverage: publicCoverage,
    };
  }


  // Próximo nível de alcance que a UI já oferece (Só a cidade=0 → 25 → 50 → 100 km).
  private nextRadarReachRadiusKm(currentRadiusKm: number): number | null {
    const ladder = [25, 50, 100];
    const current = Math.max(0, Math.trunc(Number(currentRadiusKm) || 0));
    for (const step of ladder) {
      if (step > current) return step;
    }
    return null;
  }

  // Esgotou a OFERTA (cidade/segmento secaram e entregou menos que o pedido).
  // Devolve a sugestão de expansão (ampliar alcance / incluir segmentos vizinhos) ou null.
  // Só em estado terminal "parado"; não existe pausa comercial na descoberta.
  private buildRadarRunExpansionSuggestion(
    filters: NormalizedRadarFilters,
    deliveredCount: number,
    requestedQuantity: number,
    operationalState: string,
    status: string,
  ) {
    if (operationalState !== 'parado') return null;
    if (status !== 'completed_insufficient_results' && status !== 'partial_error') return null;
    const delivered = Math.max(0, safeInteger(deliveredCount));
    const requested = Math.max(1, safeInteger(requestedQuantity));
    if (delivered <= 0 || delivered >= requested) return null;

    const city = String(filters?.city || '').trim();
    const state = String(filters?.state || '').trim().toUpperCase() || null;
    const segment = String(filters?.segment || '').trim();
    if (!segment) return null;
    const currentRadiusKm = Math.max(0, Math.trunc(Number(filters?.radiusKm) || 0));
    const nextRadiusKm = this.nextRadarReachRadiusKm(currentRadiusKm);
    const neighborSegments = buildRadarNeighborSegments(segment, 4);
    if (!nextRadiusKm && neighborSegments.length === 0) return null;

    const config = this.getRadarSearchRunConfig();
    return {
      city,
      state,
      segment,
      deliveredCount: delivered,
      requestedQuantity: requested,
      currentRadiusKm,
      nextRadiusKm,
      neighborSegments,
      headline: config.buildExpansionSuggestionHeadline(city, segment, delivered),
      widenReachLabel: config.buildExpansionWidenReachLabel(nextRadiusKm),
      widenSegmentLabel: config.buildExpansionWidenSegmentLabel(neighborSegments),
    };
  }

  // `options.skipAutoImport` virou no-op pela LIMPEZA-DESTRUTIVA L1: o run nunca importa
  // pro funil de qualquer forma. Assinatura preservada só pra não mexer nos call-sites.
  private async buildRadarSearchRunResponse(user: any, runId: string, options?: { skipAutoImport?: boolean }) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: run de busca e da EMPRESA — sem escopo por vendedor.
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Pesquisa do Radar nao encontrada.');

    // LIMPEZA-DESTRUTIVA L1: sync só enche a vitrine, pra TODO papel — nunca reivindica.
    if (this.normalizeSearchRunStatus(run.status) !== 'canceled') {
      await this.syncRadarSearchRunItemsToPool(context, run).catch((error: any) => {
        this.logger.warn(`[radar-run] sync ignorado run=${run.id}: ${String(error?.message || error)}`);
      });
    }
    const freshRun = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: run.id, companyId: context.companyId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const effectiveRun = freshRun || run;
    const metrics = parseJsonObject(effectiveRun.metricsJson);
    const filters = await this.applyTeamPolicyRadarFilters(context, this.buildRadarFiltersFromSearchRun(effectiveRun));
    const requestedQuantity = Math.max(1, safeInteger(effectiveRun.targetQuantity));
    const allFoundRunItems = (effectiveRun.items || []).filter((item: any) => String(item?.status || '') === 'found');
    const primaryFoundItems = allFoundRunItems.filter((item: any) => this.isRunItemPrimaryDeliverable(item, filters));
    const foundItems = allFoundRunItems.filter((item: any) => this.isRunItemQualityDeliverable(item, filters));
    const requiredChannelRejectedCount = 0;
    const candidateLookupLimit = requestedQuantity;
    let orderedRows = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      primaryFoundItems,
      candidateLookupLimit,
    );
    const status = this.normalizeSearchRunStatus(effectiveRun.status);
    const terminal = this.isTerminalRadarSearchRunStatus(status);
    // LIMPEZA-DESTRUTIVA L1 (04/07): o run NUNCA importa/reivindica pro funil de Vendas,
    // pra NENHUM papel. `autoImport` fica sempre "ran: false" — só informativo pro front
    // (contrato preservado). A vitrine já foi enchida acima por syncRadarSearchRunItemsToPool.
    const autoImport: { ran: boolean; importedCount: number; pendingCount: null; remaining: null; failures: any[] } = {
      ran: false,
      importedCount: safeInteger(effectiveRun.importedCount),
      pendingCount: null,
      remaining: null,
      failures: [],
    };
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const rowPublicItems = orderedRows.map((row) => this.buildRadarLeadPublic(row, {
      maskContact: true,
      viewerCompanyId: context.companyId,
      ownershipEnabled,
    }));
    const seenPhones = new Set(
      rowPublicItems
        .map((item: any) => normalizePhoneDigits(item?.phoneDigits || item?.phone))
        .filter(Boolean),
    );
    const seenPlaces = new Set(
      rowPublicItems
        .map((item: any) => String(item?.placeId || '').trim())
        .filter(Boolean),
    );
    const seenNames = new Set(
      rowPublicItems
        .map((item: any) => normalizeLookupValue(`${item?.name || ''}-${item?.city || filters.city}-${item?.state || filters.state}`))
        .filter(Boolean),
    );
    const fallbackSourceItems = primaryFoundItems;
    const fallbackRunItems = fallbackSourceItems.filter((item: any) => {
      const contact = this.mapRunItemToContact(item);
      const phone = normalizePhoneDigits(contact.phoneDigits || contact.phone || item?.phoneDigits || item?.phone);
      const place = String(contact.placeId || item?.placeId || '').trim();
      const nameKey = normalizeLookupValue(`${contact.name || item?.name || ''}-${(contact as any).city || item?.city || filters.city}-${(contact as any).state || item?.state || filters.state}`);
      if (phone && seenPhones.has(phone)) return false;
      if (place && seenPlaces.has(place)) return false;
      if (nameKey && seenNames.has(nameKey)) return false;
      if (phone) seenPhones.add(phone);
      if (place) seenPlaces.add(place);
      if (nameKey) seenNames.add(nameKey);
      return true;
    }).slice(0, Math.max(0, requestedQuantity - rowPublicItems.length));
    const fallbackPublicItems = fallbackRunItems.map((item: any, index: number) => {
      const contact = this.mapRunItemToContact(item) as any;
      const localFilters = {
        ...filters,
        city: String(contact.city || item?.city || filters.city || '').trim(),
        state: String(contact.state || item?.state || filters.state || '').trim(),
        segment: String(contact.segment || item?.segment || filters.segment || '').trim(),
        normalizedCity: normalizeLookupValue(contact.city || item?.city || filters.city || ''),
        normalizedSegment: normalizeLookupValue(contact.segment || item?.segment || filters.segment || ''),
      } as NormalizedRadarFilters;
      return {
        ...this.buildDirectRadarLeadPublic(contact, localFilters, rowPublicItems.length + index),
        id: `run:${effectiveRun.id}:${item.id}`,
        radarRunId: effectiveRun.id,
        radarRunItemId: item.id,
      };
    });
    const publicCandidates = [...rowPublicItems, ...fallbackPublicItems]
      .slice(0, requestedQuantity)
      .map((item: any, index: number) => this.sanitizeRadarPreDebitLead(item, {
        // O id opaco mantém a seleção do card sem revelar a identidade da empresa.
        // O presenter resolve o id real somente dentro do endpoint autenticado de pull.
        id: String(item?.id || `run:${effectiveRun.id}:${index + 1}`),
      }));
    // WhatsApp é enriquecimento e fica adiado até o pull pós-débito.
    const items = publicCandidates;
    const deliveredCount = items.length;
    const databaseCount = foundItems.filter((item: any) => String(item.source || '') === 'radar_database').length;
    const fetchedCount = Math.max(0, deliveredCount - databaseCount);
    const progress = requestedQuantity > 0
      ? Math.min(100, Math.round((Math.max(deliveredCount, safeInteger(effectiveRun.foundCount)) / requestedQuantity) * 100))
      : 100;
    const qualitySummary = this.buildSearchRunQualitySummary(effectiveRun, deliveredCount);
    const message = this.buildRadarSearchRunMessage(effectiveRun, deliveredCount, requestedQuantity);
    const operational = this.resolveRadarRunOperationalState(effectiveRun, status, message);
    if (terminal) {
      await this.updateSearchRunMetrics(effectiveRun.id, {
        status,
        durationMs: safeInteger(qualitySummary.durationMs),
      }).catch(() => null);
    }

    return {
      id: effectiveRun.id,
      runId: effectiveRun.id,
      status,
      items,
      total: terminal ? deliveredCount : requestedQuantity,
      code: terminal ? 'RADAR_SEARCH_COMPLETED' : 'RADAR_SEARCH_RUNNING',
      message,
      retryable: !terminal,
      targetQuantity: requestedQuantity,
      foundCount: Math.max(deliveredCount, safeInteger(effectiveRun.foundCount)),
      errorMessage: message || effectiveRun.errorMessage || null,
      process: this.buildSearchProcessSnapshot(effectiveRun, {
        progress,
        items,
        counters: { approved: deliveredCount },
      }),
      meta: {
        requestedQuantity,
        deliveredCount,
        databaseCount,
        fetchedCount,
        requiredChannels: filters.requiredChannels,
        channelMatchMode: filters.channelMatchMode,
        requiredChannelRejectedCount,
        progress,
        terminal,
        operationalState: operational.state,
        operationalReason: operational.reason,
        operationalMessage: operational.message,
        expansionSuggestion: this.buildRadarRunExpansionSuggestion(
          filters,
          Math.max(deliveredCount, primaryFoundItems.length),
          requestedQuantity,
          operational.state,
          status,
        ),
        status,
        runId: effectiveRun.id,
        nextRetryAt: effectiveRun.nextRetryAt instanceof Date ? effectiveRun.nextRetryAt.toISOString() : null,
        attemptCount: safeInteger(effectiveRun.attemptCount),
        autoImport: autoImport || {
          ran: false,
          importedCount: safeInteger(effectiveRun.importedCount),
          pendingCount: null,
          remaining: null,
          failures: [],
        },
        filters: {
          state: filters.state,
          city: filters.city,
          segment: filters.segment,
          radiusKm: filters.radiusKm,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          selectedSegments: this.splitHbxBatchSegments(filters.segment),
          targetType: filters.targetType,
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
        searchScope: metrics?.searchScope || {
          currentCity: filters.city,
          currentState: filters.state,
          currentSegment: this.splitHbxBatchSegments(filters.segment)[0] || filters.segment,
          cityIndex: 1,
          cityCount: Math.max(1, filters.regionalCities.length || 1),
          segmentIndex: 1,
          segmentCount: Math.max(1, this.splitHbxBatchSegments(filters.segment).length || 1),
          queryIndex: 0,
          queryCount: 0,
          taskIndex: 0,
          taskCount: 0,
          radiusKm: filters.radiusKm,
        },
        qualitySummary,
        whatsappCheck: { mode: 'off', checked: 0, deferredUntilClaim: true },
      },
    };
  }

  async startRadarSearchRunForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    await this.assertSellerTeamPolicyAccess(user, 'radar.search.run', 'Busca do Radar bloqueada pela politica da equipe.');
    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para pesquisar no Radar.');
    }
    await this.assertSearchRunPersistence();
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    filters.limit = Math.max(filters.limit, filters.quantity);

    const normalized = this.buildNormalizedSearchInputFromRadarFilters(filters);
    const matchingRun = await this.findActiveRadarRunForFilters(context, filters);
    await this.cancelIncompatibleActiveRadarRuns(context, filters, matchingRun?.id || null);
    if (matchingRun?.id) {
      return this.buildRadarSearchRunResponse(user, matchingRun.id);
    }

    let stockRows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(filters.quantity, filters.minimumStock, 100),
      requirePhone: false,
      availableOnly: true,
    });
    let relaxedStockLookup = false;
    if (!stockRows.length && filters.salesProfile) {
      stockRows = await this.queryRadarRowsForCompany(context.companyId, {
        ...filters,
        salesProfile: null,
      }, {
        limit: Math.max(filters.quantity, filters.minimumStock, 100),
        requirePhone: false,
        availableOnly: true,
      });
      relaxedStockLookup = stockRows.length > 0;
    }
    // LIMPEZA-DESTRUTIVA L1 (04/07): o START da busca NUNCA reivindica estoque pro funil,
    // pra NENHUM papel (inclusive USERMASTER/admin/master). O estoque existente já está
    // consultável na VITRINE (queryRadarRowsForCompany availableOnly=true, ownerCompanyId=null);
    // o usuário puxa na mão pela operação canônica send-to-vendas. A busca só enfileira o run
    // e o motor apenas expande a descoberta mascarada — não há mais "entrega imediata do banco"
    // nem markRadarDelivered aqui. Ver docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md.
    const availableStockCount = stockRows.length;
    const run = await this.prisma.webscrapingSearchRun.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: 'queued',
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment,
        engine: 'hbx',
        targetType: normalized.targetType,
        targetQuantity: normalized.quantity,
        startedAt: null,
        finishedAt: null,
        errorMessage: availableStockCount > 0
          ? `${availableStockCount} card(s) ja disponivel(is) na vitrine para puxar. Radar tambem trabalhando para trazer mais.`
          : 'Sem cards prontos na vitrine. Busca enviada para a fila do Radar.',
        metricsJson: JSON.stringify({
          activeSearchSignature: this.buildRadarActiveSearchSignature(filters),
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          radiusKm: filters.radiusKm,
          originLat: filters.originLat,
          originLng: filters.originLng,
          scoreRange: filters.scoreRange,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          selectedSegments: this.splitHbxBatchSegments(filters.segment),
          searchScope: {
            currentCity: filters.city,
            currentState: filters.state,
            currentSegment: this.splitHbxBatchSegments(filters.segment)[0] || filters.segment,
            cityIndex: 1,
            cityCount: Math.max(1, filters.regionalCities.length || 1),
            segmentIndex: 1,
            segmentCount: Math.max(1, this.splitHbxBatchSegments(filters.segment).length || 1),
            queryIndex: 0,
            queryCount: 0,
            taskIndex: 0,
            taskCount: 0,
            radiusKm: filters.radiusKm,
            regionalCities: filters.regionalCities.map((item) => ({
              city: item.city,
              state: item.state,
              distanceKm: item.distanceKm,
            })),
            selectedSegments: this.splitHbxBatchSegments(filters.segment),
          },
          channelFilters: this.buildChannelFiltersJson({
            preferredChannels: filters.preferredChannels,
            requiredChannels: filters.requiredChannels,
            channelMatchMode: filters.channelMatchMode,
          }),
          relaxedStockLookup,
          ...(filters.salesProfile ? { salesProfile: filters.salesProfile } : {}),
        }),
      },
    });
    this.radarWhatsappCheckModeByRunId.set(run.id, filters.whatsappCheckMode);

    // LIMPEZA-DESTRUTIVA L1: sem entrega imediata do banco pro funil — o estoque fica na
    // vitrine e o run vai sempre pra fila; o motor trabalha e syncRadarSearchRunItemsToPool
    // mantém a vitrine cheia. Nada é reivindicado/salvo como "entregue" no START.
    this.scheduleSearchRunPump(0);

    return this.buildRadarSearchRunResponse(user, run.id);
  }

  async getRadarSearchRunForUser(user: any, runId: string) {
    return this.buildRadarSearchRunResponse(user, runId);
  }

  async getLatestRadarSearchRunForUser(user: any) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: ultimo run da EMPRESA, nao so do vendedor que pediu.
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping', 'paused'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    if (!run) return null;
    return this.buildRadarSearchRunResponse(user, run.id);
  }

  async cancelRadarSearchRunForUser(user: any, runId: string) {
    await this.cancelSearchRunForUser(user, runId);
    return this.buildRadarSearchRunResponse(user, runId, { skipAutoImport: true });
  }

  private async findActiveRadarRunForFilters(context: SearchExecutionContext, filters: NormalizedRadarFilters) {
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.findMany) return null;
    // LIMPEZA-DESTRUTIVA L3: runs ativos da EMPRESA (lagoa unica), sem escopo por vendedor.
    const activeRuns = await delegate.findMany({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 20,
    }).catch(() => []);
    return (activeRuns || []).find((run: any) => this.radarRunMatchesFilters(run, filters)) || null;
  }

  private async cancelIncompatibleActiveRadarRuns(context: SearchExecutionContext, filters: NormalizedRadarFilters, keepRunId?: string | null) {
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.findMany) return { canceledCount: 0 };
    // LIMPEZA-DESTRUTIVA L3: cancela runs incompativeis da EMPRESA inteira, sem escopo por vendedor.
    const activeRuns = await delegate.findMany({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 50,
    }).catch(() => []);
    let canceledCount = 0;
    for (const run of activeRuns || []) {
      const runId = String(run?.id || '').trim();
      if (!runId || (keepRunId && runId === keepRunId)) continue;
      if (this.radarRunMatchesFilters(run, filters)) continue;
      await this.prisma.webscrapingSearchRun.updateMany({
        where: {
          id: runId,
          companyId: context.companyId,
          status: { in: ['queued', 'running', 'sleeping'] as any },
        },
        data: {
          status: 'canceled',
          lastBatchStatus: 'replaced_by_new_search',
          errorMessage: 'Pesquisa encerrada porque uma nova busca com outros filtros foi iniciada.',
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      if (run?.assignedEngineId) {
        await this.getEnginePool().releaseEngine(String(run.assignedEngineId)).catch(() => null);
      }
      await this.releaseRadarReservationsForSearchRun(context, runId, 'Pesquisa substituida por nova busca.').catch((error: any) => {
        this.logger.warn(`[radar-run] falha ao liberar reservas do run substituido=${runId}: ${String(error?.message || error)}`);
      });
      canceledCount += 1;
    }
    return { canceledCount };
  }

  private async releaseRadarReservationsForSearchRun(context: SearchExecutionContext, runId: string, note?: string | null) {
    if (!(await this.supportsRadarOwnershipPersistence())) return { releasedCount: 0 };
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: String(runId || '').trim(), companyId: context.companyId },
      include: { items: { where: { status: 'found' as any }, orderBy: { createdAt: 'asc' } } },
    }).catch(() => null);
    const foundItems = Array.isArray(run?.items) ? run.items : [];
    if (!foundItems.length) return { releasedCount: 0 };
    const rows = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      foundItems,
      Math.max(foundItems.length, 100),
    );
    let releasedCount = 0;
    const now = new Date();
    for (const row of rows) {
      if (!this.isReleasableRadarReservation(row)) continue;
      const previousStatus = this.normalizeRadarLeadStatus(row.status);
      const updated = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: row.id,
          ownerCompanyId: context.companyId,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
        },
        data: {
          ownerCompanyId: null,
          claimedAt: null,
          status: 'clean',
          lastSeenAt: now,
        },
      }).catch(() => ({ count: 0 }));
      if (!updated?.count) continue;
      await (this.prisma as any).radarLeadCompanyState.updateMany({
        where: {
          companyId: context.companyId,
          radarLeadId: row.id,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
          vendasLeadId: null,
        },
        data: {
          status: 'new',
          lastActionAt: now,
        },
      }).catch(() => null);
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'ownership_released',
        note: note || 'Reserva liberada ao parar a pesquisa.',
        statusFrom: previousStatus,
        statusTo: 'clean',
      });
      releasedCount += 1;
    }
    return { releasedCount };
  }

  private async _bumpSegmentAffinity(userId: number, segment: string): Promise<void> {
    const n = normalizeLookupValue(String(segment || ''));
    if (!n || !userId) return;
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { segmentAffinityJson: true } as any,
    }).catch(() => null);
    const next = incrementAffinity((row as any)?.segmentAffinityJson, n);
    await this.prisma.user.update({
      where: { id: userId },
      data: { segmentAffinityJson: next } as any,
    }).catch(() => null);
  }

  private async getRadarStockConfig(filters: NormalizedRadarFilters) {
    if (filters.stockOverride) {
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    if (!(await this.prisma.hasTable('RadarStockConfig'))) {
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    const existing = await (this.prisma as any).radarStockConfig.findUnique({
      where: {
        normalizedCity_state_normalizedSegment: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
        },
      },
    }).catch(() => null);
    if (!existing) {
      await (this.prisma as any).radarStockConfig.create({
        data: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          engine: filters.engine,
          targetType: filters.targetType,
          filtersJson: JSON.stringify({
            minRating: filters.minRating,
            minReviews: filters.minReviews,
            noWebsite: filters.noWebsite,
            weakWebsite: filters.weakWebsite,
            opportunityLevel: filters.opportunityLevel,
          }),
        },
      }).catch(() => null);
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    return {
      desiredStock: Math.max(1, Math.trunc(Number(existing.desiredStock || filters.desiredStock))),
      minimumStock: Math.max(1, Math.trunc(Number(existing.minimumStock || filters.minimumStock))),
      engine: normalizeEngine(existing.engine || filters.engine),
      targetType: normalizeTargetType(existing.targetType || filters.targetType),
    };
  }

  async replenishRadarStockForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    await this.assertSellerTeamPolicyAccess(user, 'radar.stock.replenish', 'Reposicao de estoque do Radar bloqueada pela politica da equipe.');
    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para repor o estoque do Radar.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const stockConfig = await this.getRadarStockConfig(filters);
    const effectiveFilters = {
      ...filters,
      desiredStock: stockConfig.desiredStock,
      minimumStock: stockConfig.minimumStock,
      engine: stockConfig.engine,
      targetType: stockConfig.targetType,
    };
    const beforeRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: false,
    });
    const allKnownRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity, 1000),
      requirePhone: false,
      includeHidden: true,
    });
    const cleanStockBefore = beforeRows.length;
    if (cleanStockBefore >= effectiveFilters.minimumStock) {
      return {
        ran: false,
        reason: 'stock_above_minimum',
        cleanStockBefore,
        cleanStockAfter: cleanStockBefore,
        fetchedCount: 0,
        desiredStock: effectiveFilters.desiredStock,
        minimumStock: effectiveFilters.minimumStock,
      };
    }

    const fetchedResults: WebscrapingContactResult[] = [];
    const seenPhones = new Set(allKnownRows.map((row) => normalizePhoneDigits(row?.phoneDigits || row?.phone)).filter(Boolean));
    const seenSocialProfiles = new Set(
      allKnownRows
        .flatMap((row) => [row?.instagramUrl, row?.facebookUrl])
        .map((url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase())
        .filter(Boolean),
    );
    const shortage = Math.max(0, effectiveFilters.desiredStock - cleanStockBefore);
    let attempts = 0;
    while (fetchedResults.length < shortage && attempts < 6) {
      attempts += 1;
      const batchQuantity = Math.min(maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType), shortage - fetchedResults.length);
      const response = await this.searchContactsForUser(
        user,
        {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          quantity: Math.max(1, batchQuantity),
          engine: effectiveFilters.engine,
          targetType: effectiveFilters.targetType,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          excludePhoneDigits: Array.from(seenPhones),
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
        {
          skipRadarLookup: true,
          skipPrivateHistory: true,
          skipTechnicalCache: true,
          recordUsage: false,
          purpose: 'radar_digital',
        },
      );
      const mappedResults = (response.results || []).map((result) => ({
        ...result,
        placeId: result.placeId || `radar_external:${normalizePhoneDigits(result.phoneDigits || result.phone) || result.name}`,
      })) as WebscrapingContactResult[];
      let acceptedInBatch = 0;
      for (const result of mappedResults) {
        const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
        const socialKeys = [result.instagramUrl, result.facebookUrl]
          .map((url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase())
          .filter(Boolean);
        const hasUsablePublicContact = this.hasUsablePublicContactChannel(result as any);
        if (!hasUsablePublicContact || (phone && seenPhones.has(phone)) || socialKeys.some((key) => seenSocialProfiles.has(key))) continue;
        if (phone) seenPhones.add(phone);
        socialKeys.forEach((key) => seenSocialProfiles.add(key));
        fetchedResults.push(result);
        acceptedInBatch += 1;
      }
      if (acceptedInBatch === 0) break;
    }

    if (fetchedResults.length) {
      try {
        await this.persistRadarLeadPoolBatch(
          {
            ...this.normalizeSearchInput({
              city: filters.city,
              state: filters.state,
              segment: filters.segment,
              quantity: Math.min(fetchedResults.length, maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType)),
              engine: effectiveFilters.engine,
              targetType: effectiveFilters.targetType,
              minRating: filters.minRating,
              minReviews: filters.minReviews,
              preferredChannels: filters.preferredChannels,
              requiredChannels: filters.requiredChannels,
              channelMatchMode: filters.channelMatchMode,
            }),
            city: filters.city,
            state: filters.state,
            segment: filters.segment,
            normalizedCity: filters.normalizedCity,
            normalizedSegment: filters.normalizedSegment,
          },
          fetchedResults,
          effectiveFilters.engine,
        );
      } catch (error: any) {
        this.logger.error(`[radar] failed to persist batch: ${error?.message || error}`);
      }
    }

    const afterRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: false,
    });

    return {
      ran: true,
      reason: 'stock_below_minimum',
      cleanStockBefore,
      cleanStockAfter: afterRows.length,
      fetchedCount: fetchedResults.length,
      desiredStock: effectiveFilters.desiredStock,
      minimumStock: effectiveFilters.minimumStock,
      attempts,
    };
  }

  private async persistRadarLeadPoolBatch(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    sourceEngine: string,
    options: { strictLocalDdd?: boolean; sourceUrl?: string | null; engineUrl?: string | null } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    // Não enriquecer estoque/previews. O motor só complementa o lead depois do
    // débito e da reivindicação persistente da operação de pull.
    const resultsToPersist = results;
    const delegate = (this.prisma as any).radarLeadPool;
    const now = new Date();
    const expectedDdds = this.buildExpectedDdds(input);
    const strictLocalDdd = options.strictLocalDdd === true;
    const counts = { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    for (const result of this.mergeDedupedContacts(resultsToPersist)) {
      const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
      const ddd = this.extractDdd(phoneDigits || result.phone);
      const resultCity = String((result as any).city || input.city || '').trim();
      const resultState = String((result as any).state || input.state || '').trim().toUpperCase();
      const resultSegment = String((result as any).segment || input.segment || '').trim();
      const resultNormalizedCity = normalizeLookupValue(resultCity || input.city || '');
      const resultNormalizedSegment = normalizeLookupValue(resultSegment || input.segment || '');
      const resultExpectedDdds = this.buildExpectedDdds({
        city: resultCity || input.city,
        state: resultState || input.state,
        segment: resultSegment || input.segment,
      });
      const resultWebsiteForIdentity = String((result as any).website || '').trim();
      const safeResultWebsiteForIdentity = resultWebsiteForIdentity
        && !this.isBlockedLeadOfficialWebsite(resultWebsiteForIdentity)
        && websiteHostLooksCompatibleWithLead(result, resultWebsiteForIdentity)
        ? resultWebsiteForIdentity
        : '';
      const socialIdentity = normalizeLookupValue(result.instagramUrl || result.facebookUrl || safeResultWebsiteForIdentity || '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const placeId = result.placeId && !String(result.placeId).startsWith('radar:') && !String(result.placeId).startsWith('radar_external:')
        ? String(result.placeId)
        : socialIdentity
          ? `hbx:${input.targetType}:social:${socialIdentity}`
          : null;
      if (!phoneDigits && !placeId) continue;
      const quality = this.getCandidateQuality({ ...(result as any), phoneDigits }, input);
      const dddMismatch = strictLocalDdd && resultExpectedDdds.length > 0 && ddd && !resultExpectedDdds.includes(ddd);
      const opportunityScore = this.buildOpportunityScore(result, quality);
      const opportunityReason = result.opportunityReason || this.buildOpportunityReason(result, input);
      const evidenceJson = this.parseMaybeJsonObject((result as any).evidenceJson);
      const rejectReasons = Array.isArray((result as any).rejectReasons)
        ? (result as any).rejectReasons
        : parseJsonArray((result as any).rejectReasons);
      const qualityV2 = this.extractLeadQualityV2FromObject(result as any);
      const existing = await delegate.findFirst({
        where: {
          OR: [
            ...(phoneDigits ? [{ phoneDigits }] : []),
            ...(placeId ? [{ placeId }] : []),
          ],
        },
      }).catch(() => null);
      // O pool e a memoria do lead: a decisao de entrega considera os canais ja
      // conhecidos do card, nao apenas o payload desta sincronizacao.
      const channelCandidate = {
        ...(existing || {}),
        ...(result as any),
        phoneDigits: phoneDigits || existing?.phoneDigits || null,
        email: (result as any).email || existing?.email || null,
        emailStatus: (result as any).emailStatus || existing?.emailStatus || null,
        website: (result as any).website || existing?.website || null,
        websiteStatus: (result as any).websiteStatus || existing?.websiteStatus || null,
        instagramUrl: (result as any).instagramUrl || existing?.instagramUrl || null,
        facebookUrl: (result as any).facebookUrl || existing?.facebookUrl || null,
        whatsappStatus: (result as any).whatsappStatus || (result as any).whatsappCheckStatus || existing?.whatsappStatus || null,
      };
      const delivery = this.classifyCardDelivery(channelCandidate, input, quality, qualityV2);
      const leadDeliverable = this.isLeadDeliverableCard(channelCandidate, input, quality, qualityV2);
      if (!leadDeliverable) {
        counts.rejectedCount += 1;
        if (existing?.id && !this.isRadarProtectedStatus(existing.status)) {
          const rejectedEnrichment = this.parseMaybeJsonObject(existing.enrichmentJson);
          const rejectedMetadata = this.parseMaybeJsonObject(existing.metadataJson);
          await delegate.update({
            where: { id: existing.id },
            data: {
              status: 'rejected',
              rejectionReason: quality.status,
              opportunityScore: Math.min(opportunityScore, 25),
              evidenceJson: Object.keys(evidenceJson).length ? JSON.stringify(evidenceJson) : existing.evidenceJson || null,
              rejectReasons: JSON.stringify(Array.from(new Set([quality.status, ...rejectReasons].filter(Boolean)))),
              qualityReason: delivery.qualityReason || quality.reasons?.[0] || quality.status,
              visibilityTier: delivery.visibilityTier,
              deliveryProduct: delivery.deliveryProduct,
              enrichmentJson: JSON.stringify({ ...rejectedEnrichment, quality, delivery }),
              metadataJson: JSON.stringify({
                ...rejectedMetadata,
                targetType: input.targetType,
                expectedDdds,
                lastSourceEngine: sourceEngine,
                quality,
                delivery,
              }),
              lastSeenAt: now,
            },
          }).catch(() => null);
          counts.savedCount += 1;
        }
        continue;
      }
      if (!this.candidateHasRequiredChannels(channelCandidate, input, qualityV2)) {
        counts.rejectedCount += 1;
        continue;
      }
      if (existing?.id) counts.duplicateCount += 1;
      if (dddMismatch) counts.rejectedCount += 1;
      else counts.approvedCount += 1;
      // sourceEngines do pool = DESCOBERTA: engines reais do resultado + source próprio.
      const resultDiscoveryEngines = radarDiscoveryEnginesOf(result as Record<string, any>);
      const sourceEngines = Array.from(new Set([...parseJsonArray(existing?.sourceEngines), ...resultDiscoveryEngines].filter(Boolean).map(String)));
      // enrichmentEngines: quem só ENRIQUECEU (separado pelo pré-save) — acumula no metadataJson.
      const persistedEnrichmentEngines = Array.from(new Set([
        ...(Array.isArray(this.parseMaybeJsonObject(existing?.metadataJson)?.enrichmentEngines)
          ? this.parseMaybeJsonObject(existing?.metadataJson).enrichmentEngines.map(String)
          : []),
        ...(Array.isArray((result as any).enrichmentEngines) ? (result as any).enrichmentEngines.map(String) : []),
      ].filter(Boolean)));
      const existingWasDddMismatch = String(existing?.status || '') === 'rejected' && String(existing?.rejectionReason || '') === 'ddd_mismatch';
      const nextStatus = dddMismatch
        ? 'rejected'
        : existingWasDddMismatch
          ? 'clean'
          : existing?.status || 'clean';
      const nextRejectionReason = dddMismatch
        ? 'ddd_mismatch'
        : existingWasDddMismatch
          ? null
          : existing?.rejectionReason || null;
      const resultIdentity = {
        ...(result as any),
        name: result.name || existing?.name || '',
        city: resultCity || existing?.city || input.city || '',
        state: resultState || existing?.state || input.state || '',
        segment: resultSegment || input.segment || existing?.segment || '',
      };
      const resultInstagramRaw = String((result as any).instagramUrl || '').trim();
      const resultFacebookRaw = String((result as any).facebookUrl || '').trim();
      const existingInstagramRaw = String(existing?.instagramUrl || '').trim();
      const existingFacebookRaw = String(existing?.facebookUrl || '').trim();
      const resultInstagramUrl = resultInstagramRaw
        && !looksLikeThirdPartySocialProfile(resultInstagramRaw)
        && socialProfileLooksCompatibleWithLead(resultIdentity, resultInstagramRaw)
        ? resultInstagramRaw
        : null;
      const resultFacebookUrl = resultFacebookRaw
        && !looksLikeThirdPartySocialProfile(resultFacebookRaw)
        && socialProfileLooksCompatibleWithLead(resultIdentity, resultFacebookRaw)
        ? resultFacebookRaw
        : null;
      const existingInstagramUrl = existingInstagramRaw
        && !looksLikeThirdPartySocialProfile(existingInstagramRaw)
        && socialProfileLooksCompatibleWithLead(existing, existingInstagramRaw)
        ? existingInstagramRaw
        : null;
      const existingFacebookUrl = existingFacebookRaw
        && !looksLikeThirdPartySocialProfile(existingFacebookRaw)
        && socialProfileLooksCompatibleWithLead(existing, existingFacebookRaw)
        ? existingFacebookRaw
        : null;
      const mergedInstagramUrl = resultInstagramUrl || existingInstagramUrl;
      const mergedFacebookUrl = resultFacebookUrl || existingFacebookUrl;
      const resultWebsiteRaw = String((result as any).website || '').trim();
      const existingWebsiteRaw = String(existing?.website || '').trim();
      const resultWebsite = resultWebsiteRaw
        && !this.isBlockedLeadOfficialWebsite(resultWebsiteRaw)
        && websiteHostLooksCompatibleWithLead(result, resultWebsiteRaw)
        ? resultWebsiteRaw
        : null;
      const existingWebsite = existingWebsiteRaw
        && !this.isBlockedLeadOfficialWebsite(existingWebsiteRaw)
        && websiteHostLooksCompatibleWithLead(existing, existingWebsiteRaw)
        ? existingWebsiteRaw
        : null;
      const mergedWebsite = resultWebsite || existingWebsite || null;
      const mergedEmail = normalizeBusinessEmail((result as any).email || existing?.email || '');
      const mergedGoogleMapsUrl = String((result as any).googleMapsUrl || (result as any).mapsUrl || existing?.googleMapsUrl || '').trim() || null;
      const mergedWhatsappStatus = String(
        (result as any).whatsappStatus
        || (result as any).whatsappCheckStatus
        || this.parseMaybeJsonObject((result as any).enrichmentJson)?.whatsappStatus
        || this.parseMaybeJsonObject(existing?.enrichmentJson)?.whatsappStatus
        || '',
      ).trim() || null;
      const websiteStatus = inferWebsiteStatus(mergedWebsite);
      const mergedSocialStatus = mergedInstagramUrl || mergedFacebookUrl
        ? 'found'
        : String((result as any).socialStatus || existing?.socialStatus || '').trim() || null;
      const mergedSocialConfidence = mergedInstagramUrl || mergedFacebookUrl
        ? Math.max(80, safeInteger((result as any).socialConfidence || existing?.socialConfidence))
        : safeInteger((result as any).socialConfidence || existing?.socialConfidence);
      const mergedResult = {
        ...(result as any),
        website: mergedWebsite,
        email: mergedEmail,
        instagramUrl: mergedInstagramUrl,
        facebookUrl: mergedFacebookUrl,
        googleMapsUrl: mergedGoogleMapsUrl,
        whatsappStatus: mergedWhatsappStatus,
        whatsappCheckStatus: mergedWhatsappStatus,
        socialStatus: mergedSocialStatus,
        socialConfidence: mergedSocialConfidence,
      };
      const data = {
        companyId: existing?.companyId || null,
        placeId: placeId || existing?.placeId || null,
        name: result.name || existing?.name || 'Empresa sem nome',
        phone: result.phone || existing?.phone || phoneDigits || null,
        phoneDigits: phoneDigits || existing?.phoneDigits || null,
        ddd: ddd || existing?.ddd || null,
        expectedDddsJson: resultExpectedDdds.length ? JSON.stringify(resultExpectedDdds) : expectedDdds.length ? JSON.stringify(expectedDdds) : existing?.expectedDddsJson || null,
        address: result.address || existing?.address || null,
        city: resultCity || existing?.city || input.city || null,
        state: resultState || existing?.state || input.state || null,
        normalizedCity: resultNormalizedCity || input.normalizedCity,
        segment: resultSegment || existing?.segment || input.segment || null,
        normalizedSegment: resultNormalizedSegment || input.normalizedSegment,
        website: mergedWebsite,
        websiteStatus,
        rating: result.rating == null ? existing?.rating ?? null : result.rating,
        reviews: Math.max(safeInteger(result.reviews), safeInteger(existing?.reviews)),
        source: result.source || existing?.source || sourceEngine || null,
        sourceEngine: sourceEngine || existing?.sourceEngine || null,
        sourceUrl: options.sourceUrl || (result as any).sourceUrl || (result as any)._pageUrl || existing?.sourceUrl || null,
        sourceEngines: JSON.stringify(sourceEngines),
        evidenceJson: Object.keys(evidenceJson).length ? JSON.stringify(evidenceJson) : existing?.evidenceJson || null,
        rejectReasons: rejectReasons.length ? JSON.stringify(rejectReasons) : existing?.rejectReasons || null,
        qualityReason: (result as any).qualityReason || delivery.qualityReason || existing?.qualityReason || null,
        visibilityTier: (result as any).visibilityTier || delivery.visibilityTier || existing?.visibilityTier || null,
        deliveryProduct: delivery.deliveryProduct || existing?.deliveryProduct || null,
        opportunityScore,
        opportunityReason,
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        metadataJson: JSON.stringify({
          ...this.parseMaybeJsonObject(existing?.metadataJson),
          targetType: input.targetType,
          expectedDdds: resultExpectedDdds.length ? resultExpectedDdds : expectedDdds,
          searchCity: input.city,
          searchState: input.state,
          searchSegment: input.segment,
          resultCity: resultCity || null,
          resultState: resultState || null,
          resultSegment: resultSegment || null,
          lastSourceEngine: sourceEngine,
          quality,
          delivery,
          ...(persistedEnrichmentEngines.length ? { enrichmentEngines: persistedEnrichmentEngines } : {}),
          // Preserve CNPJ fields from motor (never overwrite existing non-null value with null)
          ...(((result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj) ? { cnpj: (result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj } : {}),
          ...(((result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae) ? { cnae: (result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae } : {}),
          ...(((result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription) ? { cnaeDescription: (result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription } : {}),
          ...(((result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial) ? { razaoSocial: (result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial } : {}),
        }),
        lastSeenAt: now,
      };
      const enrichment = buildRadarLeadEnrichment({
        ...(existing || {}),
        ...data,
        ...mergedResult,
        status: nextStatus,
        sourceUrl: options.sourceUrl || existing?.sourceUrl || null,
        rawPayload: mergedResult as any,
        salesProfile: this.buildLeadQualitySalesProfileFromFilters(input),
        now,
      });
      const enrichmentJson = this.parseMaybeJsonObject(enrichment.enrichmentJson);
      const finalQualityV2 = this.extractLeadQualityV2FromObject(enrichmentJson) || qualityV2;
      const finalCandidate = {
        ...mergedResult,
        ...data,
        email: enrichment.email || mergedEmail || existing?.email || null,
        instagramUrl: enrichment.instagramUrl || mergedInstagramUrl,
        facebookUrl: enrichment.facebookUrl || mergedFacebookUrl,
        googleMapsUrl: enrichment.googleMapsUrl || mergedGoogleMapsUrl || existing?.googleMapsUrl || null,
        whatsappStatus: mergedWhatsappStatus,
        whatsappCheckStatus: mergedWhatsappStatus,
        phoneDigits,
      };
      const finalDelivery = this.classifyCardDelivery(finalCandidate, input, quality, finalQualityV2);
      const preservedSignals = {
        ...(this.parseMaybeJsonObject(enrichmentJson.signals) || {}),
        ...(mergedWebsite ? { website: mergedWebsite } : {}),
        ...(mergedInstagramUrl ? { instagramUrl: mergedInstagramUrl } : {}),
        ...(mergedFacebookUrl ? { facebookUrl: mergedFacebookUrl } : {}),
        ...(mergedEmail ? { emailCandidate: mergedEmail } : {}),
        ...(mergedGoogleMapsUrl ? { googleMapsUrl: mergedGoogleMapsUrl } : {}),
        ...(mergedWhatsappStatus ? { whatsappStatus: mergedWhatsappStatus } : {}),
      };
      Object.assign(data, {
        email: enrichment.email || mergedEmail || existing?.email || null,
        emailStatus: enrichment.emailStatus,
        emailSource: enrichment.emailSource,
        emailConfidence: enrichment.emailConfidence,
        instagramUrl: enrichment.instagramUrl || mergedInstagramUrl || null,
        facebookUrl: enrichment.facebookUrl || mergedFacebookUrl || null,
        socialStatus: enrichment.instagramUrl || enrichment.facebookUrl || mergedInstagramUrl || mergedFacebookUrl ? 'found' : enrichment.socialStatus,
        socialConfidence: enrichment.instagramUrl || enrichment.facebookUrl || mergedInstagramUrl || mergedFacebookUrl ? Math.max(80, enrichment.socialConfidence, mergedSocialConfidence) : enrichment.socialConfidence,
        googleMapsUrl: enrichment.googleMapsUrl || mergedGoogleMapsUrl || existing?.googleMapsUrl || null,
        businessCategory: enrichment.businessCategory || existing?.businessCategory || null,
        openingHoursStatus: enrichment.openingHoursStatus || existing?.openingHoursStatus || null,
        recommendedChannel: enrichment.recommendedChannel,
        painType: enrichment.painType,
        painLabel: enrichment.painLabel,
        painPitch: enrichment.painPitch,
        opportunityReason: enrichment.opportunityReason || data.opportunityReason,
        metadataJson: JSON.stringify({
          ...this.parseMaybeJsonObject(existing?.metadataJson),
          targetType: input.targetType,
          expectedDdds: resultExpectedDdds.length ? resultExpectedDdds : expectedDdds,
          searchCity: input.city,
          searchState: input.state,
          searchSegment: input.segment,
          resultCity: resultCity || null,
          resultState: resultState || null,
          resultSegment: resultSegment || null,
          lastSourceEngine: sourceEngine,
          quality,
          delivery: finalDelivery,
          ...(persistedEnrichmentEngines.length ? { enrichmentEngines: persistedEnrichmentEngines } : {}),
          // Preserve CNPJ fields (never overwrite existing non-null with null)
          ...(((result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj) ? { cnpj: (result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj } : {}),
          ...(((result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae) ? { cnae: (result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae } : {}),
          ...(((result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription) ? { cnaeDescription: (result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription } : {}),
          ...(((result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial) ? { razaoSocial: (result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial } : {}),
        }),
        enrichmentJson: JSON.stringify({ ...enrichmentJson, signals: preservedSignals, quality, delivery: finalDelivery }),
        enrichmentScore: enrichment.enrichmentScore,
        enrichmentConfidence: enrichment.enrichmentConfidence,
        lastEnrichedAt: enrichment.lastEnrichedAt,
        enrichmentVersion: enrichment.enrichmentVersion,
      });
      let savedId: string | null = existing?.id || null;
      if (existing?.id) {
        await delegate.update({
          where: { id: existing.id },
          data,
        }).catch(() => null);
        savedId = existing.id;
      } else {
        const created = await delegate.create({
          data: {
            ...data,
            firstSeenAt: now,
          },
          select: { id: true },
        }).catch(() => null);
        if (created?.id) savedId = created.id;
      }
      // Escrita dupla ADITIVA em LeadContact (Sprint 5 MOTOR-RFB-FILA): todo contato que chega
      // no pool (busca + L2 síncrono) vira linha consultável/exportável — com gate de formato.
      // Fire-and-forget: nunca atrasa nem falha a persistência do lote.
      if (savedId) {
        const rawContactSource = String(sourceEngine || '').trim().toLowerCase();
        const rfbContactSource = ['cnpj_public', 'rfb', 'receita'].includes(rawContactSource);
        const motorContactSource = ['google', 'brave', 'manual', 'website_crawl'].includes(rawContactSource)
          ? rawContactSource
          : 'hbx_engine';
        const contactCandidates = [
          ...((data as any).email ? [{ kind: 'email' as const, value: String((data as any).email), source: rfbContactSource ? 'rfb_email' : motorContactSource, confidence: safeInteger((data as any).emailConfidence) || 60 }] : []),
          ...(phoneDigits ? [{ kind: 'phone' as const, value: phoneDigits, source: rfbContactSource ? 'rfb_primary' : motorContactSource, confidence: 75 }] : []),
          ...((data as any).instagramUrl ? [{ kind: 'instagram' as const, value: String((data as any).instagramUrl), source: sourceEngine, confidence: safeInteger((data as any).socialConfidence) || 60 }] : []),
          ...((data as any).facebookUrl ? [{ kind: 'facebook' as const, value: String((data as any).facebookUrl), source: sourceEngine, confidence: safeInteger((data as any).socialConfidence) || 60 }] : []),
        ];
        if (contactCandidates.length) {
          this.getLeadContactWrite().writeContacts(this.prisma, savedId, contactCandidates).catch(() => null);
        }
      }
      counts.savedCount += 1;
    }
    return counts;
  }

  private async recordRadarLeadEvent(input: {
    leadId: string;
    companyId?: number | null;
    userId?: number | null;
    eventType: RadarLeadEventType;
    note?: string | null;
    statusFrom?: string | null;
    statusTo?: string | null;
  }) {
    if (!(await this.prisma.hasTable('RadarLeadEvent'))) return null;
    return (this.prisma as any).radarLeadEvent.create({
      data: {
        leadId: input.leadId,
        companyId: input.companyId || null,
        eventType: input.eventType,
        note: String(input.note || '').trim() || null,
        statusFrom: input.statusFrom || null,
        statusTo: input.statusTo || null,
        createdByUserId: input.userId || null,
      },
    }).catch(() => null);
  }

  private inferCommercialEmailFromRadarLead(row: any) {
    const metadata = parseJsonObject(row?.metadataJson);
    const explicitEmail = String(metadata?.email || metadata?.contactEmail || metadata?.recipientEmail || '').trim().toLowerCase();
    if (explicitEmail && explicitEmail.includes('@')) return explicitEmail;
    const website = String(row?.website || '').trim();
    if (!website) return '';
    try {
      const parsed = new URL(website.startsWith('http') ? website : `https://${website}`);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      return host ? `comercial@${host}` : '';
    } catch {
      const host = website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.toLowerCase();
      return host ? `comercial@${host}` : '';
    }
  }

  /**
   * Autorização canônica pós-débito. `ownerCompanyId` sozinho é legado mutável e
   * nunca libera PII: exigimos o vínculo da saga, a chave do ledger ainda ativa
   * e ausência de compensação em andamento.
   */
  private async hasRadarPaidAcquisition(
    context: SearchExecutionContext,
    row: any,
    expectedOperationId?: string | null,
  ) {
    const state = Array.isArray(row?.companyStates) ? row.companyStates[0] || null : null;
    const usageKey = String(state?.claimUsageKey || '').trim();
    const operationId = String(state?.paidClaimOperationId || '').trim();
    const ownsLead = Number(row?.ownerCompanyId || 0) === context.companyId;
    if (!ownsLead || !usageKey || !operationId || !state?.acquiredAt) {
      return false;
    }
    if (expectedOperationId && operationId !== String(expectedOperationId).trim()) return false;
    if (typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit !== 'function') {
      return false;
    }
    const activeCredit = await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(
      context.companyId,
      { usageKey },
    ).catch(() => false);
    if (!activeCredit) return false;
    const processDelegate = (this.prisma as any).radarLeadProcessRun;
    if (!processDelegate?.findFirst) return false;
    const run = await processDelegate.findFirst({
      where: {
        id: operationId,
        companyId: context.companyId,
        radarLeadId: row.id,
        mode: 'claim',
        status: {
          in: [
            'ownership_claimed',
            'rfb_hydrating',
            'base_revealed',
            'motor_enriching',
            'vendas_creating',
            'completed',
            'partial',
          ],
        },
      },
      select: { id: true },
    }).catch(() => null);
    if (!run?.id) return false;
    return true;
  }

  private async assertRadarPaidAcquisition(context: SearchExecutionContext, row: any) {
    if (!(await this.hasRadarPaidAcquisition(context, row))) {
      throw new ForbiddenException('Puxe e pague o lead antes de acessar ou usar os dados.');
    }
    const state = Array.isArray(row?.companyStates) ? row.companyStates[0] || null : null;
    return {
      state,
      usageKey: String(state?.claimUsageKey || '').trim(),
      operationId: String(state?.paidClaimOperationId || '').trim(),
    };
  }

  private async logCommercialEmailMessage(input: Record<string, any>) {
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return null;
    return (this.prisma as any).commercialEmailMessageLog.create({
      data: {
        companyId: input.companyId || null,
        userId: input.userId || null,
        radarLeadId: input.radarLeadId || null,
        vendasLeadId: input.vendasLeadId || null,
        recipientEmail: String(input.recipientEmail || '').trim().toLowerCase(),
        recipientName: String(input.recipientName || '').trim() || null,
        subject: String(input.subject || '').trim(),
        text: input.text || null,
        html: input.html || null,
        status: String(input.status || 'draft').trim(),
        transport: input.transport || null,
        messageId: input.messageId || null,
        errorCode: input.errorCode ? String(input.errorCode) : null,
        errorMessage: input.errorMessage || null,
        attachmentName: input.attachmentName || null,
        sentAt: input.sentAt ? new Date(input.sentAt) : null,
      },
    }).catch(() => null);
  }

  private async assertRadarEmailAllowsManualSend(recipientEmail: string) {
    const email = String(recipientEmail || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Informe o e-mail de destino.');
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return email;
    const blocked = await (this.prisma as any).commercialEmailMessageLog.findFirst({
      where: { recipientEmail: email, status: { in: ['opted_out', 'do_not_contact'] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    }).catch(() => null);
    if (blocked) throw new BadRequestException('Este e-mail está marcado como não contactar.');
    return email;
  }

  async previewRadarPresentationEmailForUser(user: any, radarLeadId: string, body?: any) {
    const context = this.resolveContext(user);
    if (!this.hbxPresentationEmails) throw new ServiceUnavailableException('Servico de e-mail indisponivel.');
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    await this.assertRadarPaidAcquisition(context, row);
    if (this.isRadarProtectedStatus(row?.companyStates?.[0]?.status || row?.status)) {
      throw new BadRequestException('Este card está marcado como negativo/bloqueado e não pode receber sugestão ativa de envio.');
    }
    const recipientEmail = String(body?.recipientEmail || this.inferCommercialEmailFromRadarLead(row) || '').trim().toLowerCase();
    const draft = buildHbxPresentationEmailDraft({
      leadName: row.name,
      city: row.city,
      state: row.state,
      segment: row.segment,
      website: row.website,
      contactEmail: recipientEmail,
      sellerName: user?.name || user?.displayName || user?.email || 'HBX',
      companyName: 'HBX',
    });
    const preview = await this.hbxPresentationEmails.previewPresentationToContact({
      companyId: context.companyId,
      userId: context.userId,
      recipientName: body?.recipientName || row.name || 'cliente',
      recipientEmail,
      companyName: row.name || null,
      subject: body?.subject || draft.subject,
      text: body?.text || draft.body,
      html: body?.html,
      source: 'manual',
    });
    await this.logCommercialEmailMessage({
      companyId: context.companyId,
      userId: context.userId,
      radarLeadId: row.id,
      recipientEmail: preview.recipientEmail || recipientEmail || 'pendente@hbx.local',
      recipientName: preview.recipientName,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      status: 'draft',
      attachmentName: preview.attachment?.originalName || null,
    });
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'presentation_email_previewed',
      note: JSON.stringify({ recipientEmail: preview.recipientEmail || null, subject: preview.subject }),
    });
    return preview;
  }

  async sendRadarPresentationEmailForUser(user: any, radarLeadId: string, body?: any) {
    const context = this.resolveContext(user);
    if (!this.hbxPresentationEmails) throw new ServiceUnavailableException('Servico de e-mail indisponivel.');
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    await this.assertRadarPaidAcquisition(context, row);
    if (this.isRadarProtectedStatus(row?.companyStates?.[0]?.status || row?.status)) {
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail: body?.recipientEmail || null,
        status: 'blocked',
        reason: 'policy',
      });
      throw new BadRequestException('Este card está marcado como negativo/bloqueado e não pode receber sugestão ativa de envio.');
    }
    let recipientEmail = '';
    try {
      recipientEmail = await this.assertRadarEmailAllowsManualSend(body?.recipientEmail || this.inferCommercialEmailFromRadarLead(row));
    } catch (policyError: any) {
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail: body?.recipientEmail || null,
        status: 'blocked',
        reason: 'policy',
        errorMessage: String(policyError?.message || policyError),
      });
      throw policyError;
    }
    await this.commercialUsageLimits?.assertCanSendPresentationEmail(context.companyId, context.userId);
    const recipientName = String(body?.recipientName || row.name || 'cliente').trim();
    const subject = String(body?.subject || '').trim();
    const text = String(body?.text || '').trim();
    if (!subject) throw new BadRequestException('Informe o assunto do e-mail.');
    if (!text) throw new BadRequestException('Informe o corpo do e-mail.');

    try {
      await this.commercialUsageLimits?.recordPresentationEmailAttempt(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject,
      });
      const result = await this.hbxPresentationEmails.sendPresentationToContact({
        companyId: context.companyId,
        userId: context.userId,
        recipientName,
        recipientEmail,
        companyName: row.name || null,
        subject,
        text,
        html: body?.html,
        source: 'manual',
      });
      const messageId = result.delivery?.messageId || null;
      const transport = result.delivery?.transport || null;
      await this.logCommercialEmailMessage({
        companyId: context.companyId,
        userId: context.userId,
        radarLeadId: row.id,
        recipientEmail,
        recipientName,
        subject: result.subject,
        text,
        html: body?.html || null,
        status: 'sent',
        transport,
        messageId,
        sentAt: result.sentAt,
        attachmentName: result.attachment?.originalName || null,
      });
      const delivery: any = result.delivery || {};
      const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((value: any) => String(value || '').toLowerCase()) : [];
      const consumesQuota = Boolean(result.delivery?.ok === true || messageId || accepted.includes(recipientEmail.toLowerCase()));
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject: result.subject,
        status: consumesQuota ? 'sent' : 'failed',
        transport,
        messageId,
        reason: consumesQuota ? 'provider_confirmed' : 'provider_not_confirmed',
      });
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'presentation_email_sent',
        note: JSON.stringify({ recipientEmail, subject: result.subject, sentAt: result.sentAt, messageId, transport }),
      });
      return result;
    } catch (error: any) {
      const errorMessage = String(error?.response?.message || error?.message || 'Falha ao enviar apresentacao.');
      await this.logCommercialEmailMessage({
        companyId: context.companyId,
        userId: context.userId,
        radarLeadId: row.id,
        recipientEmail,
        recipientName,
        subject,
        text,
        html: body?.html || null,
        status: 'failed',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject,
        status: 'failed',
        reason: 'provider_error',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'presentation_email_failed',
        note: JSON.stringify({ recipientEmail, subject, errorCode: error?.status || error?.code || null, errorMessage }),
      });
      throw error;
    }
  }

  private isReleasableRadarReservation(row: any) {
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (!ownerCompanyId || !(row?.claimedAt instanceof Date)) return false;
    const poolStatus = this.normalizeRadarLeadStatus(row?.status);
    if (!['clean', 'new', 'reserved', 'delivered'].includes(poolStatus)) return false;
    const companyStates = Array.isArray(row?.companyStates) ? row.companyStates : [];
    const state = companyStates.find((item: any) => Number(item?.companyId) === ownerCompanyId) || null;
    const stateStatus = this.normalizeRadarLeadStatus(state?.status || poolStatus);
    if (!['clean', 'new', 'reserved', 'delivered'].includes(stateStatus)) return false;
    if (state?.vendasLeadId || state?.privateNotes || state?.lastContactAt) return false;
    if (safeInteger(state?.noAnswerCount) > 0 || safeInteger(state?.contactedCount) > 0) return false;
    return true;
  }

  private async releaseExpiredRadarReservations(options: { companyId?: number | null; limit?: number } = {}) {
    if (!(await this.supportsRadarOwnershipPersistence())) return { releasedCount: 0 };
    const cutoff = new Date(Date.now() - RADAR_RESERVATION_TTL_MS);
    const where: any = {
      ownerCompanyId: options.companyId ? Number(options.companyId) : { not: null },
      claimedAt: { lt: cutoff },
      status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
    };
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where,
      take: Math.min(Math.max(Math.trunc(Number(options.limit || 100) || 100), 1), 500),
      include: {
        companyStates: {
          select: {
            companyId: true,
            status: true,
            vendasLeadId: true,
            privateNotes: true,
            noAnswerCount: true,
            contactedCount: true,
            lastContactAt: true,
          },
        },
      },
    }).catch(() => []);
    let releasedCount = 0;
    const now = new Date();
    for (const row of rows || []) {
      if (!this.isReleasableRadarReservation(row)) continue;
      const ownerCompanyId = Math.trunc(Number(row.ownerCompanyId || 0)) || 0;
      if (!ownerCompanyId) continue;
      const previousStatus = this.normalizeRadarLeadStatus(row.status);
      const updated = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: row.id,
          ownerCompanyId,
          claimedAt: row.claimedAt,
        },
        data: {
          ownerCompanyId: null,
          claimedAt: null,
          status: 'clean',
          lastSeenAt: now,
        },
      }).catch(() => ({ count: 0 }));
      if (!updated?.count) continue;
      await (this.prisma as any).radarLeadCompanyState.updateMany({
        where: {
          companyId: ownerCompanyId,
          radarLeadId: row.id,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
          vendasLeadId: null,
        },
        data: {
          status: 'new',
          lastActionAt: now,
        },
      }).catch(() => null);
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: ownerCompanyId,
        eventType: 'ownership_released',
        note: 'Reserva liberada automaticamente após 72h sem ação.',
        statusFrom: previousStatus,
        statusTo: 'clean',
      });
      releasedCount += 1;
    }
    return { releasedCount };
  }

  private async claimRadarLeadForCompany(
    context: SearchExecutionContext,
    row: any,
    input: {
      poolStatus: RadarLeadStatus;
      companyStatus: RadarLeadStatus;
      eventType: RadarLeadEventType;
      note?: string | null;
      vendasLeadId?: string | null;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
      paidClaimOperationId?: string | null;
      claimUsageKey?: string | null;
    },
  ) {
    const now = new Date();
    const previousStatus = this.normalizeRadarLeadStatus(row?.companyStates?.[0]?.status || row?.status);
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const existingCompanyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const alreadyClaimedByCompany = Number(row?.ownerCompanyId || 0) === context.companyId || Boolean(existingCompanyState?.id);
    const persistCompanyState = (tx: any) => tx.radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        vendasLeadId: input.vendasLeadId || null,
        paidClaimOperationId: input.paidClaimOperationId || null,
        claimUsageKey: input.claimUsageKey || null,
        acquiredAt: input.paidClaimOperationId && input.claimUsageKey ? now : null,
        status: input.companyStatus,
        assignedUserId: input.assignedUserId || null,
        assignedByUserId: input.assignedByUserId || null,
        assignedAt: input.assignedUserId ? now : null,
        lastActionAt: now,
      },
      update: {
        vendasLeadId: input.vendasLeadId || undefined,
        paidClaimOperationId: input.paidClaimOperationId || undefined,
        claimUsageKey: input.claimUsageKey || undefined,
        acquiredAt: input.paidClaimOperationId && input.claimUsageKey ? now : undefined,
        status: input.companyStatus,
        assignedUserId: input.assignedUserId || undefined,
        assignedByUserId: input.assignedByUserId || undefined,
        assignedAt: input.assignedUserId ? now : undefined,
        lastActionAt: now,
      },
    });
    await (this.prisma as any).$transaction(async (tx: any) => {
      if (ownershipEnabled) {
        const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
        if (ownerCompanyId && ownerCompanyId !== context.companyId) {
          const error: any = new ConflictException({
            code: 'RADAR_CLAIM_LOST_RACE_NO_MUTATION',
            message: 'Este card já está na carteira de outra empresa.',
          });
          error.code = 'RADAR_CLAIM_LOST_RACE_NO_MUTATION';
          throw error;
        }
        const claimed = await tx.radarLeadPool.updateMany({
          where: {
            id: row.id,
            OR: [
              { ownerCompanyId: null },
              { ownerCompanyId: context.companyId },
            ],
          },
          data: {
            ownerCompanyId: context.companyId,
            claimedAt: now,
            status: input.poolStatus,
            lastSeenAt: now,
          },
        });
        if (!claimed?.count) {
          const error: any = new ConflictException({
            code: 'RADAR_CLAIM_LOST_RACE_NO_MUTATION',
            message: 'Este card acabou de ser puxado por outra empresa.',
          });
          error.code = 'RADAR_CLAIM_LOST_RACE_NO_MUTATION';
          throw error;
        }
      } else {
        await tx.radarLeadPool.update({
          where: { id: row.id },
          data: { status: input.poolStatus, lastSeenAt: now },
        });
      }
      await persistCompanyState(tx);
    });

    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: input.eventType,
      note: input.note || null,
      statusFrom: previousStatus,
      statusTo: input.companyStatus,
    });
    return { claimedAt: now };
  }

  async addRadarLeadEventForUser(
    user: any,
    radarLeadId: string,
    input: { eventType?: RadarLeadEventType | string; note?: string | null } = {},
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    // LIMPEZA-DESTRUTIVA L3: card e da EMPRESA — qualquer papel pode registrar evento,
    // independente de quem esta como "Responsável" (assignedUserId, so informativo).
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (!ownershipEnabled) throw new ServiceUnavailableException('Controle seguro de aquisição indisponível.');
    await this.assertRadarPaidAcquisition(context, row);

    const eventType = String(input.eventType || '').trim().toLowerCase() as RadarLeadEventType;
    if (!['denied', 'complaint', 'no_answer', 'hidden', 'contacted', 'note'].includes(eventType)) {
      throw new BadRequestException('Evento do Radar invalido.');
    }

    const previousStatus = this.resolveRadarLeadStatus(row);
    // Nota neutra (LEADS-FINAL 02): registra no histórico e SÓ isso — NÃO reivindica posse,
    // NÃO cria companyState (senão o pull-gate do 04 leria como "possuído" e vazaria contato),
    // NÃO debita, NÃO muda status. Exige que a empresa JÁ seja dona (puxou): anotar não é claim.
    if (eventType === 'note') {
      const noteText = String(input.note || '').trim();
      if (!noteText) throw new BadRequestException('Nota vazia.');
      const ownedByViewer = ownershipEnabled && ownerCompanyId === context.companyId;
      if (!ownedByViewer) throw new ForbiddenException('Puxe o lead pra sua carteira antes de anotar.');
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'note',
        note: noteText,
        statusFrom: previousStatus,
        statusTo: previousStatus,
      });
      return this.getRadarLeadForUser(user, row.id);
    }
    const nextStatus: RadarLeadStatus =
      eventType === 'hidden'
        ? 'hidden'
        : eventType === 'contacted'
          ? previousStatus
          : eventType as RadarLeadStatus;
    const now = new Date();
    const note = String(input.note || '').trim();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status: nextStatus,
        lastActionAt: now,
        lastContactAt: eventType === 'contacted' || eventType === 'no_answer' ? now : null,
        noAnswerCount: eventType === 'no_answer' ? 1 : 0,
        contactedCount: eventType === 'contacted' ? 1 : 0,
        complaintReason: eventType === 'complaint' ? note || null : null,
        deniedReason: eventType === 'denied' ? note || null : null,
      },
      update: {
        status: nextStatus,
        lastActionAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null } : {}),
      },
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        lastSeenAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, globalContactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
        ...(this.isRadarProtectedStatus(nextStatus) ? { recommendedChannel: 'discard', enrichmentScore: 0 } : {}),
      },
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType,
      note,
      statusFrom: previousStatus,
      statusTo: nextStatus,
    });
    return this.getRadarLeadForUser(user, row.id);
  }

  private async markRadarPostDeliveryUpdateRetryable(
    radarLeadId: string,
    error: any,
    stage: string = 'post_delivery_update',
  ) {
    if (!(await this.supportsRadarPersistence())) return;
    const id = String(radarLeadId || '').trim();
    if (!id) return;
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id },
      select: {
        id: true,
        metadataJson: true,
        enrichmentJson: true,
      },
    }).catch(() => null);
    if (!row) return;
    const retryable = this.getRadarDeliveryOrchestrator().markPostDeliveryFailure({
      metadata: this.parseMaybeJsonObject(row.metadataJson),
      enrichment: this.parseMaybeJsonObject(row.enrichmentJson),
      stage,
      error,
      now: new Date(),
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        metadataJson: JSON.stringify(retryable.metadata),
        enrichmentJson: JSON.stringify(retryable.enrichment),
      },
    }).catch(() => null);
  }

  private async markRadarPostDeliveryUpdateCompleted(radarLeadId: string) {
    if (!(await this.supportsRadarPersistence())) return;
    const id = String(radarLeadId || '').trim();
    if (!id) return;
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id },
      select: {
        id: true,
        metadataJson: true,
        enrichmentJson: true,
      },
    }).catch(() => null);
    if (!row) return;
    const metadata = this.parseMaybeJsonObject(row.metadataJson);
    const enrichment = this.parseMaybeJsonObject(row.enrichmentJson);
    const now = new Date();
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        metadataJson: JSON.stringify({
          ...metadata,
          postDeliveryUpdate: this.getRadarPostDeliveryUpdate().buildCompletedState(metadata.postDeliveryUpdate, now),
        }),
        enrichmentJson: JSON.stringify({
          ...enrichment,
          postDeliveryUpdate: this.getRadarPostDeliveryUpdate().buildCompletedState(enrichment.postDeliveryUpdate || metadata.postDeliveryUpdate, now),
        }),
      },
    }).catch(() => null);
  }

  /**
   * Zap-gate porta 8 — REESCRITO 03/07 (decisão do dono): NADA bloqueia por WhatsApp.
   * O motor só LÊ e SINALIZA. Resolve o whatsappStatus verdadeiro do card e ENTREGA sempre.
   * O antigo gate de bloqueio (com sua flag de env) foi REMOVIDO por inteiro — sem flag, sem legado.
   * O freio físico W4 (cache/rate/disjuntor) mora no serviço do check e continua intacto;
   * `confirmed` só vem do Webwhats de verdade (radarCheckWhatsappNumbers).
   */
  private async resolveRadarWhatsappStatusForDelivery(row: any): Promise<'confirmed' | 'missing' | 'unverified' | null> {
    const existing = String(
      this.parseMaybeJsonObject(row?.enrichmentJson)?.whatsappStatus
      || this.parseMaybeJsonObject(row?.metadataJson)?.whatsappStatus
      || '',
    ).trim().toLowerCase();
    if (existing === 'confirmed') return 'confirmed'; // já confirmado pelo Webwhats — não rebaixa nem re-checa

    const phoneDigits = normalizePhoneDigits(row?.phoneDigits || row?.phone);
    if (!phoneDigits) return (existing as any) || null; // sem telefone, nada a checar

    try {
      const results = await this.radarCheckWhatsappNumbers([phoneDigits]); // passa pelo freio W4 intacto
      const match = Array.isArray(results)
        ? results.find((item: any) => normalizePhoneDigits(item?.normalizedNumber || item?.input) === phoneDigits)
        : null;
      if (!match) return (existing as any) || 'unverified'; // motor indisponivel/sem sessao (degrada p/ [])
      if (match.exists === true) return 'confirmed';        // confirmação REAL do Webwhats
      if (match.exists === false) return 'missing';         // estado explícito "sem zap"
      return (existing as any) || 'unverified';
    } catch (error: any) {
      this.logger?.warn?.(`[radar-zap-gate] check indisponivel lead=${row?.id || '-'}: ${String(error?.message || error)}`);
      return (existing as any) || 'unverified'; // fail-open: nunca derruba a entrega
    }
  }

  /**
   * Grava o sinal de WhatsApp resolvido no `leadRow` em memória — sem rebaixar um `confirmed`
   * já persistido. Precisa rodar ANTES da montagem do payload do Vendas
   * (`buildCompactVendasEnrichmentJson`) e da transação final (que reconstrói
   * `nextDeliveryEnrichment/Metadata` a partir de `leadRow.metadataJson/enrichmentJson`), pra
   * herdar o sinal nos dois lugares sem update separado no `radarLeadPool`.
   */
  private applyRadarWhatsappStatusSignalToRow(row: any, status: 'confirmed' | 'missing' | 'unverified') {
    if (!row || !status) return;
    const enr = this.parseMaybeJsonObject(row.enrichmentJson);
    const meta = this.parseMaybeJsonObject(row.metadataJson);
    const current = String(enr?.whatsappStatus || meta?.whatsappStatus || '').trim().toLowerCase();
    if (current === 'confirmed' && status !== 'confirmed') return; // nunca rebaixa confirmação real
    enr.whatsappStatus = status;
    meta.whatsappStatus = status;
    row.enrichmentJson = JSON.stringify(enr);
    row.metadataJson = JSON.stringify(meta);
    row.whatsappStatus = status;
  }

  private async persistClaimSourceCoverage(row: any, source: 'rfb' | 'motor', patch: Record<string, any>) {
    const latest = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: row.id },
      select: { metadataJson: true },
    }).catch(() => null);
    const metadata = this.parseMaybeJsonObject(latest?.metadataJson || row?.metadataJson);
    const sourceCoverage = this.parseMaybeJsonObject(metadata?.sourceCoverage);
    const nextMetadata = {
      ...metadata,
      sourceCoverage: {
        ...sourceCoverage,
        [source]: { ...this.parseMaybeJsonObject(sourceCoverage?.[source]), ...patch },
      },
    };
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: { metadataJson: JSON.stringify(nextMetadata) },
    });
    return { ...row, metadataJson: JSON.stringify(nextMetadata) };
  }

  private async hydrateRadarLeadFromRfbForClaim(row: any) {
    const attemptedAt = new Date().toISOString();
    let leadRow = await this.persistClaimSourceCoverage(row, 'rfb', {
      attempted: true,
      status: 'running',
      attemptedAt,
    }).catch(() => row);
    const cnpj = extractCnpjFromRadarLead(leadRow);
    const fail = async (reason: string, detail: string) => {
      const coveredRow = await this.persistClaimSourceCoverage(leadRow, 'rfb', {
        attempted: true,
        succeeded: false,
        status: 'failed',
        reason,
        ...(cnpj ? { cnpj } : {}),
        finishedAt: new Date().toISOString(),
      }).catch(() => leadRow);
      return {
        row: coveredRow,
        succeeded: false,
        reason: detail,
      };
    };
    if (!cnpj) return fail('cnpj_not_resolved', 'CNPJ não identificado para hidratação RFB.');
    if (!(await this.prisma.hasTable('CnpjPublicCompany').catch(() => false))) {
      return fail('rfb_table_unavailable', 'Base RFB indisponível neste ambiente.');
    }
    const rfb = await (this.prisma as any).cnpjPublicCompany.findUnique({
      where: { cnpj },
      select: {
        cnpj: true,
        razaoSocial: true,
        nomeFantasia: true,
        cnae: true,
        cnaeDescription: true,
        situacao: true,
        naturezaJuridica: true,
        porte: true,
        matrizFilial: true,
        openedAt: true,
        capitalSocial: true,
        simples: true,
        mei: true,
        regimeTributario: true,
        cnaeSecundarias: true,
        phoneShareCount: true,
        emailShareCount: true,
        ownerName: true,
        ownerQualification: true,
        address: true,
        city: true,
        state: true,
        website: true,
        phone: true,
        phone2: true,
        email: true,
      },
    }).catch(() => null);
    if (!rfb) return fail('cnpj_not_found', 'CNPJ não localizado na base RFB.');

    const phone1 = normalizePhoneDigits(rfb.phone);
    const phone2 = normalizePhoneDigits(rfb.phone2);
    const email = normalizeBusinessEmail(rfb.email);
    const secondaryCnaeCodes = Array.from(new Set(
      String(rfb.cnaeSecundarias || '')
        .split(/[,;|\s]+/)
        .map((value) => String(value || '').replace(/\D/g, ''))
        .filter((value) => value.length === 7 && value !== String(rfb.cnae || '').replace(/\D/g, '')),
    )).slice(0, 99);
    const secondaryCnaeRows = secondaryCnaeCodes.length && (this.prisma as any).cnpjPublicCnae?.findMany
      ? await (this.prisma as any).cnpjPublicCnae.findMany({
          where: { codigo: { in: secondaryCnaeCodes } },
          select: { codigo: true, descricao: true },
        }).catch(() => [])
      : [];
    const secondaryCnaeDescriptionByCode = new Map(
      (Array.isArray(secondaryCnaeRows) ? secondaryCnaeRows : []).map((item: any) => [String(item.codigo), String(item.descricao || '') || null]),
    );
    const secondaryCnaes = secondaryCnaeCodes.map((code) => ({
      code,
      description: secondaryCnaeDescriptionByCode.get(code) || null,
    }));
    const officialOpenedAt = rfb.openedAt instanceof Date
      ? rfb.openedAt.toISOString()
      : rfb.openedAt ? new Date(rfb.openedAt).toISOString() : null;
    const officialWebsiteRaw = String(rfb.website || '').trim() || null;
    const officialWebsite = officialWebsiteRaw
      && !this.isBlockedLeadOfficialWebsite(officialWebsiteRaw)
      && websiteHostLooksCompatibleWithLead({ ...leadRow, website: officialWebsiteRaw }, officialWebsiteRaw)
      ? officialWebsiteRaw
      : null;
    const candidates = [
      ...(phone1 ? [{ kind: 'phone' as const, value: phone1, source: 'rfb_primary', confidence: 100, rank: 1 }] : []),
      ...(phone2 && phone2 !== phone1 ? [{ kind: 'phone' as const, value: phone2, source: 'rfb_secondary', confidence: 100, rank: 2 }] : []),
      ...(email ? [{ kind: 'email' as const, value: email, source: 'rfb_email', confidence: 100, rank: 1 }] : []),
    ];
    if (candidates.length) {
      try {
        await this.getLeadContactWrite().writeContacts(this.prisma, row.id, candidates);
      } catch (error: any) {
        return fail('rfb_contact_persistence_failed', `Falha ao persistir contatos RFB: ${String(error?.message || error)}`);
      }
    }
    const metadata = this.parseMaybeJsonObject(leadRow.metadataJson);
    const phones = Array.from(new Set([
      normalizePhoneDigits(leadRow.phoneDigits || leadRow.phone),
      ...(Array.isArray(metadata?.phones) ? metadata.phones.map(normalizePhoneDigits) : []),
      phone1,
      phone2,
    ].filter(Boolean))).slice(0, 3);
    const emails = Array.from(new Set([
      normalizeBusinessEmail(leadRow.email),
      ...(Array.isArray(metadata?.emails) ? metadata.emails.map(normalizeBusinessEmail) : []),
      email,
    ].filter(Boolean))).slice(0, 3);
    const currentPhoneDigits = normalizePhoneDigits(leadRow.phoneDigits || leadRow.phone);
    const rfbPrimaryCandidate = phone1 || phone2 || null;
    let scalarPhoneDigits = currentPhoneDigits || rfbPrimaryCandidate;
    // RadarLeadPool.phoneDigits continua sendo a chave de identidade histórica e é
    // única. Telefones RFB compartilhados (contador/central) não podem abortar a
    // compra: ficam canonicamente em LeadContact, sem disputar a coluna escalar.
    if (!currentPhoneDigits && scalarPhoneDigits) {
      const collision = await (this.prisma as any).radarLeadPool.findFirst({
        where: { id: { not: row.id }, phoneDigits: scalarPhoneDigits },
        select: { id: true },
      }).catch(() => null);
      if (collision) scalarPhoneDigits = null;
    }
    const nextMetadata = {
      ...metadata,
      rfbOfficial: {
        source: 'rfb',
        cnpj,
        razaoSocial: rfb.razaoSocial || null,
        nomeFantasia: rfb.nomeFantasia || null,
        situacao: rfb.situacao || null,
        cnae: rfb.cnae || null,
        cnaeDescription: rfb.cnaeDescription || null,
        secondaryCnaes,
        porte: rfb.porte || null,
        matrizFilial: rfb.matrizFilial || null,
        openedAt: officialOpenedAt,
        address: rfb.address || null,
        city: rfb.city || null,
        state: rfb.state || null,
        website: officialWebsite,
        ownerName: rfb.ownerName || null,
        ownerQualification: rfb.ownerQualification || null,
        capitalSocial: rfb.capitalSocial == null ? null : String(rfb.capitalSocial),
        naturezaJuridica: rfb.naturezaJuridica || null,
        simples: rfb.simples ?? null,
        mei: rfb.mei ?? null,
        regimeTributario: rfb.regimeTributario || null,
        shareCounts: {
          phone: rfb.phoneShareCount == null ? null : safeInteger(rfb.phoneShareCount),
          email: rfb.emailShareCount == null ? null : safeInteger(rfb.emailShareCount),
        },
        hydratedAt: new Date().toISOString(),
      },
      cnpj,
      razaoSocial: rfb.razaoSocial || metadata?.razaoSocial || null,
      nomeFantasia: rfb.nomeFantasia || metadata?.nomeFantasia || null,
      cnae: rfb.cnae || metadata?.cnae || null,
      cnaeDescription: rfb.cnaeDescription || metadata?.cnaeDescription || null,
      companySituation: rfb.situacao || metadata?.companySituation || null,
      naturezaJuridica: rfb.naturezaJuridica || metadata?.naturezaJuridica || null,
      porte: rfb.porte || metadata?.porte || null,
      matrizFilial: rfb.matrizFilial || metadata?.matrizFilial || null,
      openedAt: officialOpenedAt || metadata?.openedAt || null,
      capitalSocial: rfb.capitalSocial == null ? metadata?.capitalSocial ?? null : String(rfb.capitalSocial),
      simples: rfb.simples ?? metadata?.simples ?? null,
      mei: rfb.mei ?? metadata?.mei ?? null,
      regimeTributario: rfb.regimeTributario || metadata?.regimeTributario || null,
      secondaryCnaes: secondaryCnaes.length ? secondaryCnaes : Array.isArray(metadata?.secondaryCnaes) ? metadata.secondaryCnaes : [],
      shareCounts: {
        ...this.parseMaybeJsonObject(metadata?.shareCounts),
        phone: rfb.phoneShareCount == null ? this.parseMaybeJsonObject(metadata?.shareCounts)?.phone ?? null : safeInteger(rfb.phoneShareCount),
        email: rfb.emailShareCount == null ? this.parseMaybeJsonObject(metadata?.shareCounts)?.email ?? null : safeInteger(rfb.emailShareCount),
      },
      ownerName: rfb.ownerName || metadata?.ownerName || null,
      ownerNames: Array.from(new Set([rfb.ownerName, ...(Array.isArray(metadata?.ownerNames) ? metadata.ownerNames : [])].filter(Boolean))),
      ownerQualification: rfb.ownerQualification || metadata?.ownerQualification || null,
      officialAddress: rfb.address || metadata?.officialAddress || null,
      officialCity: rfb.city || metadata?.officialCity || null,
      officialState: rfb.state || metadata?.officialState || null,
      officialWebsite: officialWebsite || metadata?.officialWebsite || null,
      phones,
      emails,
      sourceCoverage: {
        ...this.parseMaybeJsonObject(metadata?.sourceCoverage),
        rfb: {
          attempted: true,
          succeeded: true,
          status: 'completed',
          cnpj,
          contactsFound: candidates.length,
          attemptedAt,
          finishedAt: new Date().toISOString(),
        },
      },
    };
    try {
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
        phone: leadRow.phone || (scalarPhoneDigits ? (phone1 === scalarPhoneDigits ? rfb.phone : rfb.phone2) : null),
        phoneDigits: scalarPhoneDigits,
        email: normalizeBusinessEmail(leadRow.email) || email || null,
        emailStatus: normalizeBusinessEmail(leadRow.email) || email ? leadRow.emailStatus || 'confirmed' : leadRow.emailStatus,
        emailSource: normalizeBusinessEmail(leadRow.email) ? leadRow.emailSource : email ? 'rfb_email' : leadRow.emailSource,
        emailConfidence: normalizeBusinessEmail(leadRow.email) || email
          ? Math.max(safeInteger(leadRow.emailConfidence), email ? 100 : 0)
          : leadRow.emailConfidence,
        address: leadRow.address || rfb.address || null,
        city: leadRow.city || rfb.city || null,
        state: leadRow.state || rfb.state || null,
        website: leadRow.website || officialWebsite || null,
        websiteStatus: leadRow.website || officialWebsite ? 'present' : leadRow.websiteStatus,
        metadataJson: JSON.stringify(nextMetadata),
        lastSeenAt: new Date(),
        },
      });
    } catch (error: any) {
      return fail('rfb_pool_persistence_failed', `Falha ao persistir dados RFB: ${String(error?.message || error)}`);
    }
    const refreshed = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: row.id },
      include: { companyStates: true, contacts: true },
    }).catch(() => null);
    if (!refreshed) return fail('rfb_reload_failed', 'Não foi possível validar os dados RFB persistidos.');
    const persistedContacts = new Set((Array.isArray(refreshed.contacts) ? refreshed.contacts : []).map((contact: any) => {
      const kind = String(contact?.kind || '').toLowerCase();
      return kind === 'email'
        ? normalizeBusinessEmail(contact?.valueNormalized || contact?.value)
        : normalizePhoneDigits(contact?.valueNormalized || contact?.value);
    }).filter(Boolean));
    const missingContact = candidates.find((candidate) => {
      const normalized = candidate.kind === 'email'
        ? normalizeBusinessEmail(candidate.value)
        : normalizePhoneDigits(candidate.value);
      return normalized && !persistedContacts.has(normalized);
    });
    if (missingContact) {
      return fail('rfb_contact_verification_failed', 'Um contato oficial da RFB não permaneceu na projeção canônica.');
    }
    return { row: refreshed, succeeded: true, reason: null };
  }

  /**
   * Ponto de não-retorno da compra. Antes desta transação nenhum CustomerProfile
   * nem CompanyConversation é criado. A mesma transação confirma fencing + ledger
   * ativo e materializa (ou vincula) o card core de Vendas à operação paga.
   * Efeitos auxiliares do CRM rodam somente depois e nunca causam estorno.
   */
  private async commitPaidRadarVendasCore(input: {
    context: SearchExecutionContext;
    operationId: string;
    workerToken: string;
    usageKey: string;
    leadRow: any;
    assignedUserId?: number | null;
    assignedByUserId?: number | null;
  }) {
    const { context, leadRow } = input;
    const operationId = String(input.operationId || '').trim();
    const workerToken = String(input.workerToken || '').trim();
    const usageKey = String(input.usageKey || '').trim();
    if (!operationId || !workerToken || !usageKey) {
      throw new ServiceUnavailableException('Prova segura da aquisição ausente. Nenhum card foi entregue.');
    }
    const metadata = this.parseMaybeJsonObject(leadRow?.metadataJson);
    const whatsappStatus = this.extractRadarLeadWhatsappStatus(leadRow) || 'unverified';
    const contacts = this.buildRadarLeadContactProjection(leadRow, metadata, whatsappStatus);
    const contactSnapshotJson = JSON.stringify({
      version: 1,
      radarLeadId: String(leadRow.id),
      phones: contacts.phoneContacts.slice(0, 3),
      emails: contacts.emailContacts.slice(0, 3),
    });
    const phoneNormalized = normalizePhoneDigits(
      contacts.phoneContacts[0]?.value || leadRow?.phoneDigits || leadRow?.phone,
    ) || null;
    const sourceHistoryId = `radar:${leadRow.id}`;
    const now = new Date();
    const debitKey = `enforce:lead_delivery:${usageKey}`;

    return (this.prisma as any).$transaction(async (tx: any) => {
      const fencedRun = await tx.radarLeadProcessRun.findFirst({
        where: {
          id: operationId,
          companyId: context.companyId,
          radarLeadId: String(leadRow.id),
          mode: 'claim',
          workerToken,
          workerLeaseUntil: { gt: now },
          status: { notIn: ['completed', 'partial', 'failed', 'refund_pending', 'refunded'] },
        },
        select: { id: true },
      });
      if (!fencedRun) {
        throw new ConflictException({
          code: 'RADAR_CLAIM_WORKER_FENCED',
          message: 'A execução perdeu o lease antes da entrega core.',
        });
      }
      const [debit, refund] = await Promise.all([
        tx.creditLedgerEntry.findFirst({
          where: { companyId: context.companyId, kind: 'debit', usageKey: debitKey },
          select: { id: true },
        }),
        tx.creditLedgerEntry.findFirst({
          where: { companyId: context.companyId, kind: 'refund', usageKey: `refund:${debitKey}` },
          select: { id: true },
        }),
      ]);
      if (!debit?.id || refund?.id) {
        throw new ConflictException('O débito ativo não foi confirmado no ponto de entrega.');
      }

      const byOperation = await tx.vendasLead.findUnique({
        where: { claimOperationId: operationId },
        select: { id: true, companyId: true },
      });
      if (byOperation) {
        if (Number(byOperation.companyId) !== context.companyId) {
          throw new ConflictException('A operação já está vinculada a outro tenant.');
        }
        const primaryPhoneCollision = phoneNormalized
          ? await tx.vendasLead.findFirst({
              where: {
                companyId: context.companyId,
                phoneNormalized,
                id: { not: byOperation.id },
              },
              select: { id: true },
            })
          : null;
        try {
          await tx.vendasLead.update({
            where: { id: byOperation.id },
            data: {
              contactSnapshotJson,
              ...(leadRow?.name ? { name: leadRow.name } : {}),
              ...(!primaryPhoneCollision && (contacts.phoneContacts[0]?.value || leadRow?.phone || leadRow?.phoneDigits) ? {
                phone: contacts.phoneContacts[0]?.value || leadRow.phone || leadRow.phoneDigits,
                phoneNormalized,
              } : {}),
              ...(contacts.emailContacts[0]?.value || leadRow?.email
                ? { email: contacts.emailContacts[0]?.value || leadRow.email }
                : {}),
              ...(leadRow?.address ? { address: leadRow.address } : {}),
              ...(leadRow?.website ? { website: leadRow.website } : {}),
              ...(leadRow?.city ? { city: leadRow.city } : {}),
              ...(leadRow?.state ? { state: leadRow.state } : {}),
              ...(leadRow?.segment ? { segment: leadRow.segment } : {}),
            },
          });
          return {
            id: String(byOperation.id),
            created: false,
            idempotent: true,
            ...(primaryPhoneCollision ? { convergenceWarning: 'primary_phone_collision_snapshot_preserved' } : {}),
          };
        } catch (error: any) {
          // O card desta operação já é a prova material do reveal. Uma falha de
          // convergência não pode transformar um retry em estorno com PII grátis.
          return {
            id: String(byOperation.id),
            created: false,
            idempotent: true,
            convergenceWarning: String(error?.message || error || 'vendas_core_retry_update_failed'),
          };
        }
      }

      // Nunca anexar uma compra paga a um card manual só porque o telefone
      // coincide. Sem vínculo explícito de origem, a colisão deve falhar antes
      // do reveal e a saga compensa o débito.
      const existing = await tx.vendasLead.findFirst({
        where: {
          companyId: context.companyId,
          sourceHistoryId,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) {
        throw new ConflictException(
          'Já existe um card sem vínculo com esta compra. A entrega paga não pode mesclar dados preexistentes.',
        );
      }

      const commonData = {
        claimOperationId: operationId,
        contactSnapshotJson,
        sourceHistoryId,
        sourceSignature: [leadRow?.segment, leadRow?.city].filter(Boolean).join('|') || null,
        name: leadRow?.name || null,
        // O snapshot adquirido é canônico. Escalares acompanham o rank 1 para
        // não empurrar um contato divergente à frente e cortar o 3º no slice(3).
        phone: contacts.phoneContacts[0]?.value || leadRow?.phone || leadRow?.phoneDigits || null,
        phoneNormalized: normalizePhoneDigits(contacts.phoneContacts[0]?.value) || phoneNormalized || null,
        email: contacts.emailContacts[0]?.value || leadRow?.email || null,
        address: leadRow?.address || null,
        website: leadRow?.website || null,
        rating: leadRow?.rating ?? null,
        reviews: safeInteger(leadRow?.reviews),
        opportunityScore: leadRow?.opportunityScore ?? null,
        city: leadRow?.city || null,
        state: leadRow?.state || null,
        segment: leadRow?.segment || null,
        assignedUserId: input.assignedUserId || null,
        assignedByUserId: input.assignedByUserId || null,
        assignedAt: input.assignedUserId ? now : null,
        returnAt: now,
        nextAction: 'Primeiro contato',
        shortNote: leadRow?.opportunityReason || 'Lead adquirido no Radar.',
      };
      const vendasLead = await tx.vendasLead.create({
        data: {
          companyId: context.companyId,
          sourceType: 'webscraping',
          primarySource: 'webscraping',
          status: 'novo',
          createdByUserId: context.userId,
          ...commonData,
        },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: vendasLead.id,
          eventType: 'radar_paid_claim_committed',
          title: 'Lead adquirido no Radar',
          description: 'Entrega core confirmada após débito do crédito.',
          sourceType: 'webscraping',
          createdByUserId: context.userId,
          idempotencyKey: `radar-paid-claim:${operationId}`,
        },
      });
      return { id: String(vendasLead.id), created: true, idempotent: false };
    });
  }

  /**
   * Convergência durável do snapshot 3+3 depois de RFB+motor. Diferente do
   * primeiro commit, este write idempotente não depende do lease curto que pode
   * expirar durante o crawl; ele exige a prova permanente state+ledger e recusa
   * refund_pending/refunded. Assim retry/recovery pode completar o mesmo claim
   * sem criar outro card ou reabrir uma aquisição revogada.
   */
  private async refreshPaidRadarVendasSnapshot(input: {
    context: SearchExecutionContext;
    operationId: string;
    usageKey: string;
    leadRow: any;
  }) {
    const operationId = String(input.operationId || '').trim();
    const usageKey = String(input.usageKey || '').trim();
    const leadRow = input.leadRow;
    const contacts = this.buildRadarLeadContactProjection(
      leadRow,
      this.parseMaybeJsonObject(leadRow?.metadataJson),
      this.extractRadarLeadWhatsappStatus(leadRow) || 'unverified',
    );
    const contactSnapshotJson = JSON.stringify({
      version: 1,
      radarLeadId: String(leadRow.id),
      phones: contacts.phoneContacts.slice(0, 3),
      emails: contacts.emailContacts.slice(0, 3),
    });
    const primaryPhone = contacts.phoneContacts[0]?.value || leadRow?.phone || leadRow?.phoneDigits || null;
    const primaryEmail = contacts.emailContacts[0]?.value || leadRow?.email || null;
    const debitKey = `enforce:lead_delivery:${usageKey}`;
    return (this.prisma as any).$transaction(async (tx: any) => {
      const [state, run, debit, refund, card] = await Promise.all([
        tx.radarLeadCompanyState.findUnique({
          where: {
            companyId_radarLeadId: {
              companyId: input.context.companyId,
              radarLeadId: String(leadRow.id),
            },
          },
          select: { paidClaimOperationId: true, claimUsageKey: true, acquiredAt: true },
        }),
        tx.radarLeadProcessRun.findFirst({
          where: {
            id: operationId,
            companyId: input.context.companyId,
            radarLeadId: String(leadRow.id),
            mode: 'claim',
            status: { notIn: ['refund_pending', 'refunded', 'failed'] },
          },
          select: { id: true },
        }),
        tx.creditLedgerEntry.findFirst({
          where: { companyId: input.context.companyId, kind: 'debit', usageKey: debitKey },
          select: { id: true },
        }),
        tx.creditLedgerEntry.findFirst({
          where: { companyId: input.context.companyId, kind: 'refund', usageKey: `refund:${debitKey}` },
          select: { id: true },
        }),
        tx.vendasLead.findUnique({
          where: { claimOperationId: operationId },
          select: { id: true, companyId: true },
        }),
      ]);
      if (!run?.id
        || !state?.acquiredAt
        || String(state.paidClaimOperationId || '') !== operationId
        || String(state.claimUsageKey || '') !== usageKey
        || !debit?.id
        || refund?.id
        || !card?.id
        || Number(card.companyId) !== input.context.companyId) {
        throw new ConflictException('A aquisição foi revogada ou perdeu sua prova antes da convergência 3+3.');
      }
      const normalizedPrimaryPhone = normalizePhoneDigits(primaryPhone) || null;
      const scalarCollision = normalizedPrimaryPhone
        ? await tx.vendasLead.findFirst({
            where: {
              companyId: input.context.companyId,
              phoneNormalized: normalizedPrimaryPhone,
              id: { not: card.id },
            },
            select: { id: true },
          })
        : null;
      await tx.vendasLead.update({
        where: { id: card.id },
        data: {
          contactSnapshotJson,
          ...(leadRow?.name ? { name: leadRow.name } : {}),
          // A colisão do escalar não invalida os contatos comprados. O snapshot
          // 3+3 sempre converge; só o atalho denormalizado fica preservado.
          ...(primaryPhone && !scalarCollision
            ? { phone: primaryPhone, phoneNormalized: normalizedPrimaryPhone }
            : {}),
          ...(primaryEmail ? { email: primaryEmail } : {}),
          ...(leadRow?.address ? { address: leadRow.address } : {}),
          ...(leadRow?.website ? { website: leadRow.website } : {}),
          ...(leadRow?.city ? { city: leadRow.city } : {}),
          ...(leadRow?.state ? { state: leadRow.state } : {}),
          ...(leadRow?.segment ? { segment: leadRow.segment } : {}),
        },
      });
      return { id: String(card.id), refreshed: true };
    });
  }

  private async rollbackRadarClaimAttempt(input: {
    context: SearchExecutionContext;
    originalRow: any;
    operationId?: string | null;
    vendasLeadId?: string | null;
    vendasCreated?: boolean;
  }) {
    const { context, originalRow } = input;
    const restoredDate = (value: any) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const previousState = Array.isArray(originalRow?.companyStates) ? originalRow.companyStates[0] || null : null;
    const operationId = String(input.operationId || '').trim();
    // Arquitetura do ponto de não-retorno: antes do VendasLead carimbado com
    // claimOperationId não existe mutação em Vendas/Profile/Conversation. Depois
    // dele não há estorno. Logo a compensação pré-commit restaura só Radar; nunca
    // apaga ou sobrescreve um card manual preexistente por coincidência de telefone.
    if (previousState) {
      await (this.prisma as any).radarLeadCompanyState.updateMany({
        where: {
          companyId: context.companyId,
          radarLeadId: originalRow.id,
          ...(operationId ? { paidClaimOperationId: operationId } : {}),
        },
        data: {
          vendasLeadId: previousState.vendasLeadId || null,
          paidClaimOperationId: previousState.paidClaimOperationId || null,
          claimUsageKey: previousState.claimUsageKey || null,
          acquiredAt: restoredDate(previousState.acquiredAt),
          status: previousState.status,
          assignedUserId: previousState.assignedUserId || null,
          assignedByUserId: previousState.assignedByUserId || null,
          assignedAt: restoredDate(previousState.assignedAt),
          lastActionAt: restoredDate(previousState.lastActionAt),
          negativeReason: previousState.negativeReason || null,
          privateNotes: previousState.privateNotes || null,
          noAnswerCount: safeInteger(previousState.noAnswerCount),
          contactedCount: safeInteger(previousState.contactedCount),
          lastContactAt: restoredDate(previousState.lastContactAt),
          complaintReason: previousState.complaintReason || null,
          deniedReason: previousState.deniedReason || null,
        },
      });
    } else {
      await (this.prisma as any).radarLeadCompanyState.deleteMany({
        where: {
          companyId: context.companyId,
          radarLeadId: originalRow.id,
          ...(operationId ? { paidClaimOperationId: operationId } : {}),
        },
      });
    }
    await (this.prisma as any).radarLeadPool.updateMany({
      where: { id: originalRow.id, ownerCompanyId: context.companyId },
      data: {
        ownerCompanyId: originalRow.ownerCompanyId || null,
        claimedAt: restoredDate(originalRow.claimedAt),
        status: originalRow.status || 'clean',
      },
    });

    const restoredPool = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: originalRow.id },
      select: { ownerCompanyId: true },
    });
    const restoredOwnerId = Number(restoredPool?.ownerCompanyId || 0);
    const expectedOwnerId = Number(originalRow.ownerCompanyId || 0);
    const winnerFromAnotherTenant = restoredOwnerId > 0 && restoredOwnerId !== context.companyId;
    if (!restoredPool || (!winnerFromAnotherTenant && restoredOwnerId !== expectedOwnerId)) {
      throw new ServiceUnavailableException('A restauração da posse ficou pendente; o crédito não foi estornado.');
    }
    return { ownershipRestored: true, vendasRemoved: false, winnerPreserved: winnerFromAnotherTenant };
  }

  private async removeExactRadarPaidVendasCardForRefund(input: {
    companyId: number;
    operationId: string;
  }) {
    const companyId = Math.trunc(Number(input.companyId || 0));
    const operationId = String(input.operationId || '').trim();
    if (!companyId || !operationId) throw new ServiceUnavailableException('Prova exata do card a revogar ausente.');
    return (this.prisma as any).$transaction(async (tx: any) => {
      const card = await tx.vendasLead.findUnique({
        where: { claimOperationId: operationId },
        select: { id: true, companyId: true },
      });
      if (!card) return { removed: false, alreadyAbsent: true };
      if (Number(card.companyId) !== companyId) {
        throw new ConflictException('O card pago pertence a outro tenant e não pode ser revogado por esta operação.');
      }
      // Conversas são histórico independente e ficam apenas desvinculadas. Artefatos
      // próprios do card (timeline, cockpit, automações, atividades) caem por cascade.
      if (typeof tx.companyConversation?.updateMany === 'function') {
        await tx.companyConversation.updateMany({
          where: { companyId, vendasLeadId: card.id },
          data: { vendasLeadId: null },
        });
      }
      await tx.vendasLead.delete({ where: { id: card.id } });
      const remaining = await tx.vendasLead.findUnique({
        where: { claimOperationId: operationId },
        select: { id: true },
      });
      if (remaining?.id) throw new ServiceUnavailableException('O card pago continuou acessível após a revogação.');
      return { removed: true, alreadyAbsent: false };
    });
  }

  private async compensateFailedRadarClaim(input: {
    context: SearchExecutionContext;
    originalRow: any;
    creditReserved: boolean;
    creditUsageKey: string;
    error: any;
    reportProgress: (state: string, payload?: Record<string, any>) => Promise<void>;
    vendasLeadId?: string | null;
    cleanupRequired?: boolean;
    operationId?: string | null;
    workerToken?: string | null;
  }) {
    const originalError = String(input.error?.message || input.error || 'Falha na entrega do lead.');
    if (input.operationId && input.workerToken) {
      await this.assertRadarClaimWorkerFence(input.context, input.operationId, input.workerToken);
    }
    // Falha anterior ao débito e anterior a qualquer mutação não exige
    // reconciliação financeira. Consultar um ledger indisponível aqui escondia
    // a causa real e deixava uma operação inocente em refund_pending.
    if (!input.creditReserved && !input.cleanupRequired) {
      await input.reportProgress('failed', {
        radarLeadId: input.originalRow.id,
        error: originalError,
        contactAccessRevoked: true,
      });
      return;
    }
    if (typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit !== 'function') {
      await input.reportProgress('refund_pending', {
        radarLeadId: input.originalRow.id,
        usageKey: input.creditUsageKey,
        error: 'Não foi possível consultar o ledger após uma falha ambígua.',
        cleanupPending: Boolean(input.cleanupRequired),
      }).catch(() => undefined);
      throw new ServiceUnavailableException('Reconciliação do crédito indisponível; a operação ficou pendente.');
    }
    let activeCredit: boolean;
    try {
      activeCredit = await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(
        input.context.companyId,
        { usageKey: input.creditUsageKey },
      );
    } catch {
      await input.reportProgress('refund_pending', {
        radarLeadId: input.originalRow.id,
        usageKey: input.creditUsageKey,
        error: 'Falha ao confirmar o estado do ledger.',
        cleanupPending: Boolean(input.cleanupRequired),
      }).catch(() => undefined);
      throw new ServiceUnavailableException('O estado do crédito é ambíguo; a operação ficou pendente.');
    }
    if (!input.cleanupRequired && !activeCredit) {
      await input.reportProgress('failed', {
        radarLeadId: input.originalRow.id,
        error: originalError,
        contactAccessRevoked: true,
      });
      return;
    }
    if (input.cleanupRequired) {
      try {
        // Ordem absoluta: primeiro apagar Vendas/restaurar posse, só depois
        // devolver o crédito. Assim nunca existe contato acessível já estornado.
        await this.rollbackRadarClaimAttempt({
          context: input.context,
          originalRow: input.originalRow,
          operationId: input.operationId || null,
          vendasLeadId: input.vendasLeadId || null,
          vendasCreated: Boolean(input.vendasLeadId),
        });
      } catch (cleanupError: any) {
        await input.reportProgress('refund_pending', {
          radarLeadId: input.originalRow.id,
          usageKey: input.creditUsageKey,
          originalError,
          error: String(cleanupError?.message || cleanupError),
          refundConfirmed: false,
          contactAccessRevoked: false,
          cleanupPending: true,
          creditStillReserved: activeCredit,
        }).catch(() => undefined);
        throw cleanupError;
      }
    }

    if (activeCredit) {
      try {
        await this.confirmRadarClaimCreditRefund(
          input.context.companyId,
          input.context.userId,
          input.creditUsageKey,
        );
      } catch (refundError: any) {
        await input.reportProgress('refund_pending', {
          radarLeadId: input.originalRow.id,
          usageKey: input.creditUsageKey,
          originalError,
          error: String(refundError?.message || refundError),
          refundConfirmed: false,
          ownershipRestored: true,
          contactAccessRevoked: true,
        }).catch(() => undefined);
        throw refundError;
      }
    }

    await input.reportProgress(activeCredit ? 'refunded' : 'failed', {
      radarLeadId: input.originalRow.id,
      usageKey: input.creditUsageKey,
      error: originalError,
      refundConfirmed: activeCredit,
      ownershipRestored: true,
      contactAccessRevoked: true,
    });
  }

  private buildPublicLeadProcessSnapshot(snapshot: any, options: { contactAccessGranted?: boolean } = {}) {
    const data = snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : {};
    const internalStatus = String(snapshot?.status || 'queued');
    const status = internalStatus === 'completed'
      ? 'completed'
      : internalStatus === 'partial'
        ? 'partial'
        : internalStatus === 'failed' || internalStatus === 'refunded'
          ? 'failed'
          : internalStatus === 'queued'
            ? 'starting'
            : 'running';
    const stageProgress = Array.isArray(snapshot?.stages) && snapshot.stages.length
      ? Math.round((snapshot.stages.filter((stage: any) => stage?.state === 'completed').length / snapshot.stages.length) * 100)
      : 0;
    const mode = snapshot?.mode === 'search' ? 'search' : 'claim';
    const contactAccessRevoked = data?.contactAccessRevoked === true
      || data?.ownershipRestored === true
      || data?.refundConfirmed === true
      || internalStatus === 'refund_pending'
      || internalStatus === 'refunded'
      || internalStatus === 'failed';
    const canRevealLead = options.contactAccessGranted === true
      && mode === 'claim'
      && !contactAccessRevoked
      && ['base_revealed', 'motor_enriching', 'vendas_creating', 'completed', 'partial'].includes(internalStatus);
    const sanitizeProcessLead = (lead: any, fallbackId?: string | null) => {
      if (!lead || typeof lead !== 'object') return null;
      return canRevealLead
        ? lead
        : this.sanitizeRadarPreDebitLead(lead, { id: String(lead?.id || fallbackId || snapshot?.radarLeadId || '') });
    };
    const currentLead = sanitizeProcessLead(data?.currentLead, snapshot?.radarLeadId);
    const recentLeads = Array.isArray(data?.recentLeads)
      ? data.recentLeads.map((lead: any) => sanitizeProcessLead(lead)).filter(Boolean)
      : [];
    const publicEventDetail = (eventData: any) => {
      if (!eventData || typeof eventData !== 'object') return null;
      // Nunca projeta usageKey, snapshots de compensação, payloads de fonte ou
      // qualquer blob arbitrário. A esteira pública precisa apenas destes sinais.
      return {
        ...(typeof eventData.rfbSucceeded === 'boolean' ? { rfbSucceeded: eventData.rfbSucceeded } : {}),
        ...(typeof eventData.refundConfirmed === 'boolean' ? { refundConfirmed: eventData.refundConfirmed } : {}),
        ...(typeof eventData.ownershipRestored === 'boolean' ? { ownershipRestored: eventData.ownershipRestored } : {}),
        ...(typeof eventData.contactAccessRevoked === 'boolean' ? { contactAccessRevoked: eventData.contactAccessRevoked } : {}),
        ...(typeof eventData.cleanupPending === 'boolean' ? { cleanupPending: eventData.cleanupPending } : {}),
        ...(typeof eventData.skipped === 'boolean' ? { skipped: eventData.skipped } : {}),
        ...(canRevealLead && eventData.vendasLeadId ? { vendasLeadId: String(eventData.vendasLeadId) } : {}),
      };
    };
    return {
      operationId: String(snapshot?.id || ''),
      mode,
      status,
      progress: Math.max(0, Math.min(100, safeInteger(data?.progress ?? stageProgress))),
      stages: Array.isArray(snapshot?.stages) ? snapshot.stages.map((stage: any) => ({
        key: String(stage?.key || ''),
        label: String(stage?.label || ''),
        status: stage?.state === 'active' ? 'running' : stage?.state,
        detail: canRevealLead ? stage?.message || null : null,
      })) : [],
      counters: data?.counters && typeof data.counters === 'object' ? data.counters : {},
      currentLead,
      recentLeads,
      events: Array.isArray(snapshot?.events) ? snapshot.events.map((event: any) => ({
        id: event.id,
        key: event.type,
        label: canRevealLead ? (event.message || event.type) : event.type,
        status: event.statusTo,
        detail: publicEventDetail(event.data),
        at: event.occurredAt,
      })) : [],
      error: snapshot?.error
        ? {
            code: snapshot.error.code || null,
            message: canRevealLead ? snapshot.error.message || null : 'A operação não foi concluída. Nenhum dado foi liberado.',
          }
        : null,
      internalStatus,
      radarLeadId: snapshot?.radarLeadId || null,
      vendasLeadId: canRevealLead ? data?.vendasLeadId || null : null,
      sourceCoverage: canRevealLead ? data?.sourceCoverage || null : null,
      creditRefundConfirmed: data?.refundConfirmed === true,
      contactAccessRevoked: data?.contactAccessRevoked === true,
      contactAccessGranted: canRevealLead,
      createdAt: snapshot?.createdAt || null,
      updatedAt: snapshot?.updatedAt || null,
    };
  }

  private claimOperationProgress(status: string) {
    const order = [
      'queued',
      'validating',
      'debit_pending',
      'credit_debited',
      'ownership_claimed',
      'rfb_hydrating',
      'base_revealed',
      'motor_enriching',
      'vendas_creating',
      'completed',
    ];
    if (status === 'partial' || status === 'completed') return 100;
    if (status === 'refund_pending') return 35;
    if (status === 'failed' || status === 'refunded') return Math.max(0, Math.round(((order.indexOf(status) + 1) / order.length) * 100));
    const index = Math.max(0, order.indexOf(status));
    return Math.round((index / Math.max(1, order.length - 1)) * 100);
  }

  private async hasRadarClaimContactAccess(
    context: SearchExecutionContext,
    radarLeadId: string,
    operationId: string,
  ) {
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      select: {
        id: true,
        ownerCompanyId: true,
        companyStates: {
          where: { companyId: context.companyId },
          take: 1,
          select: {
            paidClaimOperationId: true,
            claimUsageKey: true,
            acquiredAt: true,
          },
        },
      },
    }).catch(() => null);
    return row
      ? this.hasRadarPaidAcquisition(context, row, operationId)
      : false;
  }

  async startRadarLeadClaimForUser(
    user: any,
    radarLeadId: string,
    options: {
      skipWhatsappValidation?: boolean;
      debitOnImport?: boolean;
      idempotencyKey?: string | null;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
    } = {},
  ) {
    const context = this.resolveContext(user);
    await this.assertSellerTeamPolicyAccess(user, 'radar.cards.sendToVendas', 'Envio do Radar para Vendas bloqueado pela politica da equipe.');
    const leadId = String(radarLeadId || '').trim();
    if (!leadId) throw new BadRequestException('Informe o lead do Radar.');
    const processDelegate = (this.prisma as any).radarLeadProcessRun;
    if (!processDelegate || !(await this.prisma.hasTable('RadarLeadProcessRun').catch(() => false))) {
      throw new ServiceUnavailableException('Processamento seguro de leads ainda não foi migrado neste ambiente.');
    }
    const existingActive = await processDelegate.findFirst({
      where: {
        companyId: context.companyId,
        radarLeadId: leadId,
        mode: 'claim',
        status: { notIn: ['completed', 'partial', 'failed', 'refunded'] },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (existingActive) {
      const updatedAtMs = existingActive.updatedAt instanceof Date ? existingActive.updatedAt.getTime() : 0;
      if (updatedAtMs && updatedAtMs < Date.now() - 2 * 60 * 1000) {
        setImmediate(() => {
          void this.recoverStaleRadarLeadClaimOperations({
            updatedBefore: new Date(Date.now() - 2 * 60 * 1000),
          }).catch(() => null);
        });
      }
      const snapshot = await this.getRadarLeadProcessStore().getSnapshot(context.companyId, existingActive.id);
      const contactAccessGranted = await this.hasRadarClaimContactAccess(context, leadId, existingActive.id);
      return { ok: true, operation: this.buildPublicLeadProcessSnapshot(snapshot, { contactAccessGranted }) };
    }
    const previousAcquisition = await processDelegate.findFirst({
      where: {
        companyId: context.companyId,
        radarLeadId: leadId,
        mode: 'claim',
        status: { in: ['completed', 'partial'] },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (previousAcquisition) {
      // Aquisição é uma vez por identidade/tenant. Uma nova chave HTTP não
      // transforma o mesmo lead em nova compra; devolvemos a operação que já
      // comprovou débito + entrega.
      const snapshot = await this.getRadarLeadProcessStore().getSnapshot(context.companyId, previousAcquisition.id);
      const contactAccessGranted = await this.hasRadarClaimContactAccess(context, leadId, previousAcquisition.id);
      if (contactAccessGranted) {
        return {
          ok: true,
          alreadyAcquired: true,
          operation: this.buildPublicLeadProcessSnapshot(snapshot, { contactAccessGranted: true }),
        };
      }
    }
    const previousCount = await processDelegate.count({
      where: { companyId: context.companyId, radarLeadId: leadId, mode: 'claim' },
    }).catch(() => 0) || 0;
    const requestedKey = String(options.idempotencyKey || '').trim();
    const idempotencyKey = requestedKey || `claim:${leadId}:${previousCount + 1}`;
    const lead = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        segment: true,
        ownerCompanyId: true,
        claimedAt: true,
        status: true,
        companyStates: {
          where: { companyId: context.companyId },
          take: 1,
          select: {
            vendasLeadId: true,
            paidClaimOperationId: true,
            claimUsageKey: true,
            acquiredAt: true,
            status: true,
            assignedUserId: true,
            assignedByUserId: true,
            assignedAt: true,
            lastActionAt: true,
            negativeReason: true,
            privateNotes: true,
            noAnswerCount: true,
            contactedCount: true,
            lastContactAt: true,
            complaintReason: true,
            deniedReason: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Card do Radar nao encontrado.');
    const alreadyOwnedAndTransferred = Number(lead.ownerCompanyId || 0) === context.companyId
      && (lead.companyStates || []).some((state: any) => (
        Boolean(state?.vendasLeadId)
        || ['sent_to_vendas', 'imported_to_vendas'].includes(String(state?.status || '').toLowerCase())
      ));
    if (alreadyOwnedAndTransferred) {
      throw new ConflictException('Este lead já foi adquirido por esta empresa e já está em Vendas.');
    }
    let created: any;
    let operationWasCreated = false;
    try {
      const creation = await this.getRadarLeadProcessStore().createOperation({
      companyId: context.companyId,
      userId: context.userId,
      radarLeadId: leadId,
      mode: 'claim',
      idempotencyKey,
      snapshot: {
        progress: 0,
        counters: { queued: 1, completed: 0, partial: 0, failed: 0 },
        currentLead: this.sanitizeRadarPreDebitLead(lead, { id: lead.id }),
        recentLeads: [],
        // Dados internos para compensação após queda do processo. O presenter da
        // operação nunca projeta este bloco para o cliente.
        originalOwnership: {
          id: lead.id,
          ownerCompanyId: lead.ownerCompanyId || null,
          claimedAt: lead.claimedAt || null,
          status: lead.status,
          companyStates: lead.companyStates || [],
        },
        claimOptions: {
          assignedUserId: Math.trunc(Number(options.assignedUserId || 0)) || null,
          assignedByUserId: Math.trunc(Number(options.assignedByUserId || 0)) || null,
          skipWhatsappValidation: Boolean(options.skipWhatsappValidation),
        },
      },
      });
      created = creation.operation;
      operationWasCreated = creation.created;
    } catch (error: any) {
      // O índice parcial no PostgreSQL serializa compras concorrentes do mesmo
      // lead/tenant, mesmo quando chegaram com idempotency keys diferentes.
      if (String(error?.code || '').toUpperCase() !== 'P2002') throw error;
      const winner = await processDelegate.findFirst({
        where: {
          companyId: context.companyId,
          radarLeadId: leadId,
          mode: 'claim',
          status: { notIn: ['completed', 'partial', 'failed', 'refunded'] },
        },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null);
      if (!winner) throw error;
      const snapshot = await this.getRadarLeadProcessStore().getSnapshot(context.companyId, winner.id);
      const contactAccessGranted = await this.hasRadarClaimContactAccess(context, leadId, winner.id);
      return { ok: true, operation: this.buildPublicLeadProcessSnapshot(snapshot, { contactAccessGranted }) };
    }
    // Uma repetição com a mesma chave pode devolver uma operação já terminal.
    // Nunca reabre uma compra concluída/compensada: a resposta idempotente é o
    // snapshot persistido e somente uma nova operação recebe um novo débito.
    if (operationWasCreated && !['completed', 'partial', 'failed', 'refund_pending', 'refunded'].includes(String(created.status))) {
      setImmediate(() => {
        void this.processRadarLeadClaimOperation(created.id, user, leadId, options);
      });
    }
    const contactAccessGranted = await this.hasRadarClaimContactAccess(context, leadId, created.id);
    return { ok: true, operation: this.buildPublicLeadProcessSnapshot(created, { contactAccessGranted }) };
  }

  private async processRadarLeadClaimOperation(operationId: string, user: any, radarLeadId: string, options: any) {
    const context = this.resolveContext(user);
    const store = this.getRadarLeadProcessStore();
    const workerToken = String(options?.workerToken || '').trim()
      || await store.acquireWorkerLease({ companyId: context.companyId, operationId });
    if (!workerToken) return;
    const onProgress = async (status: string, payload: Record<string, any> = {}) => {
      let currentLead: any = undefined;
      // Compensação pendente já é revogação de acesso. O ledger pode continuar
      // reservado enquanto o estorno é reconciliado, mas isso não autoriza PII
      // no snapshot nem uma nova leitura do lead.
      const terminalStatusRevoked = ['failed', 'refund_pending', 'refunded'].includes(status);
      const contactAccessRevoked = terminalStatusRevoked
        || payload?.contactAccessRevoked === true
        || payload?.ownershipRestored === true
        || payload?.refundConfirmed === true;
      const contactsMayBeRevealed = ['base_revealed', 'motor_enriching', 'vendas_creating', 'completed', 'partial'].includes(status)
        && !contactAccessRevoked;
      if (contactsMayBeRevealed) {
        currentLead = await this.getRadarLeadForUser(user, radarLeadId)
          .then((result: any) => result?.item || null)
          .catch(() => null);
      } else if (status === 'failed' || status === 'refunded' || contactAccessRevoked) {
        // Se a operação falhou/foi compensada, o crédito não sustenta mais a
        // revelação. Não releia sequer nome/localização: persista só o id opaco.
        currentLead = this.sanitizeRadarPreDebitLead({ id: radarLeadId }, { id: radarLeadId });
      }
      const metadata = this.parseMaybeJsonObject(currentLead?.metadataJson);
      const terminalRevocation = contactAccessRevoked;
      const safeTerminalEventData = {
        ...(payload?.refundConfirmed === true ? { refundConfirmed: true } : {}),
        ...(payload?.ownershipRestored === true ? { ownershipRestored: true } : {}),
        ...(contactAccessRevoked ? { contactAccessRevoked: true } : {}),
        ...(payload?.cleanupPending === true ? { cleanupPending: true } : {}),
      };
      await store.transitionOperation({
        companyId: context.companyId,
        operationId,
        workerToken,
        status: status as any,
        eventType: `claim.${status}`,
        eventMessage: terminalRevocation ? 'Acesso ao contato revogado.' : payload?.detail || payload?.error || null,
        eventData: terminalRevocation ? safeTerminalEventData : payload,
        errorCode: status === 'refund_pending'
          ? 'RADAR_CLAIM_REFUND_PENDING'
          : status === 'failed' || status === 'refunded'
            ? 'RADAR_CLAIM_FAILED'
            : status === 'partial' ? 'RADAR_CLAIM_PARTIAL' : null,
        errorMessage: terminalRevocation
          ? 'A operação não foi concluída. Nenhum dado foi liberado.'
          : status === 'refund_pending' || status === 'partial'
          ? String(payload?.error || payload?.detail || (Array.isArray(payload?.partialReasons) ? payload.partialReasons.join(' ') : '') || '').slice(0, 1000) || null
          : null,
        snapshotPatch: {
          progress: this.claimOperationProgress(status),
          ...(currentLead !== undefined
            ? { currentLead, recentLeads: contactsMayBeRevealed && currentLead ? [currentLead] : [] }
            : {}),
          ...(!terminalRevocation && payload?.vendasLeadId ? { vendasLeadId: payload.vendasLeadId } : {}),
          ...(payload?.refundConfirmed === true ? { refundConfirmed: true } : {}),
          ...(payload?.ownershipRestored === true ? { ownershipRestored: true } : {}),
          ...(contactAccessRevoked ? { contactAccessRevoked: true } : {}),
          ...(!terminalRevocation && (currentLead?.sourceCoverage || metadata?.sourceCoverage) ? { sourceCoverage: currentLead?.sourceCoverage || metadata?.sourceCoverage } : {}),
          counters: {
            queued: 0,
            completed: status === 'completed' ? 1 : 0,
            partial: status === 'partial' ? 1 : 0,
            failed: status === 'failed' || status === 'refund_pending' || status === 'refunded' ? 1 : 0,
          },
        },
      });
    };
    let leaseLost = false;
    let heartbeatBusy = false;
    const heartbeat = setInterval(() => {
      if (heartbeatBusy || leaseLost) return;
      heartbeatBusy = true;
      void store.renewWorkerLease({
        companyId: context.companyId,
        operationId,
        workerToken,
      }).then((active) => {
        if (!active) leaseLost = true;
      }).catch(() => {
        leaseLost = true;
      }).finally(() => {
        heartbeatBusy = false;
      });
    }, 25_000);
    (heartbeat as any).unref?.();
    try {
      await this.importRadarLeadToVendasForUser(user, radarLeadId, {
        ...options,
        debitOnImport: options?.debitOnImport !== false,
        claimOperationId: operationId,
        workerToken,
        onProgress,
      });
      if (leaseLost) {
        throw new ConflictException('O worker perdeu o lease durante a aquisição.');
      }
    } catch (error) {
      const current = await store.getSnapshot(context.companyId, operationId).catch(() => null);
      if (current && !['failed', 'refund_pending', 'refunded'].includes(String(current.status))) {
        await onProgress('failed', { error: String((error as any)?.message || error) }).catch(() => null);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  async getRadarClaimRunForUser(user: any, operationId: string) {
    const context = this.resolveContext(user);
    const snapshot = await this.getRadarLeadProcessStore().getSnapshot(context.companyId, operationId);
    const contactAccessGranted = snapshot.radarLeadId
      ? await this.hasRadarClaimContactAccess(context, snapshot.radarLeadId, snapshot.id)
      : false;
    return this.buildPublicLeadProcessSnapshot(snapshot, { contactAccessGranted });
  }

  /**
   * Recuperação de boot para operações interrompidas. Antes do débito, a operação
   * pode ser retomada idempotentemente. Depois do débito, reconciliamos um Vendas
   * já criado ou compensamos crédito + posse; nunca deixamos o cliente debitado
   * em um estado ativo órfão.
   */
  private async recoverStaleRadarLeadClaimOperations(options: { updatedBefore?: Date } = {}) {
    if ((this as any).radarClaimRecoveryActive) return;
    const delegate = (this.prisma as any).radarLeadProcessRun;
    if (!delegate || !(await this.prisma.hasTable('RadarLeadProcessRun').catch(() => false))) return;
    (this as any).radarClaimRecoveryActive = true;
    try {
      const staleBefore = options.updatedBefore || new Date(Date.now() - 2 * 60 * 1000);
      const runs = await delegate.findMany({
        where: {
          mode: 'claim',
          status: { notIn: ['completed', 'partial', 'failed', 'refunded'] },
          updatedAt: { lt: staleBefore },
        },
        orderBy: { updatedAt: 'asc' },
        take: 100,
      }).catch(() => []);
      const preDebitStatuses = new Set(['queued', 'validating', 'debit_pending']);
      for (const run of Array.isArray(runs) ? runs : []) {
        const operationId = String(run?.id || '');
        const radarLeadId = String(run?.radarLeadId || '');
        const companyId = Math.trunc(Number(run?.companyId || 0));
        const userId = Math.trunc(Number(run?.userId || 0));
        if (!operationId || !radarLeadId || !companyId || !userId) continue;
        const store = this.getRadarLeadProcessStore();
        const recoveryWorkerToken = await store.acquireRecoveryLease({
          companyId,
          operationId,
          expectedVersion: Number(run?.version || 0),
          expectedStatus: String(run?.status || 'queued') as any,
          staleBefore,
        }).catch(() => null);
        if (!recoveryWorkerToken) continue;
        const snapshot = await store.getSnapshot(companyId, operationId).catch(() => null);
        if (!snapshot) continue;
        const recoveryData = snapshot.data && typeof snapshot.data === 'object' ? snapshot.data as any : {};
        const claimOptions = recoveryData.claimOptions && typeof recoveryData.claimOptions === 'object'
          ? recoveryData.claimOptions
          : {};
        const recoveredAssignedUserId = Math.trunc(Number(claimOptions.assignedUserId || 0)) || userId;
        const recoveredAssignedByUserId = Math.trunc(Number(claimOptions.assignedByUserId || 0)) || userId;
        const refundPreviouslyConfirmed = recoveryData.refundConfirmed === true
          || snapshot.events.some((event: any) => Boolean((event?.data as any)?.refundConfirmed));
        const refundUsageKey = `radar:${radarLeadId}:claim:${operationId}`;
        let activeCredit: boolean | null = null;
        if (typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit === 'function') {
          activeCredit = await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(
            companyId,
            { usageKey: refundUsageKey },
          ).catch(() => null);
        }
        if (activeCredit == null) {
          await store.transitionOperation({
            companyId,
            operationId,
            workerToken: recoveryWorkerToken,
            status: 'refund_pending',
            eventType: 'claim.ledger_reconciliation_pending',
            eventMessage: 'A confirmação do ledger está indisponível.',
            eventData: { cleanupPending: true },
            errorCode: 'RADAR_CLAIM_LEDGER_UNAVAILABLE',
            errorMessage: 'A confirmação do ledger está indisponível.',
            snapshotPatch: { contactAccessRevoked: true },
          }).catch(() => null);
          continue;
        }

        const persistedUser = await (this.prisma as any).user.findFirst({
          where: { id: userId, companyId, isActive: true },
          select: { id: true },
        }).catch(() => null);
        if (preDebitStatuses.has(String(snapshot.status)) && persistedUser && !activeCredit) {
          const queueUser = await this.buildQueueUser(run);
          setImmediate(() => {
            void this.processRadarLeadClaimOperation(operationId, queueUser, radarLeadId, {
              debitOnImport: true,
              assignedUserId: Math.trunc(Number(claimOptions.assignedUserId || 0)) || null,
              assignedByUserId: Math.trunc(Number(claimOptions.assignedByUserId || 0)) || null,
              skipWhatsappValidation: Boolean(claimOptions.skipWhatsappValidation),
              resumeStatus: snapshot.status,
              workerToken: recoveryWorkerToken,
            });
          });
          continue;
        }

        const vendasDelegate = (this.prisma as any).vendasLead;
        const vendasLead = vendasDelegate
          ? await vendasDelegate.findFirst({
              where: { companyId, claimOperationId: operationId },
              select: { id: true },
            }).catch(() => null)
          : null;
        // `refund_pending` já revogou o direito de acesso. Mesmo que o ledger ainda
        // reporte o débito como ativo, a recuperação deve terminar a compensação;
        // jamais pode reativar o card nem recolocar PII no snapshot.
        if (
          vendasLead?.id
          && activeCredit
          && !refundPreviouslyConfirmed
          && String(snapshot.status) !== 'refund_pending'
        ) {
          const now = new Date();
          await (this.prisma as any).radarLeadCompanyState.upsert({
            where: { companyId_radarLeadId: { companyId, radarLeadId } },
            create: {
              companyId,
              radarLeadId,
              vendasLeadId: vendasLead.id,
              paidClaimOperationId: operationId,
              claimUsageKey: refundUsageKey,
              acquiredAt: now,
              status: 'sent_to_vendas',
              assignedUserId: recoveredAssignedUserId,
              assignedByUserId: recoveredAssignedByUserId,
              assignedAt: now,
              lastActionAt: now,
            },
            update: {
              vendasLeadId: vendasLead.id,
              paidClaimOperationId: operationId,
              claimUsageKey: refundUsageKey,
              acquiredAt: now,
              status: 'sent_to_vendas',
              lastActionAt: now,
            },
          }).catch(() => null);
          await (this.prisma as any).radarLeadPool.updateMany({
            where: {
              id: radarLeadId,
              OR: [{ ownerCompanyId: null }, { ownerCompanyId: companyId }],
            },
            data: {
              ownerCompanyId: companyId,
              claimedAt: now,
              status: 'sent_to_vendas',
              lastSeenAt: now,
            },
          }).catch(() => null);
          const recoveryReasons: string[] = [];
          let recoveredLead = await (this.prisma as any).radarLeadPool.findUnique({
            where: { id: radarLeadId },
            include: { companyStates: true, contacts: true },
          }).catch(() => null);
          if (!recoveredLead) {
            recoveryReasons.push('Lead do Radar não foi recarregado para concluir as fontes.');
          } else {
            const rfb = await this.hydrateRadarLeadFromRfbForClaim(recoveredLead).catch((error: any) => ({
              row: recoveredLead,
              succeeded: false,
              reason: String(error?.message || error || 'Falha ao consultar a RFB.'),
            }));
            recoveredLead = rfb.row || recoveredLead;
            if (!rfb.succeeded) recoveryReasons.push(rfb.reason || 'RFB não concluída.');

            const recoveryContext = { companyId, userId, user: null } as SearchExecutionContext;
            const motorPayload = await this.enrichRadarLeadViaHbxMotor(recoveryContext, recoveredLead).catch((error: any) => {
              recoveryReasons.push(`Motor HBX falhou: ${String(error?.message || error)}`);
              return null;
            });
            if (motorPayload) {
              recoveredLead = await this.applyHbxMotorEnrichment(recoveryContext, recoveredLead, motorPayload).catch((error: any) => {
                recoveryReasons.push(`Persistência do Motor HBX falhou: ${String(error?.message || error)}`);
                return recoveredLead;
              });
            } else if (!recoveryReasons.some((reason) => reason.startsWith('Motor HBX'))) {
              recoveryReasons.push('Motor HBX não retornou dados.');
            }
          }

          const creditStillActive = typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit === 'function'
            ? await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(companyId, { usageKey: refundUsageKey }).catch(() => null)
            : null;
          if (creditStillActive === false) {
            activeCredit = false;
          } else if (creditStillActive == null) {
            await store.transitionOperation({
              companyId,
              operationId,
              workerToken: recoveryWorkerToken,
              status: 'refund_pending',
              eventType: 'claim.recovery_ledger_pending',
              eventMessage: 'As fontes foram tentadas, mas o ledger precisa ser reconciliado.',
              eventData: { cleanupPending: true },
              snapshotPatch: { contactAccessRevoked: true, recentLeads: [] },
            }).catch(() => null);
            continue;
          } else if (recoveredLead) {
            await this.refreshPaidRadarVendasSnapshot({
              context: { companyId, userId, user: null } as SearchExecutionContext,
              operationId,
              usageKey: refundUsageKey,
              leadRow: recoveredLead,
            }).catch((error: any) => {
              recoveryReasons.push(`Snapshot 3+3 pendente: ${String(error?.message || error)}`);
              return null;
            });
            await store.renewWorkerLease({
              companyId,
              operationId,
              workerToken: recoveryWorkerToken,
            }).catch(() => false);
            const queueUser = persistedUser ? await this.buildQueueUser(run) : null;
            const currentLead = queueUser
              ? await this.getRadarLeadForUser(queueUser, radarLeadId).then((value: any) => value?.item || null).catch(() => null)
              : null;
            const recoveredStatus = recoveryReasons.length ? 'partial' : 'completed';
            await store.transitionOperation({
              companyId,
              operationId,
              workerToken: recoveryWorkerToken,
              status: recoveredStatus,
              eventType: recoveredStatus === 'completed' ? 'claim.recovered_completed' : 'claim.recovered_partial',
              eventMessage: recoveredStatus === 'completed'
                ? 'Operação reconciliada após reinício; RFB e Motor HBX foram tentados.'
                : 'Operação reconciliada com pendências após tentar RFB e Motor HBX.',
              eventData: { vendasLeadId: vendasLead.id },
              errorCode: recoveredStatus === 'partial' ? 'RADAR_CLAIM_PARTIAL' : null,
              errorMessage: recoveredStatus === 'partial' ? recoveryReasons.join(' ').slice(0, 1000) : null,
              snapshotPatch: {
                progress: 100,
                vendasLeadId: vendasLead.id,
                ...(currentLead ? { currentLead, recentLeads: [currentLead] } : {}),
                counters: {
                  queued: 0,
                  completed: recoveredStatus === 'completed' ? 1 : 0,
                  partial: recoveredStatus === 'partial' ? 1 : 0,
                  failed: 0,
                },
              },
            }).catch(() => null);
            continue;
          } else {
            await store.transitionOperation({
              companyId,
              operationId,
              workerToken: recoveryWorkerToken,
              status: 'partial',
              eventType: 'claim.recovered_partial',
              eventMessage: 'O card pago foi preservado; a retomada das fontes ficou pendente.',
              eventData: { vendasLeadId: vendasLead.id },
              errorCode: 'RADAR_CLAIM_PARTIAL',
              errorMessage: recoveryReasons.join(' ').slice(0, 1000),
              snapshotPatch: {
                progress: 100,
                vendasLeadId: vendasLead.id,
                counters: { queued: 0, completed: 0, partial: 1, failed: 0 },
              },
            }).catch(() => null);
            continue;
          }
        }

        const original = recoveryData.originalOwnership && typeof recoveryData.originalOwnership === 'object'
          ? recoveryData.originalOwnership
          : { id: radarLeadId, ownerCompanyId: null, claimedAt: null, status: 'clean', companyStates: [] };
        try {
          if (vendasLead?.id) {
            await this.removeExactRadarPaidVendasCardForRefund({ companyId, operationId });
          }
          await this.rollbackRadarClaimAttempt({
            context: { companyId, userId } as SearchExecutionContext,
            originalRow: { ...original, id: radarLeadId },
            operationId,
            vendasLeadId: vendasLead?.id || null,
            vendasCreated: Boolean(vendasLead?.id),
          });
        } catch (rollbackError: any) {
          await store.transitionOperation({
            companyId,
            operationId,
            workerToken: recoveryWorkerToken,
            status: 'refund_pending',
            eventType: 'claim.compensation_pending',
            eventMessage: refundPreviouslyConfirmed
              ? 'Crédito já estornado; resta remover o acesso ao lead.'
              : 'Limpeza de posse/Vendas pendente; o crédito continua reservado.',
            eventData: {
              usageKey: refundUsageKey,
              refundConfirmed: refundPreviouslyConfirmed,
              contactAccessRevoked: refundPreviouslyConfirmed,
              cleanupPending: true,
              error: String(rollbackError?.message || rollbackError),
            },
            errorCode: 'RADAR_CLAIM_COMPENSATION_PENDING',
            errorMessage: String(rollbackError?.message || rollbackError).slice(0, 1000),
            snapshotPatch: {
              progress: this.claimOperationProgress('refund_pending'),
              ...(refundPreviouslyConfirmed ? { refundConfirmed: true, contactAccessRevoked: true } : {}),
              counters: { queued: 0, completed: 0, partial: 0, failed: 1 },
            },
          }).catch(() => null);
          continue;
        }
        const safeLead = this.sanitizeRadarPreDebitLead({ id: radarLeadId }, { id: radarLeadId });
        // Persista primeiro a revogação de contato. Se o processo cair depois
        // da limpeza e antes do refund, a próxima réplica repete ambos de forma
        // idempotente sem que o snapshot antigo continue carregando PII.
        const safePending = await store.transitionOperation({
          companyId,
          operationId,
          workerToken: recoveryWorkerToken,
          status: 'refund_pending',
          eventType: 'claim.cleanup_completed',
          eventMessage: refundPreviouslyConfirmed
            ? 'Acesso removido após estorno confirmado.'
            : 'Acesso removido; confirmando a devolução do crédito.',
          eventData: {
            usageKey: refundUsageKey,
            refundConfirmed: refundPreviouslyConfirmed,
            ownershipRestored: true,
            contactAccessRevoked: true,
          },
          errorCode: 'RADAR_CLAIM_REFUND_PENDING',
          errorMessage: 'Compensação financeira em andamento.',
          snapshotPatch: {
            progress: this.claimOperationProgress('refund_pending'),
            currentLead: safeLead,
            recentLeads: [],
            ownershipRestored: true,
            contactAccessRevoked: true,
            ...(refundPreviouslyConfirmed ? { refundConfirmed: true } : {}),
            counters: { queued: 0, completed: 0, partial: 0, failed: 1 },
          },
        }).then(() => true).catch(() => false);
        if (!safePending) continue;

        if (!refundPreviouslyConfirmed) {
          try {
            await this.confirmRadarClaimCreditRefund(companyId, userId, refundUsageKey);
          } catch (refundError: any) {
            await store.transitionOperation({
              companyId,
              operationId,
              workerToken: recoveryWorkerToken,
              status: 'refund_pending',
              eventType: 'claim.refund_pending',
              eventMessage: 'Estorno ainda não confirmado; a operação será reconciliada novamente.',
              eventData: {
                usageKey: refundUsageKey,
                refundConfirmed: false,
                ownershipRestored: true,
                contactAccessRevoked: true,
                error: String(refundError?.message || refundError),
              },
              errorCode: 'RADAR_CLAIM_REFUND_PENDING',
              errorMessage: String(refundError?.message || refundError).slice(0, 1000),
              snapshotPatch: {
                progress: this.claimOperationProgress('refund_pending'),
                currentLead: safeLead,
                recentLeads: [],
                ownershipRestored: true,
                contactAccessRevoked: true,
                counters: { queued: 0, completed: 0, partial: 0, failed: 1 },
              },
            }).catch(() => null);
            continue;
          }
        }
        await store.transitionOperation({
          companyId,
          operationId,
          workerToken: recoveryWorkerToken,
          status: 'refunded',
          eventType: 'claim.recovered_refunded',
          eventMessage: persistedUser
            ? 'Operação interrompida compensada após reinício.'
            : 'Operação compensada porque o usuário não está mais ativo.',
          eventData: { creditReleased: true, refundConfirmed: true, ownershipRestored: true, contactAccessRevoked: true },
          errorCode: 'RADAR_CLAIM_INTERRUPTED',
          errorMessage: 'A puxada foi interrompida e compensada com segurança.',
          snapshotPatch: {
            progress: this.claimOperationProgress('refunded'),
            currentLead: safeLead,
            recentLeads: [],
            refundConfirmed: true,
            ownershipRestored: true,
            contactAccessRevoked: true,
            counters: { queued: 0, completed: 0, partial: 0, failed: 1 },
          },
        }).catch(() => null);
      }
    } finally {
      (this as any).radarClaimRecoveryActive = false;
    }
  }

  private async confirmRadarClaimCreditRefund(
    companyId: number,
    userId: number,
    usageKey: string,
  ) {
    if (typeof this.commercialUsageLimits?.releaseLeadDeliveryCredit !== 'function') {
      throw new ServiceUnavailableException('O estorno do crédito ficou pendente de confirmação.');
    }
    const result = await this.commercialUsageLimits.releaseLeadDeliveryCredit(
      companyId,
      userId,
      { usageKey },
    );
    if (Number(result?.refunded || 0) < 1 && result?.alreadyRefunded !== true) {
      throw new ServiceUnavailableException('O estorno do crédito ficou pendente de confirmação.');
    }
    return result;
  }

  private async assertRadarClaimWorkerFence(
    context: SearchExecutionContext,
    operationId: string,
    workerToken: string,
  ) {
    if (!operationId || !workerToken) {
      throw new ServiceUnavailableException('Worker seguro da compra ausente. Nenhum efeito foi aplicado.');
    }
    const active = await this.getRadarLeadProcessStore().renewWorkerLease({
      companyId: context.companyId,
      operationId,
      workerToken,
    });
    if (!active) {
      throw new ConflictException({
        code: 'RADAR_CLAIM_WORKER_FENCED',
        message: 'Esta execução foi assumida pela recuperação e não pode mais gravar dados.',
      });
    }
  }

  async importRadarLeadToVendasForUser(
    user: any,
    radarLeadId: string,
    options: {
      skipWhatsappValidation?: boolean;
      debitOnImport?: boolean;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
      claimOperationId?: string | null;
      /** Fencing token persistido da saga paga. */
      workerToken?: string | null;
      /** Uso interno: transfere para Vendas um card que já pertence ao tenant. */
      transferAlreadyOwnedWithoutDebit?: boolean;
      /** Uso interno: impede nova consulta de fonte durante a transferência. */
      skipSourceHydration?: boolean;
      /** Uso interno do recovery: evita regredir a máquina ao repetir passos idempotentes. */
      resumeStatus?: string | null;
      onProgress?: (state: string, payload?: Record<string, any>) => Promise<void> | void;
    } = {},
  ) {
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para importacao.');
    }
    const context = this.resolveContext(user);
    const resumeStatus = String(options.resumeStatus || '').trim();
    const resumeProgressFloor = resumeStatus ? this.claimOperationProgress(resumeStatus) : -1;
    const reportProgress = async (state: string, payload: Record<string, any> = {}) => {
      if (typeof options.onProgress !== 'function') return;
      if (!['failed', 'partial', 'completed', 'refund_pending', 'refunded'].includes(state)
        && this.claimOperationProgress(state) < resumeProgressFloor) return;
      try {
        await Promise.resolve(options.onProgress(state, payload));
      } catch (error: any) {
        this.logger.warn(`[radar-claim-progress] falha ao persistir state=${state}: ${String(error?.message || error)}`);
        throw error;
      }
    };
    await reportProgress('validating', { radarLeadId: String(radarLeadId || '').trim() });
    await this.assertSellerTeamPolicyAccess(user, 'radar.cards.sendToVendas', 'Envio do Radar para Vendas bloqueado pela politica da equipe.');
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
        contacts: true,
      },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    if (options.debitOnImport !== false && Number(row.ownerCompanyId || 0) === context.companyId) {
      const existingTenantState = Array.isArray(row.companyStates) ? row.companyStates[0] : null;
      if (existingTenantState?.vendasLeadId || ['sent_to_vendas', 'imported_to_vendas'].includes(String(existingTenantState?.status || '').toLowerCase())) {
        throw new ConflictException('Este lead já foi adquirido por esta empresa; não haverá novo débito.');
      }
    }
    // LIMPEZA-DESTRUTIVA L3: qualquer vendedor/admin/master da empresa pode puxar um card
    // que já esteja atribuído a OUTRO colega — assignedUserId nunca mais é trava de posse.
    let leadRow = row;
    if (this.isRadarProtectedStatus(leadRow?.companyStates?.[0]?.status || leadRow?.status)) {
      throw new BadRequestException('Card protegido nao pode ser enviado para Vendas.');
    }
    // LIMPEZA-DESTRUTIVA L3: quando QUALQUER papel (vendedor, admin, master) puxa um card
    // livre para si (sem assignedUserId explícito), o campo é só INFORMATIVO ("Responsável"
    // = quem puxou) — usa context.userId. Callers de distribuição sempre passam
    // assignedUserId explícito, não são afetados.
    const explicitAssignedUserId = Math.trunc(Number(options.assignedUserId || 0)) || null;
    const assignedUserId = explicitAssignedUserId !== null
      ? explicitAssignedUserId
      : context.userId;
    const assignedByUserId = assignedUserId
      ? Math.trunc(Number(options.assignedByUserId || context.userId || 0)) || null
      : null;
    const requiredChannels = await this.getTeamPolicyRequiredRadarChannels(assignedUserId || context.userId);
    const quality = this.extractLeadQualityFromObject(leadRow)
      || this.extractLeadQualityFromObject(leadRow?.enrichmentJson)
      || this.extractLeadQualityFromObject(leadRow?.metadataJson)
      || this.evaluateLeadQuality(leadRow, {
        requestedSegment: String(leadRow?.segment || ''),
        requestedCity: leadRow?.city || null,
        requestedState: leadRow?.state || null,
        targetType: normalizeTargetType(this.parseMaybeJsonObject(leadRow?.metadataJson)?.targetType),
      });
    const metadata = this.parseMaybeJsonObject(leadRow?.metadataJson);
    const importQualityInput = {
      city: String(leadRow?.city || ''),
      state: String(leadRow?.state || ''),
      segment: String(leadRow?.segment || ''),
      targetType: normalizeTargetType(metadata?.targetType),
      requiredChannels,
      preferredChannels: [],
      channelMatchMode: requiredChannels.length ? 'all_required' : 'prefer',
      salesProfile: null,
    } as NormalizedRadarFilters;
    const qualityV2 = this.extractLeadQualityV2FromObject(leadRow)
      || this.extractLeadQualityV2FromObject(leadRow?.enrichmentJson)
      || this.extractLeadQualityV2FromObject(leadRow?.metadataJson);
    if (!this.isLeadDeliverableCard(leadRow, importQualityInput, quality, qualityV2)) {
      throw new BadRequestException('Card nao passou na qualidade minima para esse segmento. Descartados nao consomem limite.');
    }
    const deliveryClassification = this.classifyCardDelivery(leadRow, importQualityInput, quality, qualityV2);
    if (!this.isCardDeliveryEligibleForVendas(deliveryClassification, leadRow, qualityV2)) {
      throw new BadRequestException('Card nao esta elegivel para Vendas neste modo de qualidade.');
    }
    // CRÉDITOS — ATOMICIDADE (fix "entrega parcial + 409" / puxar com saldo 0). A ordem antiga era
    // criar card → entregar → debitar → 409 sem desfazer, deixando card órfão no Vendas. Agora o
    // débito acontece ANTES de qualquer gravação: sem saldo, o gate REAL sobe ConflictException
    // AQUI (nenhum claim no Radar, nenhum card no Vendas), e o dono vê "Saldo de créditos esgotado"
    // (isBillingOwnerActor decide a mensagem; vendedor/gerente seguem no bloqueio neutro). Gate OFF
    // (2 chaves) = no-op transparente. O importWebscraping abaixo roda com debitOnImport:false — o
    // débito e o teto de cards-em-mãos já foram resolvidos aqui, então NÃO há débito duplo nem
    // dupla contagem do teto S4 do vendedor. Estorno atômico no catch se a gravação falhar depois.
    const wantsCreditDebit = options.debitOnImport !== false;
    const isOwnedTransfer = !wantsCreditDebit
      && options.transferAlreadyOwnedWithoutDebit === true
      && Number(leadRow.ownerCompanyId || 0) === context.companyId
      && Boolean(leadRow?.companyStates?.[0]?.paidClaimOperationId)
      && Boolean(leadRow?.companyStates?.[0]?.claimUsageKey)
      && Boolean(leadRow?.companyStates?.[0]?.acquiredAt);
    if (options.skipSourceHydration === true && !isOwnedTransfer) {
      throw new ConflictException('Só um lead já adquirido pode ser transferido sem reconsultar as fontes.');
    }
    // Transferência sem débito sempre reutiliza o ativo adquirido. A flag é
    // explícita no caller atual, mas a regra permanece fail-safe se outro caller
    // interno a omitir no futuro.
    const skipSourceHydration = isOwnedTransfer;
    if (!wantsCreditDebit) {
      if (!isOwnedTransfer) {
        throw new ConflictException('A transferência sem débito só é permitida para um lead já adquirido por esta empresa.');
      }
    }
    const claimOperationId = String(options.claimOperationId || '').trim();
    const workerToken = String(options.workerToken || '').trim();
    if (wantsCreditDebit && !claimOperationId) {
      throw new ServiceUnavailableException('Operação segura de compra ausente. Nenhum dado foi revelado.');
    }
    if (wantsCreditDebit && !workerToken) {
      throw new ServiceUnavailableException('Worker seguro da compra ausente. Nenhum dado foi revelado.');
    }
    const creditUsageKey = wantsCreditDebit
      ? `radar:${leadRow.id}:claim:${claimOperationId}`
      : `radar:${leadRow.id}:owned-transfer`;
    let creditReserved = false;
    let imported: any = null;
    let vendasLeadId: string | null = null;
    let claimMutationStarted = false;
    let deliveryCoreCommitted = false;
    const partialReasons: string[] = [];
    try {
    if (wantsCreditDebit) {
      await this.assertRadarClaimWorkerFence(context, claimOperationId, workerToken);
    }
    if (wantsCreditDebit) {
      await reportProgress('debit_pending', { radarLeadId: leadRow.id });
      // O lead custa um crédito. Não há teto paralelo de plano, quantidade
      // mensal/diária ou cards ativos: saldo + RBAC + segurança são as travas.
      if (typeof this.commercialUsageLimits?.reserveLeadDeliveryCredit !== 'function') {
        throw new ServiceUnavailableException('Débito de crédito indisponível. Nenhum dado foi revelado.');
      }
      const reservation = await this.commercialUsageLimits.reserveLeadDeliveryCredit(
        context.companyId,
        context.userId,
        { usageKey: creditUsageKey, isBillingAudienceUser: isBillingOwnerActor(user) },
      );
      if (reservation?.applied !== true || Number(reservation?.debited || 0) < 1) {
        throw new ServiceUnavailableException('Não foi possível confirmar o débito do crédito. Nenhum dado foi revelado.');
      }
      creditReserved = true;
      await reportProgress('credit_debited', {
        radarLeadId: leadRow.id,
        creditReserved: true,
        usageKey: creditUsageKey,
      });
    }
    await this.claimRadarLeadForCompany(context, leadRow, {
      poolStatus: 'in_attendance',
      companyStatus: 'in_attendance',
      eventType: 'ownership_reserved',
      note: assignedUserId
        ? `Card reservado para envio ao módulo Vendas do vendedor ${assignedUserId}.`
        : 'Card reservado para envio ao módulo Vendas.',
      assignedUserId,
      assignedByUserId,
      ...(wantsCreditDebit ? {
        paidClaimOperationId: claimOperationId,
        claimUsageKey: creditUsageKey,
      } : {}),
    });
    claimMutationStarted = true;
    await reportProgress('ownership_claimed', { radarLeadId: leadRow.id });

    if (isOwnedTransfer) {
      const paidState = leadRow?.companyStates?.[0] || null;
      const paidOperationId = String(paidState?.paidClaimOperationId || '').trim();
      const paidUsageKey = String(paidState?.claimUsageKey || '').trim();
      const activeCredit = paidUsageKey
        && typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit === 'function'
        ? await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(
            context.companyId,
            { usageKey: paidUsageKey },
          ).catch(() => false)
        : false;
      if (!activeCredit || !paidOperationId) {
        throw new ConflictException('A aquisição anterior não possui débito ativo comprovado.');
      }
      const paidCard = await (this.prisma as any).vendasLead.findUnique({
        where: { claimOperationId: paidOperationId },
        select: { id: true, companyId: true },
      });
      if (!paidCard || Number(paidCard.companyId) !== context.companyId) {
        throw new ConflictException('O card core da aquisição anterior não foi localizado.');
      }
      vendasLeadId = String(paidCard.id);
      deliveryCoreCommitted = true;
      imported = {
        ok: true,
        createdCount: 0,
        updatedCount: 0,
        deliveredCount: 1,
        leads: [{ id: vendasLeadId }],
        reusedPaidAcquisition: true,
      };
    }

    // Ponto de não-retorno ANTES do primeiro reveal. Se esta transação falhar,
    // o snapshot ainda está mascarado e a compensação pode estornar. Depois que
    // ela confirma, RFB/motor/CRM auxiliar são reparáveis e jamais geram lead grátis.
    if (wantsCreditDebit) {
      const core = await this.commitPaidRadarVendasCore({
        context,
        operationId: claimOperationId,
        workerToken,
        usageKey: creditUsageKey,
        leadRow,
        assignedUserId,
        assignedByUserId,
      });
      vendasLeadId = core.id;
      deliveryCoreCommitted = true;
      if (core.convergenceWarning) {
        partialReasons.push(`Card pago preservado; convergência pendente: ${core.convergenceWarning}`);
      }
    }

    if (skipSourceHydration) {
      // Transferência interna só move para Vendas um ativo que já foi comprado.
      // Reconsultar RFB, motor ou WhatsApp aqui seria enriquecimento fora da puxada
      // explícita e poderia alterar silenciosamente o produto já adquirido.
      await reportProgress('base_revealed', {
        radarLeadId: leadRow.id,
        rfbSucceeded: true,
        skipped: true,
        detail: 'Dados previamente adquiridos preservados; nenhuma fonte foi reexecutada.',
      }).catch(() => undefined);
      await reportProgress('motor_enriching', {
        radarLeadId: leadRow.id,
        skipped: true,
        detail: 'Transferência interna sem novo enriquecimento.',
      }).catch(() => undefined);
    } else {
      await reportProgress('rfb_hydrating', { radarLeadId: leadRow.id }).catch(() => undefined);
      const rfbHydration = await this.hydrateRadarLeadFromRfbForClaim(leadRow).catch((error: any) => ({
        row: leadRow,
        succeeded: false,
        reason: String(error?.message || error || 'Falha ao consultar a RFB.'),
      }));
      leadRow = rfbHydration.row || leadRow;
      if (!rfbHydration.succeeded && rfbHydration.reason) partialReasons.push(rfbHydration.reason);
      await reportProgress('base_revealed', {
        radarLeadId: leadRow.id,
        rfbSucceeded: Boolean(rfbHydration.succeeded),
        detail: rfbHydration.reason || null,
      }).catch(() => undefined);

      await reportProgress('motor_enriching', { radarLeadId: leadRow.id }).catch(() => undefined);
      const motorAttemptedAt = new Date().toISOString();
      leadRow = await this.persistClaimSourceCoverage(leadRow, 'motor', {
        attempted: true,
        status: 'running',
        attemptedAt: motorAttemptedAt,
      }).catch(() => leadRow);
      const motorPayload = await this.enrichRadarLeadViaHbxMotor(context, leadRow).catch((error: any) => {
        partialReasons.push(`Motor HBX falhou: ${String(error?.message || error)}`);
        return null;
      });
      await this.assertRadarClaimWorkerFence(context, claimOperationId, workerToken);
      if (motorPayload) {
        try {
          leadRow = await this.applyHbxMotorEnrichment(context, leadRow, motorPayload);
          leadRow = await this.persistClaimSourceCoverage(leadRow, 'motor', {
            attempted: true,
            succeeded: true,
            status: 'completed',
            attemptedAt: motorAttemptedAt,
            finishedAt: new Date().toISOString(),
          }).catch(() => leadRow);
        } catch (motorPersistenceError: any) {
          const detail = `Motor respondeu, mas a persistência canônica falhou: ${String(motorPersistenceError?.message || motorPersistenceError)}`;
          partialReasons.push(detail);
          leadRow = await this.persistClaimSourceCoverage(leadRow, 'motor', {
            attempted: true,
            succeeded: false,
            status: 'failed',
            reason: 'canonical_persistence_failed',
            attemptedAt: motorAttemptedAt,
            finishedAt: new Date().toISOString(),
          }).catch(() => leadRow);
        }
      } else {
        partialReasons.push('Motor HBX não concluiu o enriquecimento; os dados RFB foram preservados.');
        leadRow = await this.persistClaimSourceCoverage(leadRow, 'motor', {
          attempted: true,
          succeeded: false,
          status: 'failed',
          attemptedAt: motorAttemptedAt,
          finishedAt: new Date().toISOString(),
        }).catch(() => leadRow);
      }

      // Verificação de WhatsApp também é enriquecimento: só pode acontecer após
      // débito + claim, junto do motor. Ela apenas sinaliza; nunca bloqueia entrega.
      const resolvedWhatsappStatus = await this.resolveRadarWhatsappStatusForDelivery(leadRow).catch((error: any) => {
        partialReasons.push(`Verificação de WhatsApp pendente: ${String(error?.message || error)}`);
        return null;
      });
      if (resolvedWhatsappStatus) this.applyRadarWhatsappStatusSignalToRow(leadRow, resolvedWhatsappStatus);
    }

    if (wantsCreditDebit) {
      const core = await this.refreshPaidRadarVendasSnapshot({
        context,
        operationId: claimOperationId,
        usageKey: creditUsageKey,
        leadRow,
      });
      vendasLeadId = core.id;
      deliveryCoreCommitted = true;
    }
    await reportProgress('vendas_creating', {
      radarLeadId: leadRow.id,
      partialReasons,
    }).catch((error: any) => {
      partialReasons.push(`Snapshot 3+3 salvo; telemetria da execução ficou pendente: ${String(error?.message || error)}`);
    });
    // A compra canônica já materializou o VendasLead core. Não chame o importador
    // genérico aqui: ele cria/mescla CustomerProfile e Inbox por telefone e tornava
    // a revogação de uma compra indistinguível de dados CRM legítimos preexistentes.
    if (!vendasLeadId || !deliveryCoreCommitted) {
      throw new ServiceUnavailableException('O card core pago não foi confirmado.');
    }
    imported = imported || {
      ok: true,
      createdCount: 1,
      updatedCount: 0,
      deliveredCount: 1,
      leads: [{ id: vendasLeadId }],
      coreOnly: true,
    };
    } catch (error) {
      if (deliveryCoreCommitted && vendasLeadId) {
        partialReasons.push(`Entrega core preservada após falha auxiliar: ${String((error as any)?.message || error)}`);
        await reportProgress('partial', {
          radarLeadId: leadRow.id,
          vendasLeadId,
          partialReasons,
          deliveryCoreCommitted: true,
        }).catch(() => undefined);
        return {
          ok: true,
          radarLeadId: leadRow.id,
          vendasLeadId,
          import: imported || { ok: true, leads: [{ id: vendasLeadId }], auxiliaryPending: true },
          partialReasons,
        };
      }
      await this.compensateFailedRadarClaim({
        context,
        originalRow: row,
        creditReserved,
        creditUsageKey,
        error,
        reportProgress,
        vendasLeadId,
        cleanupRequired: claimMutationStarted || Boolean(imported),
        operationId: claimOperationId,
        workerToken,
      });
      throw error;
    }
    const now = new Date();
    const existingMetadata = this.parseMaybeJsonObject(leadRow?.metadataJson);
    const existingEnrichment = this.parseMaybeJsonObject(leadRow?.enrichmentJson);
    const deliveredState = this.getRadarDeliveryOrchestrator().buildDeliveredState({
      lead: leadRow,
      imported,
      vendasLeadId,
      metadata: existingMetadata,
      enrichment: existingEnrichment,
      now,
    });
    let nextDeliveryMetadata = {
      ...existingMetadata,
      ...deliveredState.metadataPatch,
    };
    let nextDeliveryEnrichment = {
      ...existingEnrichment,
      ...deliveredState.enrichmentPatch,
    };
    try {
      if (wantsCreditDebit) {
        await this.assertRadarClaimWorkerFence(context, claimOperationId, workerToken);
      }
      const ownershipEnabledForFinal = await this.supportsRadarOwnershipPersistence();
      await (this.prisma as any).$transaction(async (tx: any) => {
        if (wantsCreditDebit) {
          const fenced = await tx.radarLeadProcessRun.findFirst({
            where: {
              id: claimOperationId,
              companyId: context.companyId,
              workerToken,
              workerLeaseUntil: { gt: new Date() },
              status: { notIn: ['completed', 'partial', 'failed', 'refund_pending', 'refunded'] },
            },
            select: { id: true },
          });
          if (!fenced) throw new ConflictException('Worker perdeu o lease antes da projeção final do Radar.');
        }
        await tx.radarLeadCompanyState.upsert({
        where: {
          companyId_radarLeadId: {
            companyId: context.companyId,
            radarLeadId: leadRow.id,
          },
        },
        create: {
          companyId: context.companyId,
          radarLeadId: leadRow.id,
          vendasLeadId,
          paidClaimOperationId: claimOperationId || leadRow?.companyStates?.[0]?.paidClaimOperationId || null,
          claimUsageKey: creditUsageKey || leadRow?.companyStates?.[0]?.claimUsageKey || null,
          acquiredAt: now,
          status: 'sent_to_vendas',
          assignedUserId,
          assignedByUserId,
          assignedAt: assignedUserId ? now : null,
          lastActionAt: now,
        },
        update: {
          vendasLeadId,
          paidClaimOperationId: claimOperationId || undefined,
          claimUsageKey: wantsCreditDebit ? creditUsageKey : undefined,
          acquiredAt: now,
          status: 'sent_to_vendas',
          assignedUserId: assignedUserId || undefined,
          assignedByUserId: assignedByUserId || undefined,
          assignedAt: assignedUserId ? now : undefined,
          lastActionAt: now,
        },
        });
        await tx.radarLeadPool.update({
        where: { id: leadRow.id },
        data: {
          ...(ownershipEnabledForFinal ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
          metadataJson: JSON.stringify(nextDeliveryMetadata),
          enrichmentJson: JSON.stringify(nextDeliveryEnrichment),
        },
        });
      });
      await this.recordRadarLeadEvent({
        leadId: leadRow.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'imported_to_vendas',
        statusFrom: this.normalizeRadarLeadStatus(leadRow.status),
        statusTo: 'sent_to_vendas',
      });
    } catch (error: any) {
      // O card core já existe com claimOperationId e ledger ativo. Falhas nesta
      // projeção Radar são reparáveis e não invalidam a entrega cobrada.
      partialReasons.push(`Card entregue; sincronização final do Radar pendente: ${String(error?.message || error)}`);
    }
    if (wantsCreditDebit) {
      const metadataForMission = this.parseMaybeJsonObject(leadRow?.metadataJson);
      const notePayload = {
        razaoSocial: metadataForMission?.razaoSocial || leadRow?.name || null,
        nomeFantasia: metadataForMission?.nomeFantasia || leadRow?.name || null,
        situacao: metadataForMission?.companySituation || null,
        cnaeDescription: metadataForMission?.cnaeDescription || leadRow?.segment || null,
        porte: metadataForMission?.porte || null,
        city: leadRow?.city || null,
        state: leadRow?.state || null,
        hasWebsite: Boolean(leadRow?.website),
        hasWhatsappValidado: this.extractRadarLeadWhatsappStatus(leadRow) === 'validated',
        hasEmail: Boolean(leadRow?.email),
      };
      const paidMissionBase = {
        companyId: context.companyId,
        radarLeadId: String(leadRow.id),
        claimOperationId,
        claimUsageKey: creditUsageKey,
      };
      const missionResults = await Promise.allSettled([
        this.getMissionQueue().enqueuePaidAcquisitionMission({
          ...paidMissionBase,
          stage: 'enrich_lead',
          payload: {
            cnpj: metadataForMission?.cnpj || extractCnpjFromRadarLead(leadRow) || null,
            website: leadRow?.website || null,
            name: leadRow?.name || null,
          },
        }),
        this.getMissionQueue().enqueuePaidAcquisitionMission({
          ...paidMissionBase,
          stage: 'xray_note',
          payload: { note: notePayload },
        }),
      ]);
      const rejectedMission = missionResults.find((result) => result.status === 'rejected');
      if (rejectedMission?.status === 'rejected') {
        partialReasons.push(`Lead entregue; fila local pós-compra pendente: ${String(rejectedMission.reason?.message || rejectedMission.reason)}`);
      } else if (missionResults.some((result) => result.status === 'fulfilled' && !result.value?.missionId)) {
        partialReasons.push('Lead entregue; persistência da fila local pós-compra ainda não está disponível.');
      }
    }
    if (!assignedUserId && leadRow?.segment) {
      this._bumpSegmentAffinity(context.userId, String(leadRow.segment)).catch(() => null);
    }
    // Não existem escritores assíncronos pós-resposta. Eles podiam atravessar uma
    // revogação/estorno e recriar PII depois do cleanup. RFB + motor já rodaram
    // dentro da puxada cercada pelo débito e pelo claim.
    await reportProgress(partialReasons.length ? 'partial' : 'completed', {
      radarLeadId: leadRow.id,
      vendasLeadId,
      partialReasons,
    }).catch((error: any) => {
      partialReasons.push(`Entrega concluída; fechamento da telemetria pendente: ${String(error?.message || error)}`);
    });
    return {
      ok: true,
      radarLeadId: leadRow.id,
      vendasLeadId,
      import: imported,
      partialReasons,
    };
  }

  // distributeRadarLeadsToVendedoresForUser (o "push" admin→vendedor de CARDS):
  // REMOVIDO (LIMPEZA-DESTRUTIVA L4, 04/07). No modelo novo admin distribui
  // CRÉDITO (CREDITOS S4), não card. A puxada manual canônica
  // próprio vendedor) e importRadarLeadToVendasForUser seguem intocados.
}
