import { Module, forwardRef } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommercialEntitlementGuard } from './commercial-entitlement.guard';
import { CommercialPlansController, CommercialPlansPublicController } from './commercial-plans.controller';
import { CommercialPlansService } from './commercial-plans.service';
import { CommercialUsageLimitsService } from './commercial-usage-limits.service';

@Module({
  imports: [PrismaModule, MasterContextModule, forwardRef(() => CompaniesModule)],
  controllers: [CommercialPlansController, CommercialPlansPublicController],
  providers: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
  exports: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
})
export class CommercialPlansModule {}
