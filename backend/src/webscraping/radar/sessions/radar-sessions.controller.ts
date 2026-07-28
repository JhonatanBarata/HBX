import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../../modules/module-access.guard';
import { ModuleAccess } from '../../../modules/module-feature.decorator';
import { RadarSearchSessionService } from './radar-search-session.service';

// REFUNDAÇÃO F1 (28/07): a fila multi-cidade sai do navegador. O front agora só faz
// POST (criar), GET (re-hidratar TUDO ao voltar pra tela) e pause/resume/cancel.
// Mesma cadeia de auth do WebscrapingController (JWT + módulo webscraping).

class RadarSessionCityDto {
  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  state?: string;
}

class RadarSessionStartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RadarSessionCityDto)
  cities!: RadarSessionCityDto[];

  @IsString()
  segment!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  pauseAfterLeads?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  targetTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originLng?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredChannels?: string[];

  @IsOptional()
  @IsIn(['prefer', 'any_required', 'all_required'])
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required';

  @IsOptional()
  @IsIn(['off', 'enrich', 'only_valid'])
  whatsappCheckMode?: 'off' | 'enrich' | 'only_valid';
}

@Controller('webscraping/radar/sessions')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('webscraping')
export class RadarSessionsController {
  constructor(private readonly sessions: RadarSearchSessionService) {}

  @Post()
  async start(@Req() req: any, @Body() dto: RadarSessionStartDto) {
    const { cities, segment, quantity, pauseAfterLeads, targetTotal, ...filters } = dto || ({} as RadarSessionStartDto);
    return this.sessions.startSessionForUser(req.user, {
      cities: cities || [],
      segment: segment || '',
      quantity,
      pauseAfterLeads,
      targetTotal,
      filters,
    });
  }

  @Get('active')
  async active(@Req() req: any) {
    return this.sessions.getActiveSessionForUser(req.user);
  }

  @Post(':id/pause')
  async pause(@Req() req: any, @Param('id') id: string) {
    return this.sessions.pauseSessionForUser(req.user, id);
  }

  @Post(':id/resume')
  async resume(@Req() req: any, @Param('id') id: string) {
    return this.sessions.resumeSessionForUser(req.user, id);
  }

  @Post(':id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string) {
    return this.sessions.cancelSessionForUser(req.user, id);
  }
}
