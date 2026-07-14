import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditActionConfigService } from './credit-action-config.service';
import { clearCreditActionOverrides, CREDIT_ACTION_KEYS } from './credit-action-catalog';

// PR11072026 W1 (docs/PLANEJAMENTOS/PR11072026/01-OVERLAY-CATALOGO-ACOES.md) —
// CreditActionConfigService: persiste no fake CreditActionConfig e confirma que
// refreshOverlay() de fato reflete no catálogo em memória (mesmo contrato do
// credit-pack-config.service.test.ts). Fake mínimo: só a 1 tabela nova.

function createFakePrisma() {
  const rows: Array<{ actionKey: string; configJson: string; createdAt: Date; updatedAt: Date }> = [];

  const creditActionConfig = {
    findMany: async () => rows.map((r) => ({ ...r })),
    findUnique: async ({ where }: any) => {
      const row = rows.find((r) => r.actionKey === where.actionKey);
      return row ? { ...row } : null;
    },
    upsert: async ({ where, update, create }: any) => {
      const row = rows.find((r) => r.actionKey === where.actionKey);
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return { ...row };
      }
      const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
      rows.push(created);
      return { ...created };
    },
    deleteMany: async ({ where }: any) => {
      const before = rows.length;
      const idx = rows.findIndex((r) => r.actionKey === where.actionKey);
      if (idx >= 0) rows.splice(idx, 1);
      return { count: before - rows.length };
    },
  };

  return { creditActionConfig, rows };
}

test.beforeEach(() => {
  clearCreditActionOverrides();
});

test('setOverride persiste no fake CreditActionConfig e refresca o overlay em memória', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  const updated = await service.setOverride(CREDIT_ACTION_KEYS.AI_BATCH, { mode: 'debit', cost: 5 });
  assert.equal(updated.effective.mode, 'debit');
  assert.equal(updated.effective.cost, 5);
  assert.deepEqual(updated.override, { mode: 'debit', cost: 5 });

  // Overlay em memória reflete o que foi persistido (getter síncrono do catálogo).
  const list = service.listForMaster();
  const item = list.find((a) => a.actionKey === CREDIT_ACTION_KEYS.AI_BATCH)!;
  assert.equal(item.effective.mode, 'debit');
  assert.equal(item.effective.cost, 5);

  // Persistido de fato no fake DB (não só em memória).
  assert.equal(fake.rows.length, 1);
  assert.equal(fake.rows[0].actionKey, CREDIT_ACTION_KEYS.AI_BATCH);
});

test('listForMaster: ação sem override mostra override=null e effective=base', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  const list = service.listForMaster();
  assert.equal(list.length, 7);
  const item = list.find((a) => a.actionKey === CREDIT_ACTION_KEYS.AI_REALTIME)!;
  assert.equal(item.override, null);
  assert.deepEqual(item.effective, item.base);
});

test('lead_delivery: REJEITA sempre (400) — cobrança fixa no caminho assert, não editável', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(
    service.setOverride(CREDIT_ACTION_KEYS.LEAD_DELIVERY, { mode: 'track', cost: 1 }),
    /lead_delivery/,
  );
  assert.equal(fake.rows.length, 0, 'nada persistido');
});

test('ações de logística são fixas e rejeitam overlay do Master', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);
  for (const key of [
    CREDIT_ACTION_KEYS.LOGISTICA_DELIVERY,
    CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK,
    CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
  ]) {
    await assert.rejects(service.setOverride(key, { mode: 'free', cost: 99 }), /não é editável/);
  }
  assert.equal(fake.rows.length, 0);
});

test('whatsapp_auto_send + mode debit: REJEITA (400) — decisão do dono, WhatsApp nunca debita', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(
    service.setOverride(CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND, { mode: 'debit', cost: 1 }),
    /nunca debita/,
  );
  assert.equal(fake.rows.length, 0);

  // free e track continuam permitidos pra essa ação.
  const okFree = await service.setOverride(CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND, { mode: 'free', cost: 1 });
  assert.equal(okFree.effective.mode, 'free');
});

test('cost inválido (0, fração, negativo, não-numérico): REJEITA (400)', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'track', cost: 0 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'track', cost: 1.5 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'track', cost: -3 }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'track', cost: NaN }));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'track' } as any));
  assert.equal(fake.rows.length, 0, 'nada persistido em nenhuma tentativa inválida');
});

test('mode inválido (fora de free|track|debit): REJEITA (400)', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, { mode: 'gratis', cost: 1 } as any));
  await assert.rejects(service.setOverride(CREDIT_ACTION_KEYS.AI_REALTIME, {} as any));
});

test('actionKey desconhecida: REJEITA (400)', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await assert.rejects(service.setOverride('acao_inventada', { mode: 'track', cost: 1 }));
  await assert.rejects(service.clearOverride('acao_inventada'));
  assert.equal(fake.rows.length, 0);
});

test('clearOverride: DELETE volta à base (idempotente mesmo sem override existente)', async () => {
  const fake = createFakePrisma();
  const service = new CreditActionConfigService(fake as any);

  await service.setOverride(CREDIT_ACTION_KEYS.AI_BATCH, { mode: 'debit', cost: 2 });
  assert.equal(fake.rows.length, 1);

  const cleared = await service.clearOverride(CREDIT_ACTION_KEYS.AI_BATCH);
  assert.equal(cleared.override, null);
  assert.deepEqual(cleared.effective, cleared.base);
  assert.equal(fake.rows.length, 0);

  // Chamar de novo (sem override) não quebra — idempotente.
  const clearedAgain = await service.clearOverride(CREDIT_ACTION_KEYS.AI_BATCH);
  assert.equal(clearedAgain.override, null);
});

test('refreshOverlay no boot (onModuleInit) hidrata a partir do que já está persistido', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.AI_REALTIME,
    configJson: JSON.stringify({ mode: 'debit', cost: 7 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);
  await service.onModuleInit();

  const item = service.listForMaster().find((a) => a.actionKey === CREDIT_ACTION_KEYS.AI_REALTIME)!;
  assert.equal(item.effective.mode, 'debit');
  assert.equal(item.effective.cost, 7);
});

test('configJson corrompido no banco não derruba o refresh (defensivo, cai na base)', async () => {
  const fake = createFakePrisma();
  fake.rows.push({
    actionKey: CREDIT_ACTION_KEYS.AI_BATCH,
    configJson: '{not-json',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditActionConfigService(fake as any);
  await service.refreshOverlay();

  const item = service.listForMaster().find((a) => a.actionKey === CREDIT_ACTION_KEYS.AI_BATCH)!;
  assert.equal(item.override, null);
  assert.deepEqual(item.effective, item.base); // base, não quebrou
});

test('onModuleInit: banco indisponível não derruba o boot (fail-soft, overlay vazio)', async () => {
  const explosive = {
    creditActionConfig: {
      findMany: async () => {
        throw new Error('banco fora');
      },
    },
  };
  const service = new CreditActionConfigService(explosive as any);
  await assert.doesNotReject(service.onModuleInit());

  const item = service.listForMaster().find((a) => a.actionKey === CREDIT_ACTION_KEYS.AI_BATCH)!;
  assert.deepEqual(item.effective, item.base);
});
