"use strict";

// Testes da E2b (HBX-OWNER-V3, agent) — contra as funções PURAS de lib/owner-v3.js. server.js faz o
// I/O real (backend/ops/ponte/local-deep/docker) e não é testável em unidade sem framework de DI; a
// MONTAGEM do overview, problems[] e a verificação pós-switch (lei nº3) são puras e vivem lá — este
// arquivo cobre exatamente essas funções, do jeito que o contrato pede.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const ownerV3 = require("../lib/owner-v3");

// ── fixtures pequenas, reusadas entre testes ──────────────────────────────────────────────────────

function okIa(overrides = {}) {
  return { on: true, warm: true, busy: false, model: "qwen3:30b-a3b-instruct", ramMb: 19260, reason: null, ...overrides };
}
function okEnriquecimento(overrides = {}) {
  return { on: true, reason: null, dependsOn: "ia", queuedDue: 10, oldestAgeMin: 5, ratePerHour: 30, ...overrides };
}
function okScrapingEnv(overrides = {}) {
  return {
    on: true, known: true, reason: null, running: true, budget: 1000, processed: 412,
    contactsWritten: 561, lastError: null, rfbBaseCount: 28_000_000, ...overrides,
  };
}

// ═══ 1. overview com uma fonte morta NÃO derruba as outras (Promise.allSettled + known:false) ═════

test("overview com backend LOCAL morto: ok:true global, scraping.local.known:false + reason, e vira problema (fonte morta não derruba a tela)", () => {
  const statusRead = ownerV3.classifyBackendRead({ ok: false, error: "ECONNREFUSED" }, "fabrica_rota_ausente");
  const energiaRead = ownerV3.classifyBackendRead({ ok: false, error: "ECONNREFUSED" }, "rota_energia_ausente");
  assert.equal(statusRead.known, false);
  assert.equal(statusRead.reason, "backend_indisponivel");

  const scrapingLocal = ownerV3.buildScrapingEnv(statusRead, energiaRead);
  assert.equal(scrapingLocal.known, false);
  assert.equal(scrapingLocal.reason, "backend_indisponivel");
  assert.equal(scrapingLocal.on, false);

  const overview = ownerV3.buildOverview({
    scrapingLocal, scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
  });

  // A fonte morta não derruba o resto: overview continua ok:true e a VPS (fonte viva) aparece normal.
  assert.equal(overview.ok, true);
  assert.equal(overview.switches.scraping.local.known, false);
  assert.equal(overview.switches.scraping.vps.known, true);
  assert.equal(overview.switches.scraping.vps.on, true);

  const problem = overview.problems.find((p) => p.id === "backend_sem_resposta");
  assert.ok(problem, "esperava o problema backend_sem_resposta na faixa");
  assert.equal(problem.severity, "error");
  assert.ok(problem.action, "backend_sem_resposta precisa de ação (religar)");
});

// ═══ 2. /energia 404 → reason nomeado, nunca on:false "lido" por engano ════════════════════════════

test("overview com GET /energia devolvendo 404: reason vira 'rota_energia_ausente', nunca on chutado", () => {
  const statusRead = ownerV3.classifyBackendRead({ ok: true, statusCode: 200, data: { supported: true, running: false, budget: 0, processed: 0, contactsWritten: 0, lastError: null, rfbBaseCount: 28_000_000 } }, "fabrica_rota_ausente");
  const energiaRead = ownerV3.classifyBackendRead({ ok: false, statusCode: 404 }, "rota_energia_ausente");

  assert.equal(statusRead.known, true);
  assert.equal(energiaRead.known, false);
  assert.equal(energiaRead.reason, "rota_energia_ausente");

  const scrapingLocal = ownerV3.buildScrapingEnv(statusRead, energiaRead);
  assert.equal(scrapingLocal.known, false);
  assert.equal(scrapingLocal.reason, "rota_energia_ausente");
  // known:false: o "on" não pode ser lido como um valor real (não é "sei que está desligado").
  assert.equal(scrapingLocal.on, false);
});

test("classifyOpsRead: 404 na rota nova do ops-control vira known:false com o reason do chamador (gap documentado)", () => {
  const read = ownerV3.classifyOpsRead({ ok: false, configured: true, statusCode: 404, data: null }, "ops_rota_fabrica_ausente");
  assert.equal(read.known, false);
  assert.equal(read.reason, "ops_rota_fabrica_ausente");
});

// Regressão 30/07: o ops-control responde `{ ok:true, data:{...} }` (contrato dele) e opsRequest entrega
// o corpo INTEIRO. Sem desempacotar, buildScrapingEnv lia `envelope.enabled` (undefined) e o painel
// pintava "energia_desligada" com a VPS LIGADA — o dono clicava "Religar" e recebia "releitura discorda".
test("classifyOpsRead: desembrulha o envelope {ok,data} do ops-control — energia LIGADA na VPS não pode virar 'desligada'", () => {
  const energiaR = { ok: true, configured: true, statusCode: 200, data: { ok: true, data: { supported: true, enabled: true, forcedOn: false, key: "main", unavailableReason: null } } };
  const statusR = { ok: true, configured: true, statusCode: 200, data: { ok: true, data: { supported: true, running: true, budget: 1000, processed: 250, contactsWritten: 300, lastError: null, rfbBaseCount: 28_437_967 } } };

  const energiaRead = ownerV3.classifyOpsRead(energiaR, "ops_rota_fabrica_ausente");
  assert.equal(energiaRead.known, true);
  assert.equal(energiaRead.data.enabled, true, "o dado tem que vir de dentro do envelope");

  const env = ownerV3.buildScrapingEnv(ownerV3.classifyOpsRead(statusR, "x"), energiaRead);
  assert.equal(env.on, true, "VPS ligada tem que ler LIGADA");
  assert.equal(env.reason, null);
  assert.equal(env.running, true);
  assert.equal(env.processed, 250, "os números do status também vinham do envelope errado");
  assert.equal(env.rfbBaseCount, 28_437_967);
});

// Regressão 30/07 (a que escapou da primeira varredura): eu desembrulhei o envelope do ops-control em
// classifyOpsRead e DEIXEI o "Rodar corrida" da VPS lendo `envelope.started` — undefined. Resultado:
// o painel gritou falha com a corrida RODANDO de verdade ("deu erro mas continuou"). O desembrulho
// tem de valer pra QUALQUER leitura de resposta do ops-control, não só pra do interruptor.
test("unwrapOpsEnvelope: start da fábrica na VPS — `started` mora DENTRO do envelope, não em cima dele", () => {
  const respostaDoOps = { ok: true, statusCode: 200, data: { ok: true, data: { started: true, budget: 5000 } } };
  const desembrulhado = ownerV3.unwrapOpsEnvelope(respostaDoOps.data);
  assert.equal(desembrulhado.data.started, true, "ler started em cima do envelope dá undefined = 'não iniciou'");
  assert.equal(desembrulhado.reason, null);

  // Recusa legítima da fábrica (started:false) continua sendo recusa — o desembrulho não inventa sucesso.
  const recusa = ownerV3.unwrapOpsEnvelope({ ok: true, data: { started: false, reason: "budget_obrigatorio" } });
  assert.equal(recusa.data.started, false);
  assert.equal(recusa.reason, null, "o envelope veio OK; quem recusou foi a fábrica, e isso é dado, não erro de transporte");
});

test("classifyOpsRead: ops-control ANTIGO (corpo cru, sem envelope) continua sendo lido; {ok:false} não vira leitura boa", () => {
  const cru = ownerV3.classifyOpsRead({ ok: true, configured: true, statusCode: 200, data: { supported: true, enabled: true } }, "x");
  assert.equal(cru.known, true);
  assert.equal(cru.data.enabled, true);

  const negado = ownerV3.classifyOpsRead({ ok: true, configured: true, statusCode: 200, data: { ok: false, error: "ssh_falhou" } }, "x");
  assert.equal(negado.known, false, "envelope negado NÃO pode virar on:false chutado");
  assert.equal(negado.reason, "ssh_falhou");
});

test("classifyOpsRead: sem opsToken vira ops_token_ausente; erro de transporte propaga a causa nomeada (ops_caido/vps_lenta)", () => {
  const semToken = ownerV3.classifyOpsRead({ ok: false, configured: false, reason: "ops_token_ausente" }, "x");
  assert.equal(semToken.reason, "ops_token_ausente");

  const caiu = ownerV3.classifyOpsRead({ ok: false, configured: true, reason: "ops_caido", reasonText: "Ops Control parado." }, "x");
  assert.equal(caiu.reason, "ops_caido");

  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(),
    scrapingVps: ownerV3.buildScrapingEnv(caiu, caiu),
    ia: okIa(), enriquecimento: okEnriquecimento(),
  });
  const problem = overview.problems.find((p) => p.id === "tunel_caido");
  assert.ok(problem, "erro de transporte ao ops-control (ops_caido) deveria virar problema tunel_caido");
  assert.equal(problem.severity, "error");
});

// ═══ 3. Lei nº3 — verdade verificada: releitura discorda da intenção → ok:false ═════════════════════

test("switch de scraping: releitura CONFIRMA a intenção → ok:true", () => {
  const verdict = ownerV3.verifyScrapingSwitch(true, okScrapingEnv({ on: true }));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, null);
});

test("switch de scraping: releitura DISCORDA da intenção (pediu ligar, releu desligado) → ok:false", () => {
  const verdict = ownerV3.verifyScrapingSwitch(true, okScrapingEnv({ on: false, reason: "algo_travou" }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "releitura_discorda_da_intencao");
});

test("switch de scraping: releitura known:false (fonte morta bem na hora) nunca vira sucesso silencioso", () => {
  const verdict = ownerV3.verifyScrapingSwitch(true, { known: false, reason: "backend_indisponivel" });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "backend_indisponivel");
});

test("verifySimpleSwitch (ia-on / enriquecimento): confirma, discorda e leitura desconhecida", () => {
  assert.deepEqual(ownerV3.verifySimpleSwitch(true, true, "x"), { ok: true, reason: null });
  assert.deepEqual(ownerV3.verifySimpleSwitch(true, false, "x"), { ok: false, reason: "releitura_discorda_da_intencao" });
  assert.deepEqual(ownerV3.verifySimpleSwitch(true, null, "releitura_falhou"), { ok: false, reason: "releitura_falhou" });
});

// ═══ 4. Cascata — enriquecimento liga a IA antes ═══════════════════════════════════════════════════

test("cascade: enriquecimento {on:true} com IA desligada → IA sobe antes e cascade.ia === 'ligada'", () => {
  assert.equal(ownerV3.decideCascadeIaOn(false, true), "ligada");
});
test("cascade: enriquecimento {on:true} com IA JÁ ligada → cascade.ia === 'ja_ligada' (não finge que ligou agora)", () => {
  assert.equal(ownerV3.decideCascadeIaOn(true, true), "ja_ligada");
});
test("cascade: tentativa de ligar a IA falhou → cascade.ia === 'falhou' (nunca finge sucesso)", () => {
  assert.equal(ownerV3.decideCascadeIaOn(false, false), "falhou");
});

test("cascade: ia {on:false} derruba o enriquecimento que estava ligado → 'desligado'", () => {
  assert.equal(ownerV3.decideCascadeEnriquecimentoOff(true, false), "desligado");
});
test("cascade: ia {on:false} com enriquecimento já desligado → 'ja_desligado' (estado impossível evitado)", () => {
  assert.equal(ownerV3.decideCascadeEnriquecimentoOff(false, false), "ja_desligado");
});
test("cascade: ia {on:false} tenta derrubar o enriquecimento mas ele continua rodando → 'falhou' (verdade, não o enum otimista)", () => {
  assert.equal(ownerV3.decideCascadeEnriquecimentoOff(true, true), "falhou");
});

// ═══ 5. ia {on:false} com 30B teimando na RAM → ok:false + problema ia_residente no overview seguinte ═

test("verifyIaOffFromUnload: unload confirma resident:true (mesmo com force) → ok:false, reason:'ainda_residente'", () => {
  const unloadResult = { ok: false, resident: true, ramMb: 19260, forced: true, reason: "ainda_residente", elapsedMs: 60000 };
  const verdict = ownerV3.verifyIaOffFromUnload(unloadResult);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "ainda_residente");
});

test("verifyIaOffFromUnload: Ollama mudo durante a descarga → ok:false com o motivo real, nunca finge sucesso", () => {
  const unloadResult = { ok: false, resident: null, ramMb: null, forced: false, reason: "ollama_sem_resposta", elapsedMs: 60000 };
  const verdict = ownerV3.verifyIaOffFromUnload(unloadResult);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "ollama_sem_resposta");
});

test("verifyIaOffFromUnload: descarga confirmada (resident:false) → ok:true", () => {
  const verdict = ownerV3.verifyIaOffFromUnload({ ok: true, resident: false, ramMb: null, forced: false, reason: null, elapsedMs: 4000 });
  assert.equal(verdict.ok, true);
});

test("verifyIaOffFromUnload: fallback de transição (ponte-worker ainda no contrato antigo, boolean solto) nunca lança", () => {
  assert.deepEqual(ownerV3.verifyIaOffFromUnload(true), { ok: true, reason: null });
  assert.deepEqual(ownerV3.verifyIaOffFromUnload(false), { ok: false, reason: "unload_retornou_falso" });
});

test("problema ia_residente aparece no overview SEGUINTE quando on:false mas warm ainda true (30B teimando)", () => {
  const ia = ownerV3.buildIaSwitch({
    residentRead: { ok: true, resident: true, ramMb: 19260, error: null },
    power: { on: false, model: "qwen3:30b-a3b-instruct" },
    ponteStatus: { model: "qwen3:30b-a3b-instruct", currentMissionId: null },
  });
  assert.equal(ia.on, false);
  assert.equal(ia.warm, true);
  assert.equal(ia.ramMb, 19260);

  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(), ia, enriquecimento: okEnriquecimento(),
  });
  const problem = overview.problems.find((p) => p.id === "ia_residente");
  assert.ok(problem, "esperava ia_residente na faixa de problemas");
  assert.equal(problem.severity, "error");
  assert.deepEqual(problem.action.body, { on: false, force: true });
});

test("buildIaSwitch: readResident falhou (Ollama mudo) → warm/ramMb null (nunca false/0 chutado) + problema ollama_off", () => {
  const ia = ownerV3.buildIaSwitch({
    residentRead: { ok: false, resident: false, ramMb: null, error: "ollama_off" },
    power: { on: true, model: null },
    ponteStatus: null,
  });
  assert.equal(ia.warm, null);
  assert.equal(ia.ramMb, null);
  assert.equal(ia.reason, "ollama_off");

  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(), ia, enriquecimento: okEnriquecimento(),
  });
  assert.ok(overview.problems.some((p) => p.id === "ollama_off"));
});

// ═══ 6. NOVO — subida sob demanda do backend local (Docker fechado / :3000 morto) ═══════════════════

test("boot local em 'starting': overview mostra known:true, on:false (nunca verde antes do health) e o texto do passo atual", () => {
  const base = okScrapingEnv({ on: false, running: false });
  const overlay = ownerV3.applyLocalBackendBootOverlay(base, { state: "starting", step: "docker", since: "2026-07-28T18:00:00.000Z" });
  assert.equal(overlay.known, true);
  assert.equal(overlay.on, false);
  assert.equal(overlay.starting, true);
  assert.equal(overlay.startingSince, "2026-07-28T18:00:00.000Z");
  assert.equal(overlay.startingStep, "docker");
  assert.match(overlay.reason, /Docker Desktop/);

  const containers = ownerV3.applyLocalBackendBootOverlay(base, { state: "starting", step: "containers", since: "x" });
  assert.match(containers.reason, /backend local/);
});

test("boot local 'idle' (nada em andamento) não mexe no resto do objeto e zera os 3 campos novos", () => {
  const base = okScrapingEnv();
  const overlay = ownerV3.applyLocalBackendBootOverlay(base, { state: "idle" });
  assert.equal(overlay.starting, false);
  assert.equal(overlay.startingSince, null);
  assert.equal(overlay.startingStep, null);
  assert.equal(overlay.on, true); // não sobrescreve o resto do objeto quando não há subida em voo
});

test("boot local 'desisti' após falha real: reason carrega o motivo verdadeiro (nunca calado) e o overview ganha problems[]", () => {
  const base = okScrapingEnv({ on: false, running: false });
  const boot = { state: "desisti", step: null, since: null, attempts: 3, lastAttemptAt: Date.now(), lastError: "health_nao_respondeu_em_120s", stderrTail: "Backend healthcheck failed." };
  const overlay = ownerV3.applyLocalBackendBootOverlay(base, boot);
  assert.equal(overlay.starting, false);
  assert.equal(overlay.reason, "health_nao_respondeu_em_120s");

  const overview = ownerV3.buildOverview({
    scrapingLocal: base, scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
    docker: { daemon: true, desktopRunning: true, autoStart: false }, localBoot: boot,
  });
  const problem = overview.problems.find((p) => p.id === "backend_local_nao_subiu");
  assert.ok(problem, "esperava backend_local_nao_subiu na faixa");
  assert.match(problem.text, /health_nao_respondeu_em_120s/);
  assert.match(problem.text, /Backend healthcheck failed/);
  assert.deepEqual(problem.action.body, { env: "local", on: true });
  // Não deve duplicar com o aviso genérico de "desligado" — a mensagem específica já conta a história.
  assert.ok(!overview.problems.some((p) => p.id === "scraping_local_off"));
});

test("disjuntor da subida: mutex (1 por vez) — 'starting' recusa nova tentativa, nunca duplica", () => {
  const decision = ownerV3.decideLocalBootTrigger({ state: "starting", attempts: 1, lastAttemptAt: Date.now() }, Date.now(), 300000, 3);
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "subida_ja_em_andamento");
});

test("disjuntor da subida: rate-limit entre tentativas (backoff) — clique repetido cedo demais é recusado", () => {
  const now = Date.now();
  const decision = ownerV3.decideLocalBootTrigger({ state: "idle", attempts: 1, lastAttemptAt: now - 1000 }, now, 300000, 3);
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "aguardando_backoff");
});

test("disjuntor da subida: teto de tentativas ('desisti') recusa tentativa nova dentro do cooldown — SEM re-tentar em loop", () => {
  const now = Date.now();
  const decision = ownerV3.decideLocalBootTrigger({ state: "desisti", attempts: 3, lastAttemptAt: now - 1000 }, now, 300000, 3);
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "teto_de_tentativas_atingido");
});

test("disjuntor da subida: depois do cooldown, um clique humano NOVO reseta a contagem (não é loop automático — precisa da ação)", () => {
  const now = Date.now();
  const decision = ownerV3.decideLocalBootTrigger({ state: "desisti", attempts: 3, lastAttemptAt: now - 400000 }, now, 300000, 3);
  assert.equal(decision.allow, true);
  assert.equal(decision.reset, true);
});

test("disjuntor da subida: primeira tentativa (idle, attempts:0) sempre permitida", () => {
  const decision = ownerV3.decideLocalBootTrigger({ state: "idle", attempts: 0, lastAttemptAt: 0 }, Date.now(), 300000, 3);
  assert.equal(decision.allow, true);
  assert.equal(decision.reset, false);
});

test("isLocalBootAttemptExhausted: só vira 'desisti' quando bate o teto, nunca antes", () => {
  assert.equal(ownerV3.isLocalBootAttemptExhausted(1, 3), false);
  assert.equal(ownerV3.isLocalBootAttemptExhausted(2, 3), false);
  assert.equal(ownerV3.isLocalBootAttemptExhausted(3, 3), true);
});

test("problema docker_fechado aparece quando o Docker está fechado e ninguém pediu subida (idle)", () => {
  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv({ on: false, known: false, reason: "backend_indisponivel" }),
    scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
    docker: { daemon: false, desktopRunning: false, autoStart: false }, localBoot: { state: "idle" },
  });
  const problem = overview.problems.find((p) => p.id === "docker_fechado");
  assert.ok(problem, "esperava docker_fechado com o Docker genuinamente fechado");
  assert.equal(problem.severity, "warn");
});

test("problema docker_fechado NÃO aparece enquanto uma subida já está em andamento (evita ruído duplicado com 'starting')", () => {
  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv({ on: false, known: false, reason: "backend_indisponivel" }),
    scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
    docker: { daemon: false, desktopRunning: false, autoStart: false },
    localBoot: { state: "starting", step: "docker", since: "x" },
  });
  assert.ok(!overview.problems.some((p) => p.id === "docker_fechado"));
  assert.ok(!overview.problems.some((p) => p.id === "scraping_local_off"));
  assert.ok(!overview.problems.some((p) => p.id === "backend_sem_resposta"));
});

test("buildDockerBlock: autoStart desconhecido (arquivo de settings não encontrado) vira null, nunca false chutado", () => {
  assert.deepEqual(ownerV3.buildDockerBlock({ daemon: true, desktopRunning: true, autoStart: null }), { daemon: true, desktopRunning: true, autoStart: null });
  assert.deepEqual(ownerV3.buildDockerBlock(null), { daemon: false, desktopRunning: false, autoStart: null });
});

// ═══ 7. boot.json / campos que ainda não têm fonte viram null (não inventa número) ══════════════════

test("normalizeBoot: sem state/boot.json ainda → agent:true (o próprio código respondendo já prova isso), resto null", () => {
  const boot = ownerV3.normalizeBoot(null);
  assert.deepEqual(boot, { at: null, windows: null, agent: true, ollama: null, painel: null, reason: "sem_boot_json" });
});

// Regressão 30/07: boot.json guardava "ollama:false / reason:'ollama offline'" do boot da manhã; o
// dono subiu o Ollama depois e o pino continuou vermelho o dia inteiro, com a queixa já resolvida.
test("normalizeBoot: Ollama vivo AGORA ganha do boot.json velho — e a queixa 'ollama offline' já resolvida some", () => {
  const raw = { at: "2026-07-30T11:11:12Z", windows: true, agent: true, ollama: false, painel: true, reason: "ollama offline" };

  const vivo = ownerV3.normalizeBoot(raw, true);
  assert.equal(vivo.ollama, true, "evidência viva tem que ganhar do arquivo do boot");
  assert.equal(vivo.reason, null, "queixa sobre o Ollama não pode sobreviver ao Ollama vivo");

  const morto = ownerV3.normalizeBoot(raw, false);
  assert.equal(morto.ollama, false);
  assert.equal(morto.reason, "ollama offline", "Ollama realmente morto mantém o motivo");

  // Sem evidência viva (leitura falhou), o arquivo continua valendo — não inventa.
  assert.equal(ownerV3.normalizeBoot(raw, null).ollama, false);

  // Motivo que NÃO fala do Ollama nunca é apagado pela vivacidade dele.
  const outro = ownerV3.normalizeBoot({ ...raw, reason: "painel nao abriu" }, true);
  assert.equal(outro.reason, "painel nao abriu");
});

test("buildOverview: liveOllama sai do ia.reason do próprio ciclo (sem I/O novo)", () => {
  const raw = { windows: true, agent: true, ollama: false, painel: true, reason: "ollama offline" };
  const vivo = ownerV3.buildOverview({
    bootRaw: raw, scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(),
    ia: okIa({ reason: null }), enriquecimento: okEnriquecimento(),
  });
  assert.equal(vivo.boot.ollama, true);

  const semOllama = ownerV3.buildOverview({
    bootRaw: raw, scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(),
    ia: okIa({ reason: "ollama_sem_resposta" }), enriquecimento: okEnriquecimento(),
  });
  assert.equal(semOllama.boot.ollama, false);
});

test("normalizeBoot: boot.json presente força agent:true mesmo que o arquivo diga outra coisa (pode estar defasado)", () => {
  const boot = ownerV3.normalizeBoot({ at: "2026-07-28T10:00:00.000Z", windows: true, agent: false, ollama: true, painel: false, reason: "health_timeout" });
  assert.equal(boot.agent, true);
  assert.equal(boot.windows, true);
  assert.equal(boot.painel, false);
  assert.equal(boot.reason, "health_timeout");
});

// ═══ 8. enriquecimento: fila parada > 6h vira problema; ritmo/h nunca é inventado ═══════════════════

test("buildEnriquecimentoSwitch: deriva queuedDue/oldestAgeMin do lag real; sem 2 jobs concluídos, ratePerHour é null (não inventa)", () => {
  const sw = ownerV3.buildEnriquecimentoSwitch({
    running: true,
    telemetry: { lag: { queuedDue: 1873, oldestQueuedAgeMs: 42 * 60_000 }, lastError: null },
    lastJobs: [{ at: new Date().toISOString(), ok: true }],
  });
  assert.equal(sw.queuedDue, 1873);
  assert.equal(sw.oldestAgeMin, 42);
  assert.equal(sw.ratePerHour, null);
});

test("buildEnriquecimentoSwitch: 2+ jobs concluídos com timestamp real → ritmo/h calculado (evidência, não chute)", () => {
  const t0 = Date.now() - 60 * 60_000; // 1h atrás
  const sw = ownerV3.buildEnriquecimentoSwitch({
    running: true,
    telemetry: { lag: null, lastError: null },
    lastJobs: [
      { at: new Date(t0).toISOString(), ok: true },
      { at: new Date(t0 + 30 * 60_000).toISOString(), ok: true },
      { at: new Date(t0 + 60 * 60_000).toISOString(), ok: true },
    ],
  });
  // 3 conclusões cobrindo 1h de span → 2 intervalos / 1h = 2/h.
  assert.equal(sw.ratePerHour, 2);
});

function overviewCom(enriquecimento) {
  return ownerV3.buildOverview({ scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento });
}

test("fila só vira problema acima de 6h (360min) de idade do item mais antigo", () => {
  const problems = overviewCom(okEnriquecimento({ oldestAgeMin: 359, on: false })).problems;
  assert.ok(!problems.some((p) => p.id === "fila_parada" || p.id === "fila_atrasada"));
});

test("fila velha com o enriquecimento DESLIGADO: erro 'parada' + ação pra ligar (é o caso em que ninguém está processando)", () => {
  const problem = overviewCom(okEnriquecimento({ oldestAgeMin: 361, on: false })).problems.find((p) => p.id === "fila_parada");
  assert.ok(problem);
  assert.equal(problem.severity, "error");
  assert.match(problem.text, /nada sendo processado/);
  assert.equal(problem.action.path, "/owner/v3/switch/enriquecimento", "problema com conserto óbvio não pode vir sem botão");
  assert.deepEqual(problem.action.body, { on: true });
});

// Regressão 30/07: com 8 mil na fila a ~20/h, o item mais antigo fica com 13 dias mesmo com o worker
// a todo vapor. A tarja vermelha jurava "nada sendo processado" enquanto a fila ANDAVA — e o card do
// Enriquecimento, ao lado, dizia "fila acumulada". Duas frases sobre o mesmo fato, uma delas falsa.
test("fila velha com o enriquecimento LIGADO: aviso de acúmulo, nunca 'parada' — a fila está andando", () => {
  const problems = overviewCom(okEnriquecimento({ oldestAgeMin: 18963, on: true })).problems;
  assert.ok(!problems.some((p) => p.id === "fila_parada"), "worker ligado NÃO pode ser acusado de fila parada");

  const aviso = problems.find((p) => p.id === "fila_atrasada");
  assert.ok(aviso);
  assert.equal(aviso.severity, "warn");
  assert.doesNotMatch(aviso.text, /nada sendo processado/);
  assert.match(aviso.text, /~316h/, "a idade real do mais antigo continua aparecendo");
});

test("buildEnriquecimentoSwitch: desligado sem lastError ainda tem reason legível (lei nº2 — nada calado)", () => {
  const sw = ownerV3.buildEnriquecimentoSwitch({ running: false, telemetry: {}, lastJobs: [] });
  assert.equal(sw.on, false);
  assert.equal(sw.reason, "desligado_pelo_painel");
});

// ═══ 9. feed[] — sinal real, nunca inventado ════════════════════════════════════════════════════════

test("buildFeed: corrida rodando + jobs concluídos viram entradas legíveis, capado em 10", () => {
  const feed = ownerV3.buildFeed({
    scrapingVps: okScrapingEnv({ running: true, processed: 412, budget: 1000 }),
    scrapingLocal: okScrapingEnv({ running: false }),
    ldLastJobs: [
      { at: "2026-07-28T18:39:00.000Z", ok: true, radarLeadId: "abc", noNewData: false },
      { at: "2026-07-28T18:38:00.000Z", ok: false, radarLeadId: "def", reason: "timeout" },
    ],
    generatedAt: "2026-07-28T18:40:00.000Z",
  });
  assert.ok(feed.some((f) => /corrida VPS: 412\/1000 leads/.test(f.text)));
  assert.ok(feed.some((f) => /lead abc: enriquecido/.test(f.text)));
  assert.ok(feed.some((f) => /lead def: falhou \(timeout\)/.test(f.text)));
  assert.ok(feed.length <= 10);
});

test("buildFeed: sem nada acontecendo devolve array vazio (nunca inventa atividade)", () => {
  assert.deepEqual(ownerV3.buildFeed({ scrapingVps: okScrapingEnv({ running: false }), scrapingLocal: okScrapingEnv({ running: false }), ldLastJobs: [] }), []);
});

// ═══ 10. shape geral do overview (contrato) ═════════════════════════════════════════════════════════

// Regressão 30/07: HBX_OWNER_BACKEND_URL fazia dois trabalhos (alvo das missões E lado "Localhost"),
// então os dois interruptores liam a MESMA fábrica e o front somava os dois lados — 7.129 + 7.129 =
// 14.258 contatos, o mesmo número contado duas vezes. O agent agora tem URL própria pro backend local;
// esta flag existe pro caso das duas voltarem a coincidir: o painel avisa em vez de fingir 2 ambientes.
test("buildOverview: mergedEnvs viaja no payload — o front precisa saber quando os 2 lados sao a mesma maquina", () => {
  const juntos = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(),
    ia: okIa(), enriquecimento: okEnriquecimento(), mergedEnvs: true,
  });
  assert.equal(juntos.mergedEnvs, true);

  const separados = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(),
    ia: okIa(), enriquecimento: okEnriquecimento(),
  });
  assert.equal(separados.mergedEnvs, false, "ausente = ambientes distintos, nunca undefined vazando pro front");
});

test("buildOverview: shape tem todas as chaves do contrato (boot, switches, docker, engines, problems, feed)", () => {
  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
    engines: { total: 20, on: 20 }, feed: [{ at: "x", text: "y" }],
  });
  assert.equal(overview.ok, true);
  assert.ok(overview.generatedAt);
  assert.ok(overview.boot);
  assert.ok(overview.switches.scraping.vps);
  assert.ok(overview.switches.scraping.local);
  assert.ok(overview.switches.ia);
  assert.ok(overview.switches.enriquecimento);
  assert.ok(overview.docker);
  assert.deepEqual(overview.engines, { total: 20, on: 20 });
  assert.ok(Array.isArray(overview.problems));
  assert.deepEqual(overview.feed, [{ at: "x", text: "y" }]);
});

test("buildOverview: tudo ligado e saudável → problems[] vazio (sem ruído quando está tudo bem)", () => {
  const overview = ownerV3.buildOverview({
    scrapingLocal: okScrapingEnv(), scrapingVps: okScrapingEnv(), ia: okIa(), enriquecimento: okEnriquecimento(),
    docker: { daemon: true, desktopRunning: true, autoStart: true }, localBoot: { state: "idle" },
  });
  assert.deepEqual(overview.problems, []);
});
