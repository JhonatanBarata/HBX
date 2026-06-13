"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Mantém os atributos de tema do <html> em navegação SPA.
// REGRA DURA (FRONTEND.md, 12/06/2026): TEMA É SÓ PELE — um app, as mesmas
// telas; o tema é a preferência hbx:ws-theme (friendly|corporate) aplicada
// por atributo em TODAS as rotas (app e auth):
// - corporate: data-theme="corporate"; escuro padrão; claro via
//   data-theme-mode="light" (persistido em hbx:corporate-mode).
// - friendly: sem data-theme; claro padrão; escuro via
//   data-theme-mode="dark" (persistido em hbx:friendly-mode).
// - "/" (landing): html puro como no template de marketing.
// O antigo app paralelo /workspace foi MORTO na unificação (12/06/2026) —
// a rota é alias e redireciona para /dashboard.

function applyFriendly(html: HTMLElement) {
  html.removeAttribute("data-theme");
  if (localStorage.getItem("hbx:friendly-mode") === "dark") {
    html.setAttribute("data-theme-mode", "dark");
  } else {
    html.removeAttribute("data-theme-mode");
  }
}

function applyCorporate(html: HTMLElement) {
  html.setAttribute("data-theme", "corporate");
  if (localStorage.getItem("hbx:corporate-mode") === "light") {
    html.setAttribute("data-theme-mode", "light");
  } else {
    html.removeAttribute("data-theme-mode");
  }
}

export function applyThemeForPath(pathname: string) {
  const html = document.documentElement;
  const isMarketing = pathname === "/";
  try {
    if (isMarketing) {
      html.removeAttribute("data-theme");
      html.removeAttribute("data-theme-mode");
    } else if (localStorage.getItem("hbx:ws-theme") === "friendly") {
      applyFriendly(html);
    } else {
      applyCorporate(html);
    }
  } catch {
    // localStorage indisponível — mantém o padrão do markup
  }
}

// Modo claro/escuro do tema ATIVO, com a semântica de cada tema
// (corporate: claro = data-theme-mode="light"; friendly: escuro =
// data-theme-mode="dark") e persistência na chave do tema. Único ponto de
// escrita do modo — usado pelo Topbar e pelos controles de auth.
export function setThemeMode(theme: "corporate" | "friendly", mode: "light" | "dark") {
  const html = document.documentElement;
  if (theme === "corporate") {
    if (mode === "light") html.setAttribute("data-theme-mode", "light");
    else html.removeAttribute("data-theme-mode");
    try { localStorage.setItem("hbx:corporate-mode", mode); } catch { /* sem storage */ }
  } else {
    if (mode === "dark") html.setAttribute("data-theme-mode", "dark");
    else html.removeAttribute("data-theme-mode");
    try { localStorage.setItem("hbx:friendly-mode", mode); } catch { /* sem storage */ }
  }
}

// Troca de tema/modo com cross-fade suave (friendly/alto nível): aplica a
// classe temporária hbx-theme-anim e a remove sozinha — nunca deixa
// transição pendurada.
export function applyThemeSoft(mutate: () => void) {
  const html = document.documentElement;
  html.classList.add("hbx-theme-anim");
  mutate();
  window.setTimeout(() => html.classList.remove("hbx-theme-anim"), 500);
}

export function setFriendlyTheme(soft = true) {
  const run = () => {
    try {
      localStorage.setItem("hbx:ws-theme", "friendly");
      applyFriendly(document.documentElement);
    } catch { /* sem storage */ }
  };
  if (soft) applyThemeSoft(run); else run();
}

export function setCorporateTheme(soft = true) {
  const run = () => {
    try {
      localStorage.setItem("hbx:ws-theme", "corporate");
      applyCorporate(document.documentElement);
    } catch { /* sem storage */ }
  };
  if (soft) applyThemeSoft(run); else run();
}

export function ThemeAttributes() {
  const pathname = usePathname();
  useEffect(() => {
    applyThemeForPath(pathname || "/");
  }, [pathname]);
  return null;
}
