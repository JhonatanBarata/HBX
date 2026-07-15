import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NightFactoryService } from './night-factory.service';

@Controller('night-factory')
@UseGuards(JwtAuthGuard)
export class NightFactoryPublicController {
  constructor(private readonly nightFactoryService: NightFactoryService) {}

  @Get('claim-status')
  getClaimStatus(@Req() req: any) {
    return this.nightFactoryService.getClaimStatus(req.user);
  }

  @Get('my-reward')
  getMyReward(@Req() req: any) {
    return this.nightFactoryService.getMyReward(req.user);
  }

  // Número global do Banco de Leads (visível a qualquer usuário autenticado).
  @Get('leads-bank')
  getLeadsBank() {
    return this.nightFactoryService.getLeadsBank();
  }

}
