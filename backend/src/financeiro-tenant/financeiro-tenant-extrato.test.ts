import test from 'node:test';
import assert from 'node:assert/strict';

import { FinanceiroTenantService } from './financeiro-tenant.service';

/**
 * EXTRATO DETALHADO (28/07) — o extrato do /financeiro tem que devolver TUDO o
 * que a cobrança guarda (datas com hora, ciclo, forma, quem lançou, referências)
 * + as ENTREGAS que a compõem (avulsa = a própria; fatura mensal = as somadas,
 * que ficam em providerPayload.entregaIds).
 *
 * Prisma é dublê: o teste prova o MAPEAMENTO e o LOTE (nada de N+1) sem banco.
 */

const COMPANY = 7;

const CHARGE_AVULSA = {
  id: 'chg_avulsa',
  amount: 25.5,
  currency: 'BRL',
  description: 'Entrega — Padaria do Zé',
  status: 'approved',
  lifecycle: 'paid',
  sourceModule: 'logistica_entrega',
  dueDate: new Date('2026-07-20T03:00:00.000Z'),
  paidAt: new Date('2026-07-18T14:32:00.000Z'),
  createdAt: new Date('2026-07-18T14:30:00.000Z'),
  updatedAt: new Date('2026-07-18T14:32:00.000Z'),
  billingCycle: 'ONCE',
  paymentMethod: 'MANUAL',
  competence: null,
  externalReference: null,
  entregaId: 'ent_1',
  ledgerEntryId: null,
  refundedAt: null,
  refundAmount: 0,
  mpPaymentId: null,
  mpPreferenceId: null,
  mpMerchantOrderId: null,
  paymentUrl: null,
  pixTicketUrl: null,
  lastWebhookAt: null,
  createdByUserId: 42,
  providerPayload: JSON.stringify({
    source: 'logistica_entrega',
    entregaId: 'ent_1',
    forma: 'na_hora',
    pagoNaHora: true,
    receiptMethod: 'pix',
  }),
};

const CHARGE_FATURA = {
  ...CHARGE_AVULSA,
  id: 'chg_fatura',
  amount: 120,
  description: 'Fatura mensal — Padaria do Zé (jul/2026)',
  status: 'pending',
  lifecycle: 'in_progress',
  sourceModule: 'logistica_fechamento',
  paidAt: null,
  billingCycle: 'MONTHLY',
  entregaId: null,
  createdByUserId: null,
  providerPayload: JSON.stringify({
    source: 'logistica_fechamento',
    mesRef: 'jul/2026',
    entregaIds: ['ent_1', 'ent_2', 'ent_sumida'],
  }),
};

const ENTREGAS = [
  {
    id: 'ent_1',
    status: 'entregue',
    quantidade: 2,
    valor: 25.5,
    scheduledAt: new Date('2026-07-18T12:00:00.000Z'),
    deliveredAt: new Date('2026-07-18T14:29:00.000Z'),
    recebidoNaHora: true,
    receiptMethod: 'pix',
    cobrancaOutcome: 'lancada',
    notes: 'Deixar na portaria',
    product: { name: 'Galão 20L' },
    entregador: { name: 'Abner', username: 'abner' },
    local: { apelido: 'Loja', endereco: 'Rua A', numero: '10', bairro: 'Centro' },
  },
  {
    id: 'ent_2',
    status: 'entregue',
    quantidade: 1,
    valor: 12,
    scheduledAt: new Date('2026-07-19T12:00:00.000Z'),
    deliveredAt: null,
    recebidoNaHora: false,
    receiptMethod: null,
    cobrancaOutcome: 'aguardando_fechamento',
    notes: null,
    product: null,
    entregador: null,
    local: null,
  },
];

function buildService() {
  const chamadas = { entregaFindMany: 0, userFindMany: 0, idsPedidos: [] as string[] };
  const prisma = {
    customerProfile: {
      findFirst: async () => ({ id: 'cli_1', name: 'Padaria do Zé' }),
    },
    financeiroCharge: {
      findMany: async () => [CHARGE_AVULSA, CHARGE_FATURA],
    },
    user: {
      findMany: async () => {
        chamadas.userFindMany += 1;
        return [{ id: 42, name: 'Jhonatan', username: 'jhonatan' }];
      },
    },
    entrega: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        chamadas.entregaFindMany += 1;
        chamadas.idsPedidos = args.where.id.in;
        return ENTREGAS.filter((e) => args.where.id.in.includes(e.id));
      },
    },
  };
  const service = new FinanceiroTenantService(prisma as never, {} as never);
  return { service, chamadas };
}

test('extrato devolve TODOS os campos salvos da cobrança + payload decodificado', async () => {
  const { service } = buildService();
  const res = await service.extratoCliente(COMPANY, 'cli_1');
  assert.ok(res);

  const avulsa = res.charges.find((c) => c.id === 'chg_avulsa');
  assert.ok(avulsa);
  assert.equal(avulsa.billingCycle, 'ONCE');
  assert.equal(avulsa.paymentMethod, 'MANUAL');
  assert.equal(avulsa.entregaId, 'ent_1');
  assert.equal(avulsa.refundAmount, 0);
  assert.equal(avulsa.criadoPorUserId, 42);
  assert.equal(avulsa.criadoPor, 'Jhonatan', 'quem lançou vem com NOME, não só id');
  assert.equal(avulsa.updatedAt, '2026-07-18T14:32:00.000Z');
  assert.equal(avulsa.paidAt, '2026-07-18T14:32:00.000Z');
  assert.deepEqual(avulsa.detalhes, {
    source: 'logistica_entrega',
    entregaId: 'ent_1',
    forma: 'na_hora',
    pagoNaHora: true,
    receiptMethod: 'pix',
  });
});

test('cobrança avulsa mostra a entrega dela; fatura mensal mostra as entregas somadas', async () => {
  const { service, chamadas } = buildService();
  const res = await service.extratoCliente(COMPANY, 'cli_1');
  assert.ok(res);

  const avulsa = res.charges.find((c) => c.id === 'chg_avulsa');
  assert.ok(avulsa);
  assert.equal(avulsa.entregasTotal, 1);
  assert.equal(avulsa.entregas.length, 1);
  assert.equal(avulsa.entregas[0].produto, 'Galão 20L');
  assert.equal(avulsa.entregas[0].entregador, 'Abner');
  assert.equal(avulsa.entregas[0].local, 'Loja — Rua A, 10 — Centro');
  assert.equal(avulsa.entregas[0].entregue, true);
  assert.equal(avulsa.entregas[0].data, '2026-07-18T14:29:00.000Z', 'data real da entrega');

  const fatura = res.charges.find((c) => c.id === 'chg_fatura');
  assert.ok(fatura);
  assert.equal(fatura.entregasTotal, 3, 'a fatura referencia 3 entregas');
  assert.equal(fatura.entregas.length, 2, 'a apagada não quebra o extrato — só não aparece');
  assert.equal(fatura.entregas[1].data, '2026-07-19T12:00:00.000Z', 'sem entrega real usa a agendada');
  assert.equal(fatura.entregas[1].entregue, false);

  // LOTE: uma consulta só de entrega e uma de usuário para o extrato inteiro.
  assert.equal(chamadas.entregaFindMany, 1);
  assert.equal(chamadas.userFindMany, 1);
  assert.deepEqual(chamadas.idsPedidos, ['ent_1', 'ent_2', 'ent_sumida']);
});

test('providerPayload corrompido não derruba o extrato', async () => {
  const prisma = {
    customerProfile: { findFirst: async () => ({ id: 'cli_1', name: 'X' }) },
    financeiroCharge: {
      findMany: async () => [{ ...CHARGE_AVULSA, providerPayload: '{isso não é json', createdByUserId: null }],
    },
    user: { findMany: async () => [] },
    entrega: { findMany: async () => [] },
  };
  const svc = new FinanceiroTenantService(prisma as never, {} as never);
  const res = await svc.extratoCliente(COMPANY, 'cli_1');
  assert.ok(res);
  assert.equal(res.charges[0].detalhes, null);
  assert.equal(res.charges[0].entregasTotal, 1, 'ainda enxerga a entrega da coluna');
});
