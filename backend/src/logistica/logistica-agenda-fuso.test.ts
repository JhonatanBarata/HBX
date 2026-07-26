import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService } from './logistica-agenda.service';

/**
 * INCIDENTE 26/07 — "o app parou de gerar rota" (company 48).
 *
 * A Agenda decidia o dia com os métodos LOCAIS do Date (`setHours(0,0,0,0)`,
 * `getDay()`, `getFullYear()`), o que significa "meia-noite de quem está rodando o
 * código". No Windows do dono (-03) isso é meia-noite de Brasília e tudo funciona;
 * no CONTAINER (TZ=UTC) vira meia-noite UTC — 21h do dia ANTERIOR em Brasília.
 *
 * Consequência medida em prod: `materializeForRoute` gravava
 * `scheduledAt = 2026-07-26T00:00:00Z` enquanto `/admin-route/prepare` procurava a
 * partir de `2026-07-26T00:00:00-03:00` (= 03:00Z, ver `dateRange` em
 * logistica-admin-route.service.ts). As paradas nasciam 3h ANTES da janela que as
 * busca → invisíveis → "Nenhuma parada foi encontrada para a rota de hoje" → e cada
 * novo clique materializava outro lote (178 entregas órfãs em 3 tentativas).
 *
 * ESTES TESTES RODAM COM TZ=UTC de propósito (ver o `process.env.TZ` abaixo): é a
 * única configuração em que o bug aparecia, e é exatamente a de produção. Rodar a
 * suíte só no fuso do dono foi o que deixou o furo passar batido.
 */

// Trava o fuso do processo em UTC ANTES de exercitar qualquer data: reproduz o
// container. Se as funções da Agenda voltarem a depender do fuso do processo, os
// asserts abaixo quebram.
//
// O runner `npm run test:agenda-fuso` reexecuta ESTE MESMO arquivo em outros fusos
// passando `HBX_TEST_TZ` — inclusive um COM horário de verão, que é o único lugar
// onde `setDate(getDate() + n)` escorrega de dia civil. Rodado na mão, continua UTC.
process.env.TZ = process.env.HBX_TEST_TZ || 'UTC';

const service = LogisticaAgendaService.prototype as any;

/** Meia-noite de São Paulo = 03:00Z (Brasil não usa horário de verão desde 2019). */
const MEIA_NOITE_SP_EM_UTC = 3;

test('parseOperationalDate: "YYYY-MM-DD" vira meia-noite de SÃO PAULO, não do processo', () => {
  const parse = (LogisticaAgendaService as any).__parseOperationalDateForTest
    ?? requireInternal('parseOperationalDate');
  const date = parse('2026-07-26');
  assert.equal(date.toISOString(), '2026-07-26T03:00:00.000Z');
  assert.equal(
    date.getUTCHours(),
    MEIA_NOITE_SP_EM_UTC,
    'com TZ=UTC o código antigo devolvia 00:00Z — 3h antes da janela do prepare',
  );
});

test('dateKey: instante da madrugada UTC ainda pertence ao dia civil ANTERIOR em SP', () => {
  const dateKey = requireInternal('dateKey');
  // 26/07 00:30Z = 25/07 21:30 em São Paulo — o dia de operação ainda é 25.
  assert.equal(dateKey(new Date('2026-07-26T00:30:00.000Z')), '2026-07-25');
  // 26/07 03:00Z = 26/07 00:00 em São Paulo — aí sim virou o dia.
  assert.equal(dateKey(new Date('2026-07-26T03:00:00.000Z')), '2026-07-26');
});

test('startOfDay/endOfDay cobrem o dia civil de SP inteiro (24h, sem buraco)', () => {
  const startOfDay = requireInternal('startOfDay');
  const endOfDay = requireInternal('endOfDay');
  const meioDiaSP = new Date('2026-07-26T15:00:00.000Z'); // 12:00 em SP
  const start = startOfDay(meioDiaSP);
  const end = endOfDay(meioDiaSP);
  assert.equal(start.toISOString(), '2026-07-26T03:00:00.000Z');
  assert.equal(end.toISOString(), '2026-07-27T02:59:59.999Z');
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000 - 1);
});

test('isoWeekday: 26/07/2026 é DOMINGO (7) em SP mesmo lido de um instante UTC', () => {
  const isoWeekday = requireInternal('isoWeekday');
  assert.equal(isoWeekday(new Date('2026-07-26T15:00:00.000Z')), 7);
  // 26/07 01:00Z ainda é sábado (25/07) em São Paulo — dia da semana acompanha SP.
  assert.equal(isoWeekday(new Date('2026-07-26T01:00:00.000Z')), 6);
});

test('CONTRATO ANTI-REGRESSÃO: o scheduledAt materializado cai DENTRO da janela do prepare', () => {
  const parse = requireInternal('parseOperationalDate');
  // O que a Agenda grava em `scheduledAt` (materializeForRoute usa operationalDate):
  const materializado = parse('2026-07-26');
  // O que o /admin-route/prepare procura (dateRange, logistica-admin-route.service.ts):
  const start = new Date('2026-07-26T00:00:00-03:00');
  const end = new Date(new Date('2026-07-27T00:00:00-03:00').getTime() - 1);
  assert.ok(
    materializado >= start && materializado <= end,
    `parada materializada em ${materializado.toISOString()} tem que estar entre ` +
      `${start.toISOString()} e ${end.toISOString()} — fora disso o prepare devolve ` +
      '"Nenhuma parada foi encontrada" e cada clique duplica o lote (incidente 26/07)',
  );
});

/**
 * 2ª RODADA (26/07) — a primeira passada ancorou startOfDay/dateKey/isoWeekday em São
 * Paulo mas DEIXOU a aritmética de dias (`nextDateForWeekday`, `nextOccurrenceDate`,
 * `moveDateToWeekday`) andando com `setDate(getDate() + n)`, que são métodos do fuso do
 * PROCESSO. Sintoma: `logistica-agenda-resumo.service.test.ts` verde no Windows do dono
 * (-03) e VERMELHO com TZ=UTC — o fuso que vale em produção. Agora a conta passa por
 * `addDays` (instante + re-âncora no dia civil) e estes asserts travam isso.
 */
test('addDays anda no calendário de SÃO PAULO (meia-noite SP continua meia-noite SP)', () => {
  const addDays = requireInternal('addDays');
  const sabado = new Date('2026-08-01T00:00:00-03:00');
  assert.equal(addDays(sabado, 14).toISOString(), '2026-08-15T03:00:00.000Z');
  assert.equal(addDays(sabado, -14).toISOString(), '2026-07-18T03:00:00.000Z');
  // Entrada suja (instante qualquer do dia) é ancorada antes de somar.
  assert.equal(addDays(new Date('2026-08-01T20:37:00.000Z'), 1).toISOString(), '2026-08-02T03:00:00.000Z');
});

test('addDays não escorrega quando o fuso do PROCESSO tem horário de verão', () => {
  const addDays = requireInternal('addDays');
  // 01/03/2026 em SP + 14 dias = 15/03, sempre. Com `setDate` (que anda no calendário
  // do PROCESSO) e rodando num fuso que adianta o relógio dia 08/03, o instante perde
  // 1h e o resultado cai em 14/03 23:00 SP — o dia civil ERRADO, e o quinzenal some.
  // Este assert só tem dente quando o runner reexecuta o arquivo com HBX_TEST_TZ
  // apontando pra um fuso com horário de verão (ver scripts/test-agenda-fuso.mjs).
  assert.equal(
    addDays(new Date('2026-03-01T00:00:00-03:00'), 14).toISOString(),
    '2026-03-15T03:00:00.000Z',
    `dia civil errado rodando com TZ=${process.env.TZ}`,
  );
});

test('nextDateForWeekday: a partir de 26/07 22:00 SP (= 27/07 01:00Z) o sábado é 01/08', () => {
  const nextDateForWeekday = requireInternal('nextDateForWeekday');
  // Instante em que UTC já virou segunda (27/07) mas São Paulo ainda é domingo (26/07):
  // quem contar pelo fuso do processo pula uma semana ou erra o dia.
  const agora = new Date('2026-07-27T01:00:00.000Z');
  assert.equal(nextDateForWeekday(6, agora).toISOString(), '2026-08-01T03:00:00.000Z');
  assert.equal(nextDateForWeekday(7, agora).toISOString(), '2026-07-26T03:00:00.000Z', 'hoje em SP é o próprio domingo');
});

test('a cadência QUINZENAL fecha em 14 dias civis exatos (era o contador que mentia)', () => {
  const nextOccurrenceDate = requireInternal('nextOccurrenceDate');
  const plano = { frequencia: 'QUINZENAL', diaSemana: 6, intervaloDias: null };
  const proxima = nextOccurrenceDate(plano, new Date('2026-07-18T00:00:00-03:00'));
  assert.equal(proxima.toISOString(), '2026-08-01T03:00:00.000Z');
  assert.equal(
    (proxima.getTime() - new Date('2026-07-18T00:00:00-03:00').getTime()) / (24 * 60 * 60 * 1000),
    14,
    'quinzenal que não fecha 14 dias redondos some do resumo E da prévia',
  );
});

test('moveDateToWeekday nunca devolve o mesmo dia nem escorrega de dia civil', () => {
  const moveDateToWeekday = requireInternal('moveDateToWeekday');
  const sabado = new Date('2026-08-01T00:00:00-03:00');
  assert.equal(moveDateToWeekday(sabado, 6).toISOString(), '2026-08-08T03:00:00.000Z', 'mesmo dia ⇒ semana que vem');
  assert.equal(moveDateToWeekday(sabado, 2).toISOString(), '2026-08-04T03:00:00.000Z');
});

/**
 * As funções de data são privadas do módulo (não exportadas). Em vez de afrouxar a
 * API pública só para o teste, lê o módulo compilado e pega a função pelo escopo do
 * CommonJS — o mesmo arquivo `dist/` que roda em produção.
 */
function requireInternal(name: string): any {
  const mod = require('./logistica-agenda.service');
  if (typeof mod[name] === 'function') return mod[name];
  const internals = (mod as any).__fusoInternals;
  if (internals && typeof internals[name] === 'function') return internals[name];
  throw new Error(
    `Função "${name}" não está acessível para teste. Ela precisa continuar exportada ` +
      'em `__fusoInternals` (ver o fim de logistica-agenda.service.ts).',
  );
}

// Guarda de sanidade: o serviço continua carregável (o import acima não é dead code —
// um erro de wiring no módulo apareceria aqui antes dos asserts de data).
test('o módulo da Agenda carrega com TZ=UTC', () => {
  assert.equal(typeof service.materializeForRoute, 'function');
});
