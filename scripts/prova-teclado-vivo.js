#!/usr/bin/env node
/**
 * PROVA DO TECLADO VIVO — repintar não pode fechar o teclado.
 *
 *     node scripts/prova-teclado-vivo.js
 *     node scripts/prova-teclado-vivo.js --sem-cura   (mede o defeito de volta)
 *
 * Dono, 09/08: *"abri o adicionar parada, fui buscar clientes por nome, o
 * teclado fecha depois de digitar 1 palavra, q erro nojento, e q vc consegue
 * repetir ele qualquer criação"*.
 *
 * O mecanismo: todo repinte do seam (`usarDados` → `pintar`) troca a CAMADA
 * INTEIRA, e o campo que estava sob o dedo morre junto. O Android fica sem quem
 * receba a próxima letra e recolhe o teclado. A cura mora na ENGINE
 * (`medirFoco`/`herdarFoco` no `pintar`), UMA vez, pra toda tela.
 *
 * Esta prova dirige a tela DE VERDADE (o `ponte.js` do APK) contra um servidor
 * dublado e digita como dedo digita — `keyboard.type`, que só chega onde tem
 * FOCO. Se o foco morre no repinte, a letra seguinte cai no chão e o texto sai
 * pela metade: é exatamente o defeito do dono, medido.
 *
 * 🔴 O MOCK.JS DO DISCO É GERADO, E SÓ O INJETOR O ESCREVE. Rodar o injetor
 * aqui seria publicar casca no meio de um teste. Então o servidor desta prova
 * REGENERA o `mock.js` em memória, a partir de
 * `docs/mockups/logistica2.0/logistica-2.0.html`, com as MESMAS 2 adaptações de
 * script que o `casca-injetar.js` faz — o que se prova é a FONTE, que é onde a
 * cura foi escrita.
 *
 * 🔴 O DUBLÊ ENTRA DEPOIS DO BOOT (mesma lei da `prova-meus-clientes.js`): o
 * `native.js` cria o `window.HBX` de verdade no load e engoliria um init script.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const APP = path.join(raiz, 'EntregaShell/app/src/logistica/assets/app');
// A prova negativa DA PROVA: tira a cura do script servido e o defeito do dono
// tem que voltar. Teste que passa dos dois jeitos não está medindo nada.
const SEM_CURA = process.argv.indexOf('--sem-cura') > -1;

/* ---------------------------------------------------------------------------
   O `mock.js` DA FONTE — as 2 adaptações de script do `casca-injetar.js`.
   (A folha e o `index.html` saem do disco: o que esta prova cobra é COMPORTA-
   MENTO da engine, não pintura.)
   --------------------------------------------------------------------------- */
function scriptDaFonte() {
  const fonte = fs.readFileSync(MOCK, 'utf8');
  const i = fonte.indexOf('<script>');
  const j = fonte.indexOf('</script>', i + 8);
  if (i < 0 || j < 0) throw new Error('[prova] não achei o <script> do mock');
  let js = fonte.slice(i + 8, j);
  // A barra lateral do visualizador não existe no aparelho: sem isto o boot
  // morre em `null.innerHTML` e a tela nasce PRETA.
  js = js.replace(/^function pintarRail\(\)\{[\s\S]*?\n\}$/m,
    'function pintarRail(){/* barra lateral do visualizador: não existe aqui */}');
  js = js.replace(/document\.getElementById\('phone'\)\.style\.setProperty\([^)]*\);?/g, '');
  if (SEM_CURA) {
    const antes = js;
    js = js.replace(/^\s*herdarFoco\(foco,nova\);\s*$/gm, '');
    if (js === antes) throw new Error('[prova] --sem-cura não achou a cura pra tirar');
  }
  return js;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.pbf': 'application/x-protobuf',
};
function servir() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/mock.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(scriptDaFonte());
      }
      const alvo = path.join(APP, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
      // Nada fora da pasta do app sai por aqui.
      if (!alvo.startsWith(APP) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
        res.writeHead(404); return res.end('nao');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(alvo));
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

/* ---------------------------------------------------------------------------
   O SERVIDOR DUBLADO. "A veia Maria" existe de propósito: o roteiro do dono é
   digitar NOME COM ESPAÇO, e um nome que só fecha na última palavra prova que a
   busca continuou filtrando depois de cada repinte.
   --------------------------------------------------------------------------- */
const PONTE = () => {
  window.__chamadas = [];
  const CLIENTES = [
    { id: 'c1', name: 'A veia Maria', isCliente: true, endereco: 'Rua 3a, 1354', cidade: 'Rio Claro', diasEntrega: [1] },
    { id: 'c2', name: 'Ademir', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', diasEntrega: [1] },
    { id: 'c3', name: 'Alfredo', isCliente: true, endereco: 'Rua 4-a, 93', cidade: 'Rio Claro', diasEntrega: [4] },
    { id: 'c4', name: 'Ana Alice', isCliente: true, endereco: 'Av. 28a, 507', cidade: 'Rio Claro', diasEntrega: [1] },
    { id: 'c5', name: 'Bar do Ze', isCliente: true, endereco: 'Rua 8 JP, 210', cidade: 'Rio Claro', diasEntrega: [6] },
  ];
  const PRODUTOS = [
    { id: 'p1', nome: 'Agua 20L retornavel', unidade: 'un', precoCatalogo: 21 },
    { id: 'p2', nome: 'Agua 10L', unidade: 'un', precoCatalogo: 14 },
    { id: 'p3', nome: 'Gas P13', unidade: 'un', precoCatalogo: 120 },
    { id: 'p4', nome: 'Vasilhame 20L', unidade: 'un', precoCatalogo: 45 },
  ];
  window.HBX = {
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      window.__chamadas.push([metodo, caminho]);
      if (caminho.indexOf('/nucleo/clientes') === 0) {
        const q = /query=([^&]*)/.exec(caminho);
        const alvo = q ? decodeURIComponent(q[1].replace(/\+/g, ' ')).toLowerCase() : '';
        const itens = alvo ? CLIENTES.filter((c) => c.name.toLowerCase().indexOf(alvo) >= 0) : CLIENTES;
        return Promise.resolve({ items: JSON.parse(JSON.stringify(itens)), total: itens.length });
      }
      if (caminho.indexOf('/logistica/produtos') === 0) return Promise.resolve(JSON.parse(JSON.stringify(PRODUTOS)));
      if (caminho.indexOf('/logistica/rota/planejar') === 0) return Promise.resolve({ stops: [] });
      if (caminho.indexOf('/logistica/rota') === 0) return Promise.resolve({ items: [], estado: 'montar' });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
  /* O CONTADOR DE REPINTES. Sem ele a prova não vale: "o foco sobreviveu" só
     diz alguma coisa se a camada REALMENTE foi trocada no meio da digitação.
     Conta nó `.tela` novo em `#app` — que é literalmente o que mata o campo. */
  window.__repintes = 0;
  new MutationObserver((ms) => {
    ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList && n.classList.contains('tela')) window.__repintes += 1;
    }));
  }).observe(document.getElementById('app'), { childList: true });
};

const ok = [];
const falhou = [];
const eh = (nome, cond, extra) => (cond ? ok : falhou).push(nome + (cond || !extra ? '' : '  → ' + extra));

(async () => {
  regenerarGerados();
  const servidor = await servir();
  const base = 'http://127.0.0.1:' + servidor.address().port + '/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));
  await p.goto(base);
  await p.waitForTimeout(900);
  await p.evaluate(PONTE);

  /** O estado que importa, sempre lido do jeito do dedo: quem está com o foco. */
  const estado = (sel) => p.evaluate((s) => {
    const a = document.activeElement;
    const el = document.querySelector(s);
    return {
      focado: !!(a && a.dataset && a.dataset.campo) ? a.dataset.campo : null,
      ehOMesmo: !!el && a === el,
      valor: el ? el.value : null,
      caret: el && el.selectionStart != null ? el.selectionStart : null,
      // `.cli` é a linha de cliente (Clientes e "Meus clientes"); `.prod`, a de
      // produto. São os dois desenhos de linha que estas telas usam.
      linhas: document.querySelectorAll('.cli,.prod').length,
      repintes: window.__repintes,
    };
  }, sel);

  /* O ROTEIRO DO DONO: palavra, pausa MAIOR que o debounce (350 ms), palavra.
     A pausa é o que garante que o repinte cai ENTRE as palavras — é ali que o
     teclado fechava. Digita tecla a tecla, como dedo. */
  const digitarComPausas = async (partes, pausa = 520) => {
    for (const parte of partes) {
      await p.keyboard.type(parte, { delay: 45 });
      await p.waitForTimeout(pausa);
    }
  };

  const roteiro = async (rotulo, sel, partes, esperado, minLinhas) => {
    await p.click(sel);
    const antes = await p.evaluate(() => window.__repintes);
    await digitarComPausas(partes);
    const t = await estado(sel);
    eh(rotulo + ': o campo REPINTOU no meio da digitacao', t.repintes > antes,
      'repintes=' + (t.repintes - antes));
    eh(rotulo + ': o teclado nao fecha (o foco continua no campo)', t.ehOMesmo === true,
      'focado=' + t.focado);
    eh(rotulo + ': o texto sai INTEIRO ("' + esperado + '")', t.valor === esperado,
      'valor=' + JSON.stringify(t.valor));
    if (minLinhas != null) {
      eh(rotulo + ': a lista filtrou', t.linhas === minLinhas, 'linhas=' + t.linhas);
    }
    return t;
  };

  // ---- 1) tela rapida, porta "Meus clientes" -------------------------------
  await p.evaluate(() => window.ir('rapida'));
  await p.waitForTimeout(700);
  await roteiro('rapida/Meus clientes', '[data-campo="rapida-cliente-busca"]',
    ['a', ' veia', ' maria'], 'a veia maria', 1);

  // ---- 2) tela Clientes ----------------------------------------------------
  await p.evaluate(() => window.ir('clientes'));
  await p.waitForTimeout(700);
  await roteiro('Clientes', '[data-campo="busca-cliente"]',
    ['a', ' veia', ' maria'], 'a veia maria', 1);

  // ---- 3) tela Produtos (repinta a CADA tecla, sem espera nenhuma) ---------
  await p.evaluate(() => window.ir('produtos'));
  await p.waitForTimeout(700);
  await roteiro('Produtos', '[data-campo="busca-produto"]',
    ['agua', ' 20', 'L'], 'agua 20L', 1);

  // ---- 4) campo de formulario do cadastro, com repinte do seam no meio -----
  // Aqui o repinte NÃO vem da digitação: vem do seam (o banner do GPS chegando).
  // É o caso do dono dito de outro jeito — "qualquer criação".
  await p.evaluate(() => window.ir('novocliente'));
  await p.waitForTimeout(500);
  await p.click('[data-campo="novo-nome"]');
  await p.keyboard.type('Maria Apareci', { delay: 40 });
  const repintesAntes = await p.evaluate(() => window.__repintes);
  await p.evaluate(() => window.usarDados('novocliente',
    { local: 'Local marcado aqui (12 m).', localOk: 1 }));
  await p.waitForTimeout(120);
  await p.keyboard.type('da', { delay: 40 });
  const t4 = await estado('[data-campo="novo-nome"]');
  eh('cadastro: o seam repintou no meio da digitacao', t4.repintes > repintesAntes);
  eh('cadastro: o foco sobrevive ao repinte do seam', t4.ehOMesmo === true, 'focado=' + t4.focado);
  eh('cadastro: o nome nao perde letra', t4.valor === 'Maria Aparecida', 'valor=' + JSON.stringify(t4.valor));

  // O CARETE é do dedo também: corrigir o MEIO da palavra e repintar não pode
  // jogar o cursor pro fim — a letra seguinte iria pro lugar errado.
  await p.evaluate(() => {
    const el = document.querySelector('[data-campo="novo-nome"]');
    el.focus(); el.setSelectionRange(5, 5);
  });
  await p.evaluate(() => window.usarDados('novocliente', { local: 'Local marcado, mas fraco (80 m).', localOk: 0 }));
  await p.waitForTimeout(120);
  await p.keyboard.type('na', { delay: 40 });
  const t5 = await estado('[data-campo="novo-nome"]');
  // "Maria Aparecida" com "na" enfiado na casa 5 = "Mariana Aparecida".
  eh('cadastro: o carete fica onde estava', t5.valor === 'Mariana Aparecida',
    'valor=' + JSON.stringify(t5.valor));

  // ---- 5) PROVA NEGATIVA: repinte sem campo focado nao inventa foco --------
  await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  const antesN = await p.evaluate(() => ({
    r: window.__repintes,
    ativo: document.activeElement === document.body ? 'body' : (document.activeElement || {}).tagName,
  }));
  await p.evaluate(() => window.usarDados('novocliente', { salvando: 1 }));
  await p.waitForTimeout(150);
  const depoisN = await p.evaluate(() => ({
    r: window.__repintes,
    ativo: document.activeElement === document.body ? 'body' : (document.activeElement || {}).tagName,
    campo: (document.activeElement || {}).dataset ? (document.activeElement || {}).dataset.campo || '' : '',
  }));
  eh('negativa: o repinte sem foco aconteceu', depoisN.r > antesN.r);
  eh('negativa: ninguem ganha foco fantasma', depoisN.ativo === antesN.ativo && !depoisN.campo,
    'ativo=' + depoisN.ativo + ' campo=' + depoisN.campo);

  await b.close();
  servidor.close();
  console.log('\n=== PROVA: o teclado sobrevive ao repinte' + (SEM_CURA ? '  [--sem-cura]' : '') + ' ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(falhou.length ? 1 : 0);
})();
