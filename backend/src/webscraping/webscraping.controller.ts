import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { EnrichmentCostService } from './enrichment-cost/enrichment-cost.service';
import { getConfiguredHbxEngineMaxCount, HbxEnginePoolService } from './hbx-engine-pool.service';
import { LeadHarvestImportService } from './lead-harvest/lead-harvest-import.service';
import { ZapCheckGuardService } from '../messaging/zap-check-guard.service';
import { RadarMissionQueueService } from './radar/missions/radar-mission-queue.service';
import { RADAR_REGION_MAX_RADIUS_KM } from './radar/shared/radar-core-shared';
import { RadarTreeStatusService } from './radar-tree-status/radar-tree-status.service';
import { SourceBudgetService } from './source-budget/source-budget.service';
import { WebscrapingService } from './webscraping.service';

@ValidatorConstraint({ name: 'MaxConfiguredHbxEngineCount', async: false })
class MaxConfiguredHbxEngineCountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value == null || value === '') return true;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= getConfiguredHbxEngineMaxCount();
  }

  defaultMessage(_args: ValidationArguments) {
    return `engineCount deve respeitar HBX_ENGINE_MAX_COUNT (${getConfiguredHbxEngineMaxCount()}).`;
  }
}

class WebscrapingSearchDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(RADAR_REGION_MAX_RADIUS_KM)
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng?: number;

  @IsOptional()
  @IsString()
  segment?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @IsOptional()
  @IsIn(['google', 'hbx'])
  engine?: 'google' | 'hbx';

  @IsOptional()
  @IsIn(['pj', 'pf', 'agenda_pf'])
  targetType?: 'pj' | 'pf' | 'agenda_pf';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  minReviews?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyWithWebsite?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePhoneDigits?: string[];

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  preferredChannels?: string[];

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  requiredChannels?: string[];

  @IsOptional()
  @IsIn(['prefer', 'any_required', 'all_required'])
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required';

  @IsOptional()
  @IsIn(['live', 'database_first', 'hybrid'])
  freshness?: 'live' | 'database_first' | 'hybrid';

  @IsOptional()
  @IsString()
  whatDoYouSell?: string;

  @IsOptional()
  @IsString()
  offerCategory?: string;

  @IsOptional()
  @IsObject()
  salesProfile?: Record<string, any>;

  @IsOptional()
  targetAudience?: string[] | Record<string, any>;

  @IsOptional()
  targetSegments?: string[] | Record<string, any>;

  @IsOptional()
  avoidSegments?: string[] | Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  hardRejectSegments?: string[];

  @IsOptional()
  @IsObject()
  leadPreferences?: Record<string, any>;

  @IsOptional()
  @IsObject()
  negativeRules?: Record<string, any>;
}

class RadarDatabaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // VITRINE (carrossel do Radar): scope=vitrine mostra a lagoa compartilhada (todos),
  // contato mascarado. Sem isso = tela Leads (filtra pelo que o vendedor puxou).
  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  filterKey?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(RADAR_REGION_MAX_RADIUS_KM)
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng?: number;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsIn(['pj', 'pf', 'agenda_pf', 'both'])
  targetType?: 'pj' | 'pf' | 'agenda_pf' | 'both';

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  ddd?: string;

  @IsOptional()
  @IsString()
  scoreRange?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  minReviews?: number;

  @IsOptional()
  noWebsite?: boolean | string;

  @IsOptional()
  withWebsite?: boolean | string;

  @IsOptional()
  weakWebsite?: boolean | string;

  @IsOptional()
  validPhone?: boolean | string;

  @IsOptional()
  likelyWhatsapp?: boolean | string;

  @IsOptional()
  highOpportunity?: boolean | string;

  @IsOptional()
  @IsString()
  opportunityLevel?: string;

  @IsOptional()
  @IsIn(['google', 'hbx'])
  engine?: 'google' | 'hbx';

  @IsOptional()
  includeHidden?: boolean | string;

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  preferredChannels?: string[];

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  requiredChannels?: string[];

  @IsOptional()
  @IsIn(['prefer', 'any_required', 'all_required'])
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required';

  @IsOptional()
  @IsIn(['live', 'database_first', 'hybrid'])
  freshness?: 'live' | 'database_first' | 'hybrid';
}

class RadarLeadEventDto {
  @IsIn(['denied', 'complaint', 'no_answer', 'hidden', 'contacted'])
  eventType!: 'denied' | 'complaint' | 'no_answer' | 'hidden' | 'contacted';

  @IsOptional()
  @IsString()
  note?: string;
}

class RadarCampaignDto {
  @IsOptional()
  @IsIn(['radar_database', 'mass_data'])
  mode?: 'radar_database' | 'mass_data';

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsIn(['pj', 'pf', 'agenda_pf', 'both'])
  targetType?: 'pj' | 'pf' | 'agenda_pf' | 'both';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  targetTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttemptsPerTask?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nightOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  allowedStartHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  allowedEndHour?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}

class MasterTurboConfigDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(59)
  startMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  endHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(59)
  endMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Validate(MaxConfiguredHbxEngineCountConstraint)
  engineCount?: number;

  @IsOptional()
  @IsIn(['economico', 'normal', 'turbo'])
  intensity?: 'economico' | 'normal' | 'turbo';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(256)
  memoryTargetGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttemptsPerTask?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autonomousFillEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  autonomousFillBatchSize?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceNow?: boolean;

  @IsOptional()
  @IsString()
  forcedUntil?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emergencyStop?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  stopOutsideWindow?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  weekdaysOnly?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  weekendAlwaysOn?: boolean;

  @IsOptional()
  @IsString()
  factoryState?: string;

  @IsOptional()
  @IsString()
  factoryCity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Validate(MaxConfiguredHbxEngineCountConstraint)
  maxEngines?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Validate(MaxConfiguredHbxEngineCountConstraint)
  minEngines?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(900)
  drainTimeoutSeconds?: number;

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  preferredChannels?: string[];

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  requiredChannels?: string[];

  @IsOptional()
  @IsIn(['prefer', 'any_required', 'all_required'])
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required';

  @IsOptional()
  @IsIn(['live', 'database_first', 'hybrid'])
  freshness?: 'live' | 'database_first' | 'hybrid';
}

class MasterMassDataDto extends MasterTurboConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsString()
  state!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsIn(['pj', 'pf', 'both'])
  targetType?: 'pj' | 'pf' | 'both';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  targetTotal?: number;
}

class MasterEngineDrainDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(900)
  seconds?: number;
}

class MasterEngineStopDto extends MasterEngineDrainDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force?: boolean;
}

class MasterDatabaseCardsQueryDto extends RadarDatabaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;
}

class MasterDeleteDatabaseCardsDto extends MasterDatabaseCardsQueryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadIds?: string[];
}

class RadarPullDto extends RadarDatabaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  desiredStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  minimumStock?: number;

  @IsOptional()
  @IsIn(['off', 'enrich', 'only_valid'])
  whatsappCheckMode?: 'off' | 'enrich' | 'only_valid';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare preferredChannels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare requiredChannels?: string[];

  @IsOptional()
  @IsIn(['prefer', 'any_required', 'all_required'])
  declare channelMatchMode?: 'prefer' | 'any_required' | 'all_required';

  @IsOptional()
  @IsIn(['live', 'database_first', 'hybrid'])
  declare freshness?: 'live' | 'database_first' | 'hybrid';

  @IsOptional()
  @IsString()
  declare whatDoYouSell?: string;

  @IsOptional()
  @IsString()
  declare offerCategory?: string;

  @IsOptional()
  @IsObject()
  declare salesProfile?: Record<string, any>;

  @IsOptional()
  declare targetAudience?: string[] | Record<string, any>;

  @IsOptional()
  declare targetSegments?: string[] | Record<string, any>;

  @IsOptional()
  declare avoidSegments?: string[] | Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  declare hardRejectSegments?: string[];

  @IsOptional()
  @IsObject()
  declare leadPreferences?: Record<string, any>;

  @IsOptional()
  @IsObject()
  declare negativeRules?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? undefined : Array.isArray(value) ? value : [value])
  @IsArray()
  @IsString({ each: true })
  leadIds?: string[];
}

class RadarPullPreviewQueryDto {
  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(RADAR_REGION_MAX_RADIUS_KM)
  radiusKm?: number;
}

class RadarNegativeDto {
  @IsOptional()
  @IsIn(['negative', 'denied', 'discarded', 'descartado', 'blocked', 'bloqueado', 'opt_out', 'optout', 'do_not_contact', 'nao_quer_contato', 'não_quer_contato', 'complaint', 'hidden', 'no_whatsapp', 'invalid_whatsapp'])
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  privateNotes?: string;
}

class RadarMarkSentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadIds?: string[];
}

class RadarDistributeDto {
  @IsArray()
  @IsString({ each: true })
  leadIds!: string[];

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds!: number[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  skipWhatsappValidation?: boolean;
}

class RadarAutoDistributionRuleDto {
  @IsOptional()
  @IsIn(['draft', 'active', 'paused'])
  status?: 'draft' | 'active' | 'paused';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeAdmin?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  adminTargetStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  targetStockPerSeller?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  adminDailyLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  dailyLimitPerSeller?: number;

  @IsOptional()
  @IsString()
  preferredState?: string;

  @IsOptional()
  @IsString()
  preferredCity?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(RADAR_REGION_MAX_RADIUS_KM)
  radiusKm?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @IsOptional()
  @IsArray()
  territories?: Array<{
    userId?: number;
    cities?: Array<{ city?: string; state?: string }>;
  }>;
}

class RadarAutoDistributionRunDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class RadarSellerStandingOrderDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsString()
  alcance?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantos?: number;
}

class RadarTenantAutoDistributionDto {
  @IsOptional()
  @IsIn(['draft', 'active', 'paused'])
  status?: 'draft' | 'active' | 'paused';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  targetStockPerSeller?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  dailyLimitPerSeller?: number;

  @IsOptional()
  @IsArray()
  territories?: Array<{
    userId?: number;
    cities?: Array<{ city?: string; state?: string }>;
  }>;
}

@Controller('webscraping')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('webscraping')
export class WebscrapingController {
  constructor(
    private readonly webscrapingService: WebscrapingService,
    private readonly hbxEnginePool: HbxEnginePoolService,
    private readonly leadHarvestImportService: LeadHarvestImportService,
    private readonly enrichmentCostService: EnrichmentCostService,
  ) {}

  @Get('runtime')
  getRuntime(@Req() req: any) {
    return this.webscrapingService.getRuntime(req.user);
  }

  @Get('engines/status')
  getEngineStatus() {
    return this.hbxEnginePool.getDashboardEngineStatus();
  }

  @Get('cities')
  cities(@Query('q') query?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.webscrapingService.listBrazilianCities(
      query,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Post('search')
  search(@Req() req: any, @Body() dto: WebscrapingSearchDto) {
    return this.webscrapingService.searchContactsForUser(req.user, dto);
  }

  @Post('lead-harvest/import')
  importLeadHarvest(@Req() req: any, @Body() body: Record<string, any>) {
    return this.leadHarvestImportService.importBatchForUser(req.user, body || {});
  }

  @Get('enrichment-cost/summary')
  enrichmentCostSummary(@Req() req: any, @Query('days') days?: string) {
    return this.enrichmentCostService.getCompanyCostSummaryForUser(req.user, { days });
  }

  @Get('lead-harvest/imports/:id')
  getLeadHarvestImport(@Req() req: any, @Param('id') id: string) {
    return this.leadHarvestImportService.getImportForUser(req.user, id);
  }

  @Get('search-runs/:id')
  getSearchRun(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.getSearchRunForUser(req.user, id);
  }

  @Get('history')
  history(@Req() req: any, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.webscrapingService.listRecentHistoryForUser(
      req.user,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get('radar/database')
  async radarDatabase(@Req() req: any, @Query() query: RadarDatabaseQueryDto) {
    try {
      return await this.webscrapingService.listRadarDatabaseForUser(req.user, query || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/database', error);
    }
  }

  @Get('radar/leads')
  async radarLeads(@Req() req: any, @Query() query: RadarDatabaseQueryDto) {
    try {
      return await this.webscrapingService.listRadarLeadsForUser(req.user, query || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/leads', error);
    }
  }

  @Get('radar/preference-suggestions')
  radarPreferenceSuggestions(@Req() req: any) {
    return this.webscrapingService.getPreferenceSuggestionsForUser(req.user);
  }

  @Get('radar/leads/:id')
  radarLeadDetails(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.getRadarLeadForUser(req.user, id);
  }

  @Post('radar/leads/:id/send-to-vendas')
  radarLeadSendToVendas(@Req() req: any, @Param('id') id: string, @Body() body?: { skipWhatsappValidation?: boolean }) {
    return this.webscrapingService.importRadarLeadToVendasForUser(req.user, id, { ...(body || {}), debitOnImport: (body as any)?.debitOnImport !== false });
  }

  @Post('radar/leads/:id/enrich')
  radarLeadEnrich(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.enrichRadarLeadForUser(req.user, id);
  }

  @Post('radar/leads/mark-sent-to-vendas')
  radarLeadsMarkSentToVendas(@Req() req: any, @Body() dto: RadarMarkSentDto) {
    return this.webscrapingService.markRadarLeadsSentToVendasForUser(req.user, dto?.leadIds || []);
  }

  @Post('radar/leads/distribute-to-vendedores')
  radarLeadsDistributeToVendedores(@Req() req: any, @Body() dto: RadarDistributeDto) {
    return this.webscrapingService.distributeRadarLeadsToVendedoresForUser(req.user, dto || ({} as any));
  }

  @Get('radar/auto-distribution')
  radarAutoDistributionRule(@Req() req: any) {
    return this.webscrapingService.getRadarAutoDistributionRuleForUser(req.user);
  }

  @Get('radar/standing-order')
  getSellerStandingOrder(@Req() req: any) {
    return this.webscrapingService.getRadarSellerStandingOrder(req.user);
  }

  @Put('radar/standing-order')
  saveSellerStandingOrder(@Req() req: any, @Body() dto: RadarSellerStandingOrderDto) {
    return this.webscrapingService.saveRadarSellerStandingOrder(req.user, dto || {});
  }

  @Post('radar/leads/:id/event')
  radarLeadEvent(@Req() req: any, @Param('id') id: string, @Body() dto: RadarLeadEventDto) {
    return this.webscrapingService.addRadarLeadEventForUser(req.user, id, dto || ({} as any));
  }

  @Post('radar/leads/:id/email/presentation/preview')
  radarLeadPresentationPreview(@Req() req: any, @Param('id') id: string, @Body() body?: any) {
    return this.webscrapingService.previewRadarPresentationEmailForUser(req.user, id, body || {});
  }

  @Post('radar/leads/:id/email/presentation/send')
  radarLeadPresentationSend(@Req() req: any, @Param('id') id: string, @Body() body?: any) {
    return this.webscrapingService.sendRadarPresentationEmailForUser(req.user, id, body || {});
  }

  // Preview do pull para vendedor: retorna candidatos que casam com o pedido
  // enriquecidos (nome/cidade/score/sinal) mas com contato mascarado. Sem gravar.
  @Get('radar/pull-preview')
  async radarPullPreview(@Req() req: any, @Query() query: RadarPullPreviewQueryDto) {
    try {
      return await this.webscrapingService.previewRadarLeadsForVendedor(req.user, query || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/pull-preview', error);
    }
  }

  // Pull do vendedor (modelo B / PR13062026008): o vendedor puxa cards da lagoa
  // pela preferencia dele e eles caem direto na carteira em Vendas.
  @Post('radar/pull-to-vendas')
  async radarPullToVendas(@Req() req: any, @Body() dto: RadarPullDto) {
    try {
      return await this.webscrapingService.pullRadarLeadsToVendasForUser(req.user, dto || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/pull-to-vendas', error);
    }
  }

  @Post('radar/search-runs')
  async radarSearchRun(@Req() req: any, @Body() dto: RadarPullDto) {
    try {
      return await this.webscrapingService.startRadarSearchRunForUser(req.user, dto || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/search-runs', error);
    }
  }

  @Get('radar/search-runs/latest')
  async latestRadarSearchRun(@Req() req: any) {
    try {
      return await this.webscrapingService.getLatestRadarSearchRunForUser(req.user);
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/search-runs/latest', error);
    }
  }

  @Get('radar/search-runs/:id')
  async radarSearchRunStatus(@Req() req: any, @Param('id') id: string) {
    try {
      return await this.webscrapingService.getRadarSearchRunForUser(req.user, id);
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/search-runs/:id', error);
    }
  }

  @Post('radar/search-runs/:id/cancel')
  async cancelRadarSearchRun(@Req() req: any, @Param('id') id: string) {
    try {
      return await this.webscrapingService.cancelRadarSearchRunForUser(req.user, id);
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/search-runs/:id/cancel', error);
    }
  }

  @Post('radar/:id/import-to-vendas')
  radarImportToVendas(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.importRadarLeadToVendasForUser(req.user, id, { debitOnImport: true });
  }

  @Post('radar/:id/negative')
  radarNegative(@Req() req: any, @Param('id') id: string, @Body() dto: RadarNegativeDto) {
    return this.webscrapingService.markRadarLeadNegativeForUser(req.user, id, dto || {});
  }

  @Get('campaigns')
  radarCampaigns(@Req() req: any) {
    return this.webscrapingService.listRadarCampaignsForUser(req.user);
  }

  @Get('campaigns/:id')
  radarCampaign(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.getRadarCampaignForUser(req.user, id);
  }

}

@Controller('modules/owner/radar')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterWebscrapingController {
  constructor(
    private readonly webscrapingService: WebscrapingService,
    private readonly hbxEnginePool: HbxEnginePoolService,
    private readonly radarMissionQueue: RadarMissionQueueService,
    private readonly radarTreeStatus: RadarTreeStatusService,
  ) {}

  // Cache in-memory 10s (F3, 02/07): a árvore faz polling 15s da UI × os blocos batem em Prisma/
  // serviços que já têm seu próprio custo (engines/status faz health-check real) — sem cache, cada
  // reload duplica o trabalho. TTL curto de propósito: números "quase ao vivo", nunca contador
  // preso (nunca > 10s de atraso). Falha não é cacheada (só sucesso, mesmo parcial-tolerante).
  private treeStatusCache: { at: number; data: any } | null = null;
  private static readonly TREE_STATUS_CACHE_MS = 10_000;

  /**
   * GET /modules/owner/radar/tree-status
   * Agregador da aba "Árvore do motor" (:3107) — a MESMA grade do desenho
   * docs/PLANEJAMENTOS/ARVORE-MESTRA/pesquisa-vps.svg, com números reais. Tolerante a falha
   * parcial: cada bloco que falhar volta `{ ok:false, error }`, nunca derruba a resposta inteira.
   */
  @Get('tree-status')
  async getTreeStatus() {
    const now = Date.now();
    if (this.treeStatusCache && (now - this.treeStatusCache.at) < MasterWebscrapingController.TREE_STATUS_CACHE_MS) {
      return { ...this.treeStatusCache.data, cached: true };
    }
    const data = await this.radarTreeStatus.build({
      web: async () => {
        const status = await this.hbxEnginePool.getDashboardEngineStatus();
        const cap = status?.capacity || ({} as any);
        return {
          alive: Number(cap.activeEngineCount ?? 0),
          queued: Number(cap.queuedCount ?? 0),
          running: Number(cap.runningCount ?? 0),
          operationalStatus: cap.operationalStatus ?? null,
        };
      },
      missions: async () => this.radarMissionQueue.stats(),
      vault: async () => SourceBudgetService.usageSnapshot(),
      zapGate: () => ZapCheckGuardService.getStats(),
    });
    this.treeStatusCache = { at: now, data };
    return { ...data, cached: false };
  }

  @Get('engines/status')
  getMasterEngineStatus() {
    return this.hbxEnginePool.getDashboardEngineStatus();
  }

  // Gauge do governor FÍSICO por fonte (Sprint 3 MOTOR-RFB-FILA): usado/teto/período lendo
  // SourceApiUsage via SourceBudgetService (estático — mesma verdade que os call-sites usam).
  @Get('source-budget')
  getSourceBudget() {
    return SourceBudgetService.usageSnapshot();
  }

  @Get('database-audit')
  getDatabaseAudit(@Req() req: any) {
    return this.webscrapingService.getMasterDatabaseAudit(req.user);
  }

  @Get('database-cards')
  getDatabaseCards(@Req() req: any, @Query() query: MasterDatabaseCardsQueryDto) {
    return this.webscrapingService.listMasterDatabaseCards(req.user, query || {});
  }

  @Delete('database-cards/batch')
  deleteDatabaseCards(@Req() req: any, @Body() dto: MasterDeleteDatabaseCardsDto) {
    return this.webscrapingService.permanentDeleteMasterDatabaseCards(req.user, dto || {});
  }

  @Get('export-targets')
  getExportTargets() {
    return this.webscrapingService.listRadarExportTargetsForMaster();
  }

  @Get('radar-auto-distribution')
  getRadarAutoDistribution(@Req() req: any) {
    return this.webscrapingService.getRadarTenantAutoDistributionPanel(req.user);
  }

  @Put('radar-auto-distribution')
  saveRadarAutoDistribution(@Req() req: any, @Body() dto: RadarTenantAutoDistributionDto) {
    return this.webscrapingService.saveRadarTenantAutoDistributionPanel(req.user, dto || {});
  }

  @Post('radar-auto-distribution/run')
  runRadarAutoDistribution(@Req() req: any, @Body() dto: RadarAutoDistributionRunDto) {
    return this.webscrapingService.runRadarTenantDistributionForUser(req.user, dto || {});
  }

  @Get('factory-status')
  getFactoryStatus(@Req() req: any) {
    return this.webscrapingService.getRadarFactoryStatus(req.user);
  }

  @Post('elastic/cancel-forced')
  cancelForcedFactory(@Req() req: any, @Body() dto: MasterEngineStopDto) {
    return this.webscrapingService.cancelForcedRadarFactory(req.user, dto || {});
  }

  @Post('factory/stop')
  stopFactory(@Req() req: any) {
    return this.webscrapingService.stopRadarFactory(req.user);
  }

  @Post('factory/resume-schedule')
  resumeFactorySchedule(@Req() req: any) {
    return this.webscrapingService.resumeFactorySchedule(req.user);
  }

  @Post('factory/force-next')
  forceNextFactory(@Req() req: any) {
    return this.webscrapingService.forceNextRadarFactoryMission(req.user);
  }

  @Post('factory/purge-dead-queue')
  purgeDeadQueue(@Req() req: any) {
    return this.webscrapingService.purgeDeadMassDataQueue(req.user);
  }

  @Get('mass-data')
  getMassDataControl(@Req() req: any) {
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('turbo-noturno/force-now')
  forceTurboNow(@Req() req: any, @Body() dto: MasterTurboConfigDto) {
    return this.webscrapingService.forceMasterTurboNow(req.user, dto || {});
  }

  @Post('mass-data')
  createMassDataCampaign(@Req() req: any, @Body() dto: MasterMassDataDto) {
    return this.webscrapingService.createMasterMassDataCampaign(req.user, dto || ({} as any));
  }

  // "Parar/Ligar faixa" do painel do dono → parada MANUAL durável (manualPaused) que o governor
  // honra e a elástica NÃO desfaz. Substitui o docker stop cru (ops-control) que o governor re-ligava.
  @Post('engines/stop-range')
  async stopMasterEngineRange(@Req() _req: any, @Body() dto: { from?: number; to?: number }) {
    const { from, to } = this.normalizeMasterEngineRange(dto);
    const result = await this.hbxEnginePool.setEnginesManualStopped(this.buildMasterEngineIdRange(from, to));
    return { ok: true, action: 'stop', from, to, affected: result.affected, ids: result.ids, status: await this.hbxEnginePool.getDashboardEngineStatus() };
  }

  @Post('engines/start-range')
  async startMasterEngineRange(@Req() _req: any, @Body() dto: { from?: number; to?: number }) {
    const { from, to } = this.normalizeMasterEngineRange(dto);
    const result = await this.hbxEnginePool.setEnginesManualResumed(this.buildMasterEngineIdRange(from, to));
    return { ok: true, action: 'start', from, to, affected: result.affected, ids: result.ids, status: await this.hbxEnginePool.getDashboardEngineStatus() };
  }

  private normalizeMasterEngineRange(dto: { from?: number; to?: number }) {
    const from = Math.max(1, Math.trunc(Number(dto?.from || 1)));
    const to = Math.min(Math.max(from, Math.trunc(Number(dto?.to || from))), from + 49);
    return { from, to };
  }

  private buildMasterEngineIdRange(from: number, to: number) {
    const ids: string[] = [];
    for (let index = from; index <= to; index += 1) ids.push(`hbx-engine-${index}`);
    return ids;
  }

  @Post('mass-data/:id/pause')
  pauseMassDataCampaign(@Param('id') id: string) {
    return this.webscrapingService.pauseRadarCampaignByMaster(id);
  }

  @Post('mass-data/:id/resume')
  resumeMassDataCampaign(@Param('id') id: string) {
    return this.webscrapingService.resumeRadarCampaignByMaster(id);
  }

  @Post('mass-data/:id/cancel')
  cancelMassDataCampaign(@Param('id') id: string) {
    return this.webscrapingService.cancelRadarCampaignByMaster(id);
  }

  // --- Elástica pura (contrato fixo: Worker A) ---

  /** Liga a elástica em runtime. A frota volta a escalar pela demanda × RAM. */
  @Post('elastic/enable')
  enableElastic() {
    return this.hbxEnginePool.setElasticEnabled(true);
  }

  /** Desliga a elástica em runtime. Governor segura o desired no warm e NÃO cresce. */
  @Post('elastic/disable')
  disableElastic() {
    return this.hbxEnginePool.setElasticEnabled(false);
  }

  /**
   * Parada DURÁVEL de todos os motores: status=stopped + manualPaused=true.
   * O governor não re-promove. Também desativa a elástica.
   */
  @Post('elastic/stop-all')
  async stopAllEngines() {
    return this.hbxEnginePool.stopAllEnginesDurable();
  }

  /**
   * POST /modules/owner/radar/cnpj-backfill?limit=200&socials=1
   * Worker 1 "CNPJ → dono". Cadeia grátis por lead: (a) web-enrichment/Brave L3 (site+CNPJ),
   * (b) L4 CNPJ vault → razão/CNAE/sócio/situação + TELEFONE do dono, (b2) sociais DO DONO
   * (Instagram/Facebook pessoais via busca web), (c) L1 sinais. NÃO inclui L5 (whatsapp-check).
   * `socials=0` desliga a etapa social. Devolve
   * { scanned, enriched, errors, sitesFound, cnpjsFound, phonesFound, socialsFound }.
   */
  @Post('cnpj-backfill')
  cnpjBackfill(@Query('limit') limit?: string, @Query('socials') socials?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.webscrapingService.cnpjBackfillForMaster({
      limit: Number.isFinite(parsed) ? parsed : 200,
      socials: socials === '0' || socials === 'false' ? false : true,
    });
  }

  /**
   * POST /modules/owner/radar/apply-contacts
   * Worker 2 "Email finder": aplica nos cards o que o Local Lab achou (e-mail/CNPJ/redes),
   * casando por `id`. ADITIVO — só preenche campo vazio. Body: { items: [{ id, email?, cnpj?,
   * instagramUrl?, facebookUrl? }] }. Devolve { requested, updated, emails, cnpjs, socials, errors }.
   */
  @Post('apply-contacts')
  applyContacts(@Body() body: { items?: Array<{ id?: string; email?: string; emails?: string[]; phones?: string[]; cnpj?: string; instagramUrl?: string; facebookUrl?: string }> }) {
    return this.webscrapingService.applyDiscoveredContactsForMaster(body?.items || []);
  }

  /**
   * POST /modules/owner/radar/ai-saneamento { limit? }
   * PR4a "worker de saneamento IA" (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md).
   * LIMPA nome + deduz SEGMENTO de leads crus via Ollama LOCAL. NÃO é enriquecimento de contato
   * nem nota ICP. Gate `HBX_AI_SANEAMENTO_ENABLED` (default OFF) — desligado devolve
   * `{ enabled:false, reason:'disabled' }` sem tocar em nada. Aditivo: só `metadataJson.ai*`,
   * NUNCA sobrescreve `name`/`segment`. Devolve { enabled:true, scanned, saneados, errors }.
   */
  @Post('ai-saneamento')
  aiSaneamento(@Body() body: { limit?: number }) {
    return this.webscrapingService.aiSaneamentoForMaster({ limit: body?.limit });
  }

  /**
   * GET /modules/owner/radar/contacts/export?kind=email&unclaimed=true&limit=50
   * PR1 (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md), resolve #15:
   * export em LOTE de contatos descobertos (LeadContact, tabela normalizada — não varre
   * metadataJson). `kind` filtra email|phone|whatsapp|instagram|facebook (omitido = todos).
   * `unclaimed=true` (default) só traz claimedByCompanyId IS NULL. Devolve { items, total }.
   */
  @Get('contacts/export')
  exportContacts(@Query() query: { kind?: string; unclaimed?: string; limit?: string }) {
    return this.webscrapingService.exportLeadContactsForMaster({
      kind: query?.kind,
      unclaimedOnly: query?.unclaimed !== '0' && query?.unclaimed !== 'false',
      limit: query?.limit ? Number(query.limit) : undefined,
    });
  }

  /**
   * POST /modules/owner/radar/ai-extract-contacts { items: [{ radarLeadId, sourceText }] }
   * Sprint 5 MOTOR-RFB-FILA (02/07): extração de contato por IA local (30B) com gate
   * anti-alucinação OBRIGATÓRIO — telefone/e-mail só gravam em LeadContact se passarem
   * formato (DDD + regra-do-9 + blocklist) E existirem literalmente na `sourceText`.
   * Gate de env `HBX_AI_EXTRACTION_ENABLED` (default OFF). Lote capado em 50.
   * Devolve { enabled, scanned, contactsWritten, rejectedByGate, ownersFound, errors }.
   */
  @Post('ai-extract-contacts')
  aiExtractContacts(@Body() body: { items?: Array<{ radarLeadId?: string; sourceText?: string }> }) {
    return this.webscrapingService.aiExtractContactsForMaster(body?.items || []);
  }

  /**
   * GET /modules/owner/radar/contacts/audit?sample=200
   * Auditoria do aceite Sprint 5: nenhum contato novo nasce SÓ no blob. Amostra leads
   * recentes com email/telefone e confere cobertura na tabela LeadContact.
   * Devolve { totalContacts, bySource, sample: { scanned, covered, uncovered, uncoveredLeadIds } }.
   */
  @Get('contacts/audit')
  auditContacts(@Query('sample') sample?: string) {
    return this.webscrapingService.auditLeadContactsForMaster({
      sample: sample ? Number(sample) : undefined,
    });
  }
}
