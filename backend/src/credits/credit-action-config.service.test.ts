import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditActionConfigService } from './credit-action-config.service';
import { clearCreditActionOverrides, CREDIT_ACTION_KEYS } from './credit-action-catalog';

function createFakePrisma() {
  const rows: Array<{ actionKey: string; configJson: string; createdAt: Date; updatedAt: Date }> = [];
  return {
    rows,
    creditActionConfig: {
      findMany: async () => rows.map((row) => ({ ...row })),
      findUnique: async ({ where }: any) => rows.find((row) => row.actionKey === where.actionKey) || null,
      upsert: async ({ where, update, create }: any) => {
        const row = rows.find((item) => item.actionKey === where.actionKey);
        if (row) {
          Object.assign(row, update, { updatedAt: new Date() });
          return { ...row };
        }
        const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
        rows.push(created);
        return { ...created };
      },
      deleteMany: async ({ where }: any) => {
        const index = rows.findIndex((row) => row.actionKey === where.actionKey);
        if (index < 0) return { count: 0 };
        rows.splice(index, 1);
        return { count: 1 };
      },
    },
  };
}

test.beforeEach(clearCreditActionOverrides);

test('ações não ligadas à entrega são editáveis em modo grátis ou débito decimal', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  const costs = new Map([
    [CREDIT_ACTION_KEYS.AUTOMATION, 0.1],
    [CREDIT_ACTION_KEYS.AI_REALTIME, 0.125],
    [CREDIT_ACTION_KEYS.AI_BATCH, 0.5],
    [CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY, 0.2],
    [CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK, 1],
    [CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY, 2],
  ]);
  for (const [key, cost] of costs) {
    const result = await service.setOverride(key, { mode: 'debit', cost });
    assert.equal(result.effective.cost, cost);
  }
  assert.equal(fake.rows.length, 6);

  const free = await service.setOverride(CREDIT_ACTION_KEYS.AI_BATCH, { mode: 'free', cost: 999 });
  assert.deepEqual(free.effective, { mode: 'free', cost: 0 });
});

test('lead_delivery é fixo em débito de 1 e recusa override grátis ou de custo', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.LEAD_DELIVERY, { mode: 'free', cost: 0 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.LEAD_DELIVERY, { mode: 'debit', cost: 2 }));
  assert.equal(fake.rows.length, 0);
  assert.deepEqual(await service.resolveEffective(CREDIT_ACTION_KEYS.LEAD_DELIVERY), {
    key: CREDIT_ACTION_KEYS.LEAD_DELIVERY,
    mode: 'debit',
    cost: 1,
    label: 'Lead entregue',
  });
});

test('override legado de lead_delivery fica inerte na resolução e na listagem', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.LEAD_DELIVERY,
    configJson: JSON.stringify({ mode: 'free', cost: 0 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);

  const effective = await service.resolveEffective(CREDIT_ACTION_KEYS.LEAD_DELIVERY);
  const listed = (await service.listForMaster()).find((item) => item.actionKey === CREDIT_ACTION_KEYS.LEAD_DELIVERY);
  assert.deepEqual({ mode: effective?.mode, cost: effective?.cost }, { mode: 'debit', cost: 1 });
  assert.deepEqual(listed?.effective, { mode: 'debit', cost: 1 });
  assert.equal(listed?.override, null);
});

test('listagem relê o banco e mostra defaults pedidos', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  const list = await service.listForMaster();
  assert.equal(list.length, 7);
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LEAD_DELIVERY)?.effective, { mode: 'debit', cost: 1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AUTOMATION)?.effective, { mode: 'debit', cost: 0.1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AI_REALTIME)?.effective, { mode: 'debit', cost: 0.1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AI_BATCH)?.effective, { mode: 'free', cost: 0 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY)?.effective, { mode: 'debit', cost: 0.2 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK)?.effective, { mode: 'debit', cost: 1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY)?.effective, { mode: 'debit', cost: 2 });
});

test('rejeita modo inválido, débito zero e custo negativo', async () => {
  const service = new CreditActionConfigService(createFakePrisma() as any);
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'monitorar', cost: 1 } as any));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'debit', cost: 0 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'debit', cost: -1 }));
  await assert.rejects(service.setOverride('acao_inventada', { mode: 'debit', cost: 1 }));
});

test('clearOverride volta ao default e é idempotente', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  await service.setOverride(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY, { mode: 'debit', cost: 0.7 });
  const cleared = await service.clearOverride(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY);
  assert.deepEqual(cleared.effective, { mode: 'debit', cost: 0.2 });
  await assert.doesNotReject(() => service.clearOverride(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY));
});

test('configuração legada removida não é reaproveitada como débito', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.AUTOMATION,
    configJson: JSON.stringify({ mode: 'track', cost: 9 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);
  const effective = await service.resolveEffective(CREDIT_ACTION_KEYS.AUTOMATION);
  assert.deepEqual({ mode: effective?.mode, cost: effective?.cost }, { mode: 'debit', cost: 0.1 });
});
