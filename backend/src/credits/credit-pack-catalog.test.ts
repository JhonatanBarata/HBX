import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCreditExpiryDefaultOverride,
  applyCreditPackOverrides,
  applyWelcomeCreditsOverride,
  applyWelcomeExpiryDaysOverride,
  buildCreditPacksCatalog,
  clearCreditPackOverrides,
  computeDefaultExpiresAt,
  computeWelcomeExpiresAt,
  CREDIT_PACK_KEYS,
  getCreditExpiryDefaultDays,
  getCreditPackDefinition,
  getWelcomeCreditsDefault,
  getWelcomeExpiryDaysDefault,
  isCreditPackPaused,
  listCreditPackKeys,
  normalizeCreditPackKey,
} from './credit-pack-catalog';

// CRÉDITOS S3-PARTE1 — catálogo de pacotes. Testes obrigatórios do escopo: base sozinha
// (sem overlay) devolve os defaults de código; override aplicado GANHA por campo; overlay
// limpo volta pra base; expiração default global segue o mesmo padrão override>base.

test.beforeEach(() => {
  clearCreditPackOverrides();
});

test('base sozinha (sem overlay): 3 pacotes fixos com os defaults de código', () => {
  const catalog = buildCreditPacksCatalog();
  assert.equal(catalog.length, 3);
  const keys = catalog.map((p) => p.key);
  assert.deepEqual(keys, [CREDIT_PACK_KEYS.STARTER, CREDIT_PACK_KEYS.GROWTH, CREDIT_PACK_KEYS.SCALE]);
  const starter = catalog.find((p) => p.key === CREDIT_PACK_KEYS.STARTER)!;
  assert.equal(starter.credits, 100);
  assert.equal(starter.price, 97.0);
  assert.equal(starter.status, 'available');
});

test('override aplicado GANHA da base (preço/créditos/título/status)', () => {
  applyCreditPackOverrides([
    {
      packKey: CREDIT_PACK_KEYS.STARTER,
      override: { price: 149.9, credits: 250, title: 'Starter Promo', status: 'paused' },
    },
  ]);
  const def = getCreditPackDefinition(CREDIT_PACK_KEYS.STARTER)!;
  assert.equal(def.price, 149.9);
  assert.equal(def.credits, 250);
  assert.equal(def.title, 'Starter Promo');
  assert.equal(def.status, 'paused');
  assert.equal(isCreditPackPaused(CREDIT_PACK_KEYS.STARTER), true);

  // Pacotes NÃO tocados pelo override continuam na base.
  const growth = getCreditPackDefinition(CREDIT_PACK_KEYS.GROWTH)!;
  assert.equal(growth.price, 247.0);
  assert.equal(growth.status, 'available');
});

test('override parcial: só os campos presentes no override substituem; o resto segue a base', () => {
  applyCreditPackOverrides([
    { packKey: CREDIT_PACK_KEYS.GROWTH, override: { price: 199.0 } },
  ]);
  const def = getCreditPackDefinition(CREDIT_PACK_KEYS.GROWTH)!;
  assert.equal(def.price, 199.0);
  // credits/title/defaultExpiryDays não foram tocados pelo override -> seguem a base.
  assert.equal(def.credits, 300);
  assert.equal(def.title, 'Pacote Growth');
});

test('pacote pausado some do catálogo público (includePaused: false) mas aparece p/ master', () => {
  applyCreditPackOverrides([{ packKey: CREDIT_PACK_KEYS.SCALE, override: { status: 'paused' } }]);
  const publicCatalog = buildCreditPacksCatalog();
  assert.equal(publicCatalog.some((p) => p.key === CREDIT_PACK_KEYS.SCALE), false);

  const masterCatalog = buildCreditPacksCatalog({ includePaused: true });
  assert.equal(masterCatalog.some((p) => p.key === CREDIT_PACK_KEYS.SCALE), true);
});

test('clearCreditPackOverrides: volta a base inteira (overlay + expiração default)', () => {
  applyCreditPackOverrides([{ packKey: CREDIT_PACK_KEYS.STARTER, override: { price: 1 } }]);
  applyCreditExpiryDefaultOverride(30);
  assert.equal(getCreditPackDefinition(CREDIT_PACK_KEYS.STARTER)!.price, 1);
  assert.equal(getCreditExpiryDefaultDays(), 30);

  clearCreditPackOverrides();
  assert.equal(getCreditPackDefinition(CREDIT_PACK_KEYS.STARTER)!.price, 97.0);
  assert.equal(getCreditExpiryDefaultDays(), 90);
});

test('normalizeCreditPackKey: só aceita as 3 chaves fixas; qualquer outra vira null', () => {
  assert.equal(normalizeCreditPackKey('starter'), CREDIT_PACK_KEYS.STARTER);
  assert.equal(normalizeCreditPackKey('GROWTH'), CREDIT_PACK_KEYS.GROWTH);
  assert.equal(normalizeCreditPackKey('scale'), CREDIT_PACK_KEYS.SCALE);
  assert.equal(normalizeCreditPackKey('nao-existe'), null);
  assert.equal(normalizeCreditPackKey(''), null);
  assert.equal(normalizeCreditPackKey(undefined), null);
});

test('listCreditPackKeys: ordem fixa starter -> growth -> scale', () => {
  assert.deepEqual(listCreditPackKeys(), [CREDIT_PACK_KEYS.STARTER, CREDIT_PACK_KEYS.GROWTH, CREDIT_PACK_KEYS.SCALE]);
});

test('expiração default global: sem override usa 90 dias; override troca o prazo usado por computeDefaultExpiresAt', () => {
  assert.equal(getCreditExpiryDefaultDays(), 90);
  const now = new Date('2026-07-04T00:00:00.000Z');
  const expires90 = computeDefaultExpiresAt(now);
  assert.equal(expires90.getTime() - now.getTime(), 90 * 24 * 60 * 60 * 1000);

  applyCreditExpiryDefaultOverride(15);
  assert.equal(getCreditExpiryDefaultDays(), 15);
  const expires15 = computeDefaultExpiresAt(now);
  assert.equal(expires15.getTime() - now.getTime(), 15 * 24 * 60 * 60 * 1000);
});

test('override com valor invalido (nao numerico/negativo) e ignorado, mantem a base', () => {
  applyCreditPackOverrides([
    { packKey: CREDIT_PACK_KEYS.STARTER, override: { price: NaN as any, credits: -5 } },
  ]);
  const def = getCreditPackDefinition(CREDIT_PACK_KEYS.STARTER)!;
  // price NaN e rejeitado pelo filtro Number.isFinite -> mantém base.
  assert.equal(def.price, 97.0);
  // credits negativo é clampado para 0 (toCreditInt usa Math.max(0, ...)).
  assert.equal(def.credits, 0);
});

// ─── CRÉDITOS A3 — lote grátis de boas-vindas (config global) ───────────────────────────────────

test('lote de boas-vindas: sem override usa os defaults de código (30 créditos / 30 dias)', () => {
  assert.equal(getWelcomeCreditsDefault(), 30);
  assert.equal(getWelcomeExpiryDaysDefault(), 30);
});

test('lote de boas-vindas: override do master GANHA da base (quantidade e validade)', () => {
  applyWelcomeCreditsOverride(50);
  applyWelcomeExpiryDaysOverride(60);
  assert.equal(getWelcomeCreditsDefault(), 50);
  assert.equal(getWelcomeExpiryDaysDefault(), 60);
});

test('lote de boas-vindas: override invalido (<=0/NaN) e ignorado, mantem o default de codigo', () => {
  applyWelcomeCreditsOverride(NaN);
  applyWelcomeExpiryDaysOverride(-10);
  assert.equal(getWelcomeCreditsDefault(), 30);
  assert.equal(getWelcomeExpiryDaysDefault(), 30);
});

test('computeWelcomeExpiresAt: agora + validade default (30d) quando sem override', () => {
  const now = new Date('2026-07-05T00:00:00.000Z');
  const expires = computeWelcomeExpiresAt(now);
  assert.equal(expires.getTime() - now.getTime(), 30 * 24 * 60 * 60 * 1000);
});

test('computeWelcomeExpiresAt: usa o override do master quando presente (ex.: 15 dias)', () => {
  applyWelcomeExpiryDaysOverride(15);
  const now = new Date('2026-07-05T00:00:00.000Z');
  const expires = computeWelcomeExpiresAt(now);
  assert.equal(expires.getTime() - now.getTime(), 15 * 24 * 60 * 60 * 1000);
});

test('clearCreditPackOverrides tambem limpa os overrides do lote de boas-vindas', () => {
  applyWelcomeCreditsOverride(99);
  applyWelcomeExpiryDaysOverride(99);
  clearCreditPackOverrides();
  assert.equal(getWelcomeCreditsDefault(), 30);
  assert.equal(getWelcomeExpiryDaysDefault(), 30);
});
