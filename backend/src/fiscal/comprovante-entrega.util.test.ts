// FISCAL F2a — teste do COMPROVANTE DE ENTREGA (node --test, zero rede).
// A alma do papel É AFIRMADA NO TEXTO IMPRESSO (leitor de content streams, o
// mesmo do nfse-pdf.util.test): rodapé "SEM VALOR FISCAL" SEMPRE; modo
// fechamento explica a NF mensal; financeiro OFF não imprime NENHUM R$.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderComprovanteEntregaPdf, type ComprovanteEntregaInput } from './comprovante-entrega.util';

/** Junta o texto visível do PDF (infla streams e remonta os literais <hex> do PDFKit). */
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

function base(overrides: Partial<ComprovanteEntregaInput> = {}): ComprovanteEntregaInput {
  return {
    empresa: { nome: 'Atlas Distribuidora de Água LTDA', cnpj: '11222333000181', municipio: 'Rio Claro/SP' },
    cliente: { nome: 'Dona Maria' },
    entregueEm: new Date('2026-08-04T18:30:00Z'),
    itens: [
      { nome: 'Galão 20L', quantidade: 3, valorUnit: 12.5 },
      { nome: 'Caixa de copo', quantidade: 1, valorUnit: 7.4 },
    ],
    total: 44.9,
    modoEmissao: 'fechamento',
    entregaId: 'ent-abc123',
    ...overrides,
  };
}

test('imprime empresa, cliente, itens, total e o rodapé SEM VALOR FISCAL com a explicação da NF mensal', async () => {
  const pdf = await renderComprovanteEntregaPdf(base());
  assert.equal(pdf.slice(0, 4).toString(), '%PDF');
  const texto = textoVisivel(pdf);
  assert.match(texto, /SEM VALOR FISCAL/);
  assert.match(texto, /fechamento mensal/);
  assert.match(texto, /Atlas Distribuidora/);
  assert.match(texto, /Dona Maria/);
  assert.match(texto, /Gal.o 20L/);
  assert.match(texto, /R\$ 44,90/);
});

test("modo 'entrega' mantém o SEM VALOR FISCAL mas NÃO fala de fechamento mensal", async () => {
  const texto = textoVisivel(await renderComprovanteEntregaPdf(base({ modoEmissao: 'entrega' })));
  assert.match(texto, /SEM VALOR FISCAL/);
  assert.doesNotMatch(texto, /fechamento mensal/);
});

test('financeiro OFF (total null): nenhum R$ impresso, itens e rodapé continuam', async () => {
  const texto = textoVisivel(
    await renderComprovanteEntregaPdf(
      base({ total: null, itens: [{ nome: 'Galão 20L', quantidade: 3, valorUnit: null }] }),
    ),
  );
  assert.doesNotMatch(texto, /R\$/);
  assert.match(texto, /Gal.o 20L/);
  assert.match(texto, /SEM VALOR FISCAL/);
});

test('campos nulos/vazios não lançam (dado legado não derruba aviso de rua)', async () => {
  const pdf = await renderComprovanteEntregaPdf({
    empresa: { nome: null, cnpj: null },
    cliente: { nome: null },
    entregueEm: null,
    itens: [],
    total: null,
    modoEmissao: 'entrega',
  });
  assert.equal(pdf.slice(0, 4).toString(), '%PDF');
  assert.match(textoVisivel(pdf), /SEM VALOR FISCAL/);
});
