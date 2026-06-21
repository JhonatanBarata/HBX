"use client";

// BotStatusIcon — indicador visual de status do bot (ativo/inativo).
// Props:
//   accessible — módulo "bot" acessível via /modules/me (key==="bot" && accessible===true)
// Visual:
//   acessível   → cor do tema (wa-action-btn--active = var(--hbx-brand-strong))
//   inacessível → apagado (disabled + opacity:0.38, igual ao WhatsAppActionButton desconectado)
// Não faz chamada de API — a tela pai lê /modules/me e passa o booleano.
// Design System: zero cor/hex/inline visual — só classes centrais do kit.

import React from "react";
import { I, ICONS } from "@/components/hbx/shell";

interface BotStatusIconProps {
  accessible: boolean;
}

export function BotStatusIcon({ accessible }: BotStatusIconProps) {
  return (
    <button
      type="button"
      className={"icon-ghost wa-action-btn" + (accessible ? " wa-action-btn--active" : "")}
      aria-label={accessible ? "Bot ativo" : "Bot inativo"}
      title={accessible ? "Bot ativo" : "Bot inativo"}
      disabled={!accessible}
      style={{ cursor: accessible ? "default" : "not-allowed" }}
    >
      <I d={ICONS.bot} size={17} />
    </button>
  );
}
