import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { AutomationOverviewService } from './automation-overview.service';

// S04 (MOTOR-ÚNICO) — módulo `automation` novo, primeiro endpoint real.
//
// Gate de 3 chaves (README decisão nº2, revisada pós-S03 em
// S04-modulo-automation-overview.md "⚠️ Gate de 3 chaves"): responde se a
// empresa tem `atendimento` OU `bot` OU `vendas`. `ModuleAccess(...)` já
// implementa OR quando recebe mais de uma chave (module-feature.decorator.ts +
// module-access.guard.ts) — nenhum guard novo, nenhuma chave nova.
@Controller('automation')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('atendimento', 'bot', 'vendas')
export class AutomationController {
  constructor(private readonly overviewService: AutomationOverviewService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    return this.overviewService.getOverview(req.user);
  }
}
