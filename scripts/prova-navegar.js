#!/usr/bin/env node
/**
 * PROVA DO "NAVEGAR" — a entrada da tela de dirigir, medida na fita.
 *
 *     node scripts/prova-navegar.js
 *
 * 🔴 POR QUE ELA EXISTE (dono, 09/08: *"ao clicar no navegar está bagunçado, 2
 * efeitos se cruzando, pisca, trava — e já carrega um monte de empresa ao redor
 * enquanto está saindo do 2d para o 3d, não é assim"*).
 *
 * Print nenhum pega o que estava errado aqui, porque tudo acontecia DENTRO de
 * 6,8 s de coreografia. O que a medição pegou, e que esta prova agora vigia:
 *
 *   A) O PROSPECTOR É PEÇA DO 3D. Com a câmera em pé ou descendo, NENHUM prédio
 *      pode estar no ar. (Antes: 12 na tela aos 233 ms, em cima da maquete da
 *      cena, com o mapa de verdade ainda invisível.) Depois do 3D, ele nasce
 *      pela régua de tempo de viagem da V4 — nasce longe, acende perto.
 *   B) UMA CIDADE SÓ. A cena de entrar na rota desenha as ruas DE VERDADE
 *      dentro do mapa (`hbx-cena-ruas-*`), e o mapa vivo está visível desde o
 *      primeiro quadro. (Antes: uma rota de mentira em SVG por cima do mapa
 *      real escondido, e um fundido trocando os dois aos 2,31 s.)
 *   C) UMA BOCA SÓ NA CÂMERA. Nunca duas ordens de câmera no mesmo tique.
 *      (Antes: `jumpTo` em t=31 ms e outro em t=37 ms; e dois `easeTo` no mesmo
 *      milissegundo, uma vez por segundo, o segundo reiniciando o primeiro.)
 *   D) A ENTRADA CABE NO ORÇAMENTO. Do toque ao 3D, o teto é `TETO_ENTRADA`.
 *   E) VOLTAR DO "VOCÊ CHEGOU" NÃO REPETE O SHOW. Ele já está dirigindo.
 *
 * 🔴 A RÉGUA É A FITA, NÃO O ESTADO FINAL. Toda pergunta daqui é "o que a tela
 * mostrou ENQUANTO", e por isso a prova amostra a cada 100 ms e julga a fita
 * inteira. Medir só o depois deixaria passar exatamente o que o dono viu.
 *
 * (bancada igual à do `prova-mapa-2d`: servidor estático, pele do mock-fonte,
 *  dublê do `window.HBX` DEPOIS do boot — o `native.js` engoliria addInitScript.)
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* Do toque no Navegar até a câmera assentar em 3D.
   🔴 4200 → 4600 (10/08), e NÃO é para fazer passar: este número é de BANCADA
   (swiftshader, mapa do gps nascendo na hora, tiles dublados) e ele oscila
   ±300 ms entre voltas — medi 4011, 4103, 4204, 4209 e 4301 na mesma versão.
   Teto colado na média reprova por ruído, e prova que reprova sozinha é prova
   que se aprende a ignorar. A régua do PRODUTO é outra e está no comentário do
   `DESCIDA_MS`: a coreografia projetada fecha em ~3,4 s, contra os 6,86 s
   medidos no defeito. O que este teto guarda é a REGRESSÃO GROSSA — alguém
   devolver a tela parada de 2 s, ou a cena esperando um relógio a mais. */
const TETO_ENTRADA = 4600;
/** quantas animações a camada pode ter rodando no pico da entrada */
const TETO_ANIMS = 45;

function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  const i = txt.indexOf('<style>'); const f = txt.indexOf('</style>');
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

/* ---- O DIA DUBLADO --------------------------------------------------------
   🔴 A ROTA VAI PRO NORTE, e isso é da medição: sem `speed`/`heading` no fix
   sintético (o Playwright não os manda), `rumoDaTela` cai no rumo DA ROTA — que
   é o degrau certo pra um carro parado. Rota ao norte + empresa ao norte = a
   empresa está À FRENTE, que é a única coisa que a régua pergunta. */
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

/* DUAS empresas, e cada uma prova uma metade da régua:
   · a da FRENTE a 380 m — fora do "nasce" (que trava em 272 m com o piso de
     8 m/s) no instante do toque, e dentro dele depois de o carro andar. É o
     "chega perto da empresa" do dono, medido;
   · a de TRÁS a 400 m — já passou antes de a rota começar, e não pode aparecer
     em quadro nenhum do dia. */
/* 🔴 `escolhida: true` — DUBLÊ FIEL AO SERVIDOR (12/08). As duas cores entraram
   no payload real (`logistica-rota-prospector.test.ts` cobra o campo empresa por
   empresa) e o app passou a exigir `alvo.escolhida` pra acender: azul é ambiente,
   e ambiente não acende no dedo. O dublê ficou mandando empresa SEM o campo, e a
   cena 1.4 ficou vermelha contra código CERTO — dublê desatualizado reprova o
   app e ensina todo mundo a ignorar o portão. Quem prova acender manda empresa
   ESCOLHIDA, que é o que o servidor manda pra quem escolheu o tipo da semana. */
const EMPRESAS = [
  { id: '11111111111111', nome: 'EMPRESA DA FRENTE LTDA', lat: aoNorte(380), lng: BASE.lng + 0.0002, distM: 60, aceso: true, escolhida: true },
  { id: '22222222222222', nome: 'EMPRESA DE TRAS LTDA', lat: aoNorte(-400), lng: BASE.lng - 0.0002, distM: 90, aceso: true, escolhida: true },
];

/* ---- o dublê do basemap (mesma armadilha do `prova-cena-ruas`) -------------
   🔴 A BANCADA NÃO TEM TILE. Sem o pacote do protomaps no disco,
   `querySourceFeatures` devolve vazio e a cena das ruas encerra em `sem-rua` —
   o desfecho HONESTO do app, mas que mediria a prova contra o nada. A armadilha
   entra no `window.maplibregl` por setter porque o vendor é carregado tarde
   demais pra um `addInitScript` comum remendar o protótipo. */
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
  for (let i = 0; i < N; i += 1) {
    const lng = eu.lng - meio + (i * passo);
    const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([lng, eu.lat - meio + ((k * (N - 1) * passo) / 4)]);
    f.push({ type: 'Feature', properties: { name: `Avenida ${i}`, kind: i === 4 ? 'highway' : 'minor_road' }, geometry: { type: 'LineString', coordinates: c } });
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

const PONTE = ({ itens, empresas, geo }) => {
  window.HBX = {
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1',
          moduloFinanceiroAtivo: false, prospector: { empresas },
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        return new Promise((ok) => setTimeout(() => ok({
          code: 'Ok',
          routes: [{
            distance: 4200, duration: 640,
            geometry: { type: 'LineString', coordinates: geo },
            legs: [{ steps: [{ maneuver: { type: 'turn', modifier: 'right', location: geo[3] }, name: 'Rua Sete' }] }],
          }],
        }), 320));
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/config') === 0) {
        return Promise.resolve({ prospectorAtivo: true, prospectorDisponivel: true, prospectorEquipe: true });
      }
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

/** os espiões: a fita, as ordens de câmera e as tarefas que comem o quadro */
const ESPIAR = () => {
  window.__fita = [];
  window.__cam = [];
  window.__longas = [];
  window.__t0 = 0;
  const M = window.maplibregl && window.maplibregl.Map;
  if (M) {
    ['jumpTo', 'easeTo', 'flyTo'].forEach((m) => {
      const o = M.prototype[m];
      M.prototype[m] = function (arg, ...r) {
        if (window.__t0) window.__cam.push(Math.round(performance.now() - window.__t0));
        return o.call(this, arg, ...r);
      };
    });
  }
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      if (window.__t0) window.__longas.push(Math.round(e.duration));
    })).observe({ entryTypes: ['longtask'] });
  } catch (_) { /* navegador sem longtask: perde o refino, nunca a prova */ }
};

const AMOSTRAR = () => {
  window.__t0 = performance.now();
  const tira = () => {
    const t = Math.round(performance.now() - window.__t0);
    const palco = document.querySelector('#app .tela:last-of-type [data-mapa="gps"]');
    const mapa = palco && palco.__hbxMapaObj;
    const emps = [...document.querySelectorAll('#app .tela:last-of-type .emp[data-lat]')];
    const vw = window.innerWidth; const vh = window.innerHeight;
    let naTela = 0; let acesas = 0; const ids = [];
    emps.forEach((el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.02) return;
      const o = el.querySelector('.emp-obj');
      const r = (o || el).getBoundingClientRect();
      if (r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh) {
        naTela += 1;
        ids.push(String(el.dataset.empresa || '').slice(0, 2));
        if (el.classList.contains('on')) acesas += 1;
      }
    });
    const vivo = palco && palco.querySelector(':scope > .mapa-vivo');
    const camada = document.querySelector('#app .tela:last-of-type');
    let anims = 0;
    try { anims = camada ? camada.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length : 0; } catch (_) { anims = 0; }
    let ruas = 0;
    try {
      if (mapa && mapa.getStyle) ruas = (mapa.getStyle().layers || []).filter((l) => /^hbx-cena-ruas-/.test(l.id)).length;
    } catch (_) { ruas = 0; }
    window.__fita.push({
      t,
      pitch: mapa ? Math.round(mapa.getPitch()) : null,
      zoom: mapa ? Number(mapa.getZoom().toFixed(2)) : null,
      naTela,
      acesas,
      ids,
      vivo: vivo ? Number(getComputedStyle(vivo).opacity) : null,
      anims,
      ruas,
    });
  };
  window.__amostra = setInterval(tira, 100);
  tira();
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};

async function abrir(navegador, pele, porta) {
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
  await p.waitForTimeout(600);
  await p.addStyleTag({ content: pele });
  const itens = [0, 1, 2, 3, 4].map(paradaFalsa);
  const geo = Array.from({ length: 14 }, (_, i) => [BASE.lng, aoNorte(i * 260)]);
  await p.evaluate(PONTE, { itens, empresas: EMPRESAS, geo });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('rota'));
  // 🔴 a cena de ENTRADA (palco da Rota) tem que ter acabado antes: é UMA cena
  // por vez, e a do Navegar seria recusada se a primeira ainda estivesse no ar.
  await p.waitForTimeout(5600);
  return { ctx, p, erros };
}

(async () => {
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /* ======================================================================
     CASO 1 — O TOQUE NO "NAVEGAR": a entrada inteira, quadro a quadro.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta);
    await p.evaluate(ESPIAR);
    await p.evaluate(AMOSTRAR);
    await p.evaluate(() => window.ir('mapa'));
    // o carro anda pro norte, 20 m por segundo (72 km/h): a empresa da frente
    // entra no "nasce" por volta dos 110 m e no "acende" por volta dos 210 m.
    for (let i = 1; i <= 13; i += 1) {
      await p.waitForTimeout(1000);
      await ctx.setGeolocation({ latitude: aoNorte(i * 20), longitude: BASE.lng, accuracy: 18 });
    }
    const r = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return { fita: window.__fita, cam: window.__cam, longas: window.__longas };
    });
    const fita = r.fita;
    const entrando = fita.filter((f) => f.pitch != null && f.pitch < 45);
    const em3d = fita.filter((f) => f.pitch != null && f.pitch >= 50);

    // A) o prospector é peça do 3D
    const vazouNaEntrada = entrando.filter((f) => f.naTela > 0);
    eh('1.1 NENHUM predio no ar enquanto a camera entra (2D + descida)',
      vazouNaEntrada.length === 0,
      vazouNaEntrada.length ? `${vazouNaEntrada.length} amostras, pico ${Math.max(...vazouNaEntrada.map((f) => f.naTela))} predios (t=${vazouNaEntrada[0].t}ms)` : `${entrando.length} amostras limpas`);
    eh('1.2 e NENHUM aceso antes do 3D',
      entrando.every((f) => f.acesas === 0),
      `pico=${Math.max(0, ...entrando.map((f) => f.acesas))}`);

    // A-bis) mas no 3D ele aparece quando chega perto
    const apareceu = em3d.find((f) => f.naTela > 0);
    eh('1.3 no 3D o predio da frente NASCE quando entra na regua',
      !!apareceu, apareceu ? `t=${apareceu.t}ms com ${apareceu.naTela}` : 'nenhum nasceu em 9 s');
    const acendeu = em3d.find((f) => f.acesas > 0);
    eh('1.4 e ACENDE quando chega perto (regua da V4)',
      !!acendeu, acendeu ? `t=${acendeu.t}ms` : 'nenhum acendeu');
    // "depois que passou já era": a de trás não existe em quadro nenhum do dia
    const deTras = fita.filter((f) => f.ids.indexOf('22') !== -1);
    eh('1.4b a empresa que ficou PRA TRAS nao aparece em quadro nenhum',
      deTras.length === 0, deTras.length ? `apareceu em t=${deTras[0].t}ms` : 'nunca');

    // B) uma cidade só
    const cenaRuas = fita.filter((f) => f.ruas > 0);
    eh('1.5 a cena das ruas roda DENTRO do mapa de dirigir',
      cenaRuas.length > 0, cenaRuas.length ? `${cenaRuas.length} amostras com camada, t=${cenaRuas[0].t}..${cenaRuas[cenaRuas.length - 1].t}ms` : 'nenhuma camada hbx-cena-ruas');
    /* 🔴 A COBRA MORREU = O MAPA REAL NÃO ESPERA RELÓGIO NENHUM. Antes ele
       ficava em opacidade ZERO até 2,31 s (segurado pela folha enquanto a marca
       `cena` estivesse na camada) e só então cruzava com o desenho. Agora ele
       aparece assim que o maplibre fica pronto — e nada o segura depois disso. */
    const vivoAceso = fita.find((f) => f.vivo != null && f.vivo > 0.9);
    eh('1.6 o mapa de VERDADE aparece cedo, sem esperar cena (a cobra morreu)',
      !!vivoAceso && vivoAceso.t < 1500,
      vivoAceso ? `visivel em t=${vivoAceso.t}ms` : 'nunca ficou visivel');
    const apagouDepois = fita.some((f) => f.t > 1500 && f.t < 3200 && f.vivo != null && f.vivo < 0.9);
    eh('1.7 e ele NAO some no meio da entrada (o fundido de troca morreu)',
      !apagouDepois, apagouDepois ? 'mapa vivo apagou depois de aparecer' : 'ficou');

    // C) uma boca só na câmera
    let juntas = 0;
    for (let i = 1; i < r.cam.length; i += 1) if (r.cam[i] - r.cam[i - 1] <= 8) juntas += 1;
    eh('1.8 NUNCA duas ordens de camera no mesmo tique', juntas === 0,
      `${juntas} pares colados em ${r.cam.length} ordens`);

    // D) o orçamento
    const chegou = fita.find((f) => f.pitch != null && f.pitch >= 50);
    eh('1.9 do toque ao 3D dentro do teto', !!chegou && chegou.t <= TETO_ENTRADA,
      chegou ? `${chegou.t}ms (teto ${TETO_ENTRADA})` : 'nunca chegou no 3D');
    const pico = Math.max(0, ...fita.filter((f) => f.t < 1500).map((f) => f.anims));
    eh('1.10 animacoes no pico da entrada abaixo do teto', pico <= TETO_ANIMS,
      `${pico} (teto ${TETO_ANIMS})`);
    const maior = Math.max(0, ...r.longas);
    eh('1.11 nenhuma tarefa longa acima de 400 ms', maior <= 400, `maior=${maior}ms`);
    eh('1.12 sem erro de pagina', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  /* ======================================================================
     CASO 2 — VOLTAR DO "VOCÊ CHEGOU" NÃO REENCENA A ENTRADA.
     O motorista entregou, confirmou e voltou pro mapa: ele já está dirigindo.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta);
    await p.evaluate(() => window.ir('mapa'));
    await p.waitForTimeout(4600);           // a entrada inteira acontece
    const antes = await p.evaluate(() => {
      const palco = document.querySelector('#app .tela:last-of-type [data-mapa="gps"]');
      const m = palco && palco.__hbxMapaObj;
      return m ? Math.round(m.getPitch()) : null;
    });
    await p.evaluate(() => window.ir('mapachegou'));
    await p.waitForTimeout(700);
    await p.evaluate(ESPIAR);
    await p.evaluate(AMOSTRAR);
    await p.evaluate(() => window.ir('mapa'));
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return { fita: window.__fita, cam: window.__cam };
    });
    const deitou = r.fita.filter((f) => f.pitch != null && f.pitch < 45);
    eh('2.1 a entrada tinha chegado no 3D', antes != null && antes >= 50, `pitch=${antes}`);
    eh('2.2 voltar do "Voce chegou" NAO endireita a camera de novo',
      deitou.length === 0,
      deitou.length ? `${deitou.length} amostras em 2D (menor pitch ${Math.min(...deitou.map((f) => f.pitch))})` : 'seguiu em 3D');
    eh('2.3 e NAO repete a cena das ruas', r.fita.every((f) => f.ruas === 0),
      `amostras com camada=${r.fita.filter((f) => f.ruas > 0).length}`);
    eh('2.4 sem erro de pagina', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  await navegador.close(); srv.close();

  console.log('\n=== PROVA DO NAVEGAR ===');
  ok.forEach((l) => console.log('  ✓ ' + l));
  falhou.forEach((l) => console.log('  ✗ ' + l));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  process.exit(falhou.length ? 1 : 0);
})();
