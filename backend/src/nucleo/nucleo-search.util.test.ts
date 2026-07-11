import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSearch } from './nucleo-search.util';

// BUG 1 (11/07) — busca por nome acentuado ("Déia", "José", "André") não encontrava o
// cliente porque o Prisma `contains`/`mode: insensitive` vira ILIKE (acento-SENSÍVEL) no
// Postgres. `normalizeSearch` PRECISA casar com a saída de `unaccent(lower(...))` da
// migration de backfill — senão linha antiga (SQL) e busca nova (JS) não se encontram.

test('normalizeSearch: tira acento e baixa a caixa (PT-BR)', () => {
  assert.equal(normalizeSearch('Déia'), 'deia');
  assert.equal(normalizeSearch('José'), 'jose');
  assert.equal(normalizeSearch('André'), 'andre');
  assert.equal(normalizeSearch('Conceição'), 'conceicao');
  assert.equal(normalizeSearch('PADARIA SÃO JOÃO'), 'padaria sao joao');
});

test('normalizeSearch: trim + vazio/null/undefined → string vazia', () => {
  assert.equal(normalizeSearch('  Ana  '), 'ana');
  assert.equal(normalizeSearch(''), '');
  assert.equal(normalizeSearch('   '), '');
  assert.equal(normalizeSearch(null), '');
  assert.equal(normalizeSearch(undefined), '');
});

test('normalizeSearch: já normalizado (sem acento) é idempotente', () => {
  assert.equal(normalizeSearch('deia'), 'deia');
  assert.equal(normalizeSearch(normalizeSearch('Déia')), normalizeSearch('Déia'));
});
