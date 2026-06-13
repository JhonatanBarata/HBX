"use client";

// Controles de tema das telas de auth (login/reset/confirm) — ESQUELETO
// (12/06/2026): as peles foram deletadas; resta o claro/escuro
// automático (mesma escada de tokens do app inteiro). Quando as peles
// novas forem aprovadas, o seletor de pele volta aqui (PELE.md).

import { useSyncExternalStore } from "react";

import { subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";

export function AuthThemeControls() {
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const isDark = modeAttr === "dark";

  function flipMode() {
    applyThemeSoft(() => setThemeMode(isDark ? "light" : "dark"));
  }

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 10, display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button onClick={flipMode} title={isDark ? "Tema claro" : "Tema escuro"} aria-label="Alternar claro/escuro"
        style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid var(--border-hairline)", background: "var(--hbx-surface)", color: "var(--text-body)", cursor: "pointer", fontSize: "0.9rem" }}>◐</button>
    </div>
  );
}
