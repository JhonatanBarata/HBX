"use client";

// Botão ÚNICO de conexão WhatsApp — a entrada padrão em todos os modos
// (mobile atendimento, entrega). Centralizado, sem transbordo. 5 Leis: só
// classe central (.wa-connect-btn no hbx-theme/screens.css), zero hex/inline.
// A folha/painel de conexão é o mesmo em todo lugar (WhatsAppConectarSheet /
// WhatsAppConnectModal) — este botão só dispara o open.

import { I, ICONS } from "@/components/hbx/shell";

export function WhatsAppConnectButton({
  onClick,
  label = "Conectar WhatsApp",
  disabled = false,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="wa-connect-btn" onClick={onClick} disabled={disabled}>
      <I d={ICONS.msg} size={16} />
      <span className="wa-connect-btn__label">{label}</span>
    </button>
  );
}
