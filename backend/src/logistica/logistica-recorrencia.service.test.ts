import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LogisticaRecorrenciaService,
  resolveValorUnit,
  parseDiasSemana,
  isoDow,
  parseDateOrNull,
} from './logistica-recorrencia.service';

// LOGÍSTICA-MOBILE M2 — prova o CRUD do vínculo produto×cliente + as peças puras
// que sobreviveram: valor unitário, dias-da-semana e parse de data.
//
// 🔴 F1 (09/08) — O QUE SAIU DAQUI: os testes de `gerarDia`/`getDiaPreview` que
// exercitavam o motor legado lendo `ClienteProduto` (idempotência por cliente/
// local, cadência `dueOnDay`/`nextProximaData`, agregação multi-vínculo). Esse
// motor não existe mais: quem gera o dia é a AGENDA V2, e quem prova o gerador
// é `logistica-agenda-generateday.service.test.ts`. Teste que protege caminho
// morto passa verde enquanto o produto quebra — por isso morreu junto.

// ── mock mínimo do Prisma p/ o CRUD do vínculo ───────────────────────────────
// Simula a persistência: entregas ficam num array; o findFirst de idempotência
// enxerga o que já foi criado NAQUELE dia (mesmo comportamento do índice real).
function buildPrismaMock(vinculos: any[], contatos: any[] = []) {
  const entregas: any[] = [];
  const cpUpdates: any[] = [];
  const itensCriados: any[] = [];
  // clona os vínculos p/ o update ser observável sem mutar a fixture.
  const vinculosState = vinculos.map((v) => ({ ...v }));

  const cpDeletes: string[] = [];
  const prisma: any = {
    contato: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        const candidatos = contatos.filter(
          (c) =>
            c.companyId === w.companyId &&
            c.customerProfileId === w.customerProfileId &&
            (w.isPrincipal === undefined || c.isPrincipal === w.isPrincipal),
        );
        if (candidatos.length === 0) return null;
        if (args?.orderBy?.updatedAt === 'desc') {
          return [...candidatos].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];
        }
        return candidatos[0];
      },
    },
    clienteProduto: {
      findMany: async (_args: any) => vinculosState,
      // findFirst company-scoped (usado por remove): só acha se id E companyId batem.
      findFirst: async (args: any) => {
        const w = args.where || {};
        const row = vinculosState.find(
          (v) => v.id === w.id && (w.companyId === undefined || v.companyId === w.companyId),
        );
        return row ? { id: row.id } : null;
      },
      update: async (args: any) => {
        const row = vinculosState.find((v) => v.id === args.where.id);
        if (row) Object.assign(row, args.data);
        cpUpdates.push({ id: args.where.id, data: args.data });
        return row;
      },
      delete: async (args: any) => {
        const idx = vinculosState.findIndex((v) => v.id === args.where.id);
        if (idx >= 0) vinculosState.splice(idx, 1);
        cpDeletes.push(args.where.id);
        return { id: args.where.id };
      },
    },
    entrega: {
      findFirst: async (args: any) => {
        const w = args.where;
        const gte = w.scheduledAt?.gte instanceof Date ? w.scheduledAt.gte.getTime() : -Infinity;
        const lte = w.scheduledAt?.lte instanceof Date ? w.scheduledAt.lte.getTime() : Infinity;
        // MULTILOCAL — idempotência agora inclui localId (semântica do Prisma real):
        // undefined = não filtra; null = "IS NULL" (entrega sem local); string = match
        // exato do local. Fixtures sem localId (null/undefined) caem no ramo null.
        const localMatch = (e: any) =>
          w.localId === undefined ? true : w.localId === null ? e.localId == null : e.localId === w.localId;
        return (
          entregas.find(
            (e) =>
              e.companyId === w.companyId &&
              e.customerProfileId === w.customerProfileId &&
              localMatch(e) &&
              e.scheduledAt instanceof Date &&
              e.scheduledAt.getTime() >= gte &&
              e.scheduledAt.getTime() <= lte,
          ) || null
        );
      },
      create: async (args: any) => {
        const id = `entrega-${entregas.length + 1}`;
        const row = { id, ...args.data };
        entregas.push(row);
        // captura os itens aninhados (create nested)
        const itens = args.data.itens?.create || [];
        for (const it of itens) itensCriados.push({ entregaId: id, ...it });
        return { id };
      },
    },
  };

  return { prisma, entregas, cpUpdates, itensCriados, vinculosState, cpDeletes };
}

const svc = (prisma: any) => new LogisticaRecorrenciaService(prisma);

// ── 1) lógica pura ────────────────────────────────────────────────────────────
test('isoDow: segunda=1 … domingo=7', () => {
  // 2026-07-06 é uma segunda-feira.
  assert.equal(isoDow(new Date('2026-07-06T12:00:00')), 1);
  // 2026-07-12 é um domingo.
  assert.equal(isoDow(new Date('2026-07-12T12:00:00')), 7);
});

test('parseDiasSemana: limpa/filtra fora de 1..7', () => {
  assert.deepEqual(parseDiasSemana('1,3,5'), [1, 3, 5]);
  assert.deepEqual(parseDiasSemana('0,8, 2 ,x'), [2]);
  assert.deepEqual(parseDiasSemana(null), []);
});

test('resolveValorUnit: acordado > catálogo > precoPadrao', () => {
  assert.equal(resolveValorUnit({ precoAcordado: 12, product: { price: 20 }, customerProfile: { precoPadrao: 30 } }), 12);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: { priceCents: 2500 }, customerProfile: { precoPadrao: 30 } }), 25);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: null, customerProfile: { precoPadrao: 30 } }), 30);
  assert.equal(resolveValorUnit({ precoAcordado: null, product: null, customerProfile: null }), 0);
});

// ── 6) TASK 9 — remove (hard delete) do vínculo produto×cliente ──────────────
test('remove: apaga o vínculo da própria empresa e devolve true', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      companyId: 1,
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, cpDeletes, vinculosState } = buildPrismaMock(vinculos);
  const ok = await svc(prisma).remove(1, 'cp-1');
  assert.equal(ok, true);
  assert.deepEqual(cpDeletes, ['cp-1']);
  assert.equal(vinculosState.length, 0, 'o vínculo some de vez');
});

test('remove: vínculo de OUTRA empresa → false (company-scoped, não apaga)', async () => {
  const vinculos = [
    {
      id: 'cp-1',
      companyId: 1,
      customerProfileId: 'conta-1',
      productId: 10,
      qtdPadrao: 1,
      precoAcordado: null,
      product: { id: 10, name: 'Galão 20L', price: 10, priceCents: null },
      customerProfile: { id: 'conta-1', name: 'Dona Maria', precoPadrao: null },
    },
  ];
  const { prisma, cpDeletes, vinculosState } = buildPrismaMock(vinculos);
  // empresa 999 tenta apagar o vínculo da empresa 1 → não acha → false, nada apagado.
  const ok = await svc(prisma).remove(999, 'cp-1');
  assert.equal(ok, false);
  assert.equal(cpDeletes.length, 0);
  assert.equal(vinculosState.length, 1);
});

test('remove: id inexistente → false', async () => {
  const { prisma } = buildPrismaMock([]);
  assert.equal(await svc(prisma).remove(1, 'nao-existe'), false);
});

// ── 7) BUG 4 (11/07) — parseDateOrNull rejeita data de calendário IMPOSSÍVEL ──
// Antes, "YYYY-MM-DD" bem-formado mas com mês/dia fora do calendário (13/40, 00/00)
// fazia overflow SILENCIOSO do JS Date (new Date(y, m-1, d) rola pro mês/ano
// seguinte) e getTime() nunca virava NaN — a data rolada passava como válida e
// podia materializar Entrega/PATCH proximaData no dia ERRADO. Round-trip fecha o buraco.
test('parseDateOrNull: mês/dia impossíveis (overflow) → null, não rola pro dia seguinte', () => {
  assert.equal(parseDateOrNull('2026-13-40'), null, 'mês 13 + dia 40 não é uma data válida');
  assert.equal(parseDateOrNull('2026-02-30'), null, '30 de fevereiro não existe');
  assert.equal(parseDateOrNull('2026-00-00'), null, 'mês/dia 00 não é uma data válida');
});

test('parseDateOrNull: "YYYY-MM-DD" válido continua parseando certo (fuso local)', () => {
  const d = parseDateOrNull('2026-07-11');
  assert.ok(d instanceof Date);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 6, 'julho = índice 6');
  assert.equal(d!.getDate(), 11);
});

test('parseDateOrNull: entrada vazia/lixo → null (contrato preservado)', () => {
  assert.equal(parseDateOrNull(null), null);
  assert.equal(parseDateOrNull(undefined), null);
  assert.equal(parseDateOrNull('abc'), null);
});

function assertNoRecurrencePrices(value: unknown, path = 'response'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRecurrencePrices(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(
      key === 'precoAcordado' || key === 'precoCatalogo' || key === 'price' || key === 'priceCents',
      false,
      `chave de preço ${path}.${key} deve estar ausente`,
    );
    assertNoRecurrencePrices(nested, `${path}.${key}`);
  }
}

const GERENTE_SEM_COBRANCA = {
  id: 9,
  companyId: 7,
  role: 'ADMIN',
  canViewBilling: false,
};

test('listProdutos: ator sem cobrança não consulta nem serializa preço do catálogo', async () => {
  let query: any;
  const prisma: any = {
    product: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 10,
            name: 'Galão',
            unidade: 'un',
            usaLogistica: true,
            price: 20,
            priceCents: 2000,
          },
        ];
      },
    },
  };

  const result = await svc(prisma).listProdutos(7, GERENTE_SEM_COBRANCA);
  assert.deepEqual(result, [{ id: 10, nome: 'Galão', unidade: 'un', usaLogistica: true }]);
  assertNoRecurrencePrices(result);
  assert.equal('price' in query.select, false);
  assert.equal('priceCents' in query.select, false);
});

test('listByCliente: ator sem cobrança recebe vínculo operacional sem preços', async () => {
  let query: any;
  const prisma: any = {
    clienteProduto: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 'cp-1',
            customerProfileId: 'cliente-1',
            productId: 10,
            qtdPadrao: 2,
            precoAcordado: 15,
            ativo: true,
            localId: null,
            product: {
              id: 10,
              name: 'Galão',
              unidade: 'un',
              price: 20,
              priceCents: 2000,
            },
          },
        ];
      },
    },
    logisticaPlanoEntrega: { findMany: async () => [] },
  };

  const result = await svc(prisma).listByCliente(7, 'cliente-1', GERENTE_SEM_COBRANCA);
  assert.equal(result[0].qtdPadrao, 2);
  assert.equal(result[0].produto?.nome, 'Galão');
  assertNoRecurrencePrices(result);
  assert.equal('precoAcordado' in query.select, false);
  assert.equal('price' in query.select.product.select, false);
  assert.equal('priceCents' in query.select.product.select, false);
});

// 🔴 F2 (09/08) — O DIA VEM DO PLANO. Enquanto `ClienteProduto.diasSemana`
// existia, a tela do cadastro e o traçar rota liam tabelas diferentes e
// discordavam (medido em 05/08: filtro trazia SEG, legenda dizia "SEX/QUI/SÁB").
// Agora o campo do DTO é PROJEÇÃO de `LogisticaPlanoEntrega.diaSemana`: uma
// pergunta, uma resposta — e igual pra todos os vínculos, porque o dia é da
// VISITA do cliente, nunca do produto.
test('listByCliente: diasSemana é a UNIÃO dos dias do PLANO, nunca do vínculo', async () => {
  let cpQuery: any;
  const prisma: any = {
    clienteProduto: {
      findMany: async (args: any) => {
        cpQuery = args;
        return [
          { id: 'cp-1', customerProfileId: 'cliente-1', productId: 10, qtdPadrao: 2, precoAcordado: 15, ativo: true, localId: null, product: { id: 10, name: 'Galão', unidade: 'un', price: 20, priceCents: 2000 } },
          { id: 'cp-2', customerProfileId: 'cliente-1', productId: 11, qtdPadrao: 1, precoAcordado: null, ativo: true, localId: null, product: { id: 11, name: 'Água 5L', unidade: 'un', price: 8, priceCents: 800 } },
        ];
      },
    },
    logisticaPlanoEntrega: {
      // fora de ordem e com repetido de propósito: sai normalizado.
      findMany: async () => [{ diaSemana: 5 }, { diaSemana: 1 }, { diaSemana: 5 }],
    },
  };

  const result = await svc(prisma).listByCliente(7, 'cliente-1', { role: 'ADMIN', canViewBilling: true });
  assert.equal(result[0].diasSemana, '1,5');
  assert.equal(result[1].diasSemana, '1,5', 'o dia é do CLIENTE — todo vínculo enxerga o mesmo');
  assert.equal(
    'diasSemana' in cpQuery.select,
    false,
    'o vínculo NÃO pode nem ser consultado por dia — a coluna morreu na F2',
  );
});

test('catálogo e vínculo preservam preços para dono/master', async () => {
  const owner = { id: 1, companyId: 7, role: 'ADMIN', canViewBilling: true };
  const prisma: any = {
    product: {
      findMany: async () => [
        { id: 10, name: 'Galão', unidade: 'un', usaLogistica: true, price: null, priceCents: 2150 },
      ],
    },
    clienteProduto: {
      findMany: async () => [
        {
          id: 'cp-1',
          customerProfileId: 'cliente-1',
          productId: 10,
          qtdPadrao: 2,
          precoAcordado: 19,
          ativo: true,
          localId: null,
          product: { id: 10, name: 'Galão', unidade: 'un', price: null, priceCents: 2150 },
        },
      ],
    },
    logisticaPlanoEntrega: { findMany: async () => [] },
  };

  const produtos = await svc(prisma).listProdutos(7, owner);
  const vinculos = await svc(prisma).listByCliente(7, 'cliente-1', owner);
  assert.equal(produtos[0].precoCatalogo, 21.5);
  assert.equal(vinculos[0].precoAcordado, 19);
  assert.equal(vinculos[0].produto?.precoCatalogo, 21.5);
});

// ══════════════════════════════════════════════════════════════════════════════
// PR18072026 W1 — façade de produtos sob /logistica (POST/PATCH /logistica/produtos)
// ══════════════════════════════════════════════════════════════════════════════

function buildProdutoPrisma(seed: any[] = []) {
  const store = new Map<number, any>(seed.map((row) => [row.id, { ...row }]));
  let nextId = 100;
  const prisma: any = {
    product: {
      create: async (args: any) => {
        const id = nextId++;
        const row = { id, ...args.data };
        store.set(id, row);
        return row;
      },
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const row = store.get(where.id);
        if (!row) return null;
        if (where.companyId != null && row.companyId !== where.companyId) return null;
        return { id: row.id };
      },
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data);
        return row;
      },
    },
  };
  return { prisma, store };
}

test('createProduto: cria produto tenant_product/active/usaLogistica=true company-scoped', async () => {
  const { prisma, store } = buildProdutoPrisma();
  const dto = await svc(prisma).createProduto(7, { nome: 'Galão 20L', unidade: 'galão', preco: 12.5, estoque: 30 });

  assert.equal(dto.nome, 'Galão 20L');
  assert.equal(dto.unidade, 'galão');
  assert.equal(dto.preco, 12.5);
  assert.equal(dto.estoque, 30);
  assert.equal(dto.ativo, true);
  const row = store.get(dto.id)!;
  assert.equal(row.companyId, 7);
  assert.equal(row.kind, 'tenant_product');
  assert.equal(row.status, 'active');
  assert.equal(row.usaLogistica, true);
  assert.equal(row.priceCents, 1250);
});

test('createProduto: nome vazio rejeita; preco/estoque omitidos nascem 0', async () => {
  const { prisma } = buildProdutoPrisma();
  await assert.rejects(() => svc(prisma).createProduto(7, { nome: '' }), /Nome é obrigatório/);
  const dto = await svc(prisma).createProduto(7, { nome: 'Sem preço' });
  assert.equal(dto.preco, 0);
  assert.equal(dto.estoque, 0);
});

test('updateProduto: edita nome/unidade/preco/estoque (PATCH parcial)', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const dto = await svc(prisma).updateProduto(7, '501', { preco: 15, estoque: 8 });
  assert.equal(dto!.preco, 15);
  assert.equal(dto!.estoque, 8);
  assert.equal(dto!.nome, 'Galão', 'nome omitido não muda');
  assert.equal(store.get(501)!.priceCents, 1500);
});

test('updateProduto: ativo=false ARQUIVA (status=archived), some do picker sem apagar o produto', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const dto = await svc(prisma).updateProduto(7, '501', { ativo: false });
  assert.equal(dto!.ativo, false);
  assert.equal(store.get(501)!.status, 'archived');
  assert.ok(store.has(501), 'produto continua existindo — vínculos não quebram');
});

test('updateProduto: id de OUTRA empresa → null (404 no controller), nada é escrito', async () => {
  const { prisma, store } = buildProdutoPrisma([
    { id: 501, companyId: 7, name: 'Galão', unidade: 'un', price: 10, priceCents: 1000, stock: 5, status: 'active' },
  ]);
  const res = await svc(prisma).updateProduto(999, '501', { preco: 999 });
  assert.equal(res, null);
  assert.equal(store.get(501)!.price, 10, 'preço original intocado');
});

test('updateProduto: id inexistente/inválido → null', async () => {
  const { prisma } = buildProdutoPrisma();
  assert.equal(await svc(prisma).updateProduto(7, 'nao-numero', {}), null);
  assert.equal(await svc(prisma).updateProduto(7, '999', {}), null);
});
