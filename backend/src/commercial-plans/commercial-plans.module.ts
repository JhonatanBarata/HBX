import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommercialEntitlementGuard } from './commercial-entitlement.guard';
import { CommercialPlansController } from './commercial-plans.controller';
import { CommercialPlansService } from './commercial-plans.service';
import { CommercialUsageLimitsService } from './commercial-usage-limits.service';

@Module({
  imports: [PrismaModule],
  controllers: [CommercialPlansController],
  providers: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
  exports: [CommercialPlansService, CommercialUsageLimitsService, CommercialEntitlementGuard],
})
export class CommercialPlansModule {}
