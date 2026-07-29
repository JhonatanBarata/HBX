import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { LogisticaConfigService } from './logistica-config.service';
import {
  canonicalRouteDate,
  essentialBlocksForDeliveries,
  type LogisticaRouteMode,
} from './logistica-route-billing.service';
import { resolveDayRange } from './logistica-rota.service';
import { diagnosticarMotoristaUnico } from './logistica-motorista-unico.util';

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
  blocosTotais: number;
  blocosJaDebitados: number;
  creditosAIniciar: number;
  saldoAtual: number;
  saldoCobre: boolean;
}

/**
 * S6 (25/07, PR25072026-ROTA-CONFERIDA) — "preview de créditos": quanto o
 * Iniciar VAI debitar se rodar AGORA, antes do operador apertar o botão.
 *
 * 100% LEITURA (Lei nº3 da frente: "conferir nunca debita crédito" — nenhum
 * caminho novo chama `prepareRoute`/`wallet.debit` aqui). A matemática de
 * blocos é a MESMA do billing real: `essentialBlocksForDeliveries`, importada
 * direto de `logistica-route-billing.service.ts` — nunca reimplementada —
 * pra preview e débito nunca divergirem (o próprio nome da fórmula é o
 * contrato).
 *
 * ── POR QUE NÃO CHAMA prepareRoute EM "MODO SÓ LER" ─────────────────────────
 * `prepareRoute()` sempre pode CRIAR a rota (`createIfMissing`) e sempre
 * grava stop novo (`appendStop`) pra descobrir quantos são cobráveis — não
 * existe modo dele que só leia. Espelhar a MESMA decisão aqui com
 * find/count puros (nunca create/update) é o único jeito de cumprir a Lei
 * nº3 e a exigência de "zero mutação" (teste-invariante do S6) ao mesmo
 * tempo.
 *
 * ── COMO A CONTA FECHA COM O DÉBITO REAL ────────────────────────────────────
 * billableDeliveries = (stops JÁ gravados da rota viva de hoje, não-isentos,
 * entrega não cancelada — MESMO filtro de `syncSnapshot` em
 * logistica-route-billing.service.ts ~L331) + (ids pedidos que ainda NÃO são
 * stop de rota nenhuma, entrega não cancelada). Um id já stopado em OUTRA
 * rota nunca soma aqui: se a rota dona está morta (COMPLETED/encerrada
 * operacionalmente/dia anterior), o id migraria de graça (`billingExempt`,
 * decisão do dono 18/07); se está viva, o Iniciar de verdade travaria a
 * operação inteira com 409 (`ENTREGA_EM_OUTRA_ROTA`) antes de cobrar
 * qualquer bloco. Nos dois casos o débito real desse id é ZERO — igual ao
 * preview.
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
  ): Promise<CustoPreviewResult> {
    const cid = Number(companyId);
    if (!Number.isInteger(cid) || cid <= 0) throw new BadRequestException('Empresa não identificada');
    const routeDate = canonicalRouteDate(input.date);
    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);
    const entregadorId = Number.isInteger(entregadorIdAtor) && (entregadorIdAtor as number) > 0
      ? (entregadorIdAtor as number)
      : await this.resolveSingleDriver(cid, input.date, deliveryIds);

    // Mesma chave/ordenação de ensureRoute em logistica-route-billing.service.ts
    // (companyId+entregadorId+routeDate, createdAt desc): pode existir mais de
    // uma linha histórica quando uma saída anterior já COMPLETOU no mesmo dia.
    const route = (await (this.prisma as any).logisticaRoute.findFirst({
      where: { companyId: cid, entregadorId, routeDate },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })) as { id: string; mode: LogisticaRouteMode; status: string; billingRevision: number } | null;
    // COMPLETED é terminal (mesma regra de ensureRoute): um Iniciar hoje
    // nasceria numa rota NOVA (routeId novo, zero claims) — trata como "sem
    // rota viva" pra não emprestar claims de uma linha morta.
    const rotaViva = !!route && route.status !== 'COMPLETED';

    const saldoAtual = await this.wallet.getBalance(cid);
    const mode: LogisticaRouteMode = rotaViva ? (route as any).mode : await this.config.resolveRouteMode(cid);
    if (mode !== 'ESSENTIAL') {
      // Rota Rastreada não cobra por bloco de 5 entregas — esta é a única
      // regra de crédito-por-bloco que existe hoje (ver S6-CREDITOS-PREVIEW.md).
      return { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual, saldoCobre: true };
    }

    const candidatos = deliveryIds.length ? deliveryIds : await this.fetchOpenDeliveryIds(cid, entregadorId, input.date);
    const existingBillable = rotaViva
      ? await (this.prisma as any).logisticaRouteStop.count({
          where: {
            companyId: cid,
            routeId: (route as any).id,
            billingExempt: false,
            delivery: { status: { not: 'cancelada' } },
          },
        })
      : 0;
    const novosBillable = await this.contarNovosBillaveis(cid, candidatos);
    const blocosTotais = essentialBlocksForDeliveries(existingBillable + novosBillable);

    const blocosJaDebitados = rotaViva
      ? await (this.prisma as any).logisticaEssentialCreditClaim.count({
          where: {
            companyId: cid,
            routeId: (route as any).id,
            billingRevision: (route as any).billingRevision,
            blockIndex: { lte: blocosTotais },
            status: 'DEBITED',
          },
        })
      : 0;

    // 💰 27/07 — a MESMA fonte do débito real (resolveEffective, banco a cada
    // chamada): blocos pendentes × custo do catálogo. mode 'free' = preview 0,
    // igual ao prepareRoute que pula a cobrança inteira. Sem isso a tela
    // prometia "1 crédito/bloco" cravado enquanto o dono muda o preço no /master.
    const blocosPendentes = Math.max(0, blocosTotais - blocosJaDebitados);
    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK);
    const custoBloco = definition && definition.mode === 'debit' ? definition.cost : 0;
    const creditosAIniciar = Math.round(blocosPendentes * custoBloco * 1000) / 1000;
    const saldoCobre = saldoAtual >= creditosAIniciar;
    return { blocosTotais, blocosJaDebitados, creditosAIniciar, saldoAtual, saldoCobre };
  }

  /**
   * ids que JÁ são stop de QUALQUER rota (desta ou de outra) nunca contam
   * como NOVO billable — ver o comentário de topo do arquivo (migração de
   * graça ou 409 travando a operação inteira: os dois casos somam zero de
   * verdade). ids sem stop nenhum nascem billable, exceto se a entrega já
   * está cancelada (mesmo filtro `delivery.status !== 'cancelada'` do
   * billing real).
   */
  private async contarNovosBillaveis(companyId: number, deliveryIds: string[]): Promise<number> {
    if (!deliveryIds.length) return 0;
    const stops = (await (this.prisma as any).logisticaRouteStop.findMany({
      where: { companyId, deliveryId: { in: deliveryIds } },
      select: { deliveryId: true },
    })) as Array<{ deliveryId: string }>;
    const jaTemStop = new Set(stops.map((s) => String(s.deliveryId)));
    const semStop = deliveryIds.filter((id) => !jaTemStop.has(id));
    if (!semStop.length) return 0;
    const entregas = await this.prisma.entrega.findMany({
      where: { companyId, id: { in: semStop } },
      select: { id: true, status: true },
    });
    return entregas.filter((e: any) => e.status !== 'cancelada').length;
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
   * antes de cobrar qualquer bloco.
   */
  private async resolveSingleDriver(companyId: number, date?: string, deliveryIds?: string[]): Promise<number> {
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
    if (diagnostico.mensagem) throw new BadRequestException(diagnostico.mensagem);
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
