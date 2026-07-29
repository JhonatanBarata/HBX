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

test('ações públicas são editáveis em modo grátis ou débito decimal', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  const costs = new Map([
    [CREDIT_ACTION_KEYS.LEAD_DELIVERY, 1],
    [CREDIT_ACTION_KEYS.AUTOMATION, 0.1],
    [CREDIT_ACTION_KEYS.AI_REALTIME, 0.125],
    [CREDIT_ACTION_KEYS.AI_BATCH, 0.5],
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

test('listagem relê o banco e mostra defaults pedidos', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  const list = await service.listForMaster();
  // 29/07 — 8ª ação: passeio_tour (Modo Passeio do APK).
  assert.equal(list.length, 8);
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LEAD_DELIVERY)?.effective, { mode: 'debit', cost: 1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AUTOMATION)?.effective, { mode: 'debit', cost: 0.1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AI_REALTIME)?.effective, { mode: 'debit', cost: 0.1 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.AI_BATCH)?.effective, { mode: 'free', cost: 0 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY)?.effective, { mode: 'free', cost: 0 });
  // 28/07 (dono) — Logística Simples cobra POR PARADA: o preço do bloco de 5 (2)
  // dividido pelas paradas que ele cobria = 0,4.
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK)?.effective, { mode: 'debit', cost: 0.4 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY)?.effective, { mode: 'debit', cost: 2 });
  assert.deepEqual(list.find((item) => item.actionKey === CREDIT_ACTION_KEYS.PASSEIO_TOUR)?.effective, { mode: 'debit', cost: 2 });
});

test('entrega avulsa legada é sempre grátis e não aceita override de débito', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
    configJson: JSON.stringify({ mode: 'debit', cost: 0.2 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);

  const effective = await service.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY);
  assert.deepEqual({ mode: effective?.mode, cost: effective?.cost }, { mode: 'free', cost: 0 });
  const listed = await service.listForMaster();
  const legacy = listed.find((item) => item.actionKey === CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY);
  assert.deepEqual(legacy?.effective, { mode: 'free', cost: 0 });
  assert.equal(legacy?.override, null);
  // O painel precisa saber do cadeado ANTES de tentar salvar (dono 28/07):
  // a linha vira leitura em vez de oferecer campo que o backend recusa.
  assert.equal(legacy?.locked, true);
  assert.match(String(legacy?.lockedReason), /absorvida pela cobrança da rota/);
  for (const item of listed.filter((row) => row.actionKey !== CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY)) {
    assert.equal(item.locked, false, `${item.actionKey} não pode aparecer travada`);
    assert.equal(item.lockedReason, null);
  }
  await assert.rejects(
    service.setOverride(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY, { mode: 'debit', cost: 0.2 }),
    /absorvida pela cobrança da rota/,
  );
});

test('rejeita modo inválido, débito zero e custo negativo', async () => {
  const service = new CreditActionConfigService(createFakePrisma() as any);
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'monitorar', cost: 1 } as any));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'debit', cost: 0 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'debit', cost: -1 }));
  await assert.rejects(service.setOverride('acao_inventada', { mode: 'debit', cost: 1 }));
});

test('clearOverride remove configuração antiga da entrega e mantém default grátis', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
    configJson: JSON.stringify({ mode: 'debit', cost: 0.7 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);
  const cleared = await service.clearOverride(CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY);
  assert.deepEqual(cleared.effective, { mode: 'free', cost: 0 });
  assert.equal(fake.rows.length, 0);
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
