#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const topbarPath = path.join(repoRoot, "frontend", "src", "components", "TopBar.tsx");
const componentTargetPath = path.join(repoRoot, "frontend", "src", "components", "TopbarCommandCarousel.tsx");
const componentSourcePath = path.join(__dirname, "TopbarCommandCarousel.tsx");

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function findMatchingClosingTag(source, startIndex, tagName) {
  let index = startIndex;
  let depth = 0;

  while (index < source.length) {
    const nextOpen = source.indexOf(`<${tagName}`, index);
    const nextClose = source.indexOf(`</${tagName}>`, index);

    if (nextOpen === -1 && nextClose === -1) break;

    if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
      const after = source[nextOpen + tagName.length + 1];
      if (after === " " || after === ">" || after === "\n" || after === "\t") {
        depth += 1;

        const openEnd = source.indexOf(">", nextOpen);
        if (openEnd === -1) fail(`Não consegui fechar a tag <${tagName}>.`);
        const openTag = source.slice(nextOpen, openEnd + 1);
        if (/\/\s*>$/.test(openTag)) depth -= 1;

        index = openEnd + 1;
        continue;
      }
    }

    if (nextClose !== -1) {
      depth -= 1;
      index = nextClose + tagName.length + 3;
      if (depth === 0) return index;
      continue;
    }

    index += 1;
  }

  return -1;
}

function removeJsxButtonBlocksWithClass(source, className) {
  let output = source;
  let guard = 0;

  while (output.includes(className) && guard < 20) {
    guard += 1;
    const needleIndex = output.indexOf(className);
    const buttonStart = output.lastIndexOf("<button", needleIndex);

    if (buttonStart === -1) {
      break;
    }

    const tagEnd = output.indexOf(">", buttonStart);
    if (tagEnd === -1 || tagEnd < needleIndex) {
      break;
    }

    const buttonEnd = findMatchingClosingTag(output, buttonStart, "button");
    if (buttonEnd === -1) {
      break;
    }

    const lineStart = output.lastIndexOf("\n", buttonStart) + 1;
    const lineEnd = output.indexOf("\n", buttonEnd);
    output =
      output.slice(0, lineStart) +
      output.slice(lineEnd === -1 ? buttonEnd : lineEnd + 1);
  }

  return output;
}

if (!fs.existsSync(topbarPath)) {
  fail(`Não achei o TopBar.tsx em: ${topbarPath}\nRode este script na raiz do repo HBX.`);
}

if (!fs.existsSync(componentSourcePath)) {
  fail(`Não achei o TopbarCommandCarousel.tsx ao lado deste instalador: ${componentSourcePath}`);
}

fs.copyFileSync(componentSourcePath, componentTargetPath);
console.log(`✅ Componente criado/atualizado: ${componentTargetPath}`);

const original = fs.readFileSync(topbarPath, "utf8");
let next = original;

if (!next.includes('import TopbarCommandCarousel from "./TopbarCommandCarousel";')) {
  const anchor = 'import WhatsAppOperationalDialog from "./WhatsAppOperationalDialog";';
  if (!next.includes(anchor)) {
    fail("Não achei o import do WhatsAppOperationalDialog para encaixar o import novo.");
  }
  next = next.replace(anchor, `${anchor}\nimport TopbarCommandCarousel from "./TopbarCommandCarousel";`);
}

const startToken = '<div className="hbx-command-center__body">';
const startIndex = next.indexOf(startToken);
if (startIndex === -1) {
  fail('Não achei <div className="hbx-command-center__body">. Talvez você já tenha alterado esse trecho.');
}

const endIndex = findMatchingClosingTag(next, startIndex, "div");
if (endIndex === -1) {
  fail("Achei o começo do hbx-command-center__body, mas não consegui achar o fechamento dele.");
}

const lineStart = next.lastIndexOf("\n", startIndex) + 1;
const indent = next.slice(lineStart, startIndex);
const replacement = `${indent}<div className="hbx-command-center__body">
${indent}  <TopbarCommandCarousel
${indent}    slides={billboardSlides}
${indent}    engines={hbxEngines}
${indent}    onNavigate={(href) => router.push(href)}
${indent}  />
${indent}</div>`;

next = next.slice(0, startIndex) + replacement + next.slice(endIndex);

// Remove as setas antigas do carrossel antigo, caso estejam fora do body.
// O componente novo já tem as próprias setas e bolinhas.
next = removeJsxButtonBlocksWithClass(next, "hbx-command-carouselNav");

if (!next.includes("TopbarCommandCarousel")) {
  fail("Algo deu errado: o TopbarCommandCarousel não apareceu no TopBar.tsx final.");
}

const backupPath = `${topbarPath}.backup-carrossel-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.writeFileSync(backupPath, original, "utf8");
fs.writeFileSync(topbarPath, next, "utf8");

console.log(`✅ Backup salvo: ${backupPath}`);
console.log("✅ TopBar.tsx atualizado sem você precisar achar o fechamento da div.");
console.log("\nAgora rode:");
console.log("  cd frontend");
console.log("  npm run lint");
console.log("  npm run build\n");
