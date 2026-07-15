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
  CreateMobilePairingCodeDto,
  ConsumeMobileWebTicketDto,
  GooglePairMobileDeviceDto,
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
  createPairingCode(@Req() req: any, @Body() dto: CreateMobilePairingCodeDto) {
    return this.mobileDevices.createPairingCode(req?.user?.id, dto);
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

  @Post('google-pair')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  pairDeviceWithGoogle(@Body() dto: GooglePairMobileDeviceDto, @Req() req: any) {
    return this.mobileDevices.pairDeviceWithGoogle(dto, {
      userAgent: req?.headers?.['user-agent'],
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
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
