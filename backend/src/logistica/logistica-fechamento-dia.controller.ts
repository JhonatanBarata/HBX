import { Body, Controller, ForbiddenException, Get, NotFoundException, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaFechamentoDiaService } from './logistica-fechamento-dia.service';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { ApagarVendaDto, FinalizarDiaDto, VenderDto } from './dto/logistica.dto';

/**
 * MODO CADERNETA (PR04082026) — rotas do APK. Mesmo guard/kill-switch do
 * LogisticaController (company-scoped pelo JWT; módulo 'logistica' liga/desliga
 * a porta inteira). Sem @Admin: vender é operação de rua, mesma régua do
 * confirmar — a capacidade SELLER é exigida no vender (mesma do createEntrega).
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaFechamentoDiaController {
  constructor(
    private readonly caderneta: LogisticaFechamentoDiaService,
    // Default preserva testes que instanciam direto; no Nest é sempre injetado.
    private readonly operacao: LogisticaOperacaoService = null as any,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /**
   * O resumo da caderneta: medidores (APK velho), fechamento do dia, e — 7 DIAS
   * (05/08) — a PÁGINA pedida (`?dia=1..7`, ausente = dia real do date) + o
   * convite do GPS. userId viaja só pro nome do aviso ("Olá, {Nome}…").
   */
  @Get('caderneta/resumo')
  async resumo(@Req() req: any, @Query('date') date?: string, @Query('dia') dia?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.caderneta.resumo(companyId, date, { dia, userId: Number(req.user?.id) || null });
  }

  /**
   * FINALIZAR O DIA (05/08): registra o dia da semana escolhido e salva a
   * "Caderneta de <dia>" nas Rotas salvas. Mesma capacidade do vender — fechar
   * o dia é gesto de quem vendeu o dia.
   */
  @Post('caderneta/finalizar')
  async finalizar(@Req() req: any, @Body() dto: FinalizarDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    return this.caderneta.finalizar(companyId, dto.dia);
  }

  /** Vendeu: entrega de hoje já entregue + cobrança + GPS calado. Nunca debita. */
  @Post('caderneta/vender')
  async vender(@Req() req: any, @Body() dto: VenderDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    // Mesma régua do createEntrega: vender é capacidade de VENDEDOR.
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    return this.caderneta.vender(companyId, dto, req.user);
  }

  /**
   * Apaga a venda errada (segurar pressionado na linha do dia). Quem vende
   * desfaz: a MESMA capacidade do vender — exigir admin aqui deixaria o
   * motorista com o erro na tela e sem saída.
   */
  @Post('caderneta/apagar-venda')
  async apagarVenda(@Req() req: any, @Body() dto: ApagarVendaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    const res = await this.caderneta.apagarVenda(companyId, dto.entregaId, {
      deletedByUserId: Number(req.user?.id) || null,
    });
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }
}
