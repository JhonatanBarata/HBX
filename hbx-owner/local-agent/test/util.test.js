"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  clampInt,
  cardDomain,
  parseSizeToGb,
  parseLoadTriplet,
  parsePercentString,
  httpModuleForUrl,
} = require("../lib/util");

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

// ---------- httpModuleForUrl (BUG D1: ponte 30B→VPS quebrava por http.request fixo) ----------
test("httpModuleForUrl: https:// escolhe o módulo https com porta-default 443", () => {
  const { mod, defaultPort } = httpModuleForUrl(new URL("https://api.hbxsystem.com.br/modules/owner/missions/lease"));
  assert.equal(mod, require("https"));
  assert.equal(defaultPort, 443);
});

test("httpModuleForUrl: http:// escolhe o módulo http com porta-default 80", () => {
  const { mod, defaultPort } = httpModuleForUrl(new URL("http://127.0.0.1:3000/auth/login"));
  assert.equal(mod, require("http"));
  assert.equal(defaultPort, 80);
});

test("httpModuleForUrl: sem target (URL inválida upstream) cai no default http/80, nunca lança", () => {
  const { mod, defaultPort } = httpModuleForUrl(null);
  assert.equal(mod, require("http"));
  assert.equal(defaultPort, 80);
});
