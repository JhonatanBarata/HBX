import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Admin } from '../auth/admin.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from '../users/users.service';
import { FeatureGuard } from '../plans/feature.guard';
import { Feature } from '../plans/feature.decorator';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { MasterGuard } from '../auth/guards/master.guard';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { MasterContextService } from '../master-context/master-context.service';
import { CompanyOperationalStatusService } from './company-operational-status.service';
import { WhatsAppModalService } from './whatsapp-modal.service';
import { CompanyWhatsAppCustomerSyncService } from './company-whatsapp-customer-sync.service';
import {
  CompaniesService,
  MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE,
} from './companies.service';

class MasterCreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

class MasterUpdateCompanyWhatsAppDto {
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  whatsappWabaId?: string;

  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;
}

class MasterCompanyWhatsAppEndpointDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  moduleKey?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  whatsappWabaId?: string;

  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;
}

class ReplaceMasterCompanyWhatsAppEndpointsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterCompanyWhatsAppEndpointDto)
  endpoints!: MasterCompanyWhatsAppEndpointDto[];
}

class MasterUpdateCompanyMercadoPagoDto {
  @IsOptional()
  @IsString()
  mercadoPagoAccessToken?: string;
}

class MasterArchiveCompanyDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateMyWhatsAppCenterDto {
  @IsString()
  @IsNotEmpty()
  mode!: string;
}

class RegisterWhatsAppMigrationInterestDto {
  @IsOptional()
  @IsString()
  source?: string;
}

class UpdateMasterWhatsAppMigrationWorkflowDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  internalNote?: string;

  @IsOptional()
  @IsString()
  lastContactAt?: string;
}

class MasterHardDeleteCompanyDto {
  @IsOptional()
  @IsString()
  confirmText?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly masterContextService: MasterContextService,
    private readonly companyOperationalStatus: CompanyOperationalStatusService,
    private readonly whatsappModalService: WhatsAppModalService,
    private readonly companyWhatsAppCustomerSync: CompanyWhatsAppCustomerSyncService,
  ) {}

  // NOTE: We intentionally do not provide a public company lookup endpoint.
  // Public company discovery enables tenant enumeration (competitor inference).

  private async buildWhatsAppPayloadForMaster(companyId: number, opts?: { refresh?: boolean }) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    const status = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: Boolean(opts?.refresh) });

    return {
      companyId,
      whatsappNumber: company?.whatsappNumber || null,
      whatsappPhoneNumberId: company?.whatsappPhoneNumberId || null,
      whatsappWabaId: company?.whatsappWabaId || null,
      accessTokenConfigured: Boolean(company?.whatsappAccessToken),
      accessTokenPreview: company?.whatsappAccessToken || null,
      status: status.status,
      connected: Boolean(status.connected),
      displayNumber: status.displayNumber || null,
      statusError: company?.whatsappStatusError || null,
      lastValidatedAt: company?.whatsappStatusUpdatedAt || null,
    };
  }

  private async buildMercadoPagoPayloadForMaster(companyId: number) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    return {
      companyId,
      accessTokenConfigured: Boolean(company?.mercadoPagoAccessToken),
      accessTokenPreview: company?.mercadoPagoAccessToken ? `***${String(company.mercadoPagoAccessToken).slice(-6)}` : null,
      status: String(company?.mercadoPagoStatus || 'DISCONNECTED'),
      statusError: company?.mercadoPagoStatusError || null,
      accountEmail: company?.mercadoPagoAccountEmail || null,
      accountUserId: company?.mercadoPagoUserId || null,
      lastValidatedAt: company?.mercadoPagoStatusUpdatedAt || null,
    };
  }

  private maskCredentialPreview(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized ? `***${normalized.slice(-6)}` : null;
  }

  private async buildWhatsAppAuditSnapshot(companyId: number) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    return {
      companyId,
      whatsappNumber: company?.whatsappNumber || null,
      whatsappPhoneNumberId: company?.whatsappPhoneNumberId || null,
      whatsappWabaId: company?.whatsappWabaId || null,
      accessTokenConfigured: Boolean(company?.whatsappAccessToken),
      accessTokenPreview: this.maskCredentialPreview(company?.whatsappAccessToken),
      status: String(company?.whatsappStatus || 'DISCONNECTED'),
      statusError: company?.whatsappStatusError || null,
      lastValidatedAt: company?.whatsappStatusUpdatedAt || null,
    };
  }

  private async buildWhatsAppEndpointsAuditSnapshot(companyId: number) {
    const endpoints: any[] = await this.companiesService.listWhatsAppEndpointsByMaster(companyId);
    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label || null,
      moduleKey: endpoint.moduleKey || null,
      whatsappNumber: endpoint.whatsappNumber || null,
      whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId || null,
      whatsappWabaId: endpoint.whatsappWabaId || null,
      accessTokenConfigured: Boolean(endpoint.whatsappAccessToken),
      accessTokenPreview: this.maskCredentialPreview(endpoint.whatsappAccessToken),
      status: endpoint.whatsappStatus || null,
      statusError: endpoint.whatsappStatusError || null,
      isActive: endpoint.isActive !== false,
      isPrimary: Boolean(endpoint.isPrimary),
      sortOrder: Number(endpoint.sortOrder || 0),
    }));
  }

  private async buildWhatsAppEndpointAuditSnapshot(companyId: number, endpointId: string) {
    const endpoints = await this.buildWhatsAppEndpointsAuditSnapshot(companyId);
    return endpoints.find((endpoint) => String(endpoint.id) === String(endpointId)) || null;
  }

  private async buildWhatsAppMigrationAuditSnapshot(companyId: number) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    return {
      interestRequested: Boolean(company?.whatsappCenter?.migration?.interestRequested),
      requestedAt: company?.whatsappCenter?.migration?.requestedAt || null,
      workflowStatus: company?.whatsappCenter?.migration?.workflowStatus || 'NONE',
      source: company?.whatsappCenter?.migration?.source || null,
      lastContactAt: company?.whatsappCenter?.migration?.lastContactAt || null,
      internalNote: company?.whatsappCenter?.migration?.internalNote || null,
      centerStatus: company?.whatsappCenter?.status || 'NOT_CONNECTED',
      centerMode: company?.whatsappCenter?.mode || 'NONE',
    };
  }

  private async buildMercadoPagoAuditSnapshot(companyId: number) {
    const company: any = await this.companiesService.findByIdForMaster(companyId);
    return {
      companyId,
      accessTokenConfigured: Boolean(company?.mercadoPagoAccessToken),
      accessTokenPreview: this.maskCredentialPreview(company?.mercadoPagoAccessToken),
      status: String(company?.mercadoPagoStatus || 'DISCONNECTED'),
      statusError: company?.mercadoPagoStatusError || null,
      accountEmail: company?.mercadoPagoAccountEmail || null,
      accountUserId: company?.mercadoPagoUserId || null,
      lastValidatedAt: company?.mercadoPagoStatusUpdatedAt || null,
    };
  }

  private async resolveOperationalContext(req: any) {
    const runtimeContext = await this.masterContextService.resolveRuntimeContext(req.user);
    const effectiveCompanyId = runtimeContext.effectiveCompanyId || Number(req.user?.companyId || 0) || null;

    if (!effectiveCompanyId) {
      return {
        effectiveCompanyId: null,
        company: null,
        masterContext: runtimeContext.masterContext,
      };
    }

    const company = await this.companiesService.findByIdForMaster(effectiveCompanyId);
    return {
      effectiveCompanyId,
      company,
      masterContext: runtimeContext.masterContext,
    };
  }

  private async resolveOperationalCompanyIdOrThrow(req: any) {
    const context = await this.resolveOperationalContext(req);
    const companyId = Number(context.effectiveCompanyId || 0);
    if (!companyId) {
      throw new BadRequestException('Nenhuma empresa operacional selecionada para este contexto.');
    }
    return companyId;
  }

  private assertWhatsAppModalAdminAccess(req: any, companyId: number) {
    if (req?.user?.isSystemMaster) {
      return;
    }

    const normalizedUserCompanyId = Number(req?.user?.companyId || 0);
    const normalizedRole = String(req?.user?.role || '').trim().toUpperCase();
    if (normalizedUserCompanyId === Number(companyId) && normalizedRole === 'ADMIN') {
      return;
    }

    throw new ForbiddenException('Acesso restrito ao MASTER ou ADMIN da empresa.');
  }

  private async resolveMyWhatsAppModalCompanyIdOrThrow(req: any) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    this.assertWhatsAppModalAdminAccess(req, companyId);
    return companyId;
  }

  private resolveParamWhatsAppModalCompanyIdOrThrow(req: any, companyId: number) {
    this.assertWhatsAppModalAdminAccess(req, companyId);
    return Number(companyId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() dto: CreateCompanyDto) {
    const company = await this.companiesService.create(dto);
    // associate authenticated user with this company
    if (req.user && req.user.id) {
      await this.usersService.updateCompany(req.user.id, company.id);
    }
    return company;
  }

  @Post('master')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async createByMaster(@Req() req: any, @Body() dto: MasterCreateCompanyDto) {
    const created = await this.companiesService.createByMaster(dto);
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(created?.id || 0) || null,
      scope: 'master_company',
      action: 'COMPANY_CREATED',
      metadata: {
        name: created?.name || null,
        slug: created?.slug || null,
      },
    });
    return created;
  }

  @Delete('master/:id')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async removeByMaster(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: MasterHardDeleteCompanyDto) {
    try {
      const payload = await this.companiesService.removeByMaster(Number(req.user?.id), id, dto || {});
      await this.masterContextService.registerSupportAction({
        masterUserId: Number(req.user?.id),
        companyId: Number(id),
        scope: 'master_company',
        action: 'COMPANY_DELETED',
        severity: 'WARN',
        metadata: {
          deletedCompany: payload?.deletedCompany || null,
        },
      });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE) {
        await this.masterContextService.registerSupportAction({
          masterUserId: Number(req.user?.id),
          companyId: Number(id),
          scope: 'master_company',
          action: 'COMPANY_HARD_DELETE_BLOCKED',
          severity: 'WARN',
          metadata: {
            reason: message,
            confirmTextProvided: dto?.confirmText || null,
            deleteReasonProvided: dto?.reason || null,
          },
        });
      }
      throw error;
    }
  }

  @Post('master/:id/archive')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async archiveByMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterArchiveCompanyDto,
  ) {
    const payload = await this.companiesService.archiveByMaster(Number(req.user?.id), id, dto || {});
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_company',
      action: 'COMPANY_ARCHIVED',
      severity: 'WARN',
      metadata: {
        archivedCompany: payload?.archivedCompany || null,
        archive: payload?.archive || null,
      },
    });
    return payload;
  }

  @Get('master/:id/whatsapp')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async getWhatsAppForMaster(
    @Param('id', ParseIntPipe) id: number,
    @Query('refresh') refresh?: string,
  ) {
    const shouldRefresh = String(refresh || '').trim().toLowerCase() === 'true';
    return this.buildWhatsAppPayloadForMaster(id, { refresh: shouldRefresh });
  }

  @Patch('master/:id/whatsapp')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateWhatsAppForMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyWhatsAppDto,
  ) {
    const previousState = await this.buildWhatsAppAuditSnapshot(id);
    await this.companiesService.updateWhatsAppByMaster(id, dto);
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_ROOT_CREDENTIALS_UPDATED',
      metadata: {
        previousState,
        currentState: await this.buildWhatsAppAuditSnapshot(id),
      },
    });
    return this.buildWhatsAppPayloadForMaster(id, { refresh: false });
  }

  @Post('master/:id/whatsapp/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppForMaster(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const previousState = await this.buildWhatsAppAuditSnapshot(id);
    await this.whatsappStatus.getStatusForCompany(id, { refresh: true });
    const currentState = await this.buildWhatsAppAuditSnapshot(id);
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_ROOT_VALIDATED',
      metadata: {
        previousState,
        currentState,
      },
    });
    return this.buildWhatsAppPayloadForMaster(id, { refresh: false });
  }

  @Get('master/:id/whatsapp-endpoints')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async listWhatsAppEndpointsForMaster(@Param('id', ParseIntPipe) id: number) {
    const endpoints = await this.companiesService.listWhatsAppEndpointsByMaster(id);
    return { companyId: id, endpoints };
  }

  @Put('master/:id/whatsapp-endpoints')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async replaceWhatsAppEndpointsForMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceMasterCompanyWhatsAppEndpointsDto,
  ) {
    const previousState = await this.buildWhatsAppEndpointsAuditSnapshot(id);
    const company = await this.companiesService.replaceWhatsAppEndpointsByMaster(
      id,
      dto?.endpoints || [],
    );
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_ENDPOINTS_REPLACED',
      metadata: {
        previousState,
        currentState: await this.buildWhatsAppEndpointsAuditSnapshot(id),
      },
    });
    return { companyId: id, endpoints: (company as any)?.whatsappEndpoints || [] };
  }

  @Post('master/:companyId/whatsapp-endpoints/:endpointId/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppEndpointForMaster(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('endpointId') endpointId: string,
  ) {
    const previousState = await this.buildWhatsAppEndpointAuditSnapshot(companyId, endpointId);
    await this.whatsappStatus.getStatusForCompanyEndpoint(endpointId, { refresh: true });
    const currentState = await this.buildWhatsAppEndpointAuditSnapshot(companyId, endpointId);
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(companyId),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_ENDPOINT_VALIDATED',
      metadata: {
        endpointId,
        previousState,
        currentState,
      },
    });
    const endpoints = await this.companiesService.listWhatsAppEndpointsByMaster(companyId);
    return { companyId, endpoints };
  }

  @Patch('master/:id/whatsapp-migration-workflow')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateWhatsAppMigrationWorkflowForMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMasterWhatsAppMigrationWorkflowDto,
  ) {
    const previousState = await this.buildWhatsAppMigrationAuditSnapshot(id);
    await this.companiesService.updateWhatsAppMigrationWorkflowByMaster(Number(req.user?.id), id, dto || {});
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_MIGRATION_WORKFLOW_UPDATED',
      metadata: {
        previousState,
        currentState: await this.buildWhatsAppMigrationAuditSnapshot(id),
      },
    });
    return this.companiesService.findByIdForMaster(id);
  }

  @Get('master/:id/mercadopago')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async getMercadoPagoForMaster(@Param('id', ParseIntPipe) id: number) {
    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Patch('master/:id/mercadopago')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async updateMercadoPagoForMaster(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyMercadoPagoDto,
  ) {
    const previousState = await this.buildMercadoPagoAuditSnapshot(id);
    await this.companiesService.updateMercadoPagoByMaster(id, {
      mercadoPagoAccessToken:
        dto?.mercadoPagoAccessToken !== undefined ? String(dto.mercadoPagoAccessToken || '').trim() : undefined,
      mercadoPagoStatus: 'DISCONNECTED',
      mercadoPagoStatusError: null,
      mercadoPagoAccountEmail: null,
      mercadoPagoUserId: null,
    });
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_global_integrations',
      action: 'MERCADOPAGO_CREDENTIALS_UPDATED',
      metadata: {
        previousState,
        currentState: await this.buildMercadoPagoAuditSnapshot(id),
      },
    });
    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Post('master/:id/mercadopago/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateMercadoPagoForMaster(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const previousState = await this.buildMercadoPagoAuditSnapshot(id);
    const company: any = await this.companiesService.findByIdForMaster(id);
    const accessToken = String(company?.mercadoPagoAccessToken || '').trim();
    if (!accessToken) {
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'DISCONNECTED',
        mercadoPagoStatusError: 'Token Mercado Pago nao configurado.',
      });
      await this.masterContextService.registerSupportAction({
        masterUserId: Number(req.user?.id),
        companyId: Number(id),
        scope: 'master_global_integrations',
        action: 'MERCADOPAGO_VALIDATED',
        metadata: {
          previousState,
          currentState: await this.buildMercadoPagoAuditSnapshot(id),
        },
      });
      return this.buildMercadoPagoPayloadForMaster(id);
    }

    try {
      const profile = await this.mercadoPagoClient.validateAccessToken(accessToken);
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'CONNECTED',
        mercadoPagoStatusError: null,
        mercadoPagoAccountEmail: profile?.email ? String(profile.email) : null,
        mercadoPagoUserId:
          profile?.id !== undefined && profile?.id !== null ? String(profile.id) : null,
      });
    } catch (error: any) {
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'ERROR',
        mercadoPagoStatusError: String(error?.message || 'Falha ao validar token Mercado Pago'),
      });
    }

    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_global_integrations',
      action: 'MERCADOPAGO_VALIDATED',
      metadata: {
        previousState,
        currentState: await this.buildMercadoPagoAuditSnapshot(id),
      },
    });

    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: any) {
    return this.companiesService.findAllForCompany(req.user?.companyId);
  }

  @Get('me/whatsapp-status')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppStatus(@Req() req: any, @Query('refresh') refresh?: string) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    const doRefresh = String(refresh || '').toLowerCase() === 'true';
    const st = await this.whatsappStatus.getStatusForCompany(companyId, { refresh: doRefresh });
    return {
      connected: Boolean(st.connected),
      displayNumber: st.displayNumber,
      status: st.status,
    };
  }

  @Get('me/whatsapp-center')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppCenter(@Req() req: any, @Query('refresh') refresh?: string) {
    const refreshTemporary = String(refresh || '').trim().toLowerCase() === 'true';
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.getWhatsAppCenterForCompany(companyId, {
      refreshTemporary,
    });
  }

  @Get('me/operational-status')
  @UseGuards(JwtAuthGuard)
  async getMyOperationalStatus(@Req() req: any, @Query('refresh') refresh?: string) {
    const context = await this.resolveOperationalContext(req);
    const doRefresh = String(refresh || '').trim().toLowerCase() === 'true';
    if (!context.effectiveCompanyId || !context.company) {
      return {
        generatedAt: new Date().toISOString(),
        context: {
          available: false,
          companyId: null,
          companyName: null,
          mode:
            req?.user?.isSystemMaster && !context.masterContext?.active
              ? 'master_puro'
              : 'sem_empresa',
          masterContext: context.masterContext,
        },
        statuses: [],
      };
    }

    const payload = await this.companyOperationalStatus.getOperationalStatusForCompany(
      Number(context.effectiveCompanyId),
      { refresh: doRefresh },
    );

    return {
      generatedAt: new Date().toISOString(),
      context: {
        available: true,
        companyId: Number(context.effectiveCompanyId),
        companyName: String(context.company?.name || '').trim() || null,
        mode: context.masterContext?.active ? 'master_assumido' : 'empresa',
        masterContext: context.masterContext,
      },
      statuses: payload?.statuses || [],
      summary: payload || null,
    };
  }


  @Post('me/customer-registry/sync-whatsapp')
  @UseGuards(JwtAuthGuard)
  async syncMyCustomerRegistryFromWhatsApp(@Req() req: any) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companyWhatsAppCustomerSync.syncCompanyCustomers(companyId);
  }
  @Get('master/operational-status')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async getOperationalStatusForMaster(
    @Query('companyIds') companyIdsRaw?: string,
  ) {
    const companyIds = String(companyIdsRaw || '')
      .split(',')
      .map((value) => Number(String(value || '').trim()))
      .filter((value) => value > 0);
    return this.companyOperationalStatus.getOperationalStatusForCompanies(companyIds, {
      validatePayments: true,
    });
  }

  @Patch('me/whatsapp-center')
  @UseGuards(JwtAuthGuard)
  async updateMyWhatsAppCenter(@Req() req: any, @Body() dto: UpdateMyWhatsAppCenterDto) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.updateWhatsAppCenterForCompany(companyId, dto || {});
  }

  @Get('me/whatsapp-modal/status')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppModalStatus(@Req() req: any) {
    const companyId = await this.resolveMyWhatsAppModalCompanyIdOrThrow(req);
    return this.whatsappModalService.getCompanyStatus(companyId);
  }

  @Post('me/whatsapp-modal/start')
  @UseGuards(JwtAuthGuard)
  async startMyWhatsAppModalSession(@Req() req: any) {
    const companyId = await this.resolveMyWhatsAppModalCompanyIdOrThrow(req);
    return this.whatsappModalService.startCompanySession(companyId);
  }

  @Get('me/whatsapp-modal/qr')
  @UseGuards(JwtAuthGuard)
  async getMyWhatsAppModalQrCode(@Req() req: any) {
    const companyId = await this.resolveMyWhatsAppModalCompanyIdOrThrow(req);
    return this.whatsappModalService.getCompanyQrCode(companyId);
  }

  @Post('me/whatsapp-modal/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectMyWhatsAppModalSession(@Req() req: any) {
    const companyId = await this.resolveMyWhatsAppModalCompanyIdOrThrow(req);
    return this.whatsappModalService.disconnectCompanySession(companyId);
  }

  @Post('me/whatsapp-modal/restart')
  @UseGuards(JwtAuthGuard)
  async restartMyWhatsAppModalSession(@Req() req: any) {
    const companyId = await this.resolveMyWhatsAppModalCompanyIdOrThrow(req);
    return this.whatsappModalService.restartCompanySession(companyId);
  }

  @Post('me/whatsapp-center/migration-interest')
  @UseGuards(JwtAuthGuard)
  async registerMyWhatsAppMigrationInterest(
    @Req() req: any,
    @Body() dto: RegisterWhatsAppMigrationInterestDto,
  ) {
    const companyId = await this.resolveOperationalCompanyIdOrThrow(req);
    return this.companiesService.registerWhatsAppMigrationInterest(companyId, dto || {});
  }

  @Get(':id/whatsapp-modal/status')
  @UseGuards(JwtAuthGuard)
  async getCompanyWhatsAppModalStatus(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = this.resolveParamWhatsAppModalCompanyIdOrThrow(req, id);
    return this.whatsappModalService.getCompanyStatus(companyId);
  }

  @Post(':id/whatsapp-modal/start')
  @UseGuards(JwtAuthGuard)
  async startCompanyWhatsAppModalSession(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = this.resolveParamWhatsAppModalCompanyIdOrThrow(req, id);
    return this.whatsappModalService.startCompanySession(companyId);
  }

  @Get(':id/whatsapp-modal/qr')
  @UseGuards(JwtAuthGuard)
  async getCompanyWhatsAppModalQrCode(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = this.resolveParamWhatsAppModalCompanyIdOrThrow(req, id);
    return this.whatsappModalService.getCompanyQrCode(companyId);
  }

  @Post(':id/whatsapp-modal/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectCompanyWhatsAppModalSession(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = this.resolveParamWhatsAppModalCompanyIdOrThrow(req, id);
    return this.whatsappModalService.disconnectCompanySession(companyId);
  }

  @Post(':id/whatsapp-modal/restart')
  @UseGuards(JwtAuthGuard)
  async restartCompanyWhatsAppModalSession(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const companyId = this.resolveParamWhatsAppModalCompanyIdOrThrow(req, id);
    return this.whatsappModalService.restartCompanySession(companyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOneForCompany(req.user?.companyId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, FeatureGuard, RolesGuard)
  @Feature('company_update')
  @Admin()
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateForCompany(req.user?.companyId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FeatureGuard, RolesGuard)
  @Feature('company_delete')
  @Admin()
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.companiesService.removeForCompany(req.user?.companyId, id);
  }
}
