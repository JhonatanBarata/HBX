import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRfbPhoneCandidates,
  selectVendasRfbMatch,
} from './vendas-cnpj-fallback';

test('telefone atual encontra telefone legado da RFB', () => {
  assert.deepEqual(
    buildRfbPhoneCandidates('5519999138868').sort(),
    ['19999138868', '1999138868'].sort(),
  );

  const match = selectVendasRfbMatch(
    {
      name: 'RODE CONTABILIDADE',
      segment: 'contabilidades',
      phone: '(19) 99913-8868',
      city: 'RIO CLARO',
      state: 'SP',
      address: 'RUA 10, 3012, ALTO DO SANTANA',
    },
    [{
      cnpj: '11222333000181',
      nomeFantasia: 'RODE CONTABILIDADE',
      razaoSocial: 'RODE SERVICOS CONTABEIS LTDA',
      phoneDigits: '1999138868',
      normalizedCity: 'rio claro',
      state: 'SP',
      address: 'RUA 10, 3012, ALTO DO SANTANA',
      situacao: 'ATIVA',
    }],
  );

  assert.equal(match?.company.cnpj, '11222333000181');
  assert.ok((match?.score || 0) >= 100);
});

test('nome exato + cidade + endereco encontra empresa sem telefone igual', () => {
  const match = selectVendasRfbMatch(
    {
      name: 'RODE CONTABILIDADE',
      segment: 'contabilidades',
      city: 'RIO CLARO',
      state: 'SP',
      address: 'RUA 10, 3012, ALTO DO SANTANA',
    },
    [{
      cnpj: '11222333000181',
      nomeFantasia: 'RODE CONTABILIDADE',
      normalizedCity: 'rio claro',
      state: 'SP',
      address: 'RUA 10, 3012, ALTO DO SANTANA',
      situacao: 'ATIVA',
    }],
  );

  assert.equal(match?.company.cnpj, '11222333000181');
  assert.ok(match?.reasons.includes('nome_exato'));
  assert.ok(match?.reasons.includes('numero_endereco_exato'));
});

test('empate de nome e cidade nao grava CNPJ', () => {
  const match = selectVendasRfbMatch(
    {
      name: 'ALFA CONTABILIDADE',
      segment: 'contabilidade',
      city: 'RIO CLARO',
      state: 'SP',
    },
    [
      {
        cnpj: '11222333000181',
        nomeFantasia: 'ALFA CONTABILIDADE',
        normalizedCity: 'rio claro',
        state: 'SP',
        situacao: 'ATIVA',
      },
      {
        cnpj: '64711048000190',
        nomeFantasia: 'ALFA CONTABILIDADE',
        normalizedCity: 'rio claro',
        state: 'SP',
        situacao: 'ATIVA',
      },
    ],
  );

  assert.equal(match, null);
});

test('telefone compartilhado exige desempate por identidade', () => {
  const match = selectVendasRfbMatch(
    {
      name: 'RODE CONTABILIDADE',
      segment: 'contabilidade',
      phone: '19999138868',
      city: 'RIO CLARO',
      state: 'SP',
      address: 'RUA 10, 3012',
    },
    [
      {
        cnpj: '11222333000181',
        nomeFantasia: 'RODE CONTABILIDADE',
        phoneDigits: '19999138868',
        normalizedCity: 'rio claro',
        state: 'SP',
        address: 'RUA 10, 3012',
        situacao: 'ATIVA',
      },
      {
        cnpj: '64711048000190',
        nomeFantasia: 'OUTRA EMPRESA',
        phoneDigits: '19999138868',
        normalizedCity: 'rio claro',
        state: 'SP',
        address: 'AVENIDA 2, 100',
        situacao: 'ATIVA',
      },
    ],
  );

  assert.equal(match?.company.cnpj, '11222333000181');
});
