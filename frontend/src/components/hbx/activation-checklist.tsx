"use client";

// Checklist de ativação persistente (28/06, Camada 1 — Onboarding Vendedor).
// Casca "Getting Started" (HubSpot/Pipedrive): cada item = uma "1ª vez"; some ao
// completar tudo. Lê a VERDADE do backend (GET /onboarding/checklist, que carimba
// + DERIVA dos dados reais) e recarrega quando um marco é carimbado (bump) ou ao
// trocar de rota. Vive no app-shell; só aparece pra quem tem jornada (applicable).
// Visual 100% em classe central (.ac-*) na activation-checklist.css.

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { apiFetch, getToken } from "@/lib/api";
import { subscribeChecklistBump } from "@/lib/onboarding";
import { useIsMobile } from "@/lib/use-is-mobile";

type Step = {
  key: string;
  label: string;
  hint: string;
  href: string;
  cta: string;
  milestone: boolean;
  done: boolean;
  doneAt: string | null;
};
type Checklist = {
  applicable: boolean;
  role: string;
  complete: boolean;
  activated: boolean;
  progress: { done: number; total: number };
  steps: Step[];
};

const COLLAPSE_KEY = "hbx:ac-collapsed";

export function ActivationChecklist() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const isMobile = useIsMobile();
  const [data, setData] = useState<Checklist | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(() => {
    if (!getToken()) return;
    apiFetch<Checklist>("/onboarding/checklist")
      .then(res => setData(res || null))
      .catch(() => { /* sem checklist → não aparece */ });
  }, []);

  // Carrega no mount, ao trocar de rota (refletir o que a pessoa acabou de fazer)
  // e quando um marco é carimbado em qualquer tela (bump).
  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => subscribeChecklistBump(load), [load]);

  // Estado de recolhido salvo (lido pós-montagem em callback — regra set-state-in-effect).
  // Se não houver preferência salva, mobile nasce recolhido; desktop nasce expandido.
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(COLLAPSE_KEY);
        if (saved === "1") {
          setCollapsed(true);
        } else if (saved === "0") {
          setCollapsed(false);
        } else {
          // Sem preferência: mobile recolhido, desktop expandido
          setCollapsed(isMobile);
        }
      } catch { /* sem storage */ }
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, [isMobile]);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* sem storage */ }
  }

  if (!data || !data.applicable || data.complete) return null;

  const { done, total } = data.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nextKey = data.steps.find(s => !s.done)?.key || null;

  if (collapsed) {
    return (
      <button className="ac-pill" onClick={() => setCollapsedPersist(false)} aria-label="Abrir primeiros passos">
        <span className="ac-pill-ring" style={{ ["--ac-pct" as string]: pct }} aria-hidden="true">
          <i>{done}/{total}</i>
        </span>
        <span className="ac-pill-label">Primeiros passos</span>
      </button>
    );
  }

  return (
    <aside className="ac-card" aria-label="Seus primeiros passos">
      <header className="ac-head">
        <div className="ac-head-txt">
          <strong>Seus primeiros passos</strong>
          <small>{done} de {total} · ative sua conta</small>
        </div>
        <button className="ac-min" onClick={() => setCollapsedPersist(true)} aria-label="Recolher">–</button>
      </header>
      <div className="ac-bar" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
      <ol className="ac-steps">
        {data.steps.map(s => {
          const isNext = s.key === nextKey;
          return (
            <li key={s.key} className={"ac-step" + (s.done ? " is-done" : "") + (isNext ? " is-next" : "")}>
              <span className="ac-dot" aria-hidden="true">
                {s.done ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : null}
              </span>
              <div className="ac-step-body">
                <span className="ac-step-label">{s.label}</span>
                {isNext && <span className="ac-step-hint">{s.hint}</span>}
                {isNext && (
                  <button className="ac-cta" onClick={() => router.push(s.href)}>{s.cta} →</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
