import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCnpjBaseQueryInputFromCountFilters } from './radar-count-filters.util';

// LEADS-FINAL 03 — cobre o mapeamento dos "6 filtros que importam" da gaveta
// (uf/city, segment OU cnae, porte[], situacao, faixa de abertura, contato) pro
// CnpjBaseQueryInput. Mesmo espirito de radar-base-availability.util.test.ts (a ponte da
// VITRINE), contrato PROPRIO deste endpoint.

test('uf/estado (alias) viram states; city/cidade (alias) viram cities', () => {
  const viaUf = buildCnpjBaseQueryInputFromCountFilters({ uf: 'sp', city: 'Campinas' });
  assert.deepEqual(viaUf.states, ['SP']);
  assert.deepEqual(viaUf.cities, ['Campinas']);

  const viaEstadoCidade = buildCnpjBaseQueryInputFromCountFilters({ estado: 'ce', cidade: 'Fortaleza' });
  assert.deepEqual(viaEstadoCidade.states, ['CE']);
  assert.deepEqual(viaEstadoCidade.cities, ['Fortaleza']);
});

test('cnae direto tem prioridade sobre segment textual', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ cnae: '5611203', segment: 'Lanchonetes' });
  assert.deepEqual(input.cnaes, ['5611203']);
  assert.equal(input.keyword, undefined);
});

test('segment como codigo CNAE puro (4-7 digitos) vira cnaes, nao keyword', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ segment: '5611203' });
  assert.deepEqual(input.cnaes, ['5611203']);
  assert.equal(input.keyword, undefined);
});

test('segment textual vira keyword (nome/razao)', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ segment: 'Padarias' });
  assert.equal(input.keyword, 'Padarias');
  assert.equal(input.cnaes, undefined);
});

test('porte[] passa direto (whitelist de array de string)', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ porte: ['MEI', 'ME'] });
  assert.deepEqual(input.porte, ['MEI', 'ME']);
});

test('porte vazio nao entra no input (sem chave fantasma)', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ porte: [] });
  assert.equal('porte' in input, false);
});

test('situacao aceita string unica ou array, normaliza pra array', () => {
  const single = buildCnpjBaseQueryInputFromCountFilters({ situacao: 'ativa' as any });
  assert.deepEqual(single.situacoes, ['ativa']);

  const multi = buildCnpjBaseQueryInputFromCountFilters({ situacao: ['ativa', 'baixada'] });
  assert.deepEqual(multi.situacoes, ['ativa', 'baixada']);
});

test('faixa de data de abertura (abertaDe/abertaAte) passa direto', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ abertaDe: '2020-01-01', abertaAte: '2024-12-31' });
  assert.equal(input.abertaDe, '2020-01-01');
  assert.equal(input.abertaAte, '2024-12-31');
});

test('contato.temTelefone/temEmail viram contato.comTelefone/comEmail', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({ contato: { temTelefone: true, temEmail: true } });
  assert.equal(input.contato?.comTelefone, true);
  assert.equal(input.contato?.comEmail, true);
});

test('contato ausente/vazio nao entra no input', () => {
  const semContato = buildCnpjBaseQueryInputFromCountFilters({});
  assert.equal('contato' in semContato, false);

  const contatoFalso = buildCnpjBaseQueryInputFromCountFilters({ contato: { temTelefone: false, temEmail: false } });
  assert.equal('contato' in contatoFalso, false);
});

test('filtros vazios devolvem input vazio (sem chaves fantasma) — nunca amostra/contato aqui', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({});
  assert.deepEqual(input, {});
});

test('campos nao-whitelisted (ex.: donoConhecido/capitalMin) NUNCA aparecem no input mapeado', () => {
  const input = buildCnpjBaseQueryInputFromCountFilters({
    uf: 'SP',
    ...({ donoConhecido: true, capitalMin: 999999, ownerNameKeyword: 'hack' } as any),
  });
  assert.equal((input as any).donoConhecido, undefined);
  assert.equal((input as any).capitalMin, undefined);
  assert.equal((input as any).ownerNameKeyword, undefined);
});
