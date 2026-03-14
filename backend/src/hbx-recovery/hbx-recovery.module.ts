import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { HbxRecoveryController } from './hbx-recovery.controller';
import { HbxRecoveryService } from './hbx-recovery.service';
import { HbxRecoveryWebhookController } from './hbx-recovery.webhook.controller';

@Module({
  imports: [PrismaModule, ModulesAccessModule, MessagingModule, PaymentsModule],
  controllers: [HbxRecoveryController, HbxRecoveryWebhookController],
  providers: [HbxRecoveryService],
})
export class HbxRecoveryModule {}
