import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { WebwhatsBridgeService } from './webwhats-bridge.service';

type MercadoPagoApprovedNotificationDto = {
  companyId?: number | string;
  to?: string;
  text?: string;
};

@Controller('master/payment-notifications')
export class MasterPaymentNotificationsController {
  constructor(private readonly webwhatsBridge: WebwhatsBridgeService) {}

  private assertNotifySecret(secret?: string) {
    const expected = String(process.env.MASTER_PAYMENT_NOTIFY_SECRET || '').trim();
    if (!expected) {
      throw new BadRequestException('MASTER_PAYMENT_NOTIFY_SECRET not configured');
    }
    if (!secret || secret !== expected) {
      throw new ForbiddenException('invalid payment notification secret');
    }
  }

  private normalizeCompanyId(value: unknown) {
    const companyId = Number(value);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('companyId invalido');
    }
    return companyId;
  }

  private normalizeWhatsAppTarget(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException('destinatario invalido');
    }
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  private normalizeText(value: unknown) {
    const text = String(value || '').trim();
    if (!text) {
      throw new BadRequestException('texto da mensagem obrigatorio');
    }
    if (text.length > 4000) {
      throw new BadRequestException('texto da mensagem excede 4000 caracteres');
    }
    return text;
  }

  @Post('mercadopago-approved')
  async sendMercadoPagoApprovedNotification(
    @Body() body: MercadoPagoApprovedNotificationDto,
    @Headers('x-master-payment-notify-secret') secret?: string,
  ) {
    this.assertNotifySecret(secret);

    const companyId = this.normalizeCompanyId(body?.companyId);
    const to = this.normalizeWhatsAppTarget(body?.to);
    const text = this.normalizeText(body?.text);
    const result = await this.webwhatsBridge.sendText(companyId, { to, text });

    return {
      ok: true,
      companyId,
      to: result.target,
      providerMessageId: result.providerMessageId,
      rawMessageId: result.rawMessageId,
    };
  }
}
