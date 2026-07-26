import test from 'node:test';
import assert from 'node:assert/strict';

import {
  conferirParadas,
  TETO_CASULO_KM,
  FATOR_PERNA_OUTLIER,
  PISO_PERNA_OUTLIER_M,
  DIVERGE_GPS_OURO_METROS,
  type ParadaConferenciaInput,
} from './logistica-conferencia.util';

// S3 (25/07, PR25072026-ROTA-CONFERIDA) — prova o SEMÁFORO de confiança do pino com
// os números REAIS do incidente empresa 41 (freio do geocode, nucleo-geo.util.ts):
// 154/248 clientes dividindo o MESMO centroide de via ("pino compartilhado") e
// divergências de 2.991m/1.512m/650m entre o cadastro e o GPS real da porta
// ("diverge_gps_ouro") — mais os casos de borda exigidos pela sprint.

/** Parada "limpa" por default (verde): fonte provada, entregue antes, sem outlier
 *  geométrico, engine osrm. Cada teste sobrescreve só o que quer isolar. */
function base(overrides: Partial<ParadaConferenciaInput> & { id: string }): ParadaConferenciaInput {
  return {
    lat: -22.4,
    lng: -47.55,
    geoFonte: 'gps_entrega',
    legDistanceM: 1000,
    temEntregaConcluida: true,
    distanciaGpsOuroM: null,
    ...overrides,
  };
}

test('parada limpa (fonte provada + já entregue + engine osrm) → verde, sem motivos', () => {
  const [p] = conferirParadas([base({ id: 'a' })], { engine: 'osrm' });
  assert.deepEqual(p, { id: 'a', semaforo: 'verde', motivos: [] });
});

test('0 paradas → lista vazia, sem lançar (mediana/casulo/célula não têm nada pra comparar)', () => {
  assert.deepEqual(conferirParadas([], { engine: 'osrm' }), []);
});

test('1 parada → verde (mediana do casulo é ela mesma, distância até si própria = 0)', () => {
  const [p] = conferirParadas([base({ id: 'unica', legDistanceM: null })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'verde');
  assert.deepEqual(p.motivos, []);
});

test('TODAS sem pino → todas vermelho/sem_pino, nenhuma regra geométrica quebra com lista vazia de coord', () => {
  const paradas = [
    base({ id: 'x1', lat: null, lng: null, legDistanceM: null }),
    base({ id: 'x2', lat: null, lng: null, legDistanceM: null }),
    base({ id: 'x3', lat: null, lng: null, legDistanceM: null }),
  ];
  const resultado = conferirParadas(paradas, { engine: 'osrm' });
  for (const r of resultado) {
    assert.equal(r.semaforo, 'vermelho');
    assert.deepEqual(r.motivos, ['sem_pino']);
  }
});

// ── incidente real empresa 41: pino compartilhado (154/248) ─────────────────────
test('pino_compartilhado: 3 clientes no MESMO centroide de via (empresa 41) → todos vermelho', () => {
  const PINO_DA_VIA = { lat: -22.398413, lng: -47.554608 }; // "Rua 12" colapsada
  const paradas = [
    base({ id: 'cliente-A', ...PINO_DA_VIA }),
    base({ id: 'cliente-B', lat: -22.39841, lng: -47.55461 }), // difere só na 5ª casa — mesma célula
    base({ id: 'cliente-C', ...PINO_DA_VIA }),
    base({ id: 'cliente-D', lat: -22.41, lng: -47.56 }), // endereço DIFERENTE, não compartilha
  ];
  const resultado = conferirParadas(paradas, { engine: 'osrm' });
  const porId = new Map(resultado.map((r) => [r.id, r]));

  for (const id of ['cliente-A', 'cliente-B', 'cliente-C']) {
    assert.equal(porId.get(id)!.semaforo, 'vermelho', `${id} deveria ser vermelho`);
    assert.ok(porId.get(id)!.motivos.includes('pino_compartilhado'), `${id} deveria ter pino_compartilhado`);
  }
  assert.ok(!porId.get('cliente-D')!.motivos.includes('pino_compartilhado'), 'cliente-D não compartilha pino');
});

// ── incidente real empresa 41: divergência do GPS de ouro (2.991m/1.512m/650m) ──
test('diverge_gps_ouro: os 3 casos reais do incidente (2.991m/1.512m/650m) todos > 300m → vermelho', () => {
  // Coordenadas DISTINTAS (cada uma em sua própria célula de 4 casas) — do
  // contrário todas cairiam na mesma célula (default de `base()`) e o teste
  // provaria pino_compartilhado por acidente, não diverge_gps_ouro isolado.
  const paradas = [
    base({ id: 'div-2991', lat: -22.400, lng: -47.550, distanciaGpsOuroM: 2991 }),
    base({ id: 'div-1512', lat: -22.401, lng: -47.551, distanciaGpsOuroM: 1512 }),
    base({ id: 'div-650', lat: -22.402, lng: -47.552, distanciaGpsOuroM: 650 }),
    base({ id: 'sem-divergencia', lat: -22.403, lng: -47.553, distanciaGpsOuroM: 50 }), // dentro do limiar
  ];
  const resultado = conferirParadas(paradas, { engine: 'osrm' });
  const porId = new Map(resultado.map((r) => [r.id, r]));

  for (const id of ['div-2991', 'div-1512', 'div-650']) {
    assert.equal(porId.get(id)!.semaforo, 'vermelho', `${id} deveria ser vermelho`);
    assert.ok(porId.get(id)!.motivos.includes('diverge_gps_ouro'));
  }
  assert.ok(!porId.get('sem-divergencia')!.motivos.includes('diverge_gps_ouro'));
  assert.equal(porId.get('sem-divergencia')!.semaforo, 'verde');
});

test(`limiar de diverge_gps_ouro é exatamente ${DIVERGE_GPS_OURO_METROS}m (borda não acusa, acima acusa)`, () => {
  const [naBorda] = conferirParadas([base({ id: 'borda', distanciaGpsOuroM: DIVERGE_GPS_OURO_METROS })], { engine: 'osrm' });
  const [acimaDaBorda] = conferirParadas([base({ id: 'acima', distanciaGpsOuroM: DIVERGE_GPS_OURO_METROS + 1 })], { engine: 'osrm' });
  assert.ok(!naBorda.motivos.includes('diverge_gps_ouro'), 'exatamente no limiar não deve acusar (> estrito)');
  assert.ok(acimaDaBorda.motivos.includes('diverge_gps_ouro'));
});

// ── fora_do_casulo ───────────────────────────────────────────────────────────────
test(`fora_do_casulo: parada a >${TETO_CASULO_KM}km da mediana do dia → vermelho; o resto do cluster fica verde`, () => {
  const cluster = [
    base({ id: 'c1', lat: -22.40, lng: -47.55 }),
    base({ id: 'c2', lat: -22.41, lng: -47.56 }),
    base({ id: 'c3', lat: -22.39, lng: -47.54 }),
    base({ id: 'c4', lat: -22.405, lng: -47.555 }),
    base({ id: 'c5', lat: -22.395, lng: -47.545 }),
  ];
  // ~33km ao norte da mediana do cluster (0.30° de lat ≈ 33km) — bem acima do teto.
  const longe = base({ id: 'longe', lat: -22.40 + 0.30, lng: -47.55 });
  const resultado = conferirParadas([...cluster, longe], { engine: 'osrm' });
  const porId = new Map(resultado.map((r) => [r.id, r]));

  assert.equal(porId.get('longe')!.semaforo, 'vermelho');
  assert.ok(porId.get('longe')!.motivos.includes('fora_do_casulo'));
  for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    assert.ok(!porId.get(id)!.motivos.includes('fora_do_casulo'), `${id} está dentro do casulo`);
  }
});

// ── perna_outlier (com piso — não acusa rota curta) ─────────────────────────────
// Coordenadas distintas (não a mesma dos 4 defaults de `base()`) — isola a variável
// sob teste (perna) sem contaminar com pino_compartilhado sendo acionado à toa.
const P1 = { lat: -22.400, lng: -47.550 };
const P2 = { lat: -22.401, lng: -47.551 };
const P3 = { lat: -22.402, lng: -47.552 };
const P4 = { lat: -22.403, lng: -47.553 };

test(`perna_outlier: piso de ${PISO_PERNA_OUTLIER_M}m evita alarme falso numa rota CURTA (mediana pequena)`, () => {
  // Mediana das pernas = 500m; 3× mediana = 1500m < piso (2000m) → o limiar REAL é o
  // piso. Uma perna de 1800m NÃO deve acusar (está abaixo do piso).
  const paradas = [
    base({ id: 'p1', ...P1, legDistanceM: 500 }),
    base({ id: 'p2', ...P2, legDistanceM: 500 }),
    base({ id: 'p3', ...P3, legDistanceM: 500 }),
    base({ id: 'quase', ...P4, legDistanceM: 1800 }),
  ];
  const [quase] = conferirParadas(paradas, { engine: 'osrm' }).filter((r) => r.id === 'quase');
  assert.ok(!quase.motivos.includes('perna_outlier'), 'abaixo do piso não deve acusar outlier');
});

test(`perna_outlier: acima do piso E acima de ${FATOR_PERNA_OUTLIER}× a mediana → vermelho`, () => {
  const paradas = [
    base({ id: 'p1', ...P1, legDistanceM: 500 }),
    base({ id: 'p2', ...P2, legDistanceM: 500 }),
    base({ id: 'p3', ...P3, legDistanceM: 500 }),
    base({ id: 'longe', ...P4, legDistanceM: 2500 }), // > piso (2000) e > 3×mediana (1500)
  ];
  const [longe] = conferirParadas(paradas, { engine: 'osrm' }).filter((r) => r.id === 'longe');
  assert.equal(longe.semaforo, 'vermelho');
  assert.ok(longe.motivos.includes('perna_outlier'));
});

// ── amarelo: fonte não provada, nunca entregue, rota degradada ──────────────────
test("geoFonte='geocode' → amarelo/geocode_nao_provado_em_campo (não vira vermelho sozinho)", () => {
  const [p] = conferirParadas([base({ id: 'geo', geoFonte: 'geocode' })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'amarelo');
  assert.deepEqual(p.motivos, ['geocode_nao_provado_em_campo']);
});

test("geoFonte='gps_impreciso' (ou fonte legada desconhecida) → amarelo/fonte_nao_confiavel, motivo DIFERENTE do geocode", () => {
  const [imprecisa] = conferirParadas([base({ id: 'imp', geoFonte: 'gps_impreciso' })], { engine: 'osrm' });
  const [legado] = conferirParadas([base({ id: 'leg', geoFonte: null })], { engine: 'osrm' });
  assert.deepEqual(imprecisa.motivos, ['fonte_nao_confiavel']);
  assert.deepEqual(legado.motivos, ['fonte_nao_confiavel']);
});

test("geoFonte='gps_cadastro' também é verde (allowlist tem os DOIS, não só gps_entrega)", () => {
  const [p] = conferirParadas([base({ id: 'cad', geoFonte: 'gps_cadastro' })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'verde');
});

test('nunca_entregue: cliente sem NENHUMA entrega concluída → amarelo', () => {
  const [p] = conferirParadas([base({ id: 'novo', temEntregaConcluida: false })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'amarelo');
  assert.deepEqual(p.motivos, ['nunca_entregue']);
});

test('rota_degradada: engine haversine pinta TODAS de amarelo NO MÍNIMO, mesmo a que seria verde', () => {
  // Coordenadas distintas: sem isso as 2 paradas cairiam na mesma célula (default de
  // `base()`) e a cor viraria vermelho por pino_compartilhado, mascarando o que este
  // teste quer provar (rota_degradada sozinho já tira do verde, sem precisar de mais nada).
  const resultado = conferirParadas(
    [base({ id: 'a', lat: -22.40, lng: -47.55 }), base({ id: 'b', lat: -22.41, lng: -47.56 })],
    { engine: 'haversine' },
  );
  for (const r of resultado) {
    assert.equal(r.semaforo, 'amarelo', `${r.id} deveria ser amarelo (só rota_degradada, nenhum motivo vermelho)`);
    assert.ok(r.motivos.includes('rota_degradada'));
  }
});

// ── Lei: vermelho SEMPRE vence amarelo, motivos[] acumula TODOS ─────────────────
test('vermelho vence amarelo mas motivos[] acumula os dois (pino compartilhado + geocode não provado)', () => {
  const PINO = { lat: -22.4, lng: -47.55 };
  const paradas = [
    base({ id: 'x1', ...PINO, geoFonte: 'geocode' }),
    base({ id: 'x2', ...PINO, geoFonte: 'gps_entrega' }),
  ];
  const [x1] = conferirParadas(paradas, { engine: 'osrm' }).filter((r) => r.id === 'x1');
  assert.equal(x1.semaforo, 'vermelho', 'vermelho (pino_compartilhado) vence o amarelo');
  assert.ok(x1.motivos.includes('pino_compartilhado'));
  assert.ok(x1.motivos.includes('geocode_nao_provado_em_campo'), 'motivo amarelo continua no array (Lei nº4)');
});

test('sem_pino não acumula os motivos de coordenada (não dá pra medir casulo/célula/perna de um ponto inexistente)', () => {
  const [semPino] = conferirParadas(
    [base({ id: 'sem', lat: null, lng: null, legDistanceM: null, geoFonte: null, temEntregaConcluida: false })],
    { engine: 'osrm' },
  );
  assert.deepEqual(semPino.motivos, ['sem_pino']);
});
