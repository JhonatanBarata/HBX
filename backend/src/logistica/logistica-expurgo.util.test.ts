import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expurgarNaoProcessado,
  ocorrenciaCanceladaRecente,
  JANELA_EXPURGO_MS,
} from './logistica-expurgo.util';

/**
 * ⛔ A VACINA DA LEI DO DESAPARECER (10/08, lei absoluta do dono: "rota criada q não
 * foi processada, e já passou o dia de voltar o crédito, ela DESAPARECE").
 *
 * O que estes testes protegem NÃO é o delete — é o **contrário**: que a lei jamais
 * encoste no que aconteceu de verdade. Um expurgo que apaga demais é infinitamente
 * pior que lixo acumulado, e o único jeito de saber a diferença é cravar as perguntas
 * do `where` num teste que grita quando alguém "simplifica" a consulta.
 */

/** Dublê do Prisma: guarda o que foi PEDIDO, pra prova ler a régua e não o resultado. */
function prismaDublê(opts: {
  rotas?: any[];
  entregas?: any[];
  cobrancas?: any[];
  canceladas?: any[];
} = {}) {
  const chamadas: any[] = [];
  /* 🔴 O DUBLÊ TEM QUE ESQUECER O QUE JÁ FOI APAGADO. O expurgo varre em LOTES até
     esgotar (EXPURGO_LOTES_POR_PASSADA); um dublê que devolve as mesmas linhas pra
     sempre faz o laço rodar 20 vezes e a prova mede o dublê, não o código. Aqui a
     2ª consulta volta vazia, como o banco de verdade voltaria. */
  let sobraramRotas = opts.rotas ?? [];
  let sobraramEntregas = opts.entregas ?? [];
  const p: any = {
    logisticaRoute: {
      findMany: async (args: any) => {
        chamadas.push(['route.findMany', args]);
        const r = sobraramRotas; sobraramRotas = []; return r;
      },
      deleteMany: async (args: any) => { chamadas.push(['route.deleteMany', args]); return { count: (args?.where?.id?.in ?? []).length }; },
    },
    logisticaRouteStop: {
      deleteMany: async (args: any) => { chamadas.push(['stop.deleteMany', args]); return { count: 0 }; },
    },
    entrega: {
      findMany: async (args: any) => {
        chamadas.push(['entrega.findMany', args]);
        const e = sobraramEntregas; sobraramEntregas = []; return e;
      },
      deleteMany: async (args: any) => {
        chamadas.push(['entrega.deleteMany', args]);
        return { count: (args?.where?.id?.in ?? []).length };
      },
      findFirst: async (args: any) => { chamadas.push(['entrega.findFirst', args]); return (opts.canceladas ?? [])[0] ?? null; },
    },
    financeiroCharge: {
      findMany: async (args: any) => { chamadas.push(['charge.findMany', args]); return opts.cobrancas ?? []; },
    },
    logisticaTrackingSession: {
      updateMany: async (args: any) => { chamadas.push(['sessao.updateMany', args]); return { count: 3 }; },
    },
  };
  return { p, chamadas };
}

const acharChamada = (chamadas: any[], nome: string) => chamadas.find((c) => c[0] === nome)?.[1];

test('a janela é a do dono: 24 h (e é a MESMA do cancelar que vale)', () => {
  assert.equal(JANELA_EXPURGO_MS, 24 * 60 * 60 * 1000);
});

test('expurgo: a entrega só some sem UM ÚNICO sinal de vida (as 12 perguntas do where)', async () => {
  const { p, chamadas } = prismaDublê({ entregas: [{ id: 'e1' }] });
  await expurgarNaoProcessado(p, 41);
  const where = acharChamada(chamadas, 'entrega.findMany').where;

  // o que ela precisa SER
  assert.equal(where.status, 'cancelada');
  assert.ok(where.updatedAt.lt instanceof Date, 'tem corte de tempo');
  assert.equal(where.cobrancaStatus, 'pendente');
  // o que ela precisa NÃO ter — cada linha é um "isso chegou a existir pra alguém?"
  assert.equal(where.startedAt, null, 'nunca saiu pra rua');
  assert.equal(where.arrivedAt, null, 'nunca chegou na porta');
  assert.equal(where.deliveredAt, null, 'nunca foi entregue');
  assert.equal(where.comprovanteConfirmadoAt, null);
  assert.equal(where.receiptMethod, null, 'ninguém pagou por ela');
  assert.deepEqual(where.comprovantes, { none: {} });
  assert.deepEqual(where.logisticaRouteStop, { is: null }, 'parada congelada segura a entrega');
  assert.deepEqual(where.logisticaTrackingPoints, { none: {} });
  assert.deepEqual(where.logisticaTrackingEvents, { none: {} });
  assert.deepEqual(where.logisticaTrackedCreditClaims, { none: {} }, 'claim = dinheiro tocou nela');
});

test('expurgo: entrega COM COBRANÇA não some — mesmo passando por todo o resto', async () => {
  // A FinanceiroCharge não tem FK com Entrega (é chave de idempotência), então o
  // Prisma não a enxerga no where: sem a consulta extra, o expurgo apagaria a ponta
  // de um dinheiro que continua no banco.
  const { p, chamadas } = prismaDublê({
    entregas: [{ id: 'e1' }, { id: 'e2' }],
    cobrancas: [{ entregaId: 'e2' }],
  });
  const r = await expurgarNaoProcessado(p, 41);
  const del = acharChamada(chamadas, 'entrega.deleteMany');
  assert.deepEqual(del.where.id.in, ['e1'], 'só a que não tem cobrança');
  assert.equal(r.entregasApagadas, 1);
});

test('expurgo: rota só some sem entrega ENTREGUE e sem NENHUM claim (as duas famílias)', async () => {
  const { p, chamadas } = prismaDublê({ rotas: [{ id: 'r1' }] });
  await expurgarNaoProcessado(p, 41);
  const where = acharChamada(chamadas, 'route.findMany').where;
  assert.deepEqual(where.stops, { none: { delivery: { status: 'entregue' } } });
  assert.deepEqual(where.essentialClaims, { none: {} });
  assert.deepEqual(where.trackedCreditClaims, { none: {} });
  // e os stops saem ANTES da rota: eles seguram a entrega por Restrict.
  const ordem = chamadas.map((c) => c[0]);
  assert.ok(
    ordem.indexOf('stop.deleteMany') < ordem.indexOf('route.deleteMany'),
    'stop tem que sair antes da rota',
  );
});

test('expurgo: sessão de rastreamento é ENCERRADA, nunca apagada (a trilha é história)', async () => {
  const { p, chamadas } = prismaDublê();
  const r = await expurgarNaoProcessado(p, 41);
  const upd = acharChamada(chamadas, 'sessao.updateMany');
  assert.equal(upd.where.status, 'ACTIVE');
  assert.equal(upd.data.status, 'ENDED');
  assert.ok(upd.data.endedAt instanceof Date);
  assert.equal(r.sessoesEncerradas, 3);
  // e ninguém chamou delete em sessão
  assert.ok(!chamadas.some((c) => c[0].startsWith('sessao.delete')));
});

test('expurgo: varre em LOTES até esgotar — o passivo some na 1ª noite, não em parcelas', async () => {
  /* Medido em produção na 1ª passada real (10/08): a 41 tinha 900 elegíveis e a 48
     tinha 1.871; com um lote só de 500, o passivo levaria DIAS. Este teste crava que
     a passada VOLTA enquanto houver o que apagar — e que ela PARA quando não há. */
  let restam = 3;
  const p: any = {
    logisticaRoute: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    logisticaRouteStop: { deleteMany: async () => ({ count: 0 }) },
    entrega: {
      findMany: async () => (restam-- > 0 ? [{ id: `e${restam}` }] : []),
      deleteMany: async (args: any) => ({ count: (args?.where?.id?.in ?? []).length }),
      findFirst: async () => null,
    },
    financeiroCharge: { findMany: async () => [] },
    logisticaTrackingSession: { updateMany: async () => ({ count: 0 }) },
  };
  const r = await expurgarNaoProcessado(p, 41);
  assert.equal(r.entregasApagadas, 3, 'as três voltas apagaram; a quarta achou vazio e parou');
});

test('expurgo: empresa 0 não faz nada (guarda de multi-tenant)', async () => {
  const { p, chamadas } = prismaDublê({ entregas: [{ id: 'e1' }] });
  const r = await expurgarNaoProcessado(p, 0);
  assert.deepEqual(r, { entregasApagadas: 0, rotasApagadas: 0, sessoesEncerradas: 0 });
  assert.equal(chamadas.length, 0, 'nem consulta sai');
});

/* ── F2.4: CANCELAR VALE (inclusive através de um publish) ─────────────────── */

test('ocorrenciaCanceladaRecente: procura pela ORIGEM carimbada, cancelada, dentro da janela', async () => {
  const { p, chamadas } = prismaDublê({ canceladas: [{ id: 'e9' }] });
  const achou = await ocorrenciaCanceladaRecente(p, 41, 'agenda:plano1:2026-08-10');
  assert.equal(achou, true);
  const where = acharChamada(chamadas, 'entrega.findFirst').where;
  assert.equal(where.companyId, 41);
  assert.equal(where.agendaOcorrenciaKeyOrigem, 'agenda:plano1:2026-08-10');
  assert.equal(where.status, 'cancelada');
  assert.ok(where.updatedAt.gte instanceof Date, 'só vale DENTRO da janela');
});

test('ocorrenciaCanceladaRecente: sem chave não pergunta nada (e não bloqueia geração)', async () => {
  const { p, chamadas } = prismaDublê({ canceladas: [{ id: 'e9' }] });
  assert.equal(await ocorrenciaCanceladaRecente(p, 41, ''), false);
  assert.equal(chamadas.length, 0);
});
