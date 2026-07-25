import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haversineKm,
  nearestNeighbor,
  twoOpt,
  routeCostKm,
  computeEta,
  planRoute,
  planRouteManual,
  planRouteByRoads,
  filtrarComCoord,
  resolveDayRange,
  type Stop,
  type OsrmTablePayload,
  type PlannedStop,
} from './logistica-rota.service';

// LOGÍSTICA-MOBILE M3 — prova o MOTOR DE ROTA + ETA (matemática pura, sem banco):
//   (a) rota 2-opt tem custo total ≤ a NN ingênua (2-opt nunca piora);
//   (b) etaAt é monotônico crescente ao longo do rotaOrdem;
//   (c) parada SEM coordenada vai pro FIM da fila (com flag semCoordenada).
//
// Fixture: 12 pontos ~região de Fortaleza/CE (coords reais plausíveis), embaralhados
// de propósito pra dar folga ao 2-opt melhorar sobre o NN.

// ── fixture: 12 coordenadas (embaralhadas, não em ordem geográfica) ─────────────
const FIXTURE: Stop[] = [
  { id: 's01', lat: -3.7319, lng: -38.5267, status: 'agendada', nome: 'Centro' },
  { id: 's02', lat: -3.7719, lng: -38.4767, status: 'agendada', nome: 'Messejana' },
  { id: 's03', lat: -3.7436, lng: -38.4931, status: 'agendada', nome: 'Aldeota' },
  { id: 's04', lat: -3.8000, lng: -38.5000, status: 'agendada', nome: 'Pajuçara' },
  { id: 's05', lat: -3.7100, lng: -38.5430, status: 'agendada', nome: 'Barra do Ceará' },
  { id: 's06', lat: -3.7600, lng: -38.5100, status: 'agendada', nome: 'Parangaba' },
  { id: 's07', lat: -3.7250, lng: -38.4600, status: 'agendada', nome: 'Mondubim' },
  { id: 's08', lat: -3.7900, lng: -38.5300, status: 'agendada', nome: 'Cristo Redentor' },
  { id: 's09', lat: -3.7050, lng: -38.5000, status: 'agendada', nome: 'Vila Velha' },
  { id: 's10', lat: -3.7500, lng: -38.5350, status: 'agendada', nome: 'Benfica' },
  { id: 's11', lat: -3.7800, lng: -38.4700, status: 'agendada', nome: 'Cajazeiras' },
  { id: 's12', lat: -3.7200, lng: -38.5150, status: 'agendada', nome: 'Bom Jardim' },
];

const ORIGEM = { lat: -3.7327, lng: -38.5270 }; // depósito ~ Centro

test('haversineKm: distância conhecida (Fortaleza→Centro vizinho) plausível', () => {
  const d = haversineKm({ lat: -3.7319, lng: -38.5267 }, { lat: -3.7719, lng: -38.4767 });
  // ~7 km em linha reta — checa ordem de grandeza (não vira 0 nem centenas de km).
  assert.ok(d > 5 && d < 9, `distância esperada ~7km, veio ${d.toFixed(2)}km`);
});

test('(a) rota 2-opt tem custo total ≤ a NN ingênua', () => {
  const stops = filtrarComCoord(FIXTURE);
  const nn = nearestNeighbor(stops, ORIGEM);
  const opt = twoOpt(nn, ORIGEM);

  const custoNN = routeCostKm(nn, ORIGEM);
  const custoOpt = routeCostKm(opt, ORIGEM);

  // 2-opt parte do NN e só aceita trocas que REDUZEM → nunca piora.
  assert.ok(custoOpt <= custoNN + 1e-9, `2-opt (${custoOpt.toFixed(3)}) deve ser ≤ NN (${custoNN.toFixed(3)})`);
  // A rota otimizada visita TODAS as paradas exatamente 1×.
  assert.equal(opt.length, stops.length);
  assert.equal(new Set(opt.map((s) => s.id)).size, stops.length);

  // Log dos números reais (aparece no relatório do teste).
  console.log(`  [M3] NN=${custoNN.toFixed(3)}km  2-opt=${custoOpt.toFixed(3)}km  ganho=${(custoNN - custoOpt).toFixed(3)}km`);
});

test('(b) etaAt é monotônico crescente ao longo do rotaOrdem', () => {
  const plan = planRoute(FIXTURE, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });

  // Ordena pela rotaOrdem e confere que o ETA sobe a cada passo.
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  let prevMs = -Infinity;
  for (const p of ordenadas) {
    if (p.etaAt == null) continue; // sem-coord não tem ETA
    const ms = p.etaAt.getTime();
    assert.ok(ms > prevMs, `ETA deve crescer: parada ${p.id} etaAt=${p.etaAt.toISOString()} não é > anterior`);
    prevMs = ms;
  }
  // Término previsto = ETA da última parada com coord.
  assert.ok(plan.terminoPrevisto instanceof Date);
});

test('(c) parada sem coordenada vai pro FIM da fila (semCoordenada=true)', () => {
  const comSemCoord: Stop[] = [
    ...FIXTURE.slice(0, 5),
    { id: 'sem-1', lat: null, lng: null, status: 'agendada', nome: 'Cliente sem GPS' },
    { id: 'sem-2', lat: null, lng: null, status: 'agendada', nome: 'Outro sem GPS' },
  ];
  const plan = planRoute(comSemCoord, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });

  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  // As 2 últimas posições da fila são as sem-coordenada.
  const ultimas2 = ordenadas.slice(-2);
  for (const p of ultimas2) {
    assert.equal(p.semCoordenada, true, `parada ${p.id} deveria estar marcada sem coordenada`);
    assert.equal(p.etaAt, null, `parada sem coord ${p.id} não deve ter ETA`);
  }
  // As roteáveis (5) vêm ANTES e todas têm coord.
  const roteaveis = ordenadas.slice(0, 5);
  for (const p of roteaveis) {
    assert.equal(p.semCoordenada, false);
    assert.ok(p.etaAt instanceof Date);
  }
  assert.equal(ordenadas.filter((p) => p.semCoordenada).length, 2);
});

test('(c2) coordenada 0,0 é inválida e nunca leva a rota para o oceano', () => {
  const plan = planRoute([
    FIXTURE[0],
    { id: 'zero-zero', lat: 0, lng: 0, status: 'agendada', nome: 'GPS inválido' },
  ], {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });

  const zero = plan.paradas.find((p) => p.id === 'zero-zero');
  assert.equal(zero?.semCoordenada, true);
  assert.equal(zero?.etaAt, null);
  assert.ok(plan.distanciaTotalKm < 100, '0,0 não pode entrar no cálculo da distância');
});

test('computeEta: sem paradas → lista vazia; velocidade/parada default aplicados', () => {
  assert.deepEqual(computeEta([], { velocidadeKmH: 25, paradaMin: 5, partida: new Date() }), []);
  // 1 parada: ETA = partida + tempoParada (sem trajeto anterior).
  const partida = new Date('2026-07-06T08:00:00');
  const one = computeEta([FIXTURE[0]], { velocidadeKmH: 25, paradaMin: 5, partida });
  assert.equal(one.length, 1);
  assert.equal(one[0].etaAt!.getTime(), partida.getTime() + 5 * 60_000);
});

test('nearestNeighbor: sem origem começa pela 1ª parada; visita todas 1×', () => {
  const stops = filtrarComCoord(FIXTURE);
  const nn = nearestNeighbor(stops, null);
  assert.equal(nn.length, stops.length);
  assert.equal(nn[0].id, stops[0].id, 'sem origem, a 1ª parada da lista é o ponto de partida');
  assert.equal(new Set(nn.map((s) => s.id)).size, stops.length);
});

// ── BUG 5 (11/07) — resolveDayRange (cópia deste arquivo) trata data IMPOSSÍVEL
// como HOJE, igual à cópia de logistica.service.ts (as duas devem convergir).
test('resolveDayRange: data impossível (2026-02-30) cai pra HOJE, igual a lixo/mês inválido', () => {
  // Referência de "hoje" = a própria resolveDayRange sem date (evita flakiness de
  // fuso perto da virada de dia em fuso negativo como Brasília -3).
  const hojeISO = resolveDayRange(undefined).dayISO;
  assert.equal(resolveDayRange('2026-02-30').dayISO, hojeISO, '30 de fevereiro não existe → hoje');
  assert.equal(resolveDayRange('2026-13-45').dayISO, hojeISO, 'mês 13 já caía pra hoje (NaN)');
  assert.equal(resolveDayRange('abc').dayISO, hojeISO, 'lixo já caía pra hoje (NaN)');
});

test('resolveDayRange: "YYYY-MM-DD" válido resolve pro próprio dia (fuso local)', () => {
  assert.equal(resolveDayRange('2026-07-11').dayISO, '2026-07-11');
});

// ══════════════════════════════════════════════════════════════════════════════
// PR18072026 W1 — planRouteManual: "Minha ordem" (ordemManual) pula NN+2-opt de
// vez e respeita a lista dada ao pé da letra.
// ══════════════════════════════════════════════════════════════════════════════

test('planRouteManual: respeita a ordem dada; ETA cumulativo cresce igual ao automático', () => {
  const stops = FIXTURE.slice(0, 4); // s01..s04
  const ordemManual = ['s04', 's02', 's01']; // s03 fica de fora da lista
  const plan = planRouteManual(stops, ordemManual, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });

  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.deepEqual(ordenadas.map((p) => p.id), ['s04', 's02', 's01', 's03'], 's03 (fora da lista) vai pro FIM');

  // ETA cumulativo cresce (mesma garantia do caminho automático).
  let prevMs = -Infinity;
  for (const p of ordenadas) {
    assert.ok(p.etaAt instanceof Date);
    assert.ok(p.etaAt!.getTime() > prevMs);
    prevMs = p.etaAt!.getTime();
  }
});

test('planRouteManual: id repetido na lista conta só a 1ª vez; id fora do conjunto aberto é ignorado', () => {
  const stops = FIXTURE.slice(0, 3); // s01..s03
  const ordemManual = ['s02', 's02', 'nao-existe', 's01'];
  const plan = planRouteManual(stops, ordemManual, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.deepEqual(ordenadas.map((p) => p.id), ['s02', 's01', 's03'], 'repetido/inexistente não duplicam nem travam');
  assert.equal(new Set(ordenadas.map((p) => p.id)).size, 3, 'cada parada aparece exatamente 1×');
});

test('planRouteManual: ordemManual vazia é equivalente a "tudo no fim" (ordem natural preservada)', () => {
  const stops = FIXTURE.slice(0, 3);
  const plan = planRouteManual(stops, [], {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.deepEqual(ordenadas.map((p) => p.id), stops.map((s) => s.id), 'sem manual, mantém a ordem de entrada (natural do fetch)');
});

test('planRouteManual: parada sem coordenada mantém a posição da lista manual mas fica sem ETA', () => {
  const stops: Stop[] = [
    FIXTURE[0],
    { id: 'sem-gps', lat: null, lng: null, status: 'agendada', nome: 'Sem GPS' },
    FIXTURE[1],
  ];
  const plan = planRouteManual(stops, ['sem-gps', FIXTURE[1].id, FIXTURE[0].id], {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-06T08:00:00'),
  });
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.deepEqual(ordenadas.map((p) => p.id), ['sem-gps', FIXTURE[1].id, FIXTURE[0].id], 'ordem manual respeitada mesmo sem coord');
  assert.equal(ordenadas[0].semCoordenada, true);
  assert.equal(ordenadas[0].etaAt, null);
});

// ══════════════════════════════════════════════════════════════════════════════
// S1 (25/07, PR25072026-ROTA-CONFERIDA) — "Motor com crachá": fim do fallback
// Haversine MUDO. planRouteByRoads agora é uma cadeia de 3 degraus (proxy →
// público direto → Haversine) e o resultado sempre carrega `engine`, com
// `degradedReason` só quando o Haversine veio de FALHA de rede. Os 3 cenários
// abaixo são os exigidos pela sprint: (a) proxy responde, (b) os dois falham,
// (c) só o público responde.
// ══════════════════════════════════════════════════════════════════════════════

/** Matriz OSRM fake NxN internamente consistente (não precisa ser geografia real). */
function fakeMatrix(size: number): { durations: number[][]; distances: number[][] } {
  const durations: number[][] = [];
  const distances: number[][] = [];
  for (let i = 0; i < size; i++) {
    const durRow: number[] = [];
    const distRow: number[] = [];
    for (let j = 0; j < size; j++) {
      const passos = Math.abs(i - j);
      durRow.push(passos * 300); // 5min por "salto" de índice
      distRow.push(passos * 1000); // 1km por salto
    }
    durations.push(durRow);
    distances.push(distRow);
  }
  return { durations, distances };
}

test('planRouteByRoads (a): DEGRAU 1 (proxy) responde → engine "osrm", sem tocar o público', async () => {
  const stops = FIXTURE.slice(0, 3);
  const size = stops.length + 1; // +1 pela origem (hasOrigin=true)
  let publicFetchCalled = false;
  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    publicFetchCalled = true;
    throw new Error('degrau 1 já respondeu — não deveria tentar o público');
  };
  try {
    const osrmTable = async (): Promise<OsrmTablePayload> => ({ code: 'Ok', ...fakeMatrix(size) });
    const plan = await planRouteByRoads(stops, {
      origem: ORIGEM,
      velocidadeKmH: 25,
      paradaMin: 5,
      partida: new Date('2026-07-25T08:00:00'),
      osrmTable,
    });
    assert.equal(plan.engine, 'osrm');
    assert.equal(plan.degradedReason, undefined);
    assert.equal(publicFetchCalled, false, 'planejar consome só 1 chamada de table por replanejo');
    assert.equal(plan.paradas.length, stops.length);
    assert.equal(new Set(plan.paradas.map((p) => p.id)).size, stops.length, 'todas as paradas aparecem 1×');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('planRouteByRoads (b): proxy falha (rate limit) e público falha → engine "haversine" + degradedReason', async () => {
  const stops = FIXTURE.slice(0, 3);
  const originalFetch = global.fetch;
  (global as any).fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
  try {
    const osrmTable = async (): Promise<OsrmTablePayload> => {
      const rateLimitError: any = new Error('Muitas chamadas de roteamento em sequência.');
      rateLimitError.getStatus = () => 429; // mesmo contrato do HttpException do LogisticaOsrmService
      throw rateLimitError;
    };
    const plan = await planRouteByRoads(stops, {
      origem: ORIGEM,
      velocidadeKmH: 25,
      paradaMin: 5,
      partida: new Date('2026-07-25T08:00:00'),
      osrmTable,
    });
    assert.equal(plan.engine, 'haversine');
    assert.equal(plan.degradedReason, 'rate_limit', 'motivo do proxy (mais específico) prevalece quando os dois degraus falham');
    assert.equal(plan.paradas.length, stops.length);
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('planRouteByRoads (c): proxy falha mas o público responde → engine "osrm" (degrau 2 funciona)', async () => {
  const stops = FIXTURE.slice(0, 3);
  const size = stops.length + 1;
  const originalFetch = global.fetch;
  (global as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 'Ok', ...fakeMatrix(size) }) });
  try {
    const osrmTable = async (): Promise<OsrmTablePayload> => { throw new Error('proxy indisponível (502)'); };
    const plan = await planRouteByRoads(stops, {
      origem: ORIGEM,
      velocidadeKmH: 25,
      paradaMin: 5,
      partida: new Date('2026-07-25T08:00:00'),
      osrmTable,
    });
    assert.equal(plan.engine, 'osrm');
    assert.equal(plan.degradedReason, undefined);
    assert.equal(plan.paradas.length, stops.length);
  } finally {
    (global as any).fetch = originalFetch;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// S2 (25/07, PR25072026-ROTA-CONFERIDA) — "Perna a perna": legDistanceM/legDurationS
// por parada nos TRÊS caminhos (planRoute/Haversine, planRouteManual, planRouteByRoads
// /matriz). A perna já estava dentro do loop de ETA (somada e descartada) — só é
// EXPOSTA agora, então a soma das pernas (comCoord) tem que bater com
// distanciaTotalKm (mesma matemática, dividida por trecho em vez de acumulada).
// Tolerância 1% (Math.round por perna introduz arredondamento residual).
// ══════════════════════════════════════════════════════════════════════════════

/** Soma (km) das pernas não-nulas de uma lista de paradas planejadas. */
function sumLegsKm(paradas: PlannedStop[]): number {
  return paradas.reduce((sum, p) => sum + (p.legDistanceM != null ? p.legDistanceM / 1000 : 0), 0);
}

function assertSomaPernasProximaDoTotal(somaKm: number, totalKm: number, label: string) {
  const tolerancia = Math.max(totalKm * 0.01, 0.02); // 1% (piso 20m pra rotas curtas)
  assert.ok(
    Math.abs(somaKm - totalKm) <= tolerancia,
    `${label}: soma das pernas=${somaKm.toFixed(3)}km deveria ser ~distanciaTotalKm=${totalKm.toFixed(3)}km (±${tolerancia.toFixed(3)}km)`,
  );
}

test('S2 planRoute (Haversine, COM origem): soma das pernas ≈ distanciaTotalKm (1%); 1ª parada tem perna da origem', () => {
  const plan = planRoute(FIXTURE, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
  });
  assertSomaPernasProximaDoTotal(sumLegsKm(plan.paradas), plan.distanciaTotalKm, 'planRoute com origem');
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.ok(ordenadas[0].legDistanceM != null, '1ª parada roteável tem perna da ORIGEM até ela (origem conhecida)');
  assert.ok(ordenadas[0].legDurationS != null);
});

test('S2 planRoute (Haversine, SEM origem): 1ª parada tem legDistanceM null; demais somam ≈ distanciaTotalKm', () => {
  const plan = planRoute(FIXTURE, {
    origem: null,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
  });
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.equal(ordenadas[0].legDistanceM, null, '1ª parada sem origem não tem de onde medir a perna');
  assert.equal(ordenadas[0].legDurationS, null);
  assertSomaPernasProximaDoTotal(sumLegsKm(plan.paradas), plan.distanciaTotalKm, 'planRoute sem origem');
});

test('S2 planRouteManual: soma das pernas ≈ distanciaTotalKm (1%)', () => {
  const stops = FIXTURE.slice(0, 5);
  const plan = planRouteManual(stops, [stops[3].id, stops[1].id, stops[0].id, stops[4].id, stops[2].id], {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
  });
  assertSomaPernasProximaDoTotal(sumLegsKm(plan.paradas), plan.distanciaTotalKm, 'planRouteManual');
});

test('S2 planRouteManual: parada semCoordenada no MEIO não tem perna própria; a PRÓXIMA válida mede pulando o buraco (do último ponto físico conhecido)', () => {
  const stops: Stop[] = [FIXTURE[0], FIXTURE[1], { id: 'sem-meio', lat: null, lng: null, status: 'agendada', nome: 'Sem GPS no meio' }];
  const plan = planRouteManual(stops, [FIXTURE[0].id, 'sem-meio', FIXTURE[1].id], {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
  });
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.deepEqual(ordenadas.map((p) => p.id), [FIXTURE[0].id, 'sem-meio', FIXTURE[1].id]);
  assert.equal(ordenadas[1].legDistanceM, null, 'a própria parada sem coordenada nunca tem perna');
  assert.equal(ordenadas[1].legDurationS, null);
  const legEsperadoKm = haversineKm(
    { lat: FIXTURE[0].lat as number, lng: FIXTURE[0].lng as number },
    { lat: FIXTURE[1].lat as number, lng: FIXTURE[1].lng as number },
  );
  assert.ok(ordenadas[2].legDistanceM != null, 'a parada seguinte à sem-coordenada RECUPERA perna (mede do último ponto físico)');
  assert.ok(
    Math.abs((ordenadas[2].legDistanceM as number) / 1000 - legEsperadoKm) < 0.01,
    `perna pulando o buraco deveria ser ~${legEsperadoKm.toFixed(3)}km, veio ${((ordenadas[2].legDistanceM as number) / 1000).toFixed(3)}km`,
  );
});

test('S2 planRouteByRoads (matriz): soma das pernas ≈ distanciaTotalKm (1%); 1ª parada tem perna da origem', async () => {
  const stops = FIXTURE.slice(0, 4);
  const size = stops.length + 1; // +1 pela origem (hasOrigin=true)
  const osrmTable = async (): Promise<OsrmTablePayload> => ({ code: 'Ok', ...fakeMatrix(size) });
  const plan = await planRouteByRoads(stops, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
    osrmTable,
  });
  assert.equal(plan.engine, 'osrm');
  const somaPernasM = plan.paradas.reduce((sum, p) => sum + (p.legDistanceM ?? 0), 0);
  const totalM = plan.distanciaTotalKm * 1000;
  assert.ok(
    Math.abs(somaPernasM - totalM) <= Math.max(totalM * 0.01, 20),
    `soma das pernas=${somaPernasM}m deveria ser ~distanciaTotalKm=${totalM}m`,
  );
  const ordenadas = [...plan.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  assert.ok(ordenadas[0].legDistanceM != null, '1ª parada tem perna da origem (hasOrigin=true → previousMatrixIndex=0)');
});

test('S2 planRouteByRoads (matriz): parada semCoordenada fica com legDistanceM/legDurationS null (matriz não tem essa parada)', async () => {
  const stops: Stop[] = [...FIXTURE.slice(0, 3), { id: 'sem-gps-matriz', lat: null, lng: null, status: 'agendada', nome: 'Sem GPS' }];
  const size = 3 + 1; // 3 válidas + origem
  const osrmTable = async (): Promise<OsrmTablePayload> => ({ code: 'Ok', ...fakeMatrix(size) });
  const plan = await planRouteByRoads(stops, {
    origem: ORIGEM,
    velocidadeKmH: 25,
    paradaMin: 5,
    partida: new Date('2026-07-25T08:00:00'),
    osrmTable,
  });
  const semCoord = plan.paradas.find((p) => p.id === 'sem-gps-matriz');
  assert.equal(semCoord?.semCoordenada, true);
  assert.equal(semCoord?.legDistanceM, null);
  assert.equal(semCoord?.legDurationS, null);
});
