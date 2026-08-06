#!/usr/bin/env node
/**
 * PROVA DA CASCA — a casca troca o ambiente INTEIRO e continua legível?
 *
 *     node scripts/casca-prova.js <nome>      (ex.: ferro)
 *
 * Duas medições, as duas num navegador de verdade, nas 33 telas × 2 modos:
 *
 *   A) MUDOU MESMO? Compara a pele com a casca contra a pele PADRÃO. Casca que
 *      não muda a tela é casca que não existe — e o número diz o alcance.
 *   B) CONTINUA LEGÍVEL? Mede contraste WCAG de todo texto visível contra o que
 *      está atrás dele. Ambiente novo não tem licença pra ficar ilegível — a lei
 *      da casa é que contraste se MEDE, nos dois modos.
 *
 * Roda o injetor sozinho (com e sem casca) e DEVOLVE a padrão no fim: o estado
 * commitado do repo é sempre a casca padrão.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const APP = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app/index.html');
const nome = process.argv[2];
if (!nome) { console.log('uso: node scripts/casca-prova.js <nome-da-casca>'); process.exit(1); }

const injetar = (casca) => execFileSync(
  process.execPath,
  [path.join(__dirname, 'casca-injetar.js'), ...(casca ? ['--casca', casca] : [])],
  { cwd: raiz },
).toString().trim().split('\n').filter((l) => l.includes('casca    :'))[0];

const PALCO = `*,*::before,*::after{animation:none!important;transition:none!important}`;
const urlDe = (p) => 'file:///' + p.split(path.sep).join('/');

/** luminância relativa (WCAG) de um rgb() já resolvido pelo navegador */
const lum = (c) => {
  const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razao = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });

  const fotografar = async (casca) => {
    injetar(casca);
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(urlDe(APP));
    await p.waitForTimeout(400);
    await p.addStyleTag({ content: PALCO });
    const telas = await p.evaluate(() => ORDEM);
    const fotos = {}; const textos = [];
    for (const modo of ['escuro', 'claro']) {
      for (const k of telas) {
        await p.evaluate(([t, m]) => {
          document.documentElement.dataset.luz = m;
          document.documentElement.dataset.luzEscolha = m;
          anterior = atual; atual = t; pintar(false);
        }, [k, modo]);
        await p.waitForTimeout(50);
        fotos[`${modo}/${k}`] = await p.locator('#app').screenshot();
        // texto visível × fundo real (sobe a árvore até achar cor opaca)
        textos.push(...(await p.evaluate(([t, m]) => {
          // 🔴 O FUNDO PODE SER DEGRADÊ. `backgroundColor` de botão com
          // linear-gradient é TRANSPARENTE — subir a árvore atrás de cor opaca
          // media a tinta contra o cartão de TRÁS e reprovava botão legítimo.
          // Aqui, achando degradê, devolvo TODAS as paradas de cor: quem julga
          // usa a pior. (Cor final é cascata; cascata se mede.)
          const fundosDe = (el) => {
            let n = el;
            while (n && n !== document.documentElement) {
              const cs = getComputedStyle(n);
              const img = cs.backgroundImage;
              if (img && img !== 'none') {
                const paradas = img.match(/rgba?\([^)]+\)/g);
                if (paradas && paradas.length) return paradas;
              }
              const bg = cs.backgroundColor;
              if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return [bg];
              n = n.parentElement;
            }
            return ['rgb(255,255,255)'];
          };
          const fora = [];
          document.querySelectorAll('#app .tela *').forEach((el) => {
            const txt = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
            if (!txt) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.35) return;
            // texto pintado pelo FUNDO (marca com degradê recortado) não tem
            // "cor de tinta": medir isso é medir transparente contra o cartão.
            if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') return;
            // rótulo dentro de SVG (mapa) é desenho, não texto de interface.
            if (el.closest('svg')) return;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return;
            const px = parseFloat(cs.fontSize);
            const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
            fora.push({ onde: `${m}/${t}`, txt: txt.slice(0, 28), cor: cs.color, fundos: fundosDe(el), grande });
          });
          return fora;
        }, [k, modo])));
      }
    }
    await p.close();
    return { fotos, textos, erros };
  };

  const padrao = await fotografar(null);
  const casca = await fotografar(nome);

  // --- A) mudou mesmo? ------------------------------------------------------
  const chaves = Object.keys(padrao.fotos);
  const mudadas = chaves.filter((k) => !padrao.fotos[k].equals(casca.fotos[k]));
  console.log(`=== A) A CASCA "${nome}" TROCA O AMBIENTE? ===`);
  console.log(`  ${mudadas.length}/${chaves.length} telas×modos mudaram de cara`);
  const paradas = chaves.filter((k) => !mudadas.includes(k));
  if (paradas.length) console.log(`  ⚠️ não mudaram: ${paradas.join(', ')}`);

  // --- B) continua legível? -------------------------------------------------
  // 🔴 SEPARAR O QUE A CASCA PIOROU do que a PADRÃO já tinha. Sem isso eu
  // atribuiria à casca defeito herdado (o mock tem sub-AA conhecidos, com
  // decisão do dono pendente) — e um portão que acusa inocente se aprende a
  // ignorar.
  const medir = (lista) => {
    const fora = new Map();
    for (const t of lista) {
      const r = Math.min(...t.fundos.map((f) => razao(t.cor, f)));  // pior parada do degradê
      const piso = t.grande ? 3 : 4.5;
      if (r < piso) fora.set(`${t.onde}|${t.txt}`, { ...t, r: r.toFixed(2), piso });
    }
    return fora;
  };
  const foraPadrao = medir(padrao.textos);
  const foraCasca = medir(casca.textos);
  const novos = [...foraCasca.entries()].filter(([k]) => !foraPadrao.has(k));
  const herdados = [...foraCasca.keys()].filter((k) => foraPadrao.has(k));
  const curados = [...foraPadrao.keys()].filter((k) => !foraCasca.has(k));

  console.log(`\n=== B) CONTINUA LEGÍVEL? (WCAG AA, ${casca.textos.length} textos medidos) ===`);
  console.log(`  herdados da padrão: ${herdados.length}  ·  curados pela casca: ${curados.length}`);
  const ruins = novos;
  if (!novos.length) console.log('  ✓ a casca não criou NENHUM texto abaixo do piso');
  else {
    console.log(`  ✗ a casca PIOROU ${novos.length} textos:`);
    novos.slice(0, 40).forEach(([, x]) => console.log(`     ${x.onde} "${x.txt}" ${x.r}:1 (piso ${x.piso})`));
  }
  if (casca.erros.length) console.log('\nerros de página:', casca.erros.join(' | '));

  injetar(null); // o repo volta pra casca padrão SEMPRE
  console.log('\n[prova] pele devolvida à casca padrão.');
  await browser.close();
  process.exit(mudadas.length === chaves.length && !ruins.length ? 0 : 1);
})();
