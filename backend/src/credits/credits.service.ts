import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService, CreditGrantType, GrantOptions } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import {
  computeDefaultExpiresAt,
  computeWelcomeExpiresAt,
  CreditPackDefinition,
  getWelcomeCreditsDefault,
  normalizeCreditPackKey,
} from './credit-pack-catalog';
import { isCreditsEnforceEnabled, isCreditsFeatureEnabled, isCreditsShadowEnabled } from './credits.flags';
import { isBillingOwnerActor } from '../access/actor-kind';
import { loadUserTeamPolicyRuntime, resolveTeamPolicyStoredLimit } from '../team/team-policy-persistence';
import { resolveCompanyAccessState, isCourtesyCreditsAccessState } from '../modules/company-access-state';

// CRÉDITOS S3-PARTE1 — camada de orquestração entre o ledger (S1, CreditWalletService) e o
// catálogo de pacotes (credit-pack-catalog.ts). Tudo aqui respeita HBX_CREDITS_ENABLED
// (default OFF): com a flag OFF, os métodos de leitura devolvem estado neutro/vazio e os de
// escrita recusam (o controller decide o shape HTTP — 404 vs. corpo neutro).

export type MasterGrantInput = {
  amount: number;
  grantType: CreditGrantType;
  expiresAt?: string | Date | null;
  sourceRef?: string | null;
  usageKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

const VALID_GRANT_TYPES = new Set<CreditGrantType>(['paid', 'courtesy_internal', 'promo']);

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly packConfig: CreditPackConfigService,
  ) {}

  private assertFeatureEnabled() {
    if (!isCreditsFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
  }

  private async assertCompanyExists(companyId: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
  }

  // ── MASTER: catálogo de pacotes ──────────────────────────────────────────────
  async listPacksForMaster(): Promise<CreditPackDefinition[]> {
    this.assertFeatureEnabled();
    return this.packConfig.listForMaster();
  }

  async updatePackAsMaster(
    packKey: unknown,
    patch: {
      title?: string;
      observation?: string;
      status?: 'available' | 'paused';
      credits?: number;
      price?: number;
      defaultExpiryDays?: number;
    },
  ): Promise<CreditPackDefinition> {
    this.assertFeatureEnabled();
    const key = normalizeCreditPackKey(packKey);
    if (!key) throw new BadRequestException('Pacote de credito invalido');
    return this.packConfig.updatePack(key, patch);
  }

  async updateGlobalExpiryDefaultAsMaster(days: number): Promise<{ defaultExpiryDays: number }> {
    this.assertFeatureEnabled();
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('defaultExpiryDays deve ser um numero positivo');
    }
    const defaultExpiryDays = await this.packConfig.updateGlobalExpiryDefaultDays(n);
    return { defaultExpiryDays };
  }

  // CRÉDITOS A3 — config global do lote grátis de boas-vindas (mesmo padrão do endpoint
  // acima). Ao menos um dos dois campos deve ser informado.
  async updateWelcomeBatchConfigAsMaster(input: {
    welcomeCredits?: number;
    welcomeExpiryDays?: number;
  }): Promise<{ welcomeCredits: number; welcomeExpiryDays: number }> {
    this.assertFeatureEnabled();
    const welcomeCredits = input?.welcomeCredits != null ? Number(input.welcomeCredits) : undefined;
    const welcomeExpiryDays = input?.welcomeExpiryDays != null ? Number(input.welcomeExpiryDays) : undefined;
    if (welcomeCredits == null && welcomeExpiryDays == null) {
      throw new BadRequestException('informe welcomeCredits e/ou welcomeExpiryDays');
    }
    if (welcomeCredits != null && (!Number.isFinite(welcomeCredits) || welcomeCredits <= 0)) {
      throw new BadRequestException('welcomeCredits deve ser um numero positivo');
    }
    if (welcomeExpiryDays != null && (!Number.isFinite(welcomeExpiryDays) || welcomeExpiryDays <= 0)) {
      throw new BadRequestException('welcomeExpiryDays deve ser um numero positivo');
    }
    return this.packConfig.updateWelcomeBatchConfig({ welcomeCredits, welcomeExpiryDays });
  }

  // ── MASTER: concessão manual de crédito a uma empresa ────────────────────────
  async grantToCompanyAsMaster(
    masterUserId: number,
    companyId: number,
    input: MasterGrantInput,
  ): Promise<{
    entryId: string;
    amount: number;
    alreadyProcessed: boolean;
    expiresAt: Date | null;
    balanceAfter: number;
  }> {
    this.assertFeatureEnabled();
    await this.assertCompanyExists(companyId);

    const rawAmount = Number(input?.amount);
    if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
      throw new BadRequestException('amount deve ser um inteiro positivo');
    }
    const amount = rawAmount;

    const grantType = input?.grantType;
    if (!grantType || !VALID_GRANT_TYPES.has(grantType)) {
      throw new BadRequestException('grantType deve ser paid | courtesy_internal | promo');
    }

    // Idempotência OBRIGATÓRIA (Fix II revisão Opus): concessão de crédito é dinheiro — sem uma
    // chave estável por intenção, um double-click do master dobraria o crédito de graça. O
    // contrato EXIGE `usageKey` OU `sourceRef` (do qual derivamos a usageKey). Vazio nos dois →
    // BadRequest: o painel (S6) é forçado a mandar um token estável por intenção de concessão
    // (UUID gerado na abertura do form) — dedupa o double-submit da MESMA intenção, mas duas
    // concessões legítimas usam tokens diferentes e criam lotes distintos.
    const explicitUsageKey = String(input?.usageKey || '').trim();
    const sourceRef = String(input?.sourceRef || '').trim();
    if (!explicitUsageKey && !sourceRef) {
      throw new BadRequestException('concessao exige idempotencyKey (usageKey) ou sourceRef');
    }
    const usageKey = explicitUsageKey || `master-grant:${sourceRef}`;

    let expiresAt: Date | null = null;
    if (input?.expiresAt) {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('expiresAt invalido');
      expiresAt = parsed;
    } else {
      // Default do config global quando omitido (spec S3, item 4).
      expiresAt = computeDefaultExpiresAt();
    }

    const opts: GrantOptions = {
      kind: 'grant',
      grantType,
      expiresAt,
      sourceRef: sourceRef || null,
      createdByUserId: masterUserId,
      usageKey,
      metadata: input?.metadata ?? null,
    };

    const result = await this.wallet.grant(companyId, amount, opts);
    const balanceAfter = await this.wallet.getBalance(companyId);
    return { ...result, expiresAt, balanceAfter };
  }

  // ── MASTER-REFAB S1 — Carteira na ficha (bloco Financeiro) ───────────────────
  /**
   * Saldo + lotes + extrato (últimos movimentos débito/refund/expire/adjust) de UMA empresa,
   * pra qualquer companyId — diferente de `/credits/me` (que só lê a empresa do próprio
   * usuário). Leitura pura: nenhuma escrita nova, reusa `CreditWalletService.getWalletSnapshot`
   * (mesmo caminho de `/credits/me`) + 1 SELECT do ledger.
   */
  async getWalletOverviewForMaster(companyId: number, limit = 20) {
    this.assertFeatureEnabled();
    await this.assertCompanyExists(companyId);
    const snapshot = await this.wallet.getWalletSnapshot(companyId);
    const recentRows = await this.prisma.creditLedgerEntry.findMany({
      where: { companyId, kind: { in: ['debit', 'refund', 'expire', 'adjust'] } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, Math.trunc(limit) || 20)),
    });
    return {
      enabled: true,
      balance: snapshot.balance,
      lots: snapshot.lots.map((lot) => ({
        id: lot.id,
        amount: lot.amount,
        remaining: lot.remaining,
        expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
        grantType: lot.grantType,
      })),
      recent: recentRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        actionKey: row.actionKey || null,
        sourceRef: row.sourceRef || null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  // ── /credits/me — leitura role-gated ─────────────────────────────────────────
  /**
   * Audiência de COBRANÇA (master OU dono do tenant): saldo completo + lotes + pacotes
   * disponíveis pra comprar. "Dono" = ADMIN/USERMASTER com `canViewBilling !== false`
   * (fonte única em access/actor-kind.ts). GERENTE (ADMIN com `canViewBilling=false`) NÃO
   * é audiência de cobrança — cai na visão neutra do vendedor (Fix I revisão Opus), igual
   * à régua `billingAudience` do `sanitizeUser`/`isBillingOwnerActor`.
   */
  async getMeForBillingAudience(companyId: number) {
    if (!isCreditsFeatureEnabled()) {
      return { enabled: false, balance: 0, lots: [], packs: [] };
    }
    const snapshot = await this.wallet.getWalletSnapshot(companyId);
    const packs = this.packConfig.listAvailable();
    return {
      enabled: true,
      balance: snapshot.balance,
      lots: snapshot.lots.map((lot) => ({
        id: lot.id,
        amount: lot.amount,
        remaining: lot.remaining,
        expiresAt: lot.expiresAt,
        grantType: lot.grantType,
      })),
      packs: packs.map((p) => ({
        key: p.key,
        title: p.title,
        credits: p.credits,
        price: p.price,
        defaultExpiryDays: p.defaultExpiryDays,
        badge: p.badge,
        recommended: p.recommended,
      })),
    };
  }

  /**
   * Audiência NEUTRA — vendedor (role USER) E GERENTE (ADMIN sem cobrança). LEI DO VENDEDOR:
   * NUNCA R$/saldo em reais/pacote/preço. Só um número neutro "leads disponíveis" (o saldo de
   * crédito É o número de leads, 1 crédito = 1 lead — não é um valor financeiro, então expor a
   * CONTAGEM não fere a lei; o que a lei proíbe é enxergar dinheiro/pacote/preço). O gerente
   * cai aqui pela mesma régua canônica que já esconde "Plano e cobrança" dele no front (P3).
   */
  async getMeForSellerAudience(companyId: number) {
    if (!isCreditsFeatureEnabled()) {
      return { enabled: false, leadsDisponiveis: 0 };
    }
    const balance = await this.wallet.getBalance(companyId);
    return { enabled: true, leadsDisponiveis: balance };
  }

  async getMeForUser(user: {
    role?: unknown;
    isSystemMaster?: boolean;
    canViewBilling?: boolean;
    companyId?: unknown;
  }) {
    // Régua canônica (Fix I revisão Opus): audiência de cobrança = master OU dono
    // (ADMIN/USERMASTER com canViewBilling !== false). Gerente (canViewBilling === false)
    // NÃO é dono → cai na visão neutra. Fonte única: access/actor-kind.isBillingOwnerActor.
    const isBillingAudience = isBillingOwnerActor(user as any);
    const companyId = Number(user?.companyId || 0);
    if (!companyId) {
      // Master puro sem empresa em contexto, ou usuário sem empresa: neutro, sem 500.
      throw new ForbiddenException('Nenhuma empresa em contexto');
    }
    return isBillingAudience
      ? this.getMeForBillingAudience(companyId)
      : this.getMeForSellerAudience(companyId);
  }

  // ── S2 — shadow-debit no choke único de baixa de lead ────────────────────────
  /**
   * MEDIÇÃO, não enforcement. Chamado logo após `recordCardCommercialUseOnce` (o choke ÚNICO
   * de "1 lead = 1 baixa" hoje em vendas.service.ts) ter sucesso. Grava 1 linha
   * `CreditLedgerEntry` com `kind: 'debit_shadow'`, `remaining: 0` — NUNCA entra no FIFO de
   * saldo (`openLotsFifo` só lê `kind IN (grant, recharge, promo)`), então `getBalance` é
   * matematicamente indiferente a esta chamada, com ou sem a flag.
   *
   * Best-effort: nunca lança, nunca bloqueia o caminho de venda. Atrás de
   * `HBX_CREDITS_SHADOW` (default OFF) — flag OFF é no-op imediato, sem tocar o banco.
   * Idempotente em código por `usageKey` (`shadow:<actionKey>:<leadId>`) + `kind: 'debit_shadow'`
   * — o `@@unique([usageKey, parentEntryId])` do schema NÃO cobre este caso (parentEntryId fica
   * null aqui, e NULLs não colidem em unique no Postgres), então o `findFirst` abaixo É a trava.
   */
  async recordShadowDebit(
    companyId: number,
    userId: number | null,
    input: { leadId: string | number; actionKey: string },
  ): Promise<void> {
    if (!isCreditsShadowEnabled()) return;
    try {
      const companyIdNum = Number(companyId);
      if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return;
      const actionKey = String(input?.actionKey || '').trim();
      const leadId = String(input?.leadId ?? '').trim();
      if (!actionKey || !leadId) return;

      const usageKey = `shadow:${actionKey}:${leadId}`;

      const existing = await this.prisma.creditLedgerEntry.findFirst({
        where: { companyId: companyIdNum, kind: 'debit_shadow', usageKey },
        select: { id: true },
      });
      if (existing) return;

      const wallet = await this.wallet.ensureWallet(companyIdNum);
      await this.prisma.creditLedgerEntry.create({
        data: {
          walletId: wallet.id,
          companyId: companyIdNum,
          kind: 'debit_shadow',
          amount: 1,
          remaining: 0,
          actionKey,
          usageKey,
          createdByUserId: userId ?? null,
        },
      });
    } catch (error: any) {
      // Best-effort puro: shadow-debit nunca pode quebrar/atrasar o fluxo de venda real.
      this.logger.warn(`shadow_debit_failed company=${companyId} error=${String(error?.message || error)}`);
    }
  }

  // ── A3 — lote grátis de boas-vindas no signup self-service ───────────────────
  /**
   * Concede 1 lote `kind:'promo'`/`grantType:'promo'` (NUNCA receita — D3/S5) na hora em que
   * uma empresa TENANT self-service nasce (auth.service.ts: signupWithGoogle / signup).
   * Quantidade/validade vêm da config global do master (`welcomeCredits`/`welcomeExpiryDays`,
   * default 30/30 — âncora de mercado: CNPJ.biz dá ~10 créditos de trial, 3x é argumento de
   * venda). Idempotente por `usageKey: welcome:<companyId>` — 1 lote por empresa, PRA SEMPRE
   * (retry/duplo-clique/reprocesso nunca duplica; `CreditWalletService.grant` já dedupa).
   *
   * Best-effort PURO (mesmo padrão do `recordShadowDebit` acima): nunca lança, nunca atrasa
   * nem quebra o signup. Flag `HBX_CREDITS_ENABLED` OFF → no-op imediato, sem tocar o banco.
   * Chamador é responsável por NÃO invocar para `platform_infra` nem para empresa criada pelo
   * master (Implantação/companies.service.ts) — ver comentário no auth.service.ts.
   */
  async grantWelcomeBatch(companyId: number): Promise<void> {
    if (!isCreditsFeatureEnabled()) return;
    try {
      const companyIdNum = Number(companyId);
      if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return;

      const amount = getWelcomeCreditsDefault();
      if (!Number.isInteger(amount) || amount <= 0) return;

      const usageKey = `welcome:${companyIdNum}`;
      const expiresAt = computeWelcomeExpiresAt();

      await this.wallet.grant(companyIdNum, amount, {
        kind: 'promo',
        grantType: 'promo',
        expiresAt,
        usageKey,
        sourceRef: 'welcome_batch_signup',
      });
    } catch (error: any) {
      // Best-effort puro: o lote de boas-vindas NUNCA pode quebrar/atrasar o signup.
      this.logger.warn(`welcome_batch_grant_failed company=${companyId} error=${String(error?.message || error)}`);
    }
  }

  // ── R1 — gate REAL de enforcement (débito que BLOQUEIA a entrega sem saldo) ──
  /**
   * Gate em 2 chaves (R1-SPEC): `HBX_CREDITS_ENFORCE` (env, mestre) E
   * `Company.creditsEnforceEnabled` (por-tenant) precisam estar ON. Qualquer uma OFF →
   * enforcement INTEIRO desligado (o caller decide se ainda quer disparar o shadow).
   */
  async isEnforceActiveForCompany(companyId: number): Promise<boolean> {
    const companyIdNum = Number(companyId);
    if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: companyIdNum },
      select: {
        creditsEnforceEnabled: true,
        status: true,
        courtesyEndsAt: true,
        companyKind: true,
        slug: true,
      },
    }).catch(() => null);
    if (!company) return false;

    // Modelo GRÁTIS (cortesia) — decisão do dono 07/07 (decisão A): a conta NÃO tem cota de
    // plano; o teto REAL é o saldo de crédito. Por isso o débito real nasce LIGADO por default
    // em código assim que o módulo de crédito está ON (HBX_CREDITS_ENABLED) — cortesia NÃO
    // depende do cutover global `HBX_CREDITS_ENFORCE`, que existe pra migrar empresas PAGAS do
    // plano pro crédito. Empresa paga (status active/paying) segue na cota do plano até o dono
    // decidir a migração.
    if (isCreditsFeatureEnabled() && this.isCourtesyCreditsCompany(company)) return true;

    // Caminho legado do cutover por-empresa (gate 2 chaves R1): empresa paga já migrada.
    if (!isCreditsEnforceEnabled()) return false;
    return Boolean((company as any)?.creditsEnforceEnabled);
  }

  // Cortesia (modelo grátis) = access state exempt/manual (Company.status='courtesy' não
  // vencida), nunca platform_infra. Fonte única: resolveCompanyAccessState (mesmo motor do
  // resto do backend) + predicado isCourtesyCreditsAccessState, sem re-derivar status cru.
  private isCourtesyCreditsCompany(company: {
    status?: string | null;
    courtesyEndsAt?: Date | null;
    companyKind?: string | null;
    slug?: string | null;
  }): boolean {
    return isCourtesyCreditsAccessState(resolveCompanyAccessState(company as any).state);
  }

  /**
   * Método PÚBLICO reusável (decisão do dono 07/07): "esta empresa é uma conta de CRÉDITO
   * (modelo grátis/cortesia)?". Verdadeiro só com o módulo de crédito ON (HBX_CREDITS_ENABLED)
   * E a empresa em cortesia vigente (exempt/manual). Existe pra outros serviços perguntarem
   * SEM duplicar o critério exempt/manual — hoje consumido pelo CommercialUsageLimitsService
   * (fronteira cota-de-plano × crédito). Best-effort: empresa inexistente/erro → false (nunca
   * trata como conta de crédito por engano, nunca quebra o fluxo de venda).
   */
  async isCreditsAccountCompany(companyId: number): Promise<boolean> {
    if (!isCreditsFeatureEnabled()) return false;
    const companyIdNum = Number(companyId);
    if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return false;
    const company = await this.prisma.company.findUnique({
      where: { id: companyIdNum },
      select: { status: true, courtesyEndsAt: true, companyKind: true, slug: true },
    }).catch(() => null);
    if (!company) return false;
    return this.isCourtesyCreditsCompany(company);
  }

  // Master (isSystemMaster) operando um tenant é god-mode em TODA a superfície de cota
  // (buildUnlimitedSnapshot no CommercialUsageLimitsService) — não consome o crédito do
  // tenant. Protege o fluxo do dono no tenant interno de cortesia sem depender do crédito
  // interno já ter sido concedido. O admin/USERMASTER do tenant NÃO é master → é debitado.
  private async isActingUserSystemMaster(userId: number | null): Promise<boolean> {
    const userIdNum = Number(userId || 0);
    if (!userIdNum) return false;
    // try/catch (não só .catch): protege contra ambiente sem o model `user` no client
    // (fakes de teste) — o acesso a `.findUnique` de undefined lançaria SÍNCRONO. Falha =
    // trata como não-master (nunca isenta débito por erro, nunca quebra o fluxo de venda).
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userIdNum },
        select: { isSystemMaster: true },
      });
      return Boolean(user?.isSystemMaster);
    } catch {
      return false;
    }
  }

  /**
   * S4 — teto individual OPCIONAL por vendedor. Reusa os campos que JÁ existem no
   * `UserTeamPolicy` (D4 do PLANO.md): `monthlyCardsLimit` vira teto MENSAL de crédito,
   * `cardDeliveryDailyLimit` vira teto DIÁRIO — o mesmo padrão `inherit` = sem teto que o
   * `CommercialUsageLimitsService` já usa pra cota count-based. Contagem do consumo
   * individual = linhas `debit` do ledger com `createdByUserId` = este vendedor no período
   * (mesma fonte única do saldo — não um contador paralelo). A EMPRESA nunca é capada por
   * este teto (invariante da ÁRVORE: admin NUNCA capado por vendedor) — só o PRÓPRIO
   * vendedor é bloqueado quando estoura o teto dele.
   */
  private async checkSellerCreditCap(
    companyId: number,
    userId: number | null,
    now: Date,
  ): Promise<{ blocked: boolean; scope: 'monthly' | 'daily' | null }> {
    const userIdNum = Number(userId || 0);
    if (!userIdNum) return { blocked: false, scope: null };

    const policy = await loadUserTeamPolicyRuntime(this.prisma, userIdNum).catch(() => null);
    if (!policy) return { blocked: false, scope: null };

    const monthly = resolveTeamPolicyStoredLimit(policy, 'monthlyCards');
    const daily = resolveTeamPolicyStoredLimit(policy, 'cardDeliveryDaily');
    if (!monthly.applies && !daily.applies) return { blocked: false, scope: null };

    if (monthly.applies) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthlyUsed = await this.prisma.creditLedgerEntry.count({
        where: {
          companyId,
          createdByUserId: userIdNum,
          kind: 'debit',
          createdAt: { gte: monthStart },
        },
      }).catch(() => 0);
      if (monthlyUsed >= monthly.limit!) return { blocked: true, scope: 'monthly' };
    }

    if (daily.applies) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dailyUsed = await this.prisma.creditLedgerEntry.count({
        where: {
          companyId,
          createdByUserId: userIdNum,
          kind: 'debit',
          createdAt: { gte: dayStart },
        },
      }).catch(() => 0);
      if (dailyUsed >= daily.limit!) return { blocked: true, scope: 'daily' };
    }

    return { blocked: false, scope: null };
  }

  /**
   * Bloqueio NEUTRO (LEI DO VENDEDOR): vendedor/gerente recebem código sem citar
   * crédito/saldo/R$. Dono/master recebem código claro pra oferecer recarga no front.
   * `isBillingAudienceUser` decide qual mensagem sai — o CALLER (choke em
   * `CommercialUsageLimitsService`) sabe o role de quem está agindo; se não informado,
   * assume o pior caso (vendedor) e nunca vaza financeiro por omissão.
   */
  private throwBlocked(reason: 'no_balance' | 'seller_cap_monthly' | 'seller_cap_daily', isBillingAudienceUser: boolean) {
    if (isBillingAudienceUser) {
      throw new ConflictException({
        ok: false,
        code: 'CREDIT_BALANCE_EXHAUSTED',
        message: reason === 'no_balance'
          ? 'Saldo de créditos esgotado. Recarregue para continuar recebendo leads.'
          : 'Teto de créditos do vendedor atingido no período.',
        reason,
      });
    }
    throw new ConflictException({
      ok: false,
      code: 'company_access_paused',
      message: 'Acesso pausado pela administracao da conta.',
    });
  }

  /**
   * Choke ÚNICO de débito REAL (R1). Chamado do MESMO ponto do shadow (S2) em
   * `CommercialUsageLimitsService`, logo após o sucesso da baixa. Se o gate (2 chaves) está
   * OFF, é no-op transparente (`applied: false`) — quem chama segue o fluxo shadow normal.
   * Com o gate ON: (1) checa teto individual do vendedor (S4) ANTES do débito da empresa —
   * estourou, bloqueia SÓ ele; (2) debita 1 crédito da carteira via `CreditWalletService.debit`
   * (fail-closed, nunca negativo, idempotente pela mesma `usageKey` do shadow:
   * `enforce:<actionKey>:<leadId>`); sem saldo → bloqueio (fail-closed), a entrega PARA.
   */
  async assertAndDebitLeadDelivery(
    companyId: number,
    userId: number | null,
    input: { leadId: string | number; actionKey: string; isBillingAudienceUser?: boolean },
  ): Promise<{ applied: boolean; debited: number; balanceAfter?: number }> {
    const companyIdNum = Number(companyId);
    if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return { applied: false, debited: 0 };

    const enforceActive = await this.isEnforceActiveForCompany(companyIdNum);
    if (!enforceActive) return { applied: false, debited: 0 };

    // Master god-mode nunca queima o crédito do tenant que opera (ver isActingUserSystemMaster).
    if (await this.isActingUserSystemMaster(userId)) return { applied: false, debited: 0 };

    const actionKey = String(input?.actionKey || '').trim() || 'lead_delivery';
    const leadId = String(input?.leadId ?? '').trim();
    if (!leadId) return { applied: false, debited: 0 };

    const isBillingAudienceUser = Boolean(input?.isBillingAudienceUser);
    const now = new Date();

    // S4 — teto individual do vendedor ANTES do débito da empresa.
    const cap = await this.checkSellerCreditCap(companyIdNum, userId, now);
    if (cap.blocked) {
      this.throwBlocked(cap.scope === 'daily' ? 'seller_cap_daily' : 'seller_cap_monthly', isBillingAudienceUser);
    }

    const usageKey = `enforce:${actionKey}:${leadId}`;
    const result = await this.wallet.debit(companyIdNum, 1, {
      actionKey,
      usageKey,
      userId,
    });

    if (result.debited < 1) {
      // Fail-closed (D7): saldo não cobriu o pedido — a entrega PARA. Nunca saldo negativo.
      this.throwBlocked('no_balance', isBillingAudienceUser);
    }

    return { applied: true, debited: result.debited, balanceAfter: result.balanceAfter };
  }

  /**
   * Refund atômico on-failure (mesma usageKey do débito original) — reusa o evento
   * `vendas_card_refunded` já existente no `CommercialUsageLimitsService.recordCardRefund`.
   * Idempotente (o `CreditWalletService.refund` já garante isso por `refund:<usageKey>`).
   * Best-effort: se o gate estiver OFF ou não houver débito registrado pra essa usageKey,
   * é no-op silencioso (nada a reverter).
   */
  async refundLeadDelivery(
    companyId: number,
    userId: number | null,
    input: { leadId: string | number; actionKey: string },
  ): Promise<{ refunded: number }> {
    const companyIdNum = Number(companyId);
    if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) return { refunded: 0 };
    const actionKey = String(input?.actionKey || '').trim() || 'lead_delivery';
    const leadId = String(input?.leadId ?? '').trim();
    if (!leadId) return { refunded: 0 };

    const usageKey = `enforce:${actionKey}:${leadId}`;
    try {
      const result = await this.wallet.refund(companyIdNum, { usageKey, userId });
      return { refunded: result.refunded };
    } catch (error: any) {
      this.logger.warn(`enforce_refund_failed company=${companyId} error=${String(error?.message || error)}`);
      return { refunded: 0 };
    }
  }
}
