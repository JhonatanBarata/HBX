"use client";

// <WhatsAppPreview> — o preview padrão do sistema: cara FIEL de WhatsApp
// (moldura de celular, cabeçalho verde, wallpaper escuro, balões com rabicho,
// ✓✓ azul de lido, "digitando…"). Pintura SÓ via tokens var(--wa-*) (skeleton.css);
// estilo em hbx-theme/whatsapp.css. ZERO cor/hex inline (5 Leis).
//
// Estado vazio (pedido do dono): sem mensagens E sem "digitando" → placeholder
// discreto, nenhum balão. O preview só popula quando há conteúdo.
//
// Props extras além do display (messages/typing/header): quickReplies + footer
// são opcionais — servem ao "Testar bot" (composer dentro do telefone). O tutofig
// usa só o display (read-only), passando nada disso.

import type React from "react";

export type WAMessage = {
  dir: "in" | "out";
  text: string;
  time?: string;
  status?: "sent" | "read";
};

export type WAHeader = {
  name: string;
  avatar?: string;
  status?: string;
};

export type WhatsAppPreviewProps = {
  messages: WAMessage[];
  typing?: boolean;
  header?: WAHeader;
  /** Texto do placeholder quando vazio. */
  emptyHint?: string;
  /** Respostas rápidas (botões de menu do bot), renderizadas após o último balão. */
  quickReplies?: string[];
  onQuickReply?: (q: string) => void;
  /** Composer opcional dentro do telefone (caso "Testar bot"). */
  footer?: React.ReactNode;
  /** ref do contêiner rolável (pra auto-scroll). */
  bodyRef?: React.Ref<HTMLDivElement>;
  className?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WhatsAppPreview({
  messages,
  typing = false,
  header,
  emptyHint = "A prévia aparece quando você escreve a mensagem",
  quickReplies,
  onQuickReply,
  footer,
  bodyRef,
  className,
}: WhatsAppPreviewProps) {
  const name = header?.name ?? "Contato";
  const headerStatus = typing ? "digitando…" : (header?.status ?? "online");
  const isEmpty = messages.length === 0 && !typing;

  return (
    <div className={"wa-phone" + (className ? " " + className : "")}>
      <div className="wa-phone__screen">
        {/* Cabeçalho verde */}
        <div className="wa-head">
          <span className="wa-head__avatar" aria-hidden="true">
            {header?.avatar
              // avatar minúsculo no preview (pode ser data URL) — next/image é exagero aqui
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={header.avatar} alt="" />
              : initials(name)}
          </span>
          <span className="wa-head__id">
            <span className="wa-head__name">{name}</span>
            <span className="wa-head__status">{headerStatus}</span>
          </span>
        </div>

        {/* Corpo / wallpaper */}
        <div className="wa-body" ref={bodyRef}>
          {isEmpty ? (
            <div className="wa-empty">
              <span className="wa-empty__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" />
                </svg>
              </span>
              {emptyHint}
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div key={i} className={"wa-msg wa-msg--" + m.dir}>
                  <div className="wa-bubble">
                    <span className="wa-bubble__text">{m.text}</span>
                    <span className="wa-bubble__meta">
                      {m.time && <span className="wa-bubble__time">{m.time}</span>}
                      {m.dir === "out" && (
                        <span className={"wa-tick" + (m.status === "read" ? " wa-tick--read" : "")} aria-hidden="true">✓✓</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}

              {typing && (
                <div className="wa-msg wa-typing-row">
                  <span className="wa-typing" aria-label="digitando">
                    <i /><i /><i />
                  </span>
                </div>
              )}

              {quickReplies && quickReplies.length > 0 && (
                <div className="wa-quick">
                  {quickReplies.map(q => (
                    <button key={q} type="button" className="wa-quick__btn" onClick={() => onQuickReply?.(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {footer && <div className="wa-foot">{footer}</div>}
      </div>
    </div>
  );
}

export default WhatsAppPreview;
