import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RadarLeadProcessStoreService } from './radar-lead-process-store.service';

@Module({
  imports: [PrismaModule],
  providers: [RadarLeadProcessStoreService],
  exports: [RadarLeadProcessStoreService],
})
export class RadarLeadProcessStoreModule {}
