// ================================================================
// VACINA — TURNO NOTURNO 2 (31/07/2026)
//
// Bug medido em produção: agendar 10 disparos criava 10 inscrições que, no dia
// seguinte, mandavam o MESMO texto (o corpo fixo do passo da cadência). Dez
// mensagens idênticas = carimbo = dispositivo removido pela Meta (foi o que
// aconteceu em 30/07, 2 segundos depois do 3º disparo com copy quase igual).
//
// Cada teste aqui é aquele bug virado trava.
// ================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { jitterHumanoMinutos, reservarVarianteDeAbertura, JITTER_MAX_MINUTOS } from './vendas-copy-reserva';
import { normalizeColdText } from '../messaging/wa-cold-contact-gate.service';

const THRESHOLD = 0.85;
const MIN_LEN = 40;

const V1 = 'Aqui é o Jhonatan, da HBX. A gente ajuda distribuidora de água a receber o pedido do WhatsApp direto no sistema e mandar a rota do dia pro celular do entregador. Posso te mostrar rapidinho?';
const V2 = 'Bom dia! Trabalho com tecnologia para depósito de bebidas: controle de estoque, cobrança automática e relatório de fechamento do caixa. Vale uma conversa de cinco minutos?';
const V3 = 'Oi! Sou consultor de operação e ajudo comércio local a organizar a agenda da equipe, o financeiro e o atendimento num painel só. Faz sentido eu te explicar melhor?';

test('sem nada usado, reserva a primeira variante da ordem do dono', () => {
  const r = reservarVarianteDeAbertura({ variantes: [V1, V2, V3], usadasNorm: [], threshold: THRESHOLD, minLen: MIN_LEN });
  if (r.ok === false) assert.fail(`deveria reservar, recusou: ${r.motivo}`);
  assert.equal(r.variante, V1);
  assert.equal(r.similaridade, 0);
});

test('variante já usada não volta — a próxima reserva pega outra', () => {
  const r = reservarVarianteDeAbertura({
    variantes: [V1, V2, V3],
    usadasNorm: [normalizeColdText(V1)],
    threshold: THRESHOLD,
    minLen: MIN_LEN,
  });
  if (r.ok === false) assert.fail(`deveria reservar, recusou: ${r.motivo}`);
  assert.notEqual(r.variante, V1);
});

test('10 agendamentos com 3 textos: recusa no 4º em vez de repetir carimbo', () => {
  const variantes = [V1, V2, V3];
  const usadas: string[] = [];
  const reservadas: string[] = [];

  for (let i = 0; i < 3; i += 1) {
    const r = reservarVarianteDeAbertura({ variantes, usadasNorm: usadas, threshold: THRESHOLD, minLen: MIN_LEN });
    if (r.ok === false) assert.fail(`agendamento ${i + 1} deveria passar, recusou: ${r.motivo}`);
    reservadas.push(r.variante);
    usadas.push(normalizeColdText(r.variante));
  }

  // Os 3 disparos agendados levam textos DIFERENTES.
  assert.equal(new Set(reservadas).size, 3);

  // O 4º não tem texto novo: recusa ANTES de virar mensagem, com motivo legível.
  const quarto = reservarVarianteDeAbertura({ variantes, usadasNorm: usadas, threshold: THRESHOLD, minLen: MIN_LEN });
  if (quarto.ok !== false) assert.fail('o 4º agendamento deveria ser recusado — não há texto novo');
  assert.match(quarto.motivo, /variações/i);
  assert.match(quarto.motivo, /3 mensagem/);
});

test('texto curto não é carimbo — não bloqueia a reserva', () => {
  const curtas = ['Oi, tudo bem?', 'Bom dia!'];
  const r = reservarVarianteDeAbertura({
    variantes: curtas,
    usadasNorm: [normalizeColdText('Oi, tudo bem?')],
    threshold: THRESHOLD,
    minLen: MIN_LEN,
  });
  assert.ok(r.ok, 'texto curto não pode travar o agendamento');
});

test('sem variante configurada, devolve recusa própria (não estoura)', () => {
  const r = reservarVarianteDeAbertura({ variantes: [], usadasNorm: [], threshold: THRESHOLD, minLen: MIN_LEN });
  if (r.ok !== false) assert.fail('sem variante não pode dizer que reservou');
  assert.match(r.motivo, /Nenhuma mensagem/i);
});

test('escolhe a variante MAIS distante, não só a primeira que passa', () => {
  const quaseIgual = V1.replace('rapidinho', 'rapidamente');
  const r = reservarVarianteDeAbertura({
    variantes: [quaseIgual, V2],
    usadasNorm: [normalizeColdText(V1)],
    threshold: 0.99,
    minLen: MIN_LEN,
  });
  if (r.ok === false) assert.fail(`deveria reservar, recusou: ${r.motivo}`);
  assert.equal(r.variante, V2, 'a mais distante do que já saiu tem que ganhar');
});

test('jitter humano: determinístico, nunca negativo, nunca passa do teto', () => {
  const a = jitterHumanoMinutos('insc-1|2026-07-31T11:00:00.000Z');
  const b = jitterHumanoMinutos('insc-1|2026-07-31T11:00:00.000Z');
  assert.equal(a, b, 'mesma chave tem que dar o mesmo minuto (retomar runner não embaralha)');
  for (const chave of ['a', 'insc-2|x', 'zzz', '', 'insc-10|2026-08-01T11:15:00.000Z']) {
    const v = jitterHumanoMinutos(chave);
    assert.ok(v >= 0 && v <= JITTER_MAX_MINUTOS, `jitter fora da faixa: ${v}`);
  }
});

test('jitter com teto 0 é desligado (nada de minuto aleatório onde não se pediu)', () => {
  assert.equal(jitterHumanoMinutos('qualquer', 0), 0);
});
