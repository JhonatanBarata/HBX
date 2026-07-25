import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENDA_ETA_DESLOCAMENTO_MIN_PADRAO,
  AGENDA_ETA_HORA_SAIDA_PADRAO,
  AGENDA_ETA_TEMPO_PARADA_MIN_PADRAO,
  calcularEtas,
  EtaParadaInput,
} from './logistica-agenda-eta.util';

// S4-AVISO-DE-HORARIO — cálculo puro (sem OSRM, sem Prisma) que soma
// deslocamento + tempo de parada em cadeia e compara com a janela do cliente.
// eta[0] = horaSaida + deslocamento; eta[i] = eta[i-1] + tempoParada[i-1] + deslocamento.

function parada(over: Partial<EtaParadaInput> = {}): EtaParadaInput {
  return { tempoParadaMin: null, janelaFim: null, janelaTipo: null, ...over };
}

test('cadeia de soma: eta[0]=horaSaida+deslocamento, eta[i]=eta[i-1]+tempoParada[i-1]+deslocamento', () => {
  // 08:00 saída, deslocamento 5min, 3 paradas de 10min cada (default).
  const resultado = calcularEtas([parada(), parada(), parada()], '08:00', 5);

  assert.equal(resultado.length, 3);
  assert.equal(resultado[0].eta, '08:05'); // 08:00 + 5
  assert.equal(resultado[1].eta, '08:20'); // 08:05 + 10 (parada 0) + 5
  assert.equal(resultado[2].eta, '08:35'); // 08:20 + 10 (parada 1) + 5
});

test('defaults nomeados são usados quando horaSaida/deslocamento não são informados', () => {
  const resultado = calcularEtas([parada()]);
  const esperado = 8 * 60 + AGENDA_ETA_DESLOCAMENTO_MIN_PADRAO;
  const horas = String(Math.floor(esperado / 60)).padStart(2, '0');
  const minutos = String(esperado % 60).padStart(2, '0');
  assert.equal(resultado[0].eta, `${horas}:${minutos}`);
  assert.equal(AGENDA_ETA_HORA_SAIDA_PADRAO, '08:00');
  assert.equal(AGENDA_ETA_TEMPO_PARADA_MIN_PADRAO, 10);
});

test('tempoParadaMin null usa o default de 10 min (não zera a cadeia)', () => {
  const resultado = calcularEtas(
    [parada({ tempoParadaMin: null }), parada()],
    '08:00',
    5,
  );
  // eta[1] = 08:05 + 10 (default, não 0) + 5 = 08:20
  assert.equal(resultado[1].eta, '08:20');
});

test('tempoParadaMin explícito 0 é respeitado (não é "ausente")', () => {
  const resultado = calcularEtas(
    [parada({ tempoParadaMin: 0 }), parada()],
    '08:00',
    5,
  );
  // eta[1] = 08:05 + 0 + 5 = 08:10
  assert.equal(resultado[1].eta, '08:10');
});

test('janela RIGIDA: eta > janelaFim gera CONFLITO', () => {
  // eta[0] = 08:05, janela fim 08:00 → estourou, tipo RIGIDA → CONFLITO
  const resultado = calcularEtas(
    [parada({ janelaFim: '08:00', janelaTipo: 'RIGIDA' })],
    '08:00',
    5,
  );
  assert.equal(resultado[0].alertaJanela, 'CONFLITO');
});

test('janela PREFERENCIAL rebaixa CONFLITO para APERTADO (não bloqueia)', () => {
  const resultado = calcularEtas(
    [parada({ janelaFim: '08:00', janelaTipo: 'PREFERENCIAL' })],
    '08:00',
    5,
  );
  assert.equal(resultado[0].alertaJanela, 'APERTADO');
});

test('eta dentro dos últimos 15 min da janela é APERTADO mesmo sem estourar', () => {
  // eta[0] = 08:05; janela fim 08:15 (RIGIDA) → dentro da janela mas nos últimos 15min → APERTADO
  const resultado = calcularEtas(
    [parada({ janelaFim: '08:15', janelaTipo: 'RIGIDA' })],
    '08:00',
    5,
  );
  assert.equal(resultado[0].alertaJanela, 'APERTADO');
});

test('eta com folga confortável na janela não gera nenhum alerta', () => {
  // eta[0] = 08:05; janela fim 09:00 → folga de 55min, bem fora dos últimos 15min
  const resultado = calcularEtas(
    [parada({ janelaFim: '09:00', janelaTipo: 'RIGIDA' })],
    '08:00',
    5,
  );
  assert.equal(resultado[0].alertaJanela, null);
});

test('parada SEM janela nunca gera aviso — não inventar janela (Lei nº1)', () => {
  const resultado = calcularEtas(
    [parada({ janelaFim: null, janelaTipo: null })],
    '08:00',
    5,
  );
  assert.equal(resultado[0].alertaJanela, null);
  assert.ok(resultado[0].eta.length > 0, 'eta continua calculado normalmente mesmo sem janela');
});

test('virada de hora: soma que passa da meia-noite "sobra" pro dia seguinte sem hora negativa, e vira CONFLITO automático em qualquer janela do dia', () => {
  // Saída 23:50, deslocamento 5min, parada de 30min: eta[0] = 23:55; eta[1] = 23:55+30+5 = 24:30 → vira 00:30.
  const resultado = calcularEtas(
    [
      parada({ tempoParadaMin: 30, janelaFim: '23:59', janelaTipo: 'PREFERENCIAL' }),
      parada({ janelaFim: '23:59', janelaTipo: 'RIGIDA' }),
    ],
    '23:50',
    5,
  );
  assert.equal(resultado[0].eta, '23:55');
  assert.equal(resultado[1].eta, '00:30', 'formata como o relógio do dia seguinte, nunca hora negativa');
  // eta[1] cru (24:30 = 1470min) > janelaFim 23:59 (1439min) de QUALQUER dia → sempre estoura.
  assert.equal(resultado[1].alertaJanela, 'CONFLITO');
});

test('horaSaida/deslocamento inválidos caem no default nomeado em vez de quebrar', () => {
  const resultado = calcularEtas([parada()], 'lixo', -5);
  // horaSaida inválida → default 08:00; deslocamento negativo → default 5min.
  assert.equal(resultado[0].eta, '08:05');
});
