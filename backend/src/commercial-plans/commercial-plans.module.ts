import { Module, forwardRef } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { MasterAlertModule } from '../master-alert/master-alert.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditsModule } from '../credits/credits.module';
import { CommercialEntitlementGuard } from './commercial-entitlement.guard';
import { CommercialPlansController, CommercialPlansPublicController } from './commercial-plans.controller';
import { CommercialPlansService } from './commercial-plans.service';
import { CommercialUsageLimitsService } from './commercial-usage-limits.service';

// CRÉDITOS S2 — CreditsModule importado (direção única, sem ciclo: CreditsModule só depende de
// PrismaModule) para o CommercialUsageLimitsService emitir o shadow-debit no ponto único da baixa.
@Module({
  imports: [PrismaModule, MasterContextModule, MasterAlertModule, MailModule, CreditsModule, forwardRef(() => CompaniesModule)],
  controllers: [CommercialPlansController, CommercialPlansPublicController],
  providers: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
  exports: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
})
export class CommercialPlansModule {}
