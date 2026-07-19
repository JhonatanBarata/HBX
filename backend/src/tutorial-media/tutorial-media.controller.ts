import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { TUTORIAL_MAX_BYTES, TutorialMediaService } from './tutorial-media.service';
import type { TutorialManifest } from './tutorial-media.types';

// TUTORIAL FRONT — GET público (a página /tutorialexterno lê sem login) e
// escrita master-only. Todas as escritas devolvem o manifesto inteiro, pra tela
// do master reconciliar num round-trip só.
@Controller('tutorial-media')
export class TutorialMediaController {
  constructor(private readonly service: TutorialMediaService) {}

  @Get()
  @SkipThrottle()
  manifest() {
    return this.service.readManifest();
  }

  // Estrutura completa: guias, telas, títulos, descrições, ordem e links.
  @Put()
  @UseGuards(JwtAuthGuard, MasterGuard)
  save(@Body() body: TutorialManifest) {
    return this.service.saveStructure(body);
  }

  @Post(':stepId/upload')
  @UseGuards(JwtAuthGuard, MasterGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TUTORIAL_MAX_BYTES },
    }),
  )
  upload(@Param('stepId') stepId: string, @UploadedFile() file?: any) {
    return this.service.saveUpload(stepId, file);
  }

}
