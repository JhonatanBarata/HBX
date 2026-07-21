"use client";

// S01 (PADRAO-MERCADO) — kit/mini-fluxo.tsx: mini-diagrama horizontal de 2-4
// nós (ícone central + rótulo curto) ligados por conector — usos previstos:
// cartões do hub (S02), cards de template (S08), empty state de Regras
// (S07). Variante `compact` (só dots) cabe no espaço apertado de um cartão
// pequeno — mesmos dados, só a densidade visual muda.
import React from "react";

import { I, ICONS } from "@/components/hbx/shell";

export type MiniFluxoNode = {
  icon: keyof typeof ICONS;
  /** Rótulo curto do nó — some no modo `compact` (vira só um dot, com `title` no hover). */
  label: string;
};

export function MiniFluxo({ nodes, compact = false }: { nodes: MiniFluxoNode[]; compact?: boolean }) {
  return (
    <div className={"aut-minifluxo" + (compact ? " aut-minifluxo--compact" : "")}>
      {nodes.map((n, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="aut-minifluxo__conn" aria-hidden="true">
              <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4h8M6 1l3 3-3 3" />
              </svg>
            </span>
          )}
          <span className="aut-minifluxo__node" title={compact ? n.label : undefined}>
            {compact ? (
              <span className="aut-minifluxo__dot" aria-hidden="true" />
            ) : (
              <>
                <span className="aut-minifluxo__icon"><I d={ICONS[n.icon]} size={14} /></span>
                <span className="aut-minifluxo__label">{n.label}</span>
              </>
            )}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
