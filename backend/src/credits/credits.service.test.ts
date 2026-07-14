import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditWalletService } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import { CreditsService } from './credits.service';
import { clearCreditPackOverrides } from './credit-pack-catalog';
import { getCreditActionBaseDefinition } from './credit-action-catalog';

// CRÉDITOS S3-PARTE1 — CreditsService: concessão master idempotente por sourceRef/usageKey,
// grantType, expiresAt do default quando omitido; e /credits/me role-gating (LEI DO VENDEDOR:
// vendedor NUNCA recebe R$/saldo/preço/pacote — só a contagem neutra de leads disponíveis).
//
// Fake Prisma: reusa o MESMO desenho do credit-wallet.service.test.ts (updateMany condicional +
// @@unique(usageKey,parentEntryId) + $transaction interativo com rollback) e acrescenta
// `company.findUnique` (usado por assertCompanyExists) + as 2 tabelas do CreditPackConfigService.

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  // S2 (getMasterOverview): "OR" no topo do where, ex. lote perpétuo (expiresAt null) OU não
  // expirado ainda — recursivo (AND do resto do where + OR de UMA das alternativas).
  if (where && Array.isArray((where as any).OR)) {
    const { OR, ...rest } = where as any;
    if (!matchesWhere(row, rest)) return false;
    return (OR as Row[]).some((cond) => matchesWhere(row, cond));
  }
  for (const [key, cond] of Object.entries(where || {})) {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gt' in cond && !(Number(value) > cond.gt)) return false;
      if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
      if ('gte' in cond && !(value instanceof Date && value.getTime() >= cond.gte.getTime())) return false;
      if ('lte' in cond && !(value instanceof Date && value.getTime() <= cond.lte.getTime())) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('startsWith' in cond && !(typeof value === 'string' && value.startsWith(cond.startsWith))) return false;
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
  const companies: Row[] = companyIds.map((id) => ({ id, companyKind: 'tenant', creditsEnforceEnabled: false }));
  const packs: Row[] = [];
  const globalConfig: Row[] = [];
  const teamPolicies: Row[] = [];
  const users: Row[] = [];
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
    findMany: async ({ where, orderBy, take }: any) => {
      let rows = entries.filter((item) => matchesWhere(item, where)).map((row) => ({ ...row }));
      const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
      if (order?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      else if (order?.createdAt === 'asc') rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (typeof take === 'number') rows = rows.slice(0, take);
      return rows;
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
    // S2 (getMasterOverview): groupBy por companyId com _sum/_count/_max — só o suficiente pro
    // que o service pede (by:['companyId']).
    groupBy: async ({ where, _sum, _count, _max }: any) => {
      const rows = entries.filter((item) => matchesWhere(item, where));
      const byCompany = new Map<number, Row[]>();
      for (const row of rows) {
        const key = Number(row.companyId);
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key)!.push(row);
      }
      return Array.from(byCompany.entries()).map(([companyId, group]) => {
        const out: Row = { companyId };
        if (_sum?.remaining) out._sum = { remaining: group.reduce((s, r) => s + (Number(r.remaining) || 0), 0) };
        if (_count?._all) out._count = { _all: group.length };
        if (_max?.createdAt) {
          const max = group.reduce(
            (m: Date | null, r) => (!m || r.createdAt.getTime() > m.getTime() ? r.createdAt : m),
            null as Date | null,
          );
          out._max = { createdAt: max };
        }
        return out;
      });
    },
    aggregate: async ({ where, _sum, _count }: any) => {
      const rows = entries.filter((item) => matchesWhere(item, where));
      const out: Row = {};
      if (_sum?.remaining) out._sum = { remaining: rows.reduce((s, r) => s + (Number(r.remaining) || 0), 0) };
      if (_count?._all) out._count = { _all: rows.length };
      return out;
    },
  };

  // S2 (getMasterOverview): receita de recarga vem de FinanceiroCharge (fora do domínio de
  // crédito) — fake mínimo, só leitura (aggregate), sem caminho de escrita nenhum.
  const charges: Row[] = [];
  const financeiroCharge = {
    aggregate: async ({ where, _sum, _count }: any) => {
      const rows = charges.filter((item) => matchesWhere(item, where));
      const out: Row = {};
      if (_sum?.amount) out._sum = { amount: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) };
      if (_count?._all) out._count = { _all: rows.length };
      return out;
    },
  };

  const company = {
    findUnique: async ({ where }: any) => {
      const row = companies.find((item) => item.id === where.id);
      return row ? { ...row } : null;
    },
  };

  // isActingUserSystemMaster (master god-mode) — mínimo pra provar que o master nunca debita.
  const user = {
    findUnique: async ({ where }: any) => {
      const row = users.find((item) => item.id === where.id);
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
    user,
    userTeamPolicy,
    creditPackConfig,
    creditGlobalConfig,
    financeiroCharge,
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

  // S2 (getMasterOverview): semear uma FinanceiroCharge de recarga direto no array in-memory —
  // não existe caminho de escrita real aqui (fake mínimo, só leitura), então o teste monta o
  // cenário à mão.
  client.__seedFinanceiroCharge = (row: Row) => {
    charges.push({ status: 'approved', description: '', amount: 0, paidAt: new Date(), ...row });
  };

  // Handles de teste (R1): mutar direto o estado in-memory sem passar por métodos do serviço —
  // simula o admin ligando `Company.creditsEnforceEnabled` e o RuntimeTeamPolicy do vendedor.
  client.__setCompanyEnforce = (companyId: number, enabled: boolean) => {
    const row = companies.find((item) => item.id === companyId);
    if (row) row.creditsEnforceEnabled = enabled;
  };
  // MASTER-REFAB S6 (10/07 noite): permite semear accountType/status/companyKind na company
  // in-memory pra exercitar o gatilho de débito real por TIPO de conta.
  client.__setCompanyFields = (companyId: number, patch: Record<string, any>) => {
    const row = companies.find((item) => item.id === companyId);
    if (row) Object.assign(row, patch);
  };
  // Master god-mode: semeia isSystemMaster no user in-memory (isActingUserSystemMaster).
  client.__setUser = (userId: number, patch: Record<string, any>) => {
    const existing = users.find((item) => item.id === userId);
    if (existing) { Object.assign(existing, patch); return; }
    users.push({ id: userId, ...patch });
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
  const actionConfig = {
    resolveEffective: async (actionKey: string) => getCreditActionBaseDefinition(actionKey),
  };
  const service = new CreditsService(fake as any, wallet, packConfig, actionConfig as any);
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

// ─── MASTER-REFAB S1 — bloco Carteira na ficha (GET /credits/master/company/:id) ──────────────

test('getWalletOverviewForMaster: saldo + lotes + extrato de movimentos (débito) de UMA empresa', async () => {
  const { service, wallet } = buildService();
  await wallet.grant(1, 20, { kind: 'grant', usageKey: 'seed-grant' });
  await wallet.debit(1, 5, { actionKey: 'lead_delivery', usageKey: 'debit-1' });

  const overview = await service.getWalletOverviewForMaster(1);
  assert.equal(overview.enabled, true);
  assert.equal(overview.balance, 15);
  assert.equal(overview.lots.length, 1);
  assert.equal(overview.lots[0].remaining, 15);
  assert.equal(overview.recent.length, 1);
  assert.equal(overview.recent[0].kind, 'debit');
  assert.equal(overview.recent[0].amount, 5);
});

test('getWalletOverviewForMaster: empresa inexistente e rejeitada (BadRequest, mesma trava do grant)', async () => {
  const { service } = buildService([1]);
  await assert.rejects(() => service.getWalletOverviewForMaster(42));
});

test('flag HBX_CREDITS_ENABLED OFF: getWalletOverviewForMaster recusa (404, mesmo padrão do grant)', async () => {
  delete process.env.HBX_CREDITS_ENABLED;
  const { service } = buildService();
  await assert.rejects(() => service.getWalletOverviewForMaster(1));
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

// ─── Débito universal por lead ────────────────────────────────────────────────────────────────
// Plano, accountType, flags antigas e o papel do ator não podem liberar dados sem débito.

test.afterEach(() => {
  delete process.env.HBX_CREDITS_ENFORCE;
});

test('tenant debita mesmo com HBX_CREDITS_ENFORCE OFF e flag da empresa ON', async () => {
  const { service, wallet, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, true);
  await wallet.grant(1, 10, { kind: 'grant' });

  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery' });

  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 9);
});

test('tenant debita mesmo com flag da empresa OFF', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, false); // explícito: empresa NÃO optou

  await wallet.grant(1, 10, { kind: 'grant' });
  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-1', actionKey: 'lead_delivery' });

  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 9);
});

// Teste 2 — gate ON + saldo >= 1 -> entrega debita 1; ledger ganha linha `debit` com a usageKey certa.
test('R1 gate: as 2 chaves ON + saldo >=1 -> debita 1 crédito real, usageKey enforce:<actionKey>:<leadId>', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, true);

  const result = await service.refundLeadDelivery(1, 7, { leadId: 'lead-nunca-debitado', actionKey: 'lead_delivery' });
  assert.equal(result.refunded, 0);
});

// Teste 5 (S4) — vendedor com teto atingido bloqueia SÓ ele; outro vendedor segue.
test('R1 S4: vendedor com teto MENSAL atingido bloqueia só ele (empresa segue com saldo)', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, wallet, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
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

// ─── isEnforceActiveForCompany — todo tenant, sem gate comercial ───────────────────────────────

test('isEnforceActiveForCompany: tenant enterprise continua ativo com env OFF', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, true);
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

test('isEnforceActiveForCompany: tenant enterprise continua ativo com flag da empresa OFF', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, false);
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

test('isEnforceActiveForCompany: tenant permanece ativo com flags antigas ON', async () => {
  process.env.HBX_CREDITS_ENFORCE = 'true';
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  fake.__setCompanyEnforce(1, true);
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

// AccountType/status são metadados financeiros e não mudam o débito do lead.

test('conta credit (accountType=credit, default da coluna): débito real LIGADO por default, SEM HBX_CREDITS_ENFORCE', async () => {
  // credits ENABLED (beforeEach); enforce env OFF; empresa NÃO optou (creditsEnforceEnabled=false).
  // accountType nem precisa ser setado — o default da company fake já é ausente -> normaliza credit.
  const { service, wallet, fake } = buildService();
  assert.equal(await service.isEnforceActiveForCompany(1), true);

  await wallet.grant(1, 3, { kind: 'promo', grantType: 'promo' });
  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-ct', actionKey: 'lead_delivery' });
  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 2); // saldo de crédito CAIU de verdade
});

test('conta credit legada em status/courtesy antigo (pré-S6) continua debitando real — o gatilho é o TIPO, não o status', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'credit', status: 'courtesy', courtesyEndsAt: new Date(Date.now() - 86400000) });
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

test('empresa ENTERPRISE também entra no débito de crédito por default', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { accountType: 'enterprise', status: 'active' });
  assert.equal(await service.isEnforceActiveForCompany(1), true);
});

test('master operando o fluxo de cliente também debita antes de revelar', async () => {
  const { service, wallet, fake } = buildService();
  fake.__setUser(7, { isSystemMaster: true });
  await wallet.grant(1, 5, { kind: 'promo', grantType: 'promo' });

  const result = await service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-master', actionKey: 'lead_delivery' });
  assert.equal(result.applied, true);
  assert.equal(result.debited, 1);
  assert.equal(await wallet.getBalance(1), 4);
});

// ─── Compatibilidade do predicado público: agora significa tenant debitável ────────────────────
test('isCreditsAccountCompany ignora accountType e flag do módulo; rejeita platform_infra', async () => {
  const { service, fake } = buildService();

  assert.equal(await service.isCreditsAccountCompany(1), true);

  fake.__setCompanyFields(1, { accountType: 'enterprise' });
  assert.equal(await service.isCreditsAccountCompany(1), true);

  fake.__setCompanyFields(1, { accountType: 'credit' });
  delete process.env.HBX_CREDITS_ENABLED;
  assert.equal(await service.isCreditsAccountCompany(1), true);

  fake.__setCompanyFields(1, { companyKind: 'platform_infra' });
  assert.equal(await service.isCreditsAccountCompany(1), false);
});

test('assertAndDebitLeadDelivery falha fechado para platform_infra', async () => {
  const { service, fake } = buildService();
  fake.__setCompanyFields(1, { companyKind: 'platform_infra' });
  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-infra', actionKey: 'lead_delivery' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_DEBIT_UNAVAILABLE');
      return true;
    },
  );
});

test('assertAndDebitLeadDelivery falha fechado sem configuração de ação e sem debitar', async () => {
  const { fake, wallet, packConfig } = buildService();
  await wallet.grant(1, 2, { kind: 'promo', grantType: 'promo' });
  const service = new CreditsService(fake as any, wallet, packConfig, undefined as any);
  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-config', actionKey: 'lead_delivery' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_DEBIT_UNAVAILABLE');
      return true;
    },
  );
  assert.equal(await wallet.getBalance(1), 2);
});

test('assertAndDebitLeadDelivery falha fechado se lead_delivery vier grátis', async () => {
  const { fake, wallet, packConfig } = buildService();
  await wallet.grant(1, 2, { kind: 'promo', grantType: 'promo' });
  const service = new CreditsService(fake as any, wallet, packConfig, {
    resolveEffective: async () => ({ key: 'lead_delivery', mode: 'free', cost: 0, label: 'Lead entregue' }),
  } as any);
  await assert.rejects(
    () => service.assertAndDebitLeadDelivery(1, 7, { leadId: 'lead-free', actionKey: 'lead_delivery' }),
    (error: any) => {
      assert.equal(error?.response?.code, 'CREDIT_DEBIT_UNAVAILABLE');
      return true;
    },
  );
  assert.equal(await wallet.getBalance(1), 2);
});

// ─── MASTER-REFAB S2 — getMasterOverview (Visão geral do centro financeiro) ─────────────────────

test('getMasterOverview: receita de recarga 30d soma só charges APROVADAS com o prefixo de recarga, dentro da janela', async () => {
  const { service, fake } = buildService();
  const now = new Date();
  const dentro = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  const fora = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

  fake.__seedFinanceiroCharge({ amount: 97, status: 'approved', description: 'Recarga de créditos — Pacote Starter (100 créditos)', paidAt: dentro });
  fake.__seedFinanceiroCharge({ amount: 247, status: 'approved', description: 'Recarga de créditos — Pacote Growth (300 créditos)', paidAt: fora }); // fora da janela de 30d
  fake.__seedFinanceiroCharge({ amount: 597, status: 'pending', description: 'Recarga de créditos — Pacote Scale (800 créditos)', paidAt: dentro }); // não aprovada
  fake.__seedFinanceiroCharge({ amount: 999, status: 'approved', description: 'Assinatura HBX Lead Plus', paidAt: dentro }); // outra origem, não é recarga

  const overview = await service.getMasterOverview();
  assert.equal(overview.revenueRecharge30d, 97);
  assert.equal(overview.revenueRecharge30dCount, 1);
});

test('getMasterOverview: créditos expirando nos próximos 30d somam só lotes ativos dentro da janela (exclui perpétuo e distante)', async () => {
  const { service, wallet } = buildService();
  const now = new Date();
  await wallet.grant(1, 10, { kind: 'grant', usageKey: 'g1', expiresAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000) }); // entra
  await wallet.grant(1, 20, { kind: 'grant', usageKey: 'g2', expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) }); // fora (>30d)
  await wallet.grant(1, 30, { kind: 'grant', usageKey: 'g3', expiresAt: null }); // perpétuo, nunca expira

  const overview = await service.getMasterOverview();
  assert.equal(overview.creditsExpiring30d, 10);
  assert.equal(overview.creditsExpiring30dLots, 1);
});

test('getMasterOverview: por empresa devolve lotes ativos + data do último débito (empresa sem débito -> null)', async () => {
  const { service, wallet } = buildService([1, 2]);
  await wallet.grant(1, 10, { kind: 'grant', usageKey: 'a' });
  await wallet.grant(1, 5, { kind: 'grant', usageKey: 'b' });
  await wallet.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'd1' });
  await wallet.grant(2, 7, { kind: 'grant', usageKey: 'c' });

  const overview = await service.getMasterOverview();
  const c1 = overview.companies.find((c) => c.companyId === 1);
  const c2 = overview.companies.find((c) => c.companyId === 2);
  assert.equal(c1?.activeLots, 2); // débito parcial não fecha o lote (remaining ainda >0)
  assert.ok(c1?.lastConsumptionAt);
  assert.equal(c2?.activeLots, 1);
  assert.equal(c2?.lastConsumptionAt, null); // nunca debitou
});

// ─── MASTER-REFAB S5 — créditos em circulação (consumido pelo cockpit via DI) ────────────────────

test('getMasterOverview: créditos em circulação = Σ remaining de lotes ativos, líquido de débitos e sem lote expirado', async () => {
  const { service, wallet } = buildService([1, 2]);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await wallet.grant(1, 10, { kind: 'grant', usageKey: 's5-a' });
  await wallet.debit(1, 4, { actionKey: 'lead_delivery', usageKey: 's5-d1' }); // sobra 6
  await wallet.grant(2, 7, { kind: 'grant', usageKey: 's5-b' }); // 7 vivos
  await wallet.grant(2, 5, { kind: 'grant', usageKey: 's5-c', expiresAt: past }); // expirado, fora

  const overview = await service.getMasterOverview();
  assert.equal(overview.creditsInCirculation, 13); // 6 + 7
});

test('flag HBX_CREDITS_ENABLED OFF: getMasterOverview recusa (mesmo padrão dos outros endpoints master)', async () => {
  const { service } = buildService();
  delete process.env.HBX_CREDITS_ENABLED;
  await assert.rejects(() => service.getMasterOverview());
});

// ─── MASTER-REFAB S2 — getGlobalConfigForMaster (prefill da guia Bônus de cadastro) ─────────────

test('getGlobalConfigForMaster: reflete os defaults de código quando nada foi configurado', () => {
  const { service } = buildService();
  const config = service.getGlobalConfigForMaster();
  assert.equal(config.defaultExpiryDays, 90);
  assert.equal(config.welcomeCredits, 50);
  assert.equal(config.welcomeExpiryDays, 30);
});

test('getGlobalConfigForMaster: reflete os valores reconfigurados pelo master (mesmo overlay do PUT)', async () => {
  const { service } = buildService();
  await service.updateGlobalExpiryDefaultAsMaster(45);
  await service.updateWelcomeBatchConfigAsMaster({ welcomeCredits: 80, welcomeExpiryDays: 15 });
  const config = service.getGlobalConfigForMaster();
  assert.equal(config.defaultExpiryDays, 45);
  assert.equal(config.welcomeCredits, 80);
  assert.equal(config.welcomeExpiryDays, 15);
});

test('flag HBX_CREDITS_ENABLED OFF: getGlobalConfigForMaster recusa', () => {
  const { service } = buildService();
  delete process.env.HBX_CREDITS_ENABLED;
  assert.throws(() => service.getGlobalConfigForMaster());
});
