import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightOrderService } from './night-order.service';

@Controller('night-factory/orders')
@UseGuards(JwtAuthGuard)
export class NightOrderController {
  constructor(private readonly nightOrderService: NightOrderService) {}

  @Post()
  create(@Req() req: any, @Body() body: Record<string, any>) {
    return this.nightOrderService.create(req.user, body || {});
  }

  @Get()
  list(@Req() req: any) {
    return this.nightOrderService.list(req.user);
  }

  @Post('run-now')
  runNow(@Req() req: any) {
    return this.nightOrderService.fulfillForUser(req.user);
  }

  @Get(':id')
  progress(@Req() req: any, @Param('id') id: string) {
    return this.nightOrderService.getProgress(req.user, id);
  }

  @Post(':id/pause')
  pause(@Req() req: any, @Param('id') id: string) {
    return this.nightOrderService.setStatus(req.user, id, 'paused');
  }

  @Post(':id/resume')
  resume(@Req() req: any, @Param('id') id: string) {
    return this.nightOrderService.setStatus(req.user, id, 'open');
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.nightOrderService.setStatus(req.user, id, 'canceled');
  }
}
