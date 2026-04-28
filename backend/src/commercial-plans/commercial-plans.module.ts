import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommercialEntitlementGuard } from './commercial-entitlement.guard';
import { CommercialPlansController } from './commercial-plans.controller';
import { CommercialPlansService } from './commercial-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [CommercialPlansController],
  providers: [CommercialPlansService, CommercialEntitlementGuard],
  exports: [CommercialPlansService, CommercialEntitlementGuard],
})
export class CommercialPlansModule {}
