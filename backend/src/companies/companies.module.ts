import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { MasterContextModule } from '../master-context/master-context.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { PaymentsModule } from '../payments/payments.module';
import { WhatsAppTemporaryConnectionService } from './whatsapp-temporary-connection.service';
import { CompanyOperationalStatusService } from './company-operational-status.service';
import { WhatsAppModalService } from './whatsapp-modal.service';

@Module({
  imports: [PrismaModule, UsersModule, PlansModule, PaymentsModule, MasterContextModule],
  providers: [CompaniesService, WhatsAppStatusService, WhatsAppTemporaryConnectionService, CompanyOperationalStatusService, WhatsAppModalService],
  controllers: [CompaniesController],
  exports: [CompaniesService, CompanyOperationalStatusService],
})
export class CompaniesModule {}
