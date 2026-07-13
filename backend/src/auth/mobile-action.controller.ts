import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreateMobileActionDto,
  MobileActionEventDto,
  PullMobileActionsDto,
} from './dto/mobile-action.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MobileActionService } from './mobile-action.service';

@Controller('mobile/actions')
export class MobileActionController {
  constructor(private readonly mobileActions: MobileActionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60 } })
  create(@Req() req: any, @Body() dto: CreateMobileActionDto) {
    return this.mobileActions.create(req?.user?.id, dto);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  history(
    @Req() req: any,
    @Query('leadId') leadId?: string,
    @Query('take') takeInput?: string,
  ) {
    const parsedTake = Number(takeInput || 20);
    return this.mobileActions.history(req?.user?.id, {
      leadId,
      take: Number.isFinite(parsedTake) ? parsedTake : 20,
    });
  }

  @Post('pull')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  pull(@Body() dto: PullMobileActionsDto) {
    return this.mobileActions.pull(dto);
  }

  @Post(':actionId/event')
  @Throttle({ default: { limit: 60, ttl: 60 } })
  recordEvent(@Param('actionId') actionId: string, @Body() dto: MobileActionEventDto) {
    return this.mobileActions.recordEvent(actionId, dto);
  }
}
