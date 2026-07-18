import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { LogisticaPedidoPublicoService } from './logistica-pedido-publico.service';
import { LogisticaPedidoPublicoController } from './logistica-pedido-publico.controller';

// ============================================================================
// S6 PORTAL-PEDIDO — prova o FREIO do pedido público (feature DORMENTE):
//   1. flag global OFF (default) → GET e POST respondem 404 (controller);
//   2. toggle do tenant OFF → mesmo 404 (resposta idêntica, sem pista);
//   3. honeypot preenchido → 200 fake SEM efeito (nada criado);
//   4. telefone repetido REUSA o CustomerProfile (não duplica cliente);
//   5. preço vem do SERVIDOR — payload com preço é ignorado (regra de ouro);
//   6. tetos respeitados — qtd máx/item, máx de itens, teto diário da empresa.
// ============================================================================

const FLAG = 'HBX_PEDIDO_PUBLICO_ENABLED';
const TOKEN = 'tok-abc123deadbeef';
const COMPANY_ID = 7;

function flagOn() {
  process.env[FLAG] = 'true';
}
function flagOff() {
  delete process.env[FLAG];
}

// Mock Prisma mínimo: só o que o serviço toca. `profiles`/`entregas` são o
// "banco" mutável — o 2º pedido relê o profile criado pelo 1º.
function buildDb(
  opts: {
    cfg?: { pedidoPublicoAtivo?: boolean; pedidoPublicoToken?: string } | null;
    produtos?: Array<{ id: number; name?: string; price?: number | null; priceCents?: number | null; unidade?: string | null }>;
  } = {},
) {
  const cfg =
    opts.cfg === null
      ? null
      : {
          companyId: COMPANY_ID,
          pedidoPublicoAtivo: opts.cfg?.pedidoPublicoAtivo ?? true,
          pedidoPublicoToken: opts.cfg?.pedidoPublicoToken ?? TOKEN,
        };
  const produtos = (opts.produtos ?? [{ id: 11, name: 'Galão 20L', price: 12, priceCents: null, unidade: 'galão' }]).map(
    (p) => ({ name: 'Produto', price: null, priceCents: null, unidade: null, ...p }),
  );
  const profiles: Array<Record<string, any>> = [];
  const entregas: Array<Record<string, any>> = [];
  let seq = 0;

  const prisma: any = {
    logisticaConfig: {
      findFirst: async (args: any) => {
        const token = args?.where?.pedidoPublicoToken;
        if (!cfg || !token || cfg.pedidoPublicoToken !== token) return null;
        return { companyId: cfg.companyId, pedidoPublicoAtivo: cfg.pedidoPublicoAtivo };
      },
    },
    company: {
      findUnique: async (args: any) => (args?.where?.id === COMPANY_ID ? { name: 'Água Boa LTDA' } : null),
    },
    product: {
      findMany: async (args: any) => {
        const w = args?.where || {};
        if (w.companyId !== COMPANY_ID) return [];
        const ids: number[] | undefined = w.id?.in;
        return produtos
          .filter((p) => (ids ? ids.includes(p.id) : true))
          .map((p) => ({ id: p.id, name: p.name, price: p.price, priceCents: p.priceCents, unidade: p.unidade }));
      },
    },
    customerProfile: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        const row = profiles.find((p) => p.companyId === w.companyId && p.phoneNormalized === w.phoneNormalized);
        return row ? { id: row.id, endereco: row.endereco ?? null } : null;
      },
      create: async (args: any) => {
        const row = { id: `cli-${++seq}`, ...args.data };
        profiles.push(row);
        return { id: row.id, endereco: row.endereco ?? null };
      },
      update: async (args: any) => {
        const row = profiles.find((p) => p.id === args?.where?.id);
        if (row) Object.assign(row, args?.data || {});
        return row;
      },
    },
    contato: {
      findFirst: async () => null,
    },
    entrega: {
      create: async (args: any) => {
        const row = { id: `ent-${++seq}`, ...args.data };
        entregas.push(row);
        return { id: row.id };
      },
    },
  };
  return { prisma, profiles, entregas };
}

function pedidoOk(overrides: Record<string, unknown> = {}) {
  return {
    token: TOKEN,
    itens: [{ productId: 11, quantidade: 2 }],
    nome: 'Dona Maria',
    telefone: '(19) 99999-8888',
    endereco: 'Rua das Flores, 123 - Centro',
    ...overrides,
  };
}

// ── 1. flag global OFF → 404 seco no GET e no POST ───────────────────────────
test('flag OFF (default): GET catálogo e POST pedido respondem 404 — deploy inerte', async () => {
  flagOff();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const controller = new LogisticaPedidoPublicoController(service);

  assert.equal(await service.getCatalogo(TOKEN), null);
  await assert.rejects(() => controller.catalogo(TOKEN), NotFoundException);
  await assert.rejects(() => controller.criar(TOKEN, pedidoOk(), '1.2.3.4'), NotFoundException);
  assert.equal(entregas.length, 0);
});

// ── 2. toggle do tenant OFF → mesmo 404 (sem pista de qual gate barrou) ───────
test('tenant com pedidoPublicoAtivo=false: GET e POST respondem o MESMO 404', async () => {
  flagOn();
  const { prisma, entregas } = buildDb({ cfg: { pedidoPublicoAtivo: false } });
  const service = new LogisticaPedidoPublicoService(prisma);
  const controller = new LogisticaPedidoPublicoController(service);

  assert.equal(await service.getCatalogo(TOKEN), null);
  await assert.rejects(() => controller.catalogo(TOKEN), NotFoundException);
  await assert.rejects(() => controller.criar(TOKEN, pedidoOk(), '1.2.3.4'), NotFoundException);
  assert.equal(entregas.length, 0);
  flagOff();
});

// token errado = mesmo 404 (lookup unique não resolve).
test('token inválido responde 404 mesmo com a flag ON', async () => {
  flagOn();
  const { prisma } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  assert.equal(await service.getCatalogo('token-que-nao-existe'), null);
  const res = await service.criarPedido(pedidoOk({ token: 'token-que-nao-existe' }), null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_found');
  flagOff();
});

// ── 3. honeypot → 200 fake sem efeito ─────────────────────────────────────────
test('honeypot preenchido: responde ok SEM criar cliente nem entrega', async () => {
  flagOn();
  const { prisma, profiles, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const controller = new LogisticaPedidoPublicoController(service);

  const res = await controller.criar(TOKEN, pedidoOk({ _hp: 'preenchido-por-bot' }), '1.2.3.4');
  assert.deepEqual(res, { ok: true });
  assert.equal(profiles.length, 0);
  assert.equal(entregas.length, 0);
  flagOff();
});

// ── 4. telefone repetido reusa o CustomerProfile ──────────────────────────────
test('2 pedidos com o mesmo telefone: 1 cliente só (reusa o profile), 2 entregas', async () => {
  flagOn();
  const { prisma, profiles, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);

  const r1 = await service.criarPedido(pedidoOk(), null);
  // formatação diferente do MESMO número (com +55) tem de normalizar igual.
  const r2 = await service.criarPedido(pedidoOk({ telefone: '+55 19 99999-8888' }), null);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(profiles.length, 1);
  assert.equal(entregas.length, 2);
  assert.equal(entregas[0].customerProfileId, entregas[1].customerProfileId);
  // cliente novo do link nasce LEAD, nunca cliente direto.
  assert.equal(profiles[0].isLead, true);
  assert.equal(profiles[0].isCliente, false);
  assert.equal(profiles[0].endereco, 'Rua das Flores, 123 - Centro');
  flagOff();
});

// ── 5. preço SEMPRE do servidor ───────────────────────────────────────────────
test('payload com preço é IGNORADO: valorUnit/valor saem do catálogo do servidor', async () => {
  flagOn();
  const { prisma, entregas } = buildDb({
    produtos: [{ id: 11, name: 'Galão 20L', price: 12, priceCents: 1500 }], // catálogo real: R$ 15 (priceCents vence)
  });
  const service = new LogisticaPedidoPublicoService(prisma);

  const res = await service.criarPedido(
    pedidoOk({
      itens: [{ productId: 11, quantidade: 2, preco: 0.01, valorUnit: 0.01, valor: 0.01 }],
      valor: 0.01,
    }),
    null,
  );
  assert.equal(res.ok, true);
  assert.equal(entregas.length, 1);
  assert.equal(entregas[0].valor, 30); // 2 × R$15 do catálogo — nunca os R$0,01 do payload
  assert.equal(entregas[0].itens.create[0].valorUnit, 15);
  assert.equal(entregas[0].itens.create[0].qtdPrevista, 2);
  assert.equal(entregas[0].status, 'agendada');
  assert.match(String(entregas[0].notes), /Pedido pelo link/);
  // L4-A (18/07) — pedido pelo link é um pedido único do cliente (mesma
  // categoria do createEntrega manual), nunca recorrência.
  assert.equal(entregas[0].origem, 'avulsa');
  flagOff();
});

// produto fora do catálogo público (outra empresa / sem usaLogistica) = 400.
test('produto fora do catálogo da empresa: 400 de validação, nada criado', async () => {
  flagOn();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const res = await service.criarPedido(pedidoOk({ itens: [{ productId: 999, quantidade: 1 }] }), null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'validacao');
  assert.equal(entregas.length, 0);
  flagOff();
});

// ── 6. tetos ──────────────────────────────────────────────────────────────────
test('quantidade acima do teto por item (50) é rejeitada com 400', async () => {
  flagOn();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const res = await service.criarPedido(pedidoOk({ itens: [{ productId: 11, quantidade: 51 }] }), null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'validacao');
  assert.equal(entregas.length, 0);

  // linhas repetidas do MESMO produto somam pro teto (26+26 > 50 = rejeita).
  const res2 = await service.criarPedido(
    pedidoOk({ itens: [{ productId: 11, quantidade: 26 }, { productId: 11, quantidade: 26 }] }),
    null,
  );
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'validacao');
  flagOff();
});

test('mais de 20 itens no pedido é rejeitado com 400', async () => {
  flagOn();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const itens = Array.from({ length: 21 }, (_, i) => ({ productId: i + 1, quantidade: 1 }));
  const res = await service.criarPedido(pedidoOk({ itens }), null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'validacao');
  assert.equal(entregas.length, 0);
  flagOff();
});

test('teto diário da empresa (100): estourou → 200 genérico SEM criar nada', async () => {
  flagOn();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  const controller = new LogisticaPedidoPublicoController(service);
  // Simula o dia cheio direto no contador em memória (não cria 100 entregas à toa).
  (service as any).pedidosDia.set(COMPANY_ID, { day: new Date().toISOString().slice(0, 10), count: 100 });

  const res = await controller.criar(TOKEN, pedidoOk(), '1.2.3.4');
  assert.deepEqual(res, { ok: true }); // sem pista pro bot…
  assert.equal(entregas.length, 0); // …mas nada foi criado.
  flagOff();
});

// telefone lixo = 400 de validação normal (só honeypot finge sucesso).
test('telefone não normalizável (lixo) é rejeitado com 400', async () => {
  flagOn();
  const { prisma, entregas } = buildDb();
  const service = new LogisticaPedidoPublicoService(prisma);
  for (const telefone of ['abc', '123', '999999', '12345678901234567890']) {
    const res = await service.criarPedido(pedidoOk({ telefone }), null);
    assert.equal(res.ok, false, `telefone "${telefone}" devia falhar`);
    assert.equal(res.reason, 'validacao');
  }
  assert.equal(entregas.length, 0);
  flagOff();
});

// ── GET catálogo (caminho feliz): só dados públicos, preço de catálogo ────────
test('GET catálogo devolve nome da empresa + produtos usaLogistica com preço de catálogo', async () => {
  flagOn();
  const { prisma } = buildDb({
    produtos: [
      { id: 11, name: 'Galão 20L', price: 12, priceCents: null, unidade: 'galão' },
      { id: 12, name: 'Caixa 500ml', price: null, priceCents: 2490, unidade: 'caixa' },
    ],
  });
  const service = new LogisticaPedidoPublicoService(prisma);
  const res = await service.getCatalogo(TOKEN);
  assert.ok(res);
  assert.equal(res.empresaNome, 'Água Boa LTDA');
  assert.deepEqual(res.produtos, [
    { id: 11, nome: 'Galão 20L', preco: 12, unidade: 'galão' },
    { id: 12, nome: 'Caixa 500ml', preco: 24.9, unidade: 'caixa' },
  ]);
  flagOff();
});
