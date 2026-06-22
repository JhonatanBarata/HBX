import { Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsAppModalService } from './whatsapp-modal.service';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';

class WhatsAppPairingCodeDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Informe o telefone em formato E.164, exemplo +5519999999999.',
  })
  phoneNumber!: string;
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppPairingController {
  constructor(private readonly whatsappModalService: WhatsAppModalService) {}

  private resolveCompanyId(req: any) {
    const assumedCompanyId = Number(req?.user?.masterContext?.active ? req.user.masterContext.companyId : 0);
    const companyId = assumedCompanyId || Number(req?.user?.companyId || req?.user?.company?.id || 0);
    if (!companyId) {
      throw new ForbiddenException('Contexto da empresa obrigatório para vincular WhatsApp.');
    }
    return companyId;
  }

  private resolveUserId(req: any): number | undefined {
    const id = Number(req?.user?.id || 0);
    return id > 0 ? id : undefined;
  }

  @Post('sessions/:sessionId/pairing-code')
  @UseGuards(ModuleAccessGuard)
  @ModuleAccess('atendimento')
  requestPairingCode(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: WhatsAppPairingCodeDto,
  ) {
    return this.whatsappModalService.requestPairingCode(
      this.resolveCompanyId(req),
      String(sessionId || '').trim(),
      body.phoneNumber,
      this.resolveUserId(req),
      req.user,
    );
  }
}
