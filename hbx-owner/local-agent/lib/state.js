"use strict";

// Journal em disco do HBX Owner local-agent — estado durável de expediente (enricher/transfer).
// Zero-dependência (CommonJS puro). Escrita ATÔMICA: grava em `.tmp` e `renameSync` por cima —
// crash no meio nunca deixa um JSON pela metade (o rename é atômico no mesmo filesystem).
// Diretório: hbx-owner/local-agent/state/ (gitignored; só o .gitkeep é versionado).

const fs = require("fs");
const path = require("path");

const STATE_DIR = path.join(__dirname, "..", "state");

function statePath(name) {
  // `name` é um identificador curto controlado por nós ("enricher"/"transfer"); barra o path
  // traversal por segurança mesmo assim (nada de "../" ou separadores).
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("state: nome de journal invalido.");
  return path.join(STATE_DIR, `${safe}.json`);
}

function ensureDir() {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch { /* já existe */ }
}

// Lê um journal. Retorna `null` se não existir ou se estiver corrompido (nunca lança) —
// o chamador trata ausência como "sem estado a retomar".
function load(name) {
  let raw;
  try {
    raw = fs.readFileSync(statePath(name), "utf8");
  } catch {
    return null; // não existe → sem journal
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrompido (não deveria acontecer com escrita atômica) → ignora
  }
}

// Grava um journal de forma ATÔMICA. Nunca lança (falha de disco não pode derrubar o worker) —
// devolve true/false. Escreve em `<name>.json.tmp` e renomeia por cima do alvo.
function save(name, data) {
  ensureDir();
  const target = statePath(name);
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
    fs.renameSync(tmp, target);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nada a limpar */ }
    return false;
  }
}

// Apaga um journal (fim de trabalho OK). Idempotente, nunca lança.
function clear(name) {
  try { fs.unlinkSync(statePath(name)); return true; } catch { return false; }
}

module.exports = { STATE_DIR, statePath, ensureDir, load, save, clear };
