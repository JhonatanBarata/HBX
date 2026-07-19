import { Module } from '@nestjs/common';
import { MasterGuard } from '../auth/guards/master.guard';
import { TutorialMediaController } from './tutorial-media.controller';
import { TutorialMediaService } from './tutorial-media.service';

// Mídia do tutorial público. Não depende de Prisma nem de outro módulo —
// só filesystem (public/uploads/tutorial). O MasterGuard é provido local.
@Module({
  controllers: [TutorialMediaController],
  providers: [TutorialMediaService, MasterGuard],
})
export class TutorialMediaModule {}
