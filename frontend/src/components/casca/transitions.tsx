"use client";

// ============================================================
// MOBILE-CASCA/W1 — TRANSIÇÕES CENTRAIS (IR / VOLTAR).
//
// LEI do dono (PLANO §2): NADA abre nem fecha SECO. Esta é a ÚNICA API pra
// abrir/fechar uma camada na casca — W2–W6 consomem daqui, nunca montam/
// desmontam à mão. O helper SEGURA o unmount até a animação de saída terminar.
//
// Vocabulário (classes em hbx-theme/casca.css):
//   IR    → tela desliza da direita (.casca-view--enter)
//   VOLTAR→ reverso, com .is-back (.casca-view--enter.is-back etc.)
//
// Peças:
//   • useCascaExitGate  — lifecycle genérico: mantém `mounted` true até a
//     animação de saída acabar; devolve as flags de classe.
//   • <CascaView>       — camada de TELA empilhada (sub-tela dentro de uma aba,
//     ex.: ficha /leads/[id]). Entra com IR, sai com VOLTAR; chama onClosed.
//   • <CascaSheet>      — bottom sheet central (handle + arrastar-pra-fechar).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS } from "@/components/hbx/shell";

// Fallback do fecho: maior duração de motion usada nas camadas da casca
// (--casca-motion-dur = 220ms hoje) + buffer generoso. Blinda contra
// `animationend` que não dispara (reduced-motion mal pego por algum caminho,
// aba em background, keyframe removida etc.) — sem isso a folha trava aberta
// pra sempre (bug ao vivo, dono, 06/07). Puramente uma rede de segurança: o
// caminho normal continua sendo o `animationend`, que cancela este timer.
const CASCA_EXIT_FALLBACK_MS = 500;

// ---------------------------------------------------------------
// CascaPortal — os overlays da casca (veil do CascaSheet, camada do CascaView)
// são `position: fixed` e PRECISAM ancorar na viewport. Só que o `.casca-stage`
// ganhou `transform: translateX(...)` (FIX5 swipe entre módulos — casca.css) e
// esse transform vale SEMPRE (fallback 0px). Um ancestral com transform vira o
// bloco de contenção de todo `position:fixed` filho: o veil/sheet deixava de
// cobrir a viewport, passava a se ancorar no palco E era RECORTADO pelo
// `overflow:hidden` do palco — a folha abria presa e a saída "descia só um
// pouco e travava" (bug ao vivo, dono, 07/07: "tudo que clico abre e não
// fecha"). Portalar pro <body> tira os overlays de baixo do transform e devolve
// o comportamento de viewport. A pele vive em <html> (documentElement), então o
// <body> herda data-theme/tokens — nada de pele perdida. A casca é client-only
// (MobileShell devolve children puro no SSR/desktop), então document existe;
// o guard só blinda ambientes sem DOM.
function CascaPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

// ---------------------------------------------------------------
// useCascaExitGate — o coração: abrir monta na hora (anima entrada); fechar
// NÃO desmonta na hora — marca `leaving`, espera a animação e só então some.
// `open` é o desejo do chamador; `mounted` é o que deve estar no DOM.
// ---------------------------------------------------------------
export function useCascaExitGate(open: boolean, onClosed?: () => void) {
  // `phase` é a máquina: "in" (montado/entrando), "out" (saindo, ainda no DOM),
  // "gone" (desmontado). `lastOpen` guarda o último `open` renderizado EM STATE
  // (não em ref — o lint reprova ref no render). Quando `open` diverge de
  // `lastOpen` reconciliamos DURANTE o render (padrão oficial do React "adjust
  // state while rendering") — sem useEffect, sem o cascading-render reprovado.
  const [phase, setPhase] = useState<"in" | "out" | "gone">(open ? "in" : "gone");
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setPhase("in");                      // abriu → monta e anima entrada
    else if (phase !== "gone") setPhase("out");    // fechou → anima saída, segura o DOM
  }

  // fim da animação de saída → desmonta de vez e avisa o chamador. `onClosed`
  // entra como dep: se o chamador passar inline, o useCallback recria (barato);
  // se passar estável, fica estável. Sem ref no render (o lint reprova).
  const handleAnimEnd = useCallback(() => {
    setPhase((p) => {
      if (p === "out") {
        onClosed?.();
        return "gone";
      }
      return p;
    });
  }, [onClosed]);

  // Rede de segurança: se `animationend` não vier (ver nota no topo do
  // arquivo), o timeout força o mesmo desfecho. Roda só enquanto phase==="out";
  // limpo no cleanup pra não disparar depois de já ter fechado por evento ou
  // de o usuário ter reaberto.
  useEffect(() => {
    if (phase !== "out") return;
    const timer = setTimeout(handleAnimEnd, CASCA_EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [phase, handleAnimEnd]);

  return { mounted: phase !== "gone", leaving: phase === "out", handleAnimEnd };
}

// ---------------------------------------------------------------
// <CascaView> — TELA empilhada. IR ao montar, VOLTAR ao fechar.
// Uso (W2–W6):
//   const [open, setOpen] = useState(false);
//   {open && <CascaView title="Ficha" onClose={() => setOpen(false)}>…</CascaView>}
// `onClose` só PEDE o fecho; a view anima a saída e desmonta sozinha depois.
// Fica ABSOLUTA sobre o palco (position:fixed via .casca-view + z acima).
// ---------------------------------------------------------------
export function CascaView({
  title,
  children,
  onClose,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  // Aqui `open` é sempre true enquanto montado pelo chamador; o gate serve pra
  // segurar a saída quando `requestClose` roda.
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => setClosing(true), []);

  // Mesma rede de segurança do gate: se o `onAnimationEnd` da própria camada
  // não disparar, força o `onClose` depois do tempo de motion + buffer.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, CASCA_EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  // fecho por gesto de voltar do browser/hardware seria plugado aqui (W7);
  // por ora só o botão/seta chama requestClose.
  //
  // Direção (fix revisão W1): ABRIR sub-tela = IR → entra DA DIREITA
  // (.casca-view--enter, SEM is-back — o is-back inverteria pro keyframe de
  // VOLTAR, entrando da esquerda). FECHAR = VOLTAR → sai PRA DIREITA
  // (.casca-view--leave.is-back). O onClose só dispara no onAnimationEnd do
  // fechar (guard `if (closing)` abaixo).
  const cls =
    "casca-view " + (closing ? "casca-view--leave is-back" : "casca-view--enter");

  return (
    <CascaPortal>
      <div className="casca-stack-layer" role="dialog" aria-modal="true">
        <div
          className={cls}
          onAnimationEnd={(e) => {
            // só reage à animação da PRÓPRIA camada, não de filhos
            if (e.target !== e.currentTarget) return;
            if (closing) onClose();
          }}
        >
          <div className="casca-top">
            <button className="casca-top__back" onClick={requestClose} aria-label="Voltar">
              <I d={ICONS.back} size={18} />
            </button>
            {title ? <h1 className="casca-top__title">{title}</h1> : <span className="casca-top__title" />}
            {actions ? <div className="casca-top__actions">{actions}</div> : null}
          </div>
          {children}
        </div>
      </div>
    </CascaPortal>
  );
}

// ---------------------------------------------------------------
// <CascaSheet> — BOTTOM SHEET central: handle, sobe/desce com transição,
// arrastar-pra-baixo fecha, veil. NÃO reusa .hbx-drawer velho (casca nova).
// Uso (W2–W6):
//   <CascaSheet open={open} title="Detalhe" onClose={() => setOpen(false)}>…</CascaSheet>
// `open=false` dispara a saída animada e só então desmonta (via gate).
// ---------------------------------------------------------------
const DRAG_CLOSE_PX = 96; // arrastar mais que isto pra baixo = fecha

export function CascaSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { mounted, leaving, handleAnimEnd } = useCascaExitGate(open);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    sheetRef.current?.style.setProperty("--casca-drag", `${dy}px`);
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    dragStartY.current = null;
    setDragging(false);
    if (dy > DRAG_CLOSE_PX) {
      onClose(); // passou o limiar → pede fecho (a saída anima do ponto atual)
    } else {
      sheetRef.current?.style.setProperty("--casca-drag", "0px"); // volta pro lugar
    }
  }, [onClose]);

  if (!mounted) return null;

  return (
    <CascaPortal>
      <div
        className={"casca-sheet-veil" + (leaving ? " is-leaving" : "")}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget) handleAnimEnd(); }}
      >
        <div
          ref={sheetRef}
          className={"casca-sheet" + (leaving ? " is-leaving" : "") + (dragging ? " is-dragging" : "")}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="casca-sheet__grip"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="casca-sheet__handle" aria-hidden="true" />
          </div>
          {title ? (
            <div className="casca-sheet__head">
              <h2 className="casca-sheet__title">{title}</h2>
              <button type="button" className="casca-sheet__close" onClick={onClose} aria-label="Fechar">
                <I d={ICONS.x} size={18} />
              </button>
            </div>
          ) : null}
          <div className="casca-sheet__body">{children}</div>
        </div>
      </div>
    </CascaPortal>
  );
}
