import test from 'node:test';
import assert from 'node:assert/strict';
import { VendasRadarPaidAccessService } from './vendas-radar-paid-access.service';

function makePrisma(input: { states?: any[]; runs?: any[]; ledger?: any[] } = {}) {
  return {
    radarLeadCompanyState: {
      findMany: async () => input.states || [],
    },
    radarLeadProcessRun: {
      findMany: async () => input.runs || [],
    },
    creditLedgerEntry: {
      findMany: async () => input.ledger || [],
    },
  } as any;
}

const acquiredAt = new Date('2026-07-14T12:00:00.000Z');

test('card manual sem marcador Radar continua manual e liberado', async () => {
  const service = new VendasRadarPaidAccessService(makePrisma());
  const access = await service.resolveForRow(7, {
    id: 'manual-1',
    sourceType: 'manual',
    primarySource: 'manual',
  });
  assert.equal(access.isRadarOrigin, false);
  assert.equal(access.contactAccessGranted, true);
});

test('sourceHistoryId legado isolado nunca vira prova de aquisição', async () => {
  const service = new VendasRadarPaidAccessService(makePrisma());
  const access = await service.resolveForRow(7, {
    id: 'legacy-1',
    sourceType: 'webscraping',
    sourceHistoryId: 'radar:pool-1',
  });
  assert.equal(access.isRadarOrigin, true);
  assert.equal(access.contactAccessGranted, false);
  assert.equal(access.reason, 'company_state_proof_missing');
});

test('claim moderno exige mesma empresa, operação, Radar, state adquirido e débito ativo', async () => {
  const usageKey = 'claim:op-1';
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-1',
      vendasLeadId: 'card-1',
      paidClaimOperationId: 'op-1',
      claimUsageKey: usageKey,
      acquiredAt,
    }],
    runs: [{ id: 'op-1', companyId: 7, radarLeadId: 'pool-1', mode: 'claim', status: 'completed' }],
    ledger: [{ kind: 'debit', usageKey: `enforce:lead_delivery:${usageKey}` }],
  }));
  const access = await service.resolveForRow(7, {
    id: 'card-1',
    sourceType: 'webscraping',
    sourceHistoryId: 'radar:pool-1',
    claimOperationId: 'op-1',
  });
  assert.equal(access.isRadarOrigin, true);
  assert.equal(access.contactAccessGranted, true);
  assert.equal(access.radarLeadId, 'pool-1');
});

test('legacy radar:* só libera com vínculo reverso exato no CompanyState e prova financeira', async () => {
  const usageKey = 'legacy-paid';
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-legacy',
      vendasLeadId: 'legacy-paid-card',
      paidClaimOperationId: 'op-legacy',
      claimUsageKey: usageKey,
      acquiredAt,
    }],
    runs: [{ id: 'op-legacy', companyId: 7, radarLeadId: 'pool-legacy', mode: 'claim', status: 'partial' }],
    ledger: [{ kind: 'debit', usageKey: `enforce:lead_delivery:${usageKey}` }],
  }));
  const access = await service.resolveForRow(7, {
    id: 'legacy-paid-card',
    sourceHistoryId: 'radar:pool-legacy',
  });
  assert.equal(access.contactAccessGranted, true);
});

test('refund_pending revoga acesso mesmo com state e débito presentes', async () => {
  const usageKey = 'claim:refund-pending';
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-2',
      vendasLeadId: 'card-2',
      paidClaimOperationId: 'op-2',
      claimUsageKey: usageKey,
      acquiredAt,
    }],
    runs: [{ id: 'op-2', companyId: 7, radarLeadId: 'pool-2', mode: 'claim', status: 'refund_pending' }],
    ledger: [{ kind: 'debit', usageKey: `enforce:lead_delivery:${usageKey}` }],
  }));
  const access = await service.resolveForRow(7, {
    id: 'card-2',
    sourceHistoryId: 'radar:pool-2',
    claimOperationId: 'op-2',
  });
  assert.equal(access.contactAccessGranted, false);
  assert.equal(access.reason, 'active_paid_claim_not_found');
});

test('status pré-posse nunca libera Vendas mesmo com state e débito presentes', async () => {
  const usageKey = 'claim:credit-only';
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-credit-only',
      vendasLeadId: 'card-credit-only',
      paidClaimOperationId: 'op-credit-only',
      claimUsageKey: usageKey,
      acquiredAt,
    }],
    runs: [{
      id: 'op-credit-only', companyId: 7, radarLeadId: 'pool-credit-only', mode: 'claim', status: 'credit_debited',
    }],
    ledger: [{ kind: 'debit', usageKey: `enforce:lead_delivery:${usageKey}` }],
  }));
  const access = await service.resolveForRow(7, {
    id: 'card-credit-only',
    sourceHistoryId: 'radar:pool-credit-only',
    claimOperationId: 'op-credit-only',
  });
  assert.equal(access.contactAccessGranted, false);
  assert.equal(access.reason, 'active_paid_claim_not_found');
});

test('ledger refund revoga acesso mesmo quando a saga ainda diz completed', async () => {
  const usageKey = 'claim:refunded';
  const debitKey = `enforce:lead_delivery:${usageKey}`;
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-3',
      vendasLeadId: 'card-3',
      paidClaimOperationId: 'op-3',
      claimUsageKey: usageKey,
      acquiredAt,
    }],
    runs: [{ id: 'op-3', companyId: 7, radarLeadId: 'pool-3', mode: 'claim', status: 'completed' }],
    ledger: [
      { kind: 'debit', usageKey: debitKey },
      { kind: 'refund', usageKey: `refund:${debitKey}` },
    ],
  }));
  const access = await service.resolveForRow(7, {
    id: 'card-3',
    sourceHistoryId: 'radar:pool-3',
    claimOperationId: 'op-3',
  });
  assert.equal(access.contactAccessGranted, false);
});

test('state legado apontando para outro card não autoriza o card solicitado', async () => {
  const service = new VendasRadarPaidAccessService(makePrisma({
    states: [{
      companyId: 7,
      radarLeadId: 'pool-4',
      vendasLeadId: 'outro-card',
      paidClaimOperationId: 'op-4',
      claimUsageKey: 'claim:op-4',
      acquiredAt,
    }],
  }));
  const access = await service.resolveForRow(7, {
    id: 'card-4',
    sourceHistoryId: 'radar:pool-4',
  });
  assert.equal(access.contactAccessGranted, false);
});
