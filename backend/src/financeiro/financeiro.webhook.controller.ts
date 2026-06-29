import { Body, Controller, ForbiddenException, Headers, Logger, Post, Query, Req } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import {
  extractWebhookDataId,
  getMercadoPagoWebhookSecret,
  verifyMercadoPagoWebhookSignature,
} from '../payments/mercado-pago-webhook-signature';

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
    // Verificação de assinatura é OPT-IN (MERCADO_PAGO_WEBHOOK_SECRET). Sem segredo,
    // segue o fluxo — a re-busca do pagamento na API do MP já barra forja de valor.
    if (getMercadoPagoWebhookSecret()) {
      const check = verifyMercadoPagoWebhookSignature({
        signatureHeader: signature,
        requestId,
        dataId: extractWebhookDataId(query),
      });
      if (!check.valid) {
        this.logger.warn(`webhook MP financeiro com assinatura inválida (${check.reason}).`);
        throw new ForbiddenException('invalid webhook signature');
      }
    } else if (!this.warnedMissingSecret) {
      this.warnedMissingSecret = true;
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET ausente — webhooks MP aceitos sem validar assinatura.');
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
