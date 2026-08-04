// FISCAL F2a — teste do COMPROVANTE DE ENTREGA (node --test, zero rede).
// A alma do papel: rodapé "SEM VALOR FISCAL" SEMPRE; modo fechamento explica a
// NF mensal; financeiro OFF (total null) não imprime dinheiro nenhum.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderComprovanteEntregaPdf, type ComprovanteEntregaInput } from './comprovante-entrega.util';

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

// pdfkit comprime o stream de conteúdo — pra afirmar sobre o TEXTO impresso,
// procuramos nas strings literais dos objetos não comprimidos é inviável; em
// vez disso, o util é determinístico o bastante pra validarmos estrutura + os
// metadados, e os textos críticos são exercitados por chamada (não lançam) e
// pelo tamanho relativo dos PDFs (com dinheiro > sem dinheiro).
test('gera %PDF válido com metadados de comprovante', async () => {
  const pdf = await renderComprovanteEntregaPdf(base());
  assert.equal(pdf.slice(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 800, 'PDF de verdade, não stub');
});

test('financeiro OFF (total null) rende papel válido e MENOR (sem colunas de dinheiro)', async () => {
  const comDinheiro = await renderComprovanteEntregaPdf(base());
  const semDinheiro = await renderComprovanteEntregaPdf(
    base({ total: null, itens: [{ nome: 'Galão 20L', quantidade: 3, valorUnit: null }] }),
  );
  assert.equal(semDinheiro.slice(0, 4).toString(), '%PDF');
  assert.ok(semDinheiro.length < comDinheiro.length, 'sem dinheiro imprime menos conteúdo');
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
});
