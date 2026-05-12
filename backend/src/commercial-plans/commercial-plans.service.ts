import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SelectCommercialPlanDto } from './dto/select-commercial-plan.dto';
import {
  BOT_IA_PLAN_REQUIRED_PAYLOAD,
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  PENDING_COMMERCIAL_ENTITLEMENT_STATUS,
  buildCommercialPlansCatalog,
  isCommercialEntitlementActive,
  normalizeCommercialPlanKey,
  toCommercialCurrency,
  type ActiveCommercialPlanKey,
  type CommercialEntitlementKey,
  type CommercialPlanKey,
} from './commercial-plan-catalog';

type CommercialCurrentState = {
  planKey: ActiveCommercialPlanKey | null;
  entitlements: Record<CommercialEntitlementKey, boolean>;
  selectedPlanKey: ActiveCommercialPlanKey | null;
  contactName: string | null;
  contactPhone: string | null;
  taxDocument: string | null;
  onboardingStatus: string | null;
  subscriptionStatus: string | null;
  paymentStatus: string | null;
  premiumAccess: boolean;
  trialEndsAt: string | null;
  trialRemainingDays: number | null;
  billingGraceEndsAt: string | null;
  billingGraceRemainingHours: number | null;
  isTrial: boolean;
  billingBreakdown?: CommercialBillingBreakdown | null;
  assistedSetup: {
    required: boolean;
    status: string;
    completedAt: string | null;
    message: string | null;
  };
};

type CommercialBillingBreakdown = {
  baseMonthly: number;
  includedUsers: number;
  billableUsers: number;
  extraUsers: number;
  extraUserMonthlyPrice: number;
  extraUsersMonthlyAmount: number;
  monthlyTotal: number;
  cycleAmount: number;
};

@Injectable()
export class CommercialPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveUserContext(user: any) {
    const companyId = Number(user?.companyId || user?.company?.id || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
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
    return this.prisma.user.count({
      where: {
        companyId: Number(companyId),
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
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
    const billableUsers = await this.getBillableUserCount(companyId);
    const includedUsers = planKey === COMMERCIAL_PLAN_KEYS.MELHOR ? Number(catalogPlan?.includedUsers || 1) : 1;
    const extraUserMonthlyPrice = planKey === COMMERCIAL_PLAN_KEYS.MELHOR
      ? toCommercialCurrency(catalogPlan?.extraUserMonthlyPrice ?? 0)
      : 0;
    const extraUsers = planKey === COMMERCIAL_PLAN_KEYS.MELHOR
      ? Math.max(0, billableUsers - includedUsers)
      : 0;
    const extraUsersMonthlyAmount = toCommercialCurrency(extraUsers * extraUserMonthlyPrice);
    const monthlyTotal = toCommercialCurrency(baseMonthly + extraUsersMonthlyAmount);
    const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const cycleAmount = billingCycle === 'ANNUAL'
      ? toCommercialCurrency(monthlyTotal * 12 * (1 - COMMERCIAL_PRICING.annualDiscountPercent / 100))
      : monthlyTotal;

    return {
      baseMonthly,
      includedUsers,
      billableUsers,
      extraUsers,
      extraUserMonthlyPrice,
      extraUsersMonthlyAmount,
      monthlyTotal,
      cycleAmount,
    };
  }

  private isCompanyTrialingVendas(company: any) {
    const trialModule = String(company?.trialModuleSelection || '').trim().toLowerCase();
    if (trialModule !== COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) return false;
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const trialEndsAt = company?.trialEndsAt instanceof Date ? company.trialEndsAt : null;
    if (trialEndsAt && trialEndsAt.getTime() < Date.now()) return false;
    return paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing' || onboardingStatus === 'active_trial';
  }

  private isCompanyCommercialAccessAllowed(company: any) {
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const billingGraceEndsAt = company?.billingGraceEndsAt instanceof Date ? company.billingGraceEndsAt : null;
    const graceActive =
      subscriptionStatus === 'grace' && billingGraceEndsAt && billingGraceEndsAt.getTime() >= Date.now();

    if (paymentStatus === 'DISABLED' || paymentStatus === 'EXPIRED') return false;
    if (subscriptionStatus === 'canceled' || subscriptionStatus === 'expired') return false;
    if (onboardingStatus === 'suspended') return false;
    if (graceActive) return true;
    return (
      paymentStatus === 'PAID' ||
      paymentStatus === 'TRIAL' ||
      paymentStatus === 'MANUAL' ||
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'trialing' ||
      subscriptionStatus === 'manual' ||
      Boolean(company?.premiumAccess)
    );
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
    if (!this.isCompanyCommercialAccessAllowed(company)) {
      return {
        vendas: false,
        atendimento_chat: false,
        webscraping: false,
        bot_ia: false,
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

    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const manualAccess = Boolean(company?.premiumAccess) || paymentStatus === 'MANUAL' || subscriptionStatus === 'manual';
    const manualPlanKey = this.normalizePlanKey(company?.selectedPlanKey) || COMMERCIAL_PLAN_KEYS.PADRAO;
    const manualPlanKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[manualPlanKey] || []);
    const hasWithManualFallback = (key: CommercialEntitlementKey) =>
      has(key) || (manualAccess && manualPlanKeys.has(key));

    const vendas = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) || this.isCompanyTrialingVendas(company);
    const botIa = vendas && hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA);
    const radarPremium = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RADAR_PREMIUM);
    const nightFactory = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY);
    const recoveryIntelligence = hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RECOVERY_INTELLIGENCE);

    return {
      vendas,
      atendimento_chat: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT) || this.isCompanyTrialingVendas(company),
      webscraping: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING) || this.isCompanyTrialingVendas(company),
      bot_ia: botIa,
      recovery: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.RECOVERY),
      night_factory: nightFactory,
      radar_premium: radarPremium,
      recovery_intelligence: recoveryIntelligence,
      digital_audit: botIa && hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.DIGITAL_AUDIT),
      opportunity_score: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.OPPORTUNITY_SCORE) || vendas,
      ai_sales_scripts: hasWithManualFallback(COMMERCIAL_ENTITLEMENT_KEYS.AI_SALES_SCRIPTS) || radarPremium || botIa,
    };
  }

  private normalizePlanKey(value: unknown): ActiveCommercialPlanKey | null {
    if (!String(value || '').trim()) return null;
    return normalizeCommercialPlanKey(value);
  }

  private isSupportedPlanKey(value: unknown): value is ActiveCommercialPlanKey {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === COMMERCIAL_PLAN_KEYS.LITE ||
      normalized === COMMERCIAL_PLAN_KEYS.PADRAO ||
      normalized === COMMERCIAL_PLAN_KEYS.MELHOR;
  }

  private async buildCurrentState(company: any): Promise<CommercialCurrentState> {
    const entitlements = this.resolveEntitlements(company);
    const inferredPlanKey = entitlements.bot_ia
      ? COMMERCIAL_PLAN_KEYS.MELHOR
      : entitlements.webscraping && entitlements.vendas && !this.isCompanyTrialingVendas(company) && this.normalizePlanKey(company?.selectedPlanKey) === COMMERCIAL_PLAN_KEYS.LITE
        ? COMMERCIAL_PLAN_KEYS.LITE
      : entitlements.vendas
        ? COMMERCIAL_PLAN_KEYS.PADRAO
        : null;
    const selectedPlanKey = this.normalizePlanKey(company?.selectedPlanKey);
    const planKey = selectedPlanKey || inferredPlanKey;
    const isTrial = this.isCompanyTrialingVendas(company);
    const billingGraceEndsAt = company?.billingGraceEndsAt instanceof Date ? company.billingGraceEndsAt : null;
    const billingGraceRemainingHours = billingGraceEndsAt
      ? Math.max(0, Math.ceil((billingGraceEndsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
      : null;

    const billingBreakdown = planKey
      ? await this.computeCompanyCommercialAmount(Number(company?.id || 0), planKey, company?.billingCycle)
      : null;
    const assistedSetupRequired = Boolean(company?.assistedSetupRequired) || planKey === COMMERCIAL_PLAN_KEYS.MELHOR;
    const rawAssistedSetupStatus = String(company?.assistedSetupStatus || '').trim().toLowerCase();
    const assistedSetupStatus = assistedSetupRequired
      ? rawAssistedSetupStatus === 'completed'
        ? 'completed'
        : 'pending'
      : 'not_required';

    return {
      planKey,
      entitlements,
      selectedPlanKey,
      contactName: company?.primaryContactName || null,
      contactPhone: company?.contactPhone || null,
      taxDocument: company?.taxDocument || null,
      onboardingStatus: company?.onboardingStatus || null,
      subscriptionStatus: company?.subscriptionStatus || null,
      paymentStatus: company?.paymentStatus || null,
      premiumAccess: Boolean(company?.premiumAccess),
      trialEndsAt: company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
      trialRemainingDays: this.computeTrialRemainingDays(company?.trialEndsAt),
      billingGraceEndsAt: billingGraceEndsAt ? billingGraceEndsAt.toISOString() : null,
      billingGraceRemainingHours,
      isTrial,
      billingBreakdown,
      assistedSetup: {
        required: assistedSetupRequired,
        status: assistedSetupStatus,
        completedAt: company?.assistedSetupCompletedAt instanceof Date
          ? company.assistedSetupCompletedAt.toISOString()
          : null,
        message:
          assistedSetupRequired && assistedSetupStatus !== 'completed'
            ? 'Implantação assistida pendente. A HBX configura mensagens, limites, horários e handoff humano antes de liberar automação completa.'
            : null,
      },
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

  private async buildPayload(company: any, user?: any) {
    const canSelectPlan = user ? this.canSelectPlans(user) : false;
    const plans = buildCommercialPlansCatalog().filter((plan) => !plan.hidden).map((plan) => canSelectPlan
      ? plan
      : {
          ...plan,
          monthlyPrice: null,
          legalCopy: null,
        });
    return {
      current: await this.buildCurrentState(company),
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
    const context = this.resolveUserContext(user);
    const company = await this.loadCompany(context.companyId);
    return this.buildPayload(company, user);
  }

  async getCurrentStateForCompany(companyId: number) {
    const company = await this.loadCompany(companyId);
    return this.buildCurrentState(company);
  }

  async hasBotAiForCompany(companyId: number) {
    const current = await this.getCurrentStateForCompany(companyId);
    return Boolean(current.entitlements.vendas && current.entitlements.bot_ia);
  }

  async assertEntitlementForUser(user: any, entitlement: CommercialEntitlementKey) {
    const context = this.resolveUserContext(user);
    const current = await this.getCurrentStateForCompany(context.companyId);
    if (current.entitlements[entitlement]) return current;

    if (entitlement === COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA) {
      this.throwBotAiRequired(current);
    }

    throw new HttpException(
      {
        code: 'COMMERCIAL_PLAN_REQUIRED',
        message: 'Este recurso precisa de um plano HBX ativo.',
        redirectTo: '/dashboard/planos',
        currentEntitlements: current.entitlements,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async assertBotAiEntitlementForUser(user: any) {
    return this.assertEntitlementForUser(user, COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA);
  }

  async assertBotAiEntitlementForCompany(companyId: number) {
    const current = await this.getCurrentStateForCompany(companyId);
    if (current.entitlements.vendas && current.entitlements.bot_ia) return current;
    this.throwBotAiRequired(current);
  }

  async assertAssistedSetupCompleteForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        selectedPlanKey: true,
        assistedSetupRequired: true,
        assistedSetupStatus: true,
      },
    });
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

  private throwBotAiRequired(current: CommercialCurrentState): never {
    throw new HttpException(
      {
        ...BOT_IA_PLAN_REQUIRED_PAYLOAD,
        currentEntitlements: current.entitlements,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private resolveSelectionStatus(company: any) {
    return this.isCompanyTrialingVendas(company) ? 'trialing' : 'active';
  }

  private canStartCommercialTrial(company: any, planKey: ActiveCommercialPlanKey) {
    if (planKey !== COMMERCIAL_PLAN_KEYS.LITE && planKey !== COMMERCIAL_PLAN_KEYS.MELHOR) return false;
    if (company?.trialStartsAt || company?.trialEndsAt) return false;
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    if (paymentStatus === 'EXPIRED' || subscriptionStatus === 'expired') return false;
    if (paymentStatus === 'PAID' || subscriptionStatus === 'active' || Boolean(company?.premiumAccess)) return false;
    return true;
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
    const context = this.resolveUserContext(user);
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

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
      if (!company) throw new BadRequestException('Empresa nao encontrada.');

      const now = new Date();
      const selectedCatalogPlan = buildCommercialPlansCatalog({ includeHidden: true })
        .find((plan) => plan.key === normalizedPlanKey);
      const selectedTrialDays = Number(selectedCatalogPlan?.trialDays || 0);
      const startsTrial = selectedTrialDays > 0 && this.canStartCommercialTrial(company, normalizedPlanKey);
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
      const currentSubscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
      const currentPaymentStatus = String(company.paymentStatus || '').trim().toUpperCase();
      const currentSelectedPlanKey = this.normalizePlanKey(company.selectedPlanKey);
      const preserveExistingAccess =
        currentSelectedPlanKey === normalizedPlanKey &&
        (currentSubscriptionStatus === 'active' ||
          currentSubscriptionStatus === 'authorized' ||
          currentSubscriptionStatus === 'manual' ||
          currentSubscriptionStatus === 'trialing' ||
          currentPaymentStatus === 'PAID' ||
          currentPaymentStatus === 'MANUAL' ||
          currentPaymentStatus === 'TRIAL' ||
          Boolean(company.premiumAccess));
      const selectionStatus = startsTrial
        ? 'trialing'
        : preserveExistingAccess
          ? currentSubscriptionStatus === 'manual' || currentPaymentStatus === 'MANUAL' || Boolean(company.premiumAccess)
            ? 'manual'
            : currentSubscriptionStatus === 'trialing' || currentPaymentStatus === 'TRIAL'
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
              selectedPlanKey: normalizedPlanKey,
              billingCycle: 'MONTHLY',
              primaryContactName: trialProfile?.contactName || company.primaryContactName,
              contactPhone: trialProfile?.contactPhone || company.contactPhone,
              taxDocument: trialProfile?.taxDocument || company.taxDocument,
              trialModuleSelection: 'vendas',
              onboardingStatus: 'active_trial',
              isActive: true,
              paymentStatus: 'TRIAL',
              subscriptionStatus: 'trialing',
              premiumAccess: true,
              assistedSetupRequired: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
              assistedSetupStatus: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR ? 'pending' : 'not_required',
              assistedSetupCompletedAt: null,
              assistedSetupCompletedByUserId: null,
              assistedSetupNote: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
                ? 'Implantação assistida pendente para liberar automação completa.'
                : null,
              trialStartsAt: periodStart,
              trialEndsAt: periodEnd,
              subscriptionCurrentPeriodStart: null,
              subscriptionCurrentPeriodEnd: null,
              deactivatedAt: null,
            }
          : {
              selectedPlanKey: normalizedPlanKey,
              trialModuleSelection: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
              onboardingStatus:
                preserveExistingAccess
                  ? String(company.onboardingStatus || '').trim().toLowerCase() === 'pending_checkout'
                    ? 'active_paid'
                    : company.onboardingStatus
                : String(company.onboardingStatus || '').trim().toLowerCase() === 'active_paid'
                  ? company.onboardingStatus
                  : 'pending_checkout',
              paymentStatus: preserveExistingAccess ? company.paymentStatus : 'PENDING',
              subscriptionStatus:
                preserveExistingAccess ||
                currentSubscriptionStatus === 'active' ||
                currentSubscriptionStatus === 'trialing'
                  ? company.subscriptionStatus
                  : 'pending_checkout',
              premiumAccess:
                preserveExistingAccess ||
                currentSubscriptionStatus === 'active' ||
                currentSubscriptionStatus === 'trialing' ||
                Boolean(company.premiumAccess),
              assistedSetupRequired: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
              assistedSetupStatus:
                normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
                  ? String(company.assistedSetupStatus || '').trim().toLowerCase() === 'completed'
                    ? 'completed'
                    : 'pending'
                  : 'not_required',
              assistedSetupCompletedAt:
                normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
                  ? company.assistedSetupCompletedAt
                  : null,
              assistedSetupCompletedByUserId:
                normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR
                  ? company.assistedSetupCompletedByUserId
                  : null,
              isActive:
                preserveExistingAccess ||
                currentSubscriptionStatus === 'active' ||
                currentSubscriptionStatus === 'trialing' ||
                Boolean(company.isActive && company.premiumAccess),
              deactivatedAt:
                preserveExistingAccess || currentSubscriptionStatus === 'active' || currentSubscriptionStatus === 'trialing'
                  ? company.deactivatedAt
                  : now,
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
              requiresAssistedSetup: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR,
              setupFeeMode: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR ? 'negotiated' : 'none',
            }),
          },
        });
      }

      await this.syncPlanModulesTx(tx, context.companyId, normalizedPlanKey, startsTrial || preserveExistingAccess);
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

      return tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
    });

    return {
      ok: true,
      selectedPlanKey: normalizedPlanKey,
      ...(await this.buildPayload(updatedCompany, user)),
    };
  }
}
