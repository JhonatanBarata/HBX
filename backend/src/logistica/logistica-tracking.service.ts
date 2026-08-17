import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MobileDevicePresenceService, type AuthenticatedMobileDevice } from '../auth/mobile-device-presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaConfigService } from './logistica-config.service';
import type {
  BatchLogisticaTrackingPointsDto,
  CurrentLogisticaTrackingSessionDto,
  LogisticaTrackingPointDto,
  LogisticaTrackingSessionEventDto,
  StartLogisticaTrackingSessionDto,
} from './dto/logistica-tracking.dto';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';
import { lockLogisticaRouteTransaction } from './logistica-route-lock';
import { TRACKING_CONFLICT, conflitoRastreamento } from './logistica-tracking.conflitos';

const MAX_POINT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
const MAX_ACCURACY_M = 100;
const MAX_REPORTED_SPEED_MPS = 70;
const MAX_DERIVED_SPEED_MPS = 60;
const LIVE_SIGNAL_WINDOW_MS = 90 * 1000;
const STOPPED_SPEED_MPS = 0.8;
const MAX_TIMELINE_POINTS = 20_000;

type PointRejectionCode =
  | 'DUPLICATE_CONFLICT'
  | 'INVALID_COORDINATES'
  | 'INVALID_ACCURACY'
  | 'INVALID_SPEED'
  | 'INVALID_BEARING'
  | 'INVALID_CAPTURED_AT'
  | 'POINT_TOO_OLD'
  | 'POINT_IN_FUTURE'
  | 'BEFORE_SESSION'
  | 'AFTER_SESSION'
  | 'SESSION_ENDED'
  | 'DELIVERY_REQUIRED'
  | 'DELIVERY_OUTSIDE_ROUTE'
  | 'IMPOSSIBLE_JUMP';

type NormalizedPoint = {
  clientPointId: string;
  sequence: number;
  capturedAt: Date;
  latitude: number;
  longitude: number;
  accuracyM: number;
  speedMps: number | null;
  bearingDeg: number | null;
  eventType: string;
  deliveryId: string | null;
};

type TimelinePoint = Pick<
  NormalizedPoint,
  'sequence' | 'capturedAt' | 'latitude' | 'longitude' | 'accuracyM'
>;

type TrackingSessionAuthority = {
  sessionStatus: 'ACTIVE' | 'ENDED' | 'MISSING';
  routeActive: boolean;
  captureAllowed: boolean;
};

export type OperationalRouteMetadata = {
  routeId: string | null;
  trackingRequired: boolean;
  routeStatus: string | null;
  trackingSessionId: string | null;
  trackingStatus: string | null;
  /** Exclusivo de respostas administrativas; ausente no contrato do motorista. */
  routeMode?: 'ESSENTIAL' | 'TRACKED' | null;
};

@Injectable()
export class LogisticaTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mobileDevices: MobileDevicePresenceService,
    // F3 FULL-POLIDO (27/07) — getLive() expõe o nível do plano pro painel
    // admin gatear "onde está meu caminhão" (.plano-selo quando < FULL). Default
    // preserva o único teste legado que instancia com 2 args
    // (logistica-tracking.service.test.ts); no módulo Nest o provider é sempre
    // injetado. Import de LogisticaConfigService é LEITURA (getNivel já existe,
    // F1) — este worker não edita logistica-config.service.ts.
    private readonly config: LogisticaConfigService = null as any,
  ) {}

  /**
   * Parte transacional da inicialização web: a sessão já nasce no início da
   * rota TRACKED, mas sem escolher aparelho. O primeiro device do próprio
   * motorista faz um CAS em /sessions/start; depois o vínculo fica congelado.
   *
   * 🔴 SESSÃO MORTA NUNCA VOLTA COMO SESSÃO DO TURNO (16/08, LOTE 1.6 — a
   * guarda "suspensório" do furo grave do lote 1.5; o "cinto" é o carimbo da
   * rota órfã, em `logistica-rota-continuidade.service.ts`). Aqui a linha
   * existente era devolvida **sem olhar o status**: medido em bancada, rota
   * ACTIVE + sessão ENDED devolvia a ENDED, o Iniciar seguia feliz, e todo
   * ponto de GPS passava a voltar `SESSION_ENDED` — código que não tem UMA
   * linha de tratamento no app. Rastreamento morto e calado, num recurso que a
   * empresa PAGA.
   *
   * O schema tem `@@unique([routeId, companyId])`: **não existe 2ª sessão pra
   * mesma rota**. Então "abrir sessão nova" aqui só pode significar uma coisa
   * honesta — quem já morreu é a ROTA. Ela é carimbada como encerrada (assim o
   * próximo `claimLogisticaRoute` NASCE numa linha nova, com sessão nova) e o
   * Iniciar falha ALTO, com 409 humano. Não é beco: o toque seguinte funciona
   * — e é o oposto exato do defeito, que era sair VERDE sem rastrear nada.
   * Ressuscitar a sessão ENDED nunca esteve em jogo: a trilha, o aparelho
   * vinculado e a autoria dela são da saída ANTERIOR.
   */
  async ensureSessionForStartedRoute(
    companyId: number,
    routeIdInput: string,
    startedAt: Date,
  ): Promise<any | null> {
    const routeId = String(routeIdInput || '').trim();
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        companyId,
        id: routeId,
        mode: 'TRACKED',
        // ROTA v2 F3 matou o INITIALIZING: o iniciar cria a sessão com a rota
        // ainda PLANNED (de propósito, antes de ativar). Sem o PLANNED aqui,
        // toda rota TRACKED nova morria com 500 no Iniciar (11/08/2026).
        status: { in: ['PLANNED', 'INITIALIZING', 'ACTIVE'] },
      },
      select: { id: true, entregadorId: true, startedAt: true },
    });
    if (!route) return null;
    await this.assertTrackingWriteEnabled(companyId);

    const existing = await (this.prisma as any).logisticaTrackingSession.findFirst({
      where: { companyId, routeId: route.id },
    });
    if (existing) return this.somenteSessaoViva(companyId, route.id, existing);

    try {
      return await (this.prisma as any).logisticaTrackingSession.create({
        data: {
          companyId,
          routeId: route.id,
          entregadorId: route.entregadorId,
          status: 'ACTIVE',
          startedAt: route.startedAt ?? startedAt,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await (this.prisma as any).logisticaTrackingSession.findFirst({
        where: { companyId, routeId: route.id },
      });
      // A vencedora da corrida passa pela MESMA peneira: uma linha que já
      // nasceu (ou virou) não-ACTIVE não pode entrar por esta porta lateral.
      if (winner) return this.somenteSessaoViva(companyId, route.id, winner);
      throw error;
    }
  }

  /**
   * LOTE 1.6 — a peneira única de `ensureSessionForStartedRoute`: sessão ACTIVE
   * passa; qualquer outro estado é execução encerrada disfarçada de viva.
   * Nesse caso a ROTA é carimbada (`operationalEndedAt`) — é o carimbo que faz
   * o próximo `claimLogisticaRoute` ignorá-la (o `where` dele exige carimbo
   * nulo) e nascer numa linha nova, com sessão nova. Sem ele o erro se
   * repetiria a cada toque, PARA SEMPRE, e o escape viraria beco. O carimbo é
   * best-effort de propósito: o 409 honesto vale mais, e uma falha de banco
   * aqui não pode virar 500 na cara do motorista.
   */
  private async somenteSessaoViva(companyId: number, routeId: string, sessao: any): Promise<any> {
    if (String(sessao?.status || '').toUpperCase() === 'ACTIVE') return sessao;
    try {
      await (this.prisma as any).logisticaRoute.updateMany({
        where: { companyId, id: routeId, operationalEndedAt: null },
        data: { operationalEndedAt: new Date() },
      });
    } catch (_) { /* o 409 abaixo já conta a verdade ao app */ }
    throw conflitoRastreamento(
      TRACKING_CONFLICT.SESSAO_ENCERRADA,
      'A execução anterior desta rota já foi encerrada. Toque em Iniciar de novo para abrir uma nova.',
    );
  }

  async discardUnboundSessionAfterRouteFailure(companyId: number, routeIdInput: string): Promise<void> {
    const routeId = String(routeIdInput || '').trim();
    await (this.prisma as any).logisticaTrackingSession.deleteMany({
      where: {
        companyId,
        routeId,
        deviceId: null,
        hasValidPositions: false,
      },
    });
  }

  async startSession(dto: StartLogisticaTrackingSessionDto) {
    const device = await this.authenticateTrackingDevice(dto);
    await this.assertTrackingWriteEnabled(device.companyId);
    const route = await this.resolveActiveTrackedRoute(device, dto.routeId);
    let session = await (this.prisma as any).logisticaTrackingSession.findFirst({
      where: { companyId: device.companyId, routeId: route.id },
    });
    if (!session) {
      // Reparo idempotente para deploy/restart entre ativar a rota e persistir a
      // sessão. Continua preso à rota TRACKED ACTIVE e ao motorista autenticado.
      session = await this.ensureSessionForStartedRoute(
        device.companyId,
        route.id,
        route.startedAt ?? new Date(),
      );
    }
    if (!session) {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.SESSAO_NAO_INICIALIZADA,
        'A sessão desta rota ainda não foi inicializada.',
      );
    }

    const replayed = session.deviceId === device.id;
    if (session.deviceId && session.deviceId !== device.id) {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.APARELHO_TROCADO,
        'Esta rota já está vinculada a outro aparelho.',
      );
    }

    if (!session.deviceId) {
      const boundAt = new Date();
      const claimed = await (this.prisma as any).logisticaTrackingSession.updateMany({
        where: {
          companyId: device.companyId,
          id: session.id,
          routeId: route.id,
          entregadorId: device.userId,
          status: 'ACTIVE',
          deviceId: null,
        },
        data: { deviceId: device.id, deviceBoundAt: boundAt },
      });
      session = await (this.prisma as any).logisticaTrackingSession.findFirst({
        where: { companyId: device.companyId, id: session.id },
      });
      if (!session || (claimed.count !== 1 && session.deviceId !== device.id)) {
        throw conflitoRastreamento(
          TRACKING_CONFLICT.APARELHO_TROCADO,
          'Outro aparelho vinculou esta rota primeiro.',
        );
      }
    }

    let initialPointResult: any = null;
    if (dto.initialPoint) {
      initialPointResult = await this.ingestBoundPositions(
        device,
        session,
        [dto.initialPoint],
        new Date(),
      );
    }

    const authority = await this.getSessionAuthority(
      this.prisma,
      device.companyId,
      session.id,
      device.id,
    );
    return {
      ok: true,
      replayed,
      session: serializeMobileSession(session),
      ...(initialPointResult ? { initialPointResult } : {}),
      ...authority,
    };
  }

  async currentSession(dto: CurrentLogisticaTrackingSessionDto) {
    const device = await this.authenticateTrackingDevice(dto);
    await this.assertTrackingWriteEnabled(device.companyId);
    const session = await (this.prisma as any).logisticaTrackingSession.findFirst({
      where: {
        companyId: device.companyId,
        entregadorId: device.userId,
        deviceId: device.id,
        status: 'ACTIVE',
        route: { mode: 'TRACKED', status: 'ACTIVE' },
      },
      orderBy: { startedAt: 'desc' },
    });
    const authority = session
      ? await this.getSessionAuthority(this.prisma, device.companyId, session.id, device.id)
      : missingSessionAuthority();
    return { ok: true, session: session ? serializeMobileSession(session) : null, ...authority };
  }

  async ingestPositions(sessionIdInput: string, dto: BatchLogisticaTrackingPointsDto) {
    const device = await this.authenticateTrackingDevice(dto);
    await this.assertTrackingWriteEnabled(device.companyId);
    const session = await this.loadBoundSession(device, sessionIdInput, { allowEnded: true });
    const result = await this.ingestBoundPositions(device, session, dto.points, new Date());
    const authority = await this.getSessionAuthority(
      this.prisma,
      device.companyId,
      session.id,
      device.id,
    );
    return { ...result, ...authority };
  }

  private async ingestBoundPositions(
    device: AuthenticatedMobileDevice,
    session: any,
    pointsInput: LogisticaTrackingPointDto[],
    now: Date,
    db: any = this.prisma,
    routeAlreadyLocked = false,
  ) {
    const accepted: string[] = [];
    const duplicates: string[] = [];
    const rejected: Array<{ clientPointId: string; code: PointRejectionCode }> = [];
    const replayPoints: NormalizedPoint[] = [];
    const points = pointsInput.map(normalizePoint);
    const pointIds = Array.from(new Set(points.map((point) => point.clientPointId)));
    const sequences = Array.from(new Set(points.map((point) => point.sequence)));

    const persistedConflicts = await db.logisticaTrackingPoint.findMany({
      where: {
        companyId: device.companyId,
        sessionId: session.id,
        OR: [
          { clientPointId: { in: pointIds } },
          { sequence: { in: sequences } },
        ],
      },
      select: {
        clientPointId: true,
        sequence: true,
        capturedAt: true,
        latitude: true,
        longitude: true,
        accuracyM: true,
        speedMps: true,
        bearingDeg: true,
        eventType: true,
        deliveryId: true,
      },
    });
    const existingById = new Map(persistedConflicts.map((row: any) => [row.clientPointId, row]));
    const existingBySequence = new Map(persistedConflicts.map((row: any) => [row.sequence, row]));
    const executionEnded = session.status !== 'ACTIVE' || session.route?.operationalEndedAt != null;

    const deliveryIds = Array.from(new Set(points.map((point) => point.deliveryId).filter(Boolean))) as string[];
    const routeDeliveries = deliveryIds.length
      ? await db.logisticaRouteStop.findMany({
          where: {
            companyId: device.companyId,
            routeId: session.routeId,
            deliveryId: { in: deliveryIds },
          },
          select: { deliveryId: true },
        })
      : [];
    const allowedDeliveries = new Set<string>(
      routeDeliveries.map((row: any) => String(row.deliveryId)),
    );

    const timeline: TimelinePoint[] = (await db.logisticaTrackingPoint.findMany({
      where: {
        companyId: device.companyId,
        sessionId: session.id,
        capturedAt: { gte: new Date(now.getTime() - MAX_POINT_AGE_MS - 60 * 60 * 1000) },
      },
      orderBy: [{ capturedAt: 'asc' }, { sequence: 'asc' }],
      take: MAX_TIMELINE_POINTS,
      select: {
        sequence: true,
        capturedAt: true,
        latitude: true,
        longitude: true,
        accuracyM: true,
      },
    })) as TimelinePoint[];

    const seenById = new Map<string, NormalizedPoint>();
    const seenBySequence = new Map<number, NormalizedPoint>();
    const candidates: NormalizedPoint[] = [];
    const ordered = [...points].sort(compareNormalizedPoints);

    for (const point of ordered) {
      const persisted = existingById.get(point.clientPointId) || existingBySequence.get(point.sequence);
      if (persisted) {
        if (samePersistedPoint(persisted, point)) {
          duplicates.push(point.clientPointId);
          replayPoints.push(point);
        }
        else rejected.push({ clientPointId: point.clientPointId, code: 'DUPLICATE_CONFLICT' });
        continue;
      }
      if (executionEnded) {
        rejected.push({ clientPointId: point.clientPointId, code: 'SESSION_ENDED' });
        continue;
      }
      const seen = seenById.get(point.clientPointId) || seenBySequence.get(point.sequence);
      if (seen) {
        if (sameNormalizedPoint(seen, point)) duplicates.push(point.clientPointId);
        else rejected.push({ clientPointId: point.clientPointId, code: 'DUPLICATE_CONFLICT' });
        continue;
      }
      seenById.set(point.clientPointId, point);
      seenBySequence.set(point.sequence, point);

      const basicRejection = validatePoint(point, session, now, allowedDeliveries);
      if (basicRejection) {
        rejected.push({ clientPointId: point.clientPointId, code: basicRejection });
        continue;
      }
      if (hasImpossibleJump(timeline, point)) {
        rejected.push({ clientPointId: point.clientPointId, code: 'IMPOSSIBLE_JUMP' });
        continue;
      }
      insertTimelinePoint(timeline, point);
      candidates.push(point);
    }

    if (candidates.length > 0) {
      const persistCandidates = async (tx: any) => {
        if (!routeAlreadyLocked) await lockLogisticaRouteTransaction(tx, device.companyId, session.routeId);
        const route = await tx.logisticaRoute.findFirst({
          where: {
            companyId: device.companyId,
            id: session.routeId,
            status: 'ACTIVE',
            mode: 'TRACKED',
            operationalEndedAt: null,
          },
          select: { id: true },
        });
        const activeSession = await tx.logisticaTrackingSession.findFirst({
          where: { companyId: device.companyId, id: session.id, deviceId: device.id, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!route || !activeSession) {
          throw conflitoRastreamento(
            TRACKING_CONFLICT.SESSAO_ENCERRADA,
            'Esta execução de rastreamento já foi encerrada.',
          );
        }
        await tx.logisticaTrackingPoint.createMany({
          data: candidates.map((point) => ({
            companyId: device.companyId,
            sessionId: session.id,
            deliveryId: point.deliveryId,
            clientPointId: point.clientPointId,
            sequence: point.sequence,
            capturedAt: point.capturedAt,
            receivedAt: now,
            latitude: point.latitude,
            longitude: point.longitude,
            accuracyM: point.accuracyM,
            speedMps: point.speedMps,
            bearingDeg: point.bearingDeg,
            eventType: point.eventType,
          })),
          skipDuplicates: true,
        });
      };
      if (routeAlreadyLocked) await persistCandidates(db);
      else await db.$transaction(persistCandidates);
    }

    // createMany(skipDuplicates) é a última trava de corrida no banco. Releia o
    // vencedor antes do ACK: se outro lote ganhou a mesma key/sequence com outro
    // payload, este request recebe conflito em vez de afirmar que persistiu.
    let verifiedCandidates: NormalizedPoint[] = [];
    if (candidates.length > 0) {
      const candidateRows = await db.logisticaTrackingPoint.findMany({
        where: {
          companyId: device.companyId,
          sessionId: session.id,
          OR: [
            { clientPointId: { in: candidates.map((point) => point.clientPointId) } },
            { sequence: { in: candidates.map((point) => point.sequence) } },
          ],
        },
        select: {
          clientPointId: true,
          sequence: true,
          capturedAt: true,
          latitude: true,
          longitude: true,
          accuracyM: true,
          speedMps: true,
          bearingDeg: true,
          eventType: true,
          deliveryId: true,
        },
      });
      const rowsById = new Map(candidateRows.map((row: any) => [row.clientPointId, row]));
      const rowsBySequence = new Map(candidateRows.map((row: any) => [row.sequence, row]));
      verifiedCandidates = candidates.filter((point) => {
        const row = rowsById.get(point.clientPointId) || rowsBySequence.get(point.sequence);
        if (row && samePersistedPoint(row, point)) {
          accepted.push(point.clientPointId);
          return true;
        }
        rejected.push({ clientPointId: point.clientPointId, code: 'DUPLICATE_CONFLICT' });
        return false;
      });
    }

    // Inclui duplicatas na reconciliação: se o processo caiu entre INSERT e o
    // update do latest, o retry recompõe o snapshot sem regredir um ponto novo.
    const newest = [...verifiedCandidates, ...replayPoints]
      .sort(compareNormalizedPoints)
      .at(-1);
    if (newest) {
      await db.logisticaTrackingSession.updateMany({
        where: {
          companyId: device.companyId,
          id: session.id,
          deviceId: device.id,
          OR: [{ lastPointAt: null }, { lastPointAt: { lt: newest.capturedAt } }],
        },
        data: {
          hasValidPositions: true,
          lastPointAt: newest.capturedAt,
          lastLatitude: newest.latitude,
          lastLongitude: newest.longitude,
          lastAccuracyM: newest.accuracyM,
          lastSpeedMps: newest.speedMps,
          lastBearingDeg: newest.bearingDeg,
        },
      });
    }

    const latestAcceptedAt = newest && (!session.lastPointAt || newest.capturedAt > session.lastPointAt)
      ? newest.capturedAt
      : session.lastPointAt;
    return {
      ok: true,
      sessionId: session.id,
      accepted: Array.from(new Set(accepted)),
      duplicates: Array.from(new Set(duplicates)).filter(
        (id) => !rejected.some((item) => item.clientPointId === id),
      ),
      rejected: dedupeRejections(rejected),
      latestAcceptedAt: latestAcceptedAt?.toISOString?.() ?? null,
    };
  }

  async recordEvent(sessionIdInput: string, dto: LogisticaTrackingSessionEventDto) {
    const device = await this.authenticateTrackingDevice(dto);
    await this.assertTrackingWriteEnabled(device.companyId);
    const session = await this.loadBoundSession(device, sessionIdInput, { allowEnded: true });
    const clientEventId = String(dto.eventId || '').trim();
    const duplicate = await (this.prisma as any).logisticaTrackingEvent.findFirst({
      where: { companyId: device.companyId, sessionId: session.id, clientEventId },
    });
    if (duplicate) {
      if (!sameTrackingEvent(duplicate, dto)) {
        throw conflitoRastreamento(
          TRACKING_CONFLICT.EVENTO_REUSADO,
          'Identificador de evento reutilizado com outro conteúdo.',
        );
      }
      const authority = await this.getSessionAuthority(
        this.prisma,
        device.companyId,
        session.id,
        device.id,
      );
      return {
        ok: true,
        replayed: true,
        status: session.status,
        endedAt: session.endedAt?.toISOString?.() ?? null,
        pointRejected: null,
        ...authority,
      };
    }
    if (session.route?.operationalEndedAt != null) {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.SESSAO_ENCERRADA,
        'Esta execução de rastreamento já foi encerrada.',
      );
    }
    if (session.status !== 'ACTIVE') {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.SESSAO_ENCERRADA,
        'A sessão de rastreamento já foi encerrada.',
      );
    }

    const capturedAt = parseCapturedAt(dto.capturedAt);
    // O marco precisa sobreviver a uma outbox offline longa. Mantém limites da
    // sessão e skew futuro, mas não expira em 24h como uma coordenada comum.
    const timeRejection = validateCapturedAt(capturedAt, session, new Date(), false);
    if (timeRejection) throw new BadRequestException(`Evento de rastreamento rejeitado: ${timeRejection}.`);
    const deliveryId = String(dto.deliveryId || '').trim() || null;
    if (dto.type === 'ARRIVAL' && !deliveryId) {
      throw new BadRequestException('A chegada precisa identificar a entrega.');
    }
    if (deliveryId) await this.assertDeliveryBelongsToRoute(device.companyId, session.routeId, deliveryId);

    if (dto.type === 'END') {
      const openStops = await (this.prisma as any).logisticaRouteStop.count({
        where: {
          companyId: device.companyId,
          routeId: session.routeId,
          delivery: { status: { notIn: ['entregue', 'cancelada'] } },
        },
      });
      if (openStops > 0) {
        // 409 é deliberado: o APK mantém o END na fila até as confirmações
        // offline anteriores chegarem ao VPS. A mesma contagem é refeita sob
        // trava na transação terminal para fechar a janela END x append.
        // O código é o que separa este 409 (ESPERA) do 409 terminal — sem ele o
        // freio novo descartaria o END e a rota nunca encerraria.
        throw conflitoRastreamento(
          TRACKING_CONFLICT.ENTREGAS_ABERTAS,
          'Ainda existem entregas abertas nesta rota.',
        );
      }
    }

    let pointRejected: { clientPointId: string; code: PointRejectionCode } | null = null;
    if (dto.point) {
      if (dto.point.eventType !== dto.type) {
        throw new BadRequestException('O tipo do ponto não corresponde ao evento.');
      }
      if ((String(dto.point.deliveryId || '').trim() || null) !== deliveryId) {
        throw new BadRequestException('A entrega do ponto não corresponde ao evento.');
      }
      const pointCapturedAt = parseCapturedAt(dto.point.capturedAt);
      const pointLagMs = capturedAt.getTime() - pointCapturedAt.getTime();
      if (pointLagMs < 0 || pointLagMs > MAX_FUTURE_SKEW_MS) {
        throw new BadRequestException('O ponto do evento deve ser um fix recente anterior ao marco.');
      }
    }
    let outcome: { replayed: boolean; status: string; endedAt: string | null };
    try {
      outcome = await this.prisma.$transaction(async (tx: any) => {
        await lockLogisticaRouteTransaction(tx, device.companyId, session.routeId);
        const lockedSession = await tx.logisticaTrackingSession.findFirst({
          where: {
            companyId: device.companyId,
            id: session.id,
            deviceId: device.id,
          },
        });
        if (!lockedSession) {
          throw conflitoRastreamento(
            TRACKING_CONFLICT.SESSAO_ENCERRADA,
            'Sessão de rastreamento não encontrada para este aparelho.',
          );
        }

        // Retry idempotente precisa vencer inclusive depois de END já ter
        // tornado rota/sessão terminais.
        const winner = await tx.logisticaTrackingEvent.findFirst({
          where: { companyId: device.companyId, sessionId: session.id, clientEventId },
        });
        if (winner) {
          if (!sameTrackingEvent(winner, dto)) {
            throw conflitoRastreamento(
              TRACKING_CONFLICT.EVENTO_REUSADO,
              'Identificador de evento reutilizado com outro conteúdo.',
            );
          }
          return {
            replayed: true,
            status: lockedSession.status,
            endedAt: lockedSession.endedAt?.toISOString?.() ?? null,
          };
        }
        if (lockedSession.status !== 'ACTIVE') {
          throw conflitoRastreamento(
            TRACKING_CONFLICT.SESSAO_ENCERRADA,
            'A sessão de rastreamento já foi encerrada.',
          );
        }
        const lockedRoute = await tx.logisticaRoute.findFirst({
          where: { companyId: device.companyId, id: session.routeId },
        });
        if (!lockedRoute || lockedRoute.mode !== 'TRACKED' || lockedRoute.status !== 'ACTIVE' || lockedRoute.operationalEndedAt) {
          throw conflitoRastreamento(
            TRACKING_CONFLICT.SESSAO_ENCERRADA,
            'A rota de rastreamento não está mais ativa.',
          );
        }
        if (dto.type === 'END') {
          if (lockedSession.lastPointAt && capturedAt < lockedSession.lastPointAt) {
            throw new BadRequestException('O encerramento não pode ser anterior à última posição aceita.');
          }
          const openStops = await tx.logisticaRouteStop.count({
            where: {
              companyId: device.companyId,
              routeId: session.routeId,
              delivery: { status: { notIn: ['entregue', 'cancelada'] } },
            },
          });
          if (openStops > 0) {
            throw conflitoRastreamento(
              TRACKING_CONFLICT.ENTREGAS_ABERTAS,
              'Ainda existem entregas abertas nesta rota.',
            );
          }
        }

        if (dto.point) {
          // Ponto e marco compartilham a MESMA trava/transação. Encerramento
          // concorrente não pode deixar o fix gravado e o ARRIVAL/END rejeitado.
          const pointResult = await this.ingestBoundPositions(
            device,
            { ...session, status: lockedSession.status, route: lockedRoute },
            [dto.point],
            new Date(),
            tx,
            true,
          );
          if (pointResult.rejected.length > 0) {
            // O marco não fica preso por fix expirado/impreciso: o ponto é
            // descartado e o ACK explicita a rejeição.
            pointRejected = pointResult.rejected[0];
          }
        }

        await tx.logisticaTrackingEvent.create({
          data: {
            companyId: device.companyId,
            sessionId: session.id,
            deliveryId,
            clientEventId,
            type: dto.type,
            capturedAt,
          },
        });
        if (dto.type === 'END') {
          const ended = await tx.logisticaTrackingSession.updateMany({
            where: {
              companyId: device.companyId,
              id: session.id,
              deviceId: device.id,
              status: 'ACTIVE',
            },
            data: { status: 'ENDED', endedAt: capturedAt },
          });
          if (ended.count !== 1) {
            throw conflitoRastreamento(
              TRACKING_CONFLICT.SESSAO_ENCERRADA,
              'A sessão de rastreamento já foi encerrada.',
            );
          }
          const completed = await tx.logisticaRoute.updateMany({
            where: { companyId: device.companyId, id: session.routeId, status: 'ACTIVE', mode: 'TRACKED' },
            data: { status: 'COMPLETED', completedAt: capturedAt },
          });
          if (completed.count !== 1) {
            throw conflitoRastreamento(
              TRACKING_CONFLICT.SESSAO_ENCERRADA,
              'A rota de rastreamento já foi encerrada.',
            );
          }
        }
        return {
          replayed: false,
          status: dto.type === 'END' ? 'ENDED' : 'ACTIVE',
          endedAt: dto.type === 'END' ? capturedAt.toISOString() : null,
        };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await (this.prisma as any).logisticaTrackingEvent.findFirst({
        where: { companyId: device.companyId, sessionId: session.id, clientEventId },
      });
      if (!winner) throw error;
      if (!sameTrackingEvent(winner, dto)) {
        throw conflitoRastreamento(
          TRACKING_CONFLICT.EVENTO_REUSADO,
          'Identificador de evento reutilizado com outro conteúdo.',
        );
      }
      const currentSession = await (this.prisma as any).logisticaTrackingSession.findFirst({
        where: { companyId: device.companyId, id: session.id },
      });
      outcome = {
        replayed: true,
        status: currentSession?.status ?? 'ENDED',
        endedAt: currentSession?.endedAt?.toISOString?.() ?? null,
      };
    }

    const authority = await this.getSessionAuthority(
      this.prisma,
      device.companyId,
      session.id,
      device.id,
    );
    return {
      ok: true,
      ...outcome,
      pointRejected,
      ...authority,
    };
  }

  async getLive(companyId: number) {
    // PR27072026 F1 — rastreamento é EXCLUSIVO do nível Full (gate JÁ existe em
    // logistica-config.service.ts; aqui só LÊ via getNivel, nunca reimplementa).
    // Ausente/config antiga = ADVANCED, mesmo grandfathering do resto do app
    // (ver storedNivel/serializeConfig). O front decide a UI (acinzentado com
    // .plano-selo "Disponível no Full") — o backend nunca esconde rota ATIVA em
    // andamento por causa de downgrade (grandfathering: operação em curso não
    // para de ser vista pelo admin só porque o nível mudou no meio do dia).
    const nivel = this.config?.getNivel ? (await this.config.getNivel(companyId)).nivel : 'ADVANCED';
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const routes = await (this.prisma as any).logisticaRoute.findMany({
      where: {
        companyId,
        mode: 'TRACKED',
        OR: [
          { status: 'ACTIVE' },
          { status: 'COMPLETED', completedAt: { gte: recentSince } },
        ],
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        startedAt: true,
        entregador: { select: { id: true, name: true, username: true, email: true } },
        trackingSession: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            endedAt: true,
            lastPointAt: true,
            lastLatitude: true,
            lastLongitude: true,
            lastAccuracyM: true,
            lastSpeedMps: true,
          },
        },
        stops: {
          select: { delivery: { select: { status: true } } },
        },
      },
    });
    const now = Date.now();
    return {
      nivel,
      full: nivel === 'FULL',
      routes: routes.map((route: any) => {
        const session = route.trackingSession;
        const statuses = route.stops.map((stop: any) => String(stop.delivery.status || ''));
        const completedDeliveries = statuses.filter((status: string) => status === 'entregue').length;
        const remainingDeliveries = statuses.filter(
          (status: string) => status !== 'entregue' && status !== 'cancelada',
        ).length;
        const signalAge = session?.lastPointAt ? now - session.lastPointAt.getTime() : Infinity;
        const signalStatus = signalAge > LIVE_SIGNAL_WINDOW_MS
          ? 'NO_SIGNAL'
          : Number(session?.lastSpeedMps || 0) <= STOPPED_SPEED_MPS
            ? 'STOPPED'
            : 'ONLINE';
        return {
          sessionId: session?.id ?? null,
          routeId: route.id,
          routeStatus: route.status,
          active: route.status === 'ACTIVE' && session?.status === 'ACTIVE',
          driver: {
            id: route.entregador.id,
            nome: route.entregador.name || route.entregador.username || route.entregador.email || `Motorista ${route.entregador.id}`,
          },
          status: signalStatus,
          sessionStatus: session?.status ?? 'ACTIVE',
          startedAt: (session?.startedAt ?? route.startedAt)?.toISOString?.() ?? null,
          endedAt: session?.endedAt?.toISOString?.() ?? null,
          lastPosition: session?.lastPointAt && session.lastLatitude != null && session.lastLongitude != null
            ? {
                latitude: session.lastLatitude,
                longitude: session.lastLongitude,
                accuracyMeters: session.lastAccuracyM,
                speedKmh: session.lastSpeedMps == null ? null : round2(session.lastSpeedMps * 3.6),
                capturedAt: session.lastPointAt.toISOString(),
              }
            : null,
          completedDeliveries,
          remainingDeliveries,
          totalDeliveries: completedDeliveries + remainingDeliveries,
        };
      }),
    };
  }

  async getHistory(companyId: number, sessionIdInput: string, limitInput?: number) {
    const sessionId = String(sessionIdInput || '').trim();
    const session = await (this.prisma as any).logisticaTrackingSession.findFirst({
      where: { companyId, id: sessionId },
      select: { id: true, routeId: true, startedAt: true, endedAt: true },
    });
    if (!session) throw new NotFoundException('Sessão de rastreamento não encontrada.');
    const limit = Math.max(1, Math.min(2_000, Math.trunc(Number(limitInput || 500))));
    const pointsNewestFirst = await (this.prisma as any).logisticaTrackingPoint.findMany({
      where: { companyId, sessionId: session.id },
      orderBy: [{ capturedAt: 'desc' }, { sequence: 'desc' }],
      take: limit,
      select: {
        latitude: true,
        longitude: true,
        capturedAt: true,
        accuracyM: true,
        speedMps: true,
        eventType: true,
        deliveryId: true,
      },
    });
    const eventsNewestFirst = await (this.prisma as any).logisticaTrackingEvent.findMany({
      where: { companyId, sessionId: session.id },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { type: true, deliveryId: true, capturedAt: true },
    });
    // O banco limita primeiro pelos registros mais recentes; a API entrega o
    // recorte em ordem cronológica para o mapa desenhar a linha corretamente.
    const points = [...pointsNewestFirst].reverse();
    const events = [...eventsNewestFirst].reverse();
    return {
      sessionId: session.id,
      routeId: session.routeId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString?.() ?? null,
      points: points.map((point: any) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        capturedAt: point.capturedAt.toISOString(),
        accuracyMeters: point.accuracyM,
        speedKmh: point.speedMps == null ? null : round2(point.speedMps * 3.6),
        eventType: point.eventType,
        deliveryId: point.deliveryId ?? null,
      })),
      events: events.map((event: any) => ({
        type: event.type,
        deliveryId: event.deliveryId ?? null,
        capturedAt: event.capturedAt.toISOString(),
      })),
    };
  }

  async getOperationalRouteMetadata(
    companyId: number,
    entregadorId: number,
    routeDate: string,
    includeCommercialMode = false,
  ): Promise<OperationalRouteMetadata> {
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: { companyId, entregadorId, routeDate },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        mode: true,
        status: true,
        operationalEndedAt: true,
        trackingSession: { select: { id: true, status: true } },
      },
    });
    if (!route) {
      return {
        routeId: null,
        trackingRequired: false,
        routeStatus: null,
        trackingSessionId: null,
        trackingStatus: null,
        ...(includeCommercialMode ? { routeMode: null } : {}),
      };
    }
    // PR17072026 — rota encerrada OPERACIONALMENTE (decoupled da cobrança): o
    // `status` comercial segue ACTIVE, mas o app precisa ver a rota como não-ativa.
    // Reporta routeStatus='ENCERRADA' (qualquer coisa != 'ACTIVE' basta) e desliga
    // trackingRequired. Zerado ao (re)iniciar — a 2ª leva do dia volta a ACTIVE.
    const ended = (route as any).operationalEndedAt != null;
    return {
      routeId: route.id,
      // Contrato operacional: o app só precisa saber se deve rastrear agora.
      // O modo comercial congelado é omitido por padrão e só pode ser pedido
      // explicitamente por um fluxo administrativo autorizado.
      trackingRequired: route.mode === 'TRACKED' && route.status === 'ACTIVE' && !ended,
      routeStatus: ended ? 'ENCERRADA' : route.status,
      trackingSessionId: route.trackingSession?.id ?? null,
      trackingStatus: route.trackingSession?.status ?? null,
      ...(includeCommercialMode ? { routeMode: route.mode } : {}),
    };
  }

  private async getSessionAuthority(
    client: any,
    companyId: number,
    sessionId: string,
    deviceId: string,
  ): Promise<TrackingSessionAuthority> {
    const current = await client.logisticaTrackingSession.findFirst({
      where: { companyId, id: sessionId, deviceId },
      include: { route: { select: { mode: true, status: true, operationalEndedAt: true } } },
    });
    if (!current) return missingSessionAuthority();
    const sessionStatus = current.status === 'ACTIVE' ? 'ACTIVE' : 'ENDED';
    const routeActive =
      sessionStatus === 'ACTIVE' &&
      current.route?.mode === 'TRACKED' &&
      current.route?.status === 'ACTIVE' &&
      current.route?.operationalEndedAt == null;
    return { sessionStatus, routeActive, captureAllowed: routeActive };
  }

  private async authenticateTrackingDevice(dto: { deviceToken: string; installationId: string }) {
    const device = await this.mobileDevices.authenticateDeviceCredential(dto, { touch: false });
    await this.mobileDevices.assertUserCanUseLogistica(device.userId, device.companyId);
    await this.mobileDevices.touchAuthenticatedDevice(device);
    return device;
  }

  private async assertTrackingWriteEnabled(companyId: number) {
    if (!isLogisticaTrackingEnabled()) {
      throw new ForbiddenException('O rastreamento de rotas está temporariamente indisponível.');
    }
    const config = await (this.prisma as any).logisticaConfig.findUnique({
      where: { companyId },
      select: { trackingAtivo: true },
    });
    if (!config?.trackingAtivo) {
      throw new ForbiddenException('O rastreamento não está habilitado para esta empresa.');
    }
  }

  private async resolveActiveTrackedRoute(device: AuthenticatedMobileDevice, routeIdInput?: string) {
    const routeId = String(routeIdInput || '').trim();
    if (routeId) {
      const route = await (this.prisma as any).logisticaRoute.findFirst({
        where: {
          companyId: device.companyId,
          id: routeId,
          entregadorId: device.userId,
          mode: 'TRACKED',
          status: 'ACTIVE',
        },
        select: { id: true, entregadorId: true, startedAt: true },
      });
      if (!route) throw new NotFoundException('Rota rastreada ativa não encontrada para este aparelho.');
      return route;
    }
    const routes = await (this.prisma as any).logisticaRoute.findMany({
      where: {
        companyId: device.companyId,
        entregadorId: device.userId,
        mode: 'TRACKED',
        status: 'ACTIVE',
      },
      orderBy: { startedAt: 'desc' },
      take: 2,
      select: { id: true, entregadorId: true, startedAt: true },
    });
    if (routes.length === 0) throw new NotFoundException('Nenhuma rota rastreada ativa foi encontrada.');
    if (routes.length > 1) {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.ROTA_AMBIGUA,
        'Informe a rota para iniciar o rastreamento.',
      );
    }
    return routes[0];
  }

  private async loadBoundSession(
    device: AuthenticatedMobileDevice,
    sessionIdInput: string,
    options: { allowEnded: boolean },
  ) {
    const sessionId = String(sessionIdInput || '').trim();
    const session = await (this.prisma as any).logisticaTrackingSession.findFirst({
      where: {
        companyId: device.companyId,
        id: sessionId,
        entregadorId: device.userId,
        deviceId: device.id,
        ...(options.allowEnded ? { status: { in: ['ACTIVE', 'ENDED'] } } : { status: 'ACTIVE' }),
      },
      include: { route: { select: { id: true, mode: true, status: true, operationalEndedAt: true } } },
    });
    if (!session || session.route?.mode !== 'TRACKED') {
      throw new NotFoundException('Sessão de rastreamento não encontrada para este aparelho.');
    }
    if (session.route.status === 'FAILED' || session.route.status === 'REFUNDING') {
      throw conflitoRastreamento(
        TRACKING_CONFLICT.ROTA_INDISPONIVEL,
        'A rota desta sessão não está disponível.',
      );
    }
    return session;
  }

  private async assertDeliveryBelongsToRoute(companyId: number, routeId: string, deliveryId: string) {
    const stop = await (this.prisma as any).logisticaRouteStop.findFirst({
      where: { companyId, routeId, deliveryId },
      select: { id: true },
    });
    if (!stop) throw new BadRequestException('A entrega não pertence a esta rota.');
  }
}

function serializeMobileSession(session: any) {
  return {
    id: session.id,
    routeId: session.routeId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    serverTime: new Date().toISOString(),
    upload: {
      movingIntervalSeconds: 12,
      stationaryIntervalSeconds: 45,
      maxBatchSize: 100,
    },
  };
}

function missingSessionAuthority(): TrackingSessionAuthority {
  return {
    sessionStatus: 'MISSING',
    routeActive: false,
    captureAllowed: false,
  };
}

function normalizePoint(input: LogisticaTrackingPointDto): NormalizedPoint {
  return {
    clientPointId: String(input.clientPointId || '').trim(),
    sequence: Math.trunc(Number(input.sequence)),
    capturedAt: parseCapturedAt(input.capturedAt),
    latitude: Number(input.lat),
    longitude: Number(input.lng),
    accuracyM: Number(input.accuracyM),
    speedMps: input.speedMps == null ? null : Number(input.speedMps),
    bearingDeg: input.bearingDeg == null ? null : Number(input.bearingDeg),
    eventType: String(input.eventType || '').trim().toUpperCase(),
    deliveryId: String(input.deliveryId || '').trim() || null,
  };
}

function parseCapturedAt(input: string): Date {
  const value = new Date(String(input || ''));
  return value;
}

function validatePoint(
  point: NormalizedPoint,
  session: any,
  now: Date,
  allowedDeliveries: Set<string>,
): PointRejectionCode | null {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) return 'INVALID_COORDINATES';
  if (!Number.isFinite(point.accuracyM) || point.accuracyM <= 0 || point.accuracyM > MAX_ACCURACY_M) {
    return 'INVALID_ACCURACY';
  }
  if (point.speedMps != null && (!Number.isFinite(point.speedMps) || point.speedMps < 0 || point.speedMps > MAX_REPORTED_SPEED_MPS)) {
    return 'INVALID_SPEED';
  }
  if (point.bearingDeg != null && (!Number.isFinite(point.bearingDeg) || point.bearingDeg < 0 || point.bearingDeg >= 360)) {
    return 'INVALID_BEARING';
  }
  const timeRejection = validateCapturedAt(point.capturedAt, session, now, true);
  if (timeRejection) return timeRejection;
  if (point.eventType === 'ARRIVAL' && !point.deliveryId) return 'DELIVERY_REQUIRED';
  if (point.deliveryId && !allowedDeliveries.has(point.deliveryId)) return 'DELIVERY_OUTSIDE_ROUTE';
  return null;
}

function validateCapturedAt(
  capturedAt: Date,
  session: any,
  now: Date,
  includeAge: boolean,
): PointRejectionCode | null {
  if (!(capturedAt instanceof Date) || Number.isNaN(capturedAt.getTime())) return 'INVALID_CAPTURED_AT';
  if (capturedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) return 'POINT_IN_FUTURE';
  if (includeAge && capturedAt.getTime() < now.getTime() - MAX_POINT_AGE_MS) return 'POINT_TOO_OLD';
  if (capturedAt < session.startedAt) return 'BEFORE_SESSION';
  if (session.endedAt && capturedAt > session.endedAt) return 'AFTER_SESSION';
  return null;
}

function compareNormalizedPoints(a: NormalizedPoint, b: NormalizedPoint): number {
  return a.capturedAt.getTime() - b.capturedAt.getTime() || a.sequence - b.sequence;
}

function samePersistedPoint(row: any, point: NormalizedPoint): boolean {
  return row.clientPointId === point.clientPointId &&
    Number(row.sequence) === point.sequence &&
    row.capturedAt.getTime() === point.capturedAt.getTime() &&
    nearlyEqual(row.latitude, point.latitude) &&
    nearlyEqual(row.longitude, point.longitude) &&
    nearlyEqual(row.accuracyM, point.accuracyM) &&
    nullableNearlyEqual(row.speedMps, point.speedMps) &&
    nullableNearlyEqual(row.bearingDeg, point.bearingDeg) &&
    String(row.eventType) === point.eventType &&
    (row.deliveryId ?? null) === point.deliveryId;
}

function sameNormalizedPoint(a: NormalizedPoint, b: NormalizedPoint): boolean {
  return a.clientPointId === b.clientPointId &&
    a.sequence === b.sequence &&
    a.capturedAt.getTime() === b.capturedAt.getTime() &&
    nearlyEqual(a.latitude, b.latitude) &&
    nearlyEqual(a.longitude, b.longitude) &&
    nearlyEqual(a.accuracyM, b.accuracyM) &&
    nullableNearlyEqual(a.speedMps, b.speedMps) &&
    nullableNearlyEqual(a.bearingDeg, b.bearingDeg) &&
    a.eventType === b.eventType &&
    a.deliveryId === b.deliveryId;
}

function nullableNearlyEqual(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return a == null && b == null;
  return nearlyEqual(Number(a), Number(b));
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) <= 1e-7;
}

function hasImpossibleJump(timeline: TimelinePoint[], point: NormalizedPoint): boolean {
  let low = 0;
  let high = timeline.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const cmp = timeline[mid].capturedAt.getTime() - point.capturedAt.getTime() || timeline[mid].sequence - point.sequence;
    if (cmp <= 0) low = mid + 1;
    else high = mid;
  }
  const previous = low > 0 ? timeline[low - 1] : null;
  const next = low < timeline.length ? timeline[low] : null;
  return (previous ? impossibleSegment(previous, point) : false) || (next ? impossibleSegment(point, next) : false);
}

function impossibleSegment(a: TimelinePoint, b: TimelinePoint): boolean {
  const elapsedSeconds = Math.abs(b.capturedAt.getTime() - a.capturedAt.getTime()) / 1000;
  const rawDistance = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  const defensibleDistance = Math.max(0, rawDistance - Math.max(0, a.accuracyM) - Math.max(0, b.accuracyM));
  if (elapsedSeconds < 1) return defensibleDistance > 30;
  return defensibleDistance / elapsedSeconds > MAX_DERIVED_SPEED_MPS;
}

function insertTimelinePoint(timeline: TimelinePoint[], point: NormalizedPoint) {
  let index = timeline.length;
  while (index > 0) {
    const previous = timeline[index - 1];
    const cmp = previous.capturedAt.getTime() - point.capturedAt.getTime() || previous.sequence - point.sequence;
    if (cmp <= 0) break;
    index--;
  }
  timeline.splice(index, 0, point);
}

// Exportada desde 03/08: a SENTINELA (logistica-rota-aviso.service) mede "não
// saiu do lugar" e "está fora de qualquer cliente" com a MESMA régua que o
// rastreamento usa pra validar ponto — duas fórmulas de distância no módulo
// seriam duas verdades sobre a mesma pergunta.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radiusM = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isUniqueViolation(error: unknown) {
  return String((error as any)?.code || '') === 'P2002';
}

function sameTrackingEvent(row: any, dto: LogisticaTrackingSessionEventDto) {
  const deliveryId = String(dto.deliveryId || '').trim() || null;
  return String(row.type) === String(dto.type) &&
    (row.deliveryId ?? null) === deliveryId &&
    row.capturedAt?.getTime?.() === parseCapturedAt(dto.capturedAt).getTime();
}

function dedupeRejections(
  rows: Array<{ clientPointId: string; code: PointRejectionCode }>,
) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.clientPointId}:${row.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
