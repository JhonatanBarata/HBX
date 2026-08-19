#!/usr/bin/env node
/**
 * INJETA O MOCK COMO FRONT DO APP.
 *
 *     node scripts/casca-injetar.js                 (= --app logistica)
 *     node scripts/casca-injetar.js --app vendas
 *
 * Ordem do dono (06/08): *"limpa todo o front feito por vc, TUDO. E injete o
 * mock, depois eu puxo backend."*
 *
 * 🔴 DOIS APPS, UMA ESTEIRA (LOTE 1). Quem diz o mock, o destino, o título, a
 * theme-color, a lista de <script> e o connect-src é `scripts/lib/apps.js` —
 * este arquivo não conhece caminho de flavor nenhum. O que NÃO virou parâmetro
 * são as travas de FORMA daqui pra baixo (cromo, caixa 412x940, body, modo
 * claro, token circular, pintarRail/#phone/#rail): elas são a LEI DA CASCA e
 * valem IGUAL para os dois. Afrouxar uma "pro app novo passar" é entregar casca
 * quebrada com portão verde.
 *
 * Então o mock não é mais referência: **ele É o front**. Este script pega o
 * mock do app (ex.: `docs/mockups/logistica2.0/logistica-2.0.html`) e escreve,
 * dentro do app:
 *
 *     mock.css   ← a folha inteira do mock
 *     mock.js    ← o script inteiro do mock
 *     index.html ← a casca que carrega os dois
 *
 * Mexeu no mock? Roda de novo. O front acompanha.
 *
 * ---------------------------------------------------------------------------
 * AS ÚNICAS 5 ADAPTAÇÕES, e cada uma tem motivo duro:
 *
 * 1. O SCRIPT SAI PRA ARQUIVO. O `index.html` do app roda sob CSP
 *    `script-src 'self'` — script inline simplesmente NÃO EXECUTA, e morreria
 *    calado (tela preta, zero erro visível). Mesmo código, outro arquivo.
 *
 * 2. O CROMO DO VISUALIZADOR MORRE. `.doc-top` (título da página), `.rail`
 *    (a lista de 32 telas), `.stage` e `.phone` (o celular DESENHADO em volta)
 *    são a moldura de quem olha o mock no navegador. No aparelho, o aparelho
 *    já é o celular. Junto vai o `.notch`: o recorte de câmera desenhado ficaria
 *    por cima do recorte de câmera de verdade.
 *
 * 3. A CAIXA VIRA TELA. No mock o `.app` é uma maquete de 412x940 com canto
 *    arredondado. No aparelho ele É a tela: 100% / 100dvh, sem canto.
 *
 * 4. O APP AVISA QUE SUBIU. O aparelho segura uma cortina nativa até a página
 *    chamar `HBXAndroid.appReady()` — sem o aviso, a cortina fica PRA SEMPRE
 *    (medido no g15: opening congelado em "42%"). No navegador não há ponte e
 *    o aviso é inofensivo.
 *
 * 5. A BARRA DE STATUS DESENHADA MORRE. `.status` ("9:41", wifi e bateria de
 *    mentira) é a barra do celular DESENHADO, irmã do `.notch`: no aparelho a
 *    barra de verdade já está ali em cima — ficavam DUAS, e a falsa mentindo a
 *    hora (visto no g15). O conferidor esconde `.status` dos dois lados.
 *
 * Tudo o mais — tipografia, cor, movimento, abertura, os dois modos de luz,
 * as 32 telas e a navegação entre elas — entra IGUAL, sem uma linha reescrita.
 */
const fs = require('fs');
const path = require('path');
const { resolverApp, PADRAO } = require('./lib/apps');

const raiz = path.join(__dirname, '..');
/* 🔴 QUAL APP? `--app <nome>`; sem o flag vale `logistica` (os 25+ chamadores
   antigos não conhecem o flag). O alvo mora em `scripts/lib/apps.js` e em
   lugar NENHUM aqui: alvo cravado em 6 scripts é alvo que discorda de si mesmo
   no dia seguinte — e o jeito como isso aparece é o portão VERDE medindo o app
   do motorista enquanto o trabalho era no app novo. */
const APP = resolverApp(process.argv);
const MOCK = APP.mock;
const DESTINO = APP.destino;
const CASCAS = APP.cascas;
if (!fs.existsSync(MOCK)) {
  throw new Error(`[casca] o mock do app "${APP.nome}" não existe: ${APP.mockRel}`);
}
/* 🔴 `mkdirSync(recursive:true)` MATERIALIZA ÁRVORE EM SILÊNCIO — e é aí que um
   erro de digitação vira APK vazio. Um `flavor` errado no mapa (`vedas`,
   `logisitca`) fazia o injetor CRIAR `EntregaShell/app/src/<typo>/assets/app/`
   e encher de gerado: 3 arquivos escritos, log verde, `casca-conferir` feliz —
   e o Gradle nunca empacota um sourceSet que não existe no `build.gradle.kts`,
   então o front simplesmente não vai no APK. Falha muda é a categoria de
   defeito que mais custou dinheiro neste app.
   Quem manda na existência do sourceSet é o GRADLE, não este script: se a pasta
   do flavor não está no disco, o nome está errado — e reprova ALTO, com a lista
   do que existe de verdade, porque "criei a pasta pra você" é justamente o
   comportamento que esconde o erro. */
if (!fs.existsSync(APP.sourceSet)) {
  const paiDosFlavors = path.dirname(APP.sourceSet);
  const reais = fs.existsSync(paiDosFlavors)
    ? fs.readdirSync(paiDosFlavors, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).join(', ')
    : '(nem a pasta dos flavors existe)';
  const ondeRel = path.relative(raiz, paiDosFlavors).split(path.sep).join('/');
  throw new Error(
    `[casca] o flavor "${APP.flavor}" (app "${APP.nome}") não tem sourceSet no disco: ${APP.sourceSetRel}/\n` +
    '   NÃO vou criar a árvore: o Gradle só empacota sourceSet declarado no build.gradle.kts —\n' +
    '   o gerado nasceria completo, o portão sairia verde e o APK subiria SEM front.\n' +
    `   Flavors de verdade em ${ondeRel}/: ${reais}\n` +
    '   Conserte o campo `flavor` em scripts/lib/apps.js.',
  );
}
fs.mkdirSync(DESTINO, { recursive: true });
const fonte = fs.readFileSync(MOCK, 'utf8');

// --------------------------------------------------------------------------
// QUAL CASCA? `--casca <nome>` lê `cascas/<nome>.css` e a gruda no FIM da folha.
// A casca só REDECLARA token (mesma especificidade, mais tarde ⇒ vence). Ela
// não conhece tela nenhuma: é por isso que trocar de casca não reescreve tela.
// Sem `--casca`, sai a padrão — os tokens do próprio mock, byte a byte.
// --------------------------------------------------------------------------
const iCasca = process.argv.indexOf('--casca');
const nomeCasca = iCasca > -1 ? process.argv[iCasca + 1] : null;
let folhaCasca = '';
if (nomeCasca) {
  const arq = path.join(CASCAS, `${nomeCasca}.css`);
  if (!fs.existsSync(arq)) {
    const tem = fs.existsSync(CASCAS) ? fs.readdirSync(CASCAS).map((f) => f.replace(/\.css$/, '')).join(', ') : '(nenhuma)';
    throw new Error(`[casca] não existe a casca "${nomeCasca}". Disponíveis: ${tem}`);
  }
  folhaCasca = fs.readFileSync(arq, 'utf8');
}

/** Falha ALTA: front pela metade abre e engana. */
function fatiar(de, ate, nome) {
  const i = fonte.indexOf(de);
  if (i < 0) throw new Error(`[casca] não achei o INÍCIO de "${nome}": ${de}`);
  const j = fonte.indexOf(ate, i + de.length);
  if (j < 0) throw new Error(`[casca] não achei o FIM de "${nome}": ${ate}`);
  return fonte.slice(i + de.length, j);
}

/** Tira REGRAS INTEIRAS cujo seletor cite `alvo` — por regra, nunca por linha:
 *  regra de 2 linhas cortada pela metade deixa o corpo órfão na folha. */
function tirarRegras(css, alvo, nome) {
  const saida = css.replace(new RegExp(String.raw`(?:^|\n)[^\n{}]*${alvo}[^\n{}]*\{[^{}]*\}`, 'g'), '');
  if (new RegExp(alvo).test(saida)) {
    throw new Error(`[casca] sobrou "${nome}" na folha:\n  ` +
      saida.split('\n').filter((l) => new RegExp(alvo).test(l)).join('\n  '));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// FOLHA
// ---------------------------------------------------------------------------
let css = fatiar('<style>', '</style>', 'folha do mock');

const CROMO = ['\\.doc-top', '\\.doc-body', '\\.rail', '\\.stage', '\\.phone', '\\.seg', '\\.notch'];
CROMO.forEach((c) => { css = tirarRegras(css, c, c); });

const CAIXA = 'position:relative;width:412px;height:940px;border-radius:38px;overflow:hidden;';
if (!css.includes(CAIXA)) throw new Error('[casca] não achei a caixa 412x940 do mock');
css = css.replace(CAIXA, 'position:relative;width:100%;height:100dvh;border-radius:0;overflow:hidden;');

// O `body` do mock é cromo de página (flex de coluna pra empilhar barra+palco).
// No aparelho ele só precisa não atrapalhar.
css = css.replace(/^body\{[^}]*\}/m,
  'body{background:#06090f;color:#e8eefb;overflow:hidden;\n  font-family:Inter,"SF Pro Display","Segoe UI",system-ui,-apple-system,sans-serif;\n  -webkit-font-smoothing:antialiased;}');

if (/width:412px|height:940px/.test(css)) throw new Error('[casca] sobrou a caixa do celular DESENHADO');
if (!/\[data-luz="claro"\]/.test(css)) throw new Error('[casca] a folha saiu SEM modo claro');

// 🔴 TOKEN CIRCULAR (`--x:var(--x)`) NÃO É ERRO DE SINTAXE — é herança silenciosa:
// o valor vira vazio e a propriedade some sem uma linha no console. Custou duas
// recaídas na tokenização (--white e --chip-bg): nas duas, um comentário grudado
// na 1ª declaração enganou o detector de `--prop` do script de troca. O portão
// mora AQUI porque a folha é o produto — nenhuma casca pode sair assim.
const circulares = [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\1\)/g)].map((m) => m[1]);
if (circulares.length) {
  throw new Error(`[casca] token CIRCULAR (vira vazio, some calado): ${circulares.join(', ')}`);
}

// 5ª adaptação: a barra de status de MENTIRA sai de cena — a de verdade já
// está no vidro. Regra ADICIONADA no fim (vence por ordem), nunca editando as
// regras do mock.
css += '\n/* aparelho: a barra de status desenhada ("9:41") morre — a real já existe. */\n.status{display:none!important}\n';

// ---------------------------------------------------------------------------
// SCRIPT
// ---------------------------------------------------------------------------
let js = fatiar('<script>', '</script>', 'script do mock');

// O visualizador desenhava a lista de telas numa barra lateral que não existe
// no aparelho. `pintarRail` explodiria em `null.innerHTML` e derrubaria o boot
// inteiro — a tela nasceria PRETA. O resto dos listeners do visualizador
// procura elemento por `closest()` e devolve null sozinho, sem barulho.
js = js.replace(/^function pintarRail\(\)\{[\s\S]*?\n\}$/m,
  'function pintarRail(){/* barra lateral do visualizador: não existe no aparelho */}');
// O zoom era do celular desenhado.
js = js.replace(/document\.getElementById\('phone'\)\.style\.setProperty\([^)]*\);?/g, '');

if (/getElementById\('rail'\)|getElementById\('phone'\)/.test(js)) {
  throw new Error('[casca] sobrou acesso ao cromo do visualizador (#rail/#phone) no script');
}

// 4ª adaptação: o aparelho segura a cortina nativa até o app avisar que subiu.
js += `
/* aparelho: avisa a ponte que o app SUBIU — sem isto a cortina nativa nunca cai. */
try{
  var __ponte=window.HBXAndroid;
  if(__ponte&&__ponte.appReady){
    __ponte.appReady(document.documentElement.dataset.luz==='claro'?'light':'dark');
  }
}catch(_){/* no navegador não há ponte — o mock segue maquete */}
`;

// ---------------------------------------------------------------------------
// ESCRITA
// ---------------------------------------------------------------------------
/* O comando que REGENERA este arquivo, escrito exatamente como se digita: sem
   `--app` quando o alvo é o padrão. Não é enfeite — é o que impede que ligar o
   segundo app reescreva o cabeçalho dos gerados do MOTORISTA (o `git diff` do
   flavor `logistica` tem que sair VAZIO neste lote). */
const comando = `node scripts/casca-injetar.js${APP.nome === PADRAO ? '' : ` --app ${APP.nome}`}`;
const aviso = (nome) => `/* ==========================================================================
   ${nome} — GERADO. NÃO EDITE.

   Fonte : ${APP.mockRel}
   Gerador: ${comando}

   O mock É o front. Mexeu no mock, roda o gerador — o app acompanha.
   Editar aqui à mão some na próxima injeção.
   ========================================================================== */
`;

// A casca entra por ÚLTIMO: ela só redeclara token, nunca toca em tela.
const folhaFinal = css + (folhaCasca
  ? `\n/* ==== CASCA "${nomeCasca}" — ${APP.cascasRel}/${nomeCasca}.css ==== */\n${folhaCasca}`
  : '');
fs.writeFileSync(path.join(DESTINO, 'mock.css'), aviso('FOLHA DO MOCK') + folhaFinal);
fs.writeFileSync(path.join(DESTINO, 'mock.js'), aviso('SCRIPT DO MOCK') + js);

// 🔴 O TEMPLATE É BURRO DE PROPÓSITO. Título, theme-color, a lista de <script>
// e o connect-src saem do MAPA (`scripts/lib/apps.js`) — nunca de um `if
// (app === 'vendas')` aqui dentro. Com dois apps, a linha do connect-src
// escrita "à mão para cada um" seria a TERCEIRA perda do cordão de atualização.
const tagsDeScript = APP.scripts.map((s) => `  <script src="${s}"></script>`).join('\n');

fs.writeFileSync(path.join(DESTINO, 'index.html'), `<!doctype html>
<html lang="pt-BR" data-tr="eixox" data-av="sino" data-luz="escuro">
<head>
  <meta charset="utf-8">
  <!-- A viewport sai do MAPA porque ela DIVERGE por app, e a divergência é a
       decisão: o vendas é app de formulário e quer \`interactive-widget\`; o do
       motorista está em PRODUÇÃO, com tela cheia de mapa e piso medido, e não
       se mexe no teclado dele sem pedido e sem teste no aparelho. -->
  <meta name="viewport" content="${APP.viewport}">
  <!-- CSP: o script do mock foi pra arquivo justamente por causa do 'self'. -->
  <!-- \`worker-src blob:\` é do MAPA: o maplibre desenha num Web Worker criado a
       partir de blob. Sem esta palavra o mapa morre com a CSP barrando o
       worker — e o resto da tela sobe normal, então o defeito parece "mapa
       cinza" em vez de "política bloqueou". Os tiles são da MESMA origem
       (\`appassets.androidplatform.net/tiles/...\`, servidos pelo aparelho). -->
  <!-- 🔴 www + api NO connect-src SÃO O CORDÃO DE ATUALIZAÇÃO — e esta linha já
       se perdeu DUAS vezes. O \`checkAppUpdate\` (ponte.js) é a ÚNICA coisa do app
       que fala rede por \`fetch\`: todo o resto passa pela ponte nativa, que não
       sente CSP. Então \`connect-src 'self'\` sozinho quebra SÓ o update, e quebra
       CALADO — o toque em Ajustes > Versão responde "confira a internet" com a
       internet perfeita (medido no aparelho do dono, APK 211, 09/08).
       A 1ª perda foi a fusão; a 2ª foi aqui: o conserto de 07/08 (8ea965d1) foi
       escrito à mão no \`index.html\`, que é GERADO — a injeção seguinte
       (e8033eb9, 5 h depois) devolveu o \`self\` sozinho. O lugar é ESTE arquivo.
       Guardado por \`tests/app-cordao-de-update.test.mjs\`. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${APP.connectSrc}; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <!-- 🔴 UM VALOR, NÃO UM PAR \`media\`. Quem manda no modo de luz deste app é
       \`temaResolvido()\` (escolha do dono › virada de turno › aparelho), e uma
       \`<meta media>\` só enxerga o aparelho — à noite ela pintaria a barra ao
       contrário da tela. O porquê inteiro mora em scripts/lib/apps.js. -->
  <meta name="theme-color" content="${APP.themeColor}">
  <title>${APP.titulo}</title>
  <link rel="stylesheet" href="mock.css">
</head>
<body>
  <div class="app" id="app"></div>
  <!-- ORDEM IMPORTA: native (ponte com o Kotlin) → mock (a casca) → ponte
       (o que é do aparelho: API, Voltar, teclado, tema). O native é carregado
       ANTES porque ele resolve o tema no load; a ponte DEPOIS porque ela se
       apoia no que o mock declarou. -->
${tagsDeScript}
</body>
</html>
`);

const telas = [...fonte.matchAll(/^T\.([a-z0-9]+)=\{nome:'([^']+)'/gm)];
console.log(`[casca] app      : ${APP.nome} (${APP.rotulo}) → ${APP.destinoRel}`);
console.log(`[casca] fonte    : ${APP.mockRel}`);
console.log(`[casca] casca    : ${nomeCasca || 'padrão (tokens do próprio mock)'}`);
console.log(`[casca] mock.css : ${folhaFinal.split('\n').length} linhas`);
console.log(`[casca] mock.js  : ${js.split('\n').length} linhas`);
console.log(`[casca] telas    : ${telas.length}`);
console.log('[casca] cromo do visualizador fora; caixa virou tela; script em arquivo (CSP)');
console.log(`[casca] confira: node scripts/casca-conferir.js --app ${APP.nome}`);
