import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { CreditsService, MasterGrantInput } from './credits.service';
import { isCreditsFeatureEnabled } from './credits.flags';

type UpdatePackBody = {
  title?: string;
  observation?: string;
  status?: 'available' | 'paused';
  credits?: number;
  price?: number;
  defaultExpiryDays?: number;
};

// CRÉDITOS S3-PARTE1 — endpoints MASTER: editar catálogo de pacotes de recarga + conceder
// crédito manual a uma empresa. Mesmo guard/padrão de master-provisioning.controller.ts
// (JwtAuthGuard, MasterGuard). Atrás de HBX_CREDITS_ENABLED (default OFF) — flag OFF ⇒ 404
// em toda a superfície (nada ativo).
@Controller('credits/master')
@UseGuards(JwtAuthGuard, MasterGuard)
export class CreditsMasterController {
  constructor(private readonly creditsService: CreditsService) {}

  private assertEnabled() {
    if (!isCreditsFeatureEnabled()) throw new NotFoundException('Recurso indisponivel');
  }

  @Get('packs')
  async listPacks() {
    this.assertEnabled();
    return { packs: await this.creditsService.listPacksForMaster() };
  }

  // MASTER-REFAB S2 — agregados de leitura pra guia "Visão geral" (receita de recarga 30d,
  // expiração 30d, lotes ativos/último consumo por empresa). Nada de escrita.
  @Get('overview')
  async getOverview() {
    this.assertEnabled();
    return this.creditsService.getMasterOverview();
  }

  // MASTER-REFAB S2 — leitura da config global (guia "Bônus de cadastro"): o PUT já existia
  // (config/expiry-default, config/welcome-batch); faltava o GET pra prefill do form.
  // GUARDRAILS S3 — dailyDeliveryCapDefault entra junto (prefill da guia "Config").
  @Get('config')
  async getGlobalConfig() {
    this.assertEnabled();
    const base = this.creditsService.getGlobalConfigForMaster();
    const dailyDeliveryCapDefault = await this.creditsService.getDailyDeliveryCapDefaultAsMaster();
    return { ...base, dailyDeliveryCapDefault };
  }

  // MASTER-REFAB S1 — bloco Carteira na ficha da empresa (saldo/lotes/extrato). Só leitura;
  // a concessão continua sendo o POST .../grant logo abaixo.
  @Get('company/:id')
  async getCompanyWallet(@Param('id', ParseIntPipe) companyId: number) {
    this.assertEnabled();
    return this.creditsService.getWalletOverviewForMaster(companyId);
  }

  @Put('packs/:packKey')
  async updatePack(@Param('packKey') packKey: string, @Body() body: UpdatePackBody) {
    this.assertEnabled();
    const pack = await this.creditsService.updatePackAsMaster(packKey, body || {});
    return { ok: true, pack };
  }

  @Put('config/expiry-default')
  async updateExpiryDefault(@Body() body: { defaultExpiryDays?: number }) {
    this.assertEnabled();
    return this.creditsService.updateGlobalExpiryDefaultAsMaster(Number(body?.defaultExpiryDays));
  }

  // CRÉDITOS A3 — config global do lote grátis de boas-vindas (quantidade/validade).
  @Put('config/welcome-batch')
  async updateWelcomeBatch(@Body() body: { welcomeCredits?: number; welcomeExpiryDays?: number }) {
    this.assertEnabled();
    return this.creditsService.updateWelcomeBatchConfigAsMaster(body || {});
  }

  // GUARDRAILS S3 (10/07) — teto diário GLOBAL default de entregas por empresa (anti-scraper).
  @Put('config/delivery-cap')
  async updateDeliveryCapDefault(@Body() body: { dailyDeliveryCapDefault?: number }) {
    this.assertEnabled();
    return this.creditsService.updateDailyDeliveryCapDefaultAsMaster(Number(body?.dailyDeliveryCapDefault));
  }

  // Concessão manual de crédito a uma empresa ("master libera créditos ao admin"). Idempotente
  // por sourceRef/usageKey (o service deriva usageKey do sourceRef quando não informada
  // explicitamente). createdByUserId = o master autenticado (trilha de auditoria no ledger).
  @Post('company/:id/grant')
  async grantToCompany(
    @Param('id', ParseIntPipe) companyId: number,
    @Body() body: MasterGrantInput,
    @Req() req: any,
  ) {
    this.assertEnabled();
    const masterUserId = Number(req.user?.id || 0);
    const result = await this.creditsService.grantToCompanyAsMaster(masterUserId, companyId, body);
    return { ok: true, ...result };
  }
}
