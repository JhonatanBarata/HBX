import test from 'node:test';
import assert from 'node:assert/strict';

import { CreditWalletService } from './credit-wallet.service';

// ── Prisma falso ───────────────────────────────────────────────────────────────
// Postgres está down (regra da casa) e a suíte roda em `node --test` sobre dist,
// sem banco. Este fake modela wallet + ledger em memória e EMULA o SELECT ... FOR
// UPDATE com um mutex POR EMPRESA: duas transações concorrentes na mesma wallet
// serializam no lockWallet, exatamente como o Postgres faria. Prova, então, a
// LÓGICA de consumo (FIFO, fail-closed, idempotência) sob o lock — a atomicidade
// real do lock é do Postgres (já provada em prod pelo hbx-recovery).
function makeFakePrisma() {
  const store = {
    wallets: [] as Array<{ id: string; companyId: number }>,
    entries: [] as any[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}-${(seq += 1)}`;
  const locks = new Map<number, Promise<void>>();

  function matches(entry: any, where: any): boolean {
    for (const [key, cond] of Object.entries(where || {})) {
      if (key === 'OR') {
        const ok = (cond as any[]).some((sub) => matches(entry, sub));
        if (!ok) return false;
        continue;
      }
      const value = entry[key];
      if (cond === null) {
        if (value !== null && value !== undefined) return false;
      } else if (typeof cond === 'object' && cond !== null) {
        const c = cond as any;
        if ('gt' in c && !(value > c.gt)) return false;
        if ('gte' in c && !(value >= c.gte)) return false;
        if ('lt' in c && !(value !== null && value !== undefined && value < c.lt)) return false;
        if ('in' in c && !c.in.includes(value)) return false;
      } else if (value !== cond) {
        return false;
      }
    }
    return true;
  }

  function orderEntries(rows: any[], orderBy: any[]): any[] {
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const [field, dir] = Object.entries(clause)[0] as [string, string];
        const av = a[field];
        const bv = b[field];
        // expiresAt asc → NULLS LAST (default do Postgres para ASC)
        const an = av === null || av === undefined;
        const bn = bv === null || bv === undefined;
        if (an && bn) continue;
        if (an) return 1;
        if (bn) return -1;
        const at = av instanceof Date ? av.getTime() : av;
        const bt = bv instanceof Date ? bv.getTime() : bv;
        if (at < bt) return dir === 'asc' ? -1 : 1;
        if (at > bt) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  // findMany/findFirst/findUnique devolvem CÓPIAS (como o Prisma real: linhas
  // destacadas). Se devolvessem a referência do store, um update() mutaria o
  // snapshot já lido — falso-negativo. Escrita (create/update/updateMany) mexe no
  // ORIGINAL do store, achado por id.
  const ledger = {
    findMany: async ({ where, orderBy }: any) => {
      let rows = store.entries.filter((e) => matches(e, where || {}));
      if (orderBy) rows = orderEntries(rows, orderBy);
      return rows.map((r) => ({ ...r }));
    },
    findFirst: async ({ where }: any) => {
      const found = store.entries.find((e) => matches(e, where || {}));
      return found ? { ...found } : null;
    },
    findUnique: async ({ where }: any) => {
      const found = store.entries.find((e) => e.id === where.id);
      return found ? { ...found } : null;
    },
    create: async ({ data }: any) => {
      const row = {
        id: nextId('entry'),
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
        createdAt: new Date(Date.now() + seq),
      };
      store.entries.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = store.entries.find((e) => e.id === where.id);
      if (!row) throw new Error('not found');
      applyData(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = store.entries.filter((e) => matches(e, where || {}));
      for (const row of rows) applyData(row, data);
      return { count: rows.length };
    },
  };

  function applyData(row: any, data: any) {
    for (const [key, val] of Object.entries(data || {})) {
      if (val && typeof val === 'object' && ('increment' in val || 'decrement' in val)) {
        const v = val as any;
        if ('increment' in v) row[key] += v.increment;
        if ('decrement' in v) row[key] -= v.decrement;
      } else {
        row[key] = val;
      }
    }
  }

  const wallet = {
    findUnique: async ({ where }: any) => {
      const w = store.wallets.find((x) => x.companyId === where.companyId);
      return w ? { id: w.id, companyId: w.companyId } : null;
    },
    create: async ({ data }: any) => {
      if (store.wallets.some((x) => x.companyId === data.companyId)) {
        const err: any = new Error('unique');
        err.code = 'P2002';
        throw err;
      }
      const w = { id: nextId('wallet'), companyId: data.companyId };
      store.wallets.push(w);
      return { id: w.id, companyId: w.companyId };
    },
  };

  const prisma: any = {
    creditWallet: wallet,
    creditLedgerEntry: ledger,
    $transaction: async (fn: any) => {
      let release: (() => void) | null = null;
      const tx = {
        creditWallet: wallet,
        creditLedgerEntry: ledger,
        $queryRawUnsafe: async (_sql: string, companyId: number) => {
          // Emula FOR UPDATE: enfileira nesta empresa e segura até a tx acabar.
          const prev = locks.get(companyId) || Promise.resolve();
          let releaseThis!: () => void;
          const held = new Promise<void>((res) => (releaseThis = res));
          locks.set(companyId, prev.then(() => held));
          await prev;
          release = releaseThis;
          const w = store.wallets.find((x) => x.companyId === companyId);
          return w ? [{ id: w.id }] : [];
        },
      };
      try {
        return await fn(tx);
      } finally {
        if (release) release();
      }
    },
  };

  return { prisma, store };
}

function makeService() {
  const { prisma, store } = makeFakePrisma();
  return { service: new CreditWalletService(prisma), store };
}

test('grant + getBalance: saldo = soma dos lotes abertos', async () => {
  const { service } = makeService();
  await service.grant(1, 10, { kind: 'grant', grantType: 'courtesy_internal' });
  await service.grant(1, 5, { kind: 'promo', grantType: 'promo' });
  assert.equal(await service.getBalance(1), 15);
});

test('concorrência: 10 débitos de 1 sobre saldo 5 → exatamente 5, nunca negativo', async () => {
  const { service } = makeService();
  await service.grant(1, 5, { kind: 'grant' });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      service.debit(1, 1, { actionKey: 'lead_delivery', usageKey: `pull-${i}` }),
    ),
  );
  const wins = results.filter((r) => r.debited === 1).length;
  const zeros = results.filter((r) => r.debited === 0).length;
  assert.equal(wins, 5);
  assert.equal(zeros, 5);
  assert.equal(await service.getBalance(1), 0);
  assert.ok(results.every((r) => r.balanceAfter >= 0));
});

test('FIFO por expiração: consome o lote que expira primeiro; lote expirado fica fora', async () => {
  const { service } = makeService();
  const soon = new Date(Date.now() + 10_000);
  const later = new Date(Date.now() + 1_000_000);
  const past = new Date(Date.now() - 10_000);
  await service.grant(2, 3, { kind: 'grant', expiresAt: later }); // A (expira depois)
  await service.grant(2, 3, { kind: 'grant', expiresAt: soon }); // B (expira antes)
  await service.grant(2, 5, { kind: 'grant', expiresAt: past }); // C (já expirado)

  assert.equal(await service.getBalance(2), 6); // C fora

  const r = await service.debit(2, 2, { actionKey: 'lead_delivery', usageKey: 'k1' });
  assert.equal(r.debited, 2);
  assert.equal(r.balanceAfter, 4);

  const snap = await service.getWalletSnapshot(2);
  const b = snap.lots.find((l) => l.expiresAt === soon.toISOString());
  const a = snap.lots.find((l) => l.expiresAt === later.toISOString());
  assert.equal(b?.remaining, 1); // consumiu B primeiro (expira antes)
  assert.equal(a?.remaining, 3); // A intacto
});

test('idempotência: mesma usageKey 2x = 1 débito só', async () => {
  const { service } = makeService();
  await service.grant(3, 5, { kind: 'grant' });
  const first = await service.debit(3, 1, { actionKey: 'lead_delivery', usageKey: 'dup' });
  const second = await service.debit(3, 1, { actionKey: 'lead_delivery', usageKey: 'dup' });
  assert.equal(first.debited, 1);
  assert.equal(second.debited, 1);
  assert.equal(second.idempotentReplay, true);
  assert.equal(await service.getBalance(3), 4);
});

test('overdraft/parcial (D7): pedir 50 com 30 → debita 30, partial, saldo 0', async () => {
  const { service } = makeService();
  await service.grant(4, 30, { kind: 'grant' });
  const r = await service.debit(4, 50, { actionKey: 'lead_delivery', usageKey: 'big' });
  assert.equal(r.debited, 30);
  assert.equal(r.requested, 50);
  assert.equal(r.partial, true);
  assert.equal(r.balanceAfter, 0);
  assert.equal(await service.getBalance(4), 0);
});

test('refund: devolve saldo ao lote vivo; refund 2x = idempotente', async () => {
  const { service } = makeService();
  await service.grant(5, 5, { kind: 'grant' });
  await service.debit(5, 2, { actionKey: 'lead_delivery', usageKey: 'r1' });
  assert.equal(await service.getBalance(5), 3);

  const ref = await service.refund(5, 'r1');
  assert.equal(ref.refunded, 2);
  assert.equal(ref.alreadyRefunded, false);
  assert.equal(await service.getBalance(5), 5);

  const ref2 = await service.refund(5, 'r1');
  assert.equal(ref2.alreadyRefunded, true);
  assert.equal(await service.getBalance(5), 5); // não devolve de novo
});

test('expireLots: marca vencidos, retorna contagem, saldo cai', async () => {
  const { service } = makeService();
  const past = new Date(Date.now() - 10_000);
  await service.grant(6, 4, { kind: 'grant', expiresAt: past });
  await service.grant(6, 6, { kind: 'grant' }); // sem validade

  // saldo já ignora o vencido na leitura...
  assert.equal(await service.getBalance(6), 6);

  const res = await service.expireLots(new Date());
  assert.equal(res.expiredCredits, 4);
  assert.equal(res.expiredLots, 1);
  assert.equal(await service.getBalance(6), 6);
});

test('grant idempotente por usageKey: recarga repetida não duplica lote', async () => {
  const { service } = makeService();
  const a = await service.grant(7, 100, { kind: 'recharge', grantType: 'paid', usageKey: 'mp-pay-1' });
  const b = await service.grant(7, 100, { kind: 'recharge', grantType: 'paid', usageKey: 'mp-pay-1' });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(await service.getBalance(7), 100);
});
