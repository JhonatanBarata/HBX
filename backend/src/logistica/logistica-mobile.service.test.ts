import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaMobileService } from './logistica-mobile.service';

test('rota móvel expõe instrução de recebimento sem inventar campos monetários', async () => {
  const prisma: any = {
    customerProfile: {
      findMany: async () => [{ id: 'customer-1', formaPagamento: 'aberto', metodoPadrao: null }],
    },
    logisticaConfig: {
      findUnique: async () => ({
        moduloFinanceiroAtivo: true,
        pixChave: 'financeiro@hbx.test',
        pixNome: 'HBX TESTE',
        pixCidade: 'SAO PAULO',
      }),
    },
  };
  const logistica: any = {
    listRota: async () => ({
      date: '2026-07-17',
      items: [{ id: 'delivery-1', status: 'agendada', cliente: { id: 'customer-1', nome: 'Cliente' } }],
    }),
  };
  const service = new LogisticaMobileService(prisma, logistica, {} as any, {} as any);
  const result: any = await service.getRoute(7, '2026-07-17', { id: 42, companyId: 7, role: 'USER' });

  assert.equal(result.moduloFinanceiroAtivo, true);
  assert.deepEqual(result.pix, {
    chave: 'financeiro@hbx.test',
    nome: 'HBX TESTE',
    cidade: 'SAO PAULO',
  });
  assert.equal(result.items[0].cliente.formaPagamento, 'aberto');
  assert.equal(result.items[0].cliente.metodoPadrao, null);
  assert.equal('valor' in result.items[0], false);
  assert.equal('saldoAberto' in result.items[0].cliente, false);
  assert.equal('limiteFiado' in result.items[0].cliente, false);
});

test('materialização móvel separa data operacional das datas recorrentes e atribui o motorista', async () => {
  let materializeInput: any = null;
  const occurrences: any = {
    materialize: async (companyId: number, input: any) => {
      assert.equal(companyId, 7);
      materializeInput = input;
      return { date: input.operationalDate, sourceDates: input.sourceDates, deliveryIds: ['delivery-1'] };
    },
  };
  const operacao: any = {
    whereForActor: async () => ({ entregadorId: 42 }),
  };
  const service = new LogisticaMobileService({} as any, {} as any, occurrences, operacao);

  const result: any = await service.materialize(
    7,
    { operationalDate: '2026-07-17', sourceDates: ['2026-07-20'] },
    { id: 42, companyId: 7, role: 'USER' },
  );

  assert.deepEqual(materializeInput, {
    operationalDate: '2026-07-17',
    sourceDates: ['2026-07-20'],
    driverUserId: 42,
    actorUserId: 42,
  });
  assert.deepEqual(result.deliveryIds, ['delivery-1']);
});
