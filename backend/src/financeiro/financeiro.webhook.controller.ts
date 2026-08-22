import { Body, Controller, ForbiddenException, Headers, Logger, Optional, Post, Query, Req } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { CreditRechargeService } from './credit-recharge.service';
import { evaluateMercadoPagoWebhookSignature, extractWebhookDataId } from '../payments/mercado-pago-webhook-signature';

@Controller('webhooks/mercadopago/financeiro')
export class FinanceiroWebhookController {
  private readonly logger = new Logger(FinanceiroWebhookController.name);
  private warnedMissingSecret = false;

  constructor(
    private readonly financeiroService: FinanceiroService,
    // PIX DA RECARGA (PR22082026): assenta crédito ANTES do processamento genérico. @Optional
    // pra não quebrar quem instancia o controller direto em teste.
    @Optional() private readonly rechargeService?: CreditRechargeService,
  ) {}

  // Só notificações de PAGAMENTO interessam à recarga; assinatura/preapproval segue o
  // caminho de sempre. Tolerante aos formatos que o MP manda (query `type`/`topic`, body).
  private extractPaymentIdForRecharge(query: Record<string, any>, body: any): string {
    const topic = String(query?.type || query?.topic || body?.type || body?.topic || body?.action || '').toLowerCase();
    if (topic && !/payment/.test(topic)) return '';
    const fromBody = body && typeof body === 'object' ? String((body.data && body.data.id) || body.id || '').trim() : '';
    return String(extractWebhookDataId(query) || fromBody || '').trim();
  }

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
      // PIX DA RECARGA (22/08, medido em produção): a notificação do MP pra `notification_url`
      // chega no formato IPN (`?topic=payment&id=…`) e a assinatura NÃO bate com o manifesto
      // padrão. Pra recarga isso não precisa ser fatal: o settle só age se existir cobrança
      // PENDENTE nossa com esse mpPaymentId (1 SELECT) e RE-CONSULTA o pagamento no MP antes
      // de creditar — a assinatura aqui é defesa contra abuso, não contra forja de status. O
      // resto do webhook (assinatura/checkout/recovery) segue REJEITADO como sempre.
      if (this.rechargeService) {
        const paymentId = this.extractPaymentIdForRecharge(query, body);
        if (paymentId) {
          const r = await this.rechargeService.settleIfCreditRecharge(paymentId);
          if (r.handled) {
            this.logger.warn(`webhook MP financeiro com assinatura inválida (reason=${gate.reason}) — recarga Pix paymentId=${paymentId} reconsultada no MP: ${r.status || r.reason || '-'}`);
          }
        }
      }
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

    // PIX DA RECARGA primeiro: se for pagamento de recarga pendente, o crédito entra AQUI.
    // O processamento genérico abaixo continua rodando (atualiza a charge; não duplica
    // receita porque a charge já sai com ledgerEntryId). Nunca lança (service engole).
    let recharge: { handled: boolean; status?: string; reason?: string } | null = null;
    if (this.rechargeService) {
      const paymentId = this.extractPaymentIdForRecharge(query, body);
      if (paymentId) recharge = await this.rechargeService.settleIfCreditRecharge(paymentId);
    }

    const result = await this.financeiroService.processMercadoPagoWebhook({
      companyId,
      query,
      body,
    });
    return {
      ok: true,
      received: true,
      ...result,
      ...(recharge && recharge.handled ? { creditRecharge: recharge } : {}),
    };
  }
}
