import assert from 'node:assert/strict';
import test from 'node:test';
import { LogisticaCadernetaService } from './logistica-caderneta.service';

// MODO CADERNETA — testes de mesa do serviço (mocks pobres, padrão dos vizinhos):
// o que importa provar aqui é a COSTURA (gate do modo, idempotência do clique,
// 'deveu' → fiado explícito, medidor conta pino provado, fechamento por forma).

type Fn = (...args: any[]) => any;

function prismaMock(overrides: Record<string, Record<string, Fn>> = {}) {
  const base: any = {
    logisticaConfig: { findUnique: async () => ({ modoCaderneta: true, moduloFinanceiroAtivo: true }) },
    logisticaPlanoEntrega: { findMany: async () => [] },
    customerProfile: {
      findMany: async () => [],
      findFirst: async () => ({ precoPadrao: null }),
      updateMany: async () => ({ count: 0 }),
    },
    localEntrega: { updateMany: async () => ({ count: 0 }) },
    entrega: { findFirst: async () => null, findMany: async () => [], update: async () => ({}) },
    // PREÇO POR CLIENTE (05/08) — as três fontes que o resolverPrecos consulta.
    clienteProduto: { findMany: async () => [], findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    product: { findMany: async () => [] },
    financeiroCharge: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    clienteHistorico: { deleteMany: async () => ({ count: 0 }) },
    deletionRecord: { create: async () => ({}) },
    $transaction: async (fn: any) => fn(base),
  };
  for (const [model, fns] of Object.entries(overrides)) {
    base[model] = { ...base[model], ...fns };
  }
  return base;
}

function logisticaMock(calls: string[] = []) {
  return {
    createEntrega: async (_c: number, input: any) => {
      // `@valor` = o TOTAL que a entrega nasce valendo (preço resolvido × qtd).
      calls.push(`create:${input.productId}x${input.quantidade}@${input.valor}`);
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
  assert.deepEqual(calls, ['create:7x2@0', 'confirm:ent-1:cartao:key-abc']);
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
  // O item extra leva o preço JÁ RESOLVIDO (sem catálogo nem combinado no mock,
  // dá 0) — antes de 05/08 ele ia sem preço e o confirmar caía no catálogo.
  assert.deepEqual(capturado[0], [{ productId: 9, qtdEntregue: 3, valorUnit: 0 }]);
});

// ── PREÇO POR CLIENTE (05/08) ────────────────────────────────────────────────
// 🔴 A VACINA DO CASO REAL (cia 41, 05/08): Larissa tem R$11 combinado no
// ClienteProduto e a caderneta registrou R$13 — o preço de CATÁLOGO do produto.
// O combinado estava no banco desde 24/07 e nenhum caminho da venda o lia.
test('vender: o preço COMBINADO com o cliente vence o catálogo (caso Larissa: 11, não 13)', async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      clienteProduto: { findMany: async () => [{ productId: 7, precoAcordado: 11 }] },
      product: { findMany: async () => [{ id: 7, price: 13, priceCents: 1300 }] },
    }) as any,
    logisticaMock(calls) as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 1 }] });
  assert.equal(calls[0], 'create:7x1@11');
});

test('vender: SEM combinado, o preço é o do catálogo × quantidade', async () => {
  const calls: string[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({ product: { findMany: async () => [{ id: 7, price: 13, priceCents: 1300 }] } }) as any,
    logisticaMock(calls) as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 2 }] });
  assert.equal(calls[0], 'create:7x2@26');
});

test('vender: preço EDITADO na tela vence tudo E vira o combinado do cliente', async () => {
  const calls: string[] = [];
  const gravados: any[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      clienteProduto: {
        findMany: async () => [{ productId: 7, precoAcordado: 11 }],
        findFirst: async () => ({ id: 'cp-1', precoAcordado: 11 }),
        update: async (args: any) => { gravados.push(args); return {}; },
      },
      product: { findMany: async () => [{ id: 7, price: 13, priceCents: 1300 }] },
    }) as any,
    logisticaMock(calls) as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 2, valorUnit: 12 }] });
  assert.equal(calls[0], 'create:7x2@24', 'a venda cobra o preço editado');
  assert.equal(gravados.length, 1, 'e o preço FICA pra próxima');
  assert.equal(gravados[0].where.id, 'cp-1');
  assert.equal(gravados[0].data.precoAcordado, 12);
});

test('vender: preço NÃO editado nunca reescreve o cadastro do cliente', async () => {
  const gravados: any[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      clienteProduto: {
        findMany: async () => [{ productId: 7, precoAcordado: 11 }],
        findFirst: async () => ({ id: 'cp-1', precoAcordado: 11 }),
        update: async (args: any) => { gravados.push(args); return {}; },
        create: async (args: any) => { gravados.push(args); return {}; },
      },
    }) as any,
    logisticaMock() as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 1 }] });
  assert.equal(gravados.length, 0);
});

test('vender: preço editado em cliente SEM vínculo cria o combinado sem dia (não inventa recorrência)', async () => {
  const criados: any[] = [];
  const svc = new LogisticaCadernetaService(
    prismaMock({
      clienteProduto: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async (args: any) => { criados.push(args.data); return {}; },
      },
    }) as any,
    logisticaMock() as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 1, valorUnit: 9.5 }] });
  assert.equal(criados.length, 1);
  assert.equal(criados[0].precoAcordado, 9.5);
  assert.equal(criados[0].diasSemana, null, 'sem dia = invisível pro gerar-dia');
  assert.equal(criados[0].proximaData, null);
});

// ── APAGAR A VENDA ERRADA (05/08) ────────────────────────────────────────────
function prismaApagar(entrega: any, extra: Record<string, Record<string, Fn>> = {}) {
  const trilha: string[] = [];
  const prisma = prismaMock({
    entrega: {
      findFirst: async () => entrega,
      update: async (args: any) => { trilha.push(`entrega:${args.data.status}`); return {}; },
      findMany: async () => [],
    },
    financeiroCharge: {
      findMany: async () => [{ id: 'chg-1', amount: 13, status: 'approved', lifecycle: 'paid', paidAt: new Date() }],
      updateMany: async (args: any) => { trilha.push(`charge:${args.data.status}`); return { count: 1 }; },
    },
    clienteHistorico: { deleteMany: async () => { trilha.push('historico:apagado'); return { count: 1 }; } },
    deletionRecord: { create: async () => { trilha.push('snapshot'); return {}; } },
    ...extra,
  });
  return { prisma, trilha };
}

test('apagar-venda: desfaz nos TRÊS lugares — entrega, cobrança e histórico', async () => {
  const { prisma, trilha } = prismaApagar({ id: 'ent-9', status: 'entregue', notes: null, valor: 13 });
  const svc = new LogisticaCadernetaService(prisma as any, logisticaMock() as any);
  const r = await svc.apagarVenda(5, 'ent-9', { deletedByUserId: 3 });
  assert.equal(r!.entregaId, 'ent-9');
  assert.deepEqual(trilha, ['snapshot', 'charge:cancelled', 'entrega:cancelada', 'historico:apagado']);
});

test('apagar-venda: entrega de outra empresa (ou inexistente) → null, nada é tocado', async () => {
  const { prisma, trilha } = prismaApagar(null);
  const svc = new LogisticaCadernetaService(prisma as any, logisticaMock() as any);
  assert.equal(await svc.apagarVenda(5, 'ent-de-outro'), null);
  assert.deepEqual(trilha, []);
});

test('apagar-venda: entrega JÁ FATURADA no mês é recusada (fatura fechada não some por toque-longo)', async () => {
  const { prisma, trilha } = prismaApagar({ id: 'ent-9', status: 'entregue', cobrancaStatus: 'faturada', notes: null, valor: 13 });
  const svc = new LogisticaCadernetaService(prisma as any, logisticaMock() as any);
  await assert.rejects(() => svc.apagarVenda(5, 'ent-9'), /fechamento do mês/);
  assert.deepEqual(trilha, []);
});

test('apagar-venda: 2º toque é idempotente e AINDA limpa o histórico que sobrou', async () => {
  const { prisma, trilha } = prismaApagar({ id: 'ent-9', status: 'cancelada', notes: null, valor: 13 });
  const svc = new LogisticaCadernetaService(prisma as any, logisticaMock() as any);
  const r = await svc.apagarVenda(5, 'ent-9');
  assert.equal(r!.jaApagada, true);
  assert.deepEqual(trilha, ['historico:apagado']);
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

// PR05082026-VER-TELA V4 — a BASE é o recorte do CONVITE do GPS: todo mundo com
// dia cadastrado, não só quem entrega hoje (emenda 3 do dono).
test('resumo: base mede a AGENDA INTEIRA, o dia mede só hoje', async () => {
  const provados: Record<string, boolean> = { a: true, b: true, c: false };
  const svc = new LogisticaCadernetaService(
    prismaMock({
      logisticaPlanoEntrega: {
        // Com diaSemana no where = clientes de hoje (a, b). Sem ele = a base (a, b, c).
        findMany: async (args: any) =>
          args?.where?.diaSemana === undefined
            ? [{ customerProfileId: 'a' }, { customerProfileId: 'b' }, { customerProfileId: 'c' }]
            : [{ customerProfileId: 'a' }, { customerProfileId: 'b' }],
      },
      customerProfile: {
        findMany: async (args: any) =>
          (args.where.id.in as string[]).map((id) => ({
            geoFonte: provados[id] ? 'gps_entrega' : 'geocode',
            locais: [],
          })),
        updateMany: async () => ({ count: 0 }),
      },
    }) as any,
    logisticaMock() as any,
  );

  const r = await svc.resumo(5, '2026-08-05');
  assert.deepEqual(r.dia, { total: 2, provados: 2, pronto: true }, 'hoje já está provado');
  assert.deepEqual(r.base, { total: 3, provados: 2, pronto: false }, 'a base ainda não — sem convite');
});

test('resumo: base vazia NUNCA é pronta (0 de 0 não convida ninguém pro GPS)', async () => {
  const svc = new LogisticaCadernetaService(prismaMock() as any, logisticaMock() as any);
  const r = await svc.resumo(5, '2026-08-05');
  assert.deepEqual(r.base, { total: 0, provados: 0, pronto: false });
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

test("vender: financeiro OFF → 'pagou' SEM método passa (folha de 1 botão) e confirma sem receiptMethod", async () => {
  const capturado: any[] = [];
  const logistica = {
    createEntrega: async () => ({ id: 'ent-1' }),
    confirmarEntrega: async (_c: number, _id: string, gps: any) => {
      capturado.push(gps.receiptMethod);
      return { id: 'ent-1', status: 'entregue' };
    },
  } as any;
  const svc = new LogisticaCadernetaService(
    prismaMock({
      logisticaConfig: { findUnique: async () => ({ modoCaderneta: true, moduloFinanceiroAtivo: false }) },
    }) as any,
    logistica,
  );
  const r = await svc.vender(5, { ...DTO_BASE, metodo: undefined });
  assert.equal(r.ok, true);
  assert.equal(capturado[0], undefined);
});

test('resumo: financeiro OFF → fechamento null (número de dinheiro não se inventa)', async () => {
  const svc = new LogisticaCadernetaService(
    prismaMock({
      logisticaConfig: { findUnique: async () => ({ modoCaderneta: true, moduloFinanceiroAtivo: false }) },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.fechamento, null);
});
