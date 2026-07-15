import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { CommercialEntitlement } from '../commercial-plans/commercial-entitlement.decorator';
import { CommercialEntitlementGuard } from '../commercial-plans/commercial-entitlement.guard';
import { COMMERCIAL_ENTITLEMENT_KEYS } from '../commercial-plans/commercial-plan-catalog';
import { NightFactoryService } from './night-factory.service';

@Controller('modules/owner/night-factory')
@UseGuards(JwtAuthGuard, CommercialEntitlementGuard)
@CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY)
export class NightFactoryController {
  constructor(private readonly nightFactoryService: NightFactoryService) {}

  // GETs = produto do tenant (entitlement do modulo). Ja escopados/leitura.
  @Get('status')
  getStatus() {
    return this.nightFactoryService.getStatus();
  }

  // MUTACOES do motor GLOBAL (pausa/reconfigura/forca rodar a fabrica da plataforma
  // inteira) = SO o system-master. O EntitlementGuard sozinho deixava qualquer user
  // de tenant pagante (ate vendedor) controlar o recurso do dono. MasterGuard trava:
  // tenant (mesmo entitled) toma 403; o master passa (bypassa entitlement + e master).
  @Post('run-now')
  @UseGuards(MasterGuard)
  runNow(@Req() req: any) {
    return this.nightFactoryService.runNow(req.user);
  }

  @Post('pause')
  @UseGuards(MasterGuard)
  pause(@Req() req: any) {
    return this.nightFactoryService.pause(req.user);
  }

  @Post('resume')
  @UseGuards(MasterGuard)
  resume(@Req() req: any) {
    return this.nightFactoryService.resume(req.user);
  }

  @Post('config')
  @UseGuards(MasterGuard)
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
