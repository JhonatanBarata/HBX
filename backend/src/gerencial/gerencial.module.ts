import { Module } from '@nestjs/common';
import { GerencialController } from './gerencial.controller';
import { GerencialService } from './gerencial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule, CommissionsModule],
  controllers: [GerencialController],
  providers: [GerencialService],
})
export class GerencialModule {}
