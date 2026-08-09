#!/usr/bin/env node
/**
 * PROVA FUNCIONAL da porta "Meus clientes" (o "+" da Montagem).
 *
 *     node scripts/prova-meus-clientes.js
 *
 * O `casca-conferir` responde "pinta igual ao mock?". Este responde a OUTRA
 * pergunta, que print nenhum responde: "o dedo aperta e o servidor certo é
 * chamado?". Dirige a tela de verdade — o `ponte.js` do APK, sem dublê nenhum —
 * contra um servidor DUBLADO, e cobra o caminho inteiro: lista, marcação,
 * busca por nome, troca de porta, os POSTs e o recibo.
 *
 * 🔴 O DUBLÊ ENTRA DEPOIS DO BOOT. O `native.js` cria o `window.HBX` de verdade
 * no load e engoliria um `addInitScript`. `temPonte`/`chamar` leem
 * `window.HBX` na hora da chamada, então trocar depois vale pro app inteiro.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

const PONTE = () => {
  window.__chamadas = [];
  const CLIENTES = {
    items: [
      { id: 'c1', name: 'Larissa Ype', isCliente: true, endereco: 'Rua 3a, 1354', cidade: 'Rio Claro', diasEntrega: [1] },
      { id: 'c2', name: 'Ademir', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', diasEntrega: [1] },
      { id: 'c3', name: 'Alfredo', isCliente: true, endereco: 'Rua 4-a, 93', cidade: 'Rio Claro', diasEntrega: [4] },
      { id: 'c4', name: 'Ana Alice', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', diasEntrega: [1] },
      { id: 'c5', name: 'Andreia bicicletaria', isCliente: true, endereco: 'Rua 8 JP, 210', cidade: 'Rio Claro', diasEntrega: [6] },
      { id: 'lead9', name: 'Lead que nao compra', isCliente: false, endereco: 'Rua X, 1', cidade: 'Rio Claro' },
    ],
    total: 6,
  };
  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, caminho, (opcoes && opcoes.body) || null]);
      if (caminho.indexOf('/nucleo/clientes') === 0) {
        const q = /query=([^&]*)/.exec(caminho);
        if (!q) return Promise.resolve(JSON.parse(JSON.stringify(CLIENTES)));
        const alvo = decodeURIComponent(q[1]).toLowerCase();
        return Promise.resolve({ items: CLIENTES.items.filter((c) => c.name.toLowerCase().indexOf(alvo) >= 0), total: 1 });
      }
      if (caminho.indexOf('/logistica/entregas') === 0 && metodo === 'POST') {
        if (window.__falhar && opcoes.body.customerProfileId === window.__falhar) return Promise.reject(new Error('500'));
        return Promise.resolve({ id: 'e-' + opcoes.body.customerProfileId });
      }
      if (caminho.indexOf('/logistica/rota/planejar') === 0) return Promise.resolve({ stops: [] });
      if (caminho.indexOf('/logistica/rota') === 0) return Promise.resolve({ items: [], estado: 'montar' });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

const ok = [];
const falhou = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));
  await p.goto(APP);
  await p.waitForTimeout(800);
  // O dublê entra DEPOIS do boot: o `native.js` cria o `window.HBX` de verdade
  // no load e engoliria um init script. `temPonte`/`chamar` leem `window.HBX`
  // na hora da chamada, então trocar aqui já vale pro app inteiro.
  await p.evaluate(PONTE);

  await p.evaluate(() => window.ir('rapida'));
  await p.waitForTimeout(600);

  const t1 = await p.evaluate(() => ({
    porta: (document.querySelector('.modo.on b') || {}).textContent,
    linhas: document.querySelectorAll('.cli').length,
    nomes: [...document.querySelectorAll('.cli strong')].map((e) => e.textContent),
    pe: !!document.querySelector('[data-acao="rapida-adicionar-escolhidos"]'),
    pediu: window.__chamadas.filter((c) => c[1].indexOf('/nucleo/clientes') === 0).length,
  }));
  eh('abre na porta "Meus clientes"', t1.porta === 'Meus clientes');
  eh('lista veio do servidor (5 clientes, lead fora)', t1.linhas === 5 && t1.nomes.indexOf('Lead que nao compra') < 0);
  eh('sem ninguem marcado, NAO existe pe', t1.pe === false);
  eh('pediu a lista 1x ao abrir', t1.pediu === 1);

  const marcar = async (i) => {
    await p.evaluate((n) => document.querySelectorAll('[data-acao="rapida-marcar"]')[n].click(), i);
    await p.waitForTimeout(120);
  };
  await marcar(0); await marcar(2); await marcar(3);
  const t2 = await p.evaluate(() => ({
    pilulas: document.querySelectorAll('.pill.lime').length,
    rotulo: (document.querySelector('[data-acao="rapida-adicionar-escolhidos"] b') || {}).textContent,
  }));
  eh('3 marcados acendem 3 pilulas', t2.pilulas === 3);
  eh('o pe conta: "Adicionar 3 na rota"', t2.rotulo === 'Adicionar 3 na rota');

  await marcar(2);
  const t3 = await p.evaluate(() => (document.querySelector('[data-acao="rapida-adicionar-escolhidos"] b') || {}).textContent);
  eh('2o toque desmarca (volta pra 2)', t3 === 'Adicionar 2 na rota');
  await marcar(2);

  await p.evaluate(() => {
    const el = document.querySelector('[data-campo="rapida-cliente-busca"]');
    el.value = 'alfr'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(900);
  const t4 = await p.evaluate(() => ({
    linhas: document.querySelectorAll('.cli').length,
    query: (window.__chamadas.filter((c) => c[1].indexOf('query=') > 0).pop() || [])[1],
    campo: (document.querySelector('[data-campo="rapida-cliente-busca"]') || {}).value,
    rotulo: (document.querySelector('[data-acao="rapida-adicionar-escolhidos"] b') || {}).textContent,
  }));
  eh('busca por NOME filtra no servidor', t4.linhas === 1 && /query=alfr/.test(t4.query || ''));
  eh('o texto digitado sobrevive ao repinte', t4.campo === 'alfr');
  eh('marcado fora do filtro NAO se perde', t4.rotulo === 'Adicionar 3 na rota');

  await p.evaluate(() => {
    const el = document.querySelector('[data-campo="rapida-cliente-busca"]');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(900);

  await p.evaluate(() => document.querySelector('[data-acao="rapida-porta"][data-porta="endereco"]').click());
  await p.waitForTimeout(200);
  const t5 = await p.evaluate(() => ({
    busca: !!document.querySelector('[data-campo="rapida-busca"]'),
    lista: document.querySelectorAll('.cli').length,
    pe: (document.querySelector('.tmx-dock b') || {}).textContent,
  }));
  eh('porta Endereco mostra a tela antiga', t5.busca === true && t5.lista === 0 && t5.pe === 'Buscar endereço');

  await p.evaluate(() => document.querySelector('[data-acao="rapida-porta"][data-porta="cadastro"]').click());
  await p.waitForTimeout(400);
  const t6 = await p.evaluate(() => (document.querySelector('[data-acao="rapida-adicionar-escolhidos"] b') || {}).textContent);
  eh('voltar pra Meus clientes guarda os marcados', t6 === 'Adicionar 3 na rota');

  await p.evaluate(() => { window.__chamadas = []; });
  await p.evaluate(() => document.querySelector('[data-acao="rapida-adicionar-escolhidos"]').click());
  await p.waitForTimeout(1500);
  const t7 = await p.evaluate(() => ({
    posts: window.__chamadas.filter((c) => c[0] === 'POST' && c[1] === '/logistica/entregas').map((c) => c[2]),
    planejou: window.__chamadas.filter((c) => c[1].indexOf('/logistica/rota/planejar') === 0).length,
    ordem: window.__chamadas.filter((c) => c[0] === 'POST').map((c) => c[1]),
    titulo: (document.querySelector('.portao h3') || {}).textContent,
    sub: (document.querySelector('.portao .sub') || {}).textContent,
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
  }));
  /* 🔴 O CONTRATO MUDOU EM 09/08, E ESTA PROVA GUARDAVA O ANTIGO.
     Ela cobrava "3 POSTs em /logistica/entregas" no toque do pé — que é
     exatamente o defeito que o dono reprovou no celular: *"eu ainda nem
     confirmei q queria nada, ele meio q já adiciona"*. Com a rota AINDA NÃO
     INICIADA, escolher cliente virou RASCUNHO: nada vai ao servidor até
     "Montar rota" / "Iniciar rota" (ver `materializarRascunho` na ponte, e a
     cobrança ponta a ponta em `prova-fluxo-rota.js`).
     A entrada daqui é o boot (`veioDe` não é 'rota' nem 'rotalista'), então
     `rapida.volta` é 'montagem' — o caminho do rascunho. */
  eh('escolher NAO grava: zero POST em /logistica/entregas', t7.posts.length === 0);
  eh('escolher NAO planeja a rota', t7.planejou === 0);
  eh('recibo conta as 3 na LISTA, nao "na rota"', t7.titulo === '3 paradas na lista');
  eh('recibo diz que ainda da pra mexer', /Ainda dá pra mexer/.test(t7.sub || ''));
  eh('recibo aponta o Iniciar como o que vale', /Iniciar rota/.test(t7.sub || ''));
  eh('volta pra Montagem', t7.tela === 'montagem');

  /* O rascunho aparece na lista da Montagem — sem isto a escolha dele viraria
     fé: 3 marcados e uma tela que não os mostra. */
  const t8 = await p.evaluate(() => ({
    stops: document.querySelectorAll('.stops .stop').length,
    nomes: [...document.querySelectorAll('.stops .stop .who strong')].map((e) => e.textContent.trim()),
  }));
  eh('os 3 escolhidos APARECEM na Montagem', t8.stops === 3);
  // QUEM entrou é do dedo; a SEQUÊNCIA é do otimizador (e do desmarca/remarca
  // logo acima) — cobrar ordem aqui seria cobrar a decisão de outro dono.
  eh('e sao os 3 que o dedo marcou', t8.nomes.slice().sort().join('|') === ['Larissa Ype', 'Alfredo', 'Ana Alice'].sort().join('|'));

  await b.close();
  console.log('\n=== PROVA: porta "Meus clientes" ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(falhou.length ? 1 : 0);
})();
