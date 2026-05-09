#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const topbarPath = path.join(repoRoot, "frontend", "src", "components", "TopBar.tsx");
const componentSourcePath = path.join(__dirname, "TopbarCommandCarousel.compact.tsx");
const componentTargetPath = path.join(repoRoot, "frontend", "src", "components", "TopbarCommandCarousel.tsx");

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(topbarPath)) fail(`Não achei ${topbarPath}. Rode na raiz do repo.`);
if (!fs.existsSync(componentSourcePath)) fail(`Não achei ${componentSourcePath}. Extraia o zip inteiro.`);

fs.copyFileSync(componentSourcePath, componentTargetPath);

let source = fs.readFileSync(topbarPath, "utf8");
const original = source;

if (!source.includes('import TopbarCommandCarousel from "./TopbarCommandCarousel";')) {
  const anchor = 'import WhatsAppOperationalDialog from "./WhatsAppOperationalDialog";';
  if (!source.includes(anchor)) fail("Não achei o import do WhatsAppOperationalDialog.");
  source = source.replace(anchor, `${anchor}\nimport TopbarCommandCarousel from "./TopbarCommandCarousel";`);
}

source = source.replace(/engines=\{hbxEngines\}\s*/g, "engineCards={hbxEngineGroupCards}\n");
source = source.replace(/engines=\{normalizedScraping\.engines\}\s*/g, "engineCards={hbxEngineGroupCards}\n");

source = source.replace(
  /<TopbarCommandCarousel\s+slides=\{billboardSlides\}\s+onNavigate=\{\(href\) => router\.push\(href\)\}\s*\/>/g,
  `<TopbarCommandCarousel
                slides={billboardSlides}
                engineCards={hbxEngineGroupCards}
                onNavigate={(href) => router.push(href)}
              />`
);

function findMatchingClosingTag(text, startIndex, tagName) {
  let index = startIndex;
  let depth = 0;
  while (index < text.length) {
    const open = text.indexOf(`<${tagName}`, index);
    const close = text.indexOf(`</${tagName}>`, index);
    if (open === -1 && close === -1) break;
    if (open !== -1 && (close === -1 || open < close)) {
      const end = text.indexOf(">", open);
      if (end === -1) return -1;
      depth += /\/\s*>$/.test(text.slice(open, end + 1)) ? 0 : 1;
      index = end + 1;
      continue;
    }
    if (close !== -1) {
      depth -= 1;
      index = close + tagName.length + 3;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function removeButtonClass(text, className) {
  let out = text;
  let guard = 0;
  while (out.includes(className) && guard < 30) {
    guard += 1;
    const idx = out.indexOf(className);
    const start = out.lastIndexOf("<button", idx);
    if (start === -1) break;
    const end = findMatchingClosingTag(out, start, "button");
    if (end === -1) break;
    const lineStart = out.lastIndexOf("\n", start) + 1;
    const lineEnd = out.indexOf("\n", end);
    out = out.slice(0, lineStart) + out.slice(lineEnd === -1 ? end : lineEnd + 1);
  }
  return out;
}

source = removeButtonClass(source, "hbx-command-carouselNav");

if (source.includes("hbxEngines") || source.includes("normalizedScraping.engines")) {
  fail("Ainda existe hbxEngines ou normalizedScraping.engines no TopBar.tsx.");
}
if (!source.includes("engineCards={hbxEngineGroupCards}")) {
  fail("Não achei engineCards={hbxEngineGroupCards} no TopBar.tsx após correção.");
}

const backupPath = `${topbarPath}.backup-compact-carousel-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.writeFileSync(backupPath, original, "utf8");
fs.writeFileSync(topbarPath, source, "utf8");

console.log("✅ Carrossel compactado e colado no topo.");
console.log("✅ Setas antigas removidas/ocultas.");
console.log("✅ Frota HBX garantida via engineCards={hbxEngineGroupCards}.");
console.log(`✅ Backup salvo: ${backupPath}`);
console.log("\nRode agora:");
console.log("  cd frontend");
console.log("  npm run build\n");
