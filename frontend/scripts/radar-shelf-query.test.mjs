// Testes do incidente 30/07 (3 defeitos da tela /leads) — rodar:
//   cd frontend && node --test scripts/radar-shelf-query.test.mjs
// Cada teste grita a cena real que o dono viu em produção.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRadarCityReport,
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

// ── LOTE 4 (17/08): o relatório por cidade que a tela nunca desenhou ─────────
// Cena de aceite do dono: "Valinhos/SP 11 (Receita 8 · Web 3)" e, logo abaixo,
// "Estiva Gerbi/SP 0 — sem base na Receita, web sem sinal local".

test("cidade com lanes: o número da tela é o foundCount, e a origem vem à parte", () => {
  const [linha] = buildRadarCityReport([
    { city: "Valinhos", state: "SP", status: "completed", runId: "run-1", foundCount: 11, rfbCount: 8, webCount: 3 },
  ]);
  assert.equal(linha.nome, "Valinhos/SP");
  assert.equal(linha.total, 11);
  assert.equal(linha.lanes, "Receita 8 · Web 3");
  assert.equal(linha.vazia, false);
  // O card individual (sourceChain) não muda; aqui é só o agregado por cidade.
  assert.equal(linha.motivo, null);
});

test("total NUNCA é rfb+web: o que sobra em 'outros' fica fora da copy, não do número", () => {
  const [linha] = buildRadarCityReport([
    // 11 salvos, mas 2 vieram do banco/histórico (lane 'outros', invisível na copy).
    { city: "Indaiatuba", state: "SP", status: "completed", foundCount: 11, rfbCount: 6, webCount: 3 },
  ]);
  assert.equal(linha.total, 11);
  assert.equal(linha.lanes, "Receita 6 · Web 3");
  assert.ok(!/outros/i.test(linha.lanes));
});

test("sessão SEM os campos novos mostra só o total — nunca 'Receita 0 · Web 0'", () => {
  const relatorio = buildRadarCityReport([
    // Cidade velha (sessão em voo no deploy): sem rfbCount/webCount.
    { city: "Holambra", state: "SP", status: "completed", foundCount: 4 },
    // A companheira zerada é o que faz a lista existir nesta sessão.
    { city: "Pinhal", state: "SP", status: "completed", foundCount: 0 },
  ]);
  assert.equal(relatorio[0].lanes, null, "ausência de dado não pode virar zero");
  assert.equal(relatorio[0].total, 4);
});

test("cidade zerada aparece MARCADA e com motivo derivado do que o run mediu", () => {
  const [linha] = buildRadarCityReport([
    {
      city: "Estiva Gerbi",
      state: "SP",
      status: "completed",
      foundCount: 0,
      rfbCount: 0,
      webCount: 0,
      rfbAvailable: 0,
    },
  ]);
  assert.equal(linha.vazia, true);
  assert.equal(linha.total, 0);
  // É esta a frase que o dono pediu: a cidade morta diz POR QUE morreu.
  assert.equal(linha.motivo, "sem base na Receita, web sem sinal local");
});

test("cidade com base na Receita mas sem web só acusa a web", () => {
  const [linha] = buildRadarCityReport([
    { city: "Hortolândia", state: "SP", status: "completed", foundCount: 0, rfbCount: 0, webCount: 0, rfbAvailable: 26 },
  ]);
  assert.equal(linha.motivo, "web sem sinal local");
});

test("mensagem do servidor tem PRECEDÊNCIA sobre o motivo derivado", () => {
  const [linha] = buildRadarCityReport([
    {
      city: "Aguaí",
      state: "SP",
      status: "failed",
      foundCount: 0,
      rfbAvailable: 0,
      webCount: 0,
      message: "Falha ao iniciar Aguaí: motor indisponível",
    },
  ]);
  assert.equal(linha.motivo, "Falha ao iniciar Aguaí: motor indisponível");
});

test("cidade PENDING fica fora da lista (a sessão nem chegou nela — não é zerada)", () => {
  const relatorio = buildRadarCityReport([
    { city: "Valinhos", state: "SP", status: "completed", foundCount: 11, rfbCount: 8, webCount: 3 },
    { city: "Mogi Guaçu", state: "SP", status: "pending" },
  ]);
  assert.equal(relatorio.length, 1);
  assert.equal(relatorio[0].nome, "Valinhos/SP");
});

test("sem lane e sem zerada a lista NÃO nasce (não repete o número do cabeçalho)", () => {
  const relatorio = buildRadarCityReport([
    { city: "Campinas", state: "SP", status: "completed", foundCount: 12 },
  ]);
  assert.deepEqual(relatorio, []);
});

test("1 cidade só COM lane já vale a lista: a origem é informação nova", () => {
  const relatorio = buildRadarCityReport([
    { city: "Valinhos", state: "SP", status: "completed", foundCount: 11, rfbCount: 8, webCount: 3 },
  ]);
  assert.equal(relatorio.length, 1);
});

test("entrada vazia/ausente => [] (tela sem sessão não quebra)", () => {
  assert.deepEqual(buildRadarCityReport(undefined), []);
  assert.deepEqual(buildRadarCityReport(null), []);
  assert.deepEqual(buildRadarCityReport([]), []);
});

test("chave da linha é estável e não colide entre cidades homônimas", () => {
  const relatorio = buildRadarCityReport([
    { city: "Valinhos", state: "SP", status: "completed", runId: "run-1", foundCount: 0 },
    { city: "Valinhos", state: "MG", status: "completed", runId: "run-2", foundCount: 0 },
  ]);
  assert.equal(new Set(relatorio.map(linha => linha.key)).size, 2);
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
