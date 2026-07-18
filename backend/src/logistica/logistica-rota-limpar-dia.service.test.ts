import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaService, resolveDayRange } from './logistica-rota.service';
import { canonicalRouteDate } from './logistica-route-billing.service';

/**
 * PR18072026 Onda 1 — testes de `limparDia`. Espelha o harness de
 * `logistica-rota-encerrar.service.test.ts` ($transaction que simula commit/
 * rollback DE VERDADE), mas com o DESFECHO diferente: "Limpar dia" CANCELA as
 * abertas (decisão do dono, 18/07), não devolve pra pendência como o encerrar.
 */

type EntregaRow = {
  id: string;
  companyId: number;
  entregadorId: number | null;
  status: string;
  rotaOrdem: number | null;
  etaAt: Date | null;
  startedAt: Date | null;
  scheduledAt: Date | null;
};

type RouteRow = {
  id: string;
  companyId: number;
  entregadorId: number;
  routeDate: string;
  status: string;
  operationalEndedAt: Date | null;
};

const DATE = '2026-07-18';
const { start: DAY_START } = resolveDayRange(DATE);

function atHour(h: number): Date {
  const d = new Date(DAY_START);
  d.setHours(h, 0, 0, 0);
  return d;
}

function matchesBase(row: EntregaRow, where: any): boolean {
  if (where.companyId != null && row.companyId !== where.companyId) return false;
  if (where.entregadorId != null && row.entregadorId !== where.entregadorId) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  return true;
}

function matchesOrBranch(row: EntregaRow, branch: any): boolean {
  if (Object.prototype.hasOwnProperty.call(branch, 'scheduledAt') && branch.scheduledAt === null) {
    if (row.scheduledAt !== null) return false;
    if (branch.status?.in && !branch.status.in.includes(row.status)) return false;
    return true;
  }
  if (branch.scheduledAt && typeof branch.scheduledAt === 'object') {
    if (!row.scheduledAt) return false;
    const t = row.scheduledAt.getTime();
    if (branch.scheduledAt.gte && t < new Date(branch.scheduledAt.gte).getTime()) return false;
    if (branch.scheduledAt.lte && t > new Date(branch.scheduledAt.lte).getTime()) return false;
    return true;
  }
  return true;
}

function matchesWhere(row: EntregaRow, where: any): boolean {
  if (!matchesBase(row, where)) return false;
  if (Array.isArray(where.OR)) return where.OR.some((branch: any) => matchesOrBranch(row, branch));
  return true;
}

function buildHarness(seed: EntregaRow[], routeSeed: RouteRow[] = []) {
  const store = new Map<string, EntregaRow>(seed.map((row) => [row.id, { ...row }]));
  const routeStore = new Map<string, RouteRow>(routeSeed.map((row) => [row.id, { ...row }]));
  const financeiroChargeCalls: string[] = [];
  let failNextUpdateMany = false;

  function cloneStore(): Map<string, EntregaRow> {
    const clone = new Map<string, EntregaRow>();
    for (const [id, row] of store) clone.set(id, { ...row });
    return clone;
  }

  function cloneRoutes(): Map<string, RouteRow> {
    const clone = new Map<string, RouteRow>();
    for (const [id, row] of routeStore) clone.set(id, { ...row });
    return clone;
  }

  function financeiroChargeGuard(method: string) {
    return async () => {
      financeiroChargeCalls.push(method);
      throw new Error(`NUNCA deve chamar FinanceiroCharge.${method} a partir de limparDia`);
    };
  }

  function buildTx(working: Map<string, EntregaRow>, workingRoutes: Map<string, RouteRow>) {
    return {
      entrega: {
        updateMany: async ({ where, data }: any) => {
          if (failNextUpdateMany) throw new Error('falha injetada (simulando erro de banco no meio da transação)');
          let count = 0;
          for (const row of working.values()) {
            if (!matchesWhere(row, where)) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      },
      logisticaRoute: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of workingRoutes.values()) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.entregadorId != null && row.entregadorId !== where.entregadorId) continue;
            if (where.routeDate != null && row.routeDate !== where.routeDate) continue;
            if (where.status?.in && !where.status.in.includes(row.status)) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      },
      financeiroCharge: {
        create: financeiroChargeGuard('create'),
        update: financeiroChargeGuard('update'),
        updateMany: financeiroChargeGuard('updateMany'),
        delete: financeiroChargeGuard('delete'),
        deleteMany: financeiroChargeGuard('deleteMany'),
      },
    };
  }

  const prisma: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const working = cloneStore();
      const workingRoutes = cloneRoutes();
      const tx = buildTx(working, workingRoutes);
      const result = await callback(tx); // se lançar, propaga SEM tocar os stores (rollback)
      store.clear();
      for (const [id, row] of working) store.set(id, row);
      routeStore.clear();
      for (const [id, row] of workingRoutes) routeStore.set(id, row);
      return result;
    },
  };

  return {
    service: new LogisticaRotaService(prisma, {} as any),
    store,
    routeStore,
    financeiroChargeCalls,
    setFailNextUpdateMany: (value: boolean) => { failNextUpdateMany = value; },
  };
}

function seedRow(overrides: Partial<EntregaRow> & { id: string }): EntregaRow {
  return {
    companyId: 7,
    entregadorId: 42,
    status: 'agendada',
    rotaOrdem: null,
    etaAt: null,
    startedAt: null,
    scheduledAt: atHour(9),
    ...overrides,
  };
}

// ── 1. Abertas viram CANCELADA (nunca pendência) ──────────────────────────────
test('limparDia: agendada/em_rota do dia viram cancelada, com rotaOrdem/etaAt/startedAt limpos', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, etaAt: atHour(10), startedAt: atHour(9) }),
    // Diferente do encerrarRota: mesmo uma 'agendada' CRUA (nunca passou por
    // planejar/iniciar) é cancelada — Limpar Dia descarta TUDO que está aberto.
    seedRow({ id: 'd-agendada-crua', status: 'agendada' }),
  ]);

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.ok, true);
  assert.equal(result.resumo.canceladas, 2);

  const emRota = h.store.get('d-em-rota')!;
  assert.equal(emRota.status, 'cancelada');
  assert.equal(emRota.rotaOrdem, null);
  assert.equal(emRota.etaAt, null);
  assert.equal(emRota.startedAt, null);

  const crua = h.store.get('d-agendada-crua')!;
  assert.equal(crua.status, 'cancelada');
});

// ── 2. Entregues/canceladas ficam intocadas ───────────────────────────────────
test('limparDia: entregue/cancelada ficam intocadas; FinanceiroCharge nunca é tocado', async () => {
  const deliveredAt = atHour(10);
  const h = buildHarness([
    seedRow({ id: 'd-entregue', status: 'entregue', rotaOrdem: 3, etaAt: deliveredAt, startedAt: deliveredAt }),
    seedRow({ id: 'd-cancelada-antes', status: 'cancelada' }),
    seedRow({ id: 'd-aberta', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
  ]);

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 1, 'só a aberta é contada/cancelada');
  const entregue = h.store.get('d-entregue')!;
  assert.equal(entregue.status, 'entregue');
  assert.equal(entregue.rotaOrdem, 3, 'rotaOrdem de entrega entregue não pode ser limpo');
  assert.deepEqual(entregue.etaAt, deliveredAt);

  const canceladaAntes = h.store.get('d-cancelada-antes')!;
  assert.equal(canceladaAntes.status, 'cancelada');

  assert.deepEqual(h.financeiroChargeCalls, [], 'nenhum método de FinanceiroCharge deve ser chamado');
});

// ── 3. Escopo por motorista e por empresa ─────────────────────────────────────
test('limparDia: escopo por motorista (outro motorista/empresa ficam intocados)', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-motorista-42', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
    seedRow({ id: 'd-outro-motorista', entregadorId: 99, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
    seedRow({ id: 'd-outra-empresa', companyId: 8, status: 'agendada' }),
  ]);

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 1);
  assert.equal(h.store.get('d-motorista-42')!.status, 'cancelada');
  assert.equal(h.store.get('d-outro-motorista')!.status, 'em_rota', 'fora do escopo do motorista 42 — intocada');
  assert.equal(h.store.get('d-outra-empresa')!.status, 'agendada', 'empresa 8 intocada');
});

// ── 4. Encerra a rota OPERACIONALMENTE (decoupled da cobrança) ───────────────
test('limparDia: marca operationalEndedAt na rota ACTIVE sem tocar o status de cobrança', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) })],
    [
      { id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'ACTIVE', operationalEndedAt: null },
      { id: 'r-99', companyId: 7, entregadorId: 99, routeDate, status: 'ACTIVE', operationalEndedAt: null },
    ],
  );

  await h.service.limparDia(7, { date: DATE }, 42);

  const r42 = h.routeStore.get('r-42')!;
  assert.ok(r42.operationalEndedAt instanceof Date);
  assert.equal(r42.status, 'ACTIVE', 'status de cobrança NUNCA muda — só o campo operacional decoupled');

  const r99 = h.routeStore.get('r-99')!;
  assert.equal(r99.operationalEndedAt, null, 'rota de outro motorista fora do escopo — intocada');
});

// ── 5. Atomicidade ─────────────────────────────────────────────────────────
test('limparDia: falha injetada não deixa estado parcial (rollback)', async () => {
  const h = buildHarness([
    seedRow({ id: 'd1', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
    seedRow({ id: 'd2', status: 'agendada' }),
  ]);
  h.setFailNextUpdateMany(true);

  await assert.rejects(() => h.service.limparDia(7, { date: DATE }, 42), /falha injetada/);

  assert.equal(h.store.get('d1')!.status, 'em_rota', 'nada mudou — rollback');
  assert.equal(h.store.get('d2')!.status, 'agendada');

  h.setFailNextUpdateMany(false);
  const result = await h.service.limparDia(7, { date: DATE }, 42);
  assert.equal(result.resumo.canceladas, 2);
});

// ── 6. Idempotência ────────────────────────────────────────────────────────
test('limparDia: 2ª chamada seguida acha 0 abertas → canceladas: 0, sem erro', async () => {
  const h = buildHarness([
    seedRow({ id: 'd1', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
    seedRow({ id: 'd2', status: 'agendada' }),
  ]);

  const first = await h.service.limparDia(7, { date: DATE }, 42);
  assert.equal(first.resumo.canceladas, 2);

  const second = await h.service.limparDia(7, { date: DATE }, 42);
  assert.equal(second.ok, true);
  assert.equal(second.resumo.canceladas, 0, '2ª vez não re-conta as já canceladas');
});

// ── extra: sem entregas no dia → resposta normal, zerada ──────────────────
test('limparDia: dia sem nenhuma entrega devolve resumo zerado, sem erro', async () => {
  const h = buildHarness([]);
  const result = await h.service.limparDia(7, { date: DATE }, 42);
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 0 } });
});

// ── extra: companyId ausente rejeita antes de abrir transação ─────────────
test('limparDia: sem companyId lança BadRequestException', async () => {
  const h = buildHarness([]);
  await assert.rejects(() => h.service.limparDia(0 as any, { date: DATE }, 42), /Empresa não identificada/);
});
