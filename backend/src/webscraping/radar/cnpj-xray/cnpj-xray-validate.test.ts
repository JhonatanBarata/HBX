import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCnpjDv, normalizeCnpjDigits, parseAndValidateCnpjBatch } from './cnpj-xray-validate';

// CNPJs com DV real válido (mesmo par usado no teste da fábrica) + variações de máscara.
const VALID_1 = '11222333000181';
const VALID_2 = '11444777000161';

test('isValidCnpjDv aprova DV correto e rejeita sequência repetida/dv errado', () => {
  assert.equal(isValidCnpjDv(VALID_1), true);
  assert.equal(isValidCnpjDv(VALID_2), true);
  assert.equal(isValidCnpjDv('00000000000000'), false, 'sequência repetida nunca é válida');
  assert.equal(isValidCnpjDv('11111111111111'), false);
  assert.equal(isValidCnpjDv('11222333000180'), false, 'dv incorreto (último dígito trocado)');
  assert.equal(isValidCnpjDv('1122233300018'), false, 'tamanho errado (13 dígitos)');
});

test('normalizeCnpjDigits remove máscara/texto e mantém só dígitos', () => {
  assert.equal(normalizeCnpjDigits('11.222.333/0001-81'), VALID_1);
  assert.equal(normalizeCnpjDigits('  11222333000181  '), VALID_1);
  assert.equal(normalizeCnpjDigits('abc'), '');
});

test('parseAndValidateCnpjBatch: valida DV, dedup, preserva texto original no relatório de invalidez', () => {
  const lines = [
    '11.222.333/0001-81',   // válido (com máscara)
    VALID_2,                 // válido (sem máscara)
    '11222333000181',        // duplicado do primeiro (mesmos dígitos, texto diferente)
    '00000000000000',        // dv/sequência inválida
    'texto qualquer',        // vazio de dígitos
    '123',                   // tamanho inválido
    '',                      // linha em branco — não conta como inválida
    '   ',                   // só espaço — idem
  ];
  const { valid, invalid } = parseAndValidateCnpjBatch(lines);
  assert.equal(valid.length, 2);
  assert.deepEqual(valid.map((v) => v.cnpj).sort(), [VALID_1, VALID_2].sort());

  const reasons = invalid.map((i) => i.reason);
  assert.ok(reasons.includes('duplicado'));
  assert.ok(reasons.includes('dv_invalido'));
  assert.ok(reasons.includes('vazio'));
  assert.ok(reasons.includes('tamanho_invalido'));
  // linha em branco não devia gerar nenhuma entrada de invalidez
  assert.equal(invalid.some((i) => i.raw === ''), false);

  const dup = invalid.find((i) => i.reason === 'duplicado');
  assert.equal(dup?.raw, '11222333000181', 'preserva o texto original da linha duplicada');
});

test('parseAndValidateCnpjBatch respeita o teto máximo de itens', () => {
  const lines = Array.from({ length: 10 }, () => VALID_1);
  const { valid, invalid } = parseAndValidateCnpjBatch(lines, 3);
  // só as 3 primeiras linhas são consideradas; a 1ª é válida, as demais (mesmos dígitos) duplicadas
  assert.equal(valid.length + invalid.length, 3);
});
