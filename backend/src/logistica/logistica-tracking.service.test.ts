import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'crypto';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { LogisticaRotaService } from './logistica-rota.service';

const CREDENTIAL = { deviceToken: 'x'.repeat(40), installationId: 'installation-1234' };

function matchesStatus(actual: string, expected: any) {
  if (typeof expected === 'string') return actual === expected;
  if (expected?.in) return expected.in.includes(actual);
  return true;
}

function setup(options?: { session?: boolean; sessionStartedAt?: Date }) {
  const state: any = {
    config: { trackingAtivo: true },
    configCompanies: new Set<number>([3]),
    device: { id: 'device-1', userId: 7, companyId: 3, name: 'Moto G', platform: 'android' },
    route: {
      id: 'route-1',
      companyId: 3,
      entregadorId: 7,
      routeDate: '2026-07-13',
      mode: 'TRACKED',
      status: 'ACTIVE',
      startedAt: options?.sessionStartedAt ?? new Date(Date.now() - 30 * 60 * 1000),
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    },
    session: null as any,
    points: [] as any[],
    events: [] as any[],
    stops: new Map<string, string>([['delivery-1', 'agendada']]),
    racePoint: null as any,
    routeLockGate: null as any,
  };
  if (options?.session) {
    state.session = {
      id: 'session-1',
      companyId: 3,
      routeId: 'route-1',
      entregadorId: 7,
      deviceId: 'device-1',
      deviceBoundAt: new Date(),
      status: 'ACTIVE',
      startedAt: options?.sessionStartedAt ?? state.route.startedAt,
      endedAt: null,
      hasValidPositions: false,
      lastPointAt: null,
      lastLatitude: null,
      lastLongitude: null,
      lastAccuracyM: null,
      lastSpeedMps: null,
      lastBearingDeg: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const trackingSession = {
    findFirst: async (args: any) => {
      const row = state.session;
      if (!row) return null;
      const where = args?.where || {};
      if (where.companyId != null && where.companyId !== row.companyId) return null;
      if (where.id && where.id !== row.id) return null;
      if (where.routeId && where.routeId !== row.routeId) return null;
      if (where.entregadorId && where.entregadorId !== row.entregadorId) return null;
      if (Object.prototype.hasOwnProperty.call(where, 'deviceId') && where.deviceId !== row.deviceId) return null;
      if (where.status && !matchesStatus(row.status, where.status)) return null;
      if (where.route?.mode && where.route.mode !== state.route.mode) return null;
      if (where.route?.status && !matchesStatus(state.route.status, where.route.status)) return null;
      return {
        ...row,
        ...(args?.include?.route ? { route: { ...state.route } } : {}),
      };
    },
    create: async (args: any) => {
      if (state.session) throw Object.assign(new Error('unique'), { code: 'P2002' });
      state.session = {
        id: 'session-1',
        deviceId: null,
        deviceBoundAt: null,
        hasValidPositions: false,
        endedAt: null,
        lastPointAt: null,
        lastLatitude: null,
        lastLongitude: null,
        lastAccuracyM: null,
        lastSpeedMps: null,
        lastBearingDeg: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      };
      return { ...state.session };
    },
    updateMany: async (args: any) => {
      const row = state.session;
      if (!row) return { count: 0 };
      const where = args.where || {};
      if (where.companyId != null && where.companyId !== row.companyId) return { count: 0 };
      if (where.id && where.id !== row.id) return { count: 0 };
      if (where.routeId && where.routeId !== row.routeId) return { count: 0 };
      if (where.entregadorId && where.entregadorId !== row.entregadorId) return { count: 0 };
      if (Object.prototype.hasOwnProperty.call(where, 'deviceId') && where.deviceId !== row.deviceId) return { count: 0 };
      if (where.status && !matchesStatus(row.status, where.status)) return { count: 0 };
      if (where.OR) {
        const matchesLatest = where.OR.some((condition: any) =>
          condition.lastPointAt === null
            ? row.lastPointAt === null
            : condition.lastPointAt?.lt
              ? !row.lastPointAt || row.lastPointAt < condition.lastPointAt.lt
              : false,
        );
        if (!matchesLatest) return { count: 0 };
      }
      Object.assign(row, args.data, { updatedAt: new Date() });
      return { count: 1 };
    },
    deleteMany: async (args: any) => {
      if (!state.session) return { count: 0 };
      const where = args.where || {};
      if (where.companyId !== state.session.companyId || where.routeId !== state.session.routeId) return { count: 0 };
      if (where.deviceId === null && state.session.deviceId !== null) return { count: 0 };
      if (where.hasValidPositions === false && state.session.hasValidPositions !== false) return { count: 0 };
      state.session = null;
      return { count: 1 };
    },
  };

  const trackingPoint = {
    findMany: async (args: any) => {
      let rows = state.points.filter((row: any) =>
        row.companyId === args.where.companyId && row.sessionId === args.where.sessionId,
      );
      if (args.where.OR) {
        rows = rows.filter((row: any) => args.where.OR.some((condition: any) =>
          condition.clientPointId?.in?.includes(row.clientPointId) ||
          condition.sequence?.in?.includes(row.sequence),
        ));
      }
      if (args.where.capturedAt?.gte) {
        rows = rows.filter((row: any) => row.capturedAt >= args.where.capturedAt.gte);
      }
      const descending = args.orderBy?.[0]?.capturedAt === 'desc';
      rows.sort((a: any, b: any) => {
        const chronological = a.capturedAt.getTime() - b.capturedAt.getTime() || a.sequence - b.sequence;
        return descending ? -chronological : chronological;
      });
      return rows.slice(0, args.take || rows.length).map((row: any) => ({ ...row }));
    },
    createMany: async (args: any) => {
      if (state.racePoint) {
        state.points.push({ id: `point-${state.points.length + 1}`, ...state.racePoint });
        state.racePoint = null;
      }
      let count = 0;
      for (const data of args.data) {
        const conflict = state.points.some((row: any) =>
          row.sessionId === data.sessionId &&
          (row.clientPointId === data.clientPointId || row.sequence === data.sequence),
        );
        if (conflict) continue;
        state.points.push({ id: `point-${state.points.length + 1}`, createdAt: new Date(), ...data });
        count++;
      }
      return { count };
    },
  };

  const trackingEvent = {
    findFirst: async (args: any) => state.events.find((row: any) =>
      row.companyId === args.where.companyId &&
      row.sessionId === args.where.sessionId &&
      row.clientEventId === args.where.clientEventId,
    ) ?? null,
    findMany: async (args: any) => {
      const descending = args.orderBy?.[0]?.capturedAt === 'desc' || args.orderBy?.capturedAt === 'desc';
      return state.events
        .filter((row: any) => row.companyId === args.where.companyId && row.sessionId === args.where.sessionId)
        .sort((a: any, b: any) => {
          const chronological = a.capturedAt.getTime() - b.capturedAt.getTime();
          return descending ? -chronological : chronological;
        })
        .slice(0, args.take || state.events.length);
    },
    create: async (args: any) => {
      if (state.events.some((row: any) => row.sessionId === args.data.sessionId && row.clientEventId === args.data.clientEventId)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { id: `event-${state.events.length + 1}`, createdAt: new Date(), ...args.data };
      state.events.push(row);
      return row;
    },
  };

  const prisma: any = {
    logisticaConfig: {
      findUnique: async (args: any) => state.configCompanies.has(args.where.companyId) ? state.config : null,
    },
    logisticaRoute: {
      findFirst: async (args: any) => {
        const where = args.where || {};
        if (where.companyId != null && where.companyId !== state.route.companyId) return null;
        if (where.id && where.id !== state.route.id) return null;
        if (where.entregadorId && where.entregadorId !== state.route.entregadorId) return null;
        if (where.routeDate && where.routeDate !== state.route.routeDate) return null;
        if (where.mode && where.mode !== state.route.mode) return null;
        if (where.status && !matchesStatus(state.route.status, where.status)) return null;
        return { ...state.route };
      },
      findMany: async (args: any) => {
        const where = args.where || {};
        if (where.companyId !== state.route.companyId || (where.mode && where.mode !== state.route.mode)) return [];
        if (where.entregadorId && where.entregadorId !== state.route.entregadorId) return [];
        if (where.status && !matchesStatus(state.route.status, where.status)) return [];
        if (where.OR) {
          const visible = where.OR.some((condition: any) => {
            if (condition.status !== state.route.status) return false;
            if (condition.completedAt?.gte) return !!state.route.completedAt && state.route.completedAt >= condition.completedAt.gte;
            return true;
          });
          if (!visible) return [];
        }
        if (args.select?.trackingSession) {
          return [{
            ...state.route,
            entregador: { id: 7, name: 'João', username: 'joao', email: 'joao@hbx.test' },
            trackingSession: state.session ? { ...state.session } : null,
            stops: [...state.stops].map(([, status]) => ({ delivery: { status } })),
          }];
        }
        return [{ ...state.route }];
      },
      updateMany: async (args: any) => {
        if (args.where.companyId !== state.route.companyId || args.where.id !== state.route.id) return { count: 0 };
        if (args.where.status && !matchesStatus(state.route.status, args.where.status)) return { count: 0 };
        Object.assign(state.route, args.data);
        return { count: 1 };
      },
    },
    logisticaTrackingSession: trackingSession,
    logisticaTrackingPoint: trackingPoint,
    logisticaTrackingEvent: trackingEvent,
    logisticaRouteStop: {
      findMany: async (args: any) => [...state.stops.keys()]
        .filter((id) => args.where.deliveryId.in.includes(id))
        .map((deliveryId) => ({ deliveryId })),
      findFirst: async (args: any) => state.stops.has(args.where.deliveryId) ? { id: 'stop-1' } : null,
      count: async () => [...state.stops.values()]
        .filter((status) => !['entregue', 'cancelada'].includes(status)).length,
    },
  };
  prisma.$queryRawUnsafe = async () => {
    if (state.routeLockGate) {
      const gate = state.routeLockGate;
      state.routeLockGate = null;
      gate.markStarted();
      await gate.waitForRelease;
    }
    return [];
  };
  prisma.$transaction = async (callback: any) => callback(prisma);

  const mobileDevices: any = {
    authenticateDeviceCredential: async () => ({ ...state.device }),
    assertUserCanUseLogistica: async () => ({ id: state.device.userId }),
    touchAuthenticatedDevice: async () => undefined,
  };
  const service = new LogisticaTrackingService(prisma, mobileDevices);
  return {
    service,
    state,
    pauseNextRouteLock: () => {
      let markStarted!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => { markStarted = resolve; });
      const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
      state.routeLockGate = { started, markStarted, waitForRelease, release };
      return { started, release };
    },
  };
}

function point(overrides: Record<string, unknown> = {}) {
  return {
    clientPointId: randomUUID(),
    sequence: 1,
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    lat: -23.5505,
    lng: -46.6333,
    accuracyM: 12,
    speedMps: 4,
    bearingDeg: 90,
    eventType: 'PERIODIC' as const,
    ...overrides,
  };
}

test('metadados operacionais omitem routeMode por padrão e expõem somente trackingRequired', async () => {
  const { service } = setup({ session: true });
  const operational = await service.getOperationalRouteMetadata(3, 7, '2026-07-13');

  assert.equal(operational.routeId, 'route-1');
  assert.equal(operational.trackingRequired, true);
  assert.equal(Object.prototype.hasOwnProperty.call(operational, 'routeMode'), false);

  const administrative = await service.getOperationalRouteMetadata(3, 7, '2026-07-13', true);
  assert.equal(administrative.routeMode, 'TRACKED');
});

async function withTrackingEnabled<T>(callback: () => Promise<T>) {
  const before = process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  process.env.HBX_LOGISTICA_TRACKING_ENABLED = 'true';
  try {
    return await callback();
  } finally {
    if (before === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
    else process.env.HBX_LOGISTICA_TRACKING_ENABLED = before;
  }
}

test('rota TRACKED cria sessão no start web e o primeiro aparelho do próprio motorista faz binding imutável', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup();
    const created = await service.ensureSessionForStartedRoute(3, 'route-1', state.route.startedAt);
    assert.equal(created.deviceId, null);

    const first = await service.startSession({ ...CREDENTIAL, routeId: 'route-1' });
    assert.equal(first.replayed, false);
    assert.equal(state.session.deviceId, 'device-1');

    const replay = await service.startSession({ ...CREDENTIAL, routeId: 'route-1' });
    assert.equal(replay.replayed, true);

    state.device = { ...state.device, id: 'device-2' };
    await assert.rejects(
      service.startSession({ ...CREDENTIAL, routeId: 'route-1' }),
      /vinculada a outro aparelho/i,
    );
  });
});

test('POST rota/iniciar cria a sessão TRACKED antes de ativar a rota e expõe somente metadados operacionais', async () => {
  const calls: string[] = [];
  const delivery: any = {
    id: 'delivery-1',
    entregadorId: 7,
    status: 'agendada',
    rotaOrdem: null,
    scheduledAt: new Date('2026-07-13T12:00:00.000Z'),
    local: null,
    customerProfile: { name: 'Cliente', lat: -23.55, lng: -46.63 },
  };
  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) },
    entrega: {
      findMany: async () => [delivery],
      // piso da numeração: nada fechado nesta bancada ⇒ piso 0.
      aggregate: async () => ({ _max: { rotaOrdem: null } }),
      updateMany: async (args: any) => {
        if (args.data.status === 'em_rota') Object.assign(delivery, args.data);
        return { count: 1 };
      },
    },
    // PR17072026 — iniciarRota zera operationalEndedAt (marca de rota encerrada,
    // decoupled da cobrança) ao (re)iniciar. Mock no-op: sem rota encerrada aqui.
    logisticaRoute: { updateMany: async () => ({ count: 0 }) },
  };
  const routeBilling: any = {
    prepareRoute: async () => ({
      routeId: 'route-1',
      mode: 'TRACKED',
      status: 'PLANNED',
      routeDate: '2026-07-13',
      deliveryCount: 1,
      requiredBlocks: 0,
      newlyDebitedBlocks: 0,
      billingRevision: 0,
    }),
    beginInitialization: async () => ({ token: 'lease-1', alreadyActive: false }),
    activateRoute: async () => { calls.push('activate'); },
    failInitialization: async () => { calls.push('fail'); },
  };
  const tracking: any = {
    ensureSessionForStartedRoute: async () => {
      calls.push('session');
      return { id: 'session-1' };
    },
    discardUnboundSessionAfterRouteFailure: async () => undefined,
    getOperationalRouteMetadata: async () => ({
      routeId: 'route-1',
      trackingRequired: true,
      routeMode: 'TRACKED',
      routeStatus: 'ACTIVE',
      trackingSessionId: 'session-1',
      trackingStatus: 'ACTIVE',
    }),
  };
  const rota = new LogisticaRotaService(prisma, routeBilling, tracking);
  const result = await rota.iniciarRota(
    3,
    { date: '2026-07-13', origemLat: -23.55, origemLng: -46.63 },
    7,
    7,
  );
  assert.deepEqual(calls, ['session', 'activate']);
  assert.equal(result.routeId, 'route-1');
  assert.equal(result.trackingRequired, true);
  assert.equal(result.trackingSessionId, 'session-1');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'routeMode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'billingRevision'), false);
});

test('POST rota/iniciar não move a entrega para em_rota quando a rota comercial já está COMPLETED', async () => {
  const delivery: any = {
    id: 'delivery-completed',
    entregadorId: 7,
    status: 'agendada',
    rotaOrdem: null,
    scheduledAt: new Date('2026-07-13T12:00:00.000Z'),
    local: null,
    customerProfile: { name: 'Cliente', lat: -23.55, lng: -46.63 },
  };
  let beginCalls = 0;
  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) },
    entrega: {
      findMany: async () => [delivery],
      // piso da numeração: nada fechado nesta bancada ⇒ piso 0.
      aggregate: async () => ({ _max: { rotaOrdem: null } }),
      updateMany: async (args: any) => {
        if (args.data.status) Object.assign(delivery, args.data);
        return { count: 1 };
      },
    },
  };
  const routeBilling: any = {
    prepareRoute: async () => { throw new Error('Esta rota já foi concluída e não pode ser iniciada novamente.'); },
    beginInitialization: async () => { beginCalls += 1; },
  };
  const rota = new LogisticaRotaService(prisma, routeBilling, undefined);

  await assert.rejects(
    rota.iniciarRota(3, { date: '2026-07-13' }, 7, 7),
    /já foi concluída/i,
  );
  assert.equal(delivery.status, 'agendada');
  assert.equal(beginCalls, 0);
});

test('start/bind rejeita aparelho cross-driver e cross-company antes de tocar a sessão', async () => {
  await withTrackingEnabled(async () => {
    const driverCase = setup({ session: true });
    driverCase.state.session.deviceId = null;
    driverCase.state.device = { ...driverCase.state.device, userId: 8 };
    await assert.rejects(
      driverCase.service.startSession({ ...CREDENTIAL, routeId: 'route-1' }),
      /não encontrada/i,
    );
    assert.equal(driverCase.state.session.deviceId, null);

    const tenantCase = setup({ session: true });
    tenantCase.state.session.deviceId = null;
    tenantCase.state.configCompanies.add(4);
    tenantCase.state.device = { ...tenantCase.state.device, companyId: 4 };
    await assert.rejects(
      tenantCase.service.startSession({ ...CREDENTIAL, routeId: 'route-1' }),
      /não encontrada/i,
    );
    assert.equal(tenantCase.state.session.deviceId, null);
  });
});

test('feature flag global e toggle do tenant bloqueiam qualquer escrita de tracking', async () => {
  const before = process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  try {
    const globalOff = setup({ session: true });
    await assert.rejects(
      globalOff.service.startSession({ ...CREDENTIAL, routeId: 'route-1' }),
      /temporariamente indisponível/i,
    );
  } finally {
    if (before === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
    else process.env.HBX_LOGISTICA_TRACKING_ENABLED = before;
  }

  await withTrackingEnabled(async () => {
    const tenantOff = setup({ session: true });
    tenantOff.state.config.trackingAtivo = false;
    await assert.rejects(
      tenantOff.service.ingestPositions('session-1', { ...CREDENTIAL, points: [point()] }),
      /não está habilitado para esta empresa/i,
    );
    assert.equal(tenantOff.state.points.length, 0);
  });
});

test('batch rejeita ponto velho, futuro, impreciso, fora dos bounds e salto impossível; retry exato deduplica', async () => {
  await withTrackingEnabled(async () => {
    const { service } = setup({ session: true, sessionStartedAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });
    const valid = point({ clientPointId: randomUUID(), sequence: 1 });
    const result = await service.ingestPositions('session-1', {
      ...CREDENTIAL,
      points: [
        valid,
        point({ clientPointId: randomUUID(), sequence: 2, accuracyM: 180 }),
        point({ clientPointId: randomUUID(), sequence: 3, capturedAt: new Date(Date.now() + 5 * 60_000).toISOString() }),
        point({ clientPointId: randomUUID(), sequence: 4, capturedAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString() }),
        point({ clientPointId: randomUUID(), sequence: 5, lat: 93 }),
        point({ clientPointId: randomUUID(), sequence: 6, capturedAt: new Date(Date.now() - 50_000).toISOString(), lat: -20 }),
      ],
    });
    assert.deepEqual(result.accepted, [valid.clientPointId]);
    assert.equal(result.sessionStatus, 'ACTIVE');
    assert.equal(result.routeActive, true);
    assert.equal(result.captureAllowed, true);
    assert.deepEqual(new Set(result.rejected.map((row: any) => row.code)), new Set([
      'INVALID_ACCURACY',
      'POINT_IN_FUTURE',
      'POINT_TOO_OLD',
      'INVALID_COORDINATES',
      'IMPOSSIBLE_JUMP',
    ]));

    const replay = await service.ingestPositions('session-1', { ...CREDENTIAL, points: [valid] });
    assert.deepEqual(replay.accepted, []);
    assert.deepEqual(replay.duplicates, [valid.clientPointId]);
  });
});

test('backlog plausível fora de ordem é aceito sem regredir a última posição', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup({ session: true });
    const newer = point({ sequence: 10, capturedAt: new Date(Date.now() - 10_000).toISOString(), lat: -23.5504 });
    await service.ingestPositions('session-1', { ...CREDENTIAL, points: [newer] });
    const latestBefore = state.session.lastPointAt.getTime();
    const older = point({ sequence: 9, capturedAt: new Date(Date.now() - 20_000).toISOString(), lat: -23.55045 });
    const response = await service.ingestPositions('session-1', { ...CREDENTIAL, points: [older] });
    assert.deepEqual(response.accepted, [older.clientPointId]);
    assert.equal(state.session.lastPointAt.getTime(), latestBefore);
  });
});

test('corrida com mesma sequence e payload divergente nunca recebe ACK falso', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup({ session: true });
    const candidate = point({ sequence: 4 });
    state.racePoint = {
      companyId: 3,
      sessionId: 'session-1',
      deliveryId: null,
      clientPointId: randomUUID(),
      sequence: 4,
      capturedAt: new Date(candidate.capturedAt),
      receivedAt: new Date(),
      latitude: -10,
      longitude: -40,
      accuracyM: 10,
      speedMps: 1,
      bearingDeg: 0,
      eventType: 'PERIODIC',
    };
    const response = await service.ingestPositions('session-1', { ...CREDENTIAL, points: [candidate] });
    assert.deepEqual(response.accepted, []);
    assert.equal(response.rejected[0].code, 'DUPLICATE_CONFLICT');
  });
});

test('END retorna 409 com stop aberto; o mesmo eventId encerra e deduplica após a entrega terminal', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup({ session: true });
    const eventId = randomUUID();
    const capturedAt = new Date().toISOString();
    const endPoint = point({ sequence: 99, capturedAt, eventType: 'END' });
    await assert.rejects(
      service.recordEvent('session-1', { ...CREDENTIAL, eventId, type: 'END', capturedAt, point: endPoint }),
      (error: any) => error?.getStatus?.() === 409,
    );
    assert.equal(state.events.length, 0);
    assert.equal(state.points.length, 0);

    state.stops.set('delivery-1', 'entregue');
    const ended = await service.recordEvent('session-1', { ...CREDENTIAL, eventId, type: 'END', capturedAt, point: endPoint });
    assert.equal(ended.status, 'ENDED');
    assert.equal(ended.sessionStatus, 'ENDED');
    assert.equal(ended.routeActive, false);
    assert.equal(ended.captureAllowed, false);
    assert.equal(state.route.status, 'COMPLETED');
    const recent = await service.getLive(3);
    assert.equal(recent.routes[0].routeStatus, 'COMPLETED');
    assert.equal(recent.routes[0].active, false);

    const replay = await service.recordEvent('session-1', { ...CREDENTIAL, eventId, type: 'END', capturedAt, point: endPoint });
    assert.equal(replay.replayed, true);
    assert.equal(replay.captureAllowed, false);
    const pointReplay = await service.ingestPositions('session-1', { ...CREDENTIAL, points: [endPoint] });
    assert.deepEqual(pointReplay.duplicates, [endPoint.clientPointId]);
    assert.equal(pointReplay.captureAllowed, false, 'ACK autoritativo encerra captura sem perder replay da outbox');
    await assert.rejects(
      service.recordEvent('session-1', {
        ...CREDENTIAL,
        eventId,
        type: 'ARRIVAL',
        deliveryId: 'delivery-1',
        capturedAt,
      }),
      /reutilizado com outro conteúdo/i,
    );
  });
});

test('barreira determinística: append que vence antes da trava faz END recontar e permanecer ACTIVE', async () => {
  await withTrackingEnabled(async () => {
    const { service, state, pauseNextRouteLock } = setup({ session: true });
    state.stops.set('delivery-1', 'entregue');
    const gate = pauseNextRouteLock();
    const capturedAt = new Date().toISOString();
    const pendingEnd = service.recordEvent('session-1', {
      ...CREDENTIAL,
      eventId: randomUUID(),
      type: 'END',
      capturedAt,
    });
    const expectedConflict = assert.rejects(
      pendingEnd,
      (error: any) => error?.getStatus?.() === 409 && /entregas abertas/i.test(error.message),
    );

    await gate.started;
    // Simula o append que commitou enquanto END aguardava a mesma advisory lock.
    state.stops.set('delivery-late', 'agendada');
    gate.release();
    await expectedConflict;
    assert.equal(state.session.status, 'ACTIVE');
    assert.equal(state.route.status, 'ACTIVE');
    assert.equal(state.events.length, 0);
  });
});

test('evento aceita fix GPS real até 120s anterior e rejeita ponto posterior ao marco', async () => {
  await withTrackingEnabled(async () => {
    const { service } = setup({ session: true });
    const capturedAt = new Date();
    const accepted = await service.recordEvent('session-1', {
      ...CREDENTIAL,
      eventId: randomUUID(),
      type: 'ARRIVAL',
      deliveryId: 'delivery-1',
      capturedAt: capturedAt.toISOString(),
      point: point({
        sequence: 20,
        capturedAt: new Date(capturedAt.getTime() - 60_000).toISOString(),
        eventType: 'ARRIVAL',
        deliveryId: 'delivery-1',
      }),
    });
    assert.equal(accepted.status, 'ACTIVE');

    await assert.rejects(
      service.recordEvent('session-1', {
        ...CREDENTIAL,
        eventId: randomUUID(),
        type: 'ARRIVAL',
        deliveryId: 'delivery-1',
        capturedAt: capturedAt.toISOString(),
        point: point({
          sequence: 21,
          capturedAt: new Date(capturedAt.getTime() + 1_000).toISOString(),
          eventType: 'ARRIVAL',
          deliveryId: 'delivery-1',
        }),
      }),
      /fix recente anterior/i,
    );
  });
});

test('END de outbox longa encerra a sessão mesmo descartando coordenada com mais de 24h', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup({
      session: true,
      sessionStartedAt: new Date(Date.now() - 30 * 60 * 60_000),
    });
    state.stops.set('delivery-1', 'cancelada');
    const capturedAt = new Date(Date.now() - 25 * 60 * 60_000);
    const response = await service.recordEvent('session-1', {
      ...CREDENTIAL,
      eventId: randomUUID(),
      type: 'END',
      capturedAt: capturedAt.toISOString(),
      point: point({ sequence: 30, capturedAt: capturedAt.toISOString(), eventType: 'END' }),
    });
    assert.equal(response.status, 'ENDED');
    assert.equal(response.pointRejected?.code, 'POINT_TOO_OLD');
    assert.equal(state.points.length, 0);
  });
});

test('live/history serializam unidades públicas e mantêm leitura company-scoped', async () => {
  await withTrackingEnabled(async () => {
    const { service, state } = setup({ session: true });
    const tracked = point({ sequence: 1, speedMps: 5 });
    await service.ingestPositions('session-1', { ...CREDENTIAL, points: [tracked] });
    const live = await service.getLive(3);
    assert.equal(live.routes[0].lastPosition.accuracyMeters, 12);
    assert.equal(live.routes[0].lastPosition.speedKmh, 18);
    const history = await service.getHistory(3, 'session-1', 500);
    assert.equal(history.points[0].latitude, tracked.lat);
    assert.equal(history.points[0].accuracyMeters, 12);
    await assert.rejects(service.getHistory(99, 'session-1', 500), /não encontrada/i);
    assert.equal(state.points.length, 1);
  });
});

test('histórico limita pelos registros mais recentes e só então devolve ordem ASC', async () => {
  const { service, state } = setup({ session: true });
  const base = Date.now() - 10_000;
  for (let sequence = 1; sequence <= 5; sequence++) {
    state.points.push({
      id: `point-${sequence}`,
      companyId: 3,
      sessionId: 'session-1',
      clientPointId: `client-${sequence}`,
      sequence,
      capturedAt: new Date(base + sequence * 1_000),
      latitude: -23.5 + sequence / 10_000,
      longitude: -46.6,
      accuracyM: 10,
      speedMps: 1,
      eventType: 'PERIODIC',
      deliveryId: null,
    });
  }
  for (let index = 1; index <= 3; index++) {
    state.events.push({
      id: `event-${index}`,
      companyId: 3,
      sessionId: 'session-1',
      clientEventId: `event-client-${index}`,
      type: 'ARRIVAL',
      deliveryId: 'delivery-1',
      capturedAt: new Date(base + index * 1_000),
      createdAt: new Date(base + index * 1_000),
    });
  }

  const history = await service.getHistory(3, 'session-1', 2);
  assert.deepEqual(history.points.map((row: any) => row.latitude), [
    -23.5 + 4 / 10_000,
    -23.5 + 5 / 10_000,
  ]);
  assert.deepEqual(history.events.map((row: any) => row.capturedAt), [
    new Date(base + 2_000).toISOString(),
    new Date(base + 3_000).toISOString(),
  ]);
});
