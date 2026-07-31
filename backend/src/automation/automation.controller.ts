import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { AutomationOverviewService } from './automation-overview.service';
import { AgentService } from './agent.service';
import { PlaysService } from './plays.service';
import type {
  AutomationAgentPublishRequest,
  AutomationAgentSandboxRequest,
  PutAutomationAgentRequest,
} from './dto/agent.dto';
import type { AplicarCadenciaDto } from '../cadencia/dto/cadencia.dto';

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
    private readonly playsService: PlaysService,
  ) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    return this.overviewService.getOverview(req.user);
  }

  // IDENTIDADE ÚNICA + ENTREVISTA (31/07/2026): o perfil da IA (nome/quem
  // representa + "o que a empresa faz") mora no /automacao — /vendas,
  // /conversas e /recovery só encaminham pra cá. GET aberto ao módulo;
  // PUT valida dono/gerente dentro do service.
  @Get('perfil-ia')
  getPerfilIa(@Req() req: any) {
    return this.overviewService.getPerfilIa(req.user);
  }

  @Put('perfil-ia')
  putPerfilIa(
    @Req() req: any,
    @Body() dto: { aiNome?: string | null; aiIdentidade?: string; aiUserId?: number | null; empresaFazTexto?: string | null },
  ) {
    return this.overviewService.putPerfilIa(req.user, dto || {});
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

  // S11 — visão unificada dos "plays" proativos (prospecção/cadência/rotina).
  // Permissão fina (canManage) é decidida DENTRO de cada service dono, ver
  // plays.service.ts (header do arquivo) — GET é aberto a qualquer usuário do
  // módulo (mesmo padrão de /automation/agent), toggle/aplicar exigem
  // canManage do domínio correspondente.
  @Get('plays')
  listPlays(@Req() req: any) {
    return this.playsService.listForUser(req.user);
  }

  @Post('plays/:tipo/:id/toggle')
  togglePlay(@Req() req: any, @Param('tipo') tipo: string, @Param('id') id: string, @Body() dto: { ativo?: boolean }) {
    return this.playsService.togglePlay(req.user, tipo, id, Boolean(dto?.ativo));
  }

  @Post('plays/cadencia/:id/aplicar')
  aplicarCadenciaPlay(@Req() req: any, @Param('id') id: string, @Body() dto: AplicarCadenciaDto) {
    return this.playsService.aplicarCadenciaPlay(req.user, id, dto || {});
  }
}
