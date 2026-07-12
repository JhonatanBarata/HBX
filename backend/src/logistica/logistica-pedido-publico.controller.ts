import { BadRequestException, Body, Controller, Get, HttpCode, Ip, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LogisticaPedidoPublicoService } from './logistica-pedido-publico.service';

// S6 PORTAL-PEDIDO (11/07) — endpoints PÚBLICOS do link de pedido /pedido/<token>
// (sem JwtAuthGuard) — molde EXATO do website-lead-capture.controller.ts: a
// segurança vem do token OPACO rotacionável na URL (LogisticaConfig.
// pedidoPublicoToken, nunca companyId/slug cru), não de sessão. Registrado em
// logistica.module.ts (NÃO em app.module.ts).
//
// DORMENTE: HBX_PEDIDO_PUBLICO_ENABLED default OFF → GET e POST respondem 404
// seco (rota "não existe"); com a env ON ainda exige o toggle POR TENANT
// (LogisticaConfig.pedidoPublicoAtivo) — token inválido, flag OFF e tenant OFF
// têm resposta IDÊNTICA (404 genérico, sem pista de qual caso foi).
//
// Rate-limit: @Throttle sobrepõe o teto global com teto apertado por rota
// (ThrottlerGuard já é APP_GUARD global em app.module.ts; chaveia por IP).
// POST = 5/min (molde lead-capture); GET = 30/min (é o load da página pública —
// 5/min derrubaria vizinhos de IP compartilhado abrindo o cardápio juntos).
//
// Respostas do POST por caso (igual ao molde):
//   - honeypot preenchido / teto diário da empresa / sucesso -> 200 "ok"
//     (nunca revela qual dos três foi)
//   - token inválido / flag OFF / tenant OFF -> 404 genérico
//   - campo obrigatório inválido (nome/telefone/endereço/itens) -> 400 normal
@Controller('public/pedido')
export class LogisticaPedidoPublicoController {
  constructor(private readonly pedidoPublico: LogisticaPedidoPublicoService) {}

  /** Vitrine: nome da empresa + produtos usaLogistica com preço de CATÁLOGO. */
  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async catalogo(@Param('token') token: string) {
    const res = await this.pedidoPublico.getCatalogo(token);
    if (!res) throw new NotFoundException('Não encontrado.');
    return res;
  }

  /** Cria o pedido (vira Entrega 'agendada' de HOJE). Preço SEMPRE do servidor. */
  @Post(':token')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async criar(@Param('token') token: string, @Body() body: any, @Ip() ip?: string) {
    const result = await this.pedidoPublico.criarPedido(
      {
        token,
        itens: body?.itens,
        nome: body?.nome,
        telefone: body?.telefone,
        endereco: body?.endereco,
        obs: body?.obs,
        _hp: body?._hp,
      },
      ip || null,
    );

    if (result.ok) return { ok: true };

    if (result.reason === 'not_found') {
      throw new NotFoundException('Não encontrado.');
    }
    if (result.reason === 'validacao') {
      throw new BadRequestException(result.message || 'Dados do pedido inválidos.');
    }
    // rate_limited / qualquer recusa best-effort: 200 genérico, sem pista (molde).
    return { ok: true };
  }
}
