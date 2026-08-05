import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ErrosAppService } from './erros-app.service';
import { EspelhoAppService } from './espelho-app.service';
import { MasterAparelhosService } from './master-aparelhos.service';

/**
 * PAINEL DO CLIENTE — aparelhos de UMA empresa (PR05082026-VER-TELA, 05/08).
 *
 * MASTER-ONLY (JWT + MasterGuard, mesmo par do master-cockpit e do
 * master-pulso). Admin de tenant NÃO chega aqui: derrubar aparelho de terceiro
 * é ação de plataforma. Se um dia o admin precisar disso, nasce endpoint
 * próprio escopado pela empresa DELE — nunca este com um `if` dentro.
 *
 * Rotas em dois prefixos de propósito: a LISTA é da empresa (a pergunta é
 * "quais aparelhos desta ficha?"), as AÇÕES são do aparelho (a chave já é
 * única no sistema inteiro).
 */
@Controller()
export class MasterAparelhosController {
  constructor(
    private readonly aparelhos: MasterAparelhosService,
    private readonly espelho: EspelhoAppService,
    private readonly erros: ErrosAppService,
  ) {}

  /** Os aparelhos vivos e visíveis desta empresa (lazy: só quando a ficha abre). */
  @Get('master/empresas/:companyId/aparelhos')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listar(@Param('companyId') companyId: string) {
    return this.aparelhos.listar(companyId);
  }

  /** Derruba a sessão do aparelho — ele volta pela tela de pareamento. */
  @Post('master/aparelhos/:deviceId/derrubar')
  @UseGuards(JwtAuthGuard, MasterGuard)
  derrubar(@Param('deviceId') deviceId: string) {
    return this.aparelhos.derrubar(deviceId);
  }

  /** Derruba E esconde da lista. A linha fica (a vaga é do celular, pra sempre). */
  @Post('master/aparelhos/:deviceId/remover')
  @UseGuards(JwtAuthGuard, MasterGuard)
  remover(@Param('deviceId') deviceId: string) {
    return this.aparelhos.remover(deviceId);
  }

  /**
   * VER TELA — abre/renova a janela de 60s do espelho. O painel repete isto a
   * cada 10s enquanto a tela está aberta; PARAR de chamar é o desligamento.
   */
  @Post('master/aparelhos/:deviceId/espelho')
  @UseGuards(JwtAuthGuard, MasterGuard)
  abrirEspelho(@Param('deviceId') deviceId: string) {
    return this.espelho.abrir(deviceId);
  }

  /** O último quadro que o aparelho mandou (marcação já sanitizada por ele). */
  @Get('master/aparelhos/:deviceId/espelho')
  @UseGuards(JwtAuthGuard, MasterGuard)
  lerEspelho(@Param('deviceId') deviceId: string) {
    return this.espelho.quadro(deviceId);
  }

  /** Os erros que o CLIENTE viu neste aparelho (lazy, só no clique). */
  @Get('master/aparelhos/:deviceId/erros')
  @UseGuards(JwtAuthGuard, MasterGuard)
  listarErros(@Param('deviceId') deviceId: string) {
    return this.erros.listar(deviceId);
  }
}
