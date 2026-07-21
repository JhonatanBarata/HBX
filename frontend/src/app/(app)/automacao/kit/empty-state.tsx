"use client";

// S01 (PADRAO-MERCADO) — kit/empty-state.tsx: EmptyState ilustrado (Lei nº1
// do README da frente — TETO DE COPY). A API não tem prop de parágrafo: só
// título curto + 1 linha + CTA opcional. Quem precisar de mais texto está
// violando a Lei, não faltando prop — o componente força isso por
// CONSTRUÇÃO (não por validação em runtime): não existe slot pra bloco de
// texto longo.
import type React from "react";

export function EmptyState({
  illustration,
  title,
  line,
  cta,
}: {
  /** Slot de ilustração — SVG inline `currentColor` (ex.: kit/ilustracoes.tsx). */
  illustration: React.ReactNode;
  /** Título curto — até 4 palavras. */
  title: string;
  /** 1 linha só — até 70 caracteres. Não é parágrafo (de propósito, Lei nº1). */
  line?: string;
  /** Ação — normalmente um <button className="btn-teal">. */
  cta?: React.ReactNode;
}) {
  return (
    <div className="aut-empty-wrap">
      <span className="aut-empty-illus" aria-hidden="true">{illustration}</span>
      <h4 className="aut-empty-title">{title}</h4>
      {line && <span className="aut-empty-line">{line}</span>}
      {cta && <div className="aut-empty-cta">{cta}</div>}
    </div>
  );
}
