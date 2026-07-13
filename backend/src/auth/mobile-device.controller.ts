import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ConsumeMobileWebTicketDto,
  OpenMobileDeviceSessionDto,
  PairMobileDeviceDto,
} from './dto/mobile-device.dto';
import { MobileDeviceService } from './mobile-device.service';

@Controller('mobile/devices')
export class MobileDeviceController {
  constructor(private readonly mobileDevices: MobileDeviceService) {}

  @Post('pairing-code')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  createPairingCode(@Req() req: any) {
    return this.mobileDevices.createPairingCode(req?.user?.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listDevices(@Req() req: any) {
    return this.mobileDevices.listDevices(req?.user?.id);
  }

  @Delete(':deviceId')
  @UseGuards(JwtAuthGuard)
  revokeDevice(@Req() req: any, @Param('deviceId') deviceId: string) {
    return this.mobileDevices.revokeDevice(req?.user?.id, deviceId);
  }

  @Post('pair')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  pairDevice(@Body() dto: PairMobileDeviceDto) {
    return this.mobileDevices.pairDevice(dto);
  }

  @Post('session')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  openDeviceSession(@Body() dto: OpenMobileDeviceSessionDto) {
    return this.mobileDevices.openDeviceSession(dto);
  }

  @Post('web-session')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  consumeWebTicket(@Body() dto: ConsumeMobileWebTicketDto) {
    return this.mobileDevices.consumeWebTicket(dto);
  }
}
