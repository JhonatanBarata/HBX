import { Module } from '@nestjs/common';
import { GerencialController } from './gerencial.controller';
import { GerencialService } from './gerencial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { SellerOnboardingService } from './seller-onboarding.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule, CommissionsModule, MailModule],
  controllers: [GerencialController],
  providers: [GerencialService, SellerOnboardingService],
  exports: [SellerOnboardingService],
})
export class GerencialModule {}
