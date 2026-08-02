import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ConsumeMobileWebTicketDto,
  CreateMobilePairingCodeDto,
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
  // Teto por MINUTO: um admin preparando a equipe gera vários seguidos.
  @Throttle({ default: { limit: 15, ttl: 60 } })
  createPairingCode(@Req() req: any, @Body() dto?: CreateMobilePairingCodeDto) {
    return this.mobileDevices.createPairingCode(req?.user?.id, dto?.targetUserId);
  }

  // Para QUEM este usuário pode gerar código (com o nível de cada um).
  @Get('pairing-targets')
  @UseGuards(JwtAuthGuard)
  listPairingTargets(@Req() req: any) {
    return this.mobileDevices.listPairingTargets(req?.user?.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listDevices(@Req() req: any, @Query('scope') scope?: string) {
    return this.mobileDevices.listDevices(req?.user?.id, scope);
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
  @Throttle({ default: { limit: 10, ttl: 60 } })
  googlePairDevice(@Body() dto: GooglePairMobileDeviceDto) {
    return this.mobileDevices.googlePairDevice(dto);
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
