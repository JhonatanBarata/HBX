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
 * Ela mede as juntas que a cena da abertura tem:
 *   A) O X POUSA NO LUGAR. As duas hastes viram o glifo do X — se elas pousam
 *      fora dele, o motorista vê DOIS X (o das hastes e o do logotipo) e lê como
 *      "piscou e apareceu 2x". A régua é o retângulo do próprio glifo.
 *   B) A ABERTURA ESPERA O APP. Ela não sai num relógio cego: sai quando os
 *      dados, o mapa e o primeiro fix estão na mão (com piso e teto).
 *   C) NÃO EXISTE TELA MORTA ENTRE UMA COISA E OUTRA. Do fim da abertura até o
 *      mapa desenhado não pode haver um quadro de palco vazio.
 *   E) A SAÍDA É A ENTRADA AO CONTRÁRIO — a fila dos atos, item por item.
 *
 * 🔴 A ORDEM DOS ATOS (dono, 10/08): *"o X não é carregado, ele abre apenas HB,
 * aí o X vem 1 traço de cada ponta diagonal (1 de cima outro de baixo), e formam
 * o X"* · *"ajuste fino na entrada e na saída, tem q ser IDÊNTICOS, e claro e
 * escuro tudo"*. Então a prova não mede só ONDE as hastes pousam: mede QUANDO
 * cada peça entra, e cobra que a saída seja essa mesma fila de trás pra frente.
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
/* 🔴 O SERVIDOR TAMBÉM TEM QUE DEMORAR, e é isto que fez o defeito aparecer: no
   aparelho as respostas chegam ESPALHADAS pelos primeiros segundos, e cada uma
   repinta a tela. Com o dublê respondendo na hora, nenhum repinte cai dentro da
   abertura e a prova jura que está tudo bem enquanto o dono vê a cena tocar duas
   vezes. Os atrasos abaixo põem um repinte em cada trecho da cena. */
const PONTE = () => {
  const tarde = (ms, v) => new Promise((ok) => setTimeout(() => ok(v), ms));
  /* 🔴 E O DADO TEM QUE SER DIFERENTE DO QUE JÁ ESTÁ NA TELA. `usarDados` tem
     freio: dado igual não repinta. Devolvendo lista vazia, o dublê nunca
     provocava repinte nenhum durante a abertura — e era por isso que a prova
     passava verde com o defeito publicado no celular do dono. Aqui cada resposta
     MUDA alguma coisa, que é o que o servidor de verdade faz. */
  const parada = (i) => ({
    id: 'e' + i, status: 'pendente', rotaOrdem: i, quantidade: 1 + i,
    cliente: { id: 'c' + i, nome: 'Cliente ' + (i + 1), enderecoLinha: 'Rua ' + (i + 1) + ', 100', bairro: 'Centro',
      lat: -22.4126 - i / 1000, lng: -47.5763 - i / 1000 },
  });
  window.HBX = {
    api(c) {
      if (c.indexOf('/logistica/rota?') === 0) return tarde(900, { items: [0, 1, 2].map(parada), routeStatus: 'PLANNED', moduloFinanceiroAtivo: true, saldo: 128 });
      if (c.indexOf('/logistica/agenda') === 0) return tarde(1700, { dias: [{ dia: 'seg', clientes: 4 }, { dia: 'ter', clientes: 7 }] });
      if (c.indexOf('/logistica/dia-preview') === 0) return tarde(2400, { clientes: [{ id: 'c9', nome: 'Mercado do Zé' }] });
      if (c.indexOf('/logistica/config') === 0) return tarde(1300, { avisoChegandoEnabled: true, modulos: {} });
      if (c.indexOf('/logistica/recados') === 0) return tarde(2100, { items: [{ id: 'r1', texto: 'Bom dia', de: 'Central', em: Date.now() }] });
      return tarde(2900, { items: [] });
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
    /* 🔴 A ABERTURA RECOMEÇOU? Duas perguntas, e as duas são medidas:
       · o nó do splash é o MESMO? (repinte recria a camada inteira)
       · o relógio da cena anda pra frente? (`spCarrega`, a barra de 2,6 s, é a
         animação mais longa da abertura — se ela volta pra perto de zero, a
         cena recomeçou na cara do motorista). */
    if (splash && !splash.__hbxId) { window.__splashN = (window.__splashN || 0) + 1; splash.__hbxId = window.__splashN; }
    let relogio = null;
    try {
      const barra = splash && splash.querySelector('.splash-barra i');
      const a = barra && barra.getAnimations && barra.getAnimations()[0];
      if (a) relogio = Math.round(a.currentTime || 0);
    } catch (_) { relogio = null; }
    /* o ENCAIXE: onde está a linha "HBX" do splash e onde está a do cabeçalho.
       O logo voa de uma pra outra — se ele não pousa em cima dela, a promessa
       da animação (dono: "tem q se formar e encaixar aqui no topper") é falsa. */
    const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const voando = caixa(document.querySelector('.tela.abertura .splash-logo .w'));
    const topo = caixa(document.querySelector('.tela:not(.sai) .logo .w'));
    /* 🔴 A ORDEM DOS ATOS SE MEDE EM TINTA, não no CSS. Quanto de cada peça está
       na tela a cada quadro — o "HB sozinho" do dono é um trecho da fita em que
       as letras estão inteiras e o glifo do X ainda é ZERO. A haste vale pelo
       PRODUTO das duas opacidades: o grupo `.splash-xis` tem a dele e a linha
       tem a sua, e uma sozinha mente. */
    const op = (el) => (el ? Number(getComputedStyle(el).opacity) : null);
    const opXis = splash ? op(splash.querySelector('.splash-xis')) : null;
    const haste = (sel) => {
      if (!splash || opXis === null) return null;
      const v = op(splash.querySelector(sel));
      return v === null ? null : Math.round(v * opXis * 1000) / 1000;
    };
    const marca = splash ? {
      h: op(splash.querySelector('.splash-logo .w b:nth-of-type(1)')),
      b: op(splash.querySelector('.splash-logo .w b:nth-of-type(2)')),
      x: op(splash.querySelector('.splash-logo .w em')),
      a: haste('line.haste-a:not(.rastro)'),
      hb: haste('line.haste-b:not(.rastro)'),
    } : null;
    window.__fita.push({
      t: Math.round(performance.now()),
      splash: !!splash,
      splashId: splash ? splash.__hbxId : null,
      relogio,
      marca,
      voando,
      topo,
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
  /* 🔴 SEM `await` NA CARGA. Com o dublê lento (que é o ponto desta prova), a
     carga só volta lá na frente — esperar por ela jogaria a medição do X pra
     depois da abertura inteira, e a prova mediria uma tela que já saiu. O app
     carrega no ritmo dele; o relógio da prova é o da PÁGINA. */
  p.evaluate(() => window.HBXRota.carregar()).catch(() => {});

  /* ---- A) O X POUSA EM CIMA DO GLIFO -------------------------------------
     Medido no fim do voo das hastes (a 2ª assenta em 1,80 s, o glifo acende em
     1,89 s e as hastes só saem em 2,01 s): o cruzamento das duas tem que cair
     DENTRO do retângulo do `em`.
     🔴 O RELÓGIO É O DA CENA, não o da prova. Antes isto era um
     `waitForTimeout(1350)` contado do lado de cá — e ele só acertava por sorte,
     porque o `goto` + o dublê comem um tanto de tempo que ninguém mede. A barra
     (`spCarrega`) é a animação mais longa da abertura e serve de régua: espero
     ela marcar 1,86 s, que é o instante entre a 2ª haste pousar e o glifo
     assumir. Cena que anda, a prova acompanha. */
  await p.waitForFunction(() => {
    const barra = document.querySelector('.splash .splash-barra i');
    const a = barra && barra.getAnimations && barra.getAnimations()[0];
    return !!a && Number(a.currentTime || 0) >= 1860;
  }, null, { timeout: 8000 }).catch(() => {});
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
    const oque = await p.evaluate(() => ({
      telas: document.querySelectorAll('.tela').length,
      classes: [...document.querySelectorAll('.tela')].map((t) => t.className).join(' | '),
      temSplash: !!document.querySelector('.splash'),
      temEm: !!document.querySelector('.splash .w em'),
      temHaste: document.querySelectorAll('.splash line').length,
    }));
    eh('A.1 a abertura tem hastes e glifo', false, JSON.stringify(oque));
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

  /* 🔴 O REPINTE DO MEIO DA ABERTURA — FORÇADO, porque esperar que ele aconteça
     sozinho na bancada foi o que deixou o defeito chegar no dono. No aparelho
     são cinco chamadas de boot (barra, rota, recados, tutorial, config) caindo
     espalhadas pelos primeiros segundos, cada uma com dado NOVO: cada uma
     repinta, e repinte recria a camada. Medido no g15 (gravação de tela, 2
     quadros/s): o X se formava, sumia e se formava DE NOVO, três vezes.
     Aqui a prova não torce pra acontecer: ela MANDA acontecer, duas vezes, em
     pontos diferentes da cena. Se a abertura sobreviver às duas, sobrevive ao
     boot de qualquer aparelho. */
  await p.waitForTimeout(300);
  await p.evaluate(() => window.usarDados && window.usarDados('rota', { titulo: 'meio da cena ' + Date.now() }));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.usarDados && window.usarDados('barra', { linha: 'outra ' + Date.now() }));

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

  /* 🔴 A ABERTURA COMEÇA UMA VEZ SÓ (dono, 09/08: *"a entrada ainda está com
     defeito, começa e começa novamente"*). O seam repinta a cada dado que chega
     do servidor, e repinte RECRIA a camada — numa tela comum isso é invisível,
     numa CENA COM RELÓGIO é a cena recomeçando do zero na cara de quem olha. */
  const ids = [...new Set(fita.filter((q) => q.splash).map((q) => q.splashId))];
  eh('B.4 o splash é UM só do começo ao fim (nao se repinta)', ids.length === 1,
    `${ids.length} splash na fita`);
  let voltou = 0;
  let ant = -1;
  fita.forEach((q) => {
    if (!q.splash || q.relogio === null) return;
    if (ant >= 0 && q.relogio + 60 < ant) voltou += 1;
    ant = q.relogio;
  });
  eh('B.5 e o relogio dela nunca volta pra tras', voltou === 0, `${voltou} recomecos`);
  eh('B.1 o mapa NASCE durante a abertura (nao depois dela)',
    nasceMapa !== null && fimSplash !== null && nasceMapa < fimSplash,
    `mapa=${nasceMapa && nasceMapa - t0} splash ate=${fimSplash && fimSplash - t0}`);
  eh('B.2 a abertura segura o app ate o piso da cena (3,4 s)',
    fimSplash !== null && fimSplash - t0 >= 3300, `${fimSplash && Math.round(fimSplash - t0)} ms`);
  eh('B.3 e nao segura alem do teto (7 s)',
    fimSplash !== null && fimSplash - t0 <= 7600, `${fimSplash && Math.round(fimSplash - t0)} ms`);

  /* ---- D) O HBX ENCAIXA NO TOPO, E SÓ DEPOIS AS COISAS APARECEM EMBAIXO ----
     Ordem do dono (09/08): *"o HBX tem q se formar e encaixar aqui no topper,
     depois acontece o efeito de aparecer as coisas embaixo"*. São duas coisas
     medíveis: ONDE o logo pousa, e QUANDO a cena tem licença pra começar. */
  const pouso = [...fita].reverse().find((q) => q.voando && q.topo);
  if (!pouso) {
    eh('D.1 o logo do splash voa pro cabeçalho', false, 'nao peguei o voo na fita');
  } else {
    const dx = Math.round((pouso.voando.x + pouso.voando.w / 2) - (pouso.topo.x + pouso.topo.w / 2));
    const dy = Math.round((pouso.voando.y + pouso.voando.h / 2) - (pouso.topo.y + pouso.topo.h / 2));
    const dw = Math.round(pouso.voando.w - pouso.topo.w);
    eh('D.1 ele POUSA em cima do HBX do cabeçalho', Math.abs(dx) <= 6 && Math.abs(dy) <= 6,
      `desvio ${dx}x${dy} px`);
    eh('D.2 e no TAMANHO dele (a escala fecha a conta)', Math.abs(dw) <= 6, `${dw} px de largura a mais`);
  }
  const fimVoo = (() => { const q = [...fita].reverse().find((x) => x.voando); return q ? q.t : null; })();
  eh('D.3 a cena das ruas só começa DEPOIS do encaixe',
    nasceCena !== null && fimVoo !== null && nasceCena >= fimVoo - 120,
    `encaixe ate=${fimVoo && fimVoo - t0} cena=${nasceCena && nasceCena - t0}`);

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

  /* ---- A) DE NOVO, AGORA A FILA — "abre apenas HB, aí o X vem" -------------
     A régua não é a folha, é a FITA: quadro a quadro, quanto de cada peça está
     na tela. Três perguntas, e nenhuma delas o CSS responde sozinho. */
  const comMarca = fita.filter((q) => q.marca && q.relogio !== null);
  const primeiro = (c) => { const q = comMarca.find(c); return q ? q.relogio : null; };
  const hbInteiro = primeiro((q) => q.marca.h >= .95 && q.marca.b >= .95);
  const hasteNaTela = primeiro((q) => (q.marca.a || 0) > .05 || (q.marca.hb || 0) > .05);
  const xNaTela = primeiro((q) => (q.marca.x || 0) > .05);
  const hasteA = primeiro((q) => (q.marca.a || 0) > .05);
  const hasteB = primeiro((q) => (q.marca.hb || 0) > .05);
  /* O trecho que o dono descreveu: HB inteiro na tela e NENHUM traço do X — nem
     o glifo, nem haste. Se ele não existe, o X "já veio carregado". */
  const soHB = comMarca.filter((q) => q.marca.h >= .95 && q.marca.b >= .95
    && (q.marca.x || 0) <= .05 && (q.marca.a || 0) <= .05 && (q.marca.hb || 0) <= .05);
  eh('A.4 existe o momento "só HB na tela, sem X nenhum"', soHB.length >= 3,
    `${soHB.length} quadros (de ${comMarca.length}) — HB inteiro em ${hbInteiro} ms`);
  eh('A.5 as hastes só entram DEPOIS do HB',
    hbInteiro !== null && hasteNaTela !== null && hasteNaTela > hbInteiro,
    `HB=${hbInteiro} ms · 1a haste=${hasteNaTela} ms`);
  eh('A.6 e o glifo do X só acende DEPOIS das hastes',
    hasteNaTela !== null && xNaTela !== null && xNaTela > hasteNaTela,
    `1a haste=${hasteNaTela} ms · glifo=${xNaTela} ms`);
  eh('A.7 a haste de cima vem primeiro, a de baixo depois',
    hasteA !== null && hasteB !== null && hasteB > hasteA,
    `haste-a=${hasteA} ms · haste-b=${hasteB} ms`);

  /* ---- E) A SAÍDA É A ENTRADA AO CONTRÁRIO --------------------------------
     Dono (10/08): *"ajuste fino na entrada e na saída, tem q ser IDÊNTICOS"*.
     "Idêntico" aqui é a FILA: a entrada monta H → B → haste-a → haste-b → X; a
     saída tem que desmontar na ordem exata de trás pra frente. Medido do mesmo
     jeito da entrada — em tinta, quadro a quadro — e não lendo o CSS, que só
     diria o que eu mesmo escrevi. */
  const saida = await p.evaluate(async () => {
    const fim = [];
    let gravando = true;
    const tick = () => {
      if (!gravando) return;
      const s = document.querySelector('.splash');
      if (s) {
        const op = (sel) => { const el = s.querySelector(sel); return el ? Number(getComputedStyle(el).opacity) : null; };
        const grupo = op('.splash-xis');
        const haste = (sel) => { const v = op(sel); return (v === null || grupo === null) ? null : v * grupo; };
        const meio = (sel) => {
          const el = s.querySelector(sel); if (!el) return null;
          const r = el.getBoundingClientRect();
          return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width };
        };
        fim.push({
          t: Math.round(performance.now()),
          x: op('.splash-logo .w em'),
          a: haste('line.haste-a:not(.rastro)'),
          hb: haste('line.haste-b:not(.rastro)'),
          h: op('.splash-logo .w b:nth-of-type(1)'),
          b: op('.splash-logo .w b:nth-of-type(2)'),
          /* ONDE as duas coisas estão: o glifo que se desfaz e o cruzamento das
             hastes que o substituem. Na saída elas trocam de lugar no MESMO
             ponto — se não trocam, o motorista vê o X pular pra fora da marca. */
          glifo: meio('.splash-logo .w em'),
          cruzA: meio('line.haste-a:not(.rastro)'),
          cruzB: meio('line.haste-b:not(.rastro)'),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // é a MESMA porta que o Kotlin aperta ao fechar o app
    if (typeof window.HBXSaida === 'function') window.HBXSaida();
    else window.ir('saida');
    await new Promise((ok) => setTimeout(ok, 3200));
    gravando = false;
    return fim;
  });
  /* "sumiu" = o último quadro em que a peça ainda tinha tinta. É o instante que
     o olho registra como "essa foi embora". */
  const sumiu = (chave) => {
    const q = [...saida].reverse().find((r) => (r[chave] || 0) > .05);
    return q ? q.t - (saida.length ? saida[0].t : 0) : null;
  };
  const oX = sumiu('x'); const oB = sumiu('hb'); const oA = sumiu('a');
  const letraB = sumiu('b'); const letraH = sumiu('h');
  const teve = (chave) => saida.some((r) => (r[chave] || 0) > .5);
  eh('E.0 a cena de saída toca de verdade (marca e hastes na tela)',
    saida.length > 12 && teve('h') && teve('b') && teve('a') && teve('hb'),
    `${saida.length} quadros`);
  eh('E.1 o X se desfaz ANTES das hastes irem embora',
    oX !== null && oB !== null && oX < oB, `X=${oX} ms · haste-b=${oB} ms`);
  eh('E.2 sai primeiro a haste que chegou por ÚLTIMO (b antes de a)',
    oA !== null && oB !== null && oB < oA, `haste-b=${oB} ms · haste-a=${oA} ms`);
  eh('E.3 as letras só descem com as hastes JÁ fora',
    oA !== null && letraB !== null && letraB > oA, `haste-a=${oA} ms · B=${letraB} ms`);
  eh('E.4 e o H é o último, porque foi o primeiro a subir',
    letraB !== null && letraH !== null && letraH > letraB, `B=${letraB} ms · H=${letraH} ms`);
  /* 🔴 O TETO DA SAÍDA É DO KOTLIN: `MainActivity.avisarOuSair` fecha o app
     2,7 s depois de pedir a cena, e o reverso do mapa come até 1,0 s antes dela
     começar. Cena que passa de 1,7 s é cena cortada pelo processo morrendo. */
  eh('E.5 a saída inteira cabe no relógio do Kotlin (1,7 s)',
    letraH !== null && letraH <= 1700, `${letraH} ms ate o ultimo traço`);
  /* 🔴 E O X TEM QUE SE DESFAZER EM CIMA DE SI MESMO. É a irmã da A.1, do lado
     da saída — e ela nasceu de uma FOTO: na grade de prova a haste aparecia
     acima e à direita do logotipo, porque a medida (`ajustarHastes`) era feita
     no primeiro quadro, com a marca ainda VOANDO do cabeçalho pro meio. Medir
     peça em movimento é medir onde ela não vai ficar. */
  const troca = saida.filter((r) => r.glifo && r.cruzA && r.cruzB && (r.a || 0) > .3 && (r.hb || 0) > .3);
  if (!troca.length) {
    eh('E.6 o X se desfaz EM CIMA do próprio glifo', false, 'nao peguei as hastes na fita');
  } else {
    const q = troca[0];
    const cruz = { x: (q.cruzA.cx + q.cruzB.cx) / 2, y: (q.cruzA.cy + q.cruzB.cy) / 2 };
    const dx = Math.round(cruz.x - q.glifo.cx);
    const dy = Math.round(cruz.y - q.glifo.cy);
    eh('E.6 o X se desfaz EM CIMA do próprio glifo', Math.abs(dx) <= 6 && Math.abs(dy) <= 6,
      `desvio ${dx}x${dy} px`);
  }

  /* ---- F) A CENA ESPERA A CORTINA, MAS NUNCA FICA PRESA -------------------
     No aparelho a cena nascia ATRÁS da cortina nativa e o "só HB" tocava pra
     ninguém (§ `segurarCena`). O remédio pausa a cena — e cena pausada que não
     solta é app que não abre. Então são três medidas: ela SEGURA, ela SOLTA no
     aviso do aparelho, e ela solta SOZINHA se o aviso nunca vier.
     Página nova, com uma ponte de mentira só pra existir `HBXAndroid`. */
  const ctx2 = await navegador.newContext({ viewport: { width: 412, height: 940 } });
  /* O dublê responde qualquer método com um no-op: quem segura a cena é a
     EXISTÊNCIA da ponte, e listar os métodos do Kotlin aqui só criaria uma
     segunda lista pra ficar desatualizada. */
  await ctx2.addInitScript(() => {
    window.HBXAndroid = new Proxy({}, { get: () => () => {} });
  });
  const pg = await ctx2.newPage();
  await pg.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await pg.addStyleTag({ content: pele });
  const presa = await pg.evaluate(() => {
    const s = document.querySelector('.splash');
    return { temMarca: !!(s && s.classList.contains('cena-presa')), parado: s ? getComputedStyle(s.querySelector('.splash-logo .w b')).animationPlayState : null };
  });
  eh('F.1 com aparelho na frente, a cena nasce SEGURA',
    presa.temMarca && presa.parado === 'paused', `marca=${presa.temMarca} estado=${presa.parado}`);
  await pg.waitForTimeout(700);
  const congelou = await pg.evaluate(() => {
    const b = document.querySelector('.splash .splash-logo .w b');
    const a = b && b.getAnimations && b.getAnimations()[0];
    return { relogio: a ? Math.round(Number(a.currentTime || 0)) : null, tinta: Number(getComputedStyle(b).opacity) };
  });
  eh('F.2 e ela fica MESMO parada (o HB não sobe atrás da cortina)',
    congelou.tinta <= .05, `opacidade ${congelou.tinta} · relogio ${congelou.relogio} ms`);
  await pg.evaluate(() => window.HBXCenaComeca && window.HBXCenaComeca());
  await pg.waitForTimeout(700);
  const soltou = await pg.evaluate(() => Number(getComputedStyle(document.querySelector('.splash .splash-logo .w b')).opacity));
  eh('F.3 o aviso do aparelho SOLTA a cena', soltou >= .95, `opacidade ${soltou}`);
  /* o teto: outra página, e ninguém avisa nada */
  const pg2 = await ctx2.newPage();
  await pg2.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await pg2.addStyleTag({ content: pele });
  await pg2.waitForTimeout(2600);
  const sozinha = await pg2.evaluate(() => Number(getComputedStyle(document.querySelector('.splash .splash-logo .w b')).opacity));
  eh('F.4 sem aviso nenhum, ela solta SOZINHA (teto de 1,6 s)', sozinha >= .95, `opacidade ${sozinha}`);
  await ctx2.close();

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
