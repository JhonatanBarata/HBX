#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const topbarPath = path.join(repoRoot, "frontend", "src", "components", "TopBar.tsx");
const componentSourcePath = path.join(__dirname, "TopbarCommandCarousel.fixed.tsx");
const componentTargetPath = path.join(repoRoot, "frontend", "src", "components", "TopbarCommandCarousel.tsx");

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(topbarPath)) {
  fail(`Não achei TopBar.tsx em ${topbarPath}. Rode na raiz do repo HBX.`);
}

if (!fs.existsSync(componentSourcePath)) {
  fail(`Não achei ${componentSourcePath}. Extraia o zip inteiro na raiz do repo.`);
}

fs.copyFileSync(componentSourcePath, componentTargetPath);

let source = fs.readFileSync(topbarPath, "utf8");
const original = source;

if (!source.includes('import TopbarCommandCarousel from "./TopbarCommandCarousel";')) {
  const anchor = 'import WhatsAppOperationalDialog from "./WhatsAppOperationalDialog";';
  if (!source.includes(anchor)) {
    fail("Não achei o ponto de import do WhatsAppOperationalDialog.");
  }
  source = source.replace(anchor, `${anchor}\nimport TopbarCommandCarousel from "./TopbarCommandCarousel";`);
}

// Corrige a integração errada anterior: TopBar não tem hbxEngines/normalizedScraping.
// O próprio TopBar já tem hbxEngineGroupCards, usado pelo bloco antigo dos motores.
source = source.replace(/engines=\{hbxEngines\}\s*/g, "engineCards={hbxEngineGroupCards}\n");
source = source.replace(/engines=\{normalizedScraping\.engines\}\s*/g, "engineCards={hbxEngineGroupCards}\n");

// Se por algum motivo ainda sobrou uma referência quebrada, para antes de gravar.
if (source.includes("engines={hbxEngines}") || source.includes("normalizedScraping.engines")) {
  fail("Ainda sobrou referência a hbxEngines ou normalizedScraping.engines no TopBar.");
}

const backupPath = `${topbarPath}.backup-fix-engine-cards-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.writeFileSync(backupPath, original, "utf8");
fs.writeFileSync(topbarPath, source, "utf8");

console.log("✅ TopbarCommandCarousel.tsx atualizado.");
console.log("✅ TopBar.tsx corrigido para usar engineCards={hbxEngineGroupCards}.");
console.log(`✅ Backup salvo: ${backupPath}`);
console.log("\nAgora rode:");
console.log("  cd frontend");
console.log("  npm run build\n");
