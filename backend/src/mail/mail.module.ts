import { Module, forwardRef } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { ModulesAccessModule } from '../modules/modules.module';
import { IntegrationSecretsService } from '../integrations/integration-secrets.service';
import { CompanyEmailSettingsService } from './company-email-settings.service';
import { CompanyEmailTemplateService } from './company-email-template.service';
import { CompanyEmailController } from './company-email.controller';
import { CompanyEmailStatusController } from './company-email-status.controller';
import { CompanyMailerService } from './company-mailer.service';
import { CompanyPresentationEmailService } from './company-presentation-email.service';
import { EmailTemplateService } from './email-template.service';
import { HbxPresentationEmailService } from './hbx-presentation-email.service';
import { MasterEmailSettingsService } from './master-email-settings.service';
import { MasterEmailController } from './master-email.controller';
import { MailService } from './mail.service';

@Module({
  imports: [forwardRef(() => ModulesAccessModule)],
  controllers: [MasterEmailController, CompanyEmailController, CompanyEmailStatusController],
  providers: [
    MailService,
    EmailTemplateService,
    HbxPresentationEmailService,
    MasterEmailSettingsService,
    IntegrationSecretsService,
    CompanyEmailSettingsService,
    CompanyEmailTemplateService,
    CompanyMailerService,
    CompanyPresentationEmailService,
    MasterGuard,
  ],
  exports: [
    MailService,
    EmailTemplateService,
    HbxPresentationEmailService,
    MasterEmailSettingsService,
    CompanyEmailSettingsService,
    CompanyEmailTemplateService,
    CompanyMailerService,
    CompanyPresentationEmailService,
  ],
})
export class MailModule {}
