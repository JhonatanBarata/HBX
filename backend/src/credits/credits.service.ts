import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService, CreditGrantType, GrantOptions } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import { computeDefaultExpiresAt, CreditPackDefinition, normalizeCreditPackKey } from './credit-pack-catalog';
import { isCreditsFeatureEnabled } from './credits.flags';
import { isBillingOwnerActor } from '../access/actor-kind';

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
}
