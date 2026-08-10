import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditActionUsageService } from './credit-action-usage.service';
import { CreditActionConfigService } from './credit-action-config.service';
import { clearCreditActionOverrides, CREDIT_ACTION_KEYS } from './credit-action-catalog';

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

/**
 * TRAVA DE DINHEIRO: o preço que o master edita no "Catálogo de ações" tem que
 * SAIR da carteira, não só ficar salvo na tabela. Aqui o config é o serviço REAL
 * (sem stub) por cima de um Prisma falso — mudar o override tem que mudar o valor
 * que chega em wallet.debit. Se alguém voltar a cravar o custo no chamador, este
 * teste fica vermelho.
 */
test('override do master muda o valor efetivamente debitado', async () => {
  clearCreditActionOverrides();
  const rows: Array<{ actionKey: string; configJson: string }> = [];
  const prisma = {
    creditActionConfig: {
      findMany: async () => rows.map((row) => ({ ...row })),
      findUnique: async ({ where }: any) => rows.find((row) => row.actionKey === where.actionKey) || null,
      upsert: async ({ where, update, create }: any) => {
        const row = rows.find((item) => item.actionKey === where.actionKey);
        if (row) { Object.assign(row, update); return { ...row }; }
        rows.push({ ...create });
        return { ...create };
      },
      deleteMany: async ({ where }: any) => {
        const index = rows.findIndex((row) => row.actionKey === where.actionKey);
        if (index >= 0) rows.splice(index, 1);
        return { count: index >= 0 ? 1 : 0 };
      },
    },
  };
  const config = new CreditActionConfigService(prisma as any);
  const debits: number[] = [];
  const service = new CreditActionUsageService(
    config as any,
    {
      debit: async (_companyId: number, amount: number) => { debits.push(amount); return { debited: amount }; },
      refund: async () => ({ refunded: 0 }),
    } as any,
    { isEnforceActiveForCompany: async () => true } as any,
  );

  // Sem override: vale o custo do catálogo — 6 por DIA DE ROTA (ROTA v2, 10/08;
  // LOGISTICA_ESSENTIAL_BLOCK aposentou e travou nesta mesma onda, ver
  // credit-action-catalog.test.ts — este teste trocou pro débito que ficou editável).
  const padrao = await service.authorize({
    companyId: 7,
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
    refId: 'dia-1',
  });
  assert.equal(padrao.charged, 6);

  // Master sobe 6 → 10: a carteira PRECISA debitar 10.
  await config.setOverride(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA, { mode: 'debit', cost: 10 });
  const editado = await service.authorize({
    companyId: 7,
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
    refId: 'dia-2',
  });
  assert.equal(editado.charged, 10);
  assert.deepEqual(debits, [6, 10]);

  // Master desativa (Grátis): para de debitar, sem apagar a ação do catálogo.
  await config.setOverride(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA, { mode: 'free', cost: 0 });
  const desligado = await service.authorize({
    companyId: 7,
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
    refId: 'dia-3',
  });
  assert.equal(desligado.applied, false);
  assert.equal(desligado.charged, 0);
  assert.deepEqual(debits, [6, 10], 'modo Grátis não acrescenta débito nenhum');

  // Restaurar padrão volta ao custo do catálogo.
  await config.clearOverride(CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA);
  const restaurado = await service.authorize({
    companyId: 7,
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DIA_DE_ROTA,
    refId: 'dia-4',
  });
  assert.equal(restaurado.charged, 6, 'Restaurar padrão volta pro preço do dia no catálogo');
  clearCreditActionOverrides();
});
