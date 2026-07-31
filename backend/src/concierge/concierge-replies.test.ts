import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cancelReply,
  changeRequestReply,
  composeReply,
  confirmNudgeReply,
  looksLikeAffirmation,
  previewStuckReply,
  sanitizeVoiceText,
  topicReply,
} from './concierge-replies';

// A GUARDA DA VOZ é o que permite deixar a IA falar sem risco: ela pode ser
// simpática, nunca pode inventar número, preço, promessa ou dizer que já fez
// algo. Frase reprovada = resposta sai só com os fatos do código (igual antes).

test('sanitizeVoiceText: frase humana e curta passa', () => {
  assert.equal(sanitizeVoiceText('Consigo sim, sem problema.'), 'Consigo sim, sem problema.');
  assert.equal(sanitizeVoiceText('  "Boa pergunta!"  '), 'Boa pergunta!');
});

test('sanitizeVoiceText: qualquer NÚMERO derruba a frase (preço/quantidade/prazo são do servidor)', () => {
  assert.equal(sanitizeVoiceText('Te trago 50 empresas rapidinho.'), null);
  assert.equal(sanitizeVoiceText('Fica pronto em 2 minutos.'), null);
  assert.equal(sanitizeVoiceText('Sai por R$ 10.'), null);
});

test('sanitizeVoiceText: palavra de dinheiro e promessa são proibidas mesmo sem número', () => {
  assert.equal(sanitizeVoiceText('Hoje é de graça pra você.'), null);
  assert.equal(sanitizeVoiceText('Isso não custa nada.'), null);
  assert.equal(sanitizeVoiceText('Garanto que você fecha venda.'), null);
  assert.equal(sanitizeVoiceText('Te dou um desconto especial.'), null);
});

test('sanitizeVoiceText: a IA não pode alegar ação que só o clique executa', () => {
  assert.equal(sanitizeVoiceText('Já disparei a busca pra você.'), null);
  assert.equal(sanitizeVoiceText('Encontrei várias empresas boas.'), null);
  assert.equal(sanitizeVoiceText('Vou buscar agora mesmo.'), null);
});

test('sanitizeVoiceText: link, markup e redação longa não passam', () => {
  assert.equal(sanitizeVoiceText('Veja em https://exemplo.com'), null);
  assert.equal(sanitizeVoiceText('<b>Claro</b>'), null);
  assert.equal(sanitizeVoiceText('{"intent":"ok"}'), null);
  assert.equal(sanitizeVoiceText('a'.repeat(240)), null);
  assert.equal(sanitizeVoiceText('Primeira frase. Segunda frase. Terceira frase agora.'), null);
});

test('composeReply: abertura + fatos, sem duplicar; abertura repetida é descartada', () => {
  assert.equal(
    composeReply('Consigo sim', 'Busco em qualquer cidade do Brasil.'),
    'Consigo sim. Busco em qualquer cidade do Brasil.',
  );
  assert.equal(
    composeReply('Claro!', 'Para qual cidade?'),
    'Claro! Para qual cidade?',
  );
  // Redator papagaiando o texto oficial → fica só o oficial.
  assert.equal(composeReply('Para qual cidade?', 'Para qual cidade?'), 'Para qual cidade?');
  // Sem voz → resposta idêntica à de antes da entrega.
  assert.equal(composeReply(null, 'Para qual cidade?'), 'Para qual cidade?');
});

test('topicReply: LEI DO VENDEDOR — custo em crédito só existe para o dono', () => {
  const dono = topicReply('cost', { billingOwner: true });
  const vendedor = topicReply('cost', { billingOwner: false });
  assert.match(dono, /crédito/i);
  assert.doesNotMatch(vendedor, /crédito/i);
  assert.match(vendedor, /responsável/i);
});

test('topicReply: com resumo montado, toda resposta avisa que a busca continua de pé', () => {
  for (const topic of ['coverage', 'cost', 'data', 'timing', 'other'] as const) {
    const reply = topicReply(topic, { billingOwner: true }, { pendingPreview: true });
    assert.match(reply, /continua de pé/i, `tópico ${topic} não preservou o contexto`);
  }
});

test('topicReply: pergunta sobre cobertura responde o que o dono queria ouvir no print', () => {
  const reply = topicReply('coverage', { billingOwner: true });
  assert.match(reply, /qualquer cidade do Brasil/i);
  assert.match(reply, /cidade/i);
});

test('changeRequestReply: cada alvo pergunta a coisa CERTA, sem repetir o resumo', () => {
  assert.match(changeRequestReply('city'), /qual cidade/i);
  assert.match(changeRequestReply('state'), /Brasil/i);
  assert.match(changeRequestReply('segment'), /tipo de empresa/i);
  assert.match(changeRequestReply('quantity'), /quantas/i);
  assert.match(changeRequestReply('unknown'), /trocar|mudar/i);
  for (const target of ['city', 'state', 'segment', 'quantity', 'channels', 'unknown'] as const) {
    assert.ok(!/Vou buscar/.test(changeRequestReply(target)));
  }
});

test('looksLikeAffirmation: "sim/pode ser/manda ver" sim; frase de verdade não', () => {
  for (const yes of ['sim', 'Sim!', 'pode ser', 'manda ver', 'ok', 'blz', 'confirma', 'bora', 'isso aí']) {
    assert.equal(looksLikeAffirmation(yes), true, `deveria ser afirmação: ${yes}`);
  }
  for (const no of ['sim, mas quero em Santa Maria', 'não', 'quero 30 padarias', 'teria como pesquisar em outro estado?']) {
    assert.equal(looksLikeAffirmation(no), false, `não deveria ser afirmação: ${no}`);
  }
});

test('frases de saída existem e não repetem o resumo (o defeito do print)', () => {
  for (const reply of [previewStuckReply(), confirmNudgeReply(), cancelReply()]) {
    assert.ok(reply.length > 20);
    assert.ok(!/Vou buscar \d/.test(reply));
  }
  assert.match(confirmNudgeReply(), /Confirmar busca/);
});
