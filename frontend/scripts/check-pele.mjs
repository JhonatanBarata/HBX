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
//  R8. font-size com medida LITERAL (0.8rem, 12px…) em qualquer CSS/TSX do
//      app — TIPOGRAFIA CENTRAL (31/07): toda letra nasce de um degrau do
//      hbx-theme/typography.css (var(--fz-*)). Era isto que deixava 2.523
//      declarações virarem ~70 tamanhos quase iguais, com diferença de meio
//      pixel entre telas. Falta um tamanho? O degrau nasce no typography.css
//      e a tela usa o var. Isento: o próprio typography.css e o mundo PÚBLICO
//      (landing/portal/site de cliente), que tem cena própria em clamp por
//      viewport e não tem painel de usuário.
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

// R8 — tipografia central. Pega a MEDIDA FIXA literal em qualquer lugar do
// valor (inclusive dentro de calc()/clamp()), tanto em CSS quanto no fontSize
// do TSX. Passam: var(), `font-size: 0`, `inherit`, `1em` (proporção do pai) e
// o miolo em vw de um clamp — texto fluido por viewport é RESPONSIVIDADE, não
// tamanho decidido na tela; o que o fiscal exige é que os LIMITES do clamp
// sejam degraus do sistema.
const MEDIDA_FIXA_RE = /(?<![\w.-])\d[\d.]*\s*(?:px|rem|pt)(?![\w-])/i;
function fontSizeLiteral(line) {
  for (const m of line.matchAll(/font-size\s*:\s*([^;{}\n]*)/gi)) {
    if (MEDIDA_FIXA_RE.test(m[1])) return true;
  }
  // TSX: só o VALOR da propriedade — senão um `padding: "0 8px"` na mesma
  // linha reprovava um fontSize que já era var().
  for (const m of line.matchAll(/fontSize\s*:\s*(["'`])([^"'`]*)\1/g)) {
    if (MEDIDA_FIXA_RE.test(m[2])) return true;
  }
  return /fontSize\s*:\s*\d/.test(line); // número puro em TSX = px
}
// O sistema em si + o mundo público (cena própria, hero em clamp de viewport).
const FONT_SIZE_LITERAL_EXEMPT = [
  /hbx-theme[\\/]typography\.css$/,
  /hbx-theme[\\/]public-entry\.css$/,
  /hbx-theme[\\/]marketing\.css$/,
  /hbx-theme[\\/]rota-site\.css$/,
  /hbx-theme[\\/]tracking-publico\.css$/,
  /app[\\/]page\.client\.tsx$/,
  /app[\\/]trabalhe-conosco[\\/]/,
];

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

// ─── R9 e R10 — as duas catracas de LAYOUT (01/08/2026) ────────────────────
//
// POR QUE ELAS PRECISAM EXISTIR, em uma medida:
//   tipografia foi centralizada e PEGOU  — 2.523 declarações viraram 18 degraus
//   espaçamento foi centralizado e MORREU — 3.280 px literais contra 233 usos
//                                           do token = 6,6% de adoção
// Mesmo autor, mesma casa, mesma intenção. A única diferença entre os dois é
// que tipografia ganhou um fiscal (R8) e espaçamento não. Token sem fiscal é
// decoração; é essa a lição que estas duas regras existem para não deixar
// esquecer.
//
// R9  padding/margin/gap em px literal fora do spacing.css. O sistema tem uma
//     escada de 4px pronta (--space-1 … --space-16) e ela é ignorada em 93%
//     dos casos. Ritmo quebrado é o que o olho lê como amador mesmo sem saber
//     nomear.
//
// R10 `height` TRAVADO em px numa folha de tela. É a fonte dos defeitos
//     ESMAGADOS que o fiscal de runtime mede: a caixa foi medida para uma
//     letra que o usuário pode aumentar até 150% no painel de tipografia, e
//     quando ele aumenta a segunda linha é decapitada. `min-height` passa —
//     ele cresce junto. O que reprova é a altura que se recusa a crescer.
//
// NÃO EXISTE R11 (nowrap sem saída de corte) DE PROPÓSITO. Seria uma
// aproximação estática pior que a medição que já temos: tests/e2e/
// design-system.spec.ts abre a tela de verdade, com dado hostil, e pergunta a
// cada elemento se o texto cabe. Regra estática que erra onde a medição
// acerta só ensina o time a ignorar o fiscal.
//
// AS DUAS NASCEM COMO CATRACA, não como trava. Uma regra que reprova 3.280
// linhas no primeiro dia é desligada na primeira sexta-feira — e aí não sobra
// nem a regra nem o hábito. Catraca só anda para um lado: o número de hoje
// vira o teto de amanhã, e quando alguém melhora, o teto desce sozinho.
const SPACING_ALLOWED = [
  /hbx-theme[\\/]spacing\.css$/,
  /hbx-theme[\\/]skeleton\.css$/,
  /hbx-theme[\\/]theme\.css$/,
  /hbx-theme[\\/]typography\.css$/,
  /hbx-theme[\\/]hbx-system\.css$/,
];
// `1px` passa: borda/hairline não é ritmo de espaçamento, é traço. `0` passa.
const SPACING_LITERAL_RE = /(?:^|[;{\s])(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*([^;{}\n]+)/gi;
const MEDIDA_ESPACO_RE = /(?<![\w.-])(?!1px)(\d[\d.]*)\s*px(?![\w-])/i;
// `height: 100%`, `height: auto`, `height: var(--x)` e `min/max-height` passam.
const ALTURA_TRAVADA_RE = /(?:^|[;{\s])height\s*:\s*(\d[\d.]*)px/i;

function contaEspacoLiteral(line) {
  let n = 0;
  for (const m of line.matchAll(SPACING_LITERAL_RE)) {
    if (MEDIDA_ESPACO_RE.test(m[1])) n++;
  }
  return n;
}

const hard = [];
let visualCount = 0;
const visualByFile = new Map();
let espacoCount = 0;
const espacoByFile = new Map();
let alturaCount = 0;
const alturaByFile = new Map();

for (const file of walk(ROOT, [".css"])) {
  const isThemePele = THEME_PELE_RE.test(file);
  const skipR1 = CSS_ALLOWED.some(re => re.test(file));
  const isFontSizeExempt = FONT_SIZE_LITERAL_EXEMPT.some(re => re.test(file));
  const isSpacingExempt = SPACING_ALLOWED.some(re => re.test(file));
  // R1 (cor) é isenta pra arquivos de pele/contrato (CSS_ALLOWED) — mas R5
  // (font-size:px) e R8 (tipografia central) miram justamente em arquivos
  // dessa lista, então não pode dar `continue` cedo demais: eles passam pelo
  // arquivo, só pulam a varredura R1.
  if (skipR1 && !isThemePele && isFontSizeExempt) continue;
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
    if (!isFontSizeExempt && fontSizeLiteral(line)) {
      hard.push(`R8 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
    // R9/R10 — catracas de layout. Contam em TODA folha que não seja o próprio
    // sistema de medida (senão o dicionário reprovaria por definir a palavra).
    if (!isSpacingExempt) {
      const n = contaEspacoLiteral(line);
      if (n > 0) {
        espacoCount += n;
        espacoByFile.set(rel(file), (espacoByFile.get(rel(file)) || 0) + n);
      }
      if (ALTURA_TRAVADA_RE.test(line)) {
        alturaCount++;
        alturaByFile.set(rel(file), (alturaByFile.get(rel(file)) || 0) + 1);
      }
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
  const isFontSizeExempt = FONT_SIZE_LITERAL_EXEMPT.some(re => re.test(file));
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!isFontSizeExempt && fontSizeLiteral(line)) {
      hard.push(`R8 ${rel(file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
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

// A violação dura é IMPRESSA aqui e a reprovação acontece LÁ EMBAIXO, depois
// das catracas. Antes o script saía neste ponto, e o efeito colateral era
// que, com qualquer violação dura aberta, as medidas de catraca nunca eram
// nem calculadas — quem rodasse o fiscal num dia ruim não via o resto do
// diagnóstico. Fiscal informa tudo que mediu, depois decide.
if (hard.length) {
  console.error("\n[check-pele] VIOLAÇÃO DURA — visual fora do design system:");
  for (const v of hard.slice(0, 30)) console.error("  " + v);
  if (hard.length > 30) console.error(`  … e mais ${hard.length - 30}.`);
  console.error("\nCor/estilo é só via token (hbx-theme). Build reprovado.");
}

// ─── AS CATRACAS ───────────────────────────────────────────────────────────
// Três medidas, mesma mecânica: o número de hoje é o teto de amanhã. Subiu,
// reprova; desceu, o teto desce junto e não volta. Nenhuma delas exige zero
// no primeiro dia — exigir zero de uma dívida de um ano é como pedir demissão
// da regra.
const CATRACAS = [
  {
    chave: "tsxVisualStyleProps",
    valor: visualCount,
    porArquivo: visualByFile,
    rotulo: "styles visuais inline em TSX",
    conselho: "Não se adiciona visual em tela — use classe central/utility.",
  },
  {
    chave: "cssSpacingLiteral",
    valor: espacoCount,
    porArquivo: espacoByFile,
    rotulo: "padding/margin/gap em px literal (R9)",
    conselho: "O sistema tem a escada de 4px pronta: var(--space-1 … --space-16).",
  },
  {
    chave: "cssFixedHeight",
    valor: alturaCount,
    porArquivo: alturaByFile,
    rotulo: "height travado em px (R10)",
    conselho: "Troque por min-height: a caixa precisa crescer quando a letra cresce.",
  },
];

let salvos = null;
if (existsSync(BASELINE_PATH)) {
  try { salvos = JSON.parse(readFileSync(BASELINE_PATH, "utf8")); } catch { salvos = null; }
}
salvos = salvos && typeof salvos === "object" ? salvos : {};

const proximos = {};
const resumo = [];
let estourou = false;

for (const c of CATRACAS) {
  const teto = typeof salvos[c.chave] === "number" ? salvos[c.chave] : null;
  if (teto === null) {
    proximos[c.chave] = c.valor;
    resumo.push(`${c.rotulo}: ${c.valor} (catraca nova)`);
    continue;
  }
  if (c.valor > teto) {
    estourou = true;
    const top = [...c.porArquivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.error(`\n[check-pele] CATRACA ESTOUROU — ${c.rotulo}: ${c.valor} (teto: ${teto}).`);
    console.error(c.conselho + " Piores arquivos:");
    for (const [f, n] of top) console.error(`  ${n}\t${f}`);
    proximos[c.chave] = teto;
  } else {
    proximos[c.chave] = Math.min(c.valor, teto);
    resumo.push(`${c.rotulo}: ${c.valor}/${teto}${c.valor < teto ? " ↓" : ""}`);
  }
}

// Grava só quando NADA reprovou: corrida vermelha nunca afrouxa teto, nem nas
// medidas que por acaso melhoraram na mesma passada.
if (!estourou && !hard.length && JSON.stringify(proximos) !== JSON.stringify(salvos)) {
  writeFileSync(BASELINE_PATH, JSON.stringify(proximos, null, 2) + "\n");
}
if (resumo.length) console.log(`[check-pele] catracas: ${resumo.join(" · ")}`);
if (estourou || hard.length) process.exit(1);
console.log("[check-pele] ok — 0 violações duras.");
