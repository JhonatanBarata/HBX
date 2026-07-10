import { Module } from '@nestjs/common';
import { InboxMediaMigrationService } from './inbox-media-migration.service';
import { UploadsController } from './uploads.controller';

// P1.3: rota assinada da mídia do inbox + migração de boot do public → storage privado.
@Module({
  controllers: [UploadsController],
  providers: [InboxMediaMigrationService],
})
export class UploadsModule {}
