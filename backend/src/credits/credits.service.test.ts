import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditWalletService } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import { CreditsService } from './credits.service';
import { clearCreditPackOverrides } from './credit-pack-catalog';

// CRÉDITOS S3-PARTE1 — CreditsService: concessão master idempotente por sourceRef/usageKey,
// grantType, expiresAt do default quando omitido; e /credits/me role-gating (LEI DO VENDEDOR:
// vendedor NUNCA recebe R$/saldo/preço/pacote — só a contagem neutra de leads disponíveis).
//
// Fake Prisma: reusa o MESMO desenho do credit-wallet.service.test.ts (updateMany condicional +
// @@unique(usageKey,parentEntryId) + $transaction interativo com rollback) e acrescenta
// `company.findUnique` (usado por assertCompanyExists) + as 2 tabelas do CreditPackConfigService.

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gt' in cond && !(Number(value) > cond.gt)) return false;
      if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data || {})) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('increment' in value) {
        row[key] = (Number(row[key]) || 0) + Number(value.increment);
        continue;
      }
      if ('decrement' in value) {
        row[key] = (Number(row[key]) || 0) - Number(value.decrement);
        continue;
      }
    }
    row[key] = value;
  }
}

function createFakePrisma(companyIds: number[] = [1]) {
  const wallets: Row[] = [];
  const entries: Row[] = [];
  const companies: Row[] = companyIds.map((id) => ({ id }));
  const packs: Row[] = [];
  const globalConfig: Row[] = [];
  let nextWalletId = 1;
  let nextEntryId = 1;

  let journal: Array<() => void> | null = null;
  function record(undo: () => void) {
    if (journal) journal.push(undo);
  }

  function assertUnique(usageKey: any, parentEntryId: any) {
    if (usageKey == null) return;
    const clash = entries.some(
      (item) => item.usageKey === usageKey && (item.parentEntryId ?? null) === (parentEntryId ?? null),
    );
    if (clash) {
      const err: any = new Error('Unique constraint failed on (usageKey, parentEntryId)');
      err.code = 'P2002';
      throw err;
    }
  }

  const creditWallet = {
    findUnique: async ({ where }: any) => {
      const row = wallets.find((item) => item.companyId === where.companyId || item.id === where.id);
      return row ? { ...row } : null;
    },
    create: async ({ data }: any) => {
      if (wallets.some((item) => item.companyId === data.companyId)) {
        const err: any = new Error('unique constraint');
        err.code = 'P2002';
        throw err;
      }
      const row: Row = { id: `w${nextWalletId++}`, companyId: data.companyId, createdAt: new Date(), updatedAt: new Date() };
      wallets.push(row);
      record(() => {
        const idx = wallets.indexOf(row);
        if (idx >= 0) wallets.splice(idx, 1);
      });
      return { ...row };
    },
  };

  const creditLedgerEntry = {
    create: async ({ data }: any) => {
      assertUnique(data.usageKey ?? null, data.parentEntryId ?? null);
      const row: Row = {
        id: `e${nextEntryId++}`,
        createdAt: new Date(),
        remaining: 0,
        expiresAt: null,
        grantType: null,
        actionKey: null,
        usageKey: null,
        sourceRef: null,
        parentEntryId: null,
        createdByUserId: null,
        metadataJson: null,
        ...data,
      };
      entries.push(row);
      record(() => {
        const idx = entries.indexOf(row);
        if (idx >= 0) entries.splice(idx, 1);
      });
      return { ...row };
    },
    findUnique: async ({ where }: any) => {
      const row = entries.find((item) => item.id === where.id);
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }: any) => {
      const row = entries.find((item) => matchesWhere(item, where));
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: any) => {
      const rows = entries.filter((item) => matchesWhere(item, where));
      return rows.map((row) => ({ ...row }));
    },
    update: async ({ where, data }: any) => {
      const row = entries.find((item) => item.id === where.id);
      if (!row) throw new Error('update: row not found');
      const before = { ...row };
      applyData(row, data);
      record(() => Object.assign(row, before));
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      const rows = entries.filter((item) => matchesWhere(item, where));
      const befores = rows.map((row) => ({ row, snapshot: { ...row } }));
      rows.forEach((row) => applyData(row, data));
      record(() => befores.forEach(({ row, snapshot }) => Object.assign(row, snapshot)));
      return { count: rows.length };
    },
  };

  const company = {
    findUnique: async ({ where }: any) => {
      const row = companies.find((item) => item.id === where.id);
      return row ? { ...row } : null;
    },
  };

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

  let txChain: Promise<any> = Promise.resolve();

  const client: any = {
    creditWallet,
    creditLedgerEntry,
    company,
    creditPackConfig,
    creditGlobalConfig,
    $transaction: async (fn: any) => {
      const run = async () => {
        const outerJournal = journal;
        const myJournal: Array<() => void> = [];
        journal = myJournal;
        try {
          const result = await fn(client);
          journal = outerJournal;
          return result;
        } catch (error) {
          for (let i = myJournal.length - 1; i >= 0; i--) myJournal[i]();
          journal = outerJournal;
          throw error;
        }
      };
      const result = txChain.then(run, run);
      txChain = result.then(() => undefined, () => undefined);
      return result;
    },
  };

  return client;
}

function buildService(companyIds: number[] = [1]) {
  const fake = createFakePrisma(companyIds);
  const wallet = new CreditWalletService(fake as any);
  const packConfig = new CreditPackConfigService(fake as any);
  const service = new CreditsService(fake as any, wallet, packConfig);
  return { fake, wallet, packConfig, service };
}

test.beforeEach(() => {
  clearCreditPackOverrides();
  process.env.HBX_CREDITS_ENABLED = 'true';
});

test.afterEach(() => {
  delete process.env.HBX_CREDITS_ENABLED;
});

// ─── Concessão master: idempotência por sourceRef ──────────────────────────────────────────────

test('grantToCompanyAsMaster: mesma sourceRef 2x -> concede 1 lote só (idempotente)', async () => {
  const { service, wallet } = buildService();
  const input = { amount: 100, grantType: 'paid' as const, sourceRef: 'mp-payment-abc123' };

  const first = await service.grantToCompanyAsMaster(999, 1, input);
  const second = await service.grantToCompanyAsMaster(999, 1, input);

  assert.equal(first.alreadyProcessed, false);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(second.entryId, first.entryId);

  const balance = await wallet.getBalance(1);
  assert.equal(balance, 100); // não duplicou
});

test('grantToCompanyAsMaster: grantType correto é gravado no lote', async () => {
  const { service, wallet } = buildService();
  await service.grantToCompanyAsMaster(999, 1, { amount: 50, grantType: 'courtesy_internal', usageKey: 'grant-ct-1' });
  const snapshot = await wallet.getWalletSnapshot(1);
  assert.equal(snapshot.lots.length, 1);
  assert.equal(snapshot.lots[0].grantType, 'courtesy_internal');
});

// ─── Fix II (revisão Opus): idempotência OBRIGATÓRIA na concessão ──────────────────────────────

test('grantToCompanyAsMaster: mesma usageKey 2x -> 1 lote só (saldo sobe 1×, não dobra no double-click)', async () => {
  const { service, wallet } = buildService();
  const input = { amount: 40, grantType: 'paid' as const, usageKey: 'intent-uuid-xyz' };

  const first = await service.grantToCompanyAsMaster(999, 1, input);
  const second = await service.grantToCompanyAsMaster(999, 1, input);

  assert.equal(first.alreadyProcessed, false);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(second.entryId, first.entryId);
  assert.equal(await wallet.getBalance(1), 40); // 1 lote, não 2
});

test('grantToCompanyAsMaster: SEM usageKey e SEM sourceRef -> BadRequest (idempotência exigida)', async () => {
  const { service, wallet } = buildService();
  await assert.rejects(
    () => service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid' }),
    /idempotencyKey|usageKey|sourceRef/i,
  );
  // Nada foi concedido — a recusa é ANTES do grant.
  assert.equal(await wallet.getBalance(1), 0);
});

test('grantToCompanyAsMaster: usageKey/sourceRef só com espaços em branco também é rejeitado', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid', usageKey: '   ', sourceRef: '  ' }),
    /idempotencyKey|usageKey|sourceRef/i,
  );
});

test('grantToCompanyAsMaster: 2 concessões legítimas com tokens DIFERENTES criam lotes distintos', async () => {
  const { service, wallet } = buildService();
  await service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid', usageKey: 'intent-A' });
  await service.grantToCompanyAsMaster(999, 1, { amount: 15, grantType: 'promo', usageKey: 'intent-B' });
  assert.equal(await wallet.getBalance(1), 25); // dois lotes somam
});

test('grantToCompanyAsMaster: grantType invalido é rejeitado (mesmo com usageKey válida)', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'invalido' as any, usageKey: 'gt-bad' }),
    /grantType/,
  );
});

test('grantToCompanyAsMaster: amount invalido (zero/negativo/nao-inteiro) e rejeitado (mesmo com usageKey válida)', async () => {
  const { service } = buildService();
  await assert.rejects(() => service.grantToCompanyAsMaster(999, 1, { amount: 0, grantType: 'paid', usageKey: 'a0' }), /amount/);
  await assert.rejects(() => service.grantToCompanyAsMaster(999, 1, { amount: -5, grantType: 'paid', usageKey: 'a1' }), /amount/);
  await assert.rejects(() => service.grantToCompanyAsMaster(999, 1, { amount: 1.5, grantType: 'paid', usageKey: 'a2' }), /amount/);
});

test('grantToCompanyAsMaster: empresa inexistente e rejeitada (BadRequest)', async () => {
  const { service } = buildService([1]); // só empresa 1 existe
  await assert.rejects(() => service.grantToCompanyAsMaster(999, 42, { amount: 10, grantType: 'paid' }));
});

// ─── Concessão master: expiresAt do default quando omitido ─────────────────────────────────────

test('grantToCompanyAsMaster: expiresAt omitido usa o default global de expiração (90d)', async () => {
  const { service, wallet } = buildService();
  const before = Date.now();
  const result = await service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid', usageKey: 'exp-default' });
  assert.ok(result.expiresAt);
  const diffDays = (result.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 89.9 && diffDays < 90.1, `esperava ~90 dias, obteve ${diffDays}`);

  const snapshot = await wallet.getWalletSnapshot(1);
  assert.equal(snapshot.lots[0].expiresAt?.getTime(), result.expiresAt!.getTime());
});

test('grantToCompanyAsMaster: expiresAt explicito e respeitado (não usa o default)', async () => {
  const { service } = buildService();
  const explicit = new Date('2027-01-01T00:00:00Z');
  const result = await service.grantToCompanyAsMaster(999, 1, {
    amount: 10,
    grantType: 'paid',
    expiresAt: explicit,
    usageKey: 'exp-explicit',
  });
  assert.equal(result.expiresAt!.getTime(), explicit.getTime());
});

test('grantToCompanyAsMaster: default de expiração reconfigurado pelo master (30d) é usado quando omitido', async () => {
  const { service, packConfig } = buildService();
  await packConfig.updateGlobalExpiryDefaultDays(30);
  const before = Date.now();
  const result = await service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid', usageKey: 'exp-30d' });
  const diffDays = (result.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 29.9 && diffDays < 30.1, `esperava ~30 dias, obteve ${diffDays}`);
});

// ─── Feature flag OFF ───────────────────────────────────────────────────────────────────────────

test('flag HBX_CREDITS_ENABLED OFF: grantToCompanyAsMaster recusa (mesmo com dados válidos)', async () => {
  delete process.env.HBX_CREDITS_ENABLED;
  const { service } = buildService();
  await assert.rejects(() => service.grantToCompanyAsMaster(999, 1, { amount: 10, grantType: 'paid' }));
});

// ─── /credits/me — role gating (LEI DO VENDEDOR) ───────────────────────────────────────────────

test('LEI DO VENDEDOR: role USER recebe SÓ leadsDisponiveis, nunca chaves de dinheiro/pacote', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 42, { kind: 'grant' });

  const result = await service.getMeForUser({ role: 'USER', isSystemMaster: false, companyId: 1 });

  assert.equal(result.enabled, true);
  assert.equal((result as any).leadsDisponiveis, 42);
  // Asserção explícita: nenhuma chave financeira/pacote vaza pro vendedor.
  const forbiddenKeys = ['balance', 'lots', 'packs', 'price', 'preco', 'saldo'];
  const keys = Object.keys(result);
  for (const forbidden of forbiddenKeys) {
    assert.equal(keys.includes(forbidden), false, `vendedor recebeu chave proibida: ${forbidden}`);
  }
});

test('ADMIN/dono (canViewBilling !== false) recebe saldo completo + lotes + pacotes disponiveis', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 42, { kind: 'grant' });

  const result: any = await service.getMeForUser({ role: 'ADMIN', isSystemMaster: false, canViewBilling: true, companyId: 1 });
  assert.equal(result.enabled, true);
  assert.equal(result.balance, 42);
  assert.ok(Array.isArray(result.lots));
  assert.ok(Array.isArray(result.packs));
  assert.ok(result.packs.length > 0);
  // Pacotes trazem preço (audiência de cobrança pode ver).
  assert.ok(typeof result.packs[0].price === 'number');
});

test('ADMIN sem canViewBilling explícito (undefined) segue como dono (default do campo é true no banco)', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 9, { kind: 'grant' });
  const result: any = await service.getMeForUser({ role: 'ADMIN', isSystemMaster: false, companyId: 1 });
  assert.equal(result.balance, 9);
  assert.ok(Array.isArray(result.packs));
});

// ─── Fix I (revisão Opus): GERENTE (ADMIN com canViewBilling=false) cai na visão neutra ────────

test('LEI DO VENDEDOR: GERENTE (role ADMIN + canViewBilling=false) NÃO vê R$/saldo/pacote, só leadsDisponiveis', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 33, { kind: 'grant' });

  const result = await service.getMeForUser({ role: 'ADMIN', isSystemMaster: false, canViewBilling: false, companyId: 1 });

  assert.equal(result.enabled, true);
  assert.equal((result as any).leadsDisponiveis, 33);
  // Asserção explícita: gerente recebe a MESMA visão neutra do vendedor — nenhuma chave financeira.
  const forbiddenKeys = ['balance', 'lots', 'packs', 'price', 'preco', 'saldo'];
  const keys = Object.keys(result);
  for (const forbidden of forbiddenKeys) {
    assert.equal(keys.includes(forbidden), false, `gerente recebeu chave proibida: ${forbidden}`);
  }
});

test('USERMASTER com canViewBilling=false (gerente-dono raro) também cai na visão neutra', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 11, { kind: 'grant' });
  const result = await service.getMeForUser({ role: 'USERMASTER', isSystemMaster: false, canViewBilling: false, companyId: 1 });
  assert.equal((result as any).leadsDisponiveis, 11);
  assert.equal(Object.keys(result).includes('balance'), false);
});

test('USERMASTER (dono do tenant) é tratado como audiência de cobrança, igual ADMIN', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 7, { kind: 'grant' });
  const result: any = await service.getMeForUser({ role: 'USERMASTER', isSystemMaster: false, companyId: 1 });
  assert.equal(result.balance, 7);
  assert.ok(Array.isArray(result.lots));
});

test('system master (isSystemMaster=true) é audiência de cobrança mesmo com canViewBilling=false (anti-spoof: flag manda)', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 5, { kind: 'grant' });
  // A flag isSystemMaster tem precedência sobre canViewBilling (resolveActorKind avalia master 1º).
  const result: any = await service.getMeForUser({ role: 'ADMIN', isSystemMaster: true, canViewBilling: false, companyId: 1 });
  assert.equal(result.balance, 5);
});

test('flag OFF: getMeForUser (qualquer role) devolve enabled:false sem vazar nada', async () => {
  delete process.env.HBX_CREDITS_ENABLED;
  const { service } = buildService();
  const seller: any = await service.getMeForUser({ role: 'USER', companyId: 1 });
  assert.equal(seller.enabled, false);
  assert.equal(seller.leadsDisponiveis, 0);

  const admin: any = await service.getMeForUser({ role: 'ADMIN', companyId: 1 });
  assert.equal(admin.enabled, false);
  assert.equal(admin.balance, 0);
  assert.deepEqual(admin.lots, []);
  assert.deepEqual(admin.packs, []);
});

test('getMeForUser sem companyId em contexto recusa (evita 500, nunca vaza saldo de outra empresa)', async () => {
  const { service } = buildService();
  await assert.rejects(() => service.getMeForUser({ role: 'USER', companyId: 0 }));
});
