import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditActionUsageService } from './credit-action-usage.service';

test.beforeEach(() => {
  process.env.HBX_CREDITS_ENABLED = 'true';
});

test.afterEach(() => {
  delete process.env.HBX_CREDITS_ENABLED;
});

test('reserva custo fracionado antes do efeito e estorna falha confirmada', async () => {
  const debits: any[] = [];
  const refunds: any[] = [];
  const service = new CreditActionUsageService(
    { resolveEffective: async () => ({ key: 'whatsapp_auto_send', mode: 'debit', cost: 0.1 }) } as any,
    {
      debit: async (companyId: number, amount: number, input: any) => {
        debits.push({ companyId, amount, ...input });
        return { debited: amount };
      },
      refund: async (companyId: number, input: any) => {
        refunds.push({ companyId, ...input });
        return { refunded: 0.1 };
      },
    } as any,
    { isEnforceActiveForCompany: async () => true } as any,
  );

  const reservation = await service.authorize({ companyId: 7, actionKey: 'whatsapp_auto_send', refId: 'msg-1' });
  assert.equal(reservation.allowed, true);
  assert.equal(reservation.charged, 0.1);
  assert.equal(debits[0].usageKey, 'action:whatsapp_auto_send:msg-1');
  await reservation.release?.();
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].usageKey, debits[0].usageKey);
});

test('modo grátis não toca a carteira', async () => {
  let debitCalls = 0;
  const service = new CreditActionUsageService(
    { resolveEffective: async () => ({ key: 'ai_batch', mode: 'free', cost: 0 }) } as any,
    { debit: async () => { debitCalls += 1; } } as any,
    { isEnforceActiveForCompany: async () => true } as any,
  );
  const result = await service.authorize({ companyId: 7, actionKey: 'ai_batch', refId: 'batch-1' });
  assert.equal(result.allowed, true);
  assert.equal(result.applied, false);
  assert.equal(debitCalls, 0);
});

test('saldo insuficiente bloqueia a ação e devolve eventual débito parcial', async () => {
  let refunded = false;
  const service = new CreditActionUsageService(
    { resolveEffective: async () => ({ key: 'logistica_delivery', mode: 'debit', cost: 0.2 }) } as any,
    {
      debit: async () => ({ debited: 0.1 }),
      refund: async () => { refunded = true; return { refunded: 0.1 }; },
    } as any,
    { isEnforceActiveForCompany: async () => true } as any,
  );
  const result = await service.authorize({ companyId: 7, actionKey: 'logistica_delivery', refId: 'entrega-1' });
  assert.equal(result.allowed, false);
  assert.equal(result.charged, 0);
  assert.equal(refunded, true);
});
