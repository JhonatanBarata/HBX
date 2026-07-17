"use client";

// MOBILE-CASCA/W2 — VENDAS/LEADS mobile (mockup aprovado 1).
//
// Registrada para /vendas E /leads no registry da casca (spec W2: uma tela,
// dois modos). Em /leads abre direto no modo Buscar (lê o pathname) — cobre o
// alias /webscraping → /leads e links internos sem cair no fallback, mesmo
// antes do redirect client-side (leads/redirect.client.tsx) resolver.
// Uma tela, com Funil | Buscar. O estado do enriquecimento já aparece no
// gráfico vivo do topo, portanto não existe mais uma guia/tela duplicada.
//
// Entrar em "Buscar" direto em /vendas: mesma flag sessionStorage que o
// desktop já usa (hbx:vendas-modo). Lida aqui e no VendasClient — sem conflito
// (a leitura é feita no mount de cada árvore, tabs diferentes da mesma app).
//
// Orçamento de cromo (PLANO §régua, ≤140px): o segmented Funil|Buscar NÃO vira
// uma linha própria — é passado como slot pra cada modo fundir na SUA própria
// barra superior (Buscar: ao lado do campo; Funil: ao lado da toolbar).

import { usePathname } from "next/navigation";
import React, { useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import {
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";

import { VendasBuscarMobile } from "./vendas-buscar";
import { VendasFunilMobile } from "./vendas-funil";

export type Modo = "funil" | "buscar";

function useCanSearchLeads() {
  const entitlements = useEntitlements();
  const user = useCurrentUser();
  const modules = useMyModules();
  return isModuleVisible("leads", entitlements, user, modules);
}

function readInitialModo(pathname: string): Modo {
  // /leads = a MESMA tela aberta direto no modo Buscar (registry aponta as
  // duas rotas pra cá; o pathname decide o modo inicial).
  if (pathname === "/leads") return "buscar";
  if (typeof window === "undefined") return "funil";
  try {
    if (sessionStorage.getItem("hbx:vendas-modo") === "buscar") {
      sessionStorage.removeItem("hbx:vendas-modo");
      return "buscar";
    }
  } catch { /* sem storage */ }
  return "funil";
}

// Guia Funil|Buscar — Lei nº2 do Design System (FRONTEND.md §2): seleção ativa
// de um grupo com "um por vez" é SEMPRE Glass Pill deslizante.
export function ModoSegment({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  const canSearchLeads = useCanSearchLeads();
  const gp = useGlassPill<HTMLButtonElement>(modo, canSearchLeads);
  return (
    <div className="casca-segment vnd-m__segment glass-pill-track" role="tablist" aria-label="Modo">
      <GlassPill {...gp} />
      <button
        type="button"
        role="tab"
        ref={gp.itemRef("funil")}
        aria-selected={modo === "funil"}
        className={"casca-segment__item glass-pill-item" + (modo === "funil" ? " is-on" : "")}
        onClick={() => onChange("funil")}
      >
        Funil
      </button>
      {canSearchLeads && (
        <button
          type="button"
          role="tab"
          ref={gp.itemRef("buscar")}
          aria-selected={modo === "buscar"}
          className={"casca-segment__item glass-pill-item" + (modo === "buscar" ? " is-on" : "")}
          onClick={() => onChange("buscar")}
        >
          Buscar
        </button>
      )}
    </div>
  );
}

export function VendasMobile() {
  const pathname = usePathname() || "";
  const [modo, setModo] = useState<Modo>(() => readInitialModo(pathname));
  const canSearchLeads = useCanSearchLeads();
  const visibleModo: Modo = canSearchLeads ? modo : "funil";

  return (
    <div className="casca-screen">
      {visibleModo === "funil" ? (
        <VendasFunilMobile modo={visibleModo} onModoChange={setModo} />
      ) : (
        <VendasBuscarMobile modo={visibleModo} onModoChange={setModo} />
      )}
    </div>
  );
}
