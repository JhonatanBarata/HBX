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
  COMMERCIAL_PLAN_KEYS,
  buildBotAiIntroMetadata,
  buildCommercialPlansCatalog,
  isCommercialEntitlementActive,
  parseCommercialMetadata,
  type CommercialEntitlementKey,
  type CommercialPlanKey,
} from './commercial-plan-catalog';

type CommercialCurrentState = {
  planKey: CommercialPlanKey | null;
  entitlements: Record<CommercialEntitlementKey, boolean>;
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
      bot_ia: botIa,
      recovery: false,
    };
  }

  private buildCurrentState(company: any): CommercialCurrentState {
    const entitlements = this.resolveEntitlements(company);
    const planKey = entitlements.bot_ia
      ? COMMERCIAL_PLAN_KEYS.VENDAS_IA
      : entitlements.vendas
        ? COMMERCIAL_PLAN_KEYS.VENDAS
        : null;
    const isTrial = this.isCompanyTrialingVendas(company);

    return {
      planKey,
      entitlements,
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
    return {
      current: this.buildCurrentState(company),
      plans: buildCommercialPlansCatalog(),
      permissions: {
        canSelectPlan: user ? this.canSelectPlans(user) : false,
        selectPlanDeniedMessage: 'Peça para um administrador ativar este plano.',
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

  private buildSelectionMetadata(planKey: CommercialPlanKey, selectedByUserId: number) {
    return {
      selectedPlanKey: planKey,
      selectedAt: new Date().toISOString(),
      selectedByUserId,
    };
  }

  async selectPlanForUser(user: any, planKey: CommercialPlanKey) {
    const context = this.resolveUserContext(user);
    if (!context.canSelectPlan) {
      throw new ForbiddenException({
        code: 'PLAN_SELECTION_ADMIN_REQUIRED',
        message: 'Peça para um administrador ativar este plano.',
      });
    }

    if (planKey === COMMERCIAL_PLAN_KEYS.RECOVERY) {
      throw new ConflictException({
        code: 'PLAN_UNAVAILABLE',
        message: 'HBX Recovery: indisponível',
      });
    }

    if (planKey !== COMMERCIAL_PLAN_KEYS.VENDAS && planKey !== COMMERCIAL_PLAN_KEYS.VENDAS_IA) {
      throw new BadRequestException({
        code: 'INVALID_COMMERCIAL_PLAN',
        message: 'Plano HBX inválido.',
      });
    }

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
      if (!company) throw new BadRequestException('Empresa nao encontrada.');

      const selectionStatus = this.resolveSelectionStatus(company);
      const selectionSource = selectionStatus === 'trialing' ? 'trial' : 'checkout';
      const periodStart = company.trialStartsAt || company.subscriptionCurrentPeriodStart || new Date();
      const periodEnd = company.trialEndsAt || company.subscriptionCurrentPeriodEnd || null;

      await tx.companyCommercialEntitlement.upsert({
        where: {
          companyId_key: {
            companyId: context.companyId,
            key: COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
          },
        },
        update: {
          status: selectionStatus,
          source: selectionSource,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          metadataJson: JSON.stringify(this.buildSelectionMetadata(planKey, context.userId)),
        },
        create: {
          companyId: context.companyId,
          key: COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
          status: selectionStatus,
          source: selectionSource,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          metadataJson: JSON.stringify(this.buildSelectionMetadata(planKey, context.userId)),
        },
      });

      if (planKey === COMMERCIAL_PLAN_KEYS.VENDAS_IA) {
        const existingBot = company.commercialEntitlements.find(
          (row: any) => String(row?.key || '').trim().toLowerCase() === COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
        );
        const existingMetadata = parseCommercialMetadata(existingBot?.metadataJson);
        const introMetadata = buildBotAiIntroMetadata();
        const introCyclesRemaining = Number.isFinite(Number(existingMetadata.introCyclesRemaining))
          ? Math.max(0, Math.trunc(Number(existingMetadata.introCyclesRemaining)))
          : introMetadata.introCyclesRemaining;

        await tx.companyCommercialEntitlement.upsert({
          where: {
            companyId_key: {
              companyId: context.companyId,
              key: COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
            },
          },
          update: {
            status: 'active',
            source: 'checkout',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            metadataJson: JSON.stringify({
              ...introMetadata,
              ...existingMetadata,
              introCyclesRemaining,
              ...this.buildSelectionMetadata(planKey, context.userId),
            }),
          },
          create: {
            companyId: context.companyId,
            key: COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA,
            status: 'active',
            source: 'checkout',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            metadataJson: JSON.stringify({
              ...introMetadata,
              ...this.buildSelectionMetadata(planKey, context.userId),
            }),
          },
        });
      }

      return tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        include: { commercialEntitlements: true },
      });
    });

    return {
      ok: true,
      selectedPlanKey: planKey,
      ...this.buildPayload(updatedCompany, user),
    };
  }
}
