import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMissingFields,
  extractSlotsDeterministic,
  isPlausibleName,
  mergeSlots,
  nextQuestion,
  normalizeNome,
  sanitizeRecepcionistaSlots,
  RECEPCIONISTA_SLOTS_VAZIOS,
} from './recepcionista-slots';

// ============================================================================
// RECEPCIONISTA IA — 31/07/2026.
// O teste que mais importa aqui e o PORTEIRO DO NOME: o fluxo antigo gravava
// como nome o que a pessoa digitasse, entao quem respondia "quero saber o
// preco" ficava cadastrado com esse nome. Nome errado e pior que nome
// faltando — vira a identidade do cliente e some da vista.
// ============================================================================

test('PORTEIRO DO NOME: pedido do cliente NUNCA vira nome cadastrado', async () => {
  // Cada um destes ja poderia ter virado "nome do cliente" no fluxo antigo.
  const pedidos = [
    'quero saber o preco',
    'queria um orcamento',
    'preciso de ajuda',
    'qual o valor da entrega?',
    'quanto custa',
    'voces entregam em campinas',
    'tem tabela de precos',
    'gostaria de agendar',
    'me manda o catalogo',
    'problema no meu pedido',
  ];
  for (const pedido of pedidos) {
    assert.equal(isPlausibleName(pedido), false, `deixou passar como nome: "${pedido}"`);
    assert.equal(normalizeNome(pedido), null, `normalizou como nome: "${pedido}"`);
  }
});

test('PORTEIRO DO NOME: saudacao, numero e frase longa tambem nao sao nome', async () => {
  for (const lixo of ['oi', 'bom dia', 'boa tarde', 'blz', 'tudo bem']) {
    assert.equal(isPlausibleName(lixo), false, `saudacao virou nome: "${lixo}"`);
  }
  assert.equal(isPlausibleName('19998877766'), false, 'telefone virou nome');
  assert.equal(isPlausibleName('meu cnpj e 12345678000199'), false, 'documento virou nome');
  assert.equal(
    isPlausibleName('entao eu queria falar sobre aquele assunto do mes passado'),
    false,
    'recado longo virou nome',
  );
  assert.equal(isPlausibleName(''), false);
  assert.equal(isPlausibleName('   '), false);
  assert.equal(isPlausibleName('???'), false);
});

test('PORTEIRO DO NOME: nome de gente de verdade PASSA (com e sem acento)', async () => {
  assert.equal(isPlausibleName('Jhonatan'), true);
  assert.equal(isPlausibleName('Maria Jose'), true);
  assert.equal(isPlausibleName('Joao da Silva'), true);
  assert.equal(isPlausibleName('Ana Lucia Ferreira'), true);
  // Acento nao pode derrubar (o normalizador usa NFD).
  assert.equal(isPlausibleName('Jos'.concat('é')), true);

  // E normaliza a caixa sem estragar as particulas.
  assert.equal(normalizeNome('jhonatan'), 'Jhonatan');
  assert.equal(normalizeNome('  maria   jose '), 'Maria Jose');
  assert.equal(normalizeNome('joao da silva'), 'Joao da Silva');
});

test('FRONTEIRA DA IA: JSON fora do schema nao vira cadastro', async () => {
  // Chave desconhecida descartada, enum invalido vira null, pedido barrado.
  const sujo = sanitizeRecepcionistaSlots({
    nome: 'quero saber o preco',
    empresa: 'Padaria Central',
    assunto: 'inventado_pela_ia',
    // tentativa de contrabandear campo que a recepcionista nao controla:
    desconto: '50%',
    botOff: true,
  });

  assert.equal(sujo.nome, null, 'o pedido passou pelo porteiro dentro do JSON da IA');
  assert.equal(sujo.assunto, null, 'enum fora da whitelist foi aceito');
  assert.equal(sujo.empresa, 'Padaria Central');
  assert.equal((sujo as Record<string, unknown>).desconto, undefined);
  assert.equal((sujo as Record<string, unknown>).botOff, undefined);

  // Lixo total nao explode.
  assert.deepEqual(sanitizeRecepcionistaSlots(null), RECEPCIONISTA_SLOTS_VAZIOS);
  assert.deepEqual(sanitizeRecepcionistaSlots('texto solto'), RECEPCIONISTA_SLOTS_VAZIOS);
  assert.deepEqual(sanitizeRecepcionistaSlots([1, 2, 3]), RECEPCIONISTA_SLOTS_VAZIOS);
});

test('FRONTEIRA DA IA: slot valido atravessa inteiro', async () => {
  const limpo = sanitizeRecepcionistaSlots({
    nome: 'jhonatan',
    empresa: 'HBX System',
    assunto: 'orcamento',
  });
  assert.deepEqual(limpo, { nome: 'Jhonatan', empresa: 'HBX System', assunto: 'orcamento' });
});

test('CHAO SEM IA: apresentacao comum e extraida sem modelo nenhum', async () => {
  // Este e o caminho que roda com a IA desligada/fora do ar.
  const caso1 = extractSlotsDeterministic('Oi, meu nome e Jhonatan, queria um orcamento');
  assert.equal(caso1.nome, 'Jhonatan');
  assert.equal(caso1.assunto, 'orcamento');

  const caso2 = extractSlotsDeterministic('aqui e a Maria da Padaria Central, quanto custa a entrega?');
  assert.equal(caso2.nome, 'Maria');
  assert.equal(caso2.empresa, 'Padaria Central');
  assert.equal(caso2.assunto, 'orcamento');

  const caso3 = extractSlotsDeterministic('sou o Carlos, meu equipamento parou de funcionar');
  assert.equal(caso3.nome, 'Carlos');
  assert.equal(caso3.assunto, 'suporte');

  const caso4 = extractSlotsDeterministic('me chamo Ana e queria agendar uma visita');
  assert.equal(caso4.nome, 'Ana');
  assert.equal(caso4.assunto, 'agendamento');
});

test('CHAO SEM IA: mensagem sem apresentacao nao inventa nome', async () => {
  const so_pedido = extractSlotsDeterministic('quanto custa o botijao?');
  assert.equal(so_pedido.nome, null, 'inventou nome onde nao havia');
  assert.equal(so_pedido.assunto, 'orcamento');

  const so_oi = extractSlotsDeterministic('bom dia');
  assert.deepEqual(so_oi, RECEPCIONISTA_SLOTS_VAZIOS);
});

test('O SERVIDOR decide o que falta, e a recepcionista pergunta no MAXIMO 2 vezes', async () => {
  const vazio = { ...RECEPCIONISTA_SLOTS_VAZIOS };
  assert.deepEqual(computeMissingFields(vazio), ['nome', 'assunto']);

  // 1a pergunta: quem e.
  const p1 = nextQuestion(vazio, 'Padaria Central');
  assert.equal(p1?.campo, 'nome');
  assert.match(String(p1?.texto), /Padaria Central/);

  // Cliente responde o nome -> 2a e ultima pergunta: o que precisa.
  const comNome = mergeSlots(vazio, { nome: 'Jhonatan', empresa: null, assunto: null });
  assert.deepEqual(computeMissingFields(comNome), ['assunto']);
  const p2 = nextQuestion(comNome, 'Padaria Central');
  assert.equal(p2?.campo, 'assunto');
  assert.match(String(p2?.texto), /Jhonatan/);

  // Com os dois slots cheios, a recepcionista CALA e entrega pro humano/menu.
  const completo = mergeSlots(comNome, { nome: null, empresa: null, assunto: 'orcamento' });
  assert.deepEqual(computeMissingFields(completo), []);
  assert.equal(nextQuestion(completo, 'Padaria Central'), null, 'passou de 2 perguntas — vira interrogatorio');
});

test('QUEM SE APRESENTA INTEIRO nao e perguntado nada (a promessa do dono)', async () => {
  // "o cliente entra em contato, se apresenta, ai o bot ja comeca o cadastro"
  const slots = extractSlotsDeterministic('Oi, aqui e o Jhonatan da Padaria Central, queria um orcamento de entrega');
  assert.equal(slots.nome, 'Jhonatan');
  assert.equal(slots.empresa, 'Padaria Central');
  assert.equal(slots.assunto, 'orcamento');
  assert.deepEqual(computeMissingFields(slots), [], 'ainda ia perguntar algo pra quem ja disse tudo');
  assert.equal(nextQuestion(slots, 'Padaria Central'), null);
});

test('mergeSlots nunca apaga o que ja foi confirmado', async () => {
  const atual = { nome: 'Jhonatan', empresa: 'HBX', assunto: null } as const;
  const novo = { nome: 'Outro', empresa: 'Outra', assunto: 'suporte' } as const;
  assert.deepEqual(mergeSlots({ ...atual }, { ...novo }), {
    nome: 'Jhonatan',
    empresa: 'HBX',
    assunto: 'suporte',
  });
});
