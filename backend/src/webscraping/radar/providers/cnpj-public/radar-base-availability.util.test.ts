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

// ── LOTE 1 (17/08 — PR17082026): a contagem fala a mesma lingua da porta ────────────────────
// A frase honesta do relatório ("a Receita tem N nessa cidade") só serve se o N nascer da MESMA
// regra que a porta usa pra entregar. Com o mapa curado a porta passou a aceitar por CÓDIGO de
// CNAE; se a contagem continuasse só com `keyword = segmento`, ela exigiria 'distribuidora' E
// 'agua' no texto — a trava A1 — e prometeria 15 onde a busca entrega 86.
test('LOTE 1 — segmento do mapa curado vira cnaes (nao a frase inteira como keyword)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ segment: 'distribuidoras de água' });
  assert.deepEqual([...(input.cnaes || [])].sort(), ['3600602', '4635401', '4723700', '4784900']);
  // O sinal das entradas amplas (4723700/4784900) segue exigido — senão a contagem promete
  // todo bar/adega da cidade.
  assert.equal(input.keyword, 'agua');
  // A porta só olha o CNAE principal; contar secundário prometeria quem a busca não entrega.
  assert.equal(input.cnaePrincipalOnly, true);
});

test('LOTE 1 — segmento do mapa SEM sinal a exigir nao carrega keyword nenhuma', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ segment: 'distribuidora de gas' });
  assert.deepEqual([...(input.cnaes || [])].sort(), ['4682600', '4784900']);
  assert.equal(input.keyword, undefined);
});

test('LOTE 1 — segmento fora do mapa continua keyword pura (comportamento intacto)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({ segment: 'Lanchonetes' });
  assert.equal(input.keyword, 'Lanchonetes');
  assert.equal(input.cnaes, undefined);
});

test('mapper: filtros vazios devolvem input vazio (sem chaves fantasma)', () => {
  const input = buildCnpjBaseQueryInputFromRadarFilters({});
  assert.deepEqual(input, {});
});
