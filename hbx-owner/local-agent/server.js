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
const runs = new Map();

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

  if (!isAuthorized(req)) {
    sendError(res, 401, "Token local invalido ou ausente.");
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const allowlist = readAllowlist();

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
