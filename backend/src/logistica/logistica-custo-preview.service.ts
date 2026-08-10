import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { LogisticaConfigService, storedNivel } from './logistica-config.service';
import { getLogisticaNivelDefinition } from './logistica-nivel-catalog';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { diaDeRotaUsageKey, passeDoDiaUsageKey } from './logistica-rota-cobranca.service';
import { resolveDayRange } from './logistica-rota.service';
import { diagnosticarMotoristaUnico } from './logistica-motorista-unico.util';
import { isLogisticaAdmin, type LogisticaActor } from './logistica-operacao.service';
import { quemMontouODia, rotaDeOutroMotoristaError } from './logistica-quem-montou.util';

// Só as entregas ABERTAS entram no universo do preview (mesmo recorte do
// planejador/conferência — LogisticaRotaService.STATUS_ABERTO, duplicado aqui
// de propósito: ver comentário de fetchParadasEstendidas em
// logistica-conferencia.service.ts, mesmo motivo — reusar exigiria abrir
// visibilidade num arquivo grande que o dono edita em paralelo nesta frente).
const STATUS_ABERTO = ['agendada', 'em_rota'] as const;

export interface CustoPreviewInput {
  date?: string;
  deliveryIds?: string[];
}

export interface CustoPreviewResult {
  // ROTA v2 (10/08) — SHAPE MANTIDO de propósito (o front lê estes 5 campos),
  // significado adaptado ao modelo por NÍVEL: não existe mais bloco de
  // parada — "1" aqui é "existe 1 cobrança pendente pra este dia/motorista"
  // (dia CREDITO ou passe de assento), "0" é "nada a pagar" (rota ilimitada,
  // dia já pago, motorista já ocupante do assento).
  blocosTotais: number;
  blocosJaDebitados: number;
  creditosAIniciar: number;
  saldoAtual: number;
  saldoCobre: boolean;
}

/**
 * S6 (25/07) / ROTA v2 (10/08) — "preview de créditos": quanto o Iniciar VAI
 * debitar se rodar AGORA, antes do operador apertar o botão.
 *
 * 100% LEITURA (Lei nº3 da frente: "conferir nunca debita crédito" — nenhum
 * caminho aqui chama `garantirDiaPago`/`garantirPasseDoDia`/`wallet.debit`).
 *
 * ── O MODELO (10/08, "PICAR A PONTE") ────────────────────────────────────────
 * Não existe mais bloco por parada. Dois casos, mutuamente exclusivos por
 * NÍVEL da empresa:
 *  - CREDITO: 1 débito por EMPRESA+DATA (usageKey `logistica:dia:...`).
 *    Preview olha se essa usageKey já tem `debit` no ledger — se sim, 0; se
 *    não E o dia tem paradas, o custo de `logistica_dia_de_rota`.
 *  - BASIC/ADVANCED/FULL (rota ILIMITADA): só paga se o motorista estourar o
 *    teto de assentos (nível/override da empresa) e ainda não tiver passe
 *    pago pra hoje — mesma régua de `assertAssentoDoDia`
 *    (logistica-rota-cobranca.service.ts), espelhada aqui em modo LEITURA.
 */
@Injectable()
export class LogisticaCustoPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly config: LogisticaConfigService,
    private readonly actionConfig: CreditActionConfigService,
  ) {}

  async previewCusto(
    companyId: number,
    input: CustoPreviewInput = {},
    entregadorIdAtor?: number,
    actor?: LogisticaActor,
  ): Promise<CustoPreviewResult> {
    const cid = Number(companyId);
    if (!Number.isInteger(cid) || cid <= 0) throw new BadRequestException('Empresa não identificada');
    const routeDate = canonicalRouteDate(input.date);
    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);
    const entregadorId = Number.isInteger(entregadorIdAtor) && (entregadorIdAtor as number) > 0
      ? (entregadorIdAtor as number)
      : await this.resolveSingleDriver(cid, input.date, deliveryIds, actor);

    const saldoAtual = await this.wallet.getBalance(cid);

    const candidatos = deliveryIds.length ? deliveryIds : await this.fetchOpenDeliveryIds(cid, entregadorId, input.date);
    if (!candidatos.length) {
      return { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
    }

    const cfg = await this.prisma.logisticaConfig.findUnique({
      where: { companyId: cid },
      select: { logisticaNivel: true, logisticaAssentos: true },
    });
    const nivel = storedNivel((cfg as any)?.logisticaNivel);

    if (nivel === 'CREDITO') {
      const jaPago = await this.prisma.creditLedgerEntry.findFirst({
        where: { companyId: cid, usageKey: diaDeRotaUsageKey(cid, routeDate), kind: 'debit' },
        select: { id: true },
      });
      if (jaPago) {
        return { blocosTotais: 1, blocosJaDebitados: 1, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
      }
      const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA);
      const custo = definition && definition.mode === 'debit' ? definition.cost : 0;
      return {
        blocosTotais: 1,
        blocosJaDebitados: 0,
        creditosAIniciar: custo,
        saldoAtual,
        saldoCobre: saldoAtual >= custo,
      };
    }

    // Rota ILIMITADA (BASIC/ADVANCED/FULL): só o ASSENTO pode custar.
    const { start, end } = resolveDayRange(input.date);
    const ocupantes = await this.ocupantesDoDia(cid, start, end);
    if (ocupantes.includes(entregadorId)) {
      return { blocosTotais: 0, blocosJaDebitados: 1, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
    }
    const override = typeof (cfg as any)?.logisticaAssentos === 'number' ? (cfg as any).logisticaAssentos : null;
    const assentos = override ?? getLogisticaNivelDefinition(nivel).assentosInclusos;
    if (ocupantes.length < assentos) {
      return { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
    }
    const passeJaPago = await this.prisma.creditLedgerEntry.findFirst({
      where: { companyId: cid, usageKey: passeDoDiaUsageKey(cid, entregadorId, routeDate), kind: 'debit' },
      select: { id: true },
    });
    if (passeJaPago) {
      return { blocosTotais: 1, blocosJaDebitados: 1, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
    }
    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA);
    const custoPasse = definition && definition.mode === 'debit' ? definition.cost : 0;
    return {
      blocosTotais: 1,
      blocosJaDebitados: 0,
      creditosAIniciar: custoPasse,
      saldoAtual,
      saldoCobre: saldoAtual >= custoPasse,
    };
  }

  /** Motoristas distintos com entrega NÃO-cancelada no dia — espelha `assertAssentoDoDia`. */
  private async ocupantesDoDia(companyId: number, start: Date, end: Date): Promise<number[]> {
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        status: { not: 'cancelada' },
        entregadorId: { not: null },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { entregadorId: true },
      distinct: ['entregadorId'],
    });
    return [
      ...new Set(
        (rows as Array<{ entregadorId: number | null }>)
          .map((r) => Number(r.entregadorId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
  }

  /**
   * Universo do dia quando o app NÃO manda deliveryIds explícitos — mesmo
   * filtro (STATUS_ABERTO + janela do dia) de `fetchParadasAbertas`/
   * `resolveSingleDriver` em logistica-rota.service.ts (privados lá,
   * duplicado de propósito: mesmo padrão já usado por
   * LogisticaConferenciaService pros helpers privados dos vizinhos).
   */
  private async fetchOpenDeliveryIds(companyId: number, entregadorId: number, date?: string): Promise<string[]> {
    const { start, end } = resolveDayRange(date);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId,
        status: { in: [...STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { id: true },
      take: 300,
    });
    return rows.map((r: any) => String(r.id));
  }

  /**
   * Duplicado de `LogisticaRotaService.resolveSingleDriver` (privado lá,
   * mesmo motivo do padrão já usado por LogisticaConferenciaService: reusar
   * exigiria abrir visibilidade num arquivo grande que o dono edita em
   * paralelo nesta mesma frente). Ator ADMIN (whereForActor devolve `{}`, sem
   * entregadorId) só recebe preview quando o dia tem exatamente 1 motorista
   * nas entregas abertas — mesma exigência que o Iniciar de verdade cobra
   * antes de cobrar qualquer coisa.
   */
  private async resolveSingleDriver(
    companyId: number,
    date?: string,
    deliveryIds?: string[],
    actor?: LogisticaActor,
  ): Promise<number> {
    const { start, end } = resolveDayRange(date);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(deliveryIds?.length ? { id: { in: deliveryIds } } : {}),
        status: { in: [...STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { id: true, entregadorId: true },
    });
    // PR29072026 — mesma régua, frase que diz QUAL é o problema (ver
    // logistica-motorista-unico.util.ts). O painel de crédito do /logistica lê
    // esta mensagem pra explicar por que o dia não tem custo.
    const diagnostico = diagnosticarMotoristaUnico(rows as any, deliveryIds);
    if (diagnostico.mensagem) {
      // "JÁ MONTADA POR X" (10/08, ROTA v2 F1b) — mesmo tratamento do gêmeo em
      // logistica-rota.service.ts: "dia_vazio" some quando sobra gente com
      // trabalho fora do recorte ABERTO.
      if (diagnostico.motivo === 'dia_vazio') {
        const montadores = await quemMontouODia(this.prisma, companyId, start, end);
        if (montadores.length > 0) throw rotaDeOutroMotoristaError(montadores, isLogisticaAdmin(actor));
      }
      throw new BadRequestException(diagnostico.mensagem);
    }
    return diagnostico.entregadorId as number;
  }
}

// Mesma normalização de logistica-conferencia.service.ts (privada lá): trim +
// tamanho + teto de 300 ids, dedupe via Set (ordem não importa — o preview só
// soma quantidade, nunca sequencia).
function normalizeDeliveryIds(value?: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && id.length <= 80)),
  ].slice(0, 300);
}
