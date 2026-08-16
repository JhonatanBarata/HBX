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
/**
 * 🔴 O DUBLÊ NÃO MODELAVA `operationalEndedAt` (16/08, LOTE 1.4 — furo achado
 * pela revisão adversarial ao 1.3). Ele devolvia TODA rota do dono+dia
 * ignorando qualquer filtro além do `companyId`, então a régua não conseguia
 * nem PERGUNTAR a coisa que importa: *esta rota está viva?* Com isso, um
 * `encerrarSessoesDoDia` que matasse a sessão de uma rota RODANDO passava
 * verde. Agora cada rota do dia é uma LINHA com estado (`operationalEndedAt`:
 * `null` = viva na rua; `Date` = lápide), e o `findMany` só devolve quem o
 * `where` realmente pega — como Postgres faria.
 */
/**
 * 🔴 O DUBLÊ TAMBÉM PRECISA DOS STOPS (16/08, LOTE 1.5). A régua do 1.4
 * perguntava só `operationalEndedAt`; a do 1.5 pergunta TAMBÉM se a rota ainda
 * segura parada aberta — e sem modelar os stops o dublê não conseguiria
 * reprovar uma varredura que matasse a rota que está na rua. `stops` é a lista
 * de STATUS das entregas presas nesta rota (o que o Postgres olharia em
 * `stops: { none: { delivery: { status: { in: [...] } } } }`).
 */
type RotaDoDia = { id: string; operationalEndedAt: Date | null; stops?: string[] };

/* Avalia o `where` como o Postgres avaliaria — e EXPLODE no que não entende.
   Devolver `true` no desconhecido é como o dublê do 1.3 passava verde uma
   varredura sem filtro nenhum: um `where` novo entraria calado e a bancada
   certificaria o contrário do que o banco faria. */
function casaOWhere(rota: RotaDoDia, cond: any): boolean {
  if (!cond || typeof cond !== 'object') throw new Error('dublê: condição vazia no where');
  return Object.keys(cond).every((chave) => {
    if (chave === 'companyId' || chave === 'entregadorId' || chave === 'routeDate') return true;
    if (chave === 'OR') {
      const ramos = cond.OR;
      if (!Array.isArray(ramos) || !ramos.length) throw new Error('dublê: OR precisa de ramos');
      return ramos.some((ramo: any) => casaOWhere(rota, ramo));
    }
    if (chave === 'operationalEndedAt') {
      const filtro = cond.operationalEndedAt;
      if (filtro === null) return rota.operationalEndedAt === null;
      if (filtro && 'not' in filtro && filtro.not === null) return rota.operationalEndedAt !== null;
      throw new Error(`dublê: filtro de operationalEndedAt não entendido: ${JSON.stringify(filtro)}`);
    }
    if (chave === 'stops') {
      const none = cond.stops?.none;
      if (!none) throw new Error('dublê: só entendo `stops: { none: ... }`');
      const abertos = none?.delivery?.status?.in;
      if (!Array.isArray(abertos)) throw new Error('dublê: `stops.none` sem lista de status');
      return !(rota.stops || []).some((status) => abertos.includes(status));
    }
    throw new Error(`dublê: campo desconhecido no where da rota: ${chave}`);
  });
}

function bancadaDoDraft(opts: { rotasDoDia: RotaDoDia[]; sessionStatusInicial: 'ACTIVE' | 'ENDED' | null }) {
  const sessionState = { status: opts.sessionStatusInicial };
  const routeFindManyCalls: any[] = [];
  const routeUpdateManyCalls: any[] = [];
  const sessionUpdateManyCalls: any[] = [];
  const logisticaRoute = {
    findMany: async (args: any) => {
      routeFindManyCalls.push(args);
      if (Number(args?.where?.companyId) !== EMPRESA) return [];
      const campos = Object.keys(args?.select || {});
      return opts.rotasDoDia
        .filter((rota) => casaOWhere(rota, args?.where || {}))
        /* O `select` do dublê devolve SÓ o que o serviço pediu — como o
           Postgres faria. Sem isto, um serviço que lesse `operationalEndedAt`
           sem pedir na projeção passaria verde aqui e explodiria (undefined)
           contra o banco de verdade. */
        .map((rota) => (campos.includes('operationalEndedAt')
          ? { id: rota.id, operationalEndedAt: rota.operationalEndedAt }
          : { id: rota.id }));
    },
    /* 🔴 LOTE 1.6 — a rota ÓRFÃ também é ESCRITA agora (carimbo de
       `operationalEndedAt`). O dublê aplica o `where` de verdade: `id: { in }`
       + `operationalEndedAt: null` (o CAS que impede recarimbar lápide). */
    updateMany: async (args: any) => {
      routeUpdateManyCalls.push(args);
      const where = args?.where || {};
      if (Number(where.companyId) !== EMPRESA) return { count: 0 };
      const alvo = where.id;
      const lista = Array.isArray(alvo?.in) ? alvo.in : [alvo];
      let count = 0;
      opts.rotasDoDia.forEach((rota) => {
        if (!lista.includes(rota.id)) return;
        if (where.operationalEndedAt === null && rota.operationalEndedAt !== null) return;
        Object.assign(rota, args.data);
        count += 1;
      });
      return { count };
    },
  };
  const logisticaTrackingSession = {
    updateMany: async (args: any) => {
      sessionUpdateManyCalls.push(args);
      const alvo = args.where.routeId;
      const lista = Array.isArray(alvo?.in) ? alvo.in : [alvo];
      const bateRoute = opts.rotasDoDia.some((rota) => lista.includes(rota.id));
      const bateStatus = sessionState.status === args.where.status;
      if (!bateRoute || !bateStatus || Number(args.where.companyId) !== EMPRESA) return { count: 0 };
      sessionState.status = args.data.status;
      return { count: 1 };
    },
  };
  return {
    logisticaRoute, logisticaTrackingSession, sessionState,
    routeFindManyCalls, routeUpdateManyCalls, sessionUpdateManyCalls,
  };
}

const abertaDoDraft = {
  id: 'd-draft-1', status: 'agendada', entregadorId: 8,
  scheduledAt: new Date('2026-08-15T15:00:00.000Z'), rotaOrdem: 0,
  startedAt: null, arrivedAt: null, entregador: { name: 'André' },
};

test('FURO 2 (outra metade) · Cancelar no ramo draft: fecha a LogisticaTrackingSession ACTIVE da rota do dono+dia, com companyId nas DUAS pontas', async () => {
  const bancada = bancadaDoDraft({
    // A LÁPIDE: rota JÁ encerrada operacionalmente, com a sessão pendurada. É a
    // cena que este fechamento nasceu pra curar, e ela continua coberta byte a
    // byte depois do filtro do lote 1.4.
    // 🔴 E ELA CHEGA COM PARADA ABERTA PRESA (LOTE 1.5): é o estado
    // `ended_with_pending`, que o próprio serviço nomeia — encerrar o dia não
    // fecha as entregas que sobraram. Essa escolha de fixture é de propósito:
    // ela mantém o ramo "já encerrada" da régua nova OBRIGATÓRIO. Quem trocar o
    // `OR` por um "sem parada aberta" puro reprova aqui na hora.
    rotasDoDia: [{
      id: 'route-lapide-encerrada',
      operationalEndedAt: new Date('2026-08-15T16:59:00.000Z'),
      stops: ['agendada'],
    }],
    sessionStatusInicial: 'ACTIVE',
  });
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
  /* 🔴 A FORMA DO `where` (LOTE 1.5). O 1.4 exigia `operationalEndedAt: { not:
     null }` cravado, e era esse crava que deixava a rota ACTIVE-sem-parada-
     aberta de fora (o furo 2 deste lote). A régua agora é ÓRFÃ = já encerrada
     OU sem nenhuma parada aberta, e a asserção mira o CONTRATO dos dois ramos,
     não a letra de um deles. O que NÃO pode voltar é varredura sem recorte
     nenhum: por isso o `OR` é obrigatório aqui. */
  assert.ok(Array.isArray(busca.where.OR) && busca.where.OR.length === 2,
    'a varredura tem recorte: rota órfã é a JÁ ENCERRADA ou a SEM PARADA ABERTA — nunca "todas do dono+dia"');
  assert.ok(
    busca.where.OR.some((ramo: any) => JSON.stringify(ramo.operationalEndedAt) === JSON.stringify({ not: null })),
    'ramo 1: a lápide (rota já encerrada) continua entrando na varredura — é a cena que este fechamento nasceu pra curar',
  );
  assert.ok(
    busca.where.OR.some((ramo: any) => ramo?.stops?.none?.delivery?.status?.in?.length),
    'ramo 2: a rota que não segura NENHUMA parada aberta é órfã e também entra',
  );
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

/**
 * 🔴 O CANCELAR MATAVA O GPS DE UMA ROTA QUE ESTAVA RODANDO (16/08, LOTE 1.4 —
 * regressão NOVA do lote 1.3, medida pela revisão adversarial). O
 * `encerrarSessoesDoDia` varria por dono+dia e mais nada — sem filtro de
 * `operationalEndedAt`, sem filtro de status — e encerrava ACTIVE→ENDED a
 * sessão de TODAS as rotas que voltassem.
 *
 * A CENA: o motorista está na rua com a rota A (ACTIVE, TRACKED, sessão de
 * rastreamento aberta). Chega uma entrega nova; ele monta e não inicia, então
 * ela fica solta (sem stop) e o Cancelar do admin naquele cartão resolve pro
 * ramo `draft:`. A varredura pegava a rota A junto e matava a sessão dela: os
 * pontos seguintes passam a ser recusados com SESSION_ENDED, calados, no meio
 * do turno — e sessão TRACKED é recurso que a empresa PAGA.
 *
 * A régua: a limpeza é da LÁPIDE (rota já encerrada com sessão pendurada). Rota
 * viva não se toca — quem encerra rota viva é o Encerrar, com a mão do dono.
 */
test('LOTE 1.4 · Cancelar no ramo draft NÃO mata a sessão de uma rota VIVA do mesmo dono+dia (o motorista está na rua com ela)', async () => {
  const bancada = bancadaDoDraft({
    /* 🔴 "VIVA" GANHOU DEFINIÇÃO NO LOTE 1.5: não é só `operationalEndedAt`
       nulo — é a rota que AINDA SEGURA parada aberta. É o que "estar na rua"
       quer dizer, e por isso a fixture agora carrega os stops abertos dela.
       Este é o teste que reprova se a régua nova encerrar a rota viva junto. */
    rotasDoDia: [{
      id: 'route-a-rodando-na-rua',
      operationalEndedAt: null,
      stops: ['em_rota', 'agendada'],
    }],
    sessionStatusInicial: 'ACTIVE',
  });
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

  assert.ok(calls.limparDia, 'o cancelar do rascunho continua fazendo o trabalho dele');
  assert.equal(
    bancada.sessionUpdateManyCalls.length, 0,
    'a rota VIVA não entra na varredura: nenhuma escrita de sessão sai daqui',
  );
  assert.equal(
    bancada.sessionState.status, 'ACTIVE',
    'EFEITO medido: a sessão de rastreamento da rota que está na rua continua ABERTA — sem isto, SESSION_ENDED calado no meio do turno',
  );
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 1 } });
});

/**
 * 🔴 A CURA DO 1.4 DEIXOU UMA SESSÃO ÓRFÃ ABERTA (16/08, LOTE 1.5 — furo 2,
 * apontado pela revisão adversarial ao 1.4). `operationalEndedAt: { not: null }`
 * é estreito DEMAIS: a rota do motorista que cumpriu tudo e foi embora SEM
 * tocar "Encerrar" fica ACTIVE com `operationalEndedAt` NULO e ZERO parada
 * aberta. Ela não está na rua — não há nada a rastrear —, mas a sessão TRACKED
 * dela continua ACTIVE. Aí o dia é cancelado pelo ramo `draft:` (o encaixe
 * solto por cima), a varredura do 1.4 não a alcança, e o comando em voo na fila
 * do aparelho volta a bater CONFLICT ⇒ REJECTED preso até o teto de 24h — o
 * MESMO sintoma que o furo 2 original nasceu pra matar, por outra porta.
 *
 * A régua honesta: sessão ACTIVE de rota que não segura NENHUMA parada aberta
 * é ÓRFÃ e pode fechar; rota com parada aberta (a que está na rua) nunca. O
 * ramo da lápide continua ao lado, porque encerrada COM pendente ainda é rota
 * que acabou (ver a fixture `ended_with_pending` do teste de cima).
 */
test('LOTE 1.5 · Cancelar no ramo draft FECHA a sessão órfã da rota ACTIVE que não segura NENHUMA parada aberta (o motorista foi embora sem Encerrar)', async () => {
  const bancada = bancadaDoDraft({
    rotasDoDia: [{
      id: 'route-cumprida-sem-encerrar',
      operationalEndedAt: null, // ninguém tocou "Encerrar" — segue ACTIVE
      stops: ['entregue', 'entregue'], // e não segura mais nada: órfã
    }],
    sessionStatusInicial: 'ACTIVE',
  });
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

  const result = await service.cancelar(dono, 'draft:8:2026-08-15');

  assert.equal(bancada.sessionUpdateManyCalls.length, 1, 'a sessão órfã tem que ser alcançada pela varredura');
  const [escrita] = bancada.sessionUpdateManyCalls;
  assert.equal(escrita.where.companyId, EMPRESA, 'nada atravessa empresa: a ESCRITA da sessão escopa por companyId');
  assert.deepEqual(escrita.where.routeId, { in: ['route-cumprida-sem-encerrar'] });
  assert.equal(escrita.where.status, 'ACTIVE');
  assert.equal(
    bancada.sessionState.status, 'ENDED',
    'EFEITO medido: a sessão órfã fecha — sem isto o comando em voo vira REJECTED preso até 24h',
  );
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 1 } });
});

/**
 * 🔴 A SESSÃO DE GPS RENASCIA MORTA (16/08, LOTE 1.6 — furo GRAVE criado pelo
 * lote 1.5, achado pela revisão adversarial). O ramo novo (`stops: { none:
 * aberta }`) fecha a sessão da rota ÓRFÃ — e deixava a rota do jeito que
 * estava: **ACTIVE, com `operationalEndedAt` NULO**. Só que é EXATAMENTE essa
 * linha que `claimLogisticaRoute` reaproveita no próximo Iniciar do mesmo dia
 * (o comentário dele proíbe o contrário com todas as letras: "reaproveitar a
 * linha encerrada faria a próxima saída herdar uma sessão ENDED").
 *
 * A CENA: manhã cumprida sem tocar Encerrar → cancelam o rascunho da tarde
 * (ramo `draft:`) → o motorista abre a Montagem, encaixa uma entrega e toca
 * Iniciar. Tudo responde OK; a rota velha é reaproveitada, a sessão dela está
 * ENDED, e daí em diante TODO ponto de GPS volta `SESSION_ENDED` — código que
 * não tem UMA linha de tratamento no app. Rastreamento morto, calado, num
 * recurso que a empresa PAGA.
 *
 * A régua: **rota sem parada aberta e com a sessão fechada É uma execução
 * encerrada** — então quem fecha a sessão carimba a lápide junto. Assim o
 * próximo Iniciar nasce com rota NOVA e sessão NOVA, que é o que o
 * `claimLogisticaRoute` exige. A lápide (ramo 1 do `OR`) não é recarimbada: o
 * `where` leva `operationalEndedAt: null` e o carimbo original fica de pé.
 */
test('LOTE 1.6 · a rota ÓRFÃ é CARIMBADA como encerrada junto com a sessão — senão o próximo Iniciar reaproveita a linha e herda sessão ENDED', async () => {
  const orfa: RotaDoDia = {
    id: 'route-cumprida-sem-encerrar',
    operationalEndedAt: null, // ninguém tocou "Encerrar" — segue ACTIVE
    stops: ['entregue', 'entregue'], // e não segura mais nada: órfã
  };
  const bancada = bancadaDoDraft({ rotasDoDia: [orfa], sessionStatusInicial: 'ACTIVE' });
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

  const result = await service.cancelar(dono, 'draft:8:2026-08-15');

  assert.equal(bancada.sessionState.status, 'ENDED', 'a sessão órfã continua fechando (a cura do 1.5, intocada)');
  assert.equal(
    bancada.routeUpdateManyCalls.length, 1,
    'a rota órfã tem que ser CARIMBADA — sem isto ela volta viva no próximo claimLogisticaRoute, com a sessão morta a tiracolo',
  );
  const [carimbo] = bancada.routeUpdateManyCalls;
  assert.equal(carimbo.where.companyId, EMPRESA, 'nada atravessa empresa: a ESCRITA da rota escopa por companyId');
  assert.deepEqual(carimbo.where.id, { in: ['route-cumprida-sem-encerrar'] });
  assert.equal(carimbo.where.operationalEndedAt, null, 'CAS: só carimba quem ainda não tinha carimbo — lápide não se re-encerra');
  assert.ok(carimbo.data.operationalEndedAt instanceof Date);
  assert.ok(
    orfa.operationalEndedAt instanceof Date,
    'EFEITO medido: a rota fica ENCERRADA de verdade — é isso que faz o próximo Iniciar nascer com rota e sessão NOVAS',
  );
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 1 } });
});

/**
 * O CONTROLE do carimbo acima: a LÁPIDE (já encerrada) não pode ser
 * recarimbada. `operationalEndedAt` é o relógio de quando a execução acabou —
 * reescrevê-lo num cancelamento posterior falsificaria o histórico do dia (e o
 * `ended_with_pending` da tela lê justamente esse campo).
 */
test('LOTE 1.6 (controle) · a LÁPIDE já encerrada NÃO tem o carimbo reescrito pelo cancelar', async () => {
  const carimboOriginal = new Date('2026-08-15T16:59:00.000Z');
  const lapide: RotaDoDia = {
    id: 'route-lapide-encerrada',
    operationalEndedAt: carimboOriginal,
    stops: ['agendada'], // ended_with_pending: encerrada COM parada aberta presa
  };
  const bancada = bancadaDoDraft({ rotasDoDia: [lapide], sessionStatusInicial: 'ACTIVE' });
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

  assert.equal(bancada.sessionState.status, 'ENDED', 'a sessão pendurada da lápide continua fechando');
  assert.equal(
    lapide.operationalEndedAt, carimboOriginal,
    'o relógio do fim da execução é o ORIGINAL — cancelar o dia por cima não reescreve história',
  );
});

/**
 * 🔴 FURO 3 (16/08, LOTE 1.4) — o "best-effort" do JSDoc só existia contra
 * MODELO AUSENTE (`typeof ... !== 'function'`). Um hiccup de banco no `findMany`
 * ou no `updateMany` subia a exceção DEPOIS de o `limparDia` já ter commitado:
 * o app abre "Este dia mudou", o motorista lê que não deu certo, e as entregas
 * estão canceladas do mesmo jeito. Cancelar é verbo de ESCAPE (lei do repo) e
 * não pode virar beco por causa de uma limpeza de sessão.
 */
test('FURO 3 · banco tropeça na limpeza de sessão e o Cancelar AINDA ASSIM devolve o desfecho (escape não vira beco)', async () => {
  const chamadas: string[] = [];
  const prisma: any = {
    entrega: { findMany: async () => [abertaDoDraft] },
    logisticaRoute: {
      findMany: async () => {
        chamadas.push('findMany');
        throw new Error('terminating connection due to administrator command');
      },
    },
    logisticaTrackingSession: { updateMany: async () => ({ count: 0 }) },
  };
  const rota: any = { limparDia: async () => ({ ok: true, resumo: { canceladas: 1 } }) };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  const dono = { id: 8, companyId: EMPRESA, role: 'DRIVER' };

  const result = await service.cancelar(dono, 'draft:8:2026-08-15');

  assert.equal(chamadas.length, 1, 'a limpeza foi TENTADA — o try/catch não pode virar desistência silenciosa de tentar');
  assert.deepEqual(
    result, { ok: true, resumo: { canceladas: 1 } },
    'o desfecho do cancelamento (que JÁ commitou) chega ao app inteiro, em vez de virar "Este dia mudou" com as entregas canceladas por baixo',
  );
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
