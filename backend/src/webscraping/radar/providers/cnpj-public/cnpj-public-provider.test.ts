import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjPublicProviderService, isValidCnpjCheckDigits } from './cnpj-public-provider.service';
import { normalizeLegacyBrCellphone } from './cnpj-public-types';
import type { CnpjPublicCompanyRecord } from './cnpj-public-types';

const provider = new CnpjPublicProviderService();

const baseNormalized = { city: 'Fortaleza', state: 'CE', segment: 'padaria' } as any;

function baseRecord(overrides: Partial<CnpjPublicCompanyRecord> = {}): CnpjPublicCompanyRecord {
  return {
    cnpj: '11222333000181', // DV valido (mod-11 classico)
    nomeFantasia: 'Padaria Exemplo',
    razaoSocial: 'Padaria Exemplo Ltda',
    city: 'Fortaleza',
    state: 'CE',
    cnae: '4721-1/02',
    cnaeDescription: 'padaria',
    situacao: 'ativa',
    phone: '85999998888',
    ...overrides,
  };
}

test('isValidCnpjCheckDigits: aceita CNPJ com DV correto', () => {
  assert.equal(isValidCnpjCheckDigits('11222333000181'), true);
  assert.equal(isValidCnpjCheckDigits('11.222.333/0001-81'), true);
});

test('isValidCnpjCheckDigits: rejeita CNPJ com DV incorreto', () => {
  assert.equal(isValidCnpjCheckDigits('11222333000180'), false);
});

test('isValidCnpjCheckDigits: rejeita tamanho errado e sequencia degenerada', () => {
  assert.equal(isValidCnpjCheckDigits('1234'), false);
  assert.equal(isValidCnpjCheckDigits('00000000000000'), false);
  assert.equal(isValidCnpjCheckDigits(''), false);
  assert.equal(isValidCnpjCheckDigits(null), false);
});

test('provider: rejeita CNPJ com DV invalido (rejectedCount++, fora do results)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ cnpj: '11222333000180' })], // DV errado (ultimo digito trocado)
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

test('provider: rejeita situacao baixada (ja coberto por isActiveCompany)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ situacao: 'baixada' })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

test('provider: aceita registro valido (DV correto + ativa + localizacao/segmento batem)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord()],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.results[0]?.cnpj, '11222333000181');
});

// R1 (calibracao round-3, 01/07): celular legado pre-nono-digito cadastrado na Receita —
// 10 digitos, 3o digito 6-9 -> insere '9' apos o DDD (norma Anatel).
test('normalizeLegacyBrCellphone: celular legado 10 digitos (3o digito 6-9) ganha o 9', () => {
  assert.equal(normalizeLegacyBrCellphone('6292617022'), '62992617022');
  assert.equal(normalizeLegacyBrCellphone('62 9261-7022'), '62992617022');
});

test('normalizeLegacyBrCellphone: fixo 10 digitos (3o digito 2-5) fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('6232810912'), '6232810912');
});

test('normalizeLegacyBrCellphone: 11 digitos (ja moderno) fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('62992617022'), '62992617022');
});

test('normalizeLegacyBrCellphone: menos de 10 digitos fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('929617022'), '929617022');
  assert.equal(normalizeLegacyBrCellphone(''), '');
  assert.equal(normalizeLegacyBrCellphone(null), '');
});

test('provider.toContactResult: normaliza celular legado da fonte cnpj_public na FONTE', () => {
  const mapped = provider.toContactResult(
    baseRecord({ phone: '6292617022' }),
    baseNormalized,
  );
  assert.equal(mapped?.phoneDigits, '62992617022');
  assert.equal(mapped?.phone, '62992617022');
});

test('provider.toContactResult: fixo legado da fonte cnpj_public nao e alterado', () => {
  const mapped = provider.toContactResult(
    baseRecord({ phone: '6232810912' }),
    baseNormalized,
  );
  assert.equal(mapped?.phoneDigits, '6232810912');
});
