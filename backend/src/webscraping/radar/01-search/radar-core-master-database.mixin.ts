// @ts-nocheck
// Cofre/Cockpit de leads do dono (leitura, auditoria e exclusão em massa do RadarLeadPool)
// e formatador de erro do Radar do cliente.
// Consumidores VIVOS (que precisam continuar funcionando):
//   • MasterWebscrapingController: GET /modules/owner/radar/database-audit, GET database-cards,
//     DELETE database-cards/batch — usados pelo Cockpit Leads do :3107 e pela ponte VPS↔local
//     (ops-control /api/radar/vps/database-cards). "Cockpit Leads e transferência ficam como estão."
//   • WebscrapingController (rotas do cliente): buildRadarClientErrorResponse é o formatador de erro
//     de radar/database, radar/leads e search-runs.
// O backend audita somente execuções manuais/canônicas e o pool de motores do cliente.
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

    const hasActiveMission = searchRunsQueued + searchRunsRunning > 0;
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
    if (!diagnostics.length) diagnostics.push('Sem bloqueio crítico detectado agora.');

    const clientProtection = {
      mode: 'client_only',
      radarDigitalActiveRequests: scheduler?.clientDemandActive ? 1 : 0,
      eligibleEngines: safeInteger(scheduler?.eligibleEnginesCount),
      message: 'Pool dedicado somente a solicitações canônicas do cliente.',
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
      radarLeadId: true,
      status: true,
      vendasLeadId: true,
      paidClaimOperationId: true,
      claimUsageKey: true,
      acquiredAt: true,
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
    const projectPaidMasterRows = async (sourceRows: any[], explicitCompanyId?: number | null) => {
      const source = Array.isArray(sourceRows) ? sourceRows : [];
      const pairs = source.map((row: any) => ({
        radarLeadId: String(row?.id || ''),
        companyId: explicitCompanyId || Math.trunc(Number(row?.ownerCompanyId || 0)) || 0,
      })).filter((pair) => pair.radarLeadId && pair.companyId > 0);
      if (!pairs.length) {
        return source.map((row: any) => ({ row, viewerCompanyId: null, contactAccessGranted: false }));
      }
      const pairWhere = pairs.map((pair) => ({ companyId: pair.companyId, radarLeadId: pair.radarLeadId }));
      const [states, pendingRuns] = await Promise.all([
        (this.prisma as any).radarLeadCompanyState.findMany({
          where: { OR: pairWhere },
          select: companyStateSelect,
        }).catch(() => []),
        (this.prisma as any).radarLeadProcessRun.findMany({
          where: {
            mode: 'claim',
            status: 'refund_pending',
            OR: pairWhere,
          },
          select: { companyId: true, radarLeadId: true, status: true },
        }).catch(() => []),
      ]);
      const stateByPair = new Map((states || []).map((state: any) => [`${state.companyId}:${state.radarLeadId}`, state]));
      const pendingByPair = new Set((pendingRuns || []).map((run: any) => `${run.companyId}:${run.radarLeadId}`));
      const normalized = source.map((row: any) => {
        const viewerCompanyId = explicitCompanyId || Math.trunc(Number(row?.ownerCompanyId || 0)) || null;
        const key = viewerCompanyId ? `${viewerCompanyId}:${row.id}` : '';
        return {
          row: {
            ...row,
            companyStates: key && stateByPair.has(key) ? [stateByPair.get(key)] : [],
            processRuns: key && pendingByPair.has(key) ? [{ status: 'refund_pending' }] : [],
          },
          viewerCompanyId,
        };
      });
      const accessByPair = new Map<string, boolean>();
      const groups = new Map<number, any[]>();
      for (const item of normalized) {
        if (!item.viewerCompanyId) continue;
        const group = groups.get(item.viewerCompanyId) || [];
        group.push(item.row);
        groups.set(item.viewerCompanyId, group);
      }
      for (const [companyId, groupRows] of groups) {
        const access = await this.resolveRadarPaidAccessMap(companyId, groupRows);
        for (const row of groupRows) accessByPair.set(`${companyId}:${row.id}`, access.get(String(row.id)) === true);
      }
      return normalized.map((item) => ({
        ...item,
        contactAccessGranted: item.viewerCompanyId
          ? accessByPair.get(`${item.viewerCompanyId}:${item.row.id}`) === true
          : false,
      }));
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

      const projectedRows = await projectPaidMasterRows(rows || [], null);
      return {
        items: projectedRows.map((item: any) => ({
          ...this.buildRadarLeadPublic(item.row, {
            viewerCompanyId: item.viewerCompanyId || undefined,
            ownershipEnabled: Boolean(item.viewerCompanyId),
            contactAccessGranted: item.contactAccessGranted === true,
          }),
          targetType: this.resolveRadarLeadTargetType(item.row),
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
        processRuns: targetCompanyId
          ? {
              where: { companyId: targetCompanyId, mode: 'claim', status: 'refund_pending' },
              take: 1,
              select: { status: true },
            }
          : false,
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
    const projectedRows = await projectPaidMasterRows(pageRows, targetCompanyId);

    return {
      items: projectedRows.map((item: any) => ({
        ...this.buildRadarLeadPublic(item.row, {
          viewerCompanyId: item.viewerCompanyId || undefined,
          ownershipEnabled: Boolean(item.viewerCompanyId),
          contactAccessGranted: item.contactAccessGranted === true,
        }),
        targetType: this.resolveRadarLeadTargetType(item.row),
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
    if (looksLikeNonBusinessName(row && row.name)) return true;
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
      },
    };
  }
}
