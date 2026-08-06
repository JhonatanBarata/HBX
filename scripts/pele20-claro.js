#!/usr/bin/env node
/**
 * MODO CLARO DA PELE 2.0 — derivado da casca escura, dentro do MOCK.
 *
 * O dono pediu modo claro; o mock nasceu só escuro (185 cores cravadas em hex,
 * 96 distintas, contra 13 tokens). Pintar o claro à mão seria 96 decisões
 * soltas — e a primeira cor esquecida vira texto invisível numa tela que
 * ninguém abriu ainda. Então o claro é DERIVADO por regra, sobre a casca que
 * já existe, e a regra fica escrita aqui pra poder ser discutida e corrigida.
 *
 * AS REGRAS (por matiz, não por tentativa):
 *   1. SUPERFÍCIE (azul-chumbo, matiz 195-250, pouca saturação): inverte a
 *      luminosidade. Painel escuro vira painel claro, e a hierarquia entre eles
 *      se preserva — o que era mais fundo continua mais fundo.
 *   2. TEXTO (a mesma família, mas já claro): vira escuro na mesma proporção.
 *   3. MARCA (limão, azul, âmbar, roxo, vermelho): o TOM é intocado — verde da
 *      HBX continua verde da HBX. Só a luminosidade cai o bastante pra ler em
 *      cima de branco, porque limão #9ede2a sobre branco é 1.5:1 e some.
 *   4. Sombra preta vira sombra suave: no claro, sombra preta suja.
 *
 * Rode: node scripts/pele20-claro.js   (escreve no MOCK; depois rode o gerador)
 */
const fs = require('fs');
const path = require('path');

const MOCK = path.join(__dirname, '..', 'docs/mockups/logistica2.0/logistica-2.0.html');
const MARCA = '/* ==== MODO CLARO (gerado por scripts/pele20-claro.js) ==== */';

// ---------------------------------------------------------------------------
// cor
// ---------------------------------------------------------------------------
const paraHsl = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let s = 0, h = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
};
const paraHex = ({ h, s, l }) => {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const b2 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + b2(r) + b2(g) + b2(b);
};

const ehSuperficie = ({ h, s }) => (h >= 195 && h <= 250 && s < 62) || s < 12;

// Contraste WCAG — usado DENTRO da conversão, não só no portão do fim: é ele
// que decide onde cada cor de marca para de escurecer.
const luminancia = (hex) => {
  const v = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** O papel do app no claro: é contra ele que todo texto é medido. */
const PAPEL = '#eaeef5';

// 🔴 A MESMA COR NÃO PODE VIRAR A MESMA COISA NOS DOIS PAPÉIS. Limão #9ede2a
// clareado pra 46% dá ~2:1 sobre branco — some como TEXTO, mas serve como
// FUNDO. Então a conversão pergunta em que propriedade a cor está:
//   `color:`  → escurece de verdade (teto 32%), porque vai ser LIDO;
//   fundo/borda/sombra → só o bastante pra não estourar.
// Sem esta separação o modo claro nasce bonito e ilegível, que é o pior dos
// dois — ninguém abre um chamado de "cor feia", abrem de "não consigo ler".
function clarear(hex, papel) {
  const c = paraHsl(hex);
  // 🔴 FUNDO ESCURO É FUNDO, MESMO TINGIDO DE MARCA. Primeira versão só tratava
  // como superfície o azul-chumbo; então `#151f0d` (o verde quase preto atrás
  // do chip "Fila"/"Chip dia"/"Chegou") caía na regra de MARCA, que só escurece
  // — e no claro esses chips viraram tarjas pretas. Visto na tela do g15, não
  // deduzido. Agora: qualquer cor ESCURA usada como fundo/borda é superfície e
  // inverte, guardando o tom (o chip de limão continua esverdeado, mas claro).
  if (papel !== 'texto' && c.l < 32) {
    return paraHex({ h: c.h, s: Math.min(c.s, 46), l: Math.max(100 - c.l - 6, 82) });
  }
  if (ehSuperficie(c)) {
    // Regra 1 e 2: inverte a luminosidade, segurando o topo pra branco puro não
    // achatar a diferença entre cartão e fundo.
    const l = 100 - c.l;
    if (papel === 'texto') return paraHex({ h: c.h, s: Math.min(c.s, 40), l: Math.min(l, 34) });
    return paraHex({ h: c.h, s: Math.min(c.s, 34), l: c.l < 55 ? Math.min(l, 97) : Math.max(l, 12) });
  }
  // Regra 3: marca mantém o TOM — verde da HBX continua verde da HBX. Só a
  // luminosidade cede, e ela cede ATÉ MEDIR 4.5:1 sobre o papel do app: teto
  // fixo é chute, e o chute reprovou o limão em 3.37:1. Desce de 1 em 1 e para
  // no primeiro que passa — assim a cor fica a mais viva que ainda dá pra ler.
  if (papel !== 'texto') return paraHex({ h: c.h, s: Math.max(c.s, 40), l: Math.min(c.l, 46) });
  for (let l = Math.min(c.l, 46); l >= 8; l--) {
    const tentativa = paraHex({ h: c.h, s: Math.max(c.s, 40), l });
    if (contraste(tentativa, PAPEL) >= 4.5) return tentativa;
  }
  return paraHex({ h: c.h, s: Math.max(c.s, 40), l: 8 });
}

/** Reescreve as cores de UM corpo de regra, respeitando o papel de cada uma. */
function clarearCorpo(corpo) {
  return corpo.split(';').map(decl => {
    const dp = decl.indexOf(':');
    if (dp < 0) return decl;
    const prop = decl.slice(0, dp).trim().toLowerCase();
    // `color` puro e `-webkit-text-fill-color` são texto. `border-color` não:
    // borda é desenho, não leitura.
    const papel = (prop === 'color' || prop.endsWith('text-fill-color') || prop === 'caret-color')
      ? 'texto' : 'fundo';
    // Normaliza #fff/#000 antes: o hex de 3 dígitos passava batido e o logo
    // branco continuava branco no claro (sumia no papel). Visto na tela.
    return decl
      .replace(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])\b/g, (m, r, g, b) => `#${r}${r}${g}${g}${b}${b}`)
      .replace(/#[0-9a-fA-F]{6}\b/g, m => clarear(m.toLowerCase(), papel));
  }).join(';');
}

// ---------------------------------------------------------------------------
// escopo — prefixa os seletores sem quebrar @media/@keyframes
// ---------------------------------------------------------------------------
function escopar(css, prefixo) {
  // 🔴 COMENTÁRIO NÃO É SELETOR. O que vem antes de um `{` era tratado como
  // seletor cru — e a casca é cheia de comentário explicativo COM VÍRGULA.
  // Resultado: `split(',')` picava a frase e enfiava o prefixo no meio do
  // texto ("no ar,html:not([data-luz=...]) a que sai"), o comentário deixava de
  // fechar e a REGRA SEGUINTE saía sem prefixo — foi assim que a pastilha do
  // menu ativo ficou azul-escura no claro. Fora os comentários antes de tudo.
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const saida = [];
  let i = 0;
  while (i < css.length) {
    const abre = css.indexOf('{', i);
    if (abre < 0) break;
    const sel = css.slice(i, abre).trim();
    // @keyframes: os passos (0%, to) não são seletores — copia inteiro, só
    // renomeia, senão o prefixo entraria em "from{" e mataria a animação.
    if (/^@(keyframes|font-face|property)/.test(sel)) {
      let d = 1, j = abre + 1;
      while (j < css.length && d > 0) { if (css[j] === '{') d++; if (css[j] === '}') d--; j++; }
      i = j; continue;
    }
    if (/^@media/.test(sel)) {
      let d = 1, j = abre + 1;
      while (j < css.length && d > 0) { if (css[j] === '{') d++; if (css[j] === '}') d--; j++; }
      const dentro = escopar(css.slice(abre + 1, j - 1), prefixo);
      if (dentro.trim()) saida.push(sel + '{' + dentro + '}');
      i = j; continue;
    }
    const fecha = css.indexOf('}', abre);
    const corpo = css.slice(abre + 1, fecha);
    // Só vale reescrever a regra se ela FALA de cor.
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(corpo)) {
      const novoSel = sel.split(',').map(s => {
        s = s.trim();
        if (!s) return '';
        // `.app` é a própria raiz: vira `[data-luz] .app`? não — ele É o alvo.
        return s.startsWith('html') ? s.replace(/^html/, prefixo) : prefixo + ' ' + s;
      }).filter(Boolean).join(',');
      const novoCorpo = clarearCorpo(corpo)
        .replace(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/g, (m, a) => `rgba(20,32,54,${Math.min(+a, 0.16).toFixed(2)})`);
      saida.push(novoSel + '{' + novoCorpo + '}');
    }
    i = fecha + 1;
  }
  return saida.join('\n');
}

// ---------------------------------------------------------------------------
const fonte = fs.readFileSync(MOCK, 'utf8');
const cssInteiro = fonte.split('<style>')[1].split('</style>')[0];
// só a casca do app; o cromo do visualizador não tem modo claro
const escuro = cssInteiro.slice(cssInteiro.indexOf('.app{\n  position:relative;width:412px'));
const jaTem = fonte.indexOf(MARCA);
const base = jaTem < 0 ? fonte : fonte.slice(0, jaTem) + fonte.slice(fonte.indexOf('</style>', jaTem));

const claro = [
  '',
  MARCA,
  '/* Derivado da casca escura por regra de matiz — ver o script. O app segue o',
  '   sistema por padrão (prefers-color-scheme) e o dono pode cravar no dedo com',
  '   data-luz="claro" | "escuro". */',
  escopar(escuro, '[data-luz="claro"]'),
  '@media (prefers-color-scheme: light){',
  escopar(escuro, 'html:not([data-luz="escuro"])'),
  '}',
  '',
].join('\n');

fs.writeFileSync(MOCK, base.replace('</style>', claro + '</style>'));

const regras = (claro.match(/\{/g) || []).length;
console.log(`[claro] ${regras} regras geradas`);

// A LEI DA CASA: contraste se MEDE, nos dois modos. Fundo de referência = o
// papel do app no claro (#eaeef5, o que o --bg vira). Texto abaixo de 4.5:1
// derruba a geração — melhor não ter modo claro que ter um ilegível.
const razao = contraste;
const fundo = PAPEL;
console.log(`[claro] papel do app: ${fundo}`);
let reprovou = 0;
for (const [nome, cor] of [['ink', '#eef3fb'], ['ink-2', '#93a3bf'], ['ink-3', '#7889a6'],
                           ['limão', '#9ede2a'], ['azul', '#2f7ef7'], ['âmbar', '#f5a524']]) {
  const novo = clarear(cor, 'texto');
  const r = razao(novo, fundo);
  const ok = r >= 4.5;
  if (!ok) reprovou++;
  console.log(`   ${nome.padEnd(6)} ${cor} -> ${novo}  contraste ${r.toFixed(2)}:1 ${ok ? 'OK' : '🔴 REPROVA'}`);
}
if (reprovou) throw new Error(`[claro] ${reprovou} cor(es) de texto abaixo de 4.5:1 — modo claro ilegível não sai daqui`);
console.log('[claro] contraste medido nos 2 modos: aprovado');
