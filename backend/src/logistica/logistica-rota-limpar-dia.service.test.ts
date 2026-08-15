import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaService, resolveDayRange, saoPauloMidnight } from './logistica-rota.service';
import { canonicalRouteDate } from './logistica-route-billing.util';

/**
 * PR18072026 Onda 1 — testes de `limparDia`. Espelha o harness de
 * `logistica-rota-encerrar.service.test.ts` ($transaction que simula commit/
 * rollback DE VERDADE), mas com o DESFECHO diferente: "Limpar dia" descarta as
 * abertas (decisão do dono, 18/07), não devolve pra pendência como o encerrar.
 *
 * 🔴 10/08 — O DESFECHO VIROU DELETE ("o cancelar q não deleta, essa patifaria").
 * A aberta que nunca virou trabalho SOME do banco; só quem tem SINAL DE VIDA
 * (saiu pra rua, tem foto, trilha, claim, cobrança ou parada congelada de outra
 * rota) continua sendo carimbada 'cancelada'. Estes testes agora provam as duas
 * metades — e, principalmente, que a segunda existe.
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
  // 25/07 — vínculo com a Agenda: sem desfazer estes dois o dia limpo nunca
  // podia ser regerado (ver o FIX no limparDia).
  planoEntregaId?: string | null;
  agendaOcorrenciaKey?: string | null;
  agendaOcorrenciaKeyOrigem?: string | null;
  customerProfileId?: string;
  // 10/08 — os SINAIS DE VIDA (SEM_SINAL_DE_VIDA em logistica-expurgo.util): a
  // fronteira entre "some" e "fica". Contadores fazem o papel das relações.
  arrivedAt?: Date | null;
  deliveredAt?: Date | null;
  comprovanteConfirmadoAt?: Date | null;
  receiptMethod?: string | null;
  cobrancaStatus?: string | null;
  comprovantes?: number;
  logisticaTrackingPoints?: number;
  logisticaTrackingEvents?: number;
  logisticaTrackedCreditClaims?: number;
};

type PlanoRow = {
  id: string;
  companyId: number;
  proximaData: Date | null;
};

type RouteRow = {
  id: string;
  companyId: number;
  entregadorId: number;
  routeDate: string;
  status: string;
  operationalEndedAt: Date | null;
};

/** O congelado da rota carregada (09/08): cancelar apaga o que não foi entregue. */
type StopRow = {
  id: string;
  companyId: number;
  routeId: string;
  deliveryId: string;
};

/* 🔴 A SESSÃO DE TRACKING (15/08) — a janela de 24h do CONFLICT→REJECTED que
   `limparDia` passou a fechar junto com a rota (mesmo padrão do
   `encerrarRota`, ver logistica-rota.service.ts). */
type TrackingSessionRow = {
  id: string;
  companyId: number;
  routeId: string;
  status: string;
  endedAt: Date | null;
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
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
  if (Array.isArray(where.OR)) return where.OR.some((branch: any) => matchesOrBranch(row, branch));
  return true;
}

/**
 * As perguntas do `SEM_SINAL_DE_VIDA`, respondidas pelo dublê. A parada congelada
 * é lida do STORE DE STOPS de propósito: é assim que o teste prova a ORDEM (o stop
 * some primeiro, senão o `Restrict` do banco de verdade barraria o delete).
 */
function matchesSinalDeVida(row: EntregaRow, where: any, stops: Map<string, StopRow>): boolean {
  const nulos = ['startedAt', 'arrivedAt', 'deliveredAt', 'comprovanteConfirmadoAt', 'receiptMethod'] as const;
  for (const campo of nulos) {
    if (where[campo] === null && (row as any)[campo] != null) return false;
  }
  if (where.cobrancaStatus !== undefined && (row.cobrancaStatus ?? 'pendente') !== where.cobrancaStatus) return false;
  const contadores = ['comprovantes', 'logisticaTrackingPoints', 'logisticaTrackingEvents', 'logisticaTrackedCreditClaims'] as const;
  for (const rel of contadores) {
    if (where[rel] && ((row as any)[rel] ?? 0) > 0) return false;
  }
  if (where.logisticaRouteStop?.is === null) {
    for (const stop of stops.values()) if (stop.deliveryId === row.id) return false;
  }
  return true;
}

function buildHarness(
  seed: EntregaRow[],
  routeSeed: RouteRow[] = [],
  planoSeed: PlanoRow[] = [],
  stopSeed: StopRow[] = [],
  cobrancas: Array<{ entregaId: string }> = [],
  trackingSeed: TrackingSessionRow[] = [],
) {
  const store = new Map<string, EntregaRow>(seed.map((row) => [row.id, { ...row }]));
  const routeStore = new Map<string, RouteRow>(routeSeed.map((row) => [row.id, { ...row }]));
  const planoStore = new Map<string, PlanoRow>(planoSeed.map((row) => [row.id, { ...row }]));
  const stopStore = new Map<string, StopRow>(stopSeed.map((row) => [row.id, { ...row }]));
  const trackingStore = new Map<string, TrackingSessionRow>(trackingSeed.map((row) => [row.id, { ...row }]));
  const financeiroChargeCalls: string[] = [];
  /** O extrato (F2.2): com o corpo apagado, o EVENTO é a única história que sobra. */
  const eventos: any[] = [];
  let failNextWrite = false;

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

  function clonePlanos(): Map<string, PlanoRow> {
    const clone = new Map<string, PlanoRow>();
    for (const [id, row] of planoStore) clone.set(id, { ...row });
    return clone;
  }

  function cloneStops(): Map<string, StopRow> {
    const clone = new Map<string, StopRow>();
    for (const [id, row] of stopStore) clone.set(id, { ...row });
    return clone;
  }

  function cloneTracking(): Map<string, TrackingSessionRow> {
    const clone = new Map<string, TrackingSessionRow>();
    for (const [id, row] of trackingStore) clone.set(id, { ...row });
    return clone;
  }

  /** `where.route` / `where.delivery` são relações to-one: resolvem na linha viva. */
  function matchesRouteFilter(route: RouteRow | undefined, filtro: any): boolean {
    if (!filtro) return true;
    if (!route) return false;
    if (filtro.companyId != null && route.companyId !== filtro.companyId) return false;
    if (filtro.entregadorId != null && route.entregadorId !== filtro.entregadorId) return false;
    if (filtro.routeDate != null && route.routeDate !== filtro.routeDate) return false;
    if (filtro.status?.in && !filtro.status.in.includes(route.status)) return false;
    return true;
  }

  function financeiroChargeGuard(method: string) {
    return async () => {
      financeiroChargeCalls.push(method);
      throw new Error(`NUNCA deve chamar FinanceiroCharge.${method} a partir de limparDia`);
    };
  }

  function buildTx(
    working: Map<string, EntregaRow>,
    workingRoutes: Map<string, RouteRow>,
    workingPlanos: Map<string, PlanoRow>,
    workingStops: Map<string, StopRow>,
    workingTracking: Map<string, TrackingSessionRow>,
  ) {
    return {
      entrega: {
        findMany: async ({ where }: any) => {
          const rows: EntregaRow[] = [];
          for (const row of working.values()) {
            if (!matchesWhere(row, where)) continue;
            if (!matchesSinalDeVida(row, where, workingStops)) continue;
            rows.push({ ...row });
          }
          return rows;
        },
        updateMany: async ({ where, data }: any) => {
          if (failNextWrite) throw new Error('falha injetada (simulando erro de banco no meio da transação)');
          let count = 0;
          for (const row of working.values()) {
            // O updateMany que solta a chave da ocorrência mira por id, não
            // pelo escopo do dia.
            if (where.id?.in) {
              if (where.companyId != null && row.companyId !== where.companyId) continue;
              if (!where.id.in.includes(row.id)) continue;
              if (where.status?.in && !where.status.in.includes(row.status)) continue;
            } else if (!matchesWhere(row, where)) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
        deleteMany: async ({ where }: any) => {
          if (failNextWrite) throw new Error('falha injetada (simulando erro de banco no meio da transação)');
          let count = 0;
          for (const [id, row] of [...working]) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.id?.in && !where.id.in.includes(id)) continue;
            /* O `Restrict` do banco, encenado: parada congelada SEGURA a entrega.
               Se o código tentar apagar uma linha que ainda tem stop, o teste
               explode aqui — que é exatamente o que o Postgres faria. */
            for (const stop of workingStops.values()) {
              if (stop.deliveryId === id) {
                throw new Error(`FK Restrict: LogisticaRouteStop ${stop.id} ainda aponta pra entrega ${id}`);
              }
            }
            working.delete(id);
            count++;
          }
          return { count };
        },
      },
      logisticaPlanoEntrega: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of workingPlanos.values()) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.id?.in && !where.id.in.includes(row.id)) continue;
            if (where.proximaData?.gt) {
              if (!row.proximaData) continue;
              if (row.proximaData.getTime() <= new Date(where.proximaData.gt).getTime()) continue;
            }
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      },
      logisticaRoute: {
        // 🔴 `findMany` FALTAVA (15/08) — é ele que `limparDia` usa pra achar as
        // rotas a TRAVAR (`lockLogisticaRouteTransaction`) e agora também pra
        // saber quais `routeId` carimbar ENDED na TrackingSession
        // (`lockedRouteIds`). Sem este método o guarda `typeof
        // tx.logisticaRoute?.findMany === 'function'` era falso e o bloco
        // inteiro (trava + recorte) era pulado em silêncio — mesmo com
        // `$executeRawUnsafe` stubado.
        findMany: async ({ where, orderBy }: any) => {
          let rows = [...workingRoutes.values()].filter((row) => matchesRouteFilter(row, where));
          if (orderBy?.id) rows = rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          return rows.map((row) => ({ id: row.id }));
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of workingRoutes.values()) {
            if (!matchesRouteFilter(row, where)) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      },
      logisticaRouteStop: {
        deleteMany: async ({ where }: any) => {
          let count = 0;
          for (const [id, row] of [...workingStops]) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.deliveryId?.in && !where.deliveryId.in.includes(row.deliveryId)) continue;
            if (!matchesRouteFilter(workingRoutes.get(row.routeId), where.route)) continue;
            if (where.delivery?.status?.not !== undefined) {
              const entrega = working.get(row.deliveryId);
              if (!entrega || entrega.status === where.delivery.status.not) continue;
            }
            workingStops.delete(id);
            count++;
          }
          return { count };
        },
      },
      financeiroCharge: {
        /* LER a cobrança é obrigatório (ela não tem FK com a Entrega: sem esta
           consulta o delete apagaria a ponta de um dinheiro que continua no banco).
           ESCREVER continua proibido — cancelar não estorna. */
        findMany: async ({ where }: any) => cobrancas.filter(
          (c) => (where?.entregaId?.in ?? []).includes(c.entregaId),
        ),
        create: financeiroChargeGuard('create'),
        update: financeiroChargeGuard('update'),
        updateMany: financeiroChargeGuard('updateMany'),
        delete: financeiroChargeGuard('delete'),
        deleteMany: financeiroChargeGuard('deleteMany'),
      },
      logisticaTrackingSession: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of workingTracking.values()) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.routeId?.in && !where.routeId.in.includes(row.routeId)) continue;
            if (where.status != null && row.status !== where.status) continue;
            Object.assign(row, data);
            count++;
          }
          return { count };
        },
      },
      /* 🔴 A TRAVA DA ROTA EXIGE `$executeRawUnsafe` (15/08) — `limparDia` só
         levanta `lockedRouteIds` (o recorte que o carimbo de TrackingSession
         usa, espelho do `encerrarRota`) quando `typeof tx.$executeRawUnsafe
         === 'function'` (é o mesmo guarda de `lockLogisticaRouteTransaction`,
         que RECUSA travar sem ele — "A trava da rota exige uma transação
         PostgreSQL ativa"). Sem este stub o bloco inteiro era pulado em SILÊNCIO
         e a vacina U6/TrackingSession nunca rodava de verdade — a mesma
         omissão que o `logistica-rota-encerrar.service.test.ts` tem hoje (não
         testa TrackingSession nenhuma). `pg_advisory_xact_lock` é só
         concorrência entre requisições simultâneas; o dublê roda tudo
         sequencial, então um no-op basta. */
      $executeRawUnsafe: async () => undefined,
    };
  }

  const prisma: any = {
    logisticaAgendaEvento: {
      create: async ({ data }: any) => { eventos.push(data); return data; },
    },
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const working = cloneStore();
      const workingRoutes = cloneRoutes();
      const workingPlanos = clonePlanos();
      const workingStops = cloneStops();
      const workingTracking = cloneTracking();
      const tx = buildTx(working, workingRoutes, workingPlanos, workingStops, workingTracking);
      const result = await callback(tx); // se lançar, propaga SEM tocar os stores (rollback)
      store.clear();
      for (const [id, row] of working) store.set(id, row);
      routeStore.clear();
      for (const [id, row] of workingRoutes) routeStore.set(id, row);
      planoStore.clear();
      for (const [id, row] of workingPlanos) planoStore.set(id, row);
      stopStore.clear();
      for (const [id, row] of workingStops) stopStore.set(id, row);
      trackingStore.clear();
      for (const [id, row] of workingTracking) trackingStore.set(id, row);
      return result;
    },
  };

  return {
    service: new LogisticaRotaService(prisma, {} as any),
    store,
    routeStore,
    planoStore,
    stopStore,
    trackingStore,
    financeiroChargeCalls,
    eventos,
    setFailNextUpdateMany: (value: boolean) => { failNextWrite = value; },
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
    planoEntregaId: null,
    agendaOcorrenciaKey: null,
    agendaOcorrenciaKeyOrigem: null,
    customerProfileId: `cli-${overrides.id}`,
    // sem sinal de vida por padrão: a linha "normal" do dia é a que some
    arrivedAt: null,
    deliveredAt: null,
    comprovanteConfirmadoAt: null,
    receiptMethod: null,
    cobrancaStatus: 'pendente',
    comprovantes: 0,
    logisticaTrackingPoints: 0,
    logisticaTrackingEvents: 0,
    logisticaTrackedCreditClaims: 0,
    ...overrides,
  };
}

// ── 1. Abertas SOMEM (10/08: "o cancelar q não deleta, essa patifaria") ───────
test('limparDia: agendada/em_rota do dia sem sinal de vida SOMEM do banco', async () => {
  const h = buildHarness([
    // 'em_rota' com rotaOrdem/etaAt: entrou na rota, mas o motorista nunca
    // chegou em ninguém — nada aconteceu, some igual.
    seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, etaAt: atHour(10) }),
    // Diferente do encerrarRota: mesmo uma 'agendada' CRUA (nunca passou por
    // planejar/iniciar) sai — Limpar Dia descarta TUDO que está aberto.
    seedRow({ id: 'd-agendada-crua', status: 'agendada' }),
  ]);

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.ok, true);
  assert.equal(result.resumo.canceladas, 2, 'o número que o app mostra é quantas saíram do dia');
  assert.equal(result.resumo.apagadas, 2, 'e todas elas SUMIRAM — nenhum defunto carimbado');
  assert.equal(h.store.has('d-em-rota'), false);
  assert.equal(h.store.has('d-agendada-crua'), false);
  assert.equal(h.store.size, 0, 'o dia cancelado não deixa corpo nenhum pra trás');
});

// ── 1b. A OUTRA METADE: com SINAL DE VIDA, a linha FICA ──────────────────────
// A fronteira do dono (10/08): "o cliente pode querer reaproveitar, ou saber o
// quanto gastou". Tudo que já foi trabalho ou dinheiro sobrevive ao cancelar —
// carimbado 'cancelada', como sempre foi.
test('limparDia: linha COM sinal de vida não some — vira cancelada, com a origem carimbada', async () => {
  const h = buildHarness([
    seedRow({ id: 'd-saiu', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9), planoEntregaId: 'p1', agendaOcorrenciaKey: `agenda:p1:${DATE}` }),
    seedRow({ id: 'd-foto', status: 'agendada', comprovantes: 1 }),
    seedRow({ id: 'd-trilha', status: 'agendada', logisticaTrackingPoints: 12 }),
    seedRow({ id: 'd-claim', status: 'agendada', logisticaTrackedCreditClaims: 1 }),
    seedRow({ id: 'd-pago', status: 'agendada', receiptMethod: 'pix' }),
    seedRow({ id: 'd-limpa', status: 'agendada' }),
  ]);

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 6, 'todas saíram do dia');
  assert.equal(result.resumo.apagadas, 1, 'mas só a que nunca virou nada sumiu');
  assert.equal(h.store.has('d-limpa'), false);
  for (const id of ['d-saiu', 'd-foto', 'd-trilha', 'd-claim', 'd-pago']) {
    const row = h.store.get(id)!;
    assert.equal(row.status, 'cancelada', `${id} tem história — fica carimbada`);
    assert.equal(row.rotaOrdem, null);
    assert.equal(row.entregadorId, null, 'motorista solto (29/07)');
  }
  const saiu = h.store.get('d-saiu')!;
  assert.equal(saiu.agendaOcorrenciaKey, null, 'a chave viva sai (senão trava o cliente pra sempre)');
  assert.equal(saiu.agendaOcorrenciaKeyOrigem, `agenda:p1:${DATE}`, 'e a origem fica gravada');
});

// ── 1c. Cobrança lançada segura a linha (a FK que o Prisma não vê) ───────────
test('limparDia: entrega COM cobrança no financeiro não some — vira cancelada', async () => {
  const h = buildHarness(
    [seedRow({ id: 'd-cobrada' }), seedRow({ id: 'd-livre' })],
    [], [], [],
    [{ entregaId: 'd-cobrada' }],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.apagadas, 1);
  assert.equal(h.store.has('d-livre'), false);
  assert.equal(h.store.get('d-cobrada')!.status, 'cancelada', 'a ponta de um dinheiro no banco não se apaga');
  assert.deepEqual(h.financeiroChargeCalls, [], 'e nada é escrito no financeiro');
});

// ── 1d. O EVENTO é a história que sobra (F2.2 + 10/08) ──────────────────────
test('limparDia: cada parada que sai vira evento com ATOR, dia e ORIGEM da ocorrência', async () => {
  const h = buildHarness([
    seedRow({ id: 'd1', planoEntregaId: 'p1', agendaOcorrenciaKey: `agenda:p1:${DATE}` }),
  ]);

  await h.service.limparDia(7, { date: DATE }, 42, 51);

  assert.equal(h.eventos.length, 1);
  const evento = h.eventos[0];
  assert.equal(evento.tipo, 'CANCELADA_LIMPAR_DIA');
  assert.equal(evento.actorUserId, 51, 'evento sem ator responde "alguém", que é não responder');
  assert.equal(evento.entregaId, 'd1');
  assert.equal(evento.planoEntregaId, 'p1');
  assert.equal(evento.deTexto, '18/07', 'o DIA DE ORIGEM — é ele que segura o generateDay depois');
  assert.equal(evento.paraTexto, '18/07');
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
  assert.ok(h.store.has('d-cancelada-antes'), 'cancelada de ANTES não é varrida pelo cancelar de agora');
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

// ── 4b. A ROTA MONTADA (PLANNED) TAMBÉM MORRE — dono, 09/08 ─────────────────
// "cancelar tem q limpar toda a rota já carregada… deleta ela, tudo, fica
// limpinho para montar rota do zero". A rota montada e não iniciada é PLANNED,
// e ela sobrevivia inteira ao cancelar: o aparelho lê `routeStatus` e PLANNED
// significa "pronta" pra ele — o rodapé seguia oferecendo "Iniciar" num dia sem
// nenhuma parada viva.
test('limparDia: rota PLANNED (montada, nunca iniciada) morre junto', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd-agendada', status: 'agendada', rotaOrdem: 0 })],
    [{ id: 'r-planned', companyId: 7, entregadorId: 42, routeDate, status: 'PLANNED', operationalEndedAt: null }],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  const rota = h.routeStore.get('r-planned')!;
  assert.ok(rota.operationalEndedAt instanceof Date, 'a rota montada não pode sobreviver ao cancelar');
  assert.equal(rota.status, 'PLANNED', 'status de cobrança continua intocado — quem mata é o campo operacional');
  assert.equal(result.resumo.rotasEncerradas, 1);
});

// ── 4c. O SNAPSHOT VAI JUNTO, MENOS O QUE JÁ FOI ENTREGUE ──────────────────
// `LogisticaRouteStop` é o congelado da rota carregada. Cancelar apaga o que
// não foi feito e não encosta no comprovante do que foi.
test('limparDia: apaga as paradas congeladas do que não foi entregue e preserva as do entregue', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const entregueAt = atHour(10);
  const h = buildHarness(
    [
      seedRow({ id: 'd-entregue', status: 'entregue', rotaOrdem: 0, etaAt: entregueAt, startedAt: entregueAt }),
      seedRow({ id: 'd-aberta', status: 'em_rota', rotaOrdem: 1, startedAt: atHour(9) }),
      seedRow({ id: 'd-agendada', status: 'agendada', rotaOrdem: 2 }),
      // do OUTRO motorista: fora do escopo do 42 em tudo
      seedRow({ id: 'd-outro', entregadorId: 99, status: 'agendada', rotaOrdem: 0 }),
    ],
    [
      { id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'PLANNED', operationalEndedAt: null },
      { id: 'r-99', companyId: 7, entregadorId: 99, routeDate, status: 'PLANNED', operationalEndedAt: null },
    ],
    [],
    [
      { id: 's-entregue', companyId: 7, routeId: 'r-42', deliveryId: 'd-entregue' },
      { id: 's-aberta', companyId: 7, routeId: 'r-42', deliveryId: 'd-aberta' },
      { id: 's-agendada', companyId: 7, routeId: 'r-42', deliveryId: 'd-agendada' },
      // rota de OUTRO motorista: fora do escopo, não pode perder parada nenhuma
      { id: 's-outro', companyId: 7, routeId: 'r-99', deliveryId: 'd-outro' },
    ],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.paradasApagadas, 2);
  assert.ok(h.stopStore.has('s-entregue'), 'o comprovante do que foi entregue fica');
  assert.equal(h.stopStore.has('s-aberta'), false);
  assert.equal(h.stopStore.has('s-agendada'), false);
  assert.ok(h.stopStore.has('s-outro'), 'rota de outro motorista — intocada');
  /* 🔴 A ORDEM É LEI (10/08): a parada congelada é `onDelete: Restrict` na
     entrega. O dublê explode se o delete vier antes do stop sair — se este
     teste passa, a ordem dentro da transação está certa. */
  assert.equal(h.store.has('d-agendada'), false, 'stop saiu primeiro, aí a entrega pôde sumir');
  assert.ok(h.store.has('d-outro'), 'a do outro motorista mantém entrega E parada');
  // e nada de dinheiro: cancelar não estorna (dono: "perde até os créditos")
  assert.deepEqual(h.financeiroChargeCalls, []);
});

// ── 4d. Idempotente também do lado da rota ─────────────────────────────────
test('limparDia: 2ª chamada não acha mais parada nem rota viva → zeros, sem erro', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd1', status: 'agendada', rotaOrdem: 0 })],
    [{ id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'PLANNED', operationalEndedAt: null }],
    [],
    [{ id: 's1', companyId: 7, routeId: 'r-42', deliveryId: 'd1' }],
  );

  const primeira = await h.service.limparDia(7, { date: DATE }, 42);
  assert.equal(primeira.resumo.paradasApagadas, 1);
  assert.equal(primeira.resumo.rotasEncerradas, 1);

  const segunda = await h.service.limparDia(7, { date: DATE }, 42);
  assert.equal(segunda.ok, true);
  assert.equal(segunda.resumo.paradasApagadas, 0);
  // a rota continua PLANNED (o status de cobrança nunca muda), então ela entra
  // no updateMany de novo — carimbar `operationalEndedAt` numa rota já morta é
  // inofensivo e mantém o método tudo-ou-nada.
  assert.equal(segunda.resumo.canceladas, 0);
});

// ── 4e. A JANELA DE 24h DO TRACKING FECHA JUNTO (15/08) ──────────────────────
// Sem isto, uma `LogisticaTrackingSession` ACTIVE sobrevivia ao cancelar: o
// comando de tracking em voo (fila do aparelho) batia num routeId que o app já
// esqueceu, o servidor respondia CONFLICT e o comando virava REJECTED — preso
// até o teto de 24h do processamento assíncrono, sem ninguém ter cancelado
// nada de propósito. Espelho do `encerrarRota` (ver logistica-rota.service.ts).
test('limparDia: TrackingSession ACTIVE da rota cancelada vira ENDED (fecha a janela do CONFLICT)', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) })],
    [
      { id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'ACTIVE', operationalEndedAt: null },
      { id: 'r-99', companyId: 7, entregadorId: 99, routeDate, status: 'ACTIVE', operationalEndedAt: null },
    ],
    [],
    [],
    [],
    [
      { id: 'ts-42', companyId: 7, routeId: 'r-42', status: 'ACTIVE', endedAt: null },
      { id: 'ts-99', companyId: 7, routeId: 'r-99', status: 'ACTIVE', endedAt: null },
    ],
  );

  await h.service.limparDia(7, { date: DATE }, 42);

  const ts42 = h.trackingStore.get('ts-42')!;
  assert.equal(ts42.status, 'ENDED', 'a sessão da rota cancelada fecha junto com operationalEndedAt');
  assert.ok(ts42.endedAt instanceof Date);

  const ts99 = h.trackingStore.get('ts-99')!;
  assert.equal(ts99.status, 'ACTIVE', 'sessão de outro motorista, fora do escopo — intocada');
});

test('limparDia: TrackingSession já ENDED não é regravada (idempotente)', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const endedAntes = atHour(7);
  const h = buildHarness(
    [seedRow({ id: 'd1', status: 'agendada', rotaOrdem: 0 })],
    [{ id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'ACTIVE', operationalEndedAt: null }],
    [],
    [],
    [],
    [{ id: 'ts-42', companyId: 7, routeId: 'r-42', status: 'ENDED', endedAt: endedAntes }],
  );

  await h.service.limparDia(7, { date: DATE }, 42);

  const ts = h.trackingStore.get('ts-42')!;
  assert.equal(ts.status, 'ENDED');
  assert.deepEqual(ts.endedAt, endedAntes, 'já estava fechada — o updateMany só mira status ACTIVE');
});

test('limparDia: skipRoute não encerra a rota nem a TrackingSession dela', async () => {
  const routeDate = canonicalRouteDate(DATE);
  const h = buildHarness(
    [seedRow({ id: 'd-em-rota', status: 'em_rota', rotaOrdem: 0, startedAt: atHour(9) })],
    [{ id: 'r-42', companyId: 7, entregadorId: 42, routeDate, status: 'ACTIVE', operationalEndedAt: null }],
    [],
    [],
    [],
    [{ id: 'ts-42', companyId: 7, routeId: 'r-42', status: 'ACTIVE', endedAt: null }],
  );

  await h.service.limparDia(7, { date: DATE, skipRoute: true } as any, 42);

  assert.equal(h.routeStore.get('r-42')!.operationalEndedAt, null, 'skipRoute não toca a rota');
  assert.equal(h.trackingStore.get('ts-42')!.status, 'ACTIVE', 'skipRoute também não fecha a sessão de tracking');
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
  assert.equal(h.store.size, 2, 'delete que falha no meio não pode levar linha nenhuma');

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
  assert.deepEqual(result, {
    ok: true,
    resumo: { canceladas: 0, apagadas: 0, planosLiberados: 0, rotasEncerradas: 0, paradasApagadas: 0 },
  });
});

// ── 7. O DIA VOLTA (incidente 25/07: "98 paradas" que listavam 0) ────────────
// Limpar Dia cancelava a entrega e deixava o plano com `proximaData` na semana
// seguinte + a `agendaOcorrenciaKey` presa na cancelada. Resultado: o dia ficava
// impossível de regerar. Agora a limpeza DESFAZ a ocorrência.
test('limparDia: devolve proximaData pro dia limpo e solta a chave da ocorrência', async () => {
  const proximaSemana = new Date(saoPauloMidnight(DATE));
  proximaSemana.setDate(proximaSemana.getDate() + 7);

  const h = buildHarness(
    [
      seedRow({
        id: 'd-recorrente',
        status: 'agendada',
        planoEntregaId: 'plano-1',
        agendaOcorrenciaKey: `agenda:plano-1:${DATE}`,
      }),
      seedRow({ id: 'd-avulsa', status: 'agendada' }),
    ],
    [],
    [{ id: 'plano-1', companyId: 7, proximaData: proximaSemana }],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 2);
  assert.equal(result.resumo.planosLiberados, 1);

  // 10/08 — a entrega recorrente intocada SOME; o que devolve o dia é o PLANO
  // (a chave morre junto com a linha, então não trava mais ninguém).
  assert.equal(h.store.has('d-recorrente'), false);
  assert.equal(h.store.has('d-avulsa'), false);

  const plano = h.planoStore.get('plano-1')!;
  assert.deepEqual(plano.proximaData, saoPauloMidnight(DATE), 'plano volta a vencer no dia limpo');
});

test('limparDia: plano que já vence hoje ou antes NÃO é puxado pra frente nem pra trás', async () => {
  const hoje = saoPauloMidnight(DATE);
  const semanaPassada = new Date(hoje);
  semanaPassada.setDate(semanaPassada.getDate() - 7);

  const h = buildHarness(
    [
      seedRow({
        id: 'd-hoje',
        status: 'agendada',
        planoEntregaId: 'plano-hoje',
        agendaOcorrenciaKey: `agenda:plano-hoje:${DATE}`,
      }),
      seedRow({
        id: 'd-atrasado',
        status: 'agendada',
        planoEntregaId: 'plano-atrasado',
        agendaOcorrenciaKey: `agenda:plano-atrasado:${DATE}`,
      }),
    ],
    [],
    [
      { id: 'plano-hoje', companyId: 7, proximaData: new Date(hoje) },
      { id: 'plano-atrasado', companyId: 7, proximaData: semanaPassada },
    ],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.planosLiberados, 0, 'nenhum precisava ser devolvido');
  assert.deepEqual(h.planoStore.get('plano-hoje')!.proximaData, hoje);
  assert.deepEqual(h.planoStore.get('plano-atrasado')!.proximaData, semanaPassada);
});

// ── 8. A SEXTA QUE MORREU (incidente 26/07) ─────────────────────────────────
// "Montar Rota → sexta" num domingo materializa a ocorrência de 31/07 (sexta)
// com scheduledAt = 26/07 (domingo, o dia OPERACIONAL). O Limpar Dia devolvia
// `proximaData = 26/07` — um DOMINGO gravado num plano de SEXTA. `planOccursOn`
// (logistica-agenda.service.ts) exige `elapsedDays % 7 === 0` a partir da
// `proximaData`: de um domingo pra qualquer sexta dá 5, 12, 19… — nunca 0. A
// sexta daquele cliente não voltava em NENHUMA semana. Prova real: empresa 48,
// 10 planos de sexta com proximaData=2026-07-26 (domingo) e a prévia em 0.
test('limparDia: devolve o plano pra DATA DE ORIGEM da ocorrência, não pro dia operacional', async () => {
  const DOMINGO = '2026-07-26'; // dia operacional que está sendo limpo
  const SEXTA = '2026-07-31'; // dia da ocorrência (diaSemana do plano)
  const domingoRange = resolveDayRange(DOMINGO);
  const seguinte = new Date(saoPauloMidnight(SEXTA));
  seguinte.setDate(seguinte.getDate() + 7); // generateDay já empurrou pra 07/08

  const h = buildHarness(
    [
      {
        id: 'd-sexta-no-domingo',
        companyId: 7,
        entregadorId: 42,
        status: 'agendada',
        rotaOrdem: null,
        etaAt: null,
        startedAt: null,
        scheduledAt: new Date(domingoRange.start.getTime() + 9 * 3600_000),
        planoEntregaId: 'plano-sexta',
        agendaOcorrenciaKey: `agenda:plano-sexta:${SEXTA}`,
      },
    ],
    [],
    [{ id: 'plano-sexta', companyId: 7, proximaData: seguinte }],
  );

  const result = await h.service.limparDia(7, { date: DOMINGO }, 42);

  assert.equal(result.resumo.canceladas, 1);
  assert.equal(result.resumo.planosLiberados, 1);

  const plano = h.planoStore.get('plano-sexta')!;
  assert.deepEqual(
    plano.proximaData,
    saoPauloMidnight(SEXTA),
    'a data devolvida tem que cair na SEXTA (diaSemana do plano), nunca no domingo limpo',
  );
  // O invariante que realmente importa: a data gravada cai no mesmo dia da
  // semana da ocorrência — é o que planOccursOn exige (elapsedDays % 7 === 0).
  const diasDeDiferenca = Math.round(
    (saoPauloMidnight(SEXTA).getTime() - plano.proximaData!.getTime()) / 86_400_000,
  );
  assert.equal(diasDeDiferenca % 7, 0, 'proximaData fora da cadência semanal mata o dia pra sempre');
});

test('limparDia: entrega aberta SEM chave de ocorrência não mexe na proximaData do plano', async () => {
  const proximaSemana = new Date(saoPauloMidnight(DATE));
  proximaSemana.setDate(proximaSemana.getDate() + 7);

  const h = buildHarness(
    [seedRow({ id: 'd-sem-chave', status: 'agendada', planoEntregaId: 'plano-x', agendaOcorrenciaKey: null })],
    [],
    [{ id: 'plano-x', companyId: 7, proximaData: proximaSemana }],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 1);
  assert.equal(result.resumo.planosLiberados, 0);
  assert.deepEqual(
    h.planoStore.get('plano-x')!.proximaData,
    proximaSemana,
    'sem data de origem confiável não se chuta uma data no plano',
  );
});

test('limparDia: entrega FECHADA não devolve o plano dela (só as abertas do dia)', async () => {
  const proximaSemana = new Date(DAY_START);
  proximaSemana.setDate(proximaSemana.getDate() + 7);

  const h = buildHarness(
    [
      seedRow({
        id: 'd-entregue',
        status: 'entregue',
        planoEntregaId: 'plano-entregue',
        agendaOcorrenciaKey: `agenda:plano-entregue:${DATE}`,
      }),
    ],
    [],
    [{ id: 'plano-entregue', companyId: 7, proximaData: proximaSemana }],
  );

  const result = await h.service.limparDia(7, { date: DATE }, 42);

  assert.equal(result.resumo.canceladas, 0);
  assert.equal(result.resumo.planosLiberados, 0);
  assert.deepEqual(
    h.planoStore.get('plano-entregue')!.proximaData,
    proximaSemana,
    'entrega já feita não pode ressuscitar a ocorrência',
  );
  assert.equal(
    h.store.get('d-entregue')!.agendaOcorrenciaKey,
    `agenda:plano-entregue:${DATE}`,
    'a chave da entrega concluída fica — senão o gerador criaria uma 2ª entrega no mesmo dia',
  );
});

// ── extra: companyId ausente rejeita antes de abrir transação ─────────────
test('limparDia: sem companyId lança BadRequestException', async () => {
  const h = buildHarness([]);
  await assert.rejects(() => h.service.limparDia(0 as any, { date: DATE }, 42), /Empresa não identificada/);
});
