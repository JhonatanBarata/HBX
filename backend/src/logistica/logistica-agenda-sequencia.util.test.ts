import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchSequenciaImportada,
  parseParadasModeloJson,
  separarParadasDuplicadas,
  SequenciaMatchPlano,
} from './logistica-agenda-sequencia.util';

// S3-CONFERENCIA-DIVERGENCIA — buraco que a S2 deixou: o matcher que decide
// o que "casa" com o quê (import de sequência E, agora, divergência) nunca
// tinha teste unitário próprio. Lei nº1 (anti-erro-grave): dado ambíguo NUNCA
// vira verdade — o teste (3) é o mais crítico do plano.

function plano(id: string, customerProfileId: string, localId: string | null = null): SequenciaMatchPlano {
  return { id, customerProfileId, localId };
}

test('casamento exato por customerProfileId+localId (passe 1)', () => {
  const planos = [
    plano('plano-A', 'cliente-1', 'local-casa'),
    plano('plano-B', 'cliente-1', 'local-trabalho'),
  ];
  const paradas = [
    { customerProfileId: 'cliente-1', localId: 'local-trabalho' },
    { customerProfileId: 'cliente-1', localId: 'local-casa' },
  ];

  const resultado = matchSequenciaImportada(planos, paradas);

  assert.equal(resultado.ordem.length, 2);
  assert.deepEqual(resultado.ordem[0], { planoId: 'plano-B', posicao: 1 });
  assert.deepEqual(resultado.ordem[1], { planoId: 'plano-A', posicao: 2 });
  assert.equal(resultado.foraDaSequencia.length, 0);
  assert.equal(resultado.ambiguos.length, 0);
  assert.equal(resultado.semPlano.length, 0);
});

test('fallback por cliente único quando não há localId pra desempatar (passe 2)', () => {
  const planos = [plano('plano-A', 'cliente-1', null)];
  const paradas = [{ customerProfileId: 'cliente-1' }];

  const resultado = matchSequenciaImportada(planos, paradas);

  assert.deepEqual(resultado.ordem, [{ planoId: 'plano-A', posicao: 1 }]);
  assert.equal(resultado.foraDaSequencia.length, 0);
  assert.equal(resultado.ambiguos.length, 0);
  assert.equal(resultado.semPlano.length, 0);
});

test('LEI Nº1 — cliente com 2 planos no dia e parada sem localId NÃO casa, cai em ambíguos', () => {
  const planos = [
    plano('plano-A', 'cliente-1', 'local-casa'),
    plano('plano-B', 'cliente-1', 'local-trabalho'),
  ];
  // A parada do modelo não informa localId — não há como saber qual dos 2
  // endereços é este. Chutar um dos dois seria o mesmo erro do pino do GPS
  // (dado inventado virando verdade): tem que ficar de fora, visível.
  const paradas = [{ customerProfileId: 'cliente-1' }];

  const resultado = matchSequenciaImportada(planos, paradas);

  assert.equal(resultado.ordem.length, 0, 'nenhum dos 2 planos pode casar sozinho');
  assert.equal(resultado.foraDaSequencia.length, 0, 'ambíguo não é a mesma coisa que "fora da sequência"');
  assert.equal(resultado.ambiguos.length, 2);
  const planoIdsAmbiguos = resultado.ambiguos.map((item) => item.planoId).sort();
  assert.deepEqual(planoIdsAmbiguos, ['plano-A', 'plano-B']);
  for (const item of resultado.ambiguos) {
    assert.ok(item.motivo.length > 0, 'motivo tem que explicar a ambiguidade em linguagem de gente');
  }
});

test('invariante: ordem + foraDaSequencia + ambiguos cobre TODOS os planos, sem repetição', () => {
  const planos = [
    plano('plano-1', 'cliente-1', 'local-1'), // casa exato
    plano('plano-2', 'cliente-2'), // fica de fora (sem parada correspondente)
    plano('plano-3', 'cliente-3'), // ambíguo (par de plano-4)
    plano('plano-4', 'cliente-3'), // ambíguo (par de plano-3)
    plano('plano-5', 'cliente-5'), // casa por fallback (cliente único)
  ];
  const paradas = [
    { customerProfileId: 'cliente-1', localId: 'local-1' },
    { customerProfileId: 'cliente-3' }, // 2 planos do cliente-3, sem localId → ambos ambíguos
    { customerProfileId: 'cliente-5' },
  ];

  const resultado = matchSequenciaImportada(planos, paradas);

  const cobertos = [
    ...resultado.ordem.map((item) => item.planoId),
    ...resultado.foraDaSequencia,
    ...resultado.ambiguos.map((item) => item.planoId),
  ];
  assert.equal(cobertos.length, planos.length, 'cobertura tem que ter exatamente 1 entrada por plano');
  assert.deepEqual(cobertos.slice().sort(), planos.map((p) => p.id).sort(), 'sem faltar e sem repetir plano');
  // Confere que não há overlap entre os 3 grupos (nenhum planoId em 2 grupos).
  const vistos = new Set<string>();
  for (const id of cobertos) {
    assert.ok(!vistos.has(id), `planoId ${id} apareceu em mais de um grupo`);
    vistos.add(id);
  }
});

test('semPlano: parada do modelo cujo cliente não tem plano no dia', () => {
  const planos = [plano('plano-1', 'cliente-1', 'local-1')];
  const paradas = [
    { customerProfileId: 'cliente-1', localId: 'local-1' },
    { customerProfileId: 'cliente-99' }, // este cliente não tem plano nenhum hoje
  ];

  const resultado = matchSequenciaImportada(planos, paradas);

  assert.deepEqual(resultado.ordem, [{ planoId: 'plano-1', posicao: 1 }]);
  assert.equal(resultado.semPlano.length, 1);
  assert.equal(resultado.semPlano[0].customerProfileId, 'cliente-99');
  assert.equal(resultado.semPlano[0].localId, null);
});

test('parseParadasModeloJson: não-array vira lista vazia (sem erro)', () => {
  assert.deepEqual(parseParadasModeloJson(null), []);
  assert.deepEqual(parseParadasModeloJson(undefined), []);
  assert.deepEqual(parseParadasModeloJson('lixo'), []);
  assert.deepEqual(parseParadasModeloJson({ nao: 'e array' }), []);
  assert.deepEqual(parseParadasModeloJson(42), []);
});

test('parseParadasModeloJson: item null/lixo dentro do array é ignorado sem quebrar os válidos', () => {
  const bruto = [
    null,
    'string solta',
    42,
    { semCustomerProfileId: true },
    { customerProfileId: '' }, // vazio também não conta
    { customerProfileId: '  cliente-ok  ', localId: 'local-1' },
    { customerProfileId: 'cliente-sem-local' },
  ];

  const paradas = parseParadasModeloJson(bruto);

  assert.equal(paradas.length, 2);
  assert.deepEqual(paradas[0], { customerProfileId: 'cliente-ok', localId: 'local-1' });
  assert.deepEqual(paradas[1], { customerProfileId: 'cliente-sem-local', localId: null });
});

test('separarParadasDuplicadas: mesmo par customerProfileId+localId 2x — 1ª vai pra únicas, resto pra duplicadas', () => {
  const paradas = [
    { customerProfileId: 'cliente-1', localId: 'local-1' },
    { customerProfileId: 'cliente-2', localId: null },
    { customerProfileId: 'cliente-1', localId: 'local-1' }, // repetida
    { customerProfileId: 'cliente-1', localId: 'local-2' }, // mesmo cliente, local DIFERENTE — não é duplicata
  ];

  const { unicas, duplicadas } = separarParadasDuplicadas(paradas);

  assert.equal(unicas.length, 3);
  assert.equal(duplicadas.length, 1);
  assert.deepEqual(duplicadas[0], { customerProfileId: 'cliente-1', localId: 'local-1' });
});

test('separarParadasDuplicadas: sem repetição nenhuma, tudo vai pra únicas e duplicadas fica vazio', () => {
  const paradas = [
    { customerProfileId: 'cliente-1', localId: 'local-1' },
    { customerProfileId: 'cliente-2' },
  ];

  const { unicas, duplicadas } = separarParadasDuplicadas(paradas);

  assert.equal(unicas.length, 2);
  assert.equal(duplicadas.length, 0);
});
