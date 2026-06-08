import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterProvisioningController } from './master-provisioning.controller';
import { MasterProvisioningService } from './master-provisioning.service';

@Module({
  imports: [PrismaModule],
  controllers: [MasterProvisioningController],
  providers: [MasterProvisioningService, MasterGuard],
  exports: [MasterProvisioningService],
})
export class MasterProvisioningModule {}
