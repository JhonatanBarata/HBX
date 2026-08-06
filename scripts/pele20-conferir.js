#!/usr/bin/env node
/**
 * CONFERÊNCIA DA PELE 2.0 — a prova, não a impressão.
 *
 *     node scripts/pele20-conferir.js
 *
 * Duas perguntas, as duas MEDIDAS num navegador de verdade, nos DOIS modos
 * (escuro e claro), porque pele que só foi olhada num modo é pele meio provada:
 *
 *   A) O HTML da pele é IGUAL ao do mock? 33 telas, byte a byte. Esta é a
 *      única regra de aprovação que o dono cravou: "ficar idêntico o html
 *      gerado". Semelhança não conta.
 *
 *   B) Dá pra LER? Contraste de cada texto contra o fundo que ele realmente
 *      tem na tela — não contra o fundo que a folha diz ter. Gradiente é
 *      resolvido parada a parada e vale a PIOR delas: botão que só é legível
 *      no topo do degradê não é legível.
 *
 * Por que MEDIR e não ler o CSS: a cor final é decisão de CASCATA. O portão
 * anterior tentava achar "lima com tinta branca" lendo regra por regra e
 * reprovou três inocentes — duas do botão AZUL e uma que a regra seguinte já
 * sobrescrevia. Texto de folha não sabe quem venceu; o navegador sabe.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const PELE = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app');
const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');

const MODOS = ['escuro', 'claro'];

// A bancada: a MESMA casca do aparelho (pele20.css + pele20.js), sem nada do
// visualizador. É aqui que a pele é interrogada.
const BANCADA = `<!doctype html>
<html lang="pt-BR" data-luz="escuro">
<head><meta charset="utf-8">
<link rel="stylesheet" href="${urlDe(path.join(PELE, 'pele20.css'))}"></head>
<body><div id="app" class="app"></div>
<script src="${urlDe(path.join(PELE, 'pele20.js'))}"></script></body></html>`;

/**
 * Mede o contraste de TODO texto visível contra o fundo real.
 * Roda dentro da página (é o navegador que sabe quem venceu a cascata).
 */
const MEDIDOR = () => {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const razao = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const lerCor = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const sobrepor = (frente, fundo) =>
    frente.rgb.map((v, i) => Math.round(v * frente.a + fundo[i] * (1 - frente.a)));

  /**
   * 🔴 Parada translúcida NÃO é fundo: é véu por cima do que está embaixo. A
   * primeira versão pegava `rgba(47,126,247,.10)` do brilho azul do topo e
   * tratava como azul CHEIO — daí "Rota do motorista" aparecer com 1,51:1 num
   * lugar onde ninguém nunca viu problema.
   *
   * 🔴 E CAMADA É CAMADA. `background` com duas vírgulas no topo são DUAS
   * folhas empilhadas: a primeira por cima. Achatar as duas numa lista só fez
   * o `transparent` da de cima revelar o BRANCO da página em vez do azul-noite
   * da de baixo — e o logotipo branco apareceu com 1:1. Alarme falso dos dois
   * lados esconde o alarme certo; por isso a pilha é respeitada.
   */
  const camadasDe = (bgImage) => {
    if (!bgImage || bgImage === 'none') return [];
    // Corte por vírgula de TOPO (as de dentro dos parênteses são do gradiente).
    const camadas = []; let nivel = 0, atual = '';
    for (const ch of bgImage) {
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) { camadas.push(atual); atual = ''; continue; }
      atual += ch;
    }
    if (atual.trim()) camadas.push(atual);
    return camadas.map((c) => [...c.matchAll(/rgba?\([^)]+\)/g)].map((m) => lerCor(m[0])).filter(Boolean))
      .filter((paradas) => paradas.length);
  };

  /** O fundo REAL: compõe a pilha de fora pra dentro, camada por camada. */
  const fundosDe = (el) => {
    let base = [255, 255, 255];
    const pilha = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      pilha.push(cs);
      const c = lerCor(cs.backgroundColor);
      const camadas = camadasDe(cs.backgroundImage);
      // Só para de subir quando o fundo é OPACO de verdade e sem véu por cima.
      if (c && c.a >= 0.999 && !camadas.some((l) => l.some((p) => p.a < 0.999))) { base = c.rgb; break; }
    }
    const enxugar = (lista) => {
      const vistos = new Set();
      return lista.filter((c) => { const k = c.join(','); if (vistos.has(k)) return false; vistos.add(k); return true; });
    };
    let candidatos = [base];
    for (let i = pilha.length - 1; i >= 0; i--) {
      const cs = pilha[i];
      const c = lerCor(cs.backgroundColor);
      if (c && c.a > 0.004) candidatos = candidatos.map((f) => sobrepor(c, f));
      // A ÚLTIMA camada é a de baixo: pinta primeiro, e as de cima vêm por cima.
      const camadas = camadasDe(cs.backgroundImage);
      for (let k = camadas.length - 1; k >= 0; k--) {
        const novos = [];
        // Cada parada sobre cada candidato: o texto pode calhar em qualquer
        // ponto do degradê, então TODOS os pontos entram na conta.
        candidatos.forEach((f) => camadas[k].forEach((p) => novos.push(sobrepor(p, f))));
        candidatos = enxugar(novos);
      }
    }
    return enxugar(candidatos);
  };

  const achados = [];
  document.querySelectorAll('#app *').forEach((el) => {
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!texto) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.15) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    // Texto de SVG pinta com `fill`, não com `color` — ler `color` aqui media a
    // cor herdada e acusava rótulo de mapa que na tela está com outra tinta.
    const naSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    const tinta = lerCor(naSvg ? cs.fill : cs.color);
    if (!tinta) return;
    const fundos = fundosDe(el);
    const tintaSobre = (f) => sobrepor({ rgb: tinta.rgb, a: tinta.a * Number(cs.opacity || 1) }, f);
    const pior = fundos.reduce((min, f) => Math.min(min, razao(tintaSobre(f), f)), Infinity);
    const px = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    const piso = grande ? 3 : 4.5;
    if (pior + 0.005 < piso) {
      achados.push({
        seletor: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
        texto: texto.slice(0, 42), razao: Math.round(pior * 100) / 100, piso, px,
      });
    }
  });
  return achados;
};

/**
 * FIO DE LISTA NO MODO CLARO. Um divisor é DICA, não régua: se ele bate mais
 * forte que o texto, é tinta de outro tema que ficou pra trás. Foi assim que
 * cinco listas atravessaram a virada com `rgba(26,39,64,.95)` — discreto no
 * escuro, risco quase preto no cartão branco.
 */
const MEDIDOR_FIO = () => {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const lerCor = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const achados = [];
  document.querySelectorAll('#app *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.borderBottomWidth) < 0.3) return;
    // 🔴 DIVISOR é borda de BAIXO SOZINHA. Sem este filtro o portão acusava a
    // bolinha do número da parada e o ponto âmbar do motivo — contorno de cor
    // da marca, escolha de desenho, não sobra de tema. Portão que reprova
    // desenho legítimo é portão que o dono aprende a ignorar.
    if (['borderTopWidth', 'borderLeftWidth', 'borderRightWidth'].some((p) => parseFloat(cs[p]) > 0.05)) return;
    const fio = lerCor(cs.borderBottomColor);
    if (!fio || fio.a < 0.05) return;
    let fundo = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = lerCor(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.999) { fundo = c.rgb; break; }
    }
    if (!fundo) return;
    const misturado = fio.rgb.map((v, i) => Math.round(v * fio.a + fundo[i] * (1 - fio.a)));
    const r = razao(misturado, fundo);
    if (r > 7) {
      achados.push({ seletor: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0] : ''), razao: Math.round(r * 100) / 100 });
    }
  });
  return achados;
};

(async () => {
  if (!fs.existsSync(path.join(PELE, 'pele20.css'))) {
    throw new Error('[conferir] pele não gerada — rode: node scripts/pele20-gerar.js');
  }
  const bancadaPath = path.join(require('os').tmpdir(), 'hbx-pele20-bancada.html');
  fs.writeFileSync(bancadaPath, BANCADA);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 } });
  const pMock = await ctx.newPage();
  const pPele = await ctx.newPage();
  const erros = [];
  pMock.on('pageerror', (e) => erros.push(`mock: ${e.message}`));
  pPele.on('pageerror', (e) => erros.push(`pele: ${e.message}`));

  await pMock.goto(urlDe(MOCK));
  await pPele.goto(urlDe(bancadaPath));

  const temPele = await pPele.evaluate(() => !!(window.HBX20 && window.HBX20.T));
  if (!temPele) throw new Error(`[conferir] a pele não subiu na bancada. ${erros.join(' | ') || '(sem erro de página)'}`);

  const chaves = await pMock.evaluate(() => Object.keys(T));
  console.log(`[conferir] telas no mock: ${chaves.length}`);

  let iguais = 0, diferentes = [];
  const contraste = {};
  const fiosGrossos = [];

  for (const modo of MODOS) {
    await pMock.evaluate((m) => { document.documentElement.dataset.luz = m; }, modo);
    await pPele.evaluate((m) => { document.documentElement.dataset.luz = m; }, modo);

    // ---- A) HTML idêntico -------------------------------------------------
    for (const k of chaves) {
      const a = await pMock.evaluate((key) => T[key].render(), k);
      const b = await pPele.evaluate((key) => window.HBX20.T[key].render(), k);
      if (a === b) { iguais++; continue; }
      const i = [...a].findIndex((ch, n) => ch !== b[n]);
      diferentes.push(`${modo}/${k} (1ª diferença no caractere ${i}: mock «${a.slice(Math.max(0, i - 30), i + 30)}» ≠ pele «${b.slice(Math.max(0, i - 30), i + 30)}»)`);
    }

    // ---- B) Contraste medido ---------------------------------------------
    const ruins = [];
    for (const k of chaves) {
      await pPele.evaluate((key) => {
        const app = document.getElementById('app');
        app.innerHTML = '';
        const camada = document.createElement('div');
        camada.className = 'tela';
        camada.innerHTML = window.HBX20.T[key].render();
        app.appendChild(camada);
      }, k);
      const achados = await pPele.evaluate(MEDIDOR);
      achados.forEach((a) => ruins.push({ tela: k, ...a }));
      if (modo === 'claro') {
        const fios = await pPele.evaluate(MEDIDOR_FIO);
        fios.forEach((f) => fiosGrossos.push({ tela: k, ...f }));
      }
    }

    // 🔴 E AS PEÇAS QUE NÃO SÃO TELA. Portão, confirmação, erro e aviso não
    // saem de `T[k].render()` — nascem por cima, na hora. Foi exatamente aí
    // que moravam os três defeitos achados em 06/08 (o "Entendi" branco no
    // lima e o "Atualizar" branco no branco). Peça que só aparece em cima de
    // outra também precisa ser medida, senão o portão mede só o que é fácil.
    const sobrepostas = await pPele.evaluate(() => {
      const P = window.HBX20;
      return { portoes: Object.keys(P.PORTOES || {}), avisos: Object.keys(P.AVISOS || {}) };
    });
    const camadas = [
      ...sobrepostas.portoes.map((k) => ['portao', k]),
      ...sobrepostas.avisos.map((k) => ['aviso', k]),
      ['confirmar', ''], ['erro', ''],
    ];
    for (const [tipo, arg] of camadas) {
      await pPele.evaluate(([t, a]) => {
        const P = window.HBX20;
        const app = document.getElementById('app');
        app.innerHTML = '';
        const camada = document.createElement('div');
        camada.className = 'tela';
        camada.innerHTML = P.T.rota.render();
        app.appendChild(camada);
        if (t === 'portao') P.portao(a);
        else if (t === 'aviso') P.avisar(a);
        else if (t === 'confirmar') P.confirmar();
        else if (t === 'erro') P.erro();
      }, [tipo, arg]);
      const achados = await pPele.evaluate(MEDIDOR);
      // Só o que a peça sobreposta trouxe — a tela de baixo já foi medida.
      achados.filter((a) => /portao|conf|erro|aviso|recado|acoes|principal|azul|perigo/.test(a.seletor))
        .forEach((a) => ruins.push({ tela: `${tipo}:${arg || '—'}`, ...a }));
    }
    contraste[modo] = ruins;
  }

  await browser.close();

  const total = chaves.length * MODOS.length;
  console.log(`\n=== A) HTML idêntico ao mock (${MODOS.join(' + ')}) ===`);
  console.log(`${iguais}/${total} telas idênticas byte a byte`);
  diferentes.slice(0, 12).forEach((d) => console.log(`  ✗ ${d}`));

  console.log(`\n=== B) Contraste medido (WCAG AA: 4.5:1 normal · 3:1 grande) ===`);
  for (const modo of MODOS) {
    const r = contraste[modo];
    console.log(`  ${modo}: ${r.length} texto(s) abaixo do piso`);
    const porTela = {};
    r.forEach((x) => { (porTela[x.tela] = porTela[x.tela] || []).push(x); });
    Object.entries(porTela).slice(0, 14).forEach(([tela, xs]) => {
      console.log(`    ${tela} (${xs.length}):`);
      xs.slice(0, 4).forEach((x) => console.log(`      ${x.razao}:1 (piso ${x.piso}) ${x.px}px  ${x.seletor}  «${x.texto}»`));
    });
  }

  console.log(`\n=== C) Fio de lista no CLARO (divisor é dica, não régua: teto 7:1) ===`);
  if (!fiosGrossos.length) console.log('  nenhum fio escuro sobrou no modo claro');
  else {
    const porSeletor = {};
    fiosGrossos.forEach((f) => { porSeletor[f.seletor] = Math.max(porSeletor[f.seletor] || 0, f.razao); });
    Object.entries(porSeletor).forEach(([s, r]) => console.log(`  ✗ ${r}:1  ${s}`));
  }

  if (erros.length) { console.log('\n[conferir] erros de página:'); erros.forEach((e) => console.log('  ' + e)); }

  const reprovou = diferentes.length > 0;
  console.log(`\n[conferir] ${reprovou ? '✗ REPROVADO' : '✓ APROVADO'} na identidade do HTML.`);
  process.exit(reprovou ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
