import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightOrderService } from './night-order.service';

@Controller('night-factory/orders')
@UseGuards(JwtAuthGuard)
export class NightOrderController {
  constructor(private readonly nightOrderService: NightOrderService) {}

  @Get()
  list(@Req() req: any) {
    return this.nightOrderService.list(req.user);
  }

  @Get(':id')
  progress(@Req() req: any, @Param('id') id: string) {
    return this.nightOrderService.getProgress(req.user, id);
  }

}
