"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Mantém os atributos de tema do <html> em navegação SPA, espelhando o
// comportamento dos HTMLs do handoff (docs/TEMAS):
// - rotas corporate: data-theme="corporate"; escuro padrão; claro via
//   data-theme-mode="light" (persistido em hbx:corporate-mode).
// - /workspace (friendly): sem data-theme; claro padrão; escuro via
//   data-theme-mode="dark" (persistido em hbx:friendly-mode).
// - rotas de auth (/login, /reset-password, /confirm-email): seguem a
//   preferência hbx:ws-theme (friendly|corporate) — ordem do dono.
// - "/" (landing): html puro como no template de marketing.

const AUTH_ROUTES = ["/login", "/register", "/reset-password", "/confirm-email"];

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
  const isWorkspace = pathname === "/workspace" || pathname.startsWith("/workspace/");
  const isMarketing = pathname === "/";
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`));
  try {
    if (isMarketing) {
      html.removeAttribute("data-theme");
      html.removeAttribute("data-theme-mode");
    } else if (isWorkspace) {
      applyFriendly(html);
    } else if (isAuth) {
      if (localStorage.getItem("hbx:ws-theme") === "friendly") applyFriendly(html);
      else applyCorporate(html);
    } else {
      applyCorporate(html);
    }
  } catch {
    // localStorage indisponível — mantém o padrão do markup
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
