import test from 'node:test';
import assert from 'node:assert/strict';

import { CreditsMasterController } from './credits-master.controller';

// P0.3 (PR10072026 W2) — débito MANUAL do master: validações do contrato, clamp no saldo
// (nunca negativa; reporta o que clampou), idempotência por intenção e auditoria MasterEvent.
// O comportamento fino do débito (FIFO/atomicidade/idempotência sob corrida) já é provado em
// credit-wallet.service.test.ts — aqui o fake da carteira só espelha o clamp e a dedup.

process.env.HBX_CREDITS_ENABLED = 'true';

const REQ = { user: { id: 41, isSystemMaster: true } };

function buildController(opts?: { balance?: number; companyExists?: boolean }) {
  let balance = opts?.balance ?? 50;
  const debitCalls: any[] = [];
  const masterEvents: any[] = [];
  const seenKeys = new Map<string, { debited: number; balanceAfter: number }>();

  const wallet: any = {
    debit: async (_companyId: number, amount: number, o: any) => {
      debitCalls.push({ amount, ...o });
      const previous = seenKeys.get(o.usageKey);
      if (previous) {
        // Idempotente como o ledger real: mesma usageKey devolve o resultado committado.
        return { debited: previous.debited, requested: amount, partial: previous.debited < amount, balanceAfter: previous.balanceAfter };
      }
      const debited = Math.min(balance, amount); // clamp fail-closed do ledger real
      balance -= debited;
      seenKeys.set(o.usageKey, { debited, balanceAfter: balance });
      return { debited, requested: amount, partial: debited < amount, balanceAfter: balance };
    },
  };

  const prisma: any = {
    company: {
      findUnique: async () => (opts?.companyExists === false ? null : { id: 7 }),
    },
    masterEvent: {
      findFirst: async ({ where }: any) => {
        const rows = masterEvents.filter((e) => e.dedupKey === where.dedupKey);
        const last = rows[rows.length - 1];
        return last ? { createdAt: last.createdAt, payloadJson: last.payloadJson } : null;
      },
      create: async ({ data }: any) => {
        const row = { ...data, createdAt: new Date() };
        masterEvents.push(row);
        return row;
      },
    },
  };

  // PR11072026 W1 acrescentou o 4º parâmetro (CreditActionConfigService) ao construtor —
  // fora do escopo deste teste (catálogo de ações), fake vazio basta.
  const controller = new CreditsMasterController({} as any, wallet, prisma, {} as any);
  return { controller, debitCalls, masterEvents };
}

const BODY = { amount: 20, reason: 'ajuste de estorno', idempotencyKey: 'intent-debit-0001' };

test('débito manual: debita, audita MasterEvent e devolve saldo', async () => {
  const { controller, debitCalls, masterEvents } = buildController({ balance: 50 });

  const res = await controller.debitCompany(7, BODY, REQ);

  assert.equal(res.ok, true);
  assert.equal(res.requested, 20);
  assert.equal(res.debited, 20);
  assert.equal(res.clamped, 0);
  assert.equal(res.balanceAfter, 30);

  // Ledger: usageKey estável por intenção, ESCOPADA por empresa (mesma key em outra
  // empresa não colide no ledger global).
  assert.equal(debitCalls.length, 1);
  assert.equal(debitCalls[0].usageKey, 'master-debit:7:intent-debit-0001');
  assert.equal(debitCalls[0].actionKey, 'master_manual_debit');
  assert.equal(debitCalls[0].userId, 41);
  assert.equal(debitCalls[0].metadata.reason, 'ajuste de estorno');

  // Auditoria do dono.
  assert.equal(masterEvents.length, 1);
  assert.equal(masterEvents[0].type, 'credit.master_manual_debit');
  const payload = JSON.parse(masterEvents[0].payloadJson);
  assert.equal(payload.debited, 20);
  assert.equal(payload.reason, 'ajuste de estorno');
  assert.equal(payload.masterUserId, 41);
});

test('clamp: pedir mais que o saldo debita só o disponível e REPORTA o que clampou (nunca negativa)', async () => {
  const { controller } = buildController({ balance: 8 });

  const res = await controller.debitCompany(7, { ...BODY, amount: 20 }, REQ);

  assert.equal(res.debited, 8);
  assert.equal(res.clamped, 12);
  assert.equal(res.balanceAfter, 0);
  assert.ok(res.balanceAfter >= 0);
});

test('idempotência: mesma idempotencyKey 2× -> 1 débito só (double-click do master não dobra)', async () => {
  const { controller, masterEvents } = buildController({ balance: 50 });

  const first = await controller.debitCompany(7, BODY, REQ);
  const second = await controller.debitCompany(7, BODY, REQ);

  assert.equal(first.debited, 20);
  assert.equal(second.debited, 20);
  assert.equal(second.balanceAfter, 30); // saldo não caiu 2×
  // Evento também não duplica (dedupKey pela intenção + mesmo state).
  assert.equal(masterEvents.length, 1);
});

test('mesma idempotencyKey em empresas DIFERENTES -> 2 débitos independentes (key escopada por companyId)', async () => {
  const { controller, debitCalls } = buildController({ balance: 50 });

  const first = await controller.debitCompany(7, BODY, REQ);
  const second = await controller.debitCompany(8, BODY, REQ);

  assert.equal(first.debited, 20);
  assert.equal(second.debited, 20);
  assert.equal(debitCalls.length, 2);
  assert.notEqual(debitCalls[0].usageKey, debitCalls[1].usageKey);
});

test('validações: amount não-inteiro/<=0, reason vazio e idempotencyKey curta -> BadRequest sem tocar a carteira', async () => {
  const { controller, debitCalls } = buildController();
  const isBadRequest = (err: any) => err?.constructor?.name === 'BadRequestException';

  await assert.rejects(() => controller.debitCompany(7, { ...BODY, amount: 0 }, REQ), isBadRequest);
  await assert.rejects(() => controller.debitCompany(7, { ...BODY, amount: -5 }, REQ), isBadRequest);
  await assert.rejects(() => controller.debitCompany(7, { ...BODY, amount: 2.5 }, REQ), isBadRequest);
  await assert.rejects(() => controller.debitCompany(7, { ...BODY, reason: '   ' }, REQ), isBadRequest);
  await assert.rejects(() => controller.debitCompany(7, { ...BODY, idempotencyKey: 'curta' }, REQ), isBadRequest);
  await assert.rejects(
    () => controller.debitCompany(7, { ...BODY, reason: 'x'.repeat(501) }, REQ),
    isBadRequest,
  );
  assert.equal(debitCalls.length, 0);
});

test('empresa inexistente: BadRequest sem tocar a carteira', async () => {
  const { controller, debitCalls } = buildController({ companyExists: false });
  await assert.rejects(
    () => controller.debitCompany(999, BODY, REQ),
    (err: any) => err?.constructor?.name === 'BadRequestException',
  );
  assert.equal(debitCalls.length, 0);
});

test('flag OFF: NotFound (superfície master inteira fica inerte)', async () => {
  const { controller } = buildController();
  process.env.HBX_CREDITS_ENABLED = 'false';
  try {
    await assert.rejects(
      () => controller.debitCompany(7, BODY, REQ),
      (err: any) => err?.constructor?.name === 'NotFoundException',
    );
  } finally {
    process.env.HBX_CREDITS_ENABLED = 'true';
  }
});
