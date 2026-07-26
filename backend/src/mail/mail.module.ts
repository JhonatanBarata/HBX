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
import { GmailOAuthService } from './gmail-oauth.service';
import { GmailOAuthController } from './gmail-oauth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditsModule } from '../credits/credits.module';
import { EmailOutboxService } from './email-outbox.service';
import { EmailOutboxWorkerService } from './email-outbox-worker.service';
import { SenderIdentityService } from './sender-identity.service';

@Module({
  imports: [PrismaModule, CreditsModule, forwardRef(() => ModulesAccessModule)],
  controllers: [MasterEmailController, CompanyEmailController, CompanyEmailStatusController, GmailOAuthController],
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
    GmailOAuthService,
    EmailOutboxService,
    EmailOutboxWorkerService,
    SenderIdentityService,
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
    GmailOAuthService,
    EmailOutboxService,
    SenderIdentityService,
  ],
})
export class MailModule {}
