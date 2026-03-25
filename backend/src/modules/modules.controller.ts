import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulesService } from './modules.service';
import { ModuleAccessGuard } from './module-access.guard';
import { ModuleAccess } from './module-feature.decorator';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MasterGuard } from '../auth/guards/master.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Admin } from '../auth/admin.decorator';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { probeWebscrapingRuntime } from './webscraping-runtime.util';

class ModulePermissionDto {
  @IsString()
  key!: string;

  @IsBoolean()
  allowed!: boolean;
}

class UpdateUserModuleAccessDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  modules!: ModulePermissionDto[];
}

class SetCompanyModuleDto {
  @IsString()
  moduleKey!: string;

  @IsBoolean()
  enabled!: boolean;
}

class UpdateSystemModuleCatalogDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  monthlyPrice?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  defaultEnabled?: boolean;
}

class UpdateMasterGlobalIntegrationsDto {
  @IsOptional()
  @IsArray()
  mercadoPagoLibrary?: any[];

  @IsOptional()
  @IsArray()
  whatsappLibrary?: any[];
}

class UpdateCompanyMasterTokenUsageDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useMasterMercadoPagoToken?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useMasterWhatsAppToken?: boolean;

  @IsOptional()
  @IsString()
  masterMercadoPagoCredentialKey?: string;

  @IsOptional()
  @IsString()
  masterWhatsAppCredentialKey?: string;
}

class ImportCompanyTokensToMasterDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  clearSource?: boolean;
}

class GrantTrialDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

class SetPaymentStatusDto {
  @IsString()
  paymentStatus!: string;
}

class RecordManualPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  value!: number;

  @IsOptional()
  @IsString()
  competence?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  settlePending?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  generateAudit?: boolean;
}

class CancelManualPaymentDto {
  @IsOptional()
  @IsString()
  observation?: string;
}

class UpdateMasterCompanyProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  taxDocument?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  billingProvider?: string;

  @IsOptional()
  @IsString()
  subscriptionStatus?: string;

  @IsOptional()
  @IsBoolean()
  premiumAccess?: boolean;
}

class PermanentDeleteDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}

class BatchPermanentDeleteDto {
  @IsOptional()
  @IsString()
  moduleKey?: string;

  @IsOptional()
  @IsInt()
  companyId?: number;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsString()
  confirmText!: string;
}

@Controller('modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  listMyModules(@Req() req: any) {
    return this.modulesService.listMyModules(Number(req.user?.id));
  }

  @Get('webscraping/entry')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @ModuleAccess('webscraping')
  async webscrapingEntry() {
    const runtime = await probeWebscrapingRuntime();
    return {
      url: runtime.publicUrl,
      runtime,
    };
  }

  @Get('company/access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  listCompanyAccess(@Req() req: any) {
    return this.modulesService.listCompanyAccessForAdmin(Number(req.user?.id));
  }

  @Put('company/user/:userId/access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  updateUserAccess(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserModuleAccessDto,
  ) {
    return this.modulesService.updateCompanyUserModuleAccess(Number(req.user?.id), userId, dto?.modules || []);
  }

  @Get('master/companies')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listMasterCompanies(@Req() req: any) {
    return this.modulesService.listMasterOverview(Number(req.user?.id));
  }

  @Get('master/workspace')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getMasterWorkspace(@Req() req: any) {
    return this.modulesService.getMasterWorkspace(Number(req.user?.id));
  }

  @Get('master/system-modules')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listMasterSystemModules(@Req() req: any) {
    return this.modulesService.listMasterSystemModules(Number(req.user?.id));
  }

  @Put('master/system-modules/:moduleKey')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateMasterSystemModule(
    @Req() req: any,
    @Param('moduleKey') moduleKey: string,
    @Body() dto: UpdateSystemModuleCatalogDto,
  ) {
    return this.modulesService.updateMasterSystemModule(Number(req.user?.id), moduleKey, dto || {});
  }

  @Get('master/global-integrations')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getMasterGlobalIntegrations(@Req() req: any) {
    return this.modulesService.getMasterGlobalIntegrations(Number(req.user?.id));
  }

  @Put('master/global-integrations')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateMasterGlobalIntegrations(@Req() req: any, @Body() dto: UpdateMasterGlobalIntegrationsDto) {
    return this.modulesService.updateMasterGlobalIntegrations(Number(req.user?.id), dto || {});
  }

  @Get('master/company/:companyId/detail')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getMasterCompanyDetail(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.modulesService.getMasterCompanyDetail(Number(req.user?.id), companyId);
  }

  @Put('master/company/:companyId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanyModule(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetCompanyModuleDto,
  ) {
    return this.modulesService.setCompanyModuleByMaster(Number(req.user?.id), companyId, dto?.moduleKey, Boolean(dto?.enabled));
  }

  @Put('master/company/:companyId/global-token-usage')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyMasterTokenUsage(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateCompanyMasterTokenUsageDto,
  ) {
    return this.modulesService.updateCompanyMasterTokenUsage(Number(req.user?.id), companyId, dto || {});
  }

  @Post('master/company/:companyId/import-tokens-to-master')
  @UseGuards(JwtAuthGuard, MasterGuard)
  importCompanyTokensToMaster(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: ImportCompanyTokensToMasterDto,
  ) {
    return this.modulesService.importCompanyTokensToMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Post('master/company/:companyId/trial')
  @UseGuards(JwtAuthGuard, MasterGuard)
  grantTrial(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: GrantTrialDto,
  ) {
    return this.modulesService.manageTrialByMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Put('master/company/:companyId/payment')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setPaymentStatus(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetPaymentStatusDto,
  ) {
    return this.modulesService.setPaymentStatus(Number(req.user?.id), companyId, dto?.paymentStatus);
  }

  @Post('master/company/:companyId/manual-payment')
  @UseGuards(JwtAuthGuard, MasterGuard)
  recordManualPayment(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: RecordManualPaymentDto,
  ) {
    return this.modulesService.recordManualPayment(Number(req.user?.id), companyId, dto || {});
  }

  @Put('master/company/:companyId/manual-payment/:entryId/cancel')
  @UseGuards(JwtAuthGuard, MasterGuard)
  cancelManualPayment(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('entryId') entryId: string,
    @Body() dto: CancelManualPaymentDto,
  ) {
    return this.modulesService.cancelManualPaymentEntry(Number(req.user?.id), companyId, entryId, dto || {});
  }

  @Put('master/company/:companyId/profile')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyProfile(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateMasterCompanyProfileDto,
  ) {
    return this.modulesService.updateCompanyProfileByMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Get('master/exclusoes')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listExclusoes(
    @Req() req: any,
    @Query('moduleKey') moduleKey?: string,
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
  ) {
    return this.modulesService.listMasterExclusoes(Number(req.user?.id), {
      moduleKey,
      companyId: Number(companyId || 0) || undefined,
      search,
    });
  }

  @Delete('master/exclusoes/batch')
  @UseGuards(JwtAuthGuard, MasterGuard)
  permanentDeleteExclusaoBatch(
    @Req() req: any,
    @Body() dto: BatchPermanentDeleteDto,
  ) {
    return this.modulesService.permanentDeleteExclusoesBatch(Number(req.user?.id), {
      moduleKey: dto?.moduleKey,
      companyId: dto?.companyId,
      motivo: dto?.motivo,
      confirmText: dto?.confirmText,
    });
  }

  @Delete('master/exclusoes/:id')
  @UseGuards(JwtAuthGuard, MasterGuard)
  permanentDeleteExclusao(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PermanentDeleteDto,
  ) {
    return this.modulesService.permanentDeleteExclusao(Number(req.user?.id), id, dto?.motivo);
  }
}
