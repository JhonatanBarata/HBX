import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { RadarCnpjL4EnrichmentService } from './radar/03-enrichment/radar-cnpj-l4-enrichment.service';
import { RadarPublicDataService } from './radar/03-enrichment/radar-public-data.service';
import { RadarWebEnrichmentService } from './radar/03-enrichment/radar-web-enrichment.service';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { HbxPresentationEmailService } from '../mail/hbx-presentation-email.service';
import { MasterContextService } from '../master-context/master-context.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarSearchGeoService } from './radar/01-search/radar-search-geo.service';
import { RadarSearchInputService } from './radar/01-search/radar-search-input.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarSourceExecutorService } from './radar/01-search/radar-source-executor.service';
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarWebsiteCrawlSourceService } from './radar/01-search/radar-website-crawl-source.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { RadarWebEnrichmentJobService } from './radar/03-enrichment/radar-web-enrichment-job.service';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { RadarGoogleResponseService } from './radar/providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './radar/providers/hbx-engine/radar-hbx-engine-errors.service';
import { normalizeLookupValue, normalizePhoneDigits } from './radar/shared/radar-core-shared';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { RadarWebscrapingCoreService } from './radar/radar-webscraping-core.service';

export * from './radar/radar-webscraping-core.service';

@Injectable()
export class WebscrapingService extends RadarWebscrapingCoreService {
  constructor(
    private readonly internalPrisma: PrismaService,
    @Optional() hbxEnginePool?: HbxEnginePoolService,
    @Optional() webwhatsBridge?: WebwhatsBridgeService,
    @Optional() @Inject(forwardRef(() => VendasService))
    vendasService?: VendasService,
    @Optional() hbxPresentationEmails?: HbxPresentationEmailService,
    @Optional() commercialUsageLimits?: CommercialUsageLimitsService,
    @Optional() masterContextService?: MasterContextService,
    @Optional() radarRunRepository?: RadarRunRepositoryService,
    @Optional() radarSocialLookup?: RadarSocialLookupService,
    @Optional() radarLeadPresenter?: RadarLeadPresenterService,
    @Optional() radarRunPresenter?: RadarRunPresenterService,
    @Optional() radarPostDeliveryUpdate?: RadarPostDeliveryUpdateService,
    @Optional() radarPostDeliveryVendasUpdate?: RadarPostDeliveryVendasUpdateService,
    @Optional() radarDeliveryOrchestrator?: RadarDeliveryOrchestratorService,
    @Optional() radarVendasSync?: RadarVendasSyncService,
    @Optional() radarSharedNormalizer?: RadarSharedNormalizerService,
    @Optional() radarSearchGeo?: RadarSearchGeoService,
    @Optional() radarSearchInput?: RadarSearchInputService,
    @Optional() radarSearchStrategy?: RadarSearchStrategyService,
    @Optional() radarSourcePlanner?: RadarSourcePlannerService,
    @Optional() radarSourceExpansion?: RadarSourceExpansionService,
    @Optional() radarResultMerger?: RadarResultMergerService,
    @Optional() radarSearchOrchestrator?: RadarSearchOrchestratorService,
    @Optional() radarSearchRunConfig?: RadarSearchRunConfigService,
    @Optional() radarInternalReprocessSource?: RadarInternalReprocessSourceService,
    @Optional() radarSourceExecutor?: RadarSourceExecutorService,
    @Optional() radarCnpjPublicSource?: RadarCnpjPublicSourceService,
    @Optional() radarLocalDirectorySource?: RadarLocalDirectorySourceService,
    @Optional() radarVerticalSource?: RadarVerticalSourceService,
    @Optional() radarWebsiteCrawlSource?: RadarWebsiteCrawlSourceService,
    @Optional() radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() radarQualityGate?: RadarQualityGateService,
    @Optional() radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() radarScoreEnrichment?: RadarScoreEnrichmentService,
    @Optional() radarWebEnrichmentJob?: RadarWebEnrichmentJobService,
    @Optional() googleSearchProvider?: GoogleSearchProviderService,
    @Optional() radarGoogleResponse?: RadarGoogleResponseService,
    @Optional() radarHbxEngineErrors?: RadarHbxEngineErrorsService,
  ) {
    super(
      internalPrisma,
      hbxEnginePool,
      webwhatsBridge,
      vendasService,
      hbxPresentationEmails,
      commercialUsageLimits,
      masterContextService,
      radarRunRepository,
      radarSocialLookup,
      radarLeadPresenter,
      radarRunPresenter,
      radarPostDeliveryUpdate,
      radarPostDeliveryVendasUpdate,
      radarDeliveryOrchestrator,
      radarVendasSync,
      radarSharedNormalizer,
      radarSearchGeo,
      radarSearchInput,
      radarSearchStrategy,
      radarSourcePlanner,
      radarSourceExpansion,
      radarResultMerger,
      radarSearchOrchestrator,
      radarSearchRunConfig,
      radarInternalReprocessSource,
      radarSourceExecutor,
      radarCnpjPublicSource,
      radarLocalDirectorySource,
      radarVerticalSource,
      radarWebsiteCrawlSource,
      radarDuplicateFilter,
      radarQualityGate,
      radarRunItemFilter,
      radarScoreEnrichment,
      radarWebEnrichmentJob,
      googleSearchProvider,
      radarGoogleResponse,
      radarHbxEngineErrors,
    );
  }

  async webSearch(input: {
    query?: string | null;
    limit?: number | null;
    fresh?: boolean | null;
  }) {
    const query = String(input?.query || '').trim().replace(/\s+/g, ' ');
    if (!query) {
      throw new BadRequestException('query é obrigatória.');
    }

    const configuredMax = this.readNumberEnv('HBX_WEB_SEARCH_MAX_RESULTS', 10, 1, 10);
    const requestedLimit = Number(input?.limit || 5);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 5, configuredMax, 10));
    const timeoutMs = this.readNumberEnv('HBX_WEB_SEARCH_TIMEOUT_SECONDS', 30, 3, 90) * 1000;
    const engineUrl = this.resolveHbxEngineUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${engineUrl}/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit, fresh: Boolean(input?.fresh) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`engine web-search retornou ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`engine web-search indisponível: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async lookupRadarLeadPoolInternal(input: {
    name?: string | null;
    phone?: string | null;
    phoneDigits?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    sourceUrl?: string | null;
  }) {
    const name = String(input?.name || '').trim();
    const phoneDigits = normalizePhoneDigits(input?.phoneDigits || input?.phone || '');
    const normalizedCity = normalizeLookupValue(String(input?.city || ''));
    const state = String(input?.state || '').trim().toUpperCase();
    const normalizedSegment = normalizeLookupValue(String(input?.segment || ''));
    const sourceUrl = String(input?.sourceUrl || '').trim();
    const delegate = (this.internalPrisma as any).radarLeadPool;

    if (!delegate || (!phoneDigits && !name)) {
      return { found: false, result: null, candidates: [] };
    }

    const rowsById = new Map<string, any>();
    const phoneVariants = Array.from(new Set([
      phoneDigits,
      phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits ? `55${phoneDigits}` : '',
    ].filter(Boolean)));

    if (phoneVariants.length) {
      const phoneRows = await delegate.findMany({
        where: { OR: phoneVariants.map((digits) => ({ phoneDigits: digits })) },
        take: 10,
        orderBy: [{ updatedAt: 'desc' }],
      });
      phoneRows.forEach((row: any) => rowsById.set(row.id, row));
    }

    if (sourceUrl) {
      const sourceRows = await delegate.findMany({
        where: { sourceUrl },
        take: 10,
        orderBy: [{ updatedAt: 'desc' }],
      });
      sourceRows.forEach((row: any) => rowsById.set(row.id, row));
    }

    if (normalizedCity) {
      const cityWhere: any = { normalizedCity };
      if (state) cityWhere.state = state;
      if (normalizedSegment) cityWhere.normalizedSegment = normalizedSegment;
      const cityRows = await delegate.findMany({
        where: cityWhere,
        take: 80,
        orderBy: [
          { socialConfidence: 'desc' },
          { enrichmentConfidence: 'desc' },
          { updatedAt: 'desc' },
        ],
      });
      cityRows.forEach((row: any) => rowsById.set(row.id, row));
    }

    const scored = Array.from(rowsById.values())
      .map((row) => this.scoreRadarLeadPoolLookup(row, {
        name,
        phoneDigits,
        normalizedCity,
        state,
        normalizedSegment,
        sourceUrl,
      }))
      .filter((candidate) => candidate.score >= 35)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < 60) {
      return {
        found: false,
        result: null,
        candidates: scored.slice(0, 5).map((candidate) => this.serializeRadarLeadPoolLookup(candidate.row, candidate.score, candidate.reason)),
      };
    }

    return {
      found: true,
      result: this.serializeRadarLeadPoolLookup(best.row, best.score, best.reason),
      candidates: scored.slice(1, 5).map((candidate) => this.serializeRadarLeadPoolLookup(candidate.row, candidate.score, candidate.reason)),
    };
  }

  private scoreRadarLeadPoolLookup(row: any, input: {
    name: string;
    phoneDigits: string;
    normalizedCity: string;
    state: string;
    normalizedSegment: string;
    sourceUrl: string;
  }) {
    const rowPhone = normalizePhoneDigits(row?.phoneDigits || row?.phone || '');
    const rowName = normalizeLookupValue(String(row?.name || ''));
    const rowCity = normalizeLookupValue(String(row?.city || row?.normalizedCity || ''));
    const rowSegment = normalizeLookupValue(String(row?.segment || row?.normalizedSegment || ''));
    const inputName = normalizeLookupValue(input.name);
    const inputTokens = inputName
      .split(' ')
      .filter((token) => token.length >= 3 && !['restaurante', 'pizzaria', 'lanchonete', 'delivery', 'bar', 'cafe'].includes(token));
    const nameHits = inputTokens.filter((token) => rowName.includes(token)).length;
    let score = 0;
    let hasPhoneMatch = false;
    let hasIdentityMatch = false;
    const reason: string[] = [];

    if (input.phoneDigits && rowPhone && rowPhone === input.phoneDigits) {
      score += 70;
      hasPhoneMatch = true;
      reason.push('telefone exato no radarLeadPool');
    } else if (input.phoneDigits && rowPhone && rowPhone.endsWith(input.phoneDigits.slice(-8))) {
      score += 45;
      hasPhoneMatch = true;
      reason.push('telefone parcial no radarLeadPool');
    }

    if (inputName && rowName === inputName) {
      score += 35;
      hasIdentityMatch = true;
      reason.push('nome exato');
    } else if (inputName && inputName.length >= 4 && (rowName.includes(inputName) || inputName.includes(rowName))) {
      score += 25;
      hasIdentityMatch = true;
      reason.push('nome compatível');
    } else if (nameHits > 0) {
      score += Math.min(24, nameHits * 12);
      hasIdentityMatch = true;
      reason.push('tokens do nome compatíveis');
    }

    if (input.normalizedCity && rowCity === input.normalizedCity) {
      score += 20;
      reason.push('cidade compatível');
    }
    if (input.state && String(row?.state || '').trim().toUpperCase() === input.state) {
      score += 8;
    }
    if (input.normalizedSegment && rowSegment === input.normalizedSegment) {
      score += 8;
    }
    if (input.sourceUrl && row?.sourceUrl === input.sourceUrl) {
      score += 12;
      hasIdentityMatch = true;
      reason.push('fonte original compatível');
    }
    if (row?.instagramUrl || row?.facebookUrl || row?.website || row?.email) {
      score += 8;
    }

    if (!hasPhoneMatch && !hasIdentityMatch) {
      return { row, score: 0, reason: 'sem identidade suficiente no radarLeadPool' };
    }

    return { row, score: Math.min(100, score), reason: reason.join('; ') || 'registro próximo no radarLeadPool' };
  }

  private serializeRadarLeadPoolLookup(row: any, score: number, reason: string) {
    const evidenceJson = this.parseInternalJsonObject(row?.evidenceJson);
    const enrichmentJson = this.parseInternalJsonObject(row?.enrichmentJson);
    const possibleSocialCandidates = this.extractInternalCandidates(enrichmentJson, evidenceJson);
    return {
      id: row?.id,
      name: row?.name || '',
      phone: row?.phone || '',
      phoneDigits: row?.phoneDigits || normalizePhoneDigits(row?.phone || ''),
      city: row?.city || '',
      state: row?.state || '',
      segment: row?.segment || '',
      website: row?.website || null,
      email: row?.email || null,
      emailStatus: row?.emailStatus || 'missing',
      emailSource: row?.emailSource || 'none',
      emailConfidence: Number(row?.emailConfidence || 0) || 0,
      instagramUrl: row?.instagramUrl || null,
      facebookUrl: row?.facebookUrl || null,
      linkedinUrl: enrichmentJson.linkedinUrl || evidenceJson.linkedinUrl || null,
      googleMapsUrl: row?.googleMapsUrl || null,
      sourceUrl: row?.sourceUrl || null,
      sourceEngine: row?.sourceEngine || 'hbx_database',
      socialStatus: row?.socialStatus || (row?.instagramUrl || row?.facebookUrl ? 'found' : 'missing'),
      socialConfidence: row?.instagramUrl || row?.facebookUrl
        ? Math.max(Number(row?.socialConfidence || 0) || 0, score)
        : Number(row?.socialConfidence || 0) || 0,
      possibleSocialCandidates,
      nearbyResults: possibleSocialCandidates,
      evidenceJson: {
        ...evidenceJson,
        provider: 'HbxDatabaseProvider',
        matchReason: reason,
        lookupScore: score,
      },
    };
  }

  private parseInternalJsonObject(value: unknown) {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, any>;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private extractInternalCandidates(...objects: Array<Record<string, any>>) {
    const candidates: any[] = [];
    for (const object of objects) {
      for (const key of ['possibleSocialCandidates', 'nearbyResults', 'socialCandidates']) {
        const value = object?.[key];
        if (Array.isArray(value)) {
          value.filter((item) => item && typeof item === 'object').forEach((item) => candidates.push(item));
        }
      }
    }
    return candidates.slice(0, 10);
  }

  private resolveHbxEngineUrl() {
    const configured = String(process.env.HBX_SCRAPING_ENGINE_URL || 'http://hbx-scraping-engine:8001').trim();
    const first = configured.split(',')[0]?.trim() || 'http://hbx-scraping-engine:8001';
    return first.replace(/\/+$/, '');
  }

  private readNumberEnv(name: string, fallback: number, min: number, max: number) {
    const parsed = Number(process.env[name]);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Full free-chain backfill para o master:
   *   (a) web-enrichment discovery (site/social/email + CNPJ-by-name via Brave) para leads sem site e sem CNPJ
   *   (b) L4 `enrichRow` (CNPJ → razão/CNAE/sócio/situação via dataset local + BrasilAPI)
   *   (c) L1 `enrichSignals` (DDD/região/sinais via metadataJson atualizado)
   * NÃO inclui L5/whatsapp-check (risco de ban).
   * Parâmetros: limit (default 200). Devolve { scanned, enriched, errors, sitesFound, cnpjsFound }.
   */
  async cnpjBackfillForMaster(opts: { limit?: number; socials?: boolean } = {}): Promise<{ scanned: number; enriched: number; errors: number; sitesFound: number; cnpjsFound: number; phonesFound: number; socialsFound: number }> {
    const limit = Math.max(1, Math.min(Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 200, 2000));
    // Worker 1 "CNPJ → dono": por padrão também caça as redes sociais DO DONO.
    // Cap por execução pra não martelar o buscador (cada lookup faz buscas web sequenciais).
    const withSocials = opts.socials !== false;
    let socialBudget = withSocials ? 80 : 0;
    const prisma = this.internalPrisma as any;

    // Passo 1 — busca leads pendentes:
    //   (A) leads com CNPJ mas sem razaoSocial/ownerName completo (candidatos L4)
    //   (B) leads sem site (website nulo/vazio) e sem CNPJ no metadataJson (candidatos L3→L4)
    // Pega um lote maior e filtra em memória (campos JSON não são filtráveis no DB de forma segura).
    const candidates = await prisma.radarLeadPool.findMany({
      select: { id: true, name: true, city: true, state: true, segment: true, website: true, metadataJson: true, evidenceJson: true, signalsJson: true },
      orderBy: { createdAt: 'desc' },
      take: limit * 6,
    });

    const parseMeta = (row: any): Record<string, any> => {
      try {
        const v = row.metadataJson;
        if (!v) return {};
        return typeof v === 'object' ? v : JSON.parse(v);
      } catch { return {}; }
    };

    const pending = candidates.filter((row: any) => {
      const meta = parseMeta(row);
      const cnpjDigits = String(meta?.cnpj || row?.cnpj || '').replace(/\D/g, '');
      const alreadyComplete = Boolean(meta?.ownerName) && Boolean(meta?.razaoSocial);
      const hasSite = Boolean(String(row?.website || '').trim());
      // Include: has CNPJ not yet fully enriched, OR has no site (needs L3 discovery)
      return (!alreadyComplete && cnpjDigits.length >= 14) || (!hasSite);
    }).slice(0, limit);

    const l4Enricher = new RadarCnpjL4EnrichmentService();
    const l1Enricher = new RadarPublicDataService();
    const webEnrichService = new RadarWebEnrichmentService();

    let enriched = 0;
    let errors = 0;
    let sitesFound = 0;
    let cnpjsFound = 0;
    let phonesFound = 0;
    let socialsFound = 0;

    for (const row of pending) {
      try {
        const metaBefore = parseMeta(row);
        const hasSiteBefore = Boolean(String(row?.website || '').trim());
        const hasCnpjBefore = String(metaBefore?.cnpj || row?.cnpj || '').replace(/\D/g, '').length >= 14;

        // (a) Web-enrichment discovery for leads without a site (L3 → finds site + CNPJ)
        if (!hasSiteBefore && process.env.BRAVE_SEARCH_API_KEY) {
          const cityRaw = String(row.city || '').trim();
          const stateRaw = String(row.state || '').trim();
          const segmentRaw = String(row.segment || '').trim();

          // Build a minimal lead object compatible with RadarWebEnrichmentService helpers
          const syntheticLead: any = {
            name: row.name,
            phone: '',
            phoneDigits: '',
            website: row.website || null,
            instagramUrl: null,
            facebookUrl: null,
            city: cityRaw,
            state: stateRaw,
            segment: segmentRaw,
            metadataJson: metaBefore,
            cnpj: metaBefore?.cnpj || row?.cnpj || null,
          };

          const webResult = await webEnrichService.run({
            normalized: {
              city: cityRaw,
              state: stateRaw,
              segment: segmentRaw,
              targetType: 'pj',
              quantity: 1,
              preferredChannels: [],
              requiredChannels: [],
              channelMatchMode: 'prefer',
            } as any,
            currentResults: [syntheticLead],
            host: { fetcher: globalThis.fetch },
            maxCards: 1,
          }).catch(() => null);

          const enrichedResult = webResult?.results?.[0];
          if (enrichedResult) {
            const newWebsite = String((enrichedResult as any).website || '').trim();
            const newCnpj = String(
              (enrichedResult as any).cnpj
              || (typeof (enrichedResult as any).metadataJson === 'object'
                ? (enrichedResult as any).metadataJson?.cnpj
                : null)
              || '',
            ).replace(/\D/g, '');
            const newEmail = String((enrichedResult as any).email || '').trim();
            const newIg = String((enrichedResult as any).instagramUrl || '').trim();
            const newFb = String((enrichedResult as any).facebookUrl || '').trim();

            const hasSiteNow = Boolean(newWebsite) && !['instagram.com', 'facebook.com', 'fb.com'].some((d) => newWebsite.includes(d));
            if (hasSiteNow) sitesFound += 1;
            if (newCnpj.length >= 14 && !hasCnpjBefore) cnpjsFound += 1;

            // Persist delta into metadataJson (additive, no migration)
            if (hasSiteNow || newCnpj || newEmail || newIg || newFb) {
              const currentMeta = parseMeta(row);
              const patchedMeta = {
                ...currentMeta,
                ...(newCnpj && !currentMeta.cnpj ? { cnpj: newCnpj } : {}),
                ...(newEmail && !currentMeta.email ? { discoveredEmail: newEmail } : {}),
              };
              const updateData: Record<string, any> = {
                metadataJson: JSON.stringify(patchedMeta),
                ...(hasSiteNow && !row.website ? { website: newWebsite } : {}),
                ...(newEmail && !row.email ? { email: newEmail } : {}),
                ...(newIg && !row.instagramUrl ? { instagramUrl: newIg } : {}),
                ...(newFb && !row.facebookUrl ? { facebookUrl: newFb } : {}),
              };
              await prisma.radarLeadPool.update({
                where: { id: row.id },
                data: updateData,
              }).catch(() => null);

              // Re-read metadataJson for subsequent steps
              row.metadataJson = patchedMeta;
              if (hasSiteNow) row.website = newWebsite;
              if (newCnpj) row.cnpj = row.cnpj || newCnpj;
              enriched += 1;
            }
          }
        }

        // (b) L4 enrichment: CNPJ → razão/CNAE/sócio/situação/telefone do dono
        const hadPhoneBefore = Boolean(metaBefore?.ownerPhone);
        const l4Result = await l4Enricher.enrichRow(prisma, row);
        if (l4Result !== null) {
          enriched += 1;
          const metaAfterL4 = parseMeta({ metadataJson: l4Result });
          const newCnpjFromL4 = String(metaAfterL4?.cnpj || '').replace(/\D/g, '');
          if (newCnpjFromL4.length >= 14 && !hasCnpjBefore) cnpjsFound += 1;
          if (metaAfterL4?.ownerPhone && !hadPhoneBefore) phonesFound += 1;
          // Update in-memory metadataJson so L1 sees the fresh data
          row.metadataJson = l4Result;
        }

        // (b2) Sociais DO DONO: com o nome do sócio em mãos, caça o perfil pessoal dele.
        // Best-effort, gasta orçamento por execução; não bloqueia a cadeia se falhar.
        const metaForSocial = parseMeta(row);
        const ownerForSocial = String(metaForSocial?.ownerName || (Array.isArray(metaForSocial?.ownerNames) ? metaForSocial.ownerNames[0] : '') || '').trim();
        const alreadyHasOwnerSocial = Boolean(metaForSocial?.ownerInstagram || metaForSocial?.ownerFacebook);
        if (socialBudget > 0 && ownerForSocial.length >= 4 && !alreadyHasOwnerSocial) {
          socialBudget -= 1;
          const social = await webEnrichService.findOwnerSocials(globalThis.fetch, ownerForSocial, {
            city: String(row.city || '').trim() || null,
            state: String(row.state || '').trim() || null,
            segment: String(row.segment || '').trim() || null,
            companyName: String(metaForSocial?.razaoSocial || row.name || '').trim() || null,
          }).catch(() => null);
          if (social && (social.instagramUrl || social.facebookUrl)) {
            const patchedMeta = {
              ...metaForSocial,
              ...(social.instagramUrl ? { ownerInstagram: social.instagramUrl } : {}),
              ...(social.facebookUrl ? { ownerFacebook: social.facebookUrl } : {}),
              ...(social.candidates.length ? { ownerSocialCandidates: social.candidates } : {}),
            };
            await prisma.radarLeadPool.update({
              where: { id: row.id },
              data: { metadataJson: JSON.stringify(patchedMeta) },
            }).catch(() => null);
            row.metadataJson = patchedMeta;
            socialsFound += 1;
          }
        }

        // (c) L1 signals: DDD/região/sinais derivados do metadataJson atualizado
        await l1Enricher.enrichSignals(prisma, row).catch(() => null);
      } catch {
        errors += 1;
      }
    }

    return { scanned: pending.length, enriched, errors, sitesFound, cnpjsFound, phonesFound, socialsFound };
  }

  /**
   * Worker 2 "Email finder" — aplica nos cards EXISTENTES o que o Local Lab achou (e-mail/CNPJ/
   * redes), casando por `id`. ADITIVO: só preenche campo vazio, nunca sobrescreve dado já bom.
   * E-mail → coluna email; CNPJ/razão → metadataJson; instagram/facebook → colunas próprias.
   */
  async applyDiscoveredContactsForMaster(
    items: Array<{ id?: string; email?: string; emails?: string[]; phones?: string[]; cnpj?: string; instagramUrl?: string; facebookUrl?: string }> = [],
  ): Promise<{ requested: number; updated: number; emails: number; cnpjs: number; socials: number; errors: number }> {
    const prisma = this.internalPrisma as any;
    const list = Array.isArray(items) ? items.slice(0, 5000) : [];
    let updated = 0;
    let emails = 0;
    let cnpjs = 0;
    let socials = 0;
    let errors = 0;

    const parseMeta = (row: any): Record<string, any> => {
      try {
        const v = row?.metadataJson;
        if (!v) return {};
        return typeof v === 'object' ? v : JSON.parse(v);
      } catch { return {}; }
    };
    const cleanEmail = (v: unknown) => {
      const m = String(v || '').trim().toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      return m ? m[0] : '';
    };
    const cleanPhone = (v: unknown) => {
      const d = String(v || '').replace(/\D/g, '');
      return d.length === 10 || d.length === 11 ? d : '';
    };
    const mergeCapped = (existing: unknown, incoming: string[], cap = 3) => {
      const out: string[] = Array.isArray(existing) ? existing.filter(Boolean).map(String) : [];
      for (const v of incoming) { if (v && !out.includes(v) && out.length < cap) out.push(v); }
      return out;
    };

    for (const item of list) {
      const id = String(item?.id || '').trim();
      if (!id) { errors += 1; continue; }
      try {
        const row = await prisma.radarLeadPool.findUnique({
          where: { id },
          select: { id: true, email: true, phone: true, instagramUrl: true, facebookUrl: true, metadataJson: true },
        });
        if (!row) { errors += 1; continue; }
        const meta = parseMeta(row);
        const data: Record<string, any> = {};
        let metaChanged = false;

        // E-mails 1/2/3 — aceita item.email (1) e/ou item.emails[] (vários do crawl).
        const incomingEmails = [item?.email, ...(Array.isArray(item?.emails) ? item!.emails! : [])]
          .map(cleanEmail).filter(Boolean);
        if (incomingEmails.length) {
          const before = Array.isArray(meta.emails) ? meta.emails.length : 0;
          meta.emails = mergeCapped(meta.emails, incomingEmails);
          if (meta.emails.length !== before) metaChanged = true;
          if (!String(row.email || '').trim() && meta.emails[0]) {
            data.email = meta.emails[0];
            data.emailStatus = 'found_on_site';
          }
          if (!meta.discoveredEmail && meta.emails[0]) { meta.discoveredEmail = meta.emails[0]; metaChanged = true; }
          emails += 1;
        }

        // Telefones 1/2/3 — do crawl (item.phones[]); guarda extras no metadataJson.
        const incomingPhones = (Array.isArray(item?.phones) ? item!.phones! : []).map(cleanPhone).filter(Boolean);
        if (incomingPhones.length) {
          const before = Array.isArray(meta.phones) ? meta.phones.length : 0;
          meta.phones = mergeCapped(meta.phones, incomingPhones);
          if (meta.phones.length !== before) metaChanged = true;
          if (!String(row.phone || '').trim() && meta.phones[0]) data.phone = meta.phones[0];
        }

        const cnpj = String(item?.cnpj || '').replace(/\D/g, '');
        if (cnpj.length === 14 && !String(meta.cnpj || '').replace(/\D/g, '')) {
          meta.cnpj = cnpj;
          metaChanged = true;
          cnpjs += 1;
        }

        const ig = String(item?.instagramUrl || '').trim();
        if (ig && !String(row.instagramUrl || '').trim()) { data.instagramUrl = ig; socials += 1; }
        const fb = String(item?.facebookUrl || '').trim();
        if (fb && !String(row.facebookUrl || '').trim()) { data.facebookUrl = fb; socials += 1; }

        if (metaChanged) data.metadataJson = JSON.stringify(meta);
        if (Object.keys(data).length) {
          await prisma.radarLeadPool.update({ where: { id }, data }).catch(() => { errors += 1; });
          updated += 1;
        }
      } catch {
        errors += 1;
      }
    }

    return { requested: list.length, updated, emails, cnpjs, socials, errors };
  }
}
