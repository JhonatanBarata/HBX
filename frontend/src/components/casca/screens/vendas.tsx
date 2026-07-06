"use client";

// MOBILE-CASCA/W2 — VENDAS/LEADS mobile (mockup aprovado 1).
//
// Registrada para /vendas E /leads no registry da casca (spec W2: uma tela,
// dois modos). Em /leads abre direto no modo Buscar (lê o pathname) — cobre o
// alias /webscraping → /leads e links internos sem cair no fallback, mesmo
// antes do redirect client-side (leads/redirect.client.tsx) resolver.
// Uma tela, dois modos por segmented compacto 28px: Funil | Buscar. Consome os
// MESMOS endpoints que vendas/page.client.tsx e leads/page.client.tsx já usam
// no desktop (GET /vendas/board, GET/POST /webscraping/radar/*, GET
// /night-factory/leads-bank, GET /vendas/usage) — zero backend novo, zero
// alteração na lógica/estado das telas desktop (DOM mobile separada).
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

import { VendasBuscarMobile } from "./vendas-buscar";
import { VendasFunilMobile } from "./vendas-funil";

export type Modo = "funil" | "buscar";

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

export function ModoSegment({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  return (
    <div className="casca-segment vnd-m__segment" role="tablist" aria-label="Modo">
      <button
        type="button"
        role="tab"
        aria-selected={modo === "funil"}
        className={"casca-segment__item" + (modo === "funil" ? " is-on" : "")}
        onClick={() => onChange("funil")}
      >
        Funil
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={modo === "buscar"}
        className={"casca-segment__item" + (modo === "buscar" ? " is-on" : "")}
        onClick={() => onChange("buscar")}
      >
        Buscar
      </button>
    </div>
  );
}

export function VendasMobile() {
  const pathname = usePathname() || "";
  const [modo, setModo] = useState<Modo>(() => readInitialModo(pathname));

  return (
    <div className="casca-screen">
      {modo === "funil" ? (
        <VendasFunilMobile modo={modo} onModoChange={setModo} />
      ) : (
        <VendasBuscarMobile modo={modo} onModoChange={setModo} />
      )}
    </div>
  );
}
