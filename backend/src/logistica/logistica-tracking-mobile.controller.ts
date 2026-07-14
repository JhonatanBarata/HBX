import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  BatchLogisticaTrackingPointsDto,
  CurrentLogisticaTrackingSessionDto,
  LogisticaTrackingSessionEventDto,
  StartLogisticaTrackingSessionDto,
} from './dto/logistica-tracking.dto';
import { LogisticaTrackingService } from './logistica-tracking.service';

/**
 * Transporte nativo APK -> VPS. A autenticação é a credencial opaca revogável
 * do MobileDevice no body, igual à fila móvel existente; não há Firebase/GMS.
 */
@Controller('mobile/logistica/tracking')
export class LogisticaTrackingMobileController {
  constructor(private readonly tracking: LogisticaTrackingService) {}

  @Post('sessions/start')
  @Throttle({ default: { limit: 15, ttl: 60 } })
  start(@Body() dto: StartLogisticaTrackingSessionDto) {
    return this.tracking.startSession(dto);
  }

  @Post('sessions/current')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  current(@Body() dto: CurrentLogisticaTrackingSessionDto) {
    return this.tracking.currentSession(dto);
  }

  @Post('sessions/:sessionId/positions')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  positions(
    @Param('sessionId') sessionId: string,
    @Body() dto: BatchLogisticaTrackingPointsDto,
  ) {
    return this.tracking.ingestPositions(sessionId, dto);
  }

  @Post('sessions/:sessionId/events')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  event(
    @Param('sessionId') sessionId: string,
    @Body() dto: LogisticaTrackingSessionEventDto,
  ) {
    return this.tracking.recordEvent(sessionId, dto);
  }
}
