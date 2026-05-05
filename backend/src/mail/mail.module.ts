import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { MasterEmailController } from './master-email.controller';
import { MailService } from './mail.service';

@Module({
  controllers: [MasterEmailController],
  providers: [MailService, MasterGuard],
  exports: [MailService],
})
export class MailModule {}
