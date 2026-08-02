import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaIndicadaService } from './logistica-rota-indicada.service';

/**
 * ROTA PRONTA (29/07) — indicação de rota salva pra equipe (popup Aceitar/Negar
 * no APK). A CENA que estes testes vigiam: web indica → app da pessoa vê a
 * pendente → Negar vira aviso "Rota X negada por Y" no web; Aceitar → aplicada.
 * Fail-closed: outra empresa/outra pessoa → 404, sempre.
 */

function buildPrisma(opts: { modelos?: any[]; users?: any[] } = {}) {
  const modelos = new Map<string, any>((opts.modelos ?? []).map((m) => [m.id, { ...m }]));
  const users = (opts.users ?? []).map((u) => ({ isActive: true, isSystemMaster: false, ...u }));
  const store = new Map<string, any>();
  let nextId = 1;

  const matches = (row: any, where: any = {}): boolean => {
    if (where.id != null && row.id !== String(where.id)) return false;
    if (where.companyId != null && row.companyId !== where.companyId) return false;
    if (where.rotaModeloId != null && row.rotaModeloId !== where.rotaModeloId) return false;
    if (where.paraUserId != null && row.paraUserId !== where.paraUserId) return false;
    if (where.status != null) {
      if (typeof where.status === 'string' && row.status !== where.status) return false;
      if (where.status.in && !where.status.in.includes(row.status)) return false;
    }
    if ('avisoVistoEm' in where && where.avisoVistoEm === null && row.avisoVistoEm != null) return false;
    return true;
  };
  const withInclude = (row: any, args: any) =>
    args?.include?.rotaModelo ? { ...row, rotaModelo: modelos.get(row.rotaModeloId) ?? null } : { ...row };

  const prisma: any = {
    logisticaRotaModelo: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const m = modelos.get(String(where.id ?? ''));
        if (!m || m.companyId !== where.companyId) return null;
        return { ...m };
      },
    },
    user: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const u = users.find((row) => row.id === where.id && row.companyId === where.companyId
          && row.isActive === where.isActive && row.isSystemMaster === where.isSystemMaster);
        return u ? { id: u.id } : null;
      },
      findMany: async (args: any) => {
        const where = args?.where || {};
        return users
          .filter((u) => (where.id?.in ?? []).includes(u.id) && u.companyId === where.companyId)
          .map((u) => ({ id: u.id, name: u.name ?? null, username: u.username ?? null, email: u.email ?? null }));
      },
    },
    logisticaRotaIndicada: {
      create: async (args: any) => {
        const id = `ind-${nextId++}`;
        const row = { id, status: 'pendente', respondidaEm: null, aplicadaEm: null, avisoVistoEm: null, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        store.set(id, row);
        return { ...row };
      },
      findFirst: async (args: any) => {
        const row = Array.from(store.values()).find((r) => matches(r, args?.where));
        return row ? withInclude(row, args) : null;
      },
      findMany: async (args: any) => Array.from(store.values()).filter((r) => matches(r, args?.where)).map((r) => withInclude(r, args)),
      update: async (args: any) => {
        const row = store.get(args.where.id);
        Object.assign(row, args.data, { updatedAt: new Date() });
        return withInclude(row, args);
      },
      updateMany: async (args: any) => {
        const alvo = Array.from(store.values()).filter((r) => matches(r, args?.where));
        alvo.forEach((r) => Object.assign(r, args.data, { updatedAt: new Date() }));
        return { count: alvo.length };
      },
    },
  };
  return { prisma, store };
}

const MODELO = { id: 'm1', companyId: 7, tipo: 'LIVRE', nome: 'Rota Centro', diaSemana: 3, paradasJson: [{ customerProfileId: 'c1' }, { customerProfileId: 'c2' }] };
const EQUIPE = [
  { id: 10, companyId: 7, name: 'Ana Admin' },
  { id: 20, companyId: 7, name: 'João Motorista' },
];

test('indicar: cria pendente com nome congelado e conta as paradas', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const dto = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(dto.status, 'pendente');
  assert.equal(dto.nome, 'Rota Centro');
  assert.equal(dto.paradas, 2);
  assert.equal(dto.diaSemana, 3);
});

test('indicar: modelo de outra empresa → 404; pessoa fora da empresa → 400', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  await assert.rejects(() => svc.indicar(99, 'm1', 20, 10), /não encontrada/);
  await assert.rejects(() => svc.indicar(7, 'm1', 555, 10), /Pessoa não encontrada/);
});

test('indicar de novo pra mesma pessoa: a pendente anterior morre cancelada (nunca 2 popups)', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const primeira = await svc.indicar(7, 'm1', 20, 10);
  const segunda = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(store.get(primeira.id)!.status, 'cancelada');
  assert.equal(store.get(segunda.id)!.status, 'pendente');
  const vivas = await svc.pendentes(7, 20);
  assert.equal(vivas.length, 1);
  assert.equal(vivas[0].id, segunda.id);
});

test('pendentes: só as MINHAS vivas, com quem indicou pelo nome', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  await svc.indicar(7, 'm1', 20, 10);
  assert.equal((await svc.pendentes(7, 10)).length, 0);
  const minhas = await svc.pendentes(7, 20);
  assert.equal(minhas.length, 1);
  assert.equal(minhas[0].porNome, 'Ana Admin');
});

test('responder Negar: vira negada com respondidaEm; o web lista pro aviso', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  const res = await svc.responder(7, ind.id, 20, false);
  assert.equal(res.status, 'negada');
  const lista = await svc.listar(7);
  assert.equal(lista[0].status, 'negada');
  assert.equal(lista[0].nome, 'Rota Centro');
  assert.equal(lista[0].paraNome, 'João Motorista');
  assert.equal(lista[0].avisoVisto, false);
});

test('responder: outra pessoa (ou repetido) → 404 fail-closed', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  await assert.rejects(() => svc.responder(7, ind.id, 10, true), /não encontrada/);
  await svc.responder(7, ind.id, 20, false);
  await assert.rejects(() => svc.responder(7, ind.id, 20, true), /não encontrada/);
});

test('Aceitar → aceita segue viva em pendentes; aplicada fecha o ciclo', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  await svc.responder(7, ind.id, 20, true);
  const vivas = await svc.pendentes(7, 20);
  assert.equal(vivas.length, 1);
  assert.equal(vivas[0].status, 'aceita');
  const done = await svc.aplicada(7, ind.id, 20);
  assert.equal(done.status, 'aplicada');
  assert.equal((await svc.pendentes(7, 20)).length, 0);
  await assert.rejects(() => svc.aplicada(7, ind.id, 20), /não encontrada/);
});

test('avisoVisto: dispensa a negada uma vez só; pendente não dispensa', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(await svc.avisoVisto(7, ind.id), false);
  await svc.responder(7, ind.id, 20, false);
  assert.equal(await svc.avisoVisto(7, ind.id), true);
  assert.equal(await svc.avisoVisto(7, ind.id), false);
  assert.equal((await svc.listar(7))[0].avisoVisto, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 🔴 VACINA PR29072026 — pergunta do dono (29/07): "esse painel está acompanhando
// se a pessoa cancelou? Se ela cancelou devolveu a rota para a pool?". Não
// acompanhava: a indicação ficava presa em 'aplicada' pra sempre e o web dizia
// que a rota estava de pé com um motorista que já tinha cancelado.
// ══════════════════════════════════════════════════════════════════════════════
test('desfazer: aceita e aplicada viram DESFEITA (a pessoa devolveu a rota)', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);

  const aceita = await svc.indicar(7, 'm1', 20, 10);
  await svc.responder(7, aceita.id, 20, true);
  assert.equal(store.get(aceita.id)!.status, 'aceita');

  const n = await svc.desfazerDoMotorista(7, 20);
  assert.equal(n, 1);
  assert.equal(store.get(aceita.id)!.status, 'desfeita');
  // Aviso re-armado: o banner do web tem que APARECER de novo pra quem indicou.
  assert.equal(store.get(aceita.id)!.avisoVistoEm, null);
});

test('desfazer NÃO come indicação PENDENTE (popup que a pessoa ainda não viu)', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);

  const pendente = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(store.get(pendente.id)!.status, 'pendente');

  const n = await svc.desfazerDoMotorista(7, 20);
  assert.equal(n, 0, 'pendente é recado novo: matar em silêncio seria pior que o bug');
  assert.equal(store.get(pendente.id)!.status, 'pendente');
});

test('desfazer é por PESSOA e por EMPRESA — não vaza pra quem não desistiu', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);

  const doJoao = await svc.indicar(7, 'm1', 20, 10);
  await svc.responder(7, doJoao.id, 20, true);
  const daAna = await svc.indicar(7, 'm1', 10, 20);
  await svc.responder(7, daAna.id, 10, true);

  await svc.desfazerDoMotorista(7, 20);

  assert.equal(store.get(doJoao.id)!.status, 'desfeita');
  assert.equal(store.get(daAna.id)!.status, 'aceita', 'a Ana não desistiu de nada');
  // Empresa errada não mexe em nada.
  assert.equal(await svc.desfazerDoMotorista(99, 10), 0);
  assert.equal(store.get(daAna.id)!.status, 'aceita');
});

test('desfazer: id de motorista inválido é no-op (nunca varredura geral)', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  assert.equal(await svc.desfazerDoMotorista(7, 0), 0);
  assert.equal(await svc.desfazerDoMotorista(7, -1), 0);
  assert.equal(await svc.desfazerDoMotorista(0, 20), 0);
});

test('aviso de DESFEITA pode ser dispensado no web (senão o banner fica pra sempre)', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);

  const ind = await svc.indicar(7, 'm1', 20, 10);
  await svc.responder(7, ind.id, 20, true);
  await svc.desfazerDoMotorista(7, 20);

  assert.equal(await svc.avisoVisto(7, ind.id), true);
  assert.ok(store.get(ind.id)!.avisoVistoEm, 'o × do banner tem que gravar o visto');
});

// ── AGENDADOR DE MISSÃO (02/08) ───────────────────────────────────────────────
//
// A CENA: o admin marca a rota das 16:00 e vai embora. Até as 16:00 o celular
// NÃO pode perguntar nada — ele fica com um despertador armado. Às 16:00 o
// alarme toca e aí sim existe popup pra aceitar.
//
// O bug que estes testes vacinam é o silencioso: se `pendentes()` devolvesse a
// missão marcada pra um APK que não sabe armar despertador, ele abriria o popup
// ÀS 11H — o agendamento viraria mentira e ninguém veria o erro.

const DAQUI_2H = () => new Date(Date.now() + 2 * 60 * 60_000).toISOString();

test('agendar: missão marcada NÃO aparece pro app antigo, aparece pro app que arma despertador', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const quando = DAQUI_2H();

  const dto = await svc.indicar(7, 'm1', 20, 10, quando);
  assert.equal(dto.agendadaPara, quando, 'a hora marcada volta pro web');

  // APK antigo (sem `agendadas`): silêncio — senão ele abria o popup adiantado.
  assert.equal((await svc.pendentes(7, 20)).length, 0);

  // APK novo: recebe a missão pra ARMAR o alarme.
  const comAgenda = await svc.pendentes(7, 20, true);
  assert.equal(comAgenda.length, 1);
  assert.equal(comAgenda[0].agendadaPara, quando);
  assert.equal(comAgenda[0].alarmeArmado, false, 'nasce sem carimbo — ninguém armou ainda');
});

test('agendar: chegada a hora, a missão vira popup normal MESMO no app antigo', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10, DAQUI_2H());

  // O relógio andou: a hora marcada ficou pra trás.
  store.get(ind.id)!.agendadaPara = new Date(Date.now() - 60_000);

  const vivas = await svc.pendentes(7, 20);
  assert.equal(vivas.length, 1, 'passou da hora = popup existe em qualquer versão do app');
});

test('sem hora, tudo como antes: missão imediata aparece nos dois modos', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const dto = await svc.indicar(7, 'm1', 20, 10);
  assert.equal(dto.agendadaPara, null);
  assert.equal((await svc.pendentes(7, 20)).length, 1);
  assert.equal((await svc.pendentes(7, 20, true)).length, 1);
});

test('hora podre não entra: passado, data inválida e ano errado são recusados com texto de gente', async () => {
  const { prisma } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);

  // Passado: o despertador nunca tocaria e o admin acharia que tocou.
  const ontem = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  await assert.rejects(() => svc.indicar(7, 'm1', 20, 10, ontem), /já passou/);

  // "99:99" corrompeu a agenda do disparo em 30/07 — aqui morre na porta.
  await assert.rejects(() => svc.indicar(7, 'm1', 20, 10, '2026-08-02T99:99'), /inválida/);
  await assert.rejects(() => svc.indicar(7, 'm1', 20, 10, 'amanhã cedo'), /inválida/);

  // Ano digitado errado agendaria pra 2027 EM SILÊNCIO.
  const longe = new Date(Date.now() + 400 * 24 * 60 * 60_000).toISOString();
  await assert.rejects(() => svc.indicar(7, 'm1', 20, 10, longe), /30 dias/);
});

test('carimbo do alarme: só a própria pessoa arma, e o web passa a saber', async () => {
  const { prisma, store } = buildPrisma({ modelos: [MODELO], users: EQUIPE });
  const svc = new LogisticaRotaIndicadaService(prisma);
  const ind = await svc.indicar(7, 'm1', 20, 10, DAQUI_2H());

  // Outra pessoa da empresa não carimba o alarme de ninguém.
  assert.deepEqual(await svc.marcarAlarmeArmado(7, ind.id, 10), { armado: false });
  // Outra empresa também não.
  assert.deepEqual(await svc.marcarAlarmeArmado(99, ind.id, 20), { armado: false });

  assert.deepEqual(await svc.marcarAlarmeArmado(7, ind.id, 20), { armado: true });
  assert.ok(store.get(ind.id)!.alarmeArmadoEm, 'sem este carimbo o web promete alarme que talvez não toque');
  assert.equal((await svc.pendentes(7, 20, true))[0].alarmeArmado, true);
});
