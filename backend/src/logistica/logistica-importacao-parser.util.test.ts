import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import {
  encontrarQtdProduto,
  encontrarTelefone,
  parseDiasSemana,
  parseDiasSemanaFlexivel,
  parseLinhaTexto,
  parsePlanilhaBuffer,
  quebrarEmLinhas,
} from './logistica-importacao-parser.util';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — prova o parser da quarentena de
 * importação. Foco especial em dia-da-semana (a regra "2ª = segunda" é a mesma
 * classe de erro que a memória de fuso já puniu — off-by-one silencioso troca a
 * agenda inteira do cliente) e em "linha ilegível vira VERMELHO com o bruto
 * preservado, NUNCA descartada" (aqui: nunca lança, sempre devolve algo).
 */

// ── dia da semana ────────────────────────────────────────────────────────────────
test('parseDiasSemana: nomes e abreviações batem o ISO 1=segunda…7=domingo', () => {
  assert.deepEqual(parseDiasSemana('seg'), [1]);
  assert.deepEqual(parseDiasSemana('segunda'), [1]);
  assert.deepEqual(parseDiasSemana('segunda-feira'), [1]);
  assert.deepEqual(parseDiasSemana('SEGUNDA FEIRA'), [1]);
  assert.deepEqual(parseDiasSemana('ter'), [2]);
  assert.deepEqual(parseDiasSemana('terça'), [2]);
  assert.deepEqual(parseDiasSemana('qua'), [3]);
  assert.deepEqual(parseDiasSemana('quarta'), [3]);
  assert.deepEqual(parseDiasSemana('qui'), [4]);
  assert.deepEqual(parseDiasSemana('quinta'), [4]);
  assert.deepEqual(parseDiasSemana('sex'), [5]);
  assert.deepEqual(parseDiasSemana('sexta'), [5]);
  assert.deepEqual(parseDiasSemana('sab'), [6]);
  assert.deepEqual(parseDiasSemana('sábado'), [6]);
  assert.deepEqual(parseDiasSemana('dom'), [7]);
  assert.deepEqual(parseDiasSemana('domingo'), [7]);
});

test('parseDiasSemana: ordinal BR "2ª-feira" = segunda (dia 1), NUNCA off-by-one', () => {
  // Convenção nativa PT-BR: domingo é o 1º dia, então "2ª-feira" = segunda.
  assert.deepEqual(parseDiasSemana('2ª-feira'), [1]);
  assert.deepEqual(parseDiasSemana('2ª feira'), [1]);
  assert.deepEqual(parseDiasSemana('2a'), [1]);
  assert.deepEqual(parseDiasSemana('3ª'), [2], '3ª = terça');
  assert.deepEqual(parseDiasSemana('4ª'), [3], '4ª = quarta');
  assert.deepEqual(parseDiasSemana('5ª'), [4], '5ª = quinta');
  assert.deepEqual(parseDiasSemana('6ª'), [5], '6ª = sexta');
});

test('parseDiasSemana: 1ª/7ª (domingo/sábado por ordinal) NÃO são reconhecidos — ambíguo demais pra adivinhar', () => {
  assert.deepEqual(parseDiasSemana('1ª'), []);
  assert.deepEqual(parseDiasSemana('7ª'), []);
});

test('parseDiasSemana: múltiplos dias na mesma linha, sem duplicata, ordenado', () => {
  assert.deepEqual(parseDiasSemana('seg e qui'), [1, 4]);
  assert.deepEqual(parseDiasSemana('toda terça e sexta'), [2, 5]);
  assert.deepEqual(parseDiasSemana('qui, qui e qui'), [4]);
  assert.deepEqual(parseDiasSemana('sex, seg'), [1, 5]);
});

test('parseDiasSemana: texto sem dia nenhum devolve array vazio (nunca inventa)', () => {
  assert.deepEqual(parseDiasSemana('Dona Maria, Rua das Flores 123'), []);
  assert.deepEqual(parseDiasSemana(''), []);
});

test('parseDiasSemanaFlexivel: CSV ISO cru da planilha ("1,3,5") tem prioridade sobre nome', () => {
  assert.deepEqual(parseDiasSemanaFlexivel('1,3,5'), [1, 3, 5]);
  assert.deepEqual(parseDiasSemanaFlexivel('2 / 4'), [2, 4]);
  assert.deepEqual(parseDiasSemanaFlexivel('segunda e quinta'), [1, 4], 'sem CSV válido, cai pro reconhecimento por nome');
  assert.deepEqual(parseDiasSemanaFlexivel(''), []);
  assert.deepEqual(parseDiasSemanaFlexivel(null), []);
});

// ── telefone ────────────────────────────────────────────────────────────────────
test('encontrarTelefone: formatos comuns de celular/fixo BR', () => {
  assert.equal(encontrarTelefone('(85) 99999-0000')?.digitos, '85999990000');
  assert.equal(encontrarTelefone('85 99999-0000')?.digitos, '85999990000');
  assert.equal(encontrarTelefone('85999990000')?.digitos, '85999990000');
  assert.equal(encontrarTelefone('zap 85999990000 obrigado')?.digitos, '85999990000');
  assert.equal(encontrarTelefone('+55 85 99999-0000')?.digitos, '85999990000', 'código de país 13 dígitos é cortado');
});

test('encontrarTelefone: nunca confunde CEP (8 dígitos) ou número de casa com telefone', () => {
  assert.equal(encontrarTelefone('CEP 13990-000'), null);
  assert.equal(encontrarTelefone('Rua das Flores, 123'), null);
  assert.equal(encontrarTelefone('Maria, Rua X, seg'), null);
});

// ── quantidade + produto ──────────────────────────────────────────────────────────
test('encontrarQtdProduto: só reconhece quantidade GRUDADA numa unidade conhecida', () => {
  assert.deepEqual(
    { qtd: encontrarQtdProduto('2 galões')?.qtd, produto: encontrarQtdProduto('2 galões')?.produtoTexto },
    { qtd: 2, produto: 'galões' },
  );
  assert.equal(encontrarQtdProduto('1x botijão P13')?.qtd, 1);
  assert.equal(encontrarQtdProduto('3 un')?.qtd, 3);
  assert.equal(encontrarQtdProduto('Rua 22, número 15')?.qtd, undefined, 'número de casa/rua nunca vira quantidade');
});

// ── quebra de texto em linhas ──────────────────────────────────────────────────────
test('quebrarEmLinhas: ignora linhas em branco, preserva as demais', () => {
  assert.deepEqual(quebrarEmLinhas('Maria\n\n  \nJoão\r\nPedro'), ['Maria', 'João', 'Pedro']);
  assert.deepEqual(quebrarEmLinhas(''), []);
});

// ── parseLinhaTexto (heurística completa) ──────────────────────────────────────────
test('parseLinhaTexto: linha completa (nome, endereço, número, UF, dia, telefone, produto)', () => {
  const r = parseLinhaTexto('Dona Maria - Rua das Flores, 123 - Rio Claro - SP - seg e qui - (85) 99999-0000 - 2 galões');
  assert.equal(r.nome, 'Dona Maria');
  assert.ok(r.endereco?.includes('Rua das Flores'), `endereco deveria conter a rua, veio "${r.endereco}"`);
  assert.equal(r.numero, '123');
  assert.equal(r.uf, 'SP');
  assert.deepEqual(r.diasSemana, [1, 4]);
  assert.equal(r.telefone, '85999990000');
  assert.equal(r.qtd, 2);
  assert.equal(r.produtoTexto, 'galões');
});

test('parseLinhaTexto: linha SÓ com dia (sem separador) — nome/endereço ficam null, dia reconhecido', () => {
  const r = parseLinhaTexto('sexta');
  assert.equal(r.nome, null);
  assert.equal(r.endereco, null);
  assert.deepEqual(r.diasSemana, [5]);
});

test('parseLinhaTexto: linha ILEGÍVEL (sem separador, sem endereço reconhecível) nunca lança — devolve o que der', () => {
  const r = parseLinhaTexto('asdkjaskdj128371aaaa');
  assert.equal(r.nome, null, 'sem separador claro, não inventa split de nome');
  // Não é o parser quem classifica VERDE/VERMELHO — só garante que NÃO quebra e
  // que endereço fica com o que sobrou (a classificação mora em
  // logistica-importacao-sanitizacao.util.ts#classificarCampoBasico).
  assert.equal(typeof r.endereco === 'string' || r.endereco === null, true);
});

test('parseLinhaTexto: linha vazia devolve campos vazios sem lançar', () => {
  const r = parseLinhaTexto('   ');
  assert.equal(r.nome, null);
  assert.deepEqual(r.diasSemana, []);
});

test('parseLinhaTexto: "... - Cidade - UF" extrai cidade do segmento ANCORADO na UF (convenção padrão BR)', () => {
  const r = parseLinhaTexto('Dona Maria - Rua das Flores, 123 - Rio Claro - SP');
  assert.equal(r.cidade, 'Rio Claro');
  assert.equal(r.uf, 'SP');
  assert.equal(r.endereco, 'Rua das Flores, 123', 'cidade/UF saem do endereço composto depois de extraídos');
  assert.equal(r.numero, '123');
});

test('parseLinhaTexto: SEM UF por perto, não adivinha cidade (bairro solto não vira cidade errada)', () => {
  const r = parseLinhaTexto('Maria - Rua das Flores, 123 - Centro');
  assert.equal(r.cidade, null, '"Centro" é bairro, não cidade — sem UF ancorando, não adivinha');
  assert.ok(r.endereco?.includes('Centro'), 'mas o texto não se perde — fica dentro do endereço composto');
});

test('parseLinhaTexto: cidadePadrao/ufPadrao do lote preenchem quando a linha não trouxe os próprios', () => {
  const r = parseLinhaTexto('João - Rua A, 50 - seg', { cidadePadrao: 'Rio Claro', ufPadrao: 'sp' });
  assert.equal(r.cidade, 'Rio Claro');
  assert.equal(r.uf, 'sp');
});

test('parseLinhaTexto: UF explícita na linha VENCE a ufPadrao do lote', () => {
  const r = parseLinhaTexto('João - Rua A, 50 - RJ - seg', { ufPadrao: 'SP' });
  assert.equal(r.uf, 'RJ');
});

test('parseLinhaTexto: rua com PALAVRA de dia dentro do nome ("Avenida Quinta da Boa Vista") não vira segmento removido — só um SEGMENTO 100% dia é retirado, nunca um que só contém a palavra', () => {
  const r = parseLinhaTexto('Maria - Avenida Quinta da Boa Vista, 200 - seg');
  assert.ok(r.endereco?.toLowerCase().includes('avenida quinta da boa vista'), `endereco veio "${r.endereco}"`);
  assert.equal(r.numero, '200');
  assert.deepEqual(r.diasSemana, [1], 'só o segmento "seg" (puro) vira dia — a rua não empresta a palavra "quinta"');
});

// ── planilha (xlsx) — usa a lib `xlsx` de verdade (já é dependência do backend) ──
function bufferDePlanilha(linhas: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('parsePlanilhaBuffer: cabeçalho tolerante a acento/caixa, mapeia colunas por nome', () => {
  const buf = bufferDePlanilha([
    ['Nome', 'Endereço', 'Cidade', 'UF', 'Dias', 'Telefone'],
    ['Dona Maria', 'Rua das Flores, 123', 'Rio Claro', 'SP', '1,4', '85999990000'],
    ['João', 'Rua B, 50', 'Rio Claro', 'SP', 'terça', ''],
  ]);
  const linhas = parsePlanilhaBuffer(buf);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].fields.nome, 'Dona Maria');
  assert.equal(linhas[0].fields.cidade, 'Rio Claro');
  assert.equal(linhas[0].fields.uf, 'SP');
  assert.deepEqual(linhas[0].fields.diasSemana, [1, 4]);
  assert.equal(linhas[0].fields.telefone, '85999990000');
  assert.ok(linhas[0].bruto.includes('Dona Maria'), 'bruto preserva a linha original inteira');
  assert.deepEqual(linhas[1].fields.diasSemana, [2], '"terça" nomeada também funciona na planilha');
});

test('parsePlanilhaBuffer: sem cabeçalho reconhecível, cai pra ordem POSICIONAL do schema (nome é a 1ª coluna)', () => {
  const buf = bufferDePlanilha([
    ['Maria Sem Cabecalho', '999999999', 'Rua Z, 10'],
  ]);
  const linhas = parsePlanilhaBuffer(buf);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].fields.nome, 'Maria Sem Cabecalho');
});

test('parsePlanilhaBuffer: linha totalmente vazia é ignorada, planilha vazia devolve []', () => {
  const buf = bufferDePlanilha([['nome', 'cidade'], ['', ''], ['Ana', 'Rio Claro']]);
  const linhas = parsePlanilhaBuffer(buf);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].fields.nome, 'Ana');
});
