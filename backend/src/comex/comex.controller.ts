import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ComexService } from './comex.service';

/**
 * HBX COMEX — vendas/radar internacional. Módulo próprio ('comex' em
 * structural-defaults.json, defaultEnabled=true — nasce ligado, kill-switch
 * do master por empresa). Multi-tenant: dado analítico é PÚBLICO/agregado,
 * nada aqui é por-empresa — mesmo assim a porta exige sessão + módulo.
 */
@Controller('comex')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('comex')
export class ComexController {
  constructor(private readonly comex: ComexService) {}

  @Get('status')
  status() {
    return { disponivel: this.comex.disponivel() };
  }

  @Get('busca')
  busca(@Query('q') q: string) {
    return this.comex.buscaNcm(q || '');
  }

  @Get('mercado')
  mercado(@Query('sh4') sh4: string, @Query('fluxo') fluxo: string) {
    return this.comex.mercado(sh4, fluxo);
  }

  @Get('radar')
  radar(@Query('sh4') sh4: string, @Query('fluxo') fluxo: string) {
    return this.comex.radar(sh4, fluxo);
  }
}
