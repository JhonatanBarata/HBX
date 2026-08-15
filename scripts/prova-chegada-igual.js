#!/usr/bin/env node
/**
 * O PORTÃO DE IGUALDADE — LOTE 3 (PR15082026-LOTE3-CHEGADA-DESENHO).
 *
 *     node scripts/prova-chegada-igual.js
 *     node scripts/prova-chegada-igual.js --antes    (só MEDE, não reprova)
 *
 * Ordem do dono (15/08): *"a tela que é impressa ao chegar no cliente no 2d e
 * 3d tem que ser IGUAL"* + *"é para abrir na frente sim"*. Este portão mede
 * isso, não a olho: o "Você chegou" tem que ser O MESMO NÓ nos dois palcos
 * (rota=2D, mapa=3D), abrir SEM trocar de tela, sobreviver ao repinte sem
 * reanimar, ficar ACIMA do cromo de tela e ABAIXO de um portão legítimo, e
 * devolver o motorista pro palco de onde ele chegou.
 *
 * 🔴 ARMADILHA Nº1 DO PRÓPRIO PORTÃO: `null === null` é verdade. A igualdade
 * de HTML é escrita `!!html2D && !!html3D && html2D === html3D` — senão esta
 * prova passa VERDE hoje, com zero cartão nos dois lados.
 *
 * Bancada igual à do `prova-navegar`/`prova-mapa-2d`: servidor estático dos
 * gerados + pele fresca direto do MOCK-FONTE (`addStyleTag`, depois do load) +
 * dublê do `window.HBX` DEPOIS do boot (o `native.js` engoliria addInitScript).
 * Geolocalização é a DE VERDADE do Playwright (`permissions`+`geolocation`
 * com `accuracy`) — é o que enche o "GPS ±N m" sem dublê caseiro.
 *
 * 🔴 REGENERA OS GERADOS ANTES DE MEDIR. `ponte-costurar` + `casca-injetar`
 * rodam no início deste arquivo — sem isso a prova mediria `ponte.js`/
 * `mock.js` de uma versão anterior da fonte, e um vermelho de verdade passaria
 * verde por estar testando código velho.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const RAIZ_APP = path.join(RAIZ, 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(RAIZ, 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const SO_MEDIR = process.argv.includes('--antes');
const SEM_REGERAR = process.argv.includes('--sem-regerar'); // só pra depurar a própria prova

function regenerarGerados() {
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'ponte-costurar.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'casca-injetar.js')], { stdio: 'inherit' });
}

function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  const i = txt.indexOf('<style>'); const f = txt.indexOf('</style>');
  if (i < 0 || f < 0) throw new Error('mock sem bloco <style>');
  return txt.slice(i + 7, f);
}

function servir() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RAIZ_APP, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, b) => {
        if (e) { res.writeHead(404); res.end(''); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
        res.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve([s, s.address().port]));
  });
}

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/* A PORTA DA PARADA 1 — onde o Playwright bota o motorista de verdade. */
const PORTA1 = { lat: -22.4000, lng: -47.5500 };
const P1 = {
  id: 'e1', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', valorHoje: 12,
  itens: [{ id: 'i1', qtdPrevista: 2, valorUnit: 6, produto: { id: 'p1', nome: 'Galao 20L' } }],
  cliente: {
    id: 'c1', nome: 'Gislaine Aparecida', endereco: 'Rua 3a, 1354', cidade: 'Rio Claro',
    lat: PORTA1.lat, lng: PORTA1.lng,
  },
};
const P2 = {
  id: 'e2', status: 'agendada', rotaOrdem: 2, origem: 'recorrente', valorHoje: 18,
  itens: [{ id: 'i2', qtdPrevista: 3, valorUnit: 6, produto: { id: 'p1', nome: 'Galao 20L' } }],
  cliente: { id: 'c2', nome: 'Ademir', endereco: 'Av. 28a, 507', cidade: 'Rio Claro', lat: -22.4100, lng: -47.5600 },
};

/** o dublê do `window.HBX` — mesma receita do `prova-chegada.js` */
const PONTE = ({ hoje, entregas }) => {
  window.__erros = [];
  window.__chamadas = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
  const S = { hoje, entregas: (entregas || []).map((e) => JSON.parse(JSON.stringify(e))) };
  window.__S = S;
  const antigo = window.HBX || {};
  window.HBX = Object.assign({}, antigo, {
    activateRoute() {}, stopRoute() {}, requestLocationPermission() {},
    manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo]);
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
      if (caminho.indexOf('/logistica/config') === 0) {
        return R({ appModulosDesativados: '', raioChegadaM: 60, moduloFinanceiroAtivo: false, cobrancaSimples: true });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) return R({ creditosAIniciar: 1 });
      if (caminho.indexOf('/logistica/fechamento/resumo') === 0) return R({ fechamento: { totalCents: 0, formas: [] } });
      if (caminho.indexOf('/logistica/rota/continuidade') === 0) return R({});
      if (caminho.indexOf('/credits/me') === 0) return R({ balance: 100 });
      const mConf = /^\/logistica\/entregas\/([^/]+)\/confirmar/.exec(caminho);
      if (mConf) {
        const alvo = S.entregas.find((e) => e.id === mConf[1]);
        if (alvo) alvo.status = 'entregue';
        return R({ ok: true });
      }
      const mCanc = /^\/logistica\/entregas\/([^/]+)\/cancelar/.exec(caminho);
      if (mCanc) {
        const alvo = S.entregas.find((e) => e.id === mCanc[1]);
        if (alvo) alvo.status = 'cancelada';
        return R({ ok: true });
      }
      if (caminho.indexOf('/nucleo/clientes') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/cliente-produtos') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/rota') === 0) {
        return R({
          date: S.hoje, total: S.entregas.length, routeStatus: 'ACTIVE', routeId: 'rota-op-1',
          trackingRequired: false, trackingSessionId: null, moduloFinanceiroAtivo: false,
          avisoChegandoAtivo: false, avisoChegandoDistanciaM: 500,
          items: S.entregas.map((e) => JSON.parse(JSON.stringify(e))),
        });
      }
      return R({});
    },
  });
};

/** o que se lê do cartão: HTML byte a byte, pintura resolvida nó a nó, estrutura. */
const CAPTURAR = () => {
  const wrap = document.querySelector('.chegou-wrap');
  if (!wrap) return { existe: false };
  const cartao = wrap.querySelector('.chegou-cartao');
  const nos = [wrap, ...wrap.querySelectorAll('*')];
  const pintura = nos.map((n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return [
      n.tagName, n.className,
      cs.backgroundColor, cs.color, cs.borderColor, cs.borderWidth, cs.borderRadius,
      cs.boxShadow, cs.fontSize, cs.fontWeight, cs.opacity, cs.zIndex, cs.display,
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
    ].join('|');
  });
  return {
    existe: true,
    html: wrap.outerHTML,
    pintura,
    estrutura: nos.map((n) => `${n.tagName}.${n.className}`).join(';'),
    zIndex: getComputedStyle(wrap).zIndex,
    remontado: wrap.classList.contains('remontado'),
    temCartao: !!cartao,
  };
};

const TELA = () => { try { return atual; } catch (e) { return null; } };

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, detalhe) => (cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`));
const nota = (t) => notas.push(t);
/* A ARMADILHA Nº1: nunca `a === b` pelado quando os dois podem ser undefined
   ou null — os dois lados têm que EXISTIR antes de a igualdade valer algo. */
const iguais = (a, b) => !!a && !!b && a === b;

async function abrirContexto(navegador, porta, pele, { luz, geo }) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    permissions: ['geolocation'],
    geolocation: { latitude: (geo || PORTA1).lat, longitude: (geo || PORTA1).lng, accuracy: 12 },
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.waitForTimeout(500);
  await p.addStyleTag({ content: pele });
  await p.evaluate(PONTE, { hoje: HOJE, entregas: [P1, P2] });
  await p.waitForTimeout(300);
  if (luz === 'claro') await p.evaluate(() => { document.documentElement.dataset.luz = 'claro'; });
  await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
  await p.waitForTimeout(900);
  await p.evaluate(() => window.ir('rota'));
  // o watchPosition do Playwright precisa de um instante pra entregar o 1º
  // fix — é ele que enche o "GPS ±N m" do cartão.
  await p.waitForTimeout(1200);
  return { ctx, p, erros };
}

const irPalco = async (p, palco) => {
  if (palco === 'mapa') {
    await p.evaluate(() => window.ir('mapa'));
    // a descida 2D→3D (DESCIDA_MS=1800) + a cena das ruas: dá tempo de assentar
    // antes de medir, senão a prova mediria um mapa ainda em movimento.
    await p.waitForTimeout(2600);
  } else {
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(500);
  }
};

const chegar = (p, id) => p.evaluate((d) => {
  document.dispatchEvent(new CustomEvent('hbx:arrival', { detail: { deliveryId: d } }));
}, id);

/* 🔴 A FOTO NÃO PODE INCLUIR O CANTO ARREDONDADO. `.chegou-cartao` tem
   `border-radius:17px`; um `elementHandle.screenshot()` captura o
   RETÂNGULO inteiro, e os 4 cantos fora do arco não são pintados pela peça
   — mostram o que está ATRÁS (o véu translúcido do `.chegou-wrap`, que por
   sua vez deixa passar a cor do mapa 2D ou 3D de baixo, cada um com um tile
   diferente). HTML e pintura (getComputedStyle) já provam a peça idêntica
   byte a byte; a foto mede o resto — então ela recorta um retângulo
   ENCOLHIDO (inset 20px, bem maior que o raio) pra medir só o miolo sólido
   da peça, sem o ruído do que está atrás dos 4 cantos. */
const shaDoElemento = async (p, seletor, inset) => {
  const box = await p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, seletor);
  if (!box) return null;
  const i = inset || 0;
  const clip = {
    x: box.x + i, y: box.y + i,
    width: Math.max(1, box.width - (2 * i)), height: Math.max(1, box.height - (2 * i)),
  };
  const buf = await p.screenshot({ clip });
  return crypto.createHash('sha1').update(buf).digest('hex');
};

/* contraste WCAG — roda DENTRO da página, é ela que sabe a cor resolvida. */
const CONTRASTE = () => {
  const parseRGB = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : [0, 0, 0];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const razao = (fg, bg) => {
    const [a, b] = [lum(parseRGB(fg)), lum(parseRGB(bg))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  const cartao = document.querySelector('.chegou-cartao');
  if (!cartao) return null;
  const bgCartao = getComputedStyle(cartao).backgroundColor;
  const medir = (sel) => {
    const el = cartao.querySelector(sel);
    if (!el) return null;
    return razao(getComputedStyle(el).color, bgCartao);
  };
  const seta = cartao.querySelector('.seta');
  const bordaCor = getComputedStyle(cartao).borderColor;
  const bordaWidth = parseFloat(getComputedStyle(cartao).borderWidth) || 0;
  return {
    dist: medir('.dist'),      // texto grande (24px/650) — piso 3,0
    verbo: medir('.verbo'),    // 19px/500 — conta como "grande" — piso 3,0
    baixo: medir('.baixo') || medir('.sub'),  // texto pequeno — piso 4,5
    icone: seta ? razao(getComputedStyle(seta).color, getComputedStyle(seta).backgroundColor) : null,
    bordaVisivel: bordaWidth > 0 && bordaCor !== 'rgba(0, 0, 0, 0)' && bordaCor !== bgCartao,
  };
};

(async () => {
  if (!SEM_REGERAR) {
    console.log('[prova-chegada-igual] regenerando ponte.js + mock.js/index.html…');
    regenerarGerados();
  }
  const [srv, porta] = await servir();
  const pele = peleDoMock();
  const navegador = await chromium.launch();

  /* ======================================================================
     LAÇO PRINCIPAL — 2 modos de luz × 2 palcos. É aqui que existência,
     não-troca-de-tela, HTML/pintura/foto e camada são medidos.
     ====================================================================== */
  const capturas = {}; // chave `${luz}|${palco}` → { tela0, tela1, cap, sha, camada }

  for (const luz of ['escuro', 'claro']) {
    for (const palco of ['rota', 'mapa']) {
      const chave = `${luz}|${palco}`;
      const { ctx, p, erros } = await abrirContexto(navegador, porta, pele, { luz });
      await irPalco(p, palco);
      const tela0 = await p.evaluate(TELA);
      await chegar(p, 'e1');
      await p.waitForTimeout(900);
      const tela1 = await p.evaluate(TELA);
      const cap = await p.evaluate(CAPTURAR);
      const sha = cap.existe ? await shaDoElemento(p, '.chegou-cartao', 20) : null;
      const contraste = cap.existe ? await p.evaluate(CONTRASTE) : null;

      // CAMADA: acima do dock/nav, e abaixo de um portão legítimo aberto por cima.
      let camada = null;
      if (cap.existe) {
        camada = await p.evaluate(() => {
          const wrap = document.querySelector('.chegou-wrap');
          const nav = document.querySelector('.nav');
          const dock = document.querySelector('.tmx-dock');
          const cartao = wrap.querySelector('.chegou-cartao');
          const r = cartao.getBoundingClientRect();
          const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
          const antesTopo = document.elementFromPoint(cx, cy);
          const dentroAntes = !!(antesTopo && antesTopo.closest('.chegou-cartao'));
          window.portao('creditos');
          const depoisTopo = document.elementFromPoint(cx, cy);
          const dentroDepois = !!(depoisTopo && depoisTopo.closest('.chegou-cartao'));
          const zChegou = Number(getComputedStyle(wrap).zIndex);
          const zPortao = (() => {
            const pw = document.querySelector('.portao-wrap');
            return pw ? Number(getComputedStyle(pw).zIndex) : null;
          })();
          document.querySelectorAll('.portao-wrap').forEach((n) => n.remove()); // limpa pro resto da prova
          return {
            zChegou,
            zNav: nav ? Number(getComputedStyle(nav).zIndex) : null,
            zDock: dock ? Number(getComputedStyle(dock).zIndex) : null,
            zPortao,
            dentroAntes, dentroDepois,
          };
        });
      }

      // REPINTE: sobrevive sem reanimar — a MESMA instância de nó, marcada .remontado.
      let sobreviveu = null;
      if (cap.existe) {
        await p.evaluate(() => { document.querySelector('.chegou-wrap').__marcaProva = 'x'; });
        await p.evaluate(() => window.usarDados('rota', { kpiEntregues: String(Math.random()) }));
        await p.waitForTimeout(400);
        sobreviveu = await p.evaluate(() => {
          const w = document.querySelector('.chegou-wrap');
          return { existe: !!w, mesmoNo: !!(w && w.__marcaProva === 'x'), remontado: !!(w && w.classList.contains('remontado')) };
        });
      }

      // AÇÃO PRINCIPAL + VOLTA AO PALCO DE ORIGEM.
      let acaoPrincipal = null; let voltaPalco = null;
      if (cap.existe) {
        await p.evaluate(() => {
          const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
          if (b) b.click();
        });
        await p.waitForTimeout(700);
        const telaFolha = await p.evaluate(TELA);
        const corpo = await p.evaluate(() => (document.querySelector('.body') || {}).textContent || '');
        acaoPrincipal = { tela: telaFolha, temNome: /Gislaine/.test(corpo) };
        await p.evaluate(() => {
          const alvo = [...document.querySelectorAll('[data-acao]')]
            .find((e) => /^(confirmar-venda|entregue-pagou)$/.test(e.dataset.acao || ''));
          if (alvo) alvo.click();
        });
        await p.waitForTimeout(1000);
        voltaPalco = await p.evaluate(TELA);
      }

      capturas[chave] = { tela0, tela1, cap, sha, contraste, camada, sobreviveu, acaoPrincipal, voltaPalco, erros };
      nota(`[${chave}] tela0=${tela0} tela1=${tela1} existe=${cap.existe} zIndex=${cap.zIndex || '-'}`);
      await ctx.close();
    }
  }

  // ---- existência + não-troca-de-tela, nos 4 quadrantes -------------------
  ['escuro', 'claro'].forEach((luz) => {
    ['rota', 'mapa'].forEach((palco) => {
      const c = capturas[`${luz}|${palco}`];
      eh(`existe · ${luz}/${palco}`, c.cap.existe, `tela0=${c.tela0}`);
      eh(`não troca de tela · ${luz}/${palco}`, c.tela1 === c.tela0, `${c.tela0}→${c.tela1}`);
      eh(`zero pageerror · ${luz}/${palco}`, c.erros.length === 0, c.erros[0] || '');
    });
  });

  // ---- HTML/pintura/foto IDÊNTICOS entre palcos, no MESMO modo de luz -----
  ['escuro', 'claro'].forEach((luz) => {
    const r = capturas[`${luz}|rota`]; const m = capturas[`${luz}|mapa`];
    eh(`HTML idêntico 2D×3D (${luz})`, iguais(r.cap.html, m.cap.html));
    eh(`pintura idêntica 2D×3D (${luz})`,
      iguais(r.cap.pintura && r.cap.pintura.join('~~'), m.cap.pintura && m.cap.pintura.join('~~')));
    eh(`foto idêntica 2D×3D (${luz})`, iguais(r.sha, m.sha), `${r.sha} × ${m.sha}`);
  });

  // ---- estrutura igual entre os 2 modos de luz (cor pode mudar, forma não) ----
  {
    const escuro = capturas['escuro|rota']; const claro = capturas['claro|rota'];
    eh('estrutura igual entre modos de luz', iguais(escuro.cap.estrutura, claro.cap.estrutura));
  }

  // ---- camada: acima de dock/nav, abaixo de um portão legítimo ------------
  {
    const c = capturas['escuro|rota'].camada;
    eh('z-index 56 (acima do cromo de tela)', !!c && c.zChegou === 56, JSON.stringify(c));
    eh('fica acima do dock/nav', !!c && c.zChegou > (c.zNav || 0) && c.zChegou > (c.zDock || 0));
    eh('fica ABAIXO de um portão legítimo', !!c && c.zPortao != null && c.zChegou < c.zPortao);
    eh('portão legítimo GANHA o toque (elementFromPoint)', !!c && c.dentroAntes && !c.dentroDepois,
      JSON.stringify(c));
  }

  // ---- repinte não reencena nem derruba ------------------------------------
  {
    const s = capturas['escuro|mapa'].sobreviveu; // no 3D o fix chega 1x/s: é o caso que mais pisca
    eh('repinte não derruba a peça (mesmo nó)', !!s && s.existe && s.mesmoNo, JSON.stringify(s));
    eh('repinte marca .remontado (desliga a animação)', !!s && s.remontado, JSON.stringify(s));
  }
  {
    const primeiro = capturas['escuro|rota'].cap;
    eh('nasce SEM .remontado (entrada acontece 1x)', primeiro.existe && primeiro.remontado === false);
  }

  // ---- ação principal abre a folha pela porta de hoje ----------------------
  ['rota', 'mapa'].forEach((palco) => {
    const c = capturas[`escuro|${palco}`];
    const a = c.acaoPrincipal;
    eh(`ação principal abre a folha (${palco})`, !!a && (a.tela === 'venda' || a.tela === 'folha') && a.temNome,
      JSON.stringify(a));
    eh(`confirmar volta ao palco de origem (${palco})`, c.voltaPalco === palco, `voltou=${c.voltaPalco}`);
  });

  // ---- contraste --------------------------------------------------------
  ['escuro', 'claro'].forEach((luz) => {
    const ct = capturas[`${luz}|rota`].contraste;
    eh(`contraste do texto grande ≥3,0 (${luz})`, !!ct && ct.dist >= 3 && ct.verbo >= 3, JSON.stringify(ct));
    eh(`contraste do texto pequeno ≥4,5 (${luz})`, !!ct && (ct.baixo == null || ct.baixo >= 4.5), JSON.stringify(ct));
    eh(`contraste do ícone ≥3,0 (${luz})`, !!ct && ct.icone != null && ct.icone >= 3, JSON.stringify(ct));
    eh(`borda legível sobre o mapa (${luz})`, !!ct && ct.bordaVisivel, JSON.stringify(ct));
  });

  /* ========================================================================
     CENÁRIOS DE COMPORTAMENTO — 1x cada (não precisam do laço 2×2)
     ======================================================================== */

  // ---- T.mapachegou não existe mais ---------------------------------------
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    const existeAinda = await p.evaluate(() => {
      try { return typeof T !== 'undefined' && typeof T.mapachegou !== 'undefined'; } catch (e) { return true; }
    });
    eh('T.mapachegou não existe mais', existeAinda === false);
    await ctx.close();
  }

  // ---- dispensar não apaga a chegada ---------------------------------------
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await chegar(p, 'e1');
    await p.waitForTimeout(700);
    const antesChamadas = await p.evaluate(() => window.__chamadas.length);
    await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="chegada-dispensar"]');
      if (b) b.click();
    });
    await p.waitForTimeout(500);
    const r = await p.evaluate((qtdAntes) => ({
      wrapSumiu: !document.querySelector('.chegou-wrap'),
      chegadaNoCache: !!(window.HBX.cache && window.HBX.cache.get('chegada:e1', null)),
      pinoAmbar: (() => { try { return !!(PARADAS.find((x) => String(x.id) === 'e1') || {}).chegou; } catch (e) { return null; } })(),
      novasChamadas: window.__chamadas.length - qtdAntes,
    }), antesChamadas);
    eh('dispensar fecha o cartão', r.wrapSumiu, JSON.stringify(r));
    eh('dispensar NÃO apaga chegada:<id> do cache', r.chegadaNoCache, JSON.stringify(r));
    eh('dispensar NÃO fala com o servidor', r.novasChamadas === 0, JSON.stringify(r));
    await ctx.close();
  }

  // ---- 2ª chegada não troca o cliente debaixo do dedo ----------------------
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await chegar(p, 'e1');
    await p.waitForTimeout(700);
    await chegar(p, 'e2');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
      return { paradaAtual: b ? b.dataset.parada : null };
    });
    eh('2ª chegada não troca o cliente', r.paradaAtual === 'e1', JSON.stringify(r));
    await ctx.close();
  }

  // ---- chegada com folha já aberta segue ignorada --------------------------
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await p.evaluate(() => window.ir('rotalista'));
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const b = document.querySelector('[data-acao="abrir-parada"][data-parada="e1"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    const telaAntes = await p.evaluate(TELA);
    await chegar(p, 'e2');
    await p.waitForTimeout(600);
    const telaDepois = await p.evaluate(TELA);
    const wrapExiste = await p.evaluate(() => !!document.querySelector('.chegou-wrap'));
    eh('chegada com folha aberta segue ignorada', telaDepois === telaAntes && !wrapExiste,
      `tela ${telaAntes}→${telaDepois} · wrap=${wrapExiste}`);
    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: chegada igual (2D × 3D) ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})().catch((e) => {
  console.error('\n❌ prova-chegada-igual explodiu:', e && (e.stack || e.message || e));
  process.exit(1);
});
