import { Module } from '@nestjs/common';
import { GerencialController } from './gerencial.controller';
import { GerencialService } from './gerencial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [GerencialController],
  providers: [GerencialService],
})
export class GerencialModule {}
