import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { NightFactoryService } from './night-factory.service';

@Controller('modules/owner/night-factory')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('webscraping')
export class NightFactoryController {
  constructor(private readonly nightFactoryService: NightFactoryService) {}

  // GETs são leituras do módulo; o kill-switch e o RBAC governam o acesso.
  @Get('status')
  getStatus() {
    return this.nightFactoryService.getStatus();
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
