import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [PrismaModule],
  controllers: [SystemHealthController],
  providers: [SystemHealthService, MasterGuard],
})
export class AdminModule {}
