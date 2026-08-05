import assert from 'node:assert/strict';
import test from 'node:test';
import { LogisticaCadernetaService } from './logistica-caderneta.service';

// MODO CADERNETA — testes de mesa do serviço (mocks pobres, padrão dos vizinhos):
// o que importa provar aqui é a COSTURA (gate do modo, idempotência do clique,
// 'deveu' → fiado explícito, medidor conta pino provado, fechamento por forma).

type Fn = (...args: any[]) => any;

function prismaMock(overrides: Record<string, Record<string, Fn>> = {}) {
  const base: any = {
    logisticaConfig: { findUnique: async () => ({ modoCaderneta: true }) },
    logisticaPlanoEntrega: { findMany: async () => [] },
    customerProfile: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    localEntrega: { updateMany: async () => ({ count: 0 }) },
    entrega: { findFirst: async () => null, findMany: async () => [] },
  };
  for (const [model, fns] of Object.entries(overrides)) {
    base[model] = { ...base[model], ...fns };
  }
  return base;
}

function logisticaMock(calls: string[] = []) {
  return {
    createEntrega: async (_c: number, input: any) => {
      calls.push(`create:${input.productId}x${input.quantidade}`);
      return { id: 'ent-1' };
    },
    confirmarEntrega: async (_c: number, id: string, gps: any) => {
      calls.push(`confirm:${id}:${gps.receiptMethod}:${gps.idempotencyKey}`);
      return { id, status: 'entregue' };
    },
  } as any;
}

const DTO_BASE = {
  clienteId: 'cli-1',
  itens: [{ productId: 7, quantidade: 2 }],
  desfecho: 'pagou',
  metodo: 'cartao',
  idempotencyKey: 'key-abc',
} as any;

test('vender: modo desligado → recusa com mensagem humana', async () => {
  const svc = new LogisticaCadernetaService(
    prismaMock({ logisticaConfig: { findUnique: async () => ({ modoCaderneta: false }) } }) as any,
    logisticaMock() as any,
  );
  await assert.rejects(() => svc.vender(5, DTO_BASE), /caderneta está desligado/);
});

test("vender: 'pagou' sem método → recusa antes de criar qualquer coisa", async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(prismaMock() as any, logisticaMock(calls) as any);
  await assert.rejects(
    () => svc.vender(5, { ...DTO_BASE, metodo: undefined }),
    /como recebeu/,
  );
  assert.equal(calls.length, 0);
});

test('vender: cria + confirma com o método imediato e a MESMA key (cartao passa inteiro)', async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      entrega: {
        findFirst: async (args: any) =>
          args?.where?.idempotencyKey ? null : { valor: 30, id: 'ent-1' },
        findMany: async () => [],
      },
    }) as any,
    logisticaMock(calls) as any,
  );
  const r = await svc.vender(5, DTO_BASE);
  assert.deepEqual(calls, ['create:7x2', 'confirm:ent-1:cartao:key-abc']);
  assert.equal(r.entregaId, 'ent-1');
  assert.equal(r.totalCents, 3000);
});

test("vender: 'deveu' manda 'fiado' EXPLÍCITO (nunca deixa o M6 derivar e quitar)", async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(prismaMock() as any, logisticaMock(calls) as any);
  await svc.vender(5, { ...DTO_BASE, desfecho: 'deveu', metodo: undefined });
  assert.ok(calls[1].startsWith('confirm:ent-1:fiado:'));
});

test('vender: mesma idempotencyKey já gravada → replay, NADA re-executa', async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      entrega: { findFirst: async () => ({ id: 'ent-velha', valor: 15 }), findMany: async () => [] },
    }) as any,
    logisticaMock(calls) as any,
  );
  const r = await svc.vender(5, DTO_BASE);
  assert.equal(r.replayed, true);
  assert.equal(r.entregaId, 'ent-velha');
  assert.equal(r.totalCents, 1500);
  assert.equal(calls.length, 0);
});

test('vender: itens extras viram novosItens do confirmar (multi-produto)', async () => {
  const capturado: any[] = [];
  const logistica = {
    createEntrega: async () => ({ id: 'ent-1' }),
    confirmarEntrega: async (_c: number, _id: string, gps: any) => {
      capturado.push(gps.novosItens);
      return { id: 'ent-1', status: 'entregue' };
    },
  } as any;
  const svc = new LogisticaCadernetaService(prismaMock() as any, logistica);
  await svc.vender(5, {
    ...DTO_BASE,
    itens: [
      { productId: 7, quantidade: 1 },
      { productId: 9, quantidade: 3 },
    ],
  });
  assert.deepEqual(capturado[0], [{ productId: 9, qtdEntregue: 3 }]);
});

test('resumo: medidor conta pino PROVADO (local principal vence; geocode não conta)', async () => {
  const svc = new LogisticaCadernetaService(
    prismaMock({
      logisticaPlanoEntrega: {
        findMany: async () => [
          { customerProfileId: 'a' },
          { customerProfileId: 'a' }, // 2 planos, 1 cliente
          { customerProfileId: 'b' },
          { customerProfileId: 'c' },
        ],
      },
      customerProfile: {
        findMany: async () => [
          { geoFonte: 'geocode', locais: [{ geoFonte: 'gps_entrega' }] }, // local provado vence
          { geoFonte: 'gps_cadastro', locais: [] }, // perfil provado (fallback)
          { geoFonte: 'geocode', locais: [{ geoFonte: 'geocode' }] }, // nada provado
        ],
        updateMany: async () => ({ count: 0 }),
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.dia.total, 3);
  assert.equal(r.dia.provados, 2);
  assert.equal(r.dia.pronto, false);
});

test('resumo: fechamento quebra por forma e o sem-método-imediato vira fiado do dia', async () => {
  const svc = new LogisticaCadernetaService(
    prismaMock({
      entrega: {
        findFirst: async () => null,
        findMany: async () => [
          { valor: 10, receiptMethod: 'dinheiro' },
          { valor: 20, receiptMethod: 'pix' },
          { valor: 5, receiptMethod: 'cartao' },
          { valor: 8, receiptMethod: 'fiado' },
          { valor: 2, receiptMethod: null },
        ],
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.fechamento.totalCents, 4500);
  assert.equal(r.fechamento.vendas, 5);
  assert.deepEqual(r.fechamento.formas, {
    dinheiroCents: 1000,
    pixCents: 2000,
    cartaoCents: 500,
    fiadoCents: 1000,
  });
});

test('resumo: dia vazio nunca é "pronto" (0 de 0 não libera GPS)', async () => {
  const svc = new LogisticaCadernetaService(prismaMock() as any, logisticaMock() as any);
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.dia.pronto, false);
  assert.equal(r.ativo, true);
});
