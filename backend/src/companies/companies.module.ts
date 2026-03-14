import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PrismaModule, UsersModule, PlansModule, PaymentsModule],
  providers: [CompaniesService, WhatsAppStatusService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
