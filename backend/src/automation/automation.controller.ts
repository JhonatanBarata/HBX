import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { AutomationOverviewService } from './automation-overview.service';
import { AgentService } from './agent.service';
import type {
  AutomationAgentPublishRequest,
  AutomationAgentSandboxRequest,
  PutAutomationAgentRequest,
} from './dto/agent.dto';

// S04 (MOTOR-ÚNICO) — módulo `automation` novo, primeiro endpoint real.
//
// Gate de 3 chaves (README decisão nº2, revisada pós-S03 em
// S04-modulo-automation-overview.md "⚠️ Gate de 3 chaves"): responde se a
// empresa tem `atendimento` OU `bot` OU `vendas`. `ModuleAccess(...)` já
// implementa OR quando recebe mais de uma chave (module-feature.decorator.ts +
// module-access.guard.ts) — nenhum guard novo, nenhuma chave nova.
//
// S05 — rotas do agente (AgentService, adapter de AssistenteConfig +
// BotConfig(atendimento_bot)). Permissão fina (canManage/403) é decidida
// DENTRO do AgentService, não aqui — o gate de módulo (`@ModuleAccess`
// acima) só garante que a empresa tem UM dos 3 módulos; GET/sandbox são
// liberados a qualquer usuário do módulo, PUT/publish exigem canManage
// (README "o agente é DA EMPRESA", Admin/USERMASTER).
@Controller('automation')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('atendimento', 'bot', 'vendas')
export class AutomationController {
  constructor(
    private readonly overviewService: AutomationOverviewService,
    private readonly agentService: AgentService,
  ) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    return this.overviewService.getOverview(req.user);
  }

  @Get('agent')
  getAgent(@Req() req: any) {
    return this.agentService.getView(req.user);
  }

  @Put('agent')
  updateAgent(@Req() req: any, @Body() dto: PutAutomationAgentRequest) {
    return this.agentService.updateAgent(req.user, dto || ({} as PutAutomationAgentRequest));
  }

  @Post('agent/sandbox')
  sandboxAgent(@Req() req: any, @Body() dto: AutomationAgentSandboxRequest) {
    return this.agentService.sandbox(req.user, dto || {});
  }

  @Post('agent/publish')
  publishAgent(@Req() req: any, @Body() dto: AutomationAgentPublishRequest) {
    return this.agentService.publish(req.user, dto || {});
  }
}
