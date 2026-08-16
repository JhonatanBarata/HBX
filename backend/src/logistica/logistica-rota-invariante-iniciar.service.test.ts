import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaService } from './logistica-rota.service';

/**
 * INVARIANTE DO INICIAR (15/08, "A ROTA FANTASMA", cura (b) do desenho) —
 *
 * A causa que se pensava existir ("Iniciar carimba ACTIVE com zero stops")
 * NÃO tem caminho de código hoje: `congelarStops` sempre cria/migra stop
 * quando há plano, e plano vazio já aborta antes (`plan.paradas.length===0`).
 * Esta é a INVARIANTE DEFENSIVA que fecha a porta mesmo assim — não porque o
 * caminho normal a alcance, mas porque uma escrita que minta ("eu congelei")
 * sem gravar de verdade não pode terminar em ACTIVE+startedAt. `congelarStops`
 * passa a devolver a contagem lida de VOLTA DO BANCO (read-back, não
 * aritmética); se vier 0, `iniciarRota` solta `releaseInitialization`
 * explícito e devolve o erro D4 (fechado com o dono): "Nenhuma parada para
 * iniciar. Monte a rota de novo." — ANTES de marcar a 1ª parada `em_rota`,
 * ANTES da sessão TRACKED e ANTES do `status:'ACTIVE'`/`startedAt`, porque
 * nenhuma dessas três coisas tem sessão pra desfazer se ainda não rodou.
 *
 * `countMente: true` é a ARMA do teste: simula uma escrita que não pegou de
 * verdade (o `create()` roda, mas o `count()` — a MESMA pergunta que o
 * serviço faz — devolve 0). É assim que se prova a invariante sem precisar
 * fabricar um caminho de código que hoje não existe.
 */
const DIA = '2026-08-15';

function bancada(opts: { countMente?: boolean } = {}) {
  const abertas = [{
    id: 'd1', entregadorId: 7, status: 'agendada', rotaOrdem: null,
    scheduledAt: new Date('2026-08-15T12:00:00.000Z'), local: null,
    customerProfile: { name: 'Cliente', lat: -22.4260477, lng: -47.578631 },
  }];
  const routes: any[] = [];
  const stops: any[] = [];
  let routeSeq = 0;
  let stopSeq = 0;
  const entregaUpdates: any[] = [];
  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) },
    entrega: {
      findMany: async () => abertas,
      // piso da numeração (maiorOrdemFechadaDoDia): nada fechado ⇒ piso 0.
      aggregate: async () => ({ _max: { rotaOrdem: null } }),
      updateMany: async (args: any) => { entregaUpdates.push(args); return { count: 1 }; },
    },
    // ROTA v2 — iniciarRota gerencia LogisticaRoute/Stop direto (mesmo dublê
    // MÍNIMO de logistica-rota-piso-ordem.test.ts / logistica-rota-prospector.test.ts).
    logisticaRoute: {
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
    },
    logisticaRouteStop: {
      findMany: async ({ where }: any) => stops.filter((s) => where.deliveryId?.in?.includes(s.deliveryId)),
      aggregate: async ({ where }: any) => ({
        _max: { snapshotOrder: Math.max(-1, ...stops.filter((s) => s.routeId === where.routeId).map((s) => s.snapshotOrder)) },
      }),
      create: async ({ data }: any) => {
        const row = { id: `stop-${++stopSeq}`, billingExempt: false, ...data };
        stops.push(row);
        return row;
      },
      // 🔴 A LÁPIDE, SIMULADA: read-back MENTINDO 0 mesmo com o `create()`
      // acima tendo rodado — é a arma do teste. `countMente: false` devolve
      // a contagem de verdade (mesma régua do serviço real).
      count: async ({ where }: any) => (opts.countMente ? 0 : stops.filter((s) => s.routeId === where.routeId
        && (!where.deliveryId?.in || where.deliveryId.in.includes(s.deliveryId))).length),
    },
    $executeRawUnsafe: async () => 0,
    $transaction: async (callback: any) => callback(prisma),
  };
  const cobranca: any = {
    garantirDiaPago: async () => undefined,
    assertAssentoDoDia: async () => undefined,
    garantirPasseDoDia: async () => undefined,
  };
  const rota = new LogisticaRotaService(prisma, cobranca, undefined);
  (rota as any).logger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { rota, routes, entregaUpdates };
}

test('congelamento devolvendo 0 (read-back) → erro D4 honesto, rota fica PLANNED, startedAt nulo, nenhuma entrega em_rota', async () => {
  const { rota, routes, entregaUpdates } = bancada({ countMente: true });

  await assert.rejects(
    () => rota.iniciarRota(41, { date: DIA, ordemManual: ['d1'] }, 7, 7),
    /Nenhuma parada para iniciar\. Monte a rota de novo\./,
  );

  assert.equal(routes.length, 1, 'a LogisticaRoute chega a nascer pelo claim');
  assert.equal(routes[0].status, 'PLANNED', 'releaseInitialization explícito devolve INITIALIZING → PLANNED — nunca fica ACTIVE');
  assert.equal(routes[0].startedAt, undefined, 'a lápide não nasce: nunca chega a carimbar startedAt');
  assert.ok(
    !entregaUpdates.some((u) => u.data?.status === 'em_rota'),
    'nenhuma entrega vira em_rota — o ponto de checagem é ANTES da 1ª parada, não depois',
  );
});

test('(controle) com o read-back de verdade a MESMA rota inicia normalmente — a invariante não é falso-positivo', async () => {
  const { rota, routes } = bancada({ countMente: false });

  const resultado = await rota.iniciarRota(41, { date: DIA, ordemManual: ['d1'] }, 7, 7);

  assert.equal(routes[0].status, 'ACTIVE');
  assert.ok(routes[0].startedAt instanceof Date);
  assert.equal(resultado.paradas.length, 1);
});

/**
 * FURO 3 (15/08, LOTE 1.2 — revisão adversarial ao lote 1.1) — a invariante
 * do Iniciar só cobria o RETORNO `stopsCongelados === 0`; `assertAssentoDoDia`
 * e `congelarStops` continuavam FORA de qualquer `try`. Se qualquer um dos
 * dois LANÇAR de verdade (402 de assento numa corrida, `stopDeOutraRotaError`,
 * "Rota concluída não aceita novas entregas") o `releaseInitialization`
 * nunca roda e a rota fica `INITIALIZING` PARA SEMPRE — todo Iniciar seguinte
 * esbarra em "Esta rota já está sendo iniciada. Aguarde e atualize a tela."
 *
 * Esta bancada faz `assertAssentoDoDia` lançar DEPOIS do `claimLogisticaRoute`
 * já ter deixado a rota `INITIALIZING` — exatamente a corrida descrita no
 * furo (402 entre o claim e o gate de assento).
 */
test('FURO 3 · assertAssentoDoDia lança no meio do Iniciar → releaseInitialization roda mesmo assim, rota nunca fica presa em INITIALIZING', async () => {
  const { rota, routes } = bancada({ countMente: false });
  const erroDaCorrida = new Error('402 simulado: assento esgotou entre o claim e o gate.');
  (rota as any).cobranca.assertAssentoDoDia = async () => { throw erroDaCorrida; };

  await assert.rejects(
    () => rota.iniciarRota(41, { date: DIA, ordemManual: ['d1'] }, 7, 7),
    (e: any) => e === erroDaCorrida,
    'o erro ORIGINAL da corrida tem que chegar ao caller, nunca ser engolido',
  );

  assert.equal(routes.length, 1, 'a LogisticaRoute chega a nascer pelo claim');
  assert.equal(
    routes[0].status, 'PLANNED',
    'HOJE (antes do fix): assertAssentoDoDia está FORA do try — releaseInitialization nunca roda e a rota fica INITIALIZING pra sempre',
  );
  assert.equal(routes[0].startedAt, undefined, 'a lápide não nasce: nunca chega a carimbar startedAt');
});

/**
 * Mesma corrida, mas o erro nasce dentro de `congelarStops` (o outro lado do
 * furo 3: "Rota concluída não aceita novas entregas", `stopDeOutraRotaError`).
 * Aqui simulado direto no dublê do `create()` do stop — a mesma pergunta:
 * releaseInitialization tem que rodar mesmo quando quem lança é o
 * congelamento, não o gate de assento.
 */
test('FURO 3 · congelarStops lança no meio do Iniciar → releaseInitialization roda mesmo assim, rota nunca fica presa em INITIALIZING', async () => {
  const { rota, routes } = bancada({ countMente: false });
  const erroDoCongelamento = new Error('stopDeOutraRotaError simulado: stop estrangeiro não-migrável.');
  (rota as any).prisma.logisticaRouteStop.create = async () => { throw erroDoCongelamento; };

  await assert.rejects(
    () => rota.iniciarRota(41, { date: DIA, ordemManual: ['d1'] }, 7, 7),
    (e: any) => e === erroDoCongelamento,
    'o erro ORIGINAL do congelamento tem que chegar ao caller, nunca ser engolido',
  );

  assert.equal(routes.length, 1, 'a LogisticaRoute chega a nascer pelo claim');
  assert.equal(
    routes[0].status, 'PLANNED',
    'HOJE (antes do fix): congelarStops está FORA do try — releaseInitialization nunca roda e a rota fica INITIALIZING pra sempre',
  );
});
