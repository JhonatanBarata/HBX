import { Body, Controller, ForbiddenException, Get, NotFoundException, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { LogisticaFechamentoDiaService } from './logistica-fechamento-dia.service';
import { LogisticaOperacaoService } from './logistica-operacao.service';
import { ApagarVendaDto, FinalizarDiaDto, VenderDto } from './dto/logistica.dto';

/**
 * FECHAMENTO DO DIA — rotas do APK. Mesmo guard/kill-switch do
 * LogisticaController (company-scoped pelo JWT; módulo 'logistica' liga/desliga
 * a porta inteira). Sem @Admin: vender é operação de rua, mesma régua do
 * confirmar — a capacidade SELLER é exigida no vender (mesma do createEntrega).
 *
 * 🔴 CADA ROTA ATENDE POR DOIS CAMINHOS (09/08). O caminho vivo é
 * `/logistica/fechamento/*`; `/logistica/caderneta/*` é A PORTA VELHA, e existe
 * por um motivo só: a lista de endereços permitidos mora DENTRO do APK
 * (NativeApiClient.kt), então o aparelho que ainda não atualizou continua
 * batendo no endereço antigo. Apagar as 4 strings antes de todo mundo atualizar
 * derrubaria a venda no celular de quem está na rua — e defeito de campo não
 * tem `git revert`. É a ÚNICA sobrevida da palavra no backend, e some numa
 * linha quando o dono confirmar que não há mais aparelho velho.
 */
@Controller('logistica')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('logistica')
export class LogisticaFechamentoDiaController {
  constructor(
    private readonly fechamento: LogisticaFechamentoDiaService,
    // Default preserva testes que instanciam direto; no Nest é sempre injetado.
    private readonly operacao: LogisticaOperacaoService = null as any,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  /**
   * O resumo do dia: medidores, fechamento por forma e a PÁGINA pedida
   * (`?dia=1..7`, ausente = dia real do date) + o convite do GPS. userId viaja
   * só pro nome do aviso ("Olá, {Nome}…").
   */
  @Get(['fechamento/resumo', 'caderneta/resumo'])
  async resumo(@Req() req: any, @Query('date') date?: string, @Query('dia') dia?: string) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    return this.fechamento.resumo(companyId, date, { dia, userId: Number(req.user?.id) || null });
  }

  /**
   * FECHAR O DIA (05/08): registra o dia da semana escolhido e salva a "Rota de
   * <dia>" nas Rotas salvas. Mesma capacidade do vender — fechar o dia é gesto
   * de quem vendeu o dia.
   */
  @Post(['fechamento/finalizar', 'caderneta/finalizar'])
  async finalizar(@Req() req: any, @Body() dto: FinalizarDiaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    return this.fechamento.finalizar(companyId, dto.dia);
  }

  /** Vendeu: entrega de hoje já entregue + cobrança + GPS calado. Nunca debita. */
  @Post(['fechamento/vender', 'caderneta/vender'])
  async vender(@Req() req: any, @Body() dto: VenderDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    // Mesma régua do createEntrega: vender é capacidade de VENDEDOR.
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    return this.fechamento.vender(companyId, dto, req.user);
  }

  /**
   * Apaga a venda errada (segurar pressionado na linha do dia). Quem vende
   * desfaz: a MESMA capacidade do vender — exigir admin aqui deixaria o
   * motorista com o erro na tela e sem saída.
   */
  @Post(['fechamento/apagar-venda', 'caderneta/apagar-venda'])
  async apagarVenda(@Req() req: any, @Body() dto: ApagarVendaDto) {
    const companyId = this.ensureCompanyIdFromUser(req.user);
    if (this.operacao) await this.operacao.assertCapacidade(req.user, 'SELLER');
    const res = await this.fechamento.apagarVenda(companyId, dto.entregaId, {
      deletedByUserId: Number(req.user?.id) || null,
    });
    if (!res) throw new NotFoundException('Entrega não encontrada');
    return res;
  }
}
