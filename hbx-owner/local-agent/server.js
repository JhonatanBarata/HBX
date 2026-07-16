const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
// Journal em disco (estado durável do enricher/transfer). Escrita atômica, zero-dep. Ver lib/state.js.
const stateStore = require("./lib/state");
// Utilitários puros (Sprint 5) — sem estado de módulo. Ver lib/util.js e lib/engine-capacity.js.
const {
  nowIso,
  safeText,
  clampInt,
  cardDomain,
  chunkLeadsBySize,
  resolveExecutable,
  assertSafeCommand,
  readDotenvValue,
  parsePercentString,
  parseSizeToGb,
  parseLoadTriplet,
  httpModuleForUrl,
} = require("./lib/util");
const { parseEngineCapacity } = require("./lib/engine-capacity");
const { normalizeFabricaResponse } = require("./lib/fabrica-proxy");
// Worker local da PONTE (CHIP E1) — puxa missão do backend e executa no 30B local. Ver lib/ponte-worker.js.
const { createPonteWorker } = require("./lib/ponte-worker");

// Limiares de aviso (alinhados aos soft limits da Night Factory).
const PRESSURE_LIMITS = { ram: 78, cpu: 75, disk: 85 };
const SYSTEM_CONTAINERS = ["backend", "app-db-1", "hbx-scraping-engine", "webscraping", "hbx-ops-control"];

const HOST = "127.0.0.1";
const PORT = Number(process.env.HBX_OWNER_LOCAL_AGENT_PORT || 3107);
const TOKEN = String(process.env.HBX_OWNER_LOCAL_TOKEN || "").trim();
const rootDir = path.resolve(__dirname, "..", "..");
const logsDir = path.join(__dirname, "logs");
const webDir = path.join(__dirname, "web");
const localLabDir = path.join(rootDir, "hbx-local-lab");
const localLabUrl = "http://127.0.0.1:3098";
// Ollama LOCAL (Cérebro IA) — mesma máquina; nunca sai daqui. /api/tags lista presentes,
// /api/ps lista os que estão QUENTES (carregados em RAM/VRAM). Allowlist p/ o warm.
// CHIP E2 (05/07): tag alinhada com a REAL usada pelo worker da ponte (lib/ponte-worker.js
// OLLAMA_30B_MODEL) — a allowlist tinha "qwen3:30b-a3b" (tag que não existe/não é a residente) e
// nunca batia no /api/tags real. 7b MORTO em toda a arquitetura híbrida (PLANO-HIBRIDO-30B.md §1:
// "Não puxar 7b em lugar nenhum") — removido da allowlist do painel. Único outro uso de "7b" no
// arquivo é o par has7b/warm7b do readAiStatus() (linha ~530), que fica só como leitura informativa
// (mostra se o 7b órfão ainda ocupa disco) — não decide nada, não aquece, não entra na allowlist.
const ollamaUrl = String(process.env.HBX_OWNER_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const AI_MODEL_30B = "qwen3:30b-a3b-instruct-2507-q4_K_M";
const AI_MODEL_ALLOWLIST = new Set([AI_MODEL_30B]);
const PONTE_NUM_CTX_WARM = 8192; // T1/T2: SEMPRE capado — default 262k aloca ~45,7GB de KV (swap-morte)
// Backend do produto (para Banco de Leads e import local→VPS). Token opcional.
const backendUrl = String(process.env.HBX_OWNER_BACKEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
let backendToken = String(process.env.HBX_OWNER_BACKEND_TOKEN || "").trim();
let backendTokenRefreshPromise = null;
// Transferência VPS<->local em segundo plano (1 por vez) + progresso vivo pra UI.
// processed/total = a % honesta (quantos leads já passaram ÷ total real do banco).
// total      = total de cards da ORIGEM (push=local, pull=VPS) → denominador da %.
// otherTotal = total de cards do DESTINO depois da transferência → pra reconciliar os dois lados.
let transferJob = {
  running: false, direction: null, phase: "",
  processed: 0, total: null, otherTotal: null, page: 0, errors: 0, failed: 0, lastError: null,
  pulled: 0, imported: 0, sent: 0, cleared: 0,
  done: false, ok: null, error: null, startedAt: 0, finishedAt: 0,
};

function freshTransferJob(direction) {
  return {
    running: true, direction, phase: "iniciando",
    processed: 0, total: null, otherTotal: null, page: 0, errors: 0, failed: 0, lastError: null,
    pulled: 0, imported: 0, duplicates: 0, rejected: 0, sent: 0, cleared: 0,
    done: false, ok: null, error: null, startedAt: Date.now(), finishedAt: 0,
  };
}

// Journal em disco da transferência "mandar/trazer tudo". Gravado a cada página OK. Se o agent
// cair no meio, o boot detecta o journal não-finalizado e expõe resumable:true no /owner/transfer/
// status → a UI mostra "retomar" (reclica a rota de start; o import é idempotente por externalId).
// No fim OK o journal é apagado. `transferResume` é o que o boot achou (só p/ exibir até religar).
let transferResume = null;
function saveTransferJournal(sentIds) {
  stateStore.save("transfer", {
    running: true,
    direction: transferJob.direction,
    page: transferJob.page,
    sentIds: Array.isArray(sentIds) ? sentIds.slice(-100000) : [],
    pulled: transferJob.pulled,
    sent: transferJob.sent,
    imported: transferJob.imported,
    startedAt: transferJob.startedAt,
    savedAt: Date.now(),
  });
}
function clearTransferJournal() {
  transferResume = null;
  stateStore.clear("transfer");
}
// No boot: se sobrou um journal (agent morreu no meio de uma transferência), guarda pra expor
// resumable no status. NÃO retoma sozinho — o dono reclica (evita transferência-fantasma no boot).
function loadTransferResumeOnBoot() {
  const j = stateStore.load("transfer");
  if (j && j.running === true) {
    transferResume = {
      direction: j.direction || null,
      page: Number(j.page) || 0,
      pulled: Number(j.pulled) || 0,
      sent: Number(j.sent) || 0,
      imported: Number(j.imported) || 0,
      startedAt: Number(j.startedAt) || 0,
    };
  } else {
    transferResume = null;
    if (j) stateStore.clear("transfer"); // journal já finalizado que ficou pra trás → limpa
  }
  return transferResume;
}

// Total de cards transferíveis de cada lado (mesma régua nos dois → dá pra reconciliar/igualar).
async function readVpsCardTotal() {
  const r = await opsRequest("GET", "/api/radar/vps/database-cards?limit=1&page=1", null, 30000);
  const d = r && r.data && r.data.data ? r.data.data : (r && r.data);
  return d && typeof d.total === "number" ? d.total : null;
}
async function readLocalCardTotal() {
  if (!backendToken) await refreshBackendToken().catch(() => null);
  const r = await backendRequest("GET", "/modules/owner/radar/database-cards?limit=1&page=1", null, { timeoutMs: 15000 });
  return r && r.ok && r.data && typeof r.data.total === "number" ? r.data.total : null;
}

// Tenta de novo UMA vez quando o predicado de sucesso falha (timeout/blip de rede),
// pra a transferência não morrer por causa de um soluço passageiro do SSH/backend.
async function withRetry(fn, isOk, tries = 2, gapMs = 800) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    last = await fn();
    if (isOk(last)) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return last;
}

// chunkLeadsBySize → lib/util.js (Sprint 5).
// Ops Control = ponte JÁ pronta pra VPS (SSH + controles). Reaproveitamos por proxy:
// a coluna VPS da guia Sistema fala com o Ops Control (modo ssh), não duplica SSH aqui.
const opsUrl = String(process.env.HBX_OWNER_OPS_URL || "http://127.0.0.1:3099").replace(/\/+$/, "");
const opsToken = String(process.env.HBX_OWNER_OPS_TOKEN || "").trim();

// ---------- Auto-heal do Ops Control (:3099) COM DISJUNTOR (âncora 18/06: a correção é o FREIO) ----------
// D1 (04/07): o container hbx-ops-control levou SIGTERM e ficou Exited(1); nada o religa e a coluna VPS
// inteira do painel morre CALADA. Aqui o agent (docker nativo) religa SOZINHO — mas NUNCA em loop livre:
//  - Detector: um opsRequest cair com ECONNREFUSED = :3099 sem listener (o container caiu).
//  - Ação: `docker start hbx-ops-control` (start simples preserva o env da criação; compose é só p/ container
//    inexistente — nesse caso a gente LOGA a instrução, não roda compose pelo agent).
//  - Disjuntor: no máx 1 tentativa a cada 5 min; teto de 3 seguidas SEM sucesso → "desisti" (exposto no
//    /health) e para de tentar até o agent reiniciar OU o Ops Control responder de verdade.
const OPS_HEAL_MIN_INTERVAL_MS = 5 * 60 * 1000; // rate-limit: 1 tentativa a cada 5 min (nunca loop apertado)
const OPS_HEAL_MAX_ATTEMPTS = 3;                // teto de tentativas seguidas sem sucesso → desisti
let opsAutoHeal = {
  state: "idle",     // idle | tentando | desisti (volta a idle quando o :3099 responde de novo)
  attempts: 0,       // tentativas seguidas SEM o Ops Control voltar (zera quando ele responde)
  lastAttemptAt: 0,  // epoch ms da última tentativa (base do rate-limit)
  lastHealAt: 0,     // epoch ms do último `docker start` que deu certo
  lastError: null,   // último motivo de falha (pro /health contar a verdade — anti-D2/D3)
};

// Qualquer resposta HTTP do :3099 (mesmo 4xx/5xx) prova que o processo está VIVO e ouvindo → zera o
// disjuntor. É o sinal honesto de "Ops Control de pé"; chamado quando um opsRequest recebe resposta.
function recordOpsHealthy() {
  if (opsAutoHeal.state === "idle" && opsAutoHeal.attempts === 0 && !opsAutoHeal.lastError) return;
  opsAutoHeal.state = "idle";
  opsAutoHeal.attempts = 0;
  opsAutoHeal.lastError = null;
}

// Uma passada do auto-heal (síncrona e curta — mesmo padrão do ensureEnginesUp). Só é chamada pelo
// triggerOpsAutoHeal, que já aplicou o rate-limit e já incrementou o contador de tentativas.
function healOpsControlOnce(reason) {
  console.log(`[ops-heal] tentativa ${opsAutoHeal.attempts}/${OPS_HEAL_MAX_ATTEMPTS} — Ops Control :3099 recusou conexao (${reason}).`);
  // Fonte da verdade = docker, não o app. O container existe? Em que estado? (separador ESPAÇO: o `|`
  // é bloqueado pelo assertSafeCommand como operador de shell — nome de container nunca tem espaço.)
  const ps = execRead(["docker", "ps", "-a", "--filter", "name=hbx-ops-control", "--format", "{{.Names}} {{.State}}"]);
  if (!ps.ok) {
    opsAutoHeal.lastError = `docker indisponivel: ${(ps.stderr || "").trim().slice(0, 160)}`;
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
    return;
  }
  const line = String(ps.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).find((s) => s === "hbx-ops-control" || s.startsWith("hbx-ops-control "));
  if (!line) {
    // Container inexistente: recriar é fora do escopo do auto-heal (compose up com env é do start-owner/up).
    opsAutoHeal.lastError = "container hbx-ops-control inexistente — rode `npm run up` (o start-owner sobe o ops) ou o docker compose do ops-control.";
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
    return;
  }
  const state = (line.split(/\s+/)[1] || "").trim();
  if (state === "running") {
    // docker diz de pé mas :3099 recusou → subindo ou instável. NÃO reinicia às cegas (evita derrubar o boot).
    opsAutoHeal.lastError = "container rodando mas :3099 recusou (subindo ou instavel) — sem religar as cegas.";
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
    return;
  }
  // Container parado (exited/created/dead) → religa com start simples (preserva o env da criação).
  const start = execRead(["docker", "start", "hbx-ops-control"]);
  if (start.ok) {
    opsAutoHeal.lastHealAt = Date.now();
    opsAutoHeal.lastError = null;
    invalidateDockerReadCache(); // mudou o estado do container → próxima leitura tem que ser fresca
    opsDrift.at = 0;             // D4: container voltou (pode ter imagem diferente) → força re-checar o drift
    console.log(`[ops-heal] docker start hbx-ops-control OK (estava ${state}). Aguardando :3099 responder.`);
    // NÃO zera attempts aqui: só uma resposta real do :3099 (recordOpsHealthy) comprova a volta.
  } else {
    opsAutoHeal.lastError = `docker start falhou: ${(start.stderr || "").trim().slice(0, 160)}`;
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
  }
}

// Detector chamado quando um opsRequest cai com ECONNREFUSED. Aplica o DISJUNTOR antes de agir.
function triggerOpsAutoHeal(reason) {
  if (opsAutoHeal.state === "desisti") return;                            // já desistiu → não tenta mais (freio total)
  const now = Date.now();
  if (now - opsAutoHeal.lastAttemptAt < OPS_HEAL_MIN_INTERVAL_MS) return; // rate-limit: 1/5min, nunca loop apertado
  opsAutoHeal.lastAttemptAt = now;
  opsAutoHeal.attempts += 1;
  opsAutoHeal.state = "tentando";
  try {
    healOpsControlOnce(reason);
  } catch (error) {
    opsAutoHeal.lastError = `excecao no heal: ${error.message}`;
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
  }
  // Teto: 3 seguidas sem sucesso → desisti (para de tentar; expõe no /health). Reinício do agent OU uma
  // resposta real do :3099 (recordOpsHealthy) religa o auto-heal.
  if (opsAutoHeal.attempts >= OPS_HEAL_MAX_ATTEMPTS) {
    opsAutoHeal.state = "desisti";
    console.log(`[ops-heal] DESISTI apos ${opsAutoHeal.attempts} tentativas seguidas sem sucesso. Ultimo erro: ${opsAutoHeal.lastError || "?"}. Religue manualmente (npm run up / docker compose ops).`);
  }
}

// Religar MANUAL (botão "Religar Ops Control" do painel, S2). Um clique humano NÃO é o "loop livre"
// que a âncora 18/06 combate — a UI trava o botão em "religando…" até o :3099 confirmar e NUNCA
// re-dispara sozinha. Então o humano ASSUME o disjuntor: sai de "desisti", zera a contagem e conta 1
// tentativa (reusa o MESMO healOpsControlOnce → mesma allowlist `docker start`). Sem loop, sem fila.
function manualHealOpsControl() {
  opsAutoHeal.state = "tentando";
  opsAutoHeal.attempts = 1;              // clique humano recomeça a contagem (não empilha no teto do auto)
  opsAutoHeal.lastAttemptAt = Date.now(); // trava o auto-heal por 5min (não dobra o docker start em cima)
  try {
    healOpsControlOnce("religar-manual");
  } catch (error) {
    opsAutoHeal.lastError = `excecao no heal: ${error.message}`;
    console.log(`[ops-heal] ${opsAutoHeal.lastError}`);
  }
  opsAliveCache = { at: 0, alive: null }; // invalida o cache de vivacidade → próximo /health faz ping fresco
  return {
    state: opsAutoHeal.state,
    attempts: opsAutoHeal.attempts,
    maxAttempts: OPS_HEAL_MAX_ATTEMPTS,
    lastError: opsAutoHeal.lastError,
    lastHealAt: opsAutoHeal.lastHealAt ? new Date(opsAutoHeal.lastHealAt).toISOString() : null,
  };
}

// ---------- Painel HONESTO (S2): vivacidade real + 4 causas canônicas da ponte VPS ----------
// D2/D3 (04/07): com o Ops Control morto o painel dizia "ops ✓" verde e culpava a VPS ("sob carga").
// Aqui a verdade tem 1 sinal (opsAlive) e a falha tem NOME (uma de 4 causas), com a frase certa.
const OPS_REASON_TEXT = {
  ops_token_ausente: "Configure o Ops Control (token).",
  ops_caido: "Ops Control parado NESTA máquina — religar.",
  ssh_falhou: "Ops no ar, mas o SSH pra VPS falhou.",
  vps_lenta: "VPS demorou a responder (pode estar sob carga).",
};
// Classifica o erro de TRANSPORTE ao :3099 (localhost) em 1 das causas. Refused/DNS = o processo local
// não está ouvindo (container caiu) → ops_caido. timeout = respondeu devagar (SSH pendurado) → vps_lenta.
// Qualquer outro erro de socket no localhost (reset/pipe) = o :3099 morreu no meio → ops_caido.
function classifyOpsTransportError(error) {
  const code = (error && error.code) || "";
  const msg = String((error && error.message) || "");
  if (msg === "timeout" || code === "ETIMEDOUT" || /timed? ?out/i.test(msg)) return "vps_lenta";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || /ECONNREFUSED|ENOTFOUND/.test(msg)) return "ops_caido";
  return "ops_caido";
}

// Vivacidade REAL do Ops Control (:3099): um GET curtinho ao /health. Qualquer resposta HTTP (mesmo
// 401/404/500) prova que o processo está de pé e ouvindo → alive:true (e zera o disjuntor via
// recordOpsHealthy). ECONNREFUSED/ENOTFOUND = ninguém ouvindo → alive:false + dispara o auto-heal. Um
// timeout de 1.5s NÃO decide "morto" (pode ser SSH lento por trás): mantém o último veredito do cache.
// Cache de 10s pra não custar nada no polling; `force` fura o cache (confirmação pós-religar).
let opsAliveCache = { at: 0, alive: null };
function readOpsAlive(force, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!opsToken) { resolve(false); return; }               // sem token → a pílula fica cinza, nem tenta
    if (!force && opsAliveCache.alive !== null && Date.now() - opsAliveCache.at < 10_000) {
      resolve(opsAliveCache.alive);
      return;
    }
    const finish = (alive) => { opsAliveCache = { at: Date.now(), alive }; resolve(alive); };
    let target;
    try { target = new URL(`${opsUrl}/health`); } catch { finish(false); return; }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname, method: "GET", timeout: timeoutMs },
      (response) => {
        recordOpsHealthy();          // respondeu (qualquer status) → listener vivo, zera o disjuntor
        response.resume();           // drena e descarta o corpo
        response.on("end", () => finish(true));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => {
      if (classifyOpsTransportError(error) === "ops_caido") {
        try { triggerOpsAutoHeal(error.code || "ECONNREFUSED"); } catch { /* heal nunca derruba o ping */ }
        finish(false);
        return;
      }
      // timeout/erro transiente: não afirma "morto"; devolve o último conhecido (false se nunca soube).
      resolve(opsAliveCache.alive === null ? false : opsAliveCache.alive);
    });
    req.end();
  });
}

// ---------- Anti-drift da imagem do Ops Control (D4, S3: a correção é PERCEBER o descompasso) ----------
// D4 (04/07): a imagem do :3099 pode ficar PARA TRÁS do código de ops-control/ no disco — rodou 2 dias
// com a imagem de 30/06 enquanto o disco já tinha o código de 02/07; as rotas novas davam 404 CALADO e
// ninguém percebeu. Aqui o agent compara o hash do código LOCAL de ops-control/ (git log -1 -- ops-control)
// com o hash gravado na imagem (GET /api/build-info). Divergiu = "ops desatualizado — rebuild": warning no
// snapshot (vps.system.warnings) + badge âmbar na pílula ops. Sem base de comparação (não é repo git, ou
// imagem sem build-info) NÃO afirma drift — evita alarme falso. Throttle: relê no máx 1×/5min.
let opsDrift = { checked: false, drift: false, buildHash: null, localHash: null, at: 0, error: null };
const OPS_DRIFT_RECHECK_MS = 5 * 60 * 1000;

// Hash do ÚLTIMO commit que tocou ops-control/ — a MESMA régua que a imagem grava no build (ARG). Casa
// iff a imagem foi buildada com o ops-control/ atual. Silencia (retorna "") se não for um repo git.
async function localOpsGitHash() {
  const r = await execReadAsync(["git", "log", "-1", "--format=%h", "--", "ops-control"]);
  if (!r.ok) return "";
  return String(r.stdout || "").trim().split(/\r?\n/)[0].trim();
}

// GET curto ao :3099/api/build-info (atrás do token). Degrada gracioso: Ops Control ANTIGO (sem a rota)
// ou off → { ok:false } e o drift fica "não checado" (nunca inventa divergência).
function readOpsBuildInfo(timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!opsToken) { resolve({ ok: false, reason: "ops_token_ausente" }); return; }
    let target;
    try { target = new URL(`${opsUrl}/api/build-info`); } catch { resolve({ ok: false, reason: "url_invalida" }); return; }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname, method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${opsToken}` }, timeout: timeoutMs },
      (response) => {
        let body = "";
        response.on("data", (c) => { if (body.length < 8000) body += c.toString("utf8"); });
        response.on("end", () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
          if (response.statusCode >= 200 && response.statusCode < 300 && parsed) {
            resolve({ ok: true, gitHash: String(parsed.gitHash || ""), builtAt: parsed.builtAt || null });
          } else {
            resolve({ ok: false, reason: `http_${response.statusCode || "?"}` });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, reason: error.code || error.message }));
    req.end();
  });
}

// Recalcula o veredito de drift (com throttle). `force` fura o throttle (usado no boot e após heal).
async function refreshOpsDrift(force) {
  if (!opsToken) { opsDrift = { checked: false, drift: false, buildHash: null, localHash: null, at: Date.now(), error: "ops_token_ausente" }; return opsDrift; }
  if (!force && opsDrift.at && Date.now() - opsDrift.at < OPS_DRIFT_RECHECK_MS) return opsDrift;
  const localHash = await localOpsGitHash();
  const info = await readOpsBuildInfo();
  if (!localHash || !info.ok || !info.gitHash || info.gitHash === "unknown") {
    // Falta base de comparação → NÃO afirma drift (drift:false, checked:false). Guarda o que deu p/ debug.
    opsDrift = {
      checked: false, drift: false,
      buildHash: info.ok ? (info.gitHash || null) : null,
      localHash: localHash || null,
      at: Date.now(), error: info.ok ? null : (info.reason || "sem_build_info"),
    };
    return opsDrift;
  }
  const drift = info.gitHash !== localHash;
  opsDrift = { checked: true, drift, buildHash: info.gitHash, localHash, at: Date.now(), error: null };
  if (drift) console.log(`[ops-drift] imagem ${info.gitHash} != codigo ops-control ${localHash} — rebuild recomendado (npm run up / docker compose up -d --build).`);
  return opsDrift;
}

// ---------- Frota de motores LOCAIS (autoridade = este agent, docker nativo) ----------
// O governor do backend NÃO consegue subir motor local: o container do backend não tem docker
// (sem socket/CLI) e a única ponte (ops-control) aponta SSH→VPS → todo `start` dá timeout. Quem
// sobe motor local é ESTE agent, que roda nativo no Windows com docker total.
// CRÍTICO subir a frota INTEIRA: um container parado pendura o health-check do backend por 3.5s
// (DNS do Docker trava no nome de container parado) → envenena a pressão da fonte e derruba TODOS
// em cooldown → o pump leasa 0 e nada raspa. Frota completa = health rápido (~55ms) = produção
// sustentada (provado ao vivo 29/06: 0→1696 cards em ~2.5min só subindo os 20 + limpando cooldown).
const ENGINE_FLEET_SIZE = clampInt(process.env.HBX_LOCAL_ENGINE_COUNT, 20, 1, 50);
let enginesKeepWarm = false; // o dono ligou os motores pelo painel? (mantém a frota de pé)
let enginesWarmTimer = null;
let lastEnginesAction = { at: 0, started: [], failed: [], stopped: [] };

function engineContainerNames(n = ENGINE_FLEET_SIZE) {
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push(`hbx-engine-${i}`);
  return out;
}

function runningEngineSet() {
  // Esta leitura pertence ao fluxo de mutação start/stop e permanece síncrona de propósito:
  // a sequência precisa decidir e executar a mudança sobre o mesmo retrato da frota.
  const r = execRead(["docker", "ps", "--filter", "name=hbx-engine-", "--format", "{{.Names}}"]);
  const set = new Set();
  if (r.ok) {
    for (const line of String(r.stdout || "").split(/\r?\n/)) {
      const name = line.trim();
      if (/^hbx-engine-\d+$/.test(name)) set.add(name);
    }
  }
  return set;
}

// Liga (docker start) os containers de motor que não estão rodando. Idempotente e RÁPIDO — NÃO
// recria o backend (o backend local já roda com a frota declarada nos envs HBX_ENGINE_*). Só os motores.
function ensureEnginesUp(n = ENGINE_FLEET_SIZE) {
  // NÃO subir searxng aqui: medido ao vivo 29/06, ele é LENTO (timeout 10s) e o motor o tenta 1º →
  // throughput cai 6x (+180/min sem → +31/min com). O fallback bing/ddg direto é mais rápido.
  const running = runningEngineSet();
  const started = [];
  const failed = [];
  for (const name of engineContainerNames(n)) {
    if (running.has(name)) continue;
    const r = execRead(["docker", "start", name]);
    if (r.ok) started.push(name);
    else failed.push({ name, error: (r.stderr || "").trim().slice(0, 160) });
  }
  if (started.length) invalidateDockerReadCache(); // mudou a frota → próxima leitura tem que ser fresca
  const alreadyUp = engineContainerNames(n).filter((x) => running.has(x)).length;
  return { started, failed, alreadyUp };
}

function stopEngineContainers(n = ENGINE_FLEET_SIZE) {
  const running = runningEngineSet();
  const stopped = [];
  const failed = [];
  for (const name of engineContainerNames(n)) {
    if (!running.has(name)) continue;
    const r = execRead(["docker", "stop", name]);
    if (r.ok) stopped.push(name);
    else failed.push({ name, error: (r.stderr || "").trim().slice(0, 160) });
  }
  if (stopped.length) invalidateDockerReadCache(); // mudou a frota → próxima leitura tem que ser fresca
  return { stopped, failed };
}

// Keep-warm: re-afirma a frota a cada 30s. Se um motor cair (OOM 137), sobe de volta ANTES de o
// backend acumular 3 falhas de health (=cooldown 30min). Disjuntor: intervalo FIXO, sem loop apertado.
function startEnginesKeepWarm() {
  enginesKeepWarm = true;
  if (enginesWarmTimer) return;
  enginesWarmTimer = setInterval(() => {
    if (!enginesKeepWarm) return;
    try { ensureEnginesUp(); } catch { /* docker indisponível por um tick; tenta de novo no próximo */ }
  }, 30000);
  if (enginesWarmTimer.unref) enginesWarmTimer.unref();
}

function stopEnginesKeepWarm() {
  enginesKeepWarm = false;
  if (enginesWarmTimer) { clearInterval(enginesWarmTimer); enginesWarmTimer = null; }
}

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

if (!TOKEN) {
  console.error("HBX_OWNER_LOCAL_TOKEN nao configurado. Configure a variavel de ambiente antes de iniciar.");
  process.exit(1);
}

// nowIso, safeText, clampInt, readDotenvValue, resolveExecutable, assertSafeCommand → lib/util.js (Sprint 5).

function relativeLogPath(logPath) {
  return path.relative(rootDir, logPath).replace(/\\/g, "/");
}

function execRead(command) {
  assertSafeCommand(command);
  const [binary, ...args] = command;
  const result = spawnSync(resolveExecutable(binary), args, {
    cwd: rootDir,
    shell: false,
    encoding: "utf8",
  });
  return {
    command: command.join(" "),
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    ok: result.status === 0,
  };
}

function spawnCaptureAsync(binary, args, commandLabel) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (exitCode, error) => {
      if (settled) return;
      settled = true;
      if (error && !stderr) stderr = error.message || String(error);
      resolve({
        command: commandLabel || [binary, ...args].join(" "),
        exitCode,
        stdout,
        stderr,
        ok: exitCode === 0,
      });
    };
    let child;
    try {
      child = spawn(binary, args, {
        cwd: rootDir,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish(null, error);
      return;
    }
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code, null));
  });
}

function execReadAsync(command) {
  assertSafeCommand(command);
  const [binary, ...args] = command;
  return spawnCaptureAsync(resolveExecutable(binary), args, command.join(" "));
}

// `docker ps`/`docker stats` são leituras de painel e não podem disputar o event loop com o freio
// da ponte. A primeira chamada roda em subprocesso assíncrono; polls iguais compartilham a mesma
// Promise e, depois, o resultado por 5s. `docker start/stop` continuam no execRead síncrono acima:
// mutações não são cacheadas nem tiveram seu comportamento alterado.
const dockerReadCache = new Map(); // cmdKey -> { generation, at, result, pending }
const DOCKER_READ_TTL_MS = 5000;
let dockerReadGeneration = 0;
function dockerRead(command) {
  const key = command.join(" ");
  const hit = dockerReadCache.get(key);
  if (hit?.pending) return hit.pending;
  if (hit?.result && Date.now() - hit.at < DOCKER_READ_TTL_MS) return Promise.resolve(hit.result);

  const generation = dockerReadGeneration;
  const pending = execReadAsync(command).then((result) => {
    const current = dockerReadCache.get(key);
    if (current?.pending === pending && current.generation === generation) {
      dockerReadCache.set(key, { generation, at: Date.now(), result, pending: null });
    }
    return result;
  });
  dockerReadCache.set(key, { generation, at: 0, result: null, pending });
  return pending;
}
function invalidateDockerReadCache() {
  dockerReadGeneration += 1;
  dockerReadCache.clear();
}

function requestLocalLabHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(`${localLabUrl}/health`, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        if (body.length < 2000) body += chunk.toString("utf8");
      });
      response.on("end", () => {
        let data = null;
        try {
          data = body ? JSON.parse(body) : null;
        } catch {
          data = null;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300 && data?.ok === true,
          statusCode: response.statusCode,
          data,
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

// Acha o(s) PID(s) do Local Lab. A FONTE DA VERDADE é quem está OUVINDO na 3098
// (Get-NetTCPConnection) — antes filtrava só por CommandLine contendo 'hbx-local-lab',
// mas o lab sobe com `node server.js` (cwd no diretório), então a CommandLine vem
// "<...>node.exe server.js" SEM o diretório → o match falhava e o stop virava no-op.
// Aqui unimos: dono da porta 3098 ∪ qualquer node cujo CommandLine cite o server.js do lab.
// Esta consulta pode levar muitos segundos no WMI. Ela roda fora do event loop e polls concorrentes
// compartilham o mesmo subprocesso/resultado, para nunca segurar o freio da ponte.
const LOCAL_LAB_PROCESS_TTL_MS = 10_000;
let localLabProcessGeneration = 0;
let localLabProcessCache = { generation: 0, at: 0, result: null, pending: null };

function parseLocalLabProcesses(result) {
  if (!result.ok || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && item.ProcessId);
  } catch {
    return [];
  }
}

function findLocalLabProcesses() {
  if (process.platform !== "win32") return Promise.resolve([]);
  if (localLabProcessCache.pending) return localLabProcessCache.pending;
  if (localLabProcessCache.result && Date.now() - localLabProcessCache.at < LOCAL_LAB_PROCESS_TTL_MS) {
    return Promise.resolve(localLabProcessCache.result);
  }
  const labServerPath = path.join(localLabDir, "server.js").replace(/\\/g, "\\\\");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$pids = New-Object System.Collections.Generic.HashSet[int]",
    // 1) Dono(s) da porta 3098 em LISTEN — é o processo que o /health realmente bate.
    "foreach ($c in (Get-NetTCPConnection -LocalPort 3098 -State Listen)) {",
    "  if ($c.OwningProcess) { [void]$pids.Add([int]$c.OwningProcess) }",
    "}",
    // 2) Reforço por CommandLine: node rodando o server.js do lab (ou sob o diretório do lab).
    "foreach ($p in (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\")) {",
    "  $cl = $p.CommandLine",
    `  if ($cl -and ($cl -match 'hbx-local-lab' -or $cl -like '*${labServerPath}*')) { [void]$pids.Add([int]$p.ProcessId) }`,
    "}",
    "$pids | ForEach-Object { [pscustomobject]@{ ProcessId = $_ } } | ConvertTo-Json -Compress",
  ].join("\n");
  const generation = localLabProcessGeneration;
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script];
  const pending = spawnCaptureAsync("powershell", args, "powershell local-lab-processes").then((result) => {
    const processes = parseLocalLabProcesses(result);
    if (localLabProcessCache.pending === pending && localLabProcessCache.generation === generation) {
      localLabProcessCache = { generation, at: Date.now(), result: processes, pending: null };
    }
    return processes;
  });
  localLabProcessCache = { generation, at: 0, result: null, pending };
  return pending;
}

function invalidateLocalLabProcessCache() {
  localLabProcessGeneration += 1;
  localLabProcessCache = { generation: localLabProcessGeneration, at: 0, result: null, pending: null };
}

async function readLocalLabStatus() {
  const [health, processes] = await Promise.all([
    requestLocalLabHealth(),
    findLocalLabProcesses(),
  ]);
  return {
    ok: true,
    url: localLabUrl,
    up: Boolean(health.ok),
    health,
    processes: processes.map((item) => ({ pid: item.ProcessId })),
    message: health.ok ? "api local up" : "api local off",
  };
}

function startLocalLab() {
  if (!fs.existsSync(path.join(localLabDir, "server.js"))) {
    throw new Error("hbx-local-lab/server.js nao encontrado.");
  }
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, "hbx-local-lab.log");
  const out = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: localLabDir,
    detached: true,
    shell: false,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      HBX_LOCAL_LAB_HOST: "127.0.0.1",
      HBX_LOCAL_LAB_PORT: "3098",
    },
    windowsHide: true,
  });
  child.unref();
  invalidateLocalLabProcessCache();
  return {
    pid: child.pid,
    logPath: relativeLogPath(logPath),
  };
}

function killPidWindows(pid) {
  // process.kill no Windows nem sempre derruba um node "detached" (sem árvore de sinais);
  // taskkill /T /F mata a árvore inteira de forma confiável. Idempotente: ignora "não existe".
  try {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, windowsHide: true, encoding: "utf8" });
  } catch {
    /* processo pode já ter saído */
  }
  try {
    process.kill(pid);
  } catch {
    /* idem */
  }
}

// Desliga o Local Lab DE VERDADE e idempotente:
// 1) pede shutdown limpo via HTTP (o próprio lab faz process.exit) — caminho preferido;
// 2) mata por PID quem ficar (dono da porta 3098 ∪ node do server.js do lab);
// 3) confirma pelo /health que caiu (até ~3s). Retorna quantos PIDs foram alvo + se ficou down.
async function stopLocalLab() {
  // (1) shutdown cooperativo — só faz sentido se ainda está respondendo.
  const before = await requestLocalLabHealth();
  if (before.ok) {
    await localLabRequest("POST", "/local-lab/shutdown", {}, 4000).catch(() => null);
    // dá um tempinho pro process.exit do lab acontecer
    for (let i = 0; i < 6; i += 1) {
      const h = await requestLocalLabHealth(600);
      if (!h.ok) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // (2) mata o que restou (idempotente: pode não sobrar nada).
  const processes = await findLocalLabProcesses();
  const pids = [];
  for (const item of processes) {
    const pid = Number(item.ProcessId);
    if (Number.isInteger(pid) && pid > 0) {
      pids.push(pid);
      killPidWindows(pid);
    }
  }
  if (pids.length) invalidateLocalLabProcessCache();

  // (3) confirma que o /health caiu (espera curta).
  let down = false;
  for (let i = 0; i < 8; i += 1) {
    const h = await requestLocalLabHealth(600);
    if (!h.ok) { down = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { killed: pids.length, pids, down };
}

// Chamada HTTP genérica ao Local Lab (3098) — DIRETO, sem passar por Ops Control/VPS.
// É a fiação "localhost apenas" do Email Finder: o crawl agressivo sai do IP local.
function localLabRequest(method, route, payload, timeoutMs = 20000, maxBytes = 8_000_000) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(`${localLabUrl}${route}`);
    } catch (error) {
      resolve({ ok: false, error: `URL local-lab invalida: ${error.message}` });
      return;
    }
    const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const headers = { Accept: "application/json" };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method, headers, timeout: timeoutMs },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { if (body.length < maxBytes) body += chunk.toString("utf8"); });
        response.on("end", () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode, data: parsed, raw: body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    if (data) req.write(data);
    req.end();
  });
}

// Chamada HTTP ao Ollama LOCAL (11434) — DIRETO, "localhost apenas" igual ao Local Lab.
// Degrade gracioso: qualquer falha (Ollama off, timeout) volta { ok:false, error } — nunca lança.
function ollamaRequest(method, route, payload, timeoutMs = 4000, maxBytes = 4_000_000) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(`${ollamaUrl}${route}`);
    } catch (error) {
      resolve({ ok: false, error: `URL ollama invalida: ${error.message}` });
      return;
    }
    const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const headers = { Accept: "application/json" };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method, headers, timeout: timeoutMs },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { if (body.length < maxBytes) body += chunk.toString("utf8"); });
        response.on("end", () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode, data: parsed, raw: body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    if (data) req.write(data);
    req.end();
  });
}

// Junta /api/tags (presentes) + /api/ps (quentes) num status honesto p/ o painel.
// Se o Ollama estiver off, ollamaUp=false e models=[] — a árvore degrada, nunca trava.
async function readAiStatus() {
  const [tagsR, psR] = await Promise.all([
    ollamaRequest("GET", "/api/tags", null, 4000),
    ollamaRequest("GET", "/api/ps", null, 4000),
  ]);
  const ollamaUp = Boolean(tagsR.ok || psR.ok);
  const tagList = (tagsR.ok && tagsR.data && Array.isArray(tagsR.data.models)) ? tagsR.data.models : [];
  const psList = (psR.ok && psR.data && Array.isArray(psR.data.models)) ? psR.data.models : [];
  const warmNames = new Set(psList.map((m) => String(m && m.name || "")));

  const models = tagList.map((m) => {
    const name = String(m && m.name || "");
    const sizeBytes = Number(m && m.size || 0);
    return {
      name,
      present: true,
      warm: warmNames.has(name),
      sizeGb: sizeBytes > 0 ? Math.round((sizeBytes / 1e9) * 10) / 10 : null,
    };
  });

  const find = (needle) => models.find((m) => m.name === needle || m.name.indexOf(needle) === 0);
  const m30 = find(AI_MODEL_30B);
  // 7b só como leitura informativa (achado da memória: "7b/3b órfãos em disco, 6,6GB") — MORTO na
  // arquitetura híbrida (não entra na allowlist de warm, não é aquecido por nada aqui).
  const m7 = find("qwen2.5:7b");
  return {
    ok: true,
    ollamaUp,
    models,
    has30b: Boolean(m30),
    has7b: Boolean(m7),
    warm30b: Boolean(m30 && m30.warm),
    warm7b: Boolean(m7 && m7.warm),
  };
}

// Crawl LEVE de site → texto puro (mesma limpeza do cnpj-xray.service.ts). Só p/ o worker da PONTE
// extrair contato via 30B; degrada gracioso (string vazia) em qualquer erro/timeout.
async function fetchSiteText(website) {
  if (!website || !/^https?:\/\//i.test(website)) return "";
  try {
    const response = await fetch(website, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; HBX-Ponte/1.0)" },
    });
    if (!response.ok) return "";
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

// Instância única do worker da PONTE. Sem journal, a configuração/env decide o primeiro boot.
// Depois de um freio manual, o journal prevalece e o boot não rearma sozinho.
const ponteWorker = createPonteWorker({
  ollamaRequest,
  backendRequest: (method, route, payload, options) => backendRequest(method, route, payload, options || {}),
  fetchSiteText,
  controlStore: {
    load: () => stateStore.load("ponte-control"),
    inspect: () => stateStore.inspect("ponte-control"),
    save: (data) => stateStore.save("ponte-control", data),
  },
  log: (msg) => console.log(msg),
  env: process.env,
});

// Garante o Local Lab no ar (sobe se preciso) e espera o /health responder.
async function ensureLocalLabUp(maxWaitMs = 6000) {
  let health = await requestLocalLabHealth();
  if (health.ok) return true;
  try { startLocalLab(); } catch { return false; }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    health = await requestLocalLabHealth();
    if (health.ok) return true;
  }
  return false;
}

// cardDomain → lib/util.js (Sprint 5).

// Domínios que NÃO são site oficial (rede social/diretório) → não viram alvo de crawl de e-mail.
const NON_SITE_DOMAINS = new Set([
  "instagram.com", "facebook.com", "fb.com", "wa.me", "whatsapp.com", "linktr.ee",
  "google.com", "maps.app.goo.gl", "goo.gl", "bit.ly", "linkedin.com", "youtube.com",
]);
function isCrawlableSite(website) {
  const d = cardDomain(website);
  return Boolean(d) && d.includes(".") && !NON_SITE_DOMAINS.has(d);
}

// ===== ENRIQUECEDOR DE CARDS (1 worker, contínuo) ===========================
// Roda enquanto o PC estiver ligado (toggle on/off). Fonte = cards do VPS (cockpit),
// in-place: lê do VPS → enriquece → grava de volta no VPS. SEM copiar pro local.
//   • Tipo 1 (identidade): roda SERVER-SIDE no VPS (cnpj→dono, telefone, sociais). IP-safe.
//   • Tipo 2 (scraper e-mail): crawl agressivo do SEU IP local (Local Lab 3098) → e-mail/tel/CNPJ.
// Cursor de retomada + pacing/backoff (o Local Lab já tem o freio por site).
let enricherJob = {
  running: false, startedAt: 0, stoppedAt: 0, phase: "parado",
  types: { identity: true, scraper: true }, aggressive: false,
  cursorPage: 1, cycle: 0, vpsTotal: null,
  cardsScanned: 0, sitesCrawled: 0, emailsFound: 0, phonesFound: 0, cnpjsFound: 0, applied: 0,
  tipo1: null, tipo1Runs: 0, localLabJobId: null, lastError: null, lastCycleAt: 0,
};
function enricherSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Lê cards do VPS AGREGANDO as páginas REAIS de 20 (o backend deployado TRAVA database-cards em
// 20/página, ignorando o limit — ver /owner/vps/radar/cards). Pedir limit=500&page=N só trazia 20
// e ainda pulava offset → varrer 5.889 a 20 por vez era inviável. Aqui montamos uma "página lógica"
// de `want` cards juntando ceil(want/20) páginas reais a partir do cursor lógico `logicalPage`.
// Retorna { items, total } e respeita o fim do banco (página real < 20).
async function vpsReadCardsAggregated(logicalPage, want) {
  const VPS_CAP = 20;                                            // teto real do backend da VPS
  const startVpsPage = Math.floor(((logicalPage - 1) * want) / VPS_CAP) + 1;
  const pagesNeeded = Math.ceil(want / VPS_CAP);
  const items = [];
  let total = null;
  for (let i = 0; i < pagesNeeded; i += 1) {
    if (!enricherJob.running) break;
    const r = await opsRequest("GET", `/api/radar/vps/database-cards?limit=${VPS_CAP}&page=${startVpsPage + i}`, null, 30000);
    if (!r.ok) break;                                            // falha de rede → corta sem inventar buraco
    const data = (r.data && (r.data.data || r.data)) || {};
    if (typeof data.total === "number") total = data.total;
    const pageItems = Array.isArray(data.items) ? data.items : [];
    for (const it of pageItems) items.push(it);
    if (pageItems.length < VPS_CAP) break;                       // fim real do banco
  }
  return { items, total };
}

// Um ciclo: dispara Tipo 1 no VPS (a cada N ciclos) + crawleia 1 página de cards (Tipo 2).
async function enricherCycle() {
  enricherJob.cycle += 1;
  enricherJob.lastCycleAt = Date.now();

  // Tipo 1 — identidade no VPS (server-side). 1º ciclo + a cada 5 (é pesado, throttle BrasilAPI).
  if (enricherJob.types.identity && (enricherJob.cycle === 1 || enricherJob.cycle % 5 === 0)) {
    enricherJob.phase = "Tipo 1 (identidade) no VPS";
    const t1 = await opsRequest("POST", "/api/opscontrol/cnpj-backfill", { scope: "vps", limit: 150 }, 180000);
    if (t1.ok) {
      enricherJob.tipo1Runs += 1;
      enricherJob.tipo1 = (t1.data && (t1.data.results?.[0]?.data || t1.data.data || t1.data)) || null;
    } else if (t1.configured !== false) {
      enricherJob.lastError = "Tipo1: " + (t1.reason || `http_${t1.statusCode || "?"}`);
    }
  }
  if (!enricherJob.running) return;

  // Tipo 2 — crawl local de 1 página LÓGICA de cards do VPS (agrega 25 páginas reais de 20 = 500
  // cards por varredura; o backend deployado trava em 20/página — ver vpsReadCardsAggregated).
  if (enricherJob.types.scraper) {
    enricherJob.phase = "lendo VPS p/ crawl";
    const { items, total } = await vpsReadCardsAggregated(enricherJob.cursorPage, 500);
    if (typeof total === "number") enricherJob.vpsTotal = total;
    if (!items.length) { enricherJob.cursorPage = 1; return; } // fim da base → recomeça a varredura
    enricherJob.cardsScanned += items.length;

    const seeds = [];
    const map = {};
    for (const row of items) {
      if (seeds.length >= 15) break; // teto por ciclo: lote curto fecha em minutos (não horas) e o
                                     // painel vê progresso/aplicação rápido — varre 500 cards, mas só
                                     // os 15 primeiros COM site crawlável viram lote; o resto avança o cursor.
      if (!isCrawlableSite(row.website)) continue;
      const haveEmails = Array.isArray(row.emails) ? row.emails.length : 0;
      if (String(row.email || "").trim() && haveEmails >= 3) continue; // já tem e-mail suficiente
      const domain = cardDomain(row.website);
      if (!domain || map[domain]) continue;
      map[domain] = String(row.id || "");
      seeds.push({
        name: safeText(row.name, 300),
        city: safeText(row.city, 120),
        state: safeText(row.state, 2).toUpperCase(),
        segment: safeText(row.segment, 180),
        website: row.website,
        cnpj: String(row.cnpj || "").replace(/\D/g, "") || undefined,
      });
    }
    enricherJob.cursorPage += 1;
    if (seeds.length) await runEnricherCrawl(seeds, map);
  }
}

// Crawl de um lote de sites no Local Lab (IP local) e aplica o resultado de volta no VPS.
async function runEnricherCrawl(seeds, map) {
  enricherJob.phase = `subindo Local Lab (${seeds.length} sites)`;
  if (!(await ensureLocalLabUp())) { enricherJob.lastError = "Local Lab offline"; return; }
  const start = await localLabRequest("POST", "/local-lab/jobs", {
    mode: enricherJob.aggressive ? "max_public" : "email_first",
    aggressive: enricherJob.aggressive,
    providers: ["site_crawl"],
    websites: seeds,
    maxCandidates: seeds.length,
    targetEmails: seeds.length * 3,
    // Crawl raso quando NÃO agressivo: o e-mail mora em home/contato/sobre — visitar 40 páginas/site
    // a ~2.7s travava o lote por mais de 1h. 8 páginas/site fecha o ciclo em minutos (modo agressivo
    // mantém o default fundo do Local Lab).
    maxPagesPerSite: enricherJob.aggressive ? undefined : 8,
    requestedBy: "hbx-owner-enricher",
  }, 30000);
  const jobId = start.data && (start.data.id || start.data.jobId);
  if (!start.ok || !jobId) { enricherJob.lastError = "Local Lab recusou: " + (start.error || `http_${start.statusCode || "?"}`); return; }
  enricherJob.localLabJobId = jobId;

  let job = null;
  for (;;) {
    await enricherSleep(3000);
    if (!enricherJob.running) { await localLabRequest("POST", `/local-lab/jobs/${jobId}/cancel`, {}, 8000).catch(() => {}); break; }
    const s = await localLabRequest("GET", `/local-lab/jobs/${jobId}`, null, 10000);
    if (s.ok && s.data) {
      job = s.data;
      const m = job.metrics || {};
      enricherJob.phase = `caçando (IP local): ${m.sitesVisited || 0} sites · ${m.emailsFound || 0} e-mails`;
      if (["completed", "failed", "canceled"].includes(job.status)) break;
    }
  }
  enricherJob.localLabJobId = null;
  if (!job || job.status !== "completed") return;

  const ex = await localLabRequest("GET", `/local-lab/jobs/${jobId}/export?file=batch`, null, 30000, 32_000_000);
  const batch = ex.data && (ex.data.batch || ex.data);
  const leads = batch && Array.isArray(batch.leads) ? batch.leads : [];
  const items = [];
  for (const lead of leads) {
    const id = map[cardDomain(lead.website || lead.sourceUrl)];
    if (!id) continue;
    const emails = Array.isArray(lead.emails) ? lead.emails.filter(Boolean).slice(0, 3) : (lead.email ? [lead.email] : []);
    const phones = Array.isArray(lead.phones) ? lead.phones.filter(Boolean).slice(0, 3) : (lead.phone ? [String(lead.phone)] : []);
    const cnpj = lead.cnpj ? String(lead.cnpj).replace(/\D/g, "") : undefined;
    if (!emails.length && !phones.length && !cnpj && !lead.instagramUrl && !lead.facebookUrl) continue;
    items.push({ id, emails, phones, cnpj, instagramUrl: lead.instagramUrl || undefined, facebookUrl: lead.facebookUrl || undefined });
    enricherJob.sitesCrawled += 1;
    enricherJob.emailsFound += emails.length;
    enricherJob.phonesFound += phones.length;
    if (cnpj) enricherJob.cnpjsFound += 1;
  }
  if (!items.length) return;
  enricherJob.phase = `aplicando ${items.length} no VPS`;
  const apply = await opsRequest("POST", "/api/radar/vps/apply-contacts", { items }, 60000);
  if (apply.ok) enricherJob.applied += Number((apply.data && (apply.data.data || apply.data) || {}).updated || 0);
  else enricherJob.lastError = "apply VPS: " + (apply.reason || `http_${apply.statusCode || "?"}`);
}

// Journal em disco do enriquecedor: cursor de varredura + config + métricas. Gravado ao fim de
// cada ciclo (atômico). Crash/restart do agent → retoma da mesma página em vez de re-crawlar a base
// do zero (poupa throughput e desgaste do IP local). Só o essencial pra retomar.
function saveEnricherJournal() {
  stateStore.save("enricher", {
    cursorPage: enricherJob.cursorPage,
    types: enricherJob.types,
    aggressive: enricherJob.aggressive,
    metrics: {
      cardsScanned: enricherJob.cardsScanned,
      sitesCrawled: enricherJob.sitesCrawled,
      emailsFound: enricherJob.emailsFound,
      phonesFound: enricherJob.phonesFound,
      cnpjsFound: enricherJob.cnpjsFound,
      applied: enricherJob.applied,
      tipo1Runs: enricherJob.tipo1Runs,
    },
    savedAt: Date.now(),
  });
}

async function enricherLoop() {
  while (enricherJob.running) {
    try { await enricherCycle(); } catch (e) { enricherJob.lastError = String((e && e.message) || e); }
    saveEnricherJournal(); // persiste o cursor/métricas a cada ciclo → religa continua de onde parou
    broadcastEnricher();   // empurra as métricas do ciclo pro SSE (front atualiza sem esperar o poll)
    if (!enricherJob.running) break;
    await enricherSleep(3000);
  }
  enricherJob.phase = "parado";
  enricherJob.stoppedAt = Date.now();
  saveEnricherJournal(); // grava o cursor final ao desligar (o botão religa retoma daqui)
  broadcastEnricher();   // estado "parado" final pro SSE
}

function startEnricher(opts = {}) {
  if (enricherJob.running) return false;
  // Retomada: se há journal e o dono NÃO pediu início limpo (opts.fresh), continua do cursor salvo.
  // Botão "religar" = retoma; começar do zero só com fresh:true. Métricas também voltam (acumulam).
  const journal = opts.fresh === true ? null : stateStore.load("enricher");
  const m = (journal && journal.metrics) || {};
  enricherJob = {
    running: true, startedAt: Date.now(), stoppedAt: 0, phase: "iniciando",
    types: { identity: opts.identity !== false, scraper: opts.scraper !== false },
    aggressive: opts.aggressive === true,
    cursorPage: (journal && Number.isFinite(Number(journal.cursorPage)) && Number(journal.cursorPage) >= 1)
      ? Math.trunc(Number(journal.cursorPage)) : 1,
    cycle: 0, vpsTotal: null,
    cardsScanned: Number(m.cardsScanned) || 0,
    sitesCrawled: Number(m.sitesCrawled) || 0,
    emailsFound: Number(m.emailsFound) || 0,
    phonesFound: Number(m.phonesFound) || 0,
    cnpjsFound: Number(m.cnpjsFound) || 0,
    applied: Number(m.applied) || 0,
    tipo1: null,
    tipo1Runs: Number(m.tipo1Runs) || 0,
    localLabJobId: null, lastError: null, lastCycleAt: 0,
  };
  setImmediate(() => void enricherLoop());
  broadcastEnricher(); // "iniciando" pro SSE já na largada
  return true;
}
function stopEnricher() { enricherJob.running = false; broadcastEnricher(); return true; }

// ---------- Backend bridge (Banco de Leads + import) ----------
function backendRequestOnce(method, route, payload, token, options = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(`${backendUrl}${route}`);
    } catch (error) {
      resolve({ ok: false, error: `URL backend invalida: ${error.message}` });
      return;
    }
    const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const maxBytes = options.maxBytes || 200000;
    // BUG D1: escolhe http/https pelo protocolo real da URL (backendUrl pode ser https:// em prod
    // via HBX_OWNER_BACKEND_URL) — antes era http.request fixo e a chamada saía em HTTP:80, o nginx
    // devolvia 301 e quebrava a ponte 30B→VPS.
    const { mod: httpMod, defaultPort } = httpModuleForUrl(target);
    const req = httpMod.request(
      { hostname: target.hostname, port: target.port || defaultPort, path: target.pathname + target.search, method, headers, timeout: options.timeoutMs || 15000 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          if (body.length < maxBytes) body += chunk.toString("utf8");
        });
        response.on("end", () => {
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            parsed = null;
          }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode, data: parsed, raw: body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    if (data) req.write(data);
    req.end();
  });
}

function refreshBackendToken() {
  if (backendTokenRefreshPromise) return backendTokenRefreshPromise;
  backendTokenRefreshPromise = new Promise((resolve) => {
    const backendEnv = path.join(rootDir, "backend", ".env");
    const username = String(process.env.SYSTEM_MASTER_USERNAME || readDotenvValue(backendEnv, "SYSTEM_MASTER_USERNAME") || "").trim();
    const password = String(process.env.SYSTEM_MASTER_PASSWORD || readDotenvValue(backendEnv, "SYSTEM_MASTER_PASSWORD") || "").trim();
    if (!username || !password) {
      resolve({ ok: false, error: "credenciais_master_ausentes" });
      return;
    }

    let target;
    try {
      target = new URL(`${backendUrl}/auth/login`);
    } catch (error) {
      resolve({ ok: false, error: `URL backend invalida: ${error.message}` });
      return;
    }

    const body = Buffer.from(JSON.stringify({ username, password, forceSession: true }));
    // BUG D1: mesma escolha de módulo por protocolo (ver backendRequestOnce acima).
    const { mod: httpMod, defaultPort } = httpModuleForUrl(target);
    const req = httpMod.request(
      {
        hostname: target.hostname,
        port: target.port || defaultPort,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
        timeout: 8000,
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          if (raw.length < 20000) raw += chunk.toString("utf8");
        });
        response.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          const token = String(parsed?.access_token || "").trim();
          if (response.statusCode >= 200 && response.statusCode < 300 && token) {
            backendToken = token;
            process.env.HBX_OWNER_BACKEND_TOKEN = token;
            resolve({ ok: true });
            return;
          }
          resolve({ ok: false, statusCode: response.statusCode, error: parsed?.message || parsed?.error || `http_${response.statusCode || "?"}` });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.write(body);
    req.end();
  }).finally(() => {
    backendTokenRefreshPromise = null;
  });
  return backendTokenRefreshPromise;
}

async function backendRequest(method, route, payload, options = {}) {
  let response = await backendRequestOnce(method, route, payload, backendToken, options);
  if (response.statusCode !== 401) return response;

  const refreshed = await refreshBackendToken();
  if (!refreshed.ok || !backendToken) {
    return {
      ...response,
      error: refreshed.error || response.data?.message || response.error || "backend_token_invalido",
      refresh: refreshed,
    };
  }
  response = await backendRequestOnce(method, route, payload, backendToken, options);
  return response;
}

// Passthrough de STREAM upstream → cliente (sem bufferizar). Usado pelo "Exportar tudo":
// o upstream (backend local OU ops-control→backend da VPS) manda um csv.gz de milhões de
// linhas; aqui a gente só re-encana byte a byte, então a memória do agente fica constante.
// O caller re-tenta 1x com token novo se o upstream responder 401.
function streamUpstreamToClient(baseUrl, method, route, clientRes, token) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(`${baseUrl}${route}`);
    } catch (error) {
      resolve({ ok: false, error: `URL upstream invalida: ${error.message}` });
      return;
    }
    const headers = { Accept: "application/gzip, */*" };
    if (token) headers.Authorization = `Bearer ${token}`;
    // BUG D1: mesma escolha de módulo por protocolo (ver backendRequestOnce acima) — esta função
    // é genérica e recebe tanto backendUrl (pode ser https:// em prod) quanto opsUrl (localhost).
    const { mod: httpMod, defaultPort } = httpModuleForUrl(target);
    const req = httpMod.request(
      { hostname: target.hostname, port: target.port || defaultPort, path: target.pathname + target.search, method, headers, timeout: 15 * 60 * 1000 },
      (backendRes) => {
        if (backendRes.statusCode === 401) {
          backendRes.resume(); // drena e descarta
          resolve({ ok: false, statusCode: 401 });
          return;
        }
        if (backendRes.statusCode < 200 || backendRes.statusCode >= 300) {
          let raw = "";
          backendRes.on("data", (c) => { if (raw.length < 4000) raw += c.toString("utf8"); });
          backendRes.on("end", () => resolve({ ok: false, statusCode: backendRes.statusCode, raw }));
          return;
        }
        // Repassa os headers relevantes do gzip/attachment e emenda os streams.
        clientRes.writeHead(200, {
          "Content-Type": backendRes.headers["content-type"] || "application/gzip",
          "Content-Disposition": backendRes.headers["content-disposition"] || 'attachment; filename="hbx-leads.csv.gz"',
          "Cache-Control": "no-store",
        });
        backendRes.pipe(clientRes);
        backendRes.on("end", () => resolve({ ok: true, streamed: true }));
        backendRes.on("error", () => { try { clientRes.destroy(); } catch { /* noop */ } resolve({ ok: false, error: "stream_backend_erro", streamed: true }); });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.end();
  });
}

function streamBackendToClient(method, route, clientRes, token) {
  return streamUpstreamToClient(backendUrl, method, route, clientRes, token);
}

async function readLeadsBank() {
  // VERDADE AO VIVO: a headline "SUA MÁQUINA" agora conta o MESMO pool que o transfer mexe
  // (database-cards / RadarLeadPool), lido na hora. Antes vinha de /night-factory/leads-bank
  // (outra contagem — 4998 ≠ 5035 do database-cards) e o painel mentia em relação ao
  // Trazer/Mandar: mostrava um número e transferia outro. Agora o número É o do transfer.
  // deltaToday ("novos hoje") segue do night-factory, mas é só enfeite — o TOTAL é o real.
  const total = await readLocalCardTotal().catch(() => null);
  if (total == null) {
    return { ok: false, configured: Boolean(backendToken), reason: "backend local indisponível", total: null, deltaToday: null };
  }
  let deltaToday = null;
  try {
    const nf = await backendRequest("GET", "/night-factory/leads-bank");
    if (nf && nf.ok && nf.data) deltaToday = nf.data.deltaToday ?? null;
  } catch { /* delta é opcional, não derruba o total */ }
  return { ok: true, configured: true, total, deltaToday, generatedAt: new Date().toISOString() };
}


// ---------- Sistema (motores, pressão, capacidade) ----------
function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

async function readCpuPercent() {
  const a = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const b = cpuSnapshot();
  const idle = b.idle - a.idle;
  const total = b.total - a.total;
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

async function readDiskUsage() {
  try {
    const stat = await fsp.statfs(process.platform === "win32" ? "C:\\" : "/");
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bfree) * Number(stat.bsize);
    if (!(totalBytes > 0)) return { usedPct: null };
    return {
      usedPct: Math.round(((totalBytes - freeBytes) / totalBytes) * 100),
      totalGb: Math.round(totalBytes / 1e9),
      freeGb: Math.round(freeBytes / 1e9),
    };
  } catch {
    return { usedPct: null };
  }
}

async function readContainers() {
  const [result, stats] = await Promise.all([
    dockerRead(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}"]),
    dockerRead(["docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"]),
  ]);
  if (!result.ok) return { ok: false, items: [], error: (result.stderr || "docker indisponivel").trim() };
  const statMap = new Map();
  for (const line of String(stats.stdout || "").split(/\r?\n/)) {
    const [name, cpu, mem] = line.split("\t");
    if (name) statMap.set(name.trim(), { cpu: (cpu || "").trim(), mem: (mem || "").trim() });
  }
  const rows = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((parts) => parts[0]);
  const items = rows
    .filter((parts) => SYSTEM_CONTAINERS.includes(parts[0].trim()) || /^hbx-engine-\d+$/.test(parts[0].trim()))
    .map((parts) => {
      const name = parts[0].trim();
      const stat = statMap.get(name) || {};
      return { name, state: (parts[1] || "").trim(), status: (parts[2] || "").trim(), cpu: stat.cpu || "-", mem: stat.mem || "-" };
    });
  const engines = items.filter((item) => /^hbx-engine-\d+$/.test(item.name));
  return {
    ok: true,
    items: items.filter((item) => !/^hbx-engine-\d+$/.test(item.name)),
    engineContainers: { total: engines.length, running: engines.filter((e) => e.state === "running").length },
  };
}

// Motores elásticos via backend (capacidade real: vivos, fila, status).
async function readEngineCapacity() {
  const response = await backendRequest("GET", "/webscraping/engines/status");
  if (!response.ok || !response.data) {
    return { ok: false, configured: Boolean(backendToken), reason: response.error || `http_${response.statusCode || "?"}` };
  }
  return { ok: true, ...parseEngineCapacity(response.data) };
}

// VPS: MESMA verdade da frota, lida pelo Ops Control (→ backend da VPS /modules/owner/radar/engines/status).
// É a fonte que pinta os botões/chips da coluna VPS — antes era heurística (mentia o estado).
// Cache de 60s (D5/D7): sem ele, o tick de 30s do SSE disparava engines/status (HTTP no backend da VPS)
// a cada snapshot, martelando a produção 2×/min à toa. Só cacheia OK (erro não vira cache → próxima fresca).
let vpsEngineCache = { at: 0, data: null };
async function readVpsEngineCapacity(force) {
  if (!opsToken) return { ok: false, configured: false, reason: "ops_token_ausente" };
  if (!force && vpsEngineCache.data && Date.now() - vpsEngineCache.at < 60_000) return vpsEngineCache.data;
  const r = await opsRequest("GET", "/api/opscontrol/engines/status?scope=vps", null, 30000);
  if (!r.configured) return { ok: false, configured: false, reason: "ops_token_ausente" };
  const body = r.data || {};
  if (!r.ok || !body.ok || !body.data) {
    return { ok: false, configured: true, reason: body.reason || r.reason || `http_${r.statusCode || "?"}` };
  }
  const out = { ok: true, configured: true, ...parseEngineCapacity(body.data) };
  vpsEngineCache = { at: Date.now(), data: out };
  return out;
}

// parseEngineCapacity → lib/engine-capacity.js (Sprint 5).

function buildCapacityVerdict(pressure, capacity) {
  const ram = Number(pressure.ram?.usedPct || 0);
  const disk = Number(pressure.disk?.usedPct || 0);
  const atCeiling = Boolean(capacity?.ok && capacity.elastic && capacity.alive >= capacity.ceiling && capacity.queue > 0);

  const critical = [];
  if (disk >= 90) critical.push("disco no limite");
  if (ram >= 90) critical.push("RAM no limite");
  if (atCeiling) critical.push("motores no teto com fila");
  if (critical.length) {
    return { level: "buy", title: "Hora de agir", detail: `No limite: ${critical.join(", ")}. Avalie liberar espaço ou subir capacidade.` };
  }

  const tight = [];
  if (disk >= PRESSURE_LIMITS.disk) tight.push("disco");
  if (ram >= PRESSURE_LIMITS.ram) tight.push("RAM");
  if (tight.length) {
    return { level: "tight", title: "Começando a apertar", detail: `${tight.join(" e ")} passou da faixa de aviso. Observe de perto, ainda dá.` };
  }

  return { level: "ok", title: "Ainda não", detail: "Sobra folga de recurso e capacidade. Eu aviso quando começar a bater no teto." };
}

async function readSystemSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsedPct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
  const [cpuPct, disk, capacity, containers] = await Promise.all([
    readCpuPercent(),
    readDiskUsage(),
    readEngineCapacity().catch(() => ({ ok: false, reason: "erro" })),
    readContainers(),
  ]);
  const pressure = {
    ram: { usedPct: ramUsedPct, limit: PRESSURE_LIMITS.ram, totalGb: Math.round(totalMem / 1e9) },
    cpu: { usedPct: cpuPct, limit: PRESSURE_LIMITS.cpu, cores: os.cpus().length },
    disk: { usedPct: disk.usedPct, limit: PRESSURE_LIMITS.disk, freeGb: disk.freeGb ?? null, totalGb: disk.totalGb ?? null },
  };
  const verdict = buildCapacityVerdict(pressure, capacity);
  const warnings = [];
  if (pressure.ram.usedPct >= PRESSURE_LIMITS.ram) warnings.push(`RAM em ${pressure.ram.usedPct}% (aviso ${PRESSURE_LIMITS.ram}%)`);
  if (pressure.disk.usedPct != null && pressure.disk.usedPct >= PRESSURE_LIMITS.disk) warnings.push(`Disco em ${pressure.disk.usedPct}%`);
  if (capacity.ok && !capacity.governorOn) warnings.push("Governor desligado — motores não crescem sozinhos");
  if (!capacity.ok) warnings.push(capacity.configured ? "Sem leitura dos motores (backend)" : "Backend sem token — motores e capacidade ocultos");
  return {
    ok: true,
    generatedAt: nowIso(),
    backendUrl,
    host: os.hostname(),
    pressure,
    capacity,
    containers,
    verdict,
    warnings,
  };
}

// ---------- VPS (via Ops Control, que já tem SSH pronto) ----------
// Proxy fino: o agent NÃO abre SSH; conversa com o Ops Control (modo ssh → VPS).
function opsRequest(method, route, payload, timeoutMs = 45000) {
  return new Promise((resolve) => {
    if (!opsToken) {
      resolve({ ok: false, configured: false, reason: "ops_token_ausente" });
      return;
    }
    let target;
    try {
      target = new URL(`${opsUrl}${route}`);
    } catch (error) {
      resolve({ ok: false, configured: true, reason: `URL ops invalida: ${error.message}` });
      return;
    }
    const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const headers = { Accept: "application/json", Authorization: `Bearer ${opsToken}` };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method, headers, timeout: timeoutMs },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          if (body.length < 8_000_000) body += chunk.toString("utf8");
        });
        response.on("end", () => {
          recordOpsHealthy(); // resposta completa do :3099 → listener vivo, zera o disjuntor do auto-heal
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            parsed = null;
          }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, configured: true, statusCode: response.statusCode, data: parsed });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => {
      // S2/D3: a falha de transporte ganha NOME (ops_caido | vps_lenta) → o painel mostra a causa certa,
      // nunca "VPS sob carga" pra um container local parado. `detail` guarda a mensagem crua (log/title).
      const cause = classifyOpsTransportError(error);
      // Detector do auto-heal: :3099 caído (container parou, D1 04/07) → religa COM disjuntor. Best-effort.
      if (cause === "ops_caido") {
        try { triggerOpsAutoHeal(error.code || "ECONNREFUSED"); } catch { /* heal nunca derruba o request */ }
      }
      resolve({ ok: false, configured: true, reason: cause, reasonText: OPS_REASON_TEXT[cause], detail: error.message });
    });
    if (data) req.write(data);
    req.end();
  });
}

// parsePercentString, parseSizeToGb → lib/util.js (Sprint 5).

// Usa CPU% (load÷núcleos) quando há núcleos; sem isso, cai pra load vs núcleos.
function buildVpsVerdict(ramPct, diskPct, cpuPct, load1, cores) {
  const cpuCritical = cpuPct != null ? cpuPct >= 90 : (cores && load1 != null && load1 >= cores * 1.5);
  const cpuTight = cpuPct != null ? cpuPct >= PRESSURE_LIMITS.cpu : (cores && load1 != null && load1 >= cores);
  const critical = [];
  if (diskPct != null && diskPct >= 90) critical.push("disco no limite");
  if (ramPct != null && ramPct >= 90) critical.push("RAM no limite");
  if (cpuCritical) critical.push("CPU saturada");
  if (critical.length) {
    return { level: "buy", title: "Hora de agir", detail: `VPS no limite: ${critical.join(", ")}. Avalie subir o plano da VPS ou aliviar carga.` };
  }
  const tight = [];
  if (diskPct != null && diskPct >= PRESSURE_LIMITS.disk) tight.push("disco");
  if (ramPct != null && ramPct >= PRESSURE_LIMITS.ram) tight.push("RAM");
  if (cpuTight) tight.push("CPU");
  if (tight.length) {
    return { level: "tight", title: "Começando a apertar", detail: `Na VPS, ${tight.join(" e ")} passou da faixa de aviso. Observe de perto.` };
  }
  return { level: "ok", title: "Ainda não", detail: "VPS com folga de recurso. Eu aviso quando começar a bater no teto." };
}

// parseLoadTriplet → lib/util.js (Sprint 5).

function vpsContainersFrom(list) {
  const isEngine = (name) => /^hbx-engine-\d+$/.test(name || "");
  const all = Array.isArray(list) ? list : [];
  const engineContainers = all.filter((c) => isEngine(c.name) || c.name === "hbx-scraping-engine");
  const sysContainers = all
    .filter((c) => SYSTEM_CONTAINERS.includes(c.name) || isEngine(c.name))
    .map((c) => ({ name: c.name, state: c.state, status: c.status, cpu: c.cpu || "-", mem: c.memPercent || c.memUsage || "-" }));
  return {
    engines: { total: engineContainers.length, running: engineContainers.filter((c) => c.state === "running").length },
    containers: sysContainers,
  };
}

function buildVpsResult({ ramPct, diskPct, ramTotalGb, diskFreeGb, diskTotalGb, load, cpuPct, cores, engines, containers, containersAvailable, targetHost }) {
  const load1 = Number.isFinite(load.load1) ? load.load1 : null;
  const verdict = buildVpsVerdict(ramPct, diskPct, cpuPct, load1, cores);
  const warnings = [];
  if (diskPct != null && diskPct >= PRESSURE_LIMITS.disk) warnings.push(`Disco da VPS em ${diskPct}%`);
  if (ramPct != null && ramPct >= PRESSURE_LIMITS.ram) warnings.push(`RAM da VPS em ${ramPct}%`);
  if (cpuPct != null && cpuPct >= PRESSURE_LIMITS.cpu) warnings.push(`CPU da VPS em ${cpuPct}%${cores ? ` (load ${load1?.toFixed(2)} / ${cores} núcleos)` : ""}`);
  else if (cores == null && load1 != null && load1 >= 8) warnings.push(`Carga (load 1m) da VPS alta: ${load1.toFixed(2)}`);
  if (!containersAvailable) warnings.push("Containers da VPS não vieram (SSH/docker deu timeout sob carga)");
  return {
    ok: true,
    configured: true,
    generatedAt: nowIso(),
    targetHost: targetHost || null,
    pressure: {
      ram: { usedPct: ramPct, limit: PRESSURE_LIMITS.ram, totalGb: ramTotalGb },
      cpu: { usedPct: cpuPct, limit: PRESSURE_LIMITS.cpu, cores: cores },
      disk: { usedPct: diskPct, limit: PRESSURE_LIMITS.disk, freeGb: diskFreeGb, totalGb: diskTotalGb },
      load: { load1, load5: Number.isFinite(load.load5) ? load.load5 : null, load15: Number.isFinite(load.load15) ? load.load15 : null },
    },
    engines,
    containers,
    containersAvailable,
    verdict,
    warnings,
  };
}

// Caminho preferido: snapshot leve (1 conexao SSH) com /proc/stat → CPU% REAL (delta de uso).
function mapSnapshot(data) {
  const mem = data.memory || {};
  const disk = data.disk || {};
  const load = parseLoadTriplet(data.load);
  const cores = Number.isFinite(Number(data.cores)) && Number(data.cores) > 0 ? Number(data.cores) : null;
  const ramPct = Number.isFinite(Number(mem.usedPercent)) ? Math.round(Number(mem.usedPercent)) : null;
  // CPU% = uso REAL vindo do snapshot (/proc/stat). Só cai no load/cores se o snapshot for antigo
  // (sem cpuUsedPct) — load/cores inflava (mostrava 100% com CPU real ~50%, divergindo da Hostinger).
  const realCpu = Number(data.cpuUsedPct);
  const cpuPct = Number.isFinite(realCpu)
    ? Math.max(0, Math.min(100, Math.round(realCpu)))
    : (cores && Number.isFinite(load.load1) ? Math.min(100, Math.round((load.load1 / cores) * 100)) : null);
  const { engines, containers } = vpsContainersFrom(data.containers);
  const containersAvailable = Array.isArray(data.containers) && data.containers.length > 0;
  return buildVpsResult({
    ramPct,
    diskPct: parsePercentString(disk.usedPercent),
    ramTotalGb: mem.totalMb ? Math.round(Number(mem.totalMb) / 1000) : null,
    diskFreeGb: parseSizeToGb(disk.available),
    diskTotalGb: parseSizeToGb(disk.size),
    load,
    cpuPct,
    cores,
    engines,
    containers,
    containersAvailable,
    targetHost: data.target || null,
  });
}

// Fallback: overview do Ops Control (8 conexoes SSH; docker costuma dar timeout sob carga).
function mapOverview(data) {
  const mem = data.memory || {};
  const disk = data.disk || {};
  const load = parseLoadTriplet(data.load);
  const ramPct = Number.isFinite(Number(mem.usedPercent)) ? Math.round(Number(mem.usedPercent)) : null;
  const { engines, containers } = vpsContainersFrom(data.containers);
  const dockerTimedOut = (data.errors || []).some((e) => /timeout|docker/i.test(String(e || ""))) && containers.length === 0;
  return buildVpsResult({
    ramPct,
    diskPct: parsePercentString(disk.usedPercent),
    ramTotalGb: mem.totalMb ? Math.round(Number(mem.totalMb) / 1000) : null,
    diskFreeGb: parseSizeToGb(disk.available),
    diskTotalGb: parseSizeToGb(disk.size),
    load,
    cpuPct: null,
    cores: null,
    engines,
    containers,
    containersAvailable: !dockerTimedOut,
    targetHost: data.targetHost || null,
  });
}

// Cache de 30s do snapshot da VPS: cada poll do painel/árvore antes disparava um SSH real (via Ops
// Control) → martelava a VPS. Mesmo padrão de vpsLeadsCache/radarCockpitCache. O botão ⟳ manda
// `force=1` e fura o cache. Só cacheia resposta OK (erro não vira cache → próxima tentativa é fresca).
let vpsSystemCache = { at: 0, data: null };
async function readVpsSystem(force) {
  if (!opsToken) {
    return { ok: false, configured: false, reason: "ops_token_ausente", message: OPS_REASON_TEXT.ops_token_ausente };
  }
  if (!force && vpsSystemCache.data && Date.now() - vpsSystemCache.at < 30_000) return vpsSystemCache.data;
  // 1) Snapshot leve (preferido). 2) Fallback overview se o Ops Control for o antigo.
  const snap = await opsRequest("GET", "/api/host-snapshot/vps", null, 38000);
  if (snap.ok && snap.data && snap.data.available !== false && snap.data.memory) {
    const out = mapSnapshot(snap.data);
    if (out && out.ok !== false) vpsSystemCache = { at: Date.now(), data: out };
    return out;
  }
  // S2/D3 — o transporte ao :3099 falhou (container caído ou lento): a causa é do OPS LOCAL, nunca
  // "VPS sob carga" (essa frase SÓ vale pra timeout = vps_lenta).
  if (snap.reason === "ops_caido" || snap.reason === "vps_lenta") {
    return { ok: false, configured: true, reason: snap.reason, message: OPS_REASON_TEXT[snap.reason] };
  }
  // Ops respondeu, mas explicitou que a leitura da VPS não está disponível (SSH caiu) → ssh_falhou.
  // (Só o Ops Control ANTIGO — sem a rota de snapshot — merece o fallback overview logo abaixo.)
  if (snap.ok && snap.data && snap.data.available === false) {
    return { ok: false, configured: true, reason: "ssh_falhou", message: OPS_REASON_TEXT.ssh_falhou };
  }
  const ov = await opsRequest("GET", "/api/overview", null, 45000);
  if (ov.ok && ov.data) {
    const out = mapOverview(ov.data);
    if (out && out.ok !== false) vpsSystemCache = { at: Date.now(), data: out };
    return out;
  }
  // Overview também não veio → classifica a causa REAL. Timeout = vps_lenta ("sob carga"); refused =
  // ops_caido; ops de pé mas a leitura da VPS falhou = ssh_falhou. Nunca "configure" aqui (há token).
  const cause = (ov.reason === "ops_caido" || ov.reason === "vps_lenta") ? ov.reason : "ssh_falhou";
  return { ok: false, configured: true, reason: cause, message: OPS_REASON_TEXT[cause] };
}

// Total/leads/fábrica da VPS pela rota radar-audit que o Ops Control JÁ tem (SSH+psql, ~30s).
// Cache de 90s pra não martelar SSH no ciclo do painel.
let vpsLeadsCache = { at: 0, data: null };
async function readVpsLeads() {
  if (!opsToken) return { ok: false, configured: false, reason: "ops_token_ausente" };
  if (vpsLeadsCache.data && Date.now() - vpsLeadsCache.at < 90_000) return vpsLeadsCache.data;
  const r = await opsRequest("GET", "/api/radar-audit/vps", null, 70000);
  if (!r.configured) return { ok: false, configured: false, reason: "ops_token_ausente" };
  const d = r.data || {};
  const ss = d.socialSummary || {};
  const ls = d.leadStock || {};
  const fc = d.factoryCursor || {};
  const eng = d.engineSummary || {};
  const out = {
    ok: r.ok,
    configured: true,
    total: ss.totalLeads ?? null,
    today: ls.total24h ?? null,
    factoryStatus: fc.status || null,
    factoryWhere: [fc.currentSegment, fc.currentCity, fc.currentState].filter(Boolean).join(" · ") || null,
    engines: { total: eng.total ?? null, running: eng.running ?? null },
    reason: r.reason || d.error,
  };
  if (r.ok && out.total != null) vpsLeadsCache = { at: Date.now(), data: out };
  return out;
}

// Cockpit Radar Local×VPS (radar-cockpit do Ops Control): o que cada ambiente raspa AGORA,
// motores, serviços e decisão. SSH+psql nos dois lados = pesado → cache de 60s.
let radarCockpitCache = { at: 0, data: null };
async function readRadarCockpit(force) {
  if (!opsToken) return { ok: false, configured: false, reason: "ops_token_ausente" };
  if (!force && radarCockpitCache.data && Date.now() - radarCockpitCache.at < 60_000) return radarCockpitCache.data;
  const r = await opsRequest("GET", "/api/radar-cockpit", null, 75000);
  if (!r.configured) return { ok: false, configured: false, reason: "ops_token_ausente" };
  if (!r.ok || !r.data) return { ok: false, configured: true, reason: r.reason || r.data?.error || `http_${r.statusCode || "?"}` };
  const out = {
    ok: true,
    configured: true,
    generatedAt: r.data.generatedAt || nowIso(),
    environments: r.data.environments || {},
    coordination: r.data.coordination || null,
  };
  radarCockpitCache = { at: Date.now(), data: out };
  return out;
}

// F0 (02/07): cache do factory-status (factoryStatusCache/invalidateFactoryStatusCache) removido
// junto com as rotas de proxy da fábrica de descoberta demolida.

// A régua de "lixo" (looksLikeNonBusinessName + isRealisticBrPhone + composição isJunkLead) vivia
// COPIADA aqui — agora é fonte ÚNICA no backend (radar-core-shared, com teste) exposta em
// POST /modules/owner/radar/clean-junk (preview/confirm). O /owner/clean-junk-leads abaixo só proxia.
// Sprint 3 HBX-OWNER: 1 régua, 1 lugar — sem divergência silenciosa com o filtro de entrada.

// ----- Exportar TODOS os leads locais -> VPS + limpar o local (#2). Reusa endpoints existentes:
// lê via master/database-cards, manda inline pelo Ops Control, limpa por leadIds. SÓ leads (e-mails ficam).
async function readLocalCardsForExport(maxLeads = 5000) {
  const leads = [];
  const ids = [];
  const limit = 1000;
  // Pagina o banco INTEIRO (guarda alta) — antes parava em 12 páginas e cortava silenciosamente em 6k.
  for (let page = 1; page <= 200 && leads.length < maxLeads; page += 1) {
    // maxBytes alto: cada card é JSON gordo (80+ campos); o default de 200KB truncava e quebrava o parse.
    const r = await backendRequest("GET", `/modules/owner/radar/database-cards?limit=${limit}&page=${page}`, null, { timeoutMs: 30000, maxBytes: 16_000_000 });
    if (!r.ok || !r.data) break;
    const items = Array.isArray(r.data.items) ? r.data.items : [];
    if (!items.length) break;
    for (const row of items) {
      const id = String(row.id || "").trim();
      const name = safeText(row.name || row.companyName, 300);
      if (!id || !name) continue; // sem nome o VPS rejeita; não manda nem limpa (fica local)
      const website = row.website || null;
      leads.push({
        externalId: id,
        name,
        phone: row.phone || row.phoneDigits || null,
        whatsapp: row.whatsapp || null,
        website,
        email: row.email || null,
        emailStatus: row.emailStatus || (row.email ? "found_on_site" : "missing"),
        city: row.city || null,
        state: row.state || null,
        segment: row.segment || null,
        sourceProvider: safeText(row.source, 60) || "local_lab",
        sourceUrl: website || row.sourceUrl || row.mapsUrl || `radar:${id}`,
        sourceMode: "local_lab",
        evidence: { method: "owner_export_all", origin: "local_radar_pool" },
      });
      ids.push(id);
    }
    if (items.length < limit) break;
  }
  return { leads: leads.slice(0, maxLeads), ids: ids.slice(0, maxLeads) };
}

// Mapeia um card (database-cards, mesmo shape local e VPS) -> lead do lead-harvest.
function mapCardToHarvestLead(row, opts = {}) {
  const sourceMode = opts.sourceMode || "imported_lab";
  const method = opts.method || "owner_transfer";
  const origin = opts.origin || "transfer_pool";
  const provider = opts.provider || "owner_transfer";
  const id = String(row.id || row.externalId || "").trim();
  const name = safeText(row.name || row.companyName, 300);
  if (!id || !name) return null;
  const website = row.website || null;
  return {
    externalId: id,
    name,
    phone: row.phone || row.phoneDigits || null,
    whatsapp: row.whatsapp || null,
    website,
    email: row.email || null,
    emailStatus: row.emailStatus || (row.email ? "found_on_site" : "missing"),
    city: row.city || null,
    state: row.state || null,
    segment: row.segment || null,
    sourceProvider: safeText(row.source, 60) || provider,
    // Card sem site ganha URL de PROVENIÊNCIA interna válida (não site falso) → passa no gate
    // missing_source_url do import e NADA se perde ao "mover tudo pro local". O `website` segue
    // null (descoberta de site continua valendo); isto só marca de onde o lead veio.
    sourceUrl: website || row.sourceUrl || row.googleMapsUrl || row.mapsUrl || `https://radar.hbxsystem.com.br/card/${id}`,
    sourceMode,
    evidence: { method, origin },
  };
}

// Roda em segundo plano: traz TUDO do VPS pro local em PÁGINAS (stream), gravando cada
// página assim que chega. % honesta = pulled ÷ total real do banco da VPS.
// PÁGINA ADAPTATIVA (Sprint 2 HBX-OWNER): pede 500/página (o backend do master honra limit até
// 2000). Se a 1ª página vier ≤20 e houver mais no banco, o backend DEPLOYADO ainda capa em 20 →
// DEGRADA sozinho pra 20/página o resto da varredura (sem buraco: a página 1 tem offset 0 seja
// qual for o limit, então trocar 500→20 da página 2 em diante é contíguo). Assim: VPS novo = ~total/500
// chamadas (~25× menos); VPS velho = idêntico a antes. Zero regressão, sem depender de sonda ao vivo.
async function runTransferPull() {
  let pageSize = 500;
  let sizeProbed = false;
  const maxPages = 20000;
  let chunkSeq = 0;
  let consecutiveFails = 0;
  if (!backendToken) await refreshBackendToken().catch(() => null);
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      transferJob.page = page;
      transferJob.phase = "lendo VPS";
      const r = await withRetry(
        () => opsRequest("GET", `/api/radar/vps/database-cards?limit=${pageSize}&page=${page}`, null, 45000),
        (resp) => resp && resp.ok,
      );
      if (!r.configured) { transferJob.error = "Configure HBX_OWNER_OPS_TOKEN."; break; }
      if (!r.ok) {
        transferJob.error = r.reason || (r.data && r.data.error)
          || (page === 1 ? "VPS indisponível" : "VPS parou de responder no meio da transferência");
        break;
      }
      const data = r.data && r.data.data ? r.data.data : r.data;
      const items = Array.isArray(data && data.items) ? data.items : [];
      if (data && typeof data.total === "number") transferJob.total = data.total;
      if (!items.length) break;
      // Sonda na 1ª página real: se pedimos 500 e veio ≤20 com mais no banco, o VPS ainda capa
      // em 20 → degrada o resto da varredura (a página 1 já foi lida com offset 0; da 2 em diante
      // limit=20 é contíguo, sem buraco). Se veio >20, o VPS honra páginas grandes → mantém 500.
      if (!sizeProbed) {
        sizeProbed = true;
        if (pageSize === 500 && items.length <= 20 && items.length < (transferJob.total ?? Infinity)) {
          pageSize = 20;
        }
      }
      transferJob.pulled += items.length;
      transferJob.processed = transferJob.pulled;
      const leads = items
        .map((row) => mapCardToHarvestLead(row, { sourceMode: "imported_lab", method: "owner_import_all", origin: "vps_radar_pool", provider: "vps_radar" }))
        .filter(Boolean);
      // Grava em sub-lotes que cabem no body-parser do backend local (senão 413).
      for (const sub of chunkLeadsBySize(leads)) {
        transferJob.phase = "gravando no local";
        const batch = {
          batchId: `vps-pull-${transferJob.startedAt}-${page}-${chunkSeq++}`,
          sourceMode: "imported_lab",
          sourceName: "VPS Radar (trazer tudo)",
          createdAt: new Date().toISOString(),
          requestedBy: "hbx-owner-import-all",
          providers: ["vps_radar"],
          leads: sub,
          emails: [],
        };
        const imp = await withRetry(
          () => backendRequest("POST", "/webscraping/lead-harvest/import", batch, { timeoutMs: 60000 }),
          (resp) => resp && resp.ok,
          4, 1500,
        );
        if (imp.ok) {
          // O backend devolve os totais em data.counts (accepted/duplicates/rejected).
          // BUG antigo: líamos data.accepted (não existe nesse nível) → "imported" ficava
          // SEMPRE 0 mesmo gravando cards, e a tela parecia morta. Agora conta o real e
          // separa já-existiam (duplicates) de não-importáveis (rejected: ex. card sem
          // site = missing_source_url) pra UI dizer a verdade em vez de um 0 fantasma.
          const c = (imp.data && imp.data.counts) || {};
          transferJob.imported += Number(c.accepted ?? imp.data?.accepted ?? 0) || 0;
          transferJob.duplicates += Number(c.duplicates ?? 0) || 0;
          transferJob.rejected += Number(c.rejected ?? 0) || 0;
          consecutiveFails = 0;
        } else {
          // Lote travou após retries → pula e segue (idempotente: reclicar completa os buracos).
          transferJob.failed += sub.length;
          transferJob.lastError = imp.error || imp.data?.message || "falha ao gravar no local";
          consecutiveFails += 1;
          if (consecutiveFails >= 5) {
            transferJob.error = `Backend local instável (${transferJob.lastError}) — parei em ${transferJob.imported} gravados; reclica pra continuar.`;
            break;
          }
        }
      }
      saveTransferJournal([]); // pull não tem sentIds; grava progresso a cada página OK
      broadcastTransfer();     // empurra o progresso pro SSE (barra atualiza sem esperar o poll)
      if (transferJob.error) break;
      if (transferJob.total != null && transferJob.pulled >= transferJob.total) break;
      if (items.length < pageSize) break;
    }
    transferJob.ok = !transferJob.error;
    // Reconciliação: total do DESTINO (local) depois de trazer → o front mostra se igualou.
    transferJob.phase = "reconciliando";
    transferJob.otherTotal = await readLocalCardTotal().catch(() => null);
  } catch (err) {
    transferJob.error = err.message || "falha na transferência";
    transferJob.ok = false;
  } finally {
    transferJob.phase = transferJob.ok ? "concluído" : "erro";
    transferJob.done = true;
    transferJob.running = false;
    transferJob.finishedAt = Date.now();
    if (transferJob.ok) clearTransferJournal(); // fim OK → sem retomada pendente
    else saveTransferJournal([]);               // parou com erro → deixa retomável no boot
    broadcastTransfer();                        // estado final (done) pro SSE
  }
}

// Roda em segundo plano: TRANSFERE TUDO do local pro VPS — manda em PÁGINAS e DEPOIS apaga do
// local só o que o VPS aceitou (é transferência, não cópia: "Sua máquina" zera).
// % honesta = sent ÷ total real do banco local.
// Por que apagar SÓ no fim (e não página a página): a leitura pagina por `page` (offset = page×limit).
// Se eu apagasse no meio, o banco encolheria e o offset da próxima página pularia leads → buracos.
// Lendo o banco inteiro primeiro (sem apagar) a paginação fica estável; a limpeza vem por leadIds no fim.
async function runTransferPush() {
  const pageSize = 500;
  const maxPages = 2000;
  let chunkSeq = 0;
  let consecutiveFails = 0;
  const sentIds = []; // ids locais que o VPS ACEITOU → apagados do local no fim (vira transferência)
  if (!backendToken) await refreshBackendToken().catch(() => null);
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      transferJob.page = page;
      transferJob.phase = "lendo local";
      const r = await withRetry(
        () => backendRequest("GET", `/modules/owner/radar/database-cards?limit=${pageSize}&page=${page}`, null, { timeoutMs: 30000, maxBytes: 16_000_000 }),
        (resp) => resp && resp.ok && resp.data,
      );
      if (!r.ok || !r.data) {
        transferJob.error = r.error || r.data?.message
          || (page === 1 ? `backend local indisponível (http_${r.statusCode || "?"})` : "backend local parou de responder no meio");
        break;
      }
      if (typeof r.data.total === "number") transferJob.total = r.data.total;
      const items = Array.isArray(r.data.items) ? r.data.items : [];
      if (!items.length) break;
      const leads = items
        .map((row) => mapCardToHarvestLead(row, { sourceMode: "imported_lab", method: "owner_push_all", origin: "local_radar_pool", provider: "local_lab" }))
        .filter(Boolean);
      // Manda em sub-lotes que cabem no body-parser do backend da VPS (senão 413 "entity too large").
      for (const sub of chunkLeadsBySize(leads)) {
        transferJob.phase = "enviando pro VPS";
        // O import da VPS (buildEmailLabImportPayload) EXIGE batchId — sem ele dá 400 "Export sem batchId".
        // 4 tentativas com backoff: a VPS pisca ("fetch failed") sob carga — um blip não pode matar a transferência.
        const imp = await withRetry(
          () => opsRequest("POST", "/api/email-lab/vps/import", {
            batchId: `owner-push-${transferJob.startedAt}-${page}-${chunkSeq++}`,
            sourceName: "HBX Owner (mandar tudo)",
            leads: sub,
            sourceMode: "imported_lab",
            requestedBy: "hbx-owner-push-all",
          }, 90000),
          (resp) => resp && resp.ok && resp.data && resp.data.ok,
          4, 1500,
        );
        if (!imp.configured) { transferJob.error = "Configure HBX_OWNER_OPS_TOKEN."; break; }
        if (imp.ok && imp.data && imp.data.ok) {
          // Contagem real de novos no VPS (counts.accepted do backend), não o tamanho do lote.
          const accepted = imp.data?.import?.data?.counts?.accepted ?? imp.data?.import?.data?.result?.accepted ?? 0;
          transferJob.sent += sub.length;
          transferJob.imported += Number(accepted) || 0;
          transferJob.processed = transferJob.sent;
          // Só apaga o que ENTROU no VPS (por externalId = id do card local).
          for (const l of sub) { if (l.externalId) sentIds.push(l.externalId); }
          consecutiveFails = 0;
        } else {
          // Lote travou mesmo após retries → pula e segue (import é idempotente: reclicar completa os buracos).
          transferJob.failed += sub.length;
          transferJob.lastError = imp.reason || imp.data?.error || imp.data?.message || "falha no lote";
          consecutiveFails += 1;
          if (consecutiveFails >= 5) {
            transferJob.error = `VPS instável (${transferJob.lastError}) — parei em ${transferJob.sent} enviados; reclica pra continuar.`;
            break;
          }
        }
      }
      saveTransferJournal(sentIds); // grava progresso + ids já aceitos a cada página OK
      broadcastTransfer();          // empurra o progresso pro SSE (barra atualiza sem esperar o poll)
      if (transferJob.error) break;
      if (transferJob.total != null && transferJob.sent >= transferJob.total) break;
      if (items.length < pageSize) break;
    }
    // TRANSFERÊNCIA: apaga do local tudo que o VPS aceitou (em lotes), pra "Sua máquina" zerar.
    // Roda mesmo com erro parcial: o que JÁ entrou no VPS não pode ficar duplicado no local.
    if (sentIds.length) {
      transferJob.phase = "limpando o local";
      for (let i = 0; i < sentIds.length; i += 2000) {
        const chunk = sentIds.slice(i, i + 2000);
        const del = await backendRequest("DELETE", "/modules/owner/radar/database-cards/batch", { leadIds: chunk }, { timeoutMs: 30000 });
        if (del.ok) transferJob.cleared += Number(del.data?.affected ?? chunk.length) || 0;
        else transferJob.lastError = del.error || del.data?.message || `falha ao limpar o local (http_${del.statusCode || "?"})`;
      }
    }
    transferJob.ok = !transferJob.error;
    if (transferJob.sent > 0) vpsLeadsCache = { at: 0, data: null };
    // Reconciliação: total do DESTINO (VPS) depois de mandar → o front mostra se igualou.
    transferJob.phase = "reconciliando";
    transferJob.otherTotal = await readVpsCardTotal().catch(() => null);
  } catch (err) {
    transferJob.error = err.message || "falha na transferência";
    transferJob.ok = false;
  } finally {
    transferJob.phase = transferJob.ok ? "concluído" : "erro";
    transferJob.done = true;
    transferJob.running = false;
    transferJob.finishedAt = Date.now();
    if (transferJob.ok) clearTransferJournal(); // fim OK (enviou + limpou) → sem retomada pendente
    else saveTransferJournal(sentIds);          // parou com erro → deixa retomável no boot
    broadcastTransfer();                        // estado final (done) pro SSE
  }
}

function clampEngineRange(body) {
  const from = clampInt(body.from, 1, 1, 200);
  const to = clampInt(body.to, from, 1, 200);
  if (to < from) return { from, to: from };
  if (to - from > 49) return { from, to: from + 49 };
  return { from, to };
}

const VPS_QUICK_TARGETS = new Set(["scrapingEngine", "backend", "webscraping"]);
const VPS_QUICK_ACTIONS = new Set(["start", "stop", "restart"]);
// Escopos e canais do controle de scraping (espelham o Ops Control: opsScopes / radarChannels).
const OPS_SCOPES = new Set(["local", "vps", "both"]);
const RADAR_CHANNELS = new Set(["email", "whatsapp", "instagram", "website", "phone", "facebook"]);

function sendStatic(res, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.join(webDir, requested);
  if (!filePath.startsWith(webDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  let content = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  // Injeta o token local na shell HTML (servidor bind 127.0.0.1, uso único do dono).
  // Placeholder distinto do identificador JS window.__HBX_OWNER_TOKEN__ para não colidir.
  if (ext === ".html") {
    content = Buffer.from(String(content).replace(/%%HBX_OWNER_TOKEN%%/g, TOKEN));
  }
  res.writeHead(200, { "Content-Type": STATIC_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(content);
  return true;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  // Sem CORS: o agent dá bind em 127.0.0.1 e exige Bearer token local; o painel é same-origin
  // (servido pelo próprio agent). Liberar CORS cross-origin (`*`) só ampliaria a superfície.
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

// ===== SSE (Server-Sent Events) — o agent EMPURRA o estado em vez de o front martelar ========
// Sprint 4 HBX-OWNER. Zero-dep: text/event-stream via res.write("event: X\ndata: {json}\n\n").
// Clientes vivos ficam num Set; cada broadcast escreve pra todos e descarta os já fechados.
// Auth: EventSource não manda header Authorization → GET /owner/events aceita ?token= validado
// contra o TOKEN local SÓ nesta rota (todo o resto segue exigindo Bearer). É bind 127.0.0.1.
const sseClients = new Set();

// Escreve UM evento SSE num cliente. Se o socket já morreu, devolve false (o caller remove).
function sseWrite(res, event, dataObj) {
  try {
    if (res.writableEnded || res.destroyed) return false;
    const payload = typeof dataObj === "string" ? dataObj : JSON.stringify(dataObj);
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

// Broadcast pra todos os clientes vivos; poda os que já fecharam. NÃO bloqueia (write é async no
// kernel) e NÃO lança — um cliente morto nunca derruba o evento pros outros nem o event loop.
function sseBroadcast(event, dataObj) {
  if (!sseClients.size) return;
  const payload = typeof dataObj === "string" ? dataObj : JSON.stringify(dataObj);
  for (const res of sseClients) {
    if (!sseWrite(res, event, payload)) {
      sseClients.delete(res);
      try { res.end(); } catch { /* já morto */ }
    }
  }
}

// Empurra o estado da transferência assim que ele muda (barra atualiza em <300ms, sem esperar o
// tick de 1.2s). Mesmo payload do GET /owner/transfer/status (o front reusa paintTransfer).
function broadcastTransfer() {
  if (!sseClients.size) return;
  const payload = { ok: true, ...transferJob };
  if (!transferJob.running && transferResume) { payload.resumable = true; payload.resume = transferResume; }
  sseBroadcast("transfer", payload);
}

// Empurra as métricas do enricher a cada ciclo/mudança. Shape idêntico ao GET /owner/enricher/status
// EXCETO labUp (que exige uma leitura async do Local Lab) — o front mantém o labUp do último poll,
// então o SSE nunca "apaga" o estado do Lab; só atualiza os números.
function broadcastEnricher() {
  if (!sseClients.size) return;
  sseBroadcast("enricher", {
    ok: true,
    running: enricherJob.running,
    phase: enricherJob.phase,
    types: enricherJob.types,
    aggressive: enricherJob.aggressive,
    cycle: enricherJob.cycle,
    cursorPage: enricherJob.cursorPage,
    vpsTotal: enricherJob.vpsTotal,
    metrics: {
      cardsScanned: enricherJob.cardsScanned,
      sitesCrawled: enricherJob.sitesCrawled,
      emailsFound: enricherJob.emailsFound,
      phonesFound: enricherJob.phonesFound,
      cnpjsFound: enricherJob.cnpjsFound,
      applied: enricherJob.applied,
      tipo1Runs: enricherJob.tipo1Runs,
    },
    tipo1: enricherJob.tipo1,
    startedAt: enricherJob.startedAt,
    lastCycleAt: enricherJob.lastCycleAt,
    error: enricherJob.lastError,
  });
}

// ---------- Snapshot COMPOSTO da Árvore (Sprint 4; caches fechados no S3) ----------
// Monta o estado INTEIRO (local + VPS) reusando os readers/caches que JÁ existem, num único JSON com
// UM generatedAt. Custo por tick de 30s do SSE: no MÁXIMO 1 SSH (o host-snapshot da VPS, cache 30s) —
// readSystemSnapshot é NATIVO (sem SSH) e cada leitor da VPS tem seu cache: readVpsSystem 30s,
// readRadarCockpit 60s, readVpsLeads 90s, readVpsEngineCapacity 60s e readVpsIntegrationsPresence 120s.
// O S3 fechou os 2 buracos (engines/status e env-presence rodavam SEM cache → SSH/HTTP de produção 2×/min
// à toa). force=1 fura só os caches onde faz sentido no refresh manual (system/cockpit); os demais seguem
// pelo seu TTL. Cada reader degrada sozinho (ok:false) — o snapshot nunca lança nem trava por um lado off.
// D4: refreshOpsDrift (throttle 5min) roda aqui e, se a imagem do ops-control estiver atrás do código,
// injeta o aviso em vps.system.warnings + expõe opsDrift no topo (a pílula ops fica âmbar).
let treeSnapshotCache = { at: 0, data: null };
const OPS_DRIFT_WARN = "Ops Control desatualizado — imagem atrás do código de ops-control/ (rebuild: npm run up ou docker compose up -d --build).";
async function buildTreeSnapshot(force = false) {
  const [
    localSystem, localBank, localEnginesStatus,
    vpsSystem, vpsLeads, vpsEngines, radarCockpit,
    integrationsVps,
  ] = await Promise.all([
    readSystemSnapshot().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readLeadsBank().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readEngineCapacity().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readVpsSystem(force).catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readVpsLeads().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readVpsEngineCapacity().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readRadarCockpit(force).catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
    readVpsIntegrationsPresence().catch((e) => ({ ok: false, reason: String((e && e.message) || e) })),
  ]);
  await refreshOpsDrift(force).catch(() => {}); // D4: veredito de drift (throttle 5min interno; force fura)
  // Aviso de drift no vps.system.warnings — idempotente (dedup + remove quando o drift some): vpsSystem é o
  // objeto CACHEADO (readVpsSystem), então mutar sem dedup empilharia o mesmo aviso a cada tick.
  if (vpsSystem && vpsSystem.ok && Array.isArray(vpsSystem.warnings)) {
    const has = vpsSystem.warnings.includes(OPS_DRIFT_WARN);
    if (opsDrift.drift && !has) vpsSystem.warnings.push(OPS_DRIFT_WARN);
    else if (!opsDrift.drift && has) vpsSystem.warnings = vpsSystem.warnings.filter((w) => w !== OPS_DRIFT_WARN);
  }
  const integrationsLocal = INTEGRATION_CATALOG.map((i) => ({ ...i, ...readIntegrationPresence(i.key) }));
  const snapshot = {
    ok: true,
    generatedAt: nowIso(),
    local: {
      system: localSystem,
      bank: localBank,
      engines: localEnginesStatus,
      integrations: { ok: true, scope: "local", items: integrationsLocal },
    },
    vps: {
      system: vpsSystem,
      leads: vpsLeads,
      engines: vpsEngines,
      integrations: integrationsVps,
    },
    // D4: veredito de drift da imagem do Ops Control — a pílula ops fica âmbar "ops desatualizado" quando true.
    opsDrift: { drift: opsDrift.drift, checked: opsDrift.checked, buildHash: opsDrift.buildHash, localHash: opsDrift.localHash },
    radarCockpit,
    enricher: {
      ok: true,
      running: enricherJob.running,
      phase: enricherJob.phase,
      types: enricherJob.types,
      aggressive: enricherJob.aggressive,
      cycle: enricherJob.cycle,
      cursorPage: enricherJob.cursorPage,
      vpsTotal: enricherJob.vpsTotal,
      metrics: {
        cardsScanned: enricherJob.cardsScanned,
        sitesCrawled: enricherJob.sitesCrawled,
        emailsFound: enricherJob.emailsFound,
        phonesFound: enricherJob.phonesFound,
        cnpjsFound: enricherJob.cnpjsFound,
        applied: enricherJob.applied,
        tipo1Runs: enricherJob.tipo1Runs,
      },
      tipo1: enricherJob.tipo1,
      startedAt: enricherJob.startedAt,
      lastCycleAt: enricherJob.lastCycleAt,
      error: enricherJob.lastError,
    },
    transfer: (() => {
      const t = { ok: true, ...transferJob };
      if (!transferJob.running && transferResume) { t.resumable = true; t.resume = transferResume; }
      return t;
    })(),
  };
  treeSnapshotCache = { at: Date.now(), data: snapshot };
  return snapshot;
}

// Presença das chaves na VPS (mesma leitura do GET /owner/integrations/vps) — extraída pra ser
// reusada pelo snapshot sem duplicar a chamada ao Ops Control. Cache de 120s (D5/D7): sem ele, o tick
// de 30s do SSE disparava env-presence (SSH + docker exec printenv ×15 chaves NA VPS) a cada snapshot —
// SSH de produção queimado 2×/min à toa. O botão ⟳ e o poll pós-injeção furam com force=1. Só cacheia OK.
let vpsIntegrationsCache = { at: 0, data: null };
async function readVpsIntegrationsPresence(force) {
  if (!opsToken) return { ok: false, configured: false, reason: "ops_token_ausente" };
  if (!force && vpsIntegrationsCache.data && Date.now() - vpsIntegrationsCache.at < 120_000) return vpsIntegrationsCache.data;
  const keys = INTEGRATION_CATALOG.map((i) => i.key).join(",");
  const r = await opsRequest("GET", `/api/opscontrol/env-presence?keys=${encodeURIComponent(keys)}`, null, 25000);
  if (!r.configured) return { ok: false, configured: false, reason: "ops_token_ausente" };
  const body = r.data || {};
  if (r.ok && body.ok) {
    const out = { ok: true, scope: "vps", items: body.items || {} };
    vpsIntegrationsCache = { at: Date.now(), data: out };
    return out;
  }
  return { ok: false, reason: body.reason || r.reason || `http_${r.statusCode || "?"}` };
}

// Timer interno: recomputa o snapshot e faz broadcast do evento `snapshot` a cada 30s. .unref() pra
// não segurar o processo. Só recomputa quando há cliente SSE vivo (economiza SSH quando o painel
// está fechado); o GET /owner/tree sempre serve o último snapshot (ou computa on-demand). Reentrância
// travada por snapshotTimerBusy — leitor pesado nunca empilha em cima de si mesmo.
let snapshotTimerBusy = false;
async function snapshotTick() {
  if (snapshotTimerBusy) return;
  if (!sseClients.size) return; // ninguém ouvindo → não gasta SSH; o GET on-demand cobre o resto
  snapshotTimerBusy = true;
  try {
    const snap = await buildTreeSnapshot(false);
    sseBroadcast("snapshot", snap);
  } catch { /* um tick falho não derruba o timer; tenta de novo no próximo */ }
  finally { snapshotTimerBusy = false; }
}
const snapshotTimer = setInterval(() => { void snapshotTick(); }, 30000);
if (snapshotTimer.unref) snapshotTimer.unref();

// Heartbeat SSE: comentário `: ping` a cada 25s mantém a conexão viva atravessando proxies/idle
// e detecta clientes mortos (write falha → poda). .unref() pra não segurar o processo.
const sseHeartbeat = setInterval(() => {
  if (!sseClients.size) return;
  for (const res of sseClients) {
    try {
      if (res.writableEnded || res.destroyed) { sseClients.delete(res); continue; }
      res.write(": ping\n\n");
    } catch {
      sseClients.delete(res);
      try { res.end(); } catch { /* já morto */ }
    }
  }
}, 25000);
if (sseHeartbeat.unref) sseHeartbeat.unref();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Body muito grande."));
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invalido."));
      }
    });
  });
}

// ===== Integrações / chaves de API (status + injeção pelo painel) =====
// Allowlist: só estas chaves o painel lê/escreve. NUNCA devolve o valor — só presença.
const INTEGRATION_CATALOG = [
  { key: "GOOGLE_PLACES_API_KEY", label: "Google Places", group: "Busca & Leads", cost: "pago", desc: "Fonte de leads estruturada e imbanível (alternativa paga ao scraping do seu IP)." },
  { key: "BRAVE_SEARCH_API_KEY", label: "Brave Search", group: "Busca & Leads", cost: "grátis", desc: "Busca de site/CNPJ no enriquecimento. Sem chave cai no Bing/DDG." },
  { key: "SERPER_API_KEY", label: "Serper (Google)", group: "Busca & Leads", cost: "pago", desc: "Busca Google paga p/ enriquecimento em escala." },
  { key: "OPENAI_API_KEY", label: "OpenAI", group: "IA", cost: "pago", desc: "Respostas inteligentes / assistente. Só liga se usar a IA." },
  { key: "GOOGLE_CLIENT_ID", label: "Login Google", group: "Login & E-mail", cost: "grátis", desc: "Entrar com Google (OAuth)." },
  { key: "GMAIL_OAUTH_CLIENT_ID", label: "Gmail — Client ID", group: "Login & E-mail", cost: "grátis", desc: "Envio de e-mail pelo Gmail (módulo e-mail)." },
  { key: "GMAIL_OAUTH_CLIENT_SECRET", label: "Gmail — Secret", group: "Login & E-mail", cost: "grátis", desc: "Par do Client ID do Gmail." },
  { key: "SMTP_PASS", label: "SMTP (e-mail)", group: "Login & E-mail", cost: "grátis", desc: "Senha do relay SMTP transacional." },
  { key: "MERCADO_PAGO_ACCESS_TOKEN", label: "Mercado Pago — Token", group: "Pagamento", cost: "conta", desc: "Cobrança server-side (assinaturas/charges)." },
  { key: "MERCADO_PAGO_PUBLIC_KEY", label: "Mercado Pago — Public", group: "Pagamento", cost: "conta", desc: "Checkout no front." },
  { key: "WHATSAPP_MODAL_API_KEY", label: "Webwhats (motor)", group: "WhatsApp", cost: "próprio", desc: "Motor WhatsApp self-hosted (o que você usa)." },
  { key: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp Cloud (Meta)", group: "WhatsApp", cost: "conta", desc: "API oficial da Meta (alternativa ao motor)." },
  { key: "AUVO_APP_KEY", label: "Auvo (CRM)", group: "CRM", cost: "conta", desc: "Integração Auvo (ordens de serviço)." },
];
const INTEGRATION_KEYS = new Set(INTEGRATION_CATALOG.map((i) => i.key));
const backendEnvPath = () => path.join(rootDir, "backend", ".env");

// Presença = o que o BACKEND realmente enxerga (os .env, não o process.env do agent — o backend
// roda em container separado e NÃO herda o ambiente desta máquina). Verdade, sem mentir "ativo".
// Nunca devolve o valor — só bool + tamanho.
function readIntegrationPresence(key) {
  let val = readDotenvValue(backendEnvPath(), key);
  let source = val ? "backend/.env" : "";
  if (!val) { val = readDotenvValue(path.join(rootDir, ".env"), key); if (val) source = ".env"; }
  return { present: Boolean(val), length: val ? val.length : 0, source: source || null };
}

// Upsert por linha (sem regex frágil): troca a linha KEY= ou acrescenta no fim.
function setDotenvValue(filePath, key, value) {
  let raw = "";
  try { raw = fs.readFileSync(filePath, "utf8"); } catch { raw = ""; }
  const lines = raw.split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] === key) { lines[i] = `${key}=${value}`; found = true; break; }
  }
  if (!found) {
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // Shell estática (HTML/CSS/JS) servida sem token: é só a casca; os dados exigem token.
  // Tenta servir arquivo; se NÃO for arquivo, cai through pro roteamento de API (os
  // endpoints GET do Owner — /health, /owner/*, /git/* — não começam com /api).
  if (req.method === "GET" && !url.pathname.startsWith("/api") && sendStatic(res, url.pathname)) {
    return;
  }

  // Favicon: o navegador pede sozinho e SEM token → caía no portão (401) e poluía o console.
  // Não há arquivo de ícone; responde 204 (sem conteúdo) e encerra o barulho.
  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
    res.end();
    return;
  }

  // SSE — canal de eventos (transfer/enricher/snapshot). Auth por ?token= (EventSource não manda
  // header Authorization) validado contra o TOKEN local SÓ nesta rota. Aceita Bearer também (curl).
  // Registra o response no Set de clientes vivos e remove no close. Manda um snapshot inicial na hora
  // (o último em cache; computa on-demand se ainda não houver) pra a árvore pintar sem esperar 30s.
  if (req.method === "GET" && url.pathname === "/owner/events") {
    const queryToken = url.searchParams.get("token");
    const authed = isAuthorized(req) || (queryToken != null && queryToken === TOKEN);
    if (!authed) { sendError(res, 401, "Token local invalido ou ausente."); return; }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Sugere ao EventSource re-tentar em 3s se a conexão cair (reconexão nativa do browser).
    res.write("retry: 3000\n\n");
    sseClients.add(res);
    const cleanup = () => {
      sseClients.delete(res);
      try { res.end(); } catch { /* já morto */ }
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("error", cleanup);
    // Estado inicial imediato: transfer + enricher + a árvore composta.
    sseWrite(res, "hello", { ok: true, at: nowIso() });
    broadcastTransfer();
    broadcastEnricher();
    try {
      const snap = (treeSnapshotCache.data && Date.now() - treeSnapshotCache.at < 30000)
        ? treeSnapshotCache.data
        : await buildTreeSnapshot(false);
      sseWrite(res, "snapshot", snap);
    } catch { /* snapshot inicial falhou (tudo offline) — o front cai no fallback de polling */ }
    return;
  }

  if (!isAuthorized(req)) {
    sendError(res, 401, "Token local invalido ou ausente.");
    return;
  }

  // Snapshot COMPOSTO da Árvore (Sprint 4): 1 GET devolve local+VPS com UM generatedAt, reusando os
  // caches. ?force=1 recomputa furando os caches subjacentes onde há suporte. É o fallback do SSE.
  if (req.method === "GET" && url.pathname === "/owner/tree") {
    const force = url.searchParams.get("force") === "1";
    if (!force && treeSnapshotCache.data && Date.now() - treeSnapshotCache.at < 30000) {
      sendJson(res, 200, treeSnapshotCache.data);
      return;
    }
    const snap = await buildTreeSnapshot(force);
    if (sseClients.size) sseBroadcast("snapshot", snap); // recomputou → empurra pros ouvintes também
    sendJson(res, 200, snap);
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/leads-bank") {
    sendJson(res, 200, await readLeadsBank());
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/system") {
    sendJson(res, 200, await readSystemSnapshot());
    return;
  }

  // "Exportar tudo": stream do banco INTEIRO de leads (RadarLeadPool) como csv.gz.
  // Proxy de STREAM puro pro backend LOCAL (/modules/owner/radar/export-all) — memória constante
  // aqui e lá. Não usa backendRequest (que bufferiza); usa o passthrough dedicado.
  if (req.method === "GET" && url.pathname === "/owner/export-all") {
    if (!backendToken) {
      const refreshed = await refreshBackendToken();
      if (!refreshed.ok) { sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure HBX_OWNER_BACKEND_TOKEN." }); return; }
    }
    let r = await streamBackendToClient("GET", "/modules/owner/radar/export-all", res, backendToken);
    if (!r.ok && r.statusCode === 401) {
      const refreshed = await refreshBackendToken();
      if (refreshed.ok && backendToken) r = await streamBackendToClient("GET", "/modules/owner/radar/export-all", res, backendToken);
    }
    // Se falhou ANTES de começar o stream (headers ainda não enviados), responde erro legível.
    if (!r.ok && !r.streamed && !res.headersSent) {
      sendJson(res, 200, { ok: false, reason: r.statusCode ? `http_${r.statusCode}` : (r.error || "export_falhou") });
    }
    return;
  }

  // "Exportar tudo (VPS)": o card BANCO da direita exporta o banco da PRODUÇÃO. Cadeia de
  // stream com memória constante em TODOS os elos: :3107 → ops-control (/api/radar/vps/
  // export-all) → backend da VPS (/modules/owner/radar/export-all) → csv.gz re-encanado
  // byte a byte até o navegador. O ops-control autentica na VPS com a sessão operacional dele.
  if (req.method === "GET" && url.pathname === "/owner/vps/export-all") {
    if (!opsToken) { sendJson(res, 200, { ok: false, configured: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    const r = await streamUpstreamToClient(opsUrl, "GET", "/api/radar/vps/export-all", res, opsToken);
    if (!r.ok && !r.streamed && !res.headersSent) {
      sendJson(res, 200, { ok: false, reason: r.statusCode ? `http_${r.statusCode}` : (r.error || "export_vps_falhou") });
    }
    return;
  }

  // ── FÁBRICA de leads ──
  // O proxy preserva a causa real: rede fora, rota ausente, infraestrutura Prisma ausente,
  // recusa operacional e erro interno são estados diferentes.
  if (req.method === "GET" && url.pathname === "/owner/fabrica/status") {
    const r = await backendRequest("GET", "/modules/owner/fabrica/status", null, { timeoutMs: 15000 });
    sendJson(res, 200, normalizeFabricaResponse("status", r));
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/fabrica/start") {
    let body = {};
    try { body = await readBody(req); } catch { body = {}; }
    const budget = Number(body && body.budget);
    const payload = Number.isFinite(budget) && budget > 0 ? { budget: Math.trunc(budget) } : {};
    const r = await backendRequest("POST", "/modules/owner/fabrica/start", payload, { timeoutMs: 30000 });
    sendJson(res, 200, normalizeFabricaResponse("start", r));
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/fabrica/stop") {
    const r = await backendRequest("POST", "/modules/owner/fabrica/stop", {}, { timeoutMs: 30000 });
    sendJson(res, 200, normalizeFabricaResponse("stop", r));
    return;
  }

  // ── RAIO-X DE CNPJ EM LOTE (HOT-04) — cola até 10k CNPJs, camadas cadastral/vivo/ia. ──
  // Mesmo padrão de proxy da fábrica: degrade gracioso (offline) se o backend ainda não tiver
  // as rotas /modules/owner/cnpj-xray/*. Download é STREAM puro (mesma função da export-all).
  if (req.method === "POST" && url.pathname === "/owner/cnpj-xray/estimate") {
    let body = {};
    try { body = await readBody(req); } catch { body = {}; }
    const r = await backendRequest("POST", "/modules/owner/cnpj-xray/estimate", body, { timeoutMs: 15000 });
    if (r.ok && r.data) { sendJson(res, 200, { ok: true, ...r.data }); return; }
    sendJson(res, 200, { ok: false, offline: r.statusCode === 404, reason: r.statusCode === 404 ? "xray_nao_publicado" : (r.error || `http_${r.statusCode || "?"}`) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/cnpj-xray/start") {
    let body = {};
    try { body = await readBody(req); } catch { body = {}; }
    const r = await backendRequest("POST", "/modules/owner/cnpj-xray/start", body, { timeoutMs: 30000 });
    if (r.ok && r.data) { sendJson(res, 200, { ok: true, ...r.data }); return; }
    sendJson(res, 200, { ok: false, offline: r.statusCode === 404, reason: r.statusCode === 404 ? "xray_nao_publicado" : (r.error || `http_${r.statusCode || "?"}`) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/owner/cnpj-xray/jobs") {
    const r = await backendRequest("GET", "/modules/owner/cnpj-xray/jobs", null, { timeoutMs: 15000 });
    if (r.ok && r.data) { sendJson(res, 200, { ok: true, ...r.data }); return; }
    sendJson(res, 200, { ok: false, offline: true, reason: r.statusCode === 404 ? "xray_nao_publicado" : (r.error || `http_${r.statusCode || "?"}`) });
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/owner/cnpj-xray/jobs/") && !url.pathname.endsWith("/download")) {
    const id = decodeURIComponent(url.pathname.slice("/owner/cnpj-xray/jobs/".length));
    const r = await backendRequest("GET", `/modules/owner/cnpj-xray/jobs/${encodeURIComponent(id)}`, null, { timeoutMs: 15000 });
    if (r.ok && r.data) { sendJson(res, 200, { ok: true, ...r.data }); return; }
    sendJson(res, 200, { ok: false, offline: true, reason: r.statusCode === 404 ? "job_nao_encontrado" : (r.error || `http_${r.statusCode || "?"}`) });
    return;
  }
  if (req.method === "GET" && url.pathname.match(/^\/owner\/cnpj-xray\/jobs\/[^/]+\/download$/)) {
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const r = await streamBackendToClient("GET", `/modules/owner/cnpj-xray/jobs/${encodeURIComponent(id)}/download`, res, backendToken);
    if (!r.ok && !r.streamed && !res.headersSent) {
      sendJson(res, 200, { ok: false, reason: r.statusCode ? `http_${r.statusCode}` : (r.error || "download_falhou") });
    }
    return;
  }

  // Integrações: status das chaves (presença, nunca o valor) + injeção no .env LOCAL.
  if (req.method === "GET" && url.pathname === "/owner/integrations") {
    const items = INTEGRATION_CATALOG.map((i) => ({ ...i, ...readIntegrationPresence(i.key) }));
    sendJson(res, 200, { ok: true, scope: "local", items });
    return;
  }
  // Coluna VPS: presença das chaves no backend RODANDO na produção (via Ops Control → SSH → docker exec).
  // Cacheada 120s (D5/D7); ⟳ e poll pós-injeção passam force=1 pra furar o cache e confirmar na hora.
  if (req.method === "GET" && url.pathname === "/owner/integrations/vps") {
    sendJson(res, 200, await readVpsIntegrationsPresence(url.searchParams.get("force") === "1"));
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/integrations/set") {
    let body;
    try { body = await readBody(req); } catch (e) { sendError(res, 400, e.message); return; }
    const key = String(body.key || "").trim();
    const value = String(body.value == null ? "" : body.value).trim();
    if (!INTEGRATION_KEYS.has(key)) { sendJson(res, 200, { ok: false, reason: "chave_nao_permitida" }); return; }
    if (!value) { sendJson(res, 200, { ok: false, reason: "valor_vazio" }); return; }
    // Injeta na PRODUÇÃO (VPS): grava no .env de lá e recria o backend, via Ops Control (SSH).
    const valueB64 = Buffer.from(value, "utf8").toString("base64");
    const r = await opsRequest("POST", "/api/opscontrol/env-set", { key, valueB64 }, 95000);
    if (!r.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente" }); return; }
    const b = r.data || {};
    if (r.ok && b.ok) {
      vpsIntegrationsCache = { at: 0, data: null }; // injetou → invalida o cache p/ o próximo snapshot ver a presença nova
      sendJson(res, 200, { ok: true, key, scope: "vps",
        note: "Gravado no .env da VPS e backend recriado — leva alguns segundos pra subir." });
    } else sendJson(res, 200, { ok: false, reason: b.reason || r.reason || `http_${r.statusCode || "?"}` });
    return;
  }

  // F0 (02/07): rotas de proxy da FÁBRICA de descoberta (/owner/factory/stop|resume|status|
  // purge-dead-queue|force-next) REMOVIDAS — os endpoints backend /modules/owner/radar/factory-*
  // foram demolidos. O proxy /owner/night-factory/* (módulo night-factory preservado) FICA.

  // LIGAR a frota LOCAL de motores (docker nativo do agent + keep-warm). É a via que OBEDECE: o
  // governor do backend não sobe motor local. Sobe a frota INTEIRA (parcial envenena o health-check)
  // e mantém de pé. Não recria o backend — só liga os containers (rápido).
  if (req.method === "POST" && url.pathname === "/owner/engines/up") {
    const r = ensureEnginesUp();
    startEnginesKeepWarm();
    lastEnginesAction = { at: Date.now(), started: r.started, failed: r.failed, stopped: [] };
    const upNow = runningEngineSet().size;
    sendJson(res, 200, {
      ok: r.failed.length === 0,
      fleet: ENGINE_FLEET_SIZE,
      started: r.started.length,
      alreadyUp: r.alreadyUp,
      running: upNow,
      failed: r.failed,
      keepWarm: true,
      message: r.failed.length === 0
        ? `${upNow}/${ENGINE_FLEET_SIZE} motores ligados — keep-warm ativo.`
        : `${upNow}/${ENGINE_FLEET_SIZE} ligados; ${r.failed.length} falharam.`,
    });
    return;
  }

  // DESLIGAR a frota LOCAL (para o keep-warm + para os containers). Freio do dono que FICA.
  if (req.method === "POST" && url.pathname === "/owner/engines/down") {
    stopEnginesKeepWarm();
    const r = stopEngineContainers();
    lastEnginesAction = { at: Date.now(), started: [], failed: r.failed, stopped: r.stopped };
    sendJson(res, 200, {
      ok: r.failed.length === 0,
      stopped: r.stopped.length,
      running: runningEngineSet().size,
      failed: r.failed,
      keepWarm: false,
      message: `${r.stopped.length} motores desligados — keep-warm parado.`,
    });
    return;
  }

  // Status BRUTO da frota LOCAL (engines[] do dashboard) — pinta a tabela honesta por motor
  // (backend × docker × health × último erro × produção). Junta os containers docker reais pra
  // dizer "está ligado ou não?" sem chute. Sem token = devolve ok:false (a UI mostra "—").
  if (req.method === "GET" && url.pathname === "/owner/engines/status") {
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente" });
      return;
    }
    const response = await backendRequest("GET", "/webscraping/engines/status", null, { timeoutMs: 20000, maxBytes: 1_000_000 });
    const data = (response && response.data) || null;
    if (!response.ok || !data) {
      sendJson(res, 200, { ok: false, reason: response?.error || `http_${response?.statusCode || "?"}` });
      return;
    }
    // Estado docker REAL dos containers (running/exited/missing) pra cruzar com o backend.
    const docker = await dockerRead(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}"]);
    const dockerAvailable = docker.ok;
    const dockerByName = new Map();
    if (dockerAvailable) {
      for (const line of String(docker.stdout || "").split(/\r?\n/)) {
        const [name, state, status] = line.split("\t");
        if (name && /^hbx-engine-\d+$/.test(name.trim())) dockerByName.set(name.trim(), { state: (state || "").trim(), status: (status || "").trim() });
      }
    }
    const engines = Array.isArray(data.engines) ? data.engines.map((e) => {
      const dn = dockerByName.get(e.containerName || e.id) || null;
      return {
        id: e.id,
        label: e.shortLabel || e.label || e.id,
        backendStatus: e.status || null,
        online: e.online === true,
        configured: e.configured === true,
        stateLabel: e.stateLabel || null,
        actualState: e.actualState || null,
        health: e.online ? "ok" : (e.configured ? "offline" : "—"),
        dockerState: dn ? dn.state : (dockerAvailable ? "missing" : null),
        dockerStatus: dn ? dn.status : null,
        lastError: e.lastError || null,
        processedLast10Min: typeof e.processedLast10Min === "number" ? e.processedLast10Min : null,
        usagePercent: typeof e.usagePercent === "number" ? e.usagePercent : null,
        heartbeatAgeSeconds: typeof e.heartbeatAgeSeconds === "number" ? e.heartbeatAgeSeconds : null,
      };
    }) : [];
    const capacity = parseEngineCapacity(data);
    sendJson(res, 200, { ok: true, engines, capacity, dockerAvailable, generatedAt: data.generatedAt || nowIso() });
    return;
  }

  // ----- VPS (via Ops Control). Leitura assíncrona + controles que já existiam. -----
  if (req.method === "GET" && url.pathname === "/owner/vps/system") {
    sendJson(res, 200, await readVpsSystem(url.searchParams.get("force") === "1"));
    return;
  }

  // Total/leads/fábrica da VPS (radar-audit do Ops Control, cacheado). Sem rebuild.
  if (req.method === "GET" && url.pathname === "/owner/vps/leads") {
    sendJson(res, 200, await readVpsLeads());
    return;
  }

  // Estado REAL da frota VPS (elástica/fábrica/motores) — pinta os botões da coluna VPS com a
  // verdade do backend, não por heurística. Mesmo shape do LOCAL (/owner/system → capacity).
  if (req.method === "GET" && url.pathname === "/owner/vps/engines-status") {
    sendJson(res, 200, await readVpsEngineCapacity());
    return;
  }

  // Cockpit Radar Local×VPS: o que cada ambiente raspa AGORA + decisão. Cacheado (SSH pesado).
  if (req.method === "GET" && url.pathname === "/owner/radar-cockpit") {
    sendJson(res, 200, await readRadarCockpit(url.searchParams.get("force") === "1"));
    return;
  }

  // Limpar o LIXO do banco local (#3): cards com nome que não é empresa. Preview por padrão; confirm:true apaga.
  // Limpar o LIXO do banco local (#3). Agora PROXIA a régua ÚNICA do backend
  // (POST /modules/owner/radar/clean-junk, preview/confirm) em vez de reimplementar o critério —
  // o backend varre o pool inteiro (não só 40 páginas) pela mesma régua do filtro de entrada.
  // Mantém o MESMO contrato pro front: preview → { preview, scanned, junk, sample }; confirm →
  // { scanned, junk, cleared, errors }; vazio → { junk:0, message }.
  if (req.method === "POST" && url.pathname === "/owner/clean-junk-leads") {
    const body = await readBody(req);
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure SYSTEM_MASTER_USERNAME/PASSWORD no backend/.env." });
      return;
    }
    const confirm = body.confirm === true;
    const r = await backendRequest("POST", "/modules/owner/radar/clean-junk", { confirm }, { timeoutMs: 180000 });
    const d = (r && r.data) || {};
    if (!r.ok) {
      sendJson(res, 502, { ok: false, reason: r.error || d.message || `http_${r.statusCode || "?"}` });
      return;
    }
    const scanned = Number(d.scanned) || 0;
    const junk = Number(d.junk) || 0;
    if (!junk) {
      sendJson(res, 200, { ok: true, scanned, junk: 0, message: "Nenhum lixo de nome encontrado no banco local." });
      return;
    }
    if (!confirm) {
      sendJson(res, 200, { ok: true, preview: true, scanned, junk, sample: Array.isArray(d.sample) ? d.sample : [] });
      return;
    }
    sendJson(res, 200, { ok: true, scanned, junk, cleared: Number(d.cleared) || 0, errors: [] });
    return;
  }

  // Exportar TODOS os leads locais -> VPS e limpar o local (#2). Preview por padrão; confirm:true executa.
  if (req.method === "POST" && url.pathname === "/owner/export-all-leads") {
    const body = await readBody(req);
    const cap = clampInt(body.limit, 5000, 1, 5000);
    const { leads, ids } = await readLocalCardsForExport(cap);
    if (!leads.length) {
      sendJson(res, 200, { ok: true, empty: true, count: 0, message: "Nenhum lead local válido pra exportar." });
      return;
    }
    if (body.confirm !== true) {
      sendJson(res, 200, { ok: true, preview: true, count: leads.length, sample: leads.slice(0, 6).map((l) => l.name) });
      return;
    }
    // 1) Manda pro VPS (inline, SÓ leads — e-mails ficam no PC).
    const imp = await opsRequest("POST", "/api/email-lab/vps/import", { leads, sourceMode: "imported_lab", requestedBy: "hbx-owner-export-all" });
    if (!imp.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    if (!imp.ok || !(imp.data && imp.data.ok)) {
      sendJson(res, 502, { ok: false, stage: "import", count: leads.length, reason: imp.reason || imp.data?.error || imp.data?.message || "falha ao importar na VPS", import: imp.data });
      return;
    }
    // 2) Limpa o local SÓ depois do import OK, por leadIds, em lotes de 2000.
    let cleared = 0;
    const errors = [];
    for (let i = 0; i < ids.length; i += 2000) {
      const chunk = ids.slice(i, i + 2000);
      const del = await backendRequest("DELETE", "/modules/owner/radar/database-cards/batch", { leadIds: chunk }, { timeoutMs: 30000 });
      if (del.ok) cleared += Number(del.data?.affected ?? chunk.length) || 0;
      else errors.push(del.error || del.data?.message || `http_${del.statusCode || "?"}`);
    }
    vpsLeadsCache = { at: 0, data: null };
    sendJson(res, 200, { ok: true, exported: leads.length, cleared, errors, import: imp.data });
    return;
  }

  // Cockpit: enviar lote filtrado pro VPS (sem limpar o banco local).
  if (req.method === "POST" && url.pathname === "/owner/cockpit/send-to-vps") {
    const body = await readBody(req);
    const leads = Array.isArray(body.leads) ? body.leads : [];
    if (!leads.length) {
      sendJson(res, 400, { ok: false, reason: "Nenhum lead no payload." });
      return;
    }
    const validLeads = leads
      .filter((l) => l && String(l.externalId || "").trim() && String(l.name || "").trim())
      .slice(0, 50000);
    if (!validLeads.length) {
      sendJson(res, 400, { ok: false, reason: "Nenhum lead válido (sem id ou nome)." });
      return;
    }
    const imp = await opsRequest("POST", "/api/email-lab/vps/import", { leads: validLeads, sourceMode: "imported_lab", requestedBy: "hbx-cockpit-export" });
    if (!imp.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    if (!imp.ok || !(imp.data && imp.data.ok)) {
      sendJson(res, 502, { ok: false, count: validLeads.length, reason: imp.reason || imp.data?.error || imp.data?.message || "falha ao importar na VPS", import: imp.data });
      return;
    }
    vpsLeadsCache = { at: 0, data: null };
    sendJson(res, 200, { ok: true, count: validLeads.length, imported: imp.data?.imported ?? validLeads.length, import: imp.data });
    return;
  }

  // TUDO OU NADA — inicia a transferência em SEGUNDO PLANO (1 por vez) e responde na hora.
  // O progresso vivo sai por GET /owner/transfer/status (a UI desenha a barra).
  if (req.method === "POST" && (url.pathname === "/owner/import-all-from-vps" || url.pathname === "/owner/push-all-to-vps")) {
    const isPull = url.pathname === "/owner/import-all-from-vps";
    if (transferJob.running) {
      sendJson(res, 200, { ok: false, running: true, reason: "Já tem uma transferência rodando — espera terminar." });
      return;
    }
    transferResume = null; // recomeçou de fato → some com o aviso de retomada do boot
    transferJob = freshTransferJob(isPull ? "pull" : "push");
    broadcastTransfer();   // "iniciando" pro SSE já na largada
    (isPull ? runTransferPull() : runTransferPush()).catch((err) => {
      transferJob.error = err?.message || "falha";
      transferJob.ok = false; transferJob.done = true;
      transferJob.running = false; transferJob.finishedAt = Date.now();
      saveTransferJournal([]); // falha dura → deixa retomável
      broadcastTransfer();
    });
    sendJson(res, 200, { ok: true, started: true, direction: transferJob.direction });
    return;
  }

  // Progresso da transferência (a UI faz polling disto a cada ~1.2s).
  // ADITIVO (não muda contrato): se o agent caiu no meio de uma transferência e nada roda agora,
  // expõe resumable:true + o snapshot do journal → a UI oferece "retomar" (reclica o start; o
  // import é idempotente por externalId, então retomar não duplica). Some quando algo volta a rodar.
  if (req.method === "GET" && url.pathname === "/owner/transfer/status") {
    const payload = { ok: true, ...transferJob };
    if (!transferJob.running && transferResume) {
      payload.resumable = true;
      payload.resume = transferResume;
    }
    sendJson(res, 200, payload);
    return;
  }

  // Parar/Ligar frota numerada hbx-engine-N na VPS (o "parar motor" do dono).
  const vpsEngineMatch = url.pathname.match(/^\/owner\/vps\/engines\/(stop|start)$/);
  if (req.method === "POST" && vpsEngineMatch) {
    const action = vpsEngineMatch[1];
    const body = await readBody(req);
    if (action === "stop" && body.confirm !== true && body.confirmation !== "CONFIRMAR") {
      sendError(res, 400, "Confirmacao obrigatoria para parar motores da VPS.");
      return;
    }
    const { from, to } = clampEngineRange(body);
    const response = await opsRequest("POST", `/api/engines/${action}-range`, { from, to });
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, action, from, to, ops: response.data, reason: response.reason });
    return;
  }

  // Parar/Ligar/Reiniciar um serviço único na VPS (motor único, backend, webscraping).
  const vpsQuickMatch = url.pathname.match(/^\/owner\/vps\/quick\/([^/]+)\/(start|stop|restart)$/);
  if (req.method === "POST" && vpsQuickMatch) {
    const target = vpsQuickMatch[1];
    const action = vpsQuickMatch[2];
    if (!VPS_QUICK_TARGETS.has(target) || !VPS_QUICK_ACTIONS.has(action)) {
      sendError(res, 400, "Alvo ou acao invalida para a VPS.");
      return;
    }
    const body = await readBody(req);
    if ((action === "stop" || action === "restart") && body.confirm !== true && body.confirmation !== "CONFIRMAR") {
      sendError(res, 400, "Confirmacao obrigatoria para esta acao na VPS.");
      return;
    }
    const response = await opsRequest("POST", `/api/quick/${target}/${action}`);
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, target, action, ops: response.data, reason: response.reason });
    return;
  }

  // Forçar filtro de canal (hard filter no backend) — escopo + canal obrigatório.
  if (req.method === "POST" && url.pathname === "/owner/ops/force-filter") {
    const body = await readBody(req);
    const scope = String(body.scope || "both").toLowerCase();
    if (!OPS_SCOPES.has(scope)) { sendError(res, 400, "Escopo invalido. Use local, vps ou both."); return; }
    const channel = String(body.channel || "").toLowerCase();
    if (!RADAR_CHANNELS.has(channel)) { sendError(res, 400, "Canal invalido para filtro."); return; }
    const response = await opsRequest("POST", "/api/opscontrol/force-filter", { scope, requiredChannel: channel }, 60000);
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, scope, channel, ops: response.data, reason: response.reason || response.data?.error });
    return;
  }

  // S2 — Religar o Ops Control NESTA máquina (botão do painel quando a causa é ops_caido). Reusa o
  // MESMO caminho do auto-heal do S1 (docker start hbx-ops-control) e o MESMO disjuntor; um clique
  // humano assume o disjuntor (ver manualHealOpsControl). A UI confirma a volta pela vivacidade
  // (/health?opsFresh=1), nunca re-clica sozinha — sem loop. `ok` = o docker start disparou sem erro
  // (o :3099 pode levar uns segundos pra ligar; quem confirma "de pé" é o opsAlive, não este retorno).
  if (req.method === "POST" && url.pathname === "/owner/ops/restart") {
    const heal = manualHealOpsControl();
    const started = !heal.lastError;
    sendJson(res, started ? 200 : 502, {
      ok: started,
      action: "docker start hbx-ops-control",
      heal,
      message: started ? "Religando o Ops Control — confirmando a volta pela vivacidade…" : (heal.lastError || "falha ao religar o Ops Control"),
    });
    return;
  }

  // Status do Email Lab (Local Lab pronto? VPS import pronto?) — pro card de caça de e-mail.
  if (req.method === "GET" && url.pathname === "/owner/email-lab/status") {
    const response = await opsRequest("GET", "/api/email-lab/status", null, 8000);
    if (!response.configured) { sendJson(res, 200, { ok: false, configured: false, reason: "ops_token_ausente" }); return; }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, configured: true, ...(response.data || {}), reason: response.reason });
    return;
  }

  // ----- Caçar e-mail via Email Lab (Local Lab). Inicia o job; "Importar pra VPS" é passo
  // separado (escreve na VPS = produção; degrada se OPS/VPS não configurados — clique + creds).
  const EMAIL_LAB_MODES = new Set(["email_first", "public_email_only", "enrich_missing_email"]);
  if (req.method === "POST" && url.pathname === "/owner/export") {
    const body = await readBody(req);
    const scope = OPS_SCOPES.has(String(body.scope || "local").toLowerCase()) ? String(body.scope).toLowerCase() : "local";
    const mode = EMAIL_LAB_MODES.has(String(body.mode || "")) ? String(body.mode) : "email_first";
    // URLs dos leads a enriquecer (o crawler visita exatamente esses sites).
    const sanitizeUrlList = (arr) => (Array.isArray(arr) ? arr : [])
      .map((u) => safeText(u, 500)).filter(Boolean).slice(0, 2000);
    const payload = {
      scope,
      segment: safeText(body.segment, 180),
      city: safeText(body.city, 120),
      state: safeText(body.state, 2).toUpperCase(),
      targetEmails: clampInt(body.targetEmails, 50, 1, 2000),
      mode,
      websites: sanitizeUrlList(body.websites),
      candidates: sanitizeUrlList(body.candidates),
    };
    const response = await opsRequest("POST", "/api/email-lab/local/jobs", payload, 30000);
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN (ponte Ops Control)." });
      return;
    }
    const data = response.data || {};
    const job = data.job || data;
    sendJson(res, response.ok ? 200 : 502, {
      ok: response.ok,
      jobId: (job && (job.id || job.jobId)) || null,
      scope,
      message: response.ok ? "Caçando e-mail no Local Lab — acompanhe as métricas." : null,
      reason: response.reason || data.error || data.message,
      ops: data,
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/owner/export/status/")) {
    const id = decodeURIComponent(url.pathname.slice("/owner/export/status/".length));
    const response = await opsRequest("GET", `/api/email-lab/local/jobs/${encodeURIComponent(id)}`);
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente" }); return; }
    const data = response.data || {};
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, job: data.job || data, reason: response.reason || data.error });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/export/import") {
    const body = await readBody(req);
    const jobId = safeText(body.jobId, 120);
    if (!jobId) { sendError(res, 400, "jobId obrigatorio para importar na VPS."); return; }
    const response = await opsRequest("POST", "/api/email-lab/vps/import", { jobId });
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    const data = response.data || {};
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, result: data, reason: response.reason || data.error });
    return;
  }

  // Cancelar a caça (job do Local Lab) em andamento.
  if (req.method === "POST" && url.pathname === "/owner/export/cancel") {
    const body = await readBody(req);
    const jobId = safeText(body.jobId, 120);
    if (!jobId) { sendError(res, 400, "jobId obrigatorio para cancelar a caça."); return; }
    const response = await opsRequest("POST", `/api/email-lab/local/jobs/${encodeURIComponent(jobId)}/cancel`, {});
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    const data = response.data || {};
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, job: data.job || data, reason: response.reason || data.error });
    return;
  }

  // ================================================================
  // ENRIQUECEDOR DE CARDS (1 worker contínuo) — fonte VPS, crawl IP local.
  // Tipo 1 (identidade) roda no VPS; Tipo 2 (e-mail) crawleia do seu IP.
  // ================================================================

  if (req.method === "GET" && url.pathname === "/owner/enricher/status") {
    const lab = await readLocalLabStatus();
    sendJson(res, 200, {
      ok: true,
      labUp: Boolean(lab.up),
      running: enricherJob.running,
      phase: enricherJob.phase,
      types: enricherJob.types,
      aggressive: enricherJob.aggressive,
      cycle: enricherJob.cycle,
      cursorPage: enricherJob.cursorPage,
      vpsTotal: enricherJob.vpsTotal,
      metrics: {
        cardsScanned: enricherJob.cardsScanned,
        sitesCrawled: enricherJob.sitesCrawled,
        emailsFound: enricherJob.emailsFound,
        phonesFound: enricherJob.phonesFound,
        cnpjsFound: enricherJob.cnpjsFound,
        applied: enricherJob.applied,
        tipo1Runs: enricherJob.tipo1Runs,
      },
      tipo1: enricherJob.tipo1,
      startedAt: enricherJob.startedAt,
      lastCycleAt: enricherJob.lastCycleAt,
      error: enricherJob.lastError,
    });
    return;
  }

  // Liga o worker contínuo (fica enriquecendo enquanto o PC estiver ligado).
  if (req.method === "POST" && url.pathname === "/owner/enricher/start") {
    if (enricherJob.running) { sendJson(res, 200, { ok: false, reason: "ja_rodando", message: "Enriquecedor já está ligado." }); return; }
    const body = await readBody(req);
    const identity = body.identity !== false; // Tipo 1
    const scraper = body.scraper !== false;   // Tipo 2
    const aggressive = body.aggressive === true;
    if (!identity && !scraper) { sendJson(res, 200, { ok: false, reason: "sem_tipo", message: "Escolha pelo menos um tipo." }); return; }
    startEnricher({ identity, scraper, aggressive });
    sendJson(res, 200, { ok: true, message: "Enriquecedor ligado — roda enquanto o PC ficar ligado.", types: enricherJob.types, aggressive });
    return;
  }

  // Desliga o worker (para de verdade e fica parado; retoma do cursor ao religar).
  if (req.method === "POST" && url.pathname === "/owner/enricher/stop") {
    stopEnricher();
    if (enricherJob.localLabJobId) {
      await localLabRequest("POST", `/local-lab/jobs/${encodeURIComponent(enricherJob.localLabJobId)}/cancel`, {}, 8000).catch(() => {});
    }
    sendJson(res, 200, { ok: true, message: "Enriquecedor desligado." });
    return;
  }

  // ================================================================
  // CÉREBRO IA (Ollama LOCAL) — status ao vivo + aquecer modelo.
  // 100% local (127.0.0.1:11434). Degrade gracioso se o Ollama estiver off.
  // ================================================================

  // Status ao vivo: quais modelos existem (present) e quais estão quentes (warm).
  if (req.method === "GET" && url.pathname === "/owner/ai/status") {
    sendJson(res, 200, await readAiStatus());
    return;
  }

  // Aquecer UM modelo: dispara /api/chat SEM esperar terminar (fire-and-forget).
  // CHIP E2 (05/07): msg corrigida — "~12min" era DEFASADA (media o swap do ctx destravado, PLANO
  // §3.2); T1/T2 mediram cold-load REAL capado em 8192 = ~104-132s (~2min). num_ctx agora SEMPRE
  // capado aqui também (era o único warm do painel sem cap — o worker da ponte já capa desde o E1).
  if (req.method === "POST" && url.pathname === "/owner/ai/warm") {
    let body;
    try { body = await readBody(req); } catch (e) { sendError(res, 400, e.message); return; }
    const model = String(body && body.model || "").trim();
    if (!AI_MODEL_ALLOWLIST.has(model)) {
      sendJson(res, 200, { ok: false, reason: "modelo_nao_permitido", message: "Modelo fora da allowlist." });
      return;
    }
    // Fire-and-forget: não damos await. keep_alive 30m mantém o modelo quente na RAM.
    ollamaRequest("POST", "/api/chat", {
      model,
      messages: [{ role: "user", content: "ok" }],
      stream: false,
      think: false,
      keep_alive: "30m",
      options: { num_predict: 1, num_ctx: PONTE_NUM_CTX_WARM },
    }, 900000).catch(() => {});
    sendJson(res, 200, { ok: true, warming: model, message: "Aquecendo " + model + " — cold-load capado leva ~2min em CPU (T1/T2: 104-132s). Acompanhe o status." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      app: "HBX Owner Local Agent",
      host: HOST,
      port: PORT,
      cwd: rootDir,
      backendConfigured: Boolean(backendToken),
      opsConfigured: Boolean(opsToken),
      // S2: vivacidade REAL do :3099 (GET curto, cache 10s). `?opsFresh=1` fura o cache (confirmação
      // pós-religar). Verde "ops ✓" no painel SÓ com opsAlive; token ok + morto = pílula vermelha.
      opsAlive: await readOpsAlive(url.searchParams.get("opsFresh") === "1"),
      opsUrl,
      // Estado do auto-heal do Ops Control (S1). "desisti" = disjuntor abriu: parou de religar sozinho.
      opsAutoHeal: {
        state: opsAutoHeal.state,
        attempts: opsAutoHeal.attempts,
        maxAttempts: OPS_HEAL_MAX_ATTEMPTS,
        lastError: opsAutoHeal.lastError,
        lastAttemptAt: opsAutoHeal.lastAttemptAt ? new Date(opsAutoHeal.lastAttemptAt).toISOString() : null,
        lastHealAt: opsAutoHeal.lastHealAt ? new Date(opsAutoHeal.lastHealAt).toISOString() : null,
      },
      // D4: drift da imagem do Ops Control (cacheado; recalculado no boot, no heal e a cada snapshot com
      // throttle de 5min). drift:true → pílula ops âmbar "ops desatualizado". null quando sem token.
      opsDrift: opsToken ? { drift: opsDrift.drift, checked: opsDrift.checked, buildHash: opsDrift.buildHash, localHash: opsDrift.localHash } : null,
      now: nowIso(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/local-lab/status") {
    sendJson(res, 200, await readLocalLabStatus());
    return;
  }

  if (req.method === "POST" && url.pathname === "/local-lab/start") {
    const before = await requestLocalLabHealth();
    if (!before.ok) startLocalLab();
    await new Promise((resolve) => setTimeout(resolve, 800));
    sendJson(res, 202, await readLocalLabStatus());
    return;
  }

  if (req.method === "POST" && url.pathname === "/local-lab/stop") {
    const stopResult = await stopLocalLab();
    sendJson(res, 200, { ...(await readLocalLabStatus()), stopped: stopResult.killed, stopResult });
    return;
  }

  // GET /owner/containers — containers local (docker) + VPS (via Ops Control) + top processos
  if (req.method === "GET" && url.pathname === "/owner/containers") {
    const [local, vpsCtrs, vpsOv] = await Promise.all([
      readContainers(),
      opsRequest("GET", "/api/containers", null, 20000),
      opsRequest("GET", "/api/overview", null, 40000),
    ]);
    sendJson(res, 200, {
      ok: true,
      local: local.ok ? local.items : [],
      localEngines: local.ok ? local.engineContainers : null,
      localError: local.ok ? null : local.error,
      vps: vpsCtrs.ok ? (vpsCtrs.data?.containers || []) : [],
      vpsAvailable: vpsCtrs.ok && Boolean(opsToken),
      vpsReason: vpsCtrs.ok ? null : (vpsCtrs.reason || `http_${vpsCtrs.statusCode || "?"}`),
      topProcesses: vpsOv.ok ? (vpsOv.data?.topProcesses || []) : [],
    });
    return;
  }

  // GET /owner/logs/:name — logs de container na VPS via Ops Control
  if (req.method === "GET" && url.pathname.startsWith("/owner/logs/")) {
    const name = decodeURIComponent(url.pathname.slice("/owner/logs/".length));
    if (!name || !/^[a-zA-Z0-9_\-.]+$/.test(name)) { sendError(res, 400, "Nome de container invalido."); return; }
    const response = await opsRequest("GET", `/api/logs/${encodeURIComponent(name)}`);
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", logs: "" }); return; }
    sendJson(res, response.ok ? 200 : 502, response.data || { ok: false, reason: response.reason, logs: "" });
    return;
  }

  // ================================================================
  // MOTOR RADAR — P2
  // Proxy fino ao backend /modules/owner/radar/*.
  // Degrada com aviso se sem token, nunca quebra.
  // ================================================================

  // --- Auditoria do banco de cards ---
  if (req.method === "GET" && url.pathname === "/owner/radar/audit") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/radar/database-audit");
    if (!r.ok) {
      sendJson(res, 200, { ok: false, configured: Boolean(backendToken), reason: r.error || `http_${r.statusCode || "?"}`, data: r.data });
      return;
    }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  // --- Export em lote de contatos não reivindicados (PR1 30/06, LeadContact) ---
  if (req.method === "GET" && url.pathname === "/owner/radar/contacts/export") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const kind = url.searchParams.get("kind") || "";
    const unclaimed = url.searchParams.get("unclaimed") || "true";
    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 2000);
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    qs.set("unclaimed", unclaimed);
    qs.set("limit", String(limit));
    const r = await backendRequest("GET", `/modules/owner/radar/contacts/export?${qs.toString()}`);
    if (!r.ok) {
      sendJson(res, 200, { ok: false, configured: Boolean(backendToken), reason: r.error || `http_${r.statusCode || "?"}` });
      return;
    }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  // --- Guia de cards: lista navegável ---
  if (req.method === "GET" && url.pathname === "/owner/radar/cards") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    // Backend (database-cards) aceita até 2000; o cockpit pagina de 1000 em 1000.
    const limit = clampInt(url.searchParams.get("limit"), 1000, 1, 2000);
    const page = clampInt(url.searchParams.get("page"), 1, 1, 10000);
    const r = await backendRequest("GET", `/modules/owner/radar/database-cards?limit=${limit}&page=${page}`, null, { timeoutMs: 30000, maxBytes: 16_000_000 });
    if (!r.ok) {
      sendJson(res, 200, { ok: false, configured: Boolean(backendToken), reason: r.error || `http_${r.statusCode || "?"}` });
      return;
    }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  // ── HOT-02 + HOT-03 (fundidos) — "Base Receita": proxy fino p/ /modules/owner/cnpj-base/*.
  // Nenhuma lógica de filtro/anti-contador aqui — o backend é o dono da regra, este agent só
  // repassa (mesmo padrão de /owner/radar/contacts/export). Leitura local, sem fonte paga.
  if (req.method === "POST" && url.pathname === "/owner/cnpj-base/query") {
    const body = await readBody(req).catch((err) => ({ __error: err.message }));
    if (body && body.__error) { sendJson(res, 400, { ok: false, reason: body.__error }); return; }
    const r = await opsRequest("POST", "/api/radar/vps/cnpj-base/query", body, 300000);
    if (!r.ok) { sendJson(res, 200, { ok: false, configured: Boolean(backendToken), reason: r.error || r.reason || `http_${r.statusCode || "?"}` }); return; }
    sendJson(res, 200, { ok: true, data: r.data?.data ?? r.data });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/cnpj-base/materialize") {
    const body = await readBody(req).catch((err) => ({ __error: err.message }));
    if (body && body.__error) { sendJson(res, 400, { ok: false, reason: body.__error }); return; }
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/cnpj-base/materialize", body, { timeoutMs: 60000 });
    if (!r.ok) { sendJson(res, 200, { ok: false, configured: Boolean(backendToken), reason: r.error || `http_${r.statusCode || "?"}` }); return; }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/cnpj-base/cities") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const q = url.searchParams.get("q") || "";
    const r = await backendRequest("GET", `/modules/owner/cnpj-base/cities?q=${encodeURIComponent(q)}`, null, { timeoutMs: 10000 });
    if (!r.ok) { sendJson(res, 200, { ok: false, reason: r.error || `http_${r.statusCode || "?"}` }); return; }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/cnpj-base/cnaes") {
    const q = url.searchParams.get("q") || "";
    const r = await opsRequest("GET", `/api/radar/vps/cnpj-base/cnaes?q=${encodeURIComponent(q)}`, null, 30000);
    if (!r.ok) { sendJson(res, 200, { ok: false, reason: r.error || `http_${r.statusCode || "?"}` }); return; }
    sendJson(res, 200, { ok: true, data: r.data?.data ?? r.data });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/cnpj-base/stats") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const group = url.searchParams.get("group") || "";
    const r = await backendRequest("GET", `/modules/owner/cnpj-base/stats${group ? `?group=${encodeURIComponent(group)}` : ""}`, null, { timeoutMs: 10000 });
    if (!r.ok) { sendJson(res, 200, { ok: false, reason: r.error || `http_${r.statusCode || "?"}` }); return; }
    sendJson(res, 200, { ok: true, data: r.data });
    return;
  }

  // Guia VPS do cockpit: lê os cards da VPS via Ops Control (não junta com o local).
  // O backend DEPLOYADO na VPS TRAVA database-cards em 20/página (sondado 25–26/06 e confirmado ao
  // vivo: qualquer `limit` → 20 itens; e pedir page com limit grande pula o offset de 1000 em 1000 →
  // BURACOS). Resultado: o cockpit recebia só 20 cards e parava. Aqui agregamos as páginas REAIS de 20
  // do VPS DENTRO do agent e devolvemos a "página" de `limit` que o cockpit espera — trazendo TUDO,
  // sem buraco. Concorrência limitada (mantém ordem; ~100ms/call) pra não travar o painel.
  if (req.method === "GET" && url.pathname === "/owner/vps/radar/cards") {
    if (!opsToken) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente (configure HBX_OWNER_OPS_TOKEN)" }); return; }
    const limit = clampInt(url.searchParams.get("limit"), 1000, 1, 2000);
    const page = clampInt(url.searchParams.get("page"), 1, 1, 10000);
    const VPS_CAP = 20;                                         // teto real do backend da VPS
    const startVpsPage = Math.floor(((page - 1) * limit) / VPS_CAP) + 1;
    const pagesNeeded = Math.ceil(limit / VPS_CAP);
    const CONC = 5;

    const slots = new Array(pagesNeeded).fill(undefined);       // index -> { items } | null(falha)
    let total = null;
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor; cursor += 1;
        if (i >= pagesNeeded) return;
        const r = await withRetry(
          () => opsRequest("GET", `/api/radar/vps/database-cards?limit=${VPS_CAP}&page=${startVpsPage + i}`, null, 30000),
          (resp) => resp && resp.ok,
          3, 1000,
        );
        if (r && r.ok) {
          const data = r.data && r.data.data ? r.data.data : r.data;
          if (typeof (data && data.total) === "number") total = data.total;
          slots[i] = { items: Array.isArray(data && data.items) ? data.items : [] };
        } else {
          slots[i] = null;                                       // falha → vira buraco, corta o prefixo
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, pagesNeeded) }, () => worker()));

    // Monta o prefixo CONTÍGUO: para na 1ª página que falhou (não inventa buraco) ou que veio com
    // menos de 20 (fim real do banco). Assim cada "página" do cockpit é íntegra e sequencial.
    const items = [];
    for (let i = 0; i < pagesNeeded; i += 1) {
      const slot = slots[i];
      if (slot === null) break;                                  // buraco por falha → corta aqui
      if (slot === undefined) break;                             // (defensivo) nunca preenchido
      for (const it of slot.items) items.push(it);
      if (slot.items.length < VPS_CAP) break;                    // fim do banco da VPS
    }
    if (!items.length && slots[0] === null) {
      sendJson(res, 200, { ok: false, reason: "VPS indisponível (rebuild do ops-control pendente)" });
      return;
    }
    sendJson(res, 200, { ok: true, data: { items: items.slice(0, limit), total, page, limit } });
    return;
  }

  // --- Controles por-motor: pausar/retomar/drenar/parar individual ---
  const radarEngineMatch = url.pathname.match(/^\/owner\/radar\/engines\/([^/]+)\/(pause|resume|drain|stop)$/);
  if (req.method === "POST" && radarEngineMatch) {
    const engineId = radarEngineMatch[1];
    const action = radarEngineMatch[2];
    const body = await readBody(req);
    if ((action === "stop" || action === "drain") && body.confirm !== true) {
      sendError(res, 400, `Confirmacao obrigatoria para ${action} no motor ${engineId}.`);
      return;
    }
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", `/modules/owner/radar/engines/${encodeURIComponent(engineId)}/${action}`, body);
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, engineId, action, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  // --- Distribuição automática: ler/editar/rodar agora ---
  if (req.method === "GET" && url.pathname === "/owner/radar/distribution") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/radar/radar-auto-distribution");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/owner/radar/distribution") {
    const body = await readBody(req);
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("PUT", "/modules/owner/radar/radar-auto-distribution", body);
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/radar/distribution/run") {
    const body = await readBody(req);
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/radar/radar-auto-distribution/run", body, { timeoutMs: 60000 });
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  // F0 (02/07): rotas de proxy das campanhas mass-data (/owner/radar/mass-data + :id/pause|resume|
  // cancel) REMOVIDAS — os endpoints backend /modules/owner/radar/mass-data foram demolidos.

  // ================================================================
  // NIGHT FACTORY — P3
  // Proxy ao backend /modules/owner/night-factory/*.
  // ================================================================

  if (req.method === "GET" && url.pathname === "/owner/night-factory/status") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/status");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, configured: Boolean(backendToken), data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/night-factory/daily-report") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/daily-report");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/night-factory/top-opportunities") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/top-opportunities");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/night-factory/segments") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/segments");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/night-factory/cities") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/cities");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/night-factory/recovery-opportunities") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/night-factory/recovery-opportunities");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  // Controles: rodar agora / pausar / retomar (destrutivos: pausar/parar exigem confirmação)
  if (req.method === "POST" && url.pathname === "/owner/night-factory/run-now") {
    const body = await readBody(req);
    if (body.confirm !== true) {
      sendError(res, 400, "Confirmacao obrigatoria para rodar a Night Factory agora.");
      return;
    }
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/night-factory/run-now", {}, { timeoutMs: 60000 });
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/night-factory/pause") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/night-factory/pause", {});
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/night-factory/resume") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/night-factory/resume", {});
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/night-factory/config") {
    const body = await readBody(req);
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/night-factory/config", body);
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  // Enriquecimento CNPJ→dono (cadeia gratis L1/L3/L4). RESPEITA o scope:
  //   local → backend local (backendRequest, system-master via SYSTEM_MASTER_*).
  //   vps   → ops-control → backend da VPS (opsRequest /api/opscontrol/cnpj-backfill).
  //   both  → roda os dois e devolve os dois resultados.
  // Antes ignorava o scope e batia SEMPRE no backend local (bug da auditoria codex): o botao
  // "CNPJ → dono" (scope vps) acabava enriquecendo o banco LOCAL, nao o do VPS.
  if (req.method === "POST" && url.pathname === "/owner/ops/cnpj-backfill") {
    const body = await readBody(req);
    const scope = OPS_SCOPES.has(String(body.scope || "vps").toLowerCase()) ? String(body.scope).toLowerCase() : "vps";
    const limit = clampInt(body.limit, 200, 1, 2000);
    const wantLocal = scope === "local" || scope === "both";
    const wantVps = scope === "vps" || scope === "both";

    // ----- Lado LOCAL (backend local, autenticado como system-master) -----
    let localResult = null;
    if (wantLocal) {
      if (!backendToken) await refreshBackendToken().catch(() => null);
      if (!backendToken) {
        localResult = { ok: false, environment: "local", label: "local", error: "backend_token_ausente", data: {} };
      } else {
        const r = await backendRequest("POST", `/modules/owner/radar/cnpj-backfill?limit=${limit}`, {}, { timeoutMs: 170000 });
        const d = (r && r.data) || {};
        localResult = { ok: Boolean(r && r.ok), environment: "local", label: "local", error: r?.error || d?.message, data: d };
      }
    }

    // ----- Lado VPS (ops-control → backend da VPS) -----
    let vpsResult = null;
    if (wantVps) {
      const r = await opsRequest("POST", "/api/opscontrol/cnpj-backfill", { scope: "vps", limit }, 180000);
      if (!r.configured) {
        vpsResult = { ok: false, environment: "vps", label: "vps", error: "ops_token_ausente", data: {} };
      } else {
        // ops devolve { ok, results:[{ environment, ok, data }] } OU o payload plano direto.
        const opsData = r.data || {};
        const inner = Array.isArray(opsData.results) ? (opsData.results.find((x) => x.environment === "vps") || opsData.results[0]) : null;
        const d = (inner && inner.data) || opsData;
        const ok = r.ok && (inner ? inner.ok : opsData.ok) !== false;
        vpsResult = { ok, environment: "vps", label: "vps", error: r.reason || (inner && inner.error) || opsData.error, data: d };
      }
    }

    // O front "Descobrir site + CNPJ" (local) le o formato PLANO; o "CNPJ → dono" le ops.results[].
    // Pra both, o formato plano reflete o local (origem do botao Descobrir). Reason/ok agregam os dois.
    const results = [localResult, vpsResult].filter(Boolean);
    const ok = results.length > 0 && results.every((x) => x.ok);
    const flat = (scope === "vps" ? vpsResult : localResult) || results[0] || { data: {} };
    const fd = flat.data || {};
    const reason = ok ? undefined : results.filter((x) => !x.ok).map((x) => `${x.label}: ${x.error || "falhou"}`).join(" · ") || `http_?`;
    sendJson(res, ok ? 200 : 502, {
      ok,
      scope,
      limit,
      // formato plano (ckStartDiscover) — reflete o lado pedido (local p/ scope local, vps p/ vps)
      scanned: fd.scanned,
      enriched: fd.enriched,
      errors: fd.errors,
      sitesFound: fd.sitesFound,
      cnpjsFound: fd.cnpjsFound,
      phonesFound: fd.phonesFound,
      socialsFound: fd.socialsFound,
      data: fd,
      // compat: ckCnpjBackfill le ops.results[] (cada ambiente com seu data)
      ops: { results: results.map((x) => ({ ok: x.ok, environment: x.environment, label: x.label, error: x.error, data: x.data })) },
      reason,
      message: reason,
    });
    return;
  }

  // ── PONTE (CHIP E1): status vermelho/verde + controles p/ o cockpit :3107 (E2) ──────────────────
  if (req.method === "GET" && url.pathname === "/owner/ponte/status") {
    sendJson(res, 200, { ok: true, ponte: ponteWorker.status() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/ponte/reset") {
    ponteWorker.resetCircuit();
    sendJson(res, 200, { ok: true, ponte: ponteWorker.status() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/ponte/control") {
    const body = await readBody(req);
    if (typeof body.enabled !== "boolean") {
      sendJson(res, 400, { ok: false, reason: "enabled_boolean_obrigatorio", ponte: ponteWorker.status() });
      return;
    }
    const result = ponteWorker.setManualEnabled(body.enabled);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, reason: result.reason, ponte: result.status });
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/ponte/warm") {
    const r = await ponteWorker.warm();
    sendJson(res, 200, { ok: Boolean(r && r.ok), warm: r, ponte: ponteWorker.status() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/ponte/unload") {
    const ok = await ponteWorker.unload("manual (painel)");
    sendJson(res, 200, { ok, ponte: ponteWorker.status() });
    return;
  }

  sendError(res, 404, "Endpoint nao encontrado.");
}

function createOwnerServer() {
  return http.createServer((req, res) => {
    route(req, res).catch((error) => sendError(res, 500, error.message));
  });
}

const server = createOwnerServer();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    // Estado durável: garante o dir e detecta transferência não-finalizada (agent morreu no meio) →
    // vira resumable:true no /owner/transfer/status. O enricher retoma sozinho pelo journal no start.
    stateStore.ensureDir();
    const resume = loadTransferResumeOnBoot();
    if (resume) console.log(`[state] transferência ${resume.direction || "?"} não-finalizada detectada (retomável).`);
    console.log(`HBX Owner Local Agent em http://${HOST}:${PORT}`);
    // Worker da PONTE: só arranca se HBX_PONTE_WORKER_ENABLED=on (default OFF). start() é no-op se OFF.
    try { ponteWorker.start(); } catch (error) { console.log(`[ponte] falha ao iniciar: ${error.message}`); }
    // D4: 1ª checagem de drift no boot (força o throttle). Best-effort — nunca derruba a subida do agent.
    refreshOpsDrift(true).catch(() => {});
  });
}

module.exports.__testing = {
  createOwnerServer,
  dockerRead,
  invalidateDockerReadCache,
};
