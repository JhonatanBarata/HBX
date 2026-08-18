#!/usr/bin/env node
/**
 * PROVA DA DEMONSTRAÇÃO (17/08/2026).
 *
 *     node scripts/prova-demonstracao.js
 *
 * A demonstração mostra o app CHEIO — oito clientes, rota montada, caixa do dia
 * — pra quem acabou de instalar e não tem cliente nenhum. Ela roda inteira no
 * aparelho, e as três coisas que não podem falhar são estas:
 *
 *   1. NADA ESCREVE NO SERVIDOR. Nem o `rota/iniciar`, que DEBITA CRÉDITO de
 *      verdade. Um cliente conhecendo o app não pode gastar dinheiro pra ver a
 *      tela mexer, e não pode sujar a base com oito clientes de mentira.
 *   2. SAIR NÃO DEIXA VESTÍGIO. Depois de fechar, a tela é a de um app recém
 *      instalado — nenhum "Cliente 3", nenhum "R$", nenhuma parada.
 *   3. O ENDEREÇO É ANCORADO NO GPS, e sem GPS a demonstração não se oferece.
 *      Rota de outra cidade na cara de quem abriu pra conhecer é pior que
 *      demonstração nenhuma.
 *
 * A prova dirige o `ponte.js` DE VERDADE (a costura da fonte, regenerada na
 * primeira linha) contra um servidor dublado que conta TODA chamada que chega
 * nele. O ponto: com a demonstração no ar, a conta de escritas tem que ser
 * ZERO — o dublê é a rede, e o que ele registrar foi rede que aconteceu.
 */
const path = require('path');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/* Rio Claro/SP — um ponto qualquer, e é justamente esse o teste: a demonstração
   tem que se ancorar AQUI, não onde o molde foi escrito. */
const EU = { lat: -22.4149, lng: -47.5651 };

/* O dublê. Ele responde como um tenant VAZIO — que é o estado real de quem
   acabou de instalar — e guarda tudo que chegou. */
const PONTE = ({ hoje, clientes, exporParadas }) => {
  /* 🔴 EXPOR `window.PARADAS` MUDA O QUE A TELA MOSTRA — e por isso é uma
     opção, e não o padrão desta prova.
     A ponte escreve a lista em `window.PARADAS` QUANDO ELE JÁ EXISTE; senão cai
     no ramo da variável local do mock. No aparelho ele nunca existe, então vale
     sempre o segundo ramo — que é o que PINTA. Criar o global aqui empurraria a
     ponte pro primeiro ramo e a tela ficaria "Sem paradas hoje" com oito
     paradas carregadas: a prova mediria um app que não existe.
     Então: as cenas que medem a TELA rodam sem ele (como o aparelho); só a cena
     da ÂNCORA o liga, porque coordenada não se lê de tela nenhuma. */
  if (exporParadas) window.PARADAS = [];
  window.__chamadas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
  const antigo = window.HBX || {};
  window.HBX = Object.assign({}, antigo, {
    activateRoute() {}, stopRoute() {}, requestLocationPermission() {},
    info: () => ({ versionCode: 999, versionName: 'prova' }),
    cache: (() => {
      const m = new Map();
      return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
    })(),
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, String(caminho).split('?')[0]]);
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
      if (caminho.indexOf('/logistica/config') === 0) {
        return R({
          moduloFinanceiroAtivo: true, cobrancaSimples: false, raioChegadaM: 60,
          prospectorDisponivel: false, appModulosDesativados: '',
          suporteWhatsapp: '5519997024884', suporteEmail: 'suporte@hbx.test',
        });
      }
      // O TENANT VAZIO: é este total que decide se a demonstração se oferece.
      if (caminho.indexOf('/nucleo/clientes') === 0) return R({ total: clientes, items: [] });
      if (caminho.indexOf('/logistica/rota/continuidade') === 0) return R({ pendentes: [] });
      if (caminho.indexOf('/logistica/rota') === 0) {
        return R({ date: hoje, total: 0, routeStatus: 'SEM_ROTA', items: [], moduloFinanceiroAtivo: true });
      }
      if (caminho.indexOf('/logistica/tutorial') === 0) return R({ obrigatorioVisto: true });
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: 0, balance: 0 });
      return R({});
    },
  });
};

const ok = [];
const falhou = [];
const eh = (nome, cond, detalhe) => (cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`));

/* "A demonstração está no ar?" respondido pela TELA: o botão de SAIR só nasce
   com ela aberta (`T.tutorial` troca o verbo do cartão pelo estado). É a régua
   honesta — `DADOS` é `const` dentro do mock e virar global só pra prova ler
   seria abrir uma porta em produção pra fechar uma pergunta de teste. */
async function demoNaTela(p) {
  const antes = await p.evaluate(() => {
    const t = document.querySelectorAll('#app .tela');
    return t.length ? (t[t.length - 1].dataset.tela || '') : '';
  });
  await p.evaluate(() => window.ir('tutorial'));
  await p.waitForTimeout(450);
  const tem = await p.evaluate(() => !!document.querySelector('[data-acao="demo-sair"]'));
  if (antes) { await p.evaluate((v) => window.ir(v), antes); await p.waitForTimeout(300); }
  return tem;
}

async function abrirApp(browser, { comGps = true, clientes = 0, exporParadas = false } = {}) {
  const ctx = await browser.newContext(Object.assign(
    { viewport: { width: 412, height: 940 } },
    comGps
      ? { permissions: ['geolocation'], geolocation: { latitude: EU.lat, longitude: EU.lng, accuracy: 12 } }
      : {},
  ));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));
  await p.goto(APP);
  await p.waitForTimeout(400);
  await p.evaluate(PONTE, { hoje: HOJE, clientes, exporParadas });
  // 6 s cobre o relógio de 4,5 s da oferta automática com folga.
  await p.waitForTimeout(6200);
  return { ctx, p };
}

(async () => {
  /* 🔴 O GERADO PRIMEIRO: esta prova abre `assets/app/**`, que é SAÍDA da
     costura. Sem isto ela mediria o gerado de ontem. */
  regenerarGerados();
  const b = await chromium.launch();

  // ══════════════════════════════════════════════════════════════════════════
  // CENA 1 — tenant VAZIO com GPS: a demonstração se oferece sozinha e enche
  //          a tela, sem uma escrita sequer.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { ctx, p } = await abrirApp(b, { comGps: true, clientes: 0 });

    /* 🔴 QUEM RESPONDE "ESTÁ ABERTA?" É A TELA. `DADOS` é `const` dentro do
       mock — não é global, e não deve virar global só pra uma prova ler. O que
       existe de verdade é o botão que só nasce com a demonstração no ar. */
    const abriu = await demoNaTela(p);
    eh('1a · a demonstração abre sozinha pra quem tem 0 clientes', abriu, 'sem "Sair da demonstração" na tela Tutorial');

    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(900);
    const naTela = await p.evaluate(() => ({
      txt: ((document.querySelector('#app') || {}).textContent || '').split(/\s+/).join(' '),
    }));
    eh('1b · a tela ENCHE: 8 paradas na cara de quem abriu', /8\s*paradas/.test(naTela.txt),
      `tela="${naTela.txt.slice(0, 110)}"`);

    // 🔴 O CORAÇÃO: nem uma escrita saiu.
    const w1 = await p.evaluate(() => window.__chamadas.filter(([m]) => m !== 'GET'));
    eh('1d · ZERO escrita no servidor com a demonstração no ar',
      w1.length === 0, w1.map((c) => c.join(' ')).join(' · '));

    // 🔴 E O QUE COBRA: "Iniciar rota" é o verbo que DEBITA CRÉDITO.
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(400);
    const tocou = await p.evaluate(() => {
      const b1 = document.querySelector('[data-acao="montar"],[data-estado="montar"],[data-acao="iniciar"]');
      if (b1) { b1.click(); return true; }
      return false;
    });
    await p.waitForTimeout(2500);
    const w2 = await p.evaluate(() => window.__chamadas.filter(([m]) => m !== 'GET'));
    eh('1e · nem tocando em montar/iniciar (o verbo que DEBITA) sai escrita',
      w2.length === 0, `${tocou ? 'tocou' : 'botão não estava na tela'} · ${w2.map((c) => c.join(' ')).join(' · ')}`);

    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENA 1b — A ÂNCORA: as paradas nasceram AQUI, não onde o molde foi escrito.
  //           Única cena que expõe `window.PARADAS` (ver a nota no dublê).
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { ctx, p } = await abrirApp(b, { comGps: true, clientes: 0, exporParadas: true });
    const longe = await p.evaluate((eu) => {
      const R = 6371000;
      const rad = (g) => (g * Math.PI) / 180;
      return (window.PARADAS || []).map((x) => {
        const dLat = rad(x.lat - eu.lat);
        const dLng = rad(x.lng - eu.lng);
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(eu.lat)) * Math.cos(rad(x.lat)) * Math.sin(dLng / 2) ** 2;
        return Math.round(2 * R * Math.asin(Math.sqrt(a)));
      });
    }, EU);
    const maisLonge = longe.length ? Math.max(...longe) : -1;
    const maisPerto = longe.length ? Math.min(...longe) : -1;
    eh('1f · são 8 clientes, todos ancorados no MEU GPS (< 3 km)',
      longe.length === 8 && maisLonge < 3000 && maisLonge > 0,
      `n=${longe.length} · mais perto=${maisPerto} m · mais longe=${maisLonge} m`);
    /* E espalhados: oito pinos na mesma esquina não parecem um dia de trabalho,
       parecem um defeito. */
    eh('1g · e espalhados, não empilhados na mesma esquina', maisLonge - maisPerto > 500,
      `vão=${maisLonge - maisPerto} m`);
    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENA 2 — sair da demonstração não deixa vestígio.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { ctx, p } = await abrirApp(b, { comGps: true, clientes: 0 });
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(800);
    const antes = await p.evaluate(() => /8\s*paradas/.test(
      ((document.querySelector('#app') || {}).textContent || '').split(/\s+/).join(' ')));

    // a fotografia das escritas ANTES de sair = a janela inteira da demonstração
    const escritasNaDemo = await p.evaluate(() => window.__chamadas.filter(([m]) => m !== 'GET'));

    await p.evaluate(() => window.ir('tutorial'));
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      const b1 = document.querySelector('[data-acao="demo-sair"]');
      if (b1) b1.click();
    });
    await p.waitForTimeout(2800);

    const aindaAberta = await demoNaTela(p);
    const depois = await p.evaluate(() => ({
      paradas: (window.PARADAS || []).length,
      texto: (document.querySelector('#app') || {}).textContent || '',
    }));
    // A varredura de vestígio passa pelas TRÊS telas que a demonstração encheu.
    const varredura = await p.evaluate(async () => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const achados = [];
      for (const tela of ['rota', 'montagem', 'clientes']) {
        window.ir(tela);
        await espera(450);
        const t = (document.querySelector('#app') || {}).textContent || '';
        if (/Cliente\s\d/.test(t)) achados.push(`${tela}: nome de cliente`);
        if (/R\$\s*\d/.test(t)) achados.push(`${tela}: valor em reais`);
      }
      return achados;
    });

    eh('2a · a demonstração estava mesmo cheia antes de fechar', antes);
    eh('2b · fechou (o botão de sair não existe mais)', !aindaAberta);
    eh('2c · nenhuma parada sobrou', depois.paradas === 0, `paradas=${depois.paradas}`);
    eh('2d · nenhum "Cliente N" sobrou na tela em que ela fechou', !/Cliente\s\d/.test(depois.texto));
    eh('2e · varrendo rota, montagem e clientes: nenhum vestígio',
      varredura.length === 0, varredura.join(' · '));

    /* 🔴 A JANELA CERTA É "ENQUANTO ELA ESTEVE NO AR". Depois de sair, o app
       volta a ser o app de verdade — e o poll de recados dele É escrita
       legítima. Medir "zero escrita pra sempre" reprovaria o comportamento
       correto, que é o tipo de régua quebrada que esta casa já pagou. */
    eh('2f · nenhuma escrita saiu ENQUANTO a demonstração esteve no ar',
      escritasNaDemo.length === 0, escritasNaDemo.map((c) => c.join(' ')).join(' · '));

    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENA 3 — sem GPS não há demonstração (e ela não se oferece torta).
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { ctx, p } = await abrirApp(b, { comGps: false, clientes: 0 });
    eh('3a · sem GPS a demonstração não abre', !(await demoNaTela(p)));
    /* O cartão inteiro some — não é "botão desabilitado", é peça que não nasce:
       oferecer o que não tem como acontecer é o botão morto de sempre. */
    await p.evaluate(() => window.ir('tutorial'));
    await p.waitForTimeout(450);
    const temCartao = await p.evaluate(() => !!document.querySelector('[data-acao="demo-abrir"], [data-acao="demo-sair"]'));
    eh('3b · sem GPS o cartão nem se oferece na tela Tutorial', !temCartao);
    eh('3c · a tela continua a de um app vazio', (await p.evaluate(() => (window.PARADAS || []).length)) === 0);
    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENA 4 — quem JÁ TEM clientes nunca vê a demonstração por cima do dia dele.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { ctx, p } = await abrirApp(b, { comGps: true, clientes: 200 });
    eh('4a · com 200 clientes a demonstração NÃO abre sozinha', !(await demoNaTela(p)));
    const paradas = await p.evaluate(() => (window.PARADAS || []).length);
    eh('4b · o dia real dele fica intacto (rota vazia = rota vazia)', paradas === 0, `paradas=${paradas}`);
    await ctx.close();
  }

  const erros = [];
  await b.close();

  console.log('\n=== PROVA DA DEMONSTRAÇÃO ===');
  ok.forEach((t) => console.log('  ✓', t));
  falhou.forEach((t) => console.log('  ✗', t));
  erros.forEach((t) => console.log('  ⚠', t));
  const total = ok.length + falhou.length;
  console.log(`\n${ok.length}/${total} ${falhou.length ? '— REPROVADO' : '— tudo certo'}`);
  process.exit(falhou.length ? 1 : 0);
})().catch((e) => { console.error('a prova morreu:', e); process.exit(2); });
