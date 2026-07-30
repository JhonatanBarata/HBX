"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseJournal } = require("../lib/state");

test("parseJournal distingue JSON válido de journal corrompido", () => {
  assert.deepEqual(parseJournal('{"manualEnabled":false}'), {
    status: "valid",
    data: { manualEnabled: false },
  });
  assert.deepEqual(parseJournal('{"manualEnabled":'), {
    status: "corrupt",
    data: null,
  });
});

// Regressão 30/07: boot.json é escrito por PowerShell 5.1, cujo `-Encoding utf8` grava COM BOM.
// O BOM fazia JSON.parse estourar → journal "corrupt" → painel preso em "sem boot json" (bolinhas
// Windows/Ollama/painel cinzas pra sempre, sem nenhum erro visível).
test("parseJournal tolera BOM do PowerShell — journal válido não pode virar 'corrupt' por causa do ﻿", () => {
  assert.deepEqual(parseJournal('﻿{"windows":true,"agent":true,"ollama":false}'), {
    status: "valid",
    data: { windows: true, agent: true, ollama: false },
  });
  // BOM sozinho continua corrompido (não vira {} silencioso).
  assert.equal(parseJournal("﻿").status, "corrupt");
});
