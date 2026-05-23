import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroWebhookController } from './financeiro.webhook.controller';
import { PaymentsModule } from '../payments/payments.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MailModule } from '../mail/mail.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [PaymentsModule, ModulesAccessModule, MailModule, CommissionsModule],
  controllers: [FinanceiroController, FinanceiroWebhookController],
  providers: [FinanceiroService],
})
export class FinanceiroModule {}
