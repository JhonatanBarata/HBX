import assert from 'node:assert/strict';
import test from 'node:test';
import { LogisticaFechamentoDiaService } from './logistica-fechamento-dia.service';
import { isoWeekdayForDate, saoPauloDateKey } from './logistica-dia.util';
import { saoPauloMidnight } from './logistica-agenda-cursor.util';

// FECHAMENTO DO DIA — testes de mesa do serviço (mocks pobres, padrão dos
// vizinhos): o que importa provar aqui é a COSTURA (idempotência do clique,
// 'deveu' → fiado explícito, medidor conta pino provado, fechamento por forma).
// AS 7 PÁGINAS (05/08): etiqueta da página, janela de 7 dias, ouro nº1 (auto-dia
// pela porta canônica), sumiu, aprendiz semanal, fechar o dia e convite.

type Fn = (...args: any[]) => any;

function prismaMock(overrides: Record<string, Record<string, Fn>> = {}) {
  const base: any = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    logisticaPlanoEntrega: { findMany: async () => [], count: async () => 0 },
    customerProfile: {
      findMany: async () => [],
      findFirst: async () => ({ precoPadrao: null }),
      updateMany: async () => ({ count: 0 }),
    },
    localEntrega: { updateMany: async () => ({ count: 0 }) },
    entrega: { findFirst: async () => null, findMany: async () => [], update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    // PREÇO POR CLIENTE (05/08) — as três fontes que o resolverPrecos consulta.
    clienteProduto: { findMany: async () => [], findFirst: async () => null, create: async () => ({}), update: async () => ({}), count: async () => 0 },
    product: { findMany: async () => [] },
    financeiroCharge: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    clienteHistorico: { deleteMany: async () => ({ count: 0 }) },
    deletionRecord: { create: async () => ({}) },
    // As Rotas salvas do aprendiz e o nome do convite.
    // 🔴 F3 (09/08) — a lista da rota salva virou LINHA: o `create` do modelo
    // precisa devolver `id` (o backfill de paradas pendura nele) e a tabela de
    // paradas entra no mock. Sem isso o "aprendiz" gravava o nome e perdia a
    // lista — calado, que é o defeito que esta frente veio matar.
    logisticaRotaModelo: {
      findFirst: async () => null,
      create: async () => ({ id: 'rota-nova' }),
      update: async () => ({}),
    },
    logisticaRotaModeloParada: {
      createMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
    user: { findFirst: async () => ({ name: 'Tester' }) },
    $transaction: async (fn: any) => fn(base),
  };
  for (const [model, fns] of Object.entries(overrides)) {
    base[model] = { ...base[model], ...fns };
  }
  return base;
}

/**
 * Mock de entrega que RESPEITA a janela de datas (deliveredAt gte/lt) — as três
 * buscas do resumo (página 7d, histórico 21d, semana fechada do aprendiz) usam
 * o MESMO findMany e só a janela as distingue; ignorar o where misturaria tudo.
 */
function entregaMockPorJanela(rows: any[]) {
  return {
    findFirst: async () => null,
    update: async () => ({}),
    updateMany: async (_args?: any) => ({ count: 0 }),
    findMany: async (args: any) => {
      const faixa = args?.where?.deliveredAt;
      if (!faixa) return rows;
      return rows.filter((r) => r.deliveredAt && (!faixa.gte || r.deliveredAt >= faixa.gte) && (!faixa.lt || r.deliveredAt < faixa.lt));
    },
  };
}

/** Vendas de mesa: data SP + etiqueta opcional (12:00 SP evita beirada de dia). */
function vendaDeMesa(id: string, cliente: string, dateKey: string, extra: Record<string, any> = {}) {
  return {
    id,
    customerProfileId: cliente,
    localId: null,
    valor: 10,
    receiptMethod: 'pix',
    deliveredAt: new Date(`${dateKey}T12:00:00-03:00`),
    fechamentoDiaSemana: null,
    customerProfile: { name: cliente },
    itens: [],
    ...extra,
  };
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

// 🔴 VACINA DO DEFEITO DE 09/08 — a venda por toque NÃO depende de modo nenhum.
// Estes dois testes cobravam o contrário (chave `false` → recusa), e por isso o
// gate morto passou 2 dias verde enquanto o botão não funcionava pra ninguém: a
// régua cobrava a PAREDE em vez da porta. Config SEM chave alguma (nem modo, nem
// financeiro) tem que VENDER.
test('vender: sem modo nenhum na config, a venda acontece (a chave morta não barra)', async () => {
  const calls: string[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({ logisticaConfig: { findUnique: async () => ({}) } }) as any,
    logisticaMock(calls) as any,
  );
  const r = await svc.vender(5, { ...DTO_BASE, metodo: undefined });
  assert.equal(r.ok, true);
  assert.ok(calls.some((c) => c.startsWith('create:')), 'a entrega tem que nascer');
});

test("vender: 'pagou' sem método → recusa antes de criar qualquer coisa", async () => {
  const calls: string[] = [];
  const svc = new LogisticaFechamentoDiaService(prismaMock() as any, logisticaMock(calls) as any);
  await assert.rejects(
    () => svc.vender(5, { ...DTO_BASE, metodo: undefined }),
    /como recebeu/,
  );
  assert.equal(calls.length, 0);
});

test('vender: cria + confirma com o método imediato e a MESMA key (cartao passa inteiro)', async () => {
  const calls: string[] = [];
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(prismaMock() as any, logisticaMock(calls) as any);
  await svc.vender(5, { ...DTO_BASE, desfecho: 'deveu', metodo: undefined });
  assert.ok(calls[1].startsWith('confirm:ent-1:fiado:'));
});

test('vender: mesma idempotencyKey já gravada → replay, NADA re-executa', async () => {
  const calls: string[] = [];
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(prismaMock() as any, logistica);
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
// ClienteProduto e a venda registrou R$13 — o preço de CATÁLOGO do produto.
// O combinado estava no banco desde 24/07 e nenhum caminho da venda o lia.
test('vender: o preço COMBINADO com o cliente vence o catálogo (caso Larissa: 11, não 13)', async () => {
  const calls: string[] = [];
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({ product: { findMany: async () => [{ id: 7, price: 13, priceCents: 1300 }] } }) as any,
    logisticaMock(calls) as any,
  );
  await svc.vender(5, { ...DTO_BASE, itens: [{ productId: 7, quantidade: 2 }] });
  assert.equal(calls[0], 'create:7x2@26');
});

test('vender: preço EDITADO na tela vence tudo E vira o combinado do cliente', async () => {
  const calls: string[] = [];
  const gravados: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(
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

test('vender: preço editado em cliente SEM vínculo cria SÓ o preço combinado (não inventa recorrência)', async () => {
  const criados: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
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
  // 🔴 F2 (09/08): guardar preço não pode inventar recorrência — e agora isso é
  // verdade POR CONSTRUÇÃO. O vínculo não tem mais coluna de cadência nenhuma
  // pra preencher; quem coloca o cliente na rota é a visita (PlanoEntrega).
  assert.deepEqual(
    Object.keys(criados[0]).sort(),
    ['companyId', 'customerProfileId', 'precoAcordado', 'productId', 'qtdPadrao'],
    'o vínculo criado pelo fechamento é SÓ preço/quantidade — zero agenda',
  );
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
  const svc = new LogisticaFechamentoDiaService(prisma as any, logisticaMock() as any);
  const r = await svc.apagarVenda(5, 'ent-9', { deletedByUserId: 3 });
  assert.equal(r!.entregaId, 'ent-9');
  assert.deepEqual(trilha, ['snapshot', 'charge:cancelled', 'entrega:cancelada', 'historico:apagado']);
});

test('apagar-venda: entrega de outra empresa (ou inexistente) → null, nada é tocado', async () => {
  const { prisma, trilha } = prismaApagar(null);
  const svc = new LogisticaFechamentoDiaService(prisma as any, logisticaMock() as any);
  assert.equal(await svc.apagarVenda(5, 'ent-de-outro'), null);
  assert.deepEqual(trilha, []);
});

test('apagar-venda: entrega JÁ FATURADA no mês é recusada (fatura fechada não some por toque-longo)', async () => {
  const { prisma, trilha } = prismaApagar({ id: 'ent-9', status: 'entregue', cobrancaStatus: 'faturada', notes: null, valor: 13 });
  const svc = new LogisticaFechamentoDiaService(prisma as any, logisticaMock() as any);
  await assert.rejects(() => svc.apagarVenda(5, 'ent-9'), /fechamento do mês/);
  assert.deepEqual(trilha, []);
});

test('apagar-venda: 2º toque é idempotente e AINDA limpa o histórico que sobrou', async () => {
  const { prisma, trilha } = prismaApagar({ id: 'ent-9', status: 'cancelada', notes: null, valor: 13 });
  const svc = new LogisticaFechamentoDiaService(prisma as any, logisticaMock() as any);
  const r = await svc.apagarVenda(5, 'ent-9');
  assert.equal(r!.jaApagada, true);
  assert.deepEqual(trilha, ['historico:apagado']);
});

test('resumo: medidor conta pino PROVADO (local principal vence; geocode não conta)', async () => {
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(prismaMock() as any, logisticaMock() as any);
  const r = await svc.resumo(5, '2026-08-05');
  assert.deepEqual(r.base, { total: 0, provados: 0, pronto: false });
});

test('resumo: fechamento quebra por forma e o sem-método-imediato vira fiado do dia', async () => {
  const svc = new LogisticaFechamentoDiaService(
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
  const svc = new LogisticaFechamentoDiaService(prismaMock() as any, logisticaMock() as any);
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.dia.pronto, false);
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
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: false }) },
    }) as any,
    logistica,
  );
  const r = await svc.vender(5, { ...DTO_BASE, metodo: undefined });
  assert.equal(r.ok, true);
  assert.equal(capturado[0], undefined);
});

test('resumo: financeiro OFF → fechamento null (número de dinheiro não se inventa)', async () => {
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: false }) },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.fechamento, null);
});

// ═══ AS 7 PÁGINAS DO FECHAMENTO (05/08) ══════════════════════════════════════
// 2026-08-05 é QUARTA (dia 3); a janela da página vai de 30/07 (qui) a 05/08.

const perfilVivoMock = {
  findMany: async (args: any) =>
    (args?.where?.id?.in || []).map((id: string) => ({ id, geoFonte: null, locais: [] })),
  findFirst: async () => ({ precoPadrao: null }),
  updateMany: async () => ({ count: 0 }),
};

test('resumo/página: etiqueta vence a data, sem etiqueta cai no dia real; fechamento e data são DA página', async () => {
  const rows = [
    vendaDeMesa('e1', 'a', '2026-08-01'), // sábado real, sem etiqueta → página 6
    vendaDeMesa('e2', 'b', '2026-08-05', { fechamentoDiaSemana: 6 }), // quarta ETIQUETADA sábado
    vendaDeMesa('e3', 'c', '2026-08-04'), // terça → página 2, fora da página 6
  ];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({ entrega: entregaMockPorJanela(rows), customerProfile: perfilVivoMock }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05', { dia: 6 });
  assert.deepEqual(r.pagina.vendas.map((v: any) => v.entregaId), ['e1', 'e2']);
  assert.equal(r.pagina.diaSemana, 6);
  assert.equal(r.pagina.dateKey, '2026-08-01', 'a data da página é o sábado da janela');
  assert.equal(r.pagina.fechamento!.totalCents, 2000);
  assert.equal(r.pagina.fechamento!.vendas, 2);
  // Histórico: só dias COM venda, SEG→DOM (terça e sábado).
  assert.deepEqual(r.historicoDias.map((h: any) => h.diaSemana), [2, 6]);
  assert.equal(r.historicoDias[0].dateKey, '2026-08-04');
});

test('resumo/aprendiz: semana FECHADA vira "Rota de <dia>" (dedupe, ordem de registro) e o convite sai com o nome', async () => {
  // Semana fechada = seg 27/07 → dom 02/08. Duas vendas no sábado 01/08 (uma
  // repetida do mesmo cliente) + uma na sexta 31/07.
  const rows = [
    vendaDeMesa('s1', 'a', '2026-07-31'),
    vendaDeMesa('s2', 'b', '2026-08-01'),
    vendaDeMesa('s3', 'a', '2026-08-01', { deliveredAt: new Date('2026-08-01T15:00:00-03:00') }),
    vendaDeMesa('s4', 'a', '2026-08-01', { deliveredAt: new Date('2026-08-01T16:00:00-03:00') }),
  ];
  const criados: any[] = [];
  const paradasCriadas: any[] = [];
  let rotaSeq = 0;
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: entregaMockPorJanela(rows),
      customerProfile: perfilVivoMock,
      logisticaRotaModelo: {
        findFirst: async () => null,
        create: async (args: any) => {
          const id = `rota-${++rotaSeq}`;
          criados.push({ id, ...args.data });
          return { id };
        },
        update: async () => ({}),
      },
      logisticaRotaModeloParada: {
        createMany: async ({ data }: any) => { paradasCriadas.push(...data); return { count: data.length }; },
        deleteMany: async () => ({ count: 0 }),
      },
      user: { findFirst: async () => ({ name: 'André' }) },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05', { userId: 9 });
  assert.deepEqual(r.conviteGps, { elegivel: true, nome: 'André' });
  const sabado = criados.find((c) => c.diaSemana === 6);
  const sexta = criados.find((c) => c.diaSemana === 5);
  assert.ok(sabado && sexta, 'uma rota salva por dia com venda');
  assert.equal(sabado.nome, 'Rota de Sábado');
  // Ordem de registro, cliente repetido entra 1x (b vendeu antes da repetição do a).
  // A lista agora é LINHA (`LogisticaRotaModeloParada`), com `ordem` explícita —
  // é ela, e não mais um array JSON, que diz a sequência da rota do dono.
  assert.deepEqual(
    paradasCriadas
      .filter((parada) => parada.rotaModeloId === sabado.id)
      .map((parada) => ({ customerProfileId: parada.customerProfileId, localId: parada.localId, ordem: parada.ordem })),
    [
      { customerProfileId: 'b', localId: null, ordem: 1 },
      { customerProfileId: 'a', localId: null, ordem: 2 },
    ],
  );
});

test('resumo/aprendiz: semana já carimbada (updatedAt desta semana) não regera — e o convite continua elegível', async () => {
  const rows = [vendaDeMesa('s1', 'a', '2026-08-01')];
  const criados: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: entregaMockPorJanela(rows),
      customerProfile: perfilVivoMock,
      logisticaRotaModelo: {
        // Carimbo: atualizada na SEGUNDA desta semana (03/08 ≥ início da semana).
        findFirst: async () => ({ updatedAt: new Date('2026-08-03T12:00:00-03:00') }),
        create: async (args: any) => { criados.push(args); return {}; },
        update: async () => ({}),
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05');
  assert.equal(r.conviteGps.elegivel, true);
  assert.equal(criados.length, 0, 'nada regerado');
});

test('resumo/sumiu: cliente do dia que comprava e faltou 2 semanas ganha o aviso; sem histórico antigo não há sumiço', async () => {
  // x comprou no sábado 18/07 (janela do histórico, ANTES do corte de 2 semanas)
  // e nunca mais. y é do dia mas nunca comprou → NÃO é sumido.
  const rows = [vendaDeMesa('h1', 'x', '2026-07-18')];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: entregaMockPorJanela(rows),
      customerProfile: perfilVivoMock,
      logisticaPlanoEntrega: {
        findMany: async (args: any) =>
          args?.where?.diaSemana === 6
            ? [{ customerProfileId: 'x' }, { customerProfileId: 'y' }]
            : [],
        count: async () => 0,
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05', { dia: 6 });
  assert.deepEqual(r.pagina.sumidos, ['x']);
});

test('resumo/sugestão: vendido 2+ datas na página, com OUTRO dia cadastrado → chip "+ dia" (nunca sobrescrever calado)', async () => {
  const rows = [
    vendaDeMesa('g1', 'y', '2026-07-25', { fechamentoDiaSemana: 6 }),
    vendaDeMesa('g2', 'y', '2026-08-01', { fechamentoDiaSemana: 6 }),
  ];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: entregaMockPorJanela(rows),
      customerProfile: perfilVivoMock,
      logisticaPlanoEntrega: {
        findMany: async (args: any) =>
          args?.where?.customerProfileId?.in ? [{ customerProfileId: 'y', diaSemana: 4 }] : [],
        count: async () => 0,
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05', { dia: 6 });
  const linha = r.pagina.vendas.find((v: any) => v.entregaId === 'g2');
  assert.equal(linha!.sugerirDia, true);
  assert.deepEqual(linha!.diasAtuais, [4]);
});

test('resumo/página: venda multi-produto devolve o principal ESCALAR na frente dos extras (unitário = total − extras)', async () => {
  const rows = [
    vendaDeMesa('m1', 'a', '2026-08-05', {
      productId: 7,
      quantidade: 2,
      valor: 40,
      product: { name: 'Galão 20 Litros' },
      itens: [{ productId: 9, qtdPrevista: 1, qtdEntregue: 1, valorUnit: 18, product: { name: 'Água com gás' } }],
    }),
  ];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({ entrega: entregaMockPorJanela(rows), customerProfile: perfilVivoMock }) as any,
    logisticaMock() as any,
  );
  const r = await svc.resumo(5, '2026-08-05'); // página default = quarta (dia 3)
  assert.deepEqual(r.pagina.vendas[0].itens, [
    { productId: 7, nome: 'Galão 20 Litros', qtd: 2, valorUnit: 11 }, // (40 − 18) / 2
    { productId: 9, nome: 'Água com gás', qtd: 1, valorUnit: 18 },
  ]);
});

test('vender: a etiqueta da página viaja explícita (registrar numa página folheada)', async () => {
  const etiquetas: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: {
        findFirst: async () => null,
        findMany: async () => [],
        update: async (args: any) => { etiquetas.push(args.data); return {}; },
        updateMany: async () => ({ count: 0 }),
      },
    }) as any,
    logisticaMock() as any,
  );
  await svc.vender(5, { ...DTO_BASE, diaSemana: 6 });
  assert.equal(etiquetas[0].fechamentoDiaSemana, 6);
});

test('vender: sem etiqueta do APK, a página é o dia real de HOJE em SP (APK velho)', async () => {
  const etiquetas: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: {
        findFirst: async () => null,
        findMany: async () => [],
        update: async (args: any) => { etiquetas.push(args.data); return {}; },
        updateMany: async () => ({ count: 0 }),
      },
    }) as any,
    logisticaMock() as any,
  );
  await svc.vender(5, DTO_BASE);
  assert.equal(etiquetas[0].fechamentoDiaSemana, isoWeekdayForDate(saoPauloDateKey(new Date())!));
});

function recorrenciaAgendaMocks() {
  const chamadas: any[] = [];
  const recorrencia = {
    vinculoEspelhoSnapshot: async () => ({ id: 'v1' }),
    // F2 (09/08) — `definirDiasDoCliente` escreve o PLANO direto (era vínculo +
    // espelho). A porta canônica virou UMA chamada só, e ela devolve os avisos.
    definirDiasDoCliente: async (_c: number, clienteId: string, dias: number[]) => {
      chamadas.push(['definir', clienteId, dias]);
      return { vinculoIds: ['v1'], diasSemana: dias.join(','), avisos: [] };
    },
  } as any;
  const agenda = {
    espelharVinculoCadastro: async (_c: number, vinculoId: string) => {
      chamadas.push(['espelhar', vinculoId]);
      return { avisos: [] };
    },
  } as any;
  return { chamadas, recorrencia, agenda };
}

test('ouro nº1: cliente SEM dia nenhum + 2 datas distintas na página → dia preenchido pela porta canônica', async () => {
  const { chamadas, recorrencia, agenda } = recorrenciaAgendaMocks();
  const hoje = saoPauloDateKey(new Date())!;
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega: {
        findFirst: async () => null,
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        // A busca das datas distintas é a única com customerProfileId no where.
        findMany: async (args: any) =>
          args?.where?.customerProfileId
            ? [
                { deliveredAt: new Date(`${hoje}T12:00:00-03:00`) },
                { deliveredAt: new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - 7 * 86400000) },
              ]
            : [],
      },
      clienteProduto: {
        findMany: async (args: any) => (args?.where?.productId ? [] : [{ id: 'v1' }]),
        findFirst: async () => null,
        create: async () => ({}),
        update: async () => ({}),
        // vínculos ativos = 1 (não precisa criar o do produto da venda).
        count: async () => 1,
      },
    }) as any,
    logisticaMock() as any,
    recorrencia,
    agenda,
  );
  await svc.vender(5, DTO_BASE);
  const diaHoje = isoWeekdayForDate(hoje);
  // 🔴 F2: UMA porta só. Antes eram duas escritas (vínculo + espelho) e a
  // segunda podia falhar calada, deixando "dia na tela, cliente fora da rota".
  assert.deepEqual(chamadas, [['definir', 'cli-1', [diaHoje]]]);
});

test('ouro nº1: cliente que JÁ tem dia cadastrado NUNCA é reescrito calado', async () => {
  const { chamadas, recorrencia, agenda } = recorrenciaAgendaMocks();
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      logisticaPlanoEntrega: { findMany: async () => [], count: async () => 1 },
    }) as any,
    logisticaMock() as any,
    recorrencia,
    agenda,
  );
  await svc.vender(5, DTO_BASE);
  assert.deepEqual(chamadas, []);
});

test('finalizar: dia diferente de hoje RE-ETIQUETA a sessão de hoje e salva a Rota do dia escolhido', async () => {
  const hoje = saoPauloDateKey(new Date())!;
  const diaHoje = isoWeekdayForDate(hoje);
  const alvo = (diaHoje % 7) + 1;
  const rows = [vendaDeMesa('f1', 'a', hoje)];
  const retags: any[] = [];
  const criados: any[] = [];
  const entrega = entregaMockPorJanela(rows);
  entrega.updateMany = async (args: any) => {
    retags.push(args);
    // O mock reflete o retag (o serviço relê a página DEPOIS de re-etiquetar).
    rows.forEach((r) => { r.fechamentoDiaSemana = args.data.fechamentoDiaSemana; });
    return { count: rows.length };
  };
  const paradasCriadas: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      entrega,
      customerProfile: perfilVivoMock,
      logisticaRotaModelo: {
        findFirst: async () => null,
        create: async (args: any) => { criados.push(args.data); return { id: 'rota-nova' }; },
        update: async () => ({}),
      },
      logisticaRotaModeloParada: {
        createMany: async ({ data }: any) => { paradasCriadas.push(...data); return { count: data.length }; },
        deleteMany: async () => ({ count: 0 }),
      },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.finalizar(5, alvo);
  assert.equal(r.dia, alvo);
  assert.equal(r.clientes, 1);
  assert.equal(retags.length, 1);
  assert.equal(retags[0].data.fechamentoDiaSemana, alvo);
  // Só a sessão de HOJE se move (etiqueta de hoje ou vazia) — dia editado no
  // histórico fica onde está.
  assert.deepEqual(retags[0].where.OR, [{ fechamentoDiaSemana: diaHoje }, { fechamentoDiaSemana: null }]);
  assert.equal(criados[0].diaSemana, alvo);
  assert.match(criados[0].nome, /^Rota de /);
  assert.deepEqual(
    paradasCriadas.map((parada) => ({
      customerProfileId: parada.customerProfileId,
      localId: parada.localId,
      ordem: parada.ordem,
    })),
    [{ customerProfileId: 'a', localId: null, ordem: 1 }],
  );
});

test('finalizar: dia sem nada registrado → recusa com mensagem humana', async () => {
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({ entrega: entregaMockPorJanela([]) }) as any,
    logisticaMock() as any,
  );
  await assert.rejects(() => svc.finalizar(5, 3), /Nada registrado/);
});

// 🔴 A VACINA DO "CLICO EM FINALIZAR E NÃO FAZ NADA" (dono, 09/08). Config
// VAZIA — sem chave de modo nenhuma, que é o estado real de toda empresa desde
// que os Ajustes pararam de oferecer o toggle: o dia TEM que fechar.
test('finalizar: config sem chave de modo fecha o dia (a chave morta não barra)', async () => {
  const hoje = saoPauloDateKey(new Date())!;
  const criados: any[] = [];
  const svc = new LogisticaFechamentoDiaService(
    prismaMock({
      logisticaConfig: { findUnique: async () => ({}) },
      entrega: entregaMockPorJanela([vendaDeMesa('f1', 'a', hoje)]),
      customerProfile: perfilVivoMock,
      logisticaRotaModelo: { findFirst: async () => null, create: async (args: any) => { criados.push(args.data); return {}; }, update: async () => ({}) },
    }) as any,
    logisticaMock() as any,
  );
  const r = await svc.finalizar(5, isoWeekdayForDate(hoje));
  assert.equal(r.ok, true);
  assert.equal(r.clientes, 1);
  assert.equal(criados.length, 1, 'a rota do dia tem que ser salva');
});
