"use client";

import { useEffect } from "react";

// CascaView/CascaSheet portalam pro <body> (transitions.tsx: CascaPortal), fora
// do <div data-skin="entrega"> do layout — a folha ("Novo cliente" etc.) saía
// do escopo e nenhuma regra do entrega.css (.ent-input/.ent-btn/.ent-form...)
// batia (bug 07/07: form sem casca). Espelha a pele pro <html> — mesmo padrão
// do data-theme-mode (theme-attributes.tsx) — pra o portal também enxergar.
export function EntregaSkinGate() {
  useEffect(() => {
    const root = document.documentElement;
    const anterior = root.getAttribute("data-skin");
    root.setAttribute("data-skin", "entrega");
    return () => {
      if (anterior === null) root.removeAttribute("data-skin");
      else root.setAttribute("data-skin", anterior);
    };
  }, []);
  return null;
}
