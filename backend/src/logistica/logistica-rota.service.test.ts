import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haversineKm,
  nearestNeighbor,
  twoOpt,
  routeCostKm,
  computeEta,
  planRoute,
  filtrarComCoord,
  type Stop,
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
