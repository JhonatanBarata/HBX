import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { NightFactoryService } from './night-factory.service';

@Controller('modules/master/night-factory')
@UseGuards(JwtAuthGuard, MasterGuard)
export class NightFactoryController {
  constructor(private readonly nightFactoryService: NightFactoryService) {}

  @Get('status')
  getStatus() {
    return this.nightFactoryService.getStatus();
  }

  @Post('run-now')
  runNow(@Req() req: any) {
    return this.nightFactoryService.runNow(req.user);
  }

  @Post('pause')
  pause(@Req() req: any) {
    return this.nightFactoryService.pause(req.user);
  }

  @Post('resume')
  resume(@Req() req: any) {
    return this.nightFactoryService.resume(req.user);
  }

  @Post('config')
  saveConfig(@Req() req: any, @Body() body: any) {
    return this.nightFactoryService.saveConfig(req.user, body || {});
  }

  @Get('top-opportunities')
  getTopOpportunities() {
    return this.nightFactoryService.getTopOpportunities({ take: 40 });
  }

  @Get('daily-report')
  getDailyReport() {
    return this.nightFactoryService.getDailyReport();
  }

  @Get('segments')
  getSegments() {
    return this.nightFactoryService.getSegments({ take: 40 });
  }

  @Get('cities')
  getCities() {
    return this.nightFactoryService.getCities({ take: 60 });
  }

  @Get('recovery-opportunities')
  getRecoveryOpportunities() {
    return this.nightFactoryService.getRecoveryOpportunities({ take: 40 });
  }
}
