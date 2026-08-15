#!/usr/bin/env node
/**
 * PROVA DE CONTRASTE DOS DIÁLOGOS — o `casca-prova.js` mede as TELAS (o
 * `ORDEM` de `T.*`) e nunca abre um diálogo por cima delas: `portao()`,
 * `erro()` e `confirmar()` nascem de um EVENTO (toque, erro de rede), não de
 * navegação — e por isso o fiscal existente nunca os viu. Foi assim que o
 * "Sim" do portão perigo no modo claro ficou 1,96:1 (reprovado) INVISÍVEL
 * até a medição manual de 15/08: nenhum portão de CI jamais abriu aquele
 * diálogo pra medir.
 *
 *     node scripts/prova-contraste-dialogos.js
 *
 * Abre o MOCK direto (`docs/mockups/logistica2.0/logistica-2.0.html` — é a
 * FONTE; `portao()`/`erro()`/`confirmar()` moram nele, sem precisar da ponte
 * nem do injetor), nos 2 modos de luz, e invoca:
 *   · portao() com tom `alerta` + `perigo:true` — a MESMA chamada que
 *     `confirmarLimparDia` (30-verbos-rota.js) faz pro "Tem certeza que
 *     deseja cancelar?" — é o diálogo real onde o 1,96:1 foi medido.
 *   · erro() — o cartão de "Não deu pra iniciar a rota".
 *   · confirmar() — o "Retirar da rota de hoje?".
 *
 * Pra cada texto visível dentro do diálogo (a ÚLTIMA `.tela`, mesma lei do
 * `portao()`/`avisar()` — camada morta não é a que o motorista vê), mede
 * WCAG contra o fundo VERDADEIRO: sobe a árvore compondo ALPHA (um fundo
 * translúcido — o `.scrim` dos wraps, .42 de alfa — não é uma cor final, é
 * uma MISTURA com o que está atrás) e, achando gradiente, testa TODAS as
 * paradas — quem decide é a pior.
 *
 * Piso: 4,5:1 pra texto normal, 3,0:1 pra texto grande (≥24px, ou ≥18,66px
 * com peso ≥700) — a mesma régua WCAG que `casca-prova.js` já usa.
 *
 * Sai 1 (reprova) se sobrar QUALQUER texto abaixo do piso. RED-FIRST: rodar
 * este fiscal ANTES dos fixes de CSS do LOTE 2 tem que acusar o "Sim" do
 * portão perigo (claro) em 1,96:1 — é a vacina do bloco 5.
 */
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
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

// Os TRÊS diálogos que este fiscal existe pra cobrir. `alvo` é o seletor do
// wrap que cada função cria (a mesma marca que `handleBack`/a ponte usam pra
// achar a camada de cima — ver `POR_CIMA` em 00-nucleo.js).
const DIALOGOS = [
  {
    nome: 'portao-perigo',
    alvo: '.portao-wrap',
    // A MESMA chamada de `confirmarLimparDia` (30-verbos-rota.js) — o "Sim"
    // do Cancelar, tom alerta + perigo:true. É onde o 1,96:1 foi medido.
    invocar: () => window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Tem certeza que deseja cancelar?',
      sub: 'Isso apaga a rota carregada. Não dá pra desfazer.',
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas', perigo: true,
    }),
  },
  { nome: 'erro', alvo: '.erro-wrap', invocar: () => window.erro() },
  { nome: 'confirmar', alvo: '.conf-wrap', invocar: () => window.confirmar() },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(urlDe(MOCK));
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: PALCO });
  // O boot normal passa pela ABERTURA e só chega na Rota depois de um
  // relógio (ver `aberturaSaiu`, ~7574) — este fiscal não testa a splash,
  // então pula direto, mesmo truque do `casca-prova.js` (`atual=t;pintar()`).
  await page.evaluate(() => { anterior = atual; atual = 'rota'; pintar(false); });
  await page.waitForTimeout(100);

  const medicoes = [];
  for (const modo of ['escuro', 'claro']) {
    await page.evaluate((m) => {
      document.documentElement.dataset.luz = m;
      document.documentElement.dataset.luzEscolha = m;
      if (typeof pintar === 'function') pintar(false);
    }, modo);
    await page.waitForTimeout(50);

    for (const dlg of DIALOGOS) {
      // camada limpa: nenhum wrap de uma rodada anterior sobrevive.
      await page.evaluate(() => {
        document.querySelectorAll('.portao-wrap,.erro-wrap,.conf-wrap').forEach((n) => n.remove());
      });
      await page.evaluate(dlg.invocar);
      await page.waitForTimeout(50);

      const linhas = await page.evaluate(({ alvo, dlgNome, modoAtual }) => {
        // A ÚLTIMA `.tela` — mesma lei do `portao()`: camada morta não é a
        // que o motorista vê (`querySelectorAll` devolve em ordem do DOM).
        const camadas = document.querySelectorAll('#app .tela');
        const camada = camadas.length ? camadas[camadas.length - 1] : null;
        const wrap = camada ? camada.querySelector(alvo) : null;
        if (!wrap) return [];

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
        // As "paradas" de fundo de UM elemento: gradiente → todas as cores
        // dele (quem julga usa a PIOR, lá embaixo); cor sólida → ela mesma.
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
        // 🔴 UM FUNDO TRANSLÚCIDO NÃO É UMA COR — É UMA MISTURA (a regra
        // deste fiscal). Sobe a árvore acumulando CAMADA por CAMADA, da mais
        // distante (a base, papel branco por padrão) até a mais perto do
        // texto, compondo alpha a cada uma. Encontrar mais de uma camada com
        // gradiente é raro nesta casa (o botão já é a camada mais rasa,
        // normalmente sobre um card 100% opaco) — o produto cartesiano
        // continua pequeno na prática.
        function fundosVerdadeiros(elInicial) {
          const camadasEl = [];
          let n = elInicial;
          while (n && n !== document.documentElement) {
            const ps = paradasDoElemento(n);
            if (ps.length) {
              camadasEl.push(ps);
              if (ps.every((p) => p.a >= 0.999)) break; // opaco: nada atrás importa
            }
            n = n.parentElement;
          }
          let acumulado = [{ r: 255, g: 255, b: 255, a: 1 }]; // papel, se nada opaco aparecer
          for (let i = camadasEl.length - 1; i >= 0; i -= 1) {
            const proximo = [];
            for (const base of acumulado) for (const parada of camadasEl[i]) proximo.push(compositar(parada, base));
            acumulado = proximo;
          }
          return acumulado;
        }

        const fora = [];
        wrap.querySelectorAll('*').forEach((el) => {
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
            dialogo: dlgNome, modo: modoAtual, txt: txt.slice(0, 40),
            cor, fundos: fundosVerdadeiros(el), grande,
          });
        });
        return fora;
      }, { alvo: dlg.alvo, dlgNome: dlg.nome, modoAtual: modo });

      medicoes.push(...linhas);
      // fecha o diálogo antes do próximo, senão o `erro()`/`confirmar()`
      // (que usam a PRIMEIRA `.tela`) empilhariam wrap em cima de wrap.
      await page.evaluate(() => {
        document.querySelectorAll('.portao-wrap,.erro-wrap,.conf-wrap').forEach((n) => n.remove());
      });
    }
  }

  await browser.close();

  // --- veredito ---------------------------------------------------------
  console.log(`=== CONTRASTE DOS DIÁLOGOS (${medicoes.length} textos medidos, 2 modos × 3 diálogos) ===`);
  const resultado = medicoes.map((t) => {
    const r = Math.min(...t.fundos.map((f) => razaoDe(t.cor, f))); // pior parada/camada
    const piso = t.grande ? 3 : 4.5;
    return { ...t, r, piso, ok: r >= piso };
  });
  const porDialogo = {};
  for (const m of resultado) {
    const k = `${m.modo}/${m.dialogo}`;
    (porDialogo[k] = porDialogo[k] || []).push(m);
  }
  let reprovou = 0;
  for (const [k, lista] of Object.entries(porDialogo)) {
    const ruins = lista.filter((m) => !m.ok);
    console.log(`\n${k} — ${lista.length} textos, ${ruins.length} reprovados`);
    for (const m of lista) {
      const marca = m.ok ? 'OK ' : 'X  ';
      console.log(`  ${marca}"${m.txt}" ${m.r.toFixed(2)}:1 (piso ${m.piso}${m.grande ? ', grande/ícone' : ''})`);
    }
    reprovou += ruins.length;
  }
  if (erros.length) console.log('\nerros de página:', erros.join(' | '));
  console.log(`\n${reprovou ? `✗ ${reprovou} texto(s) abaixo do piso` : '✓ tudo dentro do piso WCAG'}`);
  process.exit(reprovou ? 1 : 0);
})();
