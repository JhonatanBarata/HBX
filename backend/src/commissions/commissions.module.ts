import { Module } from '@nestjs/common';
import { HbxCommissionSyncService } from './hbx-commission-sync.service';

@Module({
  providers: [HbxCommissionSyncService],
  exports: [HbxCommissionSyncService],
})
export class CommissionsModule {}
