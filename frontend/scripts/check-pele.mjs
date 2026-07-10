// HBX DESIGN SYSTEM — fiscal automático (docs/Rules/FRONTEND.md, 12/06/2026).
// AS 5 LEIS: tokens centrais · componentes centrais · tema só troca tokens ·
// tela sem visual próprio · este check barrando hex/rgba/style visual.
//
// Regras DURAS (reprovam na hora):
//  R1. Cor literal (hex/rgb/hsl) em CSS fora dos arquivos de pele.
//  R2. Cor literal em TSX do app.
//  R3. Valor arbitrário do Tailwind em TSX (ex.: bg-[#0af], text-[rgb(...)]).
//  R5. font-size em px dentro de theme-*.css (pele) — métrica estrutural é
//      ESQUELETO (FRONTEND.md, Lei 1, LEADS-FINAL/01 06/07): pele veste cor/
//      borda/sombra/vidro/radius/fonte, NUNCA tamanho. Meta zero (sem catraca).
// Regra de CATRACA (migração monitorada):
//  R4. style inline com propriedade VISUAL (cor/borda/sombra/fonte/radius)
//      em TSX — contagem NUNCA pode subir; quando cair, o teto desce junto
//      (pele-baseline.json). Meta: ZERO.
//
// Isenções (mundo visual do site público, decisão registrada):
//  - src/app/hbx-theme/skeleton.css, theme.css, theme-*.css (peles/contrato)
//  - src/app/hbx-theme/marketing.css, src/app/page.client.tsx,
//    src/app/trabalhe-conosco/** (landing)
//  - bloco isento explícito: /* pele-allow: motivo */ … /* pele-allow-end */
//    (cena pública em evolução fora dos arquivos acima, ex.: entrada V1.0)
//  - literais neutros: #fff #ffffff #000 #000000
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(process.cwd(), "src");
const BASELINE_PATH = join(process.cwd(), "scripts", "pele-baseline.json");

const CSS_ALLOWED = [
  /hbx-theme[\\/]skeleton\.css$/,
  /hbx-theme[\\/]theme\.css$/,
  /hbx-theme[\\/]theme-[^\\/]+\.css$/,
  /hbx-theme[\\/]marketing\.css$/,
  /hbx-theme[\\/]public-entry\.css$/,
  // Design System Entrega (LOGISTICA-MOBILE): arquivo de TOKEN/pele do app do
  // entregador, escopo [data-skin="entrega"] — mesma categoria isenta das peles
  // (é onde a Lei permite hex). TSX do app fica limpo (só classes .ent-*).
  /hbx-theme[\\/]entrega\.css$/,
  // OOBE (07/07): casca ISOLADA do primeiro acesso — paleta própria dark
  // constante (mock aprovado), padrão mundo-site: NUNCA veste a pele do app.
  // TSX do OOBE fica limpo (só classes .oobe-*/.hbx-oobe).
  /hbx-theme[\\/]oobe\.css$/,
];
const TSX_EXEMPT = [/app[\\/]page\.client\.tsx$/, /app[\\/]trabalhe-conosco[\\/]/];
// Só as PELES de verdade (theme-<nome>.css) — theme.css (base Tailwind) e
// skeleton.css (contrato neutro) ficam de fora: lá é onde a métrica DEVE viver.
const THEME_PELE_RE = /hbx-theme[\\/]theme-[^\\/]+\.css$/;
const NEUTRAL = /^#(fff|ffffff|000|000000)$/i;
const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi;
const ARBITRARY_RE = /(?:^|[\s"'`{])(?:bg|text|border|shadow|fill|stroke|from|to|via|ring|outline|accent|caret|decoration)-\[/;
const VISUAL_PROP_RE = /\b(?:background|backgroundColor|backgroundImage|borderColor|borderRadius|boxShadow|textShadow|fontFamily|backdropFilter|WebkitBackdropFilter|border|borderTop|borderRight|borderBottom|borderLeft|color|outline)\s*:/;
const FONT_SIZE_PX_RE = /font-size\s*:\s*-?\d[\d.]*px/i;

function* walk(dir, ext) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, ext);
    else if (ext.some(e => name.endsWith(e))) yield p;
  }
}
const rel = p => relative(process.cwd(), p).split(sep).join("/");

const hard = [];
let visualCount = 0;
const visualByFile = new Map();

for (const file of walk(ROOT, [".css"])) {
  const isThemePele = THEME_PELE_RE.test(file);
  const skipR1 = CSS_ALLOWED.some(re => re.test(file));
  // R1 (cor) é isenta pra arquivos de pele/contrato (CSS_ALLOWED) — mas R5
  // (font-size:px) mira EXATAMENTE nas peles de verdade, então não pode dar
  // `continue` cedo demais: pele passa pelo arquivo, só pula a varredura R1.
  if (skipR1 && !isThemePele) continue;
  let peleOn = true; // false = dentro de bloco isento (pele-allow … pele-allow-end)
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    // Bloco isento EXPLÍCITO p/ "mundo visual do site público" em evolução (ex.: a
    // ENTRADA V1.0 / portal — cores cinematográficas que ainda mudam). Reversível:
    // ao assentar, remover os marcadores e tokenizar. Regra não engessa evolução.
    if (/pele-allow-end/.test(line)) { peleOn = true; return; }
    if (/pele-allow\b/.test(line)) { peleOn = false; return; }
    if (isThemePele && FONT_SIZE_PX_RE.test(line)) {
      hard.push(`R5 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
    if (skipR1 || !peleOn) return;
    for (const m of line.matchAll(COLOR_RE)) {
      if (m[0].startsWith("#") && NEUTRAL.test(m[0])) continue;
      hard.push(`R1 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
      break;
    }
  });
}

for (const file of walk(ROOT, [".tsx", ".ts"])) {
  if (TSX_EXEMPT.some(re => re.test(file))) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(COLOR_RE)) {
      if (m[0].startsWith("#") && NEUTRAL.test(m[0])) continue;
      hard.push(`R2 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
      break;
    }
    if (ARBITRARY_RE.test(line)) hard.push(`R3 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    if (file.endsWith(".tsx") && VISUAL_PROP_RE.test(line)) {
      visualCount++;
      visualByFile.set(rel(file), (visualByFile.get(rel(file)) || 0) + 1);
    }
  });
}

if (hard.length) {
  console.error("\n[check-pele] VIOLAÇÃO DURA — visual fora do design system:");
  for (const v of hard.slice(0, 30)) console.error("  " + v);
  if (hard.length > 30) console.error(`  … e mais ${hard.length - 30}.`);
  console.error("\nCor/estilo é só via token (hbx-theme). Build reprovado.");
  process.exit(1);
}

let baseline = null;
if (existsSync(BASELINE_PATH)) {
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")).tsxVisualStyleProps; } catch { baseline = null; }
}
if (baseline === null) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ tsxVisualStyleProps: visualCount }, null, 2) + "\n");
  console.log(`[check-pele] baseline da catraca criado: ${visualCount} styles visuais inline em TSX (meta: 0).`);
} else if (visualCount > baseline) {
  const top = [...visualByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.error(`\n[check-pele] CATRACA ESTOUROU: ${visualCount} styles visuais inline (teto: ${baseline}).`);
  console.error("Não se adiciona visual em tela — use classe central/utility. Piores arquivos:");
  for (const [f, n] of top) console.error(`  ${n}\t${f}`);
  process.exit(1);
} else {
  if (visualCount < baseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify({ tsxVisualStyleProps: visualCount }, null, 2) + "\n");
  }
  console.log(`[check-pele] ok — 0 violações duras; catraca: ${visualCount}/${baseline} styles visuais inline (meta 0${visualCount < baseline ? ", teto reapertado" : ""}).`);
}
