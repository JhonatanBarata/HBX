import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaAvisoService } from './logistica-rota-aviso.service';

/**
 * 31/07 — "COMEÇOU E DESISTIU". A régua tem que ser AFIADA: alarme que dispara
 * por qualquer coisa é alarme que ninguém lê. Estes testes trancam as 4 bordas:
 * quem não saiu pra rua não vira recado, quem entregou tudo não vira recado,
 * quem saiu e não entregou nada vira 'abandonada', e o vigia só acusa silêncio
 * TOTAL — com o freio do @@unique impedindo o segundo aviso do mesmo dia.
 */

const COMPANY = 7;
const MOTORISTA = 42;
const DIA = '2026-07-31';

function dentroDoDia(hora: number): Date {
  const [ano, mes, dia] = DIA.split('-').map(Number);
  return new Date(ano, mes - 1, dia, hora, 0, 0, 0);
}

function buildPrisma(seed: { rotas?: any[]; entregas?: any[]; users?: any[]; modelos?: any[] } = {}) {
  const avisos: any[] = [];
  const prisma: any = {
    logisticaRoute: {
      findFirst: async ({ where }: any) => (seed.rotas ?? []).find(
        (r) => r.companyId === where.companyId && r.entregadorId === where.entregadorId && r.routeDate === where.routeDate,
      ) ?? null,
      findMany: async ({ where }: any) => (seed.rotas ?? []).filter((r) => (
        r.routeDate === where.routeDate
        && (where.status?.in ?? []).includes(r.status)
        && r.operationalEndedAt == null
        && r.startedAt != null
        && r.startedAt <= where.startedAt.lte
      )),
    },
    entrega: {
      findMany: async ({ where }: any) => (seed.entregas ?? []).filter(
        (e) => e.companyId === where.companyId && e.entregadorId === where.entregadorId,
      ),
    },
    user: {
      findFirst: async ({ where }: any) => (seed.users ?? []).find((u) => u.id === where.id && u.companyId === where.companyId) ?? null,
    },
    logisticaRotaModelo: {
      findFirst: async ({ where }: any) => (seed.modelos ?? []).find((m) => m.id === where.id && m.companyId === where.companyId) ?? null,
    },
    logisticaRotaAviso: {
      create: async ({ data }: any) => {
        const gemeo = avisos.find((a) => (
          a.companyId === data.companyId && a.motoristaUserId === data.motoristaUserId
          && a.routeDate === data.routeDate && a.tipo === data.tipo
        ));
        if (gemeo) { const erro: any = new Error('unique'); erro.code = 'P2002'; throw erro; }
        const row = { id: `aviso-${avisos.length + 1}`, vistoEm: null, createdAt: new Date(), ...data };
        avisos.push(row);
        return row;
      },
      findMany: async ({ where }: any) => avisos.filter((a) => a.companyId === where.companyId && (where.vistoEm === null ? a.vistoEm == null : true)),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const a of avisos) {
          if (a.companyId !== where.companyId || a.id !== where.id) continue;
          if (where.vistoEm === null && a.vistoEm != null) continue;
          Object.assign(a, data);
          count++;
        }
        return { count };
      },
    },
  };
  return { prisma, avisos, service: new LogisticaRotaAvisoService(prisma) };
}

const USERS = [{ id: MOTORISTA, companyId: COMPANY, name: 'João da Silva', username: 'joao' }];

test('registrarSaida: saiu pra rua e NÃO entregou nada → recado "abandonada" com nome e contagem', async () => {
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9), rotaModeloId: 'm1' },
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9), rotaModeloId: 'm1' },
    ],
    users: USERS,
    modelos: [{ id: 'm1', companyId: COMPANY, nome: 'Terça — Centro' }],
  });

  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), 'abandonada');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].motoristaNome, 'João da Silva');
  assert.equal(avisos[0].rotaNome, 'Terça — Centro', 'atribui à rota salva de origem');
  assert.equal(avisos[0].entregues, 0);
  assert.equal(avisos[0].abertas, 2);
});

test('registrarSaida: entregou parte e largou o resto → "parcial" (não é a mesma notícia)', async () => {
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'entregue', scheduledAt: dentroDoDia(9), rotaModeloId: null },
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9), rotaModeloId: null },
    ],
    users: USERS,
  });

  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), 'parcial');
  assert.equal(avisos[0].entregues, 1);
  assert.equal(avisos[0].abertas, 1);
});

test('registrarSaida: NÃO saiu pra rua (rota sem startedAt) → recado NENHUM', async () => {
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: null, status: 'PLANNED', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });

  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), null, 'desistir antes de sair é o fluxo normal');
  assert.equal(avisos.length, 0);
});

test('registrarSaida: entregou TUDO → recado nenhum (encerrar com sucesso não é notícia ruim)', async () => {
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'entregue', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });

  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), null);
  assert.equal(avisos.length, 0);
});

test('registrarSaida: 2 chamadas no mesmo dia → 1 recado só (o @@unique é o freio)', async () => {
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });

  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), 'abandonada');
  assert.equal(await service.registrarSaida(COMPANY, MOTORISTA, DIA), null, 'colisão P2002 é sucesso silencioso');
  assert.equal(avisos.length, 1);
});

test('vigia: rota viva iniciada há 2h com ZERO entregue → recado "parada" (o abandono silencioso)', async () => {
  const agora = dentroDoDia(11);
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(9), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'em_rota', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });

  assert.equal(await service.varrer(agora), 1);
  assert.equal(avisos[0].tipo, 'parada');
  // Segunda varredura no mesmo dia não duplica — o vigia roda a cada 10min.
  assert.equal(await service.varrer(agora), 0);
});

test('vigia: quem JÁ ENTREGOU alguma coisa não é acusado (está trabalhando, só devagar)', async () => {
  const agora = dentroDoDia(11);
  const { service, avisos } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(9), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'entregue', scheduledAt: dentroDoDia(9) },
      { companyId: COMPANY, entregadorId: MOTORISTA, status: 'em_rota', scheduledAt: dentroDoDia(9) },
    ],
    users: USERS,
  });

  assert.equal(await service.varrer(agora), 0);
  assert.equal(avisos.length, 0);
});

test('vigia: rota iniciada há 20min não é acusada (o silêncio precisa DURAR)', async () => {
  const { service } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(10), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });

  assert.equal(await service.varrer(new Date(dentroDoDia(10).getTime() + 20 * 60 * 1000)), 0);
});

test('listar/visto: o × do banner tira da tela e o recado não volta', async () => {
  const { service } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });
  await service.registrarSaida(COMPANY, MOTORISTA, DIA);

  const [aviso] = await service.listar(COMPANY);
  assert.equal(aviso.tipo, 'abandonada');
  assert.equal(await service.visto(COMPANY, aviso.id), true);
  assert.equal((await service.listar(COMPANY)).length, 0);
  assert.equal(await service.visto(COMPANY, aviso.id), false, 'dispensar 2× não é erro nem no-op mentiroso');
});

test('multi-tenant: recado de outra empresa não aparece nem é dispensável', async () => {
  const { service } = buildPrisma({
    rotas: [{ companyId: COMPANY, entregadorId: MOTORISTA, routeDate: DIA, startedAt: dentroDoDia(8), status: 'ACTIVE', operationalEndedAt: null }],
    entregas: [{ companyId: COMPANY, entregadorId: MOTORISTA, status: 'agendada', scheduledAt: dentroDoDia(9) }],
    users: USERS,
  });
  await service.registrarSaida(COMPANY, MOTORISTA, DIA);

  assert.deepEqual(await service.listar(999), []);
  const [aviso] = await service.listar(COMPANY);
  assert.equal(await service.visto(999, aviso.id), false);
});
