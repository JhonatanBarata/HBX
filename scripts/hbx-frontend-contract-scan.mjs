#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const frontendSrc = path.join(root, "frontend", "src");

const sections = [];

function toPosix(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function readLines(filePath) {
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

function addSection(title, rows) {
  sections.push({ title, rows });
}

const files = walk(frontendSrc);
const sourceFiles = files.filter((file) => /\.(tsx?|jsx?|css)$/.test(file));

const pageModuleCss = files
  .filter((file) => toPosix(file).startsWith("frontend/src/app/") && file.endsWith("page.module.css"))
  .map(toPosix)
  .sort();

addSection("page.module.css em frontend/src/app", pageModuleCss);

const popupRows = [];
const rawFieldRows = [];
const priceRows = [];
const redirectRows = [];

for (const file of sourceFiles) {
  const rel = toPosix(file);
  const lines = readLines(file);
  lines.forEach((line, index) => {
    const row = `${rel}:${index + 1}: ${line.trim()}`;
    if (/HbxPopup[1-4]|HbxPopup/.test(line)) popupRows.push(row);
    if (/\b(paymentStatus|subscriptionStatus|premiumAccess)\b/.test(line)) rawFieldRows.push(row);
    if (/R\$\s*\d|\bmonthlyPrice\b|\bplanPrice\b|\bpriceInCents\b/.test(line)) priceRows.push(row);
    if (rel.startsWith("frontend/src/app/") && rel.endsWith("/page.tsx") && /redirect\(/.test(line)) {
      redirectRows.push(row);
    }
  });
}

addSection("Usos de HbxPopup*", popupRows);
addSection("Campos crus comerciais no frontend", rawFieldRows);
addSection("Possíveis preços hardcoded no frontend", priceRows);
addSection("Redirects em page.tsx", redirectRows);

console.log("HBX Frontend Contract Scan");
console.log("Modo: report-only. Este script nunca falha CI por conta própria.");
console.log("");

for (const section of sections) {
  console.log(`## ${section.title} (${section.rows.length})`);
  if (section.rows.length === 0) {
    console.log("Nenhuma ocorrência.");
  } else {
    for (const row of section.rows) console.log(`- ${row}`);
  }
  console.log("");
}

process.exitCode = 0;
