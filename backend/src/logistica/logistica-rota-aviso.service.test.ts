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

function buildPrisma(seed: {
  rotas?: any[]; entregas?: any[]; users?: any[]; modelos?: any[];
  sessoes?: any[]; configs?: any[]; pontos?: any[];
} = {}) {
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
        (e) => e.companyId === where.companyId && e.entregadorId === where.entregadorId
          // `contarDia` não filtra status no topo; `estaEmAlgumCliente` filtra —
          // e o dublê tem que respeitar isso, senão a parada JÁ ENTREGUE também
          // "seguraria" o motorista dentro de um cliente.
          && (!where.status?.in || where.status.in.includes(e.status)),
      ),
      // A pergunta do ATRASO. Devolve null por padrão: os testes que a exercitam
      // desligam a régua (atrasoMin: 0); sem este stub, o TypeError cairia no
      // catch por sessão e apagaria em silêncio a pergunta que o teste mede.
      findFirst: async () => null,
    },
    logisticaTrackingSession: {
      findMany: async () => seed.sessoes ?? [],
    },
    logisticaConfig: {
      findMany: async ({ where }: any) => (seed.configs ?? []).filter(
        (c) => (where.companyId?.in ?? []).includes(c.companyId),
      ),
    },
    logisticaTrackingPoint: {
      findMany: async ({ where }: any) => (seed.pontos ?? [])
        .filter((p) => p.sessionId === where.sessionId && p.capturedAt >= where.capturedAt.gte)
        .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()),
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

/**
 * 🔴 09/08 — A SENTINELA ACUSAVA QUEM ESTAVA NA PORTA CERTA.
 *
 * `estaEmAlgumCliente` lia só `customerProfile.lat/lng`. Medido na empresa 41:
 * 174 entregas dos últimos 14 dias têm pino no LOCAL e NENHUM no perfil — nessas,
 * o motorista parado exatamente na porta do cliente não era reconhecido "dentro
 * de cliente" e levava 'parado_demais'. Alarme falso é o que faz o dono parar de
 * ler o sino, que dá no mesmo que não ter vigia.
 */
const PORTA_DO_LOCAL = { lat: -22.4102, lng: -47.5602 };
const A_DOIS_KM = { lat: -22.4302, lng: -47.5602 };

/** Sessão viva, com sinal fresco, parada há 29 min no ponto `onde`. */
function cenarioParado(onde: { lat: number; lng: number }, agora: Date) {
  const ponto = (minAtras: number) => ({
    sessionId: 's1',
    capturedAt: new Date(agora.getTime() - minAtras * 60 * 1000),
    latitude: onde.lat,
    longitude: onde.lng,
  });
  return {
    sessoes: [{
      id: 's1',
      companyId: COMPANY,
      entregadorId: MOTORISTA,
      startedAt: dentroDoDia(8),
      lastPointAt: new Date(agora.getTime() - 60 * 1000),
      lastLatitude: onde.lat,
      lastLongitude: onde.lng,
    }],
    // atraso DESLIGADO: a pergunta deste teste é a do PARADO, e régua 0 é o jeito
    // que a própria sentinela oferece pra calar uma pergunta.
    configs: [{
      companyId: COMPANY, sentinelaSemSinalMin: 15, sentinelaParadoMin: 25,
      sentinelaAtrasoMin: 0, raioChegadaM: 60,
    }],
    pontos: [ponto(0), ponto(10), ponto(20), ponto(29)],
    users: USERS,
  };
}

/** Parada aberta com pino SÓ no LOCAL — o caso das 174 entregas da empresa 41. */
const PARADA_COM_PINO_NO_LOCAL = [
  { companyId: COMPANY, entregadorId: MOTORISTA, status: 'entregue', scheduledAt: dentroDoDia(9), local: null, customerProfile: { lat: null, lng: null } },
  {
    companyId: COMPANY, entregadorId: MOTORISTA, status: 'em_rota', scheduledAt: dentroDoDia(9),
    local: { lat: PORTA_DO_LOCAL.lat, lng: PORTA_DO_LOCAL.lng },
    customerProfile: { lat: null, lng: null },
  },
];

test('sentinela: parado NA porta do LOCAL (perfil sem pino) NÃO vira "parado_demais"', async () => {
  const agora = dentroDoDia(11);
  const { service, avisos } = buildPrisma({
    ...cenarioParado(PORTA_DO_LOCAL, agora),
    entregas: PARADA_COM_PINO_NO_LOCAL,
  });

  assert.equal(await service.varrer(agora), 0);
  assert.deepEqual(avisos, [], 'descarregar galão demora — parado dentro do cliente é trabalho');
});

test('sentinela: parado a 2 km da porta ainda vira "parado_demais" (o alarme não morreu)', async () => {
  const agora = dentroDoDia(11);
  const { service, avisos } = buildPrisma({
    ...cenarioParado(A_DOIS_KM, agora),
    entregas: PARADA_COM_PINO_NO_LOCAL,
  });

  assert.equal(await service.varrer(agora), 1);
  assert.equal(avisos[0].tipo, 'parado_demais');
  assert.match(avisos[0].detalhe, /min parado fora de cliente/);
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
