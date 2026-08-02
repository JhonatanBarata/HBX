import { Module, forwardRef } from '@nestjs/common';
import { MasterContextModule } from '../master-context/master-context.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { MailModule } from '../mail/mail.module';
import { UsersService } from './users.service';
import { CompanyInviteService } from './company-invite.service';
import { GerencialModule } from '../gerencial/gerencial.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';

@Module({
  imports: [PrismaModule, MasterContextModule, forwardRef(() => ModulesAccessModule), MailModule, GerencialModule],
  providers: [UsersService, CompanyInviteService, WebwhatsBridgeService],
  controllers: [UsersController],
  exports: [UsersService, CompanyInviteService],
})
export class UsersModule {}
