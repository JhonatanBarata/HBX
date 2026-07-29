import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaPasseioService } from './logistica-passeio.service';

/**
 * MODO PASSEIO (29/07) — o contrato comercial em 6 provas: gate fail-closed do
 * funcionário, admin sempre passa, free não toca a carteira, débito com
 * usageKey idempotente por tourId, e 402+estorno no saldo insuficiente.
 */
function makeService(opts?: {
  passeioEquipe?: boolean;
  configRow?: boolean;
  definition?: { key: string; label: string; mode: 'free' | 'debit'; cost: number } | null;
  debitResult?: { debited: number; partial: boolean };
}) {
  const debitCalls: any[] = [];
  const refundCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findFirst: async () =>
        opts?.configRow === false ? null : { passeioEquipe: opts?.passeioEquipe === true },
    },
  };
  const wallet: any = {
    debit: async (companyId: number, amount: number, options: any) => {
      debitCalls.push({ companyId, amount, options });
      return opts?.debitResult ?? { debited: amount, partial: false };
    },
    refund: async (companyId: number, options: any) => {
      refundCalls.push({ companyId, options });
      return { refunded: true };
    },
  };
  const actionConfig: any = {
    resolveEffective: async () =>
      opts?.definition === undefined
        ? { key: 'passeio_tour', label: 'Modo Passeio', mode: 'debit', cost: 2 }
        : opts.definition,
  };
  const service = new LogisticaPasseioService(prisma, wallet, actionConfig);
  return { service, debitCalls, refundCalls };
}

const TOUR = 'a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4';
const FUNCIONARIO = { id: 9, role: 'USER' };
const ADMIN = { id: 1, role: 'ADMIN' };

test('funcionário sem passeioEquipe é barrado sem tocar a carteira', async () => {
  const { service, debitCalls } = makeService({ passeioEquipe: false });
  await assert.rejects(service.iniciar(7, FUNCIONARIO, TOUR), /não está liberado/);
  assert.equal(debitCalls.length, 0);
});

test('funcionário sem NENHUMA config (linha ausente) também é barrado', async () => {
  const { service, debitCalls } = makeService({ configRow: false });
  await assert.rejects(service.iniciar(7, FUNCIONARIO, TOUR), /não está liberado/);
  assert.equal(debitCalls.length, 0);
});

test('funcionário liberado debita com usageKey idempotente por tourId', async () => {
  const { service, debitCalls } = makeService({ passeioEquipe: true });
  const result = await service.iniciar(7, FUNCIONARIO, TOUR);
  assert.deepEqual(result, { ok: true, debitado: 2 });
  assert.equal(debitCalls.length, 1);
  assert.equal(debitCalls[0].companyId, 7);
  assert.equal(debitCalls[0].amount, 2);
  assert.equal(debitCalls[0].options.usageKey, `passeio:company:7:tour:${TOUR}`);
  assert.equal(debitCalls[0].options.actionKey, 'passeio_tour');
});

test('admin usa sem a chave da equipe', async () => {
  const { service, debitCalls } = makeService({ passeioEquipe: false });
  const result = await service.iniciar(7, ADMIN, TOUR);
  assert.deepEqual(result, { ok: true, debitado: 2 });
  assert.equal(debitCalls.length, 1);
});

test('mode free não toca a carteira', async () => {
  const { service, debitCalls } = makeService({
    definition: { key: 'passeio_tour', label: 'Modo Passeio', mode: 'free', cost: 0 },
  });
  const result = await service.iniciar(7, ADMIN, TOUR);
  assert.deepEqual(result, { ok: true, debitado: 0 });
  assert.equal(debitCalls.length, 0);
});

test('saldo insuficiente → 402 PASSEIO_INDISPONIVEL e estorna o parcial', async () => {
  const { service, refundCalls } = makeService({ debitResult: { debited: 1, partial: true } });
  await assert.rejects(service.iniciar(7, ADMIN, TOUR), (error: any) => {
    assert.equal(error?.getStatus?.(), 402);
    assert.equal(error?.getResponse?.()?.code, 'PASSEIO_INDISPONIVEL');
    return true;
  });
  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0].options.usageKey, `passeio:company:7:tour:${TOUR}`);
});

test('tourId fora do formato é rejeitado antes de qualquer leitura', async () => {
  const { service, debitCalls } = makeService();
  await assert.rejects(service.iniciar(7, ADMIN, 'x'), /inválido/);
  await assert.rejects(service.iniciar(7, ADMIN, ''), /inválido/);
  assert.equal(debitCalls.length, 0);
});
