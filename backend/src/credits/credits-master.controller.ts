import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { CreditsService, MasterGrantInput } from './credits.service';
import { CreditWalletService } from './credit-wallet.service';
import { isCreditsFeatureEnabled } from './credits.flags';
import { PrismaService } from '../prisma/prisma.service';
import { emitMasterEvent } from '../common/master-event';

type UpdatePackBody = {
  title?: string;
  observation?: string;
  status?: 'available' | 'paused';
  credits?: number;
  price?: number;
  defaultExpiryDays?: number;
};

// P0.3 (PR10072026 W2) — débito manual do master (contraparte do grant): mesmo contrato de
// idempotência do grant (token estável por intenção; double-click não debita 2×).
type MasterManualDebitBody = {
  amount?: number;
  reason?: string;
  idempotencyKey?: string;
};

// CRÉDITOS S3-PARTE1 — endpoints MASTER: editar catálogo de pacotes de recarga + conceder
// crédito manual a uma empresa. Mesmo guard/padrão de master-provisioning.controller.ts
// (JwtAuthGuard, MasterGuard). Atrás de HBX_CREDITS_ENABLED (default OFF) — flag OFF ⇒ 404
// em toda a superfície (nada ativo).
@Controller('credits/master')
@UseGuards(JwtAuthGuard, MasterGuard)
export class CreditsMasterController {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly wallet: CreditWalletService,
    private readonly prisma: PrismaService,
  ) {}

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

  // P0.3 (PR10072026 W2) — débito MANUAL do master (ajuste/cobrança de dívida de estorno).
  // Mesma RBAC do grant (JwtAuthGuard+MasterGuard na classe). Append-only no ledger via
  // `wallet.debit` (fail-closed, clampa no saldo — nunca negativa) e auditado em MasterEvent.
  // A lógica mora aqui (não em credits.service.ts) de propósito: aquele arquivo está em
  // edição viva pela frente F6 (crédito universal).
  @Post('company/:id/debit')
  async debitCompany(
    @Param('id', ParseIntPipe) companyId: number,
    @Body() body: MasterManualDebitBody,
    @Req() req: any,
  ) {
    this.assertEnabled();
    const masterUserId = Number(req.user?.id || 0);

    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount deve ser um inteiro positivo');
    }
    const reason = String(body?.reason || '').trim();
    if (!reason) throw new BadRequestException('reason e obrigatorio');
    if (reason.length > 500) throw new BadRequestException('reason deve ter ate 500 caracteres');
    // Idempotência OBRIGATÓRIA (mesmo contrato do grant): débito manual é dinheiro — sem token
    // estável por intenção, um double-click do master debitaria 2×.
    const idempotencyKey = String(body?.idempotencyKey || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 80) {
      throw new BadRequestException('idempotencyKey obrigatoria (8-80 chars, um token por intencao de debito)');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    // usageKey ESCOPADA por empresa (FIXER PR10072026): a idempotencyKey é digitável por
    // humano — a mesma key reusada em OUTRA empresa não pode colidir no ledger global e
    // virar falso-sucesso silencioso (empresa B "debitada" com as linhas da A).
    const result = await this.wallet.debit(companyId, amount, {
      actionKey: 'master_manual_debit',
      usageKey: `master-debit:${companyId}:${idempotencyKey}`,
      userId: masterUserId,
      metadata: { reason, source: 'master_manual_debit' },
    });
    const clamped = Math.max(0, result.requested - result.debited);

    // Trilha de auditoria do dono; dedup pela intenção (retry idempotente não duplica evento).
    await emitMasterEvent(this.prisma, {
      type: 'credit.master_manual_debit',
      severity: 'info',
      companyId,
      dedupKey: `master-debit:${companyId}:${idempotencyKey}`,
      payload: {
        state: `debited:${idempotencyKey}`,
        requested: amount,
        debited: result.debited,
        clamped,
        reason,
        masterUserId,
      },
    });

    return {
      ok: true,
      requested: amount,
      debited: result.debited,
      clamped,
      balanceAfter: result.balanceAfter,
    };
  }
}
