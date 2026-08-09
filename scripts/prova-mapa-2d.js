#!/usr/bin/env node
/**
 * PROVA FUNCIONAL DO MAPA 2D — a tela principal da Rota.
 *
 *     node scripts/prova-mapa-2d.js
 *
 * Ela responde as duas perguntas que print nenhum responde e que o `casca-conferir`
 * (que pergunta "pinta igual ao mock?") não alcança:
 *   A) "cadê o pino de onde estou?" — o GPS liga sozinho quando já foi concedido,
 *      o ponto anda a cada fix, e NINGUÉM pede permissão fora de hora.
 *   B) "cadê os pontos, os checkpoints?" — os pinos numerados existem, estão
 *      DENTRO da tela, e o rebaixamento por zoom só vale pra dia CHEIO.
 *
 * 🔴 POR QUE ELA MEDE POSIÇÃO, E NÃO SÓ EXISTÊNCIA. O defeito que originou este
 * arquivo passava em qualquer teste de "o marcador foi criado?": os três pinos
 * NASCIAM certinhos e mesmo assim nenhum aparecia. Faltava a folha do maplibre
 * (`vendor/maplibre-gl.css`, que é quem dá `position:absolute` ao marcador), e
 * sem ela cada pino entrava no fluxo normal do container — medidos em y=1095,
 * 1214 e 1333 num viewport de 940. `querySelector` dizia EXISTE; a tela dizia
 * VAZIO. Aqui a régua é o retângulo: pino fora do palco é pino que não existe.
 *
 * 🔴 O DUBLÊ ENTRA DEPOIS DO BOOT (mesma lei do `prova-meus-clientes`): o
 * `native.js` cria o `window.HBX` de verdade no load e engoliria um
 * `addInitScript`. `temPonte`/`chamar` leem `window.HBX` na hora da chamada.
 *
 * 🔴 E ELA SOBE UM SERVIDOR. Sobre `file://` o `location.origin` é "null" e o
 * estilo do mapa monta `null/assets/app/...` pro sprite — o mapa nasce sem
 * ícone e às vezes sem `load`. Um estático de uma linha resolve, e de quebra é
 * o mesmo caminho que o aparelho usa (`/assets/app/...`).
 *
 * 🔴 A PELE VEM DO MOCK-FONTE, não do `mock.css`. A aparência do pino mora em
 * `docs/mockups/logistica2.0/logistica-2.0.html` (classe `.map-pino`), e o
 * `mock.css` é GERADO pela injeção da casca — que só roda no fim. Sem isto a
 * prova mediria um pino sem folha e reprovaria a si mesma. Injetar o `<style>`
 * do mock é medir a casca que vai subir.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** o `<style>` do mock-fonte — a casca que a injeção vai transformar em mock.css */
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

/* ---- CONTRASTE (WCAG 2.1) ------------------------------------------------
   AA de PEÇA GRÁFICA é 3,0 (1.4.11 Non-text Contrast); texto é 4,5.
   🔴 E A RÉGUA DO PINO É DE DUAS TINTAS. O pino tem dois fundos possíveis e
   eles são opostos — o chão do mapa e a FITA da rota. Nenhuma cor única vence
   os dois extremos (no escuro, a luminância teria que morar entre 0,14 e 0,19:
   um cinza-chumbo que mentiria a cor da rota). Todo mapa de rua resolve isso
   com anel + cheio: onde uma tinta se perde, a outra desenha a silhueta. Então
   a conta honesta é o MELHOR das duas contra cada fundo, nunca a média. */
const canal = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
function lum(rgb) {
  const m = String(rgb).match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map((x) => canal(Number(x) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function razao(a, b) {
  const x = lum(a); const y = lum(b);
  if (x === null || y === null) return 0;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const duasTintas = (anel, cheio, fundo) => Math.max(razao(anel, fundo), razao(cheio, fundo));

/* ---- O SERVIDOR DUBLADO --------------------------------------------------- */
const paradaFalsa = (i) => ({
  id: `e${i}`, status: 'pendente', rotaOrdem: i, quantidade: 1,
  cliente: {
    id: `c${i}`, nome: `Cliente ${i + 1}`,
    enderecoLinha: `Rua ${i + 1}, 100`, bairro: 'Centro',
    // espalhadas por Rio Claro: ~0,09 grau de caixa, que é a cidade inteira
    lat: -22.38 - ((i * 37) % 90) / 1000,
    lng: -47.54 - ((i * 53) % 90) / 1000,
  },
});

const PONTE = (itens) => {
  window.__chamadas = [];
  window.__pediuPermissao = 0;
  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, caminho]);
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({ items: itens, routeStatus: itens.length ? 'PLANNED' : 'NONE', moduloFinanceiroAtivo: false });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      return Promise.resolve({});
    },
    // o dublê do nativo: conta os pedidos de permissão em vez de abrir diálogo
    requestLocationPermission() { window.__pediuPermissao += 1; },
    manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};

/** abre o app já dublado, na tela Rota, com as paradas pedidas */
async function abrir(navegador, pele, porta, { itens, permissao, luz }) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: -22.4126, longitude: -47.5763, accuracy: 30 },
    permissions: permissao ? ['geolocation'] : [],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.waitForTimeout(500);
  // a casca que a injeção vai gerar (ver o cabeçalho): mock.css primeiro, as
  // regras novas por cima — elas não existem lá, então não há conflito.
  await p.addStyleTag({ content: pele });
  if (luz) await p.evaluate((l) => { document.documentElement.dataset.luz = l; }, luz);
  await p.evaluate(PONTE, itens);
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(700);
  await p.evaluate(() => window.ir('rota'));
  await p.waitForTimeout(3500);
  return { ctx, p, erros };
}

/** o que a tela mostra do mapa, medido */
const LER = () => {
  const palco = document.querySelector('.mapa-palco[data-mapa="geral"]');
  const cx = palco ? palco.getBoundingClientRect() : null;
  const cai = (r) => !!cx && r.width > 0 && r.height > 0
    && r.x >= cx.x - 40 && r.x + r.width <= cx.x + cx.width + 40
    && r.y >= cx.y - 40 && r.y + r.height <= cx.y + cx.height + 40;
  const pinos = [...document.querySelectorAll('.maplibregl-marker .map-pino, .maplibregl-marker.map-pino')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        txt: el.textContent, min: el.classList.contains('min'),
        w: Math.round(r.width), h: Math.round(r.height),
        y: Math.round(r.y), dentro: cai(r),
        pos: getComputedStyle(el.closest('.maplibregl-marker')).position,
        anel: s.borderTopColor, cheio: s.backgroundColor,
      };
    });
  const euEl = document.querySelector('.maplibregl-marker .eu-puck, .maplibregl-marker.eu-puck');
  const raiz = getComputedStyle(document.querySelector('.app') || document.documentElement);
  const barra = document.querySelector('.plano-bar');
  const mapaObj = palco && palco.__hbxMapaObj;
  return {
    temPalco: !!palco,
    zoom: mapaObj ? Number(mapaObj.getZoom().toFixed(2)) : null,
    pinos,
    eu: euEl ? (() => {
      const r = euEl.getBoundingClientRect();
      const s = getComputedStyle(euEl);
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        x: Math.round(r.x), y: Math.round(r.y), dentro: cai(r),
        cheio: s.backgroundColor, anel: s.borderTopColor,
        halo: s.getPropertyValue('--halo').trim(),
      };
    })() : null,
    mapFundo: raiz.getPropertyValue('--map-fundo').trim(),
    mapRota: raiz.getPropertyValue('--map-rota').trim(),
    barraTexto: barra ? barra.innerText.replace(/\s+/g, ' ').trim() : '',
    barraEstado: !!barra && barra.classList.contains('estado'),
    alvoBuscando: !!document.querySelector('.plano-lado button.buscando'),
    pediuPermissao: window.__pediuPermissao,
  };
};

/** resolve uma cor de token (var(--x)) pro rgb() que o navegador calculou */
const RESOLVER = (valor) => {
  const d = document.createElement('div');
  d.style.color = valor;
  (document.querySelector('.app') || document.body).appendChild(d);
  const c = getComputedStyle(d).color;
  d.remove();
  return c;
};

(async () => {
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /* ======================================================================
     CASO 1 — TELA INICIAL SEM ROTA, PERMISSÃO JÁ CONCEDIDA.
     O ponto tem que existir sozinho (ninguém tocou em nada) e ANDAR no fix
     seguinte. Este é o "cadê minha localização?" do dono.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta, { itens: [], permissao: true });
    const a = await p.evaluate(LER);
    eh('1.1 sem rota: o mapa sobe', a.temPalco);
    eh('1.2 sem rota: NENHUM pino (rotaMontada falsa)', a.pinos.length === 0, `${a.pinos.length} pinos`);
    eh('1.3 permissao concedida: eu-pino existe SEM ninguem tocar', !!a.eu);
    eh('1.4 eu-pino esta DENTRO do palco', !!a.eu && a.eu.dentro,
      a.eu ? `x=${a.eu.x} y=${a.eu.y} ${a.eu.w}x${a.eu.h}` : 'ausente');
    eh('1.5 eu-pino nao pediu permissao (ja estava concedida)', a.pediuPermissao === 0,
      `pedidos=${a.pediuPermissao}`);
    eh('1.6 halo dimensionado pela PRECISAO do fix', !!a.eu && /^\d+px$/.test(a.eu.halo),
      a.eu ? `--halo=${a.eu.halo || '(vazio)'}` : 'ausente');
    // o fix NOVO: o ponto tem que andar
    const antes = a.eu ? a.eu.x + ',' + a.eu.y : '';
    await ctx.setGeolocation({ latitude: -22.4326, longitude: -47.6063, accuracy: 30 });
    await p.waitForTimeout(1800);
    const b = await p.evaluate(LER);
    const depois = b.eu ? b.eu.x + ',' + b.eu.y : '';
    eh('1.7 eu-pino ANDA no fix novo', !!b.eu && antes !== depois, `${antes} -> ${depois}`);
    eh('1.8 sem erro de pagina', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  /* ======================================================================
     CASO 1b — SEM PERMISSAO: nada de prompt espontaneo; o ALVO é que pede.
     ====================================================================== */
  {
    const { ctx, p } = await abrir(navegador, pele, porta, { itens: [], permissao: false });
    const a = await p.evaluate(LER);
    eh('1b.1 SEM permissao: ninguem pediu no boot nem ao abrir a tela',
      a.pediuPermissao === 0, `pedidos=${a.pediuPermissao}`);
    eh('1b.2 SEM permissao: sem eu-pino (posicao inventada seria mentira)', !a.eu);
    eh('1b.3 a barra assume o estado e vira PORTA', /desligada/i.test(a.barraTexto),
      `barra="${a.barraTexto}"`);
    // o DEDO no alvo: agora sim o pedido nasce
    await p.click('.plano-lado button');
    await p.waitForTimeout(700);
    const b = await p.evaluate(LER);
    eh('1b.4 toque no ALVO pede a permissao (1x)', b.pediuPermissao === 1,
      `pedidos=${b.pediuPermissao}`);
    // concedida pelo Android: o Kotlin avisa e a assinatura rearma na hora
    await ctx.grantPermissions(['geolocation']);
    await p.evaluate(() => window.HBXApp.locationPermissionChanged(true));
    await p.waitForTimeout(1800);
    const c = await p.evaluate(LER);
    eh('1b.5 concedida depois do toque: o eu-pino aparece e CENTRA', !!c.eu && c.eu.dentro,
      c.eu ? `x=${c.eu.x} y=${c.eu.y}` : 'ausente');
    await ctx.close();
  }

  /* ======================================================================
     CASO 2 — ROTA MONTADA COM 3 PARADAS.
     Os tres pinos numerados, no zoom em que a cidade inteira cabe. É o print
     do dono: fita desenhada e ZERO pino.
     ====================================================================== */
  {
    const itens = [0, 1, 2].map(paradaFalsa);
    const { ctx, p, erros } = await abrir(navegador, pele, porta, { itens, permissao: true });
    /* 🔴 MEDIDO NO ENQUADRAMENTO QUE A TELA ESCOLHE, não num zoom forçado por
       mim. `enquadrarGeral` abre a câmera na caixa do dia inteiro (as paradas
       mais o motorista) — aqui isso dá zoom ~10,7, BEM abaixo do corte de 13,6
       do rebaixamento. É esse o quadro do print do dono: ele abriu a aba Rota e
       viu a fita atravessando a cidade sem um pino sequer.
       (Este teste já reprovou por culpa DELE: eu forçava `setZoom(12)` depois
       do enquadramento, ampliava 1,3 níveis e depois cobrava da tela que os
       pinos continuassem dentro. Pino sair da tela quando o dedo aproxima é o
       mapa funcionando.) */
    const a = await p.evaluate(LER);
    eh('2.1 tres paradas => TRES pinos', a.pinos.length === 3, `${a.pinos.length} pinos`);
    eh('2.2 os pinos sao NUMERADOS 1,2,3',
      a.pinos.map((x) => x.txt).sort().join(',') === '1,2,3',
      a.pinos.map((x) => x.txt).join(','));
    eh('2.3 a tela abre em zoom-cidade (abaixo do corte de 13,6)',
      a.zoom !== null && a.zoom < 13.6, `zoom=${a.zoom}`);
    eh('2.4 nenhum rebaixado (regra da QUANTIDADE vence o zoom)',
      a.pinos.every((x) => !x.min), `min=${a.pinos.filter((x) => x.min).length}/3`);
    eh('2.5 marcador com position:absolute (a folha do maplibre carregou)',
      a.pinos.every((x) => x.pos === 'absolute'), a.pinos[0] ? a.pinos[0].pos : '-');
    eh('2.6 TODOS dentro do palco (o defeito era y=1095+ num viewport de 940)',
      a.pinos.length === 3 && a.pinos.every((x) => x.dentro),
      a.pinos.map((x) => 'y=' + x.y).join(' '));
    eh('2.7 tamanho legivel (>=20px)',
      a.pinos.every((x) => x.w >= 20 && x.h >= 20),
      a.pinos.map((x) => `${x.w}x${x.h}`).join(' '));
    eh('2.8 sem erro de pagina', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  /* ======================================================================
     CASO 3 — 50 PARADAS: o rebaixamento CONTINUA vivo, e volta atras no zoom.
     ====================================================================== */
  {
    const itens = Array.from({ length: 50 }, (_, i) => paradaFalsa(i));
    const { ctx, p } = await abrir(navegador, pele, porta, { itens, permissao: true });
    // mesma régua do caso 2: o quadro é o que a tela escolhe sozinha
    const a = await p.evaluate(LER);
    eh('3.0 a tela abre em zoom-cidade', a.zoom !== null && a.zoom < 13.6, `zoom=${a.zoom}`);
    eh('3.1 cinquenta paradas => cinquenta pinos', a.pinos.length === 50, `${a.pinos.length} pinos`);
    eh('3.2 zoom-cidade: TODOS rebaixados (nada de 50 bolas de 26px)',
      a.pinos.length === 50 && a.pinos.every((x) => x.min),
      `rebaixados=${a.pinos.filter((x) => x.min).length}/50`);
    eh('3.3 o rebaixado continua LEGIVEL (>=12px, com anel proprio)',
      a.pinos.every((x) => x.w >= 12 && x.h >= 12),
      a.pinos[0] ? `${a.pinos[0].w}x${a.pinos[0].h}` : '-');
    eh('3.4 rebaixado tambem cai DENTRO do palco',
      a.pinos.filter((x) => x.dentro).length === 50,
      `dentro=${a.pinos.filter((x) => x.dentro).length}/50`);
    // aproximar devolve o numero
    await p.evaluate(() => {
      document.querySelector('.mapa-palco[data-mapa="geral"]').__hbxMapaObj.setZoom(15);
    });
    await p.waitForTimeout(700);
    const b = await p.evaluate(LER);
    eh('3.5 zoom de bairro: o numero VOLTA',
      b.pinos.length === 50 && b.pinos.every((x) => !x.min),
      `rebaixados=${b.pinos.filter((x) => x.min).length}/50`);
    await ctx.close();
  }

  /* ======================================================================
     CASO 4 — CONTRASTE MEDIDO NOS 2 MODOS.
     Peca grafica: AA = 3,0. Texto do pino: AA = 4,5.
     Os dois fundos possiveis do pino sao OPOSTOS (chao do mapa e fita da
     rota), por isso a regra das duas tintas — ver o cabecalho.
     ====================================================================== */
  for (const luz of ['escuro', 'claro']) {
    const itens = [0, 1, 2].map(paradaFalsa);
    const { ctx, p } = await abrir(navegador, pele, porta, { itens, permissao: true, luz });
    const a = await p.evaluate(LER);
    const fundo = await p.evaluate(RESOLVER, a.mapFundo);
    const fita = await p.evaluate(RESOLVER, a.mapRota);
    const pino = a.pinos[0];
    const tinta = await p.evaluate(() => {
      const el = document.querySelector('.maplibregl-marker .map-pino, .maplibregl-marker.map-pino');
      return el ? getComputedStyle(el).color : '';
    });
    if (!pino) { eh(`4.${luz} pino presente pra medir`, false); await ctx.close(); continue; }

    const cFundo = duasTintas(pino.anel, pino.cheio, fundo);
    const cFita = duasTintas(pino.anel, pino.cheio, fita);
    eh(`4.1 [${luz}] pino vs CHAO do mapa >= 3,0`, cFundo >= 3, `${cFundo.toFixed(2)}:1`);
    eh(`4.2 [${luz}] pino vs FITA da rota >= 3,0`, cFita >= 3, `${cFita.toFixed(2)}:1`);
    const cTexto = razao(tinta, pino.cheio);
    eh(`4.3 [${luz}] numero dentro do pino >= 4,5 (texto)`, cTexto >= 4.5, `${cTexto.toFixed(2)}:1`);
    if (a.eu) {
      // o "eu" e medido contra o CHAO: ele tem 20px e a fita mede de 2 a 8 px,
      // entao a fita nunca e o fundo efetivo dele — ela passa POR BAIXO.
      const cEu = duasTintas(a.eu.anel, a.eu.cheio, fundo);
      eh(`4.4 [${luz}] eu-pino vs CHAO do mapa >= 3,0`, cEu >= 3, `${cEu.toFixed(2)}:1`);
    } else {
      eh(`4.4 [${luz}] eu-pino presente pra medir`, false);
    }
    await ctx.close();
  }

  /* ======================================================================
     CASO 5 — O ESTADO VAZIO DA TELA INICIAL (o redesenho), MEDIDO NO MOCK.

     🔴 E ELE TEM QUE SER MEDIDO NO MOCK-FONTE, não no app. O template `T.rota`
     mora em `mock.js`, que é GERADO pela injeção da casca — a mesma razão pela
     qual a pele é injetada nos casos de cima. Enquanto a injeção não roda (e
     ela é a última etapa, nunca deste arquivo), o app ainda pinta a barra
     antiga. O mock é a FONTE do visual: é nele que a casca se prova.
     ====================================================================== */
  {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 940 } });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file:///' + MOCK.replace(/\\/g, '/'));
    await p.waitForTimeout(700);
    for (const luz of ['escuro', 'claro']) {
      const a = await p.evaluate((l) => {
        document.documentElement.dataset.luz = l;
        // o dia POR MONTAR: sem rota, sem parada, com o GPS resolvido (senão
        // quem manda na barra é o aviso do GPS, que é outro estado)
        estadoRota = 'montar';
        PARADAS.length = 0;
        DADOS.rota.gps = '';
        ir('rota');
        const barra = document.querySelector('.plano-bar');
        const sub = document.querySelector('.plano-bar .txt em');
        const titulo = document.querySelector('.plano-bar .txt b');
        return {
          estado: !!barra && barra.classList.contains('estado'),
          texto: barra ? barra.innerText.replace(/\s+/g, ' ').trim() : '',
          fundo: barra ? getComputedStyle(barra).backgroundColor : '',
          corSub: sub ? getComputedStyle(sub).color : '',
          corTitulo: titulo ? getComputedStyle(titulo).color : '',
          linhas: barra ? Math.round(barra.getBoundingClientRect().height) : 0,
          botoesMontar: document.querySelectorAll('.plano-bar [data-acao="montar"]').length,
        };
      }, luz);
      if (luz === 'escuro') {
        eh('5.1 dia por montar: a barra vira CARTAO DE ESTADO', a.estado, `estado=${a.estado}`);
        eh('5.2 ela diz o fato E o caminho',
          /Sem paradas hoje/.test(a.texto) && /Monte a rota/.test(a.texto), `"${a.texto}"`);
        eh('5.3 e NAO nasce um segundo botao de montar (o dock ja e o CTA)',
          a.botoesMontar === 0, `botoes=${a.botoesMontar}`);
        eh('5.4 a barra cresceu pra caber as duas linhas', a.linhas >= 44, `${a.linhas}px`);
      }
      // texto novo na tela = contraste novo pra medir (AA de texto = 4,5)
      const cSub = razao(a.corSub, a.fundo);
      const cTit = razao(a.corTitulo, a.fundo);
      eh(`5.5 [${luz}] a DICA (texto novo) >= 4,5`, cSub >= 4.5, `${cSub.toFixed(2)}:1`);
      eh(`5.6 [${luz}] o TITULO do estado >= 4,5`, cTit >= 4.5, `${cTit.toFixed(2)}:1`);
    }
    eh('5.7 o mock nao quebrou', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n== PROVA DO MAPA 2D ==\n');
  ok.forEach((n) => console.log('  OK   ' + n));
  falhou.forEach((n) => console.log('  FALHOU ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}\n`);
  process.exit(falhou.length ? 1 : 0);
})();
