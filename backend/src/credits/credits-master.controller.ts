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
