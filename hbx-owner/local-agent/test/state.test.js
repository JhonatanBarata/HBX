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
