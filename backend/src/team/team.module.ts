import { Module } from '@nestjs/common';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamController } from './team.controller';
import { TeamPolicyService } from './team-policy.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule, CommercialPlansModule],
  controllers: [TeamController],
  providers: [TeamPolicyService],
  exports: [TeamPolicyService],
})
export class TeamModule {}
