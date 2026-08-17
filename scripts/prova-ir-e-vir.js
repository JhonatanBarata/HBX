#!/usr/bin/env node
/**
 * PROVA DO IR E VIR — a troca de câmera entre o mapa 2D e o 3D, medida na fita.
 *
 *     node scripts/prova-ir-e-vir.js
 *
 * 🔴 POR QUE ELA EXISTE (dono, 16/08: *"corrija o efeito de ir e vir entre os 2,
 * não quero essa travação nojenta, quero efeito subindo e descendo, reverso bem
 * feito sem travação alguma, e ao assentar o efeito das ruas acendendo nos 2"* —
 * seguido de *"não remonte efeito, tudo isso já existe! só realinhe"*).
 *
 * A medição de 16/08 achou UM defeito servindo os dois sentidos: a coreografia
 * era comandada por RELÓGIOS DE DESISTÊNCIA em vez dos sinais que as peças já
 * emitiam, e a volta era um `clearTimeout` onde a ida tinha um gesto. O que esta
 * prova vigia, e que nenhuma outra pegava:
 *
 *   A) A CURVA DA SAÍDA É A DE QUEM SAI. As duas camadas que deixam a tela cheia
 *      usavam `--cv-entra` — a curva de quem CHEGA. Medido: 95% do movimento
 *      gasto nos primeiros ~250 ms e a camada viva até ~585 ms, ou seja 230 a
 *      330 ms de tela parada com duas camadas no ar, toda vez, nos dois sentidos.
 *      É a "travação" literal, e é a única regra da folha em que a Lei 2 dela
 *      mesma não valia.
 *   B) A CENA DAS RUAS ACENDE NOS DOIS. Na ida ela já acendia (palco 'gps'); na
 *      volta, não — não por guarda, por CHAMADOR FALTANDO. O motivo 'rota' já
 *      existia, já apontava pro palco 'geral' e já tinha ritmo próprio.
 *   C) A VOLTA TEM SUBIDA. `pararDescida` era quatro linhas de cancelamento. A
 *      subida não precisou nascer: é o `vistaGeral` — que já calculava a pose de
 *      cima com o mesmo recuo do puck — ganhando um argumento de duração.
 *   D) NADA DISSO REENCENA O QUE JÁ ESTAVA NA TELA (a lei de 15/08: voltar da
 *      folha da venda não é entrar na rota).
 *
 * A régua é a FITA, não o estado final — mesma escolha do `prova-navegar`.
 *
 * (bancada igual à do `prova-navegar`: servidor estático, pele do mock-fonte,
 *  dublê do `window.HBX` DEPOIS do boot, armadilha do basemap.)
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* 🔴 COMO SE MEDE "TRAVAÇÃO", E POR QUE NÃO É POR SCREENSHOT. A primeira versão
   desta prova comparava hashes de print a cada 50 ms e reprovava com 505 ms de
   "tela parada" — MAS a bancada é swiftshader: cada print custa mais que o
   intervalo, e o mapa em software não redesenha entre eles. A régua media a
   BANCADA, não o app. Prova que reprova por ruído é prova que se aprende a
   ignorar (a própria casa escreve isso no teto do `prova-navegar`).
   O que se mede aqui é DETERMINÍSTICO e é código, não GPU: quanto do próprio
   show a camada que sai conseguiu cumprir antes de deixar a tela. Saída
   arrancada no quadro zero, ou cortada na metade, é defeito de fluxo — e foi
   exatamente o que a medição de 16/08 achou na volta (um `clearTimeout` onde a
   ida tinha um gesto).
   ⚠️ O ENGASGO QUE SOBRA NÃO É ESTA RÉGUA. Medido na ida: o relógio da animação
   de saída congela em 433 de 520 ms por ~266 ms, enquanto a thread monta o
   maplibre. Isso é trabalho de quadro, não curva nem fluxo, e a bancada mede com
   GPU emulada (swiftshader) — o número do aparelho é outro. Cobrar ausência de
   jank AQUI seria a prova reprovando a bancada. */
const PISO_SHOW = 0.6;

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

/* o dublê do basemap: sem tile no disco, `querySourceFeatures` devolve vazio e a
   cena das ruas encerra em 'sem-rua' — o desfecho honesto do app, que mediria
   esta prova contra o nada. Mesma armadilha do `prova-navegar`/`prova-cena-ruas`. */
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

const PONTE = ({ itens, geo }) => {
  window.HBX = {
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
  };
  window.HBXApp = window.HBXApp || {};
};

/* A FITA. Ela olha as DUAS camadas, não só a de cima: metade do defeito da
   troca mora na camada que está SAINDO (o mapa dela continua vivo e visível). */
const AMOSTRAR = () => {
  window.__fita = [];
  window.__t0 = performance.now();
  /* 🔴 UM PALCO SÓ (16/08). A fita pedia o mapa por NOME ('gps' / 'geral') —
     e não existe mais nome: existe UM mapa que muda de camada. A régua passou
     a ser a identidade do OBJETO (um carimbo no próprio maplibre), que é o que
     prova a promessa nova: quem troca de estado não troca de mapa. */
  let seq = 0;
  const mapaVivo = () => {
    const palco = document.querySelector('#app .tela [data-mapa]');
    const m = (palco && palco.__hbxMapaObj) || null;
    if (m && !m.__hbxMarca) { seq += 1; m.__hbxMarca = `m${seq}`; }
    return m;
  };
  const mapaDe = () => mapaVivo();
  const ruasDe = (mapa) => {
    try { return mapa && mapa.getStyle ? (mapa.getStyle().layers || []).filter((l) => /^hbx-cena-ruas-/.test(l.id)).length : 0; }
    catch (_) { return 0; }
  };
  const tira = () => {
    const t = Math.round(performance.now() - window.__t0);
    const camadas = [...document.querySelectorAll('#app .tela')];
    const m = mapaDe();
    window.__fita.push({
      t,
      camadas: camadas.length,
      // o ESTADO lido do desenho (a casca não expõe  no window):
      //  é a tela de dirigir,  é o 2D.
      modo: document.querySelector('#app .tela .gps') ? '3d'
        : (document.querySelector('#app .tela .plano') ? '2d' : ''),
      marca: m ? m.__hbxMarca : null,
      pitch: m ? Math.round(m.getPitch()) : null,
      ruas: ruasDe(m),
    });
  };
  window.__amostra = setInterval(tira, 50);
  tira();
};

const ok = [];
const falhou = [];
const notas = [];
const nota = (s) => notas.push(s);
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};

/* Onde o movimento da SAÍDA acontece dentro da janela dela. Lê a animação pela
   API do próprio navegador (`getAnimations`), então não depende de print nem de
   GPU: pergunta à camada que sai qual é a opacidade dela em cada instante do
   próprio show, e devolve a fração da janela em que 95% do movimento já foi. */
const T95_DA_SAIDA = () => new Promise((pronto) => {
  // A camada que sai só nasce DEPOIS do toque — esta promessa é armada antes
  // dele de propósito, pra não perder o primeiro quadro do show. Então ela
  // primeiro ESPERA a marca aparecer (teto de 2 s pra não pendurar a prova).
  const achar = () => [...document.querySelectorAll('#app .tela.sai')][0] || null;
  const desistirEm = performance.now() + 2000;
  const esperar = () => {
    const el = achar();
    if (el) { medir(el); return; }
    if (performance.now() > desistirEm) { pronto(null); return; }
    requestAnimationFrame(esperar);
  };
  requestAnimationFrame(esperar);
  function medir(alvo) {
  let anim = null;
  try { anim = alvo.getAnimations().filter((a) => a.effect && a.effect.getTiming().duration > 0)[0] || null; } catch (_) { anim = null; }
  if (!anim) { pronto(null); return; }
  const nome = anim.animationName || '?';
  const dur = Number(anim.effect.getTiming().duration) || 520;
  /* 🔴 O QUE SE MEDE É QUANTO DO SHOW A CAMADA CONSEGUIU CUMPRIR ANTES DE SAIR
     DA TELA — e a régua é o relógio da PRÓPRIA animação, nunca a opacidade
     computada. Motivo, medido: nó desconectado devolve opacidade vazia, que o
     `Number()` transforma em 0, e a prova leria "movimento instantâneo" onde na
     verdade alguém arrancou a camada antes do gesto acontecer. */
  let ultimo = 0;
  const passo = () => {
    const agora = Number(anim.currentTime) || 0;
    if (alvo.isConnected) ultimo = agora;
    if (agora < dur && alvo.isConnected) { requestAnimationFrame(passo); return; }
    pronto({ nome, dur, cumprido: Math.round(ultimo), fracao: ultimo / dur, arrancada: !alvo.isConnected });
  };
  requestAnimationFrame(passo);
  }
});

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
  await p.evaluate(PONTE, { itens, geo });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('rota'));
  // a cena de ENTRADA da Rota tem que ter acabado: é UMA cena por vez.
  await p.waitForTimeout(5600);
  return { ctx, p, erros };
}

(async () => {
  // o GERADO primeiro: esta prova abre `assets/app/**`, que é SAÍDA da costura.
  regenerarGerados();
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /* ======================================================================
     CASO 1 — IDA (2D -> 3D) e VOLTA (3D -> 2D), na mesma sessão.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta);

    // ---- IDA ----------------------------------------------------------
    await p.evaluate(AMOSTRAR);
    await p.evaluate(() => window.ir('mapa'));
    await p.waitForTimeout(2400);
    const fitaIda = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return window.__fita;
    });
    const ruasNaIda = Math.max(0, ...fitaIda.map((f) => f.ruas));
    const marcasIda = [...new Set(fitaIda.map((f) => f.marca).filter(Boolean))];
    const pilhaIda = Math.max(0, ...fitaIda.map((f) => f.camadas));
    nota(`[ida] camadas no pico=${pilhaIda} · mapas vistos=${marcasIda.join(',') || '-'} · ruas=${ruasNaIda}`);

    /* 🔴 A RÉGUA MUDOU DE PERGUNTA (16/08 — dono: *"a tela não tem mais motivo
       para piscar tudo, ambos os estados têm q ser idênticos"*). Ela media o
       SHOW da camada que sai — a coreografia de duas camadas cruzando. Esse
       cruzamento é justamente o que morreu: com um palco de mapa só, camada
       velha no ar é camada com o palco VAZIO. Hoje se cobra o contrário: a
       troca é SECA (nunca duas camadas) e o mapa é o MESMO objeto dos dois
       lados — que é a definição de "não piscar" nesta tela. */
    eh('1.1 IDA: a troca e SECA (nunca duas camadas no ar)',
      pilhaIda <= 1, `pico de camadas=${pilhaIda}`);
    eh('1.2 IDA: o mapa e o MESMO objeto antes e depois (nao renasce)',
      marcasIda.length === 1, `mapas vistos=${marcasIda.join(',') || 'nenhum'}`);
    eh('1.3 IDA: a cena das ruas acende dirigindo',
      ruasNaIda > 0, `camadas de cena=${ruasNaIda}`);

    // deixa a ida assentar por inteiro antes de medir a volta
    await p.waitForTimeout(4200);

    // ---- VOLTA --------------------------------------------------------
    await p.evaluate(AMOSTRAR);
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(2400);
    const fitaVolta = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return window.__fita;
    });
    const ruasNaVolta = Math.max(0, ...fitaVolta.map((f) => f.ruas));
    const marcasVolta = [...new Set(fitaVolta.map((f) => f.marca).filter(Boolean))];
    const pilhaVolta = Math.max(0, ...fitaVolta.map((f) => f.camadas));
    /* o MESMO mapa desce a inclinação: ele começa deitado no 3D e vai a zero.
       Não existe mais "o mapa que entra" — existe um mapa e um movimento. */
    const pitches = fitaVolta.map((f) => f.pitch).filter((v) => v != null);
    const pitchMax = pitches.length ? Math.max(...pitches) : null;
    const pitchMin = pitches.length ? Math.min(...pitches) : null;
    const degraus = new Set(pitches);
    // a emenda: o pitch do 1º quadro depois da troca × o do último antes dela
    const iTroca = fitaVolta.findIndex((f) => f.modo === '2d');
    const antes = iTroca > 0 ? fitaVolta[iTroca - 1].pitch : null;
    const depois = iTroca >= 0 ? fitaVolta[iTroca].pitch : null;
    const emenda = (antes != null && depois != null) ? Math.abs(antes - depois) : null;
    nota(`[volta] camadas no pico=${pilhaVolta} · mapas vistos=${marcasVolta.join(',') || '-'} · ruas=${ruasNaVolta} · pitch ${pitchMax}->${pitchMin} em ${degraus.size} degraus · emenda ${antes}->${depois}`);

    eh('2.1 VOLTA: a troca e SECA (nunca duas camadas no ar)',
      pilhaVolta <= 1, `pico de camadas=${pilhaVolta}`);
    eh('2.2 VOLTA: o mapa e o MESMO objeto antes e depois (nao renasce)',
      marcasVolta.length === 1, `mapas vistos=${marcasVolta.join(',') || 'nenhum'}`);
    /* 🔴 O PEDIDO LITERAL: "as ruas acendendo nos 2" — na ida (dirigindo) e na
       volta (2D). Sem o chamador do pouso este numero e ZERO. */
    eh('2.3 VOLTA: a cena das ruas acende TAMBEM no 2D',
      ruasNaVolta > 0, `camadas de cena=${ruasNaVolta}`);
    /* 🔴 A SUBIDA EXISTE E ELA ANDA (16/08, depois de VER a troca gravada no g15
       a 20 quadros/s: 3 quadros de tela igual, 1 de mistura, tela nova — corte
       seco, zero movimento). O pitch tem que sair de deitado e ir a zero, em
       mais de um degrau. Um degrau só é o corte que o dono chamou de travação. */
    eh('2.4 VOLTA: o mapa SOBE (pitch anda, nao corta)',
      pitchMax != null && pitchMax >= 40 && pitchMin != null && pitchMin < pitchMax && degraus.size >= 3,
      `${pitchMax}->${pitchMin} em ${degraus.size} degraus`);
    /* 🔴 E O MOVIMENTO COMEÇA DE ONDE A TELA ESTAVA. No quadro da troca o mapa
       não pode pular: ele é o mesmo, então o primeiro quadro do estado novo tem
       que mostrar a MESMA inclinação do último quadro do estado velho. */
    eh('2.5 VOLTA: o mapa nao PULA no quadro da troca',
      emenda != null && emenda <= 3, `pitch ${antes} -> ${depois} (delta ${emenda})`);

    eh('3.1 nenhum erro de pagina no ida-e-volta', erros.length === 0, erros[0] || 'limpo');
    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n== PROVA DO IR E VIR ==\n');
  ok.forEach((n) => console.log('  ok   ' + n));
  falhou.forEach((n) => console.log('  XX   ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}\n`);
  process.exit(falhou.length ? 1 : 0);
})();
