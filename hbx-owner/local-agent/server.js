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
const allowlistPath = path.join(__dirname, "allowlist.json");
const logsDir = path.join(__dirname, "logs");
const webDir = path.join(__dirname, "web");
const stateDir = path.join(__dirname, "state");
const todayStatePath = path.join(stateDir, "today.json");
const localLabDir = path.join(rootDir, "hbx-local-lab");
const localLabUrl = "http://127.0.0.1:3098";
// Fila de tickets = arquivos .md do repo (sem SQLite). Fonte única, versionada.
const ticketsDir = path.join(rootDir, "docs", "PLANEJAMENTOS");
// Backend do produto (para Banco de Leads e import local→VPS). Token opcional.
const backendUrl = String(process.env.HBX_OWNER_BACKEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const backendToken = String(process.env.HBX_OWNER_BACKEND_TOKEN || "").trim();
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

function readAllowlist() {
  const content = fs.readFileSync(allowlistPath, "utf8");
  return JSON.parse(content);
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

function publicCommand(id, item) {
  return {
    id,
    label: item.label,
    command: item.command,
    risk: item.risk,
    confirm: Boolean(item.confirm),
  };
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

function runSequence(commandId, label, commands) {
  for (const command of commands) assertSafeCommand(command);
  const { run, logPath } = createRun(commandId, label, commands);
  let index = 0;

  function next() {
    if (index >= commands.length) {
      finishRun(run, "passed", 0);
      appendLog(logPath, "\n[fim] sequencia concluida\n");
      return;
    }
    const command = commands[index];
    index += 1;
    const [binary, ...args] = command;
    appendLog(logPath, `\n$ ${command.join(" ")}\n`);
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
    });
    child.on("close", (code) => {
      appendLog(logPath, `\n[comando] exitCode=${code}\n`);
      if (code !== 0) {
        finishRun(run, "failed", code);
        return;
      }
      next();
    });
  }

  next();
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

function isAllowedHbxEngineName(name) {
  return /^hbx-engine-\d+$/.test(String(name || "").trim());
}

function parseDockerRows(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [name, image, status, state, ports = ""] = line.split("\t");
      return { name, image, status, state, ports };
    })
    .filter((item) => isAllowedHbxEngineName(item.name));
}

function parseDockerStats(output) {
  const stats = new Map();
  for (const line of String(output || "").split(/\r?\n/)) {
    const [name, cpu, memory, memPercent, pids] = line.split("\t");
    if (!isAllowedHbxEngineName(name)) continue;
    stats.set(name, { cpu, memory, memPercent, pids });
  }
  return stats;
}

function engineNumber(name) {
  const match = String(name || "").match(/^hbx-engine-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function readRadarEngineStatus() {
  const ps = execRead([
    "docker",
    "ps",
    "-a",
    "--format",
    "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}",
  ]);
  const stats = execRead([
    "docker",
    "stats",
    "--no-stream",
    "--format",
    "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}",
  ]);
  const statRows = parseDockerStats(stats.stdout);
  const engines = parseDockerRows(ps.stdout)
    .sort((left, right) => engineNumber(left.name) - engineNumber(right.name))
    .map((engine) => {
      const itemStats = statRows.get(engine.name) || {};
      return {
        ...engine,
        cpu: itemStats.cpu || "-",
        memory: itemStats.memory || "-",
        memPercent: itemStats.memPercent || "-",
        pids: itemStats.pids || "-",
      };
    });
  return {
    ok: ps.ok,
    dockerOk: ps.ok,
    statsOk: stats.ok,
    generatedAt: nowIso(),
    summary: {
      total: engines.length,
      running: engines.filter((engine) => engine.state === "running").length,
      stopped: engines.filter((engine) => engine.state !== "running").length,
    },
    engines,
    errors: [
      ps.ok ? "" : (ps.stderr || ps.stdout || "docker ps falhou.").trim(),
      stats.ok ? "" : (stats.stderr || stats.stdout || "docker stats indisponivel.").trim(),
    ].filter(Boolean),
  };
}

function runDockerEngineAction(engineId, action, label) {
  if (!isAllowedHbxEngineName(engineId)) {
    throw new Error("Motor invalido. Use apenas hbx-engine-N.");
  }
  const command = ["docker", action, engineId];
  return runCommandArray(`radar-engine-${action}`, `${label} ${engineId}`, command);
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

// ---------- Hoje / foco (estado em JSON, sem SQLite) ----------
function readTodayState() {
  try {
    const raw = fs.readFileSync(todayStatePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.dayKey === localDayKey()) return parsed;
  } catch {
    // sem estado ainda: começa o dia limpo
  }
  return { dayKey: localDayKey(), status: "idle", startedAt: null, pausedAt: null, accumulatedMs: 0, sessions: [] };
}

function writeTodayState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(todayStatePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

function localDayKey(now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function liveNetMs(state) {
  let total = Number(state.accumulatedMs || 0);
  if (state.status === "working" && state.startedAt) {
    total += Date.now() - new Date(state.startedAt).getTime();
  }
  return total;
}

function todaySnapshot() {
  const state = readTodayState();
  const commits = execRead([
    "git",
    "log",
    "--since=midnight",
    "--pretty=format:%h",
  ]);
  const commitsToday = commits.ok
    ? String(commits.stdout || "").split(/\r?\n/).filter(Boolean).length
    : 0;
  return {
    ok: true,
    dayKey: state.dayKey,
    status: state.status,
    netMinutes: Math.round(liveNetMs(state) / 60000),
    commitsToday,
    startedAt: state.startedAt,
    pausedAt: state.pausedAt,
    focus: "Recovery / P0 técnico / demo / outbound",
    distraction: "Feature nova, Radar por curiosidade, refactor bonito ou marketing amplo",
  };
}

function applyTodayAction(action) {
  const state = readTodayState();
  const now = new Date().toISOString();
  if (action === "start" || action === "resume") {
    if (state.status !== "working") {
      state.status = "working";
      state.startedAt = now;
      state.pausedAt = null;
    }
  } else if (action === "pause") {
    if (state.status === "working" && state.startedAt) {
      state.accumulatedMs = Number(state.accumulatedMs || 0) + (Date.now() - new Date(state.startedAt).getTime());
      state.status = "paused";
      state.pausedAt = now;
      state.startedAt = null;
    }
  } else if (action === "stop" || action === "close") {
    if (state.status === "working" && state.startedAt) {
      state.accumulatedMs = Number(state.accumulatedMs || 0) + (Date.now() - new Date(state.startedAt).getTime());
    }
    state.status = action === "close" ? "closed" : "idle";
    state.startedAt = null;
  } else {
    throw new Error("Acao de expediente invalida.");
  }
  writeTodayState(state);
  return todaySnapshot();
}

// ---------- Tickets (fila .md do repo) ----------
function readTickets() {
  if (!fs.existsSync(ticketsDir)) return { ok: true, dir: relativeLogPath(ticketsDir), items: [] };
  const items = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        let title = entry.name.replace(/\.md$/i, "");
        let firstLine = "";
        try {
          const content = fs.readFileSync(full, "utf8");
          const heading = content.split(/\r?\n/).find((line) => line.trim().startsWith("#"));
          if (heading) title = heading.replace(/^#+\s*/, "").trim().slice(0, 140);
          firstLine = content.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";
        } catch {
          // arquivo ilegível: mantém o nome como título
        }
        const stat = fs.statSync(full);
        items.push({
          id: path.relative(ticketsDir, full).replace(/\\/g, "/"),
          title,
          excerpt: firstLine.slice(0, 180),
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(ticketsDir);
  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ok: true, dir: relativeLogPath(ticketsDir), count: items.length, items };
}

// ---------- Backend bridge (Banco de Leads + import) ----------
function backendRequest(method, route, payload) {
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
    if (backendToken) headers.Authorization = `Bearer ${backendToken}`;
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method, headers, timeout: 15000 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          if (body.length < 200000) body += chunk.toString("utf8");
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
  const data = response.data;
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
  return { ok: true, alive, warm, ceiling, queue, operationalStatus, elastic, governorOn, factoryStopped, reason };
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

// Caminho preferido: snapshot leve (1 conexao SSH) com nproc → CPU% real.
function mapSnapshot(data) {
  const mem = data.memory || {};
  const disk = data.disk || {};
  const load = parseLoadTriplet(data.load);
  const cores = Number.isFinite(Number(data.cores)) && Number(data.cores) > 0 ? Number(data.cores) : null;
  const ramPct = Number.isFinite(Number(mem.usedPercent)) ? Math.round(Number(mem.usedPercent)) : null;
  const cpuPct = cores && Number.isFinite(load.load1) ? Math.min(100, Math.round((load.load1 / cores) * 100)) : null;
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

function clampEngineRange(body) {
  const from = clampInt(body.from, 1, 1, 200);
  const to = clampInt(body.to, from, 1, 200);
  if (to < from) return { from, to: from };
  if (to - from > 49) return { from, to: from + 49 };
  return { from, to };
}

const VPS_QUICK_TARGETS = new Set(["scrapingEngine", "backend", "webscraping"]);
const VPS_QUICK_ACTIONS = new Set(["start", "stop", "restart"]);

// ---------- Caça de e-mail (via backend Radar — o "chefe") ----------
const ownerCompanyId = Number(process.env.HBX_OWNER_COMPANY_ID || 2) || 2;

// Filtro instantâneo: leads do Banco que já têm e-mail (segmento/cidade).
async function emailLeadsFromBank(query) {
  const params = new URLSearchParams();
  if (query.segment) params.set("segment", query.segment);
  if (query.city) params.set("city", query.city);
  params.set("take", String(clampInt(query.take, 50, 1, 200)));
  const response = await backendRequest("GET", `/night-factory/email-leads?${params.toString()}`);
  if (!response.ok || !response.data) {
    return { ok: false, reason: response.error || `http_${response.statusCode || "?"}`, items: [], total: 0 };
  }
  return { ok: true, total: response.data.total || 0, items: response.data.items || [] };
}

// Caçar novos: pede ao CHEFE (backend Radar) para descobrir — fontes grátis (engine hbx).
// Depois lê do Banco os que entraram com e-mail.
async function huntEmails(body) {
  const segment = safeText(body.segment, 180);
  const city = safeText(body.city, 120);
  const state = safeText(body.state, 2).toUpperCase();
  if (!segment) return { ok: false, reason: "sem_segmento", message: "Informe o segmento." };
  if (!backendToken) return { ok: false, reason: "backend_token_ausente", message: "Configure HBX_OWNER_BACKEND_TOKEN." };

  await backendRequest("POST", "/master-context/assume", { companyId: ownerCompanyId }).catch(() => null);
  const quantity = clampInt(body.targetEmails, 20, 1, 100);
  const searchResp = await backendRequest("POST", "/webscraping/search", {
    city,
    state,
    segment,
    quantity,
    engine: "hbx",
  });

  const bank = await emailLeadsFromBank({ segment, city, take: 60 });
  if (!searchResp.ok) {
    return {
      ok: bank.ok,
      searchOk: false,
      searchReason: searchResp.data?.message || searchResp.data?.code || searchResp.error || `http_${searchResp.statusCode || "?"}`,
      total: bank.total,
      items: bank.items,
    };
  }
  const found = Number(searchResp.data?.count ?? (Array.isArray(searchResp.data?.results) ? searchResp.data.results.length : 0));
  return { ok: true, searchOk: true, foundNow: found, total: bank.total, items: bank.items };
}

// Opções selecionáveis (segmento/estado/cidade) que JÁ existem no backend: vêm do
// meta.availableFilters da listagem do Radar. Sem endpoint dedicado → lê a listagem.
async function radarFilters() {
  const empty = { ok: false, segments: [], states: [], citiesByState: {} };
  if (!backendToken) return { ...empty, reason: "backend_token_ausente" };
  await backendRequest("POST", "/master-context/assume", { companyId: ownerCompanyId }).catch(() => null);
  const response = await backendRequest("GET", "/webscraping/radar/leads");
  const filters = response.ok && response.data && response.data.meta && response.data.meta.availableFilters;
  if (!filters) return { ...empty, reason: response.error || `http_${response.statusCode || "?"}` };
  return {
    ok: true,
    segments: Array.isArray(filters.segments) ? filters.segments : [],
    states: Array.isArray(filters.states) ? filters.states : [],
    citiesByState: (filters.citiesByState && typeof filters.citiesByState === "object") ? filters.citiesByState : {},
  };
}

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

function requireConfirmation(command, body) {
  if (!command.confirm) return;
  if (body.confirm !== true && body.confirmation !== "CONFIRMAR") {
    throw new Error("Confirmacao obrigatoria para este comando.");
  }
}

function testCommands(area, allowlist) {
  if (area === "frontend") return [allowlist["frontend-lint"].command, allowlist["frontend-build"].command];
  if (area === "backend") return [allowlist["backend-prisma-validate"].command, allowlist["backend-build"].command];
  if (area === "webwhats") return [allowlist["webwhats-typecheck"].command, allowlist["webwhats-build"].command];
  if (area === "e2e") return [allowlist.e2e.command];
  return null;
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // Shell estática (HTML/CSS/JS) servida sem token: é só a casca; os dados exigem token.
  if (req.method === "GET" && !url.pathname.startsWith("/api") && sendStatic(res, url.pathname)) {
    return;
  }

  if (!isAuthorized(req)) {
    sendError(res, 401, "Token local invalido ou ausente.");
    return;
  }

  const allowlist = readAllowlist();

  if (req.method === "GET" && url.pathname === "/owner/today") {
    sendJson(res, 200, todaySnapshot());
    return;
  }

  const todayActionMatch = url.pathname.match(/^\/owner\/today\/(start|pause|resume|stop|close)$/);
  if (req.method === "POST" && todayActionMatch) {
    sendJson(res, 200, applyTodayAction(todayActionMatch[1]));
    return;
  }

  if (req.method === "GET" && url.pathname === "/owner/tickets") {
    sendJson(res, 200, readTickets());
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

  // Caça de e-mail. Filtro instantâneo do Banco + "Caçar" via backend Radar.
  if (req.method === "GET" && url.pathname === "/owner/email-leads") {
    sendJson(res, 200, await emailLeadsFromBank({
      segment: url.searchParams.get("segment"),
      city: url.searchParams.get("city"),
      take: url.searchParams.get("take"),
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/owner/email-hunt") {
    const body = await readBody(req);
    sendJson(res, 200, await huntEmails(body));
    return;
  }

  // Controle da fábrica de motores (runtime, sem subir container): freio do dono.
  if (req.method === "POST" && (url.pathname === "/owner/factory/stop" || url.pathname === "/owner/factory/resume")) {
    if (!backendToken) {
      sendJson(res, 200, { ok: false, reason: "backend_token_ausente", message: "Configure HBX_OWNER_BACKEND_TOKEN." });
      return;
    }
    const route = url.pathname.endsWith("/stop")
      ? "/modules/master/webscraping/factory/stop"
      : "/modules/master/webscraping/factory/resume-schedule";
    const response = await backendRequest("POST", route, {});
    sendJson(res, response.ok ? 200 : 502, { ok: response.ok, action: url.pathname.endsWith("/stop") ? "stop" : "resume", backend: response.data, reason: response.error });
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

  // ----- Exportar local -> VPS (proxia o Email Lab do Ops Control). 3 passos: caçar lote no
  // Local Lab -> acompanhar -> importar na VPS (dedup). Escreve na VPS = produção; degrada se
  // OPS/VPS não configurados (o dono nunca dispara prod às cegas: é clique + creds no .env).
  if (req.method === "POST" && url.pathname === "/owner/export") {
    const body = await readBody(req);
    const payload = {
      scope: "both",
      segment: safeText(body.segment, 80),
      city: safeText(body.city, 80),
      state: safeText(body.state, 2),
      targetEmails: clampInt(body.targetEmails, 30, 1, 200),
    };
    const response = await opsRequest("POST", "/api/email-lab/local/jobs", payload);
    if (!response.configured) {
      sendJson(res, 200, { ok: false, reason: "ops_token_ausente", message: "Configure HBX_OWNER_OPS_TOKEN (ponte Ops Control)." });
      return;
    }
    const data = response.data || {};
    const job = data.job || data;
    sendJson(res, response.ok ? 200 : 502, {
      ok: response.ok,
      jobId: (job && (job.id || job.jobId)) || null,
      message: response.ok ? "Caçando lote no Local Lab — importa pra VPS quando o export ficar pronto." : null,
      reason: response.reason || data.error,
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

  // Opções selecionáveis (segmento/estado/cidade) do backend, pros datalists do painel.
  if (req.method === "GET" && url.pathname === "/owner/radar-filters") {
    sendJson(res, 200, await radarFilters());
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      app: "HBX Owner Local Agent",
      host: HOST,
      port: PORT,
      cwd: rootDir,
      commands: Object.keys(allowlist).length,
      runs: runs.size,
      backendConfigured: Boolean(backendToken),
      opsConfigured: Boolean(opsToken),
      opsUrl,
      now: nowIso(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/commands") {
    sendJson(res, 200, { ok: true, commands: Object.entries(allowlist).map(([id, item]) => publicCommand(id, item)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/radar/engines/status") {
    sendJson(res, 200, readRadarEngineStatus());
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

  const radarEngineLogsMatch = url.pathname.match(/^\/radar\/engines\/([^/]+)\/logs$/);
  if (req.method === "GET" && radarEngineLogsMatch) {
    const engineId = radarEngineLogsMatch[1];
    if (!isAllowedHbxEngineName(engineId)) {
      sendError(res, 400, "Motor invalido. Use apenas hbx-engine-N.");
      return;
    }
    const result = execRead(["docker", "logs", "--tail", "160", engineId]);
    sendJson(res, 200, {
      ok: result.ok,
      engineId,
      log: `${result.stdout || ""}${result.stderr || ""}`.slice(-30000),
      result,
    });
    return;
  }

  const radarEngineActionMatch = url.pathname.match(/^\/radar\/engines\/([^/]+)\/(start|stop)$/);
  if (req.method === "POST" && radarEngineActionMatch) {
    const engineId = radarEngineActionMatch[1];
    const action = radarEngineActionMatch[2];
    const body = await readBody(req);
    if (action === "stop" && body.confirm !== true && body.confirmation !== "CONFIRMAR") {
      sendError(res, 400, "Confirmacao obrigatoria para parar motor.");
      return;
    }
    const run = runDockerEngineAction(engineId, action, action === "start" ? "Iniciar motor" : "Parar motor");
    sendJson(res, 202, { ok: true, run });
    return;
  }

  const commandRunMatch = url.pathname.match(/^\/commands\/([^/]+)\/run$/);
  if (req.method === "POST" && commandRunMatch) {
    const commandId = commandRunMatch[1];
    const command = allowlist[commandId];
    if (!command) {
      sendError(res, 404, "Comando nao encontrado na allowlist.");
      return;
    }
    const body = await readBody(req);
    requireConfirmation(command, body);
    const run = runCommandArray(commandId, command.label, command.command);
    sendJson(res, 202, { ok: true, run });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runs") {
    sendJson(res, 200, { ok: true, runs: Array.from(runs.values()).reverse() });
    return;
  }

  const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const run = runs.get(runMatch[1]);
    if (!run) {
      sendError(res, 404, "Execucao nao encontrada.");
      return;
    }
    const absoluteLogPath = path.join(rootDir, run.logPath);
    const log = fs.existsSync(absoluteLogPath) ? fs.readFileSync(absoluteLogPath, "utf8").slice(-20000) : "";
    sendJson(res, 200, { ok: true, run, log });
    return;
  }

  const gitRoutes = {
    "/git/status": ["git", "status", "--short"],
    "/git/branches": ["git", "branch", "--all"],
    "/git/current": ["git", "branch", "--show-current"],
    "/git/remotes": ["git", "remote", "-v"],
    "/git/last-commit": ["git", "log", "-1", "--pretty=format:%H%n%s%n%cd"],
    "/git/changed-files": ["git", "diff", "--name-only", "origin/master...HEAD"],
  };
  if (req.method === "GET" && gitRoutes[url.pathname]) {
    const result = execRead(gitRoutes[url.pathname]);
    sendJson(res, 200, { ok: result.ok, result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/git/checkout-pr") {
    const body = await readBody(req);
    const prNumber = Number(body.prNumber);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      sendError(res, 400, "Informe um numero de PR valido.");
      return;
    }
    const status = execRead(["git", "status", "--short"]);
    if (status.stdout.trim()) {
      sendError(res, 409, "Workspace sujo. Revise ou salve as alteracoes antes de baixar PR.");
      return;
    }
    const gh = execRead(["gh", "--version"]);
    if (!gh.ok) {
      sendError(res, 424, "GitHub CLI nao encontrado ou indisponivel.");
      return;
    }
    const run = runCommandArray("git-checkout-pr", `Baixar PR ${prNumber}`, ["gh", "pr", "checkout", String(prNumber)]);
    sendJson(res, 202, { ok: true, run });
    return;
  }

  const testMatch = url.pathname.match(/^\/test\/(frontend|backend|webwhats|e2e)$/);
  if (req.method === "POST" && testMatch) {
    const commands = testCommands(testMatch[1], allowlist);
    if (!commands) {
      sendError(res, 404, "Area de teste invalida.");
      return;
    }
    const run = runSequence(`test-${testMatch[1]}`, `Testes ${testMatch[1]}`, commands);
    sendJson(res, 202, { ok: true, run });
    return;
  }

  if (req.method === "POST" && url.pathname === "/deploy/verify-prod") {
    const body = await readBody(req);
    requireConfirmation(allowlist["verify-prod"], body);
    const run = runCommandArray("verify-prod", allowlist["verify-prod"].label, allowlist["verify-prod"].command);
    sendJson(res, 202, { ok: true, run });
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
