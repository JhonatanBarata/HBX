import { Body, Controller, Delete, Get, Param, Post, Put, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { FinanceiroService } from './financeiro.service';
import {
  ChangeFinanceiroPlanDto,
  ChangeFinanceiroSubscriptionCardDto,
  CreateFinanceiroCheckoutDto,
  CreateFinanceiroSubscriptionDto,
  RefundFinanceiroChargeDto,
  SaveFinanceiroCardDto,
  UpdateFinanceiroPreferencesDto,
} from './dto/financeiro.dto';

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

  @Patch('preferences')
  updatePreferences(@Req() req: any, @Body() dto: UpdateFinanceiroPreferencesDto) {
    return this.financeiroService.updatePreferencesForUser(req.user, dto || {});
  }

  @Put('card')
  saveCard(@Req() req: any, @Body() dto: SaveFinanceiroCardDto) {
    return this.financeiroService.saveCardForUser(req.user, dto);
  }

  @Delete('card')
  removeCard(@Req() req: any) {
    return this.financeiroService.removeCardForUser(req.user);
  }

  @Post('checkout')
  createCheckout(@Req() req: any, @Body() dto: CreateFinanceiroCheckoutDto) {
    return this.financeiroService.createCheckoutForUser(req.user, dto);
  }

  @Post('subscription/create')
  createSubscription(@Req() req: any, @Body() dto: CreateFinanceiroSubscriptionDto) {
    return this.financeiroService.createSubscriptionForUser(req.user, dto);
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

  @Post('charges/:chargeId/refresh')
  refreshCharge(@Req() req: any, @Param('chargeId') chargeId: string, @Body() dto?: { paymentId?: string }) {
    return this.financeiroService.refreshChargeForUser(req.user, chargeId, dto?.paymentId);
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
