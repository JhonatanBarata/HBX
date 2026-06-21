"use client";

// WhatsAppActionButton — ícone de ação WhatsApp reutilizável (Vendas + Radar).
// UM clique abre direto no modo PADRÃO escolhido pelo usuário (Topbar → ícone do
// WhatsApp): "interno" (atendimento) ou "externo" (wa.me). Não pergunta a cada clique.
// Interno indisponível (sem QR ou sem acesso ao Atendimento) → cai no externo.
// A tela pai faz as chamadas de API; aqui só decidimos qual callback disparar.
// Design System: zero cor/hex/inline visual — só classes centrais do kit.

import { WhatsAppMark } from "@/components/hbx/shell";
import { useWaOpenMode } from "@/lib/wa-open-mode";

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
  const mode = useWaOpenMode();
  const hasPhone = Boolean(phone);
  const connected = qrActive && hasPhone;          // verde = WhatsApp da empresa conectado
  const internalReady = canInternal && qrActive;   // interno exige acesso ao módulo + QR ativo
  const useInternal = mode === "internal" && internalReady;

  function handleClick() {
    if (!hasPhone || startBusy) return;
    if (useInternal) onOpenInternal();
    else onOpenExternal();                          // externo (wa.me) não exige conexão; é o fallback do interno
  }

  const title = !hasPhone
    ? "Card sem telefone"
    : startError
    ? startError
    : startBusy
    ? "Abrindo…"
    : useInternal
    ? "Abrir no atendimento interno"
    : "Abrir no WhatsApp (externo)";

  return (
    <div className="wa-action-wrap" style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={"icon-ghost wa-action-btn" + (connected ? " wa-action-btn--active" : "")}
        aria-label={title}
        title={title}
        onClick={handleClick}
        disabled={!hasPhone || startBusy}
      >
        <WhatsAppMark size={17} />
      </button>
    </div>
  );
}
