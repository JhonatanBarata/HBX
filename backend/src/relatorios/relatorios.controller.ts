import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RelatoriosService } from './relatorios.service';

// WORM-18 — Relatorios "Acompanhe sua equipe" (6 widgets, pro dono/admin).
// SO LEITURA. O gate admin + LEI DO VENDEDOR (valores R$ so admin) vive DENTRO
// do service (resolveReportContext), nao so aqui — nao confiar em UI/guard fino.
@Controller('relatorios')
@UseGuards(JwtAuthGuard)
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  // Painel completo (a tela usa este) — 6 widgets em 1 chamada.
  @Get('dashboard')
  getDashboard(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getDashboard(req.user, period);
  }

  @Get('funil-receita')
  getFunnelRevenue(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getFunnelRevenue(req.user, period);
  }

  @Get('chats-sem-resposta')
  getUnansweredChats(@Req() req: any) {
    return this.relatorios.getUnansweredChats(req.user);
  }

  @Get('vendedores')
  getSellerFunnel(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getSellerFunnel(req.user, period);
  }

  @Get('tempo-resposta')
  getFirstResponseTime(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getFirstResponseTime(req.user, period);
  }

  @Get('recem-abertas')
  getFreshLeadsUsage(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getFreshLeadsUsage(req.user, period);
  }

  @Get('ia')
  getBotFunnel(@Req() req: any, @Query('period') period?: string) {
    return this.relatorios.getBotFunnel(req.user, period);
  }
}
