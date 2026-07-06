import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
      findUnique: async () => (options.cursorEnabled == null ? null : { enabled: options.cursorEnabled }),
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

// ─── Serviço (fila) ──────────────────────────────────────────────────────────────────────────────

test('pausa real: cursor desligado/ausente → lease devolve vazio e nada drena', async () => {
  for (const cursorEnabled of [false, null]) {
    const { fake, service } = buildService({ cursorEnabled });
    await service.enqueue({ stage: 'alvo', payload: { x: 1 } });
    const result = await service.lease({ workerId: 'w1', batchSize: 5 });
    assert.equal(result.paused, true);
    assert.equal(result.missions.length, 0);
    assert.equal(fake.missions[0].status, 'queued');
  }
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

test('heartbeat: estende só com leaseId certo', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({ workerId: 'w1', batchSize: 1 });
  const mission = missions[0];
  assert.equal((await service.heartbeat(mission.id, mission.leaseId)).ok, true);
  assert.equal((await service.heartbeat(mission.id, 'lease-errado')).ok, false);
});

test('complete: idempotente com o mesmo leaseId; lease alheio é stale', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({ workerId: 'w1', batchSize: 1 });
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
  let leased = await service.lease({ workerId: 'w1', batchSize: 1 });
  const fail1 = await service.fail(leased.missions[0].id, leased.missions[0].leaseId, 'timeout', true);
  assert.equal(fail1.status, 'queued');
  assert.ok(fake.missions[0].nextAttemptAt.getTime() > Date.now());
  // backoff futuro: lease imediato não pega
  leased = await service.lease({ workerId: 'w1', batchSize: 1 });
  assert.equal(leased.missions.length, 0);
  fake.missions[0].nextAttemptAt = new Date(Date.now() - 1000);
  leased = await service.lease({ workerId: 'w1', batchSize: 1 });
  assert.equal(leased.missions.length, 1);
  const fail2 = await service.fail(leased.missions[0].id, leased.missions[0].leaseId, 'timeout de novo', true);
  assert.equal(fail2.status, 'dead');
  assert.equal(fake.missions[0].status, 'dead');
});

test('fail não-retryable vai direto pro dead-letter', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 5 });
  const { missions } = await service.lease({ workerId: 'w1', batchSize: 1 });
  const failed = await service.fail(missions[0].id, missions[0].leaseId, 'erro permanente', false);
  assert.equal(failed.status, 'dead');
  assert.equal(fake.missions[0].status, 'dead');
});

test('lease vencido volta pra fila sozinho (kill -9 → re-enfileira); heartbeat concorrente não é derrubado', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 3 });
  await service.enqueue({ stage: 'alvo', payload: {}, dedupeKey: 'vivo', maxAttempts: 3 });
  const { missions } = await service.lease({ workerId: 'w1', batchSize: 2 });
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
  await service.lease({ workerId: 'w1', batchSize: 1 });
  fake.missions[0].leaseExpiresAt = new Date(Date.now() - 60_000);
  await service.reviveExpiredLeases();
  assert.equal(fake.missions[0].status, 'dead');
});

test('redriveDead: dead-letter volta pra fila com tentativas zeradas', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {}, maxAttempts: 1 });
  const { missions } = await service.lease({ workerId: 'w1', batchSize: 1 });
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

test('CHIP E1: sinal elástico (activity+lag) viaja junto do lease — mesmo vazio', async () => {
  const { service } = buildService({ activeSessions: 3 });
  const result = await service.lease({ workerId: 'ponte', stages: ['xray_note'], batchSize: 1 });
  assert.ok(result.activity, 'lease traz activity');
  assert.equal(result.activity!.activeUsers, 3);
  assert.ok(result.lag, 'lease traz lag');
});

test('CHIP E1: activity degrada gracioso sem tabela AuthSession (activeUsers 0, não trava)', async () => {
  const { service } = buildService({ hasAuthSessionTable: false, activeSessions: 9 });
  const snap = await service.getActivitySnapshot();
  assert.equal(snap.activeUsers, 0);
  const result = await service.lease({ workerId: 'ponte', stages: ['xray_note'], batchSize: 1 });
  assert.equal(result.activity!.activeUsers, 0);
});

test('CHIP E1: stage xray_note é leasável e getLeasedContext devolve stage+payload sob o lease', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'xray_note', payload: { radarLeadId: 'lead-9', note: { razaoSocial: 'ACME' } }, dedupeKey: 'xray-note:lead-9' });
  const leased = await service.lease({ workerId: 'ponte', stages: ['xray_note'], batchSize: 1 });
  assert.equal(leased.missions.length, 1);
  const m = leased.missions[0];
  const ctx = await service.getLeasedContext(m.id, m.leaseId);
  assert.equal(ctx.ok, true);
  if (ctx.ok) {
    assert.equal(ctx.stage, 'xray_note');
    assert.equal((ctx.payload as any).radarLeadId, 'lead-9');
    assert.ok(!ctx.alreadyCompleted);
  }
  // lease alheio → stale
  const stale = await service.getLeasedContext(m.id, 'lease-errado');
  assert.equal(stale.ok, false);
});

test('CHIP E1: getLeasedContext após complete sinaliza alreadyCompleted (idempotência do apply)', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'enrich_lead', payload: { radarLeadId: 'l1' }, dedupeKey: 'lead:l1' });
  const leased = await service.lease({ workerId: 'ponte', stages: ['enrich_lead'], batchSize: 1 });
  const m = leased.missions[0];
  await service.complete(m.id, m.leaseId, { ok: true });
  const ctx = await service.getLeasedContext(m.id, m.leaseId);
  assert.equal(ctx.ok, true);
  if (ctx.ok) assert.equal(ctx.alreadyCompleted, true);
});
