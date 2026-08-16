#!/usr/bin/env node
/**
 * PROVA DO RADAR — o aviso na tela de dirigir, medido contra a rua.
 *
 *     node scripts/prova-radar-aviso.js
 *
 * F2+F3 do PR12082026-RADAR-E-VELOCIDADE. O app baixa o pacote de radares do
 * dia (`/radares/dados.json`, servido pela ponte nativa — mesmo caminho dos
 * tiles) e casa os pontos com a rota que já tem. As leis que esta prova guarda:
 *
 *   · CORREDOR E ORDEM: radar conta se está a ≤35 m da fita E À FRENTE do
 *     cursor preso-na-rua — a MESMA pergunta de ordem da manobra (a lição do
 *     fantasma, 49bc1245): radar atrás a 20 m nunca ganha de radar à frente.
 *   · UMA FALA POR RADAR: fixes repetidos dentro da janela não repetem a voz.
 *   · JANELA DO AVISO: velocidade × ~9 s, piso 300 m / teto 600 m.
 *   · F3: radar COM limite a <600 m à frente e vel > limite ⇒ o velocímetro
 *     ganha a classe `acima`; sai da janela ou a vel cai ⇒ perde. Radar com
 *     `limite: null` NUNCA aciona o F3 — chip e voz sem número inventado.
 *   · PRIORIDADE DA MANOBRA: manobra falando (ou a ~6 s de falar) ⇒ o radar
 *     cala ou espera. "Vire à esquerda" nunca é atropelado.
 *   · FAIL-SILENT: sem pacote de radares (404) a navegação fica INTACTA —
 *     manobra, velocímetro e voz de manobra iguais, zero erro de página.
 *   · CONTRASTE AA MEDIDO nos 2 temas (getComputedStyle, na camada viva).
 *
 * 🔴 GPS SINTÉTICO COM VELOCIDADE: o `setGeolocation` do Playwright não carrega
 * `coords.speed`, e o F3 é uma comparação de velocidade. O `addInitScript`
 * embrulha só o `navigator.geolocation` (o native.js não encosta nele — o que
 * ele engole é o `window.HBX`, e esse dublê continua entrando DEPOIS do boot,
 * como nas provas irmãs): a prova captura o callback do watch e empurra cada
 * fix com lat/lng/speed/heading na mão.
 *
 * (bancada igual à do `prova-manobra-fantasma`: servidor estático, pele do
 *  mock-fonte, dublê do `window.HBX` depois do boot.)
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..');
const MOCK = path.join(RAIZ, 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

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

/* ---- A RUA, EM METROS -----------------------------------------------------
   Rio Claro. O carro sobe 1.200 m pro norte, dobra à ESQUERDA e anda 200 m
   até a parada. Radares:
     R1  n=800,  5 m a leste da linha (DENTRO do corredor), limite 60;
     R2  n=600,  120 m a leste (FORA do corredor ~35 m), limite 40 — mudo;
     R3  n=1180, 4 m a oeste (dentro), limite null — chip+voz sem número,
         e é o radar da cena de PRIORIDADE (a esquina fica 20 m depois dele). */
const BASE = { lat: -22.4126, lng: -47.5763 };
const M_LAT = 1 / 110540;
const M_LNG = 1 / (111320 * Math.cos((BASE.lat * Math.PI) / 180));
const pt = (n, o) => [BASE.lng - (o * M_LNG), BASE.lat + (n * M_LAT)];

const SUBIDA_M = 1200;
const SAIDA_M = 200;

const serie = (de, ate, passo, fn) => {
  const v = [];
  for (let x = de; x <= ate + 0.001; x += passo) v.push(fn(x));
  return v;
};
const TRECHO_A = serie(0, SUBIDA_M, 25, (n) => pt(n, 0));
const TRECHO_B = serie(0, SAIDA_M, 25, (o) => pt(SUBIDA_M, o));
const FIM = TRECHO_B[TRECHO_B.length - 1];
const GEO = TRECHO_A.concat(TRECHO_B.slice(1));

const ROTA = {
  code: 'Ok',
  routes: [{
    distance: SUBIDA_M + SAIDA_M,
    duration: 120,
    geometry: { type: 'LineString', coordinates: GEO },
    legs: [{
      steps: [
        {
          name: 'Avenida Nove',
          maneuver: { type: 'depart', modifier: 'straight', location: TRECHO_A[0] },
          geometry: { type: 'LineString', coordinates: TRECHO_A },
        },
        {
          name: 'Rua do Lago',
          maneuver: { type: 'turn', modifier: 'left', location: TRECHO_B[0] },
          geometry: { type: 'LineString', coordinates: TRECHO_B },
        },
        {
          name: '',
          maneuver: { type: 'arrive', modifier: 'straight', location: FIM },
          geometry: { type: 'LineString', coordinates: [FIM, FIM] },
        },
      ],
    }],
  }],
};

const radar = (n, o, limite) => {
  const [lng, lat] = pt(n, o);
  return { lat, lng, limite, tipo: 'fixo', sentido: null, via: 'Avenida Nove', fonte: 'prova' };
};
const RADARES = [
  radar(800, -5, 60),     // R1 — corredor, com limite
  radar(600, -120, 40),   // R2 — fora do corredor: mudo
  radar(1180, 4, null),   // R3 — corredor, sem limite (e cena de prioridade)
];

/* o embrulho do GPS entra ANTES do boot: só o geolocation, nada do HBX */
const GPS_SINTETICO = () => {
  window.__fixCb = null;
  const geo = navigator.geolocation;
  geo.watchPosition = (ok) => { window.__fixCb = ok; return 1; };
  geo.getCurrentPosition = (ok) => {
    const u = window.__ultimoFixDaProva;
    if (u) ok(u); // a sonda de permissão responde com o último fix empurrado
  };
};

const PONTE = ({ itens, rota, radares }) => {
  window.__osrm = 0;
  window.__falas = [];
  window.HBX = {
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1',
          moduloFinanceiroAtivo: false, prospector: { empresas: [] },
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        window.__osrm += 1;
        return Promise.resolve(JSON.parse(JSON.stringify(rota)));
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/config') === 0) {
        return Promise.resolve({ prospectorAtivo: false, prospectorDisponivel: false, prospectorEquipe: false });
      }
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {},
    speak(t) { window.__falas.push(String(t)); },
  };
  window.HBXApp = window.HBXApp || {};
  /* o pacote de radares chega pela MESMA porta do aparelho: um fetch
     same-origin em /radares/dados.json. Com `radares`, o dublê responde;
     sem, o fetch segue pro servidor estático e leva 404 — o fail-silent. */
  if (radares) {
    const fetchOrig = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      if (String(url).indexOf('/radares/') >= 0) {
        return Promise.resolve(new Response(JSON.stringify(radares), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return fetchOrig(url, opts);
    };
  }
};

/** o que a tela do motorista está dizendo, agora */
const LER_TELA = () => {
  const camadas = document.querySelectorAll('#app .tela');
  const viva = camadas.length ? camadas[camadas.length - 1] : null;
  const q = (sel) => (viva ? viva.querySelector(sel) : null);
  const t = (sel) => { const el = q(sel); return el ? el.textContent.trim() : ''; };
  const chip = q('.gps-radar');
  const vel = q('.gps-vel');
  return {
    chipExiste: !!chip,
    chipOn: !!(chip && chip.classList.contains('on')),
    limiteVia: vel ? t('.gps-vel .limite-via') : '',
    chipTxt: chip ? t('.gps-radar .txt') : '',
    velExiste: !!vel,
    velTexto: t('[data-vivo="velocidade"]'),
    velAcima: !!(vel && vel.classList.contains('acima')),
    manobraVerbo: t('[data-vivo="manobraVerbo"]'),
    manobraDist: t('[data-vivo="manobraDist"]'),
    falas: (window.__falas || []).slice(),
  };
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  (cond ? ok : falhou).push(nome + (medida ? `  [${medida}]` : ''));
};

const ehFalaRadar = (f) => /^Radar/i.test(f);

async function dirigir(navegador, pele, porta, radares, roteiro) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: BASE.lat, longitude: BASE.lng, accuracy: 12 },
    permissions: ['geolocation'],
  });
  await ctx.addInitScript(GPS_SINTETICO);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));

  await p.goto(`http://127.0.0.1:${porta}/EntregaShell/app/src/logistica/assets/app/index.html`);
  await p.waitForTimeout(700);
  await p.addStyleTag({ content: pele });

  const itens = [{
    id: 'e0', status: 'pendente', rotaOrdem: 0, quantidade: 1,
    cliente: {
      id: 'c0', nome: 'Casa', enderecoLinha: 'Rua do Lago, 100', bairro: 'Centro',
      lat: FIM[1], lng: FIM[0],
    },
  }];
  await p.evaluate(PONTE, { itens, rota: ROTA, radares });

  const fix = async (n, o, velMps, rumo, esperaMs) => {
    const alvo = pt(n, o);
    await p.evaluate(([lat, lng, v, r]) => {
      const f = {
        coords: { latitude: lat, longitude: lng, accuracy: 8, speed: v, heading: r },
      };
      window.__ultimoFixDaProva = f;
      if (window.__fixCb) window.__fixCb(f);
    }, [alvo[1], alvo[0], velMps, rumo]);
    await p.waitForTimeout(esperaMs || 700);
  };

  await fix(0, 0, 0, null, 300);           // o 1º fix, antes da tela (o boot bebe dele)
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('mapa'));
  await p.waitForFunction(
    () => !document.querySelector('#app .tela.sai') && !!document.querySelector('#app .tela .gps'),
    null, { timeout: 12000 },
  );
  await p.waitForTimeout(1500);

  const fita = [];
  for (const q of roteiro) {
    await fix(q.n, q.o || 0, q.v, q.rumo != null ? q.rumo : 0, q.espera);
    const c = await p.evaluate(LER_TELA);
    fita.push({ ...q, ...c });
    const chip = c.chipOn ? `chip ON "${c.chipTxt}"` : 'chip off';
    console.log(`  ${String(q.rotulo).padEnd(46)} → ${chip} · vel ${c.velTexto || '—'}${c.velAcima ? ' ACIMA' : ''}`);
  }

  /* contraste AA, MEDIDO — na camada viva, nos DOIS temas */
  const medirContraste = () => {
    const lum = (rgb) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
      if (!m) return null;
      const c = [m[1], m[2], m[3]].map((x) => {
        const v = Number(x) / 255;
        return v <= 0.04045 ? v / 12.92 : (((v + 0.055) / 1.055) ** 2.4);
      });
      return (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
    };
    const razao = (a, b) => {
      const la = lum(a); const lb = lum(b);
      if (la == null || lb == null) return null;
      const [alto, baixo] = la >= lb ? [la, lb] : [lb, la];
      return (alto + 0.05) / (baixo + 0.05);
    };
    const camadas = document.querySelectorAll('#app .tela');
    const viva = camadas.length ? camadas[camadas.length - 1] : null;
    if (!viva) return null;
    const vel = viva.querySelector('.gps-vel');
    const chip = viva.querySelector('.gps-radar');
    if (!vel || !chip) return null;
    const b = vel.querySelector('b');
    const txt = chip.querySelector('.txt');
    if (!b || !txt) return null;
    vel.classList.add('acima');
    chip.classList.add('on');
    const r = {
      velAcima: razao(getComputedStyle(b).color, getComputedStyle(vel).backgroundColor),
      chipTexto: razao(getComputedStyle(txt).color, getComputedStyle(chip).backgroundColor),
    };
    vel.classList.remove('acima');
    chip.classList.remove('on');
    return r;
  };
  const escuro = await p.evaluate(medirContraste);
  await p.evaluate(() => { document.documentElement.dataset.luz = 'claro'; });
  await p.waitForTimeout(120);
  const claro = await p.evaluate(medirContraste);
  await p.evaluate(() => { document.documentElement.dataset.luz = 'escuro'; });

  await ctx.close();
  return { fita, erros, contraste: { escuro, claro } };
}

(async () => {
  regenerarGerados();
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  console.log(`\nA rua: ${SUBIDA_M} m ao norte · vira à ESQUERDA · ${SAIDA_M} m até a parada`);
  console.log('radares: R1 800 m (lim 60) · R2 600 m/120 m fora (lim 40) · R3 1180 m (sem limite)');

  /* ======================================================================
     CASO 1 — COM O PACOTE DO DIA: corredor, ordem, dedup, F3 e prioridade.
     ====================================================================== */
  console.log('\n=== CASO 1 · com radares ===');
  const ROTEIRO = [
    { n: 0, v: 15, rotulo: 'saindo (R1 a 800 m)' },
    { n: 300, v: 15, rotulo: 'R1 a 500 m — fora da janela' },
    { n: 450, v: 20, rotulo: 'R1 a 350 m, 72 km/h — F3 liga, chip ainda não' },
    { n: 458, v: 12, rotulo: 'R1 a 342 m, 43 km/h — F3 desliga' },
    { n: 520, v: 15, rotulo: 'R1 a 280 m — chip + UMA fala' },
    { n: 540, v: 15, rotulo: 'R1 a 260 m — dedup (sem 2ª fala)' },
    { n: 540, v: 15, rotulo: 'fix repetido — dedup segue' },
    { n: 850, v: 20, rotulo: 'R1 ficou 50 m ATRÁS — chip apaga; R3 sem limite não avermelha' },
    { n: 880, v: 20, rotulo: 'R3 a 300 m, manobra a 1 s do prepara — radar ESPERA' },
    { n: 900, v: 20, rotulo: 'manobra fala "Em 300 metros" — radar em folga' },
    { n: 905, v: 15, espera: 4400, rotulo: 'folga cumprida — radar fala, sem número' },
    { n: 1150, v: 10, rotulo: 'manobra "agora" — R3 a 30 m, sem refala' },
    { n: 1200, o: 60, v: 10, rumo: 270, rotulo: 'depois da curva — R3 atrás, chip apaga' },
  ];
  const c1 = await dirigir(navegador, pele, porta, RADARES, ROTEIRO);
  const f = c1.fita;
  const final = f[f.length - 1];
  const falasRadar = final.falas.filter(ehFalaRadar);

  if (c1.erros.length) eh('0. a página não quebrou', false, c1.erros[0]);

  eh('A. o chip de radar EXISTE na tela de dirigir',
    f.every((x) => x.chipExiste), f.filter((x) => !x.chipExiste).length + ' fix(es) sem o nó');

  eh('A1. longe da janela o chip fica apagado',
    !f[0].chipOn && !f[1].chipOn && !f[2].chipOn,
    [f[0].chipOn, f[1].chipOn, f[2].chipOn].join(','));

  eh('A2. na janela o chip acende e o limite fica na placa do velocímetro',
    f[4].chipOn && f[4].limiteVia === '60',
    `on=${f[4].chipOn} limite="${f[4].limiteVia}" txt="${f[4].chipTxt}"`);

  eh('A3. radar que ficou pra trás apaga o chip (ordem, não distância)',
    !f[7].chipOn && !f[12].chipOn,
    `850m: ${f[7].chipOn} · depois da curva: ${f[12].chipOn}`);

  const falaR1 = final.falas.find((x) => /Radar de 60/.test(x));
  eh('B. UMA fala pro R1, com o limite e a distância arredondada da manobra',
    falasRadar.filter((x) => /de 60/.test(x)).length === 1 && falaR1 === 'Radar de 60 a 300 metros',
    falasRadar.join(' | ') || 'nenhuma fala de radar');

  eh('B1. fixes repetidos na janela não repetem a fala (dedup)',
    f[5].falas.filter(ehFalaRadar).length === f[4].falas.filter(ehFalaRadar).length
    && f[6].falas.filter(ehFalaRadar).length === f[4].falas.filter(ehFalaRadar).length,
    `${f[4].falas.filter(ehFalaRadar).length} → ${f[6].falas.filter(ehFalaRadar).length}`);

  eh('C. radar FORA do corredor (120 m da fita) é mudo',
    !final.falas.some((x) => /40/.test(x)),
    final.falas.filter(ehFalaRadar).join(' | ') || 'nenhuma');

  eh('D. F3 liga com vel > limite na janela de 600 m…',
    f[2].velAcima && f[2].limiteVia === '60',
    `72 km/h contra ${f[2].limiteVia || '—'}: acima=${f[2].velAcima}`);
  eh('D1. …e desliga quando a velocidade cai',
    !f[3].velAcima, `43 km/h contra 60: acima=${f[3].velAcima}`);
  eh('D2. radar sem limite NUNCA avermelha o velocímetro',
    !f[7].velAcima && !f[8].velAcima && !f[9].velAcima,
    [f[7].velAcima, f[8].velAcima, f[9].velAcima].join(','));

  eh('E. radar sem limite: chip sem número e voz sem número inventado',
    f[8].chipOn && f[8].limiteVia === '' && falasRadar.some((x) => x === 'Radar a 300 metros'),
    `limite="${f[8].limiteVia}" · falas: ${falasRadar.join(' | ')}`);

  /* prioridade: aos 880/900 m a manobra estava falando (ou a segundos de
     falar) — o radar só pode ter falado DEPOIS do "Em 300 metros". */
  const idxPrepara = final.falas.findIndex((x) => /^Em 300 metros/.test(x));
  const idxRadar3 = final.falas.findIndex((x) => x === 'Radar a 300 metros');
  eh('F. a manobra tem prioridade: o radar do R3 fala DEPOIS do "Em 300 metros"',
    idxPrepara >= 0 && idxRadar3 > idxPrepara,
    `prepara=#${idxPrepara} radar=#${idxRadar3} · ${final.falas.join(' | ')}`);
  eh('F1. nos fixes em que a manobra ia falar, o radar ficou calado',
    f[8].falas.filter(ehFalaRadar).length === 1 && f[9].falas.filter(ehFalaRadar).length === 1,
    `${f[8].falas.filter(ehFalaRadar).length} · ${f[9].falas.filter(ehFalaRadar).length} (só a do R1)`);

  eh('G. no total: exatamente UMA fala por radar do corredor',
    falasRadar.length === 2, falasRadar.join(' | ') || 'nenhuma');

  /* 🔴 A VOZ FALA O VERBO COMO ELE VEM DA TABELA — "vire à esquerda na Rua do
     Lago", minúsculo. A MAIÚSCULA é do CARTÃO (`maiuscula(m.passo.verbo)` em
     `pintarNavegacao`), e cobrar dela aqui era esta prova inventando uma copy
     que o app nunca disse: medido em 12/08, com o radar ainda nem escrito, H e
     J4 já falhavam sozinhas. A asserção é do fato, não do gosto. */
  eh('H. a voz da manobra continua inteira (prepara + agora)',
    idxPrepara >= 0 && final.falas.some((x) => /^vire à esquerda/i.test(x)),
    final.falas.filter((x) => !ehFalaRadar(x)).join(' | '));

  const ct = c1.contraste;
  eh('I. contraste AA do velocímetro "acima" — escuro',
    !!(ct.escuro && ct.escuro.velAcima >= 4.5),
    ct.escuro ? `${(ct.escuro.velAcima || 0).toFixed(2)}:1` : 'não medido');
  eh('I1. contraste AA do velocímetro "acima" — claro',
    !!(ct.claro && ct.claro.velAcima >= 4.5),
    ct.claro ? `${(ct.claro.velAcima || 0).toFixed(2)}:1` : 'não medido');
  eh('I2. contraste AA do texto do chip — escuro e claro',
    !!(ct.escuro && ct.escuro.chipTexto >= 4.5 && ct.claro && ct.claro.chipTexto >= 4.5),
    `${ct.escuro ? (ct.escuro.chipTexto || 0).toFixed(2) : '—'} · ${ct.claro ? (ct.claro.chipTexto || 0).toFixed(2) : '—'}`);

  /* ======================================================================
     CASO 2 — SEM O PACOTE (404): a navegação não sente.
     ====================================================================== */
  console.log('\n=== CASO 2 · sem radares (404 no pacote) ===');
  const ROTEIRO_B = [
    { n: 300, v: 15, rotulo: 'dirigindo sem pacote' },
    { n: 520, v: 15, rotulo: 'onde o chip acenderia' },
    { n: 1150, v: 10, rotulo: 'na manobra' },
  ];
  const c2 = await dirigir(navegador, pele, porta, null, ROTEIRO_B);
  const g = c2.fita;
  const finalB = g[g.length - 1];

  eh('J. sem pacote a página não quebra',
    c2.erros.length === 0, c2.erros[0] || 'zero erros');
  eh('J1. o chip nunca acende',
    g.every((x) => !x.chipOn), g.map((x) => x.chipOn).join(','));
  eh('J2. o velocímetro nunca avermelha',
    g.every((x) => !x.velAcima), g.map((x) => x.velAcima).join(','));
  eh('J3. o cromo da navegação segue inteiro (manobra + velocímetro)',
    g.every((x) => x.velTexto !== '') && finalB.manobraVerbo === 'Vire à esquerda',
    `vel: ${g.map((x) => x.velTexto || '—').join(',')} · manobra: "${finalB.manobraVerbo}"`);
  eh('J4. a voz da manobra segue falando; nenhuma fala de radar',
    finalB.falas.some((x) => /^vire à esquerda/i.test(x)) && !finalB.falas.some(ehFalaRadar),
    finalB.falas.join(' | ') || 'nenhuma fala');

  await navegador.close();
  srv.close();

  console.log('');
  ok.forEach((l) => console.log(`  ok   ${l}`));
  falhou.forEach((l) => console.log(` FALHA ${l}`));
  console.log(falhou.length
    ? `\n❌ ${falhou.length} falha(s) — o radar não está pronto`
    : `\n✅ ${ok.length} provas: aviso pelo corredor e pela ordem, uma fala por radar, F3 liga e desliga, manobra manda na voz, sem pacote nada muda`);
  process.exit(falhou.length ? 1 : 0);
})();
