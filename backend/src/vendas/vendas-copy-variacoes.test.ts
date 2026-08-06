// VACINAS das variações de copy por IA (item 3, 30/07). O contrato que estes
// testes seguram: a IA só PROPÕE; o lote passa pela MESMA régua do gate
// anti-carimbo; placeholders da frase-base são imutáveis.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VARIACAO_MAX_CHARS,
  VARIACOES_QUANTIDADE_MAX,
  extrairPlaceholders,
  montarPromptVariacoes,
  parseVariacoesResposta,
  reprovarPrimeiroContato,
  temConviteDePrimeiroContato,
  validarLoteVariacoes,
} from './vendas-copy-variacoes';

const BASE =
  '{{cumprimentacao}}, tudo bem? Me chamo {{funcionario}}, da {{empresa}}. Posso te explicar rapidinho o que a gente faz e ver se faz sentido aí?';

test('placeholders: extrai o conjunto {{...}} ordenado e ignora lixo', () => {
  assert.deepEqual(extrairPlaceholders(BASE), ['cumprimentacao', 'empresa', 'funcionario']);
  assert.deepEqual(extrairPlaceholders('sem marcador nenhum'), []);
  assert.deepEqual(extrairPlaceholders('{{ espacado }} e {{repetido}} de novo {{repetido}}'), ['espacado', 'repetido']);
});

test('prompt: exige os marcadores da base e proíbe inventar oferta', () => {
  const messages = montarPromptVariacoes(BASE, 4);
  const system = messages[0].content;
  // A garantia é a mesma desde 30/07 (a IA varia FORMA, nunca inventa oferta); o
  // texto do prompt mudou em 31/07 quando entrou a régua humana.
  assert.match(system, /inventar produto ou benefício que não esteja na frase original/);
  assert.match(system, /PROIBIDO: link, preço, prazo, promessa/);
  assert.match(system, /\{\{cumprimentacao\}\}, \{\{empresa\}\}, \{\{funcionario\}\}/);
  const semPlaceholder = montarPromptVariacoes('Frase simples sem marcador, tudo bem por aí?', 4);
  assert.match(semPlaceholder[0].content, /NÃO use marcadores/);
});

test('parse tolerante: JSON puro, JSON em markdown, bullets e podre', () => {
  assert.deepEqual(parseVariacoesResposta('["a primeira", "a segunda"]'), ['a primeira', 'a segunda']);
  assert.deepEqual(parseVariacoesResposta('Claro! Aqui:\n```json\n["x da silva"]\n```'), ['x da silva']);
  assert.deepEqual(parseVariacoesResposta('- opcao um da lista\n2) opcao dois da lista'), ['opcao um da lista', 'opcao dois da lista']);
  assert.deepEqual(parseVariacoesResposta(''), []);
  assert.deepEqual(parseVariacoesResposta('   '), []);
});

test('régua do gate: variação quase igual à base é RECUSADA com motivo legível', () => {
  // Mesmo truque do incidente real: trocar meia dúzia de palavras não passa.
  const quaseIgual = BASE.replace('Me chamo', 'Aqui é o').replace('rapidinho', 'bem rápido');
  const bemDiferente =
    '{{cumprimentacao}}! Sou {{funcionario}}, da {{empresa}}. Vi o trabalho de vocês e queria trocar uma ideia curta sobre a rotina — topa?';
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [quaseIgual, bemDiferente], 85);
  assert.deepEqual(aprovadas, [bemDiferente]);
  assert.equal(recusadas.length, 1);
  assert.match(recusadas[0].motivo, /igual à frase original/);
});

test('irmãs parecidas entre si: só a primeira entra', () => {
  const v1 = '{{cumprimentacao}}! Sou {{funcionario}}, da {{empresa}}. Vi o trabalho de vocês e queria trocar uma ideia curta sobre a rotina — topa?';
  const v2 = v1.replace('ideia curta', 'ideia rápida');
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [v1, v2], 85);
  assert.equal(aprovadas.length, 1);
  assert.match(recusadas[0].motivo, /outra variação do lote/);
});

test('placeholders imutáveis: perder ou inventar {{...}} recusa', () => {
  const perdeu = 'Bom dia, tudo bem? Sou da {{empresa}}. Posso te mostrar uma ideia nova sobre a rotina de vocês hoje?';
  const inventou = `${BASE} {{link_pagamento}}`;
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [perdeu, inventou], 85);
  assert.equal(aprovadas.length, 0);
  assert.equal(recusadas.length, 2);
  assert.match(recusadas[0].motivo, /marcadores/);
  assert.match(recusadas[1].motivo, /marcadores/);
});

test('curta demais e teto de quantidade', () => {
  const curta = 'oi, tudo bem?';
  const { recusadas } = validarLoteVariacoes(BASE, [curta], 85);
  assert.match(recusadas[0]?.motivo || '', /Curta demais/);

  // "posso te explicar" no fixture NÃO é enfeite: a BASE convida, então a régua do
  // convite fica ligada. Sem isso as 20 seriam recusadas por outro motivo e este
  // teste passaria com 0 aprovadas — verde, e sem medir mais o teto de quantidade.
  const muitas = Array.from({ length: 20 }, (_, i) =>
    `{{cumprimentacao}} numero ${'x'.repeat(i + 1)}, aqui fala {{funcionario}} da {{empresa}}, posso te explicar o assunto ${i} de hoje, completamente diferente ${'y'.repeat(20 - i)}`);
  const lote = validarLoteVariacoes(BASE, muitas, 999 /* régua frouxa: mede só o teto */, VARIACOES_QUANTIDADE_MAX);
  assert.equal(lote.aprovadas.length, VARIACOES_QUANTIDADE_MAX, `esperava encher o teto: ${JSON.stringify(lote.recusadas)}`);
});

// ── VACINA DA RÉGUA HUMANA (treino do dono, 31/07/2026) ──────────────────────
// "o disparo não pode ser grande, e tem q ser igual humano (...) não dê textão,
// é 1~2 linhas no máximo". Antes disto a IA não tinha teto nenhum: 400 caracteres
// de folheto passavam inteiros e iam pro disparo.

const BASE_HUMANA = 'Bom dia! Vocês montam a rota da entrega no papel ou já usam sistema?';

test('textão é recusado — primeiro contato é 1 a 2 linhas', () => {
  const textao =
    'Bom dia! Espero que esteja tudo bem com o senhor e com toda a sua equipe neste dia. ' +
    'Gostaria de me apresentar e apresentar também a nossa empresa, que atua há bastante tempo ' +
    'no mercado de tecnologia para distribuidoras, oferecendo um conjunto completo de recursos ' +
    'para gestão de entregas, rotas, faturamento e cobrança, tudo integrado num só lugar.';
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE_HUMANA, [textao], 85);
  assert.equal(aprovadas.length, 0);
  assert.match(recusadas[0].motivo, /Text[aã]o/);
});

test('link no primeiro contato é recusado (cara de spam, queima o número)', () => {
  const { aprovadas, recusadas } = validarLoteVariacoes(
    BASE_HUMANA,
    ['Oi! Da uma olhada aqui rapidinho, acho que encaixa: https://hbx.com/demo'],
    85,
  );
  assert.equal(aprovadas.length, 0);
  assert.match(recusadas[0].motivo, /link/i);
});

test('prova social inventada é recusada — a IA não sabe esse número', () => {
  const { aprovadas, recusadas } = validarLoteVariacoes(
    BASE_HUMANA,
    ['Oi! Ja ajudamos mais de 300 distribuidoras a organizar a entrega. Quer ver?'],
    85,
  );
  assert.equal(aprovadas.length, 0);
  assert.match(recusadas[0].motivo, /prova social/i);
});

test('voz de folheto é recusada', () => {
  const { aprovadas, recusadas } = validarLoteVariacoes(
    BASE_HUMANA,
    ['Prezado cliente, gostariamos de apresentar o nosso trabalho. Podemos conversar?'],
    85,
  );
  assert.equal(aprovadas.length, 0);
  assert.match(recusadas[0].motivo, /folheto/i);
});

test('mensagem humana curta PASSA — a régua não pode matar o que serve', () => {
  const humanas = [
    'Oi, tudo bem? O entregador de voces anota no papel e passa depois, e isso?',
    'Bom dia! E voce que cuida das entregas ai da distribuidora?',
  ];
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE_HUMANA, humanas, 85);
  assert.equal(aprovadas.length, 2, `recusou humana: ${JSON.stringify(recusadas)}`);
});

test('teto nunca é menor que a frase que a própria pessoa escreveu', () => {
  const baseLonga = 'Bom dia! '.padEnd(320, 'x');
  const variacaoDoMesmoTamanho = 'Boa tarde! '.padEnd(300, 'y');
  const { aprovadas } = validarLoteVariacoes(baseLonga, [variacaoDoMesmoTamanho], 85);
  assert.equal(aprovadas.length, 1, 'a régua não pode brigar com quem escreveu a frase-base');
});

// ── VACINA DA FASE DA MENSAGEM (ordem do dono, 06/08/2026) ───────────────────
// "vc está muito 'pra frente' nessas mensagens, esses pitch são segunda mensagem já,
// a primeira vc tem q despertar interesse". Os 6 textos abaixo são LITERALMENTE os
// que ele reprovou — passaram inteiros na régua de forma (tamanho ok, ganchos
// diferentes, sem link, sem preço) e mesmo assim eram a mensagem errada.
// Enquanto estes 6 forem recusados e o modelo dele passar, a régua está de pé.

const OS_SEIS_QUE_O_DONO_REPROVOU = [
  'Pedido de galão que chega no WhatsApp de vocês vai pro caderno ou já cai direto na rota do entregador?',
  'No fim do dia vocês conseguem ver rapidinho o que saiu e o que ficou pra entregar amanhã?',
  'Aí também tem cliente ligando pra perguntar cadê a água que não chegou?',
  'O entregador de vocês sai com a lista no papel ou no celular?',
  'Quem responde o WhatsApp de vocês é uma pessoa só ou reveza? Pergunto porque é onde costuma escapar pedido.',
  'Vocês conseguem ver quais clientes pararam de pedir esse mês?',
];

// Modelo literal do dono, já com a correção dele ("remova o grátis" + "É bem rápido").
const MODELO_DO_DONO =
  'Bom dia, estou selecionando distribuidoras de água, para fazer um teste usando meu sistema de controle logístico. Teria interesse de conhecer? É bem rápido';

test('interrogar a operação do lead é SEGUNDA mensagem — os 6 que o dono reprovou são recusados', () => {
  const { aprovadas, recusadas } = validarLoteVariacoes(MODELO_DO_DONO, OS_SEIS_QUE_O_DONO_REPROVOU, 85);
  assert.equal(aprovadas.length, 0, `passou pitch de 2ª mensagem: ${JSON.stringify(aprovadas)}`);
  assert.equal(recusadas.length, 6);
  for (const recusa of recusadas) {
    assert.match(recusa.motivo, /SEGUNDA mensagem/);
  }
});

test('o modelo do dono PASSA — a régua não pode matar o que ele mandou fazer', () => {
  const variacaoNoMolde =
    'Boa tarde! Estou escolhendo algumas distribuidoras pra conhecer meu sistema de rota num teste. Teria interesse de ver? Leva 1 minuto';
  const { aprovadas, recusadas } = validarLoteVariacoes(MODELO_DO_DONO, [variacaoNoMolde], 85);
  assert.equal(aprovadas.length, 1, `recusou o molde do dono: ${JSON.stringify(recusadas)}`);
});

test('convite só é cobrado quando a frase-base convida — régua não briga com quem escreveu', () => {
  // A pessoa escreveu uma base que já é pergunta de operação: a IA acompanha o
  // estilo dela. Cobrar o convite aqui mataria o botão pra quem escolheu outro jeito.
  const semConvite = validarLoteVariacoes(BASE_HUMANA, [OS_SEIS_QUE_O_DONO_REPROVOU[3]], 85);
  assert.equal(semConvite.aprovadas.length, 1, JSON.stringify(semConvite.recusadas));
  // Mas se a base CONVIDA, a variação não pode PERDER o convite pelo caminho.
  const comConvite = validarLoteVariacoes(MODELO_DO_DONO, [OS_SEIS_QUE_O_DONO_REPROVOU[3]], 85);
  assert.equal(comConvite.aprovadas.length, 0);
});

// ── VACINA DO PREÇO (o dono corrigiu o próprio modelo: "remova o grátis") ─────
// A regex existia no arquivo desde 06/08 e NUNCA tinha sido ligada no validador.

test('preço e "grátis" são recusados no primeiro contato — o barato do "sim" é o TEMPO', () => {
  const comPreco = [
    'Oi! Estou selecionando distribuidoras pra conhecer o sistema. É grátis, quer ver?',
    'Bom dia! Queria te mostrar o sistema num teste gratuito. Teria interesse?',
    'Boa tarde! Posso te apresentar a ferramenta? O teste não custa nada.',
    'Oi, tudo bem? Estou convidando algumas distribuidoras pra conhecer, de graça. Topa?',
    'Bom dia! Queria te mostrar o sistema, sai por R$ 99. Teria interesse de conhecer?',
    'Oi! Posso te explicar o sistema? Tenho um desconto pra quem entrar agora.',
  ];
  const { aprovadas, recusadas } = validarLoteVariacoes(MODELO_DO_DONO, comPreco, 85);
  assert.equal(aprovadas.length, 0, `passou preço no 1º contato: ${JSON.stringify(aprovadas)}`);
  assert.equal(recusadas.length, comPreco.length);
  for (const recusa of recusadas) {
    assert.match(recusa.motivo, /pre[çc]o|gr[áa]tis/i);
  }
});

test('a régua de conteúdo é uma função só — a mesma que o fiscal das copies de fábrica usa', () => {
  assert.equal(reprovarPrimeiroContato('Bom dia! Posso te mostrar o sistema num teste rápido? Leva 1 minuto'), null);
  assert.match(String(reprovarPrimeiroContato('Bom dia! Da uma olhada: https://hbx.com')), /link/i);
  assert.match(String(reprovarPrimeiroContato('Bom dia! Quer conhecer? O teste é gratuito')), /pre[çc]o|gr[áa]tis/i);
  assert.equal(temConviteDePrimeiroContato(MODELO_DO_DONO), true);
  assert.equal(temConviteDePrimeiroContato(OS_SEIS_QUE_O_DONO_REPROVOU[0]), false);
});

test('o prompt ENSINA a régua (tamanho, uma ideia, pergunta barata, sem link)', () => {
  const system = montarPromptVariacoes('Bom dia! {{cumprimentacao}} vocês entregam galão?', 3)
    .find(m => m.role === 'system')?.content || '';
  assert.match(system, new RegExp(String(VARIACAO_MAX_CHARS)));
  assert.match(system, /2 linhas/);
  assert.match(system, /UMA ideia/);
  assert.match(system, /pergunta f[aá]cil/i);
  assert.match(system, /PROIBIDO: link/);
  assert.match(system, /prova social/i);
  assert.match(system, /GANCHO/);
});

test('o prompt ENSINA a FASE certa — despertar interesse, não diagnosticar a operação', () => {
  // Este teste é a vacina do achado de 06/08: o prompt mandava "fale da ROTINA de
  // quem vai ler, não do seu produto" — que é a régua da SEGUNDA mensagem. A IA
  // obedecia e gerava, com nota máxima, exatamente o que o dono reprovou.
  const system = montarPromptVariacoes(MODELO_DO_DONO, 3).find((m) => m.role === 'system')?.content || '';
  assert.match(system, /DESPERTAR INTERESSE/);
  assert.match(system, /CONVIDAR/i);
  assert.match(system, /sim.{0,10}n[aã]o/i);
  assert.match(system, /TEMPO/);
  assert.match(system, /gr[áa]tis/i, 'o prompt tem que proibir a palavra "grátis" por nome');
  assert.match(system, /PERGUNTAR COMO FUNCIONA A OPERA[ÇC][ÃA]O/i);
  assert.match(system, /SEGUNDA mensagem/i);
  // E não pode voltar a ensinar a régua da 2ª como se fosse da 1ª.
  assert.doesNotMatch(system, /fale da ROTINA de quem vai ler/i);
});
