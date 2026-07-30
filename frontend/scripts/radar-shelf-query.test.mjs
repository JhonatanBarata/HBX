// Testes do incidente 30/07 (3 defeitos da tela /leads) — rodar:
//   cd frontend && node --test scripts/radar-shelf-query.test.mjs
// Cada teste grita a cena real que o dono viu em produção.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShelfGeoTargets,
  buildShelfRequests,
  deriveRadarBackendMessage,
  mergeShelfResults,
  MAX_SHELF_CITY_TARGETS,
  SHELF_AGGREGATE_CAP,
} from "../src/lib/radar-shelf-query.mjs";

// ── DEFEITO 3 (o pior): resultado de uma busca sob o filtro de outra ─────────

test("pré-hidratação NUNCA consulta: filtros salvos ainda não restaurados => nenhum request", () => {
  const reqs = buildShelfRequests({
    hydrated: false,
    segment: "",
    uf: "",
    geoMode: "cities",
    cities: [],
    limit: 25,
    page: 1,
  });
  // Era este null que faltava: o mount consultava com segment=""/cities=[] e a
  // vitrine servia 25 RESTAURANTES de 15/07 sob "distribuidora de água / DDD 19"
  // — e puxar um deles debitava crédito NOVO por lead do segmento errado.
  assert.equal(reqs, null);
});

test("recorte A vai em TODAS as consultas: cada cidade leva segment + city + state", () => {
  const reqs = buildShelfRequests({
    hydrated: true,
    segment: "distribuidora de água",
    uf: "SP",
    geoMode: "ddd",
    cities: ["Americana", "Campinas", "Cosmópolis"],
    limit: 25,
    page: 1,
  });
  assert.equal(reqs.length, 3);
  for (const params of reqs) {
    // run de filtro A jamais renderiza sob filtro B
    assert.equal(params.get("segment"), "distribuidora de água");
    assert.ok(params.get("city"));
    assert.equal(params.get("state"), "SP");
    assert.equal(params.get("scope"), "vitrine");
  }
});

test("tela SEM recorte nenhum (usuário novo, já hidratado) ainda pode consultar 1 página geral", () => {
  const reqs = buildShelfRequests({
    hydrated: true,
    segment: "",
    uf: "",
    geoMode: "cities",
    cities: [],
    limit: 25,
    page: 1,
  });
  assert.equal(reqs.length, 1);
  // permitido só quando o CAMPO da tela está vazio de verdade
  assert.equal(reqs[0].get("segment"), null);
  assert.equal(reqs[0].get("city"), null);
});

test("paginação agregada (multi-cidade) fica dentro do teto do backend", () => {
  const cities = Array.from({ length: 14 }, (_, index) => `Cidade ${index + 1}`);
  const reqs = buildShelfRequests({
    hydrated: true,
    segment: "distribuidora de água",
    uf: "SP",
    geoMode: "ddd",
    cities,
    limit: 25,
    page: 40, // 40 × 25 = 1000 > 300
  });
  assert.equal(reqs.length, 14);
  for (const params of reqs) {
    assert.equal(params.get("page"), "1");
    assert.equal(Number(params.get("limit")), SHELF_AGGREGATE_CAP);
  }
});

test("alvos geográficos: dedupe por acento/caixa e teto por modo", () => {
  const targets = buildShelfGeoTargets({
    geoMode: "ddd",
    uf: "sp",
    cities: ["Cosmópolis", "cosmopolis", "  ", "Campinas"],
  });
  assert.deepEqual(targets, [
    { city: "Cosmópolis", state: "SP" },
    { city: "Campinas", state: "SP" },
  ]);
  const many = buildShelfGeoTargets({
    geoMode: "cities",
    uf: "SP",
    cities: Array.from({ length: 30 }, (_, index) => `Cidade ${index + 1}`),
  });
  assert.equal(many.length, MAX_SHELF_CITY_TARGETS);
  const radius = buildShelfGeoTargets({ geoMode: "radius", uf: "SP", cities: ["A", "B"] });
  assert.equal(radius.length, 1);
});

// ── DEFEITO 2: "Parar" matava 41 achados com um "Erro 500" ───────────────────

test("1 falha em 14 NÃO derruba tudo: aproveita as que vieram e marca partial", () => {
  const merged = mergeShelfResults([
    { status: "fulfilled", value: { items: [{ id: "a" }], total: 1 } },
    { status: "rejected", reason: new Error("Erro 500") },
    { status: "fulfilled", value: { items: [{ id: "b" }], total: 1 } },
  ]);
  // "Erro 500" + "0 de 0" com 41 achados vivos no banco era isso
  assert.equal(merged.ok, true);
  assert.equal(merged.partial, true);
  assert.equal(merged.responses.length, 2);
  assert.equal(merged.error, null);
});

test("ok=false SÓ quando TODAS falham — e é esse ok que autoriza apagar o resultado vivo", () => {
  const merged = mergeShelfResults([
    { status: "rejected", reason: new Error("Erro 500") },
    { status: "rejected", reason: new Error("Erro 500") },
  ]);
  // com ok=false a tela MANTÉM liveRunItems (os 41) em vez de "Erro 500 / 0 de 0"
  assert.equal(merged.ok, false);
  assert.match(merged.error, /Erro 500/);
  assert.equal(merged.responses.length, 0);
});

test("todas deram certo: ok=true sem partial", () => {
  const merged = mergeShelfResults([
    { status: "fulfilled", value: { items: [], total: 0 } },
  ]);
  assert.equal(merged.ok, true);
  assert.equal(merged.partial, false);
});

// ── DEFEITO 1: cartão do Radar mentindo o status ─────────────────────────────

test("sessão CANCELADA + corrida nova = o cartão NÃO exibe a frase velha", () => {
  const msg = deriveRadarBackendMessage({
    sessionStatus: "canceled",
    sessionMessage: "Busca cancelada pelo usuário.",
    runOperationalMessage: null,
    runMessage: null,
  });
  // o selo verde FUNCIONANDO nunca mais leva legenda de sessão morta
  assert.notEqual(msg, "Busca cancelada pelo usuário.");
  assert.equal(msg, "");
});

test("sessão VIVA continua mandando na legenda", () => {
  const msg = deriveRadarBackendMessage({
    sessionStatus: "running",
    sessionMessage: "Buscando em Americana/SP (1 de 14).",
    runOperationalMessage: "outra coisa",
    runMessage: null,
  });
  assert.equal(msg, "Buscando em Americana/SP (1 de 14).");
});

test("sessão pausada é viva; sem sessão, fala o run", () => {
  assert.equal(
    deriveRadarBackendMessage({ sessionStatus: "paused", sessionMessage: "Pausada." }),
    "Pausada.",
  );
  assert.equal(
    deriveRadarBackendMessage({
      sessionStatus: null,
      sessionMessage: null,
      runOperationalMessage: "Enriquecendo 12 leads…",
      runMessage: "run msg",
    }),
    "Enriquecendo 12 leads…",
  );
});
