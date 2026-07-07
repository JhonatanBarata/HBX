"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// ================================================================
// PELE — fonte única de aplicação de tema (AS 5 LEIS, FRONTEND.md).
// Pele = arquivo theme-<key>.css (tokens + camada de vestir) +
// entrada no registry abaixo + import no globals.css. NADA MAIS.
// Esqueleto = sem data-theme (base neutra do skeleton.css).
// Modo claro/escuro é GLOBAL e automático (hbx:mode →
// data-theme-mode na escada de tokens; telas não sabem do dark).
// Boot inline do layout.tsx espelha esta lógica — manter em sincronia.
//
// CASCAS (dono 07/07, aprovação 07/07 noite: "remover temas e cascas
// antigas, ficou perfeito os 4 novos"): a casca MODERN (fundo infinito +
// vidro, casca-modern.css) é a ÚNICA selecionável — as 4 opções clássicas
// saíram do seletor. Mecânica continua genérica: entrada com
// `casca: "modern"` aplica data-casca="modern" no <html> por cima do
// data-theme da COR base (`base`) — os temas "<Nome> Mod" reusam os tokens
// das peles de cor (theme-<base>.css segue vivo como fonte de token).
// ================================================================

export type Pele = {
  key: string;
  label: string;
  /** pele de COR cujos tokens este tema usa (default: a própria key) */
  base?: string;
  /** padrão de casca aplicado em data-casca */
  casca?: "modern";
};

// Peles selecionáveis (4 cores, todas na casca MODERN). skeleton.css continua
// sendo a BASE de tokens (o contrato neutro que toda pele veste) — só não é
// uma opção do seletor.
export const PELES: ReadonlyArray<Pele> = [
  { key: "aurora-mod", label: "Aurora Mod", base: "aurora", casca: "modern" },
  { key: "ember-mod", label: "Ember Mod", base: "ember", casca: "modern" },
  { key: "rose-mod", label: "Rosé Mod", base: "rose", casca: "modern" },
  { key: "hbx-cyber-mod", label: "Tema HBX Mod", base: "hbx-cyber", casca: "modern" },
];

// Pele padrão quando não há preferência salva (mantém o boot do layout.tsx
// em sincronia se mudar).
export const DEFAULT_PELE = "aurora-mod";

const PELE_KEY = "hbx:pele";
const MODE_KEY = "hbx:mode";

function applyPele(html: HTMLElement, key: string | null) {
  // Migração: chave clássica salva antes da remoção (aurora/ember/rose/
  // hbx-cyber ou noir) cai na variante Mod da mesma cor, senão no padrão.
  const pele = PELES.find(p => p.key === key)
    ?? PELES.find(p => p.key === `${key}-mod`)
    ?? PELES.find(p => p.key === DEFAULT_PELE)!;
  // data-theme = pele de COR (tokens); data-pele = a escolha do usuário
  // (o seletor destaca por ela); data-casca = padrão de casca (modern).
  html.setAttribute("data-theme", pele.base ?? pele.key);
  html.setAttribute("data-pele", pele.key);
  if (pele.casca === "modern") html.setAttribute("data-casca", "modern");
  else html.removeAttribute("data-casca");
}

export function applyThemeForPath(_pathname: string) {
  // 15/06: a landing "/" agora É o login (usa tokens + robô do tema), então
  // NÃO é mais "html puro" — herda data-theme + data-theme-mode como o resto,
  // senão o robô não sincroniza com o modo (fumaça branca sobre robô preto).
  const html = document.documentElement;
  try {
    applyPele(html, localStorage.getItem(PELE_KEY));
    const mode = localStorage.getItem(MODE_KEY);
    html.setAttribute("data-theme-mode", mode === "dark" ? "dark" : "light");
  } catch {
    html.setAttribute("data-theme-mode", "light");
  }
}

// Troca com cross-fade suave (classe temporária que se remove sozinha).
export function applyThemeSoft(mutate: () => void) {
  const html = document.documentElement;
  html.classList.add("hbx-theme-anim");
  mutate();
  window.setTimeout(() => html.classList.remove("hbx-theme-anim"), 2300);
}

// Troca de PELE na mesma tela — nunca navega.
export function setAppTheme(key: string) {
  applyThemeSoft(() => {
    try { localStorage.setItem(PELE_KEY, key); } catch { /* sem storage */ }
    applyPele(document.documentElement, key);
  });
}

export function getActivePele(): string {
  const html = document.documentElement;
  return html.getAttribute("data-pele") || html.getAttribute("data-theme") || DEFAULT_PELE;
}

// Escrita ÚNICA do modo claro/escuro.
export function setThemeMode(mode: "light" | "dark") {
  document.documentElement.setAttribute("data-theme-mode", mode);
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* sem storage */ }
}

export function ThemeAttributes() {
  const pathname = usePathname();
  useEffect(() => {
    applyThemeForPath(pathname || "/");
  }, [pathname]);
  return null;
}
