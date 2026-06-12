const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

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

// Importar: exporta JSONL do local-lab e envia ao backend (VPS).
// Só remove a evidência local DEPOIS do import confirmar (sem perda de lead).
async function importLocalLabToBackend(body) {
  if (!backendToken) {
    return { ok: false, reason: "backend_token_ausente", message: "Configure HBX_OWNER_BACKEND_TOKEN para importar." };
  }
  const exportResp = await new Promise((resolve) => {
    const req = http.get(`${localLabUrl}/local-lab/export?format=jsonl`, { timeout: 20000 }, (response) => {
      let raw = "";
      response.on("data", (chunk) => (raw += chunk.toString("utf8")));
      response.on("end", () => resolve({ statusCode: response.statusCode, raw }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ error: error.message }));
  });
  if (exportResp.error || !exportResp.raw) {
    return { ok: false, reason: "export_falhou", message: exportResp.error || "Local Lab sem export." };
  }
  const leads = exportResp.raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!leads.length) {
    return { ok: false, reason: "sem_leads", message: "Nenhum lead no export do Local Lab." };
  }
  const importResp = await backendRequest("POST", "/webscraping/lead-harvest/import", { source: "hbx-local-lab", leads });
  if (!importResp.ok) {
    return { ok: false, reason: "import_falhou", message: importResp.error || `http_${importResp.statusCode || "?"}`, leadsTried: leads.length };
  }
  return { ok: true, leadsSent: leads.length, backend: importResp.data };
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
  if (ext === ".html") {
    content = Buffer.from(String(content).replace(/__HBX_OWNER_TOKEN__/g, TOKEN));
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

  if (req.method === "POST" && url.pathname === "/owner/import") {
    const body = await readBody(req);
    sendJson(res, 200, await importLocalLabToBackend(body));
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
