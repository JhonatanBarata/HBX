"use client";

// Controles de tema das telas de auth (login/reset/confirm) — ordem do dono:
// "no login dá pra mudar entre corporativo e friendly também".
// ◐ alterna claro/escuro do tema atual; a chavinha alterna Friendly ↔
// Corporativo (persistido em hbx:ws-theme) com cross-fade suave.

import { useSyncExternalStore } from "react";

import { applyCorpMode, subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setCorporateTheme, setFriendlyTheme } from "@/components/hbx/theme-attributes";

function subscribeToThemeAttr(callback: () => void) {
  const obs = new MutationObserver(callback);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-mode"] });
  return () => obs.disconnect();
}

export function AuthThemeControls() {
  const theme = useSyncExternalStore(
    subscribeToThemeAttr,
    () => (document.documentElement.getAttribute("data-theme") === "corporate" ? "corporate" : "friendly"),
    () => "corporate",
  );
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );

  const corp = theme === "corporate";
  // corporate: escuro padrão (claro = light); friendly: claro padrão (escuro = dark)
  const isDark = corp ? modeAttr !== "light" : modeAttr === "dark";

  function flipMode() {
    if (corp) {
      // corporativo = transição simples (instantânea, como o handoff)
      const next = isDark ? "light" : "dark";
      applyCorpMode(next);
      try { localStorage.setItem("hbx:corporate-mode", next); } catch { /* sem storage */ }
    } else {
      // friendly = cross-fade de alto nível
      const next = isDark ? "light" : "dark";
      applyThemeSoft(() => {
        if (next === "dark") document.documentElement.setAttribute("data-theme-mode", "dark");
        else document.documentElement.removeAttribute("data-theme-mode");
      });
      try { localStorage.setItem("hbx:friendly-mode", next); } catch { /* sem storage */ }
    }
  }

  function flipTheme() {
    if (corp) setFriendlyTheme();
    else setCorporateTheme();
  }

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 10, display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button onClick={flipMode} title={isDark ? "Tema claro" : "Tema escuro"} aria-label="Alternar claro/escuro"
        style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", color: "var(--text-body)", cursor: "pointer", fontSize: "0.9rem" }}>◐</button>
      <button onClick={flipTheme} role="switch" aria-checked={corp} aria-label="Alternar Friendly / Corporativo"
        title={corp ? "Mudar para o tema Friendly" : "Mudar para o tema Corporativo"}
        style={{ position: "relative", width: 46, height: 26, padding: 0, borderRadius: 999, cursor: "pointer",
          border: "1px solid " + (corp ? "var(--hbx-brand)" : "var(--border-hairline)"),
          background: corp
            ? "linear-gradient(140deg, var(--hbx-brand), var(--hbx-brand-strong))"
            : "color-mix(in srgb, var(--hbx-surface-raised) 80%, var(--hbx-surface))",
          transition: "background var(--motion-fast), border-color var(--motion-fast)" }}>
        <span style={{ position: "absolute", top: "50%", left: corp ? 22 : 2, width: 20, height: 20, borderRadius: 999, background: "#FFFFFF", transform: "translateY(-50%)", transition: "left var(--motion-base)" }} />
      </button>
      <span style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.04em", minWidth: 76, color: corp ? "var(--hbx-brand-strong)" : "var(--text-muted)" }}>
        {corp ? "Corporativo" : "Friendly"}
      </span>
    </div>
  );
}
