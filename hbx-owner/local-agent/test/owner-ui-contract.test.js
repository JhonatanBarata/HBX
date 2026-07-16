"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("painel da fábrica usa os campos reais do backend", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const start = source.indexOf("async function fabRender()");
  const end = source.indexOf("async function fabStart()", start);
  const render = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "fabRender deve existir");
  assert.match(render, /set\("#fab-current", r\.lastLeadId\)/);
  assert.match(render, /set\("#fab-errors", r\.lastError\)/);
  assert.doesNotMatch(render, /r\.currentLead|r\.current\b|r\.errors\b/);
  assert.match(html, /<span class="label">Último lead<\/span><strong id="fab-current"/);
  assert.match(html, /<span class="label">Último erro<\/span><strong id="fab-errors"/);
});
