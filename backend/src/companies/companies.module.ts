import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { MasterContextModule } from '../master-context/master-context.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { WhatsAppStatusService } from '../messaging/whatsapp-status.service';
import { PaymentsModule } from '../payments/payments.module';
import { CompanyOperationalStatusService } from './company-operational-status.service';
import { WhatsAppModalService } from './whatsapp-modal.service';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { CompanyWhatsAppCustomerSyncService } from './company-whatsapp-customer-sync.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PlansModule,
    PaymentsModule,
    MasterContextModule,
    CadastrosModule,
    MailModule,
    MessagingModule,
  ],
  providers: [
    CompaniesService,
    WhatsAppStatusService,
    CompanyOperationalStatusService,
    WhatsAppModalService,
    WebwhatsBridgeService,
    CompanyWhatsAppCustomerSyncService,
  ],
  controllers: [CompaniesController],
  exports: [CompaniesService, CompanyOperationalStatusService],
})
export class CompaniesModule {}
