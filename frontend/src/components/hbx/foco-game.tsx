"use client";

// Modo Foco GAME (desktop) — casca cinematográfica do /vendas. Ao ativar, as
// distrações queimam (controlado, ordem aleatória, lento) enquanto o tablado de
// 4 etapas brota por cima (Pesquisa · Análise · Atendimento · Fechamento). É um 3º
// MODO de DESKTOP que sobrepõe a casca funil/buscar; sai sem deixar rastro (onExit
// desmonta e a tela normal volta). SEPARADO do Modo Foco mobile do dono
// (vendas-modo-foco.tsx / VendasModoFoco / .vf-*). Pele: hbx-theme/foco-game.css.
// EDIT 1 = casca + transição + espelho dos dados reais + gates; pendências
// (radar-na-entrada, missões/arquivo no backend, robô v2) entram nos próximos passos.

import React, { useEffect, useRef, useState } from "react";

import { I, ICONS, WhatsAppMark } from "@/components/hbx/shell";

export type FocoCol = "pesquisa" | "analise" | "atendimento" | "fechamento";
export type FocoLead = {
  id: string;
  name: string | null;
  segment: string | null;
  city: string | null;
  phone: string | null;
  col: FocoCol;
  inInbox?: boolean;
};
export type FocoMission = { id: string; label: string };

type Phase = "commit" | "transform" | "board" | "exiting";

const COLS: { key: FocoCol; label: string; icon: string }[] = [
  { key: "pesquisa", label: "Pesquisa", icon: "scrape" },
  { key: "analise", label: "Análise", icon: "search" },
  { key: "atendimento", label: "Atendimento", icon: "msg" },
  { key: "fechamento", label: "Fechamento", icon: "crown" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addSparks(el: HTMLElement, timers: number[]) {
  for (let i = 0; i < 5; i++) {
    const s = document.createElement("span");
    s.className = "foco-spark";
    s.style.left = 8 + Math.random() * 84 + "%";
    s.style.bottom = Math.random() * 26 + "%";
    s.style.animationDelay = Math.random() * 220 + "ms";
    el.appendChild(s);
    timers.push(window.setTimeout(() => s.remove(), 1300));
  }
}

export function FocoGame({
  summary,
  leads,
  missions,
  canRobot,
  onExit,
  onOpenProspector,
  onSelectLead,
}: {
  summary: { total: number; overdue: number; closed: number } | null;
  leads: FocoLead[];
  missions: FocoMission[];
  canRobot: boolean;
  onExit: () => void;
  onOpenProspector: () => void;
  onSelectLead?: (id: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("commit");
  const [activeMission, setActiveMission] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Queima-de-entrada: distrações queimam (ordem aleatória, lento) e as folhas do
  // foco brotam por cima com sobreposição. setState só dentro de setTimeout (o lint
  // react-hooks/set-state-in-effect é erro neste repo).
  useEffect(() => {
    if (phase !== "transform") return;
    const root = rootRef.current;
    if (!root) return;
    const timers: number[] = [];
    const burnItems = shuffle(Array.from(root.querySelectorAll<HTMLElement>(".foco-burn-item")));
    const leaves = shuffle(Array.from(root.querySelectorAll<HTMLElement>(".foco-leaf")));
    leaves.forEach(el => { el.classList.add("foco-grow"); el.classList.remove("foco-in"); });
    const burn = (el: HTMLElement) => {
      addSparks(el, timers);
      el.classList.remove("foco-grow", "foco-in");
      el.classList.add("foco-burning");
    };
    const grow = (el: HTMLElement) => {
      el.classList.remove("foco-burning", "foco-in");
      void el.offsetWidth;
      el.classList.add("foco-grow");
      void el.offsetWidth;
      el.classList.add("foco-in");
    };
    burnItems.forEach((el, i) => timers.push(window.setTimeout(() => burn(el), i * 270)));
    leaves.forEach((el, i) => timers.push(window.setTimeout(() => grow(el), 140 + i * 240)));
    const total = Math.max(burnItems.length * 270 + 1000, 140 + leaves.length * 240 + 900) + 80;
    timers.push(window.setTimeout(() => setPhase("board"), total));
    return () => timers.forEach(t => clearTimeout(t));
  }, [phase]);

  // Saída: o tablado queima e o overlay desmonta (a tela normal já está por baixo).
  useEffect(() => {
    if (phase !== "exiting") return;
    const root = rootRef.current;
    if (!root) { onExit(); return; }
    const timers: number[] = [];
    const leaves = shuffle(Array.from(root.querySelectorAll<HTMLElement>(".foco-leaf")));
    leaves.forEach((el, i) => timers.push(window.setTimeout(() => {
      addSparks(el, timers);
      el.classList.remove("foco-in");
      el.classList.add("foco-burning");
    }, i * 230)));
    timers.push(window.setTimeout(() => onExit(), leaves.length * 230 + 1100));
    return () => timers.forEach(t => clearTimeout(t));
  }, [phase, onExit]);

  const colLeads = (c: FocoCol) => leads.filter(l => l.col === c);
  const chips = leads.slice(0, 6);
  const showBoard = phase === "transform" || phase === "board" || phase === "exiting";

  return (
    <div className="foco-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label="Modo foco">
      {phase === "commit" && (
        <div className="foco-commit">
          <div className="foco-commit__card">
            <div className="foco-commit__title"><I d={ICONS.bolt} size={20} /> Comprometer com o foco</div>
            <p className="foco-commit__lead">Você entra numa missão única. O resto queima da tela.</p>
            <ul className="foco-commit__warns">
              <li><I d={ICONS.bolt} size={16} /> Consome do seu plano enquanto pesquisa.</li>
              <li><I d={ICONS.mark} size={16} /> Pesquisa fora do foco é arquivada (recuperável ao sair).</li>
              <li><I d={ICONS.users} size={16} /> Máximo 10 leads por missão.</li>
            </ul>
            <div className="foco-commit__acts">
              <button type="button" className="foco-btn foco-btn--fire" onClick={() => setPhase("transform")}>
                <I d={ICONS.bolt} size={16} /> Comprometer
              </button>
              <button type="button" className="foco-btn foco-btn--ghost" onClick={onExit}>Agora não</button>
            </div>
          </div>
        </div>
      )}

      {phase === "transform" && (
        <div className="foco-burnstage" aria-hidden="true">
          <div className="foco-kpis">
            <div className="foco-burn-item foco-kpi"><span className="foco-kpi__lab">Cards no funil</span><span className="foco-kpi__num">{summary ? summary.total : "—"}</span></div>
            <div className="foco-burn-item foco-kpi"><span className="foco-kpi__lab">Atrasados</span><span className="foco-kpi__num">{summary ? summary.overdue : "—"}</span></div>
            <div className="foco-burn-item foco-kpi"><span className="foco-kpi__lab">Fechados</span><span className="foco-kpi__num">{summary ? summary.closed : "—"}</span></div>
          </div>
          {chips.map(c => (
            <div className="foco-burn-item foco-clutter" key={c.id}>
              <span className="foco-clutter__name">{c.name || "—"}</span>
              <span className="foco-clutter__sub">{[c.segment, c.city].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          ))}
        </div>
      )}

      {showBoard && (
        <div className={"foco-board" + (phase === "board" ? " is-live" : "")}>
          <div className="foco-board__bar foco-leaf">
            <span className="foco-board__title"><I d={ICONS.scrape} size={16} /> Modo foco ativo</span>
            <span className="foco-board__spacer" />
            <span className="foco-board__cap">{leads.length} / 10 leads</span>
            <button type="button" className="foco-btn foco-btn--ghost" onClick={() => setPhase("exiting")}>
              <I d={ICONS.arrow} size={15} /> Sair do foco
            </button>
          </div>

          <div className="foco-tabs foco-leaf">
            {missions.map((m, i) => (
              <button type="button" key={m.id} className={"foco-tab" + (i === activeMission ? " is-on" : "")} onClick={() => setActiveMission(i)}>
                <I d={ICONS.mapin} size={13} /> {m.label}
              </button>
            ))}
            <button type="button" className="foco-tab foco-tab--new" onClick={onOpenProspector}>
              <I d={ICONS.plus} size={13} /> Nova missão
            </button>
          </div>
          <p className="foco-cap-note foco-leaf">Só esta missão na tela. As outras ficam paradas, nunca misturadas.</p>

          <div className="foco-cols">
            {COLS.map(col => {
              const cards = colLeads(col.key);
              return (
                <section className={"foco-col foco-leaf foco-col--" + col.key} key={col.key}>
                  <h4 className="foco-col__head"><I d={ICONS[col.icon]} size={14} /> {col.label} <span className="foco-col__count">{cards.length}</span></h4>
                  <div className="foco-col__body">
                    {cards.length === 0 && <div className="foco-col__empty">—</div>}
                    {cards.map(card => (
                      <article className="foco-card" key={card.id} onClick={() => onSelectLead?.(card.id)}>
                        <strong className="foco-card__name">{card.name || "—"}</strong>
                        <span className="foco-card__sub">{[card.segment, card.city].filter(Boolean).join(" · ") || card.phone || "—"}</span>
                        {col.key === "atendimento" && card.inInbox && (
                          <span className="foco-card__wa"><span className="foco-card__pulse" /> <WhatsAppMark size={12} /> realce de foco</span>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className={"foco-robot foco-leaf" + (canRobot ? "" : " is-locked")}>
            <div className="foco-robot__head">
              <I d={ICONS.bot} size={20} />
              <span className="foco-robot__name">Robô prospector</span>
              <span className="foco-robot__badge">{canRobot ? "Ativo" : "Premium"}</span>
            </div>
            <p className="foco-robot__desc">O disparador controlado, virado painel de uma tecla.</p>
            <div className="foco-robot__ctrls">
              <button type="button" className="foco-robot__play" onClick={canRobot ? onOpenProspector : undefined} aria-label="Abrir prospecção">
                <I d={ICONS.play} size={20} />
              </button>
              <span className="foco-robot__dial"><I d={ICONS.bolt} size={14} /> Ritmo: seguro</span>
              <span className="foco-robot__safe"><I d={ICONS.check} size={14} /> Disjuntor anti-ban: ligado</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
