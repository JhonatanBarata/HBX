import { Module } from '@nestjs/common';
import { GerencialController } from './gerencial.controller';
import { GerencialService } from './gerencial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { SellerOnboardingService } from './seller-onboarding.service';
import { MailModule } from '../mail/mail.module';
import { HbxPartnerReferralService } from './hbx-partner-referral.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule, CommissionsModule, MailModule],
  controllers: [GerencialController],
  providers: [GerencialService, SellerOnboardingService, HbxPartnerReferralService],
  exports: [SellerOnboardingService, HbxPartnerReferralService],
})
export class GerencialModule {}
