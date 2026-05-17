import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ActiveSessionsController } from './active-sessions.controller';
import { ActiveSessionsService } from './active-sessions.service';

@Module({
  imports: [PrismaModule],
  controllers: [ActiveSessionsController],
  providers: [ActiveSessionsService, MasterGuard],
})
export class AdminModule {}
