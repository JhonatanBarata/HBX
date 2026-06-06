#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..", "..");
const queuePath = path.join(rootDir, "docs", "HBX_MASTER_CODEX_QUEUE.md");
const codexDir = path.join(rootDir, ".codex");
const logsDir = path.join(codexDir, "logs");
const nextTaskPath = path.join(codexDir, "hbx-next-task.md");

const statusLabels = {
  " ": "pendentes",
  "~": "rodando",
  R: "revisao",
  "!": "bloqueadas",
  x: "concluidas",
  ">": "puladas",
};

function ensureQueueExists() {
  if (!fs.existsSync(queuePath)) {
    throw new Error(`Fila nao encontrada: ${path.relative(rootDir, queuePath)}`);
  }
}

function readQueue() {
  ensureQueueExists();
  return fs.readFileSync(queuePath, "utf8");
}

function writeQueue(content) {
  fs.writeFileSync(queuePath, content, "utf8");
}

function parseTasks(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  const headingPattern = /^## \[([ x~R!>])\] (.+)$/;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headingPattern);
    if (!match) {
      continue;
    }

    tasks.push({
      lineIndex: index,
      status: match[1],
      title: match[2],
      heading: lines[index],
      bodyStart: index + 1,
      bodyEnd: lines.length,
    });
  }

  for (let index = 0; index < tasks.length; index += 1) {
    const next = tasks[index + 1];
    if (next) {
      tasks[index].bodyEnd = next.lineIndex;
    }
    tasks[index].body = lines.slice(tasks[index].bodyStart, tasks[index].bodyEnd).join("\n").trim();
  }

  return { lines, tasks };
}

function findNextPending(parsed) {
  return parsed.tasks.find((task) => task.status === " ");
}

function taskId(task) {
  const match = task.title.match(/^(HBX-MASTER-\d+|BLOCO\s+\d+)/i);
  const raw = match ? match[1] : task.title;
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function renderPrompt(task) {
  const body = task.body ? `\n\n${task.body}` : "";
  return `## ${task.title}${body}\n`;
}

function replaceStatusByTitle(content, title, expectedStatus, nextStatus) {
  const { lines, tasks } = parseTasks(content);
  const task = tasks.find((item) => item.title === title && item.status === expectedStatus);
  if (!task) {
    throw new Error(`Nao foi possivel atualizar status da tarefa: ${title}`);
  }

  lines[task.lineIndex] = `## [${nextStatus}] ${task.title}`;
  return lines.join("\n");
}

function printStatus() {
  const parsed = parseTasks(readQueue());
  const counts = {
    " ": 0,
    "~": 0,
    R: 0,
    "!": 0,
    x: 0,
    ">": 0,
  };

  for (const task of parsed.tasks) {
    counts[task.status] = (counts[task.status] || 0) + 1;
  }

  for (const marker of [" ", "~", "R", "!", "x", ">"]) {
    console.log(`${statusLabels[marker]}: ${counts[marker] || 0}`);
  }

  const next = findNextPending(parsed);
  console.log(next ? `proxima: ${next.title}` : "proxima: nenhuma");
}

function showNext() {
  const next = findNextPending(parseTasks(readQueue()));
  if (!next) {
    console.log("Nenhuma tarefa pendente.");
    return;
  }

  process.stdout.write(renderPrompt(next));
}

function skipNext() {
  const content = readQueue();
  const parsed = parseTasks(content);
  const next = findNextPending(parsed);

  if (!next) {
    console.log("Nenhuma tarefa pendente para pular.");
    return;
  }

  const updated = replaceStatusByTitle(content, next.title, " ", ">");
  writeQueue(updated);
  console.log(`Pulada: ${next.title}`);
}

function runCodex(prompt) {
  const command = process.platform === "win32" ? "codex.cmd" : "codex";
  return spawnSync(command, ["exec", "--cd", ".", "--sandbox", "workspace-write", "-"], {
    cwd: rootDir,
    input: prompt,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
  });
}

function writeLog(task, result) {
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${taskId(task)}.log`);
  const started = new Date().toISOString();
  const lines = [
    `task: ${task.title}`,
    `startedAt: ${started}`,
    "command: codex exec --cd . --sandbox workspace-write -",
    `status: ${result.status ?? ""}`,
    `signal: ${result.signal ?? ""}`,
    "",
    "stdout:",
    result.stdout || "",
    "",
    "stderr:",
    result.stderr || "",
  ];

  if (result.error) {
    lines.push("", "error:", result.error.message);
  }

  fs.writeFileSync(logPath, lines.join("\n"), "utf8");
  return logPath;
}

function runNext() {
  const initialContent = readQueue();
  const next = findNextPending(parseTasks(initialContent));

  if (!next) {
    console.log("Nenhuma tarefa pendente.");
    return;
  }

  fs.mkdirSync(codexDir, { recursive: true });
  const prompt = renderPrompt(next);
  fs.writeFileSync(nextTaskPath, prompt, "utf8");
  writeQueue(replaceStatusByTitle(initialContent, next.title, " ", "~"));

  const result = runCodex(prompt);
  const logPath = writeLog(next, result);
  const success = !result.error && result.status === 0;
  const latestContent = readQueue();
  const finalStatus = success ? "R" : "!";

  writeQueue(replaceStatusByTitle(latestContent, next.title, "~", finalStatus));

  if (success) {
    console.log(`Revisao: ${next.title}`);
    console.log(`Log: ${path.relative(rootDir, logPath)}`);
    return;
  }

  console.error(`Bloqueada: ${next.title}`);
  console.error(`Log: ${path.relative(rootDir, logPath)}`);
  process.exitCode = result.status || 1;
}

function main() {
  const command = process.argv[2];

  try {
    if (command === "status") {
      printStatus();
      return;
    }
    if (command === "show") {
      showNext();
      return;
    }
    if (command === "skip") {
      skipNext();
      return;
    }
    if (command === "next") {
      runNext();
      return;
    }

    console.log("Uso: node ./scripts/codex/hbx-codex-queue.js <status|show|skip|next>");
    process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
