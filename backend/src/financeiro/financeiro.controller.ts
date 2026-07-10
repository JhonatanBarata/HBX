import { Body, Controller, Get, GoneException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { FinanceiroService } from './financeiro.service';
import {
  ChangeFinanceiroPlanDto,
  ChangeFinanceiroSubscriptionCardDto,
  RefundFinanceiroChargeDto,
} from './dto/financeiro.dto';

// MASTER-REFAB S7 / P0.2 (PR10072026 W1): aposentadoria do checkout de plano
// self-service. Grep no tree atual: ZERO chamadores no front (o checkout-panel
// virou recarga de créditos) e zero uso enterprise/master (master usa cancel/
// refund próprios; a recorrência MP EXISTENTE segue viva via webhook +
// subscription/sync — não é esta rota que a processa). Era também o destino do
// funil-fantasma do fallback de plano em conta crédito — morre junto com ele.
export const RETIRED_SUBSCRIPTION_CREATE_MESSAGE =
  'Contratação de plano por assinatura foi descontinuada. Conta de crédito usa recarga (Carteira); conta empresarial é montada pelo master.';

@Controller('financeiro')
@UseGuards(JwtAuthGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('overview')
  getOverview(@Req() req: any) {
    return this.financeiroService.getOverviewForUser(req.user);
  }

  @Get('payments-config')
  getPaymentsConfig(@Req() req: any) {
    return this.financeiroService.getPaymentsConfigForUser(req.user);
  }

  @Post('subscription/create')
  createSubscription() {
    throw new GoneException(RETIRED_SUBSCRIPTION_CREATE_MESSAGE);
  }

  @Post('subscription/cancel')
  cancelSubscription(@Req() req: any) {
    return this.financeiroService.cancelSubscriptionForUser(req.user);
  }

  // Troca de plano de assinatura ativa (upgrade proporcional / downgrade com crédito).
  @Post('subscription/change-plan')
  changePlan(@Req() req: any, @Body() dto: ChangeFinanceiroPlanDto) {
    return this.financeiroService.changePlanForUser(req.user, dto);
  }

  @Post('subscription/change-card')
  changeSubscriptionCard(@Req() req: any, @Body() dto: ChangeFinanceiroSubscriptionCardDto) {
    return this.financeiroService.changeSubscriptionCardForUser(req.user, dto);
  }

  // F6 — compra de bloco de assentos extras (ADMIN). dryRun=true só devolve o preview
  // (cobrança proporcional dos dias restantes + valor cheio do próximo mês).
  @Post('subscription/extra-seats')
  purchaseExtraSeats(@Req() req: any, @Body() dto: { seats?: number; cardTokenId?: string; dryRun?: boolean }) {
    return this.financeiroService.purchaseExtraSeats(req.user, dto || {});
  }

  @Get('subscription/status')
  getSubscriptionStatus(@Req() req: any) {
    return this.financeiroService.getSubscriptionStatusForUser(req.user);
  }

  // Re-sincroniza a assinatura com o MP sob demanda (tela de bloqueio ao abrir).
  @Post('subscription/sync')
  syncSubscription(@Req() req: any) {
    return this.financeiroService.syncSubscriptionForUser(req.user);
  }

  // F3 — estorno acionado pelo MASTER no painel de empresas. Sem amount = estorno total;
  // com amount = parcial. Guard duplo: MasterGuard + checagem isSystemMaster no service.
  @Post('master/company/:companyId/charge/:chargeId/refund')
  @UseGuards(MasterGuard)
  refundChargeByMaster(
    @Req() req: any,
    @Param('companyId') companyId: string,
    @Param('chargeId') chargeId: string,
    @Body() dto: RefundFinanceiroChargeDto,
  ) {
    return this.financeiroService.refundChargeByMaster(req.user, Number(companyId), chargeId, dto || {});
  }

  // Cancela a assinatura recorrente da empresa no MP pelo MASTER (botão na aba
  // Financeiro do painel de empresas). Para a cobrança do cartão sem excluir a empresa.
  @Post('master/company/:companyId/subscription/cancel')
  @UseGuards(MasterGuard)
  cancelSubscriptionByMaster(@Req() req: any, @Param('companyId') companyId: string) {
    return this.financeiroService.cancelSubscriptionByMaster(req.user, Number(companyId));
  }
}
