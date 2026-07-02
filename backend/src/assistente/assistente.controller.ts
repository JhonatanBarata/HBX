import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { AssistenteService } from './assistente.service';
import type { PublishDto, SandboxDto, SaveAssistenteDto } from './dto/assistente.dto';

// WORM-14 — Assistente IA. Mesma superficie do Bot (gate de modulo 'bot').
// NENHUM endpoint aqui dispara WhatsApp real: /sandbox roda o pipeline do bot
// (Ollama local) SEM Webwhats; /publish so liga a flag (default OFF).
@Controller('assistente')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('bot')
export class AssistenteController {
  constructor(private readonly assistente: AssistenteService) {}

  @Get()
  get(@Req() req: any) {
    return this.assistente.get(req.user);
  }

  @Get('templates')
  templates(@Query('perfil') perfil?: string) {
    return this.assistente.templates(perfil);
  }

  @Get('prompt')
  prompt(@Req() req: any) {
    return this.assistente.prompt(req.user);
  }

  @Post()
  save(@Req() req: any, @Body() dto: SaveAssistenteDto & { template?: string }) {
    return this.assistente.save(req.user, dto || {});
  }

  // TESTE SEGURO — sandbox, sem chip. Roda o mesmo pipeline do bot.
  @Post('sandbox')
  sandbox(@Req() req: any, @Body() dto: SandboxDto) {
    return this.assistente.runSandbox(req.user, dto || {});
  }

  // Publicar no chip — atras da flag HBX_ASSISTENTE_PUBLISH_ENABLED (default OFF).
  @Post('publish')
  publish(@Req() req: any, @Body() dto: PublishDto) {
    return this.assistente.publish(req.user, Boolean(dto?.on ?? true));
  }
}
