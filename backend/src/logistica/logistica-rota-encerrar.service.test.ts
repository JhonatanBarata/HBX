import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaService, resolveDayRange } from './logistica-rota.service';
import { canonicalRouteDate } from './logistica-route-billing.service';

/**
 * PR17072026 Onda 1 — testes de `encerrarRota` (docs/PLANEJAMENTOS/PR17072026/
 * 01-backend-encerrar-rota.md). Espelha o estilo de fixture em memória de
 * logistica-admin-route.service.test.ts, mas com um `$transaction` que simula
 * commit/rollback DE VERDADE (clona o estado; só grava de volta se a callback
 * resolver; descarta se lançar) — necessário para o caso 4 (atomicidade).
 *
 * O mock de `prisma` de nível superior só expõe `$transaction` (nenhum
 * `entrega`/`financeiroCharge` fora do `tx`). Se o serviço algum dia deixar de
 * usar `prisma.$transaction(...)` e chamar `this.prisma.entrega...` direto,
 * TODOS os testes quebram na hora com "Cannot read properties of undefined" —
 * é uma prova estrutural extra de que o método é transacional.
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

const DATE = '2026-07-16';
const { start: DAY_START } = resolveDayRange(DATE);

function atHour(h: number): Date {
  const d = new Date(DAY_START);
  d.setHours(h, 0, 0, 0);
  return d;
}

function matchesBase(row: EntregaRow, where: any): boolean {
  if (where.companyId != null && row.companyId !== where.companyId) return false;
  if (where.entregadorId != null && row.entregadorId !== where.entregadorId) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
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
      throw new Error(`NUNCA deve chamar FinanceiroCharge.${method} a partir de encerrarRota`);
    };
  }

  function buildTx(working: Map<string, EntregaRow>, workingRoutes: Map<string, RouteRow>) {
    return {
      entrega: {
        findMany: async ({ where }: any) =>
          Array.from(working.values())
            .filter((row) => matchesWhere(row, where))
            .map((row) => ({ ...row })),
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
      // PR17072026 — encerrarRota marca operationalEndedAt na rota viva do dia
      // (campo OPERACIONAL decoupled; NUNCA mexe em `status`/cobrança).
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
      // Presente só para o caso 2 (cobranças permanecem): se encerrarRota algum
      // dia tocar em FinanceiroCharge, estes métodos derrubam o teste na hora.
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

// ── 1. Entregues permanecem ───────────────────────────────────────────────
test('encerrarRota: entrega entregue não muda status nem perde nada', async () => {
  const deliveredAt = atHour(10);
  const h = buildHarness([
    seedRow({ id: 'd-entregue', status: 'entregue', rotaOrdem: 3, etaAt: deliveredAt, startedAt: deliveredAt, scheduledAt: atHour(8) }),
  ]);

  const result = await h.service.encerrarRota(7, { date: DATE }, 42);

  assert.equal(result.ok, true);
  assert.equal(result.resumo.entregues, 1);
  assert.equal(result.resumo.pendentes, 0);
  const row = h.store.get('d-entregue')!;
  assert.equal(row.status, 'entregue');
  assert.equal(row.rotaOrdem, 3, 'rotaOrdem de entrega entregue não pode ser limpo');
  assert.deepEqual(row.etaAt, deliveredAt);
  assert.deepEqual(row.startedAt, deliveredAt);
});

// ── 2. Cobranças permanecem ───────────────────────────────────────────────
test('encerrarRota: nunca toca FinanceiroCharge (create/update/delete derrubam o teste)', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-entregue', status: 'entregue' }),
    seedRow({ id: 'd-cancelada', status: 'cancelada' }),
    seedRow({ id: 'd-aberta', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
  ]);

  await h.service.encerrarRota(7, { date: DATE }, 42);

  assert.deepEqual(h.financeiroChargeCalls, [], 'nenhum método de FinanceiroCharge deve ser chamado');
});

// ── 3. Abertas viram pendência ────────────────────────────────────────────
test('encerrarRota: agendada/em_rota que estavam na rota viram pendência; nunca cancelada', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, etaAt: atHour(10), startedAt: atHour(9) }),
    seedRow({ id: 'd-agendada-planejada', status: 'agendada', rotaOrdem: 1, etaAt: atHour(11) }),
    // Nunca passou por planejar/iniciar (rotaOrdem/etaAt/startedAt todos null):
    // já está no estado-alvo — não deve ser contada em pendentes nem escrita.
    seedRow({ id: 'd-agendada-crua', status: 'agendada' }),
    // Outro motorista da MESMA empresa: fora do escopo (entregadorId=42 na chamada).
    seedRow({ id: 'd-outro-motorista', entregadorId: 99, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) }),
  ]);

  const result = await h.service.encerrarRota(7, { date: DATE }, 42);

  assert.equal(result.resumo.pendentes, 2, 'só as 2 que estavam de fato na rota do motorista 42');
  assert.equal(result.resumo.total, 3, 'total é escopado por entregadorId (3 do motorista 42, não 4)');

  const emRota = h.store.get('d-em-rota')!;
  assert.equal(emRota.status, 'agendada');
  assert.equal(emRota.rotaOrdem, null);
  assert.equal(emRota.etaAt, null);
  assert.equal(emRota.startedAt, null);
  assert.deepEqual(emRota.scheduledAt, atHour(9), 'scheduledAt NUNCA muda (não backdata)');

  const agendadaPlanejada = h.store.get('d-agendada-planejada')!;
  assert.equal(agendadaPlanejada.status, 'agendada');
  assert.equal(agendadaPlanejada.rotaOrdem, null);
  assert.equal(agendadaPlanejada.etaAt, null);

  const crua = h.store.get('d-agendada-crua')!;
  assert.equal(crua.status, 'agendada');
  assert.equal(crua.rotaOrdem, null, 'já estava null — continua null (no-op), não é "revertida"');

  const outroMotorista = h.store.get('d-outro-motorista')!;
  assert.equal(outroMotorista.status, 'em_rota', 'fora do escopo do motorista 42 — intocada');
  assert.equal(outroMotorista.rotaOrdem, 0);

  // Nenhuma virou 'cancelada' em momento algum.
  for (const row of h.store.values()) assert.notEqual(row.status, 'cancelada');
});

// ── 4. Atomicidade ─────────────────────────────────────────────────────────
test('encerrarRota: falha injetada no meio da transação não deixa estado parcial (rollback)', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, etaAt: atHour(10), startedAt: atHour(9) }),
    seedRow({ id: 'd-agendada', status: 'agendada', rotaOrdem: 1, etaAt: atHour(11) }),
  ]);
  h.setFailNextUpdateMany(true);

  await assert.rejects(() => h.service.encerrarRota(7, { date: DATE }, 42), /falha injetada/);

  // Nada mudou: as DUAS entregas continuam EXATAMENTE como estavam antes —
  // prova que a $transaction fez rollback (não "reverteu a 1ª e falhou na 2ª").
  const emRota = h.store.get('d-em-rota')!;
  assert.equal(emRota.status, 'em_rota');
  assert.equal(emRota.rotaOrdem, 0);
  assert.deepEqual(emRota.etaAt, atHour(10));
  assert.deepEqual(emRota.startedAt, atHour(9));

  const agendada = h.store.get('d-agendada')!;
  assert.equal(agendada.status, 'agendada');
  assert.equal(agendada.rotaOrdem, 1);
  assert.deepEqual(agendada.etaAt, atHour(11));

  // Uma chamada seguinte SEM a falha injetada funciona normalmente a partir do
  // estado original intacto (prova que o rollback não corrompeu nada).
  h.setFailNextUpdateMany(false);
  const result = await h.service.encerrarRota(7, { date: DATE }, 42);
  assert.equal(result.resumo.pendentes, 2);
});

// ── 5. Idempotência ────────────────────────────────────────────────────────
test('encerrarRota: 2ª chamada seguida acha 0 abertas → pendentes: 0, sem erro', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, etaAt: atHour(10), startedAt: atHour(9) }),
    seedRow({ id: 'd-agendada', status: 'agendada', rotaOrdem: 1, etaAt: atHour(11) }),
  ]);

  const first = await h.service.encerrarRota(7, { date: DATE }, 42);
  assert.equal(first.resumo.pendentes, 2);

  const second = await h.service.encerrarRota(7, { date: DATE }, 42);
  assert.equal(second.ok, true);
  assert.equal(second.resumo.pendentes, 0, '2ª vez não re-conta as mesmas entregas já revertidas');
  assert.equal(second.resumo.total, 2, 'total continua contando as 2 entregas do dia (agora ambas agendada)');
  assert.equal(second.resumo.entregues, 0);
  assert.equal(second.resumo.naoEntregues, 0);
});

// ── 6. Resumo correto ──────────────────────────────────────────────────────
test('encerrarRota: resumo {total, entregues, naoEntregues, pendentes} bate com o fixture', async () => {
  const h = buildHarness([
    seedRow({ id: 'd1', status: 'entregue', scheduledAt: atHour(8) }),
    seedRow({ id: 'd2', status: 'entregue', scheduledAt: atHour(9) }),
    seedRow({ id: 'd3', status: 'cancelada', scheduledAt: atHour(9) }),
    seedRow({ id: 'd4', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(10), scheduledAt: atHour(10) }),
    seedRow({ id: 'd5', status: 'agendada', rotaOrdem: 1, etaAt: atHour(11), scheduledAt: atHour(11) }),
    // Empresa diferente: nunca deve entrar no resumo desta chamada (companyId=7).
    seedRow({ id: 'd-outra-empresa', companyId: 8, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9), scheduledAt: atHour(9) }),
  ]);

  const result = await h.service.encerrarRota(7, { date: DATE }, 42);

  assert.deepEqual(result.resumo, { total: 5, entregues: 2, naoEntregues: 1, pendentes: 2 });
  assert.equal(h.store.get('d-outra-empresa')!.status, 'em_rota', 'empresa 8 intocada');
});

// ── 7. Encerra a rota OPERACIONALMENTE (decoupled da cobrança) ─────────────
test('encerrarRota: marca operationalEndedAt na rota ACTIVE sem tocar o status de cobrança', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) })],
    [
      { id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'ACTIVE', operationalEndedAt: null },
      // Rota de outro motorista da MESMA empresa: fora do escopo (entregadorId=42 na chamada).
      { id: 'r-99', companyId: 7, entregadorId: 99, routeDate, status: 'ACTIVE', operationalEndedAt: null },
    ],
  );

  await h.service.encerrarRota(7, { date: DATE }, 42);

  const r42 = h.routeStore.get('r-42')!;
  assert.ok(r42.operationalEndedAt instanceof Date, 'rota do motorista 42 marcada como encerrada');
  assert.equal(r42.status, 'ACTIVE', 'status de cobrança NUNCA muda — só o campo operacional decoupled');

  const r99 = h.routeStore.get('r-99')!;
  assert.equal(r99.operationalEndedAt, null, 'rota de outro motorista fora do escopo — intocada');
});

// ── extra: sem entregas no dia → resposta normal, tudo zero ────────────────
test('encerrarRota: dia sem nenhuma entrega devolve resumo zerado, sem erro', async () => {
  const h = buildHarness([]);
  const result = await h.service.encerrarRota(7, { date: DATE }, 42);
  assert.deepEqual(result, { ok: true, resumo: { total: 0, entregues: 0, naoEntregues: 0, pendentes: 0 } });
});

// ── extra: companyId ausente rejeita antes de abrir transação ──────────────
test('encerrarRota: sem companyId lança BadRequestException', async () => {
  const h = buildHarness([]);
  await assert.rejects(() => h.service.encerrarRota(0 as any, { date: DATE }, 42), /Empresa não identificada/);
});
