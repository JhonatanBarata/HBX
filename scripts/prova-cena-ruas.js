#!/usr/bin/env node
/**
 * PROVA DA CENA DAS RUAS — a entrada do app e a rota nova se desenhando.
 *
 *     node scripts/prova-cena-ruas.js
 *
 * O pedido do dono (09/08): *"entrada do app, ao ligar, era pras ruas virem
 * surgindo... nasce o pino centralizado, escreve as coordenadas e o endereço...
 * aí as ruas vão surgindo de vários pontos aleatórios... quando a rua é
 * 'fechada' começa escrever as letras... tudo na mesma velocidade do 'escrever'
 * que já existe"*.
 *
 * 🔴 POR QUE ESTA PROVA GRAVA QUADRO A QUADRO. Cena é COISA QUE ACONTECE NO
 * TEMPO: print no meio não prova ordem, e "existe a camada" não prova que a rua
 * cresceu. Aqui um gravador dentro da página anota, a cada quadro, o estado
 * inteiro da cena (mundo escondido, gradiente de cada onda, texto de cada nome,
 * cartão, pino) e a análise roda em cima da FITA. É assim que dá pra afirmar
 * "nenhuma letra foi escrita antes da rua fechar" — que é a ordem literal.
 *
 * 🔴 E ELA DUBLA O TILE, NÃO A CENA. Na bancada não existe `/tiles/*.pbf` (eles
 * são servidos pelo aparelho), então o mapa sobe sem rua nenhuma e não haveria o
 * que desenhar. O dublê entra no ÚNICO ponto onde a cena toca o basemap —
 * `querySourceFeatures` — e devolve uma grade de ruas com nome. Todo o resto
 * (esconder o mundo, ondas, gradiente, letras, devolver o mundo) é o código de
 * produção rodando de verdade.
 *
 * 🔴 O DUBLÊ DO MAPA ENTRA POR SETTER. O `vendor/maplibre-gl.js` é carregado
 * pela ponte quando a tela precisa, muito depois do boot — então não dá pra
 * remendar o protótipo num `addInitScript` comum. O que se instala antes é uma
 * ARMADILHA na propriedade `window.maplibregl`: quando a biblioteca se atribui,
 * o setter remenda o protótipo no mesmo instante.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pbf': 'application/x-protobuf' };

const EU = { lat: -22.4126, lng: -47.5763 };
const LETRA = 66;          // ms por letra — a régua do `empDigita`
const ONDAS = 7;

/** o `<style>` do mock-fonte — a casca que a injeção vira `mock.css` */
function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  const i = txt.indexOf('<style>');
  const f = txt.indexOf('</style>');
  if (i < 0 || f < 0) throw new Error('mock sem bloco <style>');
  return txt.slice(i + 7, f);
}

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, b) => {
        if (e) { res.writeHead(404); res.end(''); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
        res.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => ok([s, s.address().port]));
  });
}

/* ---- o dublê do basemap ---------------------------------------------------
   Uma grade de 8x8 ruas com nome em volta do fix, espaçadas ~390 m (≈180 px no
   z15, que é o zoom em que a tela nasce): perto o bastante pra parecer cidade,
   longe o bastante pra o espaçamento de rótulo (84 px) deixar vários nomes
   passarem.

   🔴 CADA NOME COMEÇA COM UMA LETRA DIFERENTE, e é exigência da MEDIÇÃO, não do
   app: pra saber se "Ala" e "Alam" são a mesma palavra sendo escrita, a prova
   agrupa os pedaços pelo começo. Com oito "Avenida Vertical N" os oito viram um
   balaio só e a conta da letra sai errada — o app escreve certo e a régua mente.
   Rua de verdade repete começo à vontade; a régua é que não pode. */
const NOMES = ['Alameda', 'Boulevard', 'Caminho', 'Descida', 'Estrada', 'Ferradura', 'Gameleira', 'Horizonte',
  'Ipiranga', 'Jacarandá', 'Kalunga', 'Ladeira', 'Mirante', 'Nogueira', 'Oiticica', 'Pitangueira'];
const RUAS_FALSAS = (eu) => {
  const N = 8;
  const passo = 0.0035;
  const meio = ((N - 1) * passo) / 2;
  const feicoes = [];
  for (let i = 0; i < N; i += 1) {
    const lat = eu.lat - meio + (i * passo);
    const coords = [];
    for (let k = 0; k <= 4; k += 1) coords.push([eu.lng - meio + ((k * (N - 1) * passo) / 4), lat]);
    feicoes.push({
      type: 'Feature',
      properties: { name: NOMES[i], kind: i === 3 ? 'major_road' : 'minor_road' },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  for (let i = 0; i < N; i += 1) {
    const lng = eu.lng - meio + (i * passo);
    const coords = [];
    for (let k = 0; k <= 4; k += 1) coords.push([lng, eu.lat - meio + ((k * (N - 1) * passo) / 4)]);
    feicoes.push({
      type: 'Feature',
      properties: { name: NOMES[i + 8], kind: i === 4 ? 'highway' : 'minor_road' },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  return feicoes;
};

/** a armadilha no `window.maplibregl` (roda ANTES de qualquer script da página) */
const ARMADILHA = (ruas) => {
  window.__ruas = ruas;
  let real;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      try {
        const P = v.Map.prototype;
        const antigo = P.querySourceFeatures;
        P.querySourceFeatures = function (id, o) {
          if (id === 'protomaps' && o && o.sourceLayer === 'roads') return window.__ruas || [];
          return antigo.call(this, id, o);
        };
      } catch (_) { /* versão sem Map: a prova reprova sozinha */ }
    },
  });
};

/* ---- o servidor dublado (mesmo desenho do prova-mapa-2d) ------------------ */
const paradaFalsa = (i) => ({
  id: `e${i}`, status: 'pendente', rotaOrdem: i, quantidade: 1,
  cliente: {
    id: `c${i}`, nome: `Cliente ${i + 1}`,
    enderecoLinha: `Rua ${i + 1}, 100`, bairro: 'Centro',
    lat: -22.4126 - ((i * 37) % 90) / 10000,
    lng: -47.5763 - ((i * 53) % 90) / 10000,
  },
});

const PONTE = ({ itens, estado }) => {
  window.__chamadas = [];
  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, caminho]);
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({ items: itens, routeStatus: estado || (itens.length ? 'PLANNED' : 'NONE'), moduloFinanceiroAtivo: false });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {},
    manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

/* ---- o gravador (dentro da página) --------------------------------------- */
const GRAVAR = (ondas) => {
  window.__fita = [];
  window.__gravando = true;
  const palco = () => document.querySelector('.mapa-palco[data-mapa="geral"]');
  const dado = (m, id) => {
    try {
      const s = m.getSource(id);
      if (!s) return null;
      const d = (s.serialize && s.serialize().data) || s._data;
      return d && d.features ? d.features.map((f) => f.properties.txt) : null;
    } catch (_) { return null; }
  };
  /* o `p` da onda = o último degrau do gradiente (onde a rua está agora).
     🔴 E ELE SÓ VALE COM A CAMADA ACESA: a onda nasce com `line-opacity:0` e um
     gradiente de repouso que JÁ tem um degrau em 0,001 — ler só o número faria
     as sete ondas parecerem ter partido juntas no primeiro quadro. Quem diz
     "esta onda está desenhando" é a opacidade. */
  const passo = (m, i) => {
    try {
      if (!m.getLayer(`hbx-cena-ruas-${i}`)) return null;
      const o = m.getPaintProperty(`hbx-cena-ruas-${i}`, 'line-opacity');
      if (!o) return 0;
      const g = m.getPaintProperty(`hbx-cena-ruas-${i}`, 'line-gradient');
      if (!Array.isArray(g)) return null;
      const nums = g.filter((x) => typeof x === 'number');
      return nums.length ? nums[nums.length - 1] : null;
    } catch (_) { return null; }
  };
  const tick = () => {
    if (!window.__gravando) return;
    const p = palco();
    const m = p && p.__hbxMapaObj;
    if (m) {
      let vis = null;
      try { vis = m.getLayoutProperty('roads_minor', 'visibility') || 'visible'; } catch (_) { vis = null; }
      const gs = [];
      let camadas = 0;
      for (let i = 0; i < ondas; i += 1) {
        const v = passo(m, i);
        gs.push(v);
        try { if (m.getLayer(`hbx-cena-ruas-${i}`)) camadas += 1; } catch (_) { /* estilo trocando */ }
      }
      const cartao = document.querySelector('.cena-eu');
      /* a régua da escrita é lida NO AR: o cartão sai de cena junto com a cena, e
         medir depois é medir o que já não existe. */
      if (cartao && !window.__escrita) {
        const b = cartao.querySelector('b');
        if (b) {
          const s = getComputedStyle(b);
          window.__escrita = {
            n: Number(s.getPropertyValue('--n')), dur: s.animationDuration,
            nome: s.animationName, passos: s.animationTimingFunction,
          };
        }
      }
      // o puck do MAPA, nunca o do desenho: o mock tem um `.eu-puck.demo` no
      // palco e ele viria primeiro no `querySelector` (mesma pegadinha do
      // prova-mapa-2d).
      const euEl = document.querySelector('.maplibregl-marker.eu-puck, .maplibregl-marker .eu-puck');
      const r = p.getBoundingClientRect();
      window.__fita.push({
        t: Math.round(performance.now()),
        vis,
        camadas,
        telas: document.querySelectorAll('.tela').length,
        caixa: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.y)}`,
        gs,
        nomes: dado(m, 'hbx-cena-nomes'),
        temFonte: (() => { try { return !!m.getSource('hbx-cena-ruas'); } catch (_) { return false; } })(),
        cartao: cartao ? [...cartao.children].map((c) => c.textContent) : null,
        nascendo: !!(euEl && euEl.classList.contains('nascendo')),
      });
    }
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

async function abrir(navegador, pele, porta, { itens, ruas, pouco, estado }) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: EU.lat, longitude: EU.lng, accuracy: 22 },
    permissions: ['geolocation'],
    reducedMotion: pouco ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(ARMADILHA, ruas === undefined ? RUAS_FALSAS(EU) : ruas);
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.waitForTimeout(400);
  await p.addStyleTag({ content: pele });
  await p.evaluate(PONTE, { itens, estado });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(500);
  await p.evaluate(GRAVAR, ONDAS);
  await p.evaluate(() => window.ir('rota'));
  return { ctx, p, erros };
}

/** a fita, depois de tudo: espera a cena acabar (ou o teto de segurança) */
async function fitaDe(p, esperaMs) {
  await p.waitForTimeout(esperaMs);
  await p.evaluate(() => { window.__gravando = false; });
  return p.evaluate(() => window.__fita);
}

const primeiro = (fita, cond) => { const q = fita.find(cond); return q ? q.t : null; };
const ultimo = (fita, cond) => { const q = [...fita].reverse().find(cond); return q ? q.t : null; };

(async () => {
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /* ======================================================================
     CASO 1 — A ENTRADA DO APP, O ROTEIRO INTEIRO.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta, { itens: [] });
    const fita = await fitaDe(p, 7000);
    eh('1.0 a tela nao quebrou', erros.length === 0, erros[0] || 'sem erro');
    eh('1.1 a fita gravou a cena', fita.length > 60, `${fita.length} quadros`);

    // --- o mundo sai e VOLTA
    const escondeu = fita.some((q) => q.vis === 'none');
    const voltou = fita.length && fita[fita.length - 1].vis === 'visible';
    eh('1.2 o mundo SAI de cena (rua do basemap escondida)', escondeu);
    eh('1.3 o mundo VOLTA no fim', voltou, `vis=${fita.length ? fita[fita.length - 1].vis : '?'}`);
    const tVolta = primeiro(fita, (q) => q.vis === 'visible' && q.t > (primeiro(fita, (x) => x.vis === 'none') || 0));
    eh('1.4 a cena inteira cabe em 6 s', !!tVolta && tVolta - fita[0].t < 6000,
      tVolta ? `${Math.round(tVolta - fita[0].t)} ms` : 'nunca voltou');

    // --- o pino nasce e o cartao se escreve
    eh('1.5 o pino NASCE (classe nascendo)', fita.some((q) => q.nascendo));
    const comCartao = fita.filter((q) => q.cartao && q.cartao.length);
    eh('1.6 o cartao existe com DUAS linhas (coordenada + endereco)',
      comCartao.length > 0 && comCartao[comCartao.length - 1].cartao.length === 2,
      comCartao.length ? JSON.stringify(comCartao[comCartao.length - 1].cartao) : 'sem cartao');
    const linhas = comCartao.length ? comCartao[comCartao.length - 1].cartao : [];
    eh('1.7 a coordenada é a do FIX, em grau com hemisferio',
      !!linhas[0] && linhas[0].indexOf('22,4126° S') === 0 && linhas[0].indexOf('47,5763° W') > 0,
      linhas[0] || '(vazio)');
    eh('1.8 o endereco é a rua mais perto, tirada do MAPA', !!linhas[1] && NOMES.indexOf(linhas[1]) >= 0,
      linhas[1] || '(vazio)');
    // o cartao nasce ANTES das ruas: é o roteiro (pino → escrita → ruas)
    const tCartao = primeiro(fita, (q) => q.cartao && q.cartao.length);
    const tRua1 = primeiro(fita, (q) => q.gs.some((g) => g !== null && g > 0));
    eh('1.9 o cartao vem ANTES da primeira rua', tCartao !== null && tRua1 !== null && tCartao < tRua1,
      `cartao=${tCartao} rua=${tRua1}`);

    // --- a escrita na régua da casa: 66 ms por letra, do `empDigita`
    const escrita = await p.evaluate(() => window.__escrita || null).catch(() => null);
    if (escrita) {
      eh('1.10 a escrita usa o MESMO empDigita do resto do app', escrita.nome === 'empDigita', escrita.nome);
      eh('1.11 66 ms por letra (duração = n × 66 ms)',
        Math.abs(parseFloat(escrita.dur) * 1000 - escrita.n * LETRA) < 2,
        `n=${escrita.n} dur=${escrita.dur}`);
      eh('1.12 letra a letra (steps), nunca varrendo a caixa', /steps\(/.test(escrita.passos), escrita.passos);
    } else {
      eh('1.10 a escrita usa o MESMO empDigita do resto do app', false, 'cartao ja saiu de cena');
    }

    // --- as ondas: de vários pontos, em ORDEM, cada uma crescendo de 0 a 1
    const nasceu = [];
    for (let i = 0; i < ONDAS; i += 1) nasceu.push(primeiro(fita, (q) => q.gs[i] !== null && q.gs[i] > 0));
    const todasNasceram = nasceu.every((t) => t !== null);
    eh('1.13 as 7 ondas existem e todas crescem', todasNasceram, nasceu.join(' · '));
    let emOrdem = true;
    for (let i = 1; i < ONDAS; i += 1) if (!(nasceu[i] > nasceu[i - 1])) emOrdem = false;
    eh('1.14 uma onda parte depois da outra (nao é tudo junto)', todasNasceram && emOrdem,
      todasNasceram ? nasceu.map((t, i) => (i ? t - nasceu[i - 1] : 0)).slice(1).join('/') + ' ms' : '—');
    /* 🔴 A CONTA PARA QUANDO A RUA FECHA. Depois do fim a cena apaga a camada
       (`line-opacity` 0) e a leitura volta a zero — isso é o DESFECHO, não a rua
       andando pra trás. Medir além disso seria a régua reprovando o encerramento. */
    let cresceSempre = true;
    for (let i = 0; i < ONDAS; i += 1) {
      let ant = -1;
      for (let k = 0; k < fita.length; k += 1) {
        const v = fita[k].gs[i];
        if (v === null) continue;
        if (v >= 0.999) break;
        if (v + 1e-9 < ant) cresceSempre = false;
        ant = v;
      }
    }
    eh('1.15 o crescimento é monotonico (rua nao anda pra tras)', cresceSempre);
    const fechou0 = primeiro(fita, (q) => q.gs[0] !== null && q.gs[0] >= 0.999);
    eh('1.16 a primeira onda FECHA', fechou0 !== null, fechou0 ? `${fechou0 - fita[0].t} ms` : 'nunca');

    // --- as letras só depois da rua fechada
    const tLetra = primeiro(fita, (q) => q.nomes && q.nomes.length);
    eh('1.17 nenhuma letra antes de rua fechada', tLetra !== null && fechou0 !== null && tLetra >= fechou0,
      `letra=${tLetra} fechou=${fechou0}`);
    eh('1.18 os nomes das ruas aparecem no mapa', tLetra !== null,
      (ultimo(fita, (q) => q.nomes && q.nomes.length) ? JSON.stringify((([...fita].reverse().find((q) => q.nomes && q.nomes.length) || {}).nomes || []).slice(0, 3)) : 'nenhum'));

    // cada estado do nome é PREFIXO do seguinte, e a letra anda a 66 ms
    const trilha = new Map();
    fita.forEach((q) => {
      if (!q.nomes) return;
      q.nomes.forEach((txt) => {
        if (!txt) return;
        const chave = txt.slice(0, 4);
        if (!trilha.has(chave)) trilha.set(chave, []);
        const lista = trilha.get(chave);
        const ant = lista.length ? lista[lista.length - 1] : null;
        if (!ant || ant.txt !== txt) lista.push({ t: q.t, txt });
      });
    });
    let prefixoOk = true;
    let deltas = [];
    trilha.forEach((lista) => {
      for (let i = 1; i < lista.length; i += 1) {
        if (lista[i].txt.indexOf(lista[i - 1].txt) !== 0) prefixoOk = false;
        if (lista[i].txt.length === lista[i - 1].txt.length + 1) deltas.push(lista[i].t - lista[i - 1].t);
      }
    });
    const media = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    eh('1.19 o nome cresce letra a letra (cada estado é prefixo do proximo)', prefixoOk && trilha.size > 0,
      `${trilha.size} nomes`);
    eh('1.20 a letra do MAPA anda na mesma régua de 66 ms', deltas.length > 4 && Math.abs(media - LETRA) <= 14,
      `media ${Math.round(media)} ms em ${deltas.length} letras`);

    // --- o desfecho: nada da cena fica pra tras
    const fim = fita[fita.length - 1];
    eh('1.21 no fim nao sobra camada da cena', fim.camadas === 0, `${fim.camadas} camadas`);
    eh('1.22 no fim nao sobra fonte da cena', fim.temFonte === false);
    eh('1.23 no fim nao sobra cartao', !fim.cartao);
    await ctx.close();
  }

  /* ======================================================================
     CASO 2 — O DEDO ENCERRA A CENA. Quem toca o mapa quer o mapa.
     ====================================================================== */
  {
    const { ctx, p } = await abrir(navegador, pele, porta, { itens: [] });
    // espera a cena estar NO AR (mundo escondido e alguma onda crescendo)
    await p.waitForFunction(() => (window.__fita || []).some((q) => q.vis === 'none' && q.gs.some((g) => g !== null && g > 0)), null, { timeout: 8000 }).catch(() => {});
    const antes = await p.evaluate(() => (window.__fita || []).length);
    await p.mouse.move(206, 500);
    await p.mouse.down();
    await p.mouse.move(240, 540, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(700);
    const fita = await fitaDe(p, 100);
    const depois = fita.slice(antes);
    eh('2.1 o dedo devolve o mundo na hora', depois.length > 0 && depois[depois.length - 1].vis === 'visible',
      depois.length ? depois[depois.length - 1].vis : 'sem quadro');
    eh('2.2 o dedo mata as camadas da cena', depois.length > 0 && depois[depois.length - 1].camadas === 0,
      depois.length ? `${depois[depois.length - 1].camadas} camadas` : '—');
    await ctx.close();
  }

  /* ======================================================================
     CASO 3 — SEM RUA NENHUMA (tile que nao chegou). A cena nao acontece e a
     tela NAO fica vazia: é o desfecho honesto, nao um travamento.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta, { itens: [], ruas: [] });
    const fita = await fitaDe(p, 5000);
    const fim = fita[fita.length - 1];
    eh('3.1 sem rua: a tela nao quebra', erros.length === 0, erros[0] || 'sem erro');
    eh('3.2 sem rua: o mundo esta de volta', !!fim && fim.vis === 'visible', fim ? fim.vis : '—');
    eh('3.3 sem rua: nenhuma camada de cena nasceu', fita.every((q) => q.camadas === 0));
    const tVolta = primeiro(fita, (q) => q.vis === 'visible' && q.t > (primeiro(fita, (x) => x.vis === 'none') || 0));
    eh('3.4 sem rua: o mundo volta dentro do teto de 2,2 s + folga',
      tVolta === null || tVolta - (primeiro(fita, (x) => x.vis === 'none') || 0) < 3200,
      tVolta ? `${tVolta - (primeiro(fita, (x) => x.vis === 'none') || 0)} ms escondido` : 'nunca escondeu');
    await ctx.close();
  }

  /* ======================================================================
     CASO 4 — MENOS MOVIMENTO (Lei 7): cena nenhuma, tela pronta.
     ====================================================================== */
  {
    const { ctx, p } = await abrir(navegador, pele, porta, { itens: [], pouco: true });
    const fita = await fitaDe(p, 3500);
    eh('4.1 reduced-motion: o mundo NUNCA sai de cena', fita.every((q) => q.vis !== 'none'));
    eh('4.2 reduced-motion: camada de cena nenhuma', fita.every((q) => q.camadas === 0));
    eh('4.3 reduced-motion: cartao nenhum', fita.every((q) => !q.cartao));
    await ctx.close();
  }

  /* ======================================================================
     CASO 5 — ROTA NOVA REPETE A CENA, e ela acontece na tela do MAPA (nao na
     de montagem, que é onde o dedo estava).
     ====================================================================== */
  {
    /* O dia tem paradas mas a rota NÃO está montada — é o único estado em que a
       Montagem oferece "Montar rota" (montada, o pé vira "Iniciar rota"). */
    const itens = [0, 1, 2].map(paradaFalsa).map((it) => ({ ...it, rotaOrdem: null }));
    const { ctx, p } = await abrir(navegador, pele, porta, { itens, estado: 'NONE' });
    /* deixa a cena de ENTRADA terminar DE VERDADE — esperar "uns segundos" é o
       que fazia a fita da montagem começar com o rabo da cena anterior. */
    await p.waitForFunction(() => {
      const f = window.__fita || [];
      // ela tem que ter COMEÇADO (o mundo saiu de cena) antes de eu chamar de
      // terminada — senão os 6 quadros limpos são os de ANTES da cena.
      if (!f.some((q) => q.vis === 'none')) return false;
      const u = f.slice(-6);
      return u.length === 6 && u.every((q) => q.camadas === 0 && q.vis === 'visible');
    }, null, { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => { window.__fita = []; });
    await p.evaluate(() => window.ir('montagem'));
    await p.waitForTimeout(600);
    /* 🔴 O TOQUE É O DE VERDADE, o botão é que é emprestado. Quem dispara
       `montarRota` é o ouvinte de clique em `[data-acao]` — o mesmo pra qualquer
       botão da casa. O "Montar rota" do pé da Montagem só existe com a lista
       montada pelo servidor, e encher aquela lista é dublar meia API pra medir
       uma coisa que não é dela: o que está sob prova aqui é "rota criada faz a
       cena voltar", não o dock da Montagem. Então o clique entra pela porta
       real, com um botão descartável. */
    await p.evaluate(() => {
      const b = document.createElement('button');
      b.setAttribute('data-acao', 'montar-agora');
      document.body.appendChild(b);
      b.click();
      b.remove();
    });
    await p.waitForTimeout(1500);
    const fora = await p.evaluate(() => ({
      cena: (window.__fita || []).some((q) => q.camadas > 0),
      quando: (window.__fita || []).slice(0, 8).map((q) => `${q.t - (window.__fita[0] || {}).t}:${q.camadas}:${q.vis}:${q.caixa}:${q.telas}`),
      tela: (typeof window.telaAtual === 'function' && window.telaAtual()) || document.body.dataset.tela || '?',
      temPalco: !!document.querySelector('.mapa-palco[data-mapa="geral"]'),
    }));
    eh('5.1 a cena NAO toca fora da tela do mapa', !fora.cena,
      `tela=${fora.tela} palco=${fora.temPalco} em=${JSON.stringify(fora.quando)}`);
    await p.evaluate(() => window.ir('rota'));
    const fita = await fitaDe(p, 6000);
    eh('5.2 rota nova: a cena roda ao voltar pro mapa', fita.some((q) => q.camadas > 0),
      `${fita.filter((q) => q.camadas > 0).length} quadros com cena`);
    eh('5.3 rota nova: SEM cartao de coordenada (isso é da entrada)', fita.every((q) => !q.cartao));
    const fim = fita[fita.length - 1];
    eh('5.4 rota nova: o mundo volta no fim', !!fim && fim.vis === 'visible', fim ? fim.vis : '—');
    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n=== A CENA DAS RUAS ===');
  ok.forEach((l) => console.log('  ✓ ' + l));
  if (falhou.length) {
    console.log('\n=== REPROVADO ===');
    falhou.forEach((l) => console.log('  ✗ ' + l));
  }
  console.log(`\n${ok.length}/${ok.length + falhou.length} passaram`);
  process.exit(falhou.length ? 1 : 0);
})();
