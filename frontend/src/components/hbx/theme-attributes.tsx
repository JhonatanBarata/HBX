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
// ================================================================

// Peles selecionáveis. skeleton.css continua sendo a BASE de tokens (o
// contrato neutro que toda pele veste) — só não é uma opção do seletor.
export const PELES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "aurora", label: "Aurora" },
  { key: "ember", label: "Ember" },
  { key: "rose", label: "Rosé" },
  { key: "hbx-cyber", label: "Tema HBX" },
];

// Pele padrão quando não há preferência salva (mantém o boot do layout.tsx
// em sincronia se mudar).
export const DEFAULT_PELE = "aurora";

const PELE_KEY = "hbx:pele";
const MODE_KEY = "hbx:mode";

function applyPele(html: HTMLElement, key: string | null) {
  const valid = PELES.some(p => p.key === key) ? String(key) : DEFAULT_PELE;
  html.setAttribute("data-theme", valid);
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
  return document.documentElement.getAttribute("data-theme") || DEFAULT_PELE;
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
