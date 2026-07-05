import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroWebhookController } from './financeiro.webhook.controller';
import { CreditRechargeController } from './credit-recharge.controller';
import { CreditRechargeService } from './credit-recharge.service';
import { PaymentsModule } from '../payments/payments.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MailModule } from '../mail/mail.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { CreditsModule } from '../credits/credits.module';

// CRÉDITOS S3-PARTE2: a recarga mora AQUI (financeiro importa CreditsModule) para
// preservar a invariante do S2 — CreditsModule depende SÓ do Prisma (direção única,
// CommercialPlans→Credits sem ciclo). Cobrança de cartão tem uma casa: o financeiro.
@Module({
  imports: [PaymentsModule, ModulesAccessModule, MailModule, CommissionsModule, CreditsModule],
  controllers: [FinanceiroController, FinanceiroWebhookController, CreditRechargeController],
  providers: [FinanceiroService, CreditRechargeService],
})
export class FinanceiroModule {}
