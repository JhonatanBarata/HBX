"use client";

// S01 (PADRAO-MERCADO) — kit/phone-preview.tsx: extrai o "telefone de
// prévia" que vivia DUPLICADO em secao-atendente.tsx (AtendenteSandbox) e
// secao-cobranca.tsx (CobrancaPreview) — mesma casca (.ia-chat-dock e
// vizinhas, classes que já existem em hbx-theme/assistente.css — ZERO CSS
// novo aqui) num componente único. Aparência IDÊNTICA à anterior: mesmas
// classes aplicadas no mesmo DOM, só o dado que muda por chamador. Slots:
// chrome do dock (título / emblema opcional / selo de segurança / linha de
// rodapé) + pass-through pro <WhatsAppPreview> já existente (header
// nome/avatar, bolhas = mensagens, botões = quickReplies, input opcional =
// footer). Prospecção (S05) passa a poder usar o mesmo componente.
import type React from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { WhatsAppPreview, type WAHeader, type WAMessage } from "@/components/hbx/whatsapp-preview";

export type PhonePreviewProps = {
  /** Título da barra do dock (Lei nº1 do README — curto). */
  title: string;
  /** Emblema opcional à direita do título (ex.: "Teste nº 3", "IA"). */
  badge?: React.ReactNode;
  /** Selo de segurança do dock — default "Sem chip" (nunca dispara WhatsApp real). */
  safeLabel?: string;
  /** Linha abaixo do celular (fonte da resposta, aviso fixo, etc.). */
  footerNote: React.ReactNode;

  // Pass-through pro <WhatsAppPreview> (telefone em si) — mesmos slots de sempre.
  messages: WAMessage[];
  header: WAHeader;
  emptyHint?: string;
  quickReplies?: string[];
  onQuickReply?: (q: string) => void;
  footer?: React.ReactNode;
  typing?: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
};

export function PhonePreview({
  title,
  badge,
  safeLabel = "Sem chip",
  footerNote,
  messages,
  header,
  emptyHint,
  quickReplies,
  onQuickReply,
  footer,
  typing,
  bodyRef,
}: PhonePreviewProps) {
  return (
    <div className="ia-chat-dock">
      <div className="ia-chat-dock__bar">
        <I d={ICONS.smile} size={15} />
        <span className="ia-chat-dock__title">{title}</span>
        {badge && <span className="ia-chat-dock__no">{badge}</span>}
        <span className="ia-chat-dock__safe"><I d={ICONS.check} size={11} /> {safeLabel}</span>
      </div>

      <WhatsAppPreview
        className="ia-chat-phone"
        messages={messages}
        typing={typing}
        bodyRef={bodyRef}
        header={header}
        emptyHint={emptyHint}
        quickReplies={quickReplies}
        onQuickReply={onQuickReply}
        footer={footer}
      />

      <div className="ia-chat-dock__src">{footerNote}</div>
    </div>
  );
}
