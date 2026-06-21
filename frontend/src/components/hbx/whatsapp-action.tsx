"use client";

// WhatsAppActionButton — ícone de ação WhatsApp reutilizável (Vendas + Radar).
// Props:
//   phone      — telefone do lead (sem formatação obrigatória)
//   name       — nome do lead (para a conversa interna)
//   qrActive   — QR/chip do WhatsApp está acessível (whatsappSession.accessible)
//   canInternal — vendedor tem acesso ao módulo Atendimento (accessible em /modules/me)
//   onOpenExternal — callback de "WhatsApp Externo" (reutiliza a função da tela pai)
//   onOpenInternal — callback de "WhatsApp Interno" (tela pai faz start + navega)
//   startBusy  — true enquanto o start estiver em andamento
//   startError — mensagem de erro do último start (ou null)
// O componente NÃO faz a chamada de API — a tela pai faz e passa callbacks.
// Design System: zero cor/hex/inline visual — só classes centrais do kit.

import React, { useRef, useState } from "react";
import { WhatsAppMark } from "@/components/hbx/shell";

interface WhatsAppActionProps {
  phone: string | null | undefined;
  name?: string | null;
  qrActive: boolean;
  canInternal: boolean;
  onOpenExternal: () => void;
  onOpenInternal: () => void;
  startBusy?: boolean;
  startError?: string | null;
}

export function WhatsAppActionButton({
  phone,
  qrActive,
  canInternal,
  onOpenExternal,
  onOpenInternal,
  startBusy,
  startError,
}: WhatsAppActionProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Fecha o pop-up ao clicar fora
  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hasPhone = Boolean(phone);
  const active = qrActive && hasPhone;

  return (
    <div ref={wrapRef} className="wa-action-wrap" style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={"icon-ghost wa-action-btn" + (active ? " wa-action-btn--active" : "")}
        aria-label={active ? "Abrir no WhatsApp" : "Conecte o WhatsApp para usar esta ação"}
        title={
          !hasPhone
            ? "Card sem telefone"
            : !qrActive
            ? "Conecte o WhatsApp para usar esta ação"
            : "Abrir no WhatsApp"
        }
        onClick={() => { if (active) setOpen(o => !o); }}
        disabled={!active}
      >
        <WhatsAppMark size={17} />
      </button>

      {open && (
        <div className="hbx-pop wa-action-pop" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50 }}>
          <div className="wa-action-pop-title">Abrir automaticamente:</div>
          {startError && (
            <div className="wa-action-pop-err">{startError}</div>
          )}
          <button
            type="button"
            className="wa-action-pop-item"
            onClick={() => { setOpen(false); onOpenExternal(); }}
          >
            <WhatsAppMark size={14} />
            WhatsApp Externo
          </button>
          <button
            type="button"
            className={"wa-action-pop-item" + (!canInternal ? " wa-action-pop-item--disabled" : "")}
            disabled={!canInternal || startBusy}
            title={!canInternal ? "Você não tem acesso ao módulo Atendimento" : undefined}
            onClick={() => { if (canInternal && !startBusy) { setOpen(false); onOpenInternal(); } }}
          >
            <WhatsAppMark size={14} />
            {startBusy ? "Abrindo…" : "WhatsApp Interno"}
            {!canInternal && <span className="wa-action-pop-hint">Sem acesso</span>}
          </button>
          {/* TODO: mensagem rápida via GET /inbox/quick-replies — aguardando importação */}
        </div>
      )}
    </div>
  );
}
