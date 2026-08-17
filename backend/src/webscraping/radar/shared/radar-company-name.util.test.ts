import test from 'node:test';
import assert from 'node:assert/strict';
import { isDistinctiveCompanyNameCore, normalizeCompanyName } from './radar-company-name.util';

// LOTE 5 (PR17082026) — a lei do NOME de empresa. O par real que produziu `fused=0` na busca de
// Valinhos é "RINAGUA LTDA." (Receita) x "Rinágua" (web).

// ─── 1. O par real do dono ───────────────────────────────────────────────────────────────────────

test('RINAGUA LTDA. (Receita) e Rinágua (web) viram o MESMO núcleo', () => {
  assert.equal(normalizeCompanyName('RINAGUA LTDA.'), 'rinagua');
  assert.equal(normalizeCompanyName('Rinágua'), 'rinagua');
  assert.equal(normalizeCompanyName('RINAGUA LTDA.'), normalizeCompanyName('Rinágua'));
});

// ─── 2. Sufixo societário sai; o resto do nome NUNCA sai ─────────────────────────────────────────

test('tira só o rabo societário (ltda, me, epp, eireli, s/a) e mantém o nome inteiro', () => {
  assert.equal(normalizeCompanyName('ÁGUA EM VALINHOS LTDA - ME'), 'agua em valinhos');
  assert.equal(normalizeCompanyName('Kero Água Comércio EIRELI'), 'kero agua comercio');
  assert.equal(normalizeCompanyName('AGUA VOLGA LTDA EPP'), 'agua volga');
  assert.equal(normalizeCompanyName('Distribuidora Volga S/A'), 'distribuidora volga');
  assert.equal(normalizeCompanyName('Distribuidora Volga S.A.'), 'distribuidora volga');
  assert.equal(normalizeCompanyName('MERCADO CENTRAL SOCIEDADE'), 'mercado central');
});

test('comercio/industria/distribuidora FICAM no núcleo — no ramo do dono elas distinguem empresa', () => {
  const comercio = normalizeCompanyName('AGUAS DO VALE COMERCIO DE AGUAS LTDA');
  const distribuidora = normalizeCompanyName('AGUAS DO VALE DISTRIBUIDORA DE AGUAS LTDA');
  assert.equal(comercio, 'aguas do vale comercio de aguas');
  assert.equal(distribuidora, 'aguas do vale distribuidora de aguas');
  assert.notEqual(comercio, distribuidora, 'tirar comercio/distribuidora colaria duas empresas distintas');
});

test('sufixo só sai do FIM: "Cia do Chocolate" continua com o cia (nome de fantasia)', () => {
  assert.equal(normalizeCompanyName('Cia do Chocolate'), 'cia do chocolate');
  assert.equal(normalizeCompanyName('Companhia das Águas'), 'companhia das aguas');
});

// ─── 3. Guarda: núcleo nunca nasce vazio ─────────────────────────────────────────────────────────

test('nome que é SÓ sufixo não gera chave vazia e não serve de juiz de fusão', () => {
  assert.equal(normalizeCompanyName('LTDA.'), 'ltda', 'chave vazia fundiria com qualquer um');
  assert.equal(normalizeCompanyName('ME'), 'me');
  assert.equal(isDistinctiveCompanyNameCore(normalizeCompanyName('LTDA.')), false);
  assert.equal(isDistinctiveCompanyNameCore(normalizeCompanyName('ME')), false);
  assert.equal(normalizeCompanyName(''), '');
  assert.equal(normalizeCompanyName(null), '');
  assert.equal(normalizeCompanyName(undefined), '');
  assert.equal(isDistinctiveCompanyNameCore(''), false);
});

test('núcleo curto demais não é distintivo (piso de 4 caracteres)', () => {
  assert.equal(isDistinctiveCompanyNameCore(normalizeCompanyName('Zé LTDA')), false);
  assert.equal(isDistinctiveCompanyNameCore(normalizeCompanyName('Rinágua')), true);
  assert.equal(isDistinctiveCompanyNameCore(normalizeCompanyName('AGUA EM VALINHOS')), true);
});

// ─── 4. Vacina anti-cola: nome-núcleo igual NÃO é prova sozinho ──────────────────────────────────

test('empresas diferentes com o mesmo núcleo continuam com o mesmo núcleo — quem separa é o CNPJ', () => {
  // Documenta o risco: "AGUA MINERAL LTDA" e "AGUA MINERAL ME" viram o mesmo núcleo DE PROPÓSITO.
  // Por isso o merger só funde por nome sob cidade+UF iguais, e o CNPJ (chave absoluta) veta.
  assert.equal(normalizeCompanyName('AGUA MINERAL LTDA'), 'agua mineral');
  assert.equal(normalizeCompanyName('AGUA MINERAL ME'), 'agua mineral');
});
