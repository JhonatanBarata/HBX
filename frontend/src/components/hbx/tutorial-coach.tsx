"use client";

// Motor de COACHMARK do tutorial (ordem do dono 14/06): tour estilo jogo que
// destaca um elemento REAL do app (sidebar/topbar) com um "buraco" de luz, um
// balão de texto, e avança quando a pessoa clica no alvo certo. Roda por cima
// do shell persistente via portal pro <body>.
//
// AS 5 LEIS: visual 100% em classe central (.tut-* no screens.css). Aqui só
// entram estilos de POSIÇÃO/tamanho (top/left/width/height/transform) — que são
// dinâmicos por natureza (vêm do getBoundingClientRect do alvo) e NÃO são props
// visuais (cor/borda/sombra/fonte/radius), então não pesam na catraca.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CoachStep = {
  id: string;
  // Seletor CSS do alvo (ex.: '[data-tut="pele"]'). Ausente = passo central.
  target?: string;
  title: string;
  body: string;
  // 'click' = espera o clique REAL no alvo pra avançar (jogo).
  // 'next'  = avança no botão "Continuar" (passo central/explicativo).
  gate?: "click" | "next";
  // Texto do botão num passo central (default "Continuar").
  cta?: string;
};

type Rect = { top: number; left: number; width: number; height: number } | null;

const FIND_TIMEOUT_MS = 2500;

export function TutorialCoach({
  steps,
  onDone,
  onSkip,
}: {
  steps: CoachStep[];
  onDone?: () => void;
  onSkip?: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect>(null);
  const [missing, setMissing] = useState(false);
  const rafRef = useRef<number | null>(null);

  const step = steps[i];
  const isLast = i >= steps.length - 1;

  function advance() {
    if (isLast) { onDone?.(); return; }
    setI((n) => Math.min(steps.length - 1, n + 1));
  }
  function skip() { (onSkip || onDone)?.(); }

  // ESC encerra o tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Localiza o alvo, segue sua posição (rAF) e arma o "clique pra avançar".
  useEffect(() => {
    let active = true;
    // Passo central (sem alvo): tira o holofote. Passo com alvo: NÃO zera o rect
    // — deixa o holofote DESLIZAR suavemente do alvo anterior pro novo (CSS).
    if (!step?.target) {
      Promise.resolve().then(() => { if (active) { setRect(null); setMissing(false); } });
      return () => { active = false; };
    }
    Promise.resolve().then(() => { if (active) setMissing(false); });

    let el: Element | null = null;
    let onHit: ((e: Event) => void) | null = null;
    const startedAt = Date.now();

    const track = () => {
      if (!active) return;
      if (!el) {
        el = document.querySelector(step.target!);
        if (!el) {
          if (Date.now() - startedAt > FIND_TIMEOUT_MS) { setMissing(true); return; }
          rafRef.current = requestAnimationFrame(track);
          return;
        }
        // Garante que o alvo esteja visível e arma o clique-pra-avançar.
        try { (el as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ok */ }
        if (step.gate !== "next") {
          onHit = () => { window.setTimeout(advance, 60); };
          el.addEventListener("click", onHit, { once: true });
        }
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      rafRef.current = requestAnimationFrame(track);
    };
    track();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (el && onHit) el.removeEventListener("click", onHit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.target, step?.gate]);

  // Alvo sumiu (cargo/plano não tem) → pula o passo sem travar o jogo.
  useEffect(() => {
    if (!missing) return;
    const t = window.setTimeout(() => advance(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  if (!step || typeof document === "undefined") return null;

  const PAD = 8; // folga do buraco de luz ao redor do alvo
  const centered = !step.target || !rect;

  // Posição do balão: ao lado do alvo (à direita se o alvo está à esquerda;
  // senão abaixo), sempre clampado dentro da viewport.
  const balloon: { left: number; top: number } = { left: 0, top: 0 };
  if (rect) {
    const vw = window.innerWidth;
    const W = Math.min(330, vw - 24);
    if (rect.left < vw * 0.34) {
      balloon.left = Math.min(rect.left + rect.width + 16, vw - W - 12);
      balloon.top = Math.max(12, rect.top - 4);
    } else {
      balloon.left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
      balloon.top = rect.top + rect.height + 16;
    }
  }

  const node = (
    <div className="tut-coach" role="dialog" aria-modal="true" aria-label="Tutorial guiado">
      {/* Buraco de luz no alvo (a sombra gigante escurece o resto). */}
      {rect && (
        <div
          className="tut-spot"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          aria-hidden
        />
      )}

      {/* Passo central (boas-vindas / fechamento) — sem alvo. */}
      {centered && (
        <div className="tut-veil" aria-hidden />
      )}

      <div
        className={"tut-balloon" + (centered ? " is-centered" : "")}
        style={centered ? undefined : { left: balloon.left, top: balloon.top }}
      >
        <div className="tut-balloon__head">
          <span className="tut-balloon__step">{i + 1} / {steps.length}</span>
          <button className="tut-balloon__skip" onClick={skip} type="button">Pular tour</button>
        </div>
        <strong className="tut-balloon__title">{step.title}</strong>
        <p className="tut-balloon__body">{step.body}</p>
        <div className="tut-balloon__foot">
          {step.gate === "next" || centered ? (
            <button className="tut-btn" onClick={advance} type="button">
              {step.cta || (isLast ? "Concluir" : "Continuar")} →
            </button>
          ) : (
            <span className="tut-hint">
              <span className="tut-hint__dot" aria-hidden /> Clique no destaque para seguir
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
