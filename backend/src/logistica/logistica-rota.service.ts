import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canonicalRouteDate,
  LogisticaRouteBillingService,
  type PreparedLogisticaRoute,
} from './logistica-route-billing.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import { LogisticaOsrmService } from './logistica-osrm.service';

const ROUTE_BILLING_CONTEXT = Symbol('routeBillingContext');
type InternalPlanResult = PlanejarRotaResult & { [ROUTE_BILLING_CONTEXT]?: PreparedLogisticaRoute };

/**
 * LOGÍSTICA-MOBILE M3 (05/07) — MOTOR DE ROTA + ETA (100% local, sem API paga).
 *
 * Ordena a rota do dia do entregador e calcula a previsão de término. Tudo com
 * matemática PURA (Haversine + nearest-neighbor + 2-opt), zero Google Directions,
 * zero chamada externa, R$0. É "bom o bastante" para ≤50 paradas de 1 entregador.
 *
 * ── O QUE FAZ ────────────────────────────────────────────────────────────────
 *  1) Pega as entregas ABERTAS do dia (status 'agendada' | 'em_rota').
 *  2) Ordena por proximidade: nearest-neighbor a partir da ORIGEM (GPS do
 *     entregador ao iniciar, ou a 1ª parada com coord se sem origem) + refino
 *     2-opt (troca de arestas que reduz o trajeto total). Paradas SEM lat/lng
 *     vão pro FIM da fila (flag semCoordenada) — não dá pra roteá-las.
 *  3) Grava `rotaOrdem` (0..N) em cada Entrega.
 *  4) ETA cumulativo: por parada, tempo de trajeto (distância /
 *     velocidadeMediaKmH) + tempoParadaMin. Grava `etaAt` por parada e devolve a
 *     previsão de término (etaAt da última).
 *
 * ── ADITIVO / NÃO QUEBRA N6/M2 ───────────────────────────────────────────────
 * Só GRAVA rotaOrdem/etaAt (colunas M2, opcionais). Não dispara WhatsApp nem
 * cobrança — isso é só no confirmar (N6), atrás de HBX_LOGISTICA_ENABLED. O
 * re-ETA no confirmar/cancelar é aditivo e best-effort (try/catch): se falhar,
 * o comportamento do N6 segue intacto.
 */
@Injectable()
export class LogisticaRotaService {
  private readonly logger = new Logger(LogisticaRotaService.name);

  // Defaults do LogisticaConfig quando a empresa ainda não configurou (schema).
  private static readonly DEFAULT_VELOCIDADE_KMH = 25;
  private static readonly DEFAULT_PARADA_MIN = 5;

  // Só as entregas ABERTAS entram na rota (as concluídas/canceladas saem).
  private static readonly STATUS_ABERTO = ['agendada', 'em_rota'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeBilling: LogisticaRouteBillingService,
    @Optional() private readonly tracking?: LogisticaTrackingService,
    // S1 (25/07, PR25072026-ROTA-CONFERIDA) — DEGRAU 1 do planejamento por
    // ruas (cache + rate-limit por empresa). @Optional() e por ÚLTIMO no
    // construtor de propósito: instanciações diretas existentes em teste
    // (`new LogisticaRotaService(prisma, routeBilling)`) continuam válidas
    // sem o proxy — planRouteByRoads simplesmente pula pro degrau 2 (público
    // direto), mesmo comportamento de antes desta sprint.
    @Optional() private readonly osrm?: LogisticaOsrmService,
  ) {}

  // ── PLANEJAR ROTA ────────────────────────────────────────────────────────────
  /**
   * Ordena a rota do dia, grava rotaOrdem/etaAt e devolve a rota + término
   * previsto + quantas paradas ficaram sem coordenada.
   */
  async planejarRota(
    companyId: number,
    input: PlanejarRotaInput = {},
    entregadorId?: number,
    actorUserId?: number | null,
    chargeEssential = false,
  ): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const routeDate = canonicalRouteDate(input.date);
    const { start, end, dayISO } = resolveDayRange(input.date);
    const config = await this.loadConfig(companyId);
    const origem = coordFromInput(input.origemLat, input.origemLng);

    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);
    const rows = await this.fetchParadasAbertas(companyId, start, end, entregadorId, deliveryIds);

    // Ordena (NN + 2-opt) e calcula ETA cumulativo a partir de AGORA (ou input.startAt).
    const partida = parseDateOrNull(input.startAt) ?? new Date();
    // PR18072026 — ORDEM MANUAL: quando o app manda `ordemManual` (ids na ordem que
    // o entregador arrastou na tela), a rota respeita ESSA ordem ao pé da letra —
    // pula o NN+2-opt inteiro. Paradas listadas recebem rotaOrdem na ordem dada;
    // as não-listadas (fora do conjunto aberto ou esquecidas na lista) vão pro FIM
    // na ordem natural do fetch (rotaOrdem→scheduledAt→createdAt). ETA cumulativo
    // segue a MESMA função (computeEta) — mesma velocidade/tempo de parada, mesma
    // persistência rotaOrdem/etaAt do caminho automático.
    const ordemManual = normalizeOrdemManual(input.ordemManual);
    const plan = ordemManual
      ? planRouteManual(rows.map((r) => toStop(r)), ordemManual, {
          origem,
          velocidadeKmH: config.velocidadeMediaKmH,
          paradaMin: config.tempoParadaMin,
          partida,
        })
      : await planRouteByRoads(
          rows.map((r) => toStop(r)),
          {
            origem,
            velocidadeKmH: config.velocidadeMediaKmH,
            paradaMin: config.tempoParadaMin,
            partida,
            osrmTable: this.osrmTableFetcher(companyId),
          },
        );

    // Persiste rotaOrdem/etaAt de cada parada (sequencial: são poucas paradas/dia).
    for (const p of plan.paradas) {
      const changed = await this.prisma.entrega.updateMany({
        where: { companyId, id: p.id },
        data: { rotaOrdem: p.rotaOrdem, etaAt: p.etaAt },
      });
      if (changed.count !== 1) throw new ConflictException('Entrega saiu da rota durante o planejamento.');
    }

    const semCoordenada = plan.paradas.filter((p) => p.semCoordenada).length;

    // Admin pode continuar usando o planejamento amplo (vários motoristas) sem
    // gerar agregado/cobrança. Quando há motorista definido, congela snapshot e
    // cobra somente os blocos novos; retries/recalcular são idempotentes.
    let prepared: PreparedLogisticaRoute | undefined;
    if (entregadorId && plan.paradas.length > 0) {
      prepared = (await this.routeBilling.prepareRoute({
        companyId,
        entregadorId,
        routeDate,
        deliveryIds: plan.paradas.map((p) => p.id),
        actorUserId,
        chargeEssential,
        createIfMissing: chargeEssential,
      })) ?? undefined;
    } else if (plan.paradas.length > 0) {
      // Planejamento amplo do admin não cria rota comercial, mas precisa
      // reconciliar blocos novos das rotas que JÁ estão ACTIVE. Agrupa por
      // motorista para nunca misturar chaves empresa+motorista+data.
      const driverByDelivery = new Map(rows.map((row) => [row.id, row.entregadorId]));
      const byDriver = new Map<number, string[]>();
      for (const stop of plan.paradas) {
        const driverId = driverByDelivery.get(stop.id);
        if (!driverId) continue;
        const ids = byDriver.get(driverId) || [];
        ids.push(stop.id);
        byDriver.set(driverId, ids);
      }
      for (const [driverId, deliveryIds] of byDriver) {
        await this.routeBilling.prepareRoute({
          companyId,
          entregadorId: driverId,
          routeDate,
          deliveryIds,
          actorUserId,
          chargeEssential: false,
          createIfMissing: false,
        });
      }
    }
    this.logger.log(
      `[logistica] rota planejada ${dayISO} company=${companyId}: ${plan.paradas.length} parada(s), ` +
        `${semCoordenada} sem coord, término ~${plan.terminoPrevisto ?? 'n/a'}.`,
    );

    const result: InternalPlanResult = {
      date: dayISO,
      total: plan.paradas.length,
      semCoordenada,
      distanciaTotalKm: round2(plan.distanciaTotalKm),
      terminoPrevisto: plan.terminoPrevisto ? plan.terminoPrevisto.toISOString() : null,
      velocidadeMediaKmH: config.velocidadeMediaKmH,
      tempoParadaMin: config.tempoParadaMin,
      // S1 (25/07, PR25072026-ROTA-CONFERIDA) — crachá: engine SEMPRE presente
      // (Lei nº4, "degradação nunca é silenciosa"); degradedReason só quando
      // o Haversine veio de FALHA (ordem manual também é Haversine, mas por
      // escolha — planRouteManual nunca preenche degradedReason).
      engine: plan.engine,
      ...(plan.degradedReason ? { degradedReason: plan.degradedReason } : {}),
      paradas: plan.paradas.map((p) => ({
        id: p.id,
        rotaOrdem: p.rotaOrdem,
        etaAt: p.etaAt ? p.etaAt.toISOString() : null,
        semCoordenada: p.semCoordenada,
        lat: p.lat,
        lng: p.lng,
        status: p.status,
        nome: p.nome,
      })),
    };
    if (prepared) {
      Object.defineProperty(result, ROUTE_BILLING_CONTEXT, { value: prepared, enumerable: false });
    }
    return result;
  }

  // ── INICIAR ROTA ─────────────────────────────────────────────────────────────
  /**
   * Marca o início da rota. Re-planeja com a ORIGEM atual (GPS do entregador ao
   * apertar "iniciar") e coloca a 1ª parada em 'em_rota' com startedAt=agora.
   */
  async iniciarRota(
    companyId: number,
    input: IniciarRotaInput = {},
    entregadorId?: number,
    actorUserId?: number | null,
    includeCommercialMode = false,
  ): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const effectiveDriverId = entregadorId ?? (await this.resolveSingleDriver(companyId, input.date, input.deliveryIds));
    // Re-planeja a partir da origem atual (mesmo caminho do planejar).
    const plan = await this.planejarRota(companyId, {
      date: input.date,
      origemLat: input.origemLat,
      origemLng: input.origemLng,
      deliveryIds: input.deliveryIds,
      ordemManual: input.ordemManual,
    }, effectiveDriverId, actorUserId, true);

    if (plan.paradas.length === 0) throw new BadRequestException('Não há entregas abertas para iniciar.');
    const prepared = (plan as InternalPlanResult)[ROUTE_BILLING_CONTEXT];
    if (!prepared) throw new Error('Contexto comercial da rota não foi criado.');
    let initialization: { token: string | null; alreadyActive: boolean };
    try {
      initialization = await this.routeBilling.beginInitialization(
        companyId,
        prepared.routeId,
        prepared.billingRevision,
      );
    } catch (error) {
      await this.routeBilling.abortPreparedRoute({
        companyId,
        routeId: prepared.routeId,
        actorUserId,
        error,
      });
      throw error;
    }

    // 1ª parada roteável (rotaOrdem=0) vira 'em_rota' com startedAt — só se ainda
    // estiver 'agendada' (não rebaixa nada já em rota/entregue).
    const primeira = plan.paradas.find((p) => p.rotaOrdem === 0 && !p.semCoordenada) ?? plan.paradas[0];
    const startedAt = new Date();
    let changedFirst = false;
    let trackingSessionEnsured = false;
    try {
      if (primeira && primeira.status === 'agendada') {
        const changed = await this.prisma.entrega.updateMany({
          where: { companyId, id: primeira.id, entregadorId: effectiveDriverId, status: 'agendada' },
          data: { status: 'em_rota', startedAt },
        });
        changedFirst = changed.count === 1;
        if (changedFirst) primeira.status = 'em_rota';
      }
      if (prepared.mode === 'TRACKED') {
        if (!this.tracking) throw new Error('Serviço de rastreamento indisponível para a Rota Rastreada.');
        const session = await this.tracking.ensureSessionForStartedRoute(
          companyId,
          prepared.routeId,
          startedAt,
        );
        if (!session) throw new Error('Não foi possível criar a sessão da Rota Rastreada.');
        trackingSessionEnsured = true;
      }
      if (!initialization.alreadyActive && initialization.token) {
        await this.routeBilling.activateRoute(companyId, prepared.routeId, initialization.token, startedAt);
      }
    } catch (error) {
      if (changedFirst && !initialization.alreadyActive) {
        await this.prisma.entrega.updateMany({
          where: { companyId, id: primeira.id, status: 'em_rota', startedAt },
          data: { status: 'agendada', startedAt: null },
        }).catch(() => undefined);
      }
      if (!initialization.alreadyActive && initialization.token) {
        if (trackingSessionEnsured && this.tracking) {
          await this.tracking.discardUnboundSessionAfterRouteFailure(companyId, prepared.routeId).catch(() => undefined);
        }
        await this.routeBilling.failInitialization({
          companyId,
          routeId: prepared.routeId,
          token: initialization.token,
          actorUserId,
          error,
        });
      }
      throw error;
    }
    // PR17072026 — (re)iniciar REATIVA a rota operacional: zera a marca de
    // "encerrada" (operationalEndedAt, decoupled da cobrança) para a 2ª leva no
    // mesmo dia voltar a aparecer como ativa. ANTES de ler a metadata abaixo (que
    // gateia routeStatus por esse campo), senão a própria resposta do iniciar
    // sairia como encerrada. Best-effort: falha aqui não desfaz a rota já ativa.
    await this.prisma.logisticaRoute
      .updateMany({
        where: { companyId, id: prepared.routeId, operationalEndedAt: { not: null } },
        data: { operationalEndedAt: null },
      })
      .catch(() => undefined);
    const operational = this.tracking
      ? await this.tracking.getOperationalRouteMetadata(
          companyId,
          effectiveDriverId,
          canonicalRouteDate(input.date),
          includeCommercialMode,
        )
      : {
          routeId: prepared.routeId,
          trackingRequired: prepared.mode === 'TRACKED',
          routeStatus: 'ACTIVE',
          trackingSessionId: null,
          trackingStatus: null,
          ...(includeCommercialMode ? { routeMode: prepared.mode } : {}),
        };
    const { routeMode, ...operationalOnly } = operational;
    return {
      ...plan,
      ...operationalOnly,
      ...(includeCommercialMode ? { routeMode: routeMode ?? prepared.mode } : {}),
    };
  }

  // ── ENCERRAR ROTA (PR17072026 Onda 1) ────────────────────────────────────────
  /**
   * Encerra a rota do dia de forma TRANSACIONAL e tudo-ou-nada. Serve os DOIS
   * casos do app ("Cancelar planejamento", antes de iniciar, e "Encerrar rota",
   * no meio) — a diferença é só a cópia da tela; o primitivo do backend é único.
   *
   * Substitui o loop antigo `POST /logistica/entregas/:id/cancelar` por parada
   * (performCancelRoute no app.js): se a rede caísse no meio, metade cancelava e
   * metade ficava (cancelamento PARCIAL); além disso 'cancelada' é semântica de
   * FALHA — errada para "parei a rota, o resto é pendência pra outro dia".
   *
   * Dentro de UMA prisma.$transaction:
   *  - 'entregue'/'cancelada': NUNCA entram no WHERE de escrita — ficam intocadas
   *    (contam em entregues/naoEntregues só de LEITURA).
   *  - 'agendada'/'em_rota' COM sinal de que estavam na rota (rotaOrdem/etaAt/
   *    startedAt preenchidos, ou já em_rota) voltam para 'agendada' com
   *    rotaOrdem/etaAt/startedAt=null. scheduledAt NUNCA muda (não backdata) —
   *    assim a retomada no MESMO dia re-planeja normal (fetchParadasAbertas pega
   *    de novo) e, no dia seguinte, entram na fila de pendência do admin
   *    (scheduledAt < início do dia — ver logistica-admin-route.service.ts:94).
   *  - 'agendada' SEM nenhum sinal de rota (rotaOrdem/etaAt/startedAt todos
   *    null — nunca passou por planejar/iniciar) fica de fora da contagem de
   *    `pendentes` e não é escrita: já está exatamente no estado-alvo. Sem essa
   *    exclusão a IDEMPOTÊNCIA exigida pelo contrato ("2ª chamada acha 0
   *    abertas → pendentes: 0") seria IMPOSSÍVEL de satisfazer: o próprio
   *    revert desta transação deixa a entrega em 'agendada', que TAMBÉM é um
   *    dos status "abertos" do item 2 do contrato — uma leitura 100% literal
   *    ("status IN agendada/em_rota") re-contaria as MESMAS entregas pra sempre
   *    a cada nova chamada. A ESCRITA final é idêntica nas duas leituras (uma
   *    entrega já limpa recebe os MESMOS valores null de novo — no-op); só a
   *    contagem/seleção fica mais precisa e resolve a contradição. Documentado
   *    aqui de propósito para o revisor conferir o raciocínio.
   *  - NÃO dispara WhatsApp/cobrança, NÃO cria DeletionRecord, NÃO toca
   *    comprovante nem FinanceiroCharge — este método só lê/escreve `Entrega`.
   *
   * LogisticaRoute — INVESTIGADO, DELIBERADAMENTE NÃO tocado. Cogitei marcar a
   * linha ACTIVE/PLANNED do dia como COMPLETED (terminal natural do enum) para
   * o app parar de ver routeStatus==='ACTIVE'. Descartado depois de ler
   * logistica-route-billing.service.ts e os dois reconciliadores
   * (logistica-offline-reservation-reconciler.service.ts,
   * logistica-offline-tracked-billing.service.ts):
   *   1) prepareRoute()/beginInitialization() tratam route.status==='COMPLETED'
   *      como TERMINAL: iniciarRota() SEGUINTE no mesmo dia (mesmo motorista)
   *      lança ConflictException('Esta rota já foi concluída e não pode ser
   *      iniciada novamente.') — incondicional, vale pra ESSENTIAL e TRACKED.
   *      Isso QUEBRARIA a exigência do próprio contrato ("retomada no mesmo
   *      dia re-planeja normal"): o motorista ficaria travado até o dia
   *      seguinte por causa da linha da ROTA, mesmo com as ENTREGAS já
   *      corretamente revertidas para pendência.
   *   2) Pro modo ESSENTIAL, reconcilePendingRefunds() (o reconciliador de
   *      estorno) só varre rotas com status PLANNED(stale)/INITIALIZING(lease
   *      vencida)/FAILED/REFUNDING — COMPLETED está fora do WHERE. Marcar
   *      COMPLETED NUNCA dispara estorno de bloco essencial já debitado
   *      (confirmado lendo o método linha a linha). Este modo, isolado, SERIA
   *      seguro.
   *   3) Pro modo TRACKED, logistica-offline-reservation-reconciler.service.ts
   *      varre justamente status==='COMPLETED' e devolve (refund) reservas por
   *      parada ainda DEBITED com lease vencida — comportamento INTENCIONAL do
   *      sistema (documentado no próprio logistica.module.ts: "O reconciliador
   *      devolve claims ainda DEBITED depois que a rota chega a COMPLETED"),
   *      não um bug. Não seria um erro financeiro em si (a parada revertida
   *      pra pendência não foi entregue SOB esta sessão — devolver o crédito
   *      reservado evita cobrar 2× quando for reentregue em rota nova), mas É
   *      um "caminho de refund atrelado à transição" que o contrato pede pra
   *      evitar.
   *   CONCLUSÃO: (1) + (3) descartam COMPLETED. Em vez do status de cobrança,
   *   marco um campo OPERACIONAL decoupled — `operationalEndedAt` (schema) — na
   *   linha ACTIVE/INITIALIZING do dia. As duas projeções de rota lidas pelo app
   *   (getOperationalRouteMetadata e logistica-admin-route-view) passam a reportar
   *   routeStatus NÃO-ativo quando esse campo está setado (e a admin-view para de
   *   promover a próxima parada pra em_rota). Assim o app enxerga a rota como
   *   encerrada SEM COMPLETED: nada de trava de reiniciar no mesmo dia, nada de
   *   reconciliador de estorno. `iniciarRota` zera o campo — a 2ª leva no mesmo
   *   dia (dono, 17/07: "posso sair de novo hoje") volta a aparecer ativa,
   *   reaproveitando a MESMA linha de cobrança ACTIVE (beginInitialization
   *   devolve alreadyActive=true, sem re-cobrar). Este método NÃO altera o
   *   `status`/cobrança da rota, só o campo operacional; NUNCA toca
   *   FinanceiroCharge, comprovante ou entrega 'entregue'.
   */
  async encerrarRota(
    companyId: number,
    input: EncerrarRotaInput = {},
    entregadorId?: number,
  ): Promise<EncerrarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const routeDate = canonicalRouteDate(input.date);

    const resumo = await this.prisma.$transaction(async (tx: any) => {
      // Mesmo escopo de "entregas do dia" que a lista principal usa (listRota,
      // logistica.service.ts): agendadas pro range do dia + as sem data mas
      // ainda abertas (perpétuas até serem tratadas). TODOS os status entram
      // aqui — preciso do total/entregues/naoEntregues, não só das abertas
      // (diferente de fetchParadasAbertas, que serve só o planejador).
      const rows: EncerrarRotaRow[] = await tx.entrega.findMany({
        where: {
          companyId,
          ...(entregadorId ? { entregadorId } : {}),
          OR: [
            { scheduledAt: { gte: start, lte: end } },
            { scheduledAt: null, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          ],
        },
        select: { id: true, status: true, rotaOrdem: true, etaAt: true, startedAt: true },
      });

      const total = rows.length;
      let entregues = 0;
      let naoEntregues = 0;
      const openIds: string[] = [];
      for (const row of rows) {
        if (row.status === 'entregue') { entregues++; continue; }
        if (row.status === 'cancelada') { naoEntregues++; continue; }
        if (row.status !== 'agendada' && row.status !== 'em_rota') continue; // defensivo: hoje só existem os 4 status do schema
        const estavaNaRota = row.status === 'em_rota' || row.rotaOrdem != null || row.etaAt != null || row.startedAt != null;
        if (estavaNaRota) openIds.push(row.id);
      }

      let pendentes = 0;
      if (openIds.length > 0) {
        // WHERE re-checa status (defesa extra dentro da própria transação) —
        // nunca sobrescreve uma entrega que virou 'entregue'/'cancelada' entre
        // a leitura acima e este update.
        const reverted = await tx.entrega.updateMany({
          where: { companyId, id: { in: openIds }, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          data: { status: 'agendada', rotaOrdem: null, etaAt: null, startedAt: null },
        });
        pendentes = reverted.count;
      }

      // Encerra a rota OPERACIONALMENTE (campo decoupled — ver comentário do
      // método): marca operationalEndedAt na linha viva do dia para o app parar
      // de ver routeStatus ativo. NÃO altera `status` de cobrança. Na MESMA
      // transação das entregas (tudo-ou-nada). Sem entregadorId, encerra as
      // rotas vivas de todos os motoristas da empresa no dia (mesmo escopo do
      // revert de entregas acima).
      await tx.logisticaRoute.updateMany({
        where: {
          companyId,
          routeDate,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: ['ACTIVE', 'INITIALIZING'] },
        },
        data: { operationalEndedAt: new Date() },
      });

      return { total, entregues, naoEntregues, pendentes };
    });

    this.logger.log(
      `[logistica] rota encerrada ${dayISO} company=${companyId}` +
        (entregadorId ? ` entregador=${entregadorId}` : '') +
        `: total=${resumo.total} entregues=${resumo.entregues} naoEntregues=${resumo.naoEntregues} pendentes=${resumo.pendentes}` +
        (input.motivo ? ` motivo="${String(input.motivo).slice(0, 200)}"` : ''),
    );

    return { ok: true, resumo };
  }

  // ── LIMPAR DIA (PR18072026 Onda 1) ───────────────────────────────────────────
  /**
   * "Limpar dia" — decisão do dono (18/07): CANCELA as entregas ABERTAS
   * (agendada/em_rota) do escopo do dia, transacional e tudo-ou-nada. Mesmo
   * escopo do encerrarRota (mesmo OR: range do dia + sem-data abertas), mas o
   * DESFECHO é diferente por design — aqui é para descartar o dia mesmo
   * (ex.: erro de geração, dia cancelado), não pausar para retomar depois:
   *
   *  - 'agendada'/'em_rota' do escopo → 'cancelada' (rotaOrdem/etaAt/startedAt
   *    limpos — não sobra rastro de rota numa entrega cancelada).
   *  - 'entregue'/'cancelada': NUNCA entram no WHERE de escrita — INTOCADAS.
   *  - FinanceiroCharge/comprovantes: NÃO tocados (este método só lê/escreve
   *    `Entrega` + o campo operacional decoupled de `LogisticaRoute`).
   *  - Encerra a rota OPERACIONALMENTE (operationalEndedAt, mesmo updateMany
   *    do encerrarRota) — o app para de ver a rota do dia como ativa.
   *
   * IDEMPOTENTE: 2ª chamada no mesmo dia não acha mais nenhuma aberta →
   * canceladas:0, sem erro.
   */
  async limparDia(
    companyId: number,
    input: EncerrarRotaInput = {},
    entregadorId?: number,
  ): Promise<LimparDiaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const routeDate = canonicalRouteDate(input.date);

    const resumo = await this.prisma.$transaction(async (tx: any) => {
      // Mesmo escopo "abertas do dia" do encerrarRota (range do dia + sem-data
      // abertas), já restrito por status — aqui CANCELA direto (sem o meio-termo
      // "estava mesmo na rota?" do encerrar: Limpar Dia descarta tudo que está
      // aberto no dia, planejado ou não).
      const canceladas = await tx.entrega.updateMany({
        where: {
          companyId,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
          OR: [
            { scheduledAt: { gte: start, lte: end } },
            { scheduledAt: null, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          ],
        },
        data: { status: 'cancelada', rotaOrdem: null, etaAt: null, startedAt: null },
      });

      // Encerra a rota OPERACIONALMENTE (campo decoupled — mesmo comentário do
      // encerrarRota): NÃO altera `status` de cobrança.
      await tx.logisticaRoute.updateMany({
        where: {
          companyId,
          routeDate,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: ['ACTIVE', 'INITIALIZING'] },
        },
        data: { operationalEndedAt: new Date() },
      });

      return { canceladas: canceladas.count };
    });

    this.logger.log(
      `[logistica] limpar-dia ${dayISO} company=${companyId}` +
        (entregadorId ? ` entregador=${entregadorId}` : '') +
        `: canceladas=${resumo.canceladas}` +
        (input.motivo ? ` motivo="${String(input.motivo).slice(0, 200)}"` : ''),
    );

    return { ok: true, resumo };
  }

  private async resolveSingleDriver(companyId: number, date?: string, deliveryIds?: string[]): Promise<number> {
    const { start, end } = resolveDayRange(date);
    const selectedIds = normalizeDeliveryIds(deliveryIds);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(selectedIds?.length ? { id: { in: selectedIds } } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { id: true, entregadorId: true },
    });
    const hasMissingSelection = Boolean(selectedIds?.length && rows.length !== selectedIds.length);
    const hasUnassigned = rows.some((row) => !Number.isInteger(row.entregadorId));
    const drivers = Array.from(
      new Set(rows.map((row) => row.entregadorId).filter((id): id is number => Number.isInteger(id))),
    );
    if (hasMissingSelection || hasUnassigned || drivers.length !== 1) {
      throw new BadRequestException('Atribua as entregas a exatamente um motorista antes de iniciar a rota.');
    }
    return drivers[0];
  }

  // ── RE-ETA (hook aditivo do confirmar/cancelar do N6) ────────────────────────
  /**
   * Recalcula etaAt das paradas RESTANTES (ainda abertas) do dia, SEM reordenar o
   * que já foi feito — só desloca o ETA cumulativo pra frente/trás conforme as
   * paradas que saíram da fila. Best-effort: chamado dentro de try/catch pelo N6,
   * qualquer erro aqui NÃO afeta o confirmar/cancelar.
   *
   * @param baseDate dia da entrega tocada (default: hoje) — a fatia de re-cálculo.
   */
  async recalcularEtaRestantes(companyId: number, baseDate?: Date, entregadorId?: number): Promise<{ recalculadas: number } | null> {
    if (!companyId) return null;
    const { start, end } = resolveDayRange(baseDate ? toDayISO(baseDate) : undefined);
    const config = await this.loadConfig(companyId);

    const rows = await this.fetchParadasAbertas(companyId, start, end, entregadorId);
    if (rows.length === 0) return { recalculadas: 0 };

    // NÃO reordena: mantém o rotaOrdem já gravado (o que já foi entregue saiu da
    // lista de abertas; a ordem relativa das restantes é preservada). Ordena pela
    // rotaOrdem atual (nulls por último) e refaz só o ETA cumulativo.
    const stops = rows.map((r) => toStop(r)).sort(compareByRotaOrdem);
    const partida = new Date();
    const withEta = computeEta(stops, {
      velocidadeKmH: config.velocidadeMediaKmH,
      paradaMin: config.tempoParadaMin,
      partida,
    });

    let recalculadas = 0;
    for (const p of withEta) {
      await this.prisma.entrega.update({ where: { id: p.id }, data: { etaAt: p.etaAt } });
      recalculadas++;
    }
    return { recalculadas };
  }

  // ── infra ────────────────────────────────────────────────────────────────────
  /**
   * Monta o fetcher do DEGRAU 1 (proxy) já com o `companyId` amarrado, ou
   * `undefined` se o serviço não foi injetado (teste sem Nest, ou módulo sem
   * o provider) — nesse caso planRouteByRoads pula direto pro degrau 2. Único
   * ponto de conversão Coord[]→string "lng,lat;…" que o proxy espera.
   */
  private osrmTableFetcher(companyId: number): ((coords: Coord[]) => Promise<OsrmTablePayload>) | undefined {
    if (!this.osrm) return undefined;
    const osrm = this.osrm;
    return async (coords: Coord[]) => {
      const coordsRaw = coords.map((c) => `${c.lng},${c.lat}`).join(';');
      return (await osrm.table(companyId, coordsRaw)) as OsrmTablePayload;
    };
  }

  private async loadConfig(companyId: number): Promise<{ velocidadeMediaKmH: number; tempoParadaMin: number }> {
    let cfg: { velocidadeMediaKmH: number; tempoParadaMin: number } | null = null;
    try {
      cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { velocidadeMediaKmH: true, tempoParadaMin: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    const velocidadeMediaKmH =
      cfg && cfg.velocidadeMediaKmH > 0 ? cfg.velocidadeMediaKmH : LogisticaRotaService.DEFAULT_VELOCIDADE_KMH;
    const tempoParadaMin =
      cfg && cfg.tempoParadaMin >= 0 ? cfg.tempoParadaMin : LogisticaRotaService.DEFAULT_PARADA_MIN;
    return { velocidadeMediaKmH, tempoParadaMin };
  }

  private async fetchParadasAbertas(companyId: number, start: Date, end: Date, entregadorId?: number, deliveryIds?: string[]): Promise<ParadaRow[]> {
    return this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        ...(deliveryIds?.length ? { id: { in: deliveryIds } } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        entregadorId: true,
        status: true,
        rotaOrdem: true,
        scheduledAt: true,
        // MULTILOCAL (11/07) — geo da PORTA da entrega: quando há um LOCAL, a rota
        // ordena pela coordenada DELE (cada endereço do cliente tem a sua). Sem o
        // local, todas as paradas do cliente cairiam no geo do principal e a rota
        // multi-local ordenaria pela porta errada. MESMO select/regra do listRota.
        local: { select: { apelido: true, lat: true, lng: true } },
        customerProfile: { select: { name: true, lat: true, lng: true } },
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MATEMÁTICA PURA (exportada e testável sem banco)
// ════════════════════════════════════════════════════════════════════════════

const EARTH_RADIUS_KM = 6371;

/** Uma parada roteável: id + coord (null quando o cliente não tem lat/lng). */
export interface Stop {
  id: string;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
  rotaOrdem?: number | null;
}

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * Haversine — distância em KM entre 2 pontos (lat/lng em graus). Pura.
 * Erro < 0.5% p/ distâncias urbanas; suficiente p/ heurística de rota.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Uma parada com coordenada garantida (lat/lng number). */
export type StopComCoord = Stop & { lat: number; lng: number };

/**
 * Só as paradas COM coordenada válida entram na roteirização. Predicado boolean
 * simples (não type-guard) — o guard geraria um tipo-complemento intratável no
 * ramo negativo (`{...s}` spread de tipo não-objeto). Onde o tipo estreito é
 * necessário, usamos filtrarComCoord.
 */
export function hasCoord(s: Stop): boolean {
  return (
    typeof s.lat === 'number' &&
    typeof s.lng === 'number' &&
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    Math.abs(s.lat) <= 90 &&
    Math.abs(s.lng) <= 180 &&
    !(s.lat === 0 && s.lng === 0)
  );
}

/** Filtra e ESTREITA para paradas com coord garantida (para NN/2-opt). */
export function filtrarComCoord(stops: Stop[]): StopComCoord[] {
  return stops.filter(hasCoord) as StopComCoord[];
}

/** Distância total (km) de uma sequência ordenada, a partir de uma origem. */
export function routeCostKm(order: Array<Stop & { lat: number; lng: number }>, origem?: Coord | null): number {
  if (order.length === 0) return 0;
  let total = 0;
  let prev: Coord = origem ?? { lat: order[0].lat, lng: order[0].lng };
  for (const s of order) {
    total += haversineKm(prev, { lat: s.lat, lng: s.lng });
    prev = { lat: s.lat, lng: s.lng };
  }
  return total;
}

/**
 * Nearest-neighbor: começa na origem (ou na 1ª parada se sem origem) e vai
 * sempre à parada mais próxima ainda não visitada. Heurística gulosa — a base
 * que o 2-opt refina. Pura.
 */
export function nearestNeighbor(
  stops: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
): Array<Stop & { lat: number; lng: number }> {
  const restantes = [...stops];
  const ordem: Array<Stop & { lat: number; lng: number }> = [];
  if (restantes.length === 0) return ordem;

  let atual: Coord;
  if (origem) {
    atual = origem;
  } else {
    // Sem origem: a 1ª parada da lista é o ponto de partida.
    const first = restantes.shift()!;
    ordem.push(first);
    atual = { lat: first.lat, lng: first.lng };
  }

  while (restantes.length > 0) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineKm(atual, { lat: restantes[i].lat, lng: restantes[i].lng });
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const escolhido = restantes.splice(melhorIdx, 1)[0];
    ordem.push(escolhido);
    atual = { lat: escolhido.lat, lng: escolhido.lng };
  }
  return ordem;
}

/**
 * 2-opt: parte de uma ordem inicial (ex.: NN) e reverte segmentos enquanto isso
 * REDUZIR o custo total (com a origem fixa). Converge para um ótimo local — nunca
 * PIORA a rota (garantia usada no teste: custo 2-opt ≤ custo NN). Pura.
 */
export function twoOpt(
  initial: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
  maxPasses = 30,
): Array<Stop & { lat: number; lng: number }> {
  if (initial.length < 4) return [...initial]; // < 4 paradas: 2-opt não muda nada
  let best = [...initial];
  let bestCost = routeCostKm(best, origem);
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        const cost = routeCostKm(candidate, origem);
        if (cost + 1e-9 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Reverte o segmento [i..k] (inclusive) da ordem — o movimento do 2-opt. */
function twoOptSwap<T>(order: T[], i: number, k: number): T[] {
  return [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
}

export interface EtaOptions {
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
}

/** Uma parada já com rotaOrdem e etaAt calculados. */
export interface PlannedStop extends Stop {
  rotaOrdem: number;
  etaAt: Date | null;
  semCoordenada: boolean;
}

/**
 * ETA cumulativo ao longo de uma sequência JÁ ORDENADA (respeita o rotaOrdem que
 * vier). Por parada: etaAt = partida + Σ (trajeto até ela + tempoParada das
 * anteriores). Trajeto = distância(prev→atual) / velocidade. A 1ª parada NÃO tem
 * origem conhecida aqui (é só o ETA relativo da sequência), então seu trajeto é 0
 * e o ETA é partida + tempoParada. Paradas sem coord recebem etaAt=null (não dá
 * pra estimar trajeto), mas mantêm o rotaOrdem. Pura.
 */
export function computeEta(stops: Stop[], opts: EtaOptions): PlannedStop[] {
  const velocidade = opts.velocidadeKmH > 0 ? opts.velocidadeKmH : 25;
  const paradaMin = opts.paradaMin >= 0 ? opts.paradaMin : 5;
  const out: PlannedStop[] = [];
  let acumuladoMin = 0;
  let prev: Coord | null = null;

  for (let idx = 0; idx < stops.length; idx++) {
    const s = stops[idx];
    const rotaOrdem = typeof s.rotaOrdem === 'number' ? s.rotaOrdem : idx;
    if (!hasCoord(s)) {
      // Sem coord: mantém a ordem, mas não estima ETA (null).
      out.push({ ...s, rotaOrdem, etaAt: null, semCoordenada: true });
      continue;
    }
    const cur: Coord = { lat: s.lat as number, lng: s.lng as number };
    // Trajeto desde a parada anterior COM coord (a 1ª não tem prev → 0).
    const trajetoKm = prev ? haversineKm(prev, cur) : 0;
    const trajetoMin = (trajetoKm / velocidade) * 60;
    acumuladoMin += trajetoMin + paradaMin; // chega + descarrega
    const etaAt = new Date(opts.partida.getTime() + acumuladoMin * 60_000);
    out.push({ ...s, rotaOrdem, etaAt, semCoordenada: false });
    prev = cur;
  }
  return out;
}

// S1 (25/07, PR25072026-ROTA-CONFERIDA) — CRACHÁ do motor de rota: fim do
// fallback Haversine mudo. `engine` diz qual matemática produziu o resultado;
// `degradedReason` só aparece quando o Haversine veio de FALHA de rede (Lei
// nº4 da frente: degradação nunca é silenciosa). Ordem manual também usa
// Haversine, mas por ESCOLHA do entregador — por isso planRouteManual nunca
// preenche degradedReason (é o sinal que o app usa pra NÃO soar o alarme).
export type RouteEngine = 'osrm' | 'haversine';

// timeout = abortou por tempo (8s direto / 9s embutido no proxy); rate_limit =
// disjuntor do proxy tripou (LogisticaOsrmService.consumeRate, 30/min/empresa);
// upstream = qualquer outra falha de rede/servidor/payload (inclui o próprio
// osrmUnavailable de logistica-osrm.service.ts, que já colapsa timeout+5xx
// nesse balde do lado do proxy); coords_invalidas = menos de 2 paradas com
// coordenada — nem dá pra montar matriz, então nem tenta OSRM.
export type RouteDegradedReason = 'timeout' | 'rate_limit' | 'upstream' | 'coords_invalidas';

/** Payload cru da matriz OSRM (mesma forma do proxy e do público direto). */
export interface OsrmTablePayload {
  code?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

export interface PlanRouteOptions {
  origem?: Coord | null;
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
  /**
   * DEGRAU 1 da cadeia de roteamento: fetcher do proxy interno já com o
   * companyId amarrado (injeção — mantém planRouteByRoads pura/testável sem
   * Nest; quem monta o fetcher é LogisticaRotaService.osrmTableFetcher).
   * Ausente, ou erro, ou payload inválido → cai pro degrau 2 (OSRM público
   * direto, o fetch de sempre).
   */
  osrmTable?: (coords: Coord[]) => Promise<OsrmTablePayload>;
}

export interface PlanRouteResult {
  paradas: PlannedStop[];
  distanciaTotalKm: number;
  terminoPrevisto: Date | null;
  /** Motor que produziu ESTE resultado — nunca implícito (Lei nº4). */
  engine: RouteEngine;
  /** Só presente quando `engine==='haversine'` por FALHA (nunca em ordem manual). */
  degradedReason?: RouteDegradedReason;
}

/**
 * PIPELINE COMPLETO (puro): separa com/sem coord → NN → 2-opt → rotaOrdem 0..N
 * (roteáveis primeiro, sem-coord no fim) → ETA cumulativo → término previsto.
 */
export function planRoute(stops: Stop[], opts: PlanRouteOptions): PlanRouteResult {
  const comCoord = filtrarComCoord(stops);
  const semCoord = stops.filter((s) => !hasCoord(s));

  // Ordena os roteáveis: NN a partir da origem + refino 2-opt.
  const nn = nearestNeighbor(comCoord, opts.origem);
  const otimizado = twoOpt(nn, opts.origem);

  // rotaOrdem: 0..M-1 para os roteáveis (na ordem otimizada), depois os sem-coord.
  const ordenados: Stop[] = [
    ...otimizado.map((s, i) => ({ ...s, rotaOrdem: i })),
    ...semCoord.map((s, i) => ({ ...s, rotaOrdem: otimizado.length + i })),
  ];

  const paradas = computeEta(ordenados, {
    velocidadeKmH: opts.velocidadeKmH,
    paradaMin: opts.paradaMin,
    partida: opts.partida,
  });

  const distanciaTotalKm = routeCostKm(otimizado, opts.origem);
  // Término = etaAt da última parada COM coord (as sem-coord não têm ETA).
  const comEta = paradas.filter((p) => p.etaAt != null);
  const terminoPrevisto = comEta.length > 0 ? comEta[comEta.length - 1].etaAt : null;

  return { paradas, distanciaTotalKm, terminoPrevisto, engine: 'haversine' };
}

/**
 * PR18072026 — pipeline da ORDEM MANUAL: nada de NN/2-opt/OSRM. `ordemManual`
 * dita a ordem ao pé da letra — só as paradas que EXISTEM no conjunto aberto
 * (`stops`) entram, na ordem dada (1ª ocorrência de um id repetido vence, as
 * demais são ignoradas); tudo que sobrar (fora da lista OU fora do conjunto
 * aberto) vai pro FIM, na ordem natural em que `stops` chegou (já vem
 * pré-ordenado pelo fetch: rotaOrdem→scheduledAt→createdAt). ETA cumulativo
 * pela MESMA `computeEta` — mesma velocidade/tempo de parada do caminho
 * automático; só a ORDEM de entrada muda.
 */
export function planRouteManual(stops: Stop[], ordemManual: string[], opts: PlanRouteOptions): PlanRouteResult {
  const byId = new Map(stops.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  const manualOrdered: Stop[] = [];
  for (const id of ordemManual) {
    if (seen.has(id)) continue;
    const stop = byId.get(id);
    if (!stop) continue; // fora do conjunto aberto do dia/motorista — ignorado
    manualOrdered.push(stop);
    seen.add(id);
  }
  const resto = stops.filter((s) => !seen.has(s.id));
  const ordenados: Stop[] = [...manualOrdered, ...resto].map((s, i) => ({ ...s, rotaOrdem: i }));

  const paradas = computeEta(ordenados, {
    velocidadeKmH: opts.velocidadeKmH,
    paradaMin: opts.paradaMin,
    partida: opts.partida,
  });

  const distanciaTotalKm = routeCostKm(filtrarComCoord(ordenados), opts.origem);
  const comEta = paradas.filter((p) => p.etaAt != null);
  const terminoPrevisto = comEta.length > 0 ? comEta[comEta.length - 1].etaAt : null;

  // Ordem manual não usa matriz (nem proxy nem público) — o cálculo de ETA é
  // SEMPRE Haversine (mesma computeEta do automático), mas isso é ESCOLHA do
  // entregador, não degradação de rede: degradedReason fica de fora de
  // propósito (é a ausência que o app usa pra NÃO soar o alarme amarelo).
  return { paradas, distanciaTotalKm, terminoPrevisto, engine: 'haversine' };
}

/**
 * Classifica o erro de uma tentativa OSRM (proxy ou público) no motivo do
 * crachá de degradação. `AbortError` = o próprio timeout local abortou (8s
 * direto / 9s embutido no proxy); status 429 = disjuntor do proxy tripou
 * (LogisticaOsrmService.consumeRate); qualquer outra coisa (rede caída, 5xx,
 * JSON quebrado, matriz com forma errada) cai em 'upstream' — mesmo balde que
 * o próprio proxy já usa pro erro genérico dele (osrmUnavailable).
 */
function classifyOsrmError(error: unknown): RouteDegradedReason {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  const status = typeof (error as any)?.getStatus === 'function' ? (error as any).getStatus() : (error as any)?.status;
  return status === 429 ? 'rate_limit' : 'upstream';
}

/**
 * Monta o resultado (sem `engine` — quem tagueia é o chamador) a partir de um
 * payload de matriz OSRM. Extraído do corpo de planRouteByRoads (S1,
 * PR25072026-ROTA-CONFERIDA) pra ser reusado nos 2 degraus que podem produzir
 * uma matriz usável (proxy e público) sem duplicar parse/ordenação/ETA.
 * `null` = payload ausente/código != Ok/forma errada → o chamador decide se
 * tenta o PRÓXIMO degrau ou já reporta o motivo.
 */
function buildRoadPlan(
  payload: OsrmTablePayload | null | undefined,
  stops: Stop[],
  valid: StopComCoord[],
  coordinates: Coord[],
  opts: PlanRouteOptions,
  hasOrigin: boolean,
): { paradas: PlannedStop[]; distanciaTotalKm: number; terminoPrevisto: Date | null } | null {
  if (
    !payload ||
    payload.code !== 'Ok' ||
    !matrixIsUsable(payload.durations, coordinates.length) ||
    !matrixIsUsable(payload.distances, coordinates.length)
  ) {
    return null;
  }

  const offset = hasOrigin ? 1 : 0;
  const order = greedyRoadOrder(valid.length, payload.durations!, offset, hasOrigin);
  const improved = improveRoadOrder(order, payload.durations!, offset, hasOrigin);
  const orderedValid = improved.map((index) => valid[index]);
  const invalid = stops.filter((stop) => !hasCoord(stop));
  const ordered: Stop[] = [...orderedValid, ...invalid].map((stop, index) => ({ ...stop, rotaOrdem: index }));

  let elapsedMinutes = 0;
  let distanceMeters = 0;
  let previousMatrixIndex = hasOrigin ? 0 : null;
  const paradas: PlannedStop[] = ordered.map((stop, index) => {
    if (!hasCoord(stop)) return { ...stop, rotaOrdem: index, etaAt: null, semCoordenada: true };
    const validIndex = valid.findIndex((candidate) => candidate.id === stop.id);
    const matrixIndex = validIndex + offset;
    if (previousMatrixIndex != null) {
      elapsedMinutes += Number(payload.durations![previousMatrixIndex][matrixIndex] || 0) / 60;
      distanceMeters += Number(payload.distances![previousMatrixIndex][matrixIndex] || 0);
    }
    elapsedMinutes += Math.max(0, opts.paradaMin);
    previousMatrixIndex = matrixIndex;
    return { ...stop, rotaOrdem: index, etaAt: new Date(opts.partida.getTime() + elapsedMinutes * 60_000), semCoordenada: false };
  });
  const withEta = paradas.filter((stop) => stop.etaAt != null);
  return { paradas, distanciaTotalKm: distanceMeters / 1_000, terminoPrevisto: withEta.at(-1)?.etaAt ?? null };
}

/**
 * Planejamento real por ruas — CADEIA DE 3 DEGRAUS (S1, 25/07,
 * PR25072026-ROTA-CONFERIDA — fim do fallback Haversine mudo):
 *   1) proxy interno (`opts.osrmTable`, wiring = LogisticaRotaService.osrmTableFetcher
 *      → LogisticaOsrmService.table: cache 10min + rate-limit 30/min/empresa);
 *   2) OSRM público direto (fetch de sempre, mesma URL/timeout de sempre);
 *   3) Haversine (matemática pura, nunca falha).
 * Cada degrau só é tentado se o anterior não devolveu uma matriz usável — o
 * proxy NUNCA vira ponto único de falha (mesmo princípio do próprio serviço).
 * O resultado carrega `engine` sempre e, quando caiu pro Haversine por FALHA
 * (nunca por ordem manual — essa não passa por aqui), `degradedReason`
 * explica o porquê (Lei nº4 da frente: degradação nunca é silenciosa).
 */
export async function planRouteByRoads(stops: Stop[], opts: PlanRouteOptions): Promise<PlanRouteResult> {
  const valid = filtrarComCoord(stops);
  // Menos de 2 paradas com coordenada: não dá pra montar matriz (mínimo 2
  // pontos). O motivo é o DADO, não a rede — nem tenta OSRM à toa, já sai
  // com o crachá certo.
  if (valid.length < 2) return { ...planRoute(stops, opts), degradedReason: 'coords_invalidas' };

  const hasOrigin = !!opts.origem && Number.isFinite(opts.origem.lat) && Number.isFinite(opts.origem.lng) && Math.abs(opts.origem.lat) <= 90 && Math.abs(opts.origem.lng) <= 180 && !(opts.origem.lat === 0 && opts.origem.lng === 0);
  const coordinates: Coord[] = [...(hasOrigin ? [opts.origem as Coord] : []), ...valid.map((stop) => ({ lat: stop.lat, lng: stop.lng }))];

  // DEGRAU 1 — proxy interno. Guarda o motivo só pra reportar CASO o degrau 2
  // também falhe: rate_limit é o sinal mais específico/acionável (disjuntor
  // do proxy tripou); qualquer outro erro daqui é redundante com o que quer
  // que trave o degrau 2 (que é sempre o ÚLTIMO tentado antes do Haversine).
  let proxyReason: RouteDegradedReason | null = null;
  if (opts.osrmTable) {
    try {
      const payload = await opts.osrmTable(coordinates);
      const built = buildRoadPlan(payload, stops, valid, coordinates, opts, hasOrigin);
      if (built) return { ...built, engine: 'osrm' };
      proxyReason = 'upstream'; // respondeu, mas payload/código inválido
    } catch (error) {
      proxyReason = classifyOsrmError(error);
    }
  }

  // DEGRAU 2 — OSRM público direto (fetch de sempre; timeout 8s preservado).
  const encoded = coordinates.map((point) => `${point.lng},${point.lat}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${encoded}?annotations=duration,distance`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HBX-Logistica/1.0' },
    });
    if (!response.ok) throw new Error(`OSRM table HTTP ${response.status}`);
    const payload = await response.json() as OsrmTablePayload;
    const built = buildRoadPlan(payload, stops, valid, coordinates, opts, hasOrigin);
    if (!built) throw new Error(`OSRM table inválida (${payload.code || 'sem código'})`);
    return { ...built, engine: 'osrm' };
  } catch (error) {
    // DEGRAU 3 — Haversine. rate_limit do proxy (degrau 1) é mais específico
    // quando presente; senão o motivo é o que travou aqui mesmo.
    const degradedReason = proxyReason === 'rate_limit' ? 'rate_limit' : classifyOsrmError(error);
    return { ...planRoute(stops, opts), degradedReason };
  } finally {
    clearTimeout(timeout);
  }
}

function matrixIsUsable(matrix: Array<Array<number | null>> | undefined, size: number): boolean {
  return Array.isArray(matrix) && matrix.length === size && matrix.every((row) => Array.isArray(row) && row.length === size);
}

function roadPathCost(order: number[], matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number {
  let current = hasOrigin ? 0 : order[0] + offset;
  let cost = 0;
  for (let position = hasOrigin ? 0 : 1; position < order.length; position++) {
    const next = order[position] + offset;
    const leg = matrix[current]?.[next];
    if (leg == null || !Number.isFinite(leg)) return Number.POSITIVE_INFINITY;
    cost += leg;
    current = next;
  }
  return cost;
}

function greedyRoadOrder(count: number, matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number[] {
  const remaining = new Set(Array.from({ length: count }, (_, index) => index));
  const order: number[] = [];
  let current = hasOrigin ? 0 : offset;
  if (!hasOrigin) { order.push(0); remaining.delete(0); }
  while (remaining.size) {
    let best = -1; let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of remaining) {
      const cost = matrix[current]?.[candidate + offset];
      if (cost != null && Number.isFinite(cost) && cost < bestCost) { best = candidate; bestCost = cost; }
    }
    if (best < 0) best = remaining.values().next().value;
    order.push(best); remaining.delete(best); current = best + offset;
  }
  return order;
}

function improveRoadOrder(order: number[], matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number[] {
  let best = [...order]; let bestCost = roadPathCost(best, matrix, offset, hasOrigin);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let from = hasOrigin ? 0 : 1; from < best.length - 1; from++) {
      for (let to = from + 1; to < best.length; to++) {
        const candidate = [...best.slice(0, from), ...best.slice(from, to + 1).reverse(), ...best.slice(to + 1)];
        const cost = roadPathCost(candidate, matrix, offset, hasOrigin);
        if (cost + 0.5 < bestCost) { best = candidate; bestCost = cost; changed = true; }
      }
    }
    if (!changed) break;
  }
  return best;
}

// ── helpers de mapeamento / data ────────────────────────────────────────────────
function toStop(r: ParadaRow): Stop {
  // MULTILOCAL (11/07) — PREFERE o geo do LOCAL quando a entrega tem um (cada porta
  // tem sua coordenada); senão cai no perfil (legado). MESMA regra que o listRota
  // aplica. FIX (25/07) — o local só vale como fonte se tiver lat E lng válidos;
  // antes bastava o OBJETO `local` existir (mesmo sem coordenada, caso dos ~824
  // registros que o backfill do freio de geocode deixou null de propósito) para
  // descartar um pino BOM do perfil. `resolverCoordenadaMultilocal` também garante
  // que lat/lng nunca vêm de fontes diferentes (nunca combina local.lat+perfil.lng).
  const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
  return {
    id: r.id,
    lat: coord.lat,
    lng: coord.lng,
    status: r.status,
    // Rótulo da parada: apelido do local ("Casa"|"Loja") quando presente, senão o nome do cliente.
    nome: r.local?.apelido ?? r.customerProfile?.name ?? null,
    rotaOrdem: r.rotaOrdem ?? null,
  };
}

function compareByRotaOrdem(a: Stop, b: Stop): number {
  const ao = typeof a.rotaOrdem === 'number' ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.rotaOrdem === 'number' ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
  return ao - bo;
}

function coordFromInput(lat?: number | null, lng?: number | null): Coord | null {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
    return { lat, lng };
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// NOTA (BUG 5, 11/07): esta resolveDayRange é DUPLICADA em logistica.service.ts —
// mesma forma, cada uma com sua própria parseDateOrNull local. Não deduplicado
// agora (fora do escopo do fix); só mantidas as duas em paridade.
export function resolveDayRange(dateInput?: string): { start: Date; end: Date; dayISO: string } {
  const base = parseDateOrNull(dateInput) ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end, dayISO: toDayISO(start) };
}

function toDayISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD" puro é lido no fuso LOCAL (mesmo cuidado do M2: em Brasília -3,
  // o parse UTC escorregaria pro dia anterior).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
    // FIX (BUG 5, 11/07) — round-trip: sem isso, "2026-02-30" (30 de fevereiro,
    // impossível mas bem-formada) fazia overflow silencioso pro dia 02/mar em vez
    // de cair pra HOJE como já acontecia com "abc"/"2026-13-45" — inconsistente.
    // Se o Date construído não bate com y/mo/day pedidos, é rollover → inválida.
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
interface ParadaRow {
  id: string;
  entregadorId: number | null;
  status: string;
  rotaOrdem: number | null;
  scheduledAt: Date | null;
  // MULTILOCAL (11/07) — o LOCAL da entrega (null = perfil/legado); seu geo tem
  // prioridade sobre o do perfil na roteirização.
  local: { apelido: string | null; lat: number | null; lng: number | null } | null;
  customerProfile: { name: string | null; lat: number | null; lng: number | null } | null;
}

// ── ENCERRAR ROTA (PR17072026 Onda 1) — shape mínimo lido por linha ──────────
interface EncerrarRotaRow {
  id: string;
  status: string;
  rotaOrdem: number | null;
  etaAt: Date | null;
  startedAt: Date | null;
}

export interface PlanejarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
  startAt?: string; // hora de partida (default: agora) — usado no cálculo do ETA
  // PR18072026 — ids das entregas na ordem que o entregador arrastou na tela
  // ("Minha ordem"). Presentes = ordem dada; ausentes/fora do conjunto aberto
  // do dia/motorista = apêndice no fim (ordem natural do fetch). Pula NN+2-opt.
  ordemManual?: string[];
}

export interface IniciarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
  ordemManual?: string[];
}

// ── ENCERRAR ROTA (PR17072026 Onda 1) ────────────────────────────────────────
export interface EncerrarRotaInput {
  date?: string;
  motivo?: string;
}

export interface EncerrarRotaResumo {
  total: number;
  entregues: number;
  naoEntregues: number;
  pendentes: number;
}

export interface EncerrarRotaResult {
  ok: true;
  resumo: EncerrarRotaResumo;
}

// ── LIMPAR DIA (PR18072026 Onda 1) ────────────────────────────────────────────
export interface LimparDiaResumo {
  canceladas: number;
}

export interface LimparDiaResult {
  ok: true;
  resumo: LimparDiaResumo;
}

function normalizeDeliveryIds(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.map(id => String(id || '').trim()).filter(id => id.length > 0 && id.length <= 80))].slice(0, 300);
  return ids.length ? ids : undefined;
}

// PR18072026 — mesma normalização de normalizeDeliveryIds (trim + tamanho +
// teto), mas SEM dedupe/Set: planRouteManual precisa da ORDEM original dada
// pelo app (o Set do normalizeDeliveryIds embaralharia a ordem de inserção
// em runtimes que não preservam string keys — mais seguro nunca depender
// disso aqui). O dedupe acontece em planRouteManual (1ª ocorrência vence).
function normalizeOrdemManual(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((id) => String(id || '').trim())
    .filter((id) => id.length > 0 && id.length <= 80)
    .slice(0, 500);
  return ids.length ? ids : undefined;
}

export interface PlanejarRotaParada {
  id: string;
  rotaOrdem: number;
  etaAt: string | null;
  semCoordenada: boolean;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
}

export interface PlanejarRotaResult {
  date: string;
  total: number;
  semCoordenada: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  // S1 (25/07, PR25072026-ROTA-CONFERIDA) — crachá do motor, aditivo (campos
  // acima intocados). engine sempre presente; degradedReason só quando o
  // Haversine veio de falha real (nunca em ordem manual). Ver PlanRouteResult.
  engine: RouteEngine;
  degradedReason?: RouteDegradedReason;
  paradas: PlanejarRotaParada[];
  routeId?: string | null;
  trackingRequired?: boolean;
  routeMode?: 'ESSENTIAL' | 'TRACKED' | null;
  routeStatus?: string | null;
  trackingSessionId?: string | null;
  trackingStatus?: string | null;
}
