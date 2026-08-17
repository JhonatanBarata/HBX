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
// LOTE 2 item 5 (17/08): a frase honesta ("A Receita tem N nessa cidade") tem de contar pela
// MESMA lei que a porta da Receita usa pra aceitar — este util é a ponte filtros→WHERE da base
// 28M e já foi corrigido pelo Lote 1 com o mapa segmento→CNAE. Contar por outra régua faria a
// mensagem prometer o que a busca não entrega.
import { buildCnpjBaseQueryInputFromRadarFilters } from '../providers/cnpj-public/radar-base-availability.util';

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
// falava com o motor web — a fonte cnpj_public (Receita) era inalcançável nesse fluxo. O estado
// dessa fonte morava num Map de processo (`ranThisRun`/`zeroAccepted`, TTL 2h).
//
// LOTE 2 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): o Map SAIU DE CENA. Dois motivos:
//   1. `ranThisRun` era a trava A4 — a Receita rodava UMA vez por run e o resto era só web. A
//      encomenda do dono é o contrário: a RFB repete a cada lote ATÉ SECAR.
//   2. Map é memória de processo: morre no `npm run publish` (que reinicia o backend). No meio
//      de um run, o cursor da drenagem voltaria a zero e a Receita re-entregaria o que já
//      entregou — tudo duplicata, lote queimado.
// Agora a verdade é o `metricsJson` do run: durável, sem migration (o updateMetrics faz
// `{...rawMetrics, ...metrics, ...patch}` e preserva chave desconhecida — ver
// radar-run-repository.service.ts:512-516). Namespace combinado com o Lote 4:
//   metricsJson.rfbDrain = { cursor, exhausted, delivered, available }
// ATENÇÃO: `parseSearchRunMetrics` normaliza pro shape conhecido e DESCARTA chave extra — por
// isso a leitura abaixo é crua, direto do JSON.
type RadarRfbDrainState = {
  cursor: { phase: string; cnpj: string | null } | null;
  exhausted: boolean;
  delivered: number;
  available: number | null;
};

function extrairEstadoDrenagemRfb(metricsJson: unknown): RadarRfbDrainState | null {
  let bruto: any = null;
  if (typeof metricsJson === 'string') {
    try {
      bruto = JSON.parse(metricsJson);
    } catch {
      bruto = null;
    }
  } else if (metricsJson && typeof metricsJson === 'object') {
    bruto = metricsJson;
  }
  const drenagem = bruto?.rfbDrain;
  if (!drenagem || typeof drenagem !== 'object') return null;
  const cursorBruto = drenagem.cursor;
  const cursor = cursorBruto && typeof cursorBruto === 'object'
    ? {
      phase: String(cursorBruto.phase || 'with_contact'),
      cnpj: cursorBruto.cnpj ? String(cursorBruto.cnpj) : null,
    }
    : null;
  const disponivel = Number(drenagem.available);
  return {
    cursor,
    exhausted: drenagem.exhausted === true,
    delivered: safeInteger(drenagem.delivered),
    available: drenagem.available == null || !Number.isFinite(disponivel) ? null : disponivel,
  };
}

const ACENTOS_COMBINANTES_RFB = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Cidade do jeito que o dump da RFB gravou: minúscula e SEM acento (coluna `normalizedCity`).
 * O WHERE do cnpj-base-query só faz `.toLowerCase()` na cidade que recebe — mandar "Águas de
 * Lindóia" com acento devolve 0 e a frase honesta mentiria na direção oposta ("a Receita não
 * tem ninguém" numa cidade cheia).
 */
function normalizarCidadeParaBaseRfb(city: unknown) {
  return String(city || '')
    .normalize('NFD')
    .replace(ACENTOS_COMBINANTES_RFB, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * LOTE 2 item 4 (17/08): no lote em que a web é PULADA ninguém fala com o motor, mas o resto do
 * fluxo (fusão canônica, persistência única do `deferPersistence`, contadores, desfecho) continua
 * exatamente igual — então ele precisa de uma resposta no shape de HbxEngineSearchOutput
 * (radar-core-shared.ts:322-337). O shape vai COMPLETO de propósito: o arquivo é `@ts-nocheck`,
 * e campo numérico faltando aqui viraria NaN silencioso nos contadores de lote (urlsDiscovered,
 * pagesFetched, rejectedCount, duplicateCount).
 */
function respostaVaziaDoMotorPulado() {
  return {
    results: [],
    status: 'running',
    message: null,
    httpStatus: null,
    rawErrorMessage: null,
    urlsDiscovered: 0,
    pagesFetched: 0,
    parsedContacts: 0,
    rejectedCount: 0,
    duplicateCount: 0,
  };
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
   * Lê o estado da drenagem direto do run (fallback de quem chama sem passar `persistedState`).
   * Falha de leitura devolve `null` — estado desconhecido faz a Receita tentar de novo, que é
   * o lado barato do erro (duplicata) contra o caro (deixar a base parada).
   */
  private async lerEstadoDrenagemRfb(runId: string) {
    try {
      const row = await this.prisma?.webscrapingSearchRun?.findUnique?.({
        where: { id: runId },
        select: { metricsJson: true },
      });
      return extrairEstadoDrenagemRfb(row?.metricsJson);
    } catch {
      return null;
    }
  }

  /**
   * Quanto a Receita TEM na cidade do pedido, pela mesma régua da porta (mapa segmento→CNAE do
   * Lote 1). Só é chamado no FECHAMENTO do run: `countBase` tem orçamento de 8s e devolve
   * `{available:false,count:null}` quando estoura — no caminho quente do lote isso custaria
   * segundos por attempt. Falha/indisponível devolve `null` e a frase simplesmente omite o
   * número, nunca imprime "null".
   */
  private async contarDisponivelNaReceita(normalized: NormalizedSearchInput) {
    const baseQuery = (this as any).cnpjBaseQuery;
    if (typeof baseQuery?.countBase !== 'function') return null;
    try {
      const contagem = await baseQuery.countBase(buildCnpjBaseQueryInputFromRadarFilters({
        // Cidade SEM acento e minúscula: o WHERE do cnpj-base-query só faz `.toLowerCase()` e a
        // coluna `normalizedCity` do dump não tem acento — mandar "Águas de Lindóia" devolveria
        // 0 numa cidade cheia e a frase mentiria na direção oposta.
        city: normalizarCidadeParaBaseRfb(normalized?.city),
        state: normalized?.state,
        segment: normalized?.segment,
      }));
      if (!contagem?.available) return null;
      const total = Number(contagem.count);
      return Number.isFinite(total) ? Math.max(0, safeInteger(total)) : null;
    } catch {
      return null;
    }
  }

  /**
   * LOTE 2 item 5 (17/08): "Entreguei 4 de 100" não dizia se a cidade é pobre na Receita ou se a
   * busca falhou. Aqui nascem os dois números que faltavam, cada um de onde já é verdade:
   *   - o que a Receita TEM: `metricsJson.rfbDrain.available` (medido uma vez por run) e, quando
   *     ainda não foi medido, o `countBase` da base 28M;
   *   - o que cada lane ENTREGOU: contagem dos itens SALVOS do run (card que o dono vê), não
   *     candidato oferecido — item fundido rfb↔web mantém `source='cnpj_public'` (a Receita é a
   *     canônica na fusão), então o resto é web de verdade.
   * Qualquer falha cai na frase de sempre: mensagem incompleta é ruim, mensagem errada é pior.
   */
  private async buildInsufficientMessageWithLanes(
    runId: string,
    normalized: NormalizedSearchInput,
    foundCount: number,
    attempt: number,
  ) {
    try {
      const estado = await this.lerEstadoDrenagemRfb(runId);
      const disponivel = estado?.available ?? await this.contarDisponivelNaReceita(normalized);
      const itens = (this.prisma as any)?.webscrapingSearchRunItem;
      let rfbEntregues: number | null = null;
      let webEntregues: number | null = null;
      if (typeof itens?.count === 'function') {
        const total = safeInteger(await itens.count({ where: { runId, status: 'found' } }));
        const daReceita = safeInteger(await itens.count({ where: { runId, status: 'found', source: 'cnpj_public' } }));
        rfbEntregues = Math.max(0, Math.min(daReceita, total));
        webEntregues = Math.max(0, total - rfbEntregues);
      }
      // Espelha o número medido no run pra o relatório por cidade não pagar o count de novo (e
      // pra o dono ver a mesma verdade na mensagem e no metricsJson). Só quando o estado existe
      // e o campo ainda está vazio — nunca sobrescreve cursor/seca já gravados.
      if (estado && estado.available == null && disponivel != null) {
        await this.updateSearchRunMetrics(runId, {
          rfbDrain: {
            cursor: estado.cursor ?? null,
            exhausted: estado.exhausted === true,
            delivered: safeInteger(estado.delivered),
            available: disponivel,
          },
        }).catch(() => null);
      }
      return this.buildSearchRunInsufficientMessage(foundCount, attempt, {
        rfbDisponivel: disponivel,
        rfbEntregues,
        webEntregues,
      });
    } catch (error) {
      // Degradar calado esconderia count quebrado por semanas: a frase volta ao texto de sempre,
      // mas o motivo fica no log.
      this.logger?.warn?.(
        `[radar-cadeia] run ${runId}: mensagem sem as lanes (${String((error as any)?.message || error)})`,
      );
      return this.buildSearchRunInsufficientMessage(foundCount, attempt);
    }
  }

  /**
   * Fonte Receita (cnpj_public) soldada no run de cliente — aditivo, flag-gated
   * (docs/PLANEJAMENTOS/PR01072026/60-receita-no-run-cliente.md).
   *
   * CUTOVER ORDEM FIXA (P1, 02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md):
   * a lane do cliente é semente → RFB → web → fusão. Este método é chamado ANTES do batch do
   * motor web (ver processSearchRun) — RFB roda primeiro na ordem fixa 1→8 da árvore mestra.
   * Erro aqui NUNCA bloqueia o batch web que vem depois (degrade gracioso).
   *
   * LOTE 2 (17/08): deixou de rodar "no máximo 1x por run" (trava A4). Agora repete A CADA
   * LOTE até a base SECAR, continuando do cursor gravado no metricsJson. Só o marcador de seca
   * (`exhausted`) corta a fonte — e ele é definitivo dentro do run.
   */
  private async runCnpjPublicSourceForClientRunIfEligible(
    context: SearchExecutionContext,
    normalized: NormalizedSearchInput,
    runId: string,
    remainingQuantity: number,
    options: { deferPersistence?: boolean; persistedState?: RadarRfbDrainState | null } = {},
  ): Promise<{
    accepted: number;
    ran: boolean;
    exhausted: boolean;
    cursor: { phase: string; cnpj: string | null } | null;
    results: WebscrapingContactResult[];
  }> {
    // Sem Receita neste pedido (flag off / não-pj / meta já batida) a resposta é "seca": não há
    // nada a esperar, e a lane web segue na hora.
    if (String(process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED).trim().toLowerCase() !== 'true') return { accepted: 0, ran: false, exhausted: true, cursor: null, results: [] };
    if (normalized?.targetType !== 'pj') return { accepted: 0, ran: false, exhausted: true, cursor: null, results: [] };
    if (remainingQuantity <= 0) return { accepted: 0, ran: false, exhausted: true, cursor: null, results: [] };

    // O call-site do run já carrega o metricsJson (findFirst sem select) e passa aqui — zero
    // query extra no caminho quente. Quem chama sem o campo cai na leitura direta.
    const estado = Object.prototype.hasOwnProperty.call(options, 'persistedState')
      ? options.persistedState ?? null
      : await this.lerEstadoDrenagemRfb(runId);
    if (estado?.exhausted) return { accepted: 0, ran: false, exhausted: true, cursor: null, results: [] };

    try {
      const source = this.getRadarCnpjPublicSource
        ? this.getRadarCnpjPublicSource()
        : new RadarCnpjPublicSourceService();
      // TETO A3 (LOTE 2): era `min(remaining, 20)` — busca de 100 recebia no máximo 20 da
      // Receita, por construção. `remaining` já vem clampado pela meta no call-site e o
      // provider tem teto próprio de 100 por passada.
      const limit = Math.max(1, remainingQuantity);
      const sourceResult = await source.run({
        normalized,
        limit,
        prisma: this.prisma,
        cursor: estado?.cursor ?? null,
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
      // MARCADOR DE SECA. Duas portas pro mesmo estado: a fonte avisou que virou a última
      // página (`exhausted`), ou o lote inteiro (até 6 páginas de 500) não rendeu UM aceito —
      // insistir na Receita depois disso só queima attempt que a web precisa.
      const secou = Boolean(sourceResult?.exhausted) || accepted === 0;
      const cursor = secou ? null : (sourceResult?.cursor ?? null);
      const entregues = safeInteger(estado?.delivered) + accepted;
      await this.updateSearchRunMetrics(runId, {
        rfbDrain: {
          cursor,
          exhausted: secou,
          delivered: entregues,
          available: estado?.available ?? null,
        },
      }).catch(() => null);
      this.logger?.log?.(
        `[radar-cadeia] run ${runId}: 1=rfb found=${sourceResult?.foundCount ?? results.length} accepted=${accepted} `
        + `exhausted=${secou} cursor=${cursor?.cnpj || '-'} fase=${cursor?.phase || '-'} reason=${sourceResult?.reason || '-'}`,
      );
      return { accepted, ran: true, exhausted: secou, cursor, results };
    } catch (error) {
      this.logger?.warn?.(
        `[radar-cnpj] fonte receita falhou sem derrubar o batch run=${runId}: ${String((error as any)?.message || error)}`,
      );
      // Fail-open: erro da Receita marca seca NO RETORNO (não no metricsJson) só pra a web
      // rodar agora. O estado durável fica intacto — o lote seguinte tenta a drenagem de novo.
      return { accepted: 0, ran: true, exhausted: true, cursor: null, results: [] };
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
        // Web e social pertencem ao mesmo pós-save: prioridade diferente fazia social
        // ficar indefinidamente atrás de novos jobs web em períodos de fila contínua.
        priority: 10,
      });
      if (!result.missionId) throw new Error('RadarMission indisponível para o job pós-save.');
      await this.getRadarRunRepository().markEnrichmentJobState(context, leadId, {
        type: mode === 'web' ? 'radar_web_enrichment' : 'social_lookup',
        status: 'queued',
        traceId: result.missionId,
      });
    };

    let durableQueued = 0;
    // Cria toda a fase web antes da social: o social pode usar site/domínio recém-descoberto.
    // A justiça global fica no FIFO da fila, sem quebrar essa dependência entre as fases.
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
    const queue = this.getMissionQueue();
    if (!queue.enabled()) return;
    const concurrency = Math.max(
      1,
      Math.min(6, parsePositiveIntegerEnv('HBX_RADAR_POST_SAVE_ENRICHMENT_CONCURRENCY', 4)),
    );
    const state = (this as any).radarPostSaveEnrichmentDrainState || {
      generation: 0,
      workers: new Set<Promise<void>>(),
    };
    (this as any).radarPostSaveEnrichmentDrainState = state;
    state.generation += 1;

    const runMission = async (mission: any) => {
      const initialHeartbeat = await queue.heartbeat(mission.id, mission.leaseId);
      if (!initialHeartbeat.ok) return;

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatInFlight: Promise<void> = Promise.resolve();
      let leaseLost = false;
      try {
        const heartbeatMs = Math.max(5, Math.trunc(Number(mission.heartbeatSeconds) || 40)) * 1000;
        heartbeatTimer = setInterval(() => {
          heartbeatInFlight = heartbeatInFlight
            .then(() => queue.heartbeat(mission.id, mission.leaseId))
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
          return;
        }
        if (mode === 'web') {
          await this.runRadarWebEnrichmentForSavedLead(missionContext, leadId, missionInput);
        } else if (mode === 'social') {
          await this.runRadarSocialLookupForSavedLead(missionContext, leadId, missionInput);
        } else {
          await queue.fail(mission.id, mission.leaseId, 'modo_pos_save_invalido', false);
          return;
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
    };

    const runSlot = async (slot: number) => {
      let consecutiveEmptyLeases = 0;
      while (true) {
        const leaseGeneration = state.generation;
        const leased = await queue.lease({
          workerId: `hbx-backend-post-save:${process.pid}:${slot}`,
          stages: ['enrich_search_item'],
          batchSize: 1,
        });
        if (!leased.supported) return;
        if (!leased.missions.length) {
          // Com lease unitário, slots concorrentes podem ler os mesmos três candidatos e um deles
          // perder todos os claims. Confirma o vazio uma vez antes de encerrar, sem hot loop.
          if (leaseGeneration < state.generation) consecutiveEmptyLeases = 0;
          else consecutiveEmptyLeases += 1;
          if (consecutiveEmptyLeases < 2) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            continue;
          }
          return;
        }
        consecutiveEmptyLeases = 0;
        await runMission(leased.missions[0]);
        // O próprio slot repõe sua capacidade assim que termina; nenhum job aguarda os demais.
      }
    };

    const started: Promise<void>[] = [];
    while (state.workers.size < concurrency) {
      const slot = state.workers.size + 1;
      let worker: Promise<void>;
      worker = runSlot(slot)
        .catch((error) => {
          this.logger?.warn?.(`[radar-post-save] worker ${slot} falhou: ${String((error as any)?.message || error)}`);
        })
        .finally(() => {
          state.workers.delete(worker);
          if (!state.workers.size && (this as any).radarPostSaveEnrichmentDrainState === state) {
            delete (this as any).radarPostSaveEnrichmentDrainState;
          }
        });
      state.workers.add(worker);
      started.push(worker);
    }
    await Promise.allSettled(started);
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
            // LOTE 2 item 5: desfecho parcial fala a verdade das duas lanes (ver
            // buildInsufficientMessageWithLanes). É fechamento de run, não caminho quente.
            : await this.buildInsufficientMessageWithLanes(runId, normalized, safeInteger(current.foundCount), attempt);
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
        // FAXINA 17/08 (Lote 6): saiu daqui o `restSearchRunIfEligible('max_attempts_before_batch')`.
        // O Radar manual não dorme e acorda entregando card velho — `shouldRestSearchRun` já
        // devolvia `false` sempre, então este bloco só custava uma chamada e um `if` que nunca
        // disparava. O run vai direto ao desfecho (completed_insufficient_results/failed).
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
              // LOTE 2 item 5: mesmo desfecho parcial do bloco acima, ramo do `liveRun`.
              : await this.buildInsufficientMessageWithLanes(runId, normalized, safeInteger(liveRun.foundCount), attempt),
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
      ).catch(() => (
        // Fallback do erro com `exhausted: true` de propósito: erro da Receita LIBERA a web (o
        // degrade gracioso do cutover). Sem esse campo, `cnpjOutcome.exhausted` sairia
        // `undefined` no caminho de erro e a lane web ficaria esperando uma drenagem que não vem.
        { accepted: 0, ran: false, exhausted: true, cursor: null, results: [] }
      ));

      // LOTE 2 item 4 (17/08 — a encomenda literal do dono: "a pesquisa tem q vir depois q a RFB
      // entregou tudo"): enquanto a Receita ainda tem página pra virar E entregou gente NESTE
      // lote, o motor web não roda. O attempt fecha com o que a Receita deu, persiste, conta e
      // volta pro próximo lote continuando do cursor gravado no metricsJson.
      // As duas condições são obrigatórias:
      //   - `exhausted === false` estrito: flag-off, erro e "base secou" chegam como `true`, e
      //     `undefined` (caller antigo) nunca prende a web;
      //   - `results.length > 0`: lote em que a Receita não trouxe ninguém SEMPRE chama a web,
      //     senão o run morreria de fome sem ter tentado a única lane que restou.
      const pularWeb = cnpjOutcome.exhausted === false && cnpjOutcome.results.length > 0;
      const sendExplicitQuery = !this.hasIntentSensitiveDiscovery(batchInput) || this.isSocialDiscoveryQuery(queryUsed);
      let batchResponse;
      try {
        // O try/catch continua envolvendo tudo (é ele que guarda o retry/attempt e o resgate da
        // Receita quando o motor cai): pular a web é não fazer a chamada, não desviar do fluxo.
        batchResponse = pularWeb ? respostaVaziaDoMotorPulado() : await this.searchHbxEngine(
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
        // Medidor honesto (LOTE 2): no lote sem web, carimbar `sourceEngine:'hbx'` daria ao motor
        // o crédito do que a Receita entregou. engineId/engineIndex também ficam de fora — o
        // motor está com lease, mas não trabalhou neste lote.
        ...(pularWeb ? { sourceEngine: 'cnpj_public' } : {
          engineId: lease?.engineId || current.assignedEngineId || null,
          engineIndex: lease?.engineIndex ?? current.assignedEngineIndex ?? null,
          sourceEngine: 'hbx',
        }),
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
      // `!pularWeb`: marcar "sucesso de batch" num motor que não rodou polui a saúde do pool (é
      // por essa métrica que o rodízio escolhe motor). O lease segue liberado no finally.
      if (lease && !pularWeb) {
        await this.getEnginePool().markEngineBatchSuccess(lease.engineId).catch(() => null);
      }

      const counters = await this.recalculateSearchRunCounters(runId);
      // LOTE 4 (17/08): ÚLTIMA escrita de métrica do lote, de propósito. `updateMetrics` é
      // read-modify-write SEM CAS (radar-run-repository:497-529) e neste mesmo lote já correram a
      // do motor e a do save — quem grava por último não perde a chave. O valor é ABSOLUTO
      // (recontado do banco), então até uma escrita perdida se conserta sozinha no lote seguinte.
      if (counters?.laneBreakdown) {
        await this.updateSearchRunMetrics(runId, { laneBreakdown: counters.laneBreakdown }).catch(() => null);
      }
      const approvedCount = savedCounts.found;
      const rejectedCount = batchResponse.rejectedCount + savedCounts.invalid + savedCounts.skipped;
      const duplicateCount = batchResponse.duplicateCount + savedCounts.duplicate;

      // Log da cadeia executada NA ORDEM (aceite do P1): mostra exatamente os motores e a
      // ordem real desta tentativa — RFB (se rodou) sempre antes do web.
      // LOTE 2: nasceu a ordem `rfb` (SÓ Receita — web pulada porque a base ainda não secou) e os
      // campos da drenagem. Sem eles não dá pra medir na VPS se a cidade está drenando ou parada.
      const ordemDaCadeia = pularWeb ? 'rfb' : (cnpjOutcome.ran ? 'rfb->web' : 'web');
      this.logger?.log?.(
        `[radar-cadeia] run ${runId} attempt ${attempt}: ordem=${ordemDaCadeia} `
        + `rfb_candidates=${cnpjOutcome.accepted} rfb_exhausted=${cnpjOutcome.exhausted} `
        + `rfb_cursor=${cnpjOutcome.cursor?.cnpj || '-'} fase=${cnpjOutcome.cursor?.phase || '-'} `
        + `fused=${canonicalBatch.matchedCount} `
        + `ambiguous=${canonicalBatch.ambiguousCount} web_unmatched=${canonicalBatch.unmatchedWebCount} accepted=${approvedCount} `
        // LOTE 4: as lanes ACUMULADAS do run (card salvo, não candidato). `lane_outros` só
        // existe aqui e no metricsJson — fica fora da copy da tela, mas sem ele o log mentiria
        // quando `lane_rfb + lane_web < found` (radar_database, company_history, source nulo).
        + `lane_rfb=${counters?.laneBreakdown?.rfb ?? '-'} lane_web=${counters?.laneBreakdown?.web ?? '-'} `
        + `lane_outros=${counters?.laneBreakdown?.outros ?? '-'}`,
      );

      if (approvedCount > 0) {
        if (await autoImportAndStopIfPaused('incremental')) return;
      }
      // LOTE 2: lote em que a web foi PULADA não é lote vazio DA WEB. O freio de
      // HBX_SEARCH_RUN_MAX_EMPTY_BATCHES existe pra matar cidade onde o motor não acha nada —
      // aqui o motor nem foi chamado. Se a Receita entregou mas tudo virou duplicata
      // (approved=0), o contador fica PARADO no que a web já tinha: nem sobe (mataria a cidade
      // por um lote que não aconteceu) nem zera (apagaria lote web vazio de verdade).
      const consecutiveEmptyBatchCount = approvedCount > 0
        ? 0
        : pularWeb
          ? safeInteger(current.consecutiveEmptyBatchCount)
          : safeInteger(current.consecutiveEmptyBatchCount) + 1;
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
        // FAXINA 17/08 (Lote 6): saiu daqui o `restSearchRunIfEligible` dos motivos
        // stalled_partial_target/max_empty_batches/max_attempts — código morto pelo mesmo
        // motivo (o `shouldRestSearchRun` retornava `false` sempre). O desfecho do run não
        // muda: era `if (rested) return;` que nunca retornava.
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
        laneBreakdown: null,
      }));
      // LOTE 4 (17/08): motor caído NÃO pode zerar o relatório. Este é o caminho do resgate da
      // Receita (linha ~1526: o lote da RFB é salvo mesmo quando o engine cai) — sem esta
      // gravação a cidade fechava com card na tela e "Receita —" no relatório por cidade.
      if (counters?.laneBreakdown) {
        await this.updateSearchRunMetrics(runId, { laneBreakdown: counters.laneBreakdown }).catch(() => null);
      }
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
      // FAXINA 17/08 (Lote 6): saiu daqui o `restSearchRunIfEligible` do caminho de erro do
      // motor (error_max_attempts/error_max_failed_batches/engine_error). Mesmo código morto:
      // nunca dormia. Erro de motor continua fechando o run com a mensagem de sempre.
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
