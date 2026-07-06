"use strict";

// Utilitários PUROS do HBX Owner local-agent — sem estado de módulo, sem rede.
// Extraídos do server.js (Sprint 5, slice seguro). CommonJS puro, zero-dependência.
// Cada função é byte-a-byte igual à original; só `readDotenvValue` toca disco (fs).

const fs = require("fs");

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

function parseLoadTriplet(loadStr) {
  const parts = String(loadStr || "").trim().split(/\s+/);
  // Number("") === 0 (não NaN), então só converte se a parte existir de verdade.
  const num = (i) => (parts[i] ? Number(parts[i]) : NaN);
  return { load1: num(0), load5: num(1), load15: num(2) };
}

// BUG D1 (frente IA-VPS, 05-06/07): as chamadas HTTP cruas do agent (backend/ops/upstream)
// usavam `http.request` FIXO ignorando `target.protocol` — com HBX_OWNER_BACKEND_URL=https://...
// a chamada saía em HTTP:80 e o nginx devolvia 301, quebrando a ponte 30B→VPS em produção.
// Esta função escolhe o módulo certo (e a porta-default certa) pelo protocolo da URL alvo.
// `target` é o objeto `new URL(...)` já parseado pelos callers.
function httpModuleForUrl(target) {
  if (target && target.protocol === "https:") {
    return { mod: require("https"), defaultPort: 443 };
  }
  return { mod: require("http"), defaultPort: 80 };
}

module.exports = {
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
};
