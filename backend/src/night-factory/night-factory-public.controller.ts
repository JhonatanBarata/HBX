import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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

  @Post('redeem')
  redeem(@Req() req: any) {
    return this.nightFactoryService.redeemReward(req.user);
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

  // Caça de e-mail: leads do pool com e-mail, filtrados por segmento/cidade.
  @Get('email-leads')
  getEmailLeads(
    @Query('segment') segment?: string,
    @Query('city') city?: string,
    @Query('take') take?: string,
  ) {
    return this.nightFactoryService.getEmailLeads({ segment, city, take: Number(take) || 50 });
  }
}
