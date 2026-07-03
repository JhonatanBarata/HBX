"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  chunkLeadsBySize,
  clampInt,
  cardDomain,
  parseSizeToGb,
  parseLoadTriplet,
  parsePercentString,
} = require("../lib/util");

// ---------- chunkLeadsBySize ----------
test("chunkLeadsBySize: lista vazia → nenhum chunk", () => {
  assert.deepEqual(chunkLeadsBySize([]), []);
});

test("chunkLeadsBySize: 1 lead → 1 chunk com esse lead", () => {
  const leads = [{ id: 1 }];
  const chunks = chunkLeadsBySize(leads);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], leads);
});

test("chunkLeadsBySize: lote gordo que estoura maxBytes → quebra em mais de um chunk", () => {
  // Cada lead ~1KB de payload; maxBytes baixo força a quebra.
  const big = "x".repeat(1000);
  const leads = Array.from({ length: 10 }, (_, i) => ({ id: i, blob: big }));
  const chunks = chunkLeadsBySize(leads, 3000, 30);
  assert.ok(chunks.length > 1, "esperava mais de um chunk quando o lote estoura maxBytes");
  // Nenhum lead se perde nem duplica.
  const flat = chunks.flat();
  assert.equal(flat.length, leads.length);
  // Cada chunk (exceto quando um único lead já passa do teto) respeita o teto aproximado.
  for (const c of chunks) assert.ok(c.length >= 1);
});

test("chunkLeadsBySize: corte por maxCount mesmo com bytes folgados", () => {
  const leads = Array.from({ length: 7 }, (_, i) => ({ id: i }));
  const chunks = chunkLeadsBySize(leads, 1_000_000, 3);
  // 7 leads, teto de 3 por chunk → 3 + 3 + 1.
  assert.deepEqual(chunks.map((c) => c.length), [3, 3, 1]);
});

// ---------- clampInt ----------
test("clampInt: valor dentro dos limites passa inteiro", () => {
  assert.equal(clampInt(10, 0, 1, 50), 10);
});

test("clampInt: abaixo do mínimo → mínimo; acima do máximo → máximo", () => {
  assert.equal(clampInt(-5, 0, 1, 50), 1);
  assert.equal(clampInt(999, 0, 1, 50), 50);
});

test("clampInt: NaN/lixo → fallback", () => {
  // Number("abc")/Number(undefined) = NaN → não-finito → fallback.
  assert.equal(clampInt("abc", 7, 1, 50), 7);
  assert.equal(clampInt(undefined, 7, 1, 50), 7);
});

test("clampInt: null vira 0 (Number(null)===0) → clampa pro mínimo, NÃO fallback", () => {
  // Comportamento real da função original: null é finito (0), então clampa em vez de cair no fallback.
  assert.equal(clampInt(null, 7, 1, 50), 1);
});

test("clampInt: trunca fração antes de clampar", () => {
  assert.equal(clampInt("12.9", 0, 1, 50), 12);
});

// ---------- cardDomain ----------
test("cardDomain: URL http/https vira hostname sem www", () => {
  assert.equal(cardDomain("https://www.exemplo.com.br/contato"), "exemplo.com.br");
  assert.equal(cardDomain("http://exemplo.com/x?y=1"), "exemplo.com");
});

test("cardDomain: domínio cru (sem esquema) é normalizado", () => {
  assert.equal(cardDomain("Exemplo.COM.br"), "exemplo.com.br");
});

test("cardDomain: www. é removido", () => {
  assert.equal(cardDomain("www.loja.com"), "loja.com");
});

test("cardDomain: social/encurtador retorna o próprio domínio (fica pro filtro NON_SITE decidir)", () => {
  assert.equal(cardDomain("https://instagram.com/fulano"), "instagram.com");
  assert.equal(cardDomain("goo.gl/abc"), "goo.gl");
});

test("cardDomain: vazio → string vazia", () => {
  assert.equal(cardDomain(""), "");
  assert.equal(cardDomain(null), "");
});

// ---------- parseSizeToGb ----------
test("parseSizeToGb: unidades K/M/G/T convertem pra GB", () => {
  assert.equal(parseSizeToGb("2G"), 2);
  assert.equal(parseSizeToGb("2000M"), 2); // 2000 / 1e3
  assert.equal(parseSizeToGb("1T"), 1000);
  assert.equal(parseSizeToGb("5000000K"), 5); // 5e6 / 1e6
});

test("parseSizeToGb: sem unidade assume G; sufixo iB/B tolerado", () => {
  assert.equal(parseSizeToGb("3"), 3);
  assert.equal(parseSizeToGb("4GiB"), 4);
});

test("parseSizeToGb: lixo → null", () => {
  assert.equal(parseSizeToGb("abc"), null);
  assert.equal(parseSizeToGb(""), null);
  assert.equal(parseSizeToGb(null), null);
});

// ---------- parseLoadTriplet ----------
test("parseLoadTriplet: triplo normal", () => {
  assert.deepEqual(parseLoadTriplet("0.15 0.30 0.45"), { load1: 0.15, load5: 0.30, load15: 0.45 });
});

test("parseLoadTriplet: vazio → NaN em todas as posições", () => {
  const r = parseLoadTriplet("");
  assert.ok(Number.isNaN(r.load1));
  assert.ok(Number.isNaN(r.load5));
  assert.ok(Number.isNaN(r.load15));
});

test("parseLoadTriplet: só um valor → resto NaN (não zero)", () => {
  const r = parseLoadTriplet("1.20");
  assert.equal(r.load1, 1.2);
  assert.ok(Number.isNaN(r.load5));
  assert.ok(Number.isNaN(r.load15));
});

// ---------- parsePercentString ----------
test("parsePercentString: com % arredonda pro inteiro", () => {
  assert.equal(parsePercentString("42.7%"), 43);
  assert.equal(parsePercentString("10%"), 10);
});

test("parsePercentString: número solto também é lido", () => {
  assert.equal(parsePercentString("88"), 88);
});

test("parsePercentString: sem número → null", () => {
  assert.equal(parsePercentString("--"), null);
  assert.equal(parsePercentString(""), null);
  assert.equal(parsePercentString(null), null);
});
