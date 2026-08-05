import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaCadernetaService } from './logistica-caderneta.service';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { VenderCadernetaDto } from './dto/logistica.dto';

/**
 * MODO CADERNETA (PR04082026) — rotas do APK. Mesmo guard/kill-switch do
 * LogisticaController (company-scoped pelo JWT; módulo 'logistica' liga/desliga
 * a porta inteira). Sem @Admin: vender é operação de rua, mesma régua do
 * confirmar — a capacidade SELLER é exigida no vender (mesma do createEntrega).
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaCadernetaController {
  constructor(
    private readonly caderneta: LogisticaCadernetaService,
    // Default preserva testes que instanciam direto; no Nest é sempre injetado.
    private readonly operacao: LogisticaOperacaoService = null as any,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /** Medidor "Mapa: X de N" + fechamento do dia por forma de pagamento. */
  @Get('caderneta/resumo')
  async resumo(@Req() req: any, @Query('date') date?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.caderneta.resumo(companyId, date);
  }

  /** Vendeu: entrega de hoje já entregue + cobrança + GPS calado. Nunca debita. */
  @Post('caderneta/vender')
  async vender(@Req() req: any, @Body() dto: VenderCadernetaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    // Mesma régua do createEntrega: vender é capacidade de VENDEDOR.
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    return this.caderneta.vender(companyId, dto, req.user);
  }
}
