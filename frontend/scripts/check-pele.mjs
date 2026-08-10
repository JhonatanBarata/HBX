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
//  R11. LEI DA CURVA DUPLA — `var(--motion-*)` + uma segunda curva no mesmo
//      atalho `animation`. Nasce em ZERO (ver bloco próprio, mais abaixo).
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
//  (a) os blocos de definição de token PUROS — `:root { ... }`,
//      `:root[data-theme="dark"] { ... }` e as combinações com
//      `[data-app="..."]` (dicionário do FLAVOR, ex.: o acabamento do HBX
//      Logística em `:root[data-app="logistica"]{...}`) — de
//      main/assets/app/app.css. NÃO cobre seletores compostos tipo
//      `:root[data-theme="dark"] .chip{...}`: aquilo é regra de componente,
//      não dicionário de token.
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
//      A (d) cobre TAMBÉM a declaração cujo valor é SÓ um token puro
//      (`style="color:var(--lime)"`): o pecado que o R7 existe pra pegar é a
//      cor LITERAL cravada no HTML, e token não é literal — é o token, escrito
//      noutro lugar. Some a isso que a ponte não tem onde pôr classe: a única
//      folha do app é o `mock.css`, que é GERADO (isenção f), então uma regra
//      escrita lá some na próxima injeção. Fallback NÃO passa
//      (`var(--x, #f00)`) — seria contrabandear o literal de volta.
//  (e) R6+R7: `vendor/` dentro dos assets (maplibre-gl) — biblioteca de
//      TERCEIRO, entregue minificada. Não é aparência decidida em tela e não
//      tem como nascer de token; código NOSSO nunca mora em vendor/.
//  (f) R6+R7: os arquivos GERADOS (lista `ENTREGA_GERADO`, abaixo). O FISCAL
//      OLHA A FONTE, NUNCA A SAÍDA (decisão do dono, 10/08). Três motivos, e o
//      terceiro é o que decide:
//        1. Em arquivo gerado não existe decisão de aparência pra fiscalizar —
//           a decisão foi tomada na FONTE. `mock.css`/`mock.js`/`index.html`
//           saem inteiros de `docs/mockups/logistica2.0/logistica-2.0.html`
//           (`scripts/casca-injetar.js`); `ponte.js` é a costura de
//           `logistica/ponte-src/*.js` (`scripts/ponte-costurar.js`).
//        2. O conserto lá NÃO GRUDA: a próxima geração apaga. Regra que aponta
//           pra um arquivo onde o conserto some é regra que só ensina a ignorar
//           o fiscal — que é, palavra por palavra, como os 45 hex entraram.
//        3. O gerado JÁ TEM FISCAL PRÓPRIO, e mais duro que este:
//           `scripts/casca-conferir.js` abre as 32 telas × 2 modos e compara
//           PIXEL A PIXEL contra o mock; `scripts/ponte-conferir.js` reprova
//           quando o gerado deixa de ser a costura exata da fonte.
//      O que isto NÃO é: um perdão pro mock. O mock tem design system PRÓPRIO
//      (dicionário em `.app{...}`, não em `:root{}`) e é o front do APK por
//      ordem do dono de 06/08 — "entra IGUAL, sem uma linha reescrita". A
//      disciplina de cor dele é a revisão de design, não este script. Medido em
//      10/08: das 240 linhas com hex do `mock.css`, 81 declaram token e 159 são
//      uso direto em regra de componente — nem esticar a isenção (a) pro
//      seletor `.app` resolveria.
//  (g) R6: hex dentro de COMENTÁRIO `/* … */`, e hex que é o FALLBACK de uma
//      leitura de token — `tinta('--map-cena-rua', '#59677a')`. Comentário não
//      pinta nada (os 2 casos da ponte são prosa explicando uma medição de
//      contraste). E o fallback é o oposto do pecado do R6: a cor NASCE do
//      token, o hex só existe pro instante em que o token ainda não está no
//      DOM — canvas e `paint` do MapLibre não aceitam `var()`, então ou tem
//      fallback ou a rua nasce preta. É a mesma forma que o R11 já chama de
//      "o jeito CERTO" (`var(--enter-duration, 180ms)`).
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
const ENTREGA_TOKEN_BLOCK_OPEN_RE = /^:root(\[data-(?:theme|app)=["'][\w-]+["']\])*\s*\{/;
const ENTREGA_VENDOR_RE = /[\\/]vendor[\\/]/; // isenção (e) — ver topo
// Isenção (f) — SAÍDA de gerador, ver topo. Cada linha traz quem a escreve;
// arquivo novo só entra aqui junto com o gerador dele.
const ENTREGA_GERADO = [
  /logistica[\\/]assets[\\/]app[\\/]mock\.css$/,   // scripts/casca-injetar.js
  /logistica[\\/]assets[\\/]app[\\/]mock\.js$/,    // scripts/casca-injetar.js
  /logistica[\\/]assets[\\/]app[\\/]index\.html$/, // scripts/casca-injetar.js
  /logistica[\\/]assets[\\/]app[\\/]ponte\.js$/,   // scripts/ponte-costurar.js
];
// Isenção (g) — hex que é FALLBACK de leitura de token. Tira só o hex; o resto
// da linha continua sendo varrido (um segundo hex solto ao lado ainda reprova).
const ENTREGA_TOKEN_FALLBACK_RE = /\btinta\(\s*(['"])--[\w-]+\1\s*,\s*['"]#[0-9a-fA-F]{3,8}['"]/g;
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
// Token PURO, sem fallback: `var(--lime)` passa, `var(--lime, #f00)` não.
const ENTREGA_VAR_PURA_RE = /^var\(\s*--[\w-]+\s*\)$/;
// true = todas as declarações do style são valor calculado (variável CSS,
// propriedade geométrica de estado) ou um token puro. Vazio/ilegível reprova:
// na dúvida, pega.
function entregaStyleIsDynamicOnly(body) {
  const decls = String(body).split(";").map(d => d.trim()).filter(Boolean);
  if (!decls.length) return false;
  return decls.every(decl => {
    const corte = decl.indexOf(":");
    const prop = decl.slice(0, corte).trim().toLowerCase();
    if (!prop) return false;
    if (prop.startsWith("--") || ENTREGA_STYLE_DYNAMIC_PROPS.has(prop)) return true;
    return ENTREGA_VAR_PURA_RE.test(decl.slice(corte + 1).trim()); // isenção (d), token puro
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

// ─── R11 — LEI DA CURVA DUPLA (04/08/2026) ─────────────────────────────────
//
// `--motion-fast/base/slow` NÃO é só duração: o valor traz tempo E curva no
// mesmo token (`340ms cubic-bezier(0.22, 1, 0.36, 1)` em casca-modern.css,
// `180ms ease` em skeleton.css, idem theme-gerado.css). Somar uma curva depois
// dele no atalho — `animation: nome var(--motion-base) var(--ease-out-quint)
// both` — entrega DUAS timing-functions para a mesma animação.
//
// E o estrago é PIOR que uma declaração ignorada. Atalho com `var()` é VÁLIDO
// na hora de ler a folha, então GANHA a cascata; só depois, na substituição
// dos tokens, vira inválido — e a regra manda a propriedade para o valor
// INICIAL (`animation-name: none`). Ou seja: além de não animar, ela APAGA a
// animação que uma regra anterior já entregava. Zero linha no console, regra
// bonita no DevTools; a prova só aparece medida com getComputedStyle. Custou
// 12 animações mortas em silêncio (transitions, concierge, bot-aviso,
// bot-builder, bot-flow, bot-terms, kit, screens, skeleton e 2 *.module.css de
// componente) — por isso a varredura é do frontend INTEIRO, não do hbx-theme.
//
// O que PASSA, de propósito:
//  - `transition:` — a sintaxe dela aceita duração + curva; não tem o defeito.
//  - fallback de duração LITERAL (`var(--enter-duration, 180ms)` em
//    transitions.css) — é justamente o jeito CERTO de deixar curva no atalho.
//  - token de duração pura sozinho (`var(--ent-motion)` em entrega.css,
//    `var(--casca-motion-dur)` + `var(--casca-motion-ease)` em casca.css).
//
// Nasce em ZERO (os 12 já foram corrigidos): aqui a catraca não é dívida em
// migração, é linha de contenção — token sem fiscal é decoração, e este defeito
// não avisa quando volta.
//
// O R11 tem DUAS cabeças, porque o veneno tem duas formas (a 2ª custou a
// travessia site→login→sistema, instantânea em silêncio até 04/08):
//  (a) ATALHO — `animation: nome var(--motion-base) var(--ease-out-quint)`.
//      Duas curvas; morre como descrito acima.
//  (b) LONGHAND — `animation-duration: var(--motion-slow)`. A propriedade só
//      aceita <time> e recebe "560ms cubic-bezier(...)": mesma invalidez na
//      substituição, mesmo tombo pro valor inicial, mesmo silêncio. Aqui NÃO
//      precisa de segunda curva pra reprovar — a mera presença do token
//      composto numa propriedade de uma parte só JÁ é o defeito. Vale para
//      `transition-*` também: `transition-duration: var(--motion-fast)` quebra
//      igual (o atalho `transition:` é que aceita os dois, e esse passa).
//      A cura é o token de duração pura (`--motion-slow-dur`, skeleton.css).
const CURVA_DECL_RE = /(?<![\w-])(?:-(?:webkit|moz|ms|o)-)?animation\s*:\s*([^;{}]*)/gi;
// Cabeça (b): propriedades que aceitam SÓ UMA das duas partes do token.
const UMA_PARTE_RE = /(?<![\w-])(?:-(?:webkit|moz|ms|o)-)?(?:animation|transition)-(?:duration|delay|timing-function)\s*:\s*([^;{}]*)/gi;
// Só os 3 tokens que embutem curva. `--casca-motion-dur`/`--ent-motion` não
// batem aqui (não começam em `--motion-`) — e são duração pura mesmo.
// A fronteira é `(?![\w-])`, NÃO `\b`: em `--motion-slow-dur` existe fronteira
// de palavra entre `slow` e `-`, então `\b` casava o token de DURAÇÃO PURA como
// se fosse o composto e reprovava a própria cura. (O fiscal pegou isso na
// primeira rodada depois da correção — vale a piada e vale a lição.)
const MOTION_TOKEN_FONTE = "var\\(\\s*--motion-(?:fast|base|slow)(?![\\w-])";
const MOTION_TOKEN_RE = new RegExp(MOTION_TOKEN_FONTE, "i");
// Segunda curva: token de easing (qualquer `--*ease*`), função ou palavra-chave.
const CURVA_RE = /var\(\s*--[\w-]*ease[\w-]*|(?<![\w-])(?:cubic-bezier|steps|linear)\s*\(|(?<![\w-])(?:ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)(?![\w-])/i;

// Tira a referência `var(--motion-*)` inteira (com o fallback dela) antes de
// procurar a segunda curva — senão `var(--motion-base, 180ms ease)`, que é
// legítimo, se acusaria sozinho.
function semTokenDeMotion(valor) {
  const re = new RegExp(MOTION_TOKEN_FONTE, "gi");
  let fora = "", cursor = 0, m;
  while ((m = re.exec(valor))) {
    fora += valor.slice(cursor, m.index);
    let i = valor.indexOf("(", m.index), nivel = 0;
    for (; i < valor.length; i++) {
      if (valor[i] === "(") nivel++;
      else if (valor[i] === ")" && --nivel === 0) { i++; break; }
    }
    cursor = i;
    re.lastIndex = i;
  }
  return fora + valor.slice(cursor);
}
// O atalho aceita LISTA (`animation: a var(--motion-base) both, b 2s ease`).
// Cada item é uma animação independente: julgar o valor inteiro de uma vez
// acusaria o `2s ease` legítimo do segundo por causa do token do primeiro.
function itensDoAtalho(valor) {
  const itens = [];
  let nivel = 0, atual = "";
  for (const ch of valor) {
    if (ch === "(") nivel++;
    else if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { itens.push(atual); atual = ""; continue; }
    atual += ch;
  }
  itens.push(atual);
  return itens;
}
// Comentário vira espaço (e não some): o número da linha continua batendo.
const semComentario = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
const temCurvaDupla = item => MOTION_TOKEN_RE.test(item) && CURVA_RE.test(semTokenDeMotion(item));

function achaCurvaDupla(texto, cabecas) {
  const achados = [];
  const limpo = semComentario(texto);
  for (const { re, tag, culpado } of cabecas) {
    for (const m of limpo.matchAll(re)) {
      const valor = m[1] ?? "";
      if (!MOTION_TOKEN_RE.test(valor)) continue;
      if (!culpado(valor)) continue;
      const linha = texto.slice(0, m.index).split("\n").length;
      achados.push({ linha, tag, trecho: valor.trim().replace(/\s+/g, " ").slice(0, 76) });
    }
  }
  return achados.sort((a, b) => a.linha - b.linha);
}
// (a) atalho: só reprova se houver uma SEGUNDA curva junto do token.
// (b) uma-parte: o token composto sozinho já reprova.
const CABECAS_CSS = [
  { re: CURVA_DECL_RE, tag: "R11a", culpado: v => itensDoAtalho(v).some(temCurvaDupla) },
  { re: UMA_PARTE_RE, tag: "R11b", culpado: () => true },
];
// TSX: só o VALOR entre aspas (`style={{ animation: "…" }}`). Varrer até o `;`
// como no CSS arrastaria as propriedades vizinhas do objeto JS junto. Em camelCase
// não existe atalho vs longhand no mesmo nome, então as duas cabeças aqui são
// separadas pelo próprio nome da propriedade.
const CABECAS_TSX = [
  {
    re: /(?<![\w$])animation\s*:\s*(?:["'`])([^"'`]*)(?:["'`])/g,
    tag: "R11a",
    culpado: v => itensDoAtalho(v).some(temCurvaDupla),
  },
  {
    re: /(?<![\w$])(?:animation|transition)(?:Duration|Delay|TimingFunction)\s*:\s*(?:["'`])([^"'`]*)(?:["'`])/g,
    tag: "R11b",
    culpado: () => true,
  },
];

const hard = [];
let visualCount = 0;
const visualByFile = new Map();
let espacoCount = 0;
const espacoByFile = new Map();
let alturaCount = 0;
const alturaByFile = new Map();
let curvaCount = 0;
const curvaByFile = new Map();
const curvaDetalhes = [];

function contaCurvaDupla(file, texto, cabecas) {
  for (const h of achaCurvaDupla(texto, cabecas)) {
    curvaCount++;
    curvaByFile.set(rel(file), (curvaByFile.get(rel(file)) || 0) + 1);
    curvaDetalhes.push(`${h.tag} ${rel(file)}:${h.linha}  ${h.trecho}`);
  }
}

for (const file of walk(ROOT, [".css"])) {
  const isThemePele = THEME_PELE_RE.test(file);
  const skipR1 = CSS_ALLOWED.some(re => re.test(file));
  const isFontSizeExempt = FONT_SIZE_LITERAL_EXEMPT.some(re => re.test(file));
  const isSpacingExempt = SPACING_ALLOWED.some(re => re.test(file));
  const texto = readFileSync(file, "utf8");
  // R11 antes de qualquer isenção: curva dupla não é escolha de estilo, é
  // DEFEITO — nem a pele nem o mundo público têm direito a ela. E é declaração
  // que pode quebrar em várias linhas (ver casca.css), então lê o texto todo.
  contaCurvaDupla(file, texto, CABECAS_CSS);
  // R1 (cor) é isenta pra arquivos de pele/contrato (CSS_ALLOWED) — mas R5
  // (font-size:px) e R8 (tipografia central) miram justamente em arquivos
  // dessa lista, então não pode dar `continue` cedo demais: eles passam pelo
  // arquivo, só pulam a varredura R1.
  if (skipR1 && !isThemePele && isFontSizeExempt) continue;
  let peleOn = true; // false = dentro de bloco isento (pele-allow … pele-allow-end)
  texto.split(/\r?\n/).forEach((line, i) => {
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
  const textoTsx = readFileSync(file, "utf8");
  // R11 também no TSX: style inline pode montar o mesmo atalho envenenado.
  // Fora do TSX_EXEMPT porque a isenção de lá é de COR (landing), não de bug.
  contaCurvaDupla(file, textoTsx, CABECAS_TSX);
  if (TSX_EXEMPT.some(re => re.test(file))) continue;
  const isFontSizeExempt = FONT_SIZE_LITERAL_EXEMPT.some(re => re.test(file));
  const lines = textoTsx.split(/\r?\n/);
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
    if (ENTREGA_VENDOR_RE.test(file)) continue; // isenção (e) — terceiro
    if (ENTREGA_GERADO.some(re => re.test(file))) continue; // isenção (f) — saída de gerador
    const relFile = rel(file);
    const hasTokenException = ENTREGA_APP_CSS_RE.test(file) || ENTREGA_OPENING_HTML_RE.test(file);
    let depth = 0;
    let exemptDepth = null; // != null enquanto dentro de um bloco de token PURO (isenção a/b)
    // Isenção (g): comentário `/* … */` vira espaço ANTES de qualquer regra —
    // e não some, pra o número da linha continuar batendo. De quebra conserta
    // uma armadilha velha: `{` dentro de comentário desalinhava a contagem de
    // profundidade do bloco de token. O texto ORIGINAL é o que aparece no
    // recado; quem é julgado é o texto sem comentário.
    const original = readFileSync(file, "utf8").split(/\r?\n/);
    semComentario(original.join("\n")).split(/\r?\n/).forEach((linhaLimpa, i) => {
      const trimmed = (original[i] ?? "").trim();
      const opensTokenBlock = hasTokenException && exemptDepth === null && ENTREGA_TOKEN_BLOCK_OPEN_RE.test(linhaLimpa.trim());
      const lineIsExempt = opensTokenBlock || exemptDepth !== null;
      for (const ch of linhaLimpa) {
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
      if (ENTREGA_STYLE_ATTR_RE.test(linhaLimpa)) {
        // Isenção (d): só passa se TODO style= da linha for valor calculado.
        const corpos = [...linhaLimpa.matchAll(ENTREGA_STYLE_ATTR_BODY_RE)].map(m => m[1] ?? m[2] ?? "");
        const soDinamico = corpos.length > 0 && corpos.every(entregaStyleIsDynamicOnly);
        if (!soDinamico) hard.push(`R7 ${relFile}:${i + 1}  ${trimmed.slice(0, 80)}`);
      }
      if (lineIsExempt) return;
      if (ENTREGA_META_THEME_RE.test(linhaLimpa)) return; // isenção (c) — ver topo do arquivo
      // Isenção (g): o hex que é fallback de leitura de token sai da varredura.
      const semFallback = linhaLimpa.replace(ENTREGA_TOKEN_FALLBACK_RE, "");
      for (const m of semFallback.matchAll(ENTREGA_HEX_RE)) {
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
  {
    chave: "cssCurvaDupla",
    valor: curvaCount,
    porArquivo: curvaByFile,
    // Esta é a única catraca que nasce ZERADA, então ela nunca aponta "os 8
    // piores arquivos" — aponta a LINHA. Defeito que não avisa no console
    // precisa chegar com endereço, senão o fiscal só troca um silêncio por outro.
    detalhes: curvaDetalhes,
    rotulo: "curva dupla no atalho animation (R11)",
    conselho: "var(--motion-*) JÁ traz tempo E curva — não some var(--ease-*)/cubic-bezier() nele. Quer curva própria? Use duração literal (ex.: 0.2s ease).",
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
    console.error(`\n[check-pele] CATRACA ESTOUROU — ${c.rotulo}: ${c.valor} (teto: ${teto}).`);
    if (c.detalhes) {
      console.error(c.conselho + " Onde:");
      for (const d of c.detalhes.slice(0, 30)) console.error("  " + d);
      if (c.detalhes.length > 30) console.error(`  … e mais ${c.detalhes.length - 30}.`);
    } else {
      const top = [...c.porArquivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.error(c.conselho + " Piores arquivos:");
      for (const [f, n] of top) console.error(`  ${n}\t${f}`);
    }
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
