import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCnpjBaseQueryInputFromRadarFilters } from './radar-base-availability.util';

test('mapper: cidade+UF viram cities/states (arrays, mesmo formato do CnpjBaseQueryInput)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ city: 'Fortaleza', state: 'ce' });
  assert.deepEqual(input.cities, ['Fortaleza']);
  assert.deepEqual(input.states, ['CE']);
});

test('mapper: segmento textual vira keyword (nome/razao), nao cnae', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ segment: 'Lanchonetes' });
  assert.equal(input.keyword, 'Lanchonetes');
  assert.equal(input.cnaes, undefined);
});

test('mapper: segmento como codigo CNAE puro (4-7 digitos) vira cnaes, nao keyword', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ segment: '5611203' });
  assert.deepEqual(input.cnaes, ['5611203']);
  assert.equal(input.keyword, undefined);
});

test('mapper: validPhone/likelyWhatsapp viram contato.comTelefone/comCelular', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ validPhone: true, likelyWhatsapp: true });
  assert.equal(input.contato?.comTelefone, true);
  assert.equal(input.contato?.comCelular, true);
});

test('mapper: withWebsite/noWebsite NUNCA entram no WHERE (base fria nao tem website populado)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ withWebsite: true, noWebsite: true } as any);
  assert.equal((input as any).withWebsite, undefined);
  assert.equal((input as any).noWebsite, undefined);
});

test('mapper: filtros vazios devolvem input vazio (sem chaves fantasma)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({});
  assert.deepEqual(input, {});
});
