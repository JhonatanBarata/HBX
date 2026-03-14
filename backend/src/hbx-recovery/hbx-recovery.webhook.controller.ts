import { Body, Controller, Headers, Post, Query, Req } from '@nestjs/common';
import { HbxRecoveryService } from './hbx-recovery.service';

@Controller('webhooks/mercadopago')
export class HbxRecoveryWebhookController {
  constructor(private readonly recoveryService: HbxRecoveryService) {}

  @Post()
  async handleWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query('company_id') companyIdRaw?: string,
    @Headers('x-signature') signature?: string,
  ) {
    const companyId = Number(companyIdRaw || 0) || undefined;
    const result = await this.recoveryService.processMercadoPagoWebhook({
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
