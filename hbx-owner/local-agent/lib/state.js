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

function parseJournal(raw) {
  try {
    // BOM: quem escreve boot.json é PowerShell (start-owner-supervised.ps1) e o `Set-Content -Encoding
    // utf8` do PS 5.1 grava COM BOM. JSON.parse estoura no ﻿, o journal virava "corrupt" e o
    // painel ficava preso em "sem boot json" com as bolinhas cinzas pra sempre. O writer já foi
    // corrigido; o strip aqui conserta os arquivos antigos e qualquer escritor externo futuro.
    const text = typeof raw === "string" && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return { status: "valid", data: JSON.parse(text) };
  } catch {
    return { status: "corrupt", data: null };
  }
}

// Inspeciona um journal preservando a diferença entre ausente, ilegível e corrompido.
// Controles de segurança usam esse resultado para não confundir corrupção com primeiro boot.
function inspect(name) {
  let raw;
  try {
    raw = fs.readFileSync(statePath(name), "utf8");
  } catch (error) {
    return {
      status: error && error.code === "ENOENT" ? "missing" : "unreadable",
      data: null,
    };
  }
  return parseJournal(raw);
}

// Leitura compatível com os journals de retomada: ausência/erro continuam retornando `null`.
function load(name) {
  const result = inspect(name);
  return result.status === "valid" ? result.data : null;
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

module.exports = { STATE_DIR, statePath, ensureDir, parseJournal, inspect, load, save, clear };
