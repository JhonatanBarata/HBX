import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditWalletService } from './credit-wallet.service';

// ─── Fake Prisma em memória (só as formas de query que o serviço usa) ───────────────────────────
// Simula o Postgres real nas 3 propriedades que importam pra integridade de dinheiro:
//  1. `updateMany` condicional (WHERE id + remaining esperado) casa 0 linhas se alguém já mexeu
//     no meio do caminho — o optimistic lock (mesmo padrão do hbx-recovery).
//  2. `@@unique([usageKey, parentEntryId])`: `create` lança P2002 se já existe linha com o mesmo
//     par (usageKey, parentEntryId) com usageKey NÃO-null (NULLs não colidem no Postgres) — a
//     trava de idempotência do Fix B.
//  3. `$transaction(async (tx) => ...)` interativo com ROLLBACK real (journal de undo) e
//     SERIALIZADO (mutex): dois débitos concorrentes não intercalam no meio da tx, exatamente
//     como o Postgres serializa por lock de linha — o Fix A.

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where || {})) {
    if (key === 'OR') {
      const branches = cond as Row[];
      if (!branches.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
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

function createFakePrisma() {
  const wallets: Row[] = [];
  const entries: Row[] = [];
  let nextWalletId = 1;
  let nextEntryId = 1;

  // Journal de undo: cada mutação empilha sua reversão; no rollback aplicamos em ordem reversa.
  // Fora de transação o journal é ignorado (mutação direta, sem undo).
  let journal: Array<() => void> | null = null;
  function record(undo: () => void) {
    if (journal) journal.push(undo);
  }

  // Viola o @@unique([usageKey, parentEntryId]) quando usageKey é não-null e o par já existe.
  function assertUnique(usageKey: any, parentEntryId: any) {
    if (usageKey == null) return; // NULLs não colidem no Postgres
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
      const row: Row = {
        id: `w${nextWalletId++}`,
        companyId: data.companyId,
        chargebackDebtCredits: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      wallets.push(row);
      record(() => {
        const idx = wallets.indexOf(row);
        if (idx >= 0) wallets.splice(idx, 1);
      });
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = wallets.find((item) => item.companyId === where.companyId || item.id === where.id);
      if (!row) throw new Error('creditWallet.update: row not found');
      const before = { ...row };
      applyData(row, data);
      record(() => Object.assign(row, before));
      return { ...row };
    },
    // Reserva atômica da dívida de chargeback (optimistic lock no campo): match + write sem await
    // no meio, como o UPDATE ... WHERE condicional do Postgres — a corrida se resolve por quem
    // executa a microtask primeiro (o perdedor casa 0 linhas).
    updateMany: async ({ where, data }: any) => {
      const rows = wallets.filter((item) => matchesWhere(item, where));
      const befores = rows.map((row) => ({ row, snapshot: { ...row } }));
      rows.forEach((row) => applyData(row, data));
      record(() => befores.forEach(({ row, snapshot }) => Object.assign(row, snapshot)));
      return { count: rows.length };
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
    // Só o suficiente pra `getBalancesByCompanyIds` (groupBy companyId + soma de remaining).
    groupBy: async ({ where, _sum }: any) => {
      const rows = entries.filter((item) => matchesWhere(item, where));
      const byCompany = new Map<number, number>();
      for (const row of rows) {
        const key = Number(row.companyId);
        byCompany.set(key, (byCompany.get(key) || 0) + (_sum?.remaining ? Number(row.remaining) || 0 : 0));
      }
      return Array.from(byCompany.entries()).map(([companyId, sum]) => ({
        companyId,
        _sum: { remaining: sum },
      }));
    },
  };

  // Mutex simples: serializa transações (uma de cada vez), como o lock de linha do Postgres
  // sob contenção pela mesma wallet/lote. Sem isso, o event loop intercalaria dois updateMany
  // antes de qualquer create e o teste de concorrência não provaria nada.
  let txChain: Promise<any> = Promise.resolve();

  const client = {
    wallets,
    entries,
    creditWallet,
    creditLedgerEntry,
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
          // Rollback: desfaz as mutações desta transação em ordem reversa.
          for (let i = myJournal.length - 1; i >= 0; i--) myJournal[i]();
          journal = outerJournal;
          throw error;
        }
      };
      const result = txChain.then(run, run);
      // A cadeia continua independentemente de sucesso/falha desta tx.
      txChain = result.then(() => undefined, () => undefined);
      return result;
    },
  };

  return client;
}

function buildService() {
  const fake = createFakePrisma();
  const service = new CreditWalletService(fake as any);
  return { fake, service };
}

// ─── 1. Concorrência ────────────────────────────────────────────────────────────────────────────

test('debit: 10 débitos de 1 em paralelo sobre saldo 5 -> exatamente 5 sucessos, saldo final 0, nunca negativo', async () => {
  const { service } = buildService();
  await service.grant(1, 5, { kind: 'grant' });

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      service.debit(1, 1, { actionKey: 'lead_delivery', usageKey: `action-${i}` }),
    ),
  );

  const successes = results.filter((r) => r.debited === 1);
  const failures = results.filter((r) => r.debited === 0);
  assert.equal(successes.length, 5);
  assert.equal(failures.length, 5);
  failures.forEach((r) => assert.equal(r.partial, true));

  const balance = await service.getBalance(1);
  assert.equal(balance, 0);
  assert.ok(balance >= 0);
});

// ─── 2. FIFO / expiração ────────────────────────────────────────────────────────────────────────

// ⚠️ Datas RELATIVAS ao relógio real, nunca absolutas: debit()/refund() usam `new Date()`
// interno. Data fixa aqui é bomba-relógio — a suíte de 04/07 apodreceu em 05/07 quando o
// lote "soon" (2026-07-05T00:00Z hardcoded) venceu DE VERDADE e o serviço, correto, o ignorou.
const DAY_MS = 24 * 60 * 60 * 1000;

test('debit: consome o lote que expira antes primeiro; lote expirado não entra no saldo', async () => {
  const { service } = buildService();
  const now = new Date();
  const past = new Date(now.getTime() - 3 * DAY_MS); // já expirado
  const soon = new Date(now.getTime() + 1 * DAY_MS); // expira em breve
  const later = new Date(now.getTime() + 30 * DAY_MS); // expira depois

  await service.grant(1, 10, { expiresAt: past }); // expirado -> não conta
  await service.grant(1, 3, { expiresAt: later });
  await service.grant(1, 2, { expiresAt: soon });

  const balance = await service.getBalance(1, now);
  assert.equal(balance, 5); // 3 + 2, sem o lote expirado

  const result = await service.debit(1, 2, { actionKey: 'lead_delivery', usageKey: 'fifo-1' });
  assert.equal(result.debited, 2);
  assert.equal(result.partial, false);

  // O lote "soon" (expira antes) deve ter sido consumido primeiro.
  const snapshot = await service.getWalletSnapshot(1, now);
  const soonLot = snapshot.lots.find((l) => l.expiresAt?.getTime() === soon.getTime());
  const laterLot = snapshot.lots.find((l) => l.expiresAt?.getTime() === later.getTime());
  assert.equal(soonLot?.remaining ?? 0, 0);
  assert.equal(laterLot?.remaining, 3);
});

test('debit: nulls (nunca expira) são consumidos por último', async () => {
  const { service, fake } = buildService();
  const now = new Date();
  const soon = new Date(now.getTime() + 1 * DAY_MS);

  await service.grant(1, 2, { expiresAt: null }); // nunca expira -> por último
  await service.grant(1, 2, { expiresAt: soon });

  await service.debit(1, 2, { actionKey: 'lead_delivery', usageKey: 'fifo-null-1' });

  // O lote "soon" foi zerado (consumido primeiro) — some do snapshot (só mostra remaining>0);
  // inspecionamos o estado bruto do fake para confirmar qual lote foi consumido.
  const nullLotRaw = fake.entries.find((e: any) => e.kind === 'grant' && e.expiresAt === null);
  const soonLotRaw = fake.entries.find((e: any) => e.kind === 'grant' && e.expiresAt?.getTime() === soon.getTime());
  assert.equal(soonLotRaw?.remaining, 0);
  assert.equal(nullLotRaw?.remaining, 2);

  const snapshot = await service.getWalletSnapshot(1, now);
  assert.equal(snapshot.balance, 2);
  assert.equal(snapshot.lots.length, 1);
  assert.equal(snapshot.lots[0].expiresAt, null);
});

// ─── 3. Idempotência ────────────────────────────────────────────────────────────────────────────

test('debit: mesma usageKey 2x -> 1 débito só', async () => {
  const { service } = buildService();
  await service.grant(1, 5, {});

  const first = await service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'idem-1' });
  const second = await service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'idem-1' });

  assert.equal(first.debited, 3);
  assert.equal(second.debited, 3);
  assert.equal(await service.getBalance(1), 2);
});

test('grant: mesma usageKey 2x -> 1 lote só', async () => {
  const { service } = buildService();
  const first = await service.grant(1, 10, { usageKey: 'mp-payment-123' });
  const second = await service.grant(1, 10, { usageKey: 'mp-payment-123' });

  assert.equal(first.alreadyProcessed, false);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(await service.getBalance(1), 10);
});

// P0.4 — dedup de usageKey é GLOBAL no ledger: a MESMA chave vinda de OUTRA empresa jamais
// pode virar `alreadyProcessed` silencioso (falso-sucesso cruzando tenants — o chamador
// acharia que creditou e ninguém receberia). Tem que ser erro VISÍVEL + alerta do master.
test('grant: mesma usageKey em OUTRA empresa -> erro visível + MasterEvent, nenhum crédito cruzado', async () => {
  const { service, fake } = buildService();
  const events: any[] = [];
  (fake as any).masterEvent = {
    findFirst: async () => null,
    create: async ({ data }: any) => {
      events.push(data);
      return data;
    },
  };

  const first = await service.grant(1, 10, { usageKey: 'mp:pay-cross' });
  assert.equal(first.alreadyProcessed, false);

  await assert.rejects(
    () => service.grant(2, 10, { usageKey: 'mp:pay-cross' }),
    /outra empresa/,
  );

  assert.equal(await service.getBalance(1), 10); // carteira original intacta
  assert.equal(await service.getBalance(2), 0); // nada entrou na empresa errada
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'credit.grant_cross_company');
  assert.equal(JSON.parse(events[0].payloadJson).existingCompanyId, 1);
});

// Fix B (revisão Opus S1): idempotência SOB CONCORRÊNCIA. Sem o @@unique(usageKey,parentEntryId)
// + tratamento de P2002, duas chamadas paralelas com a MESMA usageKey passariam as duas no
// pré-check e debitariam 2×. Este teste PROVA o não-duplo-débito: o saldo cai só 1×.
test('debit: 5 chamadas PARALELAS com a MESMA usageKey sobre saldo cheio -> debita 1× só (não duplica)', async () => {
  const { service } = buildService();
  await service.grant(1, 100, {}); // saldo folgado: se duplicasse, cairia muito mais que 3

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'same-key-race' }),
    ),
  );

  // Todas retornam o MESMO resultado idempotente (3 debitado), nenhuma retorna 6/9/12/15.
  results.forEach((r) => assert.equal(r.debited, 3));
  // Só UMA ação de 3 saiu do saldo — 100 - 3 = 97 (não 100 - 5×3).
  assert.equal(await service.getBalance(1), 97);
});

test('debit: mesma usageKey cruzando 2 lotes, 2 chamadas paralelas -> total debitado 1× (não 2×)', async () => {
  const { service } = buildService();
  const now = new Date();
  await service.grant(1, 2, { expiresAt: new Date(now.getTime() + 1 * DAY_MS) });
  await service.grant(1, 2, { expiresAt: new Date(now.getTime() + 30 * DAY_MS) });

  // Débito de 3 cruza os 2 lotes (2 + 1). Duas chamadas concorrentes com a mesma usageKey.
  const [a, b] = await Promise.all([
    service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'cross-lot-race' }),
    service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'cross-lot-race' }),
  ]);

  assert.equal(a.debited, 3);
  assert.equal(b.debited, 3);
  // Saldo caiu 3 (não 6): 4 - 3 = 1.
  assert.equal(await service.getBalance(1), 1);
});

// FIXER PR10072026 — furo espelho do P0.4 no DEBIT: usageKey já registrada por OUTRA empresa
// não pode virar resultado idempotente silencioso (a empresa certa nunca seria debitada).
test('debit: mesma usageKey em OUTRA empresa -> erro visível + MasterEvent, nada debitado na errada', async () => {
  const { service, fake } = buildService();
  const events: any[] = [];
  (fake as any).masterEvent = {
    findFirst: async () => null,
    create: async ({ data }: any) => {
      events.push(data);
      return data;
    },
  };

  await service.grant(1, 10, {});
  await service.grant(2, 10, {});
  await service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'master-debit:cross' });

  await assert.rejects(
    () => service.debit(2, 3, { actionKey: 'lead_delivery', usageKey: 'master-debit:cross' }),
    /outra empresa/,
  );
  assert.equal(await service.getBalance(1), 7); // só o débito legítimo
  assert.equal(await service.getBalance(2), 10); // a empresa 2 NÃO foi tocada
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'credit.debit_cross_company');
});

// FIXER PR10072026 — teto global da usageKey: duas chamadas concorrentes podem progredir em
// lotes DISJUNTOS (o @@unique só trava colisão no MESMO lote); sem o teto relido dentro da tx,
// a soma committada passava do pedido (reversão de 100 tirando 130 da carteira).
test('reversePurchase: corrida em lotes DISJUNTOS nunca passa do amount (teto global da usageKey)', async () => {
  const { service, fake } = buildService();
  const now = new Date();
  const recharge = await service.grant(1, 30, {
    kind: 'recharge',
    usageKey: 'mp:pay-race',
    expiresAt: new Date(now.getTime() + 1 * DAY_MS),
  });
  await service.grant(1, 200, { expiresAt: new Date(now.getTime() + 30 * DAY_MS) });

  await Promise.all([
    service.reversePurchase(1, { amount: 100, usageKey: 'mp-reversal:pay-race', preferredLotId: recharge.entryId }),
    service.reversePurchase(1, { amount: 100, usageKey: 'mp-reversal:pay-race', preferredLotId: recharge.entryId }),
  ]);

  const totalReversed = fake.entries
    .filter((e: any) => e.kind === 'purchase_reversal' && e.usageKey === 'mp-reversal:pay-race')
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  assert.equal(totalReversed, 100); // exato — nunca 130
  assert.equal(await service.getBalance(1), 130); // 230 − 100
});

// ─── 4. Overdraft / parcial (D7) ────────────────────────────────────────────────────────────────

test('debit: pedir 50 com 30 de saldo -> debita 30, partial true, saldo 0', async () => {
  const { service } = buildService();
  await service.grant(1, 30, {});

  const result = await service.debit(1, 50, { actionKey: 'lead_delivery', usageKey: 'overdraft-1' });

  assert.equal(result.debited, 30);
  assert.equal(result.requested, 50);
  assert.equal(result.partial, true);
  assert.equal(result.balanceAfter, 0);
  assert.ok(result.balanceAfter >= 0);
});

// ─── 5. Refund ──────────────────────────────────────────────────────────────────────────────────

test('refund: débito depois refund devolve o saldo; refund 2x é idempotente', async () => {
  const { service } = buildService();
  await service.grant(1, 10, {});
  await service.debit(1, 4, { actionKey: 'lead_delivery', usageKey: 'refund-1' });
  assert.equal(await service.getBalance(1), 6);

  const first = await service.refund(1, { usageKey: 'refund-1' });
  assert.equal(first.refunded, 4);
  assert.equal(first.alreadyProcessed, false);
  assert.equal(await service.getBalance(1), 10);

  const second = await service.refund(1, { usageKey: 'refund-1' });
  assert.equal(second.alreadyProcessed, true);
  assert.equal(await service.getBalance(1), 10); // não duplica
});

test('refund: lote original já expirado vira lote novo COM validade nova (decisão do dono — não perde o crédito nem vira perpétuo)', async () => {
  const { service } = buildService();
  const now = new Date();
  const soon = new Date(now.getTime() + 1 * DAY_MS); // vivo no debit (relógio real)

  await service.grant(1, 5, { expiresAt: soon });
  await service.debit(1, 3, { actionKey: 'lead_delivery', usageKey: 'refund-exp-1' });

  // Expira o lote (job) antes do refund chegar — o job aceita `now` explícito no futuro.
  const afterExpiry = new Date(now.getTime() + 2 * DAY_MS);
  await service.expireLots(afterExpiry);
  assert.equal(await service.getBalance(1, afterExpiry), 0);

  const result = await service.refund(1, { usageKey: 'refund-exp-1' }, afterExpiry);
  assert.equal(result.refunded, 3);

  const balanceAfter = await service.getBalance(1, afterExpiry);
  assert.equal(balanceAfter, 3); // devolvido como lote novo consumível

  // O lote de reposição tem validade NOVA no futuro (não é perpétuo, não é o prazo morto).
  const snapshot = await service.getWalletSnapshot(1, afterExpiry);
  assert.equal(snapshot.lots.length, 1);
  const refundLot = snapshot.lots[0];
  assert.ok(refundLot.expiresAt, 'lote de reposição deve ter expiração');
  assert.ok(refundLot.expiresAt!.getTime() > afterExpiry.getTime(), 'validade deve ser futura');
});

// ─── 6. expireLots ──────────────────────────────────────────────────────────────────────────────

test('expireLots: marca vencidos, retorna contagem, saldo cai', async () => {
  const { service } = buildService();
  const past = new Date('2026-07-01T00:00:00Z');
  const future = new Date('2026-08-01T00:00:00Z');

  await service.grant(1, 4, { expiresAt: past });
  await service.grant(1, 6, { expiresAt: future });

  const before = await service.getBalance(1, new Date('2026-07-04T00:00:00Z'));
  assert.equal(before, 6); // o do passado já não conta mesmo sem rodar o job

  const result = await service.expireLots(new Date('2026-07-04T00:00:00Z'));
  assert.equal(result.expiredEntries, 1);
  assert.equal(result.expiredCredits, 4);

  const snapshot = await service.getWalletSnapshot(1, new Date('2026-07-04T00:00:00Z'));
  assert.equal(snapshot.balance, 6);

  // Rodar de novo não expira nada a mais (idempotente/sem duplicar breakage).
  const again = await service.expireLots(new Date('2026-07-04T00:00:00Z'));
  assert.equal(again.expiredEntries, 0);
  assert.equal(again.expiredCredits, 0);
});

// ─── extras: ensureWallet / snapshot ────────────────────────────────────────────────────────────

test('ensureWallet: idempotente, cria só uma vez por companyId', async () => {
  const { service, fake } = buildService();
  const a = await service.ensureWallet(7);
  const b = await service.ensureWallet(7);
  assert.equal(a.id, b.id);
  assert.equal(fake.wallets.length, 1);
});

test('getBalance: empresa sem wallet retorna 0 sem criar nada', async () => {
  const { service, fake } = buildService();
  const balance = await service.getBalance(999);
  assert.equal(balance, 0);
  assert.equal(fake.wallets.length, 0);
});

// ─── MASTER-REFAB S1 — saldo em lote pra listagem master ───────────────────────────────────────

test('getBalancesByCompanyIds: soma o saldo de várias empresas em 1 chamada, ignora expirado e lote esgotado', async () => {
  const { service } = buildService();
  await service.grant(1, 10, { kind: 'grant' });
  await service.grant(2, 7, { kind: 'promo' });
  await service.grant(2, 3, { kind: 'grant', expiresAt: new Date(Date.now() - 1000) }); // já expirado
  // empresa 3 não recebe nenhum grant -> não deve aparecer no Map (saldo 0 implícito)

  const balances = await service.getBalancesByCompanyIds([1, 2, 3]);
  assert.equal(balances.get(1), 10);
  assert.equal(balances.get(2), 7);
  assert.equal(balances.has(3), false);
});

test('getBalancesByCompanyIds: lista vazia devolve Map vazio sem consultar o banco', async () => {
  const { service } = buildService();
  const balances = await service.getBalancesByCompanyIds([]);
  assert.equal(balances.size, 0);
});

// ─── P0.3 (PR10072026 W2) — reversePurchase: estorno/chargeback de recarga ─────────────────────

test('reversePurchase: estorno total tira os créditos do pack, consumindo PRIMEIRO o lote da recarga', async () => {
  const { service, fake } = buildService();
  const now = new Date();
  // Lote alheio que expira ANTES (o FIFO normal consumiria ele primeiro).
  await service.grant(1, 5, { kind: 'grant', expiresAt: new Date(now.getTime() + 1 * DAY_MS) });
  const recharge = await service.grant(1, 10, {
    kind: 'recharge',
    grantType: 'paid',
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    usageKey: 'mp:pay-r1',
  });

  const result = await service.reversePurchase(1, {
    amount: 10,
    usageKey: 'mp-reversal:pay-r1',
    preferredLotId: recharge.entryId,
  });

  assert.equal(result.reversed, 10);
  assert.equal(result.shortfall, 0);
  assert.equal(result.alreadyProcessed, false);
  assert.equal(result.balanceAfter, 5);

  // O lote da recarga foi zerado; o lote alheio (que expirava antes) ficou intacto.
  const rechargeLotRaw = fake.entries.find((e: any) => e.id === recharge.entryId);
  const otherLotRaw = fake.entries.find((e: any) => e.kind === 'grant' && e.amount === 5);
  assert.equal(rechargeLotRaw?.remaining, 0);
  assert.equal(otherLotRaw?.remaining, 5);
});

test('reversePurchase: 20 webhooks duplicados = 1 débito (idempotente por usageKey)', async () => {
  const { service } = buildService();
  await service.grant(1, 10, { kind: 'recharge', usageKey: 'mp:pay-r2' });

  const results = [] as Awaited<ReturnType<typeof service.reversePurchase>>[];
  for (let i = 0; i < 20; i++) {
    results.push(await service.reversePurchase(1, { amount: 10, usageKey: 'mp-reversal:pay-r2' }));
  }

  assert.equal(results[0].alreadyProcessed, false);
  assert.equal(results[0].reversed, 10);
  for (const dup of results.slice(1)) {
    assert.equal(dup.alreadyProcessed, true);
    assert.equal(dup.reversed, 10); // relê o committado, não debita de novo
  }
  const balance = await service.getBalance(1);
  assert.equal(balance, 0);
  assert.ok(balance >= 0); // nunca negativo
});

test('reversePurchase: 5 chamadas PARALELAS com a MESMA usageKey -> aplica 1× só', async () => {
  const { service } = buildService();
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:pay-r3' });

  await Promise.all(
    Array.from({ length: 5 }, () =>
      service.reversePurchase(1, { amount: 10, usageKey: 'mp-reversal:pay-r3' }),
    ),
  );

  // Saldo caiu 10 (não 50): a corrida bate no @@unique e vira já-processado.
  assert.equal(await service.getBalance(1), 90);
});

test('reversePurchase: shortfall — crédito já consumido vira dívida reportada, saldo nunca negativo', async () => {
  const { service } = buildService();
  await service.grant(1, 10, { kind: 'recharge', usageKey: 'mp:pay-r4' });
  await service.debit(1, 7, { actionKey: 'lead_delivery', usageKey: 'consumo-antes-do-estorno' });
  assert.equal(await service.getBalance(1), 3);

  const result = await service.reversePurchase(1, { amount: 10, usageKey: 'mp-reversal:pay-r4' });

  assert.equal(result.reversed, 3); // min(saldo, créditos do pack)
  assert.equal(result.shortfall, 7); // dívida — quem decide o que fazer com ela é o master
  assert.equal(result.balanceAfter, 0);
  assert.ok(result.balanceAfter >= 0);
});

test('reversePurchase: NÃO é revertível por refund (movimento purchase_reversal não é débito operacional)', async () => {
  const { service } = buildService();
  await service.grant(1, 10, { kind: 'recharge', usageKey: 'mp:pay-r5' });
  await service.reversePurchase(1, { amount: 10, usageKey: 'mp-reversal:pay-r5' });
  assert.equal(await service.getBalance(1), 0);

  // refund só enxerga linhas kind 'debit' — compra estornada não volta sozinha.
  const refund = await service.refund(1, { usageKey: 'mp-reversal:pay-r5' });
  assert.equal(refund.refunded, 0);
  assert.equal(await service.getBalance(1), 0);
});

test('reversePurchase: aceita fração; amount <=0 e usageKey vazia lançam', async () => {
  const { service } = buildService();
  await assert.rejects(() => service.reversePurchase(1, { amount: 0, usageKey: 'k' }), /positivo/);
  await service.grant(1, 2, { kind: 'grant' });
  const fractional = await service.reversePurchase(1, { amount: 1.5, usageKey: 'fractional' });
  assert.equal(fractional.reversed, 1.5);
  await assert.rejects(() => service.reversePurchase(1, { amount: 3, usageKey: '  ' }), /usageKey/);
});

// ─── 5. P0.3 HOLD de chargeback (dívida bloqueia até quitar) ─────────────────────────────────────

test('registerChargebackDebt: cria dívida e é idempotente (webhook duplicado do mesmo pagamento não dobra)', async () => {
  const { service } = buildService();
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:pay-cb1' });

  const first = await service.registerChargebackDebt(1, {
    amount: 60,
    usageKey: 'chargeback-debt:pay-cb1',
    parentLotId: 'e1',
  });
  assert.equal(first.alreadyProcessed, false);
  assert.equal(first.debtAfter, 60);
  assert.equal(await service.getChargebackDebt(1), 60);

  // Mesmo pagamento de novo (parentLotId + usageKey iguais → @@unique) NÃO incrementa.
  const second = await service.registerChargebackDebt(1, {
    amount: 60,
    usageKey: 'chargeback-debt:pay-cb1',
    parentLotId: 'e1',
  });
  assert.equal(second.alreadyProcessed, true);
  assert.equal(await service.getChargebackDebt(1), 60);
});

test('hold: crédito NOVO (grant/recarga) quita a dívida do saldo — "crédito novo paga a dívida primeiro"', async () => {
  const { service } = buildService();
  // Recarga 100, cliente consome tudo, chargeback de 100 → dívida 100 (saldo 0).
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:pay-cb2' });
  await service.debit(1, 100, { actionKey: 'lead_delivery', usageKey: 'consumo-tudo' });
  assert.equal(await service.getBalance(1), 0);
  await service.registerChargebackDebt(1, { amount: 100, usageKey: 'chargeback-debt:pay-cb2', parentLotId: 'e1' });
  assert.equal(await service.getChargebackDebt(1), 100);

  // Recarrega 120 → o grant dispara settle: quita 100, saldo efetivo 20, dívida 0.
  await service.grant(1, 120, { kind: 'recharge', usageKey: 'mp:pay-cb2-fix' });
  assert.equal(await service.getChargebackDebt(1), 0);
  assert.equal(await service.getBalance(1), 20);
});

test('hold: recarga MENOR que a dívida quita parcial e a empresa segue devendo', async () => {
  const { service } = buildService();
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:pay-cb3' });
  await service.debit(1, 100, { actionKey: 'lead_delivery', usageKey: 'consumo-cb3' });
  await service.registerChargebackDebt(1, { amount: 100, usageKey: 'chargeback-debt:pay-cb3', parentLotId: 'e1' });

  // Recarrega só 40 → quita 40, dívida cai pra 60, saldo 0 (tudo foi pra dívida).
  await service.grant(1, 40, { kind: 'recharge', usageKey: 'mp:pay-cb3-parcial' });
  assert.equal(await service.getChargebackDebt(1), 60);
  assert.equal(await service.getBalance(1), 0);
});

test('settleChargebackDebtFromBalance: sem dívida ou sem saldo é no-op', async () => {
  const { service } = buildService();
  // Sem dívida.
  assert.deepEqual(await service.settleChargebackDebtFromBalance(1, { usageKey: 'k1' }), { settled: 0, debtAfter: 0 });
  // Com dívida mas sem saldo (dívida registrada, carteira zerada).
  await service.grant(1, 10, { kind: 'recharge', usageKey: 'mp:pay-cb4' });
  await service.debit(1, 10, { actionKey: 'lead_delivery', usageKey: 'consumo-cb4' });
  await service.registerChargebackDebt(1, { amount: 10, usageKey: 'chargeback-debt:pay-cb4', parentLotId: 'e1' });
  const r = await service.settleChargebackDebtFromBalance(1, { usageKey: 'k2' });
  assert.equal(r.settled, 0);
  assert.equal(r.debtAfter, 10);
});

test('hold: 2 settle CONCORRENTES sobre a MESMA divida nao queimam credito em dobro (reserva atomica)', async () => {
  const { service } = buildService();
  // Saldo 200 (2 lotes de 100); os grants disparam settle interno, mas sem divida ainda = no-op.
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:rc1' }); // e1
  await service.grant(1, 100, { kind: 'recharge', usageKey: 'mp:rc2' }); // e2
  // Divida de 50 (chargeback de credito ja consumido em outra recarga).
  await service.registerChargebackDebt(1, { amount: 50, usageKey: 'chargeback-debt:race', parentLotId: 'e1' });
  assert.equal(await service.getBalance(1), 200);
  assert.equal(await service.getChargebackDebt(1), 50);

  // Duas quitacoes concorrentes com usageKeys DISTINTAS (como 2 grants simultaneos): a reserva
  // atomica (updateMany condicional) garante que so uma vence a divida.
  await Promise.all([
    service.settleChargebackDebtFromBalance(1, { usageKey: 'chargeback-settle:grant:A' }),
    service.settleChargebackDebtFromBalance(1, { usageKey: 'chargeback-settle:grant:B' }),
  ]);

  // So 50 quitados no total: divida 0, saldo 150. (Com o bug antigo, cada um queimava 50 -> saldo 100.)
  assert.equal(await service.getChargebackDebt(1), 0);
  assert.equal(await service.getBalance(1), 150);
});
