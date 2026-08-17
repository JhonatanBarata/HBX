#!/usr/bin/env node
/**
 * PROVA DO "2D E 3D SAO UMA TELA SO" — o cromo dos dois modos com rota montada,
 * medido na tela e no retangulo, nunca na marca.
 *
 *     node scripts/prova-mapa-uma-tela.js
 *
 * 🔴 O QUE ELA COBRA (contrato `docs/PLANEJAMENTOS/PR17082026-2D-3D-UMA-TELA-SO.md`,
 * itens 1, 2, 3, 8 e 9 do dono — as 8 fotos da madrugada de 16/08):
 *
 *   1. TELA CHEIA NOS DOIS. Com o dia montado, nem cabecalho de app empurrando o
 *      corpo nem barra de abas: o mapa vai do topo ao pe da tela. E quem desliga
 *      isso e UM icone (`[data-acao="tela-cheia"]`), o PRIMEIRO da coluna
 *      lateral, imediatamente acima do atalho do chat (contrato D3: tela-cheia →
 *      chat → voz → alvo).
 *   2. O CHAT MUDA DE CASA JUNTO COM A TELA CHEIA. Cheio, ele e o atalho da
 *      coluna (o cabecalho nao esta na tela); sem cheio, o atalho SOME e o balao
 *      do cabecalho volta a existir. Duas portas pro mesmo destino e a mentira do
 *      "dado em 2 cards" — e o pior dos dois mundos e nenhuma porta.
 *   3. A TIRA DE INDICADORES (foto 1: `2 h 13 restante · 73,9 km distancia ·
 *      00:58 chegada`) passa a existir nos DOIS modos, com os MESMOS textos e
 *      sendo a MESMA peca. Peca com duas copias e a receita de as duas
 *      divergirem amanha — foi o que fez as fotos 1 e 2 parecerem apps
 *      diferentes.
 *   4. O PAINEL DE 4 (item 8): [Cancelar] [Registrar] [Finalizar]
 *      [Panoramica|Direcao], nesta ordem, nos dois modos — e o cadeado
 *      (`fechar-dia`) SAI da coluna, porque ele virou o Finalizar. Botao repetido
 *      a 60px de si mesmo e o defeito que esta casa pagou em 12/08.
 *   5. O BOTAO DO MEIO TRANSMUXA (item 3): 2D = `Direcao` (glifo `nav`),
 *      3D = `Panoramica` (glifo `map`). O rotulo E o glifo, juntos.
 *   6. O RODAPE E UMA PECA SO (contrato D4): mesma altura e mesma distancia do pe
 *      da tela nos dois modos. Era ISTO que estava torto — o dock do 2D esta
 *      cravado em `bottom:60px` (a vaga da barra de abas, que na tela cheia nao
 *      existe), enquanto o rodape de dirigir pousa a 4px do pe.
 *   7. O CHAT COM ROTA ATIVA NAO SAI DA TELA CHEIA (item 9): ele vira POP-UP
 *      (`.chat-wrap`) por cima do mapa. Nao troca de tela, nao renasce o mapa, e
 *      fechar nao repinta nada.
 *
 * 🔴 A REGRA DE MEDIDA E A DA PROVA IRMA (`prova-ir-e-vir.js`): mede-se o
 * RESULTADO, nunca a marca. "O mapa chega ao pe da tela" e retangulo comparado
 * com o retangulo do `#app`, com tolerancia de 2px; "o pop-up esta por cima do
 * mapa" e `elementFromPoint` no centro do palco (z-order + geometria de
 * verdade), nao a existencia da classe; "o mapa e o mesmo" e carimbo no NO e no
 * objeto maplibre, que e a regua que a prova irma ja usa.
 *
 * 🔴 O PLACAR DA 1a CORRIDA, E O QUE ELE ACHOU (17/08, 41/46 e depois 42/46).
 * Ela foi escrita pra nascer vermelha (a casca de 16/08 tinha o 2D parando 79px
 * acima do pe, a tira so no 3D, 3 alvos no rodape e cadeado nas duas colunas) —
 * e mediu uma casca que MUDOU no meio: os itens 1 a 8 chegaram enquanto ela era
 * escrita. Ela vale como PORTAO deles, e o vermelho que sobra e um so, real e
 * nomeado: o ITEM 9. O gancho `abrir-chat` existe na coluna (mock) e o
 * `.chat-wrap` ja e preservado no repinte (§ `chatVivo` no `pintar`), mas
 * NINGUEM cria o pop-up — a ponte reserva o gancho sem atender (§ o mapa de
 * acoes em `D0-porta-entrega.js`), entao o toque nao troca de tela e tambem nao
 * abre nada. As 8 linhas do bloco 7 sao esse buraco (6 vermelhas: 7.1 a 7.8
 * menos as duas que sobreviveriam a um botao morto — ver o comentario do bloco).
 *
 * 🔴 O QUE NAO PODE E SAIR VERDE POR ENGANO — por isso toda comparacao "os dois
 * modos sao iguais" exige que o lado medido EXISTA (`'' === ''` seria um verde de
 * mentira), e o "o atalho do chat some sem tela cheia" e medido como DELTA
 * (existe com, some sem): sozinho, ele ficaria verde num app que nunca teve o
 * atalho. Verde de mentira certifica o contrario do que aconteceu.
 *
 * 🔴 E ELA MORDE — MEDIDO, nao prometido (17/08, com a casca inteira verde). Como
 * a frente chegou junto e o placar fechou 46/46 na 1a passada limpa, o dente foi
 * conferido injetando o defeito de VERDADE na bancada, por CSS e por DOM (nada de
 * editar fonte alheia em trabalho):
 *   · `.gps.dirigindo .gps-rodape{bottom:60px}` (o defeito historico, o dock
 *     cravado na vaga das abas) → 6.3 reprovou: `3D=60px 2D=4px`;
 *   · tirando o `abrir-chat` da coluna → 1.5, 2.1 e — o que importa — a 2.4
 *     reprovaram: `com cheio=nao sem cheio=nao`. A regua do DELTA se recusou a
 *     dar verde num app que nunca teve o atalho, que era o ponto dela.
 * Antes disso a prova ja tinha reprovado de verdade duas vezes (41/46 e 42/46),
 * apontando o `.chat-wrap` que ainda nao existia e um erro MEU: a 1.1 media o
 * `position` do `.hdr` (marca) em vez do topo do corpo (resultado).
 *
 * ⚠️ BANCADA: ao contrario da prova irma, esta NAO injeta a pele do mock-fonte.
 * Motivo, e ele e desta prova: o `<style>` do mock traz `.app{width:412px;
 * height:940px;border-radius:38px}` — a MOLDURA DE CELULAR da maquete —, e o
 * gerador troca isso por `100%/100dvh` (§ fim do `mock.css`). Prova que mede "o
 * mapa encosta no pe da tela" com a moldura da maquete no ar mede o MOCKUP, nao
 * o app. Aqui vale o gerado, que e o que roda no aparelho — com uma assercao de
 * bancada (0.1) que reprova se a pele nao subiu, em vez de medir o nada.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** a folga que uma peca pode ter do pe/topo da tela e continuar "encostada":
 *  2px cobre arredondamento de subpixel do layout, e nada mais. */
const TOL = 2;

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

const BASE = { lat: -22.4126, lng: -47.5763 };
const aoNorte = (m) => BASE.lat + (m / 110540);

const paradaFalsa = (i) => ({
  id: `e${i}`, status: 'pendente', rotaOrdem: i, quantidade: 1,
  cliente: {
    id: `c${i}`, nome: `Cliente ${i + 1}`,
    enderecoLinha: `Rua ${i + 1}, 100`, bairro: 'Centro',
    lat: aoNorte(700 * (i + 1)), lng: BASE.lng,
  },
});

/* o dublê do basemap: sem tile no disco o `querySourceFeatures` devolve vazio e a
   cena das ruas encerra em 'sem-rua'. Mesma armadilha da prova irmã — aqui ela
   entra porque a cena de entrar na tela cheia é a MESMA nas duas provas, e cena
   que morre cedo mudaria o tempo de assentar que esta prova espera. */
const RUAS_FALSAS = (eu) => {
  const N = 8;
  const passo = 0.0035;
  const meio = ((N - 1) * passo) / 2;
  const f = [];
  for (let i = 0; i < N; i += 1) {
    const lat = eu.lat - meio + (i * passo);
    const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([eu.lng - meio + ((k * (N - 1) * passo) / 4), lat]);
    f.push({ type: 'Feature', properties: { name: `Rua ${i}`, kind: i === 3 ? 'major_road' : 'minor_road' }, geometry: { type: 'LineString', coordinates: c } });
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

/* O DUBLÊ DA PONTE NATIVA. Igual ao da prova irmã, com UMA peça a mais: o
   `cache`. A preferência de tela cheia mora no APARELHO (§ `CHAVE_CHEIO` no
   `80-gps-rotas-salvas.js`), então sem cache eu mediria uma preferência que só
   existe dentro desta corrida — e o item 1 é justamente sobre ela persistir. */
const PONTE = ({ itens, geo }) => {
  window.HBX = {
    cache: {
      get(chave, padrao) {
        try { const cru = localStorage.getItem(`hbx:${chave}`); return cru ? JSON.parse(cru) : padrao; }
        catch (_) { return padrao; }
      },
      set(chave, valor) { try { localStorage.setItem(`hbx:${chave}`, JSON.stringify(valor)); } catch (_) {} },
      remove(chave) { try { localStorage.removeItem(`hbx:${chave}`); } catch (_) {} },
    },
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1', moduloFinanceiroAtivo: false,
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        return Promise.resolve({
          code: 'Ok',
          routes: [{
            distance: 4200, duration: 640,
            geometry: { type: 'LineString', coordinates: geo },
            legs: [{ steps: [{ maneuver: { type: 'turn', modifier: 'right', location: geo[3] }, name: 'Rua Sete' }] }],
          }],
        });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({}), set: () => {} },
  };
  window.HBXApp = window.HBXApp || {};
};

/* ==========================================================================
   O ESPIÃO — uma passada só na tela viva, e ele devolve MEDIDA, não opinião.

   🔴 A CAMADA VIVA É A QUE NÃO ESTÁ SAINDO. Na troca existem DUAS `.tela` no ar
   (é assim que o show funciona, § `pintar`), e medir a errada é medir o cromo
   velho — o mesmo cuidado que a fita da prova irmã tem.
   ========================================================================== */
const ESPIAR = () => {
  const nz = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  /* o HTML passado pelo parser+serializador do próprio navegador. Sem isto,
     comparar o glifo do botão (já serializado) com o que `ic()` devolve (string
     de fonte) reprovaria por `<path/>` vs `<path></path>` — diferença de
     serializador, não de desenho. */
  const serial = (html) => { const d = document.createElement('div'); d.innerHTML = String(html == null ? '' : html); return nz(d.innerHTML); };

  window.__seq = window.__seq || { p: 0, v: 0, m: 0 };
  const camadas = [...document.querySelectorAll('#app .tela')];
  const viva = camadas.filter((c) => !c.classList.contains('sai')).pop() || camadas[camadas.length - 1] || null;
  const q = (s) => (viva ? viva.querySelector(s) : null);
  const qq = (s) => (viva ? [...viva.querySelectorAll(s)] : []);

  /* O PÉ E O TOPO DA TELA são os do `#app` (`100%/100dvh` no gerado), nunca
     `innerHeight` cru: é o retângulo que o aparelho desenha. */
  const caixa = document.getElementById('app');
  const rApp = caixa ? caixa.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };

  /* ---- as marcas do mapa: NÓ, NÓ VIVO e OBJETO ---------------------------
     Três carimbos porque três coisas diferentes podem "renascer":
       palco  — o `.mapa-palco` vem do HTML da camada: morre em todo repinte;
       vivo   — o `.mapa-vivo` é o nó do maplibre, TRANSPLANTADO de pai em pai
                (§ `montarMapa`): sobrevive ao repinte, morre se o mapa renascer;
       obj    — a instância do maplibre, a régua que a prova irmã usa.
     "Fechar o pop-up não repinta o mapa" se mede pelo primeiro; "o mapa é o
     mesmo" pelos outros dois. */
  const palco = q('.mapa-palco');
  if (palco && !palco.__hbxMarcaP) { window.__seq.p += 1; palco.__hbxMarcaP = `palco${window.__seq.p}`; }
  const noVivo = palco ? palco.querySelector('.mapa-vivo') : null;
  if (noVivo && !noVivo.__hbxMarcaV) { window.__seq.v += 1; noVivo.__hbxMarcaV = `vivo${window.__seq.v}`; }
  const obj = palco ? palco.__hbxMapaObj : null;
  if (obj && !obj.__hbxMarcaM) { window.__seq.m += 1; obj.__hbxMarcaM = `mapa${window.__seq.m}`; }
  const rPalco = palco ? palco.getBoundingClientRect() : null;

  /* A COLUNA É UM SELETOR SÓ nos dois modos (contrato D3) — se algum dia virar
     dois nomes, esta linha é a que grita. */
  const coluna = q('.plano-lado,.gps-lado');
  const gancho = (el) => {
    if (!el) return '';
    const d = el.dataset || {};
    if (d.acao) return `acao:${d.acao}`;
    if (d.estado) return `estado:${d.estado}`;
    if (d.ir) return `ir:${d.ir}`;
    return 'sem-gancho';
  };

  /* O RODAPÉ DESTE MODO. O contrato (D4) diz que é `.gps-rodape` nos dois; hoje o
     2D usa `.tmx-dock`. A prova pega o que o modo TEM — assim a geometria do item
     6 mede o resultado na tela (alturas e pé diferentes = vermelho), e a peça
     única é cobrada à parte, pelo nome. */
  const rodape = q('.gps-rodape') || q('.tmx-dock');
  const rRod = rodape ? rodape.getBoundingClientRect() : null;
  const tira = rodape ? rodape.querySelector('.indicadores') : null;
  const vivoTxt = (campo) => {
    const el = rodape ? rodape.querySelector(`[data-vivo="${campo}"]`) : null;
    return el ? nz(el.textContent) : '';
  };
  const tmx = rodape ? rodape.querySelector('.transmux') : null;
  /* ALVOS DE TOQUE DO RODAPÉ — contados no rodapé inteiro, não só no `.transmux`:
     o item 8 fala de "4 alvos no rodapé", e um quinto botão fora do transmux
     continuaria sendo um quinto botão debaixo do polegar. */
  const alvos = rodape ? [...rodape.querySelectorAll('button,.tmx-nota')] : [];
  const principal = tmx ? tmx.querySelector('.tmx-main button,.tmx-main .tmx-nota') : null;

  /* O ATALHO DO CHAT NA COLUNA. Aceita os dois ganchos de propósito: o contrato
     nomeia `abrir-chat` (o pop-up do item 9) e a coluna de hoje usa o `ir:chat`
     do balão. Quem separa os dois é a assertiva do item 9 — que mede se o toque
     TROCA DE TELA —, não este seletor. */
  const chat = coluna ? coluna.querySelector('[data-acao="abrir-chat"],[data-ir="chat"]') : null;

  /* "POR CIMA DO MAPA" É HIT-TEST, não classe: quem responde no centro do palco
     é quem está por cima de verdade (z-index + geometria + pointer-events). */
  const pops = [...document.querySelectorAll('.chat-wrap')];
  let popCobre = false;
  if (pops.length && rPalco && rPalco.width > 4 && rPalco.height > 4) {
    const x = Math.round(rPalco.left + (rPalco.width / 2));
    const y = Math.round(rPalco.top + (rPalco.height / 2));
    const em = document.elementFromPoint(x, y);
    popCobre = !!(em && em.closest && em.closest('.chat-wrap'));
  }

  /* 🔴 O CABEÇALHO SÓ CONTA COMO DEFEITO SE ELE EMPURRAR — e "empurrar" é MEDIDA,
     não a marca `position` dele. O contrato D2 prevê um cabeçalho FLUTUANTE no 2D
     em tela cheia (a foto 5, dentro do `.plano-topo`, que é `position:absolute`):
     o `.hdr` lá dentro continua `relative` e não empurra NADA. A 1ª escrita desta
     prova olhava o `position` do próprio `.hdr` e reprovou uma tela cheia
     perfeita — palco de topo 0 a pé 0 — só porque a marca dizia "relative".
     A régua honesta é o CORPO: se algo empurra, o `.body` começa abaixo do topo
     da tela. É a mesma lei da prova irmã (mede-se o resultado, nunca a marca). */
  const hdrEl = q('.hdr');
  const corpo = q('.body');
  const rCorpo = corpo ? corpo.getBoundingClientRect() : null;

  const arr = (v) => Math.round(v * 10) / 10;
  return {
    tela: (() => { try { return atual; } catch (_) { return null; } })(),
    estado: (() => { try { return estadoRota; } catch (_) { return null; } })(),
    camadas: camadas.length,
    // o modo lido do DESENHO (a casca não expõe o modo no window): `.gps` é a
    // tela de dirigir, `.plano` é o 2D — mesma régua da fita da prova irmã.
    modo: q('.gps') ? '3d' : (q('.plano') ? '2d' : ''),
    // a pele do GERADO subiu? `--map-btn` é a régua do cromo (46px, § .plano,.gps)
    regua: coluna ? nz(getComputedStyle(coluna).getPropertyValue('--map-btn')) : '',
    hdr: !!hdrEl,
    corpoTopo: rCorpo ? arr(rCorpo.top - rApp.top) : null,
    // o defeito é o corpo COMEÇAR ABAIXO do topo, e só ele
    hdrEmpurra: !!rCorpo && (rCorpo.top - rApp.top) > 2,
    hdrChat: !!q('.hdr [data-ir="chat"]'),
    nav: !!q('.nav'),
    palcoTopo: rPalco ? arr(rPalco.top - rApp.top) : null,
    palcoPe: rPalco ? arr(rApp.bottom - rPalco.bottom) : null,
    marca: {
      palco: (palco && palco.__hbxMarcaP) || null,
      vivo: (noVivo && noVivo.__hbxMarcaV) || null,
      obj: (obj && obj.__hbxMarcaM) || null,
    },
    coluna: coluna ? [...coluna.querySelectorAll('button')].map(gancho) : [],
    telaCheiaBotoes: qq('[data-acao="tela-cheia"]').length,
    cadeadoNaColuna: !!(coluna && coluna.querySelector('[data-acao="fechar-dia"]')),
    chatNaColuna: !!chat,
    rodapePeca: rodape ? (rodape.classList.contains('gps-rodape') ? 'gps-rodape' : 'tmx-dock') : '',
    rodapeAlt: rRod ? arr(rRod.height) : null,
    rodapePe: rRod ? arr(rApp.bottom - rRod.bottom) : null,
    tiraHtml: tira ? nz(tira.outerHTML) : '',
    ind: { restante: vivoTxt('restante'), distancia: vivoTxt('distancia'), chegada: vivoTxt('chegada') },
    alvos: alvos.map(gancho),
    rotulos: alvos.map((b) => {
      const cx = b.closest('.tmx-sat,.tmx-main');
      const s = cx ? cx.querySelector('small') : null;
      return s ? nz(s.textContent) : '';
    }),
    rotuloMain: tmx ? nz((tmx.querySelector('.tmx-main small') || {}).textContent) : '',
    glifoMain: principal ? nz(principal.innerHTML) : '',
    refNav: (() => { try { return serial(ic('nav', 24)); } catch (_) { return ''; } })(),
    refMap: (() => { try { return serial(ic('map', 24)); } catch (_) { return ''; } })(),
    pop: pops.length,
    popCobre,
  };
};

const ok = [];
const falhou = [];
const notas = [];
const nota = (s) => notas.push(s);
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** a ordem que o contrato manda na coluna (D3) — os dois primeiros são o item 1 */
const COLUNA_ESPERADA = ['acao:tela-cheia', 'atalho de chat'];
/** os 4 alvos do rodapé (item 8), na ordem, com o verbo de modo no fim */
const PAINEL_2D = ['acao:cancelar-rota', 'acao:registrar-local', 'acao:fechar-dia', 'estado:navegar'];
const PAINEL_3D = ['acao:cancelar-rota', 'acao:registrar-local', 'acao:fechar-dia', 'ir:rota'];

async function abrir(navegador, porta) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: BASE.lat, longitude: BASE.lng, accuracy: 18 },
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(ARMADILHA, RUAS_FALSAS(BASE));
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.waitForTimeout(600);
  const itens = [0, 1, 2, 3, 4].map(paradaFalsa);
  const geo = Array.from({ length: 14 }, (_, i) => [BASE.lng, aoNorte(i * 260)]);
  await p.evaluate(PONTE, { itens, geo });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('rota'));
  // a cena de ENTRADA da Rota tem que ter acabado: é UMA cena por vez, e medir
  // retângulo no meio da cena é medir a animação (o mesmo motivo do 5600 da irmã)
  await p.waitForTimeout(5600);
  return { ctx, p, erros };
}

(async () => {
  // o GERADO primeiro: esta prova abre `assets/app/**`, que é SAÍDA da costura.
  regenerarGerados();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const { ctx, p, erros } = await abrir(navegador, porta);

  /** troca de modo e ESPERA assentar (troca 580ms + cena 900ms + o mapa acertar) */
  const irPara = async (tela) => {
    await p.evaluate((t) => window.ir(t), tela);
    await p.waitForTimeout(3600);
  };
  /** o seam, nunca o arquivo: é assim que se força preferência de aparelho aqui */
  const seam = async (secao, valor) => {
    await p.evaluate(([s, v]) => window.usarDados(s, v), [secao, valor]);
    await p.waitForTimeout(900);
  };
  const tocarChat = () => p.evaluate(() => {
    const camadas = [...document.querySelectorAll('#app .tela')];
    const viva = camadas.filter((c) => !c.classList.contains('sai')).pop() || camadas[camadas.length - 1];
    const col = viva && viva.querySelector('.plano-lado,.gps-lado');
    const b = col && col.querySelector('[data-acao="abrir-chat"],[data-ir="chat"]');
    if (b) b.click();
    return !!b;
  });
  /* FECHAR O POP-UP pelo verbo que esta casa já usa nos outros: `[data-fechar]`
     (§ o roteador do mock fecha `.erro-wrap`/`.conf-wrap`/`.portao-wrap`/
     `.chegou-wrap` por ele). O contrato não nomeou o fechar do `.chat-wrap`, então
     a prova aceita também um botão de fechar por rótulo — e cobra o RESULTADO
     (o pop-up sai, o mapa não repinta), que é o que o item 9 promete. */
  const fecharPop = () => p.evaluate(() => {
    const w = document.querySelector('.chat-wrap');
    if (!w) return 'sem-pop-up';
    const b = w.querySelector('[data-fechar]')
      || [...w.querySelectorAll('button')].find((x) => /fechar|voltar/i.test(x.getAttribute('aria-label') || ''))
      || w.querySelector('button');
    if (!b) return 'sem-botao-de-fechar';
    b.click();
    return 'tocou';
  });

  // ======================================================================
  // CENA 1 — o 2D com a rota RODANDO e a tela cheia ligada (o padrão)
  // ======================================================================
  const a = await p.evaluate(ESPIAR);
  nota(`[2D] tela=${a.tela}/${a.modo} estado=${a.estado} camadas=${a.camadas} regua=${a.regua}`);
  nota(`[2D] palco topo=${a.palcoTopo}px pe=${a.palcoPe}px · corpo topo=${a.corpoTopo}px · hdr=${a.hdr ? (a.hdrEmpurra ? 'empurra' : 'flutua') : 'nao'} · nav=${a.nav ? 'sim' : 'nao'}`);
  nota(`[2D] coluna=[${a.coluna.join(' > ')}] · tela-cheia=${a.telaCheiaBotoes} · cadeado=${a.cadeadoNaColuna ? 'sim' : 'nao'} · chat=${a.chatNaColuna ? 'sim' : 'nao'}`);
  nota(`[2D] rodape=${a.rodapePeca || 'nenhum'} alt=${a.rodapeAlt}px pe=${a.rodapePe}px · alvos=[${a.alvos.join(' > ')}]`);
  nota(`[2D] indicadores=${JSON.stringify(a.ind)} · main="${a.rotuloMain}"`);

  eh('0.1 BANCADA: a pele do GERADO subiu (a regua do cromo resolve)',
    a.regua === '46px', `--map-btn=${a.regua || 'vazio'}`);
  eh('0.2 BANCADA: a rota esta RODANDO e a tela e o 2D',
    a.estado === 'rodando' && a.tela === 'rota' && a.modo === '2d',
    `estado=${a.estado} tela=${a.tela} modo=${a.modo}`);
  eh('0.3 BANCADA: uma camada so no ar (o show assentou antes de medir)',
    a.camadas === 1, `camadas=${a.camadas}`);

  eh('1.1 2D CHEIO: nada empurra o corpo (o corpo comeca no topo da tela)',
    a.corpoTopo != null && Math.abs(a.corpoTopo) <= TOL,
    `corpo topo=${a.corpoTopo}px · hdr=${a.hdr ? (a.hdrEmpurra ? 'empurra' : 'flutuante, D2 permite') : 'nao existe'}`);
  eh('1.2 2D CHEIO: sem barra de abas', !a.nav, a.nav ? '.nav na tela' : 'sem .nav');
  eh('1.3 2D CHEIO: o mapa vai do topo ao PE da tela',
    a.palcoTopo != null && Math.abs(a.palcoTopo) <= TOL && a.palcoPe != null && Math.abs(a.palcoPe) <= TOL,
    `topo=${a.palcoTopo}px pe=${a.palcoPe}px (tol ${TOL})`);
  eh('1.4 2D: existe UM interruptor de tela cheia',
    a.telaCheiaBotoes === 1, `[data-acao="tela-cheia"]=${a.telaCheiaBotoes}`);
  eh('1.5 2D: ele e o PRIMEIRO da coluna, e o chat vem logo abaixo',
    a.coluna[0] === 'acao:tela-cheia' && !!a.chatNaColuna
      && (a.coluna[1] === 'acao:abrir-chat' || a.coluna[1] === 'ir:chat'),
    `coluna=[${a.coluna.join(' > ')}] esperado=[${COLUNA_ESPERADA.join(' > ')} > ...]`);
  eh('2.1 2D CHEIO: o atalho do chat esta na coluna (o cabecalho nao esta na tela)',
    a.chatNaColuna, a.chatNaColuna ? 'na coluna' : 'sem atalho');

  eh('4.1 2D: o rodape tem exatamente 4 alvos de toque',
    a.alvos.length === 4, `alvos=${a.alvos.length} [${a.alvos.join(' > ')}]`);
  eh('4.2 2D: a ordem e Cancelar > Registrar > Finalizar > Direcao',
    igual(a.alvos, PAINEL_2D), `[${a.alvos.join(' > ')}]`);
  eh('4.3 2D: nenhum cadeado sobrou na coluna lateral',
    !a.cadeadoNaColuna, a.cadeadoNaColuna ? 'fechar-dia ainda na coluna' : 'limpo');
  eh('5.1 2D: o rotulo do botao do meio e "Direcao"',
    /^Dire[cç][aã]o$/.test(a.rotuloMain), `rotulo="${a.rotuloMain}"`);
  eh('5.2 2D: o glifo do botao do meio e o `nav`',
    !!a.glifoMain && a.glifoMain === a.refNav, a.glifoMain ? 'glifo lido' : 'sem glifo');

  // ======================================================================
  // CENA 2 — a IDA ao 3D: o mesmo cromo, a mesma peça
  // ======================================================================
  await irPara('mapa');
  const b = await p.evaluate(ESPIAR);
  nota(`[3D] tela=${b.tela}/${b.modo} camadas=${b.camadas}`);
  nota(`[3D] palco topo=${b.palcoTopo}px pe=${b.palcoPe}px · corpo topo=${b.corpoTopo}px · hdr=${b.hdr ? 'sim' : 'nao'} · nav=${b.nav ? 'sim' : 'nao'}`);
  nota(`[3D] coluna=[${b.coluna.join(' > ')}] · tela-cheia=${b.telaCheiaBotoes} · cadeado=${b.cadeadoNaColuna ? 'sim' : 'nao'}`);
  nota(`[3D] rodape=${b.rodapePeca || 'nenhum'} alt=${b.rodapeAlt}px pe=${b.rodapePe}px · alvos=[${b.alvos.join(' > ')}]`);
  nota(`[3D] indicadores=${JSON.stringify(b.ind)} · main="${b.rotuloMain}"`);
  nota(`[mapa] marcas 2D=${JSON.stringify(a.marca)} 3D=${JSON.stringify(b.marca)}`);

  eh('1.6 3D CHEIO: nada empurra o corpo e nao ha barra de abas',
    b.corpoTopo != null && Math.abs(b.corpoTopo) <= TOL && !b.nav,
    `corpo topo=${b.corpoTopo}px · hdr=${b.hdr ? 'sim' : 'nao'} · nav=${b.nav ? 'sim' : 'nao'}`);
  eh('1.7 3D CHEIO: o mapa vai do topo ao PE da tela',
    b.palcoTopo != null && Math.abs(b.palcoTopo) <= TOL && b.palcoPe != null && Math.abs(b.palcoPe) <= TOL,
    `topo=${b.palcoTopo}px pe=${b.palcoPe}px (tol ${TOL})`);
  eh('1.8 3D: existe UM interruptor de tela cheia',
    b.telaCheiaBotoes === 1, `[data-acao="tela-cheia"]=${b.telaCheiaBotoes}`);
  eh('1.9 3D: ele e o PRIMEIRO da coluna, e o chat vem logo abaixo',
    b.coluna[0] === 'acao:tela-cheia' && !!b.chatNaColuna
      && (b.coluna[1] === 'acao:abrir-chat' || b.coluna[1] === 'ir:chat'),
    `coluna=[${b.coluna.join(' > ')}]`);
  eh('2.2 3D CHEIO: o atalho do chat esta na coluna',
    b.chatNaColuna, b.chatNaColuna ? 'na coluna' : 'sem atalho');

  eh('4.4 3D: o rodape tem exatamente 4 alvos de toque',
    b.alvos.length === 4, `alvos=${b.alvos.length} [${b.alvos.join(' > ')}]`);
  eh('4.5 3D: a ordem e Cancelar > Registrar > Finalizar > Panoramica',
    igual(b.alvos, PAINEL_3D), `[${b.alvos.join(' > ')}]`);
  eh('4.6 3D: nenhum cadeado sobrou na coluna lateral',
    !b.cadeadoNaColuna, b.cadeadoNaColuna ? 'fechar-dia ainda na coluna' : 'limpo');
  /* 🔴 O FINALIZAR TEM QUE SER O VERBO QUE ENCERRA DE VERDADE, nos dois modos: é
     `fechar-dia` (POST /logistica/rota/encerrar + o recibo), o único que fecha o
     dia. Rótulo novo apontando pro destino velho é a mentira de 16/08 de volta. */
  eh('4.7 o Finalizar e o `fechar-dia` nos DOIS modos, com o rotulo do dono',
    a.alvos[2] === 'acao:fechar-dia' && b.alvos[2] === 'acao:fechar-dia'
      && /^Finalizar$/.test(a.rotulos[2] || '') && /^Finalizar$/.test(b.rotulos[2] || ''),
    `2D="${a.rotulos[2] || ''}"(${a.alvos[2] || '-'}) 3D="${b.rotulos[2] || ''}"(${b.alvos[2] || '-'})`);

  eh('5.3 3D: o rotulo do botao do meio e "Panoramica"',
    /^Panor[aâ]mica$/.test(b.rotuloMain), `rotulo="${b.rotuloMain}"`);
  eh('5.4 3D: o glifo do botao do meio e o `map`',
    !!b.glifoMain && b.glifoMain === b.refMap, b.glifoMain ? 'glifo lido' : 'sem glifo');
  /* o par: o glifo TRANSMUXA junto com o rótulo. Dois glifos iguais com dois
     nomes diferentes é o botão dizendo uma coisa e desenhando outra. */
  eh('5.5 o glifo TRANSMUXA junto com o rotulo (2D != 3D)',
    !!a.glifoMain && !!b.glifoMain && a.glifoMain !== b.glifoMain,
    a.glifoMain === b.glifoMain ? 'o mesmo desenho nos dois' : 'desenhos diferentes');

  // ======================================================================
  // CENA 3 — a VOLTA ao 2D: a tira e o rodapé são A MESMA PEÇA
  // ======================================================================
  await irPara('rota');
  const c = await p.evaluate(ESPIAR);
  nota(`[2D volta] indicadores=${JSON.stringify(c.ind)} · rodape=${c.rodapePeca || 'nenhum'} alt=${c.rodapeAlt}px pe=${c.rodapePe}px`);
  nota(`[tira] 2D=${c.tiraHtml ? `${c.tiraHtml.length} chars` : 'NAO EXISTE'} · 3D=${b.tiraHtml ? `${b.tiraHtml.length} chars` : 'NAO EXISTE'}`);

  const cheios = (o) => !!(o.ind.restante && o.ind.distancia && o.ind.chegada);
  eh('3.1 3D: a tira tem restante, distancia e chegada COM valor',
    cheios(b), JSON.stringify(b.ind));
  /* 🔴 A TIRA DO 2D É MEDIDA NA VOLTA DO 3D DE PROPÓSITO: os três números são
     escritos por `pintarNavegacao`, que hoje só corre com a navegação à vista
     (§ `aoMover`). Medindo depois da ida, o dado JÁ está no seam — então o que
     esta linha cobra é a PEÇA existir no 2D, não a rede. Se um dia ela reprovar
     com o 3D verde, o defeito é a tira; se reprovar nos dois, é o dado. */
  eh('3.2 2D: a tira tem restante, distancia e chegada COM valor',
    cheios(c), JSON.stringify(c.ind));
  eh('3.3 os TEXTOS sao os mesmos nos dois modos',
    cheios(b) && cheios(c) && igual(b.ind, c.ind), `3D=${JSON.stringify(b.ind)} 2D=${JSON.stringify(c.ind)}`);
  eh('3.4 a tira e a MESMA peca (HTML normalizado identico)',
    !!b.tiraHtml && b.tiraHtml === c.tiraHtml,
    !b.tiraHtml ? 'nao achei a tira no 3D' : (b.tiraHtml === c.tiraHtml ? 'identica' : 'HTML diferente'));

  eh('6.1 o rodape e a MESMA peca nos dois modos (`.gps-rodape`)',
    b.rodapePeca === 'gps-rodape' && c.rodapePeca === 'gps-rodape',
    `3D=${b.rodapePeca || 'nenhum'} 2D=${c.rodapePeca || 'nenhum'}`);
  eh('6.2 o rodape tem a MESMA altura nos dois modos',
    b.rodapeAlt != null && c.rodapeAlt != null && Math.abs(b.rodapeAlt - c.rodapeAlt) <= TOL,
    `3D=${b.rodapeAlt}px 2D=${c.rodapeAlt}px (tol ${TOL})`);
  eh('6.3 o rodape pousa na MESMA linha do pe da tela nos dois modos',
    b.rodapePe != null && c.rodapePe != null && Math.abs(b.rodapePe - c.rodapePe) <= TOL,
    `3D=${b.rodapePe}px 2D=${c.rodapePe}px (tol ${TOL})`);

  // ======================================================================
  // CENA 4 — O POP-UP DO CHAT (item 9), no 2D e no 3D
  // ======================================================================
  const casoPopUp = async (modo, esperada) => {
    const antes = await p.evaluate(ESPIAR);
    const achou = await tocarChat();
    await p.waitForTimeout(900);
    const dur = await p.evaluate(ESPIAR);
    const fech = await fecharPop();
    await p.waitForTimeout(700);
    const depois = await p.evaluate(ESPIAR);
    nota(`[chat ${modo}] atalho=${achou ? 'tocado' : 'NAO EXISTE'} · tela ${antes.tela}->${dur.tela}->${depois.tela} · pop=${dur.pop}(cobre=${dur.popCobre}) · fechar=${fech}`);
    nota(`[chat ${modo}] marcas antes=${JSON.stringify(antes.marca)} durante=${JSON.stringify(dur.marca)} depois=${JSON.stringify(depois.marca)}`);
    return { antes, dur, depois, achou, fech, esperada };
  };

  const pop2d = await casoPopUp('2D', 'rota');
  // volta pra tela do modo se o toque tirou dela (hoje ele tira: é `ir:chat`)
  if (pop2d.depois.tela !== 'rota') await irPara('rota');

  /* 🔴 AS QUATRO LINHAS DESTE BLOCO EXIGEM QUE O POP-UP TENHA NASCIDO — e isto é
     conserto de um verde de mentira que a 1ª corrida me devolveu. "Tocar não
     troca de tela" e "o mapa continua o mesmo" saíam VERDES com o botão MORTO:
     `abrir-chat` está na coluna e ninguém o atende, então o toque não faz nada —
     e "não fez nada" passa em toda pergunta escrita pelo negativo. A pergunta
     honesta é o par: ABRIU o chat E ficou na tela cheia. */
  eh('7.1 2D: o toque ABRE o chat sem sair da tela cheia',
    pop2d.achou && pop2d.dur.pop === 1 && pop2d.dur.tela === 'rota',
    pop2d.achou ? `pop=${pop2d.dur.pop} tela="${pop2d.dur.tela}"` : 'nao existe atalho na coluna');
  eh('7.2 2D: o pop-up nasce POR CIMA do mapa',
    pop2d.dur.pop === 1 && pop2d.dur.popCobre, `pop=${pop2d.dur.pop} cobre=${pop2d.dur.popCobre}`);
  eh('7.3 2D: abrir o pop-up NAO mexe no mapa (palco, no vivo e objeto)',
    pop2d.dur.pop === 1 && !!pop2d.antes.marca.palco && igual(pop2d.antes.marca, pop2d.dur.marca),
    `pop=${pop2d.dur.pop} · ${JSON.stringify(pop2d.antes.marca)} -> ${JSON.stringify(pop2d.dur.marca)}`);
  eh('7.4 2D: fechar o pop-up o tira da tela e NAO repinta o mapa',
    pop2d.dur.pop === 1 && pop2d.depois.pop === 0 && pop2d.depois.tela === 'rota'
      && igual(pop2d.antes.marca, pop2d.depois.marca),
    `fechar=${pop2d.fech} pop=${pop2d.depois.pop} marca=${JSON.stringify(pop2d.depois.marca)}`);

  await irPara('mapa');
  const pop3d = await casoPopUp('3D', 'mapa');
  if (pop3d.depois.tela !== 'mapa') await irPara('mapa');

  eh('7.5 3D: o toque ABRE o chat sem sair da tela cheia',
    pop3d.achou && pop3d.dur.pop === 1 && pop3d.dur.tela === 'mapa',
    pop3d.achou ? `pop=${pop3d.dur.pop} tela="${pop3d.dur.tela}"` : 'nao existe atalho na coluna');
  eh('7.6 3D: o pop-up nasce POR CIMA do mapa',
    pop3d.dur.pop === 1 && pop3d.dur.popCobre, `pop=${pop3d.dur.pop} cobre=${pop3d.dur.popCobre}`);
  eh('7.7 3D: abrir o pop-up NAO mexe no mapa (palco, no vivo e objeto)',
    pop3d.dur.pop === 1 && !!pop3d.antes.marca.palco && igual(pop3d.antes.marca, pop3d.dur.marca),
    `pop=${pop3d.dur.pop} · ${JSON.stringify(pop3d.antes.marca)} -> ${JSON.stringify(pop3d.dur.marca)}`);
  eh('7.8 3D: fechar o pop-up o tira da tela e NAO repinta o mapa',
    pop3d.dur.pop === 1 && pop3d.depois.pop === 0 && pop3d.depois.tela === 'mapa'
      && igual(pop3d.antes.marca, pop3d.depois.marca),
    `fechar=${pop3d.fech} pop=${pop3d.depois.pop} marca=${JSON.stringify(pop3d.depois.marca)}`);

  // ======================================================================
  // CENA 5 — A TELA CHEIA DESLIGADA (item 1/2): o 2D volta a ser tela de app
  // ======================================================================
  await irPara('rota');
  /* 🔴 PELO SEAM, NUNCA PELO ARQUIVO. A preferência mora no aparelho e chega na
     casca por `DADOS.rota.telaCheia` (contrato D7: o mock nunca lê localStorage).
     `false` explícito porque a régua do contrato é `!== false` — quem nunca
     escolheu abre em tela cheia. */
  await seam('rota', { telaCheia: false });
  const d = await p.evaluate(ESPIAR);
  nota(`[2D sem cheio] hdr=${d.hdr ? (d.hdrEmpurra ? 'empurra (tela de app)' : 'flutua') : 'nao'} · corpo topo=${d.corpoTopo}px · nav=${d.nav ? 'sim' : 'nao'} · palco pe=${d.palcoPe}px · coluna=[${d.coluna.join(' > ')}] · hdrChat=${d.hdrChat}`);

  eh('2.3 tela cheia DESLIGADA: o 2D volta a ser tela de app (as abas voltam)',
    d.nav, d.nav ? '.nav de volta' : 'a tela continua cheia');
  /* 🔴 O PAR, E ELE É UM SÓ DE PROPÓSITO: "o atalho some" medido sozinho ficaria
     VERDE hoje só porque o atalho nunca existiu no 2D. A pergunta honesta é o
     DELTA — existe com tela cheia, some sem ela. */
  eh('2.4 tela cheia DESLIGADA: o atalho do chat SAI da coluna (e existia com ela)',
    a.chatNaColuna && !d.chatNaColuna,
    `com cheio=${a.chatNaColuna ? 'sim' : 'nao'} sem cheio=${d.chatNaColuna ? 'sim' : 'nao'}`);
  eh('2.5 tela cheia DESLIGADA: o balao do chat volta ao cabecalho',
    d.hdrChat, d.hdr ? 'cabecalho sem balao' : 'sem cabecalho nenhum');
  eh('2.6 tela cheia DESLIGADA: o interruptor continua na coluna (nao ha beco)',
    d.telaCheiaBotoes === 1, `[data-acao="tela-cheia"]=${d.telaCheiaBotoes}`);

  eh('8.1 nenhum erro de pagina na passada inteira', erros.length === 0, erros[0] || 'limpo');

  await ctx.close();
  await navegador.close();
  srv.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n== PROVA DO MAPA EM UMA TELA SO ==\n');
  ok.forEach((n) => console.log('  ok   ' + n));
  falhou.forEach((n) => console.log('  XX   ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}\n`);
  process.exit(falhou.length ? 1 : 0);
})();
