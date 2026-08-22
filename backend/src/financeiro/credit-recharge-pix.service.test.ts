import test from 'node:test';
import assert from 'node:assert/strict';

import { CreditRechargeService } from './credit-recharge.service';

// PIX (PR22082026-CLIENTE-ME-ACHA) — a prova do dinheiro da recarga em 2 fases.
// Mesmo harness da prova do cartão (credit-recharge.service.test.ts): fakes mínimos,
// o ledger fino já é provado em credit-wallet.service.test.ts. Aqui provamos a
// ORQUESTRAÇÃO: QR nasce PENDENTE sem crédito; o poll que encontra "aprovado" credita
// UMA vez + grava receita UMA vez; poll/webhook repetidos são idempotentes; cancelado
// não credita; LEI DO VENDEDOR (gerente 403 neutro); charge de outra empresa não
// assenta; resposta divergente do MP nunca vira crédito.

process.env.HBX_CREDITS_ENABLED = 'true';
process.env.PAYMENTS_PROVIDER = 'mercadopago';
process.env.PUBLIC_API_BASE_URL = 'https://api.test.local';

const DONO = { id: 9, email: 'dono@x.com', role: 'USERMASTER', isSystemMaster: false, canViewBilling: true, companyId: 7 };
const GERENTE = { ...DONO, role: 'ADMIN', canViewBilling: false };
const OUTRO_DONO = { ...DONO, id: 11, companyId: 8 };

const PACK = { key: 'starter', title: 'Starter', credits: 120, price: 79.9, defaultExpiryDays: 90, badge: null, recommended: false, status: 'available' };

function buildService(opts?: {
  mpStatus?: string; // status devolvido pelo getPayment
  mpCreateStatus?: string; // status devolvido pelo createPayment (pending por padrão)
  mpAmount?: number;
  mpReference?: string;
  mpCompanyId?: number;
  createThrows?: boolean;
}) {
  const grants: any[] = [];
  const charges: any[] = [];
  const paymentCalls: any[] = [];
  const getPaymentCalls: string[] = [];
  const masterEvents: any[] = [];
  const ledgerEntries: any[] = [];
  const grantedKeys = new Set<string>();
  let balance = 0;

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
    company: {
      findUnique: async ({ where }: any) => ({ id: where.id, taxDocument: '11222333000181', contactEmail: 'empresa@x.com' }),
    },
    financeiroCharge,
    masterEvent: {
      findFirst: async () => null,
      create: async ({ data }: any) => { masterEvents.push(data); return data; },
    },
    $transaction: async (fn: any) => fn({ financeiroCharge, $executeRaw: async () => 1 }),
  };

  const mpClient: any = {
    createPayment: async (_token: string, payload: any, idempotencyKey: string) => {
      paymentCalls.push({ payload, idempotencyKey });
      if (opts?.createThrows) throw new Error('gateway indisponível');
      return {
        id: 'pix-555',
        status: opts?.mpCreateStatus || 'pending',
        transaction_amount: payload.transaction_amount,
        currency_id: 'BRL',
        external_reference: payload.external_reference,
        date_of_expiration: payload.date_of_expiration,
        point_of_interaction: {
          transaction_data: { qr_code: 'COPIA-E-COLA', qr_code_base64: 'QkFTRTY0', ticket_url: 'https://mp/ticket' },
        },
      };
    },
    getPayment: async (_token: string, paymentId: string) => {
      getPaymentCalls.push(paymentId);
      const charge = charges.find((c) => c.mpPaymentId === paymentId);
      return {
        id: paymentId,
        status: opts?.mpStatus || 'approved',
        transaction_amount: opts?.mpAmount ?? charge?.amount,
        currency_id: 'BRL',
        external_reference: opts?.mpReference ?? charge?.externalReference,
        date_approved: '2026-08-22T12:00:00.000Z',
        metadata: opts?.mpCompanyId ? { company_id: opts.mpCompanyId } : {},
      };
    },
  };

  const wallet: any = {
    grant: async (_companyId: number, amount: number, o: any) => {
      grants.push({ amount, opts: o });
      if (o.usageKey && grantedKeys.has(o.usageKey)) return { entryId: 'e-dup', amount, alreadyProcessed: true };
      if (o.usageKey) grantedKeys.add(o.usageKey);
      balance += amount;
      return { entryId: `e-${grants.length}`, amount, alreadyProcessed: false };
    },
    getBalance: async () => balance,
  };

  const packConfig: any = { listAvailable: () => [PACK] };
  const financeiroService: any = {
    insertBillingLedgerEntry: async (input: any) => { ledgerEntries.push(input); return `ledger-${ledgerEntries.length}`; },
  };

  const service = new CreditRechargeService(prisma, mpClient, wallet, packConfig, financeiroService);
  (service as any).resolveMpAccessToken = async () => 'TEST-ACCESS-TOKEN';
  return { service, grants, charges, paymentCalls, getPaymentCalls, ledgerEntries, masterEvents };
}

const INPUT = { packKey: 'starter', idempotencyKey: 'pix-intent-0001', taxDocument: null };

test('fase 1: o QR nasce PENDENTE, com a cobrança gravada e ZERO crédito', async () => {
  const { service, grants, charges, paymentCalls, ledgerEntries } = buildService();
  const res = await service.createPixRecharge(DONO, INPUT);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.status, 'pending');
  assert.equal(res.paymentId, 'pix-555');
  assert.equal(res.qrCode, 'COPIA-E-COLA');
  assert.equal(res.qrCodeBase64, 'QkFTRTY0');
  assert.equal(res.credits, 120);
  assert.equal(res.amount, 79.9);
  assert.ok(res.expiresAt);
  assert.equal(grants.length, 0, 'Pix pendente NUNCA credita');
  assert.equal(ledgerEntries.length, 0, 'receita só quando aprovar');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].status, 'pending');
  assert.equal(charges[0].paymentMethod, 'PIX');
  assert.equal(charges[0].mpPaymentId, 'pix-555');
  assert.equal(charges[0].pixQrCode, 'COPIA-E-COLA');
  // payload do MP: pix, referência escopada, webhook do financeiro, idempotência por empresa.
  assert.equal(paymentCalls[0].payload.payment_method_id, 'pix');
  assert.equal(paymentCalls[0].payload.external_reference, 'hbx-credit-recharge-7-pix-intent-0001');
  assert.match(paymentCalls[0].payload.notification_url, /\/webhooks\/mercadopago\/financeiro\?company_id=7$/);
  assert.equal(paymentCalls[0].idempotencyKey, 'credrechpix-7-pix-intent-0001');
  assert.match(String(paymentCalls[0].payload.date_of_expiration), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
});

test('fase 1 repetida (mesma intenção) reabre o MESMO QR sem criar 2º pagamento', async () => {
  const { service, paymentCalls, charges } = buildService();
  const a = await service.createPixRecharge(DONO, INPUT);
  const b = await service.createPixRecharge(DONO, INPUT);
  assert.equal(paymentCalls.length, 1);
  assert.equal(charges.length, 1);
  assert.deepEqual(b, a);
});

test('fase 2 (poll): aprovado credita 1x, grava receita 1x e paga a charge; poll de novo é idempotente', async () => {
  const { service, grants, charges, ledgerEntries } = buildService({ mpStatus: 'approved' });
  const created = await service.createPixRecharge(DONO, INPUT);
  assert.equal(created.ok, true);

  const first = await service.getPixRechargeStatus(DONO, 'pix-555');
  assert.equal(first.status, 'approved');
  assert.equal(first.credited, 120);
  assert.equal(first.balanceAfter, 120);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].opts.usageKey, 'mp:pix-555');
  assert.equal(grants[0].opts.kind, 'recharge');
  assert.equal(grants[0].opts.grantType, 'paid');
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0].paymentMethod, 'PIX');
  assert.equal(ledgerEntries[0].status, 'APPROVED');
  assert.equal(ledgerEntries[0].amount, 79.9);
  assert.equal(charges[0].status, 'approved');
  assert.equal(charges[0].lifecycle, 'paid');
  assert.equal(charges[0].ledgerEntryId, 'ledger-1');

  const again = await service.getPixRechargeStatus(DONO, 'pix-555');
  assert.equal(again.status, 'approved');
  assert.equal(again.credited, 0, 'já aprovado: relê, não recredita');
  assert.equal(grants.length, 1);
  assert.equal(ledgerEntries.length, 1);
});

test('fase 2 (webhook): assenta a recarga pendente; webhook duplicado não dobra nada', async () => {
  const { service, grants, ledgerEntries, getPaymentCalls } = buildService({ mpStatus: 'approved' });
  await service.createPixRecharge(DONO, INPUT);

  const r1 = await service.settleIfCreditRecharge('pix-555');
  assert.deepEqual(r1, { handled: true, status: 'approved' });
  assert.equal(grants.length, 1);
  assert.equal(ledgerEntries.length, 1);
  assert.equal(getPaymentCalls.length, 1);

  const r2 = await service.settleIfCreditRecharge('pix-555');
  assert.equal(r2.handled, true);
  assert.equal(r2.status, 'approved');
  assert.equal(grants.length, 1, 'webhook repetido não credita de novo');
  assert.equal(ledgerEntries.length, 1);
  assert.equal(getPaymentCalls.length, 1, 'charge já paga nem consulta o MP');
});

test('webhook de pagamento que NÃO é recarga Pix: handled=false e nada muda', async () => {
  const { service, grants } = buildService();
  const r = await service.settleIfCreditRecharge('pagamento-de-outra-coisa');
  assert.equal(r.handled, false);
  assert.equal(grants.length, 0);
});

test('poll com MP ainda pendente: continua pendente, sem crédito', async () => {
  const { service, grants, charges } = buildService({ mpStatus: 'pending' });
  await service.createPixRecharge(DONO, INPUT);
  const r = await service.getPixRechargeStatus(DONO, 'pix-555');
  assert.equal(r.status, 'pending');
  assert.equal(grants.length, 0);
  assert.equal(charges[0].status, 'pending');
});

test('cancelado/expirado no MP: charge vira cancelled e NUNCA credita; gerar de novo pede intenção nova', async () => {
  const { service, grants, charges, ledgerEntries } = buildService({ mpStatus: 'cancelled' });
  await service.createPixRecharge(DONO, INPUT);
  const r = await service.getPixRechargeStatus(DONO, 'pix-555');
  assert.equal(r.status, 'cancelled');
  assert.equal(grants.length, 0);
  assert.equal(ledgerEntries.length, 0);
  assert.equal(charges[0].status, 'cancelled');
  const again = await service.createPixRecharge(DONO, INPUT);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, 'CHARGE_FAILED');
});

test('LEI DO VENDEDOR: gerente (canViewBilling=false) recebe 403 NEUTRO nas duas fases', async () => {
  const { service, paymentCalls } = buildService();
  await assert.rejects(() => service.createPixRecharge(GERENTE, INPUT), (err: any) => {
    assert.equal(err?.status ?? err?.getStatus?.(), 403);
    assert.doesNotMatch(String(err?.message || ''), /R\$|pacote|preço/i);
    return true;
  });
  await assert.rejects(() => service.getPixRechargeStatus(GERENTE, 'pix-555'), (err: any) => err?.status === 403);
  assert.equal(paymentCalls.length, 0);
});

test('charge de OUTRA empresa não aparece no poll do dono errado (404), e nunca assenta pra ele', async () => {
  const { service, grants } = buildService({ mpStatus: 'approved' });
  await service.createPixRecharge(DONO, INPUT); // empresa 7
  await assert.rejects(() => service.getPixRechargeStatus(OUTRO_DONO, 'pix-555'), (err: any) => err?.status === 404);
  assert.equal(grants.length, 0);
});

test('P0.4: MP aprovado com VALOR divergente não credita, alerta o master e falha fechado', async () => {
  const { service, grants, masterEvents } = buildService({ mpStatus: 'approved', mpAmount: 1.0 });
  await service.createPixRecharge(DONO, INPUT);
  await assert.rejects(() => service.getPixRechargeStatus(DONO, 'pix-555'), (err: any) => err?.status === 502);
  assert.equal(grants.length, 0);
  assert.equal(masterEvents.length, 1);
  assert.equal(masterEvents[0].type, 'credit.recharge_divergence');
});

test('P0.4: MP aprovado apontando OUTRO tenant no metadata não credita', async () => {
  const { service, grants } = buildService({ mpStatus: 'approved', mpCompanyId: 99 });
  await service.createPixRecharge(DONO, INPUT);
  await assert.rejects(() => service.getPixRechargeStatus(DONO, 'pix-555'), (err: any) => err?.status === 502);
  assert.equal(grants.length, 0);
});

test('gateway fora do ar na fase 1: devolve CHARGE_FAILED, sem charge e sem crédito', async () => {
  const { service, charges, grants } = buildService({ createThrows: true });
  const res = await service.createPixRecharge(DONO, INPUT);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'CHARGE_FAILED');
  assert.equal(charges.length, 0);
  assert.equal(grants.length, 0);
});
