import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { buildImportacaoPermissaoRows } from '../bootstrap/company-structural-defaults';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async listEnabledModuleKeys(companyId: number) {
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

  async removeByMaster(masterUserId: number, companyId: number) {
    await this.assertMasterUser(masterUserId);

    const id = Number(companyId);
    if (!id) throw new BadRequestException('Empresa invalida');

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        users: { select: { id: true, isSystemMaster: true } },
        conversationSessions: { select: { id: true } },
        autoReplyRules: { select: { id: true } },
        outboundMessages: { select: { id: true } },
        importacoes: { select: { id: true } },
        products: { select: { id: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (company.users.some((user) => user.isSystemMaster)) {
      throw new BadRequestException('Nao e permitido excluir uma empresa vinculada ao usuario MASTER do sistema');
    }

    const userIds = company.users.map((user) => user.id);
    const sessionIds = company.conversationSessions.map((session) => session.id);
    const autoReplyRuleIds = company.autoReplyRules.map((rule) => rule.id);
    const outboundMessageIds = company.outboundMessages.map((message) => message.id);
    const importacaoIds = company.importacoes.map((item) => item.id);
    const productIds = company.products.map((product) => product.id);

    await this.prisma.$transaction(async (tx) => {
      if (outboundMessageIds.length > 0) {
        await tx.companyMessage.updateMany({
          where: { outboundMessageId: { in: outboundMessageIds } },
          data: { outboundMessageId: null },
        });
        await tx.outboundAttempt.deleteMany({ where: { messageId: { in: outboundMessageIds } } });
      }

      if (importacaoIds.length > 0) {
        await tx.alertaImportacao.deleteMany({ where: { importacaoId: { in: importacaoIds } } });
        await tx.importacaoLog.deleteMany({ where: { importacaoId: { in: importacaoIds } } });
      }

      if (autoReplyRuleIds.length > 0) {
        await tx.autoReplyResponse.deleteMany({ where: { ruleId: { in: autoReplyRuleIds } } });
      }

      if (sessionIds.length > 0) {
        await tx.orderDraft.deleteMany({ where: { sessionId: { in: sessionIds } } });
      }

      if (productIds.length > 0) {
        await tx.productVersion.deleteMany({ where: { productId: { in: productIds } } });
      }

      await tx.satisfactionSurvey.deleteMany({ where: { conversation: { companyId: id } } });
      await tx.message.deleteMany({ where: { conversation: { companyId: id } } });
      await tx.conversation.deleteMany({ where: { companyId: id } });

      await tx.hbxRecoveryPayment.deleteMany({ where: { companyId: id } });
      await tx.hbxRecoveryCustomer.deleteMany({ where: { companyId: id } });
      await tx.hbxRecoveryFlowStage.deleteMany({ where: { companyId: id } });
      await tx.whatsAppAuditLog.deleteMany({ where: { companyId: id } });
      await tx.whatsAppWebhookEvent.deleteMany({ where: { companyId: id } });
      await tx.companyMessage.deleteMany({ where: { companyId: id } });
      await tx.companyConversation.deleteMany({ where: { companyId: id } });
      await tx.outboundMessage.deleteMany({ where: { companyId: id } });
      await tx.inboundMessage.deleteMany({ where: { companyId: id } });
      await tx.autoReplyRule.deleteMany({ where: { companyId: id } });
      await tx.orderDraft.deleteMany({ where: { companyId: id } });
      await tx.conversationSession.deleteMany({ where: { companyId: id } });
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
        await tx.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
        await tx.deletionRecord.deleteMany({ where: { deletedByUserId: { in: userIds } } });
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
