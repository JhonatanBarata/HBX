import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantCommunicationController } from './tenant-communication.controller';
import { TenantCommunicationService } from './tenant-communication.service';

@Module({
  imports: [PrismaModule],
  controllers: [TenantCommunicationController],
  providers: [TenantCommunicationService],
  exports: [TenantCommunicationService],
})
export class TenantCommunicationModule {}
