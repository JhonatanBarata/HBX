import test from 'node:test';
import assert from 'node:assert/strict';

import { HbxCommissionSyncService } from './hbx-commission-sync.service';

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
