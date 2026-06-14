import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { MetaLeadAdsService } from './meta-lead-ads.service';

// Webhook público do Meta (sem JwtAuthGuard, igual aos webhooks de Mercado Pago).
// Segurança vem da verificação de assinatura HMAC, não de sessão.
@Controller('webhooks/meta/leadgen')
export class MetaLeadAdsWebhookController {
  constructor(private readonly metaService: MetaLeadAdsService) {}

  // Handshake de verificação: o Meta chama uma vez e espera o hub.challenge de volta.
  @Get()
  verify(@Query() query: Record<string, any>): string {
    const challenge = this.metaService.verifyHandshake(query);
    if (challenge === null) {
      throw new ForbiddenException('Token de verificação inválido.');
    }
    return challenge;
  }

  // Recebimento de leads. Sempre responde 200 para o Meta não re-tentar em loop;
  // o resultado do processamento vai no corpo.
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: any,
    @Body() body: any,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const result = await this.metaService.processWebhook({
      rawBody: req?.rawBody,
      signatureHeader: signature,
      body,
    });
    return { received: true, ...result };
  }
}
