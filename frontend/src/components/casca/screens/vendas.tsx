"use client";

// MOBILE-CASCA/W2 — VENDAS/LEADS mobile (mockup aprovado 1).
//
// Registrada para /vendas (e /leads, que já é alias client-side → redireciona
// pra /vendas antes do registry decidir — ver app/(app)/leads/redirect.client.tsx).
// Uma tela, dois modos por segmented compacto 28px: Funil | Buscar. Consome os
// MESMOS endpoints que vendas/page.client.tsx e leads/page.client.tsx já usam
// no desktop (GET /vendas/board, GET/POST /webscraping/radar/*, GET
// /night-factory/leads-bank, GET /vendas/usage) — zero backend novo, zero
// alteração na lógica/estado das telas desktop (DOM mobile separada).
//
// Entrar em "Buscar" direto (vindo de /leads): mesma flag sessionStorage que o
// desktop já usa (hbx:vendas-modo). Lida aqui e no VendasClient — sem conflito
// (a leitura é feita no mount de cada árvore, tabs diferentes da mesma app).
//
// Orçamento de cromo (PLANO §régua, ≤140px): o segmented Funil|Buscar NÃO vira
// uma linha própria — é passado como slot pra cada modo fundir na SUA própria
// barra superior (Buscar: ao lado do campo; Funil: ao lado da toolbar).

import React, { useState } from "react";

import { VendasBuscarMobile } from "./vendas-buscar";
import { VendasFunilMobile } from "./vendas-funil";

export type Modo = "funil" | "buscar";

function readInitialModo(): Modo {
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
  const [modo, setModo] = useState<Modo>(readInitialModo);

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
