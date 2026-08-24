#!/usr/bin/env node
/**
 * PROVA DE CONTRASTE DAS PEÇAS DE VIDRO — o cromo que flutua POR CIMA DO MAPA.
 *
 *     node scripts/prova-contraste-vidro.js
 *     node scripts/prova-contraste-vidro.js --fonte <html>   (red-first)
 *
 * 🔴 POR QUE ELA EXISTE (24/08). O dono mandou a foto da tela de rota no tema
 * de DIA: o rodapé do mapa 2D saía PRETO, e dentro dele os números "restante ·
 * distância · chegada" mediam 1,03:1 — tinta `--ink` (#0f1726) sobre `--glass`
 * (#0b1322). Invisíveis. "Cancelar/Registrar/Finalizar" ficavam em 2,7:1.
 *
 * O defeito é velho e conhecido desta casa: `--glass` nasceu SÓ no bloco
 * escuro, e o modo claro se virava com uma LISTA de seletores escrita à mão
 * (`[data-luz="claro"] .map-chip, .plano-bar, ...`). O comentário daquela lista
 * dizia, com todas as letras, *"peça nova de vidro que não entrar aqui repete o
 * mesmo defeito"*. Repetiu: em 17/08 o rodapé do 2D ganhou o seletor
 * `.plano.com-rodape .gps-rodape` (3 classes) pra vestir o painel do 3D, e a
 * linha do claro que existia era `[data-luz="claro"] .gps-rodape` (1 atributo +
 * 1 classe). A de 3 classes ganha. O rodapé continuou de noite.
 *
 * E NENHUM FISCAL VIU. `casca-prova.js` mede as telas, mas só roda quando
 * alguém passa o nome de uma CASCA (é o fiscal de skin); `prova-contraste-
 * dialogos.js` mede o que nasce de evento (portão, erro, confirmar). Entre os
 * dois sobrou exatamente isto: o cromo permanente por cima do mapa, nos dois
 * modos de luz. É esse vão que este arquivo fecha.
 *
 * O QUE ELA MEDE. Abre o MOCK-FONTE (é ele o front — ver `casca-injetar.js`),
 * nas duas telas de mapa e nos dois modos, e para cada texto visível dentro de
 * uma peça de vidro calcula WCAG contra o fundo VERDADEIRO: sobe a árvore
 * compondo ALPHA (fundo translúcido não é uma cor, é uma mistura) e, achando
 * gradiente, testa todas as paradas — quem decide é a pior. Mesma máquina do
 * `prova-contraste-dialogos.js`, mesmo piso: 4,5:1 normal, 3,0:1 grande
 * (>=24px, ou >=18,66px com peso >=700).
 *
 * 🔴 E ELA EXIGE ACHAR AS PEÇAS. Fiscal que não encontra nada passa calado — é
 * a forma mais cara de reprovar. `OBRIGATORIAS` lista o que TEM que aparecer em
 * cada tela; peça ausente reprova a rodada.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const argFonte = process.argv.indexOf('--fonte');
const MOCK = argFonte > 0 && process.argv[argFonte + 1]
  ? path.resolve(process.argv[argFonte + 1])
  : path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const urlDe = (p) => 'file:///' + p.split(path.sep).join('/');

const PALCO = `*,*::before,*::after{animation:none!important;transition:none!important}`;

/** luminância relativa (WCAG) de {r,g,b} 0-255 */
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

/* AS PEÇAS DE VIDRO. Toda a família que lê `var(--glass)` na folha, mais os
   dois rodapés que vestem o mesmo painel. Quem inventar uma peça nova de vidro
   acrescenta a linha aqui — e aí o fiscal a segue sozinho nos dois modos. */
const VIDROS = [
  '.gps-rodape', '.plano-bar', '.map-chip', '.map-ctrl button',
  '.gps-manobra', '.next-card', '.gps-vel', '.gps-bussola', '.gps-redir',
  '.rota-continuidade', '.rota-continuidade-mais', '.emp-chip',
  '.plano-lado button', '.gps-lado button',
];

/* As duas telas de mapa. `estadoRota` já nasce 'rodando' no mock, então a Rota
   abre com o dia MONTADO — que é exatamente o estado do defeito (`.plano` ganha
   `com-rodape` e o rodapé flutuante nasce). */
const TELAS = [
  { id: 'rota', nome: 'Rota do dia (mapa 2D)', obrigatorias: ['.gps-rodape', '.plano-bar'] },
  { id: 'mapa', nome: 'Rota iniciada (dirigindo)', obrigatorias: ['.gps-rodape'] },
];

const MEDIR = ({ seletores, telaNome, modoAtual }) => {
  function toRGBA(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  // `topo` por cima de `fundo` — `fundo` já assumido OPACO no fim.
  function compositar(topo, fundo) {
    const a = topo.a + fundo.a * (1 - topo.a);
    const mix = (c) => (a <= 0 ? fundo[c]
      : (topo[c] * topo.a + fundo[c] * fundo.a * (1 - topo.a)) / a);
    return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
  }
  // Gradiente → todas as paradas (quem julga usa a pior); sólido → ele mesmo.
  function paradasDoElemento(el) {
    const cs = getComputedStyle(el);
    const img = cs.backgroundImage;
    if (img && img !== 'none' && img.indexOf('gradient') >= 0) {
      const cores = img.match(/rgba?\([^)]+\)/g);
      if (cores && cores.length) return cores.map(toRGBA).filter(Boolean);
    }
    const bg = toRGBA(cs.backgroundColor);
    if (bg && bg.a > 0) return [bg];
    return [];
  }
  // Um fundo translúcido não é uma cor, é uma MISTURA: sobe a árvore acumulando
  // camada por camada, da mais distante até a mais perto do texto.
  function fundosVerdadeiros(elInicial) {
    const camadas = [];
    let n = elInicial;
    while (n && n !== document.documentElement) {
      const ps = paradasDoElemento(n);
      if (ps.length) {
        camadas.push(ps);
        if (ps.every((p) => p.a >= 0.999)) break; // opaco: nada atrás importa
      }
      n = n.parentElement;
    }
    let acumulado = [{ r: 255, g: 255, b: 255, a: 1 }]; // papel, se nada opaco aparecer
    for (let i = camadas.length - 1; i >= 0; i -= 1) {
      const proximo = [];
      for (const base of acumulado) for (const parada of camadas[i]) proximo.push(compositar(parada, base));
      acumulado = proximo;
    }
    return acumulado;
  }

  const telas = document.querySelectorAll('#app .tela');
  const camada = telas.length ? telas[telas.length - 1] : document;
  const fora = [];
  const achadas = [];
  for (const sel of seletores) {
    const pecas = camada.querySelectorAll(sel);
    if (!pecas.length) continue;
    let visivel = 0;
    pecas.forEach((peca) => {
      const pcs = getComputedStyle(peca);
      // `.gps-redir` passa o dia em opacity:0 — peça apagada não é peça que o
      // motorista vê, e medi-la seria inventar reprovação.
      if (pcs.visibility === 'hidden' || pcs.display === 'none' || Number(pcs.opacity) < 0.35) return;
      const pr = peca.getBoundingClientRect();
      if (pr.width < 4 || pr.height < 4) return;
      visivel += 1;
      peca.querySelectorAll('*').forEach((el) => {
        const txt = [...el.childNodes]
          .filter((n) => n.nodeType === 3 && n.textContent.trim())
          .map((n) => n.textContent.trim()).join(' ');
        if (!txt) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.35) return;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        const cor = toRGBA(cs.color);
        if (!cor) return;
        const px = parseFloat(cs.fontSize);
        const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        fora.push({
          peca: sel, tela: telaNome, modo: modoAtual, txt: txt.slice(0, 40),
          cor, fundos: fundosVerdadeiros(el), grande,
        });
      });
    });
    if (visivel) achadas.push(sel);
  }
  return { textos: fora, achadas };
};

(async () => {
  if (!fs.existsSync(MOCK)) {
    console.log(`fonte não encontrada: ${MOCK}`);
    process.exit(1);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(urlDe(MOCK));
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: PALCO });

  const medicoes = [];
  const faltando = [];
  for (const modo of ['escuro', 'claro']) {
    for (const tela of TELAS) {
      // Pula a abertura e pinta a tela direto — mesmo truque do `casca-prova.js`
      // e do `prova-contraste-dialogos.js` (a splash não é assunto daqui).
      await page.evaluate(({ m, id }) => {
        document.documentElement.dataset.luz = m;
        document.documentElement.dataset.luzEscolha = m;
        /* eslint-disable no-undef */
        anterior = atual;
        atual = id;
        pintar(false);
        /* eslint-enable no-undef */
      }, { m: modo, id: tela.id });
      await page.waitForTimeout(150);

      const { textos, achadas } = await page.evaluate(
        MEDIR,
        { seletores: VIDROS, telaNome: tela.nome, modoAtual: modo },
      );
      medicoes.push(...textos);
      for (const obrig of tela.obrigatorias) {
        if (!achadas.includes(obrig)) faltando.push(`${modo}/${tela.nome}: ${obrig}`);
      }
    }
  }
  await browser.close();

  // --- veredito ---------------------------------------------------------
  console.log(`=== CONTRASTE DAS PEÇAS DE VIDRO (${medicoes.length} textos, 2 modos × ${TELAS.length} telas) ===`);
  const resultado = medicoes.map((t) => {
    const r = Math.min(...t.fundos.map((f) => razaoDe(t.cor, f))); // pior parada/camada
    const piso = t.grande ? 3 : 4.5;
    return { ...t, r, piso, ok: r >= piso };
  });
  const porGrupo = {};
  for (const m of resultado) {
    const k = `${m.modo} · ${m.tela}`;
    (porGrupo[k] = porGrupo[k] || []).push(m);
  }
  let reprovou = 0;
  for (const [k, lista] of Object.entries(porGrupo)) {
    const ruins = lista.filter((m) => !m.ok);
    console.log(`\n${k} — ${lista.length} textos, ${ruins.length} reprovados`);
    for (const m of ruins) {
      console.log(`  X  ${m.peca} "${m.txt}" ${m.r.toFixed(2)}:1 (piso ${m.piso}${m.grande ? ', grande' : ''})`);
    }
    if (!ruins.length) {
      const pior = lista.reduce((a, b) => (a.r <= b.r ? a : b), lista[0]);
      if (pior) console.log(`  OK pior: ${pior.peca} "${pior.txt}" ${pior.r.toFixed(2)}:1`);
    }
    reprovou += ruins.length;
  }
  if (faltando.length) {
    console.log(`\n✗ peça obrigatória não encontrada (fiscal cego):\n  ${faltando.join('\n  ')}`);
  }
  if (erros.length) console.log('\nerros de página:', erros.join(' | '));
  const falhou = reprovou || faltando.length;
  console.log(`\n${falhou ? `✗ ${reprovou} texto(s) abaixo do piso, ${faltando.length} peça(s) ausente(s)` : '✓ tudo dentro do piso WCAG'}`);
  process.exit(falhou ? 1 : 0);
})();
