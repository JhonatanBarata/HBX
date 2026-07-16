"use strict";

// ─── WORKER LOCAL DA PONTE (CHIP E1, 05/07) ─────────────────────────────────────────────────────
// A ÚNICA peça nova da arquitetura híbrida 30B×4b. Vive junto do local-agent (Node puro, sem
// framework). Loop PULL: leaseia missão do BACKEND (VPS ou local) → executa no 30B local (Ollama
// :11434) → devolve resultado bruto no complete (o BACKEND grava pelo caminho único de escrita).
//
// LEIS QUE O T1/T2 MEDIRAM (não opcionais):
//  1. num_ctx SEMPRE capado E UNIFICADO em 8192 em TODA chamada — trocar ctx entre chamadas realoca
//     KV e foi a causa do run CTXMISTO abortado (T2 §3). Aqui: PONTE_NUM_CTX fixo pros dois tipos.
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

const OLLAMA_30B_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M";
const PONTE_NUM_CTX = 8192; // capado E unificado (lei 1)
const PONTE_STAGES = ["enrich_lead", "xray_note"];

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

// Prompt de nota — VERBATIM do backend/src/webscraping/radar/cnpj-xray/cnpj-xray-ai-note.service.ts
const NOTE_SYSTEM_PROMPT = [
  "Você avalia leads B2B brasileiros pra um vendedor.",
  "Devolva SOMENTE JSON válido, nada fora dele, no formato:",
  '{"nota_icp": 0-100, "resumo": "..."}',
  "nota_icp: quanto esse negócio parece um bom cliente (site no ar, WhatsApp confirmado, porte,",
  "segmento definido = nota alta; dado pobre/empresa inativa = nota baixa).",
  "resumo: 1 frase curta (até 140 caracteres) explicando o porquê da nota, em português.",
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

// ─── FÁBRICA DO WORKER ──────────────────────────────────────────────────────────────────────────

/**
 * deps:
 *  - ollamaRequest(method, path, payload, timeoutMs): chamada ao Ollama local (house helper).
 *  - backendRequest(method, route, payload, options): chamada autenticada ao backend (house helper).
 *  - fetchSiteText(website): crawl leve do site (reusa o do server.js) — só p/ enrich_lead.
 *  - controlStore: { load(), save(data) } para o freio manual persistente.
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
  try { persistedControl = controlStore && controlStore.load ? controlStore.load() : null; } catch { persistedControl = null; }
  const hasManualJournal = typeof persistedControl?.manualEnabled === "boolean" || typeof persistedControl?.pausedByOwner === "boolean";
  const initialManualEnabled = hasManualJournal
    ? (typeof persistedControl.manualEnabled === "boolean" ? persistedControl.manualEnabled : !persistedControl.pausedByOwner)
    : envBool(env, "HBX_PONTE_WORKER_ENABLED", false);

  const state = {
    manualEnabled: initialManualEnabled,
    controlSource: hasManualJournal ? "owner" : "automatic_config",
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
    lastError: null,
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

  async function unloadModel(reason) {
    const r = await ollamaRequest(
      "POST",
      "/api/generate",
      { model, prompt: "", keep_alive: 0, options: { num_ctx: PONTE_NUM_CTX } },
      15000,
    );
    state.warm = false;
    state.totals.unloads += 1;
    log(`[ponte] 30B descarregado (${reason}).`);
    return Boolean(r && (r.ok || r.statusCode));
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

    if (stage === "xray_note") {
      const note = payload.note || {};
      const lines = [
        note.razaoSocial ? `Razão social: ${note.razaoSocial}` : null,
        note.nomeFantasia ? `Nome fantasia: ${note.nomeFantasia}` : null,
        note.situacao ? `Situação cadastral: ${note.situacao}` : null,
        note.cnaeDescription ? `Ramo: ${note.cnaeDescription}` : null,
        note.porte ? `Porte: ${note.porte}` : null,
        note.city || note.state ? `Local: ${[note.city, note.state].filter(Boolean).join("/")}` : null,
        `Site: ${note.hasWebsite ? "sim" : "não"}`,
        `WhatsApp validado: ${note.hasWhatsappValidado ? "sim" : "não"}`,
        `E-mail: ${note.hasEmail ? "sim" : "não"}`,
      ].filter(Boolean);
      if (lines.length <= 3) {
        // dado pobre — nota null (o backend faz noop, não zera nota existente)
        return { result: { radarLeadId: payload.radarLeadId || null, notaIcp: null, resumo: null, model } };
      }
      const out = await callOllamaChat(NOTE_SYSTEM_PROMPT, lines.join("\n"), envInt(env, "HBX_PONTE_NOTE_MAX_TOKENS", 150));
      if (!out.ok) return { fail: out.reason, retryable: true };
      const p = out.parsed;
      const notaRaw = Number(p.nota_icp);
      const nota = Number.isFinite(notaRaw) ? Math.max(0, Math.min(100, Math.round(notaRaw))) : null;
      const resumo = String(p.resumo || "").trim().slice(0, 140) || null;
      return { result: { radarLeadId: payload.radarLeadId || null, notaIcp: nota, resumo, model } };
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

    unload(reason) { return unloadModel(reason || "manual"); },
    warm() { return ensureWarm(); },

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
  OLLAMA_30B_MODEL,
  PONTE_NUM_CTX,
  PONTE_STAGES,
  EXTRACTION_SYSTEM_PROMPT,
  NOTE_SYSTEM_PROMPT,
};
