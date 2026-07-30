import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaOsrmService } from './logistica-osrm.service';

/**
 * S4 (PR21072026-NAVEGACAO-HBX) — proxy OSRM sob `/logistica/osrm/*`, mesmo
 * guard/tenancy dos demais controllers `/logistica/*` (ver LogisticaOsrmService
 * pro contrato completo: cache, rate-limit, timeout, fallback no app).
 */
@Controller('logistica/osrm')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaOsrmController {
  constructor(private readonly osrm: LogisticaOsrmService) {}

  private companyId(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Empresa não identificada.');
    return companyId;
  }

  // `bearings` (30/07): direção do carro no waypoint de origem, pro retraço não
  // mandar retorno na hora. Validado no service (formato, contagem, faixa) —
  // nunca sai daqui pra URL do upstream sem passar por lá.
  @Get('route')
  route(
    @Req() req: any,
    @Query('coords') coords: string,
    @Query('steps') steps?: string,
    @Query('bearings') bearings?: string,
  ) {
    return this.osrm.route(this.companyId(req), coords, steps, bearings);
  }

  @Get('table')
  table(@Req() req: any, @Query('coords') coords: string) {
    return this.osrm.table(this.companyId(req), coords);
  }
}
