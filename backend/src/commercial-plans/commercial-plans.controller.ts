import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommercialPlansService } from './commercial-plans.service';
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
      // Decisão do dono 07/07 (modelo de crédito): a vitrine pública oferta SÓ o Enterprise
      // (Implantação). List/Lead/Pro nascem 'paused' por default no catálogo — aqui saem da
      // resposta pública INTEIRA (não é mais só "card embaçado": não aparecem). O master reabre
      // qualquer um via override (status:'available'), que volta a passar neste filtro. O painel
      // do master usa outra rota (/modules/master/plan/:key/modules) — continua vendo tudo.
      .filter((plan) => !plan.hidden && (plan as { status?: string }).status !== 'paused')
      .map((plan) => ({
        key: plan.key,
        title: plan.title,
        // contactOnly: preço interno não é exibido; o número vive só no billing.
        monthlyPrice: plan.contactOnly ? null : plan.monthlyPrice,
        contactOnly: plan.contactOnly,
        trialDays: plan.trialDays,
        includedUsers: plan.includedUsers,
        annualDiscountPercent: plan.annualDiscountPercent,
        headline: plan.headline,
        // observation: texto editável no Self-Checkout (nasce da descrição do plano).
        description: (plan as { observation?: string }).observation ?? plan.description,
        badge: plan.badge,
        recommended: plan.recommended,
        // status: 'paused' → a vitrine embaça o card e bloqueia o clique (F2).
        paused: (plan as { status?: string }).status === 'paused',
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

  // Pedido de Implantação com mensagem livre (bloco PR16062026025).
  // Envia e-mail para jhonatan@hbxsystem.com.br + alerta in-app do master.
  @Post('implantacao/contact')
  requestImplantacaoContact(@Req() req: any, @Body() body: { message?: string }) {
    return this.commercialPlansService.requestImplantacaoContact(req.user, body);
  }
}
