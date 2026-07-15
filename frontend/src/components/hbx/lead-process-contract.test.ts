import assert from "node:assert/strict";
import test from "node:test";

import {
  canRevealLeadContacts,
  sanitizeLeadProcessSnapshot,
  type LeadProcessSnapshot,
} from "./lead-process-contract.ts";

function snapshot(overrides: Partial<LeadProcessSnapshot> = {}): LeadProcessSnapshot {
  return {
    operationId: "run-safe",
    mode: "claim",
    status: "running",
    internalStatus: "validating",
    progress: 20,
    stages: [],
    counters: {},
    currentLead: null,
    recentLeads: [],
    events: [],
    ...overrides,
  };
}

test("pré-débito preserva a empresa e elimina somente contatos e blobs do snapshot", () => {
  const unsafe = snapshot({
    currentLead: {
      id: "lead-real-123",
      name: "Empresa Real Ltda",
      city: "Cidade Real",
      state: "SP",
      segment: "Segmento Real",
      phone: "11999990000",
      email: "real@empresa.test",
      website: "https://empresa.test",
      cnpj: "00.000.000/0001-00",
      ownerName: "Pessoa Real",
      metadataJson: { rawHtml: "SEGREDO-HTML" },
    } as never,
    recentLeads: [{ name: "Outra Empresa Real", city: "Outra Cidade", phone: "1133334444" }],
    stages: [{ key: "validating", label: "Validando Empresa Real", detail: "CNPJ 00.000.000/0001-00", status: "running" }],
    events: [{ key: "claim.validating", label: "Empresa Real localizada", detail: { message: "Telefone 11999990000" } }],
  });

  const safe = sanitizeLeadProcessSnapshot(unsafe);
  const serialized = JSON.stringify(safe);
  for (const forbidden of [
    "11999990000",
    "real@empresa.test",
    "empresa.test",
    "00.000.000/0001-00",
    "Pessoa Real",
    "SEGREDO-HTML",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(canRevealLeadContacts(safe), false);
  assert.equal(safe?.currentLead?.name, "Empresa Real Ltda");
  assert.equal(safe?.currentLead?.city, "Cidade Real");
  assert.equal(safe?.currentLead?.id, "lead-real-123");
  assert.equal(safe?.stages[0]?.detail, null);
  assert.equal(safe?.events[0]?.detail, null);
});

test("busca projeta a empresa, mas nunca projeta contatos", () => {
  const safe = sanitizeLeadProcessSnapshot(snapshot({
    mode: "search",
    status: "completed",
    internalStatus: "completed",
    currentLead: {
      name: "Lead da busca",
      city: "Fortaleza",
      status: "discarded",
      phone: "85999990000",
      detail: "Telefone 85999990000 compartilhado por 37 empresas",
    },
  }));
  assert.equal(canRevealLeadContacts(safe), false);
  assert.equal(safe?.currentLead?.name, "Lead da busca");
  assert.equal(safe?.currentLead?.city, "Fortaleza");
  assert.equal(JSON.stringify(safe).includes("85999990000"), false);
  assert.equal(safe?.currentLead?.detail, "Não passou pelos critérios desta busca");
});

test("estorno pendente, confirmado ou falha vencem etapas antigas concluídas", () => {
  const oldDoneStages = [
    { key: "credit_debited", label: "Crédito", status: "completed" },
    { key: "base_revealed", label: "Base", status: "completed" },
  ];
  for (const state of [
    { internalStatus: "refund_pending" },
    { internalStatus: "refunded", creditRefundConfirmed: true, contactAccessRevoked: true },
    { internalStatus: "completed", status: "failed" as const },
  ]) {
    const safe = sanitizeLeadProcessSnapshot(snapshot({
      ...state,
      stages: oldDoneStages,
      currentLead: { name: "Não pode reaparecer", phone: "11988887777", email: "revogado@test.local" },
    }));
    assert.equal(canRevealLeadContacts(safe), false);
    assert.equal(JSON.stringify(safe).includes("11988887777"), false);
    assert.equal(JSON.stringify(safe).includes("revogado@test.local"), false);
  }
});

test("status completed legado sem contactAccessGranted nunca libera dados", () => {
  const safe = sanitizeLeadProcessSnapshot(snapshot({
    status: "completed",
    internalStatus: "completed",
    stages: [
      { key: "credit_debited", label: "Crédito", status: "completed" },
      { key: "base_revealed", label: "Base", status: "completed" },
    ],
    currentLead: { name: "Resposta legada", phone: "11977776666" },
  }));
  assert.equal(canRevealLeadContacts(safe), false);
  assert.equal(safe?.currentLead?.name, "Resposta legada");
  assert.equal(JSON.stringify(safe).includes("11977776666"), false);
});

test("pós-débito e base liberada preserva até três telefones e três e-mails", () => {
  const safe = sanitizeLeadProcessSnapshot(snapshot({
    contactAccessGranted: true,
    internalStatus: "base_revealed",
    stages: [
      { key: "credit_debited", label: "Crédito", status: "completed" },
      { key: "base_revealed", label: "Base", status: "completed" },
    ],
    currentLead: {
      id: "lead-pago",
      name: "Empresa adquirida",
      phoneContacts: [
        { value: "1133330002", source: "rfb_secondary", whatsappStatus: "not_applicable", rank: 2 },
        { value: "11911110001", source: "rfb_primary", whatsappStatus: "confirmed", rank: 1 },
        { value: "11911110004", source: "google", rank: 4 },
        { value: "11911110003", source: "brave", whatsappStatus: "unchecked", rank: 3 },
      ],
      emailContacts: [
        { value: "um@empresa.test", source: "rfb_email" },
        { value: "dois@empresa.test", source: "brave" },
        { value: "tres@empresa.test", source: "google" },
        { value: "quatro@empresa.test", source: "google" },
      ],
    },
  }));
  assert.equal(canRevealLeadContacts(safe), true);
  assert.deepEqual(safe?.currentLead?.phoneContacts?.map(contact => contact.value), [
    "11911110001",
    "1133330002",
    "11911110003",
  ]);
  assert.equal(safe?.currentLead?.phoneContacts?.[1]?.whatsappStatus, "not_applicable");
  assert.deepEqual(safe?.currentLead?.emailContacts?.map(contact => contact.value), [
    "um@empresa.test",
    "dois@empresa.test",
    "tres@empresa.test",
  ]);
});
