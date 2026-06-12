import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommercialPlansService } from './commercial-plans.service';
import { SelectCommercialPlanDto } from './dto/select-commercial-plan.dto';
import { buildCommercialPlansCatalog } from './commercial-plan-catalog';

// Vitrine PÚBLICA do catálogo (fila PLAN12062026001 E1, ordem do dono):
// alimenta /planos e a landing para visitante de campanha, SEM auth.
// Só dados de marketing do catálogo — nenhum dado de tenant/usuário.
@Controller('commercial-plans')
export class CommercialPlansPublicController {
  @Get('public-catalog')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  getPublicCatalog() {
    const plans = buildCommercialPlansCatalog()
      .filter((plan) => !plan.hidden)
      .map((plan) => ({
        key: plan.key,
        title: plan.title,
        monthlyPrice: plan.monthlyPrice,
        trialDays: plan.trialDays,
        includedUsers: plan.includedUsers,
        headline: plan.headline,
        description: plan.description,
        badge: plan.badge,
        recommended: plan.recommended,
        features: plan.features,
      }));
    return { plans };
  }
}

@Controller('commercial-plans')
@UseGuards(JwtAuthGuard)
export class CommercialPlansController {
  constructor(private readonly commercialPlansService: CommercialPlansService) {}

  @Get('catalog')
  getCatalog(@Req() req: any) {
    return this.commercialPlansService.getCatalogForUser(req.user);
  }

  @Get('me')
  getMe(@Req() req: any) {
    return this.commercialPlansService.getCatalogForUser(req.user);
  }

  @Post('select')
  selectPlan(@Req() req: any, @Body() dto: SelectCommercialPlanDto) {
    return this.commercialPlansService.selectPlanForUser(req.user, dto);
  }
}
