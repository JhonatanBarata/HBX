import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ancorarPrioritarios,
  planRoute,
  planRouteManual,
  planRouteByRoads,
  type Stop,
  type OsrmTablePayload,
} from './logistica-rota.service';

/* ════════════════════════════════════════════════════════════════════════════
   PARADA PRIORITÁRIA (18/08) — o SELO sobrevive ao Reorganizar.

   As duas ordens do dono que este arquivo prova:
     3b — "Prioridade: coloca na prioridade, comum encaixa na rota."
     5  — "Reorganizar = reorganiza por distância, PORÉM o que foi adicionado
           como prioridade fica em vermelho, e não entra nesse filtro."

   O bug que a frente mata: prioridade viajava no NASCIMENTO da entrega
   (`POST /logistica/entregas`), onde (i) o DTO recusava o campo — 400
   `property prioridade should not exist` derrubando a porta "Adicionar à
   rota" INTEIRA, prioridade ou comum — e (ii) mesmo se aceitasse, virar
   posição na fila não sobreviveria: todo `planejar` sem `ordemManual` roda
   NN+2-opt e reescreve a sequência. Selo é ESTADO, e estado mora em coluna.

   Régua de risco desta mudança: SEM ninguém carimbado, a rota tem que sair
   EXATAMENTE como saía antes (teste 1). É o teste que autoriza publicar.
   ════════════════════════════════════════════════════════════════════════════ */

const FIXTURE: Stop[] = [
  { id: 's01', lat: -3.7319, lng: -38.5267, status: 'agendada', nome: 'Centro' },
  { id: 's02', lat: -3.7719, lng: -38.4767, status: 'agendada', nome: 'Messejana' },
  { id: 's03', lat: -3.7436, lng: -38.4931, status: 'agendada', nome: 'Aldeota' },
  { id: 's04', lat: -3.8000, lng: -38.5000, status: 'agendada', nome: 'Pajuçara' },
  { id: 's05', lat: -3.7100, lng: -38.5430, status: 'agendada', nome: 'Barra do Ceará' },
  { id: 's06', lat: -3.7600, lng: -38.5100, status: 'agendada', nome: 'Parangaba' },
  { id: 's07', lat: -3.7250, lng: -38.4600, status: 'agendada', nome: 'Mondubim' },
  { id: 's08', lat: -3.7900, lng: -38.5300, status: 'agendada', nome: 'Cristo Redentor' },
];

const ORIGEM = { lat: -3.7327, lng: -38.5270 };
const OPTS = { origem: ORIGEM, velocidadeKmH: 25, paradaMin: 5, partida: new Date('2026-08-18T08:00:00') };

/** ids na sequência que o motor produziu (rotaOrdem 0..N). */
function sequencia(paradas: Array<{ id: string; rotaOrdem: number }>): string[] {
  return [...paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem).map((p) => p.id);
}

function comSelo(ids: string[]): Stop[] {
  return FIXTURE.map((s) => (ids.includes(s.id) ? { ...s, prioridade: true } : s));
}

test('1) SEM ninguém carimbado a rota sai IDÊNTICA à de antes do selo', () => {
  const semCampo = planRoute(FIXTURE, OPTS);
  // `prioridade: false` explícito em todas — o mesmo que o banco devolve pro
  // dia comum (a coluna é NOT NULL DEFAULT false). Não pode mudar NADA.
  const comCampoFalso = planRoute(FIXTURE.map((s) => ({ ...s, prioridade: false })), OPTS);

  assert.deepEqual(sequencia(comCampoFalso.paradas), sequencia(semCampo.paradas));
  assert.equal(comCampoFalso.distanciaTotalKm, semCampo.distanciaTotalKm);
  // Identidade de referência: sem selo, a âncora devolve o MESMO array (não
  // realoca nem reordena) — é o que garante custo zero no dia comum.
  const lista = [...FIXTURE];
  assert.equal(ancorarPrioritarios(lista), lista);
});

test('2) a parada carimbada vai pro TOPO mesmo sendo a última do otimizador', () => {
  const semSelo = sequencia(planRoute(FIXTURE, OPTS).paradas);
  const ultima = semSelo[semSelo.length - 1];

  const comPrioridade = sequencia(planRoute(comSelo([ultima]), OPTS).paradas);
  assert.equal(comPrioridade[0], ultima, 'a parada com selo tem que abrir a rota');
  // E o resto continua na MESMA ordem relativa que o 2-opt achou — o selo
  // decide QUEM vai antes, não refaz a matemática dos outros.
  assert.deepEqual(comPrioridade.slice(1), semSelo.filter((id) => id !== ultima));
});

test('3) entre DUAS prioritárias vale a ordem do otimizador (o selo não desfaz o 2-opt)', () => {
  const semSelo = sequencia(planRoute(FIXTURE, OPTS).paradas);
  const penultima = semSelo[semSelo.length - 2];
  const ultima = semSelo[semSelo.length - 1];

  // Carimbadas na ordem INVERSA à do otimizador de propósito: quem manda
  // dentro do grupo é o caminho mais barato, não a ordem em que o dedo tocou.
  const comDuas = sequencia(planRoute(comSelo([ultima, penultima]), OPTS).paradas);
  assert.deepEqual(comDuas.slice(0, 2), [penultima, ultima]);
  assert.deepEqual(comDuas.slice(2), semSelo.filter((id) => id !== ultima && id !== penultima));
});

test('4) ETA e distância são medidos na sequência FINAL (não na de antes da âncora)', () => {
  const semSelo = sequencia(planRoute(FIXTURE, OPTS).paradas);
  const ultima = semSelo[semSelo.length - 1];
  const plano = planRoute(comSelo([ultima]), OPTS);

  const ordenadas = [...plano.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  let anterior = -Infinity;
  for (const p of ordenadas) {
    if (p.etaAt == null) continue;
    assert.ok(p.etaAt.getTime() > anterior, `ETA tem que crescer na sequência final (parada ${p.id})`);
    anterior = p.etaAt.getTime();
  }
  // A rota com desvio forçado custa MAIS que a otimizada — se a distância não
  // subisse, ela estaria sendo medida na ordem velha (o ponteiro do bug).
  assert.ok(
    plano.distanciaTotalKm > planRoute(FIXTURE, OPTS).distanciaTotalKm,
    'puxar a parada mais longe pro topo tem que aparecer na quilometragem',
  );
});

test('5) a âncora vale TAMBÉM no caminho OSRM (mesma régua dos dois motores)', async () => {
  const stops = FIXTURE.slice(0, 4);
  const size = stops.length + 1; // +1 = origem
  const fake = (): OsrmTablePayload => {
    const durations: number[][] = [];
    const distances: number[][] = [];
    for (let i = 0; i < size; i++) {
      const dur: number[] = []; const dist: number[] = [];
      for (let j = 0; j < size; j++) { dur.push(Math.abs(i - j) * 300); dist.push(Math.abs(i - j) * 1000); }
      durations.push(dur); distances.push(dist);
    }
    return { code: 'Ok', durations, distances };
  };
  const osrmTable = async () => fake();

  const semSelo = await planRouteByRoads(stops, { ...OPTS, osrmTable });
  const ultima = sequencia(semSelo.paradas).at(-1)!;
  const comSeloOsrm = await planRouteByRoads(
    stops.map((s) => (s.id === ultima ? { ...s, prioridade: true } : s)),
    { ...OPTS, osrmTable },
  );

  assert.equal(comSeloOsrm.engine, 'osrm');
  assert.equal(sequencia(comSeloOsrm.paradas)[0], ultima);
  // As pernas saem da matriz na sequência final: a 1ª parada (com origem) tem
  // perna medida a partir da origem, e nenhuma perna fica null no meio.
  const ordenadas = [...comSeloOsrm.paradas].sort((a, b) => a.rotaOrdem - b.rotaOrdem);
  for (const p of ordenadas) assert.ok(p.legDurationS != null, `perna da parada ${p.id} não pode vir nula`);
});

test('6) ORDEM MANUAL: o dedo manda — a âncora NÃO entra por cima do arrasto', () => {
  const arrastada = ['s03', 's01', 's08', 's05'];
  // s08 (carimbada) foi arrastada pra 3ª posição pelo dedo. O servidor não
  // pode "corrigir" isso: ordem manual é decisão explícita de gente, e a
  // ordem 5 fala do filtro de DISTÂNCIA, não do arrasto.
  const plano = planRouteManual(comSelo(['s08']), arrastada, OPTS);
  assert.deepEqual(sequencia(plano.paradas).slice(0, 4), arrastada);
});
