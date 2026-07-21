import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeAssistenteConfig,
  compileSystemPrompt,
  compileConditions,
  resolveVariaveis,
  sanitizeFluxo,
} from './assistente-flow';
import { getSeedFluxo, ASSISTENTE_TEMPLATES } from './assistente-seeds';

test('sanitizeFluxo dedup ids, dropa passos vazios e ancora entrada', () => {
  const fluxo = sanitizeFluxo({
    entradaPassoId: 'inexistente',
    passos: [
      { id: 'a', texto: 'Ola' },
      { id: 'a', texto: 'Segundo' }, // id colidido -> renomeado
      { id: 'vazio', texto: '   ' }, // dropado
    ],
    condicoes: [
      { id: 'c1', rotulo: 'Sim', exemplos: ['sim', '', 'quero'] },
      { id: 'semrotulo', rotulo: '' }, // dropada
    ],
  });
  assert.equal(fluxo.passos.length, 2);
  assert.notEqual(fluxo.passos[0].id, fluxo.passos[1].id);
  // entrada aponta pra um passo existente (fallback no primeiro)
  assert.ok(fluxo.passos.some((p) => p.id === fluxo.entradaPassoId));
  assert.equal(fluxo.condicoes.length, 1);
  assert.deepEqual(fluxo.condicoes[0].exemplos, ['sim', 'quero']);
});

test('compileSystemPrompt inclui persona, tom, negocio e few-shots', () => {
  const config = sanitizeAssistenteConfig({
    nome: 'Julia',
    tom: 'descontraido',
    perfil: 'vendas',
    produtos: 'ar-condicionado',
    empresaNome: 'Colsani',
    fluxo: {
      passos: [{ id: 'p1', texto: 'Ola, aqui e a [[Seu nome]] da [[nome da empresa]]!' }],
      condicoes: [
        { id: 'sim', rotulo: 'Interesse', comportamento: 'topou', exemplos: ['quero', 'sim'] },
      ],
    },
  });
  const prompt = compileSystemPrompt(config);
  assert.match(prompt, /Julia/);
  assert.match(prompt, /Colsani/);
  assert.match(prompt, /ar-condicionado/);
  assert.match(prompt, /DESCONTRAIDA/i);
  assert.match(prompt, /VENDAS/i);
  // variavel resolvida no roteiro (nao vaza [[Seu nome]])
  assert.match(prompt, /aqui e a Julia da Colsani/);
  // few-shot da condicao aparece
  assert.match(prompt, /"quero"/);
});

test('compileSystemPrompt: S05B inclui a guarda anti-injecao (mesma blindagem do Concierge)', () => {
  const config = sanitizeAssistenteConfig({
    nome: 'Julia',
    perfil: 'vendas',
    empresaNome: 'Colsani',
    fluxo: { passos: [{ id: 'p1', texto: 'Ola' }], condicoes: [] },
  });
  const prompt = compileSystemPrompt(config);
  // A guarda cita a tag que o sandbox usa para delimitar a fala do cliente
  // (assistente-sandbox.service.ts: wrapUntrustedUserText(text, {tag:'msg_cliente'})).
  assert.match(prompt, /<msg_cliente>/);
  assert.match(prompt, /DADO/);
  assert.match(prompt, /NUNCA instrução/);
});

test('resolveVariaveis troca [[empresa]]/[[nome]]/[[Seu nome]] e preserva desconhecidas', () => {
  const out = resolveVariaveis('[[Seu nome]] da [[nome da empresa]] falando com [[nome]] sobre [[xpto]]', {
    empresa: 'ACME',
    nome: 'Maria',
    assistente: 'Leo',
  });
  assert.equal(out, 'Leo da ACME falando com Maria sobre [[xpto]]');
});

test('compileConditions e drop-in dos few-shots do classificador', () => {
  const config = sanitizeAssistenteConfig({
    nome: 'Bot',
    perfil: 'suporte',
    fluxo: {
      passos: [{ id: 'p1', texto: 'oi' }],
      condicoes: [{ id: 'humano', rotulo: 'Humano', exemplos: ['atendente'], proximoPassoId: 'p1' }],
    },
  });
  const conds = compileConditions(config);
  assert.equal(conds.length, 1);
  assert.equal(conds[0].id, 'humano');
  assert.deepEqual(conds[0].exemplos, ['atendente']);
  assert.equal(conds[0].proximoPassoId, 'p1');
});

test('seeds: 2 perfis x 3 templates com densidade crescente de condicoes', () => {
  for (const perfil of ['vendas', 'suporte'] as const) {
    const agil = getSeedFluxo(perfil, 'agil');
    const flex = getSeedFluxo(perfil, 'flexivel');
    const avan = getSeedFluxo(perfil, 'avancado');
    assert.ok(agil.passos.length >= 1);
    assert.ok(agil.condicoes.length >= 1);
    // Flexivel tem mais condicoes que Agil; Avancado mais que Flexivel.
    assert.ok(flex.condicoes.length > agil.condicoes.length, `${perfil} flexivel > agil`);
    assert.ok(avan.condicoes.length > flex.condicoes.length, `${perfil} avancado > flexivel`);
    // Cada seed compila num prompt nao-vazio.
    const cfg = sanitizeAssistenteConfig({ nome: 'X', perfil, empresaNome: 'E', fluxo: avan });
    assert.ok(compileSystemPrompt(cfg).length > 50);
  }
  assert.deepEqual([...ASSISTENTE_TEMPLATES], ['agil', 'flexivel', 'avancado']);
});
