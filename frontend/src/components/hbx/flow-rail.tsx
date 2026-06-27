"use client";

// Trilho de fluxo do vendedor (27/06, ordem do dono) — ① Encontrar → ② Conversar
// → ③ Fechar. Vive no topo das 3 telas do funil (montado pelo AppShell só nessas
// rotas) e TAMBÉM é a navegação entre elas. Ensina a ordem do trabalho sem
// tutorial: "acho a empresa, falo no WhatsApp, fecho e ganho comissão". O rótulo é
// o VERBO do que se faz ali (espelha NAV_LINKS no shell.tsx). Visual 100% em classe
// central (.hbx-flowrail no kit.css) — zero cor/borda inline (5 Leis do Design).

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const STEPS = [
  { href: "/leads", verb: "Encontrar", hint: "ache empresas pra abordar" },
  { href: "/atendimento", verb: "Conversar", hint: "fale no WhatsApp" },
  { href: "/vendas", verb: "Fechar", hint: "feche e ganhe comissão" },
] as const;

// Rotas que mostram o trilho (o AppShell consulta para não montar nada fora delas).
export const FLOW_ROUTES: ReadonlySet<string> = new Set(STEPS.map(s => s.href));

export function FlowRail() {
  const pathname = usePathname() || "";
  const currentIdx = STEPS.findIndex(s => s.href === pathname);
  if (currentIdx < 0) return null; // só nas 3 telas do funil

  return (
    <nav className="hbx-flowrail" aria-label="Seu fluxo de trabalho">
      {STEPS.map((s, i) => {
        const state = i === currentIdx ? "is-current" : i < currentIdx ? "is-done" : "is-todo";
        return (
          <React.Fragment key={s.href}>
            <Link
              href={s.href}
              className={"hbx-flowrail__step " + state}
              aria-current={i === currentIdx ? "step" : undefined}
              data-tut={"flow-" + s.href.slice(1)}
            >
              <span className="hbx-flowrail__num">{i + 1}</span>
              <span className="hbx-flowrail__txt">
                <b>{s.verb}</b>
                <small>{s.hint}</small>
              </span>
            </Link>
            {i < STEPS.length - 1 && (
              <span className="hbx-flowrail__arrow" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
