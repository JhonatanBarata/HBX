// @ts-nocheck
// F0 (02/07): resgatado da fábrica DEMOLIDA (radar-core-factory-admin.mixin, deletado).
// Estes métodos NÃO são fábrica de descoberta — são o cofre/Cockpit de leads do dono (leitura,
// auditoria e exclusão em massa do RadarLeadPool) + o formatador de erro do Radar do CLIENTE.
// Consumidores VIVOS (que precisam continuar funcionando):
//   • MasterWebscrapingController: GET /modules/owner/radar/database-audit, GET database-cards,
//     DELETE database-cards/batch — usados pelo Cockpit Leads do :3107 e pela ponte VPS↔local
//     (ops-control /api/radar/vps/database-cards). "Cockpit Leads e transferência ficam como estão."
//   • WebscrapingController (rotas do cliente): buildRadarClientErrorResponse é o formatador de erro
//     de radar/database, radar/leads, pull-preview, pull-to-vendas e search-runs.
// Decoplado da fábrica: a auditoria não chama mais syncRadarFactoryFinishedWork/getRadarFactoryStatus
// (a fábrica de descoberta não existe mais); o bloco `factory` reporta idle honesto e o `schedule`
// vem do governor de motores (engine pool), que continua vivo.
import {
  BadRequestException,
  ServiceUnavailableException,
  safeInteger,
  normalizePhoneDigits,
  parseJsonArray,
  looksLikeNonBusinessName,
  isRealisticBrPhone,
  RadarFiltersInput,
} from '../shared/radar-core-shared';

export class RadarCoreMasterDatabaseMixin {
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
    if (input.engine?.lastError || status === 'degraded') return 'Erro no último lote';
    if (input.hasActiveMission) return 'Aguardando fila';
    return 'Sem missão ativa';
  }

  async getMasterDatabaseAudit(user?: any) {
    void user;
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
    if (totalCards === 0) diagnostics.push('Nenhum card salvo no banco. Motor ligado não significa card salvo.');
    if (motoresOnline > 0 && cardsLast10Min === 0) diagnostics.push('Motores vivos, mas sem produção recente.');
    if (searchRunsFailedToday > Math.max(3, searchRunsCompletedToday)) diagnostics.push('Muitas buscas falharam. Verificar motor, fila, timeout ou origem de scraping.');
    if (duplicatedItemsToday > Math.max(10, foundItemsToday)) diagnostics.push('Muitos duplicados. Trocar cidade, segmento ou tipo.');
    if (foundItemsToday > 0 && cardsToday === 0) diagnostics.push('Itens encontrados, mas persistência no RadarLeadPool pode estar falhando.');
    if (safeInteger(scheduler?.manualReservedEngines) <= 0) diagnostics.push('Radar Digital do cliente sem reserva de motor. Risco de 500/timeout.');
    if (!diagnostics.length) diagnostics.push('Sem bloqueio crítico detectado agora.');

    // Fábrica de DESCOBERTA autônoma DEMOLIDA (F0): não há mais cursor/missão de fábrica.
    // O bloco reporta idle honesto; `schedule` vem do governor de motores (engine pool), vivo.
    const factory = {
      enabled: false,
      status: 'idle',
      currentState: null,
      currentCity: null,
      currentSegment: null,
      currentTargetType: 'pj',
      lastCampaignId: null,
      lastRunId: null,
      lastSavedCount: 0,
      lastDuplicateCount: 0,
      lastRejectedCount: 0,
      consecutiveEmptyCount: 0,
      consecutiveFailureCount: 0,
      lastError: null,
      lastWorkedAt: null,
      nextRunAt: null,
      reasonStopped: null,
      nextMissionPreview: null,
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
        ? 'Radar Digital protegido: a fábrica não pode consumir os motores reservados do cliente.'
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

  // Decisão de "lixo" ESPELHANDO fielmente a régua única do backend (radar-core-shared):
  // lixo = nome não parece empresa (looksLikeNonBusinessName) OU sem contato ÚTIL, ou seja,
  // sem telefone BR realista (isRealisticBrPhone) E sem e-mail válido (emailStatus
  // 'missing'/'invalid' NÃO conta como válido). Site/social sozinho NÃO segura o lead.
  // Era uma cópia à mão no agent (hbx-owner/local-agent/server.js isJunkLead) — agora usa as
  // PRIMITIVAS testadas do backend, sem duplicar a régua (Sprint 3 HBX-OWNER).
  isJunkRadarLead(row: any) {
    if (looksLikeNonBusinessName(row && row.name, {
      hasCompanyAnchor: Boolean(row && row.cnpj),
    })) return true;
    if (isRealisticBrPhone(row && (row.phone || row.phoneDigits))) return false;
    const email = String((row && row.email) || '').trim();
    const emailStatus = String((row && row.emailStatus) || '').toLowerCase();
    if (email && !['missing', 'invalid'].includes(emailStatus)) return false;
    return true; // sem telefone real E sem e-mail válido = lixo
  }

  // Limpa "lixo" do pool de leads do dono pela REGRA ÚNICA do backend. Varre o pool com a MESMA
  // paginação interna do listMasterDatabaseCards (caminho sem-filtro: buildRadarWhere + orderBy +
  // skip/take) e classifica cada card com isJunkRadarLead. Sem `confirm`: preview
  // { preview:true, scanned, junk, sample[8] }. Com `confirm:true`: apaga pelo MESMO caminho do
  // permanentDeleteMasterDatabaseCards (em lotes de 2000) e devolve { scanned, junk, cleared }.
  // NÃO roda sozinho na VPS — é sob demanda (chamado pela rota owner clean-junk).
  async cleanJunkMasterDatabaseCards(user: any, input: { confirm?: boolean } = {}) {
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }

    const where = this.buildRadarWhere(this.normalizeRadarFilters({}), null, { includeHidden: true });
    const pageSize = 1000;
    const maxScan = 200_000; // guarda alta: banco inteiro sem loop infinito (200 páginas de 1000).
    let scanned = 0;
    const junkIds: string[] = [];
    const sample: string[] = [];

    for (let offset = 0; offset < maxScan; offset += pageSize) {
      const rows = await (this.prisma as any).radarLeadPool.findMany({
        where,
        orderBy: [
          { createdAt: 'desc' },
          { opportunityScore: 'desc' },
          { lastSeenAt: 'desc' },
        ],
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          phoneDigits: true,
          email: true,
          emailStatus: true,
        },
      }).catch(() => []);
      if (!rows || !rows.length) break;
      for (const row of rows) {
        scanned += 1;
        const id = String(row?.id || '').trim();
        if (id && this.isJunkRadarLead(row)) {
          junkIds.push(id);
          if (sample.length < 8) sample.push(String(row?.name || '').trim() || '(sem nome)');
        }
      }
      if (rows.length < pageSize) break;
    }

    if (input?.confirm !== true) {
      return { ok: true, preview: true, scanned, junk: junkIds.length, sample };
    }

    let cleared = 0;
    for (let i = 0; i < junkIds.length; i += 2000) {
      const chunk = junkIds.slice(i, i + 2000);
      const result = await this.permanentDeleteMasterDatabaseCards(user, { leadIds: chunk });
      cleared += Number(result?.affected || 0);
    }
    return { ok: true, scanned, junk: junkIds.length, cleared };
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
      ? 'Acesso ao Radar Digital indisponível para este usuário.'
      : code === 'SELLER_CARD_QUOTA_REACHED' || code === 'SELLER_QUOTA_PAUSED'
        ? String((error as any)?.response?.message || 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.')
      : code === 'NO_ENGINE_AVAILABLE'
        ? 'Motores ocupados. O sistema manteve sua busca na fila.'
        : code === 'RADAR_RUN_NOT_FOUND'
          ? 'Busca anterior encerrada. Radar pronto para uma nova pesquisa.'
          : code === 'RADAR_STOCK_EMPTY'
            ? 'Sem cards prontos para esse filtro. A reposição foi solicitada.'
            : status === 400
              ? (error instanceof Error ? error.message : 'Revise os filtros do Radar Digital.')
              : 'Radar temporariamente indisponível. Tente novamente em instantes.';
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
