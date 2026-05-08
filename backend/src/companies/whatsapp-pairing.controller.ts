import { Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsAppModalService } from './whatsapp-modal.service';

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

  @Post('sessions/:sessionId/pairing-code')
  requestPairingCode(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: WhatsAppPairingCodeDto,
  ) {
    return this.whatsappModalService.requestPairingCode(
      this.resolveCompanyId(req),
      String(sessionId || '').trim(),
      body.phoneNumber,
    );
  }
}
