const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

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
const ollamaUrl = String(process.env.HBX_OWNER_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const AI_MODEL_30B = "qwen3:30b-a3b";
const AI_MODEL_7B = "qwen2.5:7b";
const AI_MODEL_ALLOWLIST = new Set([AI_MODEL_30B, AI_MODEL_7B]);
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

// O import `/webscraping/lead-harvest/import` é PROXIADO pro motor legado, cujo body-parser corta
// bem cedo: sondei ao vivo (25/06) → ~22KB(50 leads)=200, ~36KB(80 leads)=413. Tetо real ~25KB.
// Aqui quebra a lista em sub-lotes ≤15KB (folga sob o teto, aguenta lead gordo) — nunca toma 413.
function chunkLeadsBySize(leads, maxBytes = 15000, maxCount = 30) {
  const chunks = [];
  let cur = [];
  let curBytes = 2; // "[]"
  for (const lead of leads) {
    const bytes = Buffer.byteLength(JSON.stringify(lead), "utf8") + 1;
    if (cur.length && (curBytes + bytes > maxBytes || cur.length >= maxCount)) {
      chunks.push(cur);
      cur = [];
      curBytes = 2;
    }
    cur.push(lead);
    curBytes += bytes;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
// Ops Control = ponte JÁ pronta pra VPS (SSH + controles). Reaproveitamos por proxy:
// a coluna VPS da guia Sistema fala com o Ops Control (modo ssh), não duplica SSH aqui.
const opsUrl = String(process.env.HBX_OWNER_OPS_URL || "http://127.0.0.1:3099").replace(/\/+$/, "");
const opsToken = String(process.env.HBX_OWNER_OPS_TOKEN || "").trim();
const runs = new Map();

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
};

if (!TOKEN) {
  console.error("HBX_OWNER_LOCAL_TOKEN nao configurado. Configure a variavel de ambiente antes de iniciar.");
  process.exit(1);
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, max = 200) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function clampInt(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readDotenvValue(filePath, key) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // [ \t] (whitespace horizontal) em vez de \s* — \s atravessava a quebra de linha e, numa
    // chave VAZIA (KEY=), capturava a LINHA SEGUINTE como se fosse o valor (bug: chave vazia virava "ativa").
    const match = raw.match(new RegExp(`^[ \\t]*${escaped}[ \\t]*=[ \\t]*(.*)$`, "m"));
    if (!match) return "";
    let value = String(match[1] || "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.trim();
  } catch {
    return "";
  }
}

function resolveExecutable(binary) {
  if (process.platform === "win32" && binary === "npm") return "npm.cmd";
  if (process.platform === "win32" && binary === "npx") return "npx.cmd";
  return binary;
}

function assertSafeCommand(command) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("Comando precisa ser array [binario, ...args].");
  }
  for (const part of command) {
    if (typeof part !== "string" || !part.trim()) throw new Error("Comando contem parte invalida.");
    if (/[;&|><]/.test(part)) throw new Error("Comando contem operador de shell bloqueado.");
  }
}

function relativeLogPath(logPath) {
  return path.relative(rootDir, logPath).replace(/\\/g, "/");
}

function createRun(commandId, label, commands) {
  fs.mkdirSync(logsDir, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const logPath = path.join(logsDir, `${id}.log`);
  const run = {
    id,
    commandId,
    label,
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    exitCode: null,
    logPath: relativeLogPath(logPath),
    commands: commands.map((command) => command.join(" ")),
  };
  runs.set(id, run);
  fs.writeFileSync(logPath, `[${run.startedAt}] ${label}\n`, "utf8");
  return { run, logPath };
}

function appendLog(logPath, chunk) {
  fs.appendFileSync(logPath, chunk, "utf8");
}

function finishRun(run, status, exitCode) {
  run.status = status;
  run.exitCode = exitCode;
  run.finishedAt = nowIso();
}

function runCommandArray(commandId, label, command, onDone) {
  assertSafeCommand(command);
  const { run, logPath } = createRun(commandId, label, [command]);
  const [binary, ...args] = command;
  const child = spawn(resolveExecutable(binary), args, {
    cwd: rootDir,
    shell: false,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => appendLog(logPath, chunk));
  child.stderr.on("data", (chunk) => appendLog(logPath, chunk));
  child.on("error", (error) => {
    appendLog(logPath, `\n[erro] ${error.message}\n`);
    finishRun(run, "failed", 1);
    if (onDone) onDone(run);
  });
  child.on("close", (code) => {
    appendLog(logPath, `\n[fim] exitCode=${code}\n`);
    finishRun(run, code === 0 ? "passed" : "failed", code);
    if (onDone) onDone(run);
  });

  return run;
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
function findLocalLabProcesses() {
  if (process.platform !== "win32") return [];
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
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: rootDir,
    shell: false,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && item.ProcessId);
  } catch {
    return [];
  }
}

async function readLocalLabStatus() {
  const health = await requestLocalLabHealth();
  const processes = findLocalLabProcesses();
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
  const processes = findLocalLabProcesses();
  const pids = [];
  for (const item of processes) {
    const pid = Number(item.ProcessId);
    if (Number.isInteger(pid) && pid > 0) {
      pids.push(pid);
      killPidWindows(pid);
    }
  }

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
  const m7 = find(AI_MODEL_7B);
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

// Domínio "limpo" pra casar lead-do-crawl ↔ card-de-origem (mesma régua dos dois lados).
function cardDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  }
}

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

async function enricherLoop() {
  while (enricherJob.running) {
    try { await enricherCycle(); } catch (e) { enricherJob.lastError = String((e && e.message) || e); }
    if (!enricherJob.running) break;
    await enricherSleep(3000);
  }
  enricherJob.phase = "parado";
  enricherJob.stoppedAt = Date.now();
}

function startEnricher(opts = {}) {
  if (enricherJob.running) return false;
  enricherJob = {
    running: true, startedAt: Date.now(), stoppedAt: 0, phase: "iniciando",
    types: { identity: opts.identity !== false, scraper: opts.scraper !== false },
    aggressive: opts.aggressive === true,
    cursorPage: 1, cycle: 0, vpsTotal: null,
    cardsScanned: 0, sitesCrawled: 0, emailsFound: 0, phonesFound: 0, cnpjsFound: 0, applied: 0,
    tipo1: null, tipo1Runs: 0, localLabJobId: null, lastError: null, lastCycleAt: 0,
  };
  setImmediate(() => void enricherLoop());
  return true;
}
function stopEnricher() { enricherJob.running = false; return true; }

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
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method, headers, timeout: options.timeoutMs || 15000 },
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
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
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

function readContainers() {
  const result = execRead(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}"]);
  if (!result.ok) return { ok: false, items: [], error: (result.stderr || "docker indisponivel").trim() };
  const stats = execRead(["docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"]);
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
async function readVpsEngineCapacity() {
  if (!opsToken) return { ok: false, configured: false, reason: "ops_token_ausente" };
  const r = await opsRequest("GET", "/api/opscontrol/engines/status?scope=vps", null, 30000);
  if (!r.configured) return { ok: false, configured: false, reason: "ops_token_ausente" };
  const body = r.data || {};
  if (!r.ok || !body.ok || !body.data) {
    return { ok: false, configured: true, reason: body.reason || r.reason || `http_${r.statusCode || "?"}` };
  }
  return { ok: true, configured: true, ...parseEngineCapacity(body.data) };
}

// Parser puro do payload /engines/status (sem rede). Recebe o JSON do dashboard de motores e
// devolve o estado normalizado — reaproveitado pelo LOCAL e pelo VPS pra pintar igual.
function parseEngineCapacity(data) {
  const engines = Array.isArray(data.engines) ? data.engines : [];
  const config = data.capacityConfig || {};
  const aliveStates = new Set(["online", "standby", "busy", "running", "active"]);
  const aliveFromEngines = engines.filter((e) => aliveStates.has(String(e.status || "").toLowerCase())).length;
  const alive = aliveFromEngines || Math.trunc(Number(data.capacity?.runningCount || data.capacity?.activeEngineCount || 0));
  // Teto REAL = quanto o Governor pode subir (maxCount), não os motores registrados agora.
  // Nunca menor que os vivos (evita "teto 1 com 2 vivos" em config local inconsistente).
  const ceiling = Math.max(1, Math.trunc(Number(config.maxCount || engines.length || 1)), alive);
  const warm = Math.max(0, Math.trunc(Number(config.warmMin || 0)));
  const governorOn = Boolean(config.governorEnabled);
  const queue = Math.trunc(Number(data.capacity?.queuedCount || 0));
  const operationalStatus = String(data.capacity?.operationalStatus || "unknown");
  const factoryStopped = Boolean(config.factoryStopped);
  // Elástico de verdade = governor ligado E teto acima do warm (dá pra crescer).
  const elastic = governorOn && ceiling > Math.max(warm, alive);
  let reason;
  if (factoryStopped) reason = "Fábrica PARADA (freio do dono) — não sobe motor até religar.";
  else if (!governorOn) reason = "Governor desligado — capacidade fixa, não cresce sozinho.";
  else if (ceiling <= warm) reason = `Teto igual ao warm (${ceiling}) — sem folga pra crescer.`;
  else if (queue > 0 && alive >= ceiling) reason = "Fila cheia e no teto — pode precisar de mais capacidade.";
  else if (queue > 0) reason = "Fila com trabalho — o Governor está subindo motores até o teto.";
  else reason = `Fila vazia — fica no warm (${warm || alive}). Sobe sozinho até ${ceiling} quando encher.`;
  // Turbo (modo agressivo) vem no MESMO payload do dashboard de motores — só surfaçar.
  const turboEnabled = Boolean(data.isTurboEnabled);
  const turboActive = Boolean(data.isTurboWindowActive || data.isTurboForcedNow);
  // Campos novos do contrato Elástica Pura (25/06): elasticEnabled, running, physicalMax,
  // memoryPressurePercent, memoryHeadroomEngines.
  const elasticEnabled = data.elasticEnabled != null ? Boolean(data.elasticEnabled) : governorOn;
  const running = data.running != null ? Math.trunc(Number(data.running)) : alive;
  const physicalMax = data.physicalMax != null ? Math.trunc(Number(data.physicalMax)) : ceiling;
  const memoryPressurePercent = data.memoryPressurePercent != null ? Math.round(Number(data.memoryPressurePercent)) : null;
  const memoryHeadroomEngines = data.memoryHeadroomEngines != null ? Math.trunc(Number(data.memoryHeadroomEngines)) : null;
  return { ok: true, alive, warm, ceiling, queue, operationalStatus, elastic, governorOn, factoryStopped, turboEnabled, turboActive, reason, elasticEnabled, running, physicalMax, memoryPressurePercent, memoryHeadroomEngines };
}

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
  const [cpuPct, disk, capacity] = await Promise.all([
    readCpuPercent(),
    readDiskUsage(),
    readEngineCapacity().catch(() => ({ ok: false, reason: "erro" })),
  ]);
  const containers = readContainers();
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
          if (body.length < 400000) body += chunk.toString("utf8");
        });
        response.on("end", () => {
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
    req.on("error", (error) => resolve({ ok: false, configured: true, reason: error.message }));
    if (data) req.write(data);
    req.end();
  });
}

function parsePercentString(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(Number(match[1])) : null;
}

function parseSizeToGb(value) {
  const match = String(value || "").trim().match(/^([\d.]+)\s*([KMGTP])?i?B?$/i);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const unit = (match[2] || "G").toUpperCase();
  const factor = { K: 1 / 1e6, M: 1 / 1e3, G: 1, T: 1e3, P: 1e6 }[unit] ?? 1;
  return Math.round(num * factor);
}

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

function parseLoadTriplet(loadStr) {
  const parts = String(loadStr || "").trim().split(/\s+/);
  // Number("") === 0 (não NaN), então só converte se a parte existir de verdade.
  const num = (i) => (parts[i] ? Number(parts[i]) : NaN);
  return { load1: num(0), load5: num(1), load15: num(2) };
}

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

async function readVpsSystem() {
  if (!opsToken) {
    return { ok: false, configured: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN (token do Ops Control)." };
  }
  // 1) Snapshot leve (preferido). 2) Fallback overview se o Ops Control for o antigo.
  const snap = await opsRequest("GET", "/api/host-snapshot/vps", null, 38000);
  if (snap.ok && snap.data && snap.data.available !== false && snap.data.memory) {
    return mapSnapshot(snap.data);
  }
  const ov = await opsRequest("GET", "/api/overview", null, 45000);
  if (!ov.ok || !ov.data) {
    return { ok: false, configured: true, reason: ov.reason || snap.reason || `http_${ov.statusCode || snap.statusCode || "?"}`, message: "Ops Control não respondeu (VPS pode estar sob carga)." };
  }
  return mapOverview(ov.data);
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

// Cache curto do factory-status do backend. A rota /modules/owner/radar/factory-status dispara o
// caminho pesado do pool (healthcheck HTTP em cada motor) e o painel a chama em rajada → era ~20s.
// O backend já ganhou cache de 4s; aqui guardamos 3s a mais pra suavizar polling e quedas de rede.
// Invalidado por força/purga da fila (mudam o estado da fábrica) p/ não mostrar dado velho.
let factoryStatusCache = { at: 0, data: null };
function invalidateFactoryStatusCache() { factoryStatusCache = { at: 0, data: null }; }

// Espelha o looksLikeNonBusinessName do backend (radar-core-shared) pra limpar o banco local
// pelo MESMO critério do filtro: script estrangeiro, título de página, frase em inglês, nome comprido.
const NON_BIZ_EN_STOPWORDS = new Set(["the", "of", "to", "for", "and", "that", "this", "with", "your", "you", "in", "on", "at", "by", "from", "into", "about", "their", "they", "what", "how", "why", "when", "where", "which", "are", "was", "were", "will", "would", "can", "could", "should", "has", "have", "had", "does", "did", "its"]);
function looksLikeNonBusinessName(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ฀-๿　-ヿ㐀-鿿가-힯]/.test(raw)) return true;
  if (raw.includes("|") || /\s[–—]\s/.test(raw)) return true;
  if (raw.includes("?")) return true;
  const words = raw.toLowerCase().split(/[^a-zà-ÿ0-9+]+/i).filter(Boolean);
  if (words.length > 9) return true;
  const hits = new Set(words.filter((w) => NON_BIZ_EN_STOPWORDS.has(w)));
  return hits.size >= 2;
}

// Espelha isRealisticBrPhone do backend: DDD real + celular(9)/fixo(2-5) + sem repetição.
const VALID_BR_DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
function isRealisticBrPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!VALID_BR_DDDS.has(Number(d.slice(0, 2)))) return false;
  const sub = d.slice(2);
  if (/^(\d)\1+$/.test(sub)) return false;
  if (d.length === 11) return sub.length === 9 && sub[0] === "9";
  return sub.length === 8 && "2345".includes(sub[0]);
}
// "limpa tudo": lixo = nome não parece empresa OU não tem contato ÚTIL (telefone real
// OU e-mail válido). Site/social sozinho NÃO segura (o lixo global tem site/sourceUrl).
function isJunkLead(row) {
  if (looksLikeNonBusinessName(row && row.name)) return true;
  if (isRealisticBrPhone(row && (row.phone || row.phoneDigits))) return false;
  const email = String((row && row.email) || "").trim();
  const emailStatus = String((row && row.emailStatus) || "").toLowerCase();
  if (email && !["missing", "invalid"].includes(emailStatus)) return false;
  return true; // sem telefone real E sem e-mail válido = lixo
}

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
// IMPORTANTE: o backend DEPLOYADO na VPS trava database-cards em 20/página (sondei 25/06:
// limit=20/50/100/500 → sempre 20 itens). Pedir mais NÃO cresce a página e o offset
// passaria a pular de 500 em 500 → BURACOS. Por isso o pageSize do pull é 20 (casado com o
// cap real). É mais lento (~total/20 páginas), mas íntegro. Local honra 500 (push usa 500).
async function runTransferPull() {
  const pageSize = 20;
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
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  if (!isAuthorized(req)) {
    sendError(res, 401, "Token local invalido ou ausente.");
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

  // Integrações: status das chaves (presença, nunca o valor) + injeção no .env LOCAL.
  if (req.method === "GET" && url.pathname === "/owner/integrations") {
    const items = INTEGRATION_CATALOG.map((i) => ({ ...i, ...readIntegrationPresence(i.key) }));
    sendJson(res, 200, { ok: true, scope: "local", items });
    return;
  }
  // Coluna VPS: presença das chaves no backend RODANDO na produção (via Ops Control → SSH → docker exec).
  if (req.method === "GET" && url.pathname === "/owner/integrations/vps") {
    const keys = INTEGRATION_CATALOG.map((i) => i.key).join(",");
    const r = await opsRequest("GET", `/api/opscontrol/env-presence?keys=${encodeURIComponent(keys)}`, null, 25000);
    if (!r.configured) { sendJson(res, 200, { ok: false, configured: false, reason: "ops_token_ausente" }); return; }
    const body = r.data || {};
    if (r.ok && body.ok) sendJson(res, 200, { ok: true, scope: "vps", items: body.items || {} });
    else sendJson(res, 200, { ok: false, reason: body.reason || r.reason || `http_${r.statusCode || "?"}` });
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
    if (r.ok && b.ok) sendJson(res, 200, { ok: true, key, scope: "vps",
      note: "Gravado no .env da VPS e backend recriado — leva alguns segundos pra subir." });
    else sendJson(res, 200, { ok: false, reason: b.reason || r.reason || `http_${r.statusCode || "?"}` });
    return;
  }

  // Controle da fábrica de motores (runtime, sem subir container): freio do dono.
  if (req.method === "POST" && (url.pathname === "/owner/factory/stop" || url.pathname === "/owner/factory/resume")) {
    if (!backendToken) {
      const refreshed = await refreshBackendToken();
      if (!refreshed.ok) {
        sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure HBX_OWNER_BACKEND_TOKEN." });
        return;
      }
    }
    const route = url.pathname.endsWith("/stop")
      ? "/modules/owner/radar/factory/stop"
      : "/modules/owner/radar/factory/resume-schedule";
    const response = await backendRequest("POST", route, {});
    const backendMessage = Array.isArray(response.data?.message)
      ? response.data.message.join(" · ")
      : response.data?.message;
    const reason = response.error || backendMessage || response.data?.error || `http_${response.statusCode || "?"}`;
    const payload = {
      ok: response.ok,
      action: url.pathname.endsWith("/stop") ? "stop" : "resume",
      backend: response.data,
    };
    if (!response.ok) {
      payload.reason = reason;
      payload.error = reason;
    }
    sendJson(res, response.ok ? 200 : 502, payload);
    return;
  }

  // Status REAL da fábrica LOCAL (factory-status do backend): missão atual/próxima, net-new da
  // última hora, motores liberados, por que parou. Fonte da verdade pro painel "por que não raspa".
  if (req.method === "GET" && url.pathname === "/owner/factory/status") {
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure SYSTEM_MASTER_USERNAME/PASSWORD no backend/.env." });
      return;
    }
    if (factoryStatusCache.data && Date.now() - factoryStatusCache.at < 3000) {
      sendJson(res, 200, { ok: true, cached: true, ...factoryStatusCache.data });
      return;
    }
    const response = await backendRequest("GET", "/modules/owner/radar/factory-status", null, { timeoutMs: 20000, maxBytes: 400000 });
    const data = (response && response.data) || null;
    const ok = Boolean(response && response.ok && data);
    if (ok) factoryStatusCache = { at: Date.now(), data };
    sendJson(res, ok ? 200 : 502, ok
      ? { ok: true, ...data }
      : { ok: false, reason: response?.error || data?.message || `http_${response?.statusCode || "?"}` });
    return;
  }

  // Limpar a FILA MORTA da fábrica LOCAL (espelha o botão da VPS, mas via backend local). Não é SQL
  // cru, não para produção, não toca estoque — tira o entulho de combo vazio pro pump reabastecer.
  if (req.method === "POST" && url.pathname === "/owner/factory/purge-dead-queue") {
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure SYSTEM_MASTER_USERNAME/PASSWORD no backend/.env." });
      return;
    }
    const response = await backendRequest("POST", "/modules/owner/radar/factory/purge-dead-queue", {}, { timeoutMs: 60000 });
    const data = (response && response.data) || {};
    const ok = Boolean(response && response.ok);
    invalidateFactoryStatusCache();
    sendJson(res, ok ? 200 : 502, {
      ok,
      deletedNeverRun: data.deletedNeverRun ?? null,
      exhaustedAttempted: data.exhaustedAttempted ?? null,
      canceledCampaigns: data.canceledCampaigns ?? null,
      remainingQueued: data.remainingQueued ?? null,
      backend: data,
      reason: ok ? undefined : (response?.error || data?.message || `http_${response?.statusCode || "?"}`),
    });
    return;
  }

  // Forçar a PRÓXIMA missão da fábrica LOCAL (pula o combo travado e parte pra próxima cidade/segmento).
  if (req.method === "POST" && url.pathname === "/owner/factory/force-next") {
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure SYSTEM_MASTER_USERNAME/PASSWORD no backend/.env." });
      return;
    }
    const response = await backendRequest("POST", "/modules/owner/radar/factory/force-next", {}, { timeoutMs: 60000 });
    const data = (response && response.data) || {};
    const ok = Boolean(response && response.ok);
    invalidateFactoryStatusCache();
    sendJson(res, ok ? 200 : 502, {
      ok,
      backend: data,
      reason: ok ? undefined : (response?.error || data?.message || `http_${response?.statusCode || "?"}`),
    });
    return;
  }

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
    const docker = execRead(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}"]);
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
    sendJson(res, 200, await readVpsSystem());
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
  if (req.method === "POST" && url.pathname === "/owner/clean-junk-leads") {
    const body = await readBody(req);
    const junkIds = [];
    const sample = [];
    let scanned = 0;
    const limit = 500;
    for (let page = 1; page <= 40 && junkIds.length < 20000; page += 1) {
      const r = await backendRequest("GET", `/modules/owner/radar/database-cards?limit=${limit}&page=${page}`, null, { timeoutMs: 30000, maxBytes: 16_000_000 });
      if (!r.ok || !r.data) break;
      const items = Array.isArray(r.data.items) ? r.data.items : [];
      if (!items.length) break;
      for (const row of items) {
        scanned += 1;
        const id = String(row.id || "").trim();
        const name = String(row.name || "");
        if (id && isJunkLead(row)) {
          junkIds.push(id);
          if (sample.length < 8) sample.push(name || "(sem nome)");
        }
      }
      if (items.length < limit) break;
    }
    if (!junkIds.length) {
      sendJson(res, 200, { ok: true, scanned, junk: 0, message: "Nenhum lixo de nome encontrado no banco local." });
      return;
    }
    if (body.confirm !== true) {
      sendJson(res, 200, { ok: true, preview: true, scanned, junk: junkIds.length, sample });
      return;
    }
    let cleared = 0;
    const errors = [];
    for (let i = 0; i < junkIds.length; i += 2000) {
      const chunk = junkIds.slice(i, i + 2000);
      const del = await backendRequest("DELETE", "/modules/owner/radar/database-cards/batch", { leadIds: chunk }, { timeoutMs: 30000 });
      if (del.ok) cleared += Number(del.data?.affected ?? chunk.length) || 0;
      else errors.push(del.error || del.data?.message || `http_${del.statusCode || "?"}`);
    }
    sendJson(res, 200, { ok: true, scanned, junk: junkIds.length, cleared, errors });
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
    transferJob = freshTransferJob(isPull ? "pull" : "push");
    (isPull ? runTransferPull() : runTransferPush()).catch((err) => {
      transferJob.error = err?.message || "falha";
      transferJob.ok = false; transferJob.done = true;
      transferJob.running = false; transferJob.finishedAt = Date.now();
    });
    sendJson(res, 200, { ok: true, started: true, direction: transferJob.direction });
    return;
  }

  // Progresso da transferência (a UI faz polling disto a cada ~1.2s).
  if (req.method === "GET" && url.pathname === "/owner/transfer/status") {
    sendJson(res, 200, { ok: true, ...transferJob });
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
  // O 30B leva ~12min p/ carregar em CPU → NUNCA bloquear a resposta HTTP.
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
      options: { num_predict: 1 },
    }, 900000).catch(() => {});
    sendJson(res, 200, { ok: true, warming: model, message: "Aquecendo " + model + " — o 30B leva ~12min em CPU. Acompanhe o status." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      app: "HBX Owner Local Agent",
      host: HOST,
      port: PORT,
      cwd: rootDir,
      runs: runs.size,
      backendConfigured: Boolean(backendToken),
      opsConfigured: Boolean(opsToken),
      opsUrl,
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
    const local = readContainers();
    const [vpsCtrs, vpsOv] = await Promise.all([
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

  // --- Campanhas mass-data: ler / criar / pausar / retomar / cancelar ---
  if (req.method === "GET" && url.pathname === "/owner/radar/mass-data") {
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("GET", "/modules/owner/radar/mass-data");
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  if (req.method === "POST" && url.pathname === "/owner/radar/mass-data") {
    const body = await readBody(req);
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", "/modules/owner/radar/mass-data", body, { timeoutMs: 30000 });
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, data: r.data, reason: r.error || r.data?.message });
    return;
  }

  const massCampaignMatch = url.pathname.match(/^\/owner\/radar\/mass-data\/([^/]+)\/(pause|resume|cancel)$/);
  if (req.method === "POST" && massCampaignMatch) {
    const campaignId = massCampaignMatch[1];
    const action = massCampaignMatch[2];
    const body = await readBody(req);
    if (action === "cancel" && body.confirm !== true) {
      sendError(res, 400, `Confirmacao obrigatoria para cancelar a campanha ${campaignId}.`);
      return;
    }
    if (!backendToken) { await refreshBackendToken().catch(() => null); }
    const r = await backendRequest("POST", `/modules/owner/radar/mass-data/${encodeURIComponent(campaignId)}/${action}`, body);
    sendJson(res, r.ok ? 200 : 502, { ok: r.ok, campaignId, action, data: r.data, reason: r.error || r.data?.message });
    return;
  }

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

  sendError(res, 404, "Endpoint nao encontrado.");
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => sendError(res, 500, error.message));
});

server.listen(PORT, HOST, () => {
  console.log(`HBX Owner Local Agent em http://${HOST}:${PORT}`);
});
