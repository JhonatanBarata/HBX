import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { buildImportacaoPermissaoRows } from '../bootstrap/company-structural-defaults';
import { getMasterGlobalIntegrationConfig, pickMasterWhatsAppCredential } from '../modules/master-global-integrations.util';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { buildWhatsAppCenterSnapshot } from './whatsapp-center.util';
import { WhatsAppTemporaryConnectionService } from './whatsapp-temporary-connection.service';
import { ensureWebsiteRuntimeSchema } from '../website/website-runtime';

export const MASTER_HARD_DELETE_CONFIRM_TEXT = 'EXCLUIR EMPRESA';
export const MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE = 'Confirmacao invalida para hard delete.';
export function buildMasterHardDeleteConfirmText(companyName: string) {
  const normalizedName = String(companyName || '').trim();
  return normalizedName ? `EXCLUIR ${normalizedName}` : MASTER_HARD_DELETE_CONFIRM_TEXT;
}

const MASTER_COMPANY_HARD_DELETE_MODULE_KEY = 'master_company_hard_delete';
const ORPHAN_COMPANY_CLEANUP_MODULE_KEY = 'company_orphan_cleanup';
const ORPHAN_COMPANY_CLEANUP_REASON = 'Empresa sem usuarios agendada para remocao permanente apos 7 dias.';
const ORPHAN_COMPANY_DELETED_REASON = 'Empresa sem usuarios removida automaticamente apos 7 dias.';

@Injectable()
export class CompaniesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompaniesService.name);
  private orphanCleanupHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappTemporaryConnection: WhatsAppTemporaryConnectionService,
  ) {}

  async onModuleInit() {
    if (!this.shouldRunOrphanCompanyCleanup()) {
      return;
    }

    void this.runOrphanCompanyCleanup();
    this.orphanCleanupHandle = setInterval(() => {
      void this.runOrphanCompanyCleanup();
    }, this.orphanCompanyCleanupIntervalMs());
  }

  async onModuleDestroy() {
    if (this.orphanCleanupHandle) {
      clearInterval(this.orphanCleanupHandle);
      this.orphanCleanupHandle = null;
    }
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private isProduction() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  }

  private shouldRunOrphanCompanyCleanup() {
    return this.isProduction() || String(process.env.ENABLE_ORPHAN_COMPANY_CLEANUP || '').trim().toLowerCase() === 'true';
  }

  private orphanCompanyCleanupIntervalMs() {
    const parsed = Number(process.env.ORPHAN_COMPANY_CLEANUP_INTERVAL_MINUTES || '60');
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
    return minutes * 60 * 1000;
  }

  private orphanCompanyGraceDays() {
    const parsed = Number(process.env.ORPHAN_COMPANY_GRACE_DAYS || '7');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 7;
  }

  private buildCompanyDeletionSnapshot(company: {
    id: number;
    name: string;
    slug?: string | null;
    entityType?: string | null;
    createdAt?: Date | null;
    onboardingStatus?: string | null;
    isActive?: boolean | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    deactivatedAt?: Date | null;
    primaryContactName?: string | null;
    contactEmail?: string | null;
    users?: Array<{ id: number; username?: string | null; email?: string | null; isSystemMaster?: boolean | null }>;
    _count?: Record<string, number>;
  }, input: {
    mode: 'master_hard_delete' | 'orphan_cleanup';
    reason?: string | null;
    deletedByUserId?: number | null;
    deletedAt: Date;
    scheduledAt?: Date | null;
  }) {
    return JSON.stringify({
      company: {
        id: Number(company.id),
        name: String(company.name || ''),
        slug: company.slug ? String(company.slug) : null,
        entityType: company.entityType ? String(company.entityType) : null,
        createdAt: company.createdAt instanceof Date ? company.createdAt.toISOString() : null,
        onboardingStatus: company.onboardingStatus ? String(company.onboardingStatus) : null,
        isActive: Boolean(company.isActive),
        paymentStatus: company.paymentStatus ? String(company.paymentStatus) : null,
        subscriptionStatus: company.subscriptionStatus ? String(company.subscriptionStatus) : null,
        deactivatedAt: company.deactivatedAt instanceof Date ? company.deactivatedAt.toISOString() : null,
        primaryContactName: company.primaryContactName ? String(company.primaryContactName) : null,
        contactEmail: company.contactEmail ? String(company.contactEmail) : null,
      },
      users: Array.isArray(company.users)
        ? company.users.map((user) => ({
            id: Number(user.id),
            username: user.username ? String(user.username) : null,
            email: user.email ? String(user.email) : null,
            isSystemMaster: Boolean(user.isSystemMaster),
          }))
        : [],
      counts: company._count || {},
      deletion: {
        mode: input.mode,
        reason: this.normalizeOptionalString(input.reason),
        deletedByUserId: Number(input.deletedByUserId || 0) || null,
        deletedAt: input.deletedAt.toISOString(),
        scheduledAt: input.scheduledAt instanceof Date ? input.scheduledAt.toISOString() : null,
      },
    });
  }

  private isValidMasterDeleteConfirmation(companyName: string, input?: string | null) {
    const normalized = String(input || '').trim();
    if (!normalized) {
      return false;
    }

    const expectedValues = new Set([
      MASTER_HARD_DELETE_CONFIRM_TEXT,
      String(companyName || '').trim(),
      buildMasterHardDeleteConfirmText(companyName),
    ].filter(Boolean));

    return expectedValues.has(normalized);
  }

  private async loadCompanyForPermanentDeletion(companyId: number) {
    return this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        id: true,
        name: true,
        slug: true,
        entityType: true,
        createdAt: true,
        onboardingStatus: true,
        isActive: true,
        paymentStatus: true,
        subscriptionStatus: true,
        deactivatedAt: true,
        primaryContactName: true,
        contactEmail: true,
        users: {
          select: {
            id: true,
            username: true,
            email: true,
            isSystemMaster: true,
          },
        },
        _count: {
          select: {
            users: true,
            companyModules: true,
            importacoes: true,
            products: true,
            inboundMessages: true,
            outboundMessages: true,
            conversationSessions: true,
            customerProfiles: true,
            debtCases: true,
            integrationConnections: true,
            financeiroCharges: true,
            atendimentoCustomers: true,
            webscrapingSearchHistories: true,
            webscrapingUsageLogs: true,
            vendasLeads: true,
          },
        },
      },
    });
  }

  private async supportsWhatsAppEndpointTable() {
    await ensureMasterBillingRuntimeSchema(this.prisma);
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

  private async assertMasterUser(masterUserId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: Number(masterUserId) },
      select: { id: true, isSystemMaster: true },
    });

    if (!user?.isSystemMaster) {
      throw new ForbiddenException('Acesso exclusivo do usuario MASTER');
    }
  }

  private slugify(input: string): string {
    const raw = String(input || '').trim().toLowerCase();
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private sanitizeCompany<T extends Record<string, any> | null>(company: T): T {
    if (!company) return company;
    // Avoid returning secrets to the client
    if ('whatsappAccessToken' in company) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (company as any).whatsappAccessToken;
    }
    if (Array.isArray((company as any).whatsappEndpoints)) {
      for (const endpoint of (company as any).whatsappEndpoints) {
        if (endpoint && 'whatsappAccessToken' in endpoint) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete endpoint.whatsappAccessToken;
        }
      }
    }
    if ('mercadoPagoAccessToken' in company) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (company as any).mercadoPagoAccessToken;
    }
    return company;
  }

  async lookupBySlug(slug: string) {
    const normalized = String(slug || '').trim();
    if (!normalized) return null;
    const company = await this.prisma.company.findUnique({ where: { slug: normalized } });
    if (!company) return null;
    return { id: company.id, name: company.name, slug: company.slug };
  }

  async create(dto: CreateCompanyDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name,
          slug: dto.slug,
        },
      });
      await tx.importacaoPermissao.createMany({
        data: buildImportacaoPermissaoRows(company.id),
        skipDuplicates: true,
      });
      return company;
    });
    return this.sanitizeCompany(created);
  }

  async createByMaster(input: { name: string; slug?: string }) {
    const name = String(input?.name || '').trim();
    if (!name) throw new ForbiddenException('Nome da empresa obrigatorio');

    const requestedSlug = String(input?.slug || '').trim();
    const baseSlug = this.slugify(requestedSlug || name);
    if (!baseSlug) throw new ForbiddenException('Slug invalido para a empresa');

    let candidate = baseSlug;
    let suffix = 2;
    // Ensure unique slug without forcing the user to retry manually.
    while (await this.prisma.company.findUnique({ where: { slug: candidate } })) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          slug: candidate,
        },
      });
      await tx.importacaoPermissao.createMany({
        data: buildImportacaoPermissaoRows(company.id),
        skipDuplicates: true,
      });
      return company;
    });
    return this.sanitizeCompany(created);
  }

  async findByIdForMaster(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const id = Number(companyId);
    if (!id) throw new NotFoundException('Company not found');
    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const company = supportsEndpointTable
      ? await this.prisma.company.findUnique({
          where: { id },
          include: {
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        })
      : await this.prisma.company.findUnique({
          where: { id },
        });
    if (!company) throw new NotFoundException('Company not found');
    if (!supportsEndpointTable) {
      (company as any).whatsappEndpoints = this.buildLegacyEndpointSnapshot(company);
    }
    return company;
  }

  async listByIdsForMaster(companyIds: number[]) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const normalizedIds = Array.from(
      new Set(companyIds.map((companyId) => Number(companyId || 0)).filter((companyId) => companyId > 0)),
    );
    if (!normalizedIds.length) return [];

    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const companies = supportsEndpointTable
      ? await this.prisma.company.findMany({
          where: { id: { in: normalizedIds } },
          include: {
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        })
      : await this.prisma.company.findMany({
          where: { id: { in: normalizedIds } },
        });

    const ordered = normalizedIds
      .map((companyId) => companies.find((company) => Number(company.id) === companyId) || null)
      .filter(Boolean) as any[];

    if (!supportsEndpointTable) {
      for (const company of ordered) {
        (company as any).whatsappEndpoints = this.buildLegacyEndpointSnapshot(company);
      }
    }

    return ordered;
  }

  private async listEnabledModuleKeys(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const rows = await this.prisma.companyModule.findMany({
      where: { companyId, enabled: true, systemModule: { companyAssignable: true } },
      include: { systemModule: true },
    });
    return new Set(
      rows
        .map((row) => String(row.systemModule?.key || '').trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async listWhatsAppEndpointsByMaster(companyId: number) {
    const company = await this.findByIdForMaster(companyId);
    return (this.sanitizeCompany(company) as any)?.whatsappEndpoints || [];
  }

  async getWhatsAppCenterForCompany(companyId: number, options?: { refreshTemporary?: boolean }) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    if (options?.refreshTemporary) {
      await this.whatsappTemporaryConnection.syncCompanyTemporaryConnection(companyId, {
        requestQr: false,
      });
    }

    const company = await this.findByIdForMaster(companyId);
    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const selectedCredential = Boolean((company as any)?.useMasterWhatsAppToken)
      ? pickMasterWhatsAppCredential(masterConfig, (company as any)?.masterWhatsAppCredentialKey)
      : null;
    const effectiveConfig = Boolean((company as any)?.useMasterWhatsAppToken)
      ? {
          accessToken: this.normalizeOptionalString(selectedCredential?.accessToken),
          phoneNumberId: this.normalizeOptionalString(selectedCredential?.phoneNumberId),
          wabaId: this.normalizeOptionalString(selectedCredential?.wabaId),
          whatsappNumber: this.normalizeOptionalString(selectedCredential?.whatsappNumber),
          displayNumber:
            this.normalizeOptionalString(selectedCredential?.displayNumber) ||
            this.normalizeOptionalString(selectedCredential?.whatsappNumber),
        }
      : {
          accessToken: this.normalizeOptionalString((company as any)?.whatsappAccessToken),
          phoneNumberId: this.normalizeOptionalString((company as any)?.whatsappPhoneNumberId),
          wabaId: this.normalizeOptionalString((company as any)?.whatsappWabaId),
          whatsappNumber: this.normalizeOptionalString((company as any)?.whatsappNumber),
          displayNumber:
            this.normalizeOptionalString((company as any)?.whatsappDisplayNumber) ||
            this.normalizeOptionalString((company as any)?.whatsappNumber),
        };

    return {
      generatedAt: new Date().toISOString(),
      company: {
        id: Number((company as any)?.id || 0),
        name: this.normalizeOptionalString((company as any)?.name),
        onboardingStatus: this.normalizeOptionalString((company as any)?.onboardingStatus),
        paymentStatus: this.normalizeOptionalString((company as any)?.paymentStatus),
        subscriptionStatus: this.normalizeOptionalString((company as any)?.subscriptionStatus),
        premiumAccess: Boolean((company as any)?.premiumAccess),
        trialModuleSelection: this.normalizeOptionalString((company as any)?.trialModuleSelection),
        whatsappConnectionMode: this.normalizeOptionalString((company as any)?.whatsappConnectionMode) || 'NONE',
        whatsappTemporaryStatus:
          this.normalizeOptionalString((company as any)?.whatsappTemporaryStatus) || 'NOT_CONNECTED',
      },
      center: buildWhatsAppCenterSnapshot({
        company,
        credential: selectedCredential,
        effectiveConfig,
        includeInternal: false,
        temporaryAvailable: this.whatsappTemporaryConnection.getAvailability().configured,
      }),
    };
  }

  async updateWhatsAppCenterForCompany(
    companyId: number,
    input: {
      mode?: string;
    },
  ) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.findByIdForMaster(companyId);
    const requestedMode = String(input?.mode || '').trim().toUpperCase();
    if (!['TEMPORARY', 'OFFICIAL', 'NONE'].includes(requestedMode)) {
      throw new BadRequestException('Modo de vínculo inválido.');
    }

    const updated = await this.prisma.company.update({
      where: { id: Number(companyId) },
      data: {
        whatsappConnectionMode: requestedMode,
        whatsappTemporaryStatus:
          requestedMode === 'TEMPORARY'
            ? ((company as any)?.whatsappTemporaryStatus === 'TEMPORARY' ? 'TEMPORARY' : 'ATTENTION')
            : requestedMode === 'NONE'
              ? 'NOT_CONNECTED'
              : (company as any)?.whatsappTemporaryStatus || 'NOT_CONNECTED',
      },
    });

    return this.getWhatsAppCenterForCompany(updated.id);
  }

  async startWhatsAppTemporaryConnection(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.findByIdForMaster(companyId);
    const requestedMode = String((company as any)?.whatsappConnectionMode || '').trim().toUpperCase();
    if (requestedMode !== 'TEMPORARY') {
      await this.prisma.company.update({
        where: { id: Number(companyId) },
        data: {
          whatsappConnectionMode: 'TEMPORARY',
          whatsappTemporaryStatus:
            String((company as any)?.whatsappTemporaryStatus || '').trim().toUpperCase() === 'TEMPORARY'
              ? 'TEMPORARY'
              : 'ATTENTION',
        },
      });
    }

    await this.whatsappTemporaryConnection.startTemporaryConnection(companyId);
    return this.getWhatsAppCenterForCompany(companyId);
  }

  async disconnectWhatsAppTemporaryConnection(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.whatsappTemporaryConnection.disconnectTemporaryConnection(companyId);
    return this.getWhatsAppCenterForCompany(companyId);
  }

  async registerWhatsAppMigrationInterest(
    companyId: number,
    input?: {
      source?: string;
    },
  ) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const source = this.normalizeOptionalString(input?.source) || 'central_whatsapp';
    const updated = await this.prisma.company.update({
      where: { id: Number(companyId) },
      data: {
        whatsappMigrationInterestStatus: 'REQUESTED',
        whatsappMigrationInterestAt: new Date(),
        whatsappMigrationInterestSource: source,
        whatsappMigrationWorkflowStatus: 'REQUESTED',
      },
    });
    return this.getWhatsAppCenterForCompany(updated.id);
  }

  async updateWhatsAppMigrationWorkflowByMaster(
    masterUserId: number,
    companyId: number,
    input: {
      status?: string;
      internalNote?: string;
      lastContactAt?: string | null;
    },
  ) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.assertMasterUser(masterUserId);
    const existing = await this.findByIdForMaster(companyId);
    const status = String(input?.status || '').trim().toUpperCase();
    if (!['REQUESTED', 'CONTACTED', 'RESOLVED'].includes(status)) {
      throw new BadRequestException('Status interno da migração do WhatsApp inválido.');
    }

    const normalizedNote = this.normalizeOptionalString(input?.internalNote);
    const normalizedLastContact = this.normalizeOptionalString(input?.lastContactAt);
    const lastContactAt = normalizedLastContact ? new Date(normalizedLastContact) : null;
    if (normalizedLastContact && Number.isNaN(lastContactAt?.getTime())) {
      throw new BadRequestException('Data do último contato técnico inválida.');
    }

    await this.prisma.company.update({
      where: { id: Number(companyId) },
      data: {
        whatsappMigrationWorkflowStatus: status,
        whatsappMigrationInternalNote: normalizedNote,
        whatsappMigrationLastContactAt:
          normalizedLastContact !== null ? lastContactAt : (existing as any)?.whatsappMigrationLastContactAt || null,
      },
    });

    return this.findByIdForMaster(companyId);
  }

  async replaceWhatsAppEndpointsByMaster(
    companyId: number,
    endpointsInput: Array<{
      id?: string;
      label?: string;
      moduleKey?: string;
      whatsappNumber?: string;
      whatsappPhoneNumberId?: string;
      whatsappWabaId?: string;
      whatsappAccessToken?: string;
      isActive?: boolean;
      isPrimary?: boolean;
    }>,
  ) {
    if (!(await this.supportsWhatsAppEndpointTable())) {
      throw new BadRequestException(
        'O banco desta publicacao ainda nao recebeu a migration de multiplos numeros. Rode a migration e publique novamente.',
      );
    }
    const id = Number(companyId);
    if (!id) throw new NotFoundException('Company not found');
    const existing = await this.prisma.company.findUnique({
      where: { id },
      include: {
        whatsappEndpoints: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!existing) throw new NotFoundException('Company not found');

    const enabledModuleKeys = await this.listEnabledModuleKeys(id);
    const normalized = (Array.isArray(endpointsInput) ? endpointsInput : [])
      .map((endpoint, index) => ({
        id: String(endpoint?.id || '').trim(),
        label: String(endpoint?.label || '').trim() || null,
        moduleKey: String(endpoint?.moduleKey || '').trim().toLowerCase() || null,
        whatsappNumber: String(endpoint?.whatsappNumber || '').trim() || null,
        whatsappPhoneNumberId: String(endpoint?.whatsappPhoneNumberId || '').trim() || null,
        whatsappWabaId: String(endpoint?.whatsappWabaId || '').trim() || null,
        whatsappAccessToken: String(endpoint?.whatsappAccessToken || '').trim() || null,
        isActive: endpoint?.isActive !== false,
        isPrimary: Boolean(endpoint?.isPrimary),
        sortOrder: index,
      }))
      .filter(
        (endpoint) =>
          endpoint.id ||
          endpoint.label ||
          endpoint.whatsappNumber ||
          endpoint.whatsappPhoneNumberId ||
          endpoint.whatsappAccessToken,
      );

    const seenPhoneIds = new Set<string>();
    for (const endpoint of normalized) {
      if (endpoint.moduleKey && !enabledModuleKeys.has(endpoint.moduleKey)) {
        throw new BadRequestException(
          `Modulo ${endpoint.moduleKey} nao esta ativo para esta empresa.`,
        );
      }
      if (!endpoint.whatsappPhoneNumberId) {
        throw new BadRequestException('Cada numero precisa ter phone number ID da Meta.');
      }
      if (!endpoint.whatsappAccessToken) {
        throw new BadRequestException('Cada numero precisa ter access token da Meta.');
      }
      if (seenPhoneIds.has(endpoint.whatsappPhoneNumberId)) {
        throw new BadRequestException(
          `Phone number ID duplicado na lista: ${endpoint.whatsappPhoneNumberId}`,
        );
      }
      seenPhoneIds.add(endpoint.whatsappPhoneNumberId);
    }

    if (normalized.length && !normalized.some((endpoint) => endpoint.isPrimary)) {
      normalized[0].isPrimary = true;
    }
    let primaryAssigned = false;
    for (const endpoint of normalized) {
      if (endpoint.isPrimary && !primaryAssigned) {
        primaryAssigned = true;
        continue;
      }
      endpoint.isPrimary = false;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingById = new Map(existing.whatsappEndpoints.map((endpoint) => [endpoint.id, endpoint]));
      const keepIds = normalized.map((endpoint) => endpoint.id).filter(Boolean);

      await tx.companyWhatsAppEndpoint.deleteMany({
        where: {
          companyId: id,
          ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
        },
      });

      const saved: any[] = [];
      for (const endpoint of normalized) {
        const previous = endpoint.id ? existingById.get(endpoint.id) : null;
        const credentialsChanged =
          !previous ||
          String(previous.whatsappPhoneNumberId || '').trim() !== endpoint.whatsappPhoneNumberId ||
          String(previous.whatsappAccessToken || '').trim() !== endpoint.whatsappAccessToken ||
          String(previous.whatsappNumber || '').trim() !== endpoint.whatsappNumber ||
          String(previous.whatsappWabaId || '').trim() !== endpoint.whatsappWabaId;

        const data: any = {
          companyId: id,
          label: endpoint.label,
          moduleKey: endpoint.moduleKey,
          whatsappNumber: endpoint.whatsappNumber,
          whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId,
          whatsappWabaId: endpoint.whatsappWabaId,
          whatsappAccessToken: endpoint.whatsappAccessToken,
          isActive: endpoint.isActive,
          isPrimary: endpoint.isPrimary,
          sortOrder: endpoint.sortOrder,
        };

        if (credentialsChanged) {
          data.whatsappStatus = 'DISCONNECTED';
          data.whatsappStatusError = null;
          data.whatsappStatusUpdatedAt = new Date();
          data.whatsappDisplayNumber = endpoint.whatsappNumber || null;
        }

        const savedEndpoint = endpoint.id
          ? await tx.companyWhatsAppEndpoint.update({
              where: { id: endpoint.id },
              data,
            })
          : await tx.companyWhatsAppEndpoint.create({ data });
        saved.push(savedEndpoint);
      }

      const primaryEndpoint =
        saved.find((endpoint) => endpoint.isPrimary) || saved[0] || null;

      await tx.company.update({
        where: { id },
        data: primaryEndpoint
          ? {
              whatsappNumber: primaryEndpoint.whatsappNumber || null,
              whatsappPhoneNumberId: primaryEndpoint.whatsappPhoneNumberId || null,
              whatsappWabaId: primaryEndpoint.whatsappWabaId || null,
              whatsappAccessToken: primaryEndpoint.whatsappAccessToken || null,
              whatsappDisplayNumber:
                primaryEndpoint.whatsappDisplayNumber || primaryEndpoint.whatsappNumber || null,
              whatsappStatus: primaryEndpoint.whatsappStatus || 'DISCONNECTED',
              whatsappStatusError: primaryEndpoint.whatsappStatusError || null,
              whatsappStatusUpdatedAt: primaryEndpoint.whatsappStatusUpdatedAt || new Date(),
            }
          : {
              whatsappNumber: null,
              whatsappPhoneNumberId: null,
              whatsappWabaId: null,
              whatsappAccessToken: null,
              whatsappDisplayNumber: null,
              whatsappStatus: 'DISCONNECTED',
              whatsappStatusError: null,
              whatsappStatusUpdatedAt: new Date(),
            },
      });

      return tx.company.findUnique({
        where: { id },
        include: {
          whatsappEndpoints: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    return this.sanitizeCompany(updated);
  }

  async updateWhatsAppByMaster(
    companyId: number,
    dto: {
      whatsappNumber?: string;
      whatsappPhoneNumberId?: string;
      whatsappWabaId?: string;
      whatsappAccessToken?: string;
    },
  ) {
    const id = Number(companyId);
    if (!id) throw new NotFoundException('Company not found');
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Company not found');

    const data: any = {};
    if (dto.whatsappNumber !== undefined) data.whatsappNumber = String(dto.whatsappNumber || '').trim() || null;
    if (dto.whatsappPhoneNumberId !== undefined) data.whatsappPhoneNumberId = String(dto.whatsappPhoneNumberId || '').trim() || null;
    if (dto.whatsappWabaId !== undefined) data.whatsappWabaId = String(dto.whatsappWabaId || '').trim() || null;
    if (dto.whatsappAccessToken !== undefined) data.whatsappAccessToken = String(dto.whatsappAccessToken || '').trim() || null;

    if (Object.keys(data).length === 0) {
      return this.sanitizeCompany(existing);
    }

    data.whatsappStatus = 'DISCONNECTED';
    data.whatsappStatusError = null;
    data.whatsappStatusUpdatedAt = new Date();
    if (dto.whatsappNumber !== undefined) {
      data.whatsappDisplayNumber = data.whatsappNumber;
    }

    const updated = await this.prisma.company.update({ where: { id }, data });
    return this.sanitizeCompany(updated);
  }

  async updateMercadoPagoByMaster(
    companyId: number,
    dto: {
      mercadoPagoAccessToken?: string;
      mercadoPagoStatus?: string;
      mercadoPagoStatusError?: string | null;
      mercadoPagoAccountEmail?: string | null;
      mercadoPagoUserId?: string | null;
    },
  ) {
    const id = Number(companyId);
    if (!id) throw new NotFoundException('Company not found');
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Company not found');

    const data: any = {};
    if (dto.mercadoPagoAccessToken !== undefined) {
      data.mercadoPagoAccessToken = String(dto.mercadoPagoAccessToken || '').trim() || null;
    }
    if (dto.mercadoPagoStatus !== undefined) {
      data.mercadoPagoStatus = String(dto.mercadoPagoStatus || '').trim() || null;
    }
    if (dto.mercadoPagoStatusError !== undefined) {
      data.mercadoPagoStatusError = dto.mercadoPagoStatusError ? String(dto.mercadoPagoStatusError) : null;
    }
    if (dto.mercadoPagoAccountEmail !== undefined) {
      data.mercadoPagoAccountEmail = dto.mercadoPagoAccountEmail ? String(dto.mercadoPagoAccountEmail) : null;
    }
    if (dto.mercadoPagoUserId !== undefined) {
      data.mercadoPagoUserId = dto.mercadoPagoUserId ? String(dto.mercadoPagoUserId) : null;
    }

    if (Object.keys(data).length === 0) {
      return this.sanitizeCompany(existing);
    }

    data.mercadoPagoStatusUpdatedAt = new Date();
    const updated = await this.prisma.company.update({ where: { id }, data });
    return this.sanitizeCompany(updated);
  }

  private async permanentlyDeleteCompanyInternal(input: {
    companyId: number;
    deletedByUserId?: number | null;
    reason?: string | null;
    historyModuleKey: string;
    mode: 'master_hard_delete' | 'orphan_cleanup';
    scheduleRecordId?: number | null;
    scheduledAt?: Date | null;
  }) {
    const id = Number(input.companyId);
    if (!id) throw new BadRequestException('Empresa invalida');

    await ensureMasterBillingRuntimeSchema(this.prisma);
    await ensureWebsiteRuntimeSchema(this.prisma);

    const company = await this.loadCompanyForPermanentDeletion(id);
    if (!company) throw new NotFoundException('Company not found');

    if (company.users.some((user) => user.isSystemMaster)) {
      throw new BadRequestException('Nao e permitido excluir uma empresa vinculada ao usuario MASTER do sistema');
    }

    const userIds = company.users.map((user) => Number(user.id || 0)).filter((userId) => userId > 0);
    const deletedAt = new Date();
    const snapshot = this.buildCompanyDeletionSnapshot(company, {
      mode: input.mode,
      reason: input.reason,
      deletedByUserId: input.deletedByUserId,
      deletedAt,
      scheduledAt: input.scheduledAt || null,
    });

    await this.prisma.$transaction(async (tx) => {
      if (input.scheduleRecordId) {
        await tx.deletionRecord.update({
          where: { id: Number(input.scheduleRecordId) },
          data: {
            motivo: this.normalizeOptionalString(input.reason) || ORPHAN_COMPANY_DELETED_REASON,
            snapshot,
            permanentlyDeletedAt: deletedAt,
            permanentlyDeletedById: Number(input.deletedByUserId || 0) || null,
          },
        });
      } else {
        await tx.deletionRecord.create({
          data: {
            moduleKey: input.historyModuleKey,
            entityType: 'COMPANY',
            entityId: String(id),
            companyId: null,
            motivo: this.normalizeOptionalString(input.reason),
            snapshot,
            deletedByUserId: Number(input.deletedByUserId || 0) || null,
            deletedAt,
            permanentlyDeletedById: Number(input.deletedByUserId || 0) || null,
            permanentlyDeletedAt: deletedAt,
          },
        });
      }

      await tx.$executeRaw`DELETE FROM "WebsiteAdminEntryToken" WHERE "companyId" = ${id}`;
      await tx.$executeRaw`DELETE FROM "CompanyWebsiteConfig" WHERE "companyId" = ${id}`;
      await tx.$executeRaw`DELETE FROM "MasterBillingLedgerEntry" WHERE "companyId" = ${id}`;
      await tx.$executeRaw`DELETE FROM "FinanceiroCharge" WHERE "companyId" = ${id}`;

      await tx.satisfactionSurvey.deleteMany({ where: { conversation: { companyId: id } } });
      await tx.message.deleteMany({ where: { conversation: { companyId: id } } });
      await tx.conversation.deleteMany({ where: { companyId: id } });
      await tx.customer.deleteMany({ where: { conversations: { none: {} } } });

      await tx.outboundAttempt.deleteMany({ where: { message: { companyId: id } } });
      await tx.companyMessage.deleteMany({ where: { companyId: id } });
      await tx.outboundMessage.deleteMany({ where: { companyId: id } });
      await tx.inboundMessage.deleteMany({ where: { companyId: id } });

      await tx.autoReplyResponse.deleteMany({ where: { rule: { companyId: id } } });
      await tx.autoReplyRule.deleteMany({ where: { companyId: id } });

      await tx.orderDraft.deleteMany({ where: { companyId: id } });
      await tx.conversationSession.deleteMany({ where: { companyId: id } });
      await tx.companyConversation.deleteMany({ where: { companyId: id } });

      await tx.hbxRecoveryPayment.deleteMany({ where: { companyId: id } });
      await tx.vendasLeadTimelineEvent.deleteMany({ where: { lead: { companyId: id } } });
      await tx.vendasLead.deleteMany({ where: { companyId: id } });
      await tx.atendimentoCustomer.deleteMany({ where: { companyId: id } });
      await tx.hbxRecoveryCustomer.deleteMany({ where: { companyId: id } });
      await tx.debtCase.deleteMany({ where: { companyId: id } });
      await tx.hbxRecoveryFlowStage.deleteMany({ where: { companyId: id } });
      await tx.customerProfile.deleteMany({ where: { companyId: id } });

      await tx.auvoExternalRecord.deleteMany({ where: { companyId: id } });
      await tx.integrationSyncRun.deleteMany({ where: { companyId: id } });
      await tx.integrationConnection.deleteMany({ where: { companyId: id } });

      await tx.whatsAppAuditLog.deleteMany({ where: { companyId: id } });
      await tx.whatsAppWebhookEvent.deleteMany({ where: { companyId: id } });
      await tx.webscrapingUsageLog.deleteMany({ where: { companyId: id } });
      await tx.webscrapingSearchHistory.deleteMany({ where: { companyId: id } });
      await tx.techAssistantInteraction.deleteMany({ where: { companyId: id } });
      await tx.companyWhatsAppEndpoint.deleteMany({ where: { companyId: id } });

      await tx.masterSupportAuditLog.deleteMany({ where: { companyId: id } });
      await tx.masterAssumedContextSession.deleteMany({ where: { companyId: id } });

      await tx.importacaoLog.deleteMany({ where: { importacao: { empresaId: id } } });
      await tx.alertaImportacao.deleteMany({ where: { empresaId: id } });
      await tx.importacao.deleteMany({ where: { empresaId: id } });
      await tx.importacaoPermissao.deleteMany({ where: { empresaId: id } });
      await tx.cadastroTransitTime.deleteMany({ where: { empresaId: id } });
      await tx.cadastroFornecedor.deleteMany({ where: { empresaId: id } });
      await tx.cadastroPorto.deleteMany({ where: { empresaId: id } });
      await tx.cadastroPais.deleteMany({ where: { empresaId: id } });

      await tx.companyModule.deleteMany({ where: { companyId: id } });
      await tx.deletionRecord.deleteMany({ where: { companyId: id } });
      await tx.productVersion.deleteMany({ where: { product: { companyId: id } } });
      await tx.product.deleteMany({ where: { companyId: id } });

      if (userIds.length > 0) {
        await tx.importacao.updateMany({
          where: {
            OR: [
              { createdBy: { in: userIds } },
              { finalizedBy: { in: userIds } },
              { reabertoPor: { in: userIds } },
            ],
          },
          data: {
            createdBy: null,
            finalizedBy: null,
            reabertoPor: null,
          },
        });
        await tx.productVersion.updateMany({
          where: { authorId: { in: userIds } },
          data: { authorId: null },
        });
        await tx.deletionRecord.updateMany({
          where: { deletedByUserId: { in: userIds } },
          data: { deletedByUserId: null },
        });
        await tx.masterAssumedContextSession.updateMany({
          where: { endedByUserId: { in: userIds } },
          data: { endedByUserId: null },
        });
        await tx.techAssistantInteraction.deleteMany({ where: { userId: { in: userIds } } });
        await tx.webscrapingUsageLog.deleteMany({ where: { userId: { in: userIds } } });
        await tx.webscrapingSearchHistory.deleteMany({ where: { userId: { in: userIds } } });
        await tx.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
        await tx.$executeRawUnsafe(
          `UPDATE "MasterBillingLedgerEntry" SET "createdByUserId" = NULL WHERE "createdByUserId" IN (${userIds.join(',')})`,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM "WebsiteAdminEntryToken" WHERE "userId" IN (${userIds.join(',')})`,
        );
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }

      await tx.company.delete({ where: { id } });
    });

    return {
      success: true,
      deletedCompany: {
        id: company.id,
        name: company.name,
        slug: company.slug || null,
      },
    };
  }

  private async runOrphanCompanyCleanup() {
    if (!this.shouldRunOrphanCompanyCleanup()) {
      return;
    }

    try {
      const scheduledRows = await this.prisma.deletionRecord.findMany({
        where: {
          moduleKey: ORPHAN_COMPANY_CLEANUP_MODULE_KEY,
          entityType: 'COMPANY',
          permanentlyDeletedAt: null,
        },
        select: {
          id: true,
          entityId: true,
          deletedAt: true,
        },
      });

      const scheduledByCompanyId = new Map<number, { id: number; deletedAt: Date }>();
      for (const row of scheduledRows) {
        const companyId = Number(row.entityId || 0);
        if (!companyId) continue;
        scheduledByCompanyId.set(companyId, { id: row.id, deletedAt: row.deletedAt });
      }

      const scheduledCompanyIds = Array.from(scheduledByCompanyId.keys());
      if (scheduledCompanyIds.length) {
        const restoredCompanies = await this.prisma.company.findMany({
          where: {
            id: { in: scheduledCompanyIds },
            users: { some: {} },
          },
          select: { id: true },
        });

        const restoredIds = new Set(restoredCompanies.map((company) => Number(company.id)));
        if (restoredIds.size > 0) {
          await this.prisma.deletionRecord.deleteMany({
            where: {
              id: {
                in: scheduledRows
                  .filter((row) => restoredIds.has(Number(row.entityId || 0)))
                  .map((row) => Number(row.id)),
              },
            },
          });
        }
      }

      const orphanCompanies = await this.prisma.company.findMany({
        where: {
          users: { none: {} },
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          paymentStatus: true,
          subscriptionStatus: true,
          premiumAccess: true,
          deactivatedAt: true,
        },
      });

      const graceCutoff = new Date(Date.now() - this.orphanCompanyGraceDays() * 24 * 60 * 60 * 1000);
      for (const company of orphanCompanies) {
        const companyId = Number(company.id || 0);
        if (!companyId) continue;

        const scheduled = scheduledByCompanyId.get(companyId);
        if (!scheduled) {
          const scheduledAt = new Date();
          const snapshot = this.buildCompanyDeletionSnapshot(
            {
              ...company,
              users: [],
            },
            {
              mode: 'orphan_cleanup',
              reason: ORPHAN_COMPANY_CLEANUP_REASON,
              deletedAt: scheduledAt,
              scheduledAt,
            },
          );

          await this.prisma.$transaction(async (tx) => {
            await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
            await tx.company.update({
              where: { id: companyId },
              data: {
                isActive: false,
                paymentStatus: 'DISABLED',
                subscriptionStatus: 'canceled',
                premiumAccess: false,
                deactivatedAt: scheduledAt,
              },
            });
            await tx.deletionRecord.create({
              data: {
                moduleKey: ORPHAN_COMPANY_CLEANUP_MODULE_KEY,
                entityType: 'COMPANY',
                entityId: String(companyId),
                companyId: null,
                motivo: ORPHAN_COMPANY_CLEANUP_REASON,
                snapshot,
                deletedByUserId: null,
                deletedAt: scheduledAt,
                permanentlyDeletedById: null,
                permanentlyDeletedAt: null,
              },
            });
          });
          this.logger.warn(`Company ${companyId} scheduled for permanent deletion after ${this.orphanCompanyGraceDays()} days without users`);
          continue;
        }

        if (scheduled.deletedAt <= graceCutoff) {
          try {
            await this.permanentlyDeleteCompanyInternal({
              companyId,
              deletedByUserId: null,
              reason: ORPHAN_COMPANY_DELETED_REASON,
              historyModuleKey: ORPHAN_COMPANY_CLEANUP_MODULE_KEY,
              mode: 'orphan_cleanup',
              scheduleRecordId: scheduled.id,
              scheduledAt: scheduled.deletedAt,
            });
            this.logger.warn(`Company ${companyId} permanently deleted after orphan grace period`);
          } catch (error) {
            this.logger.error(
              `Failed to permanently delete orphan company ${companyId}`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed running orphan company cleanup', error instanceof Error ? error.stack : undefined);
    }
  }

  async removeByMaster(
    masterUserId: number,
    companyId: number,
    input?: { confirmText?: string | null; reason?: string | null },
  ) {
    await this.assertMasterUser(masterUserId);

    const id = Number(companyId);
    if (!id) throw new BadRequestException('Empresa invalida');

    const company = await this.loadCompanyForPermanentDeletion(id);
    if (!company) throw new NotFoundException('Company not found');

    if (!this.isValidMasterDeleteConfirmation(company.name, input?.confirmText ?? '')) {
      throw new BadRequestException(MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE);
    }

    return this.permanentlyDeleteCompanyInternal({
      companyId: id,
      deletedByUserId: masterUserId,
      reason: this.normalizeOptionalString(input?.reason),
      historyModuleKey: MASTER_COMPANY_HARD_DELETE_MODULE_KEY,
      mode: 'master_hard_delete',
    });
  }

  async archiveByMaster(masterUserId: number, companyId: number, input?: { reason?: string | null }) {
    await this.assertMasterUser(masterUserId);

    const id = Number(companyId);
    if (!id) throw new BadRequestException('Empresa invalida');

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        paymentStatus: true,
        subscriptionStatus: true,
        premiumAccess: true,
        deactivatedAt: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    const now = new Date();
    const reason = String(input?.reason || '').trim() || null;
    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.companyModule.updateMany({ where: { companyId: id }, data: { enabled: false } });
      return tx.company.update({
        where: { id },
        data: {
          isActive: false,
          paymentStatus: 'DISABLED',
          subscriptionStatus: 'canceled',
          premiumAccess: false,
          deactivatedAt: now,
        },
      });
    });

    return {
      ok: true,
      archivedCompany: {
        id: archived.id,
        name: archived.name,
        slug: archived.slug || null,
      },
      archive: {
        previousState: {
          isActive: Boolean(company.isActive),
          paymentStatus: company.paymentStatus,
          subscriptionStatus: company.subscriptionStatus,
          premiumAccess: Boolean(company.premiumAccess),
          deactivatedAt: company.deactivatedAt ? company.deactivatedAt.toISOString() : null,
        },
        currentState: {
          isActive: Boolean(archived.isActive),
          paymentStatus: archived.paymentStatus,
          subscriptionStatus: archived.subscriptionStatus,
          premiumAccess: Boolean(archived.premiumAccess),
          deactivatedAt: archived.deactivatedAt ? archived.deactivatedAt.toISOString() : null,
        },
        reason,
      },
    };
  }

  async findAllForCompany(companyId: number | null | undefined) {
    if (!companyId) throw new ForbiddenException('Missing company context');
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { products: true, users: true } });
    return company ? [this.sanitizeCompany(company)] : [];
  }

  async findOneForCompany(companyId: number | null | undefined, id: number) {
    if (!companyId) throw new ForbiddenException('Missing company context');
    if (id !== companyId) throw new NotFoundException('Company not found');

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { products: true, users: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return this.sanitizeCompany(company);
  }

  async updateForCompany(companyId: number | null | undefined, id: number, dto: UpdateCompanyDto) {
    if (!companyId) throw new ForbiddenException('Missing company context');
    if (id !== companyId) throw new ForbiddenException('Forbidden');

    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    const updated = await this.prisma.company.update({ where: { id }, data: dto as any });
    return this.sanitizeCompany(updated);
  }

  async removeForCompany(companyId: number | null | undefined, id: number) {
    if (!companyId) throw new ForbiddenException('Missing company context');
    if (id !== companyId) throw new ForbiddenException('Forbidden');

    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    await this.prisma.company.delete({ where: { id } });
    return { success: true };
  }
}
