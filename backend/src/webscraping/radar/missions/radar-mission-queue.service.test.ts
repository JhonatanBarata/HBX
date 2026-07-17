import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalDeepEnrichmentWorkIdentity,
  computeMissionBackoffMs,
  computeMissionLagEngineTarget,
  encodeLocalDeepEnrichmentReconcilerCursor,
  isLocalDeepEnrichmentCanaryLeadAllowed,
  isMissionQueueEnabled,
  LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
  LOCAL_DEEP_ENRICH_PROMPT_VERSION,
  parseLocalDeepEnrichmentReconcilerCursor,
  resolveLocalDeepEnrichmentCanaryLeadIds,
  resolveMissionLeaseTtlMs,
  RadarMissionQueueService,
} from './radar-mission-queue.service';

// ─── Fake Prisma em memória (só as formas de query que o serviço usa) ───────────────────────────

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      if (!cond.every((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('lte' in cond && !(value instanceof Date && value.getTime() <= cond.lte.getTime())) return false;
      if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
      if ('gte' in cond) {
        if (cond.gte instanceof Date) {
          if (!(value instanceof Date && value.getTime() >= cond.gte.getTime())) return false;
        } else if (!(value >= cond.gte)) return false;
      }
      if ('gt' in cond) {
        if (cond.gt instanceof Date) {
          if (!(value instanceof Date && value.getTime() > cond.gt.getTime())) return false;
        } else if (!(value > cond.gt)) return false;
      }
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
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
  const cursors = new Map<string, Row>();
  let nextId = 1;
  const tableSet = new Set(['RadarMission']);
  if (options.hasCursorTable !== false) tableSet.add('RadarFactoryCursor');
  if (options.hasAuthSessionTable !== false) tableSet.add('AuthSession');
  cursors.set('main', {
    key: 'main',
    enabled: options.cursorEnabled == null ? true : options.cursorEnabled,
    lastRunId: null,
  });
  const fake = {
    missions,
    cursors,
    hasTable: async (name: string) => tableSet.has(name),
    radarFactoryCursor: {
      upsert: async ({ where, create, update }: any) => {
        const key = String(where?.key || create?.key || 'main');
        let row = cursors.get(key);
        if (!row) {
          row = { enabled: true, lastRunId: null, ...create, key };
          cursors.set(key, row);
        } else if (update && Object.keys(update).length > 0) {
          Object.assign(row, update);
        }
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const key = String(where?.key || '');
        const row = cursors.get(key);
        if (!row) throw new Error('cursor not found');
        Object.assign(row, data);
        return { ...row };
      },
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

function withMissionFlags(
  input: { queue: boolean; local: boolean; ai4b?: boolean; canaryLeadIds?: string },
  run: () => Promise<void>,
) {
  const names = [
    'HBX_MISSION_QUEUE_ENABLED',
    'HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED',
    'HBX_RADAR_AI_SANEAMENTO_ENABLED',
    'HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HBX_MISSION_QUEUE_ENABLED = input.queue ? 'true' : 'false';
  process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED = input.local ? 'true' : 'false';
  process.env.HBX_RADAR_AI_SANEAMENTO_ENABLED = input.ai4b ? 'true' : 'false';
  if (input.canaryLeadIds === undefined) delete process.env.HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS;
  else process.env.HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS = input.canaryLeadIds;
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
  const nextPrompt = buildLocalDeepEnrichmentWorkIdentity(base, {
    promptVersion: 'local_deep_enrich_30b_prompt_v2',
  });
  assert.equal(first.workHash, same.workHash);
  assert.equal(first.workVersion, same.workVersion);
  assert.notEqual(first.workHash, changed.workHash);
  assert.equal(first.contractVersion, LOCAL_DEEP_ENRICH_CONTRACT_VERSION);
  assert.equal(first.promptVersion, LOCAL_DEEP_ENRICH_PROMPT_VERSION);
  assert.notEqual(first.workHash, nextPrompt.workHash);
  assert.notEqual(first.dedupeKey, nextPrompt.dedupeKey);
  assert.match(first.dedupeKey, /^radar:lead-1:work:\d+$/);
});

test('gate canário local: ausente libera; CSV normaliza; definido vazio bloqueia tudo', () => {
  assert.equal(resolveLocalDeepEnrichmentCanaryLeadIds({}), null);
  assert.equal(isLocalDeepEnrichmentCanaryLeadAllowed('lead-a', {}), true);
  const env = { HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS: ' lead-a,lead-b,lead-a ' } as NodeJS.ProcessEnv;
  assert.deepEqual([...resolveLocalDeepEnrichmentCanaryLeadIds(env)!], ['lead-a', 'lead-b']);
  assert.equal(isLocalDeepEnrichmentCanaryLeadAllowed('lead-a', env), true);
  assert.equal(isLocalDeepEnrichmentCanaryLeadAllowed('lead-c', env), false);
  assert.equal(isLocalDeepEnrichmentCanaryLeadAllowed('lead-a', {
    HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS: '',
  } as NodeJS.ProcessEnv), false);
});

test('cursor local corrompido/legado reinicia backfill completo', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  for (const value of [null, 'lead-antigo', '{invalido', JSON.stringify({ version: 1 })]) {
    assert.deepEqual(parseLocalDeepEnrichmentReconcilerCursor(value, now), {
      version: 2,
      phase: 'backfill',
      afterId: null,
      watermarkAt: now.toISOString(),
    });
  }
  const valid = {
    version: 2 as const,
    phase: 'incremental' as const,
    afterId: 'lead-7',
    watermarkAt: now.toISOString(),
  };
  assert.deepEqual(
    parseLocalDeepEnrichmentReconcilerCursor(encodeLocalDeepEnrichmentReconcilerCursor(valid)),
    valid,
  );
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
  await withMissionFlags({ queue: true, local: true }, async () => {
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
});

test('flag local default OFF impede consumo mesmo se existir missão materializada', async () => {
  const { service } = buildService();
  await service.enqueue({
    stage: 'local_deep_enrich_v1',
    payload: { radarLeadId: 'lead-off' },
    dedupeKey: 'local:lead-off:1',
    rearmTerminal: false,
  });
  await withMissionFlags({ queue: true, local: false }, async () => {
    const leased = await service.lease({ workerId: 'owner-local', stages: ['local_deep_enrich_v1'], batchSize: 1 });
    assert.equal(leased.missions.length, 0);
  });
});

test('flag 4B default OFF impede consumo do stage interno', async () => {
  const { service } = buildService();
  await service.enqueue({
    stage: 'ai_saneamento_4b_v1',
    payload: { radarLeadId: 'lead-4b', model: 'qwen3:4b-instruct' },
    dedupeKey: 'ai:lead-4b:1',
    rearmTerminal: false,
  });
  await withMissionFlags({ queue: true, local: false, ai4b: false }, async () => {
    const leased = await service.lease({ workerId: 'vps-4b', stages: ['ai_saneamento_4b_v1'], batchSize: 1 });
    assert.equal(leased.missions.length, 0);
  });
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

test('enqueue: FK órfã (P2003 companyId) retenta uma vez sem companyId/requestedByUserId', async () => {
  // Reproduz o bug de produção: RadarLeadPool.ownerCompanyId é Int? sem relation no schema, então
  // um valor de empresa deletada sobrevive no card e vira companyId (que TEM FK) na missão. O
  // create real do Prisma rejeitaria com P2003 na 1ª tentativa; aqui simulamos isso no fake.
  const { fake, service } = buildService();
  let calls = 0;
  const originalCreate = fake.radarMission.create;
  fake.radarMission.create = async ({ data }: any) => {
    calls += 1;
    if (calls === 1) {
      const err: any = new Error('Foreign key constraint violated on the constraint: `RadarMission_companyId_fkey`');
      err.code = 'P2003';
      err.meta = { field_name: 'RadarMission_companyId_fkey (index)' };
      throw err;
    }
    return originalCreate({ data });
  };
  const result = await service.enqueue({
    stage: 'alvo',
    payload: { x: 1 },
    companyId: 999_999,
    requestedByUserId: 888_888,
  });
  assert.equal(result.created, true);
  assert.equal(calls, 2);
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].companyId, null);
  assert.equal(fake.missions[0].requestedByUserId, null);
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

test('nova versão explícita de contrato/prompt rearma o trabalho sem duplicar a versão anterior', async () => {
  const { fake, service } = buildService();
  const input = { radarLeadId: 'lead-versionado', name: 'Empresa Versionada' };
  const v1 = buildLocalDeepEnrichmentWorkIdentity(input);
  const v2 = buildLocalDeepEnrichmentWorkIdentity(input, {
    contractVersion: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    promptVersion: 'local_deep_enrich_30b_prompt_v2',
  });
  const first = await service.enqueue({
    stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    payload: { workVersion: v1.workVersion },
    dedupeKey: v1.dedupeKey,
    workVersion: v1.workVersion,
    rearmTerminal: false,
  });
  fake.missions[0].status = 'completed';
  const same = await service.enqueue({
    stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    payload: { workVersion: v1.workVersion },
    dedupeKey: v1.dedupeKey,
    workVersion: v1.workVersion,
    rearmTerminal: false,
  });
  const upgraded = await service.enqueue({
    stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    payload: { workVersion: v2.workVersion },
    dedupeKey: v2.dedupeKey,
    workVersion: v2.workVersion,
    rearmTerminal: false,
  });
  assert.equal(first.created, true);
  assert.equal(same.created, false);
  assert.equal(upgraded.created, true);
  assert.equal(fake.missions.length, 2);
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
    assert.equal(fake.missions[0].payloadJson.contractVersion, LOCAL_DEEP_ENRICH_CONTRACT_VERSION);
    assert.equal(fake.missions[0].payloadJson.promptVersion, LOCAL_DEEP_ENRICH_PROMPT_VERSION);
  });
});

test('canário local bloqueia/libera emissão, mas não interfere no lease de missão já existente', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: true, local: true, canaryLeadIds: 'lead-permitido' }, async () => {
    const blocked = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-fora-do-canario',
      name: 'Empresa Fora',
    });
    const allowed = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-permitido',
      name: 'Empresa Permitida',
    });
    assert.deepEqual(blocked, { created: false, missionId: null });
    assert.equal(allowed.created, true);
    assert.equal(fake.missions.length, 1);

    process.env.HBX_LOCAL_DEEP_ENRICH_CANARY_LEAD_IDS = 'outro-lead';
    const leased = await service.lease({
      workerId: 'owner-local',
      stages: [LOCAL_DEEP_ENRICH_CONTRACT_VERSION],
      batchSize: 1,
    });
    assert.equal(leased.missions.length, 1);
    assert.equal(leased.missions[0].id, allowed.missionId);
  });
});

test('invalidado local é terminal entre versões e redrive genérico não o rearma', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: true, local: true }, async () => {
    const created = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-invalidado',
      name: 'Empresa Inválida',
      website: 'https://primeiro.invalid',
    });
    const leased = await service.lease({
      workerId: 'owner-local',
      stages: [LOCAL_DEEP_ENRICH_CONTRACT_VERSION],
      batchSize: 1,
    });
    assert.equal(leased.missions[0].id, created.missionId);
    const invalidated = await service.fail(
      leased.missions[0].id,
      leased.missions[0].leaseId,
      'conteúdo inválido',
      false,
    );
    assert.equal(invalidated.status, 'dead');
    assert.equal(fake.missions[0].lastPhase, 'invalidated');
    const changed = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-invalidado',
      name: 'Empresa Inválida',
      website: 'https://mudou.invalid',
    });
    assert.equal(changed.created, false);
    assert.equal(changed.missionId, fake.missions[0].id);
    assert.equal(fake.missions.length, 1);
    const redrive = await service.redriveDead({ stage: 'local_deep_enrich_v1' });
    assert.equal(redrive.redriven, 0);
    assert.equal(fake.missions[0].status, 'dead');
  });
});

test('dead técnico local não bloqueia materialização de uma nova workVersion', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: true, local: true }, async () => {
    const first = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-versao-nova',
      name: 'Empresa Versionada',
      website: 'https://versao-um.invalid',
    });
    assert.equal(first.created, true);
    Object.assign(fake.missions[0], {
      status: 'dead',
      attempts: 5,
      lastPhase: 'retry_backoff',
    });
    const changed = await service.enqueueLocalDeepEnrichment({
      radarLeadId: 'lead-versao-nova',
      name: 'Empresa Versionada',
      website: 'https://versao-dois.invalid',
    });
    assert.equal(changed.created, true);
    assert.notEqual(changed.missionId, first.missionId);
    assert.equal(fake.missions.length, 2);
  });
});

test('reconciliador repõe missão ausente e preserva negativos/rejeitados', async () => {
  const { fake, service } = buildService();
  const originalHasTable = fake.hasTable;
  fake.hasTable = async (name: string) => name === 'RadarLeadPool' || originalHasTable(name);
  const rows = [
      { id: 'lead-clean', name: 'Empresa Limpa', city: 'Xangri-lá', state: 'RS', status: 'clean', updatedAt: new Date() },
      { id: 'lead-negative', name: 'Empresa Invalidada', city: 'Xangri-lá', state: 'RS', status: 'rejected', updatedAt: new Date() },
      { id: 'lead-no-answer', name: 'Empresa Não Responde', city: 'Xangri-lá', state: 'RS', status: 'no_answer', updatedAt: new Date() },
  ];
  (fake as any).radarLeadPool = {
    findMany: async ({ where }: any) => where?.OR ? [] : rows,
  };
  await withMissionFlags({ queue: true, local: true }, async () => {
    const first = await service.reconcileLocalDeepEnrichmentMissions();
    const second = await service.reconcileLocalDeepEnrichmentMissions();
    assert.deepEqual(first, { scanned: 3, enqueued: 1 });
    assert.deepEqual(second, { scanned: 0, enqueued: 0 });
  });
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].payloadJson.radarLeadId, 'lead-clean');
});

test('reconciliador local faz backfill de todo histórico e depois segue incremental', async () => {
  const { fake, service } = buildService();
  const originalHasTable = fake.hasTable;
  fake.hasTable = async (name: string) => name === 'RadarLeadPool' || originalHasTable(name);
  const allRows: Row[] = ['lead-a', 'lead-b', 'lead-c'].map((id) => ({
    id,
    name: `Empresa ${id}`,
    city: 'Xangri-lá',
    state: 'RS',
    status: 'clean',
    website: null,
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
  }));
  (fake as any).radarLeadPool = {
    findMany: async ({ where, take }: any) => allRows
      .filter((row) => matchesWhere(row, where || {}))
      .sort((a, b) => where?.OR
        ? a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id)
        : a.id.localeCompare(b.id))
      .slice(0, take),
  };
  const previousBatch = process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_BATCH_SIZE;
  process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_BATCH_SIZE = '2';
  try {
    await withMissionFlags({ queue: true, local: true }, async () => {
      const first = await service.reconcileLocalDeepEnrichmentMissions();
      const second = await service.reconcileLocalDeepEnrichmentMissions();
      assert.deepEqual(first, { scanned: 2, enqueued: 2 });
      assert.deepEqual(second, { scanned: 1, enqueued: 1 });

      const stored = fake.cursors.get('local_deep_enrich_reconciler_v2');
      const cursor = parseLocalDeepEnrichmentReconcilerCursor(stored?.lastRunId);
      assert.equal(cursor.phase, 'incremental');
      assert.equal(cursor.afterId, null);

      allRows[0].website = 'https://versao-nova.invalid';
      allRows[0].updatedAt = new Date(Date.now() + 1_000);
      const third = await service.reconcileLocalDeepEnrichmentMissions();
      assert.deepEqual(third, { scanned: 1, enqueued: 1 });
    });
    assert.equal(fake.missions.length, 4);
  } finally {
    if (previousBatch === undefined) delete process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_BATCH_SIZE;
    else process.env.HBX_LOCAL_DEEP_ENRICH_RECONCILE_BATCH_SIZE = previousBatch;
  }
});

test('reconciliador local aplica canário no banco e não persiste IDs no nome do cursor', async () => {
  const { fake, service } = buildService();
  const originalHasTable = fake.hasTable;
  fake.hasTable = async (name: string) => name === 'RadarLeadPool' || originalHasTable(name);
  const allRows = [
    { id: 'lead-canary', name: 'Empresa Canário', status: 'clean', updatedAt: new Date('2020-01-01T00:00:00Z') },
    { id: 'lead-fora', name: 'Empresa Fora', status: 'clean', updatedAt: new Date('2020-01-01T00:00:00Z') },
  ];
  let receivedWhere: Row | null = null;
  (fake as any).radarLeadPool = {
    findMany: async ({ where, take }: any) => {
      receivedWhere = where;
      return allRows.filter((row) => matchesWhere(row, where || {})).slice(0, take);
    },
  };
  await withMissionFlags({ queue: true, local: true, canaryLeadIds: 'lead-canary' }, async () => {
    const result = await service.reconcileLocalDeepEnrichmentMissions();
    assert.deepEqual(result, { scanned: 1, enqueued: 1 });
  });
  assert.deepEqual((receivedWhere as Row)?.id?.in, ['lead-canary']);
  assert.equal(fake.missions.length, 1);
  assert.equal(fake.missions[0].radarLeadId, 'lead-canary');
  const canaryCursorKey = [...fake.cursors.keys()].find((key) => key.includes('_canary_'));
  assert.ok(canaryCursorKey);
  assert.equal(canaryCursorKey!.includes('lead-canary'), false);
});

test('heartbeat: estende só com leaseId certo', async () => {
  const { service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({ workerId: 'w1', stages: ['alvo'], batchSize: 1 });
  const mission = missions[0];
  assert.equal((await service.heartbeat(mission.id, mission.leaseId)).ok, true);
  assert.equal((await service.heartbeat(mission.id, 'lease-errado')).ok, false);
});

test('heartbeat preserva o TTL longo pedido pelo worker local', async () => {
  const { fake, service } = buildService();
  await service.enqueue({ stage: 'alvo', payload: {} });
  const { missions } = await service.lease({
    workerId: 'owner-local',
    stages: ['alvo'],
    batchSize: 1,
    leaseTtlMs: 900_000,
  });
  const mission = missions[0];
  assert.equal((await service.heartbeat(mission.id, mission.leaseId, 900_000)).ok, true);
  assert.ok(fake.missions[0].leaseExpiresAt.getTime() - Date.now() > 850_000);
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

test('falha técnica local continua em retry com backoff mesmo após exceder maxAttempts', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: true, local: true }, async () => {
    await service.enqueue({
      stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
      payload: { radarLeadId: 'lead-retry' },
      dedupeKey: 'lead-retry-version-1',
      maxAttempts: 1,
      rearmTerminal: false,
    });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      fake.missions[0].nextAttemptAt = new Date(Date.now() - 1_000);
      const leased = await service.lease({
        workerId: 'owner-local',
        stages: [LOCAL_DEEP_ENRICH_CONTRACT_VERSION],
        batchSize: 1,
      });
      assert.equal(leased.missions.length, 1);
      const failed = await service.fail(
        leased.missions[0].id,
        leased.missions[0].leaseId,
        'falha técnica transitória',
        true,
      );
      assert.equal(failed.status, 'queued');
      assert.equal(fake.missions[0].status, 'queued');
      assert.equal(fake.missions[0].lastPhase, 'retry_backoff');
      assert.ok(fake.missions[0].nextAttemptAt.getTime() > Date.now());
    }
    assert.equal(fake.missions[0].attempts, 4);
  });
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

test('lease local vencido nunca vira terminal por tentativas esgotadas', async () => {
  const { fake, service } = buildService();
  await withMissionFlags({ queue: true, local: true }, async () => {
    await service.enqueue({
      stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
      payload: { radarLeadId: 'lead-lease-expirado' },
      maxAttempts: 1,
    });
    await service.lease({
      workerId: 'owner-local',
      stages: [LOCAL_DEEP_ENRICH_CONTRACT_VERSION],
      batchSize: 1,
    });
    fake.missions[0].leaseExpiresAt = new Date(Date.now() - 60_000);
    const revived = await service.reviveExpiredLeases();
    assert.equal(revived, 1);
    assert.equal(fake.missions[0].status, 'queued');
    assert.equal(fake.missions[0].lastPhase, 'retry_backoff');
    assert.ok(fake.missions[0].nextAttemptAt.getTime() > Date.now());
  });
});

test('reconciliador rearma dead técnico legado local, mas preserva invalidado', async () => {
  const { fake, service } = buildService();
  const originalHasTable = fake.hasTable;
  fake.hasTable = async (name: string) => name === 'RadarLeadPool' || originalHasTable(name);
  (fake as any).radarLeadPool = { findMany: async () => [] };
  await service.enqueue({
    stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    payload: { radarLeadId: 'lead-tecnico' },
    dedupeKey: 'lead-tecnico-v1',
    rearmTerminal: false,
  });
  await service.enqueue({
    stage: LOCAL_DEEP_ENRICH_CONTRACT_VERSION,
    payload: { radarLeadId: 'lead-invalidado-legado' },
    dedupeKey: 'lead-invalidado-v1',
    rearmTerminal: false,
  });
  Object.assign(fake.missions[0], { status: 'dead', attempts: 5, lastPhase: 'leased' });
  Object.assign(fake.missions[1], { status: 'dead', attempts: 1, lastPhase: 'invalidated' });
  await withMissionFlags({ queue: true, local: true }, async () => {
    await service.reconcileLocalDeepEnrichmentMissions();
  });
  assert.equal(fake.missions[0].status, 'queued');
  assert.equal(fake.missions[0].attempts, 5);
  assert.equal(fake.missions[0].lastPhase, 'retry_backoff');
  assert.ok(fake.missions[0].nextAttemptAt.getTime() > Date.now());
  assert.equal(fake.missions[1].status, 'dead');
  assert.equal(fake.missions[1].lastPhase, 'invalidated');
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
  await withMissionFlags({ queue: true, local: true }, async () => {
    const { service } = buildService({ activeSessions: 3 });
    const result = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
    assert.ok(result.activity, 'lease traz activity');
    assert.equal(result.activity!.activeUsers, 3);
    assert.ok(result.lag, 'lease traz lag');
  });
});

test('CHIP E1: activity degrada gracioso sem tabela AuthSession (activeUsers 0, não trava)', async () => {
  await withMissionFlags({ queue: true, local: true }, async () => {
    const { service } = buildService({ hasAuthSessionTable: false, activeSessions: 9 });
    const snap = await service.getActivitySnapshot();
    assert.equal(snap.activeUsers, 0);
    const result = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
    assert.equal(result.activity!.activeUsers, 0);
  });
});

test('stage local_deep_enrich_v1 é leasável e getLeasedContext devolve stage+payload sob o lease', async () => {
  await withMissionFlags({ queue: true, local: true }, async () => {
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
});

test('CHIP E1: getLeasedContext após complete sinaliza alreadyCompleted (idempotência do apply)', async () => {
  await withMissionFlags({ queue: true, local: true }, async () => {
    const { service } = buildService();
    await service.enqueue({ stage: 'local_deep_enrich_v1', payload: { radarLeadId: 'l1' }, dedupeKey: 'lead:l1' });
    const leased = await service.lease({ workerId: 'ponte', stages: ['local_deep_enrich_v1'], batchSize: 1 });
    const m = leased.missions[0];
    await service.complete(m.id, m.leaseId, { ok: true });
    const ctx = await service.getLeasedContext(m.id, m.leaseId);
    assert.equal(ctx.ok, true);
    if (ctx.ok) assert.equal(ctx.alreadyCompleted, true);
  });
});
