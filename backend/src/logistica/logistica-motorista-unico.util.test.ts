import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnosticarMotoristaUnico } from './logistica-motorista-unico.util';

/**
 * VACINA da cena que o dono relatou em 29/07: ele indicou uma rota, a pessoa
 * aceitou e depois CANCELOU; a tela passou a responder "Atribua as entregas a
 * exatamente um motorista" pra TODO estado, e ele ficou — palavras dele —
 * "preso, sem enxergar o q falta fazer".
 *
 * Medido no banco de produção naquele momento (company 48): ZERO entregas
 * abertas (71 canceladas) e UM único motorista. Não havia nada pra atribuir.
 *
 * O que estes testes travam: cada estado de bloqueio tem que dizer O QUE ELE É.
 * Se alguém unificar as frases de novo, isto fica vermelho.
 */

function msg(r: ReturnType<typeof diagnosticarMotoristaUnico>): string {
  assert.equal(r.entregadorId, null, 'esperava bloqueio, veio motorista liberado');
  assert.ok(r.mensagem, 'bloqueio sem mensagem: a tela nao teria o que dizer');
  return r.mensagem as string;
}

function motivo(r: ReturnType<typeof diagnosticarMotoristaUnico>): string {
  assert.equal(r.entregadorId, null, 'esperava bloqueio, veio motorista liberado');
  return r.motivo as string;
}

test('dia VAZIO não fala de motorista — não há nada pra atribuir', () => {
  const r = diagnosticarMotoristaUnico([], undefined);
  assert.equal(motivo(r), 'dia_vazio');
  assert.match(msg(r), /nenhuma entrega aberta/i);
  assert.doesNotMatch(msg(r), /atribua/i);
});

test('seleção VELHA (o que sobra depois de um cancelar) manda ATUALIZAR, não atribuir', () => {
  // A tela pediu 3 paradas; só 1 continua aberta — 2 foram canceladas por baixo dela.
  const r = diagnosticarMotoristaUnico([{ id: 'a', entregadorId: 58 }], ['a', 'b', 'c']);
  assert.equal(motivo(r), 'selecao_desatualizada');
  assert.match(msg(r), /2 paradas desta tela não existem mais/i);
  assert.match(msg(r), /atualize a rota/i);
  assert.doesNotMatch(msg(r), /atribua/i);
});

test('seleção velha VENCE os outros diagnósticos (a contagem de baixo já está errada)', () => {
  const r = diagnosticarMotoristaUnico([{ id: 'a', entregadorId: null }], ['a', 'b']);
  assert.equal(motivo(r), 'selecao_desatualizada');
});

test('parada sem motorista diz QUANTAS são', () => {
  const r = diagnosticarMotoristaUnico([
    { id: 'a', entregadorId: 58 },
    { id: 'b', entregadorId: null },
    { id: 'c', entregadorId: null },
  ]);
  assert.equal(motivo(r), 'sem_motorista');
  assert.match(msg(r), /2 paradas sem motorista/i);
});

test('singular e plural não saem quebrados', () => {
  const um = diagnosticarMotoristaUnico([
    { id: 'a', entregadorId: 58 },
    { id: 'b', entregadorId: null },
  ]);
  assert.match(msg(um), /1 parada sem motorista/i);

  const umSumiu = diagnosticarMotoristaUnico([{ id: 'a', entregadorId: 58 }], ['a', 'b']);
  assert.match(msg(umSumiu), /1 parada desta tela não existe mais/i);
});

test('paradas divididas entre motoristas — o ÚNICO caso que a frase antiga descrevia', () => {
  const r = diagnosticarMotoristaUnico([
    { id: 'a', entregadorId: 58 },
    { id: 'b', entregadorId: 2 },
  ]);
  assert.equal(motivo(r), 'motoristas_divididos');
  assert.match(msg(r), /divididas entre 2 motoristas/i);
});

test('um motorista só devolve o id — a régua NÃO afrouxou', () => {
  const r = diagnosticarMotoristaUnico([
    { id: 'a', entregadorId: 58 },
    { id: 'b', entregadorId: 58 },
  ]);
  assert.equal(r.mensagem, null);
  assert.equal(r.entregadorId, 58);
});

test('seleção COMPLETA e coerente passa (nenhum id sumiu)', () => {
  const r = diagnosticarMotoristaUnico(
    [{ id: 'a', entregadorId: 7 }, { id: 'b', entregadorId: 7 }],
    ['a', 'b'],
  );
  assert.equal(r.mensagem, null);
  assert.equal(r.entregadorId, 7);
});

test('4 estados de bloqueio = 4 frases DIFERENTES (a doença era uma frase pra tudo)', () => {
  const frases = [
    diagnosticarMotoristaUnico([], undefined),
    diagnosticarMotoristaUnico([{ id: 'a', entregadorId: 1 }], ['a', 'b']),
    diagnosticarMotoristaUnico([{ id: 'a', entregadorId: null }]),
    diagnosticarMotoristaUnico([{ id: 'a', entregadorId: 1 }, { id: 'b', entregadorId: 2 }]),
  ].map((r) => r.mensagem ?? 'OK');
  assert.equal(new Set(frases).size, 4);
});
