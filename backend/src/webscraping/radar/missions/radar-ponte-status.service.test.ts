import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarPonteStatusService } from './radar-ponte-status.service';

function createFakePrisma(input: { missions?: any[]; hasMissionTable?: boolean } = {}) {
  const missions = input.missions || [];
  return {
    hasTable: async (name: string) => name === 'RadarMission' && input.hasMissionTable !== false,
    radarMission: {
      findMany: async ({ where }: any) => {
        const statuses: string[] = where?.status?.in || [];
        return missions
          .filter((mission) => mission.stage === where?.stage && statuses.includes(mission.status))
          .sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
      },
    },
  };
}

function withStatusFlags(enabled: boolean, run: () => Promise<void>) {
  const previousQueue = process.env.HBX_MISSION_QUEUE_ENABLED;
  const previousLocal = process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED;
  process.env.HBX_MISSION_QUEUE_ENABLED = enabled ? 'true' : 'false';
  process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED = enabled ? 'true' : 'false';
  return run().finally(() => {
    if (previousQueue === undefined) delete process.env.HBX_MISSION_QUEUE_ENABLED;
    else process.env.HBX_MISSION_QUEUE_ENABLED = previousQueue;
    if (previousLocal === undefined) delete process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED;
    else process.env.HBX_LOCAL_DEEP_ENRICH_QUEUE_ENABLED = previousLocal;
  });
}

const localMission = (overrides: Record<string, any> = {}) => ({
  id: 'mission-local-1',
  stage: 'local_deep_enrich_v1',
  status: 'queued',
  payloadJson: { radarLeadId: 'lead-1' },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

test('status local: flags OFF devolvem none sem consultar a fila', async () => {
  await withStatusFlags(false, async () => {
    const prisma = createFakePrisma({ missions: [localMission()] });
    let queried = false;
    prisma.radarMission.findMany = async () => { queried = true; return []; };
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.deepEqual(status, { 'lead-1': { state: 'none' } });
    assert.equal(queried, false);
  });
});

test('status local: somente local_deep_enrich_v1 entra; queued preserva posição', async () => {
  await withStatusFlags(true, async () => {
    const now = new Date();
    const prisma = createFakePrisma({
      missions: [
        localMission({ id: 'm0', payloadJson: { radarLeadId: 'outro' }, createdAt: new Date(now.getTime() - 5_000) }),
        localMission({ id: 'm1', payloadJson: { radarLeadId: 'lead-1' }, createdAt: now }),
        { id: 'legado', stage: 'enrich_lead', status: 'leased', payloadJson: { radarLeadId: 'lead-1' }, createdAt: now },
      ],
    });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'queued');
    assert.equal((status['lead-1'] as any).position, 2);
    assert.equal((status['lead-1'] as any).stage, 'local_deep_enrich_v1');
  });
});

test('status local: leased vira processing', async () => {
  await withStatusFlags(true, async () => {
    const heartbeatAt = new Date();
    const prisma = createFakePrisma({ missions: [localMission({ status: 'leased', heartbeatAt })] });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.deepEqual(status['lead-1'], {
      state: 'processing',
      stage: 'local_deep_enrich_v1',
      startedAt: heartbeatAt.toISOString(),
    });
  });
});

test('status local: completed vira released e conta somente o receiptJson da missão', async () => {
  await withStatusFlags(true, async () => {
    const completedAt = new Date();
    const prisma = createFakePrisma({
      missions: [localMission({
        status: 'completed',
        completedAt,
        receiptJson: {
          noNewData: false,
          createdContactIds: ['phone-1', 'whatsapp-1', 'email-1'],
          createdContacts: [
            { id: 'phone-1', kind: 'phone' },
            { id: 'whatsapp-1', kind: 'whatsapp' },
            { id: 'email-1', kind: 'email' },
          ],
          createdPersonIds: ['person-1'],
          summary: {
            phonesAdded: 2,
            emailsAdded: 1,
            peopleAdded: 1,
            metadataUpdated: true,
          },
        },
      })],
    });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.deepEqual(status['lead-1'], {
      state: 'released',
      stage: 'local_deep_enrich_v1',
      releasedAt: completedAt.toISOString(),
      noNewData: false,
      receipt: { missionId: 'mission-local-1' },
      delta: { phonesAdded: 2, emailsAdded: 1, peopleAdded: 1 },
    });
  });
});

test('status local: summary do recibo preserva zero exato e reconhece metadata como novidade', async () => {
  await withStatusFlags(true, async () => {
    const prisma = createFakePrisma({ missions: [localMission({
      status: 'completed',
      completedAt: new Date(),
      resultJson: { delta: { phonesAdded: 99, emailsAdded: 99, peopleAdded: 99 } },
      receiptJson: {
        createdContactIds: ['legacy-id-sem-kind'],
        createdContacts: [{ id: 'legacy-id-sem-kind', kind: 'phone' }],
        createdPersonIds: [],
        summary: {
          phonesAdded: 0,
          emailsAdded: 0,
          peopleAdded: 0,
          metadataUpdated: true,
        },
      },
    })] });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'released');
    assert.equal((status['lead-1'] as any).noNewData, false);
    assert.deepEqual((status['lead-1'] as any).delta, { phonesAdded: 0, emailsAdded: 0, peopleAdded: 0 });
  });
});

test('status local: completed sem delta continua released com noNewData=true', async () => {
  await withStatusFlags(true, async () => {
    const prisma = createFakePrisma({ missions: [localMission({ status: 'completed', completedAt: new Date(), receiptJson: { noNewData: true } })] });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.equal(status['lead-1'].state, 'released');
    assert.equal((status['lead-1'] as any).noNewData, true);
    assert.deepEqual((status['lead-1'] as any).delta, { phonesAdded: 0, emailsAdded: 0, peopleAdded: 0 });
  });
});

test('status local: dead/canceled viram invalidated e terminal mais recente vence', async () => {
  await withStatusFlags(true, async () => {
    const old = new Date(Date.now() - 60_000);
    const current = new Date();
    const prisma = createFakePrisma({
      missions: [
        localMission({ id: 'released-old', status: 'completed', completedAt: old, updatedAt: old }),
        localMission({ id: 'dead-new', status: 'dead', updatedAt: current }),
      ],
    });
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1']);
    assert.deepEqual(status['lead-1'], {
      state: 'invalidated',
      stage: 'local_deep_enrich_v1',
      invalidatedAt: current.toISOString(),
    });
  });
});

test('status local: lote consulta missões uma vez, sem N+1, e mantém none', async () => {
  await withStatusFlags(true, async () => {
    const prisma = createFakePrisma({ missions: [localMission()] });
    let calls = 0;
    const original = prisma.radarMission.findMany;
    prisma.radarMission.findMany = async (input: any) => { calls += 1; return original(input); };
    const status = await new RadarPonteStatusService(prisma as any).getStatusForLeads(['lead-1', 'lead-2']);
    assert.equal(calls, 1);
    assert.equal(status['lead-1'].state, 'queued');
    assert.equal(status['lead-2'].state, 'none');
  });
});

test('status local: sem tabela ou lote vazio degrada sem lançar', async () => {
  await withStatusFlags(true, async () => {
    const noTable = new RadarPonteStatusService(createFakePrisma({ hasMissionTable: false }) as any);
    assert.deepEqual(await noTable.getStatusForLeads(['lead-1']), { 'lead-1': { state: 'none' } });
    const empty = new RadarPonteStatusService(createFakePrisma() as any);
    assert.deepEqual(await empty.getStatusForLeads([]), {});
  });
});
