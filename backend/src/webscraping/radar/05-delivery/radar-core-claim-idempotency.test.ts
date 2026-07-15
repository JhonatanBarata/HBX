import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreDeliveryMixin } from './radar-core-delivery.mixin';

test('duas puxadas do mesmo tenant com chaves diferentes iniciam um único débito', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  const runs: any[] = [];
  let debitCount = 0;

  instance.resolveContext = () => ({ companyId: 7, userId: 11 });
  instance.assertSellerTeamPolicyAccess = async () => undefined;
  instance.sanitizeRadarPreDebitLead = (lead: any) => ({ id: lead.id, contactsMasked: true });
  instance.hasRadarClaimContactAccess = async () => true;
  instance.buildPublicLeadProcessSnapshot = (snapshot: any) => ({
    operationId: snapshot.id,
    status: snapshot.status,
  });
  instance.prisma = {
    hasTable: async (name: string) => name === 'RadarLeadProcessRun',
    radarLeadProcessRun: {
      findFirst: async ({ where }: any) => {
        const candidates = runs.filter((run) => (
          run.companyId === where.companyId
          && run.radarLeadId === where.radarLeadId
          && run.mode === where.mode
        ));
        if (where.status?.in) return candidates.find((run) => where.status.in.includes(run.status)) || null;
        if (where.status?.notIn) return candidates.find((run) => !where.status.notIn.includes(run.status)) || null;
        return candidates[0] || null;
      },
      count: async () => runs.length,
    },
    radarLeadPool: {
      findUnique: async () => ({
        id: 'lead-1',
        name: 'Empresa',
        city: 'Campinas',
        state: 'SP',
        segment: 'software',
        ownerCompanyId: null,
        claimedAt: null,
        status: 'clean',
        companyStates: [],
      }),
    },
  };
  instance.getRadarLeadProcessStore = () => ({
    createOperation: async (input: any) => {
      const run = {
        id: `op-${runs.length + 1}`,
        companyId: input.companyId,
        userId: input.userId,
        radarLeadId: input.radarLeadId,
        mode: input.mode,
        status: 'queued',
        idempotencyKey: input.idempotencyKey,
        data: input.snapshot,
        stages: [],
        events: [],
      };
      runs.push(run);
      return { operation: run, created: true };
    },
    getSnapshot: async (_companyId: number, operationId: string) => runs.find((run) => run.id === operationId),
  });
  instance.processRadarLeadClaimOperation = async (operationId: string) => {
    debitCount += 1;
    const run = runs.find((item) => item.id === operationId);
    run.status = 'completed';
  };

  const first = await instance.startRadarLeadClaimForUser({}, 'lead-1', { idempotencyKey: 'http-a' });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const second = await instance.startRadarLeadClaimForUser({}, 'lead-1', { idempotencyKey: 'http-b' });

  assert.equal(first.operation.operationId, 'op-1');
  assert.equal(second.operation.operationId, 'op-1');
  assert.equal(second.alreadyAcquired, true);
  assert.equal(runs.length, 1);
  assert.equal(debitCount, 1);
});

function claimDeliveryHarness(reservation: { applied: boolean; debited: number }) {
  const instance = new RadarCoreDeliveryMixin() as any;
  let ownershipCalls = 0;
  let vendasCalls = 0;
  let reservedUsageKey = '';
  instance.vendasService = {
    importWebscrapingLeadsForUser: async () => {
      vendasCalls += 1;
      return { createdCount: 1, leads: [{ id: 'vendas-1' }] };
    },
  };
  instance.logger = { warn: () => undefined };
  instance.resolveContext = () => ({ companyId: 7, userId: 11 });
  instance.assertSellerTeamPolicyAccess = async () => undefined;
  instance.assertRadarClaimWorkerFence = async () => undefined;
  instance.supportsRadarPersistence = async () => true;
  instance.isRadarProtectedStatus = () => false;
  instance.parseMaybeJsonObject = (value: any) => {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
  };
  instance.getTeamPolicyRequiredRadarChannels = async () => [];
  instance.extractLeadQualityFromObject = () => null;
  instance.extractLeadQualityV2FromObject = () => null;
  instance.evaluateLeadQuality = () => ({ status: 'approved', reasons: [] });
  instance.isLeadDeliverableCard = () => true;
  instance.classifyCardDelivery = () => ({ deliveryProduct: 'lead' });
  instance.isCardDeliveryEligibleForVendas = () => true;
  instance.claimRadarLeadForCompany = async () => {
    ownershipCalls += 1;
  };
  instance.commercialUsageLimits = {
    reserveLeadDeliveryCredit: async (_companyId: number, _userId: number, input: any) => {
      reservedUsageKey = input.usageKey;
      return reservation;
    },
    releaseLeadDeliveryCredit: async () => undefined,
  };
  instance.prisma = {
    radarLeadPool: {
      findUnique: async () => ({
        id: 'lead-1',
        name: 'Empresa',
        city: 'Campinas',
        state: 'SP',
        segment: 'software',
        status: 'clean',
        ownerCompanyId: null,
        companyStates: [],
        contacts: [],
        metadataJson: '{}',
      }),
    },
  };
  return {
    instance,
    state: () => ({ ownershipCalls, vendasCalls, reservedUsageKey }),
  };
}

test('claim falha fechado quando o débito não é confirmado e não toca posse/Vendas', async () => {
  const harness = claimDeliveryHarness({ applied: false, debited: 0 });

  await assert.rejects(
    () => harness.instance.importRadarLeadToVendasForUser(
      { role: 'ADMIN' },
      'lead-1',
      { debitOnImport: true, claimOperationId: 'op-finance-1', workerToken: 'worker-finance-1' },
    ),
    /Não foi possível confirmar o débito do crédito/,
  );

  assert.deepEqual(harness.state(), {
    ownershipCalls: 0,
    vendasCalls: 0,
    reservedUsageKey: 'radar:lead-1:claim:op-finance-1',
  });
});

test('cada operação persistente deriva uma usageKey financeira própria', async () => {
  const first = claimDeliveryHarness({ applied: false, debited: 0 });
  const second = claimDeliveryHarness({ applied: false, debited: 0 });

  await assert.rejects(() => first.instance.importRadarLeadToVendasForUser(
    { role: 'ADMIN' }, 'lead-1', { debitOnImport: true, claimOperationId: 'op-a', workerToken: 'worker-a' },
  ));
  await assert.rejects(() => second.instance.importRadarLeadToVendasForUser(
    { role: 'ADMIN' }, 'lead-1', { debitOnImport: true, claimOperationId: 'op-b', workerToken: 'worker-b' },
  ));

  assert.equal(first.state().reservedUsageKey, 'radar:lead-1:claim:op-a');
  assert.equal(second.state().reservedUsageKey, 'radar:lead-1:claim:op-b');
  assert.notEqual(first.state().reservedUsageKey, second.state().reservedUsageKey);
});

test('falha de estorno permanece refund_pending e nunca vira falso refunded/failed terminal', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  const transitions: string[] = [];
  const transitionPayloads: any[] = [];
  let currentStatus = 'credit_debited';
  instance.resolveContext = () => ({ companyId: 7, userId: 11 });
  instance.parseMaybeJsonObject = () => ({});
  instance.getRadarLeadForUser = async () => ({ item: { id: 'lead-1', phoneDigits: '19999990001' } });
  instance.getRadarLeadProcessStore = () => ({
    acquireWorkerLease: async () => 'worker-refund',
    renewWorkerLease: async () => true,
    transitionOperation: async (input: any) => {
      transitions.push(input.status);
      transitionPayloads.push(input);
      currentStatus = input.status;
      return { status: currentStatus };
    },
    getSnapshot: async () => ({ status: currentStatus }),
  });
  instance.sanitizeRadarPreDebitLead = (lead: any) => ({ id: lead.id, contactsMasked: true });
  instance.importRadarLeadToVendasForUser = async (_user: any, _leadId: string, options: any) => {
    await options.onProgress('refund_pending', {
      error: 'O estorno do crédito ficou pendente de confirmação.',
    });
    throw new Error('entrega falhou');
  };

  await instance.processRadarLeadClaimOperation('op-refund', {}, 'lead-1', {});

  assert.deepEqual(transitions, ['refund_pending']);
  assert.equal(currentStatus, 'refund_pending');
  assert.equal(JSON.stringify(transitionPayloads).includes('19999990001'), false);
});

test('confirmação de estorno rejeita retorno financeiro sem crédito devolvido', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  instance.commercialUsageLimits = {
    releaseLeadDeliveryCredit: async () => ({ refunded: 0 }),
  };

  await assert.rejects(
    () => instance.confirmRadarClaimCreditRefund(7, 11, 'radar:lead-1:claim:op-refund'),
    /estorno do crédito ficou pendente/i,
  );
});

function paidAccessGateHarness(runResolver: (where: any) => any) {
  const instance = new RadarCoreDeliveryMixin() as any;
  instance.commercialUsageLimits = { hasActiveLeadDeliveryCredit: async () => true };
  instance.prisma = {
    radarLeadProcessRun: { findFirst: async ({ where }: any) => runResolver(where) },
  };
  const context = { companyId: 7, userId: 11 };
  const row = {
    id: 'lead-1',
    ownerCompanyId: 7,
    companyStates: [{
      paidClaimOperationId: 'op-paid-1',
      claimUsageKey: 'radar:lead-1:claim:op-paid-1',
      acquiredAt: new Date(),
    }],
  };
  return { instance, context, row };
}

test('acesso pago falha fechado quando a operation do state nao existe', async () => {
  const { instance, context, row } = paidAccessGateHarness(() => null);
  assert.equal(await instance.hasRadarPaidAcquisition(context, row), false);
});

test('acesso pago rejeita operation de outro lead/tenant mesmo com state+ledger ativos', async () => {
  const { instance, context, row } = paidAccessGateHarness((where) => (
    where.id === 'op-de-outro-lead' ? { id: where.id } : null
  ));
  assert.equal(await instance.hasRadarPaidAcquisition(context, row), false);
});

test('acesso pago aceita somente run exato em estado pos-posse permitido', async () => {
  const { instance, context, row } = paidAccessGateHarness((where) => (
    where.id === 'op-paid-1'
      && where.companyId === 7
      && where.radarLeadId === 'lead-1'
      && where.mode === 'claim'
      && where.status?.in?.includes('completed')
      ? { id: where.id }
      : null
  ));
  assert.equal(await instance.hasRadarPaidAcquisition(context, row), true);
});

test('compra paga tenta RFB e Motor mesmo quando a primeira fonte falha', async () => {
  const harness = claimDeliveryHarness({ applied: true, debited: 1 });
  const attempts: string[] = [];
  let compensationCalls = 0;
  let fenceChecks = 0;
  harness.instance.assertRadarClaimWorkerFence = async () => {
    fenceChecks += 1;
  };
  harness.instance.commitPaidRadarVendasCore = async () => ({
    id: 'vendas-paid-1',
    created: true,
    idempotent: false,
  });
  harness.instance.hydrateRadarLeadFromRfbForClaim = async () => {
    attempts.push('rfb');
    throw new Error('RFB temporariamente indisponível');
  };
  harness.instance.persistClaimSourceCoverage = async (row: any) => row;
  harness.instance.enrichRadarLeadViaHbxMotor = async () => {
    attempts.push('motor');
    throw new Error('Motor temporariamente indisponível');
  };
  harness.instance.resolveRadarWhatsappStatusForDelivery = async () => null;
  // Força saída parcial logo depois das duas fontes, sem entrar nos efeitos
  // auxiliares. O card core pago já existe e jamais deve provocar estorno.
  harness.instance.refreshPaidRadarVendasSnapshot = async () => {
    throw new Error('snapshot será reparado pelo recovery');
  };
  harness.instance.compensateFailedRadarClaim = async () => {
    compensationCalls += 1;
  };

  const result = await harness.instance.importRadarLeadToVendasForUser(
    { role: 'ADMIN' },
    'lead-1',
    {
      debitOnImport: true,
      claimOperationId: 'op-sources-1',
      workerToken: 'worker-1',
    },
  );

  assert.deepEqual(attempts, ['rfb', 'motor']);
  assert.equal(fenceChecks, 2);
  assert.equal(compensationCalls, 0);
  assert.equal(result.vendasLeadId, 'vendas-paid-1');
  assert.equal(result.partialReasons.some((reason: string) => reason.includes('RFB')), true);
  assert.equal(result.partialReasons.some((reason: string) => reason.includes('Motor HBX')), true);
});

test('retry do mesmo card pago preserva snapshot 3+3 em colisão e não vira estorno', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  const updates: any[] = [];
  let failUpdate = false;
  instance.parseMaybeJsonObject = () => ({});
  instance.extractRadarLeadWhatsappStatus = () => 'unverified';
  instance.buildRadarLeadContactProjection = () => ({
    phoneContacts: [
      { value: '19999990001', rank: 1, source: 'rfb_primary' },
      { value: '1933334444', rank: 2, source: 'rfb_secondary' },
    ],
    emailContacts: [
      { value: 'contato@empresa.test', rank: 1, source: 'rfb_primary' },
    ],
  });
  const tx = {
    radarLeadProcessRun: { findFirst: async () => ({ id: 'op-existing' }) },
    creditLedgerEntry: {
      findFirst: async ({ where }: any) => where.kind === 'debit' ? { id: 'debit-1' } : null,
    },
    vendasLead: {
      findUnique: async () => ({ id: 'vendas-existing', companyId: 7 }),
      findFirst: async () => ({ id: 'vendas-with-same-phone' }),
      update: async ({ data }: any) => {
        if (failUpdate) throw new Error('write temporariamente indisponível');
        updates.push(data);
        return { id: 'vendas-existing' };
      },
    },
  };
  instance.prisma = { $transaction: async (work: any) => work(tx) };
  const input = {
    context: { companyId: 7, userId: 11 },
    operationId: 'op-existing',
    workerToken: 'worker-existing',
    usageKey: 'radar:lead-1:claim:op-existing',
    leadRow: {
      id: 'lead-1',
      name: 'Empresa',
      phone: '19999990001',
      phoneDigits: '19999990001',
      email: 'contato@empresa.test',
      metadataJson: '{}',
    },
  };

  const collision = await instance.commitPaidRadarVendasCore(input);
  assert.equal(collision.id, 'vendas-existing');
  assert.equal(collision.idempotent, true);
  assert.equal(collision.convergenceWarning, 'primary_phone_collision_snapshot_preserved');
  assert.equal('phone' in updates[0], false);
  assert.equal('phoneNormalized' in updates[0], false);
  assert.equal(JSON.parse(updates[0].contactSnapshotJson).phones.length, 2);

  failUpdate = true;
  const transientFailure = await instance.commitPaidRadarVendasCore(input);
  assert.equal(transientFailure.id, 'vendas-existing');
  assert.equal(transientFailure.idempotent, true);
  assert.match(transientFailure.convergenceWarning, /temporariamente indisponível/);
});

test('recovery após commit pago retoma RFB e Motor sem novo débito ou estorno', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  const attempts: string[] = [];
  const transitions: any[] = [];
  let refreshCalls = 0;
  let refundCalls = 0;
  const run = {
    id: 'op-recovery-paid',
    companyId: 7,
    userId: 11,
    radarLeadId: 'lead-1',
    status: 'motor_enriching',
    version: 3,
    updatedAt: new Date(0),
  };
  const lead = {
    id: 'lead-1',
    ownerCompanyId: 7,
    status: 'in_attendance',
    companyStates: [],
    contacts: [],
    metadataJson: '{}',
  };
  const store = {
    acquireRecoveryLease: async () => 'recovery-worker-1',
    getSnapshot: async () => ({
      ...run,
      data: { claimOptions: { assignedUserId: 11, assignedByUserId: 11 } },
      events: [],
    }),
    renewWorkerLease: async () => true,
    transitionOperation: async (input: any) => {
      transitions.push(input);
      return { status: input.status };
    },
  };
  instance.getRadarLeadProcessStore = () => store;
  instance.prisma = {
    hasTable: async () => true,
    radarLeadProcessRun: { findMany: async () => [run] },
    user: { findFirst: async () => ({ id: 11 }) },
    vendasLead: { findFirst: async () => ({ id: 'vendas-paid-1' }) },
    radarLeadCompanyState: { upsert: async () => ({}) },
    radarLeadPool: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => lead,
    },
  };
  instance.commercialUsageLimits = {
    hasActiveLeadDeliveryCredit: async () => true,
  };
  instance.hydrateRadarLeadFromRfbForClaim = async (row: any) => {
    attempts.push('rfb');
    return { row: { ...row, rfbDone: true }, succeeded: true, reason: null };
  };
  instance.enrichRadarLeadViaHbxMotor = async () => {
    attempts.push('motor');
    return { phones: ['19999990001'] };
  };
  instance.applyHbxMotorEnrichment = async (_context: any, row: any) => ({ ...row, motorDone: true });
  instance.refreshPaidRadarVendasSnapshot = async () => {
    refreshCalls += 1;
    return { id: 'vendas-paid-1', refreshed: true };
  };
  instance.buildQueueUser = async () => ({ companyId: 7, id: 11 });
  instance.getRadarLeadForUser = async () => ({ item: { id: 'lead-1', contactAccessGranted: true } });
  instance.confirmRadarClaimCreditRefund = async () => {
    refundCalls += 1;
  };

  await instance.recoverStaleRadarLeadClaimOperations({ updatedBefore: new Date() });

  assert.deepEqual(attempts, ['rfb', 'motor']);
  assert.equal(refreshCalls, 1);
  assert.equal(refundCalls, 0);
  assert.equal(transitions.at(-1)?.status, 'completed');
});

test('recovery de refund_pending remove card antes do estorno e nunca reabre PII', async () => {
  const instance = new RadarCoreDeliveryMixin() as any;
  const actions: string[] = [];
  const transitions: any[] = [];
  const run = {
    id: 'op-refund-recovery',
    companyId: 7,
    userId: 11,
    radarLeadId: 'lead-1',
    status: 'refund_pending',
    version: 4,
    updatedAt: new Date(0),
  };
  instance.getRadarLeadProcessStore = () => ({
    acquireRecoveryLease: async () => 'recovery-worker-refund',
    getSnapshot: async () => ({
      ...run,
      data: {
        originalOwnership: {
          id: 'lead-1', ownerCompanyId: null, claimedAt: null, status: 'clean', companyStates: [],
        },
      },
      events: [],
    }),
    transitionOperation: async (input: any) => {
      transitions.push(input);
      return { status: input.status };
    },
  });
  instance.prisma = {
    hasTable: async () => true,
    radarLeadProcessRun: { findMany: async () => [run] },
    user: { findFirst: async () => ({ id: 11 }) },
    vendasLead: { findFirst: async () => ({ id: 'vendas-paid-1' }) },
  };
  instance.commercialUsageLimits = {
    hasActiveLeadDeliveryCredit: async () => true,
  };
  instance.removeExactRadarPaidVendasCardForRefund = async () => {
    actions.push('remove_card');
    return { removed: true };
  };
  instance.rollbackRadarClaimAttempt = async () => {
    actions.push('restore_ownership');
    return { ownershipRestored: true };
  };
  instance.confirmRadarClaimCreditRefund = async () => {
    actions.push('refund_credit');
    return { refunded: 1 };
  };
  instance.sanitizeRadarPreDebitLead = (row: any) => ({ id: row.id, contactsMasked: true });
  instance.hydrateRadarLeadFromRfbForClaim = async () => {
    throw new Error('refund_pending não pode reabrir RFB');
  };
  instance.enrichRadarLeadViaHbxMotor = async () => {
    throw new Error('refund_pending não pode reabrir Motor');
  };

  await instance.recoverStaleRadarLeadClaimOperations({ updatedBefore: new Date() });

  assert.deepEqual(actions, ['remove_card', 'restore_ownership', 'refund_credit']);
  assert.deepEqual(transitions.map((input) => input.status), ['refund_pending', 'refunded']);
  assert.equal(JSON.stringify(transitions).includes('19999990001'), false);
  assert.equal(transitions[0].snapshotPatch.currentLead.contactsMasked, true);
});
