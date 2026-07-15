import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommercialEntitlement } from '../commercial-plans/commercial-entitlement.decorator';
import { CommercialEntitlementGuard } from '../commercial-plans/commercial-entitlement.guard';
import { COMMERCIAL_ENTITLEMENT_KEYS } from '../commercial-plans/commercial-plan-catalog';
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

  // Caça de e-mail: leads do pool com e-mail, filtrados por segmento/cidade.
  // Entrega e-mail (PII) do pool GLOBAL — GATEADO pelo modulo pago Night Factory,
  // igual as rotas-irmas em modules/owner/night-factory. Sem isso, qualquer conta
  // logada (ate cortesia de 50 creditos) sugava a base de e-mails inteira, de graca.
  // O master bypassa o entitlement (assertEntitlementForUser); entitled ve; free NAO.
  // TODO(dono): endurecer p/ debito-por-lead ou escopo de posse (decisao de produto).
  @Get('email-leads')
  @UseGuards(CommercialEntitlementGuard)
  @CommercialEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY)
  getEmailLeads(
    @Query('segment') segment?: string,
    @Query('city') city?: string,
    @Query('take') take?: string,
  ) {
    return this.nightFactoryService.getEmailLeads({ segment, city, take: Number(take) || 50 });
  }
}
