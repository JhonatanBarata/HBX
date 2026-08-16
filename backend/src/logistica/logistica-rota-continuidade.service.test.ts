import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { LogisticaRotaContinuidadeService } from './logistica-rota-continuidade.service';

const actor = { id: 9, companyId: 7, role: 'ADMIN' };

function target(overrides: Record<string, unknown> = {}) {
  return {
    ref: 'route:route-old-123',
    kind: 'route',
    routeId: 'route-old-123',
    routeDate: '2026-08-12',
    effectiveDate: '2026-08-12',
    ownerId: 8,
    sourceOwnerId: 8,
    ownerName: 'André',
    routeStatus: 'PLANNED',
    operationalEndedAt: null,
    routeStartedAt: null,
    parked: false,
    deliveries: [
      { id: 'done', status: 'entregue', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 0, startedAt: null, arrivedAt: new Date() },
      { id: 'open-a', status: 'agendada', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 1, startedAt: null, arrivedAt: null },
      { id: 'open-b', status: 'agendada', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 2, startedAt: null, arrivedAt: null },
    ],
    ...overrides,
  } as any;
}

test('Puxar leva só abertas, preserva o snapshot e gateia assento no dia de destino', async () => {
  const calls: any = { gate: null, countWhere: null, plan: null };
  const tx: any = {
    $executeRawUnsafe: async () => 1,
    entrega: {
      findMany: async () => [{ id: 'open-a' }, { id: 'open-b' }],
      updateMany: async () => ({ count: 2 }),
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => where?.id
        ? { status: 'PLANNED', routeDate: '2026-08-12', operationalEndedAt: null, startedAt: null }
        : null,
      updateMany: async () => ({ count: 1 }),
    },
    logisticaRouteStop: {
      findMany: async () => [
        { deliveryId: 'open-a', delivery: { entregadorId: 8 } },
        { deliveryId: 'open-b', delivery: { entregadorId: 8 } },
      ],
    },
  };
  const prisma: any = {
    user: { findFirst: async () => ({ id: 9, companyId: 7, role: 'ADMIN', isSystemMaster: false }) },
    userTeamPolicy: { findUnique: async () => null },
    logisticaRoute: { findFirst: async () => null },
    entrega: {
      count: async ({ where }: any) => { calls.countWhere = where; return 1; },
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const rota: any = {
    planejarRota: async (...args: any[]) => { calls.plan = args; return { paradas: [] }; },
  };
  const cobranca: any = {
    assertAssentoDoDia: async (...args: any[]) => { calls.gate = args; },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, cobranca, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target();

  const result = await service.puxar(actor, 'route:route-old-123', 8);
  const today = canonicalRouteDate();
  assert.equal(result.date, today);
  assert.deepEqual(calls.countWhere.id.notIn, ['open-a', 'open-b'], 'entregue não sai da conta do motorista A');
  assert.equal(calls.gate[2], today, 'carry-over deve gatear o assento de hoje');
  assert.deepEqual(calls.plan[1].deliveryIds, ['open-a', 'open-b']);
});

test('Continuar rota velha deixa concluídos e snapshot na execução antiga até o novo Iniciar', async () => {
  const calls: any = { plan: null };
  const tx: any = {
    $executeRawUnsafe: async () => 1,
    entrega: {
      findMany: async () => [{ id: 'open-a' }, { id: 'open-b' }],
      updateMany: async () => ({ count: 2 }),
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => where?.id
        ? { status: 'PLANNED', routeDate: '2026-08-12', operationalEndedAt: null, startedAt: null }
        : null,
      updateMany: async () => ({ count: 1 }),
    },
    logisticaRouteStop: {
      findMany: async () => [
        { deliveryId: 'open-a', delivery: { entregadorId: 9 } },
        { deliveryId: 'open-b', delivery: { entregadorId: 9 } },
      ],
    },
    logisticaTrackingSession: { updateMany: async () => ({ count: 0 }) },
  };
  const prisma: any = { $transaction: async (fn: any) => fn(tx) };
  const rota: any = { planejarRota: async (...args: any[]) => { calls.plan = args; return {}; } };
  const cobranca: any = { assertAssentoDoDia: async () => undefined };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, cobranca, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target({
    ownerId: 9,
    sourceOwnerId: 9,
    ownerName: 'Dono',
    deliveries: target().deliveries.map((row: any) => ({ ...row, entregadorId: 9 })),
  });

  await service.retomar(actor, 'route:route-old-123', 9);
  assert.deepEqual(calls.plan[1].ordemManual, ['open-a', 'open-b']);
});

test('Puxar é recusado antes de mudar dono quando o destino já está em rota ativa', async () => {
  let transactions = 0;
  const prisma: any = {
    user: { findFirst: async () => ({ id: 9, companyId: 7, role: 'ADMIN', isSystemMaster: false }) },
    userTeamPolicy: { findUnique: async () => null },
    logisticaRoute: { findFirst: async () => ({ id: 'active-b' }) },
    $transaction: async () => { transactions += 1; },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target();

  await assert.rejects(
    () => service.puxar(actor, 'route:route-old-123', 8),
    /já está com uma rota em andamento/i,
  );
  assert.equal(transactions, 0);
});

test('Cancelar rascunho usa escopo exato e nunca encerra rota formal do dia', async () => {
  let input: any = null;
  const rota: any = { limparDia: async (_c: number, value: any) => { input = value; return { ok: true }; } };
  const service = new LogisticaRotaContinuidadeService(
    {} as any, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target({
    ref: 'draft:9:2026-08-12', kind: 'draft', routeId: null, ownerId: 9,
    deliveries: [{ id: 'draft-a', status: 'agendada', entregadorId: 9 }],
  });

  await service.cancelar(actor, 'draft:9:2026-08-12');
  assert.equal(input.skipRoute, true);
  assert.deepEqual(input.deliveryIds, ['draft-a']);
});

// ── A ROTA FANTASMA (14/08, print do dono): "51 paradas · 0 entregues" com
// dock Cancelar|Iniciar|Montagem, e Cancelar devolvia 409 "Esta rota não tem
// mais paradas abertas." — o `resolve()` usava a MESMA checagem pra todos os
// verbos, inclusive cancelar, que é o único verbo de ESCAPE. Estes testes
// batem no `resolve()` DE VERDADE (sem mock de `resolve`), porque o bug mora
// justamente aí dentro.
function routeGhostPrisma(overrides: Record<string, unknown> = {}) {
  return {
    logisticaRoute: {
      findFirst: async () => ({
        id: 'route-ghost-1',
        routeDate: '2026-08-12',
        status: 'PLANNED',
        startedAt: null,
        operationalEndedAt: null,
        entregadorId: 8,
        entregador: { name: 'André' },
        stops: [
          {
            delivery: {
              id: 'd1', status: 'cancelada', entregadorId: 8, entregador: null,
              scheduledAt: new Date(), rotaOrdem: 3, startedAt: null, arrivedAt: null,
            },
          },
          {
            delivery: {
              id: 'd2', status: 'entregue', entregadorId: 8, entregador: null,
              scheduledAt: new Date(), rotaOrdem: 1, startedAt: null, arrivedAt: new Date(),
            },
          },
        ],
        ...overrides,
      }),
    },
    // 15/08 — `cancelar` agora deriva o DIA quando a rota morta não tem
    // abertas (`diaDoAlvoMorto`). Default: dia TAMBÉM vazio (nenhuma linha),
    // que é o caso que os 4 testes abaixo (abrir/retomar/puxar e o próprio
    // cancelar-sempre-graciosa) sempre mediram.
    entrega: { findMany: async () => [] },
  } as any;
}

test('Cancelar rota fantasma (route: sem nenhuma parada aberta, dia TAMBÉM vazio) alcança a saída graciosa, nunca 409', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  const result = await service.cancelar(actor, 'route:route-ghost-1', 8);
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 0 } }, 'beco fechado: cancelar sempre sai, mesmo sem abertas');
});

// ── FURO 4 (15/08, LOTE 1.2 — revisão adversarial ao lote 1.1) — TEATRO DE
// TESTE: o double antigo de `logisticaRoute.updateMany` devolvia `{count:1}`
// SEMPRE, ignorando o `where` — contra Postgres de verdade, um `where` com
// `operationalEndedAt: null` bate ZERO linhas quando a lápide JÁ está
// encerrada (a cena medida em prod: `operationalEndedAt` gravado 2 min
// depois do `startedAt`). O teste "passava" sem provar NADA sobre o efeito.
//
// Este par de dublês simula um Postgres mínimo: mantém o estado REAL da
// linha (route/sessão) e só muta quando o `where` bate — exatamente a
// pergunta que o revisor fez. Compartilhado pelas duas cenas abaixo (a
// medida, já encerrada; e a nova, viva) para que as DUAS respeitem a MESMA
// régua.
/**
 * 🔴 FURO 4 DO LOTE 1.3 (revisão adversarial ao 1.2) — O DUBLÊ NÃO COBRAVA
 * `companyId`. Uma regressão que tirasse o escopo de empresa das DUAS escritas
 * novas (o `updateMany` da rota e o da sessão de tracking) passava VERDE aqui,
 * porque o "Postgres mínimo" só olhava `id`/`routeId`/`status`. Multi-tenant é
 * a lei nº1 da casa: nada atravessa empresa. Agora a linha do dublê PERTENCE a
 * uma empresa (`EMPRESA`) e nenhum `where` sem o `companyId` certo casa —
 * exatamente o que Postgres faria.
 */
const EMPRESA = 7;

function bancadaComEfeitoReal(opts: {
  routeId: string;
  routeStatus: string;
  operationalEndedAtInicial: Date | null;
  sessionStatusInicial: 'ACTIVE' | 'ENDED' | null;
}) {
  const routeState = { operationalEndedAt: opts.operationalEndedAtInicial };
  const sessionState = { status: opts.sessionStatusInicial };
  const routeUpdateManyCalls: any[] = [];
  const sessionUpdateManyCalls: any[] = [];
  const daEmpresa = (where: any) => Number(where?.companyId) === EMPRESA;
  const logisticaRoute = {
    findFirst: async () => ({
      id: opts.routeId,
      routeDate: '2026-08-15',
      status: opts.routeStatus,
      startedAt: new Date('2026-08-15T16:57:00.000Z'),
      operationalEndedAt: routeState.operationalEndedAt,
      entregadorId: 8,
      entregador: { name: 'André' },
      stops: [], // ZERO LogisticaRouteStop — a lápide/rota-viva-sem-stop, como medido
    }),
    // O "Postgres mínimo": só muta e só conta quem o `where` realmente pega.
    updateMany: async (args: any) => {
      routeUpdateManyCalls.push(args);
      const bateId = args.where.id === opts.routeId;
      const bateEndedAt = !('operationalEndedAt' in args.where) || args.where.operationalEndedAt === routeState.operationalEndedAt;
      if (!bateId || !bateEndedAt || !daEmpresa(args.where)) return { count: 0 };
      routeState.operationalEndedAt = args.data.operationalEndedAt;
      return { count: 1 };
    },
  };
  const logisticaTrackingSession = {
    updateMany: async (args: any) => {
      sessionUpdateManyCalls.push(args);
      const alvo = args.where.routeId;
      const bateRoute = Array.isArray(alvo?.in) ? alvo.in.includes(opts.routeId) : alvo === opts.routeId;
      const bateStatus = sessionState.status === args.where.status;
      if (!bateRoute || !bateStatus || !daEmpresa(args.where)) return { count: 0 };
      sessionState.status = args.data.status;
      return { count: 1 };
    },
  };
  return { logisticaRoute, logisticaTrackingSession, routeState, sessionState, routeUpdateManyCalls, sessionUpdateManyCalls };
}

// ── A CENA MEDIDA NO BANCO DE PRODUÇÃO (15/08): rota
// `cmsusrv6k05otsfjwx1wgdl1j` · company 41 · status ACTIVE (não PLANNED) ·
// ZERO `LogisticaRouteStop` · criada e `startedAt` no MESMO segundo (16:57) ·
// `operationalEndedAt` 2 min depois (16:59) — e no mesmo minuto o dia foi
// REMONTADO: 51 entregas novas `agendada` com `rotaOrdem` 0..50, nenhuma
// dentro de stop. Bate segundo a segundo com o print do dono.
//
// A lápide medida JÁ chega com `operationalEndedAt` PREENCHIDO (o cancelar
// anterior, sem esta cura, já carimbou) — o `where.operationalEndedAt: null`
// do updateMany PRÓPRIO deste cancelar bate ZERO linhas aqui: não há nada
// pra re-encerrar (idempotente, e é assim que TEM que ser). O que este teste
// prova de verdade (FURO 2) é que a sessão de tracking ACTIVE, se sobreviveu
// até aqui, fecha JUNTO — mesmo a lápide já estando encerrada.
test('CENA MEDIDA: rota ACTIVE encerrada com zero stops + 51 abertas no dia — Cancelar chama limparDia com os 51 ids ORDENADOS e o entregadorId do DONO DA LINHA', async () => {
  const abertas = Array.from({ length: 51 }, (_, i) => ({
    id: `d${i}`,
    status: 'agendada',
    entregadorId: 8,
    scheduledAt: new Date('2026-08-15T15:00:00.000Z'),
    // fora de ordem DE PROPÓSITO — prova que quem ordena é o `rotaOrdem`, não
    // a ordem de leitura do `findMany`.
    rotaOrdem: 50 - i,
    startedAt: null,
    arrivedAt: null,
    entregador: { name: 'André' },
  }));
  const bancada = bancadaComEfeitoReal({
    routeId: 'cmsusrv6k05otsfjwx1wgdl1j',
    routeStatus: 'ACTIVE',
    operationalEndedAtInicial: new Date('2026-08-15T16:59:00.000Z'), // JÁ encerrada, como medido
    sessionStatusInicial: 'ACTIVE', // sessão TRACKED que sobreviveu à lápide — o que o FURO 2 fecha
  });
  const prisma: any = {
    logisticaRoute: bancada.logisticaRoute,
    logisticaTrackingSession: bancada.logisticaTrackingSession,
    entrega: { findMany: async () => abertas },
  };
  const calls: any = { limparDia: null };
  const rota: any = {
    limparDia: async (companyId: number, input: any, entregadorId: number, actorUserId: number) => {
      calls.limparDia = { companyId, input, entregadorId, actorUserId };
      return { ok: true, resumo: { canceladas: input.deliveryIds.length } };
    },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  // O ATOR é o PRÓPRIO dono da rota (o André do print, cancelando o dia dele
  // — não um admin mexendo no aparelho de outra pessoa): com `target.ownerId
  // === actorId` os dois guardas de "outro dono"/"em andamento em outro
  // aparelho" nem entram em jogo, exatamente como na cena medida.
  const dono = { id: 8, companyId: 7, role: 'DRIVER' };

  const result = await service.cancelar(dono, 'route:cmsusrv6k05otsfjwx1wgdl1j', 8);

  assert.ok(calls.limparDia, 'hoje: a execução para no `if (!openIds.length)` e devolve canceladas:0 SEM chamar limparDia');
  assert.equal(calls.limparDia.companyId, 7);
  assert.equal(calls.limparDia.entregadorId, 8, 'o dono da LINHA da rota (sourceOwnerId), nunca um derivado');
  assert.equal(calls.limparDia.input.skipRoute, true, 'D2: a lápide é encerrada por conta própria — routeId pro limparDia faria o CAS dela reprovar');
  assert.equal(calls.limparDia.input.routeId, undefined, 'nunca aponta a lápide para o limparDia');
  const esperado = [...abertas].sort((a, b) => a.rotaOrdem - b.rotaOrdem).map((r) => r.id);
  assert.deepEqual(calls.limparDia.input.deliveryIds, esperado, '51 ids, ordenados por rotaOrdem — não pela ordem de leitura');
  assert.equal(bancada.routeUpdateManyCalls.length, 1, 'o updateMany PRÓPRIO do cancelar É chamado, sempre — a lápide pode já estar encerrada');
  assert.equal(bancada.routeUpdateManyCalls[0].where.id, 'cmsusrv6k05otsfjwx1wgdl1j');
  assert.equal(bancada.routeUpdateManyCalls[0].where.companyId, EMPRESA, 'FURO 4 (lote 1.3): nada atravessa empresa — o where da rota escopa por companyId');
  assert.equal(bancada.sessionUpdateManyCalls[0].where.companyId, EMPRESA, 'FURO 4 (lote 1.3): idem no where da sessão de tracking');
  assert.equal(bancada.routeUpdateManyCalls[0].where.operationalEndedAt, null, 'FURO 4: o where SÓ re-encerra quem ainda não foi encerrado');
  assert.ok(bancada.routeUpdateManyCalls[0].data.operationalEndedAt instanceof Date);
  // FURO 4, EFEITO MEDIDO (não teatro): contra a lápide JÁ encerrada, este
  // updateMany bate ZERO linhas — é exatamente o que Postgres faria.
  assert.ok(bancada.routeState.operationalEndedAt instanceof Date, 'a lápide continua encerrada (idempotente, nada mudou)');
  // FURO 2, EFEITO MEDIDO: a sessão ACTIVE fecha, MESMO a lápide já estando
  // encerrada de antes (não gateado no count do updateMany da rota).
  assert.equal(bancada.sessionUpdateManyCalls.length, 1, 'o fechamento da sessão roda sempre que target.routeId existe');
  assert.equal(bancada.sessionState.status, 'ENDED', 'a LogisticaTrackingSession ACTIVE fecha junto — sem isto, CONFLICT->REJECTED preso 24h na fila do aparelho');
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 51 } });
});

// ── FURO 4 (15/08, LOTE 1.2) — O CASO QUE FALTAVA: rota VIVA, ainda NÃO
// encerrada (`operationalEndedAt` nulo — ex.: PLANNED deixada por um Iniciar
// que falhou depois do congelamento, zero stops). É o ÚNICO caso em que o
// `where.operationalEndedAt: null` do updateMany PRÓPRIO do cancelar
// realmente PRECISA casar uma linha — sem um teste que meça o EFEITO (não só
// a chamada), o "teatro" do dublê antigo escondia justo o caso que importa.
test('FURO 4 · rota VIVA (PLANNED, ainda não encerrada) sem stops — o updateMany do cancelar REALMENTE encerra (efeito medido, não teatro)', async () => {
  const abertas = [
    {
      id: 'd0', status: 'agendada', entregadorId: 8,
      scheduledAt: new Date('2026-08-15T15:00:00.000Z'), rotaOrdem: 0,
      startedAt: null, arrivedAt: null, entregador: { name: 'André' },
    },
  ];
  const bancada = bancadaComEfeitoReal({
    routeId: 'route-planned-viva-1',
    routeStatus: 'PLANNED',
    operationalEndedAtInicial: null, // AINDA VIVA — o caso que faltava
    sessionStatusInicial: null, // ESSENTIAL, sem sessão TRACKED nenhuma
  });
  const prisma: any = {
    logisticaRoute: bancada.logisticaRoute,
    logisticaTrackingSession: bancada.logisticaTrackingSession,
    entrega: { findMany: async () => abertas },
  };
  const calls: any = { limparDia: null };
  const rota: any = {
    limparDia: async (companyId: number, input: any, entregadorId: number, actorUserId: number) => {
      calls.limparDia = { companyId, input, entregadorId, actorUserId };
      return { ok: true, resumo: { canceladas: input.deliveryIds.length } };
    },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const dono = { id: 8, companyId: 7, role: 'DRIVER' };

  const result = await service.cancelar(dono, 'route:route-planned-viva-1', 8);

  assert.ok(calls.limparDia, 'chama limparDia com o dia derivado da rota-morta-sem-stop');
  // FURO 4, EFEITO MEDIDO: agora sim o where casa — a rota estava viva.
  assert.equal(bancada.routeUpdateManyCalls.length, 1);
  assert.equal(bancada.routeUpdateManyCalls[0].where.companyId, EMPRESA, 'FURO 4 (lote 1.3): o where da rota escopa por companyId');
  assert.equal(bancada.sessionUpdateManyCalls[0].where.companyId, EMPRESA, 'FURO 4 (lote 1.3): o where da sessão escopa por companyId');
  assert.equal(bancada.routeUpdateManyCalls[0].where.operationalEndedAt, null);
  assert.ok(
    bancada.routeState.operationalEndedAt instanceof Date,
    'FURO 4: a rota VIVA realmente fica ENCERRADA depois do cancelar — o where casou de verdade, não é teatro',
  );
  // Sem sessão TRACKED (ESSENTIAL) o updateMany da sessão ainda roda (é
  // incondicional em `target.routeId`), mas não casa e não muda nada.
  assert.equal(bancada.sessionUpdateManyCalls.length, 1);
  assert.equal(bancada.sessionState.status, null, 'sem sessão ACTIVE pra fechar, o no-op é honesto (count:0)');
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 1 } });
});

/**
 * 🔴 FURO 2, A OUTRA METADE (15/08, LOTE 1.3 — revisão adversarial ao 1.2).
 * O fechamento ACTIVE→ENDED da `LogisticaTrackingSession` que o lote 1.2 pôs
 * só roda no ramo `route:` COM ZERO parada aberta. Só que a CENA REAL medida em
 * produção — a lápide já ENCERRADA, com o dia remontado por cima — é roteada
 * pro ramo `draft:` pela régua irmã do MESMO commit (`refDaResposta`: rota com
 * `routeStatus === 'ENCERRADA'` ⇒ `draft:`), e no ramo draft o `limparDia` vai
 * com `skipRoute:true` (alvo draft não tem `routeId`) ⇒ `lockedRouteIds` fica
 * vazio lá dentro e a sessão NUNCA fechava. O par 1.2 curava exatamente o
 * caminho que a régua irmã tinha acabado de deixar de usar.
 *
 * A bancada é o mesmo "Postgres mínimo" das cenas acima: a linha PERTENCE à
 * empresa, e nenhum `where` sem `companyId` casa.
 */
function bancadaDoDraft(opts: { rotasDoDia: string[]; sessionStatusInicial: 'ACTIVE' | 'ENDED' | null }) {
  const sessionState = { status: opts.sessionStatusInicial };
  const routeFindManyCalls: any[] = [];
  const sessionUpdateManyCalls: any[] = [];
  const logisticaRoute = {
    findMany: async (args: any) => {
      routeFindManyCalls.push(args);
      if (Number(args?.where?.companyId) !== EMPRESA) return [];
      return opts.rotasDoDia.map((id) => ({ id }));
    },
  };
  const logisticaTrackingSession = {
    updateMany: async (args: any) => {
      sessionUpdateManyCalls.push(args);
      const alvo = args.where.routeId;
      const lista = Array.isArray(alvo?.in) ? alvo.in : [alvo];
      const bateRoute = opts.rotasDoDia.some((id) => lista.includes(id));
      const bateStatus = sessionState.status === args.where.status;
      if (!bateRoute || !bateStatus || Number(args.where.companyId) !== EMPRESA) return { count: 0 };
      sessionState.status = args.data.status;
      return { count: 1 };
    },
  };
  return { logisticaRoute, logisticaTrackingSession, sessionState, routeFindManyCalls, sessionUpdateManyCalls };
}

const abertaDoDraft = {
  id: 'd-draft-1', status: 'agendada', entregadorId: 8,
  scheduledAt: new Date('2026-08-15T15:00:00.000Z'), rotaOrdem: 0,
  startedAt: null, arrivedAt: null, entregador: { name: 'André' },
};

test('FURO 2 (outra metade) · Cancelar no ramo draft: fecha a LogisticaTrackingSession ACTIVE da rota do dono+dia, com companyId nas DUAS pontas', async () => {
  const bancada = bancadaDoDraft({ rotasDoDia: ['route-lapide-encerrada'], sessionStatusInicial: 'ACTIVE' });
  const prisma: any = {
    entrega: { findMany: async () => [abertaDoDraft] },
    logisticaRoute: bancada.logisticaRoute,
    logisticaTrackingSession: bancada.logisticaTrackingSession,
  };
  const calls: any = { limparDia: null };
  const rota: any = {
    limparDia: async (companyId: number, input: any, entregadorId: number, actorUserId: number) => {
      calls.limparDia = { companyId, input, entregadorId, actorUserId };
      return { ok: true, resumo: { canceladas: input.deliveryIds.length } };
    },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const dono = { id: 8, companyId: EMPRESA, role: 'DRIVER' };

  const result = await service.cancelar(dono, 'draft:8:2026-08-15');

  assert.ok(calls.limparDia, 'o ramo draft continua chamando limparDia normalmente');
  assert.equal(calls.limparDia.input.skipRoute, true, 'alvo draft não tem routeId: skipRoute é true — e é por isso que o limparDia não fecha sessão nenhuma');
  assert.equal(bancada.routeFindManyCalls.length, 1, 'HOJE (antes do fix): o ramo draft nem procura a rota do dia — a sessão fica ACTIVE pra sempre');
  const [busca] = bancada.routeFindManyCalls;
  assert.equal(busca.where.companyId, EMPRESA, 'nada atravessa empresa: a LEITURA da rota do dia escopa por companyId');
  assert.equal(busca.where.entregadorId, 8, 'a rota é do DONO do rascunho, não de qualquer um');
  assert.equal(busca.where.routeDate, '2026-08-15', 'e do DIA do rascunho');
  assert.equal(bancada.sessionUpdateManyCalls.length, 1);
  const [escrita] = bancada.sessionUpdateManyCalls;
  assert.equal(escrita.where.companyId, EMPRESA, 'nada atravessa empresa: a ESCRITA da sessão escopa por companyId');
  assert.deepEqual(escrita.where.routeId, { in: ['route-lapide-encerrada'] });
  assert.equal(escrita.where.status, 'ACTIVE', 'só a sessão ACTIVE fecha — ENDED não se re-encerra');
  assert.equal(escrita.data.status, 'ENDED');
  assert.ok(escrita.data.endedAt instanceof Date);
  assert.equal(bancada.sessionState.status, 'ENDED', 'EFEITO medido: a sessão realmente fecha — sem isto, CONFLICT->REJECTED preso 24h na fila do aparelho');
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 1 } });
});

test('FURO 2 (outra metade, controle) · draft: de um dia SEM rota nenhuma não inventa escrita — no-op honesto', async () => {
  const bancada = bancadaDoDraft({ rotasDoDia: [], sessionStatusInicial: null });
  const prisma: any = {
    entrega: { findMany: async () => [abertaDoDraft] },
    logisticaRoute: bancada.logisticaRoute,
    logisticaTrackingSession: bancada.logisticaTrackingSession,
  };
  const rota: any = { limparDia: async () => ({ ok: true, resumo: { canceladas: 1 } }) };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const dono = { id: 8, companyId: EMPRESA, role: 'DRIVER' };

  await service.cancelar(dono, 'draft:8:2026-08-15');

  assert.equal(bancada.routeFindManyCalls.length, 1, 'procura — é barato e é a única forma de saber');
  assert.equal(bancada.sessionUpdateManyCalls.length, 0, 'sem rota identificável, nenhuma escrita de sessão: updateMany com lista vazia pegaria o que não devia');
});

test('F5 · Cancelar draft: cujo dia já ficou vazio (não resolve mais) alcança a saída graciosa — antes era 404 cru', async () => {
  const prisma: any = { entrega: { findMany: async () => [] } };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const dono = { id: 8, companyId: 7, role: 'DRIVER' };

  const result = await service.cancelar(dono, 'draft:8:2026-08-15');
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 0 } });
});

test('F5 · Cancelar draft: de dia vazio de OUTRO dono continua Forbidden — a saída graciosa nunca vira sonda de tenant', async () => {
  const prisma: any = { entrega: { findMany: async () => [] } };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const outroFuncionario = { id: 5, companyId: 7, role: 'DRIVER' };

  await assert.rejects(
    () => service.cancelar(outroFuncionario, 'draft:8:2026-08-15'),
    /Somente o dono da rota ou um administrador pode cancelá-la/,
  );
});

test('Abrir rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.abrir(actor, 'route:route-ghost-1'),
    /Esta rota não tem mais paradas abertas/,
  );
});

test('Retomar rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.retomar(actor, 'route:route-ghost-1', 8),
    /Esta rota não tem mais paradas abertas/,
  );
});

test('Puxar rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.puxar(actor, 'route:route-ghost-1', 8),
    /Esta rota não tem mais paradas abertas/,
  );
});
