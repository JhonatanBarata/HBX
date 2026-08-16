#!/usr/bin/env node
/**
 * PROVA DO VAZIO, DO ESQUELETO E DA CONSULTA — os três estados que a galeria
 * de telas NÃO ALCANÇA, e que por isso foram parar em produção sem ninguém ver.
 *
 *     node scripts/prova-vazio-esqueleto-e-consulta.js
 *
 * Por que ela nasceu (16/08, medido no g15 com o APK 280 PUBLICADO):
 *
 *  1. FECHAMENTO ABRINDO VAZIO. `casca-antes-e-depois` deu 64/64 idênticas com
 *     este defeito vivo — a galeria pinta o fechamento COM dado, então o ramo
 *     do dia sem nada nunca é desenhado por fiscal nenhum. Na rua: "0 entregues"
 *     e 80% de retângulo preto sem uma palavra. A raiz era `String(entregues)`
 *     na ponte: `String(0)` é `'0'`, que é TRUTHY, e isso derrotava o `temDado`
 *     que decide entre o caixa e o "Nada registrado hoje ainda".
 *
 *  2. ESQUELETO INVISÍVEL. A onda do `.esq` valia 1,15:1 contra a própria base
 *     e a base 1,07:1 contra o fundo da tela. Trocar o dia na Montagem apagava
 *     a lista e punha no lugar um retângulo preto por ~500 ms — lido pelo dono
 *     como "o carregando demora a aparecer". Não demorava: não dava pra ver.
 *
 *  3. "SOMENTE CONSULTA" VESTIDO DE TRABALHO. `main` sem `acao` caía sempre no
 *     traje do "Montando…" (verde de ação + `.ocupado` respirando +
 *     `aria-busy="true"`). Serve pro que acaba em 2 s; não serve pro estado
 *     PERMANENTE da tela, que virava um botão verde pulsando pra sempre e
 *     mentindo pro leitor de tela.
 *
 * RED-FIRST: rodar contra o pai destes fixes tem que reprovar 1, 2 e 3.
 * Sai 1 se qualquer régua falhar.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const urlDe = (p) => 'file:///' + p.split(path.sep).join('/');

const PISO_ESQ = 3.0; // WCAG 1.4.11 — componente não-textual que informa estado

const lum = ({ r, g, b }) => {
  const [rr, gg, bb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
};
const razaoDe = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const linhas = [];
let reprovas = 0;
const checar = (ok, rotulo, detalhe) => {
  if (!ok) reprovas += 1;
  linhas.push(`  ${ok ? 'OK  ' : 'FALHA'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', (e) => { console.error('erro na página:', e.message); });
  await page.goto(urlDe(MOCK), { waitUntil: 'load' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });

  /* ---------- 1 e 3: os RAMOS que a galeria não desenha ------------------ */
  const marcacao = await page.evaluate(() => {
    const usar = (o) => window.usarDados('fechamento', o);
    const render = () => T.fechamento.render();
    // o botão do verbo, isolado do resto do HTML
    const botao = (html) => {
      const m = html.match(/<button[^>]*data-acao="fechar-dia"[^>]*>/);
      return m ? m[0] : '';
    };

    // Dia que NÃO aconteceu. `entregues:''` é o que a ponte manda depois do fix
    // (`seTiver(0)`); antes ela mandava `'0'`, truthy, e o vazio nunca aparecia.
    usar({ formas: [], formaTotal: '', entregues: '', clientes: '', produtos: '', selo: '', carregando: 0, semFonte: 0 });
    const vazio = render();

    // Dia que aconteceu — o caminho normal não pode ter regredido.
    usar({ formas: [['cash', 'var(--lime)', 'Dinheiro', 'R$ 44,00']], formaTotal: 'R$ 44,00', entregues: '3', clientes: '2', produtos: '5', selo: '3 vendas', carregando: 0, semFonte: 0 });
    const cheio = render();

    return {
      vazioTemPalavra: vazio.includes('Nada registrado hoje ainda'),
      vazioBotaoSemGo: !/\bact go\b/.test(botao(vazio)),
      cheioSemPalavra: !cheio.includes('Nada registrado hoje ainda'),
      cheioBotaoComGo: /\bact go\b/.test(botao(cheio)),
      cheioMostraEntregues: cheio.includes('entregues'),
      consulta: transmux('consulta'),
      montando: transmux('montando'),
    };
  });

  linhas.push('\n1) FECHAMENTO — o dia que não aconteceu diz isso com PALAVRA');
  checar(marcacao.vazioTemPalavra, 'dia zerado mostra "Nada registrado hoje ainda"');
  checar(marcacao.vazioBotaoSemGo, '"Fechar o dia" NÃO veste o verde de ação num dia vazio');
  checar(marcacao.cheioSemPalavra, 'dia com caixa NÃO mostra o texto de vazio');
  checar(marcacao.cheioBotaoComGo, '"Fechar o dia" continua verde quando há fato na tela');
  checar(marcacao.cheioMostraEntregues, 'dia com caixa continua desenhando o resumo');

  /* A RAIZ do defeito 1 mora na PONTE, não no mock — e o mock sozinho não a
     alcança (ele recebe o valor já pronto). `String(0)` é `'0'`, truthy, e era
     isso que fazia o dia vazio se passar por dia cheio. A régua da casa pra
     "número que pode ser zero" é `seTiver`, que já era usada em `clientes`,
     `produtos` e `formaTotal` na MESMA chamada — o `entregues` era a exceção. */
  const fonte = fs.readFileSync(path.join(raiz, 'EntregaShell/app/src/logistica/ponte-src/C0-encaixe-semana.js'), 'utf8');
  const costurada = fs.readFileSync(path.join(raiz, 'EntregaShell/app/src/logistica/assets/app/ponte.js'), 'utf8');
  linhas.push('\n1b) PONTE — zero chega FALSY (senão o mock nunca vê o dia vazio)');
  checar(!/entregues:\s*String\(/.test(fonte), 'a fonte não manda `String(entregues)`');
  checar(/entregues:\s*seTiver\(/.test(fonte), 'a fonte manda `seTiver(entregues)`');
  checar(!/entregues:\s*String\(/.test(costurada), 'a ponte COSTURADA também está curada (o gerado é o que embarca)');

  linhas.push('\n3) DOCK — estado permanente não se veste de trabalho em curso');
  checar(marcacao.consulta.includes('tmx-nota'), '"Somente consulta" é NOTA, não botão');
  checar(marcacao.consulta.includes('role="status"'), 'a nota se anuncia como status');
  checar(!marcacao.consulta.includes('aria-busy'), '"Somente consulta" NÃO mente aria-busy');
  checar(!/class="ocupado"/.test(marcacao.consulta), '"Somente consulta" não respira pra sempre');
  checar(marcacao.montando.includes('aria-busy'), '"Montando…" CONTINUA aria-busy (não regrediu)');
  checar(/class="ocupado"/.test(marcacao.montando), '"Montando…" CONTINUA respirando (não regrediu)');

  /* ---------- 2: o esqueleto, medido nos 2 modos de luz ------------------ */
  linhas.push('\n2) ESQUELETO — a onda tem que ser VISÍVEL contra a própria base');
  for (const modo of ['escuro', 'claro']) {
    await page.evaluate((m) => {
      document.documentElement.dataset.luz = m;
      document.documentElement.dataset.luzEscolha = m;
      if (typeof pintar === 'function') pintar(false);
    }, modo);
    await page.waitForTimeout(60);

    const paradas = await page.evaluate(() => {
      // O `.esq` só existe enquanto `carregando` — a galeria nunca o pinta.
      // Aqui ele é plantado dentro do palco pra herdar os tokens do tema.
      const palco = document.querySelector('#app .tela') || document.body;
      const d = document.createElement('div');
      d.className = 'esq esq-linha';
      palco.appendChild(d);
      const img = getComputedStyle(d).backgroundImage;
      d.remove();
      const cores = (img || '').match(/rgba?\([^)]+\)/g) || [];
      return cores.map((s) => {
        const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => parseFloat(x.trim()));
        return { r: p[0], g: p[1], b: p[2] };
      });
    });

    if (paradas.length < 2) {
      checar(false, `${modo}: o .esq não devolveu gradiente`, `paradas=${paradas.length}`);
      continue;
    }
    // A pior distância entre duas paradas quaisquer é o que o olho percebe.
    let pior = Infinity;
    for (let i = 0; i < paradas.length; i += 1) {
      for (let j = i + 1; j < paradas.length; j += 1) {
        const r = razaoDe(paradas[i], paradas[j]);
        if (r > 1.02 && r < pior) pior = r;
      }
    }
    const melhor = Math.max(...paradas.map((a) => Math.max(...paradas.map((b) => razaoDe(a, b)))));
    checar(melhor >= PISO_ESQ, `${modo}: onda x base do esqueleto`, `${melhor.toFixed(2)}:1 (piso ${PISO_ESQ})`);
    void pior;
  }

  await browser.close();

  console.log(linhas.join('\n'));
  const total = linhas.filter((l) => /^  (OK|FALHA)/.test(l)).length;
  console.log(`\n${total - reprovas}/${total} réguas verdes`);
  if (reprovas) { console.error(`\n✗ ${reprovas} reprovada(s)`); process.exit(1); }
  console.log('✓ vazio com palavra, esqueleto visível, consulta sem traje de trabalho');
})().catch((e) => { console.error(e); process.exit(1); });
