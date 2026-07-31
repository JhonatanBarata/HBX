// ============================================================
// ESCALA TIPOGRÁFICA — fonte única, independente de casca/tema.
//
// 100% preserva exatamente a tipografia atual. As demais opções só
// alteram a escala das letras; o CSS compensa as raras medidas de layout
// que também usam rem para que largura, altura e espaçamento não mudem.
// ============================================================

export const FONT_SCALE_STORAGE = "hbx:font-scale";
export const FONT_SCALE_ATTR = "data-font-scale";
export const FONT_SCALE_DEFAULT = 100;
export const FONT_SCALE_OPTIONS = [100, 110, 120, 130] as const;

export type FontScale = (typeof FONT_SCALE_OPTIONS)[number];

export function resolveFontScale(value: string | number | null | undefined): FontScale {
  const parsed = Number(value);
  return FONT_SCALE_OPTIONS.includes(parsed as FontScale)
    ? (parsed as FontScale)
    : FONT_SCALE_DEFAULT;
}

/** Boot síncrono no <head>: aplica a preferência antes da primeira pintura. */
export function buildFontScaleBoot(): string {
  return `(function(){try{`
    + `var h=document.documentElement,k=${JSON.stringify(FONT_SCALE_STORAGE)},`
    + `a=${JSON.stringify(FONT_SCALE_ATTR)},o=${JSON.stringify(FONT_SCALE_OPTIONS)},`
    + `d=${JSON.stringify(FONT_SCALE_DEFAULT)},v=d;`
    + `try{var s=Number(localStorage.getItem(k));if(o.indexOf(s)>=0)v=s;}catch(e){}`
    + `h.setAttribute(a,String(v));`
    + `}catch(e){}})();`;
}

/** Escala ativa lida do DOM, que é a fonte da verdade do que está na tela. */
export function getFontScaleAtiva(): FontScale {
  if (typeof document === "undefined") return FONT_SCALE_DEFAULT;
  return resolveFontScale(document.documentElement.getAttribute(FONT_SCALE_ATTR));
}

/** Persiste para todas as telas/temas deste navegador e aplica sem recarregar. */
export function setFontScale(scale: FontScale) {
  if (typeof document === "undefined") return;
  const resolved = resolveFontScale(scale);
  try { localStorage.setItem(FONT_SCALE_STORAGE, String(resolved)); } catch { /* sem storage */ }
  document.documentElement.setAttribute(FONT_SCALE_ATTR, String(resolved));
}
