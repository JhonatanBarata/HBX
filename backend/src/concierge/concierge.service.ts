// ============================================================================
// CONCIERGE IA — máquina de estados + command bus determinístico (Missão F,
// docs/PLANEJAMENTOS/RELEASE-20X/IA-CONCIERGE-CONTRATO.md §2).
//
// A LEI: a IA propõe, o código dispõe. O modelo 4B faz UMA coisa — texto livre
// → JSON de slots (concierge-slots.ts). TODA transição de estado, validação,
// custo e execução é código determinístico com tenant do JWT. A IA nunca vê
// companyId, ids, Prisma, endpoint nem lista de comandos. TODO texto exibido
// ao usuário nasce AQUI (template em código) — nunca da IA.
//
// Execução reusa `startRadarSearchRunForUser` EXISTENTE (zero lógica de busca
// nova); custo/cota recalculados no servidor ANTES de confirmar; confirmação é
// clique humano com token single-use amarrado ao hash dos slots. O débito real
// do lead segue no choke único existente (assertAndDebitLeadDelivery) quando os
// leads são entregues — o concierge NÃO cria caminho novo de débito.
// ============================================================================

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WebscrapingService } from '../webscraping/webscraping.service';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { CreditsService } from '../credits/credits.service';
import { isBillingOwnerActor } from '../access/actor-kind';
import { AiPressureSignals } from '../master-alert/ai-pressure-signals';
import { getCreditActionDefinition } from '../credits/credit-action-catalog';
import { applyDeterministicGuards, buildExtractorMessages, channelsToRadarPreferred, computeMissingFields, ConciergeChannel, CONCIERGE_CHANNELS, ConciergeSlots, emptySlots, mergeSlots, safeParseConciergeJson, sanitizeAiSlots, slotsExecutionHash, BRAZIL_UFS } from './concierge-slots';
import { callConciergeExtractor, conciergeAiEnabled, conciergeFeatureEnabled, conciergeModel } from './concierge-ollama';

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h (§2.1)
const CONFIRM_TTL_MS = 10 * 60 * 1000; // 10min (§2.3)
const TRANSCRIPT_MAX_TURNS = 20; // cap anti-flood (§2.7)
const TRANSCRIPT_MAX_CHARS = 500;
const DEFAULT_QUANTITY = 10; // desiredCount null → default (§2.2)
const MAX_UNCLEAR_BEFORE_CHIPS = 2;
const SWEEPER_INTERVAL_MS = 10 * 60 * 1000;

type ConciergeState =
  | 'START'
  | 'COLLECT_SEGMENT'
  | 'COLLECT_LOCATION'
  | 'PREVIEW'
  | 'RESULT';

type DraftMeta = { unclearCount: number };

type TranscriptTurn = { role: 'user' | 'assistant'; content: string };

type ConciergeChip =
  | { kind: 'slot'; field: 'targetSegment' | 'city' | 'desiredCount'; label: string; value: string }
  | { kind: 'reset'; label: string };

type CostPreview = {
  requestedQuantity: number;
  quantity: number;
  clamped: boolean;
  blocked: boolean;
  /** LEI DO VENDEDOR: null pro vendedor — só o dono vê custo em créditos (§2.4). */
  costCredits: number | null;
  mode: 'track' | 'debit' | null;
};

type PresentedDraft = {
  id: string;
  state: ConciergeState;
  status: string;
  slots: {
    targetSegment: string | null;
    city: string | null;
    state: string | null;
    desiredCount: number | null;
    channels: ConciergeChannel[];
  };
  missingFields: Array<'targetSegment' | 'city'>;
  preview: CostPreview | null;
  confirmToken: string | null;
  runId: string | null;
  transcript: TranscriptTurn[];
};

type ConciergeReply = {
  ok: boolean;
  code?: string;
  draft?: PresentedDraft;
  reply?: string;
  chips?: ConciergeChip[];
  aiOnline?: boolean;
};

@Injectable()
export class ConciergeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConciergeService.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webscraping: WebscrapingService,
    private readonly usageLimits: CommercialUsageLimitsService,
    private readonly credits: CreditsService,
  ) {}

  // Sweeper de TTL — mesmo espírito do sweeper de lease da fila de missões:
  // marca `expired` sem apagar (trilha). Lazy-expiry no read cobre o intervalo.
  onModuleInit() {
    if (!conciergeFeatureEnabled()) return;
    this.sweeper = setInterval(() => {
      void this.expireStaleDrafts();
    }, SWEEPER_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private async expireStaleDrafts() {
    try {
      await this.prisma.aiConciergeDraft.updateMany({
        where: { status: 'active', expiresAt: { lt: new Date() } },
        data: { status: 'expired' },
      });
    } catch (error) {
      this.logger.warn(`sweeper de drafts falhou: ${String((error as Error)?.message || error)}`);
    }
  }

  // ── contexto do JWT (mesmo padrão resolveContext do Radar) ────────────────
  private resolveContext(user: any): { companyId: number; userId: number } {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId || !userId) throw new BadRequestException('Empresa ou usuario nao identificado.');
    return { companyId, userId };
  }

  private featureDisabled(): ConciergeReply {
    return { ok: false, code: 'feature_disabled' };
  }

  // ── GET /concierge — reidratação + chips de sugestão (código, não IA §1.6) ─
  async bootstrap(user: any): Promise<ConciergeReply & { suggestions?: { segments: string[]; city: string | null; state: string | null } }> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);

    const draft = (await this.loadActiveDraft(ctx)) ?? (await this.loadLatestExecutedDraft(ctx));
    const suggestions = await this.loadSuggestions(ctx.companyId);

    if (!draft) {
      return {
        ok: true,
        draft: undefined,
        suggestions,
        aiOnline: conciergeAiEnabled(),
        reply: 'Me diga o que você procura — ex.: "20 clínicas odontológicas em Curitiba".',
        chips: this.buildChips(emptySlots(), suggestions),
      };
    }

    const slots = this.parseSlots(draft);
    return {
      ok: true,
      draft: this.presentDraft(draft, slots, user),
      suggestions,
      aiOnline: conciergeAiEnabled(),
      chips: this.buildChips(slots, suggestions),
    };
  }

  private async loadSuggestions(companyId: number): Promise<{ segments: string[]; city: string | null; state: string | null }> {
    const company = await this.prisma.company
      .findUnique({ where: { id: companyId }, select: { prospectingSegmentsJson: true } })
      .catch(() => null);
    let segments: string[] = [];
    try {
      const parsed = JSON.parse(String(company?.prospectingSegmentsJson || '[]'));
      if (Array.isArray(parsed)) segments = parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4);
    } catch {
      segments = [];
    }
    // prospectingEstado/prospectingCidade são colunas runtime-ensure (fora do client tipado).
    const rows = await this.prisma
      .$queryRaw<Array<{ prospectingEstado: string | null; prospectingCidade: string | null }>>`
        SELECT "prospectingEstado", "prospectingCidade" FROM "Company" WHERE "id" = ${companyId} LIMIT 1
      `.catch(() => [] as Array<{ prospectingEstado: string | null; prospectingCidade: string | null }>);
    const city = String(rows?.[0]?.prospectingCidade || '').trim() || null;
    const state = String(rows?.[0]?.prospectingEstado || '').trim().toUpperCase() || null;
    return { segments, city, state: state && (BRAZIL_UFS as readonly string[]).includes(state) ? state : null };
  }

  // ── POST /concierge/message — turno de conversa (IA preenche slots) ────────
  async message(user: any, input: { draftId?: string | null; message?: string | null }): Promise<ConciergeReply> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);
    const text = String(input?.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text) throw new BadRequestException('Mensagem vazia.');

    const draft = await this.loadOrCreateDraft(ctx, input?.draftId);
    let slots = this.parseSlots(draft);
    const meta = this.parseMeta(draft);
    const suggestions = await this.loadSuggestions(ctx.companyId);

    // Draft já executado não volta pra coleta — idempotência por draft (§2.1).
    if (draft.status === 'executed') {
      return {
        ok: true,
        draft: this.presentDraft(draft, slots, user),
        reply: 'Essa busca já foi disparada. Toque em "Nova busca" para começar outra.',
        chips: [{ kind: 'reset', label: 'Nova busca' }],
        aiOnline: conciergeAiEnabled(),
      };
    }

    // 1. IA extrai slots (com 1 retry curto). Falha → fallback por chips (§2.5).
    let extracted: ConciergeSlots | null = null;
    let aiOnline = true;
    try {
      extracted = await this.extractWithRetry(slots, text, ctx.companyId);
    } catch (error) {
      aiOnline = false;
      // AI-SOS: falha REAL de IA (timeout/recusa/Ollama fora) — alimenta o grito.
      AiPressureSignals.report('concierge_extractor_fail');
      this.logger.warn(`extrator indisponivel: ${String((error as Error)?.message || error)}`);
    }

    let reply: string;
    if (!aiOnline) {
      reply = 'Estou sem a IA agora. Use os botões abaixo ou o formulário do Radar — nada se perde.';
    } else if (!extracted) {
      // JSON inválido 2x → fluxo por chips, sem IA (§2.2 item 1). AI-SOS conta.
      AiPressureSignals.report('concierge_extractor_invalid');
      reply = 'Não consegui entender. Vamos por partes — escolha ou digite o tipo de empresa.';
    } else {
      // 2. Validação/merge no CÓDIGO (a IA é consultiva).
      const lowConfidence = extracted.confidence < 0.55 && extracted.intent === 'radar_search';
      if (extracted.intent === 'out_of_scope') {
        reply = this.outOfScopeReply(slots);
        await this.appendTranscript(draft.id, text, reply);
        return {
          ok: true,
          draft: this.presentDraft(draft, slots, user),
          reply,
          chips: this.buildChips(slots, suggestions),
          aiOnline,
        };
      }
      if (extracted.intent === 'unclear' || lowConfidence) {
        meta.unclearCount += 1;
        reply = meta.unclearCount >= MAX_UNCLEAR_BEFORE_CHIPS
          ? 'Vamos por partes — escolha ou digite o tipo de empresa que você procura.'
          : 'Não entendi. Me diga o tipo de empresa e a cidade — ex.: "15 padarias em Recife".';
        await this.saveDraft(draft.id, slots, meta, this.stateFor(slots), draft);
        await this.appendTranscript(draft.id, text, reply);
        const fresh = await this.getDraftOrThrow(ctx, draft.id);
        return { ok: true, draft: this.presentDraft(fresh, slots, user), reply, chips: this.buildChips(slots, suggestions), aiOnline };
      }
      meta.unclearCount = 0;
      slots = mergeSlots(slots, extracted);
      // Cidade da IA é CANDIDATA: só vira slot depois de casar com a lista real (§2.2 item 4).
      const cityCheck = await this.validateCity(slots);
      slots = cityCheck.slots;
      if (cityCheck.invalidCity) {
        reply = cityCheck.suggestions.length
          ? `Não achei "${cityCheck.invalidCity}" — é alguma destas?`
          : `Só atendo cidades do Brasil e não achei "${cityCheck.invalidCity}". Qual é a cidade?`;
        await this.saveDraft(draft.id, slots, meta, this.stateFor(slots), draft);
        await this.appendTranscript(draft.id, text, reply);
        const fresh = await this.getDraftOrThrow(ctx, draft.id);
        return {
          ok: true,
          draft: this.presentDraft(fresh, slots, user),
          reply,
          chips: [
            ...cityCheck.suggestions.map((city) => ({ kind: 'slot', field: 'city', label: city, value: city }) as ConciergeChip),
            ...this.buildChips(slots, suggestions).filter((chip) => chip.kind !== 'slot' || chip.field !== 'city'),
          ],
          aiOnline,
        };
      }
      reply = ''; // preenchido abaixo pelo estado
    }

    // 3. Transição determinística de estado + PREVIEW quando completo.
    return this.advance(ctx, user, draft.id, slots, meta, suggestions, { userText: text, replyOverride: reply || null, aiOnline });
  }

  // ── POST /concierge/slot — clique em chip (determinístico, NÃO passa pela IA) ─
  async setSlot(
    user: any,
    input: { draftId?: string | null; field?: string | null; value?: unknown },
  ): Promise<ConciergeReply> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);
    const field = String(input?.field || '').trim();
    const draft = await this.loadOrCreateDraft(ctx, input?.draftId);
    if (draft.status === 'executed') throw new BadRequestException('Busca ja disparada — comece uma nova.');
    let slots = this.parseSlots(draft);
    const meta = this.parseMeta(draft);

    if (field === 'targetSegment') {
      const value = String(input?.value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!value) throw new BadRequestException('Segmento vazio.');
      slots = { ...slots, intent: 'radar_search', targetSegment: value };
    } else if (field === 'city') {
      const value = String(input?.value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!value) throw new BadRequestException('Cidade vazia.');
      slots = { ...slots, intent: 'radar_search', city: value, cityValidated: false };
      const cityCheck = await this.validateCity(slots);
      slots = cityCheck.slots;
      if (cityCheck.invalidCity) {
        const reply = cityCheck.suggestions.length ? `Não achei "${cityCheck.invalidCity}" — é alguma destas?` : 'Não achei essa cidade. Tente de novo.';
        await this.saveDraft(draft.id, slots, meta, this.stateFor(slots), draft);
        const fresh = await this.getDraftOrThrow(ctx, draft.id);
        return {
          ok: true,
          draft: this.presentDraft(fresh, slots, user),
          reply,
          chips: cityCheck.suggestions.map((city) => ({ kind: 'slot', field: 'city', label: city, value: city }) as ConciergeChip),
          aiOnline: conciergeAiEnabled(),
        };
      }
    } else if (field === 'desiredCount') {
      const value = Math.trunc(Number(input?.value));
      if (!Number.isFinite(value) || value <= 0) throw new BadRequestException('Quantidade invalida.');
      slots = { ...slots, intent: 'radar_search', desiredCount: value };
    } else if (field === 'channels') {
      const raw = Array.isArray(input?.value) ? (input?.value as unknown[]) : [];
      const channels = raw
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item): item is ConciergeChannel => (CONCIERGE_CHANNELS as readonly string[]).includes(item));
      slots = { ...slots, channels: Array.from(new Set(channels)) };
    } else {
      throw new BadRequestException('Campo desconhecido.');
    }

    const suggestions = await this.loadSuggestions(ctx.companyId);
    return this.advance(ctx, user, draft.id, slots, meta, suggestions, { userText: null, replyOverride: null, aiOnline: conciergeAiEnabled() });
  }

  // ── POST /concierge/confirm — clique humano; executa via comando (§2.3) ────
  async confirm(user: any, input: { draftId?: string | null; confirmToken?: string | null }): Promise<ConciergeReply> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);
    const draft = await this.getDraftOrThrow(ctx, String(input?.draftId || ''));
    const slots = this.parseSlots(draft);

    // Idempotência: draft executado devolve o MESMO runId — nunca 2 buscas (§2.1).
    if (draft.status === 'executed' && draft.runId) {
      return {
        ok: true,
        draft: this.presentDraft(draft, slots, user),
        reply: 'Busca já disparada — acompanhando o resultado.',
        aiOnline: conciergeAiEnabled(),
      };
    }
    if (draft.status !== 'active') throw new BadRequestException('Rascunho expirado. Comece uma nova busca.');

    const token = String(input?.confirmToken || '').trim();
    if (!token || token !== String(draft.confirmToken || '')) {
      throw new BadRequestException('Confirmacao invalida. Revise o resumo e confirme de novo.');
    }
    if (!draft.confirmExpiresAt || draft.confirmExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Confirmacao expirou. Revise o resumo e confirme de novo.');
    }

    // Revalida custo/cota NA HORA (a cota pode ter mudado entre preview e confirm §2.4).
    const preview = await this.estimateCost(ctx, user, slots);
    if (preview.blocked) {
      const reply = isBillingOwnerActor(user)
        ? 'Saldo ou limite de cards esgotado agora — a busca não foi disparada.'
        : 'Seu limite foi atingido — fale com o responsável. A busca não foi disparada.';
      return { ok: true, draft: this.presentDraft(draft, slots, user), reply, aiOnline: conciergeAiEnabled() };
    }
    // Slots mudaram desde a PREVIEW → token morre, volta pra PREVIEW (§2.1).
    if (slotsExecutionHash(slots, preview.quantity) !== String(draft.slotsHash || '')) {
      const suggestions = await this.loadSuggestions(ctx.companyId);
      return this.advance(ctx, user, draft.id, slots, this.parseMeta(draft), suggestions, {
        userText: null,
        replyOverride: 'O resumo mudou (cota/limite). Revise e confirme de novo.',
        aiOnline: conciergeAiEnabled(),
      });
    }

    // EXECUTE — delega ao caminho EXISTENTE, que re-valida TUDO (defesa em profundidade).
    const run = await this.webscraping.startRadarSearchRunForUser(user, {
      city: slots.city,
      state: slots.state,
      segment: slots.targetSegment,
      quantity: preview.quantity,
      preferredChannels: channelsToRadarPreferred(slots.channels),
    });
    const runId = String((run as any)?.runId || (run as any)?.id || '').trim();
    if (!runId) throw new BadRequestException('Busca nao pode ser iniciada agora. Tente de novo.');

    await this.prisma.aiConciergeDraft.update({
      where: { id: draft.id },
      data: { status: 'executed', state: 'RESULT', runId, confirmToken: null, confirmExpiresAt: null },
    });
    const reply = 'Busca disparada! Vou acompanhando aqui — os leads aparecem no Radar.';
    await this.appendTranscript(draft.id, null, reply);
    const fresh = await this.getDraftOrThrow(ctx, draft.id);
    return { ok: true, draft: this.presentDraft(fresh, slots, user), reply, aiOnline: conciergeAiEnabled() };
  }

  // ── GET /concierge/draft/:id/status — poll do resultado (§2.1 RESULT) ──────
  async runStatus(user: any, draftId: string): Promise<ConciergeReply & { run?: { status: string; delivered: number; target: number; progress: number; terminal: boolean; message: string | null } }> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);
    const draft = await this.getDraftOrThrow(ctx, draftId);
    if (!draft.runId) throw new BadRequestException('Este rascunho ainda nao disparou busca.');
    const run = await this.webscraping.getRadarSearchRunForUser(user, draft.runId);
    const meta = (run as any)?.meta || {};
    return {
      ok: true,
      draft: this.presentDraft(draft, this.parseSlots(draft), user),
      run: {
        status: String((run as any)?.status || ''),
        delivered: Math.max(0, Math.trunc(Number(meta.deliveredCount || 0))),
        target: Math.max(0, Math.trunc(Number((run as any)?.targetQuantity || 0))),
        progress: Math.max(0, Math.min(100, Math.trunc(Number(meta.progress || 0)))),
        terminal: Boolean(meta.terminal),
        message: String((run as any)?.message || '').trim() || null,
      },
      aiOnline: conciergeAiEnabled(),
    };
  }

  // ── POST /concierge/reset — abandona o rascunho ativo ─────────────────────
  async reset(user: any): Promise<ConciergeReply> {
    if (!conciergeFeatureEnabled()) return this.featureDisabled();
    const ctx = this.resolveContext(user);
    await this.prisma.aiConciergeDraft.updateMany({
      where: { companyId: ctx.companyId, userId: ctx.userId, status: 'active' },
      data: { status: 'abandoned' },
    });
    const suggestions = await this.loadSuggestions(ctx.companyId);
    return {
      ok: true,
      reply: 'Me diga o que você procura — ex.: "20 clínicas odontológicas em Curitiba".',
      chips: this.buildChips(emptySlots(), suggestions),
      aiOnline: conciergeAiEnabled(),
    };
  }

  // ══ internos ═══════════════════════════════════════════════════════════════

  private async extractWithRetry(slots: ConciergeSlots, text: string, companyId: number): Promise<ConciergeSlots | null> {
    const context = {
      targetSegment: slots.targetSegment,
      city: slots.city,
      state: slots.state,
      desiredCount: slots.desiredCount,
      channels: slots.channels,
    };
    const first = await callConciergeExtractor(buildExtractorMessages(context, text), { companyId });
    let sanitized = sanitizeAiSlots(safeParseConciergeJson(first));
    if (sanitized) return applyDeterministicGuards(sanitized, text);
    const second = await callConciergeExtractor(buildExtractorMessages(context, text, { retry: true }), { companyId });
    sanitized = sanitizeAiSlots(safeParseConciergeJson(second));
    return sanitized ? applyDeterministicGuards(sanitized, text) : null; // null → fluxo por chips
  }

  /** Cidade SEMPRE validada contra a lista real (código, §2.2 item 4). */
  private async validateCity(slots: ConciergeSlots): Promise<{ slots: ConciergeSlots; invalidCity: string | null; suggestions: string[] }> {
    if (!slots.city || slots.cityValidated) return { slots, invalidCity: null, suggestions: [] };
    let result: { items: string[] } | null = null;
    try {
      result = await this.webscraping.listBrazilianCities(slots.city, 6);
    } catch {
      // IBGE fora do ar: degrada aceitando o texto (a busca real é o gate final).
      return { slots: { ...slots, cityValidated: true }, invalidCity: null, suggestions: [] };
    }
    const normalize = (value: string) =>
      String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const target = normalize(slots.city);
    // A lista real vem como "Cidade - UF" (E2E 11/07: "Curitiba" não casava com
    // "Curitiba - PR"). Casa pelo item inteiro OU só pela parte da cidade; ao
    // casar, adota o item CANÔNICO (o normalizador do Radar aceita "Cidade - UF")
    // e resolve a UF deterministicamente pelo sufixo — código, não IA (§2.2#7).
    const exact = (result?.items || []).find((item) => {
      const whole = normalize(item);
      return whole === target || normalize(String(item).split(' - ')[0]) === target;
    });
    if (exact) {
      const suffix = String(exact).split(' - ')[1]?.trim().toUpperCase() || null;
      const state = slots.state || (suffix && (BRAZIL_UFS as readonly string[]).includes(suffix) ? suffix : null);
      return { slots: { ...slots, city: exact, state, cityValidated: true }, invalidCity: null, suggestions: [] };
    }
    const invalid = slots.city;
    return {
      slots: { ...slots, city: null, cityValidated: false },
      invalidCity: invalid,
      suggestions: (result?.items || []).slice(0, 5),
    };
  }

  private stateFor(slots: ConciergeSlots): ConciergeState {
    const missing = computeMissingFields(slots);
    if (missing.includes('targetSegment')) return slots.targetSegment || slots.city ? 'COLLECT_SEGMENT' : 'START';
    if (missing.includes('city')) return 'COLLECT_LOCATION';
    return 'PREVIEW';
  }

  /** Transição + resposta determinística; em PREVIEW calcula custo e emite token. */
  private async advance(
    ctx: { companyId: number; userId: number },
    user: any,
    draftId: string,
    slots: ConciergeSlots,
    meta: DraftMeta,
    suggestions: { segments: string[]; city: string | null; state: string | null },
    opts: { userText: string | null; replyOverride: string | null; aiOnline: boolean },
  ): Promise<ConciergeReply> {
    const state = this.stateFor(slots);
    let reply = opts.replyOverride || '';
    let chips = this.buildChips(slots, suggestions);
    let preview: CostPreview | null = null;
    let confirmToken: string | null = null;
    let confirmExpiresAt: Date | null = null;
    let slotsHash: string | null = null;

    if (state === 'PREVIEW') {
      preview = await this.estimateCost(ctx, user, slots);
      if (preview.blocked) {
        reply = isBillingOwnerActor(user)
          ? 'Seu limite de cards/créditos está esgotado agora. A busca fica pronta — confirme quando liberar.'
          : 'Seu limite foi atingido. Fale com o responsável para liberar mais buscas.';
        chips = [{ kind: 'reset', label: 'Nova busca' }];
      } else {
        confirmToken = randomBytes(24).toString('hex');
        confirmExpiresAt = new Date(Date.now() + CONFIRM_TTL_MS);
        slotsHash = slotsExecutionHash(slots, preview.quantity);
        reply = this.previewReply(slots, preview, user);
        chips = [];
      }
    } else if (!reply) {
      if (state === 'COLLECT_SEGMENT' || state === 'START') {
        reply = 'Qual tipo de empresa você quer encontrar?';
      } else {
        reply = 'Em qual cidade?';
      }
    }

    await this.prisma.aiConciergeDraft.update({
      where: { id: draftId },
      data: {
        state,
        slotsJson: JSON.stringify(slots),
        costPreviewJson: preview ? JSON.stringify(preview) : null,
        confirmToken,
        confirmExpiresAt,
        slotsHash,
        metaJson: JSON.stringify(meta),
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });
    await this.appendTranscript(draftId, opts.userText, reply);
    const fresh = await this.getDraftOrThrow(ctx, draftId);
    return { ok: true, draft: this.presentDraft(fresh, slots, user), reply, chips, aiOnline: opts.aiOnline };
  }

  private previewReply(slots: ConciergeSlots, preview: CostPreview, user: any): string {
    const where = slots.state ? `${slots.city} - ${slots.state}` : String(slots.city);
    const clampNote = preview.clamped
      ? ` Você pediu ${preview.requestedQuantity}, consigo até ${preview.quantity} agora (limite do seu plano/dia).`
      : '';
    if (isBillingOwnerActor(user) && preview.costCredits != null) {
      const modeNote = preview.mode === 'debit' ? '' : ' (sem cobrança agora — só medição)';
      return `Vou buscar ${preview.quantity} ${slots.targetSegment} em ${where} — custo ${preview.costCredits} crédito${preview.costCredits === 1 ? '' : 's'}${modeNote}.${clampNote} Confirma?`;
    }
    return `Vou buscar ${preview.quantity} ${slots.targetSegment} em ${where} — dentro do seu limite.${clampNote} Confirma?`;
  }

  private outOfScopeReply(slots: ConciergeSlots): string {
    const missing = computeMissingFields(slots);
    if (!missing.length) return 'Isso eu não faço por aqui. Sua busca está pronta — é só confirmar no resumo.';
    return 'Isso eu não faço por aqui — eu busco empresas no Radar. Me diga o tipo de empresa e a cidade.';
  }

  /** `radar.estimateSearchCost` — cota clampada + custo do catálogo (§2.3). */
  private async estimateCost(ctx: { companyId: number; userId: number }, user: any, slots: ConciergeSlots): Promise<CostPreview> {
    const requested = Math.max(1, slots.desiredCount ?? DEFAULT_QUANTITY);
    let quantity = requested;
    let blocked = false;

    const snapshot: any = await this.usageLimits.getUsageSnapshot(ctx.companyId, ctx.userId).catch(() => null);
    if (snapshot) {
      // Mesma conta do caminho real (radar-core-delivery.mixin.ts:1017-1058).
      const cards = snapshot.cards || {};
      const daily = Number(cards.dailyRemaining);
      const monthly = Number(cards.remaining);
      const perUser = cards.perUserLimit != null ? Number(cards.userLimit || 0) - Number(cards.userUsed || 0) : monthly;
      const effective = Math.min(...[daily, monthly, perUser].filter((value) => Number.isFinite(value)));
      if (Number.isFinite(effective)) {
        if (effective <= 0) blocked = true;
        else quantity = Math.max(1, Math.min(quantity, Math.trunc(effective)));
      }
    }
    if (!blocked) {
      const sellerQuota: any = await this.usageLimits
        .limitRequestedCardsBySellerActiveQuota(ctx.companyId, ctx.userId, quantity)
        .catch(() => null);
      if (sellerQuota?.quota?.seller) {
        const limit = Math.trunc(Number(sellerQuota.limit || 0));
        if (limit <= 0) blocked = true;
        else quantity = Math.min(quantity, limit);
      }
    }

    const billingAudience = isBillingOwnerActor(user);
    let costCredits: number | null = null;
    let mode: 'track' | 'debit' | null = null;
    if (billingAudience) {
      const definition = getCreditActionDefinition('lead_delivery');
      const unitCost = Math.max(1, Math.trunc(Number(definition?.cost ?? 1)));
      costCredits = quantity * unitCost;
      const enforceActive = await this.credits.isEnforceActiveForCompany(ctx.companyId).catch(() => false);
      mode = enforceActive ? 'debit' : 'track';
    }

    return { requestedQuantity: requested, quantity, clamped: quantity < requested, blocked, costCredits, mode };
  }

  private buildChips(slots: ConciergeSlots, suggestions: { segments: string[]; city: string | null; state: string | null }): ConciergeChip[] {
    const chips: ConciergeChip[] = [];
    const missing = computeMissingFields(slots);
    if (missing.includes('targetSegment')) {
      for (const segment of suggestions.segments) {
        chips.push({ kind: 'slot', field: 'targetSegment', label: segment, value: segment });
      }
    } else if (missing.includes('city') && suggestions.city) {
      chips.push({ kind: 'slot', field: 'city', label: suggestions.city, value: suggestions.city });
    }
    if (!missing.length && slots.desiredCount == null) {
      for (const count of [10, 20, 30]) {
        chips.push({ kind: 'slot', field: 'desiredCount', label: `${count} leads`, value: String(count) });
      }
    }
    return chips;
  }

  // ── persistência do rascunho ───────────────────────────────────────────────
  private async loadActiveDraft(ctx: { companyId: number; userId: number }) {
    const draft = await this.prisma.aiConciergeDraft.findFirst({
      where: { companyId: ctx.companyId, userId: ctx.userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!draft) return null;
    // Lazy expiry (TTL 24h) — draft expirado vira START limpo (§2.1).
    if (draft.expiresAt.getTime() < Date.now()) {
      await this.prisma.aiConciergeDraft.update({ where: { id: draft.id }, data: { status: 'expired' } });
      return null;
    }
    return draft;
  }

  /** Executado recente (dentro do TTL) — permite retomar o poll do RESULT após reload. */
  private async loadLatestExecutedDraft(ctx: { companyId: number; userId: number }) {
    return this.prisma.aiConciergeDraft.findFirst({
      where: { companyId: ctx.companyId, userId: ctx.userId, status: 'executed', expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async loadOrCreateDraft(ctx: { companyId: number; userId: number }, draftId?: string | null) {
    const id = String(draftId || '').trim();
    if (id) {
      const draft = await this.prisma.aiConciergeDraft.findFirst({
        where: { id, companyId: ctx.companyId, userId: ctx.userId },
      });
      if (draft && (draft.status === 'active' || draft.status === 'executed')) return draft;
    }
    // Sem draftId (ou draft morto): segue o ativo; executado NÃO trava mensagem
    // nova — o usuário digita outra busca e nasce um draft novo.
    const existing = await this.loadActiveDraft(ctx);
    if (existing) return existing;
    // 1 draft ativo por usuário — pedido novo abandona o anterior (§2.1).
    await this.prisma.aiConciergeDraft.updateMany({
      where: { companyId: ctx.companyId, userId: ctx.userId, status: 'active' },
      data: { status: 'abandoned' },
    });
    return this.prisma.aiConciergeDraft.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        state: 'START',
        slotsJson: JSON.stringify(emptySlots()),
        transcriptJson: '[]',
        metaJson: JSON.stringify({ unclearCount: 0 }),
        status: 'active',
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });
  }

  private async getDraftOrThrow(ctx: { companyId: number; userId: number }, draftId: string) {
    const draft = await this.prisma.aiConciergeDraft.findFirst({
      where: { id: String(draftId || '').trim(), companyId: ctx.companyId, userId: ctx.userId },
    });
    if (!draft) throw new NotFoundException('Rascunho nao encontrado.');
    return draft;
  }

  private async saveDraft(draftId: string, slots: ConciergeSlots, meta: DraftMeta, state: ConciergeState, _draft: unknown) {
    await this.prisma.aiConciergeDraft.update({
      where: { id: draftId },
      data: {
        state,
        slotsJson: JSON.stringify(slots),
        metaJson: JSON.stringify(meta),
        // slots mudaram → token de confirmação morre (§2.1 CONFIRM).
        confirmToken: null,
        confirmExpiresAt: null,
        slotsHash: null,
        costPreviewJson: null,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });
  }

  private async appendTranscript(draftId: string, userText: string | null, assistantText: string | null) {
    try {
      const draft = await this.prisma.aiConciergeDraft.findUnique({ where: { id: draftId }, select: { transcriptJson: true } });
      let turns: TranscriptTurn[] = [];
      try {
        const parsed = JSON.parse(String(draft?.transcriptJson || '[]'));
        if (Array.isArray(parsed)) turns = parsed;
      } catch {
        turns = [];
      }
      if (userText) turns.push({ role: 'user', content: userText.slice(0, TRANSCRIPT_MAX_CHARS) });
      if (assistantText) turns.push({ role: 'assistant', content: assistantText.slice(0, TRANSCRIPT_MAX_CHARS) });
      turns = turns.slice(-TRANSCRIPT_MAX_TURNS);
      await this.prisma.aiConciergeDraft.update({ where: { id: draftId }, data: { transcriptJson: JSON.stringify(turns) } });
    } catch (error) {
      this.logger.warn(`transcript nao salvo: ${String((error as Error)?.message || error)}`);
    }
  }

  private parseSlots(draft: { slotsJson: string | null }): ConciergeSlots {
    try {
      const parsed = JSON.parse(String(draft?.slotsJson || '{}'));
      const base = emptySlots();
      return {
        ...base,
        ...parsed,
        channels: Array.isArray(parsed?.channels) ? parsed.channels : [],
        cityValidated: Boolean(parsed?.cityValidated),
      };
    } catch {
      return emptySlots();
    }
  }

  private parseMeta(draft: { metaJson: string | null }): DraftMeta {
    try {
      const parsed = JSON.parse(String(draft?.metaJson || '{}'));
      return { unclearCount: Math.max(0, Math.trunc(Number(parsed?.unclearCount || 0))) };
    } catch {
      return { unclearCount: 0 };
    }
  }

  private presentDraft(draft: any, slots: ConciergeSlots, user: any) {
    let preview: CostPreview | null = null;
    try {
      preview = draft?.costPreviewJson ? (JSON.parse(draft.costPreviewJson) as CostPreview) : null;
    } catch {
      preview = null;
    }
    // LEI DO VENDEDOR (defesa em profundidade): custo nunca sai pro vendedor.
    if (preview && !isBillingOwnerActor(user)) {
      preview = { ...preview, costCredits: null, mode: null };
    }
    let transcript: TranscriptTurn[] = [];
    try {
      const parsed = JSON.parse(String(draft?.transcriptJson || '[]'));
      if (Array.isArray(parsed)) transcript = parsed;
    } catch {
      transcript = [];
    }
    return {
      id: String(draft.id),
      state: String(draft.state) as ConciergeState,
      status: String(draft.status),
      slots: {
        targetSegment: slots.targetSegment,
        city: slots.city,
        state: slots.state,
        desiredCount: slots.desiredCount,
        channels: slots.channels,
      },
      missingFields: computeMissingFields(slots),
      preview,
      confirmToken: draft.status === 'active' ? String(draft.confirmToken || '') || null : null,
      runId: String(draft.runId || '') || null,
      transcript,
    };
  }
}
