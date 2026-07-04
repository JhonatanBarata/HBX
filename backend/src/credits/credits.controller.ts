import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditsService } from './credits.service';
import { isCreditsFeatureEnabled } from './credits.flags';

// CRÉDITOS S3-PARTE1 — leitura do próprio saldo/carteira. Role-gated na PRÓPRIA rota (LEI DO
// VENDEDOR): master/DONO (ADMIN/USERMASTER que vê cobrança) veem saldo+lotes+pacotes; VENDEDOR
// (USER) E GERENTE (ADMIN sem cobrança) veem só um número neutro "leads disponíveis", nunca
// R$/preço/pacote. `req.user` vem do findById (JWT strategy) e carrega `canViewBilling` cru do
// banco — o service usa isBillingOwnerActor pra separar dono×gerente. Atrás de
// HBX_CREDITS_ENABLED — flag OFF ⇒ 404 (nada ativo, espelha o padrão de módulo inerte do S1).
@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    if (!isCreditsFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
    return this.creditsService.getMeForUser(req.user);
  }
}
