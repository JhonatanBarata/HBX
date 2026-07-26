import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaAgendaService } from './logistica-agenda.service';

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
 */

const SABADO = 6;

function diaDaSemana(alvo: number, ref = new Date()): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const atual = d.getDay() || 7;
  d.setDate(d.getDate() + ((alvo - atual + 7) % 7));
  return d;
}

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
      findUnique: async () => ({ agendaV2Ativa: true, diasTrabalho: null }),
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
  const proximaSemana = diaDaSemana(SABADO);
  proximaSemana.setDate(proximaSemana.getDate() + 7);

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
  const esteSabado = diaDaSemana(SABADO);

  const folga = new Date(esteSabado);
  folga.setDate(folga.getDate() - 7); // 7 dias antes ⇒ o próximo é daqui a 7, não hoje
  const daVez = new Date(esteSabado);
  daVez.setDate(daVez.getDate() - 14); // 14 dias ⇒ cai exatamente neste sábado

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
