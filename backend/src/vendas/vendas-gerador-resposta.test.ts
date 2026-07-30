// VACINAS do gerador de resposta qualificada (30/07, 2º período). O contrato:
// prompt carrega catálogo+objetivo com as proibições; a validação recusa tudo
// que não pode virar mensagem real (preço sem âncora, {{...}}, "sou IA", texto
// gigante) — recusa = fallback nas frases fixas, nunca lead sem resposta.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCatalogo } from './vendas-catalogo';
import { calcularVeredicto, fichaVazia, preencherVaga, parseFichaPersistida, serializeFichaPersistida } from './vendas-qualificacao';
import { RESPOSTA_MAX_CHARS, montarPromptRespostaQualificada, validarRespostaGerada } from './vendas-gerador-resposta';

const catalogoFicticio = normalizeCatalogo({
  oQueVendemos: 'Sistema de agendamento para clínicas de pequeno porte',
  capacidades: [
    { chave: 'agenda', ganho: 'A recepção para de remarcar por telefone', resolve: ['telefone'] },
    { chave: 'lembrete', ganho: 'O paciente recebe lembrete e falta menos', resolve: ['falta'] },
  ],
  paraQuem: ['Clínicas que marcam em caderno'],
});

test('prompt: catálogo + objetivo do veredito + persona sem IA', () => {
  let ficha = fichaVazia();
  ficha = preencherVaga(ficha, 'dor_atual', 'anota falta no caderno');
  const veredicto = calcularVeredicto({ ficha });
  const prompt = montarPromptRespostaQualificada({
    catalogo: catalogoFicticio,
    ficha,
    veredicto,
    textoDoLead: 'como que funciona ?',
  });
  const system = prompt[0].content;
  assert.match(system, /Sistema de agendamento para clínicas/);
  assert.match(system, /É PROIBIDO citar produto, benefício ou preço que não esteja acima/);
  assert.match(system, /Objetivo desta mensagem: descobrir/);
  assert.match(system, /Nunca diga que é assistente, robô ou IA/);
  assert.match(prompt[1].content, /como que funciona \?/);
  assert.match(prompt[1].content, /dor_atual: anota falta no caderno/);
});

test('validação: recusa preço sem âncora, aceita com âncora', () => {
  const comPreco = 'Fica R$ 199 por mês e resolve tudo. Posso te ligar?';
  assert.equal(validarRespostaGerada(comPreco, { temAncoraDePreco: false }).ok, false);
  assert.equal(validarRespostaGerada(comPreco, { temAncoraDePreco: true }).ok, true);
});

test('validação: recusa {{placeholder}}, "sou uma IA" e texto gigante', () => {
  assert.equal(validarRespostaGerada('Oi {{cliente}}, tudo bem por aí com você?', { temAncoraDePreco: true }).ok, false);
  assert.equal(validarRespostaGerada('Sou uma IA e posso te ajudar com a rotina da clínica.', { temAncoraDePreco: true }).ok, false);
  assert.equal(validarRespostaGerada('x'.repeat(RESPOSTA_MAX_CHARS + 1), { temAncoraDePreco: true }).ok, false);
  assert.equal(validarRespostaGerada('', { temAncoraDePreco: true }).ok, false);
});

test('validação: tira embrulho ("Resposta:", aspas) e devolve o corpo limpo', () => {
  const r = validarRespostaGerada('Resposta: "Boa! Me conta quantos pacientes vocês atendem por dia?"', { temAncoraDePreco: false });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.body, 'Boa! Me conta quantos pacientes vocês atendem por dia?');
});

// ------------------------------------------------------- FICHA PERSISTIDA

test('ficha: roundtrip serialize→parse preserva vagas, aceite e última pergunta', () => {
  let ficha = fichaVazia();
  ficha = preencherVaga(ficha, 'volume', '40 entregas por dia');
  ficha = preencherVaga(ficha, 'aceite', 'pode ligar');
  const json = serializeFichaPersistida(ficha, 'dor_atual');
  const lida = parseFichaPersistida(json);
  assert.equal(lida.ficha.preenchidas.volume, '40 entregas por dia');
  assert.equal(lida.ficha.aceiteExplicito, true);
  assert.equal(lida.ultimaVagaPerguntada, 'dor_atual');
});

test('ficha: JSON podre, vaga inventada e vazio viram ficha vazia sem derrubar', () => {
  assert.deepEqual(parseFichaPersistida('{quebrado').ficha, fichaVazia());
  assert.equal(parseFichaPersistida(null).ultimaVagaPerguntada, null);
  const comVagaFalsa = parseFichaPersistida(JSON.stringify({ preenchidas: { hack: 'x' }, ultimaVagaPerguntada: 'nao_existe' }));
  assert.deepEqual(comVagaFalsa.ficha.preenchidas, {});
  assert.equal(comVagaFalsa.ultimaVagaPerguntada, null);
});

test('CENA completa: resposta entra na vaga perguntada e 3+aceite AQUECE', () => {
  // O laço real: bot perguntou 'volume' → lead respondeu → ficha evolui →
  // quando 3 vagas de conteúdo + aceite, o veredito aquece e o funil liga.
  let persistida = parseFichaPersistida(serializeFichaPersistida(fichaVazia(), 'volume'));
  let ficha = preencherVaga(persistida.ficha, persistida.ultimaVagaPerguntada!, '40 por dia');
  ficha = preencherVaga(ficha, 'dor_atual', 'caderno');
  ficha = preencherVaga(ficha, 'decisor', 'o dono');
  assert.equal(calcularVeredicto({ ficha }).estado, 'conduzindo');
  ficha = preencherVaga(ficha, 'aceite', 'pode ligar sim');
  const v = calcularVeredicto({ ficha });
  assert.equal(v.estado, 'aquecido');
  if (v.estado === 'aquecido') assert.match(v.resumo, /volume: 40 por dia/);
});
