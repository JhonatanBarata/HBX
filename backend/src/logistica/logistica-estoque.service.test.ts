// PR27072026 F2 (27/07) — ESTOQUE DE CARGA: testes de LogisticaEstoqueService
// (declarar carga do dia, calcular vendido ao vivo, conferir retorno →
// bateu/sobrou/faltou). Mesmo molde de logistica-config-nivel.test.ts (prisma
// fake EM MEMÓRIA/stateful, node:test).
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaEstoqueService } from './logistica-estoque.service';

type FakeCargaRow = {
  id: string;
  companyId: number;
  dataISO: string;
  entregadorId: number | null;
  status: string;
  conferidaAt: Date | null;
  itens: Array<{
    id: string;
    productId: number;
    qtdCarregada: number;
    qtdVendidaSnapshot: number | null;
    qtdRetorno: number | null;
    resultado: string | null;
  }>;
};

function buildPrisma(opts: {
  produtos?: Array<{ id: number; name?: string; unidade?: string }>;
  entregas?: Array<any>;
} = {}) {
  const produtos = opts.produtos ?? [];
  const entregasRows = opts.entregas ?? [];
  const cargaRows: FakeCargaRow[] = [];
  let seq = 0;

  const produtoInfo = (id: number) => {
    const p = produtos.find((x) => x.id === id);
    return { id, name: p?.name ?? `Produto ${id}`, unidade: p?.unidade ?? 'un' };
  };
  const comProduto = (row: FakeCargaRow) => ({
    ...row,
    itens: row.itens.map((it) => ({ ...it, product: produtoInfo(it.productId) })),
  });

  const prisma: any = {
    product: {
      findMany: async ({ where }: any) => {
        const ids: number[] = where.id.in;
        return produtos.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id }));
      },
    },
    entrega: {
      findMany: async () => entregasRows,
    },
    logisticaCargaDia: {
      findFirst: async ({ where, select }: any) => {
        const row = cargaRows.find(
          (r) => r.companyId === where.companyId && r.dataISO === where.dataISO && r.entregadorId === where.entregadorId,
        );
        if (!row) return null;
        if (!select?.itens) return { id: row.id, status: row.status };
        return comProduto(row);
      },
      create: async ({ data }: any) => {
        seq += 1;
        const itens = (data.itens?.create ?? []).map((it: any, idx: number) => ({
          id: `item-${seq}-${idx}`,
          productId: it.productId,
          qtdCarregada: it.qtdCarregada,
          qtdVendidaSnapshot: null,
          qtdRetorno: null,
          resultado: null,
        }));
        const row: FakeCargaRow = {
          id: `carga-${seq}`,
          companyId: data.companyId,
          dataISO: data.dataISO,
          entregadorId: data.entregadorId ?? null,
          status: data.status ?? 'ABERTA',
          conferidaAt: null,
          itens,
        };
        cargaRows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = cargaRows.find((r) => r.id === where.id);
        if (!row) throw new Error('carga não encontrada');
        Object.assign(row, data);
        return row;
      },
    },
    logisticaCargaDiaItem: {
      deleteMany: async ({ where }: any) => {
        const row = cargaRows.find((r) => r.id === where.cargaDiaId);
        if (row) row.itens = [];
        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        for (const it of data as any[]) {
          const row = cargaRows.find((r) => r.id === it.cargaDiaId);
          seq += 1;
          row?.itens.push({
            id: `item-${seq}`,
            productId: it.productId,
            qtdCarregada: it.qtdCarregada,
            qtdVendidaSnapshot: null,
            qtdRetorno: null,
            resultado: null,
          });
        }
        return { count: (data as any[]).length };
      },
      update: async ({ where, data }: any) => {
        for (const row of cargaRows) {
          const item = row.itens.find((i) => i.id === where.id);
          if (item) {
            Object.assign(item, data);
            return item;
          }
        }
        throw new Error('item não encontrado');
      },
    },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma);
    },
  };
  return { prisma, cargaRows };
}

function fakeConfig(nivel: 'BASIC' | 'ADVANCED' | 'FULL') {
  return { getNivel: async () => ({ nivel }) } as any;
}

const ADMIN = { id: 1, companyId: 7, role: 'ADMIN', isSystemMaster: false };
const MASTER = { id: 1, companyId: 7, role: 'ADMIN', isSystemMaster: true };

// ── gate de nível (ADVANCED+) ────────────────────────────────────────────────

test('BASIC: getCargaDia/declararCarga/conferirRetorno recusam com Forbidden', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('BASIC'));
  await assert.rejects(() => svc.getCargaDia(7, undefined, ADMIN), /Advanced/);
  await assert.rejects(
    () => svc.declararCarga(7, { itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN),
    /Advanced/,
  );
  await assert.rejects(() => svc.conferirRetorno(7, { itens: [] }, ADMIN), /Advanced/);
});

test('Master passa por cima do teto do nível (BASIC liga se o Master mandar)', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('BASIC'));
  const dto = await svc.getCargaDia(7, '2026-07-27', MASTER);
  assert.equal(dto.declarada, false);
});

// ── declarar carga do dia ────────────────────────────────────────────────────

test('declarar: cria a carga ABERTA com os itens informados', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1, name: 'Galão 20L' }, { id: 2, name: 'Água com gás' }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  const dto = await svc.declararCarga(
    7,
    { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 50 }, { productId: 2, qtdCarregada: 20 }] },
    ADMIN,
  );
  assert.equal(dto.declarada, true);
  assert.equal(dto.status, 'ABERTA');
  assert.equal(dto.itens.length, 2);
  assert.equal(dto.itens[0].produtoNome, 'Galão 20L');
  assert.equal(dto.itens[0].qtdCarregada, 50);
  assert.equal(dto.itens[0].qtdVendida, 0, 'sem entrega ainda hoje → vendido 0');
  assert.equal(dto.itens[0].qtdEsperadaRetorno, 50);
});

test('declarar: produto de outra empresa (fora do catálogo) é recusado', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }] }); // produto 99 não existe
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await assert.rejects(
    () => svc.declararCarga(7, { itens: [{ productId: 99, qtdCarregada: 10 }] }, ADMIN),
    /não encontrado/,
  );
});

test('redeclarar enquanto ABERTA SUBSTITUI a lista de itens (corrigiu quantidade errada)', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }, { id: 2 }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  const dto = await svc.declararCarga(
    7,
    { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 30 }, { productId: 2, qtdCarregada: 5 }] },
    ADMIN,
  );
  assert.equal(dto.itens.length, 2, 'a lista antiga (só produto 1×10) foi SUBSTITUÍDA, não somada');
  const item1 = dto.itens.find((i) => i.productId === 1);
  assert.equal(item1?.qtdCarregada, 30);
});

test('redeclarar depois de CONFERIDA é recusado (carga fechada é imutável)', async () => {
  const { prisma, cargaRows } = buildPrisma({ produtos: [{ id: 1 }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  cargaRows[0].status = 'CONFERIDA'; // simula fechamento
  await assert.rejects(
    () => svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 99 }] }, ADMIN),
    /já foi conferida/,
  );
});

// ── ver o dia: vendido calculado AO VIVO ─────────────────────────────────────

test('getCargaDia (ABERTA): vendido soma EntregaItem.qtdEntregue (fallback qtdPrevista) das entregas do dia', async () => {
  const { prisma } = buildPrisma({
    produtos: [{ id: 1, name: 'Galão 20L' }],
    entregas: [
      { productId: null, quantidade: 0, itens: [{ productId: 1, qtdEntregue: 3, qtdPrevista: 3 }] },
      { productId: null, quantidade: 0, itens: [{ productId: 1, qtdEntregue: null, qtdPrevista: 2 }] }, // fallback p/ previsto
      // entrega legada SEM EntregaItem → cai no productId/quantidade da própria Entrega
      { productId: 1, quantidade: 4, itens: [] },
    ],
  });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 20 }] }, ADMIN);
  const dto = await svc.getCargaDia(7, '2026-07-27', ADMIN);
  assert.equal(dto.itens[0].qtdVendida, 9, '3 + 2 (fallback) + 4 (legado) = 9');
  assert.equal(dto.itens[0].qtdEsperadaRetorno, 11, '20 carregado - 9 vendido');
});

test('getCargaDia sem declaração no dia: declarada=false, itens vazio', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  const dto = await svc.getCargaDia(7, '2026-07-27', ADMIN);
  assert.equal(dto.declarada, false);
  assert.equal(dto.status, null);
  assert.deepEqual(dto.itens, []);
});

// ── conferir retorno: bateu / sobrou / faltou ────────────────────────────────

test('conferir: bateu quando retorno == carregado - vendido', async () => {
  const { prisma } = buildPrisma({
    produtos: [{ id: 1 }],
    entregas: [{ productId: null, quantidade: 0, itens: [{ productId: 1, qtdEntregue: 12, qtdPrevista: 12 }] }],
  });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 20 }] }, ADMIN);
  // esperado = 20 - 12 = 8
  const dto = await svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 8 }] }, ADMIN);
  assert.equal(dto.status, 'CONFERIDA');
  assert.equal(dto.itens[0].resultado, 'bateu');
  assert.equal(dto.itens[0].qtdVendida, 12, 'snapshot congelado da venda no momento da conferência');
});

test('conferir: sobrou quando retorno > esperado (voltou mais que devia)', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }] }); // 0 vendido hoje
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  // esperado = 10 - 0 = 10; retorno 12 > 10
  const dto = await svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 12 }] }, ADMIN);
  assert.equal(dto.itens[0].resultado, 'sobrou');
});

test('conferir: faltou quando retorno < esperado (furo de estoque)', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  // esperado = 10 - 0 = 10; retorno 6 < 10
  const dto = await svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 6 }] }, ADMIN);
  assert.equal(dto.itens[0].resultado, 'faltou');
});

test('conferir: falta informar retorno de 1 produto declarado → 400 nomeando o que falta', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1, name: 'Galão 20L' }, { id: 2, name: 'Água com gás' }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(
    7,
    { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }, { productId: 2, qtdCarregada: 5 }] },
    ADMIN,
  );
  await assert.rejects(
    () => svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 10 }] }, ADMIN),
    /Água com gás/,
  );
});

test('conferir sem carga declarada no dia → 400', async () => {
  const { prisma } = buildPrisma();
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await assert.rejects(
    () => svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 1 }] }, ADMIN),
    /Nenhuma carga declarada/,
  );
});

test('conferir 2× no mesmo dia é recusado (imutável depois de fechada)', async () => {
  const { prisma } = buildPrisma({ produtos: [{ id: 1 }] });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  await svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 10 }] }, ADMIN);
  await assert.rejects(
    () => svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 5 }] }, ADMIN),
    /já foi conferida/,
  );
});

test('getCargaDia (CONFERIDA): devolve o snapshot congelado, não recalcula vendido de novo', async () => {
  const { prisma } = buildPrisma({
    produtos: [{ id: 1 }],
    entregas: [{ productId: null, quantidade: 0, itens: [{ productId: 1, qtdEntregue: 3, qtdPrevista: 3 }] }],
  });
  const svc = new LogisticaEstoqueService(prisma, fakeConfig('ADVANCED'));
  await svc.declararCarga(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdCarregada: 10 }] }, ADMIN);
  await svc.conferirRetorno(7, { dataISO: '2026-07-27', itens: [{ productId: 1, qtdRetorno: 7 }] }, ADMIN);
  const dto = await svc.getCargaDia(7, '2026-07-27', ADMIN);
  assert.equal(dto.status, 'CONFERIDA');
  assert.equal(dto.itens[0].qtdVendida, 3);
  assert.equal(dto.itens[0].qtdRetorno, 7);
  assert.equal(dto.itens[0].resultado, 'bateu');
});
