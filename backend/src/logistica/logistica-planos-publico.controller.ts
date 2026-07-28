import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';

// PÁGINA DE LOGÍSTICA NO SITE (28/07, PR27072026-ROTA-3-NIVEIS) — a vitrine
// pública `/rota` precisa mostrar preço e franquia dos 3 níveis SEM login.
//
// Por que um endpoint e não texto fixo na página: o dono edita preço, franquia,
// título e slogan no Master (janela Créditos → guia Rota). Se a página do site
// tivesse "R$ 199" escrito no HTML, o dia em que ele mudasse o preço lá o site
// passaria a MENTIR — e ninguém avisaria. Aqui a fonte é a MESMA do billing
// (LogisticaNivelPlanoService = base em código + overlay do banco): mudou no
// Master, mudou no site no próximo carregamento.
//
// Molde do LogisticaTrackingPublicController: sem JwtAuthGuard, registrado em
// logistica.module.ts, @Throttle apertado por rota. 30/min = load de página
// pública (mesmo teto do catálogo do pedido-publico).
//
// O que sai daqui é SÓ material de vitrine (nível, título, slogan, mensalidade,
// franquia) — nada de empresa, consumo, saldo ou qualquer dado de tenant. Não é
// a LEI DO VENDEDOR sendo furada: isto é preço de tabela, o mesmo que vai no
// anúncio.
@Controller('public/logistica')
export class LogisticaPlanosPublicoController {
  constructor(private readonly planos: LogisticaNivelPlanoService) {}

  /** Os 3 níveis de Rota como tabela de preço pública (Basic/Advanced/Full). */
  @Get('planos')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  listar() {
    return { niveis: this.planos.listPublico() };
  }
}
