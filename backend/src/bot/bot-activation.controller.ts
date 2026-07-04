import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { BotActivationService } from './bot-activation.service';
import type { BotTypeKey } from './dto/bot-activation.dto';

// GET não usa @BotArmed() — o painel precisa LER mesmo com pino desarmado,
// para mostrar o estado atual. PUT verifica pino internamente no service.

@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('bot')
@Controller('bot/activation')
export class BotActivationController {
  constructor(private readonly botActivationService: BotActivationService) {}

  @Get()
  getActivation(@Req() req: any) {
    return this.botActivationService.getActivation(req.user);
  }

  @Put()
  putActivation(@Req() req: any, @Body() body: { type: BotTypeKey; live: boolean }) {
    const type = body?.type;
    const live = body?.live;
    const validTypes: BotTypeKey[] = ['atendimento', 'recovery', 'prospeccao'];
    if (!type || !validTypes.includes(type)) {
      throw new BadRequestException('Campo "type" obrigatório: atendimento | recovery | prospeccao.');
    }
    if (typeof live !== 'boolean') {
      throw new BadRequestException('Campo "live" deve ser boolean.');
    }
    return this.botActivationService.putActivation(req.user, { type, live });
  }

  // Chave geral (master switch): liga/desliga o bot inteiro. NÃO usa @BotArmed —
  // desligar tem que funcionar sempre; o service valida admin e o pré-voo por dentro.
  @Put('master-switch')
  setMasterSwitch(@Req() req: any, @Body() body: { on: boolean }) {
    if (typeof body?.on !== 'boolean') {
      throw new BadRequestException('Campo "on" deve ser boolean.');
    }
    return this.botActivationService.setMasterSwitch(req.user, body.on);
  }

  // ── INTENTENGINE S3: histórico + rollback de config (admin/master) ──────────
  // Sem UI elaborada neste sprint (front fica de follow-up) — lista versões
  // (data + updatedByUserId) e permite voltar 1 versão. domain = atendimento_bot |
  // atendimento_agenda | bot_master_switch | recovery_bot.

  @Get('config/:domain/versions')
  listConfigVersions(@Req() req: any, @Param('domain') domain: string) {
    return this.botActivationService.listConfigVersions(req.user, domain);
  }

  @Put('config/:domain/rollback')
  rollbackConfig(@Req() req: any, @Param('domain') domain: string) {
    return this.botActivationService.rollbackConfig(req.user, domain);
  }
}
