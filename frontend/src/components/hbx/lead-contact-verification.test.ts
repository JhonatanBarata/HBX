import assert from "node:assert/strict";
import test from "node:test";

import { whatsappIsExplicitlyConfirmed } from "./lead-contact-verification.ts";

test("kind whatsapp não prova verificação", () => {
  assert.equal(whatsappIsExplicitlyConfirmed({ kind: "whatsapp", value: "(11) 99999-0000" }, {}), false);
  assert.equal(whatsappIsExplicitlyConfirmed({ kind: "whatsapp", value: "(11) 99999-0000", whatsappStatus: "active" }, {}), false);
});

test("somente confirmação explícita ou mapa verdadeiro habilita WhatsApp", () => {
  for (const whatsappStatus of ["confirmed", "verified", "valid"] as const) {
    assert.equal(whatsappIsExplicitlyConfirmed({ value: "11999990000", whatsappStatus }, {}), true);
  }
  assert.equal(whatsappIsExplicitlyConfirmed({ value: "11999990000", whatsappConfirmed: true }, {}), true);
  assert.equal(whatsappIsExplicitlyConfirmed({ value: "(11) 99999-0000" }, { "11999990000": true }), true);
  assert.equal(whatsappIsExplicitlyConfirmed({ value: "11999990000", whatsappStatus: "unchecked" }, {}), false);
});
