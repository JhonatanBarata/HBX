// FISCAL DO TENANT — teste do DESENHO da DANFSe (node --test, zero rede, zero banco).
// O que garante: (1) sai PDF de verdade (magic bytes + trailer), (2) campo nulo NÃO
// derruba o render, (3) os 3 modos carimbam o que têm que carimbar — produção limpa,
// restrita com "AMBIENTE DE TESTE / SEM VALOR FISCAL", cancelada com "NOTA CANCELADA".
// A leitura do conteúdo é feita inflando os content streams e remontando as strings
// hexadecimais que o PDFKit escreve (ele quebra a palavra por kerning: <4e4f> 40 <54>).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderNfsePdf, type NfsePdfInput } from './nfse-pdf.util';

// ---------------------------------------------------------------------------
// Leitor mínimo de PDF (só o suficiente pro teste enxergar o que foi impresso)
// ---------------------------------------------------------------------------

/** Junta o texto visível: infla os streams e concatena os literais <hex> dos operadores TJ/Tj. */
function textoVisivel(pdf: Buffer): string {
  const pedacos: string[] = [];
  let i = 0;
  for (;;) {
    const ini = pdf.indexOf('stream', i);
    if (ini < 0) break;
    let a = ini + 'stream'.length;
    if (pdf[a] === 0x0d) a += 1;
    if (pdf[a] === 0x0a) a += 1;
    const fim = pdf.indexOf('endstream', a);
    if (fim < 0) break;
    const cru = pdf.subarray(a, fim);
    let conteudo: string;
    try {
      conteudo = inflateSync(cru).toString('latin1');
    } catch {
      conteudo = cru.toString('latin1');
    }
    for (const m of conteudo.matchAll(/<([0-9a-fA-F]+)>/g)) {
      const hex = m[1].length % 2 === 0 ? m[1] : `${m[1]}0`;
      pedacos.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
    i = fim + 'endstream'.length;
  }
  return pedacos.join('');
}

function totalPaginas(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;
}

function assertPdfBem(pdf: Buffer): void {
  assert.ok(Buffer.isBuffer(pdf), 'deve devolver Buffer');
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'magic bytes de PDF');
  assert.ok(pdf.length > 1000, `PDF suspeito de vazio (${pdf.length} bytes)`);
  assert.ok(pdf.subarray(-32).toString('latin1').includes('%%EOF'), 'trailer %%EOF presente');
  assert.equal(totalPaginas(pdf), 1, 'DANFSe é documento de UMA folha');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AVISO_TESTE = 'AMBIENTE DE TESTE';
const AVISO_SEM_VALOR = 'SEM VALOR FISCAL';
const AVISO_CANCELADA = 'NOTA CANCELADA';

const base: NfsePdfInput = {
  ambiente: 'producao',
  status: 'AUTORIZADA',
  prestador: { razaoSocial: 'Manutencao Rio Claro LTDA', cnpj: '11222333000181', municipio: 'Rio Claro/SP' },
  tomador: { nome: 'Empresa Grande SA', doc: '19131243000197' },
  descricao: 'Instalacao e manutencao de ar-condicionado split 12000 BTUs, com materiais inclusos.',
  valorCents: 4512345,
  competencia: '2026-08',
  serie: '1',
  numero: 42,
  chaveAcesso: '35260811222333000181650010000000421000000429',
  emitidaEm: new Date('2026-08-04T13:45:00Z'),
};

const nota = (patch: Partial<NfsePdfInput> = {}): NfsePdfInput => ({ ...base, ...patch });

// ---------------------------------------------------------------------------
// Estrutura do arquivo
// ---------------------------------------------------------------------------

test('devolve um PDF de uma página com magic bytes e trailer', async () => {
  const pdf = await renderNfsePdf(nota());
  assertPdfBem(pdf);
});

test('imprime prestador, tomador, valor e chave de acesso no papel', async () => {
  const texto = textoVisivel(await renderNfsePdf(nota()));

  assert.ok(texto.includes('Manutencao Rio Claro LTDA'), 'razão social do prestador');
  assert.ok(texto.includes('11.222.333/0001-81'), 'CNPJ do prestador formatado');
  assert.ok(texto.includes('Empresa Grande SA'), 'nome do tomador');
  assert.ok(texto.includes('19.131.243/0001-97'), 'documento do tomador formatado');
  assert.ok(texto.includes('R$ 45.123,45'), 'valor em reais formatado pt-BR');
  assert.ok(texto.includes(base.chaveAcesso as string), 'chave de acesso íntegra');
  assert.ok(texto.includes('08/2026'), 'competência exibida como MM/AAAA');
  assert.ok(texto.includes('Consulte a autenticidade em www.gov.br/nfse'), 'rodapé de autenticidade');
});

// ---------------------------------------------------------------------------
// Os 3 modos
// ---------------------------------------------------------------------------

test('modo produção: nenhum carimbo de teste ou de cancelamento', async () => {
  const pdf = await renderNfsePdf(nota({ ambiente: 'producao', status: 'AUTORIZADA' }));
  assertPdfBem(pdf);
  const texto = textoVisivel(pdf);

  assert.ok(!texto.includes(AVISO_TESTE), 'produção NÃO pode estampar aviso de teste');
  assert.ok(!texto.includes(AVISO_SEM_VALOR), 'produção NÃO pode estampar SEM VALOR FISCAL');
  assert.ok(!texto.includes(AVISO_CANCELADA), 'nota autorizada NÃO pode estampar cancelamento');
  assert.ok(texto.includes('AUTORIZADA'), 'situação impressa');
});

test('modo restrita (e ambiente nulo) estampam AMBIENTE DE TESTE + SEM VALOR FISCAL', async () => {
  for (const ambiente of ['restrita', null, 'homologacao']) {
    const pdf = await renderNfsePdf(nota({ ambiente }));
    assertPdfBem(pdf);
    const texto = textoVisivel(pdf);
    assert.ok(texto.includes(AVISO_TESTE), `ambiente ${String(ambiente)}: falta o banner de teste`);
    assert.ok(texto.includes(AVISO_SEM_VALOR), `ambiente ${String(ambiente)}: falta SEM VALOR FISCAL`);
    assert.ok(!texto.includes(AVISO_CANCELADA), `ambiente ${String(ambiente)}: não é nota cancelada`);
  }
});

test('modo cancelada estampa NOTA CANCELADA (e acumula com o aviso de teste)', async () => {
  const pdf = await renderNfsePdf(nota({ ambiente: 'restrita', status: 'CANCELADA' }));
  assertPdfBem(pdf);
  const texto = textoVisivel(pdf);
  assert.ok(texto.includes(AVISO_CANCELADA), 'falta o carimbo de cancelamento');
  assert.ok(texto.includes(AVISO_SEM_VALOR), 'restrita + cancelada mostram os DOIS avisos');

  // Cancelada em produção também carimba, e aí sem o aviso de teste.
  const prod = textoVisivel(await renderNfsePdf(nota({ ambiente: 'producao', status: 'CANCELADA' })));
  assert.ok(prod.includes(AVISO_CANCELADA), 'cancelada em produção precisa do carimbo');
  assert.ok(!prod.includes(AVISO_TESTE), 'produção cancelada não é ambiente de teste');
});

// ---------------------------------------------------------------------------
// Robustez: nada aqui pode derrubar a rota do PDF
// ---------------------------------------------------------------------------

test('campos nulos/vazios renderizam sem lançar', async () => {
  const vazia: NfsePdfInput = {
    ambiente: null,
    status: '',
    prestador: { razaoSocial: null, cnpj: null, municipio: null },
    tomador: { nome: null, doc: null },
    descricao: null,
    valorCents: 0,
    competencia: '',
    serie: null,
    numero: null,
    chaveAcesso: null,
    emitidaEm: null,
  };
  const pdf = await renderNfsePdf(vazia);
  assertPdfBem(pdf);
  const texto = textoVisivel(pdf);
  assert.ok(texto.includes('R$ 0,00'), 'valor zerado sai formatado');
  assert.ok(texto.includes('Documento sem chave de acesso'), 'sem chave, o papel diz isso na cara');
  assert.ok(texto.includes(AVISO_SEM_VALOR), 'ambiente nulo NUNCA vale como produção');
});

test('documento/valor fora do padrão não estouram o layout nem viram 2 páginas', async () => {
  const pdf = await renderNfsePdf(
    nota({
      prestador: { razaoSocial: 'A'.repeat(400), cnpj: '123', municipio: 'M'.repeat(200) },
      tomador: { nome: 'B'.repeat(400), doc: '12345678909' },
      descricao: 'Servico detalhado. '.repeat(900),
      valorCents: 123456789012,
      serie: 'SERIE-MUITO-LONGA-DEMAIS-PARA-A-CAIXA',
      chaveAcesso: `${'9'.repeat(120)}`,
      emitidaEm: 'data-invalida',
    }),
  );
  assertPdfBem(pdf);
  const texto = textoVisivel(pdf);
  assert.ok(texto.includes('R$ 1.234.567.890,12'), 'valor alto com separador de milhar');
  assert.ok(texto.includes('123.456.789-09'), 'CPF do tomador formatado');
});

test('valorCents inválido não quebra e não imprime NaN', async () => {
  for (const valorCents of [Number.NaN, Infinity, undefined as unknown as number]) {
    const texto = textoVisivel(await renderNfsePdf(nota({ valorCents })));
    assert.ok(texto.includes('R$ 0,00'), `valor ${String(valorCents)} deve virar R$ 0,00`);
    assert.ok(!texto.includes('NaN'), 'NaN não pode chegar no papel');
  }
});
