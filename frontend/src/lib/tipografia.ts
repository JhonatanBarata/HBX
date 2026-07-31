// ============================================================
// TIPOGRAFIA — o CONTRATO do painel de letras (o CSS mora em
// app/hbx-theme/typography.css).
//
// SÃO DOIS EIXOS, e só isso:
//   FONTE    — 3 famílias (as mesmas que o app já carrega no <head>)
//   TAMANHO  — 4 papéis (títulos, normal, legendas, micro) + o geral,
//              de 50% a 150% cada um
//
// QUEM MANDA (ordem do dono, 31/07): o painel é da casca PREMIUM. As
// cascas HBX e Corporativo respeitam a própria casca — este arquivo grava
// a preferência do jeito que a pessoa escolheu, e é o CSS que decide
// obedecer ou não (bloco [data-casca="modern"] do typography.css). Por
// isso aqui não existe `if (casca === ...)`: a regra é do CSS, não do JS,
// e assim ela não pode sair de sincronia com a folha.
//
// A preferência é do NAVEGADOR (localStorage), não do usuário no servidor:
// é ajuste de leitura da máquina em que a pessoa está, igual à casca.
//
// ATENÇÃO — ESTE ARQUIVO NÃO PODE IMPORTAR REACT: ele é importado pelo
// app/layout.tsx (Server Component) para gerar o boot inline. Mesma
// fronteira de lib/aparencia.ts.
// ============================================================

export const TIPOGRAFIA_STORAGE = "hbx:tipografia";
/** chave ANTIGA (escala única 100/110/120/130) — lida uma vez pra migrar. */
export const LEGACY_FONT_SCALE_STORAGE = "hbx:font-scale";
export const FONTE_ATTR = "data-fonte";

export const TAMANHO_MIN = 50;
export const TAMANHO_MAX = 150;
export const TAMANHO_PADRAO = 100;
export const TAMANHO_PASSO = 5;

export type PapelKey = "geral" | "titulo" | "normal" | "legenda" | "micro";

export type PapelDef = {
  key: PapelKey;
  label: string;
  /** custom property CRUA escrita no <html> (o CSS decide se lê). */
  prop: string;
};

/**
 * As linhas do painel, nesta ordem. "Tudo" primeiro porque é o que 90% das
 * pessoas querem (o antigo 100/110/120/130 virou isto, agora de 50 a 150);
 * os 4 papéis abaixo são o ajuste fino de quem quer título grande e legenda
 * pequena — ou o contrário.
 */
export const PAPEIS: readonly PapelDef[] = [
  { key: "geral", label: "Tudo", prop: "--fz-user-geral" },
  { key: "titulo", label: "Títulos", prop: "--fz-user-titulo" },
  { key: "normal", label: "Normal", prop: "--fz-user-normal" },
  { key: "legenda", label: "Legendas", prop: "--fz-user-legenda" },
  { key: "micro", label: "Micro", prop: "--fz-user-micro" },
];

export type FonteKey = "moderna" | "sistema" | "tecnica";

export type FonteDef = {
  key: FonteKey;
  label: string;
  /**
   * Marca que identifica a família ATIVA lendo --font-display do DOM. A lista
   * de famílias em si NÃO mora aqui: ela é o token --fonte-<key> do
   * typography.css, usado tanto pra vestir o app quanto pra escrever o chip
   * do painel na própria letra. Duas cópias da mesma fonte sairiam de
   * sincronia no dia em que uma trocasse.
   */
  marca: string;
};

/**
 * As 3 famílias. Nenhuma fonte nova entrou: são as que o <head> do
 * layout.tsx já baixa desde sempre, agora oferecidas de frente.
 */
export const FONTES: readonly FonteDef[] = [
  { key: "moderna", label: "Moderna", marca: "Plus Jakarta" },
  { key: "sistema", label: "Sistema", marca: "system-ui" },
  { key: "tecnica", label: "Técnica", marca: "Sora" },
];

export type Tamanhos = Record<PapelKey, number>;
export type Tipografia = {
  /** null = ninguém escolheu; a pele/tema continua mandando na letra. */
  fonte: FonteKey | null;
  tamanhos: Tamanhos;
};

export const TAMANHOS_PADRAO: Tamanhos = {
  geral: TAMANHO_PADRAO, titulo: TAMANHO_PADRAO, normal: TAMANHO_PADRAO,
  legenda: TAMANHO_PADRAO, micro: TAMANHO_PADRAO,
};

export const TIPOGRAFIA_PADRAO: Tipografia = { fonte: null, tamanhos: { ...TAMANHOS_PADRAO } };

/** Prende no intervalo e no passo — nada de 137,4%. */
export function resolveTamanho(valor: unknown): number {
  const n = Math.round(Number(valor) / TAMANHO_PASSO) * TAMANHO_PASSO;
  if (!Number.isFinite(n)) return TAMANHO_PADRAO;
  return Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, n));
}

export function resolveFonte(valor: unknown): FonteKey | null {
  return FONTES.some(f => f.key === valor) ? (valor as FonteKey) : null;
}

/** Multiplicador que o CSS entende (100% → "1"). */
export function multiplicador(pct: number): string {
  return (resolveTamanho(pct) / 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function ehPadrao(t: Tipografia): boolean {
  return t.fonte === null && PAPEIS.every(p => t.tamanhos[p.key] === TAMANHO_PADRAO);
}

// ---------------------------------------------------------------
// NAVEGADOR — daqui pra baixo só roda no cliente.
// ---------------------------------------------------------------

function ler(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}

/** O que está GUARDADO (com migração da escala única antiga). */
export function getTipografia(): Tipografia {
  const bruto = ler(TIPOGRAFIA_STORAGE);
  const tamanhos: Tamanhos = { ...TAMANHOS_PADRAO };
  let fonte: FonteKey | null = null;

  if (bruto) {
    try {
      const dado = JSON.parse(bruto) as Partial<Tipografia>;
      fonte = resolveFonte(dado?.fonte);
      for (const papel of PAPEIS) {
        const v = (dado?.tamanhos as Partial<Tamanhos> | undefined)?.[papel.key];
        if (v != null) tamanhos[papel.key] = resolveTamanho(v);
      }
    } catch { /* json torto = padrão */ }
  } else {
    // Migração: quem tinha 110/120/130 na escala única acha o mesmo aumento
    // na linha "Tudo" — a preferência da pessoa não se perde no deploy.
    const legado = Number(ler(LEGACY_FONT_SCALE_STORAGE));
    if (Number.isFinite(legado) && legado >= TAMANHO_MIN && legado <= TAMANHO_MAX) {
      tamanhos.geral = resolveTamanho(legado);
    }
  }
  return { fonte, tamanhos };
}

/** ESCRITA ÚNICA no <html>: as 5 props cruas + o atributo da família. */
export function aplicarTipografia(t: Tipografia) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  for (const papel of PAPEIS) {
    html.style.setProperty(papel.prop, multiplicador(t.tamanhos[papel.key]));
  }
  if (t.fonte) html.setAttribute(FONTE_ATTR, t.fonte);
  else html.removeAttribute(FONTE_ATTR);
}

function gravar(t: Tipografia) {
  try { localStorage.setItem(TIPOGRAFIA_STORAGE, JSON.stringify(t)); } catch { /* sem storage */ }
  try { localStorage.removeItem(LEGACY_FONT_SCALE_STORAGE); } catch { /* sem storage */ }
  aplicarTipografia(t);
}

export function setTamanho(papel: PapelKey, valor: number) {
  const atual = getTipografia();
  gravar({ ...atual, tamanhos: { ...atual.tamanhos, [papel]: resolveTamanho(valor) } });
}

export function setFonte(fonte: FonteKey | null) {
  gravar({ ...getTipografia(), fonte: resolveFonte(fonte) });
}

export function restaurarTipografia() {
  gravar({ fonte: null, tamanhos: { ...TAMANHOS_PADRAO } });
}

/**
 * O que está NA TELA — lido do DOM, que é a fonte da verdade (o storage pode
 * ter escolha que a casca atual não obedece). O tamanho vem das props cruas;
 * a família, de --font-display resolvida, pra o chip certo aparecer marcado
 * mesmo quando quem escolheu a letra foi o tema.
 */
export function getTipografiaAtiva(): Tipografia {
  if (typeof document === "undefined") return TIPOGRAFIA_PADRAO;
  const html = document.documentElement;
  const tamanhos: Tamanhos = { ...TAMANHOS_PADRAO };
  for (const papel of PAPEIS) {
    const bruto = html.style.getPropertyValue(papel.prop).trim();
    if (bruto) tamanhos[papel.key] = resolveTamanho(Number(bruto) * 100);
  }
  const salva = resolveFonte(html.getAttribute(FONTE_ATTR));
  if (salva) return { fonte: salva, tamanhos };

  const display = getComputedStyle(html).getPropertyValue("--font-display");
  const casada = FONTES.find(f => display.includes(f.marca));
  return { fonte: casada?.key ?? null, tamanhos };
}

/**
 * Boot síncrono no <head>: aplica a preferência antes da primeira pintura,
 * senão a página nasce 100% e "pula" pro tamanho escolhido. Gerado deste
 * mesmo registro — nada de segunda lista pra sair de sincronia.
 */
export function buildTipografiaBoot(): string {
  const props = PAPEIS.map(p => [p.key, p.prop] as const);
  return `(function(){try{`
    + `var h=document.documentElement,P=${JSON.stringify(props)};`
    + `var g=function(k){try{return localStorage.getItem(k);}catch(e){return null;}};`
    + `var raw=g(${JSON.stringify(TIPOGRAFIA_STORAGE)}),d=null;`
    + `try{d=raw?JSON.parse(raw):null;}catch(e){d=null;}`
    + `var t=(d&&d.tamanhos)||{};`
    + `if(!raw){var L=Number(g(${JSON.stringify(LEGACY_FONT_SCALE_STORAGE)}));`
    + `if(L>=${TAMANHO_MIN}&&L<=${TAMANHO_MAX}){t.geral=L;}}`
    + `for(var i=0;i<P.length;i++){var k=P[i][0],v=Number(t[k]);`
    + `if(!(v>=${TAMANHO_MIN}&&v<=${TAMANHO_MAX}))v=${TAMANHO_PADRAO};`
    + `h.style.setProperty(P[i][1],String(v/100));}`
    + `var f=d&&d.fonte;if(f===${JSON.stringify("moderna")}||f===${JSON.stringify("sistema")}||f===${JSON.stringify("tecnica")}){`
    + `h.setAttribute(${JSON.stringify(FONTE_ATTR)},f);}`
    + `}catch(e){}})();`;
}
