import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
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
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';

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

class MasterUpdateCompanyMercadoPagoDto {
  @IsOptional()
  @IsString()
  mercadoPagoAccessToken?: string;
}

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly whatsappStatus: WhatsAppStatusService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
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
  async createByMaster(@Body() dto: MasterCreateCompanyDto) {
    return this.companiesService.createByMaster(dto);
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
