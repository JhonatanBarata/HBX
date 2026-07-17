import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalDeepEnrichmentWorkIdentity,
  computeMissionBackoffMs,
  computeMissionLagEngineTarget,
  isMissionQueueEnabled,
  resolveMissionLeaseTtlMs,
  RadarMissionQueueService,
} from './radar-mission-queue.service';

// ─── Fake Prisma em memória (só as formas de query que o serviço usa) ───────────────────────────

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('lte' in cond && !(value instanceof Date && value.getTime() <= cond.lte.getTime())) return false;
      if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
    } else if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data || {})) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[key] = (Number(row[key]) || 0) + Number((value as any).increment);
    } else {
      row[key] = value;
    }
  }
  row.updatedAt = new Date();
}

function createFakePrisma(options: { cursorEnabled?: boolean | null; hasCursorTable?: boolean; activeSessions?: number; hasAuthSessionTable?: boolean } = {}) {
  const missions: Row[] = [];
  let nextId = 1;
  const tableSet = new Set(['RadarMission']);
  if (options.hasCursorTable !== false) tableSet.add('RadarFactoryCursor');
  if (options.hasAuthSessionTable !== false) tableSet.add('AuthSession');
  const fake = {
    missions,
    hasTable: async (name: string) => tableSet.has(name),
    radarFactoryCursor: {
      upsert: async () => ({ enabled: options.cursorEnabled == null ? true : options.cursorEnabled }),
    },
    authSession: {
      // conta "sessões ativas na janela" — o teste injeta o número direto (não simula lastSeenAt real)
      count: async () => Math.max(0, Math.trunc(Number(options.activeSessions) || 0)),
    },
    radarMission: {
      create: async ({ data }: any) => {
        const row: Row = { id: `m${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        missions.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = missions.find((item) => item.id === where.id);
        if (!row) throw new Error('not found');
        applyData(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = missions.filter((item) => matchesWhere(item, where));
        rows.forEach((row) => applyData(row, data));
        return { count: rows.length };
      },
      // leituras devolvem CÓPIAS (como o Prisma real: rows destacadas do estado) — o serviço monta o
      // DTO do lease a partir do snapshot PRÉ-claim; referência viva vazaria o increment do claim.
      findUnique: async ({ where }: any) => {
        if (where.stage_dedupeKey) {
          const { stage, dedupeKey } = where.stage_dedupeKey;
          const row = missions.find((item) => item.stage === stage && item.dedupeKey === dedupeKey);
          return row ? { ...row } : null;
        }
        const row = missions.find((item) => item.id === where.id);
        return row ? { ...row } : null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        const rows = missions.filter((item) => matchesWhere(item, where));
        if (orderBy?.nextAttemptAt === 'asc') rows.sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime());
        return rows[0] ? { ...rows[0] } : null;
      },
      findMany: async ({ where, take }: any) => {
        const rows = missions.filter((item) => matchesWhere(item, where));
        rows.sort((a, b) => (b.priority || 0) - (a.priority || 0)
          || a.nextAttemptAt?.getTime() - b.nextAttemptAt?.getTime()
          || a.createdAt.getTime() - b.createdAt.getTime());
        return rows.slice(0, take || rows.length).map((row) => ({ ...row }));
      },
      count: async ({ where }: any) => missions.filter((item) => matchesWhere(item, where)).length,
      groupBy: async () => [],
    },
  };
  return fake;
}

function buildService(options: Parameters<typeof createFakePrisma>[0] = {}) {
  const fake = createFakePrisma({ cursorEnabled: true, ...options });
  const service = new RadarMissionQueueService(fake as any);
  return { fake, service };
}

function withMissionFlags(input: { queue: boolean; local: boolean; ai4b?: boolean }, run: () => Promise<void>) {
  const names = ['HBX_MISSION_QUEUE_ENABLED', 'HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED', 'HBX_RADAR_AI_SANEAMENTO_ENABLED'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HBX_MISSION_QUEUE_ENABLED = input.queue ? 'true' : 'false';
  process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED = input.local ? 'true' : 'false';
  process.env.HBX_RADAR_AI_SANEAMENTO_ENABLED = input.ai4b ? 'true' : 'false';
  return run().finally(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

// ─── Funções puras ───────────────────────────────────────────────────────────────────────────────

test('computeMissionBackoffMs: exponencial 30s·2^(n-1) com teto de 15min', () => {
  assert.equal(computeMissionBackoffMs(1), 30_000);
  assert.equal(computeMissionBackoffMs(2), 60_000);
  assert.equal(computeMissionBackoffMs(3), 120_000);
  assert.equal(computeMissionBackoffMs(99), 15 * 60_000);
  assert.equal(computeMissionBackoffMs(0), 30_000);
});

test('computeMissionLagEngineTarget: fila vazia = 0 (mata demanda falsa); nunca excede o teto', () => {
  assert.equal(computeMissionLagEngineTarget({ queuedDue: 0, oldestQueuedAgeMs: 0, allowedEngines: 10 }), 0);
  assert.equal(computeMissionLagEngineTarget({ queuedDue: 3, oldestQueuedAgeMs: 0, allowedEngines: 10 }), 3);
  assert.equal(computeMissionLagEngineTarget({ queuedDue: 50, oldestQueuedAgeMs: 0, allowedEngines: 10 }), 10);
  // idade ≥ 10min = pressão total (até o teto)
  assert.equal(computeMissionLagEngineTarget({ queuedDue: 1, oldestQueuedAgeMs: 11 * 60_000, allowedEngines: 10 }), 10);
  // teto por fonte acima de qualquer escala
  assert.equal(computeMissionLagEngineTarget({ queuedDue: 100, oldestQueuedAgeMs: 60 * 60_000, allowedEngines: 0 }), 0);
});

test('resolveMissionLeaseTtlMs: default 120s, clamp 30s–900s', () => {
  const prev = process.env.HBX_MISSION_LEASE_TTL_SECONDS;
  delete process.env.HBX_MISSION_LEASE_TTL_SECONDS;
  assert.equal(resolveMissionLeaseTtlMs(), 120_000);
  process.env.HBX_MISSION_LEASE_TTL_SECONDS = '5';
  assert.equal(resolveMissionLeaseTtlMs(), 30_000);
  process.env.HBX_MISSION_LEASE_TTL_SECONDS = '3600';
  assert.equal(resolveMissionLeaseTtlMs(), 900_000);
  if (prev == null) delete process.env.HBX_MISSION_LEASE_TTL_SECONDS;
  else process.env.HBX_MISSION_LEASE_TTL_SECONDS = prev;
});

test('isMissionQueueEnabled: default OFF (aditivo/reversível)', () => {
  assert.equal(isMissionQueueEnabled({}), false);
  assert.equal(isMissionQueueEnabled({ HBX_MISSION_QUEUE_ENABLED: 'true' } as any), true);
  assert.equal(isMissionQueueEnabled({ HBX_MISSION_QUEUE_ENABLED: 'false' } as any), false);
});

test('work identity local é estável e muda quando fonte relevante muda', () => {
  const base = {
    radarLeadId: 'lead-1',
    name: 'Empresa Árvore Ltda',
    city: 'Xangri-lá',
    state: 'RS',
    website: 'https://empresa.invalid/',
  };
  const first = buildLocalDeepEnrichmentWorkIdentity(base);
  const same = buildLocalDeepEnrichmentWorkIdentity({ ...base, name: '  EMPRESA ÁRVORE LTDA  ' });
  const changed = buildLocalDeepEnrichmentWorkIdentity({ ...base, website: 'https://novo.invalid' });
  assert.equal(first.workHash, same.workHash);
  assert.equal(first.workVersion, same.workVersion);
  assert.notEqual(first.workHash, changed.workHash);
  assert.match(first.dedupeKey, /^radar:lead-1:work:\d+$/);
});

// ─── Serviço (fila) ──────────────────────────────────────────────────────────────────────────────

test('pausa real: cursor desligado → lease devolve vazio e nada drena', async () => {
  const { fake, service } = buildService({ cursorEnabled: false });
  await service.enqueue({ stage: 'alvo', payload: { x: 1 } });
  const result = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 5 });
  assert.equal(result.paused, true);
  assert.equal(result.missions.length, 0);
  assert.equal(fake.missions[0].status, 'queued');
});

test('cursor ausente materializa o default ligado e não trava a primeira ativação', async () => {
  const { service } = buildService({ cursorEnabled: null });
  await service.enqueue({ stage: 'alvo', payload: { x: 1 } });
  const result = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 5 });
  assert.equal(result.paused, false);
  assert.equal(result.missions.length, 1);
});

test('enrich_search_item de pesquisa manual nao herda a pausa da fabrica', async () => {
  const { service } = buildService({ cursorEnabled: false });
  await service.enqueue({
    stage: 'enrich_search_item',
    payload: { mode: 'web', leadId: 'item-1' },
    dedupeKey: 'run:r1:item:item-1:web',
  });
  const result = await service.lease({
    workerId: 'backend-post-save',
    stages: ['enrich_search_item'],
    batchSize: 1,
  });
  assert.equal(result.paused, false);
  assert.equal(result.missions.length, 1);
  assert.equal(result.missions[0].stage, 'enrich_search_item');
});

test('local_deep_enrich_v1 não herda pausa da fábrica e lease vazio nunca significa todos', async () => {
  const { service } = buildService({ cursorEnabled: false });
  await service.enqueue({
    stage: 'local_deep_enrich_v1',
    payload: { radarLeadId: 'lead-local' },
    dedupeKey: 'local:lead-local:1',
    rearmTerminal: false,
  });
  const empty = await service.lease({ workerId: 'sem-allowlist', batchSize: 1 });
  assert.equal(empty.missions.length, 0);
  const local = await service.lease({ workerId: 'owner-local', stages: ['local_deep_enrich_v1'], batchSize: 1 });
  assert.equal(local.paused, false);
  assert.equal(local.missions.length, 1);
  assert.equal(local.missions[0].stage, 'local_deep_enrich_v1');
});

test('pausa falha fechada quando tabela existe mas delegate Prisma não existe', async () => {
  const service = new RadarMissionQueueService({
    hasTable: async (name: string) => name === 'RadarFactoryCursor',
  } as any);
  assert.equal(await service.isQueuePaused(), true);
});

test('lease: claim otimista, attempts incrementa, segunda passada não pega a mesma missão', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: { taskId: 't1' }, dedupeKey: 'task:t1' });
  const first = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 5 });
  assert.equal(first.missions.length, 1);
  assert.equal(first.missions[0].attempts, 1);
  assert.equal(fake.missions[0].status, 'leased');
  const second = await service.lease({ workerId: 'w2', stages: ['alvo'], batchSize: 5 });
  assert.equal(second.missions.length, 0);
});

test('enqueue idempotente: dedupeKey vivo não duplica; terminal re-arma', async () => {
  const { fake, service } = buildService();
  const a = await service.enqueue({ stage: 'alvo', payload: { v: 1 }, dedupeKey: 'k' });
  const b = await service.enqueue({ stage: 'alvo', payload: { v: 2 }, dedupeKey: 'k' });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(fake.missions.length, 1);
  fake.missions[0].status = 'dead';
  const c = await service.enqueue({ stage: 'alvo', payload: { v: 3 }, dedupeKey: 'k' });
  assert.equal(c.created, true);
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].status, 'queued');
  assert.equal(fake.missions[0].attempts, 0);
});

test('contrato local: terminal não rearma e prioridade pós-entrega atualiza a mesma missão', async () => {
  const { fake, service } = buildService();
  const first = await service.enqueue({
    stage: 'local_deep_enrich_v1',
    payload: { radarLeadId: 'lead-1', companyId: null },
    dedupeKey: 'radar:lead-1:work:1',
    priority: 0,
    rearmTerminal: false,
  });
  const bumped = await service.enqueue({
    stage: 'local_deep_enrich_v1',
    payload: { radarLeadId: 'lead-1', companyId: 7 },
    dedupeKey: 'radar:lead-1:work:1',
    priority: 100,
    companyId: 7,
    rearmTerminal: false,
  });
  assert.equal(first.missionId, bumped.missionId);
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].priority, 100);
  assert.equal(fake.missions[0].payloadJson.companyId, 7);
  fake.missions[0].status = 'completed';
  const terminal = await service.enqueue({
    stage: 'local_deep_enrich_v1',
    payload: { radarLeadId: 'lead-1' },
    dedupeKey: 'radar:lead-1:work:1',
    rearmTerminal: false,
  });
  assert.equal(terminal.created, false);
  assert.equal(fake.missions[0].status, 'completed');
});

test('enqueueLocalDeepEnrichment é default OFF e materializa tenant/lead/version quando habilitado', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: false, local: false }, async () => {
    const disabled = await service.enqueueLocalDeepEnrichment({ radarLeadId: 'lead-1', name: 'Empresa Um' });
    assert.equal(disabled.missionId, null);
  });
  await withMissionFlags({ queue: true, local: true }, async () => {
    const enabled = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-1',
      name: 'Empresa Um',
      city: 'Xangri-lá',
      state: 'RS',
      companyId: 77,
      requestedByUserId: 9,
      priorityReason: 'delivered',
    });
    assert.ok(enabled.missionId);
    assert.equal(fake.missions[0].stage, 'local_deep_enrich_v1');
    assert.equal(fake.missions[0].radarLeadId, 'lead-1');
    assert.equal(fake.missions[0].companyId, 77);
    assert.equal(fake.missions[0].requestedByUserId, 9);
    assert.equal(fake.missions[0].consumerKind, 'owner_local');
    assert.ok(Number.isInteger(fake.missions[0].workVersion));
    assert.equal(fake.missions[0].priority, 100);
  });
});

test('reconciliador repõe missão ausente e preserva negativos/rejeitados', async () => {
  const { fake, service } = buildService();
  const originalHasTable = fake.hasTable;
  fake.hasTable = async (name: string) => name === 'RadarLeadPool' || originalHasTable(name);
  (fake as any).radarLeadPool = {
    findMany: async () => [
      { id: 'lead-clean', name: 'Empresa Limpa', city: 'Xangri-lá', state: 'RS', status: 'clean', updatedAt: new Date() },
      { id: 'lead-negative', name: 'Empresa Invalidada', city: 'Xangri-lá', state: 'RS', status: 'rejected', updatedAt: new Date() },
    ],
  };
  await withMissionFlags({ queue: true, local: true }, async () => {
    const first = await service.reconcileLocalDeepEnrichmentMissions();
    const second = await service.reconcileLocalDeepEnrichmentMissions();
    assert.deepEqual(first, { scanned: 2, enqueued: 1 });
    assert.deepEqual(second, { scanned: 2, enqueued: 0 });
  });
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].payloadJson.radarLeadId, 'lead-clean');
});

test('heartbeat: estende só com leaseId certo', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  const mission = missions[0];
  assert.equal((await service.heartbeat(mission.id, mission.leaseId)).ok, true);
  assert.equal((await service.heartbeat(mission.id, 'lease-errado')).ok, false);
});

test('complete: idempotente com o mesmo leaseId; lease alheio é stale', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  const mission = missions[0];
  const first = await service.complete(mission.id, mission.leaseId, { ok: 1 });
  assert.equal(first.ok, true);
  const again = await service.complete(mission.id, mission.leaseId, { ok: 1 });
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
  const stale = await service.complete(mission.id, 'outro-lease');
  assert.equal(stale.ok, false);
  assert.equal(fake.missions[0].status, 'completed');
});

test('fail: retryable re-enfileira com backoff; tentativas esgotadas → dead-letter', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 2 });
  let leased = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  const fail1 = await service.fail(leased.missions[0].id, leased.missions[0].leaseId, 'timeout', true);
  assert.equal(fail1.status, 'queued');
  assert.ok(fake.missions[0].nextAttemptAt.getTime() > Date.now());
  // backoff futuro: lease imediato não pega
  leased = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  assert.equal(leased.missions.length, 0);
  fake.missions[0].nextAttemptAt = new Date(Date.now() - 1000);
  leased = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  assert.equal(leased.missions.length, 1);
  const fail2 = await service.fail(leased.missions[0].id, leased.missions[0].leaseId, 'timeout de novo', true);
  assert.equal(fail2.status, 'dead');
  assert.equal(fake.missions[0].status, 'dead');
});

test('fail não-retryable vai direto pro dead-letter', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 5 });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  const failed = await service.fail(missions[0].id, missions[0].leaseId, 'erro permanente', false);
  assert.equal(failed.status, 'dead');
  assert.equal(fake.missions[0].status, 'dead');
});

test('lease vencido volta pra fila sozinho (kill -9 → re-enfileira); heartbeat concorrente não é derrubado', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 3 });
  await service.enqueue({ stage: 'alvo', payload: {}, dedupeKey: 'vivo', maxAttempts: 3 });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 2 });
  assert.equal(missions.length, 2);
  // missão 1: lease vencido (worker morreu); missão 2: heartbeat mudou o leaseExpiresAt depois do scan
  fake.missions[0].leaseExpiresAt = new Date(Date.now() - 60_000);
  fake.missions[1].leaseExpiresAt = new Date(Date.now() + 120_000);
  const revived = await service.reviveExpiredLeases();
  assert.equal(revived, 1);
  assert.equal(fake.missions[0].status, 'queued');
  assert.equal(fake.missions[1].status, 'leased');
});

test('lease vencido com tentativas esgotadas vira dead-letter', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 1 });
  await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  fake.missions[0].leaseExpiresAt = new Date(Date.now() - 60_000);
  await service.reviveExpiredLeases();
  assert.equal(fake.missions[0].status, 'dead');
});

test('redriveDead: dead-letter volta pra fila com tentativas zeradas', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 1 });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  await service.fail(missions[0].id, missions[0].leaseId, 'x', false);
  assert.equal(fake.missions[0].status, 'dead');
  const { redriven } = await service.redriveDead({});
  assert.equal(redriven, 1);
  assert.equal(fake.missions[0].status, 'queued');
  assert.equal(fake.missions[0].attempts, 0);
});

test('lag da fila: conta só missão devida; idade do item mais velho', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  await service.enqueue({ stage: 'receita', payload: {} });
  fake.missions[1].nextAttemptAt = new Date(Date.now() + 60_000); // backoff futuro = não devida
  const lag = await service.getQueueLagSnapshot();
  assert.equal(lag.queuedDue, 1);
  assert.ok(lag.oldestQueuedAgeMs >= 0);
});

// ─── CHIP E1 (PONTE) ───────────────────────────────────────────────────────────────────────────

test('stage local: sinal de activity+lag viaja junto do lease, mas não pausa o stage', async () => {
  const { service } = buildService({ activeSessions: 3 });
  const result = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
  assert.ok(result.activity, 'lease traz activity');
  assert.equal(result.activity!.activeUsers, 3);
  assert.ok(result.lag, 'lease traz lag');
});

test('CHIP E1: activity degrada gracioso sem tabela AuthSession (activeUsers 0, não trava)', async () => {
  const { service } = buildService({ hasAuthSessionTable: false, activeSessions: 9 });
  const snap = await service.getActivitySnapshot();
  assert.equal(snap.activeUsers, 0);
  const result = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
  assert.equal(result.activity!.activeUsers, 0);
});

test('stage local_deep_enrich_v1 é leasável e getLeasedContext devolve stage+payload sob o lease', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'local_deep_enrich_v1', payload: { radarLeadId: 'lead-9' }, dedupeKey: 'lead:lead-9' });
  const leased = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
  assert.equal(leased.missions.length, 1);
  const m = leased.missions[0];
  const ctx = await service.getLeasedContext(m.id, m.leaseId);
  assert.equal(ctx.ok, true);
  if (ctx.ok) {
    assert.equal(ctx.stage, 'local_deep_enrich_v1');
    assert.equal((ctx.payload as any).radarLeadId, 'lead-9');
    assert.ok(!ctx.alreadyCompleted);
  }
  // lease alheio → stale
  const stale = await service.getLeasedContext(m.id, 'lease-errado');
  assert.equal(stale.ok, false);
});

test('CHIP E1: getLeasedContext após complete sinaliza alreadyCompleted (idempotência do apply)', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'local_deep_enrich_v1', payload: { radarLeadId: 'l1' }, dedupeKey: 'lead:l1' });
  const leased = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
  const m = leased.missions[0];
  await service.complete(m.id, m.leaseId, { ok: true });
  const ctx = await service.getLeasedContext(m.id, m.leaseId);
  assert.equal(ctx.ok, true);
  if (ctx.ok) assert.equal(ctx.alreadyCompleted, true);
});
