import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaService } from './logistica-rota.service';

/**
 * O PISO DA NUMERAÇÃO (08/08/2026) — parada ABERTA não colide com a FECHADA.
 *
 * `planRoute*` numera as abertas de 0 a N-1 e o fetch do planejador só enxerga
 * 'agendada'/'em_rota'. Entregue e cancelada guardam o número antigo, e o
 * `listRota` ordena por `[rotaOrdem asc, status asc]` — então re-planejar no
 * meio do dia fazia os cartões "Entregue" INTERCALAREM no meio dos pendentes
 * na tela do motorista. Virou rotina quando o app novo passou a re-planejar a
 * cada arrasto de cartão (`ordemManual`).
 *
 * O que se prova aqui:
 *  · dia limpo (nada fechado) numera do ZERO — o de sempre, byte a byte;
 *  · dia com paradas fechadas começa DEPOIS da última delas;
 *  · o número que SAI na resposta é o mesmo que foi GRAVADO;
 *  · a consulta do piso é escopada (empresa + motorista + janela do dia) e só
 *    olha status FECHADO;
 *  · o `iniciar` continua marcando a 1ª parada mesmo com o piso longe do zero
 *    (era o `find(rotaOrdem === 0)` que passaria a falhar calado).
 *
 * Sem banco: `ordemManual` leva ao caminho PURO (planRouteManual), sem OSRM.
 */

const DIA = '2026-08-08';
const QUANDO = new Date('2026-08-08T12:00:00.000Z');

type Cenario = {
  /** maior rotaOrdem entre as FECHADAS do dia; null = nada fechado */
  maiorFechada?: number | null;
  /** paradas abertas, na ordem que o fetch devolveria */
  abertas?: Array<{ id: string; lat: number | null; lng: number | null }>;
};

function bancada(cenario: Cenario = {}) {
  const cru = cenario.abertas ?? [
    { id: 'd1', lat: -22.4260477, lng: -47.578631 },
    { id: 'd2', lat: -22.4139, lng: -47.5612 },
    { id: 'd3', lat: -22.3768057, lng: -47.5788828 },
  ];
  const abertas = cru.map((p) => ({
    id: p.id,
    entregadorId: 7,
    status: 'agendada',
    rotaOrdem: null,
    scheduledAt: QUANDO,
    local: null,
    customerProfile: { name: p.id, lat: p.lat, lng: p.lng },
  }));

  const gravados: Array<{ id: string; rotaOrdem: number }> = [];
  const agregados: any[] = [];
  const statusGravado: Array<{ id: string; status: string }> = [];

  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) },
    entrega: {
      findMany: async () => abertas,
      aggregate: async (args: any) => {
        agregados.push(args);
        const v = cenario.maiorFechada === undefined ? null : cenario.maiorFechada;
        return { _max: { rotaOrdem: v } };
      },
      updateMany: async (args: any) => {
        if (typeof args?.data?.rotaOrdem === 'number') {
          gravados.push({ id: args.where.id, rotaOrdem: args.data.rotaOrdem });
        }
        if (args?.data?.status) statusGravado.push({ id: args.where.id, status: args.data.status });
        return { count: 1 };
      },
    },
  };

  // ROTA v2 (10/08) — iniciarRota gerencia LogisticaRoute/Stop direto (sem a
  // máquina de billing velha). Dublê MÍNIMO em memória, mesmo padrão de
  // logistica-rota-prospector.test.ts.
  const routes: any[] = [];
  const stops: any[] = [];
  let routeSeq = 0;
  let stopSeq = 0;
  prisma.logisticaRoute = {
    updateMany: async ({ where, data }: any) => {
      const row = routes.find((r) => r.id === where.id && r.companyId === where.companyId);
      if (!row) return { count: 0 };
      const statusOk = where.status?.in
        ? where.status.in.includes(row.status)
        : where.status === undefined || where.status === row.status;
      const endedOk = where.operationalEndedAt === undefined || where.operationalEndedAt === row.operationalEndedAt;
      if (!statusOk || !endedOk) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    findFirst: async ({ where }: any) => routes.find((r) => {
      if (r.companyId !== where.companyId) return false;
      if (where.id !== undefined) return r.id === where.id;
      return r.entregadorId === where.entregadorId && r.routeDate === where.routeDate;
    }) || null,
    create: async ({ data }: any) => {
      const row = { id: `route-${++routeSeq}`, createdAt: new Date(), operationalEndedAt: null, ...data };
      routes.push(row);
      return row;
    },
  };
  prisma.logisticaRouteStop = {
    findMany: async ({ where }: any) => stops.filter((s) => where.deliveryId?.in?.includes(s.deliveryId)),
    aggregate: async ({ where }: any) => ({
      _max: { snapshotOrder: Math.max(-1, ...stops.filter((s) => s.routeId === where.routeId).map((s) => s.snapshotOrder)) },
    }),
    create: async ({ data }: any) => {
      const row = { id: `stop-${++stopSeq}`, billingExempt: false, ...data };
      stops.push(row);
      return row;
    },
    // INVARIANTE DO INICIAR (15/08) — `congelarStops` lê de volta do banco
    // quantas linhas ficaram atadas a ESTA rota antes de devolver o controle
    // pro `iniciarRota`. Sem este método o dublê quebra com TypeError.
    count: async ({ where }: any) => stops.filter((s) => s.routeId === where.routeId
      && (!where.deliveryId?.in || where.deliveryId.in.includes(s.deliveryId))).length,
  };
  prisma.$executeRawUnsafe = async () => 0;
  prisma.$transaction = async (callback: any) => callback(prisma);

  const cobranca: any = {
    garantirDiaPago: async () => undefined,
    assertAssentoDoDia: async () => undefined,
    garantirPasseDoDia: async () => undefined,
  };

  // 24/08/2026 — TODA rota nasce TRACKED (hard-on): o iniciar exige o serviço
  // de tracking pra abrir a sessão de GPS. Dublê mínimo, fiel ao contrato.
  const tracking: any = {
    ensureSessionForStartedRoute: async () => ({ id: 'sess-teste', status: 'ACTIVE' }),
    discardUnboundSessionAfterRouteFailure: async () => undefined,
    getOperationalRouteMetadata: async () => ({
      routeId: 'route-1',
      trackingRequired: true,
      routeStatus: 'ACTIVE',
      trackingSessionId: 'sess-teste',
      trackingStatus: 'ACTIVE',
    }),
  };
  const rota = new LogisticaRotaService(prisma, cobranca, tracking);
  (rota as any).logger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  return { rota, gravados, agregados, statusGravado, ids: cru.map((p) => p.id) };
}

test('dia limpo: a numeração começa no ZERO, como sempre foi', async () => {
  const { rota, gravados } = bancada({ maiorFechada: null });

  await rota.planejarRota(41, { date: DIA, ordemManual: ['d2', 'd1', 'd3'] }, 7, 7);

  assert.deepEqual(
    gravados,
    [{ id: 'd2', rotaOrdem: 0 }, { id: 'd1', rotaOrdem: 1 }, { id: 'd3', rotaOrdem: 2 }],
    'sem parada fechada no dia o piso é 0 — o comportamento de hoje não pode mudar',
  );
});

test('dia com fechadas até a ordem 3: as abertas começam na 4 (nada colide)', async () => {
  const { rota, gravados } = bancada({ maiorFechada: 3 });

  const plano = await rota.planejarRota(41, { date: DIA, ordemManual: ['d2', 'd1', 'd3'] }, 7, 7);

  assert.deepEqual(
    gravados,
    [{ id: 'd2', rotaOrdem: 4 }, { id: 'd1', rotaOrdem: 5 }, { id: 'd3', rotaOrdem: 6 }],
    'as 4 fechadas ocupam 0..3; as abertas seguem a partir da 4, na ordem do dedo',
  );
  assert.deepEqual(
    plano.paradas.map((p: any) => ({ id: p.id, rotaOrdem: p.rotaOrdem })),
    gravados,
    'o número que SAI na resposta é o mesmo que foi gravado — app e banco na mesma régua',
  );
});

test('a consulta do piso é escopada: empresa + motorista + dia, e só status FECHADO', async () => {
  const { rota, agregados } = bancada({ maiorFechada: 1 });

  await rota.planejarRota(41, { date: DIA, ordemManual: ['d1'] }, 7, 7);

  assert.equal(agregados.length, 1, 'uma consulta só — o piso não vira N+1');
  const onde = agregados[0].where;
  assert.equal(onde.companyId, 41, 'multi-tenant: o piso é da empresa da rota');
  assert.equal(onde.entregadorId, 7, 'o piso é do motorista da rota, nunca da empresa inteira');
  assert.ok(onde.scheduledAt?.gte instanceof Date && onde.scheduledAt?.lte instanceof Date,
    'o piso só olha a janela do dia — fechada de outro dia não divide tela com esta rota');
  assert.deepEqual([...onde.status.notIn].sort(), ['agendada', 'em_rota'],
    'fechada = tudo que NÃO está aberto (entregue e cancelada guardam o número)');
  assert.deepEqual(agregados[0]._max, { rotaOrdem: true }, 'pergunta só o maior número');
});

test('admin planejando a empresa inteira: o piso não filtra por motorista', async () => {
  const { rota, agregados } = bancada({ maiorFechada: null });

  await rota.planejarRota(41, { date: DIA, ordemManual: ['d1'] });

  assert.equal(agregados[0].where.entregadorId, undefined,
    'sem motorista no escopo, o piso enxerga o dia da empresa — igual ao fetch das abertas');
});

test('iniciar com o piso longe do zero ainda marca a 1ª parada (o find não pode falhar calado)', async () => {
  const { rota, statusGravado } = bancada({ maiorFechada: 9 });

  await rota.iniciarRota(41, { date: DIA, ordemManual: ['d2', 'd1', 'd3'] }, 7, 7);

  assert.deepEqual(
    statusGravado.filter((s) => s.status === 'em_rota'),
    [{ id: 'd2', status: 'em_rota' }],
    'a 1ª do plano (menor ordem = 10, não 0) é quem entra em rota',
  );
});
