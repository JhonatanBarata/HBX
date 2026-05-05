import { forwardRef, Module } from '@nestjs/common';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { InboxModule } from '../inbox/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { VendasController } from './vendas.controller';
import { VendasAutomationService } from './vendas-automation.service';
import { VendasService } from './vendas.service';

@Module({
  imports: [PrismaModule, CustomerProfileModule, ModulesAccessModule, MessagingModule, InboxModule, CommercialPlansModule, forwardRef(() => WebscrapingModule)],
  controllers: [VendasController],
  providers: [VendasService, VendasAutomationService],
  exports: [VendasService, VendasAutomationService],
})
export class VendasModule {}
