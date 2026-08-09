import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lerParadasJson,
  listaAplicavel,
  planejarBackfillModelo,
  type ModeloParaBackfill,
} from './logistica-rota-modelo-backfill.util';

/**
 * 🔴 A PROVA DE EQUIVALÊNCIA DA F3 (09/08).
 *
 * A pergunta que este arquivo responde é UMA: **a rota salva do dono continua
 * sendo a mesma rota depois que o `paradasJson` morrer?** Aplicar um modelo é
 * ler a lista e mandar a ordem pro planejar — se a lista mudar de gente ou de
 * ORDEM, o motorista sai pra rua com outra rota e ninguém vê erro nenhum na
 * tela.
 *
 * Os fixtures reproduzem os DOIS formatos que existem em produção hoje:
 * - LIVRE, salvo pelo app/desktop: `{ customerProfileId, localId? }`;
 * - SEMANAL, escrito pelo espelho da Agenda: o mesmo + `horaRef`, `itens[]` e
 *   `planoEntregaId` (as chaves que a F3 enterra).
 * E os três casos medidos: 9 LIVRE só com JSON, 19 SEMANAL com as duas cópias,
 * e o `cms0xmqd0…` da empresa 41 com 9 no JSON × 7 na tabela.
 */

// ── Fixtures no formato REAL das duas famílias ──────────────────────────────

/** LIVRE — o que o APK e o route-builder gravam: cliente + porta, na ordem. */
function jsonLivre(pares: Array<[string, string | null]>): unknown {
  return pares.map(([customerProfileId, localId]) => ({
    customerProfileId,
    ...(localId ? { localId } : {}),
  }));
}

/** SEMANAL — o espelho que o `syncRouteMirror` escrevia, com todo o penduricalho. */
function jsonSemanal(pares: Array<[string, string | null]>): unknown {
  return pares.map(([customerProfileId, localId], index) => ({
    customerProfileId,
    ...(localId ? { localId } : {}),
    horaRef: `0${(index % 8) + 1}:30`,
    itens: [{ productId: 10 + index, qtd: 2, valorUnit: 7.5 }],
    planoEntregaId: `plano-${index + 1}`,
  }));
}

function linhas(pares: Array<[string, string | null]>) {
  return pares.map(([customerProfileId, localId]) => ({ customerProfileId, localId }));
}

function modelo(over: Partial<ModeloParaBackfill> = {}): ModeloParaBackfill {
  return {
    id: 'modelo-1',
    companyId: 41,
    nome: 'Rota de Segunda',
    tipo: 'LIVRE',
    paradasJson: [],
    paradasTabela: [],
    ...over,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. A PROVA: aplicar o modelo depois da migração devolve A MESMA LISTA
// ══════════════════════════════════════════════════════════════════════════════

test('LIVRE: a lista aplicável DEPOIS do backfill é byte a byte a de ANTES (mesma gente, mesma ordem)', () => {
  const pares: Array<[string, string | null]> = [
    ['cli-7', null],
    ['cli-2', 'porta-A'],
    ['cli-9', null],
    ['cli-2', 'porta-B'],
    ['cli-1', 'porta-C'],
  ];
  const antes = lerParadasJson(jsonLivre(pares)).paradas;

  const plano = planejarBackfillModelo(modelo({ paradasJson: jsonLivre(pares) }));
  const depois = listaAplicavel(plano.paradas);

  assert.equal(plano.acao, 'migrar');
  assert.deepEqual(depois, antes, 'a rota salva do dono não pode virar outra rota');
  // O MESMO cliente em 2 portas continua sendo 2 paradas — a porta é identidade.
  assert.equal(depois.length, 5);
  assert.deepEqual(depois.map((p) => p.customerProfileId), ['cli-7', 'cli-2', 'cli-9', 'cli-2', 'cli-1']);
  assert.deepEqual(plano.paradas.map((p) => p.ordem), [1, 2, 3, 4, 5], 'ordem 1..N sem buraco');
});

test('LIVRE: ORDEM invertida no JSON continua invertida depois — a sequência é o produto', () => {
  const pares: Array<[string, string | null]> = [['c', null], ['b', null], ['a', null]];
  const plano = planejarBackfillModelo(modelo({ paradasJson: jsonLivre(pares) }));
  assert.deepEqual(listaAplicavel(plano.paradas).map((p) => p.customerProfileId), ['c', 'b', 'a']);
});

test('SEMANAL: o penduricalho do espelho (horaRef/itens/planoEntregaId) não muda a lista de paradas', () => {
  const pares: Array<[string, string | null]> = [['cli-1', 'porta-1'], ['cli-2', null]];
  const doEspelho = lerParadasJson(jsonSemanal(pares)).paradas;
  assert.deepEqual(doEspelho, [
    { customerProfileId: 'cli-1', localId: 'porta-1' },
    { customerProfileId: 'cli-2', localId: null },
  ]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. QUEM VENCE — as duas regras, e a diferença que NUNCA some calada
// ══════════════════════════════════════════════════════════════════════════════

test('LIVRE com tabela vazia (os 9 medidos em prod): migra o JSON inteiro, sem reparo', () => {
  const plano = planejarBackfillModelo(modelo({
    paradasJson: jsonLivre([['a', null], ['b', 'porta']]),
    paradasTabela: [],
  }));
  assert.equal(plano.acao, 'migrar');
  assert.equal(plano.limparAntes, false);
  assert.deepEqual(plano.reparos, []);
  assert.equal(plano.totalJson, 2);
  assert.equal(plano.totalTabela, 0);
});

test('LIVRE com tabela DIFERENTE: o JSON vence, a tabela é reescrita e a sobra vira REPARO', () => {
  const plano = planejarBackfillModelo(modelo({
    paradasJson: jsonLivre([['a', null], ['b', null]]),
    paradasTabela: linhas([['a', null], ['z-perdido', null]]),
  }));
  assert.equal(plano.acao, 'json-vence');
  assert.equal(plano.limparAntes, true, 'a lista antiga sai inteira antes de gravar 1..N');
  assert.deepEqual(listaAplicavel(plano.paradas).map((p) => p.customerProfileId), ['a', 'b']);
  assert.equal(plano.reparos.length, 1);
  assert.equal(plano.reparos[0].customerProfileId, 'z-perdido');
  assert.match(plano.reparos[0].motivo, /estava só na tabela/i);
});

// 🔴 O CASO MEDIDO: modelo cms0xmqd00004h9po56ft9ui4, empresa 41 — 9 no JSON,
// 7 na tabela. SEMANAL ⇒ a tabela (que é a que a Agenda usa) vence, e os 2 que
// só existiam no JSON viram evento na ficha do cliente.
test('SEMANAL 9≠7: a TABELA vence, nada é reescrito, e os 2 que sobravam no JSON viram reparo', () => {
  const naTabela: Array<[string, string | null]> = [
    ['c1', null], ['c2', null], ['c3', null], ['c4', null], ['c5', null], ['c6', null], ['c7', null],
  ];
  const noJson: Array<[string, string | null]> = [...naTabela, ['c8-fantasma', null], ['c9-fantasma', 'porta-x']];

  const plano = planejarBackfillModelo(modelo({
    id: 'cms0xmqd00004h9po56ft9ui4',
    tipo: 'SEMANAL',
    paradasJson: jsonSemanal(noJson),
    paradasTabela: linhas(naTabela),
  }));

  assert.equal(plano.acao, 'tabela-vence');
  assert.equal(plano.totalJson, 9);
  assert.equal(plano.totalTabela, 7);
  assert.deepEqual(plano.paradas, [], 'SEMANAL não reescreve parada nenhuma');
  assert.equal(plano.limparAntes, false);
  assert.deepEqual(
    plano.reparos.map((r) => r.customerProfileId).sort(),
    ['c8-fantasma', 'c9-fantasma'],
    'a diferença descartada TEM que virar evento — nunca some calada',
  );
});

test('SEMANAL sem divergência: tabela vence e não gera reparo nenhum', () => {
  const pares: Array<[string, string | null]> = [['c1', null], ['c2', 'porta']];
  const plano = planejarBackfillModelo(modelo({
    tipo: 'SEMANAL',
    paradasJson: jsonSemanal(pares),
    paradasTabela: linhas(pares),
  }));
  assert.equal(plano.acao, 'tabela-vence');
  assert.deepEqual(plano.reparos, []);
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. IDEMPOTÊNCIA — rodar 2× não duplica
// ══════════════════════════════════════════════════════════════════════════════

test('rodar 2× é NO-OP: com a tabela já igual ao JSON, a ação é ja-migrado e nada é escrito', () => {
  const pares: Array<[string, string | null]> = [['a', null], ['b', 'porta']];
  const primeira = planejarBackfillModelo(modelo({ paradasJson: jsonLivre(pares), paradasTabela: [] }));
  assert.equal(primeira.acao, 'migrar');

  // O que a 1ª rodada gravou vira o estado da 2ª.
  const gravado = listaAplicavel(primeira.paradas).map((p) => ({
    customerProfileId: p.customerProfileId,
    localId: p.localId,
  }));
  const segunda = planejarBackfillModelo(modelo({ paradasJson: jsonLivre(pares), paradasTabela: gravado }));

  assert.equal(segunda.acao, 'ja-migrado');
  assert.deepEqual(segunda.paradas, []);
  assert.equal(segunda.limparAntes, false);
  assert.deepEqual(segunda.reparos, []);
});

test('mesma gente em ORDEM diferente NÃO é "já migrado" — a ordem é a rota', () => {
  const plano = planejarBackfillModelo(modelo({
    paradasJson: jsonLivre([['a', null], ['b', null]]),
    paradasTabela: linhas([['b', null], ['a', null]]),
  }));
  assert.equal(plano.acao, 'json-vence');
  assert.deepEqual(listaAplicavel(plano.paradas).map((p) => p.customerProfileId), ['a', 'b']);
  assert.deepEqual(plano.reparos, [], 'ninguém se perdeu: só a ordem estava trocada');
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. LIXO NO JSON — o backfill não pode "pular modelo" em silêncio
// ══════════════════════════════════════════════════════════════════════════════

test('entrada sem cliente é CONTADA em ignoradas — o relatório fala, não engole', () => {
  const bruto = [
    null,
    'string solta',
    { semCliente: true },
    { customerProfileId: '   ' },
    { customerProfileId: 'cli-bom', localId: 'porta' },
  ];
  const plano = planejarBackfillModelo(modelo({ paradasJson: bruto }));
  assert.equal(plano.ignoradas, 4);
  assert.equal(plano.totalJson, 1);
  assert.deepEqual(listaAplicavel(plano.paradas), [{ customerProfileId: 'cli-bom', localId: 'porta' }]);
});

test('paradasJson que não é lista (null/objeto/lixo) vira lista vazia sem quebrar', () => {
  for (const lixo of [null, undefined, 'x', 42, { a: 1 }]) {
    const plano = planejarBackfillModelo(modelo({ paradasJson: lixo }));
    assert.equal(plano.acao, 'vazio');
    assert.equal(plano.totalJson, 0);
  }
});

/* 🔴 JSON VAZIO NÃO É FONTE. "O JSON vence no LIVRE" existe pra TRAZER a lista
   que só ele tinha — nunca pra esvaziar rota do dono porque uma cópia morta
   estava em branco. Seria a faxina destruindo o que veio salvar. */
test('LIVRE sem JSON mas COM tabela: NÃO apaga nada (a tabela fica intacta)', () => {
  const plano = planejarBackfillModelo(modelo({
    paradasJson: [],
    paradasTabela: linhas([['a', null], ['b', 'porta']]),
  }));
  assert.equal(plano.acao, 'vazio');
  assert.equal(plano.limparAntes, false, 'nenhum DELETE sai daqui');
  assert.deepEqual(plano.paradas, []);
  assert.deepEqual(plano.reparos, []);
  assert.equal(plano.totalTabela, 2, 'o relatório mostra as 2 que continuam lá');
});
