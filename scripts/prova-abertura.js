#!/usr/bin/env node
/**
 * PROVA DA ABERTURA — a corrente HBX → app → mapa, sem pisca e sem corte.
 *
 *     node scripts/prova-abertura.js
 *
 * Dono (09/08, foto do g15): *"entrada do sistema, está piscando e aparecendo
 * 2x, o X está se deslocando"* · *"aparece o HBX no começo, aguarda realmente ter
 * carregado tudo a entrada, aí sim acontece o efeito"* · *"tem q ser limpo,
 * sensação profissional"*.
 *
 * Ela mede as três juntas que a cena da abertura tem:
 *   A) O X POUSA NO LUGAR. As duas hastes viram o glifo do X — se elas pousam
 *      fora dele, o motorista vê DOIS X (o das hastes e o do logotipo) e lê como
 *      "piscou e apareceu 2x". A régua é o retângulo do próprio glifo.
 *   B) A ABERTURA ESPERA O APP. Ela não sai num relógio cego: sai quando os
 *      dados, o mapa e o primeiro fix estão na mão (com piso e teto).
 *   C) NÃO EXISTE TELA MORTA ENTRE UMA COISA E OUTRA. Do fim da abertura até o
 *      mapa desenhado não pode haver um quadro de palco vazio.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const EU = { lat: -22.4126, lng: -47.5763 };

function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  return txt.slice(txt.indexOf('<style>') + 7, txt.indexOf('</style>'));
}
/* 🔴 A BANCADA É RÁPIDA DEMAIS PRA ESTA PROVA, e foi por isso que ela passou
   verde enquanto o g15 mostrava o defeito na cara do dono. Aqui o que custa no
   aparelho custa aqui também: a biblioteca do mapa, o estilo e os glifos chegam
   com o atraso que eles têm num celular fraco. Sem este peso, "o mapa nasce
   durante a abertura" é uma frase que passa sozinha e não prova nada. */
const PESO = { 'maplibre-gl.js': 700, 'style-dark.json': 320, 'style-light.json': 320, '.pbf': 160 };
const atrasoDe = (p) => {
  const chave = Object.keys(PESO).find((k) => p.indexOf(k) >= 0);
  return chave ? PESO[chave] : 0;
};
function servir() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, b) => {
        if (e) { res.writeHead(404); res.end(''); return; }
        const responder = () => {
          res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
          res.end(b);
        };
        const espera = atrasoDe(p);
        if (espera) setTimeout(responder, espera); else responder();
      });
    });
    s.listen(0, '127.0.0.1', () => ok([s, s.address().port]));
  });
}

/* o basemap dublado (mesma armadilha do prova-cena-ruas) */
const NOMES = ['Alameda', 'Boulevard', 'Caminho', 'Descida', 'Estrada', 'Ferradura', 'Gameleira', 'Horizonte',
  'Ipiranga', 'Jacarandá', 'Kalunga', 'Ladeira', 'Mirante', 'Nogueira', 'Oiticica', 'Pitangueira'];
const RUAS_FALSAS = (eu) => {
  const N = 8; const passo = 0.0035; const meio = ((N - 1) * passo) / 2; const f = [];
  for (let i = 0; i < N; i += 1) {
    const lat = eu.lat - meio + (i * passo); const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([eu.lng - meio + ((k * (N - 1) * passo) / 4), lat]);
    f.push({ type: 'Feature', properties: { name: NOMES[i], kind: 'minor_road' }, geometry: { type: 'LineString', coordinates: c } });
  }
  for (let i = 0; i < N; i += 1) {
    const lng = eu.lng - meio + (i * passo); const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([lng, eu.lat - meio + ((k * (N - 1) * passo) / 4)]);
    f.push({ type: 'Feature', properties: { name: NOMES[i + 8], kind: 'major_road' }, geometry: { type: 'LineString', coordinates: c } });
  }
  return f;
};
const ARMADILHA = (ruas) => {
  window.__ruas = ruas;
  let real;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      try {
        const P = v.Map.prototype; const antigo = P.querySourceFeatures;
        P.querySourceFeatures = function (id, o) {
          if (id === 'protomaps' && o && o.sourceLayer === 'roads') return window.__ruas || [];
          return antigo.call(this, id, o);
        };
      } catch (_) { /* sem Map: reprova sozinho */ }
    },
  });
};
const PONTE = () => {
  window.HBX = {
    api(c) {
      if (c.indexOf('/logistica/rota?') === 0) return Promise.resolve({ items: [], routeStatus: 'NONE', moduloFinanceiroAtivo: false });
      if (c.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (c.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

/* o gravador da abertura: a cada quadro, quem está no ar */
const GRAVAR = () => {
  window.__fita = [];
  window.__gravando = true;
  const tick = () => {
    if (!window.__gravando) return;
    const splash = document.querySelector('.splash');
    const palco = document.querySelector('.mapa-palco[data-mapa="geral"]');
    const m = palco && palco.__hbxMapaObj;
    let vis = null; let camadas = 0;
    if (m) {
      try { vis = m.getLayoutProperty('roads_minor', 'visibility') || 'visible'; } catch (_) { vis = null; }
      for (let i = 0; i < 7; i += 1) { try { if (m.getLayer(`hbx-cena-ruas-${i}`)) camadas += 1; } catch (_) { /* trocando */ } }
    }
    window.__fita.push({
      t: Math.round(performance.now()),
      splash: !!splash,
      palco: !!palco,
      mapa: !!m,
      pronto: !!(palco && palco.classList.contains('pronto')),
      vis,
      camadas,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};

(async () => {
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: EU.lat, longitude: EU.lng, accuracy: 22 },
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(ARMADILHA, RUAS_FALSAS(EU));
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.addStyleTag({ content: pele });
  await p.evaluate(PONTE);
  await p.evaluate(GRAVAR);
  await p.evaluate(() => window.HBXRota.carregar());

  /* ---- A) O X POUSA EM CIMA DO GLIFO -------------------------------------
     Medido no fim do voo das hastes (elas assentam em 1,25 s e o glifo acende
     em 1,50 s): o cruzamento das duas tem que cair DENTRO do retângulo do `em`. */
  await p.waitForTimeout(1350);
  const xis = await p.evaluate(() => {
    const splash = document.querySelector('.splash');
    const em = splash && splash.querySelector('.w em');
    const a = splash && splash.querySelector('line.haste-a:not(.rastro)');
    const b = splash && splash.querySelector('line.haste-b:not(.rastro)');
    if (!splash || !em || !a || !b) return null;
    const r = (el) => { const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, cx: q.x + q.width / 2, cy: q.y + q.height / 2 }; };
    const svg = splash.querySelector('.splash-xis');
    return {
      em: r(em), a: r(a), b: r(b), splash: r(splash),
      viewBox: svg ? svg.getAttribute('viewBox') : '(sem svg)',
    };
  });
  if (!xis) {
    eh('A.1 a abertura tem hastes e glifo', false, 'nao achei .splash/.w em/haste');
  } else {
    const cruz = { x: (xis.a.cx + xis.b.cx) / 2, y: (xis.a.cy + xis.b.cy) / 2 };
    const dx = Math.round(cruz.x - xis.em.cx);
    const dy = Math.round(cruz.y - xis.em.cy);
    // 6 px é o erro que ninguém enxerga; acima disso a haste e o glifo lêem
    // como duas peças, que é o "apareceu 2x" do dono.
    eh('A.1 as hastes cruzam EM CIMA do glifo do X', Math.abs(dx) <= 6 && Math.abs(dy) <= 6,
      `desvio ${dx}x${dy} px (glifo em ${Math.round(xis.em.cx)},${Math.round(xis.em.cy)}; cruz em ${Math.round(cruz.x)},${Math.round(cruz.y)})`);
    eh('A.2 o X das hastes tem o TAMANHO do glifo', Math.abs(xis.a.w - xis.em.w * 0.68) <= 8,
      `haste ${Math.round(xis.a.w)}px vs glifo ${Math.round(xis.em.w)}px`);
    eh('A.3 o viewBox do SVG acompanha a tela (nada de esticar medida)',
      xis.viewBox === `0 0 ${Math.round(xis.splash.w)} ${Math.round(xis.splash.h)}`,
      `viewBox="${xis.viewBox}" splash ${Math.round(xis.splash.w)}x${Math.round(xis.splash.h)}`);
  }

  /* ---- B) e C) a corrente até o mapa --------------------------------------- */
  await p.waitForTimeout(11000);
  await p.evaluate(() => { window.__gravando = false; });
  const fita = await p.evaluate(() => window.__fita);
  const prim = (c) => { const q = fita.find(c); return q ? q.t : null; };
  const t0 = fita.length ? fita[0].t : 0;
  const fimSplash = (() => { const q = [...fita].reverse().find((x) => x.splash); return q ? q.t : null; })();
  const nasceMapa = prim((q) => q.mapa);
  const nasceCena = prim((q) => q.camadas > 0);
  const fimCena = (() => { const q = [...fita].reverse().find((x) => x.camadas > 0); return q ? q.t : null; })();

  eh('B.0 a tela nao quebrou', erros.length === 0, erros[0] || 'sem erro');
  eh('B.1 o mapa NASCE durante a abertura (nao depois dela)',
    nasceMapa !== null && fimSplash !== null && nasceMapa < fimSplash,
    `mapa=${nasceMapa && nasceMapa - t0} splash ate=${fimSplash && fimSplash - t0}`);
  eh('B.2 a abertura segura o app ate o piso da cena (3,4 s)',
    fimSplash !== null && fimSplash - t0 >= 3300, `${fimSplash && Math.round(fimSplash - t0)} ms`);
  eh('B.3 e nao segura alem do teto (7 s)',
    fimSplash !== null && fimSplash - t0 <= 7600, `${fimSplash && Math.round(fimSplash - t0)} ms`);

  /* 🔴 A JUNTA: entre a abertura sair e a cena começar não pode existir palco
     VIVO e VAZIO — é o cinza chapado que o dono viu. */
  const mortos = fita.filter((q) => q.palco && q.pronto && !q.camadas && q.vis !== 'none'
    && q.t > (fimSplash || 0) && q.t < (nasceCena || Infinity));
  eh('C.1 nenhum quadro de palco vivo e VAZIO entre a abertura e a cena',
    mortos.length === 0, `${mortos.length} quadros mortos`);
  eh('C.2 a cena das ruas acontece', nasceCena !== null,
    nasceCena ? `comeca em ${nasceCena - t0} ms` : 'nunca');
  eh('C.3 e ela termina com o mundo de volta',
    fita.length > 0 && fita[fita.length - 1].vis === 'visible' && fita[fita.length - 1].camadas === 0,
    `fim=${fimCena && fimCena - t0} ms`);

  await ctx.close();
  await navegador.close();
  srv.close();

  console.log('\n=== A ABERTURA ===');
  ok.forEach((l) => console.log('  ✓ ' + l));
  if (falhou.length) {
    console.log('\n=== REPROVADO ===');
    falhou.forEach((l) => console.log('  ✗ ' + l));
  }
  console.log(`\n${ok.length}/${ok.length + falhou.length} passaram`);
  process.exit(falhou.length ? 1 : 0);
})();
