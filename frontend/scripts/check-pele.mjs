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
//
// APK (EntregaShell) — PR22072026-APK-PROFISSIONAL, sprint C6:
//  R6. Hex solto em EntregaShell/app/src/**.{css,js,html} — SEM a isenção de
//      neutros acima (lá até #fff/#000 tem que nascer de var()).
//  R7. `style="..."` inline em EntregaShell/app/src/**.{css,js,html}, com UMA
//      isenção (d), abaixo.
// Isenções do R6 (e a (d), do R7 — DECLARADAS aqui porque foi
// exatamente a falta dessa trava que deixou 45 hex entrarem sem ninguém ver,
// ver docs/PLANEJAMENTOS/PR22072026-APK-PROFISSIONAL/FASE2-VARREDURA-DE-CONTRATO.md):
//  (a) os blocos de definição de token PUROS — `:root { ... }` e
//      `:root[data-theme="dark"] { ... }` — de main/assets/app/app.css. NÃO
//      cobre seletores compostos tipo `:root[data-theme="dark"] .chip{...}`:
//      aquilo é regra de componente, não dicionário de token.
//  (b) a paleta da CASCA DE ABERTURA declarada no `:root{...}` do <style> dos
//      dois opening.html (oobe-casca-isolada — visual próprio, não usa token
//      do app).
//  (c) `<meta name="theme-color" content="#...">` — é atributo de HTML, não
//      aceita var(); a isenção vale em qualquer arquivo (mesma limitação
//      técnica), embora os casos hoje sejam os 2 opening.html + os 2
//      index.html, todos comentados no próprio arquivo (menos os index.html,
//      que não são deste worker — reportar se algum ainda não tiver).
//  (d) R7: `style=` que só entrega VALOR CALCULADO pro CSS — variável CSS
//      (`--nav-count:${n}`) ou uma das propriedades geométricas de estado
//      (width/height/transform/stroke-dashoffset/stroke-dasharray). Isto não
//      é "aparência decidida no lugar de uso", é DADO chegando na folha: a
//      barra de progresso não tem como virar classe, o número muda a cada
//      render. O pecado que o R7 existe pra pegar é cor/borda/fonte/sombra
//      cravada no HTML — essas continuam reprovando aqui dentro também.
//      Sem esta isenção a trava nasceria vermelha PARA SEMPRE nos 4 usos
//      legítimos que já existem, e trava que sempre reprova vira ruído que
//      todo mundo aprende a ignorar — que é como os 45 hex entraram.
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

// APK (EntregaShell) — ver bloco de comentário no topo do arquivo (R6/R7).
const ENTREGA_ROOT = join(process.cwd(), "..", "EntregaShell", "app", "src");
const ENTREGA_EXTS = [".css", ".js", ".html"];
const ENTREGA_APP_CSS_RE = /assets[\\/]app[\\/]app\.css$/;
const ENTREGA_OPENING_HTML_RE = /assets[\\/]app[\\/]opening\.html$/;
const ENTREGA_TOKEN_BLOCK_OPEN_RE = /^:root(\[data-theme=["']dark["']\])?\s*\{/;
const ENTREGA_META_THEME_RE = /<meta\s+name=["']theme-color["']/;
const ENTREGA_HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const ENTREGA_STYLE_ATTR_RE = /[\s"'`]style\s*=\s*["']/;
// Isenção (d) do R7 — ver topo. Captura o MIOLO de cada style="…" da linha
// para julgar declaração por declaração, em vez de aprovar/reprovar a linha
// inteira: `style="width:${x}%;color:#f00"` tem que continuar reprovando.
const ENTREGA_STYLE_ATTR_BODY_RE = /[\s"'`]style\s*=\s*"([^"]*)"|[\s"'`]style\s*=\s*'([^']*)'/g;
const ENTREGA_STYLE_DYNAMIC_PROPS = new Set([
  "width", "height", "transform", "stroke-dashoffset", "stroke-dasharray",
]);
// true = todas as declarações do style são valor calculado (variável CSS ou
// propriedade geométrica de estado). Vazio/ilegível reprova: na dúvida, pega.
function entregaStyleIsDynamicOnly(body) {
  const decls = String(body).split(";").map(d => d.trim()).filter(Boolean);
  if (!decls.length) return false;
  return decls.every(decl => {
    const prop = decl.slice(0, decl.indexOf(":")).trim().toLowerCase();
    if (!prop) return false;
    return prop.startsWith("--") || ENTREGA_STYLE_DYNAMIC_PROPS.has(prop);
  });
}

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

// APK (EntregaShell) — R6 (hex) + R7 (style="" inline), ver comentário no topo.
// NÃO faz parte do walk de `src/frontend`: EntregaShell é uma árvore irmã
// (../EntregaShell a partir de frontend/, onde este script roda).
if (existsSync(ENTREGA_ROOT)) {
  for (const file of walk(ENTREGA_ROOT, ENTREGA_EXTS)) {
    const relFile = rel(file);
    const hasTokenException = ENTREGA_APP_CSS_RE.test(file) || ENTREGA_OPENING_HTML_RE.test(file);
    let depth = 0;
    let exemptDepth = null; // != null enquanto dentro de um bloco de token PURO (isenção a/b)
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
      const trimmed = line.trim();
      const opensTokenBlock = hasTokenException && exemptDepth === null && ENTREGA_TOKEN_BLOCK_OPEN_RE.test(trimmed);
      const lineIsExempt = opensTokenBlock || exemptDepth !== null;
      for (const ch of line) {
        if (ch === "{") {
          depth++;
          if (opensTokenBlock && exemptDepth === null) exemptDepth = depth;
        } else if (ch === "}") {
          if (exemptDepth !== null && depth === exemptDepth) exemptDepth = null;
          depth--;
        }
      }
      // R7 primeiro — style="" inline não tem isenção nenhuma, nem dentro do
      // bloco de token (lá é só declaração de --var, não teria por quê ter).
      if (ENTREGA_STYLE_ATTR_RE.test(line)) {
        // Isenção (d): só passa se TODO style= da linha for valor calculado.
        const corpos = [...line.matchAll(ENTREGA_STYLE_ATTR_BODY_RE)].map(m => m[1] ?? m[2] ?? "");
        const soDinamico = corpos.length > 0 && corpos.every(entregaStyleIsDynamicOnly);
        if (!soDinamico) hard.push(`R7 ${relFile}:${i + 1}  ${trimmed.slice(0, 80)}`);
      }
      if (lineIsExempt) return;
      if (ENTREGA_META_THEME_RE.test(line)) return; // isenção (c) — ver topo do arquivo
      for (const m of line.matchAll(ENTREGA_HEX_RE)) {
        hard.push(`R6 ${relFile}:${i + 1}  ${trimmed.slice(0, 80)}`);
        break;
      }
    });
  }
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
