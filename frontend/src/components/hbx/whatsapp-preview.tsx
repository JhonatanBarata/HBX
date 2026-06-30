"use client";

// <WhatsAppPreview> — frame de celular pixel-perfect + chat FIEL ao WhatsApp.
// Pintura SÓ via tokens var(--wa-*) (skeleton.css). Zero hex inline (5 Leis).
// Estrutura: ilha dinâmica → status bar → header completo → body → composer estático → home bar.

import type React from "react";

export type WAMessage = {
  dir: "in" | "out";
  text: string;
  time?: string;
  status?: "sent" | "read";
  // Nota de sistema (não é balão): centro do chat, ex.: "Bot passou pro humano".
  system?: boolean;
  tone?: "green" | "yellow" | "red" | "gray";
  // Variantes alternadas do motor: quando >1, o balão ganha setas ‹ x/y › para
  // o dono navegar e ver cada variante que o bot reveza.
  variants?: string[];
  variant?: number;
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
  emptyHint?: string;
  quickReplies?: string[];
  onQuickReply?: (q: string) => void;
  footer?: React.ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
  className?: string;
  // Navegar entre variantes de um balão (seta ‹ ›). dir: -1 anterior, +1 próxima.
  onCycleVariant?: (index: number, dir: -1 | 1) => void;
  // Clicar no "digitando…" pula a espera (o tempo configurado pode ser longo).
  onSkipTyping?: () => void;
  typingHint?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function currentTime(): string {
  const now = new Date();
  return now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
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
  onCycleVariant,
  onSkipTyping,
  typingHint,
}: WhatsAppPreviewProps) {
  const name = header?.name ?? "Contato";
  const headerStatus = typing ? "digitando…" : (header?.status ?? "online");
  const isEmpty = messages.length === 0 && !typing;

  return (
    <div className={"wa-phone" + (className ? " " + className : "")}>
      {/* Ilha dinâmica */}
      <div className="wa-phone__island" aria-hidden="true" />

      <div className="wa-phone__screen">

        {/* Barra de status */}
        <div className="wa-status" aria-hidden="true">
          <span className="wa-status__time">{currentTime()}</span>
          <div className="wa-status__icons">
            {/* Sinal de rede */}
            <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden="true">
              <rect x="0"  y="6" width="2.5" height="4" rx="0.8" opacity="1"/>
              <rect x="3.5" y="4" width="2.5" height="6" rx="0.8" opacity="1"/>
              <rect x="7"  y="2" width="2.5" height="8" rx="0.8" opacity="1"/>
              <rect x="10.5" y="0" width="2.5" height="10" rx="0.8" opacity="0.35"/>
            </svg>
            {/* Wi-Fi */}
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M1 3.5 C3.5 1 9.5 1 12 3.5" opacity="0.35"/>
              <path d="M2.8 5.3 C4.2 3.8 8.8 3.8 10.2 5.3"/>
              <path d="M4.6 7.1 C5.3 6.4 7.7 6.4 8.4 7.1"/>
              <circle cx="6.5" cy="9" r="0.8" fill="currentColor" stroke="none"/>
            </svg>
            {/* Bateria */}
            <svg width="22" height="11" viewBox="0 0 22 11" fill="none" aria-hidden="true">
              <rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke="currentColor" strokeOpacity="0.55"/>
              <rect x="1.5" y="1.5" width="15" height="8" rx="1.5" fill="currentColor"/>
              <path d="M19.5 3.5 C20.8 3.5 21.5 4 21.5 5.5 C21.5 7 20.8 7.5 19.5 7.5 L19.5 3.5Z" fill="currentColor" opacity="0.55"/>
            </svg>
          </div>
        </div>

        {/* Cabeçalho do WhatsApp */}
        <div className="wa-head">
          {/* Seta voltar */}
          <button type="button" className="wa-head__back" aria-label="Voltar" tabIndex={-1}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M5 12l7 7M5 12l7-7"/>
            </svg>
          </button>

          {/* Avatar */}
          <span className="wa-head__avatar">
            {header?.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={header.avatar} alt="" />
              : initials(name)}
          </span>

          {/* Nome e status */}
          <span className="wa-head__id">
            <span className="wa-head__name">{name}</span>
            <span className="wa-head__status">{headerStatus}</span>
          </span>

          {/* Ações direita */}
          <div className="wa-head__actions" aria-hidden="true">
            <button type="button" className="wa-head__action" tabIndex={-1} aria-label="Chamada de vídeo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/>
                <rect x="3" y="7" width="12" height="10" rx="2"/>
              </svg>
            </button>
            <button type="button" className="wa-head__action" tabIndex={-1} aria-label="Ligar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </button>
            <button type="button" className="wa-head__action" tabIndex={-1} aria-label="Mais opções">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5"  r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Corpo / mensagens */}
        <div className="wa-body" ref={bodyRef}>
          {isEmpty ? (
            <div className="wa-empty">
              <span className="wa-empty__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1121 11.5z"/>
                </svg>
              </span>
              {emptyHint}
            </div>
          ) : (
            <>
              {messages.map((m, i) => {
                if (m.system) {
                  return (
                    <div key={i} className={"wa-note wa-note--" + (m.tone || "gray")}>
                      <span className="wa-note__text">{m.text}</span>
                    </div>
                  );
                }
                const total = m.variants?.length ?? 0;
                const active = total > 0 ? Math.min(Math.max(m.variant ?? 0, 0), total - 1) : 0;
                return (
                  <div key={i} className={"wa-msg wa-msg--" + m.dir}>
                    <div className="wa-bubble">
                      <span className="wa-bubble__text">{m.text}</span>
                      {total > 1 && onCycleVariant && (
                        <span className="wa-variant" aria-label="Variantes alternadas do bot">
                          <button type="button" className="wa-variant__nav" aria-label="Variante anterior" onClick={() => onCycleVariant(i, -1)}>‹</button>
                          <span className="wa-variant__count">{active + 1}/{total}</span>
                          <button type="button" className="wa-variant__nav" aria-label="Próxima variante" onClick={() => onCycleVariant(i, 1)}>›</button>
                        </span>
                      )}
                      <span className="wa-bubble__meta">
                        {m.time && <span className="wa-bubble__time">{m.time}</span>}
                        {m.dir === "out" && (
                          <span className={"wa-tick" + (m.status === "read" ? " wa-tick--read" : "")} aria-hidden="true">✓✓</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              {typing && (
                <div className="wa-msg wa-typing-row">
                  {onSkipTyping ? (
                    <button type="button" className="wa-typing wa-typing--skip" onClick={onSkipTyping} title={typingHint || "Pular a espera"} aria-label={typingHint || "digitando — clique para pular"}>
                      <i /><i /><i />
                      {typingHint && <span className="wa-typing__hint">{typingHint}</span>}
                    </button>
                  ) : (
                    <span className="wa-typing" aria-label="digitando">
                      <i /><i /><i />
                    </span>
                  )}
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

        {/* Composer estático (visual) */}
        {!footer && (
          <div className="wa-compose" aria-hidden="true">
            <button type="button" className="wa-compose__icon-btn" tabIndex={-1}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </button>
            <div className="wa-compose__field">
              <span className="wa-compose__placeholder">Mensagem</span>
              <button type="button" className="wa-compose__icon-btn wa-compose__attach" tabIndex={-1}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
            </div>
            <button type="button" className="wa-compose__mic-btn" tabIndex={-1}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
          </div>
        )}

        {footer && <div className="wa-foot">{footer}</div>}
      </div>

      {/* Indicador de home */}
      <div className="wa-phone__home" aria-hidden="true" />
    </div>
  );
}

export default WhatsAppPreview;
