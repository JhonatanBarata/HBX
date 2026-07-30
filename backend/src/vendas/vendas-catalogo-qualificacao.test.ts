// VACINA do catálogo + qualificação (30/07/2026).
//
// Cada teste aqui nasceu de uma cena REAL do dia de vendedor em produção, não de
// hipótese. Se algum deles ficar verde por acidente, a cena volta.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LACUNA_SEM_CATALOGO,
  MAX_CAPACIDADES_POR_MENSAGEM,
  buildCatalogoPromptBlock,
  catalogoEstaPronto,
  escolherCapacidades,
  lacunasDoCatalogo,
  normalizeCatalogo,
} from './vendas-catalogo';
import {
  VAGAS_MINIMAS_PARA_AQUECER,
  buildObjetivoPromptBlock,
  calcularVeredicto,
  fichaVazia,
  preencherVaga,
  resumirFicha,
  vagasDeConteudoPreenchidas,
} from './vendas-qualificacao';

// Catálogo de MENTIRA, de um tenant fictício. De propósito NÃO é o produto do
// dono: se algum dia alguém cozinhar o negócio dele aqui, este arquivo deixa de
// provar que o catálogo é por tenant.
const catalogoFicticio = normalizeCatalogo({
  oQueVendemos: 'Sistema de agendamento para clínicas de pequeno porte',
  capacidades: [
    { chave: 'agenda', ganho: 'A recepção para de remarcar por telefone', resolve: ['telefone', 'remarcacao'] },
    { chave: 'lembrete', ganho: 'O paciente recebe lembrete e falta menos', resolve: ['falta', 'no-show'] },
    { chave: 'ficha', ganho: 'A ficha do paciente para de se perder', resolve: ['papel', 'ficha'] },
    { chave: 'caixa', ganho: 'Fechamento de caixa no fim do dia', resolve: ['caixa'] },
  ],
  paraQuem: ['Clínicas que ainda marcam em caderno'],
  ancoraDePreco: 'Uma recepcionista extra custa mais que o sistema inteiro',
});

// ---------------------------------------------------------------- CATÁLOGO

test('CENA "gestão fiscal": sem catálogo, a máquina é PROIBIDA de inventar oferta', () => {
  // 30/07: o Copiloto, sem saber o que a empresa vende, ofereceu "gestão fiscal"
  // para uma distribuidora de água. O dono vende logística e controle de frota.
  const bloco = buildCatalogoPromptBlock(null);
  assert.equal(bloco, LACUNA_SEM_CATALOGO);
  assert.match(bloco, /PROIBIDO/);
  assert.equal(catalogoEstaPronto(null), false);
  assert.equal(catalogoEstaPronto(normalizeCatalogo({ oQueVendemos: 'algo' })), false, 'frase sem capacidade NAO basta');
});

test('catálogo incompleto vira lacuna NOMEADA, para a tela cobrar do admin', () => {
  assert.deepEqual(lacunasDoCatalogo(normalizeCatalogo({})), [
    'Uma linha dizendo o que a empresa vende',
    'Pelo menos uma capacidade, na língua do cliente',
  ]);
  assert.deepEqual(lacunasDoCatalogo(catalogoFicticio), []);
});

test('o bloco de prompt cita no máximo 3 e fecha a porta para o resto', () => {
  const bloco = buildCatalogoPromptBlock(catalogoFicticio);
  const citadas = bloco.split('\n').filter((l) => l.startsWith('- '));
  assert.ok(citadas.length <= MAX_CAPACIDADES_POR_MENSAGEM, 'nunca despeja o catálogo inteiro');
  assert.equal(citadas.length, 3);
  assert.match(bloco, /É PROIBIDO citar produto, benefício ou preço que não esteja acima/);
  assert.match(bloco, /Sistema de agendamento para clínicas/);
});

test('a seleção segue a DOR do lead e é determinística (mesma entrada, mesma saída)', () => {
  const a = escolherCapacidades(catalogoFicticio, ['falta']);
  const b = escolherCapacidades(catalogoFicticio, ['falta']);
  assert.deepEqual(a.map((c) => c.chave), b.map((c) => c.chave), 'sorteio aqui faria o mesmo lead receber ofertas diferentes');
  assert.equal(a[0].chave, 'lembrete', 'a capacidade que resolve a dor citada vem primeiro');
});

test('entrada podre não derruba nem vira catálogo meia-boca', () => {
  const sujo = normalizeCatalogo({
    oQueVendemos: '   ',
    capacidades: [null, 42, { ganho: '   ' }, { chave: 'ok', ganho: '' }],
    paraQuem: 'não é lista',
  });
  assert.equal(sujo.oQueVendemos, '');
  assert.deepEqual(sujo.capacidades, [], 'sem ganho não existe capacidade — chave sozinha não diz nada ao lead');
  assert.deepEqual(sujo.paraQuem, []);
  assert.equal(catalogoEstaPronto(sujo), false);
});

test('a tela não pede "chave": ela nasce do ganho, sem acento e estável', () => {
  // A UI do catálogo (30/07) manda só { ganho, resolve } — jargão interno como
  // "chave" nunca aparece pro dono. Derivação precisa ser estável (mesma frase,
  // mesma chave) pra seleção determinística continuar valendo.
  const a = normalizeCatalogo({ oQueVendemos: 'x', capacidades: [{ ganho: 'Entrega no mesmo dia, sem atraso' }] });
  const b = normalizeCatalogo({ oQueVendemos: 'x', capacidades: [{ ganho: 'Entrega no mesmo dia, sem atraso' }] });
  assert.equal(a.capacidades[0].chave, 'entrega_no_mesmo_dia_sem_atraso');
  assert.equal(a.capacidades[0].chave, b.capacidades[0].chave);

  const acentuada = normalizeCatalogo({ oQueVendemos: 'x', capacidades: [{ ganho: 'Preço fecha rápido' }] });
  assert.equal(acentuada.capacidades[0].chave, 'preco_fecha_rapido', 'acento não vira "_" nem some a palavra');

  // Chave explícita (catálogo já salvo no banco) continua mandando.
  const explicita = normalizeCatalogo({ oQueVendemos: 'x', capacidades: [{ chave: 'minha_chave', ganho: 'Qualquer ganho' }] });
  assert.equal(explicita.capacidades[0].chave, 'minha_chave');
});

// ------------------------------------------------------------ QUALIFICAÇÃO

test('CENA "Posso te ligar?": não se pede a ligação antes de entender a operação', () => {
  // O roteiro fixo de hoje termina TODAS as 4 variantes pedindo ligação, na
  // primeira mensagem, sem saber nada do lead.
  const v = calcularVeredicto({ ficha: fichaVazia() });
  assert.equal(v.estado, 'conduzindo');
  if (v.estado !== 'conduzindo') return;
  assert.notEqual(v.proximaVaga, 'aceite', 'aceite só depois de ter conteúdo');
  assert.equal(v.faltam, VAGAS_MINIMAS_PARA_AQUECER);
});

test('aceite sozinho NÃO aquece — e conteúdo sozinho também não', () => {
  const soAceite = preencherVaga(fichaVazia(), 'aceite', 'pode ligar sim');
  assert.notEqual(calcularVeredicto({ ficha: soAceite }).estado, 'aquecido');

  let soConteudo = fichaVazia();
  soConteudo = preencherVaga(soConteudo, 'volume', '40 por dia');
  soConteudo = preencherVaga(soConteudo, 'dor_atual', 'caderno');
  soConteudo = preencherVaga(soConteudo, 'decisor', 'o dono');
  assert.equal(vagasDeConteudoPreenchidas(soConteudo), 3);
  assert.notEqual(calcularVeredicto({ ficha: soConteudo }).estado, 'aquecido');
});

test('CENA do lead de hoje: 3 vagas + aceite = AQUECIDO, e chega com resumo', () => {
  let ficha = fichaVazia();
  ficha = preencherVaga(ficha, 'volume', '40 entregas por dia');
  ficha = preencherVaga(ficha, 'dor_atual', 'anota em caderno');
  ficha = preencherVaga(ficha, 'decisor', 'o proprio dono');
  ficha = preencherVaga(ficha, 'aceite', 'pode ligar agora');

  const v = calcularVeredicto({ ficha });
  assert.equal(v.estado, 'aquecido');
  if (v.estado !== 'aquecido') return;
  assert.match(v.resumo, /volume: 40 entregas por dia/);
  assert.match(v.resumo, /decisor: o proprio dono/);
  assert.equal(resumirFicha(fichaVazia()), '', 'ficha vazia não inventa resumo');
});

test('"não quero" e "me remove" matam a conversa na hora, mesmo com ficha cheia', () => {
  let ficha = fichaVazia();
  ficha = preencherVaga(ficha, 'volume', '40');
  ficha = preencherVaga(ficha, 'dor_atual', 'caderno');
  ficha = preencherVaga(ficha, 'decisor', 'dono');
  ficha = preencherVaga(ficha, 'aceite', 'pode ligar');

  assert.equal(calcularVeredicto({ ficha, intencao: 'negative' }).estado, 'morto');
  assert.equal(calcularVeredicto({ ficha, intencao: 'opt_out' }).estado, 'morto');
});

test('silêncio esfria em vez de insistir para sempre', () => {
  const v = calcularVeredicto({ ficha: fichaVazia(), semRespostaHa: 9, limiteSilencioDias: 7 });
  assert.equal(v.estado, 'gelado');
  assert.equal(calcularVeredicto({ ficha: fichaVazia(), semRespostaHa: 2, limiteSilencioDias: 7 }).estado, 'conduzindo');
});

test('valor vazio não apaga o que já sabíamos do lead', () => {
  const cheia = preencherVaga(fichaVazia(), 'volume', '40 por dia');
  assert.equal(preencherVaga(cheia, 'volume', '   ').preenchidas.volume, '40 por dia');
});

test('o objetivo do prompt exige UMA pergunta e proíbe repetir', () => {
  const conduzindo = buildObjetivoPromptBlock({ estado: 'conduzindo', proximaVaga: 'volume', faltam: 3 });
  assert.match(conduzindo, /UMA pergunta/);
  assert.match(conduzindo, /Nunca duas/);
  assert.match(conduzindo, /Não repita/);

  const aquecido = buildObjetivoPromptBlock({ estado: 'aquecido', motivo: 'x', resumo: 'y' });
  assert.match(aquecido, /NÃO faça novas perguntas/);

  const morto = buildObjetivoPromptBlock({ estado: 'morto', motivo: 'x' });
  assert.match(morto, /NÃO insista/);
});
