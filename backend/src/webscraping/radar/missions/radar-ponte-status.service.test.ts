import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarPonteStatusService } from './radar-ponte-status.service';

// Fake prisma mínimo: radarMission (fila) + leadContact (resumo) + radarLeadPool (nota ICP).
function createFakePrisma(input: { missions?: any[]; contacts?: any[]; leads?: any[] } = {}) {
  const missions = input.missions || [];
  const contacts = input.contacts || [];
  const leads = input.leads || [];
  const tableSet = new Set(['RadarMission', 'LeadContact', 'RadarLeadPool']);
  return {
    hasTable: async (name: string) => tableSet.has(name),
    radarMission: {
      findMany: async ({ where }: any) => {
        const stages: string[] = where?.stage?.in || [];
        const statuses: string[] = where?.status?.in || [];
        return missions
          .filter((m) => (!stages.length || stages.includes(m.stage)) && (!statuses.length || statuses.includes(m.status)))
          .sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
      },
    },
    leadContact: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.radarLeadId?.in || [];
        return contacts.filter((c) => ids.includes(c.radarLeadId) && (!where?.source || c.source === where.source));
      },
    },
    radarLeadPool: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in || [];
        return leads.filter((l) => ids.includes(l.id));
      },
    },
  };
}

function withMissionQueueFlag<T>(value: string, fn: () => T): T {
  const prev = process.env.HBX_MISSION_QUEUE_ENABLED;
  process.env.HBX_MISSION_QUEUE_ENABLED = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.HBX_MISSION_QUEUE_ENABLED;
    else process.env.HBX_MISSION_QUEUE_ENABLED = prev;
  }
}

test('E3 status: flag da fila OFF devolve none pra tudo (degrade invisível)', async () => {
  await withMissionQueueFlag('false', async () => {
    const prisma = createFakePrisma({ missions: [{ id: 'm1', stage: 'enrich_lead', status: 'queued', payloadJson: { radarLeadId: 'lead-1' }, createdAt: new Date() }] });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.deepEqual(status, { 'lead-1': { state: 'none' } });
  });
});

test('E3 status: lead sem nenhuma missão vira none', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = createFakePrisma({ missions: [] });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.deepEqual(status, { 'lead-1': { state: 'none' } });
  });
});

test('E3 status: missão queued vira "na fila" com posição ordinal', async () => {
  await withMissionQueueFlag('true', async () => {
    const now = new Date();
    const prisma = createFakePrisma({
      missions: [
        { id: 'm0', stage: 'enrich_lead', status: 'queued', payloadJson: { radarLeadId: 'lead-outro' }, createdAt: new Date(now.getTime() - 5000) },
        { id: 'm1', stage: 'enrich_lead', status: 'queued', payloadJson: { radarLeadId: 'lead-1' }, createdAt: now },
      ],
    });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'queued');
    assert.equal((status['lead-1'] as any).position, 2); // 2ª da fila (lead-outro veio antes)
    assert.equal((status['lead-1'] as any).stale, false);
  });
});

test('E3 status: missão queued PARADA além do TTL de honestidade vira stale=true (anti-spinner-eterno)', async () => {
  await withMissionQueueFlag('true', async () => {
    const old = new Date(Date.now() - 20 * 60_000); // 20min > 15min TTL
    const prisma = createFakePrisma({
      missions: [{ id: 'm1', stage: 'xray_note', status: 'queued', payloadJson: { radarLeadId: 'lead-1' }, createdAt: old }],
    });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'queued');
    assert.equal((status['lead-1'] as any).stale, true);
  });
});

test('E3 status: missão leased (em voo) vira "processing"', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = createFakePrisma({
      missions: [{ id: 'm1', stage: 'enrich_lead', status: 'leased', payloadJson: { radarLeadId: 'lead-1' }, createdAt: new Date(), heartbeatAt: new Date() }],
    });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'processing');
    assert.equal((status['lead-1'] as any).stage, 'enrich_lead');
  });
});

test('E3 status: missão completed vira "done" com resumo (+telefones/+emails/nota)', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = createFakePrisma({
      missions: [{ id: 'm1', stage: 'enrich_lead', status: 'completed', payloadJson: { radarLeadId: 'lead-1' }, createdAt: new Date(), completedAt: new Date() }],
      contacts: [
        { radarLeadId: 'lead-1', kind: 'phone', source: 'ai_extraction' },
        { radarLeadId: 'lead-1', kind: 'phone', source: 'ai_extraction' },
        { radarLeadId: 'lead-1', kind: 'email', source: 'ai_extraction' },
      ],
      leads: [{ id: 'lead-1', metadataJson: JSON.stringify({ aiNote: { notaIcp: 85, resumo: 'Empresa ativa.' } }) }],
    });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'done');
    const summary = (status['lead-1'] as any).summary;
    assert.equal(summary.phonesAdded, 2);
    assert.equal(summary.emailsAdded, 1);
    assert.equal(summary.hasNote, true);
    assert.equal(summary.noteScore, 85);
  });
});

test('E3 status: done é permanente mesmo sem nota/contato (worker degradou) — nunca volta a "queued"', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = createFakePrisma({
      missions: [{ id: 'm1', stage: 'xray_note', status: 'completed', payloadJson: { radarLeadId: 'lead-1' }, createdAt: new Date(), completedAt: new Date() }],
    });
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'done');
    const summary = (status['lead-1'] as any).summary;
    assert.equal(summary.phonesAdded, 0);
    assert.equal(summary.hasNote, false);
  });
});

test('E3 status: lote (2 leads) resolve em 1 chamada só, sem N+1', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = createFakePrisma({
      missions: [
        { id: 'm1', stage: 'enrich_lead', status: 'queued', payloadJson: { radarLeadId: 'lead-1' }, createdAt: new Date() },
        { id: 'm2', stage: 'enrich_lead', status: 'leased', payloadJson: { radarLeadId: 'lead-2' }, createdAt: new Date() },
      ],
    });
    let findManyCalls = 0;
    const originalFindMany = prisma.radarMission.findMany;
    prisma.radarMission.findMany = async (arg: any) => { findManyCalls++; return originalFindMany(arg); };
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1', 'lead-2', 'lead-3']);
    assert.equal(findManyCalls, 1);
    assert.equal(status['lead-1'].state, 'queued');
    assert.equal(status['lead-2'].state, 'processing');
    assert.equal(status['lead-3'].state, 'none');
  });
});

test('E3 status: sem tabela RadarMission (ambiente sem migration) degrada pra none, nunca lança', async () => {
  await withMissionQueueFlag('true', async () => {
    const prisma = { hasTable: async () => false };
    const svc = new RadarPonteStatusService(prisma as any);
    const status = await svc.getStatusForLeads(['lead-1']);
    assert.deepEqual(status, { 'lead-1': { state: 'none' } });
  });
});

test('E3 status: leadIds vazio devolve mapa vazio sem tocar o banco', async () => {
  const prisma = createFakePrisma();
  let called = false;
  prisma.radarMission.findMany = async () => { called = true; return []; };
  const svc = new RadarPonteStatusService(prisma as any);
  const status = await svc.getStatusForLeads([]);
  assert.deepEqual(status, {});
  assert.equal(called, false);
});
