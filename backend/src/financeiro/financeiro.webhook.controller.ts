import { Body, Controller, Headers, Post, Query, Req } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';

@Controller('webhooks/mercadopago/financeiro')
export class FinanceiroWebhookController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Post()
  async handleWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query('company_id') companyIdRaw?: string,
    @Headers('x-signature') _signature?: string,
  ) {
    const companyId = Number(companyIdRaw || 0) || undefined;
    const result = await this.financeiroService.processMercadoPagoWebhook({
      companyId,
      query: req?.query || {},
      body,
    });
    return {
      ok: true,
      received: true,
      ...result,
    };
  }
}
