import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { HbxPulseService } from './hbx-pulse.service';

@Controller('pulse')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('vendas')
export class HbxPulseController {
  constructor(private readonly hbxPulseService: HbxPulseService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.hbxPulseService.getSummaryForUser(req.user);
  }
}
