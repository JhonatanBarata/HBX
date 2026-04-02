import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
import {
  CompaniesService,
  MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE,
  MASTER_HARD_DELETE_DISABLED_MESSAGE,
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
}

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly masterContextService: MasterContextService,
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
      if (message === MASTER_HARD_DELETE_DISABLED_MESSAGE || message === MASTER_HARD_DELETE_CONFIRMATION_INVALID_MESSAGE) {
        await this.masterContextService.registerSupportAction({
          masterUserId: Number(req.user?.id),
          companyId: Number(id),
          scope: 'master_company',
          action: 'COMPANY_HARD_DELETE_BLOCKED',
          severity: 'WARN',
          metadata: {
            reason: message,
            confirmTextProvided: dto?.confirmText || null,
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
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyWhatsAppDto,
  ) {
    await this.companiesService.updateWhatsAppByMaster(id, dto);
    return this.buildWhatsAppPayloadForMaster(id, { refresh: false });
  }

  @Post('master/:id/whatsapp/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppForMaster(@Param('id', ParseIntPipe) id: number) {
    await this.whatsappStatus.getStatusForCompany(id, { refresh: true });
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
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceMasterCompanyWhatsAppEndpointsDto,
  ) {
    const company = await this.companiesService.replaceWhatsAppEndpointsByMaster(
      id,
      dto?.endpoints || [],
    );
    return { companyId: id, endpoints: (company as any)?.whatsappEndpoints || [] };
  }

  @Post('master/:companyId/whatsapp-endpoints/:endpointId/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateWhatsAppEndpointForMaster(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('endpointId') endpointId: string,
  ) {
    await this.whatsappStatus.getStatusForCompanyEndpoint(endpointId, { refresh: true });
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
    await this.companiesService.updateWhatsAppMigrationWorkflowByMaster(Number(req.user?.id), id, dto || {});
    await this.masterContextService.registerSupportAction({
      masterUserId: Number(req.user?.id),
      companyId: Number(id),
      scope: 'master_whatsapp_center',
      action: 'WHATSAPP_MIGRATION_WORKFLOW_UPDATED',
      metadata: {
        status: String(dto?.status || '').trim().toUpperCase() || null,
        internalNote: dto?.internalNote ? String(dto.internalNote).slice(0, 240) : null,
        lastContactAt: dto?.lastContactAt || null,
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
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MasterUpdateCompanyMercadoPagoDto,
  ) {
    await this.companiesService.updateMercadoPagoByMaster(id, {
      mercadoPagoAccessToken:
        dto?.mercadoPagoAccessToken !== undefined ? String(dto.mercadoPagoAccessToken || '').trim() : undefined,
      mercadoPagoStatus: 'DISCONNECTED',
      mercadoPagoStatusError: null,
      mercadoPagoAccountEmail: null,
      mercadoPagoUserId: null,
    });
    return this.buildMercadoPagoPayloadForMaster(id);
  }

  @Post('master/:id/mercadopago/validate')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async validateMercadoPagoForMaster(@Param('id', ParseIntPipe) id: number) {
    const company: any = await this.companiesService.findByIdForMaster(id);
    const accessToken = String(company?.mercadoPagoAccessToken || '').trim();
    if (!accessToken) {
      await this.companiesService.updateMercadoPagoByMaster(id, {
        mercadoPagoStatus: 'DISCONNECTED',
        mercadoPagoStatusError: 'Token Mercado Pago nao configurado.',
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
    const companyId = Number(req.user?.companyId);
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
  async getMyWhatsAppCenter(@Req() req: any) {
    return this.companiesService.getWhatsAppCenterForCompany(Number(req.user?.companyId));
  }

  @Patch('me/whatsapp-center')
  @UseGuards(JwtAuthGuard)
  async updateMyWhatsAppCenter(@Req() req: any, @Body() dto: UpdateMyWhatsAppCenterDto) {
    return this.companiesService.updateWhatsAppCenterForCompany(Number(req.user?.companyId), dto || {});
  }

  @Post('me/whatsapp-center/migration-interest')
  @UseGuards(JwtAuthGuard)
  async registerMyWhatsAppMigrationInterest(
    @Req() req: any,
    @Body() dto: RegisterWhatsAppMigrationInterestDto,
  ) {
    return this.companiesService.registerWhatsAppMigrationInterest(Number(req.user?.companyId), dto || {});
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
