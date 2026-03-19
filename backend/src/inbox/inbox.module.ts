import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HbxRecoveryModule } from '../hbx-recovery/hbx-recovery.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule, MessagingModule, HbxRecoveryModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
