import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjPublicProviderService, isValidCnpjCheckDigits } from './cnpj-public-provider.service';
import { cleanRfbLegalName, normalizeLegacyBrCellphone } from './cnpj-public-types';
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

// P1 (02/07), tarefa 7: "log dos rejeitados da porta receita" — cada rejeitado (dv/ativa/
// cidade-uf) loga o motivo. Aqui garantimos que o log NUNCA quebra o fluxo (search
// segue devolvendo o mesmo resultado) para os 3 motivos de rejeição da porta.
test('provider: loga (sem quebrar o fluxo) rejeitado por cidade/UF fora do pedido', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ city: 'Recife', state: 'PE' })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
});

// C1 (03/07 — decisão do dono): CNAE sem match NÃO descarta mais. O candidato segue pela porta
// (com log de AVISO) e é aceito normalmente — a fusão e o 02-filter decidem depois.
test('provider: aceita COM AVISO registro cujo CNAE não casa (não descarta mais)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ cnae: '4712-1/00', cnaeDescription: 'oficina mecanica', nomeFantasia: 'Oficina X', razaoSocial: 'Oficina X Ltda' })],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.results.length, 1);
});

// MEI/EI da RFB: razão social vem "<CNPJ básico formatado> <NOME>" e sem fantasia — o
// prefixo do CNPJ NÃO pode aparecer antes do nome no card (o CNPJ tem campo próprio).
test('cleanRfbLegalName: remove prefixo de CNPJ básico quando bate com o CNPJ do registro', () => {
  assert.equal(
    cleanRfbLegalName('11.222.333 MARIA HELENA NOVAES SOARES', '11222333000181'),
    'MARIA HELENA NOVAES SOARES',
  );
});

test('cleanRfbLegalName: NÃO remove quando o prefixo não bate com o CNPJ (evita falso positivo)', () => {
  assert.equal(
    cleanRfbLegalName('99.999.999 NOME QUALQUER', '11222333000181'),
    '99.999.999 NOME QUALQUER',
  );
});

test('cleanRfbLegalName: razão legítima sem prefixo fica intocada', () => {
  assert.equal(cleanRfbLegalName('Padaria Exemplo Ltda', '11222333000181'), 'Padaria Exemplo Ltda');
  assert.equal(cleanRfbLegalName('3M DO BRASIL LTDA', '11222333000181'), '3M DO BRASIL LTDA');
});

test('cleanRfbLegalName: nunca produz nome vazio/numérico (mantém original se não sobra nome)', () => {
  assert.equal(cleanRfbLegalName('11.222.333 ', '11222333000181'), '11.222.333');
  assert.equal(cleanRfbLegalName('', '11222333000181'), '');
  assert.equal(cleanRfbLegalName(null, null), '');
});

test('provider.toContactResult: MEI sem fantasia entrega nome LIMPO (sem o CNPJ na frente)', () => {
  const mapped = provider.toContactResult(
    baseRecord({ nomeFantasia: null, razaoSocial: '11.222.333 MARIA HELENA NOVAES SOARES' }),
    baseNormalized,
  );
  assert.equal(mapped?.name, 'MARIA HELENA NOVAES SOARES');
  assert.equal((mapped as any)?.legalName, 'MARIA HELENA NOVAES SOARES');
});

test('provider: 3 motivos de rejeicao (dv/ativa/cidade-uf) somam rejectedCount sem lancar excecao; segmento-sem-match agora passa', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [
      baseRecord({ cnpj: '11222333000180' }), // dv_invalido
      baseRecord({ situacao: 'baixada' }), // situacao_nao_ativa
      baseRecord({ city: 'Recife', state: 'PE' }), // cidade_uf_fora_do_pedido
      baseRecord({ cnae: '4712-1/00', cnaeDescription: 'oficina mecanica', nomeFantasia: 'Oficina Y', razaoSocial: 'Oficina Y Ltda' }), // segmento_sem_match_cnae -> agora aceito
      baseRecord(), // aceito
    ],
  });
  assert.equal(result.acceptedCount, 2);
  assert.equal(result.rejectedCount, 3);
});
