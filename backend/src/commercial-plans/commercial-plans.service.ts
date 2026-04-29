import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BOT_IA_PLAN_REQUIRED_PAYLOAD,
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  PENDING_COMMERCIAL_ENTITLEMENT_STATUS,
  buildCommercialPlansCatalog,
  isCommercialEntitlementActive,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
  type CommercialEntitlementKey,
  type CommercialPlanKey,
} from './commercial-plan-catalog';

type CommercialCurrentState = {
  planKey: ActiveCommercialPlanKey | null;
  entitlements: Record<CommercialEntitlementKey, boolean>;
  selectedPlanKey: ActiveCommercialPlanKey | null;
  onboardingStatus: string | null;
  subscriptionStatus: string | null;
  paymentStatus: string | null;
  trialEndsAt: string | null;
  trialRemainingDays: number | null;
  isTrial: boolean;
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

  private isEntitlementUsable(row: any) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (!isCommercialEntitlementActive(status)) return false;
    if (status === 'trialing' && row?.currentPeriodEnd instanceof Date) {
      return row.currentPeriodEnd.getTime() >= Date.now();
    }
    return true;
  }

  private resolveEntitlements(company: any): Record<CommercialEntitlementKey, boolean> {
    const entitlements = Array.isArray(company?.commercialEntitlements)
      ? company.commercialEntitlements
      : [];
    const has = (key: CommercialEntitlementKey) =>
      entitlements.some((row: any) => String(row?.key || '').trim().toLowerCase() === key && this.isEntitlementUsable(row));

    const vendas = has(COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) || this.isCompanyTrialingVendas(company);
    const botIa = vendas && has(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA);

    return {
      vendas,
      atendimento_chat: has(COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT) || this.isCompanyTrialingVendas(company),
      webscraping: has(COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING) || this.isCompanyTrialingVendas(company),
      bot_ia: botIa,
      recovery: false,
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

  private buildCurrentState(company: any): CommercialCurrentState {
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

    return {
      planKey,
      entitlements,
      selectedPlanKey,
      onboardingStatus: company?.onboardingStatus || null,
      subscriptionStatus: company?.subscriptionStatus || null,
      paymentStatus: company?.paymentStatus || null,
      trialEndsAt: company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
      trialRemainingDays: this.computeTrialRemainingDays(company?.trialEndsAt),
      isTrial,
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

  private buildPayload(company: any, user?: any) {
    const canSelectPlan = user ? this.canSelectPlans(user) : false;
    const plans = buildCommercialPlansCatalog().map((plan) => canSelectPlan
      ? plan
      : {
          ...plan,
          monthlyPrice: null,
          legalCopy: null,
        });
    return {
      current: this.buildCurrentState(company),
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

  private canStartVendasTrial(company: any) {
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

  private buildSelectionMetadata(planKey: ActiveCommercialPlanKey, selectedByUserId: number) {
    return {
      selectedPlanKey: planKey,
      selectedAt: new Date().toISOString(),
      selectedByUserId,
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
    const allKeys = [
      COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
      COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
      COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
      COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
    ];

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

  async selectPlanForUser(user: any, planKey: CommercialPlanKey) {
    const context = this.resolveUserContext(user);
    if (!context.canSelectPlan) {
      throw new ForbiddenException({
        code: 'USER_PLAN_UPGRADE_NOT_ALLOWED',
        message: 'USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.',
      });
    }

    if (!this.isSupportedPlanKey(planKey)) {
      throw new BadRequestException({
        code: 'INVALID_COMMERCIAL_PLAN',
        message: 'Plano HBX inválido.',
      });
    }
    const normalizedPlanKey = normalizeCommercialPlanKey(planKey);

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
      if (!company) throw new BadRequestException('Empresa nao encontrada.');

      const now = new Date();
      const startsTrial = normalizedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO && this.canStartVendasTrial(company);
      const currentSubscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
      const currentPaymentStatus = String(company.paymentStatus || '').trim().toUpperCase();
      const currentSelectedPlanKey = this.normalizePlanKey(company.selectedPlanKey);
      const preserveExistingAccess =
        currentSelectedPlanKey === normalizedPlanKey &&
        (currentSubscriptionStatus === 'active' ||
          currentSubscriptionStatus === 'trialing' ||
          currentPaymentStatus === 'PAID' ||
          currentPaymentStatus === 'TRIAL');
      const selectionStatus = startsTrial
        ? 'trialing'
        : preserveExistingAccess
          ? currentSubscriptionStatus === 'trialing' || currentPaymentStatus === 'TRIAL'
            ? 'trialing'
            : 'paid'
          : PENDING_COMMERCIAL_ENTITLEMENT_STATUS;
      const selectionSource = selectionStatus === 'trialing' ? 'trial' : 'checkout';
      const periodStart = startsTrial
        ? now
        : preserveExistingAccess
          ? company.trialStartsAt || company.subscriptionCurrentPeriodStart || null
          : null;
      const periodEnd = startsTrial
        ? this.addDays(now, 30)
        : preserveExistingAccess
          ? company.trialEndsAt || company.subscriptionCurrentPeriodEnd || null
          : null;

      await tx.company.update({
        where: { id: context.companyId },
        data: startsTrial
          ? {
              selectedPlanKey: normalizedPlanKey,
              billingCycle: 'MONTHLY',
              trialModuleSelection: 'vendas',
              onboardingStatus: 'active_trial',
              isActive: true,
              paymentStatus: 'TRIAL',
              subscriptionStatus: 'trialing',
              premiumAccess: true,
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
                String(company.onboardingStatus || '').trim().toLowerCase() === 'active_paid'
                  ? company.onboardingStatus
                  : 'pending_checkout',
              paymentStatus: 'PENDING',
              subscriptionStatus:
                currentSubscriptionStatus === 'active' || currentSubscriptionStatus === 'trialing'
                  ? company.subscriptionStatus
                  : 'pending_checkout',
              premiumAccess:
                currentSubscriptionStatus === 'active' || currentSubscriptionStatus === 'trialing' || Boolean(company.premiumAccess),
              isActive:
                currentSubscriptionStatus === 'active' ||
                currentSubscriptionStatus === 'trialing' ||
                Boolean(company.isActive && company.premiumAccess),
              deactivatedAt:
                currentSubscriptionStatus === 'active' || currentSubscriptionStatus === 'trialing' ? company.deactivatedAt : now,
            },
      });

      await this.syncPlanModulesTx(tx, context.companyId, normalizedPlanKey, startsTrial || preserveExistingAccess);
      await this.syncEntitlementsTx(
        tx,
        context.companyId,
        normalizedPlanKey,
        selectionStatus,
        selectionSource,
        periodStart,
        periodEnd,
        this.buildSelectionMetadata(normalizedPlanKey, context.userId),
      );

      return tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
    });

    return {
      ok: true,
      selectedPlanKey: normalizedPlanKey,
      ...this.buildPayload(updatedCompany, user),
    };
  }
}
