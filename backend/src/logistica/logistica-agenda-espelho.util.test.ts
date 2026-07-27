import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aplicarItemNoPlano,
  cadenciaDoVinculo,
  diasDoVinculo,
  escolherPlanoDoDia,
  EspelhoPlanoCandidato,
  EspelhoVinculoSnapshot,
  planejarEspelho,
  removerItemDoPlano,
} from './logistica-agenda-espelho.util';

// PONTE CADASTRO→AGENDA (26/07) — a parte PURA do espelho vínculo→plano.
// Lei nº1 (a mesma do matcher da sequência e do pino): dado ambíguo nunca
// vira verdade — 2+ candidatos = aviso, nem chuta nem cria duplicata.

function vinculo(over: Partial<EspelhoVinculoSnapshot> = {}): EspelhoVinculoSnapshot {
  return {
    id: 'v1',
    customerProfileId: 'c1',
    localId: null,
    productId: 10,
    qtdPadrao: 2,
    ativo: true,
    diasSemana: '3',
    frequenciaDias: null,
    proximaData: null,
    valorUnit: 12,
    ...over,
  };
}

function plano(over: Partial<EspelhoPlanoCandidato> = {}): EspelhoPlanoCandidato {
  return {
    id: 'p1',
    ativo: true,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    proximaData: null,
    itens: [{ productId: 10, qtd: 2, valorUnit: 12 }],
    ...over,
  };
}

// ── diasDoVinculo ───────────────────────────────────────────────────────────────

test('diasDoVinculo: semanal explícito vence; inativo/sem agenda = nenhum dia', () => {
  assert.deepEqual(diasDoVinculo(vinculo({ diasSemana: '5,1' })), [1, 5]);
  assert.deepEqual(diasDoVinculo(vinculo({ ativo: false })), []);
  assert.deepEqual(diasDoVinculo(vinculo({ diasSemana: null })), []);
  assert.deepEqual(diasDoVinculo(null), []);
});

test('diasDoVinculo: modo por-data usa o dia da semana da proximaData', () => {
  // 2026-07-27 é segunda (ISO 1).
  const d = new Date(2026, 6, 27);
  assert.deepEqual(diasDoVinculo(vinculo({ diasSemana: null, proximaData: d, frequenciaDias: 30 })), [1]);
});

test('diasDoVinculo: lixo no CSV é descartado, sem chute', () => {
  assert.deepEqual(diasDoVinculo(vinculo({ diasSemana: '0,3,9,x' })), [3]);
});

// ── cadenciaDoVinculo (espelho do legacyCadence do Organizar agora) ────────────

test('cadenciaDoVinculo: semanal explícito → SEMANAL; 14 dias → QUINZENAL', () => {
  assert.deepEqual(cadenciaDoVinculo(vinculo({ diasSemana: '2' })), {
    frequencia: 'SEMANAL', intervaloDias: null, proximaData: null,
  });
  const anchor = new Date(2026, 6, 27);
  const quinzenal = cadenciaDoVinculo(vinculo({ diasSemana: null, frequenciaDias: 14, proximaData: anchor }));
  assert.equal(quinzenal.frequencia, 'QUINZENAL');
  assert.equal(quinzenal.proximaData, anchor);
});

test('cadenciaDoVinculo: intervalo arredonda pra semanas completas (30 → 35)', () => {
  const c = cadenciaDoVinculo(vinculo({ diasSemana: null, frequenciaDias: 30, proximaData: new Date(2026, 6, 27) }));
  assert.equal(c.frequencia, 'INTERVALO');
  assert.equal(c.intervaloDias, 35);
});

// ── planejarEspelho (diff antes/depois) ─────────────────────────────────────────

test('planejarEspelho: criação = todos os dias entram', () => {
  const p = planejarEspelho(null, vinculo({ diasSemana: '1,4' }));
  assert.deepEqual(p, { adicionar: [1, 4], remover: [], manter: [] });
});

test('planejarEspelho: troca de dia move o item (sai da qua, entra na sex)', () => {
  const p = planejarEspelho(vinculo({ diasSemana: '3' }), vinculo({ diasSemana: '5' }));
  assert.deepEqual(p, { adicionar: [5], remover: [3], manter: [] });
});

test('planejarEspelho: mesmo dia mantido só atualiza (qtd/preço)', () => {
  const p = planejarEspelho(vinculo({ diasSemana: '3' }), vinculo({ diasSemana: '3', qtdPadrao: 5 }));
  assert.deepEqual(p, { adicionar: [], remover: [], manter: [3] });
});

test('planejarEspelho: pausar/excluir o vínculo tira o item de todos os dias', () => {
  assert.deepEqual(planejarEspelho(vinculo({ diasSemana: '1,3' }), vinculo({ diasSemana: '1,3', ativo: false })),
    { adicionar: [], remover: [1, 3], manter: [] });
  assert.deepEqual(planejarEspelho(vinculo({ diasSemana: '1,3' }), null),
    { adicionar: [], remover: [1, 3], manter: [] });
});

test('planejarEspelho: troca de CADÊNCIA no mesmo dia move o item (nunca duplica em 2 visitas)', () => {
  // Semanal na segunda → quinzenal ancorado numa segunda: mesmo dia ISO 1,
  // mas visita DIFERENTE — manter no plano semanal duplicaria o galão.
  const p = planejarEspelho(
    vinculo({ diasSemana: '1' }),
    vinculo({ diasSemana: null, frequenciaDias: 14, proximaData: new Date(2026, 6, 27) }),
  );
  assert.deepEqual(p, { adicionar: [1], remover: [1], manter: [] });
});

test('planejarEspelho: troca de LOCAL zera a interseção (plano é por cliente+local+dia)', () => {
  const p = planejarEspelho(
    vinculo({ diasSemana: '3', localId: null }),
    vinculo({ diasSemana: '3', localId: 'loja' }),
  );
  assert.deepEqual(p, { adicionar: [3], remover: [3], manter: [] });
});

// ── escolherPlanoDoDia (fail-closed) ────────────────────────────────────────────

test('escolherPlanoDoDia: sem candidato compatível → criar plano novo', () => {
  const escolha = escolherPlanoDoDia([], cadenciaDoVinculo(vinculo()));
  assert.equal(escolha.criar, true);
  assert.equal(escolha.plano, null);
  assert.equal(escolha.aviso, null);
});

test('escolherPlanoDoDia: 1 plano SEMANAL ativo casa; pausado é reativável quando é o único', () => {
  const ativo = plano({ id: 'pa' });
  assert.equal(escolherPlanoDoDia([ativo], cadenciaDoVinculo(vinculo())).plano, ativo);
  const pausado = plano({ id: 'pp', ativo: false });
  assert.equal(escolherPlanoDoDia([pausado], cadenciaDoVinculo(vinculo())).plano, pausado);
  // ativo vence o pausado quando os dois existem
  assert.equal(escolherPlanoDoDia([pausado, ativo], cadenciaDoVinculo(vinculo())).plano, ativo);
});

test('escolherPlanoDoDia: 2+ planos compatíveis = AMBÍGUO — nem casa nem cria (Lei nº1)', () => {
  const escolha = escolherPlanoDoDia([plano({ id: 'a' }), plano({ id: 'b' })], cadenciaDoVinculo(vinculo()));
  assert.equal(escolha.plano, null);
  assert.equal(escolha.criar, false);
  assert.match(String(escolha.aviso), /AMBIGUO/);
});

test('escolherPlanoDoDia: quinzenal com fase diferente NÃO mescla — cria plano próprio', () => {
  // Âncoras com 1 semana de diferença = paridades opostas.
  const cadencia = cadenciaDoVinculo(vinculo({ diasSemana: null, frequenciaDias: 14, proximaData: new Date(2026, 6, 27) }));
  const outraFase = plano({ frequencia: 'QUINZENAL', proximaData: new Date(2026, 7, 3) });
  const escolha = escolherPlanoDoDia([outraFase], cadencia);
  assert.equal(escolha.criar, true);
  const mesmaFase = plano({ frequencia: 'QUINZENAL', proximaData: new Date(2026, 6, 27) });
  assert.equal(escolherPlanoDoDia([mesmaFase], cadencia).plano, mesmaFase);
});

test('escolherPlanoDoDia: SEMANAL nunca mescla em plano QUINZENAL (cadência diferente = visita diferente)', () => {
  const quinzenal = plano({ frequencia: 'QUINZENAL', proximaData: new Date(2026, 6, 27) });
  const escolha = escolherPlanoDoDia([quinzenal], cadenciaDoVinculo(vinculo()));
  assert.equal(escolha.criar, true);
});

// ── aplicarItemNoPlano / removerItemDoPlano ─────────────────────────────────────

test('aplicarItemNoPlano: produto novo entra; existente atualiza qtd/valor; idêntico não escreve', () => {
  const base = [{ productId: 10, qtd: 2, valorUnit: 12 }];
  const add = aplicarItemNoPlano(base, { productId: 20, qtd: 1, valorUnit: 8 });
  assert.equal(add.itens?.length, 2);
  const upd = aplicarItemNoPlano(base, { productId: 10, qtd: 5, valorUnit: 12 });
  assert.deepEqual(upd.itens, [{ productId: 10, qtd: 5, valorUnit: 12 }]);
  const same = aplicarItemNoPlano(base, { productId: 10, qtd: 2, valorUnit: 12 });
  assert.equal(same.itens, null);
  assert.equal(same.aviso, null);
});

test('aplicarItemNoPlano: produto 2× na visita = AMBÍGUO, nada é alterado', () => {
  const dup = [
    { productId: 10, qtd: 1, valorUnit: 12 },
    { productId: 10, qtd: 3, valorUnit: 12 },
  ];
  const r = aplicarItemNoPlano(dup, { productId: 10, qtd: 5, valorUnit: 12 });
  assert.equal(r.itens, null);
  assert.match(String(r.aviso), /AMBIGUO/);
});

test('removerItemDoPlano: remove 1; último item sinaliza pausa (nunca delete); ausente = no-op', () => {
  const dois = [
    { productId: 10, qtd: 2, valorUnit: 12 },
    { productId: 20, qtd: 1, valorUnit: 8 },
  ];
  const r1 = removerItemDoPlano(dois, 10);
  assert.deepEqual(r1.itens, [{ productId: 20, qtd: 1, valorUnit: 8 }]);
  assert.equal(r1.esvaziou, false);

  const um = [{ productId: 10, qtd: 2, valorUnit: 12 }];
  const r2 = removerItemDoPlano(um, 10);
  assert.equal(r2.itens, null);
  assert.equal(r2.esvaziou, true);

  const r3 = removerItemDoPlano(um, 99);
  assert.equal(r3.itens, null);
  assert.equal(r3.esvaziou, false);
  assert.equal(r3.aviso, null);
});

test('removerItemDoPlano: produto 2× na visita = AMBÍGUO, nada é removido', () => {
  const dup = [
    { productId: 10, qtd: 1, valorUnit: 12 },
    { productId: 10, qtd: 3, valorUnit: 12 },
  ];
  const r = removerItemDoPlano(dup, 10);
  assert.equal(r.itens, null);
  assert.match(String(r.aviso), /AMBIGUO/);
});
