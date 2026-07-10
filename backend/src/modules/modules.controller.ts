import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulesService } from './modules.service';
import { ModuleAccessGuard } from './module-access.guard';
import { ModuleAccess } from './module-feature.decorator';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MasterGuard } from '../auth/guards/master.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Admin } from '../auth/admin.decorator';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from '../integrations/dto/integration-connection.dto';
import { IntegrationSyncDto } from '../integrations/dto/integration-sync.dto';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { probeWebscrapingRuntime } from './webscraping-runtime.util';
import { COMMERCIAL_PLAN_KEYS } from '../commercial-plans/commercial-plan-catalog';

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

class UpdateMasterBillingPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  annualPlanDiscountPercent?: number;

  // Assento extra saiu da política global — agora é por-plano no catálogo (Self-Checkout).

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  referralDiscountActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  referralDiscountPercent?: number;

  @IsOptional()
  @IsString()
  referralDiscountMode?: string;
}

class UpdateVendasComplaintDto {
  @IsOptional()
  @IsIn(['new', 'reviewing', 'refunded', 'denied', 'resolved'])
  status?: string;

  @IsOptional()
  @IsString()
  internalNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  refundCards?: number;
}

class BatchDeleteVendasComplaintsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complaintIds?: string[];

  @IsOptional()
  @IsIn(['all', 'new', 'reviewing', 'refunded', 'denied', 'resolved'])
  status?: string;
}

class RestoreRadarExclusionDto {
  @IsOptional()
  @IsString()
  motivo?: string;
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

class SetSuspensionDto {
  @IsBoolean()
  suspended: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

// MASTER-REFAB S6 (10/07 noite): toggle enxuto do tipo explícito de conta (2 valores, sem
// meio-termo — "só vão ter 2 tipos: conta crédito ou conta empresarial").
class SetAccountTypeDto {
  @IsString()
  @IsIn(['credit', 'enterprise'])
  accountType!: string;
}

class SetCompanyPlanDto {
  @IsString()
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.PRO, COMMERCIAL_PLAN_KEYS.MELHOR])
  planKey!: string;
}

class GrantPlanTasteDto {
  @IsString()
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.PRO, COMMERCIAL_PLAN_KEYS.MELHOR])
  planKey!: string;

  @IsString()
  revertsAt!: string; // ISO date string

  @IsOptional()
  @IsString()
  reason?: string;
}

class CompleteAssistedSetupDto {
  @IsOptional()
  @IsString()
  note?: string;
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
}

class SetCourtesyDto {
  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

class SetBotActivationDto {
  @IsBoolean()
  armed: boolean;

  @IsOptional()
  @IsIn(['webwhats', 'meta'])
  channel?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateMasterCompanyFinanceSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  manualDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  freeMonths?: number;

  @IsOptional()
  @IsString()
  billingCycle?: string;

  // PF3: Central de Implantação do Full (registro do master).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  setupValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyValueOverride?: number;
}

class UpdateMasterCompanyQuotaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  monthlyCardLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  dailyCardLimit?: number;

  // Teto rígido de assentos (0/ausente = sem teto) — PR13062026005
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  seatCap?: number;
}

// GUARDRAILS S3 (10/07) — override por empresa do teto diário de entregas (anti-scraper).
// null explícito = limpa o override (herda o default global); 0 = sem teto só nesta empresa.
class UpdateMasterCompanyDeliveryCapDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  dailyDeliveryCapOverride?: number | null;
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

  @IsOptional()
  @IsString()
  search?: string;
}

@Controller('modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  listMyModules(@Req() req: any) {
    const surface = String(req?.headers?.['x-hbx-client-surface'] || '').trim().toLowerCase();
    const mobileRoute = String(req?.headers?.['x-hbx-mobile-route'] || '').trim().toLowerCase();
    return this.modulesService.listMyModules(Number(req.user?.id), {
      mobileRoute: surface === 'mobile' || mobileRoute === 'true' || mobileRoute === '1',
    });
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
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  listCompanyAccess(@Req() req: any) {
    return this.modulesService.listCompanyAccessForAdmin(Number(req.user?.id));
  }

  @Put('company/user/:userId/access')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  updateUserAccess(
    @Req() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserModuleAccessDto,
  ) {
    return this.modulesService.updateCompanyUserModuleAccess(Number(req.user?.id), userId, dto?.modules || []);
  }

  // Régua única (PR13062026007 P4): molho de ACESSO do cargo Vendedor (1 por
  // empresa). Acesso por cargo, não por pessoa.
  @Get('company/seller-cargo-access')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  getSellerCargoAccess(@Req() req: any) {
    return this.modulesService.getSellerCargoAccessForAdmin(Number(req.user?.id));
  }

  @Put('company/seller-cargo-access')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Admin()
  @ModuleAccess('gerencial')
  setSellerCargoAccess(@Req() req: any, @Body() dto: { access?: Record<string, unknown> }) {
    return this.modulesService.setSellerCargoAccessForAdmin(Number(req.user?.id), dto?.access || {});
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

  @Get('master/vendas-complaints')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listMasterVendasComplaints(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.modulesService.listMasterVendasComplaints(Number(req.user?.id), {
      status,
      limit: Number(limit || 0) || undefined,
    });
  }

  @Patch('master/vendas-complaints/:complaintId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateMasterVendasComplaint(
    @Req() req: any,
    @Param('complaintId') complaintId: string,
    @Body() dto: UpdateVendasComplaintDto,
  ) {
    return this.modulesService.updateMasterVendasComplaint(Number(req.user?.id), complaintId, dto || {});
  }

  @Delete('master/vendas-complaints/batch')
  @UseGuards(JwtAuthGuard, MasterGuard)
  deleteMasterVendasComplaintsBatch(
    @Req() req: any,
    @Body() dto: BatchDeleteVendasComplaintsDto,
  ) {
    return this.modulesService.permanentDeleteMasterVendasComplaints(Number(req.user?.id), dto || {});
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

  // Régua única (PR13062026007 PF2): Sistema → Planos — módulos padrões por plano.
  @Get('master/plan/:planKey/modules')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getMasterPlanModules(@Req() req: any, @Param('planKey') planKey: string) {
    return this.modulesService.getPlanModulesForMaster(Number(req.user?.id), planKey);
  }

  @Put('master/plan/:planKey/modules')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setMasterPlanModules(
    @Req() req: any,
    @Param('planKey') planKey: string,
    @Body() dto: { modules?: Record<string, unknown>; planInfo?: Record<string, unknown> },
  ) {
    return this.modulesService.setPlanModulesForMaster(Number(req.user?.id), planKey, dto || {});
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

  @Put('master/billing-policy')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateMasterBillingPolicy(@Req() req: any, @Body() dto: UpdateMasterBillingPolicyDto) {
    return this.modulesService.updateMasterBillingPolicy(Number(req.user?.id), dto || {});
  }

  @Get('master/company/:companyId/detail')
  @UseGuards(JwtAuthGuard, MasterGuard)
  getMasterCompanyDetail(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.modulesService.getMasterCompanyDetail(Number(req.user?.id), companyId);
  }

  @Get('master/company/:companyId/integrations')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listMasterCompanyIntegrations(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('provider') provider?: string,
  ) {
    return this.modulesService.listMasterCompanyIntegrations(Number(req.user?.id), companyId, provider);
  }

  @Post('master/company/:companyId/integrations')
  @UseGuards(JwtAuthGuard, MasterGuard)
  createMasterCompanyIntegration(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateIntegrationConnectionDto,
  ) {
    return this.modulesService.createMasterCompanyIntegration(Number(req.user?.id), companyId, dto);
  }

  @Patch('master/company/:companyId/integrations/:connectionId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateMasterCompanyIntegration(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateIntegrationConnectionDto,
  ) {
    return this.modulesService.updateMasterCompanyIntegration(Number(req.user?.id), companyId, connectionId, dto);
  }

  @Post('master/company/:companyId/integrations/:connectionId/test')
  @UseGuards(JwtAuthGuard, MasterGuard)
  testMasterCompanyIntegration(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('connectionId') connectionId: string,
  ) {
    return this.modulesService.testMasterCompanyIntegration(Number(req.user?.id), companyId, connectionId);
  }

  @Post('master/company/:companyId/integrations/:connectionId/sync')
  @UseGuards(JwtAuthGuard, MasterGuard)
  syncMasterCompanyIntegration(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('connectionId') connectionId: string,
    @Body() dto: IntegrationSyncDto,
  ) {
    return this.modulesService.syncMasterCompanyIntegration(Number(req.user?.id), companyId, connectionId, dto || {});
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

  @Put('master/company/:companyId/plan')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanyPlan(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetCompanyPlanDto,
  ) {
    return this.modulesService.setCompanyPlanByMaster(Number(req.user?.id), companyId, dto?.planKey);
  }

  @Post('master/company/:companyId/plan-taste')
  @UseGuards(JwtAuthGuard, MasterGuard)
  grantPlanTaste(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: GrantPlanTasteDto,
  ) {
    const revertsAt = new Date(dto?.revertsAt);
    if (isNaN(revertsAt.getTime())) throw new Error('revertsAt invalido');
    return this.modulesService.grantPlanTasteByMaster(Number(req.user?.id), companyId, dto?.planKey, revertsAt, dto?.reason);
  }

  @Delete('master/company/:companyId/plan-taste')
  @UseGuards(JwtAuthGuard, MasterGuard)
  revokePlanTaste(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.modulesService.revokePlanTasteByMaster(Number(req.user?.id), companyId);
  }

  @Post('master/company/:companyId/assisted-setup/complete')
  @UseGuards(JwtAuthGuard, MasterGuard)
  completeAssistedSetup(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CompleteAssistedSetupDto,
  ) {
    return this.modulesService.completeAssistedSetupByMaster(Number(req.user?.id), companyId, dto || {});
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

  @Put('master/company/:companyId/suspension')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanySuspension(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetSuspensionDto,
  ) {
    return this.modulesService.setCompanySuspensionByMaster(Number(req.user?.id), companyId, dto || {});
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

  @Put('master/company/:companyId/courtesy')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanyCourtesy(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetCourtesyDto,
  ) {
    return this.modulesService.setCompanyCourtesyByMaster(Number(req.user?.id), companyId, dto || {});
  }

  // MASTER-REFAB S6 (10/07 noite): toggle Crédito|Empresarial na ficha — PUT enxuto (padrão dos
  // PUTs vizinhos), substitui a derivação por cobrança do S1.
  @Put('master/company/:companyId/account-type')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanyAccountType(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetAccountTypeDto,
  ) {
    return this.modulesService.setCompanyAccountTypeByMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Put('master/company/:companyId/bot-activation')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setCompanyBotActivation(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetBotActivationDto,
  ) {
    return this.modulesService.setCompanyBotActivationByMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Put('master/company/:companyId/finance-settings')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyFinanceSettings(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateMasterCompanyFinanceSettingsDto,
  ) {
    return this.modulesService.updateCompanyFinanceSettingsByMaster(Number(req.user?.id), companyId, dto || {});
  }

  @Put('master/company/:companyId/card-quota')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyCardQuota(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateMasterCompanyQuotaDto,
  ) {
    return this.modulesService.updateCompanyCardQuotaByMaster(Number(req.user?.id), companyId, dto || {});
  }

  // GUARDRAILS S3 (10/07) — override por empresa do teto diário de entregas (anti-scraper).
  @Put('master/company/:companyId/delivery-cap')
  @UseGuards(JwtAuthGuard, MasterGuard)
  updateCompanyDeliveryCap(
    @Req() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateMasterCompanyDeliveryCapDto,
  ) {
    return this.modulesService.updateCompanyDailyDeliveryCapByMaster(Number(req.user?.id), companyId, dto || {});
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
      search: dto?.search,
    });
  }

  @Patch('master/exclusoes/radar-cards/:stateId/restore')
  @UseGuards(JwtAuthGuard, MasterGuard)
  restoreRadarCardExclusion(
    @Req() req: any,
    @Param('stateId') stateId: string,
    @Body() dto: RestoreRadarExclusionDto,
  ) {
    return this.modulesService.restoreRadarCardExclusion(Number(req.user?.id), stateId, dto?.motivo);
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
