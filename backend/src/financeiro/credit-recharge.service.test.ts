import test from 'node:test';
import assert from 'node:assert/strict';

import { CreditRechargeService } from './credit-recharge.service';

// CRÉDITOS S3-PARTE2 — a prova do dinheiro da recarga. Fakes mínimos das 4 deps;
// o comportamento fino do ledger (FIFO/lotes/idempotência sob lock) já é provado em
// credit-wallet.service.test.ts — aqui provamos a ORQUESTRAÇÃO: Regra de Ouro
// (só credita aprovado), LEI DO VENDEDOR (gerente/vendedor 403 neutro), idempotência
// da AÇÃO (retry não dobra crédito nem receita) e o registro fiscal na compra.

process.env.HBX_CREDITS_ENABLED = 'true';
// A cadeia de imports acima puxa dotenv (via PrismaService) e carrega o .env DEV do
// backend — que tem PAYMENTS_PROVIDER=mock + NODE_ENV=development. Sem este reset, a
// suíte inteira rodaria em mock e os testes "live" testariam o caminho errado.
process.env.PAYMENTS_PROVIDER = 'mercadopago';

const DONO = { id: 9, email: 'dono@x.com', role: 'USERMASTER', isSystemMaster: false, canViewBilling: true, companyId: 7 };
const GERENTE = { ...DONO, role: 'ADMIN', canViewBilling: false };
const VENDEDOR = { ...DONO, role: 'USER' };

const PACK = { key: 'starter', title: 'Starter', credits: 120, price: 79.9, defaultExpiryDays: 90, badge: null, recommended: false, status: 'available' };

function buildService(overrides?: {
  paymentStatus?: string;
  paymentId?: string;
  createPaymentThrows?: boolean;
}) {
  const grants: any[] = [];
  const charges: any[] = [];
  const paymentCalls: any[] = [];
  const grantedKeys = new Set<string>();
  let balance = 0;

  const ledgerEntries: any[] = [];

  const financeiroCharge = {
    findFirst: async ({ where }: any) =>
      charges.find((c) => c.externalReference === where.externalReference) || null,
    create: async ({ data }: any) => {
      if (charges.some((c) => c.externalReference === data.externalReference)) {
        const err: any = new Error('unique');
        err.code = 'P2002';
        throw err;
      }
      const row = { id: `ch-${charges.length + 1}`, ...data };
      charges.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = charges.find((c) => c.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  const prisma: any = {
    company: {
      findUnique: async () => ({ id: 7, taxDocument: '11222333000181' }),
    },
    financeiroCharge,
    // Transação interativa: repassa o mesmo store (a atomicidade real é do Postgres;
    // aqui provamos a ORQUESTRAÇÃO charge→ledger→link e o P2002 no caminho de retry).
    $transaction: async (fn: any) => fn({ financeiroCharge, $executeRaw: async () => 1 }),
  };

  const mpClient: any = {
    createPayment: async (_token: string, payload: any, idempotencyKey: string) => {
      paymentCalls.push({ payload, idempotencyKey });
      if (overrides?.createPaymentThrows) throw new Error('gateway indisponível');
      return { id: overrides?.paymentId || 'pay-123', status: overrides?.paymentStatus || 'approved' };
    },
  };

  // Wallet fiel no que importa: grant dedupa por usageKey (como o ledger real).
  const wallet: any = {
    grant: async (_companyId: number, amount: number, opts: any) => {
      grants.push({ amount, opts });
      if (opts.usageKey && grantedKeys.has(opts.usageKey)) {
        return { entryId: 'e-dup', amount, alreadyProcessed: true };
      }
      if (opts.usageKey) grantedKeys.add(opts.usageKey);
      balance += amount;
      return { entryId: `e-${grants.length}`, amount, alreadyProcessed: false };
    },
    getBalance: async () => balance,
  };

  const packConfig: any = {
    listAvailable: () => [PACK],
  };

  // Fake do FinanceiroService: só o insertBillingLedgerEntry (S5 — receita no ledger
  // master pro Livro Caixa). Registra a linha e devolve o id, como o real.
  const financeiroService: any = {
    insertBillingLedgerEntry: async (input: any, _db?: any) => {
      ledgerEntries.push(input);
      return `ledger-${ledgerEntries.length}`;
    },
  };

  const service = new CreditRechargeService(prisma, mpClient, wallet, packConfig, financeiroService);
  // Token do MP resolvido de verdade só em runtime (o util real puxa runtime-schema do
  // master via raw SQL) — aqui a prova é a ORQUESTRAÇÃO, então patch direto.
  (service as any).resolveMpAccessToken = async () => 'TEST-ACCESS-TOKEN';
  return { service, grants, charges, paymentCalls, ledgerEntries };
}

const BASE_INPUT = {
  packKey: 'starter',
  idempotencyKey: 'intent-uuid-0001',
  cardTokenId: 'tok_abc',
  paymentMethodId: 'visa',
  taxDocument: null,
};

test('aprovado: credita lote recharge/paid com usageKey do pagamento + grava receita 1x', async () => {
  const { service, grants, charges, paymentCalls, ledgerEntries } = buildService();
  const res = await service.rechargeWithCard(DONO, BASE_INPUT);

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.credited, 120);
    assert.equal(res.balanceAfter, 120);
    assert.equal(res.paymentId, 'pay-123');
  }
  assert.equal(grants.length, 1);
  assert.equal(grants[0].opts.kind, 'recharge');
  assert.equal(grants[0].opts.grantType, 'paid');
  assert.equal(grants[0].opts.usageKey, 'mp:pay-123');
  assert.ok(grants[0].opts.expiresAt instanceof Date);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].status, 'approved');
  assert.equal(charges[0].lifecycle, 'paid');
  assert.equal(charges[0].amount, 79.9);
  // X-Idempotency-Key do MP deriva da intenção do front (retry não recobra).
  assert.equal(paymentCalls[0].idempotencyKey, 'credrech-intent-uuid-0001');
  // S5 — receita VISÍVEL pro fiscal: linha revenue no ledger master + charge LINKADA.
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0].entryGroup, 'revenue');
  assert.equal(ledgerEntries[0].status, 'APPROVED');
  assert.equal(ledgerEntries[0].amount, 79.9);
  assert.equal(charges[0].ledgerEntryId, 'ledger-1');
});

test('recusado: NADA creditado, NADA de receita (Regra de Ouro)', async () => {
  const { service, grants, charges, ledgerEntries } = buildService({ paymentStatus: 'rejected' });
  const res = await service.rechargeWithCard(DONO, BASE_INPUT);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'CHARGE_DECLINED');
  assert.equal(grants.length, 0);
  assert.equal(charges.length, 0);
  assert.equal(ledgerEntries.length, 0);
});

test('gateway caiu: CHARGE_FAILED, nada creditado', async () => {
  const { service, grants } = buildService({ createPaymentThrows: true });
  const res = await service.rechargeWithCard(DONO, BASE_INPUT);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'CHARGE_FAILED');
  assert.equal(grants.length, 0);
});

test('sem cartão: CARD_REQUIRED com amount pro front abrir o CheckoutPanel', async () => {
  const { service } = buildService();
  const res = await service.rechargeWithCard(DONO, { ...BASE_INPUT, cardTokenId: null, paymentMethodId: null });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.code, 'CARD_REQUIRED');
    assert.equal(res.amount, 79.9);
    assert.equal(res.packKey, 'starter');
  }
});

test('LEI DO VENDEDOR: gerente e vendedor levam Forbidden NEUTRO (sem preço na mensagem)', async () => {
  const { service } = buildService();
  for (const user of [GERENTE, VENDEDOR]) {
    await assert.rejects(
      () => service.rechargeWithCard(user, BASE_INPUT),
      (err: any) => {
        assert.equal(err?.constructor?.name, 'ForbiddenException');
        assert.ok(!/R\$|pre[çc]o|pacote/i.test(String(err?.message || '')));
        return true;
      },
    );
  }
});

test('retry da MESMA intenção (MP devolve o mesmo payment): crédito e receita NÃO dobram', async () => {
  const { service, grants, charges, ledgerEntries } = buildService();
  const first = await service.rechargeWithCard(DONO, BASE_INPUT);
  const second = await service.rechargeWithCard(DONO, BASE_INPUT);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.credited, 120);
    assert.equal(second.credited, 0); // dedupado no ledger
    assert.equal(second.balanceAfter, 120); // saldo não dobrou
  }
  assert.equal(grants.length, 2); // chamado 2x, creditado 1x
  assert.equal(charges.length, 1); // receita 1x (externalReference único)
  assert.equal(ledgerEntries.length, 1); // fiscal também 1x (charge+ledger na MESMA tx)
});

test('idempotencyKey ausente/curta: BadRequest antes de qualquer cobrança', async () => {
  const { service, paymentCalls } = buildService();
  await assert.rejects(
    () => service.rechargeWithCard(DONO, { ...BASE_INPUT, idempotencyKey: 'curta' }),
    (err: any) => err?.constructor?.name === 'BadRequestException',
  );
  assert.equal(paymentCalls.length, 0);
});

test('pack inexistente: BadRequest', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.rechargeWithCard(DONO, { ...BASE_INPUT, packKey: 'nao-existe' }),
    (err: any) => err?.constructor?.name === 'BadRequestException',
  );
});

test('flag OFF: NotFound (módulo inerte)', async () => {
  const { service } = buildService();
  process.env.HBX_CREDITS_ENABLED = 'false';
  try {
    await assert.rejects(
      () => service.rechargeWithCard(DONO, BASE_INPUT),
      (err: any) => err?.constructor?.name === 'NotFoundException',
    );
  } finally {
    process.env.HBX_CREDITS_ENABLED = 'true';
  }
});

test('mock mode (dev): credita sem gateway, paymentId derivado da intenção', async () => {
  const { service, grants, paymentCalls } = buildService();
  const prevProvider = process.env.PAYMENTS_PROVIDER;
  const prevEnv = process.env.NODE_ENV;
  process.env.PAYMENTS_PROVIDER = 'mock';
  process.env.NODE_ENV = 'development';
  try {
    const res = await service.rechargeWithCard(DONO, { ...BASE_INPUT, cardTokenId: null, paymentMethodId: null });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.mock, true);
      assert.equal(res.paymentId, 'mock-intent-uuid-0001');
    }
    assert.equal(paymentCalls.length, 0); // gateway nunca tocado
    assert.equal(grants[0].opts.usageKey, 'mp:mock-intent-uuid-0001');
  } finally {
    // Volta pro estado FORÇADO no topo do arquivo (live), não pro .env do dotenv.
    process.env.PAYMENTS_PROVIDER = 'mercadopago';
    if (prevEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevEnv;
    void prevProvider;
  }
});
