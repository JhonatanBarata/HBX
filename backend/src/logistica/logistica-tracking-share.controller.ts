import { Controller, ForbiddenException, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaTrackingPublicService } from './logistica-tracking-public.service';

// F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — endpoints ADMIN
// (autenticado, company-scoped) que resolvem o link de "acompanhe sua
// entrega" — de UMA entrega, ou de TODAS as paradas de uma rota (o painel
// "onde está meu caminhão" usa o 2º pra listar link por cliente da rota
// selecionada). Mesmo padrão de guard do logistica-admin-route.controller.ts.
//
// Path `logistica/tracking` COEXISTE com os endpoints de
// logistica.controller.ts (`tracking/live`, `tracking/sessions/:id/history`)
// — sub-rotas diferentes (`deliveries/:id/link`, `routes/:id/share-links`),
// zero colisão. Novo controller aqui em vez de editar o genérico: território
// deste worker (F3) não inclui logistica.controller.ts.
@Controller('logistica/tracking')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@ModuleAccess('logistica')
@Admin()
export class LogisticaTrackingShareController {
  constructor(private readonly trackingPublic: LogisticaTrackingPublicService) {}

  private companyId(req: any): number {
    const id = Math.trunc(Number(req?.user?.companyId || 0));
    if (!id) throw new ForbiddenException('Empresa não identificada.');
    return id;
  }

  @Get('deliveries/:deliveryId/link')
  async deliveryLink(@Req() req: any, @Param('deliveryId') deliveryId: string) {
    const res = await this.trackingPublic.getShareLink(this.companyId(req), deliveryId);
    if (!res) throw new NotFoundException('Entrega não encontrada ou link indisponível.');
    return res;
  }

  @Get('routes/:routeId/share-links')
  async routeLinks(@Req() req: any, @Param('routeId') routeId: string) {
    const links = await this.trackingPublic.listShareLinksForRoute(this.companyId(req), routeId);
    return { links };
  }
}
