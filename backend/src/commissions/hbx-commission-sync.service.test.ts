import test from 'node:test';
import assert from 'node:assert/strict';

import { HbxCommissionSyncService } from './hbx-commission-sync.service';
import {
  getCommercialPlanMonthlyPrice,
  normalizeCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';

// Pós-S6 (cortesia morreu): empresa SEM accountType normaliza pra 'credit' → access-state
// 'exempt'. Trial como estado vivo só existe pra conta enterprise (máquina legada).
test('resolveClientState mantém trial de enterprise pendente, sem comissão paga', () => {
  const service = new HbxCommissionSyncService({} as any);
  const state = (service as any).resolveClientState({
    accountType: 'enterprise',
    status: 'trial',
    isActive: true,
    trialEndsAt: new Date('2026-12-31T12:00:00.000Z'),
    trialStartsAt: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'trial_started');
  assert.equal(state.commissionStatus, 'pending');
  assert.equal(state.recurring, false);
});

// FREIO comissão-fantasma (S7): conta CRÉDITO ativa (signup grátis) = venda confirmada no
// funil, mas comissão PENDENTE e sem recorrência — cliente paga R$0, não existe receita
// recorrente cobrada pra comissionar.
test('resolveClientState não paga comissão de conta crédito (ex-cortesia)', () => {
  const service = new HbxCommissionSyncService({} as any);
  const state = (service as any).resolveClientState({
    accountType: 'credit',
    status: 'active',
    isActive: true,
    createdAt: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'sale_confirmed');
  assert.equal(state.commissionStatus, 'pending');
  assert.equal(state.recurring, false);
});

// Mesma regra pra liberação manual de enterprise sem assinatura cobrando: pendente até
// existir dinheiro real ('paying').
test('resolveClientState mantém liberação manual pendente até receita real', () => {
  const service = new HbxCommissionSyncService({} as any);
  // 'manual' = enterprise legada com cortesia COM prazo (stored 'courtesy' + courtesyEndsAt).
  const state = (service as any).resolveClientState({
    accountType: 'enterprise',
    status: 'courtesy',
    isActive: true,
    courtesyEndsAt: new Date('2026-12-31T12:00:00.000Z'),
    createdAt: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'sale_confirmed');
  assert.equal(state.commissionStatus, 'pending');
  assert.equal(state.recurring, false);
});

test('resolveClientState libera comissão pra cliente PAGANTE (assinatura cobrando)', () => {
  const service = new HbxCommissionSyncService({} as any);
  const state = (service as any).resolveClientState({
    accountType: 'enterprise',
    status: 'active',
    isActive: true,
    subscriptionCurrentPeriodStart: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.equal(state.saleStatus, 'sale_confirmed');
  assert.equal(state.commissionStatus, 'payable');
  assert.equal(state.recurring, true);
});

test('generateSalesCompanyRecurringReceivables ignores trial leads', async () => {
  // O gerador faz 2 findMany: 1º recorrência mensal, 2º receivables de implantação (setup).
  const seenWheres: any[] = [];
  const service = new HbxCommissionSyncService({
    company: {
      findUnique: async () => ({ commissionDueBusinessDays: 3 }),
    },
    vendasCommissionReceivable: {
      updateMany: async () => ({ count: 0 }),
    },
    vendasLead: {
      findMany: async ({ where }: any) => {
        seenWheres.push(where);
        return [];
      },
    },
  } as any);

  await service.generateSalesCompanyRecurringReceivables(7);

  const recurringWhere = seenWheres[0];
  assert.equal(recurringWhere.saleStatus, 'sale_confirmed');
  // Guarda do FREIO: a recorrência só varre lead com commissionRecurring=true — conta
  // crédito/manual (recurring:false no resolveClientState) nunca entra aqui.
  assert.equal(recurringWhere.commissionRecurring, true);
});

// ── FURO 2 (11/07): comissão sobre recarga ────────────────────────────────────────────────

// Desarmada por default: sem HBX_COMMISSION_RECHARGE_PERCENT não toca no banco.
test('createRechargeCommission desarmada (percent 0) não cria nada', async () => {
  delete process.env.HBX_COMMISSION_RECHARGE_PERCENT;
  let touchedDb = false;
  const service = new HbxCommissionSyncService({
    vendasLead: { findFirst: async () => { touchedDb = true; return null; } },
  } as any);

  const result = await service.createRechargeCommission({ companyId: 9, chargeId: 55, amount: 247 });

  assert.equal(result.created, false);
  assert.equal((result as any).reason, 'disarmed');
  assert.equal(touchedDb, false);
});

// Armada: receivable = valor REAL da recarga × %, kind 'recharge', idempotente por charge.
test('createRechargeCommission armada cria receivable sobre o valor real e dedupa por charge', async () => {
  process.env.HBX_COMMISSION_RECHARGE_PERCENT = '10';
  try {
    const created: any[] = [];
    let existing: any = null;
    const service = new HbxCommissionSyncService({
      vendasLead: {
        findFirst: async () => ({
          id: 'lead-1',
          companyId: 5,
          assignedUserId: 7,
          assignedByUserId: null,
          createdByUserId: 3,
        }),
      },
      vendasCommissionReceivable: {
        findFirst: async () => existing,
        create: async ({ data }: any) => { created.push(data); existing = { id: 'r1' }; return data; },
      },
      company: { findUnique: async () => ({ commissionDueBusinessDays: 3 }) },
    } as any);

    const first = await service.createRechargeCommission({ companyId: 9, chargeId: 55, amount: 247 });
    assert.equal(first.created, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].kind, 'recharge');
    assert.equal(created[0].cycleKey, 'recharge:55');
    assert.equal(created[0].status, 'payable');
    assert.equal(created[0].baseAmount, 247); // valor REAL pago, nunca tabela
    assert.equal(created[0].amount, 24.7); // 10% do pago
    assert.equal(created[0].sellerUserId, 7);
    assert.equal(created[0].companyId, 5); // empresa de VENDAS (dona do lead)
    assert.equal(created[0].linkedCompanyId, 9); // cliente que recarregou

    const second = await service.createRechargeCommission({ companyId: 9, chargeId: 55, amount: 247 });
    assert.equal(second.created, false);
    assert.equal((second as any).reason, 'already_exists');
    assert.equal(created.length, 1);
  } finally {
    delete process.env.HBX_COMMISSION_RECHARGE_PERCENT;
  }
});

// Sem lead vinculado pelo sync não existe vendedor → recarga não comissiona.
test('createRechargeCommission sem lead vinculado não cria receivable', async () => {
  process.env.HBX_COMMISSION_RECHARGE_PERCENT = '10';
  try {
    const service = new HbxCommissionSyncService({
      vendasLead: { findFirst: async () => null },
    } as any);
    const result = await service.createRechargeCommission({ companyId: 9, chargeId: 55, amount: 247 });
    assert.equal(result.created, false);
    assert.equal((result as any).reason, 'no_linked_lead');
  } finally {
    delete process.env.HBX_COMMISSION_RECHARGE_PERCENT;
  }
});

// ── FURO 3 (11/07): sync não rebaixa valor negociado pra preço de tabela ─────────────────

function buildFuro3Service(captured: { data: any[] }) {
  const tx = {
    vendasLead: { update: async ({ data }: any) => { captured.data.push(data); return {}; } },
    vendasLeadTimelineEvent: { create: async () => ({}) },
  };
  return new HbxCommissionSyncService({
    user: { findFirst: async () => ({ commissionMonthlyCap: 0, setupCommissionCap: 0 }) },
    company: { findUnique: async () => ({ commissionDueBusinessDays: 3 }) },
    $transaction: async (fn: any) => fn(tx),
    vendasCommissionReceivable: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
  } as any);
}

test('updateLeadFromCompany preserva saleValue NEGOCIADO (não rebaixa pra tabela)', async () => {
  const captured = { data: [] as any[] };
  const service = buildFuro3Service(captured);
  const state = { saleStatus: 'sale_confirmed', commissionStatus: 'pending', recurring: false, eventAt: new Date() };
  const lead = {
    id: 'lead-1', companyId: 5, assignedUserId: 7, commissionPercentSnapshot: 10,
    saleStatus: 'none', commissionStatus: 'none', saleValue: 445.9, setupValue: 0,
  };
  const company = { id: 9, selectedPlanKey: 'hbx_padrao' };

  await (service as any).updateLeadFromCompany(lead, company, state, {});

  assert.equal(captured.data.length, 1);
  assert.equal(captured.data[0].saleValue, 445.9);
  assert.equal(captured.data[0].commissionBaseAmount, 445.9);
});

test('updateLeadFromCompany usa tabela como default quando o card não tem valor', async () => {
  const captured = { data: [] as any[] };
  const service = buildFuro3Service(captured);
  const state = { saleStatus: 'sale_confirmed', commissionStatus: 'pending', recurring: false, eventAt: new Date() };
  const lead = {
    id: 'lead-2', companyId: 5, assignedUserId: 7, commissionPercentSnapshot: 10,
    saleStatus: 'none', commissionStatus: 'none', saleValue: 0, setupValue: 0,
  };
  const company = { id: 9, selectedPlanKey: 'hbx_padrao' };

  await (service as any).updateLeadFromCompany(lead, company, state, {});

  const tablePrice = getCommercialPlanMonthlyPrice(normalizeCommercialPlanKey('hbx_padrao'));
  assert.equal(captured.data.length, 1);
  assert.equal(captured.data[0].saleValue, Number(tablePrice.toFixed(2)));
  assert.equal(captured.data[0].commissionBaseAmount, Number(tablePrice.toFixed(2)));
});
