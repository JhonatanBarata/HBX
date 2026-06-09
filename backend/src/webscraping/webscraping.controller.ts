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
import { RADAR_REGION_MAX_RADIUS_KM } from './radar/shared/radar-core-shared';
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

class WebscrapingSearchMoreDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}

class RadarDatabaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

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

class MasterEnginePauseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;
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

class MasterExportCardsDto {
  @IsArray()
  @IsString({ each: true })
  leadIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;
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

class WebscrapingWebSearchDto {
  @IsString()
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  fresh?: boolean;
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

  @Post('web-search')
  webSearch(@Body() dto: WebscrapingWebSearchDto) {
    return this.webscrapingService.webSearch(dto);
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

  @Post('search-runs')
  createSearchRun(@Req() req: any, @Body() dto: WebscrapingSearchDto) {
    return this.webscrapingService.startSearchRunForUser(req.user, dto);
  }

  @Get('search-runs/:id')
  getSearchRun(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.getSearchRunForUser(req.user, id);
  }

  @Post('search-runs/:id/cancel')
  cancelSearchRun(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.cancelSearchRunForUser(req.user, id);
  }

  @Get('history')
  history(@Req() req: any, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.webscrapingService.listRecentHistoryForUser(
      req.user,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Post('history/:id/reuse')
  reuseHistory(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.reuseHistorySearchForUser(req.user, id);
  }

  @Post('history/:id/search-more')
  searchMoreHistory(@Req() req: any, @Param('id') id: string, @Body() dto: WebscrapingSearchMoreDto) {
    return this.webscrapingService.searchMoreHistoryForUser(req.user, id, dto?.quantity || 100);
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

  @Put('radar/auto-distribution')
  saveRadarAutoDistributionRule(@Req() req: any, @Body() dto: RadarAutoDistributionRuleDto) {
    return this.webscrapingService.saveRadarAutoDistributionRuleForUser(req.user, dto || {});
  }

  @Post('radar/auto-distribution/run')
  runRadarAutoDistribution(@Req() req: any, @Body() dto: RadarAutoDistributionRunDto) {
    return this.webscrapingService.runRadarAutoDistributionForUser(req.user, dto || {});
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

  @Post('radar/pull')
  async radarPull(@Req() req: any, @Body() dto: RadarPullDto) {
    try {
      return await this.webscrapingService.pullRadarLeadsForUser(req.user, dto || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/pull', error);
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

  @Post('radar/replenish')
  async radarReplenish(@Req() req: any, @Body() dto: RadarPullDto) {
    try {
      return await this.webscrapingService.replenishRadarStockForUser(req.user, dto || {});
    } catch (error) {
      return this.webscrapingService.buildRadarClientErrorResponse(req.user, '/webscraping/radar/replenish', error);
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

  @Post('campaigns')
  createRadarCampaign(@Req() req: any, @Body() dto: RadarCampaignDto) {
    return this.webscrapingService.createRadarCampaignForUser(req.user, dto || {});
  }

  @Get('campaigns')
  radarCampaigns(@Req() req: any) {
    return this.webscrapingService.listRadarCampaignsForUser(req.user);
  }

  @Get('campaigns/:id')
  radarCampaign(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.getRadarCampaignForUser(req.user, id);
  }

  @Post('campaigns/:id/pause')
  pauseRadarCampaign(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.pauseRadarCampaignForUser(req.user, id);
  }

  @Post('campaigns/:id/resume')
  resumeRadarCampaign(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.resumeRadarCampaignForUser(req.user, id);
  }

  @Post('campaigns/:id/cancel')
  cancelRadarCampaign(@Req() req: any, @Param('id') id: string) {
    return this.webscrapingService.cancelRadarCampaignForUser(req.user, id);
  }

  @Post('export')
  async exportExcel(
    @Req() req: any,
    @Body() dto: WebscrapingSearchDto,
    @Res() res: Response,
  ) {
    const exported = await this.webscrapingService.exportContactsForUser(req.user, dto);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.buffer);
  }
}

@Controller('modules/master/webscraping')
@UseGuards(JwtAuthGuard, MasterGuard)
export class MasterWebscrapingController {
  constructor(
    private readonly webscrapingService: WebscrapingService,
    private readonly hbxEnginePool: HbxEnginePoolService,
    private readonly enrichmentCostService: EnrichmentCostService,
  ) {}

  @Get('engines/status')
  getMasterEngineStatus() {
    return this.hbxEnginePool.getDashboardEngineStatus();
  }

  @Get('database-audit')
  getDatabaseAudit(@Req() req: any) {
    return this.webscrapingService.getMasterDatabaseAudit(req.user);
  }

  @Get('database-cards')
  getDatabaseCards(@Req() req: any, @Query() query: MasterDatabaseCardsQueryDto) {
    return this.webscrapingService.listMasterDatabaseCards(req.user, query || {});
  }

  @Get('enrichment-cost/summary')
  getMasterEnrichmentCostSummary(
    @Query('companyId') companyId: string,
    @Query('days') days?: string,
    @Query('planKey') planKey?: string,
  ) {
    return this.enrichmentCostService.getCompanyCostSummary(companyId, { days, planKey });
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

  @Post('export-cards')
  exportCards(@Req() req: any, @Body() dto: MasterExportCardsDto) {
    return this.webscrapingService.exportRadarCardsToTarget(req.user, dto || ({} as any));
  }

  @Get('factory-status')
  getFactoryStatus(@Req() req: any) {
    return this.webscrapingService.getRadarFactoryStatus(req.user);
  }

  @Get('elastic/status')
  getElasticStatus(@Req() req: any) {
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('factory/start')
  startFactory(@Req() req: any) {
    return this.webscrapingService.startRadarFactory(req.user);
  }

  @Post('elastic/force-night')
  forceNightFactory(@Req() req: any, @Body() dto: MasterTurboConfigDto) {
    return this.webscrapingService.forceNightRadarFactory(req.user, dto || {});
  }

  @Post('elastic/cancel-forced')
  cancelForcedFactory(@Req() req: any, @Body() dto: MasterEngineStopDto) {
    return this.webscrapingService.cancelForcedRadarFactory(req.user, dto || {});
  }

  @Post('factory/stop')
  stopFactory(@Req() req: any) {
    return this.webscrapingService.stopRadarFactory(req.user);
  }

  @Post('factory/stop-now')
  stopFactoryNow(@Req() req: any) {
    return this.webscrapingService.stopFactoryNow(req.user);
  }

  @Post('factory/resume-schedule')
  resumeFactorySchedule(@Req() req: any) {
    return this.webscrapingService.resumeFactorySchedule(req.user);
  }

  @Post('factory/force-next')
  forceNextFactory(@Req() req: any) {
    return this.webscrapingService.forceNextRadarFactoryMission(req.user);
  }

  @Post('factory/reset-cursor')
  resetFactoryCursor(@Req() req: any) {
    return this.webscrapingService.resetRadarFactoryCursor(req.user);
  }

  @Get('mass-data')
  getMassDataControl(@Req() req: any) {
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Put('turbo-noturno')
  saveTurboNoturno(@Req() req: any, @Body() dto: MasterTurboConfigDto) {
    return this.webscrapingService.saveMasterTurboConfig(req.user, dto || {});
  }

  @Post('turbo-noturno/force-now')
  forceTurboNow(@Req() req: any, @Body() dto: MasterTurboConfigDto) {
    return this.webscrapingService.forceMasterTurboNow(req.user, dto || {});
  }

  @Post('mass-data')
  createMassDataCampaign(@Req() req: any, @Body() dto: MasterMassDataDto) {
    return this.webscrapingService.createMasterMassDataCampaign(req.user, dto || ({} as any));
  }

  @Post('engines/:id/pause')
  async pauseMasterEngine(@Req() req: any, @Param('id') id: string, @Body() dto: MasterEnginePauseDto) {
    await this.hbxEnginePool.pauseEngine(id, { minutes: dto?.minutes });
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('engines/:id/resume')
  async resumeMasterEngine(@Req() req: any, @Param('id') id: string) {
    await this.hbxEnginePool.resumeEngine(id);
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('engines/:id/drain')
  async drainMasterEngine(@Req() req: any, @Param('id') id: string, @Body() dto: MasterEngineDrainDto) {
    await this.hbxEnginePool.drainEngine(id, { seconds: dto?.seconds });
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('engines/:id/stop')
  async stopMasterEngine(@Req() req: any, @Param('id') id: string, @Body() dto: MasterEngineStopDto) {
    await this.hbxEnginePool.stopEngine(id, { force: Boolean(dto?.force), seconds: dto?.seconds });
    return this.webscrapingService.getMasterMassDataControl(req.user);
  }

  @Post('engines/:id/stop-container')
  async stopMasterEngineContainer(@Req() req: any, @Param('id') id: string, @Body() dto: MasterEngineStopDto) {
    await this.hbxEnginePool.stopEngine(id, { force: Boolean(dto?.force), seconds: dto?.seconds });
    return this.webscrapingService.getMasterMassDataControl(req.user);
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
}
