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
// Backend do produto (para Banco de Leads e import local→VPS). Token opcional.
const backendUrl = String(process.env.HBX_OWNER_BACKEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
let backendToken = String(process.env.HBX_OWNER_BACKEND_TOKEN || "").trim();
let backendTokenRefreshPromise = null;
// Transferência VPS<->local em segundo plano (1 por vez) + progresso vivo pra UI.
// processed/total = a % honesta (quantos leads já passaram ÷ total real do banco).
let transferJob = {
  running: false, direction: null, phase: "",
  processed: 0, total: null, page: 0, errors: 0, failed: 0, lastError: null,
  pulled: 0, imported: 0, sent: 0,
  done: false, ok: null, error: null, startedAt: 0, finishedAt: 0,
};

function freshTransferJob(direction) {
  return {
    running: true, direction, phase: "iniciando",
    processed: 0, total: null, page: 0, errors: 0, failed: 0, lastError: null,
    pulled: 0, imported: 0, sent: 0,
    done: false, ok: null, error: null, startedAt: Date.now(), finishedAt: 0,
  };
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
    const match = raw.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*)\\s*$`, "m"));
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

function findLocalLabProcesses() {
  if (process.platform !== "win32") return [];
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match 'hbx-local-lab' -and $_.CommandLine -match 'server.js'",
    "} | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
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
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
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

function stopLocalLab() {
  const processes = findLocalLabProcesses();
  for (const item of processes) {
    const pid = Number(item.ProcessId);
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid);
      } catch {
        // Processo pode ter encerrado entre a listagem e o kill.
      }
    }
  }
  return processes.length;
}

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
  const response = await backendRequest("GET", "/night-factory/leads-bank");
  if (!response.ok || !response.data) {
    return { ok: false, configured: Boolean(backendToken), reason: response.error || `http_${response.statusCode || "?"}`, total: null, deltaToday: null };
  }
  return { ok: true, configured: true, total: response.data.total ?? null, deltaToday: response.data.deltaToday ?? null, generatedAt: response.data.generatedAt };
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
    sourceUrl: website || row.sourceUrl || row.mapsUrl || `radar:${id}`,
    sourceMode,
    evidence: { method, origin },
  };
}

// Roda em segundo plano: traz TUDO do VPS pro local em PÁGINAS (stream), gravando cada
// página assim que chega. % honesta = pulled ÷ total real do banco da VPS. O proxy do
// Ops Control aceita até 2000/página; 500 = poucos round-trips e JSON seguro.
async function runTransferPull() {
  const pageSize = 500;
  const maxPages = 2000;
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
          transferJob.imported += Number(imp.data?.accepted ?? 0) || 0;
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

// Roda em segundo plano: manda TUDO do local pro VPS (cópia; não apaga o local), em PÁGINAS.
// Cada página vira um import próprio na VPS → progresso real e nada de request gigante que estoura.
// % honesta = sent ÷ total real do banco local.
async function runTransferPush() {
  const pageSize = 500;
  const maxPages = 2000;
  let chunkSeq = 0;
  let consecutiveFails = 0;
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
    transferJob.ok = !transferJob.error;
    if (transferJob.sent > 0) vpsLeadsCache = { at: 0, data: null };
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

  // Ligar/parar a FROTA LOCAL de motores (hbx-engine-*) pelo painel — o que o dono fazia no
  // CLI com `npm run engines:up/down`. Roda o script async; CPU/RAM e o feed mostram subindo.
  if (req.method === "POST" && (url.pathname === "/owner/engines/local/start" || url.pathname === "/owner/engines/local/stop")) {
    const starting = url.pathname.endsWith("/start");
    const script = starting ? "scripts/start-hbx-engines.ps1" : "scripts/stop-hbx-engines.ps1";
    const label = starting ? "Ligar motores locais" : "Parar motores locais";
    try {
      const run = runCommandArray(
        starting ? "engines-local-start" : "engines-local-stop",
        label,
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      );
      sendJson(res, 200, {
        ok: true,
        action: starting ? "start" : "stop",
        runId: run.id,
        message: starting ? "Subindo motores locais — acompanhe CPU/RAM e o feed." : "Parando motores locais…",
      });
    } catch (error) {
      sendJson(res, 200, { ok: false, message: error.message || "Falha ao acionar os motores locais." });
    }
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

  // Fábrica de leads VPS — ligar/desligar de verdade (via Ops Control → backend da VPS).
  if (req.method === "POST" && (url.pathname === "/owner/vps/factory/stop" || url.pathname === "/owner/vps/factory/resume")) {
    const action = url.pathname.endsWith("/stop") ? "stop" : "resume";
    const response = await opsRequest("POST", `/api/opscontrol/factory/${action}`, { scope: "vps" });
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, action, ops: response.data, reason: response.reason || response.data?.error });
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

  // Cancelar scraping forçado na VPS (via backend da VPS, escopo vps).
  if (req.method === "POST" && url.pathname === "/owner/vps/cancel") {
    const body = await readBody(req);
    if (body.confirm !== true && body.confirmation !== "CONFIRMAR") {
      sendError(res, 400, "Confirmacao obrigatoria para cancelar o scraping da VPS.");
      return;
    }
    const response = await opsRequest("POST", "/api/opscontrol/cancel", { scope: "vps", force: Boolean(body.force) });
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." });
      return;
    }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, ops: response.data, reason: response.reason });
    return;
  }

  // Elasticidade VPS — ligar / desligar / parar tudo (via Ops Control).
  // Espelha POST /api/opscontrol/elastic/{enable|disable|stop-all} {scope}.
  const elasticMatch = url.pathname.match(/^\/owner\/ops\/elastic\/(enable|disable|stop-all)$/);
  if (req.method === "POST" && elasticMatch) {
    const action = elasticMatch[1];
    const body = await readBody(req);
    const scope = String(body.scope || "vps").toLowerCase();
    if (!OPS_SCOPES.has(scope)) { sendError(res, 400, "Escopo invalido. Use local, vps ou both."); return; }
    if (action === "stop-all" && body.confirm !== true) {
      sendError(res, 400, "Confirmacao obrigatoria para parar todos os motores.");
      return;
    }
    const response = await opsRequest("POST", `/api/opscontrol/elastic/${action}`, { scope });
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, action, scope, ops: response.data, reason: response.reason || response.data?.error });
    return;
  }

  // Turbo (modo agressivo de scraping) — escopo local/vps/both, filtro de canal opcional.
  if (req.method === "POST" && url.pathname === "/owner/ops/turbo") {
    const body = await readBody(req);
    const scope = String(body.scope || "both").toLowerCase();
    if (!OPS_SCOPES.has(scope)) { sendError(res, 400, "Escopo invalido. Use local, vps ou both."); return; }
    const channel = body.channel ? String(body.channel).toLowerCase() : null;
    if (channel && !RADAR_CHANNELS.has(channel)) { sendError(res, 400, "Canal invalido para filtro."); return; }
    const payload = { scope };
    if (channel) payload.requiredChannel = channel;
    const response = await opsRequest("POST", "/api/opscontrol/turbo", payload, 60000);
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, scope, channel, ops: response.data, reason: response.reason || response.data?.error });
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

  // Cancelar scraping forçado — escopo local/vps/both (confirmação exigida; destrutivo do fluxo).
  if (req.method === "POST" && url.pathname === "/owner/ops/cancel") {
    const body = await readBody(req);
    if (body.confirm !== true && body.confirmation !== "CONFIRMAR") { sendError(res, 400, "Confirmacao obrigatoria para cancelar o scraping."); return; }
    const scope = String(body.scope || "both").toLowerCase();
    if (!OPS_SCOPES.has(scope)) { sendError(res, 400, "Escopo invalido. Use local, vps ou both."); return; }
    const response = await opsRequest("POST", "/api/opscontrol/cancel", { scope, force: Boolean(body.force) });
    if (!response.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN." }); return; }
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, scope, ops: response.data, reason: response.reason || response.data?.error });
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
    const stopped = stopLocalLab();
    await new Promise((resolve) => setTimeout(resolve, 400));
    sendJson(res, 200, { ...(await readLocalLabStatus()), stopped });
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
  if (req.method === "GET" && url.pathname === "/owner/vps/radar/cards") {
    const limit = clampInt(url.searchParams.get("limit"), 1000, 1, 2000);
    const page = clampInt(url.searchParams.get("page"), 1, 1, 10000);
    const r = await opsRequest("GET", `/api/radar/vps/database-cards?limit=${limit}&page=${page}`, null, 30000);
    if (!r.configured) { sendJson(res, 200, { ok: false, reason: "ops_token_ausente (configure HBX_OWNER_OPS_TOKEN)" }); return; }
    if (!r.ok) { sendJson(res, 200, { ok: false, reason: r.reason || (r.data && r.data.error) || "VPS indisponível (rebuild do ops-control pendente)" }); return; }
    const data = r.data && r.data.data ? r.data.data : r.data;
    sendJson(res, 200, { ok: true, data });
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

  // Enriquecimento CNPJ→dono (cadeia gratis L1/L3/L4) — DIRETO no backend, mesmo caminho
  // do /modules/owner/radar/database-cards (que ja funciona). A ops-control nao precisa
  // estar configurada: o owner-agent ja autentica como system-master via SYSTEM_MASTER_*
  // do backend/.env (backendRequest faz refresh de token no 401). O HBX Owner e dono do
  // motor, entao aciona o backfill sozinho — sem depender do proxy ops-control (que dava 502).
  if (req.method === "POST" && url.pathname === "/owner/ops/cnpj-backfill") {
    const body = await readBody(req);
    const scope = OPS_SCOPES.has(String(body.scope || "vps").toLowerCase()) ? String(body.scope).toLowerCase() : "vps";
    const limit = clampInt(body.limit, 200, 1, 2000);
    if (!backendToken) await refreshBackendToken().catch(() => null);
    if (!backendToken) {
      sendJson(res, 200, { ok: false, scope, limit, reason: "backend_token_ausente", message: "Configure SYSTEM_MASTER_USERNAME/PASSWORD no backend/.env (ou HBX_OWNER_BACKEND_TOKEN)." });
      return;
    }
    const response = await backendRequest("POST", `/modules/owner/radar/cnpj-backfill?limit=${limit}`, {}, { timeoutMs: 170000 });
    const data = (response && response.data) || {};
    const ok = Boolean(response && response.ok);
    const reason = ok ? undefined : (response?.error || data?.message || `http_${response?.statusCode || "?"}`);
    sendJson(res, ok ? 200 : 502, {
      ok,
      scope,
      limit,
      // formato plano — o botao "Descobrir site + CNPJ" (ckStartDiscover) le daqui
      scanned: data.scanned,
      enriched: data.enriched,
      errors: data.errors,
      sitesFound: data.sitesFound,
      cnpjsFound: data.cnpjsFound,
      data,
      // compat: o botao "Enriquecer CNPJ->dono" (ckCnpjBackfill) le ops.results[]
      ops: { results: [{ ok, environment: "backend", label: "backend", data }] },
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
