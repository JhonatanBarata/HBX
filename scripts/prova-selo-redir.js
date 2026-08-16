#!/usr/bin/env node
/**
 * PROVA DO SELO "Redirecionando…" — o retraço se anuncia, e SÓ o retraço.
 *
 *     node scripts/prova-selo-redir.js
 *
 * 🔴 POR QUE ELA EXISTE (12/08): fora do traçado o caminho novo demora o que a
 * rede demorar, e a tela parada parece o app perdido — a fita ainda aponta o
 * caminho abandonado e nada diz que o recálculo já está em curso. O selo
 * `.gps-redir` (nó permanente do template, irmão do `.gps-veu`) acende quando
 * `pedirRota` despacha um RETRAÇO (rota na memória + fora do traçado + alvo
 * igual) e apaga com a resposta — sucesso ganha o flash da fita e ~700 ms de
 * companhia; falha apaga NA HORA (backoff pode ser 60 s; selo pendurado é
 * promessa falsa); e um teto duro de 4 s apaga de qualquer jeito.
 *
 * O QUE REPROVA AQUI:
 *   · remover o `.gps-redir` do template (cena 1 nunca vê o selo aceso);
 *   · acender fora do retraço — no 1º pedido do dia (cena 0) ou na rota nova
 *     de parada entregue (cena 3, `trocouAlvo`);
 *   · selo que não apaga na falha (cena 2) ou fica além do teto (cena 4);
 *   · flash que remonta camada em vez de só trocar tinta (cena 1 cobra
 *     `setPaintProperty` de ida e volta nas DUAS camadas da fita).
 *
 * A RÉGUA É A TELA (classe no nó + tinta pedida ao maplibre), nunca variável
 * da ponte. O relógio anda por `window.__desloc` (o piso de 15 s entre pedidos
 * é regra de produção, não tempo de bancada); os timers do selo são setTimeout
 * de verdade e continuam medidos em tempo real.
 *
 * (bancada igual à do `prova-manobra-fantasma`: servidor estático, pele do
 *  mock-fonte, dublê do `window.HBX` DEPOIS do boot.)
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

/* ---- A AVENIDA, EM METROS -------------------------------------------------
   Uma reta de 600 m pra norte com duas paradas (300 m e 600 m). O carro sai
   dela pra LESTE — 200 m de desvio, bem além dos 60 m do snap — e é aí que o
   selo tem que acender. */
const BASE = { lat: -22.4126, lng: -47.5763 };
const M_LAT = 1 / 110540;
const M_LNG = 1 / (111320 * Math.cos((BASE.lat * Math.PI) / 180));
const pt = (n, o) => [BASE.lng - (o * M_LNG), BASE.lat + (n * M_LAT)];

const serie = (de, ate, passo, fn) => {
  const v = [];
  for (let x = de; x <= ate + 0.001; x += passo) v.push(fn(x));
  return v;
};
const PERNA_1 = serie(0, 300, 25, (n) => pt(n, 0));
const PERNA_2 = serie(300, 600, 25, (n) => pt(n, 0));
const GEO = PERNA_1.concat(PERNA_2.slice(1));
const A = PERNA_1[PERNA_1.length - 1];
const B = PERNA_2[PERNA_2.length - 1];

const ROTA = {
  code: 'Ok',
  routes: [{
    distance: 600,
    duration: 120,
    geometry: { type: 'LineString', coordinates: GEO },
    legs: [{
      steps: [
        { name: 'Avenida Nove', maneuver: { type: 'depart', modifier: 'straight', location: PERNA_1[0] }, geometry: { type: 'LineString', coordinates: PERNA_1 } },
        { name: '', maneuver: { type: 'arrive', modifier: 'straight', location: A }, geometry: { type: 'LineString', coordinates: [A, A] } },
      ],
    }, {
      steps: [
        { name: 'Avenida Nove', maneuver: { type: 'depart', modifier: 'straight', location: A }, geometry: { type: 'LineString', coordinates: PERNA_2 } },
        { name: '', maneuver: { type: 'arrive', modifier: 'straight', location: B }, geometry: { type: 'LineString', coordinates: [B, B] } },
      ],
    }],
  }],
};

const ITENS = (statusA) => [
  { id: 'e1', status: statusA, rotaOrdem: 0, quantidade: 1, cliente: { id: 'c1', nome: 'Meio', enderecoLinha: 'Avenida Nove, 300', bairro: 'Centro', lat: A[1], lng: A[0] } },
  { id: 'e2', status: 'pendente', rotaOrdem: 1, quantidade: 1, cliente: { id: 'c2', nome: 'Fim', enderecoLinha: 'Avenida Nove, 600', bairro: 'Centro', lat: B[1], lng: B[0] } },
];

const PONTE = ({ itens, rota }) => {
  window.__itens = itens;
  window.__rota = rota;
  window.__osrm = 0;
  window.__osrmModo = { atraso: 800, falha: false, pendura: false };
  /* o relógio adiantável: o piso de 15 s entre pedidos é regra de produção,
     não tempo de bancada. Os setTimeout do selo seguem no tempo real. */
  const dNow = Date.now.bind(Date);
  window.__desloc = 0;
  Date.now = () => dNow() + window.__desloc;
  window.HBX = {
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: window.__itens, routeStatus: 'ACTIVE', routeId: 'r1',
          moduloFinanceiroAtivo: false, prospector: { empresas: [] },
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        window.__osrm += 1;
        const m = window.__osrmModo;
        if (m.pendura) return new Promise(() => {});
        return new Promise((ok, erro) => {
          setTimeout(() => {
            if (m.falha) erro(new Error('roteador fora'));
            else ok(JSON.parse(JSON.stringify(window.__rota)));
          }, m.atraso);
        });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/config') === 0) {
        return Promise.resolve({ prospectorAtivo: false, prospectorDisponivel: false, prospectorEquipe: false });
      }
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {},
    speak() {},
  };
  window.HBXApp = window.HBXApp || {};
  /* o diário do selo: TODA virada on/off, com carimbo — é dele que saem os
     asserts de "acendeu", "apagou" e "quanto tempo ficou". */
  window.__seloFita = [];
  let antes = null;
  const olhar = () => {
    const el = document.querySelector('.gps-redir');
    const agora = !!(el && el.classList.contains('on'));
    if (agora !== antes) { antes = agora; window.__seloFita.push({ on: agora, em: Date.now() }); }
  };
  new MutationObserver(olhar).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class'],
  });
  olhar();
};

const LER = () => {
  const el = document.querySelector('.gps-redir');
  return {
    existe: !!el,
    on: !!(el && el.classList.contains('on')),
    opacidade: el ? getComputedStyle(el).opacity : null,
    osrm: window.__osrm,
    fita: (window.__seloFita || []).slice(),
    pinturas: (window.__pinturas || []).slice(),
  };
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  (cond ? ok : falhou).push(nome + (medida ? `  [${medida}]` : ''));
};

/** os acesos (pares on→off) do diário a partir de um ponto no tempo */
const acesos = (fita, desde) => {
  const v = [];
  for (let i = 0; i < fita.length; i += 1) {
    if (!fita[i].on || fita[i].em < desde) continue;
    const off = fita.slice(i + 1).find((f) => !f.on);
    v.push({ em: fita[i].em, durou: off ? off.em - fita[i].em : null });
  }
  return v;
};

(async () => {
  regenerarGerados();
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: BASE.lat, longitude: BASE.lng, accuracy: 12 },
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));

  await p.goto(`http://127.0.0.1:${porta}/EntregaShell/app/src/logistica/assets/app/index.html`);
  await p.waitForTimeout(700);
  await p.addStyleTag({ content: pele });
  await p.evaluate(PONTE, { itens: ITENS('pendente'), rota: ROTA });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('mapa'));
  await p.waitForFunction(
    () => !document.querySelector('#app .tela.sai') && !!document.querySelector('#app .tela .gps'),
    null, { timeout: 12000 },
  );

  const irAte = async (n, o) => {
    const alvo = pt(n, o);
    await ctx.setGeolocation({ latitude: alvo[1], longitude: alvo[0], accuracy: 12 });
  };
  const espera = async (fn, ms, arg) => {
    try { await p.waitForFunction(fn, arg == null ? null : arg, { timeout: ms }); return true; }
    catch (_) { return false; }
  };
  const marco = () => p.evaluate(() => Date.now());

  /* ====================================================================
     CENA 0 — o 1º pedido do dia NÃO é retraço: o selo fica quieto.
     ==================================================================== */
  console.log('\n=== CENA 0 · primeiro pedido (sem rota na memória) ===');
  const veioRota = await espera(() => window.__osrm >= 1, 8000);
  await p.waitForTimeout(1600);      // atraso do dublê (800) + folga da pintura
  let c = await p.evaluate(LER);
  eh('0. o nó .gps-redir existe no template da tela de dirigir', c.existe);
  eh('1. no 1º pedido (sem rota na memória) o selo NUNCA acendeu',
    veioRota && c.fita.filter((f) => f.on).length === 0,
    `${c.osrm} pedido(s), ${c.fita.filter((f) => f.on).length} acendida(s)`);

  // a fita precisa estar desenhada antes do flash ser cobrado — e o grampo
  // na tinta entra aqui, DEPOIS da pintura de nascença (que é addLayer, não flash)
  const temFita = await espera(() => {
    const palco = document.querySelector('[data-mapa="gps"]');
    const m = palco && palco.__hbxMapaObj;
    return !!(m && m.getLayer && m.getLayer('hbx-rota-traco-fita'));
  }, 8000);
  eh('2. a fita da rota está no mapa da navegação', temFita);
  await p.evaluate(() => {
    const palco = document.querySelector('[data-mapa="gps"]');
    const m = palco && palco.__hbxMapaObj;
    window.__pinturas = [];
    if (m && m.setPaintProperty) {
      const orig = m.setPaintProperty.bind(m);
      m.setPaintProperty = (id, prop, val) => {
        window.__pinturas.push({ id, prop, val: typeof val === 'object' ? JSON.parse(JSON.stringify(val)) : val });
        return orig(id, prop, val);
      };
    }
  });

  /* ====================================================================
     CENA 1 — RETRAÇO + SUCESSO: acende, flash na fita, apaga sozinho.
     ==================================================================== */
  console.log('=== CENA 1 · retraço com sucesso (200 m fora do traçado) ===');
  await p.evaluate(() => { window.__desloc += 16000; });
  const m1 = await marco();
  await irAte(150, 200);
  const acendeu = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !!(el && el.classList.contains('on'));
  }, 3000);
  eh('3. fora do traçado, o selo ACENDE com o pedido em voo', acendeu);
  if (acendeu) {
    await p.waitForTimeout(300);     // a transição de entrada (0,22 s) termina
    c = await p.evaluate(LER);
    eh('4. aceso ele é VISÍVEL de verdade (opacity ≈ 1 na pele do mock)',
      c.on && Number(c.opacidade) > 0.9, `opacity=${c.opacidade}`);
  }
  const apagou1 = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !(el && el.classList.contains('on'));
  }, 4000);
  c = await p.evaluate(LER);
  const a1 = acesos(c.fita, m1 - 500);
  eh('5. no SUCESSO ele apaga sozinho, logo depois do caminho novo (< 3 s, não é o teto)',
    apagou1 && a1.length >= 1 && a1[0].durou != null && a1[0].durou < 3000,
    a1.length ? `aceso por ${a1[0].durou} ms` : 'nunca acendeu');
  const corIda = c.pinturas.filter((q) => q.prop === 'line-color').slice(0, 2);
  const corVolta = c.pinturas.filter((q) => q.prop === 'line-color').slice(2, 4);
  const transicoes = c.pinturas.filter((q) => q.prop === 'line-color-transition');
  eh('6. o flash é TINTA nas duas camadas: ida pro clarão junto…',
    corIda.length === 2 && corIda[0].val === corIda[1].val
      && new Set(corIda.map((q) => q.id)).size === 2,
    corIda.map((q) => `${q.id}=${q.val}`).join(' · ') || 'nenhuma pintura');
  eh('7. …e volta pra cor de cada uma (fita ≠ casca ≠ clarão)',
    corVolta.length === 2 && new Set(corVolta.map((q) => q.id)).size === 2
      && corVolta.every((q) => q.val !== corIda[0].val)
      && corVolta[0].val !== corVolta[1].val,
    corVolta.map((q) => `${q.id}=${q.val}`).join(' · ') || 'não voltou');
  eh('8. com transição do próprio maplibre (180 ms ida, 450 ms volta)',
    transicoes.length === 4 && transicoes.slice(0, 2).every((q) => q.val && q.val.duration === 180)
      && transicoes.slice(2, 4).every((q) => q.val && q.val.duration === 450),
    `${transicoes.length} transições: ${transicoes.map((q) => q.val && q.val.duration).join(',')}`);

  /* ====================================================================
     CENA 2 — RETRAÇO + FALHA: acende, e apaga NA HORA da recusa.
     ==================================================================== */
  console.log('=== CENA 2 · retraço com falha do roteador ===');
  await p.evaluate(() => { window.__osrmModo.falha = true; window.__osrmModo.atraso = 500; window.__desloc += 16000; });
  const m2 = await marco();
  await irAte(300, 200);
  const acendeu2 = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !!(el && el.classList.contains('on'));
  }, 3000);
  const apagou2 = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !(el && el.classList.contains('on'));
  }, 3000);
  c = await p.evaluate(LER);
  const a2 = acesos(c.fita, m2 - 500);
  eh('9. na FALHA o selo acendeu com o pedido…', acendeu2);
  eh('10. …e apagou NA HORA da recusa (< 1 s — sem esperar sucesso nem teto)',
    apagou2 && a2.length >= 1 && a2[0].durou != null && a2[0].durou < 1000,
    a2.length ? `aceso por ${a2[0].durou} ms` : 'nunca acendeu');
  eh('11. falha NÃO dá flash na fita',
    c.pinturas.filter((q) => q.prop === 'line-color').length === 4,
    `${c.pinturas.filter((q) => q.prop === 'line-color').length} pinturas de cor (4 são da cena 1)`);

  /* ====================================================================
     CENA 3 — PARADA ENTREGUE (`trocouAlvo`): rota nova SEM selo.
     ==================================================================== */
  console.log('=== CENA 3 · parada entregue — rota nova não é retraço ===');
  await p.evaluate((itens) => {
    window.__itens = itens;
    window.__osrmModo.falha = false; window.__osrmModo.atraso = 800;
    window.__desloc += 16000;
    return window.HBXRota.carregar();
  }, ITENS('entregue'));
  await p.waitForTimeout(900);       // o repinte da lista assenta
  const m3 = await marco();
  const osrmAntes3 = (await p.evaluate(LER)).osrm;
  await irAte(310, 200);
  const pediu3 = await espera((n) => window.__osrm > n, 4000, osrmAntes3)
    || await p.evaluate((n) => window.__osrm > n, osrmAntes3);
  await p.waitForTimeout(1400);      // atraso (800) + folga: o pedido inteiro no ar
  c = await p.evaluate(LER);
  const a3 = acesos(c.fita, m3);
  eh('12. a rota nova FOI pedida (o alvo mudou)', !!pediu3, `${c.osrm - osrmAntes3} pedido(s) novo(s)`);
  eh('13. mas o selo NÃO acendeu — fora do traçado e tudo, entregar parada não é retraço',
    a3.length === 0, a3.length ? `acendeu ${a3.length}×` : 'quieto do começo ao fim');

  /* ====================================================================
     CENA 4 — RESPOSTA QUE NUNCA VEM: o teto duro de 4 s apaga sozinho.
     ==================================================================== */
  console.log('=== CENA 4 · pedido pendurado — o teto de 4 s ===');
  await p.evaluate(() => { window.__osrmModo.pendura = true; window.__desloc += 16000; });
  const m4 = await marco();
  await irAte(460, 200);
  const acendeu4 = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !!(el && el.classList.contains('on'));
  }, 3000);
  const apagou4 = await espera(() => {
    const el = document.querySelector('.gps-redir');
    return !(el && el.classList.contains('on'));
  }, 6000);
  c = await p.evaluate(LER);
  const a4 = acesos(c.fita, m4 - 500);
  eh('14. pedido que não volta: o selo acendeu…', acendeu4);
  eh('15. …e o TETO DURO apagou sozinho (~4 s, nunca eterno)',
    apagou4 && a4.length >= 1 && a4[0].durou != null && a4[0].durou > 3200 && a4[0].durou < 5200,
    a4.length ? `aceso por ${a4[0].durou} ms` : 'nunca acendeu');

  if (erros.length) eh('16. a página não quebrou', false, erros[0]);

  await ctx.close();
  await navegador.close();
  srv.close();

  console.log('');
  ok.forEach((l) => console.log(`  ok   ${l}`));
  falhou.forEach((l) => console.log(` FALHA ${l}`));
  console.log(falhou.length
    ? `\n❌ ${falhou.length} falha(s) — o selo mente (ou sumiu)`
    : `\n✅ ${ok.length} provas: o retraço se anuncia, a resposta o apaga, e só o retraço acende`);
  process.exit(falhou.length ? 1 : 0);
})();
