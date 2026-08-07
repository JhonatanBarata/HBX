#!/usr/bin/env node
/**
 * INJETA O MOCK COMO FRONT DO APP.
 *
 *     node scripts/casca-injetar.js
 *
 * Ordem do dono (06/08): *"limpa todo o front feito por vc, TUDO. E injete o
 * mock, depois eu puxo backend."*
 *
 * Então o mock não é mais referência: **ele É o front**. Este script pega
 * `docs/mockups/logistica2.0/logistica-2.0.html` e escreve, dentro do app:
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
 *    (a lista de 31 telas), `.stage` e `.phone` (o celular DESENHADO em volta)
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
 * as 31 telas e a navegação entre elas — entra IGUAL, sem uma linha reescrita.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const DESTINO = path.join(raiz, 'EntregaShell/app/src/logistica/assets/app');
const CASCAS = path.join(raiz, 'docs/mockups/logistica2.0/cascas');
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
const aviso = (nome) => `/* ==========================================================================
   ${nome} — GERADO. NÃO EDITE.

   Fonte : docs/mockups/logistica2.0/logistica-2.0.html
   Gerador: node scripts/casca-injetar.js

   O mock É o front. Mexeu no mock, roda o gerador — o app acompanha.
   Editar aqui à mão some na próxima injeção.
   ========================================================================== */
`;

// A casca entra por ÚLTIMO: ela só redeclara token, nunca toca em tela.
const folhaFinal = css + (folhaCasca
  ? `\n/* ==== CASCA "${nomeCasca}" — docs/mockups/logistica2.0/cascas/${nomeCasca}.css ==== */\n${folhaCasca}`
  : '');
fs.writeFileSync(path.join(DESTINO, 'mock.css'), aviso('FOLHA DO MOCK') + folhaFinal);
fs.writeFileSync(path.join(DESTINO, 'mock.js'), aviso('SCRIPT DO MOCK') + js);

fs.writeFileSync(path.join(DESTINO, 'index.html'), `<!doctype html>
<html lang="pt-BR" data-tr="eixox" data-av="sino" data-luz="escuro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- CSP: o script do mock foi pra arquivo justamente por causa do 'self'. -->
  <!-- \`worker-src blob:\` é do MAPA: o maplibre desenha num Web Worker criado a
       partir de blob. Sem esta palavra o mapa morre com a CSP barrando o
       worker — e o resto da tela sobe normal, então o defeito parece "mapa
       cinza" em vez de "política bloqueou". Os tiles são da MESMA origem
       (\`appassets.androidplatform.net/tiles/...\`, servidos pelo aparelho), por
       isso \`connect-src 'self'\` basta. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="theme-color" content="#080d17">
  <title>HBX Logística</title>
  <link rel="stylesheet" href="mock.css">
</head>
<body>
  <div class="app" id="app"></div>
  <!-- ORDEM IMPORTA: native (ponte com o Kotlin) → mock (a casca) → ponte
       (o que é do aparelho: API, Voltar, teclado, tema). O native é carregado
       ANTES porque ele resolve o tema no load; a ponte DEPOIS porque ela se
       apoia no que o mock declarou. -->
  <script src="native.js"></script>
  <script src="mock.js"></script>
  <script src="ponte.js"></script>
</body>
</html>
`);

const telas = [...fonte.matchAll(/^T\.([a-z0-9]+)=\{nome:'([^']+)'/gm)];
console.log(`[casca] casca    : ${nomeCasca || 'padrão (tokens do próprio mock)'}`);
console.log(`[casca] mock.css : ${folhaFinal.split('\n').length} linhas`);
console.log(`[casca] mock.js  : ${js.split('\n').length} linhas`);
console.log(`[casca] telas    : ${telas.length}`);
console.log('[casca] cromo do visualizador fora; caixa virou tela; script em arquivo (CSP)');
console.log('[casca] confira: node scripts/casca-conferir.js');
