import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { OwnerModule } from '../owner/owner.module';

@Module({
  imports: [PrismaModule, MailModule, MessagingModule, OwnerModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
