import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { LeadContactWriteService } from './radar/persistence/lead-contact-write.service';
import type { LeadContactCandidate } from './radar/persistence/lead-contact-gate';
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
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarWebSourceGateService } from './radar/02-filter/radar-web-source-gate.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
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
import { normalizeLookupValue, normalizePhoneDigits, buildWaLink } from './radar/shared/radar-core-shared';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { RadarWebscrapingCoreService } from './radar/radar-webscraping-core.service';

export * from './radar/radar-webscraping-core.service';

const RADAR_PAID_RUN_STATUSES = new Set([
  'ownership_claimed',
  'rfb_hydrating',
  'base_revealed',
  'motor_enriching',
  'vendas_creating',
  'completed',
  'partial',
]);

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
    @Optional() radarCnpjPublicSource?: RadarCnpjPublicSourceService,
    @Optional() radarLocalDirectorySource?: RadarLocalDirectorySourceService,
    @Optional() radarVerticalSource?: RadarVerticalSourceService,
    @Optional() radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() radarQualityGate?: RadarQualityGateService,
    @Optional() radarWebSourceGate?: RadarWebSourceGateService,
    @Optional() radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() radarScoreEnrichment?: RadarScoreEnrichmentService,
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
      radarCnpjPublicSource,
      radarLocalDirectorySource,
      radarVerticalSource,
      radarDuplicateFilter,
      radarQualityGate,
      radarWebSourceGate,
      radarRunItemFilter,
      radarScoreEnrichment,
      googleSearchProvider,
      radarGoogleResponse,
      radarHbxEngineErrors,
    );
  }

  // Caminho ÚNICO de escrita da tabela LeadContact (gate anti-alucinação embutido) —
  // extraído do antigo `upsertLeadContactsForRadarLead` (Sprint 5 MOTOR-RFB-FILA, 02/07).
  private _leadContactWrite: LeadContactWriteService | null = null;
  private getLeadContactWrite(): LeadContactWriteService {
    if (!this._leadContactWrite) this._leadContactWrite = new LeadContactWriteService();
    return this._leadContactWrite;
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
   * Worker 2 "Email finder" — aplica nos cards EXISTENTES o que o Local Lab achou (e-mail/CNPJ/
   * redes), casando por `id`. ADITIVO: só preenche campo vazio, nunca sobrescreve dado já bom.
   * E-mail → coluna email; CNPJ/razão → metadataJson; instagram/facebook → colunas próprias.
   */
  async applyDiscoveredContactsForMaster(
    items: Array<{ id?: string; email?: string; emails?: string[]; phones?: string[]; cnpj?: string; instagramUrl?: string; facebookUrl?: string }> = [],
  ): Promise<{ requested: number; eligible: number; rejectedUnowned: number; updated: number; emails: number; cnpjs: number; socials: number; errors: number }> {
    const prisma = this.internalPrisma as any;
    const list = Array.isArray(items) ? items.slice(0, 5000) : [];
    const requestedIds = Array.from(new Set(list.map((item) => String(item?.id || '').trim()).filter(Boolean)));
    const ownedRows = requestedIds.length && typeof prisma.radarLeadPool?.findMany === 'function'
      ? await prisma.radarLeadPool.findMany({
          where: { id: { in: requestedIds }, ownerCompanyId: { not: null } },
          select: { id: true, ownerCompanyId: true },
        }).catch(() => [])
      : [];
    const ownerCompanyIds = Array.from(new Set((ownedRows || [])
      .map((row: any) => Math.trunc(Number(row.ownerCompanyId || 0)))
      .filter((value: number) => value > 0)));
    const states = ownedRows.length && ownerCompanyIds.length
      ? await prisma.radarLeadCompanyState.findMany({
          where: {
            radarLeadId: { in: requestedIds },
            companyId: { in: ownerCompanyIds },
            paidClaimOperationId: { not: null },
            claimUsageKey: { not: null },
            acquiredAt: { not: null },
          },
          select: {
            radarLeadId: true,
            companyId: true,
            paidClaimOperationId: true,
            claimUsageKey: true,
            acquiredAt: true,
          },
        }).catch(() => [])
      : [];
    const stateByPair = new Map((states || []).map((state: any) => [
      `${Number(state.companyId)}:${String(state.radarLeadId)}`,
      state,
    ]));
    const proofCandidates = (ownedRows || []).flatMap((row: any) => {
      const companyId = Math.trunc(Number(row.ownerCompanyId || 0));
      const state = stateByPair.get(`${companyId}:${String(row.id)}`) as any;
      const usageKey = String(state?.claimUsageKey || '').trim();
      const operationId = String(state?.paidClaimOperationId || '').trim();
      return usageKey && operationId ? [{ id: String(row.id), companyId, usageKey, operationId }] : [];
    });
    const debitKeys = proofCandidates.map((item: any) => `enforce:lead_delivery:${item.usageKey}`);
    const ledger = debitKeys.length
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            companyId: { in: ownerCompanyIds },
            OR: [
              { kind: 'debit', usageKey: { in: debitKeys } },
              { kind: 'refund', usageKey: { in: debitKeys.map((key: string) => `refund:${key}`) } },
            ],
          },
          select: { companyId: true, kind: true, usageKey: true },
        }).catch(() => [])
      : [];
    const ledgerSet = new Set((ledger || []).map((entry: any) => (
      `${Number(entry.companyId)}:${String(entry.kind)}:${String(entry.usageKey)}`
    )));
    const paidRuns = proofCandidates.length
      ? await prisma.radarLeadProcessRun.findMany({
          where: {
            id: { in: proofCandidates.map((item: any) => item.operationId) },
            companyId: { in: ownerCompanyIds },
            mode: 'claim',
          },
          select: { id: true, radarLeadId: true, companyId: true, mode: true, status: true },
        }).catch(() => [])
      : [];
    const paidRunById = new Map((paidRuns || []).map((run: any) => [String(run.id), run]));
    const paidIds = new Set(proofCandidates.filter((candidate: any) => {
      const debitKey = `enforce:lead_delivery:${candidate.usageKey}`;
      const run = paidRunById.get(candidate.operationId) as any;
      return ledgerSet.has(`${candidate.companyId}:debit:${debitKey}`)
        && !ledgerSet.has(`${candidate.companyId}:refund:refund:${debitKey}`)
        && Number(run?.companyId) === candidate.companyId
        && String(run?.radarLeadId || '') === candidate.id
        && String(run?.mode || '') === 'claim'
        && RADAR_PAID_RUN_STATUSES.has(String(run?.status || '').toLowerCase());
    }).map((candidate: any) => candidate.id));
    // Filtra antes da verificação de WhatsApp: owner isolado não é autorização.
    // É obrigatória a tríade state carimbado + débito append-only + ausência de
    // refund/refund_pending.
    const eligibleList = list.filter((item) => paidIds.has(String(item?.id || '').trim()));
    const rejectedUnowned = Math.max(0, list.length - eligibleList.length);
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

    // Verificação WhatsApp em LOTE de TODOS os telefones capturados (1 request no motor dedicado,
    // sessão já conectada — NUNCA reconecta; degrada p/ vazio se o motor estiver fora). O resultado
    // (digits→tem WhatsApp?) é gravado por lead em metadataJson.phonesWhatsapp. Todo telefone
    // adquirido permanece visível; a confirmação controla apenas a ação de WhatsApp.
    const allIncomingPhones = Array.from(new Set(
      eligibleList.flatMap((it) => (Array.isArray(it?.phones) ? it!.phones! : []).map(cleanPhone).filter(Boolean)),
    ));
    const waMap: Record<string, boolean> = {};
    if (allIncomingPhones.length) {
      try {
        const checks = await this.radarCheckWhatsappNumbers(allIncomingPhones);
        for (const c of checks || []) {
          const p = String((c as any)?.normalizedNumber || (c as any)?.input || '').replace(/\D/g, '');
          if (p) waMap[p] = Boolean((c as any)?.exists);
        }
      } catch { /* motor fora do ar → sem verificação; nada é exibido como verificado */ }
    }

    for (const item of eligibleList) {
      const id = String(item?.id || '').trim();
      if (!id) { errors += 1; continue; }
      try {
        await prisma.$transaction(async (tx: any) => {
        const row = await tx.radarLeadPool.findUnique({
          where: { id },
          select: { id: true, ownerCompanyId: true, email: true, phone: true, instagramUrl: true, facebookUrl: true, metadataJson: true },
        });
        const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0));
        if (!row || ownerCompanyId <= 0) throw new Error('paid_owner_missing');
        const state = await tx.radarLeadCompanyState.findUnique({
          where: {
            companyId_radarLeadId: {
              companyId: ownerCompanyId,
              radarLeadId: id,
            },
          },
          select: {
            paidClaimOperationId: true,
            claimUsageKey: true,
            acquiredAt: true,
          },
        });
        const usageKey = String(state?.claimUsageKey || '').trim();
        if (!state?.paidClaimOperationId || !state?.acquiredAt || !usageKey) {
          throw new Error('paid_state_missing');
        }
        const debitKey = `enforce:lead_delivery:${usageKey}`;
        const [debit, refund, paidRun] = await Promise.all([
          tx.creditLedgerEntry.findFirst({
            where: { companyId: ownerCompanyId, kind: 'debit', usageKey: debitKey },
            select: { id: true },
          }),
          tx.creditLedgerEntry.findFirst({
            where: { companyId: ownerCompanyId, kind: 'refund', usageKey: `refund:${debitKey}` },
            select: { id: true },
          }),
          tx.radarLeadProcessRun.findUnique({
            where: { id: String(state.paidClaimOperationId) },
            select: { id: true, companyId: true, radarLeadId: true, mode: true, status: true },
          }),
        ]);
        if (
          !debit?.id
          || refund?.id
          || Number(paidRun?.companyId) !== ownerCompanyId
          || String(paidRun?.radarLeadId || '') !== id
          || String(paidRun?.mode || '') !== 'claim'
          || !RADAR_PAID_RUN_STATUSES.has(String(paidRun?.status || '').toLowerCase())
        ) {
          throw new Error('paid_ledger_revoked');
        }
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
          // Grava a verificação WhatsApp (do lote) p/ os telefones deste lead — sem descartar nenhum.
          const waStore: Record<string, boolean> = (meta.phonesWhatsapp && typeof meta.phonesWhatsapp === 'object') ? meta.phonesWhatsapp : {};
          for (const p of meta.phones as string[]) {
            const d = String(p).replace(/\D/g, '');
            if (Object.prototype.hasOwnProperty.call(waMap, d)) waStore[d] = waMap[d];
          }
          meta.phonesWhatsapp = waStore;
          metaChanged = true;
          // WhatsApp não decide visibilidade nem existência do telefone.
          if (!String(row.phone || '').trim()) {
            const firstPhone = (meta.phones as string[])[0];
            if (firstPhone) data.phone = firstPhone;
          }
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
          await tx.radarLeadPool.update({ where: { id }, data });
          updated += 1;
        }

        // Escrita dupla ADITIVA (PR1 30/06 + gate Sprint 5): além do metadataJson (fonte do
        // presenter, intocada acima), grava cada contato descoberto em LeadContact p/ busca/
        // filtro/export em lote sem varrer o JSON blob. Telefone com WhatsApp confirmado pelo
        // motor ganha confiança maior. Nunca falha o fluxo principal por erro aqui.
        try {
          const contactCandidates: LeadContactCandidate[] = [
            ...incomingEmails.map((value, idx) => ({
              kind: 'email' as const, value, source: 'website_crawl', confidence: 70, rank: idx + 1,
            })),
            ...incomingPhones.map((value, idx) => ({
              kind: 'phone' as const,
              value,
              source: 'website_crawl',
              confidence: waMap[String(value).replace(/\D/g, '')] === true ? 85 : 50,
              rank: idx + 1,
            })),
            ...(ig ? [{ kind: 'instagram' as const, value: ig, source: 'website_crawl', confidence: 60 }] : []),
            ...(fb ? [{ kind: 'facebook' as const, value: fb, source: 'website_crawl', confidence: 60 }] : []),
          ];
          if (contactCandidates.length) {
            await this.getLeadContactWrite().writeContacts(tx, id, contactCandidates);
          }
        } catch { /* best-effort — LeadContact é índice de consulta, não fonte de verdade */ }

        const paidOperationId = String(state.paidClaimOperationId);
        const paidCard = await tx.vendasLead.findUnique({
          where: { claimOperationId: paidOperationId },
          select: { id: true, companyId: true },
        });
        if (!paidCard || Number(paidCard.companyId) !== ownerCompanyId) {
          throw new Error('paid_vendas_card_missing');
        }
        const persistedContacts = typeof tx.leadContact?.findMany === 'function'
          ? await tx.leadContact.findMany({
              where: { radarLeadId: id, kind: { in: ['phone', 'whatsapp', 'email'] } },
              select: {
                kind: true,
                value: true,
                valueNormalized: true,
                source: true,
                rank: true,
                confidence: true,
              },
            })
          : [];
        const sourcePriority = (source: unknown, kind: 'phone' | 'email') => {
          const normalized = String(source || '').toLowerCase();
          if (normalized === 'rfb_primary' || normalized === 'rfb_email') return 1;
          if (normalized === 'rfb_secondary') return 2;
          if (/hbx_engine|website|google|brave|motor/.test(normalized)) return 3;
          return kind === 'phone' ? 10 : 9;
        };
        const phoneMap = new Map<string, any>();
        const emailMap = new Map<string, any>();
        const addPhone = (value: unknown, source: unknown, rank: unknown, confidence: unknown) => {
          const normalized = cleanPhone(value);
          if (!normalized || phoneMap.has(normalized)) return;
          phoneMap.set(normalized, {
            kind: 'phone',
            value: String(value || normalized),
            normalized,
            source: String(source || 'hbx_engine'),
            rank: Math.max(1, Math.trunc(Number(rank) || sourcePriority(source, 'phone'))),
            confidence: Math.max(0, Math.min(100, Math.trunc(Number(confidence) || 0))),
            whatsappStatus: waMap[normalized] === true || meta?.phonesWhatsapp?.[normalized] === true
              ? 'confirmed'
              : Object.prototype.hasOwnProperty.call(waMap, normalized) || Object.prototype.hasOwnProperty.call(meta?.phonesWhatsapp || {}, normalized)
                ? 'not_confirmed'
                : 'unchecked',
          });
        };
        const addEmail = (value: unknown, source: unknown, rank: unknown, confidence: unknown) => {
          const normalized = cleanEmail(value);
          if (!normalized || emailMap.has(normalized)) return;
          emailMap.set(normalized, {
            kind: 'email',
            value: normalized,
            normalized,
            source: String(source || 'hbx_engine'),
            rank: Math.max(1, Math.trunc(Number(rank) || sourcePriority(source, 'email'))),
            confidence: Math.max(0, Math.min(100, Math.trunc(Number(confidence) || 0))),
          });
        };
        for (const contact of persistedContacts || []) {
          if (String(contact?.kind).toLowerCase() === 'email') {
            addEmail(contact.valueNormalized || contact.value, contact.source, contact.rank, contact.confidence);
          } else {
            addPhone(contact.valueNormalized || contact.value, contact.source, contact.rank, contact.confidence);
          }
        }
        addPhone(data.phone || row.phone, 'radar_primary', 10, 0);
        for (const phone of Array.isArray(meta.phones) ? meta.phones : []) addPhone(phone, 'hbx_engine', 3, 50);
        addEmail(data.email || row.email, 'radar_primary', 10, 0);
        for (const emailValue of Array.isArray(meta.emails) ? meta.emails : []) addEmail(emailValue, 'hbx_engine', 3, 70);
        const orderContacts = (values: any[], kind: 'phone' | 'email') => values.sort((a, b) => (
          sourcePriority(a.source, kind) - sourcePriority(b.source, kind)
          || Number(a.rank || 99) - Number(b.rank || 99)
          || Number(b.confidence || 0) - Number(a.confidence || 0)
        )).slice(0, 3);
        const contactSnapshotJson = JSON.stringify({
          version: 1,
          radarLeadId: id,
          phones: orderContacts(Array.from(phoneMap.values()), 'phone'),
          emails: orderContacts(Array.from(emailMap.values()), 'email'),
        });
        const cardUpdated = await tx.vendasLead.updateMany({
          where: {
            id: paidCard.id,
            companyId: ownerCompanyId,
            claimOperationId: paidOperationId,
          },
          data: { contactSnapshotJson },
        });
        if (Number(cardUpdated?.count || 0) !== 1) throw new Error('paid_vendas_snapshot_fenced');
        });
      } catch {
        errors += 1;
      }
    }

    return {
      requested: list.length,
      eligible: eligibleList.length,
      rejectedUnowned,
      updated,
      emails,
      cnpjs,
      socials,
      errors,
    };
  }

  /**
   * GET /modules/owner/radar/contacts/audit — auditoria do ACEITE do Sprint 5: nenhum contato
   * novo pode nascer SÓ no blob. Amostra os leads mais recentes com email/telefone nas colunas
   * e confere se existe linha correspondente em LeadContact; devolve contagens por source e os
   * primeiros IDs descobertos sem cobertura (pra investigar/backfillar).
   */
  async auditLeadContactsForMaster(opts: { sample?: number } = {}): Promise<{
    totalContacts: number;
    bySource: Array<{ source: string | null; count: number }>;
    sample: { scanned: number; covered: number; uncovered: number; uncoveredLeadIds: string[] };
  }> {
    const prisma = this.internalPrisma as any;
    const sampleSize = Math.max(10, Math.min(Number(opts.sample) || 200, 1000));

    const [totalContacts, groups] = await Promise.all([
      prisma.leadContact.count().catch(() => 0),
      prisma.leadContact.groupBy({ by: ['source'], _count: { _all: true } }).catch(() => []),
    ]);

    const rows = await prisma.radarLeadPool.findMany({
      where: { OR: [{ email: { not: null } }, { phoneDigits: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: sampleSize,
      select: { id: true, email: true, phoneDigits: true },
    }).catch(() => []);

    let covered = 0;
    const uncoveredLeadIds: string[] = [];
    for (const row of rows) {
      const hasContactRow = await prisma.leadContact.findFirst({
        where: { radarLeadId: row.id },
        select: { id: true },
      }).catch(() => null);
      if (hasContactRow) covered += 1;
      else if (uncoveredLeadIds.length < 20) uncoveredLeadIds.push(row.id);
    }

    return {
      totalContacts,
      bySource: (groups as any[]).map((g) => ({ source: g.source ?? null, count: Number(g?._count?._all || 0) })),
      sample: {
        scanned: rows.length,
        covered,
        uncovered: rows.length - covered,
        uncoveredLeadIds,
      },
    };
  }

  /**
   * GET /modules/owner/radar/export-all — OWNERV2 (02/07): dump COMPLETO do banco de leads
   * (RadarLeadPool) em CSV gzipado, direto no response. Memória CONSTANTE mesmo com milhões de
   * linhas: paginação por keyset em `id` (cuid crescente e estável), lote de 1.000, cada lote é
   * escrito no gzip e o backpressure do stream é respeitado (drain). Nunca acumula o dataset em
   * memória e nunca faz um findMany gigante. Somente leitura — não toca radar core nem debita nada.
   */
  async streamAllDatabaseCardsCsv(res: import('express').Response): Promise<void> {
    const zlib = await import('zlib');
    const prisma = this.internalPrisma as any;

    // Colunas exportadas — briefing OWNERV2 exigência 6: colunas do lead + CONTATOS ACHATADOS
    // (tel1..3, email1..3, insta, fb, site, nota). `_c` é o mapa de contatos daquela página
    // (LeadContact agrupado por radarLeadId), injetado por lote — memória constante.
    const COLUMNS: Array<[string, (row: any) => any]> = [
      ['id', (r) => r.id],
      ['name', (r) => r.name],
      ['tel1', (r) => r._c?.phone?.[0] ?? r.phone ?? ''],
      ['tel2', (r) => r._c?.phone?.[1] ?? ''],
      ['tel3', (r) => r._c?.phone?.[2] ?? ''],
      // HOT-05: link wa.me pronto do telefone principal — 1 clique abre o WhatsApp do
      // vendedor com o lead (ação humana, não passa pelo motor/Webwhats).
      ['link_whatsapp', (r) => buildWaLink(r._c?.phone?.[0] ?? r.phone ?? '') ?? ''],
      ['email1', (r) => r._c?.email?.[0] ?? r.email ?? ''],
      ['email2', (r) => r._c?.email?.[1] ?? ''],
      ['email3', (r) => r._c?.email?.[2] ?? ''],
      ['insta', (r) => r._c?.instagram?.[0] ?? r.instagramUrl ?? ''],
      ['fb', (r) => r._c?.facebook?.[0] ?? r.facebookUrl ?? ''],
      // WORM-16: flag "tem contato de DONO (qsa)" + nome/cargo do sócio da Receita. `_p` é a
      // pessoa top-rank daquele lead (LeadPerson source=receita_qsa), injetada por lote.
      ['dono_qsa', (r) => (r._p ? 1 : 0)],
      ['dono_nome', (r) => r._p?.name ?? ''],
      ['dono_cargo', (r) => r._p?.role ?? ''],
      ['site', (r) => r.website ?? ''],
      ['nota', (r) => r.opportunityScore],
      ['motivo', (r) => r.opportunityReason ?? ''],
      ['canal', (r) => r.recommendedChannel ?? ''],
      ['address', (r) => r.address],
      ['city', (r) => r.city],
      ['state', (r) => r.state],
      ['segment', (r) => r.segment],
      ['businessCategory', (r) => r.businessCategory],
      ['status', (r) => r.status],
      ['source', (r) => r.source],
      ['sourceEngine', (r) => r.sourceEngine],
      ['rating', (r) => r.rating],
      ['reviews', (r) => r.reviews],
      ['firstSeenAt', (r) => (r.firstSeenAt ? new Date(r.firstSeenAt).toISOString() : '')],
      ['lastSeenAt', (r) => (r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : '')],
    ];
    // Campos crus do lead que os getters acima consultam (o `_c` NÃO é do banco).
    const SELECT: Record<string, boolean> = {
      id: true, name: true, phone: true, email: true, instagramUrl: true, facebookUrl: true,
      website: true, opportunityScore: true, opportunityReason: true, recommendedChannel: true,
      address: true, city: true, state: true, segment: true, businessCategory: true, status: true,
      source: true, sourceEngine: true, rating: true, reviews: true, firstSeenAt: true, lastSeenAt: true,
    };

    // Contatos achatados de UMA página: 1 query batelada (in: pageIds) + agrupamento por lead/kind
    // ordenado por rank. Bounded pela página (1000 leads) → memória constante. Falha aqui degrada
    // gracioso (usa só os campos crus do lead), nunca derruba o export inteiro.
    const loadContactsForPage = async (ids: string[]): Promise<Map<string, Record<string, string[]>>> => {
      const byLead = new Map<string, Record<string, string[]>>();
      if (!ids.length) return byLead;
      let contacts: any[] = [];
      try {
        contacts = await prisma.leadContact.findMany({
          where: { radarLeadId: { in: ids } },
          orderBy: [{ radarLeadId: 'asc' }, { kind: 'asc' }, { rank: 'asc' }],
          select: { radarLeadId: true, kind: true, value: true },
        });
      } catch { contacts = []; }
      for (const c of contacts) {
        const bucket = byLead.get(c.radarLeadId) || {};
        // whatsapp entra junto com phone (é telefone).
        const kind = c.kind === 'whatsapp' ? 'phone' : c.kind;
        (bucket[kind] = bucket[kind] || []).push(c.value);
        byLead.set(c.radarLeadId, bucket);
      }
      return byLead;
    };

    // WORM-16: pessoa DONO (sócio da Receita) da página — top-rank por lead com source=receita_qsa.
    // Bounded pela página → memória constante; degrada gracioso (sem flag) se a tabela não existir.
    const loadOwnerPeopleForPage = async (ids: string[]): Promise<Map<string, { name: string; role: string | null }>> => {
      const byLead = new Map<string, { name: string; role: string | null }>();
      if (!ids.length || !prisma?.leadPerson?.findMany) return byLead;
      let people: any[] = [];
      try {
        people = await prisma.leadPerson.findMany({
          where: { radarLeadId: { in: ids }, source: 'receita_qsa' },
          orderBy: [{ radarLeadId: 'asc' }, { rank: 'asc' }],
          select: { radarLeadId: true, name: true, role: true },
        });
      } catch { people = []; }
      for (const p of people) {
        // primeiro por rank vence (findMany já vem ordenado) — não sobrescreve.
        if (!byLead.has(p.radarLeadId)) byLead.set(p.radarLeadId, { name: p.name, role: p.role || null });
      }
      return byLead;
    };

    const escapeCsv = (value: any): string => {
      if (value == null) return '';
      const str = String(value);
      // aspas duplas + escape de "; newlines viram espaço pra não quebrar a linha do CSV.
      if (/[";\n\r]/.test(str)) return '"' + str.replace(/\r?\n/g, ' ').replace(/"/g, '""') + '"';
      return str;
    };

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="hbx-leads-${stamp}.csv.gz"`);
    res.setHeader('Cache-Control', 'no-store');

    const gzip = zlib.createGzip();
    gzip.pipe(res);

    // Escrita respeitando backpressure: se o buffer encher, espera o 'drain'.
    const write = (chunk: string): Promise<void> =>
      new Promise((resolve, reject) => {
        gzip.write(chunk, (err) => (err ? reject(err) : undefined));
        if (gzip.writableNeedDrain) gzip.once('drain', resolve);
        else resolve();
      });

    try {
      // BOM UTF-8 pro Excel abrir acentos certo + cabeçalho.
      await write('﻿' + COLUMNS.map(([key]) => key).join(';') + '\r\n');

      const PAGE = 1000;
      let cursorId: string | null = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows: any[] = await prisma.radarLeadPool.findMany({
          where: cursorId ? { id: { gt: cursorId } } : undefined,
          orderBy: { id: 'asc' },
          take: PAGE,
          select: SELECT,
        });
        if (!rows.length) break;
        const pageIds = rows.map((r) => r.id);
        const [contactsByLead, ownerByLead] = await Promise.all([
          loadContactsForPage(pageIds),
          loadOwnerPeopleForPage(pageIds),
        ]);
        let buffer = '';
        for (const row of rows) {
          row._c = contactsByLead.get(row.id) || null;
          row._p = ownerByLead.get(row.id) || null;
          buffer += COLUMNS.map(([, get]) => escapeCsv(get(row))).join(';') + '\r\n';
        }
        await write(buffer);
        cursorId = rows[rows.length - 1].id;
        if (rows.length < PAGE) break;
      }
      await new Promise<void>((resolve, reject) => gzip.end((err?: Error | null) => (err ? reject(err) : resolve())));
    } catch (err) {
      // Já pode ter mandado header 200 + bytes → não dá pra trocar pra 500; encerra o stream.
      try { gzip.destroy(err as Error); } catch { /* noop */ }
      if (!res.writableEnded) { try { res.end(); } catch { /* noop */ } }
    }
  }
}
