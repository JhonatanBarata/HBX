import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';

/**
 * PR28072026 HÍBRIDO (28/07) — o master edita a MENSALIDADE e a FRANQUIA de
 * paradas dos 3 níveis de Rota (Basic/Advanced/Full).
 *
 * Guard igual ao CreditsMasterController (JwtAuthGuard + MasterGuard) e MESMO
 * formato de resposta ({ ok, nivel }) — a tela do master trata os dois no mesmo
 * padrão. Vive no módulo de logística (não no de créditos) de propósito: não
 * depende da flag HBX_CREDITS_ENABLED, porque o PREÇO do plano existe mesmo com
 * a máquina de crédito desligada — quem depende de crédito é só o EXCEDENTE.
 *
 * Sem endpoint de tenant aqui: a empresa nunca edita o próprio preço. O que ela
 * enxerga (franquia usada/restante do mês) sai por /logistica/config.
 */
@Controller('logistica/master/niveis')
@UseGuards(JwtAuthGuard, MasterGuard)
export class LogisticaNivelMasterController {
  constructor(private readonly service: LogisticaNivelPlanoService) {}

  /** Os 3 níveis com preço, franquia e a marca de editado. */
  @Get()
  listar() {
    return { niveis: this.service.listForMaster() };
  }

  /**
   * 28/07 — PAINEL DE CONTROLE: uma linha por empresa com nível, mensalidade e
   * assentos. Responde "quem está no crédito puro × quem está num plano" sem
   * abrir ficha por ficha. Rota mais específica ANTES de `:nivel` pra
   * "empresas" não ser lido como nome de nível.
   * ⛔ ROTA v2 (10/08): a coluna de consumo do mês (franquia) morreu — plano
   * com nível virou rota ILIMITADA, o limite agora é de ASSENTO.
   */
  @Get('empresas')
  empresas() {
    return { empresas: this.service.listarEmpresasParaMaster() };
  }

  /** PATCH parcial: mandar só o preço não apaga os assentos editados antes.
   *  24/08/2026 — `franquiaParadasMes` morreu (vitrine morta desde ROTA v2). */
  @Put(':nivel')
  async atualizar(
    @Param('nivel') nivel: string,
    @Body() body: {
      precoMensal?: number;
      titulo?: string;
      slogan?: string;
      // ROTA v2 F2b (10/08) — assentos inclusos do nível (1–999, sanitizado em
      // sanitizeLogisticaNivelOverride).
      assentosInclusos?: number;
    },
  ) {
    const atualizado = await this.service.setOverride(nivel, body || {});
    return { ok: true, nivel: atualizado };
  }

  /** Volta o nível para o catálogo de fábrica. */
  @Delete(':nivel')
  async restaurar(@Param('nivel') nivel: string) {
    const restaurado = await this.service.clearOverride(nivel);
    return { ok: true, nivel: restaurado };
  }
}
