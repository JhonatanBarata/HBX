import test from 'node:test';
import assert from 'node:assert/strict';

import { renderTemplateAviso, saudacaoPorHorario } from './logistica-config.service';

// LOGÍSTICA-MOBILE M5 — prova a RENDERIZAÇÃO PURA do template do aviso:
//   - todas as variáveis {saudacao} {cliente} {itens} {qtd} {produto} substituem;
//   - saudação segue o horário injetado (determinística);
//   - variável ausente vira "" e NÃO vaza "{placeholder}" cru;
//   - {chave} desconhecida é removida.

// Um horário fixo de manhã (10h local) p/ a saudação ser determinística no teste.
function manha(): Date {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return d;
}

test('renderTemplateAviso: substitui TODAS as variáveis', () => {
  const template = '{saudacao} {cliente}! Foram entregues {itens} (total {qtd}× de {produto}).';
  const out = renderTemplateAviso(template, {
    cliente: 'Dona Maria',
    itens: '2× Galão 20L, 1× Água com gás',
    qtd: 3,
    produto: 'Galão 20L',
    now: manha(),
  });
  assert.equal(out, 'Bom dia Dona Maria! Foram entregues 2× Galão 20L, 1× Água com gás (total 3× de Galão 20L).');
  // Nenhum placeholder cru sobrou.
  assert.ok(!/\{[a-z]+\}/i.test(out), 'não pode sobrar {placeholder} na mensagem');
});

test('renderTemplateAviso: saudação por horário (manhã/tarde/noite)', () => {
  const t = '{saudacao}, {cliente}';
  const m = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  assert.match(renderTemplateAviso(t, { cliente: 'X', now: m(8) }), /^Bom dia/);
  assert.match(renderTemplateAviso(t, { cliente: 'X', now: m(14) }), /^Boa tarde/);
  assert.match(renderTemplateAviso(t, { cliente: 'X', now: m(21) }), /^Boa noite/);
});

test('saudacaoPorHorario: fronteiras 5/12/18', () => {
  const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  assert.equal(saudacaoPorHorario(at(4)), 'Boa noite'); // madrugada
  assert.equal(saudacaoPorHorario(at(5)), 'Bom dia');
  assert.equal(saudacaoPorHorario(at(11)), 'Bom dia');
  assert.equal(saudacaoPorHorario(at(12)), 'Boa tarde');
  assert.equal(saudacaoPorHorario(at(17)), 'Boa tarde');
  assert.equal(saudacaoPorHorario(at(18)), 'Boa noite');
});

test('renderTemplateAviso: variável ausente vira "" (sem placeholder cru) e limpa espaço duplo', () => {
  const out = renderTemplateAviso('Olá {cliente}, entregamos {itens}.', { cliente: 'João', now: manha() });
  // {itens} ausente → "" e o espaço duplo antes do ponto é normalizado.
  assert.equal(out, 'Olá João, entregamos.');
});

test('renderTemplateAviso: {chave} desconhecida é removida', () => {
  const out = renderTemplateAviso('{saudacao} {foobar}fim', { now: manha() });
  assert.equal(out, 'Bom dia fim');
});

test('renderTemplateAviso: template vazio → string vazia (fallback é do N6)', () => {
  assert.equal(renderTemplateAviso('', { cliente: 'X', now: manha() }), '');
});
