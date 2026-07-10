import test from 'node:test';
import assert from 'node:assert/strict';

import { FinanceiroService } from './financeiro.service';

// P0.3 (PR10072026 W2) — estorno/chargeback de RECARGA DE CRÉDITO compensa a carteira.
// A prova de DINHEIRO fino (idempotência sob corrida, FIFO, nunca-negativo) mora em
// credit-wallet.service.test.ts (reversePurchase). Aqui provamos a ORQUESTRAÇÃO do
// financeiro: mapeamento charged_back/in_mediation, gatilhos (webhook × estorno manual),
// derivação das usageKeys (live × mock), shortfall → MasterEvent com a dívida, e que a
// compensação é CONTIDA (falha não derruba o sync/refund que já aconteceu).

// A cadeia de imports puxa dotenv (via PrismaService) e carrega o .env DEV do backend
// (PAYMENTS_PROVIDER=mock + NODE_ENV=development). Forçamos live pra prova ser determinística
// — o fake do MP client cobre o gateway (mesmo padrão de credit-recharge.service.test.ts).
process.env.PAYMENTS_PROVIDER = 'mercadopago';

type ChargeRow = Record<string, any>;

function buildHarness(opts?: {
  providerStatus?: string;
  charge?: Partial<ChargeRow>;
  lot?: { id: string; amount: number; usageKey: string } | null;
  walletResult?: { reversed: number; shortfall: number };
  walletThrows?: boolean;
}) {
  const charge: ChargeRow = {
    id: 'ch-1',
    companyId: 7,
    amount: 79.9,
    refundAmount: 0,
    description: 'Recarga de créditos — Starter (120 créditos)',
    paymentMethod: 'CARD',
    billingCycle: 'MONTHLY',
    status: 'approved',
    lifecycle: 'paid',
    externalReference: 'hbx-credit-recharge-7-intent-1',
    mpPaymentId: 'pay-9',
    mpMerchantOrderId: null,
    ledgerEntryId: null, // sem linha fiscal no fake -> updateLedgerEntryStatus vira no-op
    paidAt: new Date(),
    refundedAt: null,
    createdByUserId: 9,
    ...(opts?.charge || {}),
  };

  const lot =
    opts?.lot === null
      ? null
      : opts?.lot || { id: 'lot-1', amount: 120, usageKey: 'mp:pay-9' };

  const masterEvents: any[] = [];
  const reversalCalls: any[] = [];
  const seenReversalKeys = new Set<string>();

  const prisma: any = {
    financeiroCharge: {
      findFirst: async ({ where }: any) => {
        if (where.mpPaymentId && String(where.mpPaymentId) !== String(charge.mpPaymentId || '')) return null;
        if (where.id && where.id !== charge.id) return null;
        if (where.companyId && Number(where.companyId) !== Number(charge.companyId)) return null;
        return { ...charge };
      },
      update: async ({ data }: any) => {
        Object.assign(charge, data);
        return { ...charge };
      },
    },
    creditLedgerEntry: {
      findFirst: async ({ where }: any) => {
        if (!lot) return null;
        if (where.kind !== 'recharge') return null;
        if (Number(where.companyId) !== Number(charge.companyId)) return null;
        if (where.usageKey !== lot.usageKey) return null;
        return { ...lot, companyId: charge.companyId, kind: 'recharge' };
      },
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

  const mpClient: any = {
    refundPayment: async () => ({ id: 'refund-1', status: 'approved' }),
    getPayment: async () => ({
      id: charge.mpPaymentId,
      status: opts?.providerStatus || 'charged_back',
      transaction_amount: charge.amount,
      transaction_amount_refunded: opts?.providerStatus === 'partially_refunded' ? 10 : 0,
      external_reference: charge.externalReference,
      metadata: { company_id: charge.companyId },
      date_approved: null,
      date_last_updated: new Date().toISOString(),
    }),
  };

  const wallet: any = {
    reversePurchase: async (companyId: number, o: any) => {
      reversalCalls.push({ companyId, ...o });
      if (opts?.walletThrows) throw new Error('wallet indisponível');
      const alreadyProcessed = seenReversalKeys.has(o.usageKey);
      seenReversalKeys.add(o.usageKey);
      const reversed = opts?.walletResult?.reversed ?? o.amount;
      const shortfall = opts?.walletResult?.shortfall ?? Math.max(0, o.amount - reversed);
      return { reversed, requested: o.amount, shortfall, balanceAfter: 0, alreadyProcessed };
    },
  };

  const service = new FinanceiroService(prisma, mpClient, {} as any, {} as any, wallet);
  // Contexto do MP (runtime-schema do master via raw SQL) não pertence a esta prova — patch.
  (service as any).resolveFinanceContext = async () => ({ accessToken: 'TEST-TOKEN' });

  return { service, charge, masterEvents, reversalCalls };
}

// ─── 1. Mapeamento de status do provedor ───────────────────────────────────────────────────────

test('normalizeProviderPaymentStatus: charged_back e in_mediation viram estados observáveis; legados inalterados', () => {
  const { service } = buildHarness();
  const normalize = (v: unknown) => (service as any).normalizeProviderPaymentStatus(v);

  assert.equal(normalize('charged_back'), 'charged_back');
  assert.equal(normalize('in_mediation'), 'in_mediation');
  // Regressão: os mapeamentos antigos não mudam.
  assert.equal(normalize('approved'), 'approved');
  assert.equal(normalize('accredited'), 'approved');
  assert.equal(normalize('refunded'), 'refunded');
  assert.equal(normalize('partially_refunded'), 'partially_refunded');
  assert.equal(normalize('rejected'), 'failed');
  assert.equal(normalize('canceled'), 'cancelled');
  assert.equal(normalize('cancelled'), 'cancelled');
  assert.equal(normalize('qualquer-coisa'), 'pending');
  assert.equal(normalize(null), 'pending');
});

test('normalizeLifecycle: charged_back mata a cobrança; in_mediation fica em voo; refunded segue paid', () => {
  const { service } = buildHarness();
  const lifecycle = (v: string) => (service as any).normalizeLifecycle(v);

  assert.equal(lifecycle('charged_back'), 'cancelled');
  assert.equal(lifecycle('in_mediation'), 'in_progress');
  assert.equal(lifecycle('refunded'), 'paid');
  assert.equal(lifecycle('approved'), 'paid');
  assert.equal(lifecycle('failed'), 'cancelled');
});

test('ledgerStatusForProviderStatus: chargeback vira REFUNDED no ledger fiscal (bucket que o fiscal entende)', () => {
  const { service } = buildHarness();
  const map = (v: string) => (service as any).ledgerStatusForProviderStatus(v);

  assert.equal(map('charged_back'), 'refunded');
  assert.equal(map('in_mediation'), 'pending');
  assert.equal(map('approved'), 'approved');
  assert.equal(map('refunded'), 'refunded');
});

// ─── 2. Webhook: chargeback de recarga compensa a carteira ─────────────────────────────────────

test('webhook charged_back de recarga: charge morre, carteira compensa 1× (duplicado não dobra), chargeback sinaliza', async () => {
  const { service, charge, masterEvents, reversalCalls } = buildHarness({ providerStatus: 'charged_back' });

  const first = await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });
  assert.equal(first.updated, true);
  assert.equal(first.status, 'charged_back');
  assert.equal(charge.status, 'charged_back');
  assert.equal(charge.lifecycle, 'cancelled');

  // Compensação com a identidade do pagamento e o lote da recarga como preferido.
  assert.equal(reversalCalls.length, 1);
  assert.equal(reversalCalls[0].companyId, 7);
  assert.equal(reversalCalls[0].amount, 120); // créditos do PACK (lote), não o valor em R$
  assert.equal(reversalCalls[0].usageKey, 'mp-reversal:pay-9');
  assert.equal(reversalCalls[0].preferredLotId, 'lot-1');

  // Chargeback agora SINALIZA (evento do master).
  assert.equal(masterEvents.filter((e) => e.type === 'financeiro.chargeback').length, 1);

  // Webhook duplicado: reprocessa, mas a carteira dedupa (alreadyProcessed) e o evento
  // não metralha (dedupKey + mesmo state).
  const second = await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });
  assert.equal(second.status, 'charged_back');
  assert.equal(reversalCalls.length, 2); // chamada acontece; o débito real dedupa no ledger
  assert.equal(reversalCalls[1].usageKey, 'mp-reversal:pay-9'); // MESMA chave = mesmo débito
  assert.equal(masterEvents.filter((e) => e.type === 'financeiro.chargeback').length, 1);
});

test('webhook charged_back: shortfall (crédito já consumido) vira MasterEvent com dívida em créditos e R$', async () => {
  const { service, masterEvents } = buildHarness({
    providerStatus: 'charged_back',
    walletResult: { reversed: 40, shortfall: 80 },
  });

  await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });

  const shortfallEvents = masterEvents.filter((e) => e.type === 'credit.recharge_reversal_shortfall');
  assert.equal(shortfallEvents.length, 1);
  assert.equal(shortfallEvents[0].severity, 'action_required');
  const payload = JSON.parse(shortfallEvents[0].payloadJson);
  assert.equal(payload.debtCredits, 80);
  assert.equal(payload.packCredits, 120);
  // Dívida em R$ proporcional ao pack: 79.90 × 80/120 = 53.27.
  assert.equal(payload.debtValue, 53.27);
});

test('webhook refunded de cobrança NÃO-recarga: carteira não é tocada', async () => {
  const { service, reversalCalls } = buildHarness({
    providerStatus: 'refunded',
    charge: { externalReference: 'hbx-subpay-999' },
  });

  await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });
  assert.equal(reversalCalls.length, 0);
});

test('webhook charged_back de recarga SEM lote (grant nunca entrou): não debita, alerta lot_not_found', async () => {
  const { service, masterEvents, reversalCalls } = buildHarness({ providerStatus: 'charged_back', lot: null });

  await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });

  assert.equal(reversalCalls.length, 0);
  const events = masterEvents.filter((e) => e.type === 'credit.recharge_reversal');
  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0].payloadJson).state, 'lot_not_found');
});

test('webhook partially_refunded de recarga: NÃO compensa automático, mas alerta o master', async () => {
  const { service, masterEvents, reversalCalls } = buildHarness({ providerStatus: 'partially_refunded' });

  await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });

  assert.equal(reversalCalls.length, 0);
  const events = masterEvents.filter((e) => e.type === 'credit.recharge_reversal');
  assert.equal(events.length, 1);
  assert.match(JSON.parse(events[0].payloadJson).state, /^partial_refund_no_compensation/);
});

test('compensação CONTIDA: carteira indisponível não derruba o sync — vira MasterEvent action_required', async () => {
  const { service, masterEvents } = buildHarness({ providerStatus: 'charged_back', walletThrows: true });

  const result = await (service as any).syncChargeFromProvider(7, 'pay-9', { source: 'webhook' });
  assert.equal(result.updated, true); // sync do charge completou

  const failed = masterEvents.filter(
    (e) => e.type === 'credit.recharge_reversal' && JSON.parse(e.payloadJson).state === 'compensation_failed',
  );
  assert.equal(failed.length, 1);
  assert.equal(failed[0].severity, 'action_required');
});

// ─── 3. Estorno manual do master compensa igual (inclusive recarga MOCK) ───────────────────────

test('refundChargeByMaster em recarga MOCK (sem mpPaymentId): compensa com identidade mock-<idempotencyKey>', async () => {
  const { service, charge, reversalCalls } = buildHarness({
    charge: { mpPaymentId: null },
    lot: { id: 'lot-9', amount: 120, usageKey: 'mp:mock-intent-1' },
  });

  const result = await service.refundChargeByMaster(
    { isSystemMaster: true, id: 1 },
    7,
    'ch-1',
    { reason: 'cliente desistiu' },
  );

  assert.equal(result.ok, true);
  assert.equal(result.fullyRefunded, true);
  assert.equal(charge.status, 'refunded');

  assert.equal(reversalCalls.length, 1);
  assert.equal(reversalCalls[0].usageKey, 'mp-reversal:mock-intent-1');
  assert.equal(reversalCalls[0].amount, 120);
  assert.equal(reversalCalls[0].preferredLotId, 'lot-9');
  assert.equal(reversalCalls[0].userId, 1); // trilha: quem estornou
});

test('refund PARCIAL do master em recarga: não compensa automático, alerta o master', async () => {
  const { service, masterEvents, reversalCalls } = buildHarness({});

  const result = await service.refundChargeByMaster(
    { isSystemMaster: true, id: 1 },
    7,
    'ch-1',
    { amount: 10, reason: 'parcial' },
  );

  assert.equal(result.ok, true);
  assert.equal(result.fullyRefunded, false);
  assert.equal(reversalCalls.length, 0);
  const events = masterEvents.filter((e) => e.type === 'credit.recharge_reversal');
  assert.equal(events.length, 1);
  assert.match(JSON.parse(events[0].payloadJson).state, /^partial_refund_no_compensation/);
});
