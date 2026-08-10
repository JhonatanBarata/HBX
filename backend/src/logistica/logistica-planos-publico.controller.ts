import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';

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
  constructor(
    private readonly planos: LogisticaNivelPlanoService,
    // ROTA v2 F2d (10/08) — o preço do débito avulso (dia/passe) vem da MESMA
    // fonte do master (resolveEffective, banco a cada carregamento): mudou lá,
    // mudou na propaganda — mecanismo idêntico ao dos 4 níveis abaixo.
    private readonly actionConfig: CreditActionConfigService,
  ) {}

  /**
   * Os 4 níveis de Rota (Credito/Basic/Advanced/Full) como tabela de preço
   * pública — cada um já com `assentosInclusos`. No topo, o custo em créditos
   * do débito avulso: `diaDeRotaCreditos` (nível Credito, 1×/empresa+dia) e
   * `passeDoDiaCreditos` (qualquer nível com plano, motorista além do teto de
   * assentos, 1×/motorista+dia).
   */
  @Get('planos')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async listar() {
    const [dia, passe] = await Promise.all([
      this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA),
      this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA),
    ]);
    return {
      niveis: this.planos.listPublico(),
      diaDeRotaCreditos: dia && dia.mode === 'debit' ? dia.cost : 0,
      passeDoDiaCreditos: passe && passe.mode === 'debit' ? passe.cost : 0,
    };
  }
}
