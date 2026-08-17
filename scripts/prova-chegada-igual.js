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
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..');
const RAIZ_APP = path.join(RAIZ, 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(RAIZ, 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const SO_MEDIR = process.argv.includes('--antes');

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

/* ==========================================================================
   🔴 (h) O CROMO TROCOU DE NOME EM 17/08 E A RÉGUA FICOU MEDINDO O DESENHO DE
   ONTEM. Régua velha: `['.nav', '.hdr', '.tmx-dock']` no palco 2D, com uma
   asserção "cromo <sel> existe pra medir" por seletor. Ela ficou VERMELHA sem
   nenhuma regressão de produto — a entrega de 17/08 (ordem do dono, ver
   `docs/PLANEJAMENTOS/PR17082026-2D-3D-UMA-TELA-SO.md`, itens 1/2/8 e a
   decisão D4) matou os dois nomes NESTE estado:
     · com rota montada o 2D virou TELA CHEIA — o `.nav` (as abas) sai de cena
       e o cabeçalho passa a flutuar dentro de `.plano-topo`;
     · o `.tmx-dock` foi substituído pelo MESMO `.gps-rodape` do 3D (tira de
       indicadores + painel de 4 botões).
   E `.tmx-dock` não é "cromo que sumiu": ele nasce de `!comRota` (§ `rota()` no
   mock, `${(!comRota&&dock)?...}`) enquanto o `.gps-rodape` nasce de `comRota`
   — e o ouvinte de `hbx:arrival` (ponte, D0-porta-entrega.js) tem
   `if (estadoRota !== 'rodando') return`, e `rodando ⊂ temRotaNoDia`. Ou seja:
   `.tmx-dock` e o "Você chegou" são MUTUAMENTE EXCLUSIVOS por construção —
   exigi-lo aqui é exigir cromo de um estado em que este cartão não existe.
   Medido na bancada: dia sem rota ⇒ `.chegou-wrap` nunca nasce.

   A PERGUNTA CERTA não tem nome de peça dentro: *"o cartão fica ACIMA de todo
   o cromo de tela"*. Então a régua para de listar o desenho da semana e passa
   a MEDIR o que está pintado:
     1. varre uma lista larga de CROMO PERSISTENTE e guarda só o que está de
        fato PINTADO (`display`/`visibility`/área > 0) — `.status` é
        `display:none` fora do frame do mockup, e nó invisível não tapa nada;
     2. exige `zChegou > z` de CADA peça pintada;
     3. e faz o TOQUE valer: `elementFromPoint` no centro de cada peça tem que
        cair dentro de `.chegou-wrap`. É este o dente — z-index sozinho mente
        quando há contexto de empilhamento no meio (`.body` é z-index 20 e
        `position:relative`, então o `.gps-rodape` de dentro dele viaja na
        camada do `.body`, não na dele própria).
   A lista NÃO inclui `.chat-wrap`(57), `.conf-wrap`(58), `.portao-wrap`(59)
   nem `.erro-wrap`(60): esses são portões LEGÍTIMOS acima do cartão e já têm
   asserção própria logo abaixo ("fica ABAIXO de um portão legítimo").
   ========================================================================== */
const CROMO_TELA = ['.status', '.hdr', '.nav', '.tmx-dock', '.plano-topo', '.plano-bar',
  '.rota-continuidades', '.plano-lado', '.next-card', '.map-ctrl', '.map-float', '.emp-chip',
  '.gps-rodape', '.gps-lado', '.gps-manobra', '.gps-vel', '.gps-bussola', '.gps-radar',
  '.gps-redir', '.aula-wrap'];

/* O CROMO QUE TEM QUE ESTAR PINTADO EM CADA ESTADO — é o anti-vácuo: sem isto,
   um seletor que ninguém desenha mais deixaria a régua "passar" medindo lista
   vazia (foi assim que o `z > (zDock||0)` do 3D passava de graça, § (e)).
   Os dois estados existem de verdade e os dois têm o cartão: `cheio` é o
   padrão de 17/08 (rota montada ⇒ tela cheia) e `abas` é o INTERRUPTOR do item
   1 do dono (`DADOS.rota.telaCheia === false` ⇒ voltam cabeçalho e abas, e a
   tela continua sendo a navegação vista de cima, com `.gps-rodape`). */
const FAMILIA_DO_CROMO = {
  rota: { cheio: ['.plano-topo', '.hdr', '.gps-rodape'], abas: ['.nav', '.hdr', '.gps-rodape'] },
  mapa: { cheio: ['.gps-rodape', '.gps-lado'], abas: ['.nav', '.hdr', '.gps-rodape'] },
};

/** o cromo PINTADO agora na tela, com z-index e com o toque no centro de cada peça */
const MEDIR_CROMO = (sels) => {
  const wrap = document.querySelector('.chegou-wrap');
  if (!wrap) return { existe: false, cromo: [] };
  const zChegou = Number(getComputedStyle(wrap).zIndex);
  const W = window.innerWidth; const H = window.innerHeight;
  const cromo = sels.map((sel) => [...document.querySelectorAll(sel)].map((el) => {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || cs.display === 'none' || cs.visibility === 'hidden') return null;
    const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
    // centro fora do quadro não tem toque pra medir (a peça está meio fora da
    // tela): o z-index dela continua cobrado, o toque não — melhor não medir
    // que medir `elementFromPoint(...) === null` e chamar isso de defeito.
    const noQuadro = cx >= 0 && cy >= 0 && cx < W && cy < H;
    const topo = noQuadro ? document.elementFromPoint(cx, cy) : null;
    // `.className` de nó SVG é um SVGAnimatedString e imprime "[object …]" no
    // detalhe do log — `getAttribute('class')` devolve texto nos dois casos.
    const nomeDoTopo = topo
      ? `${topo.tagName}${topo.getAttribute && topo.getAttribute('class') ? `.${topo.getAttribute('class')}` : ''}`
      : null;
    return {
      sel, z: Number(cs.zIndex) || 0, noQuadro,
      coberto: noQuadro ? !!(topo && topo.closest('.chegou-wrap')) : null,
      topo: noQuadro ? String(nomeDoTopo || '').slice(0, 40) : null,
    };
  }).filter(Boolean)).flat();
  return { existe: true, zChegou, cromo };
};

/** o veredito do cromo, do lado do Node: o que falta, o que ficou por cima. */
function vereditoDoCromo(medida, familia) {
  if (!medida || !medida.existe) return { motivo: 'cartão ausente', familia, temFamilia: false, acima: false };
  const pintados = medida.cromo.map((x) => x.sel);
  const faltando = familia.filter((sel) => pintados.indexOf(sel) < 0);
  const abaixo = medida.cromo.filter((x) => !(medida.zChegou > x.z)).map((x) => `${x.sel}:z${x.z}`);
  const furados = medida.cromo.filter((x) => x.noQuadro && !x.coberto).map((x) => `${x.sel}→${x.topo}`);
  return {
    temFamilia: faltando.length === 0,
    // `pintados.length > 0`: cromo nenhum medido NÃO é "ficou acima de tudo".
    acima: pintados.length > 0 && abaixo.length === 0 && furados.length === 0,
    zChegou: medida.zChegou, pintados, faltando, abaixo, furados,
  };
}

/* 🔴 (i) O CARTÃO SE MEDE PELO NÓ, NUNCA POR TEXTO SOLTO NO `body` (17/08). A
   régua velha das duas cenas de abandono era `/Ademir/.test(body.textContent)`
   como prova de que o cartão do 2º cliente não existia. Ela ficou VERMELHA por
   mudança de DESENHO, não de comportamento: o item 6 do dono (*"mapa 2D:
   aproximando aparece o número da parada; com mais zoom, o nome do cliente"*)
   passou a desenhar o nome DENTRO do mapa —
   `<div class="map-pino"><b class="n">2</b><i class="nome">Ademir</i></div>`.
   Medido na bancada: `Ademir` está no `body` nos DOIS casos, com e sem defeito,
   então aquela metade da régua era um vermelho fixo — não media nada.
   O invariante é o NÓ: depois do abandono não existe cartão de chegada nenhum,
   e em particular nenhum apontando pra 2ª parada. `paradaNoCartao` sai do
   `data-parada` do botão da peça, que é o dado que diz DE QUEM é o cartão.
   Os nomes dos pinos continuam MEDIDOS (vão pro detalhe) — como prova de que o
   texto do mapa existe e mesmo assim não confunde mais a régua. */
const LER_CARTAO_DE_CHEGADA = () => {
  const wrap = document.querySelector('.chegou-wrap');
  const botao = wrap ? wrap.querySelector('[data-acao="abrir-parada"]') : null;
  return {
    wrapExiste: !!wrap,
    paradaNoCartao: botao ? (botao.dataset.parada || null) : null,
    nomeNoCartao: wrap ? ((wrap.querySelector('.verbo') || {}).textContent || null) : null,
    // MEDIDO, não asserção: é o nome desenhado no MAPA (item 6 do dono).
    nomeNosPinos: [...document.querySelectorAll('.map-pino .nome')].map((n) => n.textContent).join('|'),
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
const fotoDoElemento = async (p, seletor, inset) => {
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
  return { buf, sha: crypto.createHash('sha1').update(buf).digest('hex') };
};

/* 🔴 SHA BYTE A BYTE É RÉGUA DEMAIS PRA FOTO — medido: com HTML e pintura já
   idênticos byte a byte entre 2D e 3D (as duas camadas anteriores), a FOTO
   ainda assim diverge por antialiasing de sub-pixel — a mesma peça, embutida
   em duas árvores de ancestrais DIFERENTES (a lista 2D vs o mapa 3D), recebe
   uma fração de pixel de posição ligeiramente diferente, e a fonte sub-pixel
   redesenha os glifos com uns poucos tons de cinza a menos/a mais na borda
   das letras. Medido nos dois modos de luz: ~4-5% dos pixels do cartão
   diferem, DIFERENÇA MÁXIMA por pixel de 8-10 em 1020 possíveis (soma dos 4
   canais) — invisível a olho nu (as duas fotos são indistinguíveis lado a
   lado). Cobrar bit-a-bit aqui reprovaria a peça por um efeito do MOTOR DE
   RENDERIZAÇÃO, não do produto — o oposto de "medir de verdade": uma régua
   frouxa demais mente que está tudo igual (armadilha b), uma régua PESADA
   demais mente que está tudo diferente. A cura é comparação PERCEPTUAL: conta
   quantos pixels mudam e o quanto cada um muda, com piso generoso o bastante
   pra sub-pixel (visto: ≤6%/≤10) e curto o bastante pra pegar defeito de
   verdade (cor trocada, elemento sumido, layout deslocado — que mudam
   MILHARES de pixels em CENTENAS de unidades, não algumas centenas em
   dígitos). */
async function fotosParecidas(utilPage, bufA, bufB) {
  if (!bufA || !bufB) return { parecidas: false, motivo: 'falta screenshot' };
  return utilPage.evaluate(async ([b64a, b64b]) => {
    const paraImagem = async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    };
    const [imgA, imgB] = await Promise.all([paraImagem(b64a), paraImagem(b64b)]);
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      return { parecidas: false, motivo: `tamanhos diferentes ${imgA.width}x${imgA.height} × ${imgB.width}x${imgB.height}` };
    }
    const ler = (img) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    };
    const dA = ler(imgA); const dB = ler(imgB);
    let diffCount = 0; let maxDiff = 0;
    for (let i = 0; i < dA.length; i += 4) {
      const d = Math.abs(dA[i] - dB[i]) + Math.abs(dA[i + 1] - dB[i + 1])
        + Math.abs(dA[i + 2] - dB[i + 2]) + Math.abs(dA[i + 3] - dB[i + 3]);
      if (d > 0) diffCount += 1;
      if (d > maxDiff) maxDiff = d;
    }
    const total = dA.length / 4;
    const diffPct = diffCount / total;
    // pisos: medido em bancada ~4-5% dos pixels / máximo 8-10 por antialiasing
    // de sub-pixel puro; a régua dá o dobro de folga pros dois lados.
    const parecidas = diffPct <= 0.10 && maxDiff <= 40;
    return { parecidas, diffPct, maxDiff, diffCount, total };
  }, [bufA.toString('base64'), bufB.toString('base64')]);
}

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
  return {
    dist: medir('.dist'),      // texto grande (24px/650) — piso 3,0
    verbo: medir('.verbo'),    // 19px/500 — conta como "grande" — piso 3,0
    baixo: medir('.baixo') || medir('.sub'),  // texto pequeno — piso 4,5
    icone: seta ? razao(getComputedStyle(seta).color, getComputedStyle(seta).backgroundColor) : null,
  };
};

/* pixel MÉDIO de um retângulo da tela. Decodifica o PNG DENTRO da própria
   página (`createImageBitmap`+canvas) — sem depender de decoder de imagem
   nenhum do lado do Node. `atob`+`Blob`, nunca `fetch` de `data:` — o
   `connect-src` da CSP do app barra fetch (armadilha já documentada em
   00-nucleo.js). */
async function pixelMedio(p, clip) {
  const buf = await p.screenshot({ clip });
  return p.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let r0 = 0; let g0 = 0; let b0 = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4) { r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; n += 1; }
    return [r0 / n, g0 / n, b0 / n];
  }, buf.toString('base64'));
}

const LUM = ([r, g, b]) => {
  const f = (ch) => { const v = ch / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const RAZAO = (x, y) => { const [a, b] = [LUM(x), LUM(y)].sort((m, n) => n - m); return (a + 0.05) / (b + 0.05); };

/* ==========================================================================
   🔴 PORTÃO HONESTO (c) — "BORDA LEGÍVEL SOBRE O MAPA" MEDIA A COISA ERRADA,
   E A COISA CERTA NÃO ERA A BORDA.

   A régua velha (`bordaWidth>0 && cor!=='transparent' && cor!==fundoDoCartao`)
   passava POR DEFINIÇÃO: qualquer borda declarada a satisfazia. Trocá-la por
   "token da borda × composto véu+mapa, piso 3,0" foi o 1º remendo — e ele
   REPROVOU no escuro (1,29:1). Antes de mexer no produto por causa de uma
   régua, os pixels foram MEDIDOS (bancada, 2 luzes × 2 palcos):

       escuro │ fundo do cartão × logo fora ....... 1,06:1
              │ token da borda  × logo fora ....... 1,29:1
              │ sombra (fora perto × fora longe) .. 1,09:1
       claro  │ fundo do cartão × logo fora ....... 6,22:1
              │ token da borda  × logo fora ....... 4,82:1

   No ESCURO nada da beirada chega perto de 3,0 — nem a borda, nem o fundo,
   nem a sombra. E não há token que conserte: `--line-2`(#26375a) e
   `--line`(#1a2740) medem 1,04 e 1,29 contra o composto; só um cinza claro
   tipo `--ink-2` passaria, e isso é um TRAÇO CLARO CONTORNANDO O CARTÃO —
   repintar peça publicada por causa de uma régua inventada, exatamente o que
   "conserte a RÉGUA, nunca o produto" proíbe.

   Porque a beirada NUNCA foi o mecanismo. O que torna a peça legível sobre o
   mapa são DUAS coisas, e as duas são mensuráveis e reprováveis:

     1. O CARTÃO É OPACO — o mapa não vaza no conteúdo. É ISTO que faz os três
        números de contraste medidos contra `--card` (`dist`/`verbo`/`baixo`,
        logo acima) serem verdade NA RUA e não artefato de bancada: se o fundo
        tivesse alpha, o texto estaria sobre mapa+card e nenhum daqueles
        números valeria nada. Medido pintando uma SENTINELA berrante
        (`#ff00ff`) atrás da peça e exigindo ZERO deslocamento do pixel de
        dentro — não é ler `backgroundColor` e acreditar.
     2. O VÉU REBAIXA O MAPA — `rgba(4,7,13,.7)` / `rgba(20,28,45,.42)`. É ele
        que garante que a peça pousa num chão PREVISÍVEL em vez de num tile
        qualquer (parque verde, avenida branca). Medido contra o mapa CRU (o
        mesmo recorte, com o véu escondido): apagar a regra derruba pra 1,00.

   A borda continua MEDIDA e vai pro log com o nome honesto — número que o
   dono pode olhar e decidir repintar. O que ela não faz mais é se passar por
   asserção de legibilidade.
   ========================================================================== */
async function legibilidadeSobreOMapa(p) {
  const info = await p.evaluate(() => {
    const cartao = document.querySelector('.chegou-cartao');
    const wrap = document.querySelector('.chegou-wrap');
    if (!cartao || !wrap) return null;
    const r = cartao.getBoundingClientRect();
    const cs = getComputedStyle(cartao);
    return {
      x: r.x, y: r.y, w: r.width, h: r.height,
      borda: cs.borderColor,
      largura: parseFloat(cs.borderWidth) || 0,
      vh: window.innerHeight,
    };
  });
  if (!info) return null;
  const meioY = Math.round(info.y + (info.h / 2) - 3);
  // FORA: colado na beirada esquerda (o wrap tem `padding:0 20px`, sempre sobra
  // respiro). DENTRO: 4px pra dentro, bem dentro do `padding:18px 16px` — chão
  // liso do cartão, sem texto no caminho.
  const fora = { x: Math.round(info.x - 8), y: meioY, width: 6, height: 6 };
  const dentro = { x: Math.round(info.x + 4), y: meioY, width: 6, height: 6 };
  // sem espaço pra amostrar honesto: devolve "não sei medir", nunca um verde
  // de mentira (e a asserção reprova em cima do `null`).
  if (fora.x < 0 || fora.y < 0 || fora.y + fora.height > info.vh) return null;

  const dentroNormal = await pixelMedio(p, dentro);
  /* SENTINELA: pinta o que está ATRÁS do cartão de magenta puro. Cartão opaco
     ⇒ o pixel de dentro não se mexe UM canal. Qualquer alpha ⇒ ele puxa pro
     magenta na hora. */
  await p.evaluate(() => { document.querySelector('.chegou-wrap').style.background = '#ff00ff'; });
  const dentroSentinela = await pixelMedio(p, dentro);
  await p.evaluate(() => { document.querySelector('.chegou-wrap').style.background = ''; });

  const foraComVeu = await pixelMedio(p, fora);
  // o mapa CRU no MESMO recorte: esconde a peça inteira por um instante.
  await p.evaluate(() => { document.querySelector('.chegou-wrap').style.visibility = 'hidden'; });
  const mapaCru = await pixelMedio(p, fora);
  await p.evaluate(() => { document.querySelector('.chegou-wrap').style.visibility = ''; });

  /* ======================================================================
     🔴 (a) O VÉU ESTAVA SENDO MEDIDO PELA SOMBRA DO CARTÃO (LOTE 1.3,
     revisão adversarial ao lote 3.1). A régua anterior era
     `RAZAO(foraComVeu, mapaCru)` num ponto a 8px da beirada do cartão — e o
     `.chegou-cartao` tem `box-shadow: 0 22px 54px rgba(0,0,0,.6)`, cujo
     borrão de 54px cobre esses 8px com folga. Resultado MEDIDO: apagando a
     regra do véu no modo CLARO, a razão continuava acima do piso (a sombra
     sozinha escurecia o ponto) e o portão NÃO reprovava. Régua que não
     reprova quando a peça some é enfeite.

     A cura tem que isolar as duas coisas, e de quebra mede o MECANISMO que a
     copy sempre alegou — "o véu rebaixa o mapa, a peça pousa num chão
     PREVISÍVEL em vez de num tile qualquer (parque verde, avenida branca)":
       · uma SENTINELA branca cobre o palco inteiro atrás da peça (o pior
         tile possível pro contraste: o branco da avenida);
       · a SOMBRA do cartão é desligada durante a amostra — sem isso ela
         responde pelo véu;
       · a razão passa a ser sentinela CRUA × sentinela sob o véu.
     Deletar a regra do véu derruba isso pra 1,00 EXATO nos DOIS modos, que é
     o red-first honesto. Medido com a regra de pé: escuro ~7,9 · claro ~2,6.
     ====================================================================== */
  await p.evaluate(() => {
    const wrap = document.querySelector('.chegou-wrap');
    const cartao = wrap.querySelector('.chegou-cartao');
    window.__provaSombra = cartao.style.boxShadow || '';
    cartao.style.boxShadow = 'none';
    const s = document.createElement('div');
    s.id = 'prova-sentinela-palco';
    // z-index 55 = logo ABAIXO do `.chegou-wrap` (56) e acima de todo o cromo
    // de tela, então o recorte amostrado vê a sentinela e mais nada.
    s.style.cssText = 'position:absolute;inset:0;z-index:55;background:#ffffff';
    wrap.parentElement.insertBefore(s, wrap);
  });
  const veuSobreSentinela = await pixelMedio(p, fora);
  await p.evaluate(() => { document.querySelector('.chegou-wrap').style.visibility = 'hidden'; });
  const sentinelaCrua = await pixelMedio(p, fora);
  await p.evaluate(() => {
    const wrap = document.querySelector('.chegou-wrap');
    wrap.style.visibility = '';
    const cartao = wrap.querySelector('.chegou-cartao');
    cartao.style.boxShadow = window.__provaSombra || '';
    delete window.__provaSombra;
    const s = document.getElementById('prova-sentinela-palco');
    if (s) s.remove();
  });

  const m = /rgba?\(([^)]+)\)/.exec(info.borda || '');
  const bordaRGB = m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : [0, 0, 0];
  const vazamento = Math.max(
    ...dentroNormal.map((v, i) => Math.abs(v - dentroSentinela[i])),
  );
  return {
    vazamento: Math.round(vazamento),
    // A ASSERÇÃO: véu isolado (sentinela branca atrás, sombra do cartão OFF).
    veu: RAZAO(sentinelaCrua, veuSobreSentinela),
    // A MEDIDA VELHA fica no log com o nome honesto — ela mistura véu+sombra
    // e por isso nunca mais volta a ser asserção.
    veuMaisSombraSobreOPalco: RAZAO(foraComVeu, mapaCru),
    borda: info.largura > 0 ? RAZAO(bordaRGB, foraComVeu) : null,
    fundoCartaoXFora: RAZAO(dentroNormal, foraComVeu),
  };
}

(async () => {
  regenerarGerados();
  const [srv, porta] = await servir();
  const pele = peleDoMock();
  const navegador = await chromium.launch();
  // página utilitária, sem app nenhum dentro — só decodifica PNG pra comparar
  // fotos entre contextos já fechados (§ fotosParecidas).
  const utilPage = await navegador.newPage();

  /* ======================================================================
     LAÇO PRINCIPAL — 2 modos de luz × 2 palcos. É aqui que existência,
     não-troca-de-tela, HTML/pintura/foto e camada são medidos.
     ====================================================================== */
  const capturas = {}; // chave `${luz}|${palco}` → { tela0, tela1, capNascimento, cap, foto, camada }

  for (const luz of ['escuro', 'claro']) {
    for (const palco of ['rota', 'mapa']) {
      const chave = `${luz}|${palco}`;
      const { ctx, p, erros } = await abrirContexto(navegador, porta, pele, { luz });
      await irPalco(p, palco);
      const tela0 = await p.evaluate(TELA);
      await chegar(p, 'e1');
      await p.waitForTimeout(900);
      const tela1 = await p.evaluate(TELA);
      // capturado ANTES de qualquer repinte forçado — é o único momento honesto
      // pra medir "nasce sem .remontado" (a settle logo abaixo já marcaria).
      const capNascimento = await p.evaluate(CAPTURAR);
      /* 🔴 PORTÃO HONESTO (b) — sem isto, a igualdade 2D×3D passa por SORTE de
         cronômetro: no 3D o `watchPosition` alimenta `aoMover()`→
         `pintarNavegacao()` (repinta sozinho, marca `.remontado`), e a
         bancada às vezes não tem tempo de repintar o suficiente pro 2D fazer
         o mesmo dentro da janela de captura — o fiscal PROVOU isto disparando
         um `usarDados('gps',…)` manual e vendo a igualdade quebrar. Um
         repinte FORÇADO, igual pros dois palcos, ANTES de medir HTML/pintura/
         foto/camada, garante que os dois lados estão no MESMO estado de
         repinte — só assim a igualdade prova o produto, não o relógio da
         máquina que rodou o teste. */
      await p.evaluate(() => window.usarDados('rota', { kpiEntregues: `settle-${Math.random()}` }));
      await p.waitForTimeout(400);
      const cap = await p.evaluate(CAPTURAR);
      const foto = cap.existe ? await fotoDoElemento(p, '.chegou-cartao', 20) : null;
      const contraste = cap.existe ? await p.evaluate(CONTRASTE) : null;
      const legibilidade = cap.existe ? await legibilidadeSobreOMapa(p) : null;

      /* CAMADA (e) — medida NOS 2 PALCOS e NOS 2 ESTADOS DE CROMO de cada um.
         O que era `['.nav','.hdr','.tmx-dock']` cravado virou varredura do que
         está PINTADO + toque, e o porquê está no bloco (h) grande, junto de
         `MEDIR_CROMO` — resumo: régua com nome de peça dentro envelhece a cada
         entrega de desenho; "acima de todo o cromo" não envelhece.
         🔴 OS DOIS ESTADOS, NÃO UM: o interruptor da tela cheia (item 1 do
         dono, 17/08) é o que decide se as abas e o cabeçalho estão na tela — e
         o cartão tem que ganhar dos DOIS jeitos. Medir só o padrão (tela cheia)
         deixaria o `.nav`, que é o cromo de MAIOR z-index de todo o app (45),
         sem fiscal nenhum. A prova entra no 2º estado pelo SEAM
         (`usarDados('rota',{telaCheia:false})`, § D7 do contrato: o mock lê
         `DADOS`, nunca `localStorage`) e devolve o estado que achou. */
      let camada = null;
      if (cap.existe) {
        camada = { cheio: null, abas: null, portao: null };
        camada.cheio = await p.evaluate(MEDIR_CROMO, CROMO_TELA);
        await p.evaluate(() => window.usarDados('rota', { telaCheia: false }));
        await p.waitForTimeout(700);   // --mv-cheio é 520ms: deixa o cromo assentar
        camada.abas = await p.evaluate(MEDIR_CROMO, CROMO_TELA);
        await p.evaluate(() => window.usarDados('rota', { telaCheia: true }));
        await p.waitForTimeout(700);
        // o PORTÃO LEGÍTIMO fica por último: ele suja a tela (abre e remove um
        // `.portao-wrap`) e não tem nada a ver com o interruptor acima.
        camada.portao = await p.evaluate(() => {
          const wrap = document.querySelector('.chegou-wrap');
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
          return { zChegou, zPortao, dentroAntes, dentroDepois };
        });
      }

      /* REPINTE (a): sobrevive sem reanimar — a MESMA instância de nó, marcada
         `.remontado`, e SEM animação nenhuma `running` de verdade
         (`getAnimations`, não só a classe: o fiscal apagou a regra CSS que
         desliga a animação em runtime e a classe sozinha continuou "passando",
         com mvConf/mvPop/trItem tocando de novo — o pisca de 1×/s na rua). */
      let sobreviveu = null;
      if (cap.existe) {
        await p.evaluate(() => { document.querySelector('.chegou-wrap').__marcaProva = 'x'; });
        await p.evaluate(() => window.usarDados('rota', { kpiEntregues: String(Math.random()) }));
        await p.waitForTimeout(400);
        sobreviveu = await p.evaluate(() => {
          const w = document.querySelector('.chegou-wrap');
          const anims = w && typeof w.getAnimations === 'function' ? w.getAnimations({ subtree: true }) : [];
          const rodando = anims.filter((an) => an.playState === 'running').length;
          return {
            existe: !!w, mesmoNo: !!(w && w.__marcaProva === 'x'),
            remontado: !!(w && w.classList.contains('remontado')),
            animacoesRodando: rodando,
          };
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

      capturas[chave] = {
        tela0, tela1, capNascimento, cap, foto, contraste, legibilidade,
        camada, sobreviveu, acaoPrincipal, voltaPalco, erros,
      };
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

  // ---- HTML/pintura IDÊNTICOS + foto PERCEPTUALMENTE igual, no MESMO luz --
  for (const luz of ['escuro', 'claro']) {
    const r = capturas[`${luz}|rota`]; const m = capturas[`${luz}|mapa`];
    eh(`HTML idêntico 2D×3D (${luz})`, iguais(r.cap.html, m.cap.html));
    eh(`pintura idêntica 2D×3D (${luz})`,
      iguais(r.cap.pintura && r.cap.pintura.join('~~'), m.cap.pintura && m.cap.pintura.join('~~')));
    // eslint-disable-next-line no-await-in-loop
    const p = await fotosParecidas(utilPage, r.foto && r.foto.buf, m.foto && m.foto.buf);
    eh(`foto perceptualmente idêntica 2D×3D (${luz})`, !!p.parecidas,
      `sha ${r.foto && r.foto.sha} × ${m.foto && m.foto.sha} · ${JSON.stringify(p)}`);
  }

  // ---- estrutura igual entre os 2 modos de luz (cor pode mudar, forma não) ----
  {
    const escuro = capturas['escuro|rota']; const claro = capturas['claro|rota'];
    eh('estrutura igual entre modos de luz', iguais(escuro.cap.estrutura, claro.cap.estrutura));
  }

  // ---- camada (e): acima do cromo de tela, abaixo de um portão legítimo —
  //      medida NOS 2 PALCOS × NOS 2 ESTADOS DE CROMO (§ (h)) ---------------
  ['rota', 'mapa'].forEach((palco) => {
    const c = capturas[`escuro|${palco}`].camada;
    const pt = c && c.portao;
    eh(`z-index 56 (${palco})`, !!pt && pt.zChegou === 56, JSON.stringify(pt));
    ['cheio', 'abas'].forEach((estado) => {
      const v = vereditoDoCromo(c && c[estado], FAMILIA_DO_CROMO[palco][estado]);
      /* o cromo esperado deste estado está PINTADO pra ser medido — o anti-vácuo
         (§ (h)): régua que mede lista vazia devolve verde de graça. */
      eh(`o cromo de ${estado} está PINTADO pra medir (${palco})`, v.temFamilia, JSON.stringify(v));
      /* O INVARIANTE: "abre na frente". Z-INDEX **e** TOQUE contra cada peça
         pintada — o toque é o que reprova de verdade quando alguém empurra o
         cartão pra baixo do rodapé (provado na bancada: `.chegou-wrap{z-index:10}`
         derruba as 5 peças do 2D e as 4 do 3D nos dois estados). */
      eh(`fica acima de TODO o cromo pintado — z e toque (${palco}/${estado})`, v.acima, JSON.stringify(v));
    });
    /* 🔴 O INTERRUPTOR TEM QUE TER MEXIDO DE VERDADE (17/08). Sem esta linha, um
       `usarDados` que não pegasse (chave renomeada, seam mudado) faria a prova
       medir o MESMO estado duas vezes e cantar "vale nos dois estados" sem ter
       entrado no segundo. `.nav` é a assinatura do estado com abas: ele tem que
       estar pintado com o interruptor DESLIGADO e ausente com ele LIGADO. */
    const temNav = (m) => !!(m && m.cromo && m.cromo.some((x) => x.sel === '.nav'));
    eh(`o interruptor da tela cheia de fato troca o cromo (${palco})`,
      !temNav(c && c.cheio) && temNav(c && c.abas),
      JSON.stringify({ cheio: c && c.cheio && c.cheio.cromo.map((x) => x.sel), abas: c && c.abas && c.abas.cromo.map((x) => x.sel) }));
    eh(`fica ABAIXO de um portão legítimo (${palco})`, !!pt && pt.zPortao != null && pt.zChegou < pt.zPortao,
      JSON.stringify(pt));
    eh(`portão legítimo GANHA o toque (${palco})`, !!pt && pt.dentroAntes && !pt.dentroDepois, JSON.stringify(pt));
    nota(`[cromo/${palco}] cheio=${JSON.stringify((c && c.cheio ? c.cheio.cromo : []).map((x) => `${x.sel}:z${x.z}`))}`
      + ` · abas=${JSON.stringify((c && c.abas ? c.abas.cromo : []).map((x) => `${x.sel}:z${x.z}`))}`);
  });

  // ---- repinte não reencena nem derruba (a): mesmo nó, .remontado E zero
  //      animação `running` de verdade (getAnimations, não só a classe) -----
  {
    const s = capturas['escuro|mapa'].sobreviveu; // no 3D o fix chega 1x/s: é o caso que mais pisca
    eh('repinte não derruba a peça (mesmo nó)', !!s && s.existe && s.mesmoNo, JSON.stringify(s));
    eh('repinte marca .remontado (desliga a animação)', !!s && s.remontado, JSON.stringify(s));
    eh('repinte NÃO deixa animação rodando (getAnimations)', !!s && s.animacoesRodando === 0, JSON.stringify(s));
  }
  {
    // capturado ANTES do repinte forçado (§b) — o único momento honesto pra
    // medir que a entrada acontece 1x.
    const primeiro = capturas['escuro|rota'].capNascimento;
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

  // ---- contraste ----------------------------------------------------------
  ['escuro', 'claro'].forEach((luz) => {
    const c = capturas[`${luz}|rota`];
    const ct = c.contraste;
    eh(`contraste do texto grande ≥3,0 (${luz})`, !!ct && ct.dist >= 3 && ct.verbo >= 3, JSON.stringify(ct));
    /* (f) a ausência de `.baixo` não é mais coringa: a cena SEMPRE tem
       endereço (P1/P2 do fixture), então `null` aqui é FALHA de verdade —
       um seletor quebrado não pode passar disfarçado de "campo ausente". */
    eh(`contraste do texto pequeno ≥4,5 (${luz})`, !!ct && ct.baixo != null && ct.baixo >= 4.5, JSON.stringify(ct));
    eh(`contraste do ícone ≥3,0 (${luz})`, !!ct && ct.icone != null && ct.icone >= 3, JSON.stringify(ct));
    /* (c) O MECANISMO REAL, medido — ver o bloco grande em
       `legibilidadeSobreOMapa`. As duas asserções abaixo substituem a antiga
       "borda legível sobre o mapa", que passava por definição e, remendada
       pra medir a borda de verdade, cobrava do produto um traço claro que
       nenhum token entrega no escuro. */
    const L = c.legibilidade;
    // 1. o mapa NÃO VAZA no conteúdo: é o que faz os 3 números acima (medidos
    //    contra `--card`) valerem na rua. Sentinela magenta atrás da peça.
    eh(`cartão OPACO: o mapa não vaza no conteúdo (${luz})`, !!L && L.vazamento === 0, JSON.stringify(L));
    /* 2. o VÉU rebaixa o mapa: a peça pousa em chão previsível, não num tile
          qualquer. Medido ISOLADO da sombra do cartão (§ (a) em
          `legibilidadeSobreOMapa`): sentinela branca atrás — o pior tile
          possível, a avenida branca — e `box-shadow:none` durante a amostra.
          Apagar a regra do véu derruba a razão pra 1,00 EXATO nos dois modos;
          com ela de pé mede escuro ~7,9 e claro ~2,6, então o piso 1,35 tem
          folga larga dos dois lados e reprova de verdade. */
    eh(`véu rebaixa o palco atrás da peça (isolado da sombra), ≥1,35 (${luz})`,
      !!L && L.veu >= 1.35, JSON.stringify(L));
    // a borda e o composto véu+sombra continuam MEDIDOS, com o nome honesto,
    // pro dono decidir repintar — nenhum dos dois volta a ser asserção.
    nota(`[${luz}] veu ISOLADO=${L && L.veu && L.veu.toFixed(2)}`
      + ` · veu+sombra sobre o palco=${L && L.veuMaisSombraSobreOPalco && L.veuMaisSombraSobreOPalco.toFixed(2)}`
      + ` · borda×composto=${L && L.borda && L.borda.toFixed(2)}`
      + ` · fundo do cartão×fora=${L && L.fundoCartaoXFora && L.fundoCartaoXFora.toFixed(2)}`
      + ' — MEDIDAS, não asserções (§ legibilidadeSobreOMapa)');
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
    // (g) `pinoAmbar` já era medido e nunca virava asserção — é requisito
    // ESCRITO ("dispensar não apaga o pino"), não só um número no log.
    eh('dispensar NÃO apaga o pino âmbar', r.pinoAmbar === true, JSON.stringify(r));
    eh('dispensar NÃO fala com o servidor', r.novasChamadas === 0, JSON.stringify(r));
    await ctx.close();
  }

  /* (d) 🔴 PORTÃO HONESTO — as duas cenas abaixo mediam só o CARTÃO parado
     (o botão que já estava na tela, do jeito que ele nasceu) — e passariam
     IGUAL com a guarda que elas dizem fiscalizar apagada, porque o efeito
     observado vinha de OUTRA guarda (`naCamada('.chegou-wrap')` em
     `desenharChegada` já impede o card de ser redesenhado, então o DOM
     parado mente por baixo mesmo sem a guarda de `chegada`/`aberta`).
     A grandeza certa é o ESTADO QUE SOBRA depois que a folha em cena fecha
     e o motorista volta pro mapa: é aí que `abrirParada` decide (ou não)
     zerar `chegada`, e é isso — não o botão parado — que a guarda protege. */

  // ---- 2ª chegada não troca o cliente debaixo do dedo (mede o ESTADO) ------
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await chegar(p, 'e1');
    await p.waitForTimeout(700);
    await chegar(p, 'e2');
    await p.waitForTimeout(700);
    const antes = await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
      return { paradaAtual: b ? b.dataset.parada : null };
    });
    eh('2ª chegada não troca o cliente (cartão parado)', antes.paradaAtual === 'e1', JSON.stringify(antes));
    /* 🔴 FURO 3 (LOTE 3.1) — A OUTRA METADE, QUE NÃO TINHA PORTÃO NENHUM.
       "Não trocar o cliente" nunca quis dizer "jogar a 2ª chegada fora". Até a
       3.1 o `if (chegada) return` vinha ANTES do `carimbarChegada(id)`: a 2ª
       chegada era descartada INTEIRA — `chegada:e2` nunca era gravado e o pino
       da e2 nunca ficava âmbar, então o `arrivedAt` dela virava a hora do
       TOQUE MANUAL (minutos depois, às vezes na porta seguinte). O relógio da
       chegada é dado de operação: é ele que diz se o motorista cumpriu a
       janela do cliente. Medir só "o cartão continua no e1" deixava essa
       metade sem fiscal — o fix estava no código e ninguém provava. */
    const carimbo2 = await p.evaluate(() => ({
      cache: !!(window.HBX.cache && window.HBX.cache.get('chegada:e2', null)),
      pino: (() => { try { return !!(PARADAS.find((x) => String(x.id) === 'e2') || {}).chegou; } catch (e) { return null; } })(),
    }));
    eh('FURO 3 · 2ª chegada É carimbada mesmo com cartão aberto (pino âmbar)',
      carimbo2.cache === true && carimbo2.pino === true, JSON.stringify(carimbo2));
    // abre a folha do cartão visível (deveria ser e1) e ABANDONA sem
    // confirmar — se `chegada` tivesse sido silenciosamente sobrescrito pra
    // 'e2' (a guarda `if (chegada) return` apagada, só `naCamada` de pé), é
    // AQUI que o Ademir (e2) nasceria sozinho ao voltar pro mapa.
    await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const voltar = document.querySelector('[data-voltar][data-ir]');
      if (voltar) voltar.click();
    });
    await p.waitForTimeout(600);
    /* 🔴 MEDE O NÓ, NÃO TEXTO NO `body` (17/08 — ver o bloco (i) em
       `LER_CARTAO_DE_CHEGADA`). Era `!temAdemir` sobre `body.textContent`, e o
       item 6 do dono botou o nome do cliente DENTRO do mapa (`.map-pino .nome`)
       — o texto passou a existir sempre, com e sem defeito, e a metade da régua
       que dependia dele virou vermelho fixo. A pergunta agora: depois do
       abandono não sobra cartão de chegada NENHUM, e nenhum apontando pra e2.
       Dente provado na bancada pela porta REAL (injetar `.chegou-wrap` na mão
       não serve: o apagador de `desenharChegada` remove cartão órfão no
       repinte seguinte): uma chegada nova da e2 aqui devolve
       `wrapExiste:true · paradaNoCartao:'e2' · nomeNoCartao:'Ademir'` e esta
       linha reprova — que é exatamente o cartão que uma guarda apagada faria
       nascer sozinho. */
    const depois = await p.evaluate(LER_CARTAO_DE_CHEGADA);
    eh('2ª chegada não troca o cliente (estado sobrevive ao abandono)',
      depois.wrapExiste === false && depois.paradaNoCartao === null && depois.nomeNoCartao === null,
      JSON.stringify(depois));
    await ctx.close();
  }

  // ---- chegada com folha já aberta segue ignorada (mede o ESTADO) ----------
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
    const wrapExisteJa = await p.evaluate(() => !!document.querySelector('.chegou-wrap'));
    eh('chegada com folha aberta segue ignorada (não abre na hora)',
      telaDepois === telaAntes && !wrapExisteJa, `tela ${telaAntes}→${telaDepois} · wrap=${wrapExisteJa}`);
    // ABANDONA a folha de e1 (sem confirmar) e volta pro mapa — se a 2ª
    // chegada tivesse gravado `chegada='e2'` por baixo do capô (a guarda de
    // `aberta` apagada), é AQUI que o cartão do Ademir nasceria sozinho, sem
    // nenhuma chegada nova ter acontecido.
    await p.evaluate(() => {
      const voltar = document.querySelector('[data-voltar][data-ir]');
      if (voltar) voltar.click();
    });
    await p.waitForTimeout(600);
    /* 🔴 MEDE O NÓ, NÃO TEXTO NO `body` (17/08 — mesma cura da cena acima e o
       porquê no bloco (i)). E de quebra esta linha passa a exigir que a cena
       TENHA EXERCITADO o que promete: `telaAntes` tem que ser uma FOLHA. Sem
       isso, um seletor quebrado (a folha da e1 nunca abrindo) deixaria a cena
       inteira "passar" sem nunca ter havido folha aberta pra chegada ignorar —
       o mesmo furo que as duas linhas do FURO 2(i) já tapam na cena delas.
       Medido na bancada: `telaAntes=venda`. */
    const depois = await p.evaluate(LER_CARTAO_DE_CHEGADA);
    eh('chegada com folha aberta segue ignorada (não ressurge sozinha depois)',
      /^(venda|folha)$/.test(String(telaAntes))
      && depois.wrapExiste === false && depois.paradaNoCartao === null && depois.nomeNoCartao === null,
      `telaAntes=${telaAntes} · ${JSON.stringify(depois)}`);
    await ctx.close();
  }

  /* ---- FURO 1 (LOTE 3.1) — abandonar a folha pelo × não trava a chegada
     seguinte pro resto do dia: abre, ABANDONA sem desfecho, e uma chegada
     NOVA (doutra parada) tem que continuar abrindo o cartão normalmente. */
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await chegar(p, 'e1');
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    const telaNaFolha = await p.evaluate(TELA);
    await p.evaluate(() => {
      const voltar = document.querySelector('[data-voltar][data-ir]');
      if (voltar) voltar.click();
    });
    await p.waitForTimeout(600);
    const telaAposVoltar = await p.evaluate(TELA);
    await chegar(p, 'e2');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const wrap = document.querySelector('.chegou-wrap');
      const b = wrap ? wrap.querySelector('[data-acao="abrir-parada"]') : null;
      return {
        wrapExiste: !!wrap,
        paradaAtual: b ? b.dataset.parada : null,
        chegadaCarimbada: !!(window.HBX.cache && window.HBX.cache.get('chegada:e2', null)),
      };
    });
    eh('FURO 1 · abandonar a folha (Voltar/×) não trava a próxima chegada',
      r.wrapExiste && r.paradaAtual === 'e2' && r.chegadaCarimbada,
      `folha=${telaNaFolha} depoisVoltar=${telaAposVoltar} · ${JSON.stringify(r)}`);
    await ctx.close();
  }

  /* ---- FURO 2 — `chegadaPalco` GRAVADO EM abrirParada, não no cartão. As
     duas cenas medidas pelo fiscal, nos DOIS sentidos: (i) abrir pela LISTA
     2D não pode herdar o palco de um cartão/folha ANTIGA que nasceu no 3D;
     (ii) abrir pelo PINO dirigindo no 3D não pode herdar o palco de uma
     folha antiga aberta no 2D. As duas deixam `chegadaPalco` "sujo" de um
     ciclo anterior antes de abrir a parada que de fato vai ser confirmada. */

  /* (i) 🔴 REESCRITA NO LOTE 1.3 — A CENA ANTIGA MEDIA A CURA ERRADA.
     Ela abria a folha do e1 no 3D e a ABANDONAVA pelo Voltar antes de abrir
     o e2 pela lista — e o abandono cai no embrulho do `window.ir` do FURO 1,
     que zera `aberta` E `chegadaPalco` juntos. Com `chegadaPalco` já nulo,
     confirmar o e2 caía em 'rota' por DEFAULT, e não por alguém ter gravado
     o palco certo: MEDIDO, revertendo só o FURO 2 (o palco voltando a nascer
     em `desenharChegada`, com o FURO 1 de pé), a cena continuava VERDE.

     A grandeza certa é o PALCO GRAVADO POR PARADA, e pra medir isso a cena
     não pode passar por abandono nenhum: um cartão NASCE no 3D pro e1 e
     nunca é aberto (é ele que, na régua velha, gravava `chegadaPalco='mapa'`
     como estado GLOBAL do último cartão); depois o motorista desce pra lista
     2D e abre OUTRA parada, a e2, direto. Quem grava o palco agora é
     `abrirParada` — e o palco desta abertura é o 2D.
     Red-first isolado: com o FURO 2 revertido esta cena termina em 'mapa'. */
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'mapa');
    await chegar(p, 'e1');                    // cartão do e1 NASCE no 3D…
    await p.waitForTimeout(700);
    const cartaoNasceuNo3D = await p.evaluate(() => !!document.querySelector('.chegou-wrap [data-acao="abrir-parada"]'));
    await p.evaluate(() => window.ir('rotalista'));   // …e nunca é aberto
    await p.waitForTimeout(600);
    await p.evaluate(() => {                  // e2 abre DIRETO pela lista — nenhum cartão nasceu pra ela
      const b = document.querySelector('[data-acao="abrir-parada"][data-parada="e2"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    const abriuFolha = await p.evaluate(TELA);
    await p.evaluate(() => {
      const alvo = [...document.querySelectorAll('[data-acao]')]
        .find((e) => /^(confirmar-venda|entregue-pagou)$/.test(e.dataset.acao || ''));
      if (alvo) alvo.click();
    });
    await p.waitForTimeout(1000);
    const telaFinal = await p.evaluate(TELA);
    // sem estas duas, um seletor quebrado (cartão que não nasce, folha que
    // não abre) deixaria a cena "passar" sem ter exercitado nada.
    eh('FURO 2(i) · a cena de fato monta o cartão no 3D antes de descer pra lista',
      cartaoNasceuNo3D === true, `cartaoNasceuNo3D=${cartaoNasceuNo3D}`);
    eh('FURO 2(i) · a cena de fato abre a folha da e2 pela lista 2D',
      abriuFolha === 'venda' || abriuFolha === 'folha', `abriuFolha=${abriuFolha}`);
    eh('FURO 2(i) · confirmar parada aberta pela LISTA 2D fica no 2D (o palco é da PARADA, não do último cartão)',
      telaFinal === 'rota', `telaFinal=${telaFinal}`);
    await ctx.close();
  }

  // (ii) folha antiga no 2D (abandonada) → abre e1 de novo, agora PELO PINO
  //      no 3D → confirma
  {
    const { ctx, p } = await abrirContexto(navegador, porta, pele, { luz: 'escuro' });
    await irPalco(p, 'rota');
    await chegar(p, 'e1');
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const voltar = document.querySelector('[data-voltar][data-ir]');
      if (voltar) voltar.click();
    });
    await p.waitForTimeout(600);              // chegadaPalco ficou 'rota' desta abertura
    await irPalco(p, 'mapa');
    await p.evaluate(() => {                  // e1 (ainda 1ª da fila) abre PELO PINO — sem cartão nenhum
      document.dispatchEvent(new CustomEvent('hbx:mapa-parada', { detail: { id: 'e1' } }));
    });
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      const b = document.querySelector('.portao-wrap .principal');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const alvo = [...document.querySelectorAll('[data-acao]')]
        .find((e) => /^(confirmar-venda|entregue-pagou)$/.test(e.dataset.acao || ''));
      if (alvo) alvo.click();
    });
    await p.waitForTimeout(1000);
    const telaFinal = await p.evaluate(TELA);
    eh('FURO 2(ii) · confirmar parada aberta pelo PINO no 3D fica no 3D (não herda palco de folha antiga)',
      telaFinal === 'mapa', `telaFinal=${telaFinal}`);
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
