import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService, __fusoInternals } from './logistica-agenda.service';

/**
 * INCIDENTE 25/07 — "Sábado · 98 paradas" no menu, "Nenhum cliente nos dias
 * escolhidos" na lista. O contador do dia vinha de `route._count.paradas` (as
 * paradas do MODELO de rota, um número de catálogo sem data nenhuma) enquanto a
 * prévia daquele dia aplica `planOccursOn` na data real. Qualquer coisa que mexa
 * na cadência — plano pausado, quinzenal em semana de folga, dia já gerado (ou
 * gerado e limpo) — fazia os dois números divergirem, e quem mentia era o chip.
 *
 * A LEI que estes testes travam: o número do chip é o número da lista. Nada de
 * "quantos clientes esse dia tem no cadastro" — isso é `totalPlanos`.
 *
 * FUSO (26/07, 2ª rodada) — este arquivo passava no Windows do dono (-03) e FALHAVA
 * com TZ=UTC, que é o fuso REAL do container `hbx-backend` em produção. A culpa era
 * da fixture: ela montava `proximaData` com `new Date()` + `setHours(0,0,0,0)`, ou
 * seja meia-noite DO PROCESSO. Em UTC isso é 21:00 do dia civil ANTERIOR em São
 * Paulo, então um "sábado -14 dias" virava sexta e a cadência QUINZENAL dava 15 dias
 * de distância em vez de 14 — quinzenal na semana da vez contava 0.
 *
 * As duas travas que impedem a 3ª vez:
 *  1. RELÓGIO CONGELADO num instante escolhido a dedo (26/07 22:00 em SP = 27/07
 *     01:00Z): a data UTC e a data de São Paulo são DIAS DIFERENTES ali, e até o dia
 *     da SEMANA difere (domingo em SP, segunda em UTC). Se alguma conta da Agenda
 *     voltar a herdar o fuso do processo, o número muda e o assert quebra.
 *  2. Toda data da fixture é escrita como dia civil de SÃO PAULO explícito
 *     (`YYYY-MM-DDT00:00:00-03:00`), igual ao que a Agenda grava no banco — nunca
 *     derivada de `new Date()` local.
 * Consequência: o resultado é o MESMO em qualquer TZ. Ver `logistica-agenda-fuso.test.ts`.
 */

const SABADO = 6;

/** 26/07/2026 22:00 em São Paulo = 27/07 01:00Z — de propósito em dias/semanas diferentes. */
const AGORA = new Date('2026-07-27T01:00:00.000Z');

/** Meia-noite do dia civil de São Paulo — a mesma âncora que a Agenda grava. */
function spDate(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

// Hoje (civil SP) é domingo 26/07, então o sábado de referência do resumo — o que
// `nextDateForWeekday` escolhe — é 01/08. Tudo abaixo é contado a partir dele.
const SABADO_DE_REFERENCIA = '2026-08-01';

before(() => {
  mock.timers.enable({ apis: ['Date'], now: AGORA.getTime() });
});

after(() => {
  mock.timers.reset();
});

test('o relógio congelado é o do container, não o do dono (guarda da fixture)', () => {
  assert.equal(new Date().toISOString(), '2026-07-27T01:00:00.000Z');
  // O ponto do teste inteiro: neste instante, UTC e São Paulo discordam do dia E do
  // dia da semana. Qualquer conta que herde o fuso do processo cai fora.
  assert.equal(new Date().getUTCDay(), 1, 'em UTC é segunda-feira, 27/07');
  assert.equal(spDate('2026-07-26').getTime() < AGORA.getTime(), true, 'em SP ainda é domingo, 26/07');
  // E o sábado que o resumo vai consultar é o mesmo que a fixture abaixo assume —
  // a conta da regra e a conta do teste não podem divergir em fuso nenhum.
  assert.equal(
    __fusoInternals.nextDateForWeekday(SABADO, new Date()).toISOString(),
    spDate(SABADO_DE_REFERENCIA).toISOString(),
  );
});

function plano(overrides: Record<string, any> = {}) {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    customerProfileId: `c-${Math.random().toString(36).slice(2)}`,
    diaSemana: SABADO,
    ativo: true,
    proximaData: null,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    itens: [{ id: 'i1' }],
    ...overrides,
  };
}

function buildService(plans: any[], routes: any[] = []) {
  const prisma: any = {
    logisticaConfig: {
      // F1 (09/08) — sobrou `diasTrabalho`: a flag `agendaV2Ativa` não é mais lida.
      findUnique: async () => ({ diasTrabalho: null }),
    },
    logisticaPlanoEntrega: { findMany: async () => plans },
    logisticaRotaModelo: { findMany: async () => routes },
  };
  return new LogisticaAgendaService(prisma);
}

function sabado(resumo: any) {
  return resumo.dias.find((dia: any) => dia.diaSemana === SABADO);
}

test('resumo: plano semanal sem proximaData conta normal', async () => {
  const service = buildService([plano(), plano(), plano()]);
  const dia = sabado(await service.getSummary(7));
  assert.equal(dia.totalParadas, 3);
  assert.equal(dia.totalPlanos, 3);
  assert.equal(dia.totalClientes, 3);
});

test('resumo: dia JÁ GERADO (proximaData na semana seguinte) conta 0 — era a mentira do "98 paradas"', async () => {
  const proximaSemana = spDate('2026-08-08'); // sábado seguinte ao de referência (01/08)

  const service = buildService(
    [plano({ proximaData: proximaSemana }), plano({ proximaData: proximaSemana })],
    // O modelo de rota continua com as 2 paradas — era EXATAMENTE daqui que o
    // número inflado saía.
    [{ id: 'r-sab', nome: 'Rota de Sábado', diaSemana: SABADO, tipo: 'SEMANAL', ativo: true, versao: 1, _count: { paradas: 2 } }],
  );

  const dia = sabado(await service.getSummary(7));
  assert.equal(dia.totalParadas, 0, 'o chip tem que dizer o que a lista vai mostrar');
  assert.equal(dia.totalPlanos, 2, 'o número cru do cadastro continua disponível');
  assert.equal(dia.totalClientes, 0);
});

test('resumo: plano pausado não entra no contador (a prévia também não mostra)', async () => {
  const service = buildService([plano(), plano({ ativo: false })]);
  const dia = sabado(await service.getSummary(7));
  assert.equal(dia.totalParadas, 1);
  assert.equal(dia.totalPlanos, 2);
});

test('resumo: quinzenal em semana de folga conta 0; na semana da vez conta', async () => {
  // Sábado de referência = 01/08. 7 dias antes ⇒ o próximo é daqui a 7, não neste;
  // 14 dias antes ⇒ cai exatamente neste sábado. (Era AQUI que o fuso mordia: com
  // `setDate` no processo em UTC, o "-14" virava 17/07 em SP e dava 15 dias.)
  const folga = spDate('2026-07-25');
  const daVez = spDate('2026-07-18');

  const emFolga = buildService([plano({ frequencia: 'QUINZENAL', proximaData: folga })]);
  assert.equal(sabado(await emFolga.getSummary(7)).totalParadas, 0);

  const naVez = buildService([plano({ frequencia: 'QUINZENAL', proximaData: daVez })]);
  assert.equal(sabado(await naVez.getSummary(7)).totalParadas, 1);
});

test('resumo: contador do dia bate com o total de dias da semana (nenhum dia some)', async () => {
  const service = buildService([plano(), plano({ diaSemana: 1 })]);
  const resumo = await service.getSummary(7);
  assert.equal(resumo.dias.length, 7, 'os 7 dias continuam na resposta');
  assert.equal(resumo.dias.find((d: any) => d.diaSemana === 1).totalParadas, 1);
  assert.equal(sabado(resumo).totalParadas, 1);
});
