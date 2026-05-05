import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplateService } from './email-template.service';
import { MasterEmailController } from './master-email.controller';
import { MailService } from './mail.service';

@Module({
  controllers: [MasterEmailController],
  providers: [MailService, EmailTemplateService, MasterGuard],
  exports: [MailService, EmailTemplateService],
})
export class MailModule {}
