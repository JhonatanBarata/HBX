import test from 'node:test';
import assert from 'node:assert/strict';
import { quemMontouODia, rotaDeOutroMotoristaError, nomesMontadores } from './logistica-quem-montou.util';

/**
 * ROTA v2 F1b (10/08) — "JÁ MONTADA POR X".
 *
 * `quemMontouODia` é o fato cru que troca a mensagem enganosa "dia vazio" /
 * "não há entregas abertas" por "essa rota já foi montada por Fulano" quando
 * o dia na verdade JÁ tem dono (só não é quem está olhando a tela).
 */

const START = new Date(2026, 7, 10, 0, 0, 0, 0);
const END = new Date(2026, 7, 10, 23, 59, 59, 999);

function prismaDublê(entregas: any[], users: any[]) {
  const chamadas: any[] = [];
  const prisma: any = {
    entrega: {
      findMany: async (args: any) => { chamadas.push(args); return entregas; },
    },
    user: {
      findMany: async (args: any) => users.filter((u) => args.where.id.in.includes(u.id)),
    },
  };
  return { prisma, chamadas };
}

test('quemMontouODia: só entrega NÃO-cancelada conta (agendada/em_rota/entregue)', async () => {
  const { prisma } = prismaDublê(
    [
      { entregadorId: 9 },
      { entregadorId: 9 },
      { entregadorId: null }, // sem motorista — não conta
    ],
    [{ id: 9, name: 'Marquinhos', username: null, email: null }],
  );
  const montadores = await quemMontouODia(prisma, 7, START, END);
  assert.deepEqual(montadores, [{ userId: 9, nome: 'Marquinhos' }]);
});

test('quemMontouODia: mais de um motorista distinto — todos aparecem', async () => {
  const { prisma } = prismaDublê(
    [{ entregadorId: 9 }, { entregadorId: 11 }],
    [
      { id: 9, name: 'Marquinhos', username: null, email: null },
      { id: 11, name: null, username: 'jose11', email: null },
    ],
  );
  const montadores = await quemMontouODia(prisma, 7, START, END);
  assert.equal(montadores.length, 2);
  assert.ok(montadores.some((m) => m.nome === 'Marquinhos'));
  assert.ok(montadores.some((m) => m.nome === 'jose11'), 'sem name cai pro username');
});

test('quemMontouODia: dia sem NINGUÉM (tudo cancelado ou vazio) devolve lista vazia', async () => {
  const { prisma, chamadas } = prismaDublê([], []);
  const montadores = await quemMontouODia(prisma, 7, START, END);
  assert.deepEqual(montadores, []);
  assert.equal(chamadas[0].where.status.not, 'cancelada', 'a régua exclui só cancelada, nunca aberta/entregue');
});

test('quemMontouODia: empresa 0 nem consulta', async () => {
  const { prisma, chamadas } = prismaDublê([{ entregadorId: 9 }], [{ id: 9, name: 'X' }]);
  const montadores = await quemMontouODia(prisma, 0, START, END);
  assert.deepEqual(montadores, []);
  assert.equal(chamadas.length, 0);
});

test('nomesMontadores: junta os nomes com vírgula', () => {
  assert.equal(nomesMontadores([{ userId: 1, nome: 'A' }, { userId: 2, nome: 'B' }]), 'A, B');
  assert.equal(nomesMontadores([]), '');
});

test('rotaDeOutroMotoristaError: 409 com code/montadaPor/podeForcar do contrato do app', () => {
  const err = rotaDeOutroMotoristaError([{ userId: 1, nome: 'Marquinhos' }], true);
  const body: any = err.getResponse();
  assert.equal(err.getStatus(), 409);
  assert.equal(body.code, 'ROTA_DE_OUTRO_MOTORISTA');
  assert.equal(body.montadaPor, 'Marquinhos');
  assert.equal(body.podeForcar, true);
  assert.match(body.message, /Marquinhos/);
});

test('rotaDeOutroMotoristaError: podeForcar false pra quem não é admin', () => {
  const err = rotaDeOutroMotoristaError([{ userId: 1, nome: 'Marquinhos' }], false);
  const body: any = err.getResponse();
  assert.equal(body.podeForcar, false);
});
