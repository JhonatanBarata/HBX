import { Module, forwardRef } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule, MessagingModule, HbxRecoveryModule, CadastrosModule, CustomerProfileModule, CommercialPlansModule, forwardRef(() => CompaniesModule)],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
