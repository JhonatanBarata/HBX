import test from 'node:test';
import assert from 'node:assert/strict';

import {
  conferirParadas,
  motivosVisiveisOrdenados,
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
//
// 26/07 (ordem do dono) — o AMARELO morreu. Só motivo IMPEDITIVO pinta; motivo
// informativo (`geocode_nao_provado_em_campo`, `fonte_nao_confiavel`, `nunca_entregue`,
// `rota_degradada`) continua em `motivos[]` mas a parada segue VERDE. Os testes abaixo
// que antes exigiam 'amarelo' agora exigem exatamente isto: verde COM o motivo dentro.

/** Parada "limpa" por default (verde): fonte provada, entregue antes, sem outlier
 *  geométrico, CEP batendo, engine osrm. Cada teste sobrescreve só o que quer isolar. */
function base(overrides: Partial<ParadaConferenciaInput> & { id: string }): ParadaConferenciaInput {
  return {
    lat: -22.4,
    lng: -47.55,
    geoFonte: 'gps_entrega',
    legDistanceM: 1000,
    temEntregaConcluida: true,
    distanciaGpsOuroM: null,
    cepDivergente: false,
    enderecoSemNumero: false,
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

// ── 06/08: A COORDENADA NÃO É IDENTIDADE (ordem do dono) ───────────────────────
// O incidente 25/07 (empresa 41) tinha 154/248 clientes no mesmo centroide de via, e a
// régua respondia "endereço igual ao de outro cliente". Errado: o que identifica um
// ponto de entrega é CEP → número → complemento (Correios/DNE, USPS/DPV). Casas
// diferentes empilhadas num ponto são geocode que não chegou na porta — o que aparece
// pela FONTE do pino, e não acusando o cadastro de ninguém.
test('mesmo centroide de via com NÚMEROS diferentes: ninguém é acusado de endereço repetido', () => {
  const PINO_DA_VIA = { lat: -22.398413, lng: -47.554608 }; // "Rua 12" colapsada
  const rua = { endereco: 'Rua 12', cidade: 'Rio Claro', uf: 'SP', cep: '13504683' };
  // geoFonte 'geocode' é o caso REAL (os 5 da Avenida 74 vieram do centroide do CEP).
  const paradas = [
    base({ id: 'cliente-A', ...PINO_DA_VIA, geoFonte: 'geocode', porta: { ...rua, numero: '188' } }),
    base({ id: 'cliente-B', lat: -22.39841, lng: -47.55461, geoFonte: 'geocode', porta: { ...rua, numero: '197' } }),
    base({ id: 'cliente-C', ...PINO_DA_VIA, geoFonte: 'geocode', porta: { ...rua, numero: '228' } }),
  ];
  for (const r of conferirParadas(paradas, { engine: 'osrm' })) {
    assert.ok(!r.motivos.includes('endereco_repetido'), `${r.id} não pode ser acusado de repetido`);
    assert.equal(r.semaforo, 'verde', `${r.id} não tem problema IMPEDITIVO nenhum`);
    // O pino ruim continua denunciado, pela fonte — que é o que ele sempre foi.
    assert.ok(r.motivos.includes('geocode_nao_provado_em_campo'));
  }
});

test('endereco_repetido: MESMO número na mesma rua → os dois vermelhos, com ou sem pino', () => {
  const rua = { endereco: 'Avenida 96', cidade: 'Rio Claro', uf: 'SP', cep: '13504726' };
  const paradas = [
    base({ id: 'com-pino-1', lat: -22.4, lng: -47.55, porta: { ...rua, numero: '405' } }),
    base({ id: 'com-pino-2', lat: -22.48, lng: -47.59, porta: { ...rua, numero: '405' } }), // longe: o ponto não importa
    base({ id: 'sem-pino-1', lat: null, lng: null, legDistanceM: null, porta: { ...rua, numero: '900' } }),
    base({ id: 'sem-pino-2', lat: null, lng: null, legDistanceM: null, porta: { ...rua, numero: '900' } }),
    base({ id: 'sozinho', lat: -22.41, lng: -47.56, porta: { ...rua, numero: '111' } }),
  ];
  const porId = new Map(conferirParadas(paradas, { engine: 'osrm' }).map((r) => [r.id, r]));
  for (const id of ['com-pino-1', 'com-pino-2', 'sem-pino-1', 'sem-pino-2']) {
    assert.ok(porId.get(id)!.motivos.includes('endereco_repetido'), `${id} divide a porta`);
    assert.equal(porId.get(id)!.semaforo, 'vermelho');
  }
  assert.ok(!porId.get('sozinho')!.motivos.includes('endereco_repetido'));
});

test('condomínio: mesmo número com APARTAMENTOS diferentes não é endereço repetido', () => {
  const rua = { endereco: 'Avenida 96', numero: '405', cidade: 'Rio Claro', uf: 'SP', cep: '13504726' };
  const paradas = [
    base({ id: 'apto-32', lat: -22.4, lng: -47.55, porta: { ...rua, complemento: 'Apto 32' } }),
    base({ id: 'apto-45', lat: -22.4, lng: -47.55, porta: { ...rua, complemento: 'AP. 45' } }),
  ];
  for (const r of conferirParadas(paradas, { engine: 'osrm' })) {
    assert.ok(!r.motivos.includes('endereco_repetido'), `${r.id} é outra unidade do mesmo prédio`);
  }
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
    // 27/07 (recalibração company 48): > piso (2500) e > 5×mediana (2500).
    base({ id: 'longe', ...P4, legDistanceM: 2600 }),
  ];
  const [longe] = conferirParadas(paradas, { engine: 'osrm' }).filter((r) => r.id === 'longe');
  assert.equal(longe.semaforo, 'vermelho');
  assert.ok(longe.motivos.includes('perna_outlier'));
});

// 27/07 (incidente company 48, caso "Vânia") — a PRIMEIRA parada carrega a perna da
// ORIGEM (casa do motorista → começo da rota): 5,5 km de casa não é anomalia de pino.
test('perna_outlier: a PRIMEIRA parada nunca pinta (perna da origem não é anomalia)', () => {
  const paradas = [
    base({ id: 'primeira', ...P1, legDistanceM: 9000 }),
    base({ id: 'p2', ...P2, legDistanceM: 400 }),
    base({ id: 'p3', ...P3, legDistanceM: 500 }),
    base({ id: 'p4', ...P4, legDistanceM: 600 }),
    base({ id: 'longe', ...P4, legDistanceM: 9000 }),
  ];
  const resultado = conferirParadas(paradas, { engine: 'osrm' });
  assert.ok(!resultado.find((p) => p.id === 'primeira')!.motivos.includes('perna_outlier'), 'perna da origem é deslocamento, não anomalia');
  assert.ok(resultado.find((p) => p.id === 'longe')!.motivos.includes('perna_outlier'), 'perna anômala NO MEIO da rota continua acusando');
});

// ── INFORMATIVOS (26/07): apurados, guardados em motivos[], mas NÃO pintam ───────
test("geoFonte='geocode' → VERDE com o motivo guardado (estado normal de cliente novo, não é aviso)", () => {
  const [p] = conferirParadas([base({ id: 'geo', geoFonte: 'geocode' })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'verde', 'endereço não confirmado em campo NÃO pode aparecer pro motorista');
  assert.deepEqual(p.motivos, ['geocode_nao_provado_em_campo'], 'o motivo continua no array (auditoria)');
  assert.deepEqual(motivosVisiveisOrdenados(p.motivos), [], 'e nada disso é visível');
});

test("geoFonte='gps_impreciso' (ou fonte legada desconhecida) → verde/fonte_nao_confiavel, motivo DIFERENTE do geocode", () => {
  const [imprecisa] = conferirParadas([base({ id: 'imp', geoFonte: 'gps_impreciso' })], { engine: 'osrm' });
  const [legado] = conferirParadas([base({ id: 'leg', geoFonte: null })], { engine: 'osrm' });
  assert.deepEqual(imprecisa.motivos, ['fonte_nao_confiavel']);
  assert.deepEqual(legado.motivos, ['fonte_nao_confiavel']);
  assert.equal(imprecisa.semaforo, 'verde');
  assert.equal(legado.semaforo, 'verde');
});

test("geoFonte='gps_cadastro' também é verde (allowlist tem os DOIS, não só gps_entrega)", () => {
  const [p] = conferirParadas([base({ id: 'cad', geoFonte: 'gps_cadastro' })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'verde');
});

test('nunca_entregue: cliente sem NENHUMA entrega concluída → VERDE (todo cliente novo é assim)', () => {
  const [p] = conferirParadas([base({ id: 'novo', temEntregaConcluida: false })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'verde');
  assert.deepEqual(p.motivos, ['nunca_entregue']);
  assert.deepEqual(motivosVisiveisOrdenados(p.motivos), []);
});

test('rota_degradada: engine haversine NÃO pinta parada nenhuma (a faixa do topo avisa 1 vez, não 97)', () => {
  // Coordenadas distintas: sem isso as 2 paradas cairiam na mesma célula (default de
  // `base()`) e a cor viraria vermelho por pino_compartilhado, mascarando o que este
  // teste quer provar.
  const resultado = conferirParadas(
    [base({ id: 'a', lat: -22.40, lng: -47.55 }), base({ id: 'b', lat: -22.41, lng: -47.56 })],
    { engine: 'haversine' },
  );
  for (const r of resultado) {
    assert.equal(r.semaforo, 'verde', `${r.id} deveria seguir verde (rota_degradada é informativo)`);
    assert.ok(r.motivos.includes('rota_degradada'), 'mas o motivo continua registrado (Lei nº4)');
    assert.deepEqual(motivosVisiveisOrdenados(r.motivos), []);
  }
});

// ── REGRESSÃO do incidente 26/07: a base NOVA inteira tem que sair verde ─────────
test('base NOVA (geocode + nunca entregue + haversine) → 0 vermelhas — era o 0/97 verdes medido em produção', () => {
  const paradas = Array.from({ length: 97 }, (_, i) =>
    base({
      id: `novo-${i}`,
      // pinos distintos (não é o caso de pino compartilhado — é base nova comum)
      lat: -22.4 + i * 0.001,
      lng: -47.55 + i * 0.001,
      geoFonte: 'geocode',
      temEntregaConcluida: false,
      legDistanceM: 900 + i,
    }),
  );
  const resultado = conferirParadas(paradas, { engine: 'haversine' });
  assert.equal(resultado.filter((r) => r.semaforo === 'vermelho').length, 0, 'nenhum aviso: nada aqui é impeditivo');
  assert.equal(resultado.filter((r) => r.semaforo === 'verde').length, 97);
});

// ── CEP × endereço (26/07): o ÚNICO aviso novo, e ele é IMPEDITIVO ───────────────
test('cep_endereco_divergente: CEP não bate com o endereço → vermelho (obrigatório corrigir)', () => {
  const [p] = conferirParadas([base({ id: 'cep-errado', cepDivergente: true })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'vermelho');
  assert.deepEqual(p.motivos, ['cep_endereco_divergente']);
  assert.deepEqual(motivosVisiveisOrdenados(p.motivos), ['cep_endereco_divergente']);
});

test('cepDivergente vale mesmo SEM pino: são dois problemas pra corrigir, não um', () => {
  const [p] = conferirParadas(
    [base({ id: 'sem-tudo', lat: null, lng: null, legDistanceM: null, cepDivergente: true })],
    { engine: 'osrm' },
  );
  assert.deepEqual(p.motivos, ['cep_endereco_divergente', 'sem_pino']);
  assert.equal(p.semaforo, 'vermelho');
});

test('motivosVisiveisOrdenados: filtra informativos e ordena por gravidade (CEP → número → pino → geometria)', () => {
  const misturado: Parameters<typeof motivosVisiveisOrdenados>[0] = [
    'rota_degradada',
    'perna_outlier',
    'nunca_entregue',
    'sem_pino',
    'cep_endereco_divergente',
    'endereco_sem_numero',
    'geocode_nao_provado_em_campo',
  ];
  assert.deepEqual(motivosVisiveisOrdenados(misturado), [
    'cep_endereco_divergente',
    'endereco_sem_numero',
    'sem_pino',
    'perna_outlier',
  ]);
  assert.deepEqual(motivosVisiveisOrdenados(['nunca_entregue', 'rota_degradada']), []);
});

// ── endereço sem número (26/07) ─────────────────────────────────────────────────
test('endereco_sem_numero: impeditivo, pinta e aparece — e vale MESMO com pino provado', () => {
  const [p] = conferirParadas([base({ id: 'sem-num', enderecoSemNumero: true })], { engine: 'osrm' });
  assert.equal(p.semaforo, 'vermelho');
  assert.deepEqual(p.motivos, ['endereco_sem_numero']);
  assert.deepEqual(motivosVisiveisOrdenados(p.motivos), ['endereco_sem_numero']);
});

test('endereco_sem_numero + cep_endereco_divergente: os dois aparecem, CEP primeiro', () => {
  const [p] = conferirParadas(
    [base({ id: 'dois', cepDivergente: true, enderecoSemNumero: true })],
    { engine: 'osrm' },
  );
  assert.deepEqual(motivosVisiveisOrdenados(p.motivos), ['cep_endereco_divergente', 'endereco_sem_numero']);
});

// ── Lei: motivos[] acumula TODOS, mas só impeditivo pinta ───────────────────────
test('impeditivo pinta e motivos[] acumula o informativo junto (endereço repetido + geocode não provado)', () => {
  const rua = { endereco: 'Avenida 96', numero: '405', cidade: 'Rio Claro', uf: 'SP', cep: '13504726' };
  const paradas = [
    base({ id: 'x1', lat: -22.4, lng: -47.55, geoFonte: 'geocode', porta: rua }),
    base({ id: 'x2', lat: -22.42, lng: -47.57, geoFonte: 'gps_entrega', porta: rua }),
  ];
  const [x1] = conferirParadas(paradas, { engine: 'osrm' }).filter((r) => r.id === 'x1');
  assert.equal(x1.semaforo, 'vermelho', 'endereco_repetido é impeditivo → pinta');
  assert.ok(x1.motivos.includes('endereco_repetido'));
  assert.ok(x1.motivos.includes('geocode_nao_provado_em_campo'), 'motivo informativo continua no array (Lei nº4)');
  assert.deepEqual(motivosVisiveisOrdenados(x1.motivos), ['endereco_repetido'], 'mas só o impeditivo é exibido');
});

test('sem_pino não acumula os motivos de coordenada (não dá pra medir casulo/célula/perna de um ponto inexistente)', () => {
  const [semPino] = conferirParadas(
    [base({ id: 'sem', lat: null, lng: null, legDistanceM: null, geoFonte: null, temEntregaConcluida: false })],
    { engine: 'osrm' },
  );
  assert.deepEqual(semPino.motivos, ['sem_pino']);
});
