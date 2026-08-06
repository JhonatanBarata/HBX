#!/usr/bin/env node
/**
 * CONFERÊNCIA DA CASCA — a folha extraída pinta IGUAL à folha do mock?
 *
 *     node scripts/pele20-conferir.js
 *
 * 🔴 A PERGUNTA MUDOU EM 06/08, e por um motivo caro.
 * Antes este script comparava o HTML das 33 telas do mock com o HTML de uma
 * cópia delas que morava no app (`pele20.js`). Isso media a coisa errada: as
 * telas do mock nunca deveriam ter virado código de produção — a tela do mock
 * traz o DADO DE EXEMPLO dele, e ela acabou aparecendo por cima do dia real do
 * motorista. Aquele caminho foi arrancado.
 *
 * O que sobrou como casca é UMA FOLHA DE ESTILO (`pele20.css`), extraída do
 * mock. Então a única pergunta que importa é: **a folha extraída pinta os mesmos
 * pixels que a folha original?** Se pintar, o app pode vestir esse vocabulário
 * com a certeza de que fica idêntico ao mock.
 *
 * Como mede: abre o mock, renderiza cada tela, tira print. Depois TROCA a folha
 * do mock pela `pele20.css` e tira print de novo. Mesmo navegador, mesma fonte,
 * mesmo DOM — pixel diferente é defeito de extração, não ruído.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const CASCA = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app/pele20.css');
const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');
const MODOS = ['escuro', 'claro'];

// A folha extraída começa em `.app button{` — o reset global (box-sizing,
// margem do body, `font:inherit` nos controles) fica de fora de propósito:
// em produção quem entrega isso é o `app.css`. Pra comparação ser justa, ele
// entra aqui do mesmo jeito que entraria lá.
const RESET = `*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
button,input{font:inherit;color:inherit}
body{background:#06090f;font-family:Inter,"SF Pro Display","Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}`;

// 🔴 O PALCO TEM QUE SER O MESMO NAS DUAS VOLTAS.
// Na 1ª tentativa eu comparei 66 telas e deu 66 diferentes — parecia defeito
// grave de extração e não era: no mock o `#app` vive dentro do `.phone`, que
// tem `zoom` e padding, e o `body` é flex. Ao trocar a folha eu tirava o
// PALCO junto, então media "com zoom" contra "sem zoom" e chamava de cor.
// Esta folha entra por último nas DUAS voltas e crava o palco; o que sobrar de
// diferença aí é a casca, que é o que eu quero medir.
// 🔴 E O RELÓGIO TAMBÉM TEM QUE PARAR. A 2ª tentativa deu 66/66 diferentes com
// o estilo computado IDÊNTICO em 40 elementos — ou seja, a folha estava certa e
// eu estava medindo o INSTANTE do frame. Animação de entrada, esqueleto que
// pulsa, barra de aviso: cada print pegava um ponto diferente da linha do tempo.
// `animation/transition: none` no `*` e nos pseudo-elementos crava o estado
// final. Sem isto o portão vira gerador de alarme falso.
const BANCADA = `*,*::before,*::after{animation:none!important;transition:none!important}
body{margin:0;display:block;overflow:hidden}
.phone{zoom:1;padding:0;width:auto;height:auto;background:none;box-shadow:none;border-radius:0}
.doc-top,.rail{display:none!important}
.stage{padding:0;background:none;overflow:visible}
/* O RECORTE DA CAMERA e do celular DESENHADO, nao do app — e o gerador tira ele
   de proposito. A 3a tentativa deu 66/66 diferentes e a caixa da diferenca caiu
   em x161-264 / y8-35: o notch, exatamente. Ou seja, o portao reprovava uma
   ADAPTACAO INTENCIONAL. Some nas duas voltas; o que restar e defeito de verdade. */
.notch{display:none!important}
.app{position:fixed;top:0;left:0;width:412px!important;height:940px!important;border-radius:0!important}`;

(async () => {
  if (!fs.existsSync(CASCA)) throw new Error('[casca] pele20.css não existe — rode: node scripts/pele20-gerar.js');
  const folha = fs.readFileSync(CASCA, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(urlDe(MOCK));

  const chaves = await page.evaluate(() => Object.keys(T));
  // Crava o palco ANTES da 1ª volta, e ele é reposto depois da troca de folha.
  const cravarPalco = () => page.evaluate((css) => {
    document.getElementById('bancada')?.remove();
    const s = document.createElement('style');
    s.id = 'bancada';
    s.textContent = css;
    document.head.appendChild(s);
  }, BANCADA);
  await cravarPalco();
  const pintar = async (k, modo) => {
    await page.evaluate(([key, m]) => {
      document.documentElement.dataset.luz = m;
      const app = document.getElementById('app');
      app.innerHTML = '';
      const camada = document.createElement('div');
      camada.className = 'tela';
      camada.innerHTML = T[key].render();
      app.appendChild(camada);
      // Sem animação de entrada: o print tem que pegar o estado final, senão a
      // diferença medida seria o instante do frame, não a folha.
      camada.style.animation = 'none';
      camada.querySelectorAll('*').forEach((n) => { n.style.animation = 'none'; });
    }, [k, modo]);
    const buf = await page.locator('#app').screenshot();
    return crypto.createHash('sha1').update(buf).digest('hex');
  };

  // 1ª volta: a folha ORIGINAL do mock.
  const original = {};
  for (const modo of MODOS) for (const k of chaves) original[`${modo}/${k}`] = await pintar(k, modo);

  // Troca a folha do mock pela CASCA extraída (e repõe o palco por cima).
  await page.evaluate(([css, reset]) => {
    document.querySelectorAll('style').forEach((s) => s.remove());
    const nova = document.createElement('style');
    nova.textContent = reset + '\n' + css;
    document.head.appendChild(nova);
  }, [folha, RESET]);
  await cravarPalco();

  // 2ª volta: a folha EXTRAÍDA, mesmo DOM.
  const extraida = {};
  for (const modo of MODOS) for (const k of chaves) extraida[`${modo}/${k}`] = await pintar(k, modo);

  await browser.close();

  const nomes = Object.keys(original);
  const diferentes = nomes.filter((n) => original[n] !== extraida[n]);

  console.log(`[casca] ${chaves.length} telas × ${MODOS.length} modos = ${nomes.length} comparações de PIXEL`);
  if (erros.length) { console.log('erros de página:'); erros.forEach((e) => console.log('  ' + e)); }
  if (!diferentes.length) {
    console.log(`✓ ${nomes.length}/${nomes.length} pintam IGUAL — a casca extraída é fiel ao mock.`);
    process.exit(0);
  }
  console.log(`✗ ${diferentes.length}/${nomes.length} pintam DIFERENTE:`);
  diferentes.slice(0, 25).forEach((n) => console.log('    ' + n));
  console.log('\n  Regra por regra que ficou fora do corte, ou regra do visualizador que');
  console.log('  entrou junto. Conserte o corte em scripts/pele20-gerar.js.');
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
