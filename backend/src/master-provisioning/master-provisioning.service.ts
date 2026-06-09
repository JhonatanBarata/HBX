import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { COMPANY_KIND_TENANT } from '../common/company-kind';
import {
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
  type CommercialEntitlementKey,
} from '../commercial-plans/commercial-plan-catalog';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildTenantProductSeeds,
  ensureHbxTenantProductsTx,
  ensureTenantProductsTx,
  type EnsureTenantProductResult,
  type TenantProductSeed,
  type TenantProductSeedInput,
} from '../products/tenant-product-seed';

type ProvisioningStepStatus = 'ready' | 'done' | 'deferred' | 'pending_schema';

export type MasterProvisioningModuleInput = string | { key: string; enabled?: boolean };

export type MasterProvisioningProductInput = TenantProductSeedInput;

export type MasterProvisioningBackfillProductsInput = {
  companyId?: number | null;
  limit?: number | null;
  dryRun?: boolean | null;
};

export type MasterProvisioningSeedHbxProductsInput = {
  dryRun?: boolean | null;
};

export type MasterProvisioningInput = {
  companyName: string;
  slug?: string | null;
  planKey?: string | null;
  manualAccess?: boolean | null;
  billingCycle?: 'MONTHLY' | 'ANNUAL' | string | null;
  modules?: MasterProvisioningModuleInput[] | null;
  limits?: {
    commercialCardsMonthlyLimitOverride?: number | null;
    commercialCardsDailyLimitOverride?: number | null;
    commissionDueBusinessDays?: number | null;
  } | null;
  admin?: {
    name?: string | null;
    email: string;
    phone?: string | null;
    password?: string | null;
  } | null;
  supportEmail?: string | null;
  replyToEmail?: string | null;
  supportWhatsapp?: string | null;
  products?: MasterProvisioningProductInput[] | null;
  assistedImplementation?: {
    required?: boolean | null;
    completed?: boolean | null;
    note?: string | null;
  } | null;
};

export type MasterProvisioningPlan = {
  tenant: {
    companyKind: typeof COMPANY_KIND_TENANT;
    name: string;
    slug: string;
  };
  commercial: {
    planKey: ActiveCommercialPlanKey;
    manualAccess: boolean;
    billingCycle: 'MONTHLY' | 'ANNUAL';
    entitlementStatus: 'manual' | 'pending_configuration';
  };
  modules: Array<{ key: string; enabled: boolean; source: 'input' | 'plan_default' }>;
  limits: {
    commercialCardsMonthlyLimitOverride: number | null;
    commercialCardsDailyLimitOverride: number | null;
    commissionDueBusinessDays: number;
  };
  admin: {
    name: string | null;
    email: string;
    phone: string | null;
    passwordProvided: boolean;
    mustChangePassword: boolean;
  } | null;
  supportChannels: {
    supportEmail: string | null;
    replyToEmail: string | null;
    supportWhatsapp: string | null;
    persistence: 'pending_schema';
  };
  products: Array<TenantProductSeed & { persistence: 'ready' }>;
  assistedImplementation: {
    required: boolean;
    status: 'not_required' | 'pending' | 'completed';
    note: string | null;
  };
  steps: Array<{ key: string; label: string; status: ProvisioningStepStatus }>;
};

export type MasterProvisioningResult = {
  ok: true;
  companyId: number;
  adminUserId: number | null;
  temporaryPassword: string | null;
  moduleKeys: string[];
  unresolvedModuleKeys: string[];
  entitlementKeys: CommercialEntitlementKey[];
  products: EnsureTenantProductResult[];
  plan: MasterProvisioningPlan;
};

function normalizeText(value: unknown, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizeSlug(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeModuleKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function normalizePositiveInteger(value: unknown, min: number, max: number, fallback: number | null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

@Injectable()
export class MasterProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  buildProvisioningPlan(input: MasterProvisioningInput): MasterProvisioningPlan {
    const companyName = normalizeText(input.companyName, 160);
    if (!companyName) throw new BadRequestException('Nome da empresa e obrigatorio para provisionamento.');

    const slug = normalizeSlug(input.slug || companyName);
    if (!slug) throw new BadRequestException('Slug da empresa e obrigatorio para provisionamento.');

    const planKey = normalizeCommercialPlanKey(input.planKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    const manualAccess = input.manualAccess !== false;
    const billingCycle = String(input.billingCycle || 'MONTHLY').trim().toUpperCase() === 'ANNUAL'
      ? 'ANNUAL'
      : 'MONTHLY';

    const explicitModules = Array.isArray(input.modules) && input.modules.length > 0;
    const moduleInputs = explicitModules
      ? input.modules || []
      : (COMMERCIAL_PLAN_MODULE_KEYS[planKey] || []).map((key) => ({ key, enabled: true }));
    const seenModules = new Set<string>();
    const modules = moduleInputs
      .map((item) => {
        const key = typeof item === 'string' ? item : item?.key;
        const normalizedKey = normalizeModuleKey(key);
        if (!normalizedKey || seenModules.has(normalizedKey)) return null;
        seenModules.add(normalizedKey);
        return {
          key: normalizedKey,
          enabled: typeof item === 'string' ? true : item.enabled !== false,
          source: explicitModules ? 'input' as const : 'plan_default' as const,
        };
      })
      .filter((item): item is { key: string; enabled: boolean; source: 'input' | 'plan_default' } => Boolean(item));

    const adminEmail = input.admin ? normalizeEmail(input.admin.email) : null;
    if (input.admin && !adminEmail) throw new BadRequestException('E-mail do admin inicial e obrigatorio.');

    const assistedRequired = Boolean(input.assistedImplementation?.required);
    const assistedCompleted = Boolean(input.assistedImplementation?.completed);
    const assistedStatus = assistedCompleted
      ? 'completed'
      : assistedRequired
        ? 'pending'
        : 'not_required';

    const products = buildTenantProductSeeds(input.products, { source: 'master_provisioning' })
      .map((product) => ({ ...product, persistence: 'ready' as const }));

    const supportChannels = {
      supportEmail: normalizeEmail(input.supportEmail),
      replyToEmail: normalizeEmail(input.replyToEmail),
      supportWhatsapp: normalizeText(input.supportWhatsapp, 40),
      persistence: 'pending_schema' as const,
    };

    return {
      tenant: {
        companyKind: COMPANY_KIND_TENANT,
        name: companyName,
        slug,
      },
      commercial: {
        planKey,
        manualAccess,
        billingCycle,
        entitlementStatus: manualAccess ? 'manual' : 'pending_configuration',
      },
      modules,
      limits: {
        commercialCardsMonthlyLimitOverride: normalizePositiveInteger(
          input.limits?.commercialCardsMonthlyLimitOverride,
          1,
          999999,
          null,
        ),
        commercialCardsDailyLimitOverride: normalizePositiveInteger(
          input.limits?.commercialCardsDailyLimitOverride,
          1,
          999999,
          null,
        ),
        commissionDueBusinessDays: normalizePositiveInteger(input.limits?.commissionDueBusinessDays, 0, 30, 3) ?? 3,
      },
      admin: input.admin
        ? {
            name: normalizeText(input.admin.name, 120),
            email: adminEmail,
            phone: normalizeText(input.admin.phone, 40),
            passwordProvided: Boolean(String(input.admin.password || '').trim()),
            mustChangePassword: true,
          }
        : null,
      supportChannels,
      products,
      assistedImplementation: {
        required: assistedRequired,
        status: assistedStatus,
        note: normalizeText(input.assistedImplementation?.note, 500),
      },
      steps: [
        { key: 'create_tenant', label: 'Criar tenant', status: 'ready' },
        { key: 'configure_plan_manual', label: 'Configurar plano/manual', status: 'ready' },
        { key: 'release_modules', label: 'Liberar modulos', status: modules.length ? 'ready' : 'deferred' },
        { key: 'configure_limits', label: 'Configurar limites', status: 'ready' },
        { key: 'create_initial_admin', label: 'Criar admin inicial', status: input.admin ? 'ready' : 'deferred' },
        { key: 'configure_support_channels', label: 'Configurar canais de suporte', status: 'pending_schema' },
        { key: 'prepare_initial_products', label: 'Preparar produtos iniciais', status: products.length ? 'ready' : 'deferred' },
        { key: 'mark_assisted_implementation', label: 'Marcar implantacao assistida', status: 'ready' },
      ],
    };
  }

  async provisionTenant(input: MasterProvisioningInput): Promise<MasterProvisioningResult> {
    const plan = this.buildProvisioningPlan(input);
    const existingCompany = await this.prisma.company.findUnique({ where: { slug: plan.tenant.slug }, select: { id: true } });
    if (existingCompany) throw new BadRequestException('Ja existe empresa com este slug.');

    if (plan.admin) {
      const existingAdmin = await this.prisma.user.findFirst({
        where: { OR: [{ email: plan.admin.email }, { username: plan.admin.email }] },
        select: { id: true },
      });
      if (existingAdmin) throw new BadRequestException('Ja existe usuario com este e-mail/login.');
    }

    const temporaryPassword = plan.admin?.passwordProvided ? null : randomUUID().replace(/-/g, '').slice(0, 14);
    const adminPassword = plan.admin
      ? String(input.admin?.password || temporaryPassword || '')
      : '';
    const adminPasswordHash = plan.admin ? await bcrypt.hash(adminPassword, 12) : null;
    const entitlementKeys = COMMERCIAL_PLAN_ENTITLEMENT_KEYS[plan.commercial.planKey] || [];

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: plan.tenant.name,
          slug: plan.tenant.slug,
          companyKind: COMPANY_KIND_TENANT,
          selectedPlanKey: plan.commercial.planKey,
          onboardingStatus: plan.commercial.manualAccess ? 'active_paid' : 'pending_email_confirmation',
          paymentStatus: plan.commercial.manualAccess ? 'MANUAL' : 'PENDING',
          subscriptionStatus: plan.commercial.manualAccess ? 'manual' : 'trialing',
          paymentMethod: plan.commercial.manualAccess ? 'MANUAL' : 'NONE',
          billingProvider: 'manual',
          premiumAccess: plan.commercial.manualAccess,
          billingCycle: plan.commercial.billingCycle,
          contactEmail: plan.supportChannels.supportEmail || plan.admin?.email || null,
          contactPhone: plan.supportChannels.supportWhatsapp || plan.admin?.phone || null,
          commercialCardsMonthlyLimitOverride: plan.limits.commercialCardsMonthlyLimitOverride,
          commercialCardsDailyLimitOverride: plan.limits.commercialCardsDailyLimitOverride,
          commissionDueBusinessDays: plan.limits.commissionDueBusinessDays,
          assistedSetupRequired: plan.assistedImplementation.required,
          assistedSetupStatus: plan.assistedImplementation.status,
          assistedSetupCompletedAt: plan.assistedImplementation.status === 'completed' ? new Date() : null,
          assistedSetupNote: plan.assistedImplementation.note,
          isActive: true,
        },
        select: { id: true },
      });

      const moduleRows = plan.modules.length
        ? await tx.systemModule.findMany({
            where: {
              companyAssignable: true,
              key: { in: plan.modules.map((moduleItem) => moduleItem.key) },
            },
            select: { id: true, key: true },
          })
        : [];
      const moduleIdByKey = new Map(moduleRows.map((row) => [String(row.key), Number(row.id)]));
      for (const moduleItem of plan.modules) {
        const moduleId = moduleIdByKey.get(moduleItem.key);
        if (!moduleId) continue;
        await tx.companyModule.upsert({
          where: { companyId_moduleId: { companyId: company.id, moduleId } },
          update: { enabled: moduleItem.enabled },
          create: { companyId: company.id, moduleId, enabled: moduleItem.enabled },
        });
      }

      if (plan.commercial.manualAccess) {
        const now = new Date();
        for (const key of entitlementKeys) {
          await tx.companyCommercialEntitlement.upsert({
            where: { companyId_key: { companyId: company.id, key } },
            update: {
              status: 'manual',
              source: 'master_provisioning',
              currentPeriodStart: now,
              currentPeriodEnd: null,
              metadataJson: JSON.stringify({ planKey: plan.commercial.planKey, source: 'master_provisioning' }),
            },
            create: {
              companyId: company.id,
              key,
              status: 'manual',
              source: 'master_provisioning',
              currentPeriodStart: now,
              currentPeriodEnd: null,
              metadataJson: JSON.stringify({ planKey: plan.commercial.planKey, source: 'master_provisioning' }),
            },
          });
        }
      }

      const admin = plan.admin && adminPasswordHash
        ? await tx.user.create({
            data: {
              companyId: company.id,
              role: 'ADMIN',
              isSystemMaster: false,
              isActive: true,
              email: plan.admin.email,
              username: plan.admin.email,
              emailConfirmedAt: new Date(),
              name: plan.admin.name,
              phone: plan.admin.phone,
              password: adminPasswordHash,
              mustChangePassword: true,
            },
            select: { id: true },
          })
        : null;

      const products = await ensureTenantProductsTx(tx, company.id, plan.products, {
        authorId: admin?.id || null,
      });

      return {
        companyId: company.id,
        adminUserId: admin?.id || null,
        resolvedModuleKeys: moduleRows.map((row) => String(row.key)),
        products,
      };
    });

    const resolved = new Set(result.resolvedModuleKeys);
    return {
      ok: true,
      companyId: result.companyId,
      adminUserId: result.adminUserId,
      temporaryPassword,
      moduleKeys: result.resolvedModuleKeys,
      unresolvedModuleKeys: plan.modules.map((moduleItem) => moduleItem.key).filter((key) => !resolved.has(key)),
      entitlementKeys,
      products: result.products,
      plan,
    };
  }

  async backfillTenantProducts(input: MasterProvisioningBackfillProductsInput = {}) {
    const companyId = normalizePositiveInteger(input.companyId, 1, 999999999, null);
    const dryRun = input.dryRun !== false;
    const limit = companyId
      ? 1
      : normalizePositiveInteger(input.limit, 1, 500, 100) ?? 100;
    const companies = await this.prisma.company.findMany({
      where: companyId
        ? { id: companyId, companyKind: COMPANY_KIND_TENANT }
        : { companyKind: COMPANY_KIND_TENANT },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
    const seeds = buildTenantProductSeeds(null, {
      source: 'tenant_product_backfill',
      defaultStatus: 'draft',
    });
    const rows: Array<{
      companyId: number;
      companyName: string;
      products: EnsureTenantProductResult[];
    }> = [];

    for (const company of companies) {
      const products = dryRun
        ? await ensureTenantProductsTx(this.prisma, company.id, seeds, { dryRun: true })
        : await this.prisma.$transaction((tx) => ensureTenantProductsTx(tx, company.id, seeds));
      rows.push({
        companyId: company.id,
        companyName: company.name,
        products,
      });
    }

    return {
      ok: true as const,
      dryRun,
      companyCount: rows.length,
      createdCount: rows.reduce(
        (total, row) => total + row.products.filter((product) => product.created).length,
        0,
      ),
      wouldCreateCount: rows.reduce(
        (total, row) => total + row.products.filter((product) => product.wouldCreate).length,
        0,
      ),
      rows,
    };
  }

  async seedHbxTenantProducts(input: MasterProvisioningSeedHbxProductsInput = {}) {
    const dryRun = input.dryRun !== false;
    const result = dryRun
      ? await ensureHbxTenantProductsTx(this.prisma, { dryRun: true })
      : await this.prisma.$transaction((tx) => ensureHbxTenantProductsTx(tx));

    return {
      ...result,
      createdCount: result.products.filter((product) => product.created).length,
      wouldCreateCount: result.products.filter((product) => product.wouldCreate).length,
    };
  }
}
