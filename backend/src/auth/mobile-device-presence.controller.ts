import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OpenMobileDeviceSessionDto } from './dto/mobile-device.dto';
import { MobileDevicePresenceService } from './mobile-device-presence.service';

@Controller('mobile/devices')
export class MobileDevicePresenceController {
  constructor(private readonly mobilePresence: MobileDevicePresenceService) {}

  @Post('heartbeat')
  @Throttle({ default: { limit: 12, ttl: 60 } })
  heartbeat(@Body() dto: OpenMobileDeviceSessionDto) {
    return this.mobilePresence.heartbeat(dto);
  }
}
