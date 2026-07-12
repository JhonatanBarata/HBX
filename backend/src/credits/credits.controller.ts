import { Controller, ForbiddenException, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isAdminTierActor } from '../access/actor-kind';
import { CreditsService } from './credits.service';
import { IndicacaoService } from './indicacao.service';
import { isCreditsFeatureEnabled } from './credits.flags';
import { isIndicacaoFeatureEnabled } from './indicacao.flags';

// CRÉDITOS S3-PARTE1 — leitura do próprio saldo/carteira. Role-gated na PRÓPRIA rota (LEI DO
// VENDEDOR): master/DONO (ADMIN/USERMASTER que vê cobrança) veem saldo+lotes+pacotes; VENDEDOR
// (USER) E GERENTE (ADMIN sem cobrança) veem só um número neutro "leads disponíveis", nunca
// R$/preço/pacote. `req.user` vem do findById (JWT strategy) e carrega `canViewBilling` cru do
// banco — o service usa isBillingOwnerActor pra separar dono×gerente. Atrás de
// HBX_CREDITS_ENABLED — flag OFF ⇒ 404 (nada ativo, espelha o padrão de módulo inerte do S1).
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly indicacao: IndicacaoService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    if (!isCreditsFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
    return this.creditsService.getMeForUser(req.user);
  }

  // S5 INDICAÇÃO — painel "Indique e ganhe" do admin do tenant: código + link + contagem
  // de indicadas convertidas. Flag própria (HBX_INDICACAO_ENABLED, default OFF) ⇒ 404
  // neutro — o front usa o 404 pra NÃO renderizar o card (feature dormente, zero UI).
  // Vendedor recebe Forbidden neutro (mesmo espírito da LEI DO VENDEDOR).
  @Get('indicacao/me')
  @UseGuards(JwtAuthGuard)
  async indicacaoMe(@Req() req: any) {
    if (!isIndicacaoFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
    if (!isAdminTierActor(req.user)) {
      throw new ForbiddenException('Acesso restrito ao administrador da conta.');
    }
    const companyId = Math.trunc(Number(req.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Nenhuma empresa em contexto');
    return this.indicacao.getMeForCompany(companyId);
  }
}
