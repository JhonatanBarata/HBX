import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterProvisioningService } from './master-provisioning.service';

@Module({
  imports: [PrismaModule],
  providers: [MasterProvisioningService],
  exports: [MasterProvisioningService],
})
export class MasterProvisioningModule {}
