"use strict";

const { spawnSync } = require("child_process"); // só p/ o kill do runner Ollama (força bruta, E2-a)

// ─── WORKER LOCAL DA PONTE (CHIP E1, 05/07) ─────────────────────────────────────────────────────
// A ÚNICA peça nova da arquitetura híbrida 30B×4b. Vive junto do local-agent (Node puro, sem
// framework). Loop PULL: leaseia missão do BACKEND (VPS ou local) → executa no 30B local (Ollama
// :11434) → devolve resultado bruto no complete (o BACKEND grava pelo caminho único de escrita).
//
// LEIS QUE O T1/T2 MEDIRAM (não opcionais):
//  1. num_ctx SEMPRE capado E UNIFICADO em 8192 em TODA chamada — trocar ctx entre chamadas realoca
//     KV e foi a causa do run CTXMISTO abortado (T2 §3). Aqui: PONTE_NUM_CTX é fixo.
//  2. NUNCA cold-load com missão em voo (T2 §4.3: swap-morte 0,58GB livre / 2,94 tok/s). Warm-check
//     EXCLUSIVO (chamada 1-token) ANTES do 1º lease; só leaseia depois de residente.
//  3. Descarga (keep_alive 0) quando o elástico manda parar por ociosidade.
//
// ELÁSTICO (decisão do dono, sem cron): roda quando há fila E freia quando há usuário ativo. Os dois
// sinais VÊM JUNTO do lease (activity.activeUsers + lag.queuedDue) — reaproveitados, não reconstruídos.
//
// DISJUNTOR (lei da casa, família do WhatsApp): teto de falhas consecutivas → PARA o loop, acende
// estado VERMELHO consultável (status pro :3107/E2), não reprocessa sozinho. Backoff exponencial com
// teto. A configuração automática/env define apenas o primeiro boot; o freio manual do dono é
// persistente e prevalece nos próximos boots. NUNCA loop livre.
//
// E2-a (28/07) — "nunca mais desligado de fé": keep_alive:0 sozinho NÃO prova descarga (o Ollama pode
// responder 200 OU 500 com o modelo continuando residente na RAM — foi assim que ~19GB ficaram presos
// e a máquina de 32GB do dono entrou em swap). A partir daqui, quem decide é o /api/ps (readResident);
// state.warm só vira false com resident===false PROVADO. Ollama mudo = "não sei", nunca "desliguei".

const OLLAMA_30B_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M";
const PONTE_NUM_CTX = 8192; // capado E unificado (lei 1)
const PONTE_STAGES = ["enrich_lead"];
// Falhas CONSECUTIVAS do /api/ps toleradas antes de pollUntilGone decidir "Ollama mudo" — só a 3ª
// decide, nunca a 1ª (pedido do dono, 28/07: com o 30B em inferência pesada um timeout de 5s isolado
// no /api/ps pode ser falso alarme, não o Ollama realmente fora do ar).
const READ_FAILURE_TOLERANCE = 3;

// Prompt de extração — VERBATIM do backend/src/webscraping/radar/03-enrichment/ai-contact-extraction.service.ts
const EXTRACTION_SYSTEM_PROMPT = [
  "Você extrai contatos de textos de sites de empresas brasileiras.",
  "Devolva SOMENTE JSON válido, nada fora dele, no formato:",
  '{"telefones":["..."],"emails":["..."],"nome_dono":"..." }',
  "(nome_dono é string ou null)",
  "",
  "REGRAS DURAS:",
  "- Só extraia o que está LITERALMENTE escrito no texto. NUNCA invente, complete ou deduza dígitos que não estão lá.",
  '- Se não houver telefone no texto, devolva "telefones":[]. Se não houver email, "emails":[]. Se o texto não disser explicitamente quem é o dono/proprietário/responsável, "nome_dono":null.',
  "- Telefone: apenas números de telefone/WhatsApp do próprio negócio, com DDD quando presente. NÃO extraia CNPJ, CPF, CEP, inscrição estadual, preços, quilometragem, datas, horários, protocolos, notas fiscais, coordenadas, versões de software ou números de endereço como telefone.",
  "- Email: apenas emails do próprio negócio. Ignore emails de plataformas/exemplos.",
  "- Nome do negócio NÃO é nome do dono.",
].join("\n");

function envBool(env, name, def) {
  const raw = String((env && env[name]) || "").trim().toLowerCase();
  if (!raw) return def;
  return ["1", "true", "yes", "sim", "on"].includes(raw);
}
function envInt(env, name, def) {
  const parsed = Number.parseInt(String((env && env[name]) || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
}

// ─── DECISÕES PURAS (unit-testáveis, sem I/O) ───────────────────────────────────────────────────

/** Backoff exponencial com teto: base·2^(n-1), cap. n=1→base; 2→2·base; 3→4·base… */
function computeBackoffMs(consecutiveEmptyOrError, baseMs, capMs) {
  const n = Math.max(1, Math.trunc(Number(consecutiveEmptyOrError) || 1));
  const exp = baseMs * Math.pow(2, n - 1);
  return Math.min(Math.max(baseMs, exp), capMs);
}

/**
 * O CORAÇÃO do elástico + freios, PURO. Decide a próxima ação a partir do estado + sinal do lease.
 * Retorna uma de: 'circuit_open' (disjuntor), 'freia' (usuário ativo), 'warm' (30B frio, precisa
 * aquecer antes de trabalhar), 'idle' (fila vazia, sem trabalho), 'work' (leasear/executar).
 * NÃO faz I/O — quem chama executa a ação. Testável isolada.
 */
function decideNextAction(input) {
  const {
    circuitOpen,
    activeUsers = 0,
    activityFreiaThreshold = 1,
    queuedDue = null, // null = desconhecido (ainda não perguntou) → não bloqueia por idle
    warm = false,
    supported = true,
    paused = false,
  } = input || {};

  if (circuitOpen) return { action: "circuit_open", reason: "disjuntor aberto (teto de falhas)" };
  if (!supported) return { action: "idle", reason: "fila não suportada no backend" };
  if (paused) return { action: "idle", reason: "fila pausada (freio do dono)" };
  // Freio elástico: gente ativa → cede a vez (termina o que está em voo lá fora; aqui só não leaseia).
  if (Number(activeUsers) >= Math.max(1, activityFreiaThreshold)) {
    return { action: "freia", reason: `cedendo a vez — ${activeUsers} usuário(s) ativo(s)` };
  }
  // Fila vazia e conhecida → ociosidade (pode descarregar depois de N ciclos).
  if (queuedDue != null && Number(queuedDue) <= 0) {
    return { action: "idle", reason: "fila vazia — nada a processar" };
  }
  // Tem (ou pode ter) trabalho e ninguém ativo → precisa estar quente antes de leasear (lei 2).
  if (!warm) return { action: "warm", reason: "30B frio — aquecer antes de leasear (lei anti-swap)" };
  return { action: "work", reason: "fila com trabalho e ninguém ativo — processando" };
}

/** JSON tolerante: aceita bloco {…} embutido em texto (mesma robustez dos serviços do backend). */
function safeParseJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* tenta extrair bloco */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/**
 * Compare tolerante entre o nome/model que o /api/ps devolve e o model configurado na ponte:
 * igualdade exata OU prefixo antes do primeiro ":" (cobre variação de tag, ex. ":latest" a mais/menos).
 */
function modelMatches(candidate, target) {
  const c = String(candidate || "").trim();
  const t = String(target || "").trim();
  if (!c || !t) return false;
  if (c === t) return true;
  const cBase = c.split(":")[0];
  const tBase = t.split(":")[0];
  return Boolean(cBase) && cBase === tBase;
}

// ─── Kill de força bruta do runner Ollama (Windows) ─────────────────────────────────────────────
// CORRIGIDO 28/07 — achado em campo (máquina do dono, Ollama 0.32.5, `Get-CimInstance Win32_Process`):
//   ollama app.exe   PID 14172  (bandeja/supervisor — é o PAI do serve)
//   ollama.exe serve PID 2440   (filho de 14172 — É a API :11434, inclusive o /api/ps que prova a descarga)
// A 1ª versão filtrava por NOME DE IMAGEM (tasklist puro) e fazia os DOIS erros ao mesmo tempo: (a)
// matava "ollama app.exe" — não libera 1 byte de RAM e ainda arrisca derrubar o Ollama inteiro do
// dono; pior que não fazer nada — e (b) pulava o runner de verdade, porque no Ollama moderno o runner
// de inferência TAMBÉM se chama "ollama.exe" (binário único) — só a LINHA DE COMANDO diferencia
// ("...serve" vs "...runner ..."). tasklist não devolve command line; por isso a fonte agora é
// Get-CimInstance Win32_Process (mesmo padrão já usado pelo server.js em findLocalLabProcesses).
function selectRunnerPidsToKill(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const targets = [];
  for (const row of list) {
    const pid = String((row && row.ProcessId) || "").trim();
    const name = String((row && row.Name) || "").toLowerCase();
    const cmd = String((row && row.CommandLine) || "");
    const cmdLower = cmd.toLowerCase();
    if (!pid || !/^\d+$/.test(pid)) continue;
    // Regra dura, NÃO amaciar: "ollama app.exe" (bandeja/supervisor, PAI do serve) — NUNCA, mesmo
    // que apareça na lista bruta. Defesa em dupla camada (nome E command line) de propósito.
    if (name.includes("app.exe") || cmdLower.includes("ollama app.exe")) continue;
    if (cmdLower.includes("serve")) continue; // é a API :11434 — NUNCA, mesmo que também tenha "runner"
    if (!cmdLower.includes("runner")) continue; // sem "runner" explícito na cmdline não é alvo — o padrão diante de ambiguidade é NÃO matar
    targets.push({ pid, name: (row && row.Name) || "", commandLine: cmd });
  }
  return targets;
}

// Usado SÓ quando unloadModel(reason,{force:true}) estoura o timeoutMs e o /api/ps ainda mostra o
// modelo residente. Idempotente: ausência de processo não é erro (reason:'runner_nao_encontrado' fica
// por conta de quem chama, não daqui). Nunca lança.
function defaultKillOllamaRunner() {
  try {
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      // Name LIKE 'ollama%' pega TANTO "ollama.exe" (serve/runner) QUANTO "ollama app.exe" (bandeja)
      // de propósito — quem decide quem morre é selectRunnerPidsToKill, não este filtro.
      "Get-CimInstance Win32_Process -Filter \"Name LIKE 'ollama%'\" |",
      "  Select-Object ProcessId,Name,CommandLine |",
      "  ConvertTo-Json -Compress",
    ].join("\n");
    const list = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: 8000,
    });
    if (list.error) return { killed: [], error: list.error.message || String(list.error) };
    const out = String(list.stdout || "").trim();
    if (!out) return { killed: [], error: null }; // nenhum processo "ollama*" rodando
    let parsed;
    try { parsed = JSON.parse(out); } catch { return { killed: [], error: "cim_json_invalido" }; }
    const targets = selectRunnerPidsToKill(parsed);
    const killed = [];
    for (const target of targets) {
      const killResult = spawnSync("taskkill", ["/F", "/PID", target.pid], { shell: false, windowsHide: true, encoding: "utf8" });
      if (!killResult.error) killed.push(target);
    }
    return { killed, error: null };
  } catch (error) {
    return { killed: [], error: (error && error.message) || String(error) };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

// ─── FÁBRICA DO WORKER ──────────────────────────────────────────────────────────────────────────

/**
 * deps:
 *  - ollamaRequest(method, path, payload, timeoutMs): chamada ao Ollama local (house helper).
 *  - backendRequest(method, route, payload, options): chamada autenticada ao backend (house helper).
 *  - fetchSiteText(website): crawl leve do site (reusa o do server.js) — só p/ enrich_lead.
 *  - controlStore: { load(), inspect?(), save(data) } para o freio manual persistente.
 *  - log(msg): logger. env: process.env (injetável nos testes). now(): Date.now injetável.
 */
function createPonteWorker(deps) {
  const ollamaRequest = deps.ollamaRequest;
  const backendRequest = deps.backendRequest;
  const fetchSiteText = deps.fetchSiteText || (async () => "");
  const log = deps.log || (() => {});
  const env = deps.env || process.env;
  const now = deps.now || (() => Date.now());
  const controlStore = deps.controlStore || null;
  // Injetável nos testes (nunca deve tocar processo real fora do server.js em produção).
  const killOllamaRunner = deps.killOllamaRunner || defaultKillOllamaRunner;

  const model = String(env.HBX_PONTE_MODEL || OLLAMA_30B_MODEL);
  const workerId = String(env.HBX_PONTE_WORKER_ID || `ponte-local-${process.pid || "x"}`);
  const pollBaseMs = envInt(env, "HBX_PONTE_POLL_BASE_MS", 5000);
  const pollCapMs = envInt(env, "HBX_PONTE_POLL_CAP_MS", 5 * 60 * 1000);
  const batchSize = Math.min(Math.max(1, envInt(env, "HBX_PONTE_BATCH_SIZE", 1)), 4);
  const maxConsecutiveFailures = Math.max(1, envInt(env, "HBX_PONTE_MAX_CONSECUTIVE_FAILURES", 5));
  const activityFreiaThreshold = Math.max(1, envInt(env, "HBX_PONTE_ACTIVITY_FREIA_THRESHOLD", 1));
  const unloadAfterIdleMs = envInt(env, "HBX_PONTE_UNLOAD_AFTER_IDLE_MS", 10 * 60 * 1000);
  const warmResidentTimeoutMs = envInt(env, "HBX_PONTE_WARM_TIMEOUT_MS", 200000); // cold-load ~2min (T1/T2)
  const missionTimeoutMs = envInt(env, "HBX_PONTE_MISSION_TIMEOUT_MS", 90000);
  const leaseTtlSeconds = envInt(env, "HBX_PONTE_LEASE_TTL_SECONDS", 120);
  const heartbeatMs = Math.max(15000, Math.trunc((leaseTtlSeconds * 1000) / 3)); // ~1/3 do TTL
  const maxSourceChars = envInt(env, "HBX_PONTE_MAX_SOURCE_CHARS", 6000);

  let persistedControl = null;
  let controlJournalStatus = "missing";
  try {
    if (controlStore && controlStore.inspect) {
      const inspected = controlStore.inspect();
      controlJournalStatus = String(inspected?.status || "unreadable");
      persistedControl = controlJournalStatus === "valid" ? inspected?.data : null;
    } else {
      persistedControl = controlStore && controlStore.load ? controlStore.load() : null;
      controlJournalStatus = persistedControl == null ? "missing" : "valid";
    }
  } catch {
    controlJournalStatus = "unreadable";
    persistedControl = null;
  }
  const hasManualJournal = typeof persistedControl?.manualEnabled === "boolean" || typeof persistedControl?.pausedByOwner === "boolean";
  const invalidManualJournal = controlJournalStatus === "corrupt"
    || controlJournalStatus === "unreadable"
    || (controlJournalStatus === "valid" && !hasManualJournal);
  const initialManualEnabled = invalidManualJournal
    ? false
    : hasManualJournal
    ? (typeof persistedControl.manualEnabled === "boolean" ? persistedControl.manualEnabled : !persistedControl.pausedByOwner)
    : envBool(env, "HBX_PONTE_WORKER_ENABLED", false);

  const state = {
    manualEnabled: initialManualEnabled,
    controlSource: invalidManualJournal ? "fail_safe" : (hasManualJournal ? "owner" : "automatic_config"),
    controlUpdatedAt: hasManualJournal ? (persistedControl.updatedAt || null) : null,
    running: false,
    circuitOpen: false,
    circuitReason: null,
    consecutiveFailures: 0,
    warm: false,
    lastAction: null,
    lastReason: null,
    lastActivity: null, // { activeUsers, windowMinutes }
    lastLag: null, // { queuedDue, oldestQueuedAgeMs }
    lastError: invalidManualJournal ? "controle_persistente_invalido" : null,
    idleSinceMs: null,
    startedAt: null,
    totals: { leased: 0, completed: 0, failed: 0, coldLoads: 0, unloads: 0 },
    lastJobs: [], // últimos N: { id, stage, ok, latencyMs, at, note }
    currentMissionId: null,
  };

  let loopTimer = null;
  let stopping = false;
  let loopExecuting = false;

  function pushJob(entry) {
    state.lastJobs.unshift({ at: new Date(now()).toISOString(), ...entry });
    if (state.lastJobs.length > 20) state.lastJobs.length = 20;
  }

  // ── Warm-check EXCLUSIVO (lei 2): 1-token, num_ctx 8192, keep_alive -1. Bloqueia lease até residente.
  async function ensureWarm() {
    // Já quente? Confere no /api/ps (residente de verdade, não só presente).
    const ps = await ollamaRequest("GET", "/api/ps", null, 4000);
    const psList = ps && ps.ok && ps.data && Array.isArray(ps.data.models) ? ps.data.models : [];
    const resident = psList.some((m) => String((m && m.name) || "").startsWith(model));
    if (resident) { state.warm = true; return { ok: true, alreadyWarm: true }; }

    log(`[ponte] 30B frio — warm-check exclusivo (1-token, ctx ${PONTE_NUM_CTX}), pode levar ~2min…`);
    const t0 = now();
    const r = await ollamaRequest(
      "POST",
      "/api/generate",
      { model, prompt: "ok", stream: false, keep_alive: -1, options: { num_predict: 1, num_ctx: PONTE_NUM_CTX } },
      warmResidentTimeoutMs,
    );
    const elapsed = now() - t0;
    if (!r || !r.ok) {
      state.warm = false;
      return { ok: false, reason: (r && r.error) || `http_${(r && r.statusCode) || "?"}`, elapsedMs: elapsed };
    }
    state.warm = true;
    state.totals.coldLoads += 1;
    log(`[ponte] 30B residente em ${Math.round(elapsed / 1000)}s — pronto pra leasear.`);
    return { ok: true, elapsedMs: elapsed };
  }

  // ── Leitura da VERDADE (E2-a): o que está REALMENTE residente na RAM/VRAM do Ollama agora, sem
  // inferir nada do resultado de nenhuma outra chamada. Ollama fora do ar → ok:false (quem chama
  // trata "não sei" como "não desligou", nunca como "desligou").
  async function readResident() {
    const ps = await ollamaRequest("GET", "/api/ps", null, 5000).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
    if (!ps || !ps.ok) {
      return { ok: false, resident: false, ramMb: null, error: "ollama_off" };
    }
    const list = ps.data && Array.isArray(ps.data.models) ? ps.data.models : [];
    const match = list.find((m) => modelMatches(String((m && (m.name || m.model)) || ""), model));
    if (!match) return { ok: true, resident: false, ramMb: null, error: null };
    const sizeBytes = Number(match.size || 0);
    const ramMb = sizeBytes > 0 ? Math.round(sizeBytes / 1e6) : null; // decimal, igual ao sizeGb do server.js (/1e9)
    return { ok: true, resident: true, ramMb, error: null };
  }

  /**
   * Poll de readResident() até: "gone" (resident:false confirmado), "mute" (Ollama sem resposta —
   * decide-se só na Nª falha CONSECUTIVA, nunca na 1ª: com o 30B em inferência pesada um /api/ps de
   * 5s pode estourar isolado sem o Ollama estar realmente fora do ar) ou "timeout" (prazo esgotado
   * com o modelo comprovadamente ainda residente). Usado nas duas fases de unloadModel.
   */
  async function pollUntilGone(deadlineAt, pollIntervalMs) {
    let last = { ok: true, resident: true, ramMb: null, error: null };
    let consecutiveReadFailures = 0;
    while (now() < deadlineAt) {
      last = await readResident();
      if (last.ok) {
        consecutiveReadFailures = 0;
        if (!last.resident) return { outcome: "gone", last };
      } else {
        consecutiveReadFailures += 1;
        if (consecutiveReadFailures >= READ_FAILURE_TOLERANCE) return { outcome: "mute", last };
      }
      const remaining = deadlineAt - now();
      if (remaining <= 0) break;
      await sleep(Math.min(pollIntervalMs, remaining));
    }
    return { outcome: last.ok ? "timeout" : "mute", last };
  }

  /**
   * Descarga do 30B COM PROVA (lei da etapa E2-a: nunca mais "desligado de fé").
   * Contrato FIXO (outro worker já coda o cliente contra isto — não divergir):
   *   unloadModel(reason, { force=false, timeoutMs=60000 })
   *     → { ok, resident, ramMb, forced, reason, elapsedMs }
   * Sequência: 1) pede keep_alive:0 (resultado HTTP é ignorado — não prova nada, T2 já viu 500 com
   * modelo continuando quente); 2) poll no /api/ps a cada ~2s até sumir ou estourar timeoutMs (com
   * tolerância a falha de leitura — ver pollUntilGone); 3) sumiu → state.warm=false PROVADO;
   * 4) não sumiu e force → mata SÓ o runner (selectRunnerPidsToKill, nunca o serve/bandeja) e
   * re-confere por até 15s; nenhum runner encontrado pra matar → reason:'runner_nao_encontrado'
   * (honestidade: não tenta poll do nada mudou, item continua na Faixa de Problemas); 5) continua
   * residente (ou force=false) → ok:false, reason:'ainda_residente', warm INTOCADO; 6) Ollama mudo
   * (N falhas consecutivas do /api/ps) → ok:false, reason:'ollama_sem_resposta', warm INTOCADO
   * (nunca afirma descarga sem prova). `pollIntervalMs` é só um respiro de teste (produção nunca
   * passa isso — fica nos 2000ms da lei).
   */
  async function unloadModel(reason, opts) {
    const { force = false, timeoutMs = 60000, pollIntervalMs = 2000 } = opts || {};
    const t0 = now();

    // Passo 1 — pede a descarga. NÃO decide nada: a prova é sempre o /api/ps do passo 2.
    await ollamaRequest(
      "POST",
      "/api/generate",
      { model, prompt: "", keep_alive: 0, options: { num_ctx: PONTE_NUM_CTX } },
      15000,
    ).catch(() => null);

    const phase1 = await pollUntilGone(t0 + timeoutMs, pollIntervalMs);

    if (phase1.outcome === "gone") {
      state.warm = false;
      state.totals.unloads += 1;
      log(`[ponte] 30B descarregado (${reason}) — CONFIRMADO por /api/ps.`);
      return { ok: true, resident: false, ramMb: null, forced: false, reason: null, elapsedMs: now() - t0 };
    }
    if (phase1.outcome === "mute") {
      log(`[ponte] descarga (${reason}) SEM CONFIRMAÇÃO — Ollama não respondeu ao /api/ps (não afirmo que desliguei).`);
      return { ok: false, resident: false, ramMb: null, forced: false, reason: "ollama_sem_resposta", elapsedMs: now() - t0 };
    }

    // outcome === "timeout": ainda residente de verdade, prazo normal esgotado.
    if (!force) {
      log(`[ponte] descarga (${reason}) NÃO confirmada em ${timeoutMs}ms — ainda residente (${phase1.last.ramMb || "?"}MB); warm mantido.`);
      return { ok: false, resident: true, ramMb: phase1.last.ramMb, forced: false, reason: "ainda_residente", elapsedMs: now() - t0 };
    }

    let killResult;
    try {
      killResult = await killOllamaRunner();
    } catch (error) {
      killResult = { killed: [], error: (error && error.message) || String(error) };
    }
    const killedList = (killResult && killResult.killed) || [];
    log(`[ponte] descarga (${reason}) forçada — runner morto: ${JSON.stringify(killedList)}${killResult && killResult.error ? ` (erro: ${killResult.error})` : ""}.`);

    if (!killedList.length) {
      // Nada com "runner" na linha de comando pra matar — nada mudou desde a última leitura, então
      // NÃO tenta poll (seria fingir que fez algo). Honestidade acima de tudo: painel mostra POR QUE
      // a força falhou (motivo distinto de "ainda_residente" genérico), item continua na Faixa de Problemas.
      log(`[ponte] descarga forçada (${reason}) — nenhum runner encontrado; modelo segue residente.`);
      return { ok: false, resident: true, ramMb: phase1.last.ramMb, forced: true, reason: "runner_nao_encontrado", elapsedMs: now() - t0 };
    }

    const phase2 = await pollUntilGone(now() + 15000, pollIntervalMs);

    if (phase2.outcome === "gone") {
      state.warm = false;
      state.totals.unloads += 1;
      log(`[ponte] 30B descarregado à força (${reason}) — CONFIRMADO por /api/ps após kill do runner.`);
      return { ok: true, resident: false, ramMb: null, forced: true, reason: null, elapsedMs: now() - t0 };
    }
    if (phase2.outcome === "mute") {
      log(`[ponte] descarga forçada (${reason}) SEM CONFIRMAÇÃO — Ollama não respondeu ao /api/ps.`);
      return { ok: false, resident: false, ramMb: null, forced: true, reason: "ollama_sem_resposta", elapsedMs: now() - t0 };
    }
    log(`[ponte] descarga forçada (${reason}) FALHOU — modelo ainda residente após kill do runner; warm mantido.`);
    return { ok: false, resident: true, ramMb: phase2.last.ramMb, forced: true, reason: "ainda_residente", elapsedMs: now() - t0 };
  }

  // ── Chamada ao 30B (num_ctx SEMPRE 8192, think:false, temp 0) — mesma forma dos serviços do backend.
  async function callOllamaChat(systemPrompt, userContent, numPredict) {
    const r = await ollamaRequest(
      "POST",
      "/api/chat",
      {
        model,
        stream: false,
        think: false,
        format: "json",
        keep_alive: -1,
        options: { temperature: 0, num_predict: numPredict, num_ctx: PONTE_NUM_CTX },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      },
      missionTimeoutMs,
    );
    if (!r || !r.ok) return { ok: false, reason: (r && r.error) || `http_${(r && r.statusCode) || "?"}` };
    const content = r.data && r.data.message && r.data.message.content;
    const parsed = safeParseJson(String(content || ""));
    if (!parsed) return { ok: false, reason: "json_invalido" };
    return { ok: true, parsed };
  }

  // ── Execução de UMA missão. Devolve { result } pro complete OU { fail, retryable }.
  async function executeMission(mission) {
    const stage = String(mission.stage || "");
    const payload = mission.payload || {};

    if (stage === "enrich_lead") {
      const website = String(payload.website || "");
      // Sem site no payload, o worker crawleia pelo lead? Não — o crawl é do backend/fábrica. Aqui o
      // payload traz o que o 30B precisa. Se vier website, crawleia leve; senão, degrada (nada a extrair).
      const sourceText = website ? String(await fetchSiteText(website).catch(() => "")).slice(0, maxSourceChars) : "";
      if (!sourceText.trim()) {
        // Nada pra extrair — completa vazio (o backend grava 0 contatos; missão não fica presa).
        return { result: { radarLeadId: payload.radarLeadId || null, telefones: [], emails: [], nome_dono: null, sourceText: "" } };
      }
      const leadName = String(payload.name || payload.leadName || "");
      const userContent = `${leadName ? `NEGÓCIO: ${leadName}\n` : ""}TEXTO DO SITE:\n"""${sourceText}"""`;
      const out = await callOllamaChat(EXTRACTION_SYSTEM_PROMPT, userContent, envInt(env, "HBX_PONTE_EXTRACTION_MAX_TOKENS", 300));
      if (!out.ok) return { fail: out.reason, retryable: true };
      const p = out.parsed;
      return {
        result: {
          radarLeadId: payload.radarLeadId || null,
          telefones: Array.isArray(p.telefones) ? p.telefones.map(String) : [],
          emails: Array.isArray(p.emails) ? p.emails.map(String) : [],
          nome_dono: p.nome_dono == null ? null : String(p.nome_dono),
          sourceText, // o BACKEND re-roda o gate contra a fonte (caminho único, fonte da verdade)
        },
      };
    }

    // Estágio inesperado no lease da ponte → não-retryable (não é trabalho nosso).
    return { fail: `stage_desconhecido:${stage}`, retryable: false };
  }

  // Heartbeat enquanto a missão roda (dentro do TTL do lease).
  function startHeartbeat(missionId, leaseId) {
    const timer = setInterval(() => {
      backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(missionId)}/heartbeat`, { leaseId })
        .catch(() => null);
    }, heartbeatMs);
    if (timer.unref) timer.unref();
    return () => clearInterval(timer);
  }

  async function processMission(mission) {
    state.currentMissionId = mission.id;
    state.totals.leased += 1;
    const stopHeartbeat = startHeartbeat(mission.id, mission.leaseId);
    const t0 = now();
    try {
      const outcome = await executeMission(mission);
      const latencyMs = now() - t0;
      if (outcome.fail) {
        await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/fail`, {
          leaseId: mission.leaseId, error: outcome.fail, retryable: outcome.retryable !== false,
        }).catch(() => null);
        state.totals.failed += 1;
        pushJob({ id: mission.id, stage: mission.stage, ok: false, latencyMs, note: outcome.fail });
        return { ok: false, reason: outcome.fail };
      }
      const completeRes = await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/complete`, {
        leaseId: mission.leaseId, result: outcome.result,
      }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
      const okBody = completeRes && completeRes.data;
      const completed = completeRes && completeRes.ok && (!okBody || okBody.ok !== false);
      if (!completed) {
        // Backend recusou o complete (apply falhou) → marca fail retryable pra reprocessar (idempotente).
        const reason = (okBody && okBody.reason) || completeRes.error || "complete_recusado";
        await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/fail`, {
          leaseId: mission.leaseId, error: reason, retryable: !(okBody && okBody.retryable === false),
        }).catch(() => null);
        state.totals.failed += 1;
        pushJob({ id: mission.id, stage: mission.stage, ok: false, latencyMs, note: reason });
        return { ok: false, reason };
      }
      state.totals.completed += 1;
      pushJob({ id: mission.id, stage: mission.stage, ok: true, latencyMs, note: null });
      return { ok: true };
    } finally {
      stopHeartbeat();
      state.currentMissionId = null;
    }
  }

  // Um CICLO do loop: pega o sinal do lease, decide, age. Retorna o delay pro próximo ciclo.
  async function tick() {
    if (stopping || !state.manualEnabled) return pollCapMs;
    if (state.circuitOpen) { state.lastAction = "circuit_open"; return pollCapMs; }

    // Lease traz o sinal elástico (activity+lag) JUNTO — 1 chamada, sem endpoint novo de status.
    const leaseRes = await backendRequest("POST", "/modules/owner/missions/lease", {
      workerId, stages: PONTE_STAGES, batchSize, leaseTtlSeconds,
    }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));

    if (!leaseRes || !leaseRes.ok || !leaseRes.data) {
      // Falha de REDE/backend NÃO é falha de missão — não abre disjuntor, só backoff. Não some do radar.
      state.lastError = (leaseRes && (leaseRes.error || `http_${leaseRes.statusCode || "?"}`)) || "lease_sem_resposta";
      state.lastAction = "backoff_lease";
      return computeBackoffMs(2, pollBaseMs, pollCapMs);
    }
    const body = leaseRes.data;
    const missions = Array.isArray(body.missions) ? body.missions : [];
    const activity = body.activity || { activeUsers: 0, windowMinutes: 5 };
    const lag = body.lag || null;
    state.lastActivity = activity;
    state.lastLag = lag;

    const decision = decideNextAction({
      circuitOpen: state.circuitOpen,
      activeUsers: activity.activeUsers,
      activityFreiaThreshold,
      queuedDue: lag ? lag.queuedDue : (missions.length ? 1 : 0),
      warm: state.warm,
      supported: body.supported !== false,
      paused: Boolean(body.paused),
    });
    state.lastAction = decision.action;
    state.lastReason = decision.reason;

    // Freia/idle: solta o que leaseou (não deixa preso) e recua. Idle prolongado → descarrega o 30B.
    if (decision.action === "freia" || decision.action === "idle") {
      for (const m of missions) {
        await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(m.id)}/fail`, {
          leaseId: m.leaseId, error: decision.action === "freia" ? "cedendo_a_vez_usuario_ativo" : "idle_sem_trabalho", retryable: true,
        }).catch(() => null);
      }
      if (state.idleSinceMs == null) state.idleSinceMs = now();
      if (state.warm && unloadAfterIdleMs > 0 && now() - state.idleSinceMs >= unloadAfterIdleMs) {
        await unloadModel(decision.action === "freia" ? "usuário ativo" : "ocioso").catch(() => null);
      }
      return decision.action === "freia" ? Math.min(pollCapMs, pollBaseMs * 6) : pollCapMs;
    }

    // Warm: precisa aquecer ANTES de trabalhar. Solta o lote leaseado (evita segurar missão durante o
    // cold-load de ~2min — lei 2: nunca cold-load com missão em voo). Reaquece e volta no próximo tick.
    if (decision.action === "warm") {
      for (const m of missions) {
        await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(m.id)}/fail`, {
          leaseId: m.leaseId, error: "aquecendo_30b_antes_de_processar", retryable: true,
        }).catch(() => null);
      }
      const warmed = await ensureWarm();
      if (!warmed.ok) {
        state.lastError = `warm_falhou:${warmed.reason || "?"}`;
        return computeBackoffMs(2, pollBaseMs, pollCapMs);
      }
      state.idleSinceMs = null;
      return pollBaseMs; // já quente → próximo tick leaseia e processa
    }

    // Work: quente + tem trabalho + ninguém ativo. Se o lease veio vazio (corrida), só recua leve.
    state.idleSinceMs = null;
    if (!missions.length) return pollBaseMs;

    let anyFailed = false;
    for (const mission of missions) {
      if (stopping || !state.manualEnabled) break;
      const r = await processMission(mission);
      if (!r.ok) anyFailed = true;
    }

    // DISJUNTOR: conta falhas CONSECUTIVAS de missão (execução/complete), não de rede. Teto → abre.
    if (anyFailed) {
      state.consecutiveFailures += 1;
      state.lastError = `missao_falhou (${state.consecutiveFailures}/${maxConsecutiveFailures})`;
      if (state.consecutiveFailures >= maxConsecutiveFailures) {
        state.circuitOpen = true;
        state.circuitReason = `teto de ${maxConsecutiveFailures} falhas consecutivas — worker PARADO, requer intervenção`;
        log(`[ponte] DISJUNTOR ABERTO: ${state.circuitReason}`);
        return pollCapMs;
      }
      return computeBackoffMs(state.consecutiveFailures, pollBaseMs, pollCapMs);
    }
    state.consecutiveFailures = 0;
    state.lastError = null;
    return pollBaseMs;
  }

  function scheduleNext(delayMs) {
    if (stopping || !state.manualEnabled || loopTimer || loopExecuting) return;
    loopTimer = setTimeout(runLoop, Math.max(1000, delayMs));
    if (loopTimer.unref) loopTimer.unref();
  }

  async function runLoop() {
    loopTimer = null;
    if (stopping || !state.manualEnabled) return;
    loopExecuting = true;
    let delay = pollBaseMs;
    try {
      delay = await tick();
    } catch (error) {
      // Erro inesperado no tick NÃO abre disjuntor (isso é pra falha de MISSÃO) — só backoff e loga.
      state.lastError = `tick_erro:${(error && error.message) || error}`;
      delay = computeBackoffMs(2, pollBaseMs, pollCapMs);
    } finally {
      loopExecuting = false;
    }
    scheduleNext(delay);
  }

  function statusSnapshot() {
    return {
      manualEnabled: state.manualEnabled,
      pausedByOwner: !state.manualEnabled,
      controlSource: state.controlSource,
      controlUpdatedAt: state.controlUpdatedAt,
      controlPersistent: Boolean(controlStore && controlStore.load && controlStore.save),
      running: state.running,
      circuitOpen: state.circuitOpen,
      circuitReason: state.circuitReason,
      consecutiveFailures: state.consecutiveFailures,
      maxConsecutiveFailures,
      warm: state.warm,
      model,
      workerId,
      lastAction: state.lastAction,
      lastReason: state.lastReason,
      activity: state.lastActivity,
      lag: state.lastLag,
      lastError: state.lastError,
      currentMissionId: state.currentMissionId,
      startedAt: state.startedAt,
      totals: state.totals,
      lastJobs: state.lastJobs,
    };
  }

  function startRuntime() {
    if (!state.manualEnabled) {
      log("[ponte] ponte pausada pelo dono — boot não rearma sozinho.");
      return false;
    }
    if (state.running) return true;
    state.running = true;
    stopping = false;
    state.startedAt = new Date(now()).toISOString();
    state.lastAction = "starting";
    state.lastReason = "ponte liberada — aguardando próximo ciclo";
    log(`[ponte] worker LIGADO (model=${model}, batch=${batchSize}, freia≥${activityFreiaThreshold} ativo).`);
    scheduleNext(pollBaseMs);
    return true;
  }

  function pauseRuntime() {
    stopping = true;
    state.running = false;
    state.lastAction = "owner_paused";
    state.lastReason = state.currentMissionId
      ? "pausa confirmada — concluindo somente a missão já em voo"
      : "pausada pelo dono";
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
  }

  function setManualEnabled(enabled) {
    if (typeof enabled !== "boolean") {
      return { ok: false, reason: "enabled_boolean_obrigatorio", status: statusSnapshot() };
    }
    const updatedAt = new Date(now()).toISOString();
    let persisted = false;
    try {
      persisted = Boolean(controlStore && controlStore.save && controlStore.save({
        manualEnabled: enabled,
        pausedByOwner: !enabled,
        updatedAt,
      }));
    } catch { persisted = false; }
    if (!persisted) {
      return { ok: false, reason: "controle_nao_persistido", status: statusSnapshot() };
    }

    state.manualEnabled = enabled;
    state.controlSource = "owner";
    state.controlUpdatedAt = updatedAt;
    if (enabled) startRuntime();
    else pauseRuntime();
    return { ok: true, status: statusSnapshot() };
  }

  return {
    // Metadados/constantes expostos pros testes e pro painel.
    PONTE_STAGES,
    PONTE_NUM_CTX,
    decideNextAction,
    computeBackoffMs,

    start() {
      return startRuntime();
    },

    setManualEnabled,

    /** Rearma o disjuntor (botão manual do :3107/E2). Zera falhas, fecha o circuito. */
    resetCircuit() {
      state.circuitOpen = false;
      state.circuitReason = null;
      state.consecutiveFailures = 0;
      state.lastError = null;
      if (state.manualEnabled && state.running && !loopTimer) scheduleNext(pollBaseMs);
      return true;
    },

    // Nome exportado continua "unload" — é como o server.js:3679/3710 já chama (CONTRATO congelado
    // do orquestrador, HBX-OWNER-V3-CONTRATO.md §2). Por dentro virou unloadModel(reason, opts) COM
    // PROVA; opts = { force=false, timeoutMs=60000 }; devolve OBJETO, não mais o boolean mentiroso.
    unload(reason, opts) { return unloadModel(reason || "manual", opts); },
    warm() { return ensureWarm(); },

    /** Leitura da verdade (E2-a): { ok, resident, ramMb, error } direto do /api/ps. Só leitura, nunca lança. */
    readResident() { return readResident(); },

    /** Estado VERMELHO/verde consultável pro painel :3107 (E2). Só leitura, nunca lança. */
    status() {
      return statusSnapshot();
    },

    // exposto p/ testes injetarem um tick único
    _tickOnce: tick,
    _state: state,
  };
}

module.exports = {
  createPonteWorker,
  decideNextAction,
  computeBackoffMs,
  safeParseJson,
  modelMatches,
  selectRunnerPidsToKill,
  OLLAMA_30B_MODEL,
  PONTE_NUM_CTX,
  PONTE_STAGES,
  EXTRACTION_SYSTEM_PROMPT,
};
