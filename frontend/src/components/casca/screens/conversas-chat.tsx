"use client";

// MOBILE-CASCA/W3 — CHAT takeover (mockup aprovado 2). Abrir conversa = tela
// cheia com transição IR via <CascaView> (API da casca — tab bar SAI sozinha
// porque o .casca-stack-layer cobre a moldura inteira, z-index acima da
// tab bar; ver casca.css). Voltar = seta do próprio CascaView, transição
// VOLTAR. Header: CascaView já dá seta+título (nome) — telefone/atendente
// entram como legenda logo abaixo (1 linha fina, mesmo espírito do header
// 48px do mockup sem reinventar a API central). Menu ⋮ = actions do
// CascaView (atribuir atendente / ficha / encerrar).
//
// DADOS/ENVIO — EXATAMENTE os caminhos do desktop
// (app/(app)/atendimento/page.client.tsx): GET .../messages, POST
// .../message (texto + quoted), POST .../media + POST .../message (anexo),
// PATCH .../read, GET .../presence. Zero endpoint novo, zero caminho de
// envio novo — só uma UI mais enxuta sobre o mesmo dispatch.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { apiFetch, getApiBase } from "@/lib/api";
import { stampOnboardingEvent } from "@/lib/onboarding";

import { CascaView } from "../transitions";
import {
  convName,
  fmtDur,
  fmtMsgTime,
  msgType,
  phoneFromContact,
  type InboxConversation,
  type InboxMessage,
  type MessagesResponse,
  type Presence,
} from "./conversas-types";

function resolveMediaUrl(u?: string | null): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const base = getApiBase();
  return u.startsWith("/") ? base + u : `${base}/${u}`;
}

function attachKindFromMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function Checks({ status }: { status?: string }) {
  const s = (status || "").toUpperCase();
  if (s === "READ") return <span className="cvs-m__ck is-read">✓✓</span>;
  if (s === "DELIVERED") return <span className="cvs-m__ck">✓✓</span>;
  return <span className="cvs-m__ck">✓</span>;
}

// Barras da forma de onda: quantidade fixa, altura por token CSS (--h,
// nth-child no screens.css) — decorativo (o WhatsApp não manda amplitude por
// segmento na API que o desktop já consome), mas dá a "cara de áudio" que
// faltava (reprova do dono: "só um play, não tem tempo, nada"). Progresso
// real preenche as barras (currentTime/duration) — mesmo <audio> do desktop,
// só a pele visual muda de barra de progresso pra waveform.
const WAVE_BARS = 24;

function AudioBubble({ src, seconds }: { src: string; seconds?: number | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0); // 0–100
  const [dur, setDur] = useState<number | null>(seconds ?? null);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => { /* gesto/codec */ });
  }

  return (
    <div className="cvs-m__audio">
      <button type="button" className="cvs-m__audio-play" onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"}>
        <I d={playing ? ICONS.pause : ICONS.play} size={14} />
      </button>
      <span className="cvs-m__audio-wave" aria-hidden="true">
        {Array.from({ length: WAVE_BARS }, (_, i) => <i key={i} className="cvs-m__audio-bar" />)}
        <span className="cvs-m__audio-wave-fill" style={{ width: `${prog}%` }}>
          {Array.from({ length: WAVE_BARS }, (_, i) => <i key={i} className="cvs-m__audio-bar" />)}
        </span>
      </span>
      <span className="cvs-m__audio-dur">{fmtDur(dur)}</span>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProg(0); }}
        onLoadedMetadata={(e) => { const a = e.currentTarget; if (Number.isFinite(a.duration)) setDur(a.duration); }}
        onTimeUpdate={(e) => { const a = e.currentTarget; setProg(a.duration ? (a.currentTime / a.duration) * 100 : 0); }}
      />
    </div>
  );
}

function renderBody(m: InboxMessage) {
  const meta = m.metadata || {};
  if (meta.isDeleted) return <div className="cvs-m__cap">Mensagem apagada</div>;
  const type = msgType(m);
  const url = resolveMediaUrl(meta.mediaUrl || meta.previewUrl);
  const caption = m.content && m.content !== meta.fileName ? m.content : "";

  if (type === "image" || type === "sticker") {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element -- mídia do WhatsApp (URL externa/dinâmica)
      <img className="cvs-m__media-img" src={url} alt={meta.fileName || "imagem"} />
    ) : <div className="cvs-m__cap">Imagem</div>;
  }
  if (type === "video") {
    return url ? <video className="cvs-m__media-video" src={url} controls /> : <div className="cvs-m__cap">Vídeo</div>;
  }
  if (type === "audio") {
    return url ? <AudioBubble src={url} seconds={meta.durationSeconds} /> : <div className="cvs-m__cap">Áudio</div>;
  }
  if (type === "document") {
    return (
      <div className="cvs-m__doc">
        <I d={ICONS.file} size={16} />
        <span>{meta.fileName || m.content || "Documento"}</span>
      </div>
    );
  }
  return <div className="cvs-m__cap">{caption || m.content}</div>;
}

export function ConversasChat({
  conversationId,
  conversation,
  onClose,
}: {
  conversationId: string;
  conversation: InboxConversation | null;
  onClose: () => void;
}) {
  const [thread, setThread] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Troca de conversa (conversationId muda): volta pro estado "carregando" SEM
  // setState síncrono no efeito (react-hooks/set-state-in-effect) — ajuste
  // "durante o render" (mesmo padrão de useCascaExitGate em transitions.tsx).
  const [lastConvId, setLastConvId] = useState(conversationId);
  if (conversationId !== lastConvId) {
    setLastConvId(conversationId);
    setLoading(true);
  }
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadThread = useCallback(() => {
    return apiFetch<MessagesResponse>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages?limit=30`)
      .then(res => {
        const msgs = Array.isArray(res?.messages) ? res.messages.slice() : [];
        msgs.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        setThread(msgs);
        setThreadError(null);
      })
      .catch((err: unknown) => {
        setThreadError(err instanceof Error ? err.message : "Falha ao carregar a conversa.");
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    void loadThread();
    apiFetch(`/inbox/conversations/${encodeURIComponent(conversationId)}/read`, { method: "PATCH", body: JSON.stringify({}) }).catch(() => { /* segue */ });
    const t = setInterval(() => { if (alive) void loadThread(); }, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId, loadThread]);

  useEffect(() => {
    let alive = true;
    const poll = () => apiFetch<Presence>(`/inbox/conversations/${encodeURIComponent(conversationId)}/presence`)
      .then(p => { if (alive) setPresence(p || null); })
      .catch(() => { /* best-effort */ });
    void poll();
    const t = setInterval(poll, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId]);

  useEffect(() => {
    const el = endRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  async function send() {
    const content = draft.trim();
    if (!content || sendBusy) return;
    setSendBusy(true);
    setSendError(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(conversationId)}/message`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      void stampOnboardingEvent("first_conversation_started");
      setDraft("");
      await loadThread();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendBusy(false);
    }
  }

  async function sendAttachment(file: File) {
    setSendBusy(true);
    setSendError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await apiFetch<{ url: string; filename?: string; mimeType?: string; size?: number }>(
        `/inbox/conversations/${encodeURIComponent(conversationId)}/media`,
        { method: "POST", body: fd },
      );
      const kind = attachKindFromMime(file.type);
      const fallback = kind === "audio" ? "Mensagem de voz" : (file.name || "Anexo");
      await apiFetch(`/inbox/conversations/${encodeURIComponent(conversationId)}/message`, {
        method: "POST",
        body: JSON.stringify({
          content: fallback,
          attachmentKind: kind,
          attachmentUrl: up.url,
          attachmentMimeType: up.mimeType || file.type || undefined,
          attachmentFileName: file.name || up.filename || undefined,
          attachmentFileSize: up.size ?? file.size ?? undefined,
        }),
      });
      void stampOnboardingEvent("first_conversation_started");
      await loadThread();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar o anexo.");
    } finally {
      setSendBusy(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void sendAttachment(file);
  }

  async function encerrar() {
    setMenuOpen(false);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(conversationId)}/status-card`, {
        method: "PATCH",
        body: JSON.stringify({ doNotCall: true, closureReason: "sem_interesse" }),
      });
      onClose();
    } catch { /* silencioso — o desktop mostra o motivo, o mobile só tenta encerrar */ }
  }

  const name = conversation ? convName(conversation) : "Conversa";
  const phone = conversation ? (phoneFromContact(conversation.customer?.phone) || phoneFromContact(conversation.contact)) : null;
  const presenceLabel = presence?.typing ? "digitando…" : presence?.recording ? "gravando áudio…" : presence?.online ? "online" : (phone || "—");

  const threadWithDays = thread.map((m, i) => {
    const day = dayLabel(m.createdAt);
    const prevDay = i > 0 ? dayLabel(thread[i - 1].createdAt) : "";
    return { m, day, showDay: Boolean(day) && day !== prevDay };
  });

  return (
    <CascaView
      title={name}
      onClose={onClose}
      actions={
        <span className="cvs-m__menu-wrap">
          <button type="button" className="casca-top__act" onClick={() => setMenuOpen(o => !o)} aria-label="Mais ações" aria-expanded={menuOpen}>
            <span className="cvs-m__dots"><i /><i /><i /></span>
          </button>
          {menuOpen ? (
            <div className="hbx-pop cvs-m__menu">
              <button type="button" className="nav-item" onClick={() => setMenuOpen(false)}>Atribuir atendente</button>
              <button type="button" className="nav-item" onClick={() => setMenuOpen(false)}>Ver ficha</button>
              <button type="button" className="nav-item" onClick={encerrar}>Encerrar atendimento</button>
            </div>
          ) : null}
        </span>
      }
    >
      <div className="cvs-m__chat">
        <div className="cvs-m__chat-sub">
          <Av name={name} src={conversation?.customer?.avatarUrl || undefined} size={22} />
          <span className="cvs-m__chat-sub-text">{presenceLabel}</span>
        </div>

        {loading ? (
          <div className="cvs-m__chat-loading">Carregando…</div>
        ) : threadError ? (
          <div className="cvs-m__chat-loading is-err">{threadError}</div>
        ) : (
          <div className="cvs-m__msgs" ref={endRef}>
            {threadWithDays.length === 0 ? (
              <span className="cvs-m__day">Sem mensagens nesta conversa</span>
            ) : threadWithDays.map(({ m, day, showDay }) => {
              const out = m.direction === "outbound";
              const meta = m.metadata || {};
              const failed = (m.status || "").toUpperCase() === "FAILED";
              return (
                <React.Fragment key={m.id}>
                  {showDay ? <span className="cvs-m__day">{day}</span> : null}
                  <div className={"cvs-m__msg" + (out ? " is-out" : " is-in")}>
                    <div className={"cvs-m__bubble" + (meta.isDeleted ? " is-deleted" : "")}>
                      {meta.quotedPreview ? <div className="cvs-m__quote">{meta.quotedPreview}</div> : null}
                      {renderBody(m)}
                      <div className="cvs-m__tm">
                        {fmtMsgTime(m.createdAt)}
                        {out ? (failed ? <span className="cvs-m__ck is-err">falhou</span> : <Checks status={m.status} />) : null}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="cvs-m__composer">
          {sendError ? <div className="cvs-m__send-err">{sendError}</div> : null}
          <button type="button" className="cvs-m__compose-btn" onClick={() => fileRef.current?.click()} disabled={sendBusy} aria-label="Anexar">
            <I d={ICONS.clip} size={18} />
          </button>
          <input
            className="cvs-m__compose-field"
            placeholder="Mensagem"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
            disabled={sendBusy}
          />
          {draft.trim() ? (
            <button type="button" className="cvs-m__compose-send" onClick={send} disabled={sendBusy} aria-label="Enviar">
              <I d={ICONS.send} size={16} />
            </button>
          ) : (
            <button type="button" className="cvs-m__compose-btn" disabled aria-label="Gravar áudio" title="Gravação de áudio: use o computador por enquanto">
              <I d={ICONS.mic} size={18} />
            </button>
          )}
          <input ref={fileRef} type="file" hidden onChange={onPickFile}
            accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" />
        </div>
      </div>
    </CascaView>
  );
}
