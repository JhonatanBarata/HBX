import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaAdminRouteService } from './logistica-admin-route.service';
import { LogisticaAdminRouteViewService } from './logistica-admin-route-view.service';

class PrepareAdminRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  operationalDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceDates?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pendingDeliveryIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origemLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origemLng?: number;
}

@Controller('logistica/admin-route')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@ModuleAccess('logistica')
@Admin()
export class LogisticaAdminRouteController {
  constructor(
    private readonly adminRoute: LogisticaAdminRouteService,
    private readonly routeView: LogisticaAdminRouteViewService,
  ) {}

  private companyId(req: any): number {
    const id = Math.trunc(Number(req?.user?.companyId || 0));
    if (!id) throw new ForbiddenException('Empresa não identificada.');
    return id;
  }

  @Get('route')
  route(@Req() req: any, @Query('date') date?: string) {
    return this.routeView.getRoute(this.companyId(req), date, req.user);
  }

  @Get('adjustments')
  adjustments(@Req() req: any, @Query('date') date?: string) {
    return this.adminRoute.getAdjustments(this.companyId(req), date, req.user);
  }

  @Post('prepare')
  prepare(@Req() req: any, @Body() dto: PrepareAdminRouteDto) {
    return this.adminRoute.prepare(this.companyId(req), dto || {}, req.user);
  }

  @Post('start')
  start(@Req() req: any, @Body() dto: PrepareAdminRouteDto) {
    return this.adminRoute.start(this.companyId(req), dto || {}, req.user);
  }

  @Post('deliveries/:id/retry-later')
  retryLater(@Req() req: any, @Param('id') id: string) {
    return this.adminRoute.retryLater(this.companyId(req), id, req.user);
  }

  @Get('history')
  history(@Req() req: any, @Query('days') days?: string) {
    return this.adminRoute.history(this.companyId(req), days, req.user);
  }
}
