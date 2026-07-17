import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaMobileService } from './logistica-mobile.service';

class MaterializeMobileOccurrencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  operationalDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  sourceDates?: string[];
}

@Controller('logistica/mobile')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaMobileController {
  constructor(private readonly mobile: LogisticaMobileService) {}

  private companyId(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Empresa não identificada.');
    return companyId;
  }

  @Get('route')
  route(@Req() req: any, @Query('date') date?: string) {
    return this.mobile.getRoute(this.companyId(req), date, req.user);
  }

  @Post('materialize')
  materialize(@Req() req: any, @Body() dto: MaterializeMobileOccurrencesDto) {
    return this.mobile.materialize(this.companyId(req), dto || {}, req.user);
  }
}
