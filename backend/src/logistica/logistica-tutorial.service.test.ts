// TUTORIAL OBRIGATÓRIO (CONTRATO-TUTOR, 09/08/2026) — worker A (backend).
//
// O que este arquivo prova, e por que cada prova existe:
//  1) Usuário virgem (sem carimbo nenhum, ou onboardingStateJson vazio/null)
//     devolve `obrigatorioVistoEm: null` — o front decide "mostrar o obrigatório"
//     só quando isto é null.
//  2) POST carimba e o GET seguinte passa a devolver a MESMA data.
//  3) POST chamado de novo NÃO troca o carimbo — idempotência herdada do
//     `stampOnboardingEvent` (o primeiro a chegar fica), provada de forma
//     determinística: um carimbo antigo pré-existente sobrevive a uma nova
//     chamada mesmo com o relógio andando.
//  4) O carimbo é POR USUÁRIO: dois usuários da mesma empresa não compartilham
//     o "visto" um do outro.
//  5) JSON de onboarding quebrado/legado não derruba o GET — devolve null em
//     vez de estourar exceção (mesma tolerância do UsersService).
//
// Molde: logistica-config-prospector.test.ts (prisma fake em memória, node:test).
// Usa o UsersService DE VERDADE (não mock) sobre um prisma fake — a idempotência
// e a tolerância a JSON quebrado moram lá; o serviço da logística é só a fatia
// fina por cima (status/marcarVisto), então testar com o UsersService real é o
// que realmente garante o contrato ponta-a-ponta.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { UsersService } from '../users/users.service';
import { LogisticaTutorialService, EVENTO_TUTORIAL_OBRIGATORIO } from './logistica-tutorial.service';

/** Prisma fake em memória — só o suficiente pro que findById/getOnboardingEvents/
 * stampOnboardingEvent tocam (`prisma.user.findUnique` e `prisma.user.update`). */
function fakePrisma(usuarios: Record<number, any>) {
  return {
    user: {
      findUnique: async ({ where }: any) => {
        const u = usuarios[where.id];
        return u ? { ...u } : null;
      },
      update: async ({ where, data }: any) => {
        const atual = usuarios[where.id] || { id: where.id };
        usuarios[where.id] = { ...atual, ...data };
        return { ...usuarios[where.id] };
      },
    },
  };
}

function setup(usuarios: Record<number, any>) {
  const prisma: any = fakePrisma(usuarios);
  // WebwhatsBridgeService não é tocado por nenhum dos métodos usados aqui.
  const users = new UsersService(prisma, {} as any);
  return { service: new LogisticaTutorialService(users), usuarios };
}

// ── 1) USUÁRIO VIRGEM ────────────────────────────────────────────────────────
test('usuário virgem (onboardingStateJson null) devolve obrigatorioVistoEm: null', async () => {
  const { service } = setup({ 1: { id: 1, onboardingStateJson: null } });
  const status = await service.status(1);
  assert.deepEqual(status, { obrigatorioVistoEm: null });
});

test('usuário que não existe no banco também devolve null, sem estourar', async () => {
  const { service } = setup({});
  const status = await service.status(999);
  assert.deepEqual(status, { obrigatorioVistoEm: null });
});

// ── 2) POST CARIMBA, GET PASSA A DEVOLVER ────────────────────────────────────
test('POST carimba e o GET seguinte devolve a mesma data', async () => {
  const { service } = setup({ 1: { id: 1, onboardingStateJson: null } });

  const antes = await service.status(1);
  assert.equal(antes.obrigatorioVistoEm, null);

  const resposta = await service.marcarVisto(1);
  assert.equal(resposta.ok, true);
  assert.equal(typeof resposta.vistoEm, 'string');

  const depois = await service.status(1);
  assert.equal(depois.obrigatorioVistoEm, resposta.vistoEm);
});

// ── 3) IDEMPOTÊNCIA: o PRIMEIRO carimbo fica ─────────────────────────────────
test('POST duas vezes seguidas devolve o MESMO vistoEm', async () => {
  const { service } = setup({ 1: { id: 1, onboardingStateJson: null } });

  const primeira = await service.marcarVisto(1);
  const segunda = await service.marcarVisto(1);
  assert.equal(segunda.vistoEm, primeira.vistoEm);
  assert.equal(segunda.ok, true);
});

test('carimbo antigo pré-existente NÃO é trocado por um POST novo (prova determinística)', async () => {
  const CARIMBO_ANTIGO = '2020-01-01T00:00:00.000Z';
  const { service, usuarios } = setup({
    1: {
      id: 1,
      onboardingStateJson: JSON.stringify({ events: { [EVENTO_TUTORIAL_OBRIGATORIO]: CARIMBO_ANTIGO } }),
    },
  });

  const resposta = await service.marcarVisto(1);
  assert.equal(resposta.vistoEm, CARIMBO_ANTIGO, 'stampOnboardingEvent nunca sobrescreve carimbo já posto');

  const status = await service.status(1);
  assert.equal(status.obrigatorioVistoEm, CARIMBO_ANTIGO);

  // e o banco fake continua com o valor antigo, não foi reescrito.
  const salvo = JSON.parse(usuarios[1].onboardingStateJson);
  assert.equal(salvo.events[EVENTO_TUTORIAL_OBRIGATORIO], CARIMBO_ANTIGO);
});

// ── 4) O CARIMBO É POR USUÁRIO ───────────────────────────────────────────────
test('carimbo é por usuário — outro usuário da mesma empresa continua virgem', async () => {
  const { service } = setup({
    1: { id: 1, companyId: 7, onboardingStateJson: null },
    2: { id: 2, companyId: 7, onboardingStateJson: null },
  });

  await service.marcarVisto(1);

  const usuario1 = await service.status(1);
  const usuario2 = await service.status(2);
  assert.notEqual(usuario1.obrigatorioVistoEm, null);
  assert.equal(usuario2.obrigatorioVistoEm, null, 'usuário 2 não pode herdar o carimbo do usuário 1');
});

// ── 5) JSON QUEBRADO/LEGADO NÃO DERRUBA O GET ────────────────────────────────
test('onboardingStateJson quebrado (JSON inválido) devolve null em vez de estourar', async () => {
  const { service } = setup({ 1: { id: 1, onboardingStateJson: '{isso não é json' } });
  const status = await service.status(1);
  assert.deepEqual(status, { obrigatorioVistoEm: null });
});

test('onboardingStateJson legado (sem chave "events", ou "events" não-objeto) devolve null', async () => {
  const semEvents = setup({ 1: { id: 1, onboardingStateJson: JSON.stringify({ outraCoisa: true }) } });
  assert.deepEqual(await semEvents.service.status(1), { obrigatorioVistoEm: null });

  const eventsLixo = setup({ 1: { id: 1, onboardingStateJson: JSON.stringify({ events: 'não é objeto' }) } });
  assert.deepEqual(await eventsLixo.service.status(1), { obrigatorioVistoEm: null });
});

test('mesmo com onboarding quebrado, o POST ainda consegue carimbar por cima (recomeça o mapa)', async () => {
  const { service } = setup({ 1: { id: 1, onboardingStateJson: '{quebrado' } });
  const resposta = await service.marcarVisto(1);
  assert.equal(resposta.ok, true);
  assert.equal(typeof resposta.vistoEm, 'string');
  assert.equal((await service.status(1)).obrigatorioVistoEm, resposta.vistoEm);
});
