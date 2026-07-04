"use client";

// GLASS PILL — Lei nº2 do Design System (docs/Rules/FRONTEND.md): QUALQUER
// grupo de botões/links com um único "ativo" por vez (menu lateral, sub-menu,
// aba, chip de filtro, período, passo de wizard) usa ESTE par
// hook+componente em vez de um background/borda próprios que trocam na hora.
//
// useGlassPill mede o retângulo (top/left/width/height) do item ativo dentro
// do container — o container só precisa de position:relative (classe
// utilitária .glass-pill-track em kit.css) e cada item de position:relative +
// z-index:1 (.glass-pill-item) pra ficar por cima do vidro. <GlassPill>
// desenha o vidro líquido (blur + brilho) e desliza até o novo item; ao
// chegar, dá uma leve "chacoalhada" de pouso (squash/stretch), como uma gota
// assentando — nunca um destaque que só pisca/pula.
//
// Uso típico:
//   const gp = useGlassPill(activeKey, itemsLengthOrOtherDep);
//   <div className="glass-pill-track algumaClasseDoContainer">
//     <GlassPill {...gp} />
//     {items.map(it => (
//       <button key={it.key} ref={gp.itemRef(it.key)} className="glass-pill-item ...">
//     ))}
//   </div>

import { useLayoutEffect, useRef, useState } from "react";

type GlassRect = { top: number; left: number; width: number; height: number };

export function useGlassPill<T extends HTMLElement = HTMLElement>(
  activeKey: string | null | undefined,
  ...deps: unknown[]
) {
  const itemRefs = useRef<Record<string, T | null>>({});
  const [rect, setRect] = useState<GlassRect | null>(null);
  const [landing, setLanding] = useState(false);
  const prevRef = useRef<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = activeKey != null ? itemRefs.current[activeKey] : null;
    const next: GlassRect | null = el
      ? { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight }
      : null;
    setRect(next);
    // só "assenta" quando JÁ havia posição anterior (evita animar no 1º render).
    if (next && prevRef.current && (prevRef.current.top !== next.top || prevRef.current.left !== next.left)) {
      setLanding(true);
    }
    prevRef.current = next ? { top: next.top, left: next.left } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, ...deps]);

  function itemRef(key: string) {
    return (el: T | null) => { itemRefs.current[key] = el; };
  }

  return { itemRef, rect, landing, onSettled: () => setLanding(false) };
}

export function GlassPill({ rect, landing, onSettled }: {
  rect: GlassRect | null;
  landing: boolean;
  onSettled: () => void;
}) {
  if (!rect) return null;
  return (
    <span
      className="glass-pill"
      aria-hidden="true"
      style={{ transform: `translate(${rect.left}px, ${rect.top}px)`, width: rect.width, height: rect.height }}
    >
      <span className={"glass-pill__glass" + (landing ? " is-landing" : "")} onAnimationEnd={onSettled} />
    </span>
  );
}
