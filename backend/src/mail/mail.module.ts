import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { EmailTemplateService } from './email-template.service';
import { HbxPresentationEmailService } from './hbx-presentation-email.service';
import { MasterEmailController } from './master-email.controller';
import { MailService } from './mail.service';

@Module({
  controllers: [MasterEmailController],
  providers: [MailService, EmailTemplateService, HbxPresentationEmailService, MasterGuard],
  exports: [MailService, EmailTemplateService, HbxPresentationEmailService],
})
export class MailModule {}
