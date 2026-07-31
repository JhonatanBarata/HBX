import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PainelModuloService } from './painel-modulo.service';
import type { PainelModulo } from './painel-modulo.types';

/**
 * PAINEL DAS COSTAS — GET /painel-modulo/:modulo.
 *
 * Só JwtAuthGuard: a empresa vem SEMPRE do JWT e o módulo pedido é o da tela
 * que o usuário já está vendo (a sidebar só mostra módulo liberado). Módulo
 * desconhecido, empresa ausente ou qualquer falha interna devolvem `null` — a
 * casca simplesmente não desenha o verso. Painel nunca derruba tela.
 */
@Controller('painel-modulo')
@UseGuards(JwtAuthGuard)
export class PainelModuloController {
  constructor(private readonly service: PainelModuloService) {}

  @Get(':modulo')
  async painel(@Req() req: any, @Param('modulo') modulo: string): Promise<PainelModulo | null> {
    const companyId = Number(req.user?.companyId) || 0;
    const papel = String(req.user?.role || '').trim().toUpperCase();
    // LEI DO VENDEDOR (PAGAMENTOS.md): valor só para o responsável pela empresa.
    const podeVerDinheiro =
      Boolean(req.user?.isSystemMaster) || papel === 'ADMIN' || papel === 'USERMASTER';

    return this.service.painel({ companyId, podeVerDinheiro }, modulo);
  }
}
