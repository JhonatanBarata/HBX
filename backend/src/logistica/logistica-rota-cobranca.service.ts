import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';
import { storedNivel } from './logistica-config.service';
import { getLogisticaNivelDefinition } from './logistica-nivel-catalog';
import { lockLogisticaRouteTransaction } from './logistica-route-lock';

/**
 * ROTA v2 (10/08, "PICAR A PONTE" — refundação da cobrança) — o CORAÇÃO
 * financeiro do modelo novo. Duas leis, uma classe:
 *
 *   1. Nível com PLANO (BASIC/ADVANCED/FULL) = rota ILIMITADA. O que limita é
 *      quantos motoristas rodam ao MESMO TEMPO no mesmo dia — o teto de
 *      ASSENTOS do nível (ou o override da empresa). Passar do teto exige o
 *      "passe do dia" (débito por motorista+data).
 *   2. Nível CREDITO = sem mensalidade nem franquia — debita 1× "dia de rota"
 *      por EMPRESA+DATA na primeira vez que o dia ganha paradas.
 *
 * Substitui a máquina velha (logistica-route-billing.service.ts, MORTA nesta
 * onda): não existe mais claim por bloco/entrega, não existe mais estado
 * PLANNED→INITIALIZING→ACTIVE de COBRANÇA (só o `status` operacional da
 * `LogisticaRoute` continua — ver logistica-rota.service.ts), não existe mais
 * reconciliador de estorno rodando em pano de fundo.
 */
@Injectable()
export class LogisticaRotaCobrancaService {
  private readonly logger = new Logger(LogisticaRotaCobrancaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly actionConfig: CreditActionConfigService,
  ) {}

  /**
   * DÉBITO DO DIA — só nível CREDITO. Chamada em `planejarRota` (ANTES de
   * persistir `rotaOrdem`, ver logistica-rota.service.ts) sempre que o dia
   * ganhou pelo menos 1 parada. Idempotente por EMPRESA+DATA: remontar o dia,
   * trocar de motorista ou repetir o planejar no mesmo dia nunca cobra de
   * novo — só a PRIMEIRA vez que o dia sai do zero paga.
   *
   * Cancelar NÃO estorna nada (decisão do dono, mesma lei do "cancelar apaga
   * mas não devolve crédito" que já vale pro resto da logística) — este
   * método só SABE debitar, nunca é chamado por um caminho de cancelamento.
   */
  async garantirDiaPago(companyId: number, routeDate: string, actorUserId?: number | null): Promise<void> {
    if (!companyId || !routeDate) return;
    const cfg = await this.prisma.logisticaConfig.findUnique({
      where: { companyId },
      select: { logisticaNivel: true },
    });
    if (storedNivel((cfg as any)?.logisticaNivel) !== 'CREDITO') return; // rota ILIMITADA — nada a cobrar aqui

    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA);
    if (!definition || (definition.mode === 'debit' && !(definition.cost > 0))) {
      throw new Error('Contrato de crédito do Dia de rota inválido.');
    }
    if (definition.mode !== 'debit') return; // master desligou (modo Grátis) — pula a cobrança inteira

    const usageKey = diaDeRotaUsageKey(companyId, routeDate);
    await this.prisma.$transaction(async (tx) => {
      // CONCORRÊNCIA: CreditLedgerEntry NÃO é único por usageKey sozinha (o
      // unique é [usageKey, parentEntryId] — um débito decimal pode consumir
      // mais de um lote, uma linha por lote). O advisory lock serializa dois
      // "iniciar rota" concorrentes do mesmo dia: o 2º espera o 1º terminar de
      // checar+debitar antes de fazer a própria checagem.
      await lockLogisticaRouteTransaction(tx, companyId, `dia:${companyId}:${routeDate}`);
      const jaPago = await tx.creditLedgerEntry.findFirst({
        where: { companyId, usageKey, kind: 'debit' },
        select: { id: true },
      });
      if (jaPago) return; // remontar/outro motorista/repetir — já pago, passa

      const result = await this.wallet.debit(companyId, definition.cost, {
        actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
        usageKey,
        userId: actorUserId ?? null,
        metadata: { companyId, routeDate },
      });
      if (result.debited !== definition.cost || result.partial) {
        if (result.debited > 0) {
          await this.wallet.refund(companyId, {
            usageKey,
            userId: actorUserId ?? null,
            metadata: { reason: 'dia_de_rota_insufficient_balance' },
          });
        }
        // Mesmo shape de sempre (LOGISTICA_ROUTE_UNAVAILABLE/reason=creditos) —
        // é o ÚNICO 402 que a tela do app já sabe traduzir pra "acabou o crédito".
        throw commercialUnavailable('creditos');
      }
    });
  }

  /**
   * PASSE DO DIA — qualquer nível com plano (BASIC/ADVANCED/FULL), motorista
   * ALÉM do teto de assentos. Idempotente por EMPRESA+MOTORISTA+DATA. Chamado
   * pelo endpoint próprio (POST /logistica/rota/passe-do-dia) — nunca dentro
   * do gate (`assertAssentoDoDia` só LÊ; o passe é um ATO explícito de quem
   * paga a conta, não algo que a rota compra sozinha).
   */
  async garantirPasseDoDia(companyId: number, driverUserId: number, dateISO: string, actorUserId?: number | null): Promise<void> {
    if (!companyId || !driverUserId || !dateISO) throw new Error('Empresa, motorista e data são obrigatórios.');
    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA);
    if (!definition || (definition.mode === 'debit' && !(definition.cost > 0))) {
      throw new Error('Contrato de crédito do Passe do dia inválido.');
    }
    if (definition.mode !== 'debit') return;

    const usageKey = passeDoDiaUsageKey(companyId, driverUserId, dateISO);
    await this.prisma.$transaction(async (tx) => {
      await lockLogisticaRouteTransaction(tx, companyId, `passe:${companyId}:${driverUserId}:${dateISO}`);
      const jaPago = await tx.creditLedgerEntry.findFirst({
        where: { companyId, usageKey, kind: 'debit' },
        select: { id: true },
      });
      if (jaPago) return;

      const result = await this.wallet.debit(companyId, definition.cost, {
        actionKey: CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA,
        usageKey,
        userId: actorUserId ?? null,
        metadata: { companyId, driverUserId, date: dateISO },
      });
      if (result.debited !== definition.cost || result.partial) {
        if (result.debited > 0) {
          await this.wallet.refund(companyId, {
            usageKey,
            userId: actorUserId ?? null,
            metadata: { reason: 'passe_do_dia_insufficient_balance' },
          });
        }
        throw commercialUnavailable('creditos');
      }
    });
  }

  /**
   * O PORTÃO DE ASSENTOS — só LÊ, nunca debita (débito é o passe, acima, por
   * ATO explícito). assentos = override da empresa (`LogisticaConfig.
   * logisticaAssentos`) ?? `assentosInclusos` do nível (catálogo, editável no
   * master). ocupantes = motoristas distintos com entrega NÃO-cancelada hoje
   * (mesmo fato de `quemMontouODia`, ver logistica-quem-montou.util.ts — se
   * ESTE motorista já é ocupante, ele não "gasta" um assento novo: reabrir o
   * app, recalcular a rota ou tocar em Iniciar de novo nunca barra quem já
   * estava dentro).
   *
   * Chamado em: `materializeForRoute` (driverUserId), `planejarRota`
   * (entregadorId), `iniciarRota` e `atribuirEntrega` — os 4 becos onde um
   * motorista passa a ter (ou pode passar a ter) entrega no dia.
   */
  async assertAssentoDoDia(companyId: number, driverUserId: number, dateISO: string): Promise<void> {
    if (!companyId || !driverUserId || !dateISO) return; // sem motorista definido — nada a gatear aqui
    const [cfg, ocupantesRows] = await Promise.all([
      this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { logisticaNivel: true, logisticaAssentos: true },
      }),
      this.ocupantesDoDia(companyId, dateISO),
    ]);
    if (ocupantesRows.includes(driverUserId)) return; // já é ocupante — nunca barra quem já estava dentro

    const nivel = storedNivel((cfg as any)?.logisticaNivel);
    const override = typeof (cfg as any)?.logisticaAssentos === 'number' ? (cfg as any).logisticaAssentos : null;
    const assentos = override ?? getLogisticaNivelDefinition(nivel).assentosInclusos;
    if (ocupantesRows.length < assentos) return; // sobrou assento — entra de graça

    if (nivel === 'CREDITO') {
      throw assentosEsgotadosError(
        `Seu modo atual inclui ${assentos} motorista${assentos === 1 ? '' : 's'} por dia. Conheça os planos com mais motoristas.`,
        false,
      );
    }

    const passeKey = passeDoDiaUsageKey(companyId, driverUserId, dateISO);
    const passePago = await this.prisma.creditLedgerEntry.findFirst({
      where: { companyId, usageKey: passeKey, kind: 'debit' },
      select: { id: true },
    });
    if (passePago) return; // passe já comprado pra ESTE motorista+dia — libera

    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_PASSE_MOTORISTA_DIA);
    const passeCreditos = definition && definition.mode === 'debit' ? definition.cost : 0;
    throw assentosEsgotadosError(
      `Seu plano inclui ${assentos} motorista${assentos === 1 ? '' : 's'} por dia. Adicione um assento ou libere este motorista só hoje.`,
      true,
      passeCreditos,
    );
  }

  /** Motoristas distintos com entrega NÃO-cancelada no dia — mesma régua de `quemMontouODia`. */
  private async ocupantesDoDia(companyId: number, dateISO: string): Promise<number[]> {
    const { start, end } = dayRange(dateISO);
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
}

// Duplicata de propósito de `resolveDayRange` — mesmo padrão já estabelecido
// na casa (ver a NOTA original em logistica-rota.service.ts: "duplicada em
// logistica.service.ts... não deduplicado, mantidas em paridade"). `dateISO`
// aqui já chega CANÔNICO ("YYYY-MM-DD", produzido por `canonicalRouteDate`),
// então não precisa da tolerância a lixo que `resolveDayRange` tem.
function dayRange(dateISO: string): { start: Date; end: Date } {
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return { start, end };
}

export function diaDeRotaUsageKey(companyId: number, routeDate: string): string {
  return `logistica:dia:company:${companyId}:date:${routeDate}`;
}

export function passeDoDiaUsageKey(companyId: number, driverUserId: number, dateISO: string): string {
  return `logistica:passe:company:${companyId}:driver:${driverUserId}:date:${dateISO}`;
}

// Mesmo contrato do 402 antigo (LOGISTICA_ROUTE_UNAVAILABLE/reason=creditos) —
// é o único formato que a tela do app já sabe traduzir pra "acabou o crédito"
// (ver o comentário histórico em logistica-route-billing.service.ts, agora morto).
function commercialUnavailable(reason: 'creditos'): HttpException {
  return new HttpException(
    {
      statusCode: 402,
      code: 'LOGISTICA_ROUTE_UNAVAILABLE',
      reason,
      message: 'O dia não pôde ser liberado. Fale com o responsável pela conta.',
    },
    402,
  );
}

function assentosEsgotadosError(message: string, podeComprarPasse: boolean, passeCreditos?: number): HttpException {
  return new HttpException(
    {
      statusCode: 402,
      code: 'ASSENTOS_ESGOTADOS',
      message,
      podeComprarPasse,
      ...(passeCreditos !== undefined ? { passeCreditos } : {}),
    },
    402,
  );
}
