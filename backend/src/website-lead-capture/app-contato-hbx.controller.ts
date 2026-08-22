import { Body, Controller, HttpCode, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebsiteLeadCaptureService } from './website-lead-capture.service';

// PR22082026-CLIENTE-ME-ACHA — "QUERO QUE A HBX ME LIGUE", de dentro do app do entregador.
//
// Por que mora AQUI (website-lead-capture) e não em logistica/: quem sabe transformar um
// pedido de contato em lead no /vendas da HBX é este módulo (é o mesmo motor do formulário
// do site). O caminho é `logistica/contato-hbx` só porque é o app da logística quem chama
// — a allowlist do Kotlin (`NativeApiClient.isMobileEndpointAllowed`) libera
// `POST /logistica/contato-hbx`, e o APK precisa de rebuild pra conhecer a rota nova
// (regra da casa: ponte + allowlist + rebuild, os três ou nada).
//
// Guarda: só JWT. Sem ModuleAccessGuard de propósito — pedir contato com a HBX não pode
// depender de módulo ligado (é exatamente quando está tudo travado que o cliente precisa
// falar com a gente). Sem @Admin(): motorista também pode pedir.
//
// Política da Play: isto é PEDIDO DE CONTATO/SUPORTE — não tem preço, não tem compra, não
// tem link. É permitido dentro do app; a conversa comercial acontece fora.
@Controller('logistica')
export class AppContatoHbxController {
  constructor(private readonly captureService: WebsiteLeadCaptureService) {}

  @Post('contato-hbx')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 6, ttl: 60 } })
  async contatoHbx(@Req() req: any, @Body() body: any) {
    const result = await this.captureService.captureAppContact(req.user, {
      assunto: body?.assunto,
      telefone: body?.telefone,
      mensagem: body?.mensagem,
    });
    if (!result.ok) {
      throw new ServiceUnavailableException('Não consegui registrar seu pedido agora. Tente pelo WhatsApp.');
    }
    return { ok: true };
  }
}
