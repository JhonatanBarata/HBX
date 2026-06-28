import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterCockpitController } from './master-cockpit.controller';
import { MasterCockpitService } from './master-cockpit.service';

@Module({
  imports: [PrismaModule],
  controllers: [MasterCockpitController],
  providers: [MasterCockpitService, MasterGuard],
})
export class MasterCockpitModule {}
