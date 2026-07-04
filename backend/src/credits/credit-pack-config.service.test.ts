import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditPackConfigService } from './credit-pack-config.service';
import { clearCreditPackOverrides, CREDIT_PACK_KEYS } from './credit-pack-catalog';

// CRÉDITOS S3-PARTE1 — CreditPackConfigService: persiste no fake CreditPackConfig/
// CreditGlobalConfig e confirma que refreshOverlay() de fato reflete no catálogo em memória
// (o mesmo contrato de refreshCommercialCatalogOverlay). Fake mínimo: só as 2 tabelas novas.

function createFakePrisma() {
  const packs: Array<{ packKey: string; configJson: string; createdAt: Date; updatedAt: Date }> = [];
  const globalConfig: Array<{ key: string; defaultExpiryDays: number; createdAt: Date; updatedAt: Date }> = [];

  const creditPackConfig = {
    findMany: async () => packs.map((p) => ({ ...p })),
    findUnique: async ({ where }: any) => {
      const row = packs.find((p) => p.packKey === where.packKey);
      return row ? { ...row } : null;
    },
    upsert: async ({ where, update, create }: any) => {
      const row = packs.find((p) => p.packKey === where.packKey);
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return { ...row };
      }
      const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
      packs.push(created);
      return { ...created };
    },
  };

  const creditGlobalConfig = {
    findUnique: async ({ where }: any) => {
      const row = globalConfig.find((c) => c.key === where.key);
      return row ? { ...row } : null;
    },
    upsert: async ({ where, update, create }: any) => {
      const row = globalConfig.find((c) => c.key === where.key);
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return { ...row };
      }
      const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
      globalConfig.push(created);
      return { ...created };
    },
  };

  return { creditPackConfig, creditGlobalConfig, packs, globalConfig };
}

test.beforeEach(() => {
  clearCreditPackOverrides();
});

test('updatePack persiste no fake CreditPackConfig e refresca o overlay em memória', async () => {
  const fake = createFakePrisma();
  const service = new CreditPackConfigService(fake as any);

  const updated = await service.updatePack(CREDIT_PACK_KEYS.STARTER, { price: 79.9, credits: 120 });
  assert.equal(updated.price, 79.9);
  assert.equal(updated.credits, 120);

  // Overlay em memória reflete o que foi persistido (getter síncrono do catálogo).
  const catalog = service.listAvailable();
  const starter = catalog.find((p) => p.key === CREDIT_PACK_KEYS.STARTER)!;
  assert.equal(starter.price, 79.9);
  assert.equal(starter.credits, 120);

  // Persistido de fato no fake DB (não só em memória).
  assert.equal(fake.packs.length, 1);
  assert.equal(fake.packs[0].packKey, CREDIT_PACK_KEYS.STARTER);
});

test('updatePack faz MERGE sobre o configJson existente (não perde campos já salvos)', async () => {
  const fake = createFakePrisma();
  const service = new CreditPackConfigService(fake as any);

  await service.updatePack(CREDIT_PACK_KEYS.GROWTH, { price: 199.0 });
  await service.updatePack(CREDIT_PACK_KEYS.GROWTH, { credits: 500 });

  const def = service.listAvailable().find((p) => p.key === CREDIT_PACK_KEYS.GROWTH)!;
  // Os 2 PUTs em campos diferentes convivem — nenhum apagou o outro.
  assert.equal(def.price, 199.0);
  assert.equal(def.credits, 500);
});

test('pacote pausado via master some do listAvailable mas aparece no listForMaster', async () => {
  const fake = createFakePrisma();
  const service = new CreditPackConfigService(fake as any);

  await service.updatePack(CREDIT_PACK_KEYS.SCALE, { status: 'paused' });
  assert.equal(service.listAvailable().some((p) => p.key === CREDIT_PACK_KEYS.SCALE), false);
  const forMaster = await service.listForMaster();
  assert.equal(forMaster.some((p) => p.key === CREDIT_PACK_KEYS.SCALE), true);
});

test('refreshOverlay no boot (onModuleInit) hidrata a partir do que já está persistido', async () => {
  const fake = createFakePrisma();
  fake.packs.push({
    packKey: CREDIT_PACK_KEYS.STARTER,
    configJson: JSON.stringify({ price: 55.5 }),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditPackConfigService(fake as any);
  await service.onModuleInit();

  const def = service.listAvailable().find((p) => p.key === CREDIT_PACK_KEYS.STARTER)!;
  assert.equal(def.price, 55.5);
});

test('updateGlobalExpiryDefaultDays persiste e o novo prazo passa a valer no overlay', async () => {
  const fake = createFakePrisma();
  const service = new CreditPackConfigService(fake as any);

  const result = await service.updateGlobalExpiryDefaultDays(30);
  assert.equal(result, 30);
  assert.equal(service.getGlobalExpiryDefaultDays(), 30);
  assert.equal(fake.globalConfig[0].defaultExpiryDays, 30);
});

test('configJson corrompido no banco não derruba o refresh (defensivo, cai na base)', async () => {
  const fake = createFakePrisma();
  fake.packs.push({
    packKey: CREDIT_PACK_KEYS.STARTER,
    configJson: '{not-json',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const service = new CreditPackConfigService(fake as any);
  await service.refreshOverlay();

  const def = service.listAvailable().find((p) => p.key === CREDIT_PACK_KEYS.STARTER)!;
  assert.equal(def.price, 97.0); // base, não quebrou
});
