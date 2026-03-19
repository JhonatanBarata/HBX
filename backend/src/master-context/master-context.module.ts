import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterContextController } from './master-context.controller';
import { MasterContextService } from './master-context.service';

@Module({
  imports: [PrismaModule],
  controllers: [MasterContextController],
  providers: [MasterContextService],
  exports: [MasterContextService],
})
export class MasterContextModule {}
