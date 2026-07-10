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
  // P0.4 — knobs de divergência da RESPOSTA do MP (validação fail-closed):
  omitPaymentId?: boolean;
  responseAmount?: number;
  responseCurrency?: string;
  responseExternalReference?: string;
}) {
  const grants: any[] = [];
  const charges: any[] = [];
  const paymentCalls: any[] = [];
  const masterEvents: any[] = [];
  const grantedKeys = new Set<string>();
  let balance = 0;

  const ledgerEntries: any[] = [];

  // Matcher mínimo p/ os findFirst do serviço: igualdade direta + OR (P0.4 usa
  // OR [externalReference, mpPaymentId] pra descobrir de quem é o conflito P2002).
  const chargeMatches = (row: any, where: any): boolean => {
    if (where?.OR) return where.OR.some((branch: any) => chargeMatches(row, branch));
    return Object.entries(where || {}).every(([key, value]) => row[key] === value);
  };

  const financeiroCharge = {
    findFirst: async ({ where }: any) => charges.find((c) => chargeMatches(c, where)) || null,
    create: async ({ data }: any) => {
      // @unique real: externalReference E mpPaymentId (NULL não colide, como no Postgres).
      if (
        charges.some((c) => c.externalReference === data.externalReference) ||
        (data.mpPaymentId != null && charges.some((c) => c.mpPaymentId === data.mpPaymentId))
      ) {
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
    // Trilha do master (emitMasterEvent): registra os alertas P0.4 pra prova.
    masterEvent: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        masterEvents.push(data);
        return data;
      },
    },
    // Transação interativa: repassa o mesmo store (a atomicidade real é do Postgres;
    // aqui provamos a ORQUESTRAÇÃO charge→ledger→link e o P2002 no caminho de retry).
    $transaction: async (fn: any) => fn({ financeiroCharge, $executeRaw: async () => 1 }),
  };

  const mpClient: any = {
    createPayment: async (_token: string, payload: any, idempotencyKey: string) => {
      paymentCalls.push({ payload, idempotencyKey });
      if (overrides?.createPaymentThrows) throw new Error('gateway indisponível');
      // Resposta FIEL do MP no caminho feliz: id + status + valor/moeda/referência ecoados
      // (a validação P0.4 exige tudo isso antes de creditar); overrides simulam divergência.
      return {
        id: overrides?.omitPaymentId ? undefined : overrides?.paymentId || 'pay-123',
        status: overrides?.paymentStatus || 'approved',
        transaction_amount: overrides?.responseAmount ?? payload.transaction_amount,
        currency_id: overrides?.responseCurrency ?? 'BRL',
        external_reference: overrides?.responseExternalReference ?? payload.external_reference,
      };
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
  return { service, grants, charges, paymentCalls, ledgerEntries, masterEvents };
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
  // X-Idempotency-Key do MP deriva da intenção do front ESCOPADA pela empresa (P0.4):
  // retry não recobra, e empresas diferentes nunca colidem na conta MP do master.
  assert.equal(paymentCalls[0].idempotencyKey, 'credrech-7-intent-uuid-0001');
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

test('retry da MESMA intenção que JÁ virou charge: devolve o resultado gravado SEM tocar o gateway', async () => {
  const { service, grants, charges, ledgerEntries, paymentCalls } = buildService();
  const first = await service.rechargeWithCard(DONO, BASE_INPUT);
  const second = await service.rechargeWithCard(DONO, BASE_INPUT);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.credited, 120);
    assert.equal(second.credited, 0); // intenção já processada
    assert.equal(second.balanceAfter, 120); // saldo não dobrou
    assert.equal(second.paymentId, 'pay-123'); // identidade do pagamento ORIGINAL
  }
  // Pré-check por externalReference (FIXER PR10072026): o retry NÃO chama o MP de novo —
  // mesmo que o formato da X-Idempotency-Key mude entre deploys, não há 2ª cobrança.
  assert.equal(paymentCalls.length, 1);
  assert.equal(grants.length, 1); // nem re-tenta o grant (o resultado vem da charge gravada)
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

// ─── P0.4 — validação fail-closed da resposta do MP (recarga amarrada à empresa/intenção) ──────

test('P0.4 — aprovado SEM payment.id: falha fail-closed, NADA creditado, alerta emitido (nunca sintetiza id)', async () => {
  const { service, grants, charges, ledgerEntries, masterEvents } = buildService({ omitPaymentId: true });
  await assert.rejects(
    () => service.rechargeWithCard(DONO, BASE_INPUT),
    (err: any) => err?.constructor?.name === 'BadGatewayException',
  );
  assert.equal(grants.length, 0); // grant nunca foi tentado
  assert.equal(charges.length, 0);
  assert.equal(ledgerEntries.length, 0);
  assert.equal(masterEvents.length, 1);
  assert.equal(masterEvents[0].type, 'credit.recharge_divergence');
  assert.equal(JSON.parse(masterEvents[0].payloadJson).state, 'payment_id_ausente');
});

test('P0.4 — transaction_amount divergente do pack: falha sem grant + alerta', async () => {
  const { service, grants, charges, masterEvents } = buildService({ responseAmount: 1.99 });
  await assert.rejects(
    () => service.rechargeWithCard(DONO, BASE_INPUT),
    (err: any) => err?.constructor?.name === 'BadGatewayException',
  );
  assert.equal(grants.length, 0);
  assert.equal(charges.length, 0);
  assert.equal(JSON.parse(masterEvents[0].payloadJson).state, 'valor_divergente');
});

test('P0.4 — external_reference de OUTRA empresa/intenção (pagamento que não é nosso): falha sem grant', async () => {
  const { service, grants, masterEvents } = buildService({
    responseExternalReference: 'hbx-credit-recharge-99-intent-de-outro',
  });
  await assert.rejects(
    () => service.rechargeWithCard(DONO, BASE_INPUT),
    (err: any) => err?.constructor?.name === 'BadGatewayException',
  );
  assert.equal(grants.length, 0);
  assert.equal(JSON.parse(masterEvents[0].payloadJson).state, 'external_reference_divergente');
});

test('P0.4 — moeda != BRL: falha sem grant', async () => {
  const { service, grants, masterEvents } = buildService({ responseCurrency: 'USD' });
  await assert.rejects(
    () => service.rechargeWithCard(DONO, BASE_INPUT),
    (err: any) => err?.constructor?.name === 'BadGatewayException',
  );
  assert.equal(grants.length, 0);
  assert.equal(JSON.parse(masterEvents[0].payloadJson).state, 'moeda_divergente');
});

test('P0.4 — P2002 de mpPaymentId com cobrança de OUTRA empresa: erro visível + alerta, não falso-sucesso', async () => {
  const { service, charges, masterEvents } = buildService();
  // Cobrança de outra empresa já ocupa o mpPaymentId que o MP devolveu pra nós.
  charges.push({
    id: 'ch-seed-99',
    companyId: 99,
    externalReference: 'hbx-credit-recharge-99-outra-intent',
    mpPaymentId: 'pay-123',
  });
  await assert.rejects(
    () => service.rechargeWithCard(DONO, BASE_INPUT),
    (err: any) => err?.constructor?.name === 'ConflictException',
  );
  assert.equal(charges.length, 1); // só a seed — nossa charge NÃO foi gravada
  const conflictEvent = masterEvents.find(
    (e) => JSON.parse(e.payloadJson).state === 'charge_conflito_cross_empresa',
  );
  assert.ok(conflictEvent);
  assert.equal(conflictEvent.type, 'credit.recharge_divergence');
  assert.equal(JSON.parse(conflictEvent.payloadJson).received.conflictingCompanyId, 99);
});

// P0.4 — harness de DUAS empresas na MESMA conta MP (token do master compartilhado): o fake
// do MP dedupa por X-Idempotency-Key como o MP real; a wallet dedupa usageKey GLOBALMENTE e
// lança em cross-empresa, espelhando o CreditWalletService real pós-P0.4.
function buildTwoCompanyHarness() {
  const paymentCalls: any[] = [];
  const mpPayments = new Map<string, any>();
  const balances = new Map<number, number>();
  const usageKeyOwner = new Map<string, number>();
  const charges: any[] = [];
  const ledgerEntries: any[] = [];

  const chargeMatches = (row: any, where: any): boolean => {
    if (where?.OR) return where.OR.some((branch: any) => chargeMatches(row, branch));
    return Object.entries(where || {}).every(([key, value]) => row[key] === value);
  };

  const financeiroCharge = {
    findFirst: async ({ where }: any) => charges.find((c) => chargeMatches(c, where)) || null,
    create: async ({ data }: any) => {
      if (
        charges.some((c) => c.externalReference === data.externalReference) ||
        (data.mpPaymentId != null && charges.some((c) => c.mpPaymentId === data.mpPaymentId))
      ) {
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
    company: { findUnique: async ({ where }: any) => ({ id: where.id, taxDocument: '11222333000181' }) },
    financeiroCharge,
    masterEvent: { findFirst: async () => null, create: async ({ data }: any) => data },
    $transaction: async (fn: any) => fn({ financeiroCharge }),
  };

  const mpClient: any = {
    createPayment: async (_token: string, payload: any, idempotencyKey: string) => {
      paymentCalls.push({ payload, idempotencyKey });
      // Dedup REAL do MP: mesma X-Idempotency-Key na MESMA conta devolve o MESMO pagamento.
      const existing = mpPayments.get(idempotencyKey);
      if (existing) return existing;
      const payment = {
        id: `pay-${mpPayments.size + 1}`,
        status: 'approved',
        transaction_amount: payload.transaction_amount,
        currency_id: 'BRL',
        external_reference: payload.external_reference,
      };
      mpPayments.set(idempotencyKey, payment);
      return payment;
    },
  };

  const wallet: any = {
    grant: async (companyId: number, amount: number, opts: any) => {
      const owner = usageKeyOwner.get(opts.usageKey);
      if (owner !== undefined && owner !== companyId) {
        throw new Error('grant: usageKey já registrada para outra empresa');
      }
      if (owner === companyId) return { entryId: 'dup', amount, alreadyProcessed: true };
      usageKeyOwner.set(opts.usageKey, companyId);
      balances.set(companyId, (balances.get(companyId) || 0) + amount);
      return { entryId: `e-${usageKeyOwner.size}`, amount, alreadyProcessed: false };
    },
    getBalance: async (companyId: number) => balances.get(companyId) || 0,
  };

  const packConfig: any = { listAvailable: () => [PACK] };
  const financeiroService: any = {
    insertBillingLedgerEntry: async (input: any) => {
      ledgerEntries.push(input);
      return `ledger-${ledgerEntries.length}`;
    },
  };

  const service = new CreditRechargeService(prisma, mpClient, wallet, packConfig, financeiroService);
  (service as any).resolveMpAccessToken = async () => 'MASTER-SHARED-TOKEN';
  return { service, paymentCalls, balances, charges };
}

test('P0.4 — duas empresas com a MESMA idempotencyKey na conta MP do master: keys escopadas, zero crédito cruzado', async () => {
  const { service, paymentCalls, balances, charges } = buildTwoCompanyHarness();
  const resA = await service.rechargeWithCard(DONO, BASE_INPUT); // company 7
  const resB = await service.rechargeWithCard({ ...DONO, companyId: 8 }, BASE_INPUT); // company 8, MESMA key do front

  assert.equal(resA.ok, true);
  assert.equal(resB.ok, true);
  if (resA.ok && resB.ok) {
    assert.notEqual(resA.paymentId, resB.paymentId); // MP NÃO dedupou entre empresas
    assert.equal(resA.credited, 120);
    assert.equal(resB.credited, 120);
  }
  assert.equal(paymentCalls[0].idempotencyKey, 'credrech-7-intent-uuid-0001');
  assert.equal(paymentCalls[1].idempotencyKey, 'credrech-8-intent-uuid-0001');
  assert.equal(balances.get(7), 120); // cada carteira recebeu o SEU crédito
  assert.equal(balances.get(8), 120);
  assert.equal(charges.length, 2); // cada empresa com a SUA cobrança fiscal
});
