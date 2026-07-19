import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { TUTORIAL_MAX_BYTES, TutorialMediaService, type TutorialMode } from './tutorial-media.service';

// TUTORIAL FRONT — GET público (a página /tutorialexterno lê o manifesto sem
// login) + escrita master-only (upload/modo/remover). O vídeo em si é servido
// estático em /uploads/tutorial/* (ServeStatic), este controller só cuida do
// manifesto e do arquivo.
@Controller('tutorial-media')
export class TutorialMediaController {
  constructor(private readonly service: TutorialMediaService) {}

  @Get()
  @SkipThrottle()
  manifest() {
    return this.service.readManifest();
  }

  @Post(':stepId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TUTORIAL_MAX_BYTES },
    }),
  )
  upload(@Param('stepId') stepId: string, @UploadedFile() file?: any) {
    return this.service.saveVideo(stepId, file);
  }

  @Patch(':stepId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  setMode(@Param('stepId') stepId: string, @Body() body: { mode?: TutorialMode }) {
    return this.service.setMode(stepId, body?.mode as TutorialMode);
  }

  @Delete(':stepId')
  @UseGuards(JwtAuthGuard, MasterGuard)
  remove(@Param('stepId') stepId: string) {
    return this.service.remove(stepId);
  }
}
