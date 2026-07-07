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
      if ('gte' in cond && !(value instanceof Date && value.getTime() >= cond.gte.getTime())) return false;
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
  const companies: Row[] = companyIds.map((id) => ({ id, creditsEnforceEnabled: false }));
  const packs: Row[] = [];
  const globalConfig: Row[] = [];
  const teamPolicies: Row[] = [];
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
    count: async ({ where }: any) => {
      return entries.filter((item) => matchesWhere(item, where)).length;
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

  const userTeamPolicy = {
    findUnique: async ({ where }: any) => {
      const row = teamPolicies.find((item) => item.userId === where.userId);
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
    userTeamPolicy,
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

  // Handles de teste (R1): mutar direto o estado in-memory sem passar por métodos do serviço —
  // simula o admin ligando `Company.creditsEnforceEnabled` e o RuntimeTeamPolicy do vendedor.
  client.__setCompanyEnforce = (companyId: number, enabled: boolean) => {
    const row = companies.find((item) => item.id === companyId);
    if (row) row.creditsEnforceEnabled = enabled;
  };
  // Cortesia (modelo grátis): permite semear status/courtesyEndsAt/companyKind na company
  // in-memory pra exercitar o atalho de débito real por default (07/07).
  client.__setCompanyFields = (companyId: number, patch: Record<string, any>) => {
    const row = companies.find((item) => item.id === companyId);
    if (row) Object.assign(row, patch);
  };
  client.__setUserTeamPolicy = (userId: number, patch: Record<string, any>) => {
    const existing = teamPolicies.find((item) => item.userId === userId);
    const base = {
      id: `policy-${userId}`,
      userId,
      companyId: 1,
      status: 'active',
      subjectKind: 'common_seller',
      modulesJson: '[]',
      enrichmentDailyMode: 'inherit',
      enrichmentDailyLimit: null,
      cardDeliveryDailyMode: 'inherit',
      cardDeliveryDailyLimit: null,
      activeCardsMode: 'inherit',
      activeCardsLimit: null,
      monthlyCardsMode: 'inherit',
      monthlyCardsLimit: null,
      vendasPullQuantityMode: 'inherit',
      vendasPullQuantityLimit: null,
      allowedSegmentsJson: '[]',
      blockedSegmentsJson: '[]',
      allowedCitiesJson: '[]',
      allowedStatesJson: '[]',
      requiresLocation: null,
      requiredChannelsJson: '{}',
      ...existing,
      ...patch,
    };
    if (existing) {
      Object.assign(existing, base);
    } else {
      teamPolicies.push(base);
    }
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

// ─── S2 — recordShadowDebit: MEDIÇÃO, sem enforcement ──────────────────────────────────────────

test.beforeEach(() => {
  process.env.HBX_CREDITS_SHADOW = 'true';
});
test.afterEach(() => {
  delete process.env.HBX_CREDITS_SHADOW;
});

test('recordShadowDebit: idempotente — mesmo leadId 2x grava 1 entrada só', async () => {
  const { service, fake } = buildService();
  await service.recordShadowDebit(1, 42, { leadId: 'lead-abc', actionKey: 'vendas_contact_attempt' });
  await service.recordShadowDebit(1, 42, { leadId: 'lead-abc', actionKey: 'vendas_contact_attempt' });
  const entries = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit_shadow' } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].usageKey, 'shadow:vendas_contact_attempt:lead-abc');
  assert.equal(entries[0].amount, 1);
  assert.equal(entries[0].remaining, 0);
  assert.equal(entries[0].actionKey, 'vendas_contact_attempt');
  assert.equal(entries[0].createdByUserId, 42);
});

test('recordShadowDebit: leadIds diferentes geram entradas distintas (não é a mesma trava)', async () => {
  const { service, fake } = buildService();
  await service.recordShadowDebit(1, 42, { leadId: 'lead-a', actionKey: 'vendas_contact_attempt' });
  await service.recordShadowDebit(1, 42, { leadId: 'lead-b', actionKey: 'vendas_contact_attempt' });
  const entries = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit_shadow' } });
  assert.equal(entries.length, 2);
});

test('recordShadowDebit: entrada debit_shadow NÃO afeta getBalance (remaining=0, kind fora do FIFO)', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 10, { kind: 'grant' });
  const before = await wallet.getBalance(1);
  await service.recordShadowDebit(1, 42, { leadId: 'lead-abc', actionKey: 'vendas_contact_attempt' });
  const after = await wallet.getBalance(1);
  assert.equal(before, 10);
  assert.equal(after, 10);
});

test('recordShadowDebit: flag HBX_CREDITS_SHADOW OFF -> no-op, nenhuma entrada gravada', async () => {
  delete process.env.HBX_CREDITS_SHADOW;
  const { service, fake } = buildService();
  await service.recordShadowDebit(1, 42, { leadId: 'lead-abc', actionKey: 'vendas_contact_attempt' });
  const entries = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit_shadow' } });
  assert.equal(entries.length, 0);
});

test('recordShadowDebit: nunca lança (best-effort) mesmo com companyId/leadId/actionKey inválidos', async () => {
  const { service } = buildService();
  await assert.doesNotReject(() => service.recordShadowDebit(0, 42, { leadId: 'lead-abc', actionKey: 'x' }));
  await assert.doesNotReject(() => service.recordShadowDebit(1, 42, { leadId: '', actionKey: 'x' }));
  await assert.doesNotReject(() => service.recordShadowDebit(1, 42, { leadId: 'lead-abc', actionKey: '' }));
});

// ─── CRÉDITOS A3 — grantWelcomeBatch: lote grátis de boas-vindas no signup ─────────────────────

test('grantWelcomeBatch: concede o lote default (50 créditos/30d), kind+grantType promo', async () => {
  const { service, wallet } = buildService();
  const before = Date.now();
  await service.grantWelcomeBatch(1);

  const snapshot = await wallet.getWalletSnapshot(1);
  assert.equal(snapshot.balance, 50);
  assert.equal(snapshot.lots.length, 1);
  assert.equal(snapshot.lots[0].grantType, 'promo');
  assert.ok(snapshot.lots[0].expiresAt);
  const diffDays = (snapshot.lots[0].expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 29.9 && diffDays < 30.1, `esperava ~30 dias, obteve ${diffDays}`);
});

test('grantWelcomeBatch: usageKey welcome:<companyId> — idempotente, 2x não duplica', async () => {
  const { service, wallet } = buildService();
  await service.grantWelcomeBatch(1);
  await service.grantWelcomeBatch(1);
  await service.grantWelcomeBatch(1);

  const snapshot = await wallet.getWalletSnapshot(1);
  assert.equal(snapshot.balance, 50); // 1 lote só, não 3x
  assert.equal(snapshot.lots.length, 1);
});

test('grantWelcomeBatch: respeita a config global reconfigurada pelo master (quantidade/validade)', async () => {
  const { service, wallet, packConfig } = buildService();
  await packConfig.updateWelcomeBatchConfig({ welcomeCredits: 60, welcomeExpiryDays: 15 });

  const before = Date.now();
  await service.grantWelcomeBatch(1);

  const snapshot = await wallet.getWalletSnapshot(1);
  assert.equal(snapshot.balance, 60);
  const diffDays = (snapshot.lots[0].expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 14.9 && diffDays < 15.1, `esperava ~15 dias, obteve ${diffDays}`);
});

test('grantWelcomeBatch: flag HBX_CREDITS_ENABLED OFF -> no-op, nada é concedido', async () => {
  delete process.env.HBX_CREDITS_ENABLED;
  const { service, wallet } = buildService();
  await service.grantWelcomeBatch(1);
  assert.equal(await wallet.getBalance(1), 0);
});

test('grantWelcomeBatch: nunca lança (best-effort) mesmo com companyId inválido', async () => {
  const { service } = buildService();
  await assert.doesNotReject(() => service.grantWelcomeBatch(0));
  await assert.doesNotReject(() => service.grantWelcomeBatch(-1));
  await assert.doesNotReject(() => service.grantWelcomeBatch(NaN as any));
});

test('grantWelcomeBatch: empresas DIFERENTES recebem lotes INDEPENDENTES (usageKey por companyId)', async () => {
  const { service, wallet } = buildService([1, 2]);
  await service.grantWelcomeBatch(1);
  await service.grantWelcomeBatch(2);

  assert.equal(await wallet.getBalance(1), 50);
  assert.equal(await wallet.getBalance(2), 50);
});

// ─── R1 — gate REAL de enforcement (HBX_CREDITS_ENFORCE + Company.creditsEnforceEnabled) ───────
// Testes 1-6 do R1-SPEC-GATE-ENFORCE.md. `HBX_CREDITS_ENFORCE` liga/desliga em cada teste
// (afterEach limpa); `fake.__setCompanyEnforce`/`__setUserTeamPolicy` mutam o estado in-memory.

test.afterEach(() => {
  delete process.env.HBX_CREDITS_ENFORCE;
});

// Teste 1 — flags OFF (qualquer uma) -> zero débito real, comportamento atual intacto.
test('R1 gate: HBX_CREDITS_ENFORCE OFF (empresa ON) -> no-op, zero débito real', async () => {
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 10, { kind: 'grant' });

  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery' });

  assert.equal(result.applied, false);
  assert.equal(result.debited, 0);
  assert.equal(await wallet.getBalance(1), 10); // saldo intacto
});

test('R1 gate: HBX_CREDITS_ENFORCE ON mas empresa OFF -> no-op, zero débito real', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, false); // explícito: empresa NÃO optou

  await wallet.grant(1, 10, { kind: 'grant' });
  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery' });

  assert.equal(result.applied, false);
  assert.equal(result.debited, 0);
  assert.equal(await wallet.getBalance(1), 10);
});

// Teste 2 — gate ON + saldo >= 1 -> entrega debita 1; ledger ganha linha `debit` com a usageKey certa.
test('R1 gate: as 2 chaves ON + saldo >=1 -> debita 1 crédito real, usageKey enforce:<actionKey>:<leadId>', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 5, { kind: 'grant' });

  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-42', actionKey: 'lead_delivery' });

  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 4);

  const debits = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit' } });
  assert.equal(debits.length, 1);
  assert.equal(debits[0].usageKey, 'enforce:lead_delivery:lead-42');
  assert.equal(debits[0].createdByUserId, 7);
});

// Teste 3 — gate ON + saldo 0 -> BLOQUEIA fail-closed; vendedor recebe código neutro; admin
// recebe CREDIT_BALANCE_EXHAUSTED.
test('R1 gate: saldo ZERO -> bloqueia fail-closed, vendedor recebe código NEUTRO (company_access_paused)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  // sem grant nenhum -> saldo 0

  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery', isBillingAudienceUser: false }),
    (error: any) => {
      assert.equal(error?.response?.code, 'company_access_paused');
      // LEI DO VENDEDOR: nada de crédito/saldo/R$ na mensagem exposta ao vendedor.
      assert.equal(/cr[ée]dito|saldo|r\$/i.test(String(error?.response?.message || '')), false);
      return true;
    },
  );
});

test('R1 gate: saldo ZERO -> admin/dono recebe código claro CREDIT_BALANCE_EXHAUSTED', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, true);

  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery', isBillingAudienceUser: true }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_BALANCE_EXHAUSTED');
      return true;
    },
  );
});

test('R1 gate: saldo ZERO -> nenhuma linha debit é gravada (fail-closed, nunca negativo)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);

  await assert.rejects(() => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery' }));

  assert.equal(await wallet.getBalance(1), 0);
  const debits = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit' } });
  assert.equal(debits.length, 0);
});

// Teste 4 — falha pós-débito -> refund devolve (mesma usageKey, idempotente).
test('R1 refund: refundLeadDelivery devolve o crédito debitado (mesma usageKey)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 5, { kind: 'grant' });

  await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-99', actionKey: 'lead_delivery' });
  assert.equal(await wallet.getBalance(1), 4);

  const refundResult = await service.refundLeadDelivery(1, 7, { leadId: 'lead-99', actionKey: 'lead_delivery' });
  assert.equal(refundResult.refunded, 1);
  assert.equal(await wallet.getBalance(1), 5); // saldo volta
});

test('R1 refund: idempotente — chamar 2x só devolve 1 vez (mesma usageKey do débito)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 5, { kind: 'grant' });

  await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-77', actionKey: 'lead_delivery' });
  await service.refundLeadDelivery(1, 7, { leadId: 'lead-77', actionKey: 'lead_delivery' });
  await service.refundLeadDelivery(1, 7, { leadId: 'lead-77', actionKey: 'lead_delivery' });

  assert.equal(await wallet.getBalance(1), 5); // não dobrou o refund
});

test('R1 refund: sem débito registrado pra usageKey -> no-op silencioso (nada a reverter)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, true);

  const result = await service.refundLeadDelivery(1, 7, { leadId: 'lead-nunca-debitado', actionKey: 'lead_delivery' });
  assert.equal(result.refunded, 0);
});

// Teste 5 (S4) — vendedor com teto atingido bloqueia SÓ ele; outro vendedor segue.
test('R1 S4: vendedor com teto MENSAL atingido bloqueia só ele (empresa segue com saldo)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  fake.__setUserTeamPolicy(7, { monthlyCardsMode: 'limited', monthlyCardsLimit: 1 });
  await wallet.grant(1, 10, { kind: 'grant' });

  // 1ª entrega do vendedor 7: sob o teto (0 débitos até agora) -> passa.
  const first = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-A', actionKey: 'lead_delivery' });
  assert.equal(first.applied, true);
  assert.equal(await wallet.getBalance(1), 9);

  // 2ª entrega do MESMO vendedor: já tem 1 débito no mês (teto=1) -> bloqueia ele.
  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-B', actionKey: 'lead_delivery' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'company_access_paused');
      return true;
    },
  );
  assert.equal(await wallet.getBalance(1), 9); // não debitou no bloqueio
});

test('R1 S4: outro vendedor da MESMA empresa sem teto configurado segue livre (admin nunca capado por vendedor)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  fake.__setUserTeamPolicy(7, { monthlyCardsMode: 'limited', monthlyCardsLimit: 1 });
  // vendedor 8 SEM policy nenhuma -> sem teto (inherit).

  await wallet.grant(1, 10, { kind: 'grant' });
  await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-A', actionKey: 'lead_delivery' }); // vendedor 7 usa o teto dele
  await assert.rejects(() => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-C', actionKey: 'lead_delivery' })); // 7 bloqueado

  // vendedor 8 (empresa/carteira A MESMA) segue entregando normal — não é capado pelo teto do 7.
  const forOther = await service.assertAndDebitLeadDelivery(1, 8, { leadId: 'lead-D', actionKey: 'lead_delivery' });
  assert.equal(forOther.applied, true);
  assert.equal(await wallet.getBalance(1), 8); // 9 - 1(vendedor7) - 1(vendedor8) = 8
});

test('R1 S4: teto DIÁRIO (cardDeliveryDailyLimit) também bloqueia só o vendedor que estourou', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  fake.__setUserTeamPolicy(7, { cardDeliveryDailyMode: 'limited', cardDeliveryDailyLimit: 1 });
  await wallet.grant(1, 10, { kind: 'grant' });

  const first = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-X', actionKey: 'lead_delivery' });
  assert.equal(first.applied, true);

  await assert.rejects(() => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-Y', actionKey: 'lead_delivery' }));
});

test('R1 S4: vendedor SEM teto configurado (inherit) nunca bloqueia por S4 (default sem teto)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  // sem __setUserTeamPolicy -> loadUserTeamPolicyRuntime devolve null -> sem teto.

  await wallet.grant(1, 3, { kind: 'grant' });
  for (let i = 0; i < 3; i++) {
    const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: `lead-${i}`, actionKey: 'lead_delivery' });
    assert.equal(result.applied, true);
  }
  assert.equal(await wallet.getBalance(1), 0);
});

// Teste 6 — idempotência: mesmo lead 2x = 1 débito (usageKey).
test('R1 idempotência: mesmo lead debitado 2x (mesma usageKey) -> só 1 débito real', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 5, { kind: 'grant' });

  const first = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-dup', actionKey: 'lead_delivery' });
  const second = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-dup', actionKey: 'lead_delivery' });

  assert.equal(first.debited, 1);
  assert.equal(second.debited, 1); // idempotente: lê o resultado já commitado, não debita de novo
  assert.equal(await wallet.getBalance(1), 4); // só saiu 1 crédito, não 2

  const debits = await fake.creditLedgerEntry.findMany({ where: { companyId: 1, kind: 'debit' } });
  assert.equal(debits.length, 1);
});

// ─── isEnforceActiveForCompany — checagem direta das 2 chaves ──────────────────────────────────

test('isEnforceActiveForCompany: false quando env OFF mesmo com empresa ON', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  assert.equal(await service.isEnforceActiveForCompany(1), false);
});

test('isEnforceActiveForCompany: false quando empresa OFF mesmo com env ON', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, false);
  assert.equal(await service.isEnforceActiveForCompany(1), false);
});

test('isEnforceActiveForCompany: true só quando AMBAS estão ON', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyEnforce(1, true);
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

// ─── Cortesia (modelo grátis) — débito real LIGADO por default (decisão do dono 07/07) ─────────
// Conta courtesy NÃO tem cota de plano; o teto real é o saldo de crédito. Por isso o débito real
// nasce ligado assim que HBX_CREDITS_ENABLED está ON — sem depender do cutover HBX_CREDITS_ENFORCE
// (que é só pra migrar empresas PAGAS). Empresa paga segue na cota do plano.

test('cortesia (status=courtesy, sem prazo): débito real LIGADO por default, SEM HBX_CREDITS_ENFORCE', async () => {
  // credits ENABLED (beforeEach); enforce env OFF; empresa NÃO optou (creditsEnforceEnabled=false).
  const { service, wallet, fake } = buildService();
  fake.__setCompanyFields(1, { status: 'courtesy', courtesyEndsAt: null, isActive: true });
  assert.equal(await service.isEnforceActiveForCompany(1), true);

  await wallet.grant(1, 3, { kind: 'promo', grantType: 'promo' });
  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-ct', actionKey: 'lead_delivery' });
  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 2); // saldo de crédito CAIU de verdade
});

test('empresa PAGA (status=active) NÃO entra no débito de crédito por default (segue na cota do plano)', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { status: 'active', isActive: true });
  // enforce env OFF + empresa não optou -> gate legado OFF; active != courtesy -> sem atalho.
  assert.equal(await service.isEnforceActiveForCompany(1), false);
});

test('cortesia VENCIDA (courtesyEndsAt no passado) NÃO liga o débito por default (voltou a cobrar)', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { status: 'courtesy', courtesyEndsAt: new Date(Date.now() - 86400000), isActive: true });
  // cortesia vencida -> access state = overdue, não exempt/manual -> sem atalho de cortesia.
  assert.equal(await service.isEnforceActiveForCompany(1), false);
});

// ─── isCreditsAccountCompany — método público reusável (fronteira cota-de-plano × crédito) ──────
test('isCreditsAccountCompany: true p/ cortesia vigente; false p/ paga; false com módulo OFF', async () => {
  const { service, fake } = buildService();

  fake.__setCompanyFields(1, { status: 'courtesy', courtesyEndsAt: null });
  assert.equal(await service.isCreditsAccountCompany(1), true);

  fake.__setCompanyFields(1, { status: 'active', courtesyEndsAt: null });
  assert.equal(await service.isCreditsAccountCompany(1), false);

  // Módulo de crédito OFF -> nunca é conta de crédito, independe do status.
  fake.__setCompanyFields(1, { status: 'courtesy', courtesyEndsAt: null });
  delete process.env.HBX_CREDITS_ENABLED;
  assert.equal(await service.isCreditsAccountCompany(1), false);
});
