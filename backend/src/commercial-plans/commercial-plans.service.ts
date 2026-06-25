import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasterContextService } from '../master-context/master-context.service';
import { isPlatformInfraCompany } from '../common/company-kind';
import { SelectCommercialPlanDto } from './dto/select-commercial-plan.dto';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  PENDING_COMMERCIAL_ENTITLEMENT_STATUS,
  buildCommercialPlansCatalog,
  classifyPlanChange,
  getCommercialAnnualDiscountPercent,
  getCommercialPlanMonthlyPrice,
  isCommercialEntitlementActive,
  isCommercialPlanPaused,
  normalizeCommercialPlanKey,
  resolveCommercialPlanKeyForCapabilities,
  toCommercialCurrency,
  type ActiveCommercialPlanKey,
  type CommercialEntitlementKey,
  type CommercialPlanKey,
  getCommercialPlanTier,
  type CommercialPlanTier,
} from './commercial-plan-catalog';
import {
  computeCompanySeatBillingSnapshot,
  resolveExtraSeatMonthlyAmount,
} from './seat-billing.util';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { MailService } from '../mail/mail.service';

type CommercialCurrentState = {
  planKey: ActiveCommercialPlanKey | null;
  entitlements: Record<CommercialEntitlementKey, boolean>;
  selectedPlanKey: ActiveCommercialPlanKey | null;
  contactName: string | null;
  contactPhone: string | null;
  taxDocument: string | null;
  accessState: string | null;
  accessStateLabel: string | null;
  // Sinal NEUTRO de bloqueio (sobrevive para vendedor — não é valor financeiro):
  // true quando a empresa não pode operar (pending_checkout/overdue/suspended).
  accessPaused: boolean;
  trialEndsAt: string | null;
  trialRemainingDays: number | null;
  billingGraceEndsAt: string | null;
  billingGraceRemainingHours: number | null;
  isTrial: boolean;
  billingBreakdown?: CommercialBillingBreakdown | null;
  // Cartão na ficha (assinatura vigente, inclusive trial): permite reusar no
  // upgrade/assinar ("•••• 4242 — confirmar") sem redigitar. Só audiência de billing.
  savedCard: { brand: string | null; last4: string | null } | null;
  assistedSetup: {
    required: boolean;
    status: string;
    completedAt: string | null;
    message: string | null;
  };
  // Tier de inteligência de lead: list | lead | full.
  // Additive (25/06): exposto para o front gate o cadeado por tier sem
  // precisar re-derivar do planKey no cliente.
  tier: CommercialPlanTier;
  canSeeLeadIntelligence: boolean;
  canSeeCompanyData: boolean;
};

type CommercialBillingBreakdown = {
  baseMonthly: number;
  includedUsers: number;
  billableUsers: number;
  extraUsers: number;
  extraUserMonthlyPrice: number;
  extraUsersMonthlyAmount: number;
  extraUsersProratedAmount?: number;
  extraUsersBillableDays?: number;
  billedImmediately?: boolean;
  billingMode?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  monthlyTotal: number;
  cycleAmount: number;
};

@Injectable()
export class CommercialPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterContextService: MasterContextService,
    private readonly masterAlert: MasterAlertService,
    private readonly mail: MailService,
  ) {}

  private async resolveUserContext(user: any) {
    const userId = Number(user?.id || 0);
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    const runtimeContext = await this.masterContextService.resolveRuntimeContext(user);
    const companyId = Boolean(user?.isSystemMaster)
      ? Number(runtimeContext.effectiveCompanyId || 0)
      : Number(runtimeContext.effectiveCompanyId || user?.companyId || user?.company?.id || 0);
    if (!companyId && Boolean(user?.isSystemMaster)) {
      throw new ForbiddenException('Selecione/crie um tenant para configurar plano.');
    }
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    return {
      companyId,
      userId,
      canSelectPlan: this.canSelectPlans(user),
    };
  }

  private canSelectPlans(user: any) {
    if (Boolean(user?.isSystemMaster)) return true;
    return String(user?.role || '').trim().toUpperCase() === 'ADMIN';
  }

  private computeTrialRemainingDays(trialEndsAt?: Date | null) {
    if (!(trialEndsAt instanceof Date)) return null;
    const diff = trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  async getBillableUserCount(companyId: number): Promise<number> {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { companyKind: true },
    });
    if (this.isPlatformInfraCommercialCompany(company)) return 0;
    return this.prisma.user.count({
      where: {
        companyId: Number(companyId),
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
        role: 'USER',
      },
    });
  }

  async computeCompanyCommercialAmount(
    companyId: number,
    planKeyRaw: unknown,
    billingCycleRaw: unknown,
  ): Promise<CommercialBillingBreakdown> {
    const planKey = normalizeCommercialPlanKey(planKeyRaw);
    const catalogPlan = buildCommercialPlansCatalog({ includeHidden: true }).find((plan) => plan.key === planKey);
    const baseMonthly = toCommercialCurrency(catalogPlan?.monthlyPrice ?? 0);
    const canBillExtraUsers = planKey !== COMMERCIAL_PLAN_KEYS.LITE;
    const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const seats = await computeCompanySeatBillingSnapshot(this.prisma, {
      companyId,
      planKey,
      extraSeatMonthlyAmount: canBillExtraUsers
        ? resolveExtraSeatMonthlyAmount(catalogPlan?.extraUserMonthlyPrice)
        : 0,
    });
    const billableUsers = seats.activeUsers;
    const includedUsers = seats.includedActiveUsers;
    const extraUserMonthlyPrice = canBillExtraUsers ? seats.extraSeatMonthlyAmount : 0;
    const extraUsers = canBillExtraUsers ? seats.extraActiveUsers : 0;
    const extraUsersMonthlyAmount = canBillExtraUsers ? seats.extraSeatCycleAmount : 0;
    const monthlyTotal = toCommercialCurrency(baseMonthly + extraUsersMonthlyAmount);
    const baseCycleAmount = billingCycle === 'ANNUAL'
      ? toCommercialCurrency(baseMonthly * 12 * (1 - getCommercialAnnualDiscountPercent() / 100))
      : baseMonthly;
    const cycleAmount = toCommercialCurrency(baseCycleAmount + extraUsersMonthlyAmount);

    return {
      baseMonthly,
      includedUsers,
      billableUsers,
      extraUsers,
      extraUserMonthlyPrice,
      extraUsersMonthlyAmount,
      extraUsersProratedAmount: seats.extraSeatCycleAmount,
      extraUsersBillableDays: seats.extraSeatBillableDays,
      billedImmediately: seats.billedImmediately,
      billingMode: seats.billingMode,
      billingPeriodStart: seats.billingPeriodStart,
      billingPeriodEnd: seats.billingPeriodEnd,
      monthlyTotal,
      cycleAmount,
    };
  }

  // Projecoes do estado canonico (company-access-state.ts) — este servico
  // nao re-deriva mais acesso/trial de campos crus (PR-002 A.4).
  private isCompanyTrialingVendas(company: any) {
    const trialModule = String(company?.trialModuleSelection || '').trim().toLowerCase();
    if (trialModule !== COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) return false;
    const access = resolveCompanyAccessState(company);
    return access.state === 'trial' || access.state === 'trial_ending';
  }

  private isCompanyCommercialAccessAllowed(company: any) {
    if (this.isPlatformInfraCommercialCompany(company)) return true;
    return resolveCompanyAccessState(company).canUse;
  }

  private isEntitlementUsable(row: any) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (!isCommercialEntitlementActive(status)) return false;
    if (status === 'trialing' && row?.currentPeriodEnd instanceof Date) {
      return row.currentPeriodEnd.getTime() >= Date.now();
    }
    return true;
  }

  private resolveEntitlements(company: any): Record<CommercialEntitlementKey, boolean> {
    if (this.isPlatformInfraCommercialCompany(company) || !this.isCompanyCommercialAccessAllowed(company)) {
      return {
        vendas: false,
        atendimento_chat: false,
        webscraping: false,
        recovery: false,
        night_factory: false,
        radar_premium: false,
        recovery_intelligence: false,
        digital_audit: false,
        opportunity_score: false,
        ai_sales_scripts: false,
      };
    }

    const entitlements = Array.isArray(company?.commercialEntitlements)
      ? company.commercialEntitlements
      : [];
    const has = (key: CommercialEntitlementKey) =>
      entitlements.some((row: any) => String(row?.key || '').trim().toLowerCase() === key && this.isEntitlementUsable(row));

    const access = resolveCompanyAccessState(company);
    // Cortesia (manual/isenta) libera o fallback de entitlements do plano.
    const manualAccess = access.state === 'manual' || access.state === 'exempt';
    const manualPlanKey = resolveCommercialPlanKeyForCapabilities({
      selectedPlanKey: company?.selectedPlanKey,
    });
    const manualPlanKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[manualPlanKey] || []);
    const hasWithManualFallback = (key: CommercialEntitlementKey) =>
      has(key) || (manualAccess && manualPlanKeys.has(key));

    const vendas = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) || this.isCompanyTrialingVendas(company);
    const radarPremium = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RADAR_PREMIUM);
    const nightFactory = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY);
    const recoveryIntelligence = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RECOVERY_INTELLIGENCE);

    return {
      vendas,
      atendimento_chat: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT) || this.isCompanyTrialingVendas(company),
      webscraping: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING) || this.isCompanyTrialingVendas(company),
      recovery: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RECOVERY),
      night_factory: nightFactory,
      radar_premium: radarPremium,
      recovery_intelligence: recoveryIntelligence,
      digital_audit: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.DIGITAL_AUDIT),
      opportunity_score: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.OPPORTUNITY_SCORE) || vendas,
      ai_sales_scripts: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.AI_SALES_SCRIPTS) || radarPremium,
    };
  }

  private isPlatformInfraCommercialCompany(company: any) {
    return isPlatformInfraCompany(company);
  }

  private assertTenantCommercialPlanContext(company: any) {
    if (this.isPlatformInfraCommercialCompany(company)) {
      throw new ForbiddenException('Empresa tecnica da plataforma nao pode receber plano comercial.');
    }
  }

  private buildFullEntitlements(): Record<CommercialEntitlementKey, boolean> {
    return {
      vendas: true,
      atendimento_chat: true,
      webscraping: true,
      recovery: true,
      night_factory: true,
      radar_premium: true,
      recovery_intelligence: true,
      digital_audit: true,
      opportunity_score: true,
      ai_sales_scripts: true,
    };
  }

  private normalizePlanKey(value: unknown): ActiveCommercialPlanKey | null {
    if (!String(value || '').trim()) return null;
    return normalizeCommercialPlanKey(value);
  }

  private isSupportedPlanKey(value: unknown): value is ActiveCommercialPlanKey {
    const normalized = String(value || '').trim().toLowerCase();
    // MELHOR (Implantação) barrado — é contato, não self-checkout (bloco 026).
    return normalized === COMMERCIAL_PLAN_KEYS.LITE ||
      normalized === COMMERCIAL_PLAN_KEYS.PADRAO ||
      normalized === COMMERCIAL_PLAN_KEYS.PRO;
  }

  private async buildCurrentState(company: any): Promise<CommercialCurrentState> {
    const entitlements = this.resolveEntitlements(company);
    const platformInfra = this.isPlatformInfraCommercialCompany(company);
    const inferredPlanKey = platformInfra
      ? null
      : entitlements.webscraping && entitlements.vendas && !this.isCompanyTrialingVendas(company) && this.normalizePlanKey(company?.selectedPlanKey) === COMMERCIAL_PLAN_KEYS.LITE
        ? COMMERCIAL_PLAN_KEYS.LITE
      : entitlements.vendas
        ? COMMERCIAL_PLAN_KEYS.PADRAO
        : null;
    const companyAccess = resolveCompanyAccessState(company);
    const hasExplicitCommercialPlan = Boolean(
      String(company?.selectedPlanKey || '').trim() ||
      companyAccess.state === 'manual' ||
      companyAccess.state === 'exempt',
    );
    const selectedPlanKey = platformInfra
      ? null
      : hasExplicitCommercialPlan
        ? resolveCommercialPlanKeyForCapabilities({ selectedPlanKey: company?.selectedPlanKey })
        : null;
    const planKey = selectedPlanKey || inferredPlanKey;
    const isTrial = this.isCompanyTrialingVendas(company);
    const billingGraceEndsAt = company?.billingGraceEndsAt instanceof Date ? company.billingGraceEndsAt : null;
    const billingGraceRemainingHours = billingGraceEndsAt
      ? Math.max(0, Math.ceil((billingGraceEndsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
      : null;

    const billingBreakdown = platformInfra
      ? null
      : planKey
      ? await this.computeCompanyCommercialAmount(Number(company?.id || 0), planKey, company?.billingCycle)
      : null;
    const savedCard = platformInfra ? null : await this.loadSavedCard(Number(company?.id || 0));
    const assistedSetupRequired = platformInfra
      ? false
      : Boolean(company?.assistedSetupRequired) || planKey === COMMERCIAL_PLAN_KEYS.MELHOR;
    const rawAssistedSetupStatus = String(company?.assistedSetupStatus || '').trim().toLowerCase();
    const assistedSetupStatus = assistedSetupRequired
      ? rawAssistedSetupStatus === 'completed'
        ? 'completed'
        : 'pending'
      : 'not_required';

    // Tier de inteligência de lead — derivado do planKey real (não entitlements).
    const resolvedTierPlanKey = platformInfra
      ? COMMERCIAL_PLAN_KEYS.MELHOR
      : planKey ?? COMMERCIAL_PLAN_KEYS.PADRAO;
    const tier = getCommercialPlanTier(resolvedTierPlanKey);
    const canSeeLeadIntelligence = tier !== 'list';
    const canSeeCompanyData = tier === 'full';

    return {
      planKey,
      entitlements,
      selectedPlanKey,
      contactName: company?.primaryContactName || null,
      contactPhone: company?.contactPhone || null,
      taxDocument: company?.taxDocument || null,
      // Estado de acesso projetado do canonico (DROP): sem campos crus.
      accessState: platformInfra ? null : companyAccess.state,
      accessStateLabel: platformInfra ? null : companyAccess.statusLabel,
      // Neutro: só "pode operar ou não". Mantido para vendedor (não revela motivo
      // financeiro). platform_infra nunca bloqueia.
      accessPaused: platformInfra ? false : !companyAccess.canUse,
      trialEndsAt: company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
      trialRemainingDays: this.computeTrialRemainingDays(company?.trialEndsAt),
      billingGraceEndsAt: billingGraceEndsAt ? billingGraceEndsAt.toISOString() : null,
      billingGraceRemainingHours,
      isTrial,
      billingBreakdown,
      savedCard,
      assistedSetup: {
        required: assistedSetupRequired,
        status: platformInfra ? 'completed' : assistedSetupStatus,
        completedAt: company?.assistedSetupCompletedAt instanceof Date
          ? company.assistedSetupCompletedAt.toISOString()
          : null,
        message:
          !platformInfra && assistedSetupRequired && assistedSetupStatus !== 'completed'
            ? 'Implantação assistida pendente. A HBX configura mensagens, limites, horários e handoff humano antes de liberar automação completa.'
            : null,
      },
      tier,
      canSeeLeadIntelligence,
      canSeeCompanyData,
    };
  }

  private async loadCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      include: {
        commercialEntitlements: true,
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    return company;
  }

  // Cobranca e assunto do contratante (PR-002 D.4): vendedor recebe so o que
  // a UI operacional precisa (plano vigente + entitlements). Status de
  // pagamento, valores, graca, trial e dados cadastrais do contratante NAO
  // saem do backend para role USER.
  private presentCurrentStateForUser(current: CommercialCurrentState, billingAudience: boolean): CommercialCurrentState {
    if (billingAudience) return current;
    return {
      ...current,
      contactName: null,
      contactPhone: null,
      taxDocument: null,
      accessState: null,
      accessStateLabel: null,
      trialEndsAt: null,
      trialRemainingDays: null,
      billingGraceEndsAt: null,
      billingGraceRemainingHours: null,
      billingBreakdown: null,
      savedCard: null,
    };
  }

  // Cartão da assinatura vigente (inclui 'trialing' — o trial já autoriza o cartão).
  // Só o "•••• 4242"/bandeira, nunca o número. Devolve null se não há cartão na ficha.
  private async loadSavedCard(
    companyId: number,
  ): Promise<{ brand: string | null; last4: string | null } | null> {
    if (!companyId) return null;
    const sub = await this.prisma.companySubscription.findFirst({
      where: { companyId, status: { in: ['trialing', 'authorized', 'active', 'past_due', 'paused'] } },
      orderBy: { createdAt: 'desc' },
      select: { cardBrand: true, cardLast4: true },
    });
    const last4 = sub?.cardLast4 ? String(sub.cardLast4).replace(/\D/g, '').slice(-4) : null;
    if (!last4) return null;
    return { brand: sub?.cardBrand ? String(sub.cardBrand) : null, last4 };
  }

  private async buildPayload(company: any, user?: any) {
    const canSelectPlan = user ? this.canSelectPlans(user) : false;
    const plans = buildCommercialPlansCatalog().filter((plan) => !plan.hidden).map((plan) => canSelectPlan
      ? plan
      : {
          ...plan,
          monthlyPrice: null,
          legalCopy: null,
        });
    const current = await this.buildCurrentState(company);
    return {
      current: this.presentCurrentStateForUser(current, canSelectPlan),
      plans,
      permissions: {
        canSelectPlan,
        selectPlanDeniedMessage: canSelectPlan
          ? null
          : 'USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.',
      },
    };
  }

  async getCatalogForUser(user: any) {
    const context = await this.resolveUserContext(user);
    const company = await this.loadCompany(context.companyId);
    this.assertTenantCommercialPlanContext(company);
    return this.buildPayload(company, user);
  }

  async getCurrentStateForCompany(companyId: number) {
    const company = await this.loadCompany(companyId);
    return this.buildCurrentState(company);
  }

  async assertEntitlementForUser(user: any, entitlement: CommercialEntitlementKey) {
    if (Boolean(user?.isSystemMaster)) {
      return {
        planKey: COMMERCIAL_PLAN_KEYS.MELHOR,
        entitlements: this.buildFullEntitlements(),
      };
    }

    const context = await this.resolveUserContext(user);
    const current = await this.getCurrentStateForCompany(context.companyId);
    if (current.entitlements[entitlement]) return current;

    throw new HttpException(
      {
        code: 'COMMERCIAL_PLAN_REQUIRED',
        message: 'Este recurso precisa de um plano HBX ativo.',
        redirectTo: '/configuracoes?sec=Plano+e+cobran%C3%A7a',
        currentEntitlements: current.entitlements,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async assertAssistedSetupCompleteForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        companyKind: true,
        selectedPlanKey: true,
        assistedSetupRequired: true,
        assistedSetupStatus: true,
      },
    });
    if (this.isPlatformInfraCommercialCompany(company)) return;
    const planKey = this.normalizePlanKey(company?.selectedPlanKey);
    const required = planKey === COMMERCIAL_PLAN_KEYS.MELHOR || Boolean(company?.assistedSetupRequired);
    const rawStatus = String(company?.assistedSetupStatus || '').trim().toLowerCase();
    const status = required && rawStatus !== 'completed' ? 'pending' : rawStatus;
    if (!required || status === 'completed') return;
    throw new HttpException(
      {
        code: 'ASSISTED_SETUP_REQUIRED',
        message: 'A automação completa precisa de implantação assistida para evitar bloqueio no WhatsApp.',
        assistedSetup: {
          required: true,
          status: status || 'pending',
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  private resolveSelectionStatus(company: any) {
    return this.isCompanyTrialingVendas(company) ? 'trialing' : 'active';
  }

  private canStartCommercialTrial(company: any, planKey: ActiveCommercialPlanKey) {
    if (planKey !== COMMERCIAL_PLAN_KEYS.PADRAO) return false;
    if (company?.trialStartsAt || company?.trialEndsAt) return false;
    // So quem ainda nao concluiu a contratacao (pending_checkout) pode iniciar
    // trial — projecao do estado unico (DROP), sem ler campos crus.
    return resolveCompanyAccessState(company).state === 'pending_checkout';
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private normalizeText(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  private normalizeDigits(value: unknown) {
    return String(value || '').replace(/\D/g, '');
  }

  private hasRepeatedDigits(value: string) {
    return /^(\d)\1+$/.test(value);
  }

  private isValidCpf(value: unknown) {
    const digits = this.normalizeDigits(value);
    if (digits.length !== 11 || this.hasRepeatedDigits(digits)) return false;
    const calculate = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * (length + 1 - index);
      }
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
  }

  private normalizeBrazilPhone(value: unknown) {
    const digits = this.normalizeDigits(value);
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    return withoutCountry.slice(0, 11);
  }

  private validateTrialProfile(dto: SelectCommercialPlanDto) {
    const contactName = this.normalizeText(dto.trialContactName);
    const contactPhone = this.normalizeBrazilPhone(dto.trialContactPhone);
    const taxDocument = this.normalizeDigits(dto.trialTaxDocument).slice(0, 11);
    if (!contactName || contactName.length < 3) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_NAME_REQUIRED',
        message: 'Informe seu nome completo para iniciar o trial.',
      });
    }
    if (!contactPhone || contactPhone.length < 10) {
      throw new BadRequestException({
        code: 'TRIAL_CONTACT_PHONE_REQUIRED',
        message: 'Informe um telefone de contato válido para iniciar o trial.',
      });
    }
    if (!this.isValidCpf(taxDocument)) {
      throw new BadRequestException({
        code: 'TRIAL_TAX_DOCUMENT_INVALID',
        message: 'Informe um CPF válido para iniciar o trial.',
      });
    }
    if (dto.acceptedTerms !== true) {
      throw new BadRequestException({
        code: 'TRIAL_TERMS_REQUIRED',
        message: 'Aceite os termos do trial para continuar.',
      });
    }
    return { contactName, contactPhone, taxDocument };
  }

  private async syncPlanModulesTx(tx: any, companyId: number, planKey: ActiveCommercialPlanKey, enabled: boolean) {
    const enabledKeys = enabled ? (COMMERCIAL_PLAN_MODULE_KEYS[planKey] || []) : [];
    const enabledModuleRows = enabledKeys.length
      ? await tx.systemModule.findMany({
          where: {
            companyAssignable: true,
            key: { in: enabledKeys },
          },
          select: { id: true },
        })
      : [];

    await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });

    for (const moduleRow of enabledModuleRows) {
      await tx.companyModule.upsert({
        where: {
          companyId_moduleId: {
            companyId,
            moduleId: moduleRow.id,
          },
        },
        update: { enabled: true },
        create: { companyId, moduleId: moduleRow.id, enabled: true },
      });
    }
  }

  private buildSelectionMetadata(
    planKey: ActiveCommercialPlanKey,
    selectedByUserId: number,
    options: { selectedAt?: Date; trialDays?: number } = {},
  ) {
    const requiresAssistedSetup = planKey === COMMERCIAL_PLAN_KEYS.MELHOR;
    return {
      selectedPlanKey: planKey,
      selectedAt: (options.selectedAt || new Date()).toISOString(),
      selectedByUserId,
      trialDays: Number(options.trialDays || 0),
      requiresAssistedSetup,
      setupFeeMode: requiresAssistedSetup ? 'negotiated' : 'none',
    };
  }

  private async syncEntitlementsTx(
    tx: any,
    companyId: number,
    planKey: ActiveCommercialPlanKey,
    status: string,
    source: string,
    periodStart: Date | null,
    periodEnd: Date | null,
    metadata: Record<string, unknown>,
  ) {
    const activeKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[planKey] || []);
    const allKeys = Object.values(COMMERCIAL_ENTITLEMENT_KEYS);

    for (const key of allKeys) {
      if (activeKeys.has(key)) {
        await tx.companyCommercialEntitlement.upsert({
          where: { companyId_key: { companyId, key } },
          update: {
            status,
            source,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            metadataJson: JSON.stringify(metadata),
          },
          create: {
            companyId,
            key,
            status,
            source,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            metadataJson: JSON.stringify(metadata),
          },
        });
      } else {
        await tx.companyCommercialEntitlement.upsert({
          where: { companyId_key: { companyId, key } },
          update: {
            status: 'canceled',
            source: 'plan_change',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            metadataJson: JSON.stringify({
              ...metadata,
              removedByPlanKey: planKey,
            }),
          },
          create: {
            companyId,
            key,
            status: 'canceled',
            source: 'plan_change',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            metadataJson: JSON.stringify({
              ...metadata,
              removedByPlanKey: planKey,
            }),
          },
        });
      }
    }
  }

  async selectPlanForUser(user: any, dto: SelectCommercialPlanDto) {
    const context = await this.resolveUserContext(user);
    if (!context.canSelectPlan) {
      throw new ForbiddenException({
        code: 'USER_PLAN_UPGRADE_NOT_ALLOWED',
        message: 'USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.',
      });
    }

    if (!this.isSupportedPlanKey(dto.planKey)) {
      throw new BadRequestException({
        code: 'INVALID_COMMERCIAL_PLAN',
        message: 'Plano HBX inválido.',
      });
    }
    const normalizedPlanKey = normalizeCommercialPlanKey(dto.planKey);
    // Implantação (MELHOR) é contactOnly — não tem self-checkout (bloco 026).
    if (normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      throw new BadRequestException({
        code: 'CONTACT_ONLY_PLAN',
        message: 'Implantação exige contato com a HBX. Use a tela de seleção de contato.',
      });
    }
    // Self-Checkout (F2): plano pausado pelo master não pode ser contratado.
    if (isCommercialPlanPaused(normalizedPlanKey)) {
      throw new BadRequestException({
        code: 'PLAN_PAUSED',
        message: 'Este plano está temporariamente indisponível. Tente novamente mais tarde.',
      });
    }
    // Sempre false aqui: MELHOR foi barrado acima. Mantido para o branch de
    // trial (dead code; limpeza em 031/032).
    const isAssistedSetupPlan = false;

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
      if (!company) throw new BadRequestException('Empresa nao encontrada.');
      this.assertTenantCommercialPlanContext(company);

      const now = new Date();
      const selectedCatalogPlan = buildCommercialPlansCatalog({ includeHidden: true })
        .find((plan) => plan.key === normalizedPlanKey);
      const selectedTrialDays = Number(selectedCatalogPlan?.trialDays || 0);
      // SEGURANCA / regra travada do dono (16/06): o TRIAL EXIGE CARTAO. Selecionar
      // um plano por aqui NUNCA concede trial sem cartao — o trial so nasce no
      // checkout (/financeiro/subscription/create, que captura o cartao). Antes
      // este caminho liberava 14 dias sem cartao (mesmo furo do cadastro). NUNCA
      // reativar startsTrial aqui sem passar pelo checkout. (canStartCommercialTrial
      // fica reservado para quando o checkout decidir a elegibilidade do trial.)
      const startsTrial = false;
      const trialProfile = startsTrial ? this.validateTrialProfile(dto) : null;
      const selectionMetadata = this.buildSelectionMetadata(normalizedPlanKey, context.userId, {
        selectedAt: now,
        trialDays: startsTrial ? selectedTrialDays : 0,
      });
      if (startsTrial && trialProfile) {
        const existingPhoneTrial = await tx.trialPhoneUsage.findUnique({
          where: { phoneNormalized: trialProfile.contactPhone },
        });
        if (existingPhoneTrial) {
          if (!existingPhoneTrial.companyId) {
            await tx.trialPhoneUsage.delete({ where: { id: existingPhoneTrial.id } });
          } else if (Number(existingPhoneTrial.companyId) === context.companyId) {
            await tx.trialPhoneUsage.delete({ where: { id: existingPhoneTrial.id } });
          } else {
            const trialCompany = await tx.company.findUnique({
              where: { id: Number(existingPhoneTrial.companyId) },
              select: { id: true },
            });
            if (!trialCompany) {
              await tx.trialPhoneUsage.delete({ where: { id: existingPhoneTrial.id } });
            } else {
              throw new ConflictException({
                code: 'TRIAL_PHONE_ALREADY_USED',
                message: 'Este telefone já utilizou o trial HBX. Escolha um plano pago para continuar.',
              });
            }
          }
        }
      }
      // Projecao do estado canonico (DROP): preservar acesso = mesmo plano +
      // empresa ja liberada. Nada de re-derivar paymentStatus/subscription.
      const currentAccess = resolveCompanyAccessState(company);
      const currentSelectedPlanKey = this.normalizePlanKey(company.selectedPlanKey);
      const preserveExistingAccess =
        currentSelectedPlanKey === normalizedPlanKey && currentAccess.canUse;
      const selectionStatus = startsTrial
        ? 'trialing'
        : preserveExistingAccess
          ? currentAccess.state === 'manual' || currentAccess.state === 'exempt'
            ? 'manual'
            : currentAccess.state === 'trial' || currentAccess.state === 'trial_ending'
            ? 'trialing'
            : 'paid'
          : PENDING_COMMERCIAL_ENTITLEMENT_STATUS;
      const selectionSource = selectionStatus === 'trialing' ? 'trial' : selectionStatus === 'manual' ? 'manual' : 'checkout';
      const periodStart = startsTrial
        ? now
        : preserveExistingAccess
          ? company.trialStartsAt || company.subscriptionCurrentPeriodStart || null
          : null;
      const periodEnd = startsTrial
        ? this.addDays(now, selectedTrialDays)
        : preserveExistingAccess
          ? company.trialEndsAt || company.subscriptionCurrentPeriodEnd || null
          : null;

      await tx.company.update({
        where: { id: context.companyId },
        data: startsTrial
          ? {
              // Estado unico nativo (PR-002 C.1): trial iniciado pelo
              // contratante grava status='trial' explicito (sem espelho — DROP).
              status: 'trial',
              statusChangedAt: now,
              statusChangedByUserId: context.userId || null,
              selectedPlanKey: normalizedPlanKey,
              billingCycle: 'MONTHLY',
              primaryContactName: trialProfile?.contactName || company.primaryContactName,
              contactPhone: trialProfile?.contactPhone || company.contactPhone,
              taxDocument: trialProfile?.taxDocument || company.taxDocument,
              trialModuleSelection: 'vendas',
              isActive: true,
              assistedSetupRequired: isAssistedSetupPlan,
              assistedSetupStatus: isAssistedSetupPlan ? 'pending' : 'not_required',
              assistedSetupCompletedAt: null,
              assistedSetupCompletedByUserId: null,
              assistedSetupNote: isAssistedSetupPlan
                ? 'Implantação assistida pendente para liberar automação completa.'
                : null,
              trialStartsAt: periodStart,
              trialEndsAt: periodEnd,
              subscriptionCurrentPeriodStart: null,
              subscriptionCurrentPeriodEnd: null,
              deactivatedAt: null,
            }
          : {
              // Regra de Ouro (bloco 026): só registra intenção — NÃO corta
              // acesso. Status/isActive só mudam após confirmação de pagamento
              // (028=upgrade) ou de crédito (029=downgrade).
              selectedPlanKey: normalizedPlanKey,
              trialModuleSelection: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
            },
      });

      if (startsTrial && trialProfile) {
        await tx.trialPhoneUsage.create({
          data: {
            phoneNormalized: trialProfile.contactPhone,
            companyId: context.companyId,
            firstTrialStartsAt: periodStart,
            firstTrialEndsAt: periodEnd,
            source: 'commercial_plan_trial',
            metadataJson: JSON.stringify({
              acceptedTerms: true,
              acceptedTermsAt: now.toISOString(),
              contactName: trialProfile.contactName,
              taxDocumentProvided: Boolean(trialProfile.taxDocument),
              selectedPlanKey: normalizedPlanKey,
              selectedByUserId: context.userId,
              trialDays: selectedTrialDays,
              requiresAssistedSetup: isAssistedSetupPlan,
              setupFeeMode: isAssistedSetupPlan ? 'negotiated' : 'none',
            }),
          },
        });
      }

      // Regra de Ouro (bloco 026): só sincroniza módulos/entitlements quando
      // o acesso existente é preservado (mesmo plano + empresa já ativa).
      // Troca efetiva (com cobrança ou crédito) acontece nos blocos 028/029.
      if (startsTrial || preserveExistingAccess) {
        await this.syncPlanModulesTx(tx, context.companyId, normalizedPlanKey, true);
        await this.syncEntitlementsTx(
          tx,
          context.companyId,
          normalizedPlanKey,
          selectionStatus,
          selectionSource,
          periodStart,
          periodEnd,
          selectionMetadata,
        );
      }

      const updatedCo = await tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
      return { company: updatedCo, fromPlanKey: currentSelectedPlanKey };
    });

    const direction = classifyPlanChange(updatedCompany.fromPlanKey, normalizedPlanKey);

    return {
      ok: true,
      selectedPlanKey: normalizedPlanKey,
      direction,
      preview: {
        direction,
        currentMonthly: getCommercialPlanMonthlyPrice(updatedCompany.fromPlanKey),
        newMonthly: getCommercialPlanMonthlyPrice(normalizedPlanKey),
      },
      ...(await this.buildPayload(updatedCompany.company, user)),
    };
  }

  // HBX Full = implantação assistida, SEM self-checkout (ordem do dono 14/06): o
  // cliente PEDE e um especialista (o dono) entra em contato. NÃO muda o plano nem
  // libera entitlement aqui (isso seria feature paga sem pagamento — PAGAMENTOS.md);
  // só registra o pedido e dispara o alerta do master. O alerta é best-effort:
  // falha de canal nunca derruba o pedido.
  // Pedido de Implantação com mensagem livre (bloco PR16062026025).
  // Envia e-mail para jhonatan@hbxsystem.com.br + alerta in-app do master.
  // Best-effort: falha de canal nunca derruba a resposta.
  async requestImplantacaoContact(user: any, dto: { message?: string }) {
    const context = await this.resolveUserContext(user);
    if (!context.canSelectPlan) {
      throw new ForbiddenException({
        code: 'USER_PLAN_UPGRADE_NOT_ALLOWED',
        message: 'Fale com o ADMIN da empresa para solicitar Implantação.',
      });
    }
    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: { id: true, name: true, primaryContactName: true, contactPhone: true },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const msg = String(dto?.message || '').slice(0, 2000).trim();
    const subject = `Pedido de Implantação — ${company.name || 'empresa'}`;
    const text = [
      `Empresa: ${company.name || '—'}`,
      `Contato: ${company.primaryContactName || '—'}`,
      `Telefone: ${company.contactPhone || '—'}`,
      `E-mail: ${user?.email || '—'}`,
      '',
      msg ? `Mensagem:\n${msg}` : '(sem mensagem adicional)',
    ].join('\n');

    this.mail
      .sendMail({
        to: 'jhonatan@hbxsystem.com.br',
        subject,
        text,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
      })
      .catch(() => {
        // best-effort: falha de SMTP não derruba a resposta
      });

    this.masterAlert
      .notifyFullPlanRequested({
        companyId: company.id,
        companyName: company.name,
        contactName: company.primaryContactName,
        contactPhone: company.contactPhone,
        requestedByEmail: user?.email || null,
      })
      .catch(() => {
        // best-effort: falha de alerta não derruba a resposta
      });

    return {
      ok: true,
      message: 'Recebemos seu pedido de Implantação. A HBX vai te chamar.',
    };
  }
}
