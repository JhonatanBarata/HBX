#!/usr/bin/env node
/**
 * CONFERE A CASCA INJETADA — ela ABRE, e abre IGUAL ao mock?
 *
 *     node scripts/casca-conferir.js
 *
 * Duas perguntas, as duas medidas num navegador de verdade:
 *
 *   A) O front SOBE? Script sob CSP que não executa, `null.innerHTML` no boot,
 *      folha que não carrega — tudo isso dá TELA PRETA SEM ERRO VISÍVEL. Aqui a
 *      página é aberta e conferida: zero erro, `#app` com conteúdo, as 33 telas
 *      renderizando.
 *
 *   B) Ela pinta IGUAL ao mock? As 33 telas × 2 modos, PIXEL a pixel, contra o
 *      mock aberto do lado. É a régua do dono: front idêntico ao mock.
 *
 * ⚠️ Armadilhas de medição já pagas (não repita): o `#app` do mock vive dentro
 * do `.phone`, que tem `zoom` — sem cravar o palco você compara escalas
 * diferentes; animação rodando faz o print medir o INSTANTE do frame; e o
 * `.notch` do mock é o recorte do celular DESENHADO, que a injeção tira de
 * propósito.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const APP = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app/index.html');
const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');
const MODOS = ['escuro', 'claro'];

// Palco igual dos dois lados: sem zoom do celular desenhado, sem notch, sem
// animação, mesma caixa. O que sobrar de diferença é a casca.
const PALCO = `*,*::before,*::after{animation:none!important;transition:none!important}
body{margin:0;display:block;overflow:hidden;background:#06090f}
.phone{zoom:1;padding:0;width:auto;height:auto;background:none;box-shadow:none;border-radius:0}
.doc-top,.rail{display:none!important}
.stage{padding:0;background:none;overflow:visible}
.notch{display:none!important}
.app{position:fixed;top:0;left:0;width:412px!important;height:940px!important;border-radius:0!important}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });

  const abrir = async (url, rotulo) => {
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(`${rotulo}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') erros.push(`${rotulo} console: ${m.text()}`); });
    await p.goto(url);
    await p.waitForTimeout(400);
    return { p, erros };
  };

  const app = await abrir(urlDe(APP), 'app');
  const mock = await abrir(urlDe(MOCK), 'mock');

  // ---- A) o front subiu? --------------------------------------------------
  const vida = await app.p.evaluate(() => ({
    temApp: !!document.getElementById('app'),
    conteudo: (document.getElementById('app') || {}).innerHTML?.length || 0,
    telas: typeof T === 'object' ? Object.keys(T).length : 0,
    camada: !!document.querySelector('#app .tela'),
    folha: getComputedStyle(document.body).fontFamily.includes('Inter'),
  }));

  console.log('=== A) A CASCA SOBE? ===');
  console.log(`  #app existe        : ${vida.temApp}`);
  console.log(`  #app com conteúdo  : ${vida.conteudo} caracteres`);
  console.log(`  telas carregadas   : ${vida.telas}`);
  console.log(`  tela pintada no boot: ${vida.camada}`);
  console.log(`  folha aplicada     : ${vida.folha}`);
  const morreu = !vida.temApp || vida.conteudo < 200 || vida.telas !== 33 || !vida.camada;
  if (app.erros.length) { console.log('  erros:'); app.erros.forEach((e) => console.log('    ' + e)); }
  if (morreu) {
    console.log('\n✗ A CASCA NÃO SUBIU. (tela preta é o desfecho típico: CSP, boot ou folha)');
    await browser.close();
    process.exit(1);
  }
  console.log('  ✓ subiu');

  // ---- B) pinta igual ao mock? -------------------------------------------
  const cravar = (pg) => pg.evaluate((css) => {
    document.getElementById('palco')?.remove();
    const s = document.createElement('style'); s.id = 'palco'; s.textContent = css;
    document.head.appendChild(s);
  }, PALCO);
  await cravar(app.p); await cravar(mock.p);

  const chaves = await mock.p.evaluate(() => Object.keys(T));
  const tirar = async (pg, k, modo) => {
    await pg.evaluate(([key, m]) => {
      document.documentElement.dataset.luz = m;
      const a = document.getElementById('app'); a.innerHTML = '';
      const c = document.createElement('div'); c.className = 'tela';
      c.innerHTML = T[key].render(); a.appendChild(c);
    }, [k, modo]);
    return crypto.createHash('sha1').update(await pg.screenshot()).digest('hex');
  };

  const diferentes = [];
  for (const modo of MODOS) {
    for (const k of chaves) {
      const [a, m] = [await tirar(app.p, k, modo), await tirar(mock.p, k, modo)];
      if (a !== m) diferentes.push(`${modo}/${k}`);
    }
  }
  await browser.close();

  const total = chaves.length * MODOS.length;
  console.log(`\n=== B) PINTA IGUAL AO MOCK? (${total} comparações de pixel) ===`);
  if (!diferentes.length) {
    console.log(`✓ ${total}/${total} IDÊNTICAS — o front do app é o mock.`);
    process.exit(0);
  }
  console.log(`✗ ${diferentes.length}/${total} diferentes:`);
  diferentes.slice(0, 25).forEach((d) => console.log('    ' + d));
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
