import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  PrepareLogisticaOfflineRouteDto,
  SyncLogisticaOfflineRouteDto,
  UploadLogisticaOfflineProofDto,
} from './dto/logistica-offline.dto';
import { LogisticaOfflineService } from './logistica-offline.service';

/** Transporte APK -> VPS para a cápsula de uma rota já iniciada. */
@Controller('mobile/logistica/offline')
export class LogisticaOfflineController {
  constructor(private readonly offline: LogisticaOfflineService) {}

  @Post('prepare')
  @Throttle({ default: { limit: 15, ttl: 60 } })
  prepare(@Body() dto: PrepareLogisticaOfflineRouteDto) {
    return this.offline.prepare(dto);
  }

  @Post('sync')
  @Throttle({ default: { limit: 60, ttl: 60 } })
  sync(@Body() dto: SyncLogisticaOfflineRouteDto) {
    return this.offline.sync(dto);
  }

  @Post('proofs')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadProof(
    @Body() dto: UploadLogisticaOfflineProofDto,
    @UploadedFile() file: any,
  ) {
    return this.offline.uploadProof(dto, file);
  }
}
