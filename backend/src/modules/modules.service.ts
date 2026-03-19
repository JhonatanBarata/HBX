import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import structuralDefaults from '../bootstrap/structural-defaults.json';

type DefaultModuleDef = {
  key: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  companyAssignable: boolean;
  serviceUrl?: string;
};

const DEFAULT_MODULES: DefaultModuleDef[] = (structuralDefaults.systemModules as DefaultModuleDef[]).map((moduleDef) => ({
  ...moduleDef,
  serviceUrl: moduleDef.key === 'webscraping'
    ? process.env.WEBSCRAPING_URL || moduleDef.serviceUrl || '/hbx/webscraping'
    : moduleDef.serviceUrl,
}));

const LEGACY_MODULE_KEYS = structuralDefaults.legacyModuleKeys as string[];
const RETIRED_MODULE_KEYS = ['hbx_music'];

@Injectable()
export class ModulesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly usersService: UsersService) {}

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private buildLegacyEndpointSnapshot(company: any) {
    const phoneNumberId = String(company?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(company?.whatsappAccessToken || '').trim();
    const whatsappNumber = String(company?.whatsappNumber || '').trim();
    if (!phoneNumberId && !accessToken && !whatsappNumber) return [];

    return [
      {
        id: 'legacy-primary',
        label: 'Numero principal',
        moduleKey: null,
        whatsappNumber: company?.whatsappNumber || null,
        whatsappPhoneNumberId: company?.whatsappPhoneNumberId || null,
        whatsappWabaId: company?.whatsappWabaId || null,
        whatsappDisplayNumber: company?.whatsappDisplayNumber || company?.whatsappNumber || null,
        whatsappStatus: company?.whatsappStatus || null,
        whatsappStatusError: company?.whatsappStatusError || null,
        whatsappStatusUpdatedAt: company?.whatsappStatusUpdatedAt || null,
        whatsappAccessToken: company?.whatsappAccessToken || null,
        isActive: true,
        isPrimary: true,
        sortOrder: 0,
      },
    ];
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private mapPaymentStatusToSubscriptionStatus(paymentStatusRaw: string) {
    const normalized = String(paymentStatusRaw || '').trim().toUpperCase();
    if (normalized === 'PAID') return 'active';
    if (normalized === 'TRIAL') return 'trialing';
    if (normalized === 'DISABLED') return 'canceled';
    if (normalized === 'EXPIRED') return 'expired';
    return 'past_due';
  }

  async onModuleInit() {
    await this.ensureDefaultSystemModules();
    await this.removeRetiredSystemModules();
    await this.ensureDatabaseAutomation();
    await this.syncCompanyModulesForAllCompanies();
  }

  private normalizeKey(key: string) {
    return String(key || '').trim().toLowerCase();
  }

  private async resolveUserContext(userId: number) {
    const user = await this.usersService.findById(Number(userId));
    if (!user) throw new ForbiddenException('Usuario nao encontrado');
    const companyId = user.companyId ? Number(user.companyId) : null;
    return { user, companyId, isSystemMaster: Boolean((user as any).isSystemMaster) };
  }

  private async assertMasterUser(masterUserId: number) {
    const { isSystemMaster } = await this.resolveUserContext(masterUserId);
    if (!isSystemMaster) throw new ForbiddenException('Acesso exclusivo do usuario MASTER');
  }

  private async ensureDatabaseAutomation() {
    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_company()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
        SELECT NEW.id, sm.id, sm."defaultEnabled", NOW(), NOW()
        FROM "SystemModule" sm
        WHERE sm."companyAssignable" = true
        ON CONFLICT ("companyId", "moduleId") DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS trg_company_insert_modules ON "Company";');
    await this.prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_company_insert_modules
      AFTER INSERT ON "Company"
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_company_modules_from_company();
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_system_module()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."companyAssignable" = true THEN
          INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
          SELECT c.id, NEW.id, NEW."defaultEnabled", NOW(), NOW()
          FROM "Company" c
          ON CONFLICT ("companyId", "moduleId") DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS trg_system_module_insert_companies ON "SystemModule";');
    await this.prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_system_module_insert_companies
      AFTER INSERT ON "SystemModule"
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_company_modules_from_system_module();
    `);
  }

  private async ensureDefaultSystemModules() {
    for (const moduleDef of DEFAULT_MODULES) {
      await this.prisma.systemModule.upsert({
        where: { key: moduleDef.key },
        update: {
          name: moduleDef.name,
          description: moduleDef.description,
          defaultEnabled: moduleDef.defaultEnabled,
          companyAssignable: moduleDef.companyAssignable,
          serviceUrl: moduleDef.serviceUrl ?? null,
        },
        create: {
          key: moduleDef.key,
          name: moduleDef.name,
          description: moduleDef.description,
          defaultEnabled: moduleDef.defaultEnabled,
          companyAssignable: moduleDef.companyAssignable,
          serviceUrl: moduleDef.serviceUrl ?? null,
        },
      });
    }

    await this.prisma.systemModule.updateMany({
      where: { key: { in: LEGACY_MODULE_KEYS } },
      data: {
        companyAssignable: false,
        defaultEnabled: false,
      },
    });
  }

  private async removeRetiredSystemModules() {
    if (!RETIRED_MODULE_KEYS.length) return;

    const retiredModules = await this.prisma.systemModule.findMany({
      where: { key: { in: RETIRED_MODULE_KEYS } },
      select: { id: true },
    });
    if (!retiredModules.length) return;

    const retiredModuleIds = retiredModules.map((moduleItem) => moduleItem.id);

    await this.prisma.$transaction([
      this.prisma.userModuleAccess.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
      this.prisma.companyModule.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
      this.prisma.systemModule.deleteMany({ where: { id: { in: retiredModuleIds } } }),
    ]);
  }

  private async syncCompanyModulesForAllCompanies() {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
      SELECT c.id, sm.id, sm."defaultEnabled", NOW(), NOW()
      FROM "Company" c
      CROSS JOIN "SystemModule" sm
      WHERE sm."companyAssignable" = true
      ON CONFLICT ("companyId", "moduleId") DO NOTHING;
    `);
  }

  private async evaluateCompanyStatus(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, isActive: true, paymentStatus: true, trialEndsAt: true },
    });
    if (!company) return { exists: false, active: false };

    const now = Date.now();
    const trialExpired = Boolean(company.trialEndsAt && company.trialEndsAt.getTime() < now && company.paymentStatus !== 'PAID');

    if (trialExpired || !company.isActive) {
      await this.prisma.$transaction([
        this.prisma.company.update({
          where: { id: companyId },
          data: {
            isActive: false,
            paymentStatus: trialExpired ? 'EXPIRED' : (company.paymentStatus || 'DISABLED'),
            subscriptionStatus: trialExpired
              ? 'expired'
              : this.mapPaymentStatusToSubscriptionStatus(company.paymentStatus || 'DISABLED'),
            premiumAccess: false,
            deactivatedAt: new Date(),
          },
        }),
        this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: false } }),
      ]);
      return { exists: true, active: false };
    }

    return { exists: true, active: true };
  }

  private async isCompanyModuleEnabled(companyId: number, moduleId: number) {
    const row = await this.prisma.companyModule.findUnique({
      where: { companyId_moduleId: { companyId, moduleId } },
    });
    return Boolean(row?.enabled);
  }

  async canUserAccessModule(userId: number, moduleKey: string) {
    await this.ensureDefaultSystemModules();
    const { companyId, isSystemMaster } = await this.resolveUserContext(userId);

    const key = this.normalizeKey(moduleKey);
    if (key === 'master' || key === 'website' || key === 'exclusoes') return isSystemMaster;
    if (!companyId) return false;

    const moduleItem = await this.prisma.systemModule.findUnique({ where: { key } });
    if (!moduleItem || !moduleItem.companyAssignable) return false;

    const status = await this.evaluateCompanyStatus(companyId);
    if (!status.active) return false;

    const companyEnabled = await this.isCompanyModuleEnabled(companyId, moduleItem.id);
    if (!companyEnabled) return false;

    const userAccess = await this.prisma.userModuleAccess.findUnique({
      where: {
        userId_moduleId: {
          userId: Number(userId),
          moduleId: moduleItem.id,
        },
      },
    });

    if (!userAccess) return true;
    return Boolean(userAccess.allowed);
  }

  async listMyModules(userId: number) {
    await this.ensureDefaultSystemModules();
    const { companyId, isSystemMaster } = await this.resolveUserContext(userId);

    if (isSystemMaster) {
      const systemMasterModules = await this.prisma.systemModule.findMany({
        where: { key: { in: ['master', 'website', 'exclusoes'] } },
        orderBy: { name: 'asc' },
      });

      return systemMasterModules.map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        serviceUrl: moduleItem.serviceUrl,
        companyEnabled: true,
        accessible: true,
      }));
    }

    if (!companyId) return [];

    const status = await this.evaluateCompanyStatus(companyId);
    if (!status.active) return [];

    const rows = await this.prisma.companyModule.findMany({
      where: { companyId, enabled: true },
      include: { systemModule: true },
      orderBy: { systemModule: { name: 'asc' } },
    });

    const userAccessRows = await this.prisma.userModuleAccess.findMany({
      where: { userId },
      select: { moduleId: true, allowed: true },
    });
    const userAccessMap = new Map<number, boolean>(userAccessRows.map((row) => [row.moduleId, row.allowed]));

    return rows
      .filter((row) => row.systemModule.companyAssignable)
      .map((row) => ({
        key: row.systemModule.key,
        name: row.systemModule.name,
        description: row.systemModule.description,
        serviceUrl: row.systemModule.serviceUrl,
        companyEnabled: row.enabled,
        userAllowed: userAccessMap.has(row.moduleId) ? Boolean(userAccessMap.get(row.moduleId)) : true,
        accessible: row.enabled && (userAccessMap.has(row.moduleId) ? Boolean(userAccessMap.get(row.moduleId)) : true),
      }));
  }

  async listCompanyAccessForAdmin(adminUserId: number) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(adminUserId);
    const isAdmin = String((user as any).role || '').toUpperCase() === 'ADMIN';
    if (!companyId || (!isAdmin && !isSystemMaster)) throw new ForbiddenException('Admin role required');

    const [users, modules] = await Promise.all([
      this.usersService.listByCompany(companyId),
      this.prisma.systemModule.findMany({ where: { companyAssignable: true }, orderBy: { name: 'asc' } }),
    ]);

    const companyModuleRows = await this.prisma.companyModule.findMany({ where: { companyId } });
    const companyModuleMap = new Map<number, boolean>(companyModuleRows.map((row) => [row.moduleId, row.enabled]));

    const accessRows = await this.prisma.userModuleAccess.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, moduleId: true, allowed: true },
    });

    const accessByUser = new Map<number, Map<number, boolean>>();
    for (const row of accessRows) {
      const existing = accessByUser.get(row.userId) || new Map<number, boolean>();
      existing.set(row.moduleId, row.allowed);
      accessByUser.set(row.userId, existing);
    }

    return {
      companyId,
      modules: modules.map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        companyEnabled: companyModuleMap.has(moduleItem.id) ? Boolean(companyModuleMap.get(moduleItem.id)) : false,
      })),
      users: users.map((u) => {
        const userMap = accessByUser.get(u.id) || new Map<number, boolean>();
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          modules: modules.map((m) => ({
            key: m.key,
            allowed: userMap.has(m.id) ? Boolean(userMap.get(m.id)) : true,
          })),
        };
      }),
    };
  }

  async updateCompanyUserModuleAccess(adminUserId: number, targetUserId: number, modulePermissions: Array<{ key: string; allowed: boolean }>) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(adminUserId);
    const isAdmin = String((user as any).role || '').toUpperCase() === 'ADMIN';
    if (!companyId || (!isAdmin && !isSystemMaster)) throw new ForbiddenException('Admin role required');

    const target = await this.usersService.findById(targetUserId);
    if (!target) throw new BadRequestException('Usuario alvo nao encontrado');
    if (Number(target.companyId || 0) !== companyId) throw new ForbiddenException('Usuario fora da sua empresa');

    const modules = await this.prisma.systemModule.findMany({ where: { companyAssignable: true } });
    const byKey = new Map(modules.map((m) => [m.key, m]));

    await this.prisma.$transaction(async (tx) => {
      for (const permission of modulePermissions || []) {
        const moduleItem = byKey.get(this.normalizeKey(permission.key));
        if (!moduleItem) continue;

        await tx.userModuleAccess.upsert({
          where: {
            userId_moduleId: {
              userId: targetUserId,
              moduleId: moduleItem.id,
            },
          },
          update: { allowed: Boolean(permission.allowed) },
          create: {
            userId: targetUserId,
            moduleId: moduleItem.id,
            allowed: Boolean(permission.allowed),
          },
        });
      }
    });

    return { ok: true };
  }

  async listMasterOverview(masterUserId: number) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();
    await this.syncCompanyModulesForAllCompanies();

    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const companies = supportsEndpointTable
      ? await this.prisma.company.findMany({
          include: {
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: { id: 'asc' },
        })
      : await this.prisma.company.findMany({
          include: {
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
          },
          orderBy: { id: 'asc' },
        });

    const result: any[] = [];
    for (const company of companies) {
      const status = await this.evaluateCompanyStatus(company.id);
      result.push({
        id: company.id,
        name: company.name,
        slug: company.slug,
        primaryContactName: company.primaryContactName || null,
        contactEmail: company.contactEmail || null,
        contactPhone: company.contactPhone || null,
        taxDocument: company.taxDocument || null,
        isActive: status.active,
        paymentStatus: company.paymentStatus,
        paymentMethod: company.paymentMethod,
        subscriptionStatus: company.subscriptionStatus,
        billingProvider: company.billingProvider,
        premiumAccess: company.premiumAccess,
        trialStartsAt: company.trialStartsAt,
        trialEndsAt: company.trialEndsAt,
        subscriptionCurrentPeriodStart: company.subscriptionCurrentPeriodStart,
        subscriptionCurrentPeriodEnd: company.subscriptionCurrentPeriodEnd,
        whatsappNumber: company.whatsappNumber || null,
        whatsappPhoneNumberId: company.whatsappPhoneNumberId || null,
        whatsappWabaId: company.whatsappWabaId || null,
        whatsappDisplayNumber: company.whatsappDisplayNumber || null,
        whatsappStatus: company.whatsappStatus || null,
        whatsappStatusError: company.whatsappStatusError || null,
        whatsappStatusUpdatedAt: company.whatsappStatusUpdatedAt || null,
        accessTokenConfigured: Boolean(company.whatsappAccessToken),
        accessTokenPreview: company.whatsappAccessToken || null,
        whatsappEndpoints: (((company as any).whatsappEndpoints || this.buildLegacyEndpointSnapshot(company)) as any[]).map((endpoint) => ({
          id: endpoint.id,
          label: endpoint.label || null,
          moduleKey: endpoint.moduleKey || null,
          whatsappNumber: endpoint.whatsappNumber || null,
          whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId || null,
          whatsappWabaId: endpoint.whatsappWabaId || null,
          whatsappDisplayNumber: endpoint.whatsappDisplayNumber || null,
          whatsappStatus: endpoint.whatsappStatus || null,
          whatsappStatusError: endpoint.whatsappStatusError || null,
          whatsappStatusUpdatedAt: endpoint.whatsappStatusUpdatedAt || null,
          accessTokenConfigured: Boolean(endpoint.whatsappAccessToken),
          accessTokenPreview: endpoint.whatsappAccessToken
            ? `***${String(endpoint.whatsappAccessToken).slice(-6)}`
            : null,
          isActive: endpoint.isActive !== false,
          isPrimary: Boolean(endpoint.isPrimary),
          sortOrder: Number(endpoint.sortOrder || 0),
        })),
        mercadoPagoStatus: company.mercadoPagoStatus || null,
        mercadoPagoStatusError: company.mercadoPagoStatusError || null,
        mercadoPagoStatusUpdatedAt: company.mercadoPagoStatusUpdatedAt || null,
        mercadoPagoAccountEmail: company.mercadoPagoAccountEmail || null,
        mercadoPagoUserId: company.mercadoPagoUserId || null,
        mercadoPagoTokenConfigured: Boolean(company.mercadoPagoAccessToken),
        mercadoPagoTokenPreview: company.mercadoPagoAccessToken
          ? `***${String(company.mercadoPagoAccessToken).slice(-6)}`
          : null,
        users: company.users,
        modules: company.companyModules
          .filter((row) => row.systemModule.companyAssignable)
          .map((row) => ({ key: row.systemModule.key, name: row.systemModule.name, enabled: row.enabled })),
      });
    }

    return result;
  }

  async setCompanyModuleByMaster(masterUserId: number, companyId: number, moduleKey: string, enabled: boolean) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();

    const key = this.normalizeKey(moduleKey);
    const moduleItem = await this.prisma.systemModule.findUnique({ where: { key } });
    if (!moduleItem || !moduleItem.companyAssignable) throw new BadRequestException('Modulo nao encontrado para empresas');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const result = await this.prisma.companyModule.upsert({
      where: { companyId_moduleId: { companyId, moduleId: moduleItem.id } },
      update: { enabled: Boolean(enabled) },
      create: { companyId, moduleId: moduleItem.id, enabled: Boolean(enabled) },
    });

    return { ok: true, companyId: result.companyId, moduleKey: moduleItem.key, enabled: result.enabled };
  }

  async grantTrial(masterUserId: number, companyId: number, days = 30) {
    await this.assertMasterUser(masterUserId);
    if (days < 1 || days > 365) throw new BadRequestException('Periodo de trial invalido');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const trialStartsAt = new Date();
    const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.company.update({
        where: { id: companyId },
        data: {
          isActive: true,
          paymentStatus: 'TRIAL',
          subscriptionStatus: 'trialing',
          premiumAccess: true,
          trialStartsAt,
          trialEndsAt,
          subscriptionCurrentPeriodStart: null,
          subscriptionCurrentPeriodEnd: null,
          deactivatedAt: null,
        },
      }),
      this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: true } }),
    ]);

    return { ok: true, companyId, trialStartsAt, trialEndsAt };
  }

  async setPaymentStatus(masterUserId: number, companyId: number, paymentStatus: string) {
    await this.assertMasterUser(masterUserId);

    const normalized = String(paymentStatus || '').trim().toUpperCase();
    const allowed = ['PENDING', 'TRIAL', 'PAID', 'OVERDUE', 'EXPIRED', 'DISABLED'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(`paymentStatus deve ser um de: ${allowed.join(', ')}`);
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const isActive = normalized !== 'DISABLED' && normalized !== 'EXPIRED';
    const subscriptionStatus = this.mapPaymentStatusToSubscriptionStatus(normalized);
    const now = new Date();
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        paymentStatus: normalized,
        subscriptionStatus,
        premiumAccess: subscriptionStatus === 'active' || subscriptionStatus === 'trialing',
        subscriptionCurrentPeriodStart: normalized === 'PAID' ? now : company.subscriptionCurrentPeriodStart,
        subscriptionCurrentPeriodEnd:
          normalized === 'PAID'
            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            : normalized === 'DISABLED' || normalized === 'EXPIRED'
              ? null
              : company.subscriptionCurrentPeriodEnd,
        isActive,
        deactivatedAt: isActive ? null : new Date(),
      },
    });

    if (!isActive) {
      await this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
    }

    return { ok: true, companyId, paymentStatus: normalized, subscriptionStatus, isActive };
  }

  async updateCompanyProfileByMaster(
    masterUserId: number,
    companyId: number,
    dto: {
      name?: string;
      primaryContactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      taxDocument?: string;
      paymentMethod?: string;
      billingProvider?: string;
      subscriptionStatus?: string;
      premiumAccess?: boolean;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const paymentMethod = String(dto?.paymentMethod || company.paymentMethod || 'NONE')
      .trim()
      .toUpperCase();
    const billingProvider = String(dto?.billingProvider || company.billingProvider || 'manual')
      .trim()
      .toLowerCase();
    const subscriptionStatus = String(
      dto?.subscriptionStatus || company.subscriptionStatus || this.mapPaymentStatusToSubscriptionStatus(company.paymentStatus),
    )
      .trim()
      .toLowerCase();

    const allowedPaymentMethods = ['NONE', 'CARD', 'PIX', 'BOLETO', 'MANUAL'];
    const allowedBillingProviders = ['manual', 'mercadopago', 'stripe', 'apple', 'google'];
    const allowedSubscriptionStatuses = ['trialing', 'active', 'past_due', 'canceled', 'expired'];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      throw new BadRequestException(`paymentMethod deve ser um de: ${allowedPaymentMethods.join(', ')}`);
    }
    if (!allowedBillingProviders.includes(billingProvider)) {
      throw new BadRequestException(
        `billingProvider deve ser um de: ${allowedBillingProviders.join(', ')}`,
      );
    }
    if (!allowedSubscriptionStatuses.includes(subscriptionStatus)) {
      throw new BadRequestException(
        `subscriptionStatus deve ser um de: ${allowedSubscriptionStatuses.join(', ')}`,
      );
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: this.normalizeOptionalString(dto?.name) || company.name,
        primaryContactName: this.normalizeOptionalString(dto?.primaryContactName),
        contactEmail: this.normalizeOptionalString(dto?.contactEmail),
        contactPhone: this.normalizeOptionalString(dto?.contactPhone),
        taxDocument: this.normalizeOptionalString(dto?.taxDocument),
        paymentMethod,
        billingProvider,
        subscriptionStatus,
        premiumAccess:
          typeof dto?.premiumAccess === 'boolean'
            ? dto.premiumAccess
            : subscriptionStatus === 'active' || subscriptionStatus === 'trialing',
      },
    });

    return { ok: true, companyId };
  }

  async listMasterExclusoes(
    masterUserId: number,
    query?: { moduleKey?: string; companyId?: number; search?: string },
  ) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();

    const where: any = {
      permanentlyDeletedAt: null,
    };

    const moduleKey = String(query?.moduleKey || '').trim().toLowerCase();
    if (moduleKey) where.moduleKey = moduleKey;

    const companyId = Number(query?.companyId || 0);
    if (companyId > 0) where.companyId = companyId;

    const search = String(query?.search || '').trim();
    if (search) {
      where.OR = [
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { motivo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [records, modules] = await Promise.all([
      this.prisma.deletionRecord.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, username: true, email: true } },
        },
        orderBy: { deletedAt: 'desc' },
        take: 1000,
      }),
      this.prisma.systemModule.findMany({
        orderBy: { name: 'asc' },
        select: { key: true, name: true },
      }),
    ]);

    return {
      modules,
      records,
    };
  }

  async permanentDeleteExclusao(masterUserId: number, deletionId: number, motivo?: string) {
    const { user } = await this.resolveUserContext(masterUserId);
    await this.assertMasterUser(masterUserId);

    const row = await this.prisma.deletionRecord.findUnique({ where: { id: deletionId } });
    if (!row) throw new BadRequestException('Registro de exclusao nao encontrado');
    if (row.permanentlyDeletedAt) {
      return { ok: true, id: row.id, already: true };
    }

    const currentSnapshot = row.snapshot ? String(row.snapshot) : '';
    const permanentMeta = {
      permanentBy: String((user as any)?.username || (user as any)?.email || `master_${masterUserId}`),
      permanentAt: new Date().toISOString(),
      motivo: motivo ? String(motivo).trim() : null,
    };

    await this.prisma.deletionRecord.update({
      where: { id: deletionId },
      data: {
        permanentlyDeletedAt: new Date(),
        permanentlyDeletedById: masterUserId,
        snapshot: currentSnapshot ? JSON.stringify({ compacted: true, permanentMeta }) : JSON.stringify({ permanentMeta }),
      },
    });

    return { ok: true, id: deletionId };
  }

  async permanentDeleteExclusoesBatch(
    masterUserId: number,
    filters: { moduleKey?: string; companyId?: number; motivo?: string; confirmText?: string },
  ) {
    const { user } = await this.resolveUserContext(masterUserId);
    await this.assertMasterUser(masterUserId);

    const confirmText = String(filters?.confirmText || '').trim();
    if (confirmText.length < 10) {
      throw new BadRequestException('Confirmação inválida. Envie confirmText com pelo menos 10 caracteres.');
    }

    const where: any = { permanentlyDeletedAt: null };
    const moduleKey = String(filters?.moduleKey || '').trim().toLowerCase();
    if (moduleKey) where.moduleKey = moduleKey;

    const companyId = Number(filters?.companyId || 0);
    if (companyId > 0) where.companyId = companyId;

    if (!moduleKey && !(companyId > 0)) {
      throw new BadRequestException('Para limpeza em lote, informe moduleKey e/ou companyId.');
    }

    const rows = await this.prisma.deletionRecord.findMany({
      where,
      select: { id: true, snapshot: true },
      take: 5000,
    });

    if (!rows.length) return { ok: true, affected: 0 };

    const permanentBy = String((user as any)?.username || (user as any)?.email || `master_${masterUserId}`);
    const nowIso = new Date().toISOString();

    await this.prisma.$transaction(
      rows.map((row) => {
        const currentSnapshot = row.snapshot ? String(row.snapshot) : '';
        return this.prisma.deletionRecord.update({
          where: { id: row.id },
          data: {
            permanentlyDeletedAt: new Date(),
            permanentlyDeletedById: masterUserId,
            snapshot: currentSnapshot
              ? JSON.stringify({ compacted: true, permanentMeta: { permanentBy, permanentAt: nowIso, motivo: filters?.motivo || null, batch: true } })
              : JSON.stringify({ permanentMeta: { permanentBy, permanentAt: nowIso, motivo: filters?.motivo || null, batch: true } }),
          },
        });
      }),
    );

    return { ok: true, affected: rows.length };
  }
}
