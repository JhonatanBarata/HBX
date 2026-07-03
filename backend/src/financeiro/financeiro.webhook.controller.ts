import { Body, Controller, ForbiddenException, Headers, Logger, Post, Query, Req } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { evaluateMercadoPagoWebhookSignature } from '../payments/mercado-pago-webhook-signature';

@Controller('webhooks/mercadopago/financeiro')
export class FinanceiroWebhookController {
  private readonly logger = new Logger(FinanceiroWebhookController.name);
  private warnedMissingSecret = false;

  constructor(private readonly financeiroService: FinanceiroService) {}

  @Post()
  async handleWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query('company_id') companyIdRaw?: string,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const query = req?.query || {};
    // Assinatura MP com modo log/enforce (MP_WEBHOOK_SIGNATURE_MODE); ver mercado-pago-webhook-signature.
    const gate = evaluateMercadoPagoWebhookSignature({ signatureHeader: signature, requestId, query });
    if (!gate.allow) {
      this.logger.error(`webhook MP financeiro REJEITADO (mode=${gate.mode}, reason=${gate.reason}).`);
      throw new ForbiddenException('invalid webhook signature');
    }
    if (gate.configured && !gate.valid) {
      this.logger.warn(`webhook MP financeiro assinatura inválida em modo log (reason=${gate.reason}) — aceito p/ observação.`);
    } else if (!gate.configured && !this.warnedMissingSecret) {
      this.warnedMissingSecret = true;
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET ausente (modo log) — webhooks MP aceitos sem validar assinatura.');
    }

    const companyId = Number(companyIdRaw || 0) || undefined;
    const result = await this.financeiroService.processMercadoPagoWebhook({
      companyId,
      query,
      body,
    });
    return {
      ok: true,
      received: true,
      ...result,
    };
  }
}
