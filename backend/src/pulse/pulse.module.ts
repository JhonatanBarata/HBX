import { Module } from '@nestjs/common';
import { ModulesAccessModule } from '../modules/modules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HbxPulseController } from './hbx-pulse.controller';
import { HbxPulseService } from './hbx-pulse.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [HbxPulseController],
  providers: [HbxPulseService],
  exports: [HbxPulseService],
})
export class PulseModule {}
