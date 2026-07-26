"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clientTimelineDescription } from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { Av, I, ICONS, WhatsAppMark } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

export type LeadCockpitComposerMode = "whatsapp" | "email" | "observacao" | "atividade";

export type LeadCockpitCommand = {
  mode: LeadCockpitComposerMode;
  seq: number;
  draft?: string;
};

export type LeadCockpitTimelineEvent = {
  id: string;
  eventType?: string | null;
  title: string | null;
  description: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  content: string;
  createdAt: string | null;
  messageType: string;
  senderType: string;
  sourceModule: string | null;
  status: string;
  error: string | null;
};

type LeadActivity = {
  id: string;
  tipo: string;
  titulo: string;
  vencimento: string | null;
  realizadaEm: string | null;
  resultado: string | null;
  pendente: boolean;
  atrasada: boolean;
  createdAt: string | null;
};

type LocalTimelineEvent = LeadCockpitTimelineEvent;

type FeedItem =
  | { kind: "whatsapp"; id: string; at: string | null; message: ConversationMessage }
  | { kind: "event"; id: string; at: string | null; event: LeadCockpitTimelineEvent }
  | { kind: "activity"; id: string; at: string | null; activity: LeadActivity };

type EmailPreview = {
  subject: string;
  text: string;
  to: string;
};

const COMPOSER_MODES: Array<{ key: LeadCockpitComposerMode; label: string; icon: string[] }> = [
  { key: "whatsapp", label: "WhatsApp", icon: ICONS.msg },
  { key: "email", label: "E-mail", icon: ICONS.mail },
  { key: "observacao", label: "Observação", icon: ICONS.doc },
  { key: "atividade", label: "Atividade", icon: ICONS.clock },
];

const ACTIVITY_LABELS: Record<string, string> = {
  ligacao: "Ligação",
  reuniao: "Reunião",
  visita: "Visita",
  mensagem: "Mensagem",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function payloadSource(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  const nested = asRecord(root.data);
  return (
    "messages" in nested
    || "conversation" in nested
    || "engagement" in nested
    || "atividades" in nested
  ) ? nested : root;
}

function normalizeMessage(value: unknown, index: number): ConversationMessage {
  const raw = asRecord(value);
  const direction = String(raw.direction || "").trim().toLowerCase();
  const createdAt = raw.createdAt ?? raw.timestamp ?? null;
  return {
    id: String(raw.id ?? `message-${index}`),
    direction,
    content: String(raw.content ?? raw.body ?? ""),
    createdAt: createdAt == null ? null : String(createdAt),
    messageType: String(raw.messageType || "text").trim().toLowerCase(),
    senderType: String(raw.senderType || "system").trim().toLowerCase(),
    sourceModule: raw.sourceModule == null ? null : String(raw.sourceModule).trim().toLowerCase(),
    status: String(raw.status || "").trim().toUpperCase(),
    error: raw.error == null ? null : String(raw.error),
  };
}

function normalizeMessages(value: unknown): ConversationMessage[] {
  return Array.isArray(value) ? value.map(normalizeMessage) : [];
}

function normalizeActivity(value: unknown, index: number): LeadActivity {
  const raw = asRecord(value);
  return {
    id: String(raw.id ?? `activity-${index}`),
    tipo: String(raw.tipo || "ligacao").trim().toLowerCase(),
    titulo: String(raw.titulo || "Atividade"),
    vencimento: raw.vencimento == null ? null : String(raw.vencimento),
    realizadaEm: raw.realizadaEm == null ? null : String(raw.realizadaEm),
    resultado: raw.resultado == null ? null : String(raw.resultado),
    pendente: Boolean(raw.pendente),
    atrasada: Boolean(raw.atrasada),
    createdAt: raw.createdAt == null ? null : String(raw.createdAt),
  };
}

function parseConversationId(value: unknown): string | null {
  const source = payloadSource(value);
  const conversation = asRecord(source.conversation);
  const id = conversation.id ?? source.conversationId ?? null;
  return id == null ? null : String(id);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function deliveryLabel(statusRaw: string): string | null {
  const status = String(statusRaw || "").toUpperCase();
  if (status === "QUEUED" || status === "PENDING") return "Na fila";
  if (status === "SENDING" || status === "PROCESSING") return "Enviando";
  if (status === "SENT") return "Enviado";
  if (status === "DELIVERED") return "Entregue";
  if (status === "READ") return "Lida";
  if (status === "FAILED") return "Falha no envio";
  if (status === "CANCELED" || status === "CANCELLED") return "Envio cancelado";
  return null;
}

function visibleCopy(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\bApresentacao\b/g, "Apresentação")
    .replace(/\bapresentacao\b/g, "apresentação")
    .replace(/\bCadencia ativa\b/g, "Robô ativo");
}

function defaultActivityDate(): string {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function LeadCockpitHistory({
  leadId,
  leadName,
  phone,
  email,
  currentNote,
  conversationId: initialConversationId,
  timeline,
  whatsappStatus,
  emailReady,
  command,
  onConnectWhatsapp,
  onConfigureEmail,
  onChanged,
}: {
  leadId: string;
  leadName: string | null;
  phone: string | null;
  email: string | null;
  currentNote: string | null;
  conversationId?: string | number | null;
  timeline?: LeadCockpitTimelineEvent[] | null;
  whatsappStatus: boolean | null;
  emailReady: boolean | null;
  command: LeadCockpitCommand;
  onConnectWhatsapp: () => void;
  onConfigureEmail: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<LeadCockpitComposerMode>("whatsapp");
  const modePill = useGlassPill<HTMLButtonElement>(mode, COMPOSER_MODES.length);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [localEvents, setLocalEvents] = useState<LocalTimelineEvent[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId == null ? null : String(initialConversationId),
  );
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [optOutBusy, setOptOutBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState(currentNote || "");
  const [savedNote, setSavedNote] = useState(currentNote || "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState("ligacao");
  const [activityDate, setActivityDate] = useState(defaultActivityDate);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const pollBusyRef = useRef(false);
  const commandSeqRef = useRef(0);

  const applyMessagePayload = useCallback((payload: unknown, prepend = false) => {
    const source = payloadSource(payload);
    if ("messages" in source) {
      const parsed = normalizeMessages(source.messages);
      setMessages((current) => prepend ? [...parsed, ...current] : parsed);
      setHasMore(Boolean(source.hasMore));
      setNextBefore(source.nextBefore == null
        ? (Boolean(source.hasMore) ? parsed[0]?.createdAt || null : null)
        : String(source.nextBefore));
    }
    const nextConversationId = parseConversationId(payload);
    if (nextConversationId) setConversationId(nextConversationId);
  }, []);

  const loadMessages = useCallback(async (silent = false) => {
    if (pollBusyRef.current) return;
    pollBusyRef.current = true;
    if (!silent) {
      setHistoryLoading(true);
      setHistoryError(null);
    }
    try {
      const response = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30`,
      );
      applyMessagePayload(response);
    } catch (error) {
      if (!silent) setHistoryError(error instanceof Error ? error.message : "Não foi possível carregar as mensagens.");
    } finally {
      pollBusyRef.current = false;
      if (!silent) setHistoryLoading(false);
    }
  }, [applyMessagePayload, leadId]);

  const loadActivities = useCallback(async () => {
    try {
      const response = await apiFetch<unknown>(`/atividades/lead/${encodeURIComponent(leadId)}`);
      const source = payloadSource(response);
      const parsed = Array.isArray(source.atividades)
        ? source.atividades.map(normalizeActivity)
        : [];
      setActivities(parsed);
    } catch {
      setActivities([]);
    }
  }, [leadId]);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadMessages(), loadActivities()]);
    })();
  }, [loadActivities, loadMessages]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadMessages(true);
    }, 9_000);
    return () => window.clearInterval(intervalId);
  }, [loadMessages]);

  useEffect(() => {
    if (command.seq === commandSeqRef.current) return;
    commandSeqRef.current = command.seq;
    queueMicrotask(() => {
      setMode(command.mode);
      if (command.mode === "whatsapp" && command.draft) setMessageDraft(command.draft);
    });
  }, [command]);

  const feedItems = useMemo(() => {
    const byKey = new Map<string, FeedItem>();
    messages.forEach((message) => {
      byKey.set(`whatsapp:${message.id}`, {
        kind: "whatsapp",
        id: `whatsapp:${message.id}`,
        at: message.createdAt,
        message,
      });
    });
    [...localEvents, ...(timeline || [])]
      .filter((event) => event.eventType !== "inbound_reply")
      .forEach((event) => {
        byKey.set(`event:${event.id}`, {
          kind: "event",
          id: `event:${event.id}`,
          at: event.createdAt || event.returnAt || null,
          event,
        });
      });
    activities
      .filter((activity) => activity.pendente)
      .forEach((activity) => {
        byKey.set(`activity:${activity.id}`, {
          kind: "activity",
          id: `activity:${activity.id}`,
          at: activity.createdAt || activity.vencimento,
          activity,
        });
      });
    return [...byKey.values()].sort((left, right) => {
      const leftAt = left.at ? new Date(left.at).getTime() : 0;
      const rightAt = right.at ? new Date(right.at).getTime() : 0;
      return leftAt - rightAt;
    });
  }, [activities, localEvents, messages, timeline]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [feedItems.length]);

  async function loadOlderMessages() {
    if (!nextBefore || olderBusy) return;
    setOlderBusy(true);
    try {
      const response = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30&before=${encodeURIComponent(nextBefore)}`,
      );
      applyMessagePayload(response, true);
    } finally {
      setOlderBusy(false);
    }
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const created = await apiFetch<unknown>(
      `/vendas/lead/${encodeURIComponent(leadId)}/conversation`,
      { method: "POST", body: JSON.stringify({}) },
    );
    const id = parseConversationId(created);
    if (!id) throw new Error("Não foi possível abrir a conversa.");
    setConversationId(id);
    return id;
  }

  async function sendWhatsapp() {
    const content = messageDraft.trim();
    if (!content || sendBusy || !phone) return;
    setSendBusy(true);
    setSendMessage(null);
    const optimisticId = `queued-${Date.now()}`;
    const optimistic: ConversationMessage = {
      id: optimisticId,
      direction: "outbound",
      content,
      createdAt: new Date().toISOString(),
      messageType: "text",
      senderType: "user",
      sourceModule: "vendas_human",
      status: "QUEUED",
      error: null,
    };
    setMessages((current) => [...current, optimistic]);
    try {
      await ensureConversation();
      const response = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/message`,
        { method: "POST", body: JSON.stringify({ body: content }) },
      );
      setMessageDraft("");
      applyMessagePayload(response);
      await onChanged?.();
      window.setTimeout(() => { void loadMessages(true); }, 1_500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
      setMessages((current) => current.map((item) => item.id === optimisticId
        ? { ...item, status: "FAILED", error: message }
        : item));
      setSendMessage(message);
    } finally {
      setSendBusy(false);
    }
  }

  async function generateEmailPreview() {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      const response = await apiFetch<{ subject?: string; text?: string; recipientEmail?: string }>(
        `/vendas/leads/${encodeURIComponent(leadId)}/email/presentation/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setEmailPreview({
        subject: response?.subject || "",
        text: response?.text || "",
        to: response?.recipientEmail || email || "",
      });
      await onChanged?.();
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "Não foi possível gerar a prévia.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function sendEmail() {
    if (!emailPreview || emailBusy) return;
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(leadId)}/email/presentation/send`, {
        method: "POST",
        body: JSON.stringify({ subject: emailPreview.subject, text: emailPreview.text }),
      });
      setEmailMessage(`✓ E-mail enviado${emailPreview.to ? ` para ${emailPreview.to}` : ""}.`);
      setEmailPreview(null);
      await onChanged?.();
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "Não foi possível enviar o e-mail.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function registerEmailOptOut() {
    if (optOutBusy) return;
    setOptOutBusy(true);
    setEmailMessage(null);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(leadId)}/email/opt-out`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setEmailMessage("Registro feito. Este contato não receberá novos e-mails comerciais.");
      setEmailPreview(null);
      await onChanged?.();
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "Não foi possível registrar.");
    } finally {
      setOptOutBusy(false);
    }
  }

  async function saveObservation() {
    const note = noteDraft.trim();
    if (!note || noteBusy) return;
    if (note === savedNote.trim()) {
      setNoteMessage("A observação não mudou.");
      return;
    }
    setNoteBusy(true);
    setNoteMessage(null);
    try {
      const response = await apiFetch<{ event?: LeadCockpitTimelineEvent }>(
        `/vendas/lead/${encodeURIComponent(leadId)}/note`,
        { method: "POST", body: JSON.stringify({ note }) },
      );
      await apiFetch(`/vendas/lead/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        body: JSON.stringify({ shortNote: note.slice(0, 280) }),
      });
      if (response?.event?.id) setLocalEvents((current) => [response.event!, ...current]);
      setSavedNote(note);
      setNoteMessage("✓ Observação registrada na história.");
      await onChanged?.();
    } catch (error) {
      setNoteMessage(error instanceof Error ? error.message : "Não foi possível registrar a observação.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function createActivity() {
    const title = activityTitle.trim();
    const dueAt = localInputToIso(activityDate);
    if (!title || !dueAt || activityBusy) return;
    setActivityBusy(true);
    setActivityMessage(null);
    try {
      await apiFetch("/atividades", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          titulo: title,
          tipo: activityType,
          vencimento: dueAt,
        }),
      });
      setActivityTitle("");
      setActivityDate(defaultActivityDate());
      setActivityMessage("✓ Atividade criada.");
      await loadActivities();
      await onChanged?.();
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : "Não foi possível criar a atividade.");
    } finally {
      setActivityBusy(false);
    }
  }

  function renderFeedItem(item: FeedItem) {
    if (item.kind === "whatsapp") {
      const message = item.message;
      const outbound = message.direction === "outbound";
      const failed = message.status === "FAILED";
      const canceled = message.status === "CANCELED" || message.status === "CANCELLED";
      const automatic = message.sourceModule === "vendas_prospeccao_bot" || message.senderType === "bot";
      const delivery = outbound ? deliveryLabel(message.status) : null;
      return (
        <article
          key={item.id}
          className={`lead-history__message${outbound ? " is-outbound" : " is-inbound"}${failed || canceled ? " is-failed" : ""}`}
          data-kind={automatic ? "robot" : "whatsapp"}
        >
          {!outbound && <Av name={leadName || "—"} size={26} />}
          <div className="lead-history__bubble" title={message.error || undefined}>
            <span className="lead-history__message-author">
              {outbound ? (automatic ? "Robô" : "Você") : leadName || "Lead"}
            </span>
            <p>{message.content || (message.messageType !== "text" ? `[${message.messageType}]` : "")}</p>
            <small>{formatMessageTime(message.createdAt)}{delivery ? ` · ${delivery}` : ""}</small>
          </div>
        </article>
      );
    }

    if (item.kind === "activity") {
      const activity = item.activity;
      return (
        <article key={item.id} className="lead-history__event" data-kind="activity">
          <span className="lead-history__event-icon"><I d={ICONS.clock} size={13} /></span>
          <span className="lead-history__event-copy">
            <strong>{ACTIVITY_LABELS[activity.tipo] || "Atividade"} agendada</strong>
            <span>{activity.titulo}</span>
            <small>
              Criada em {formatDateTime(activity.createdAt)}
              {activity.vencimento ? ` · prevista para ${formatDateTime(activity.vencimento)}` : ""}
              {activity.atrasada ? " · atrasada" : ""}
            </small>
          </span>
        </article>
      );
    }

    const event = item.event;
    const description = visibleCopy(clientTimelineDescription(event.description) || event.resultLabel || "");
    const kind = event.eventType?.includes("email")
      ? "email"
      : event.eventType?.includes("robo")
        ? "robot"
        : event.eventType === "note"
          ? "note"
          : event.eventType?.includes("atividade")
            ? "activity"
            : "event";
    const icon = kind === "email"
      ? ICONS.mail
      : kind === "robot"
        ? ICONS.bolt
        : kind === "activity"
          ? ICONS.clock
          : ICONS.doc;
    return (
      <article key={item.id} className="lead-history__event" data-kind={kind}>
        <span className="lead-history__event-icon"><I d={icon} size={13} /></span>
        <span className="lead-history__event-copy">
          <strong>{visibleCopy(event.title) || "Atualização"}</strong>
          {description && <span>{description}</span>}
          <small>{formatDateTime(item.at)}</small>
        </span>
      </article>
    );
  }

  return (
    <section className="lead-history">
      <header className="lead-history__head">
        <span>
          <strong>História do lead</strong>
          <small>WhatsApp, e-mails, observações, etapas, robô e atividades.</small>
        </span>
        <span className="tag">{feedItems.length} eventos recentes</span>
      </header>

      <div className="lead-history__feed" ref={feedRef}>
        {hasMore && (
          <button type="button" className="lead-history__more" onClick={loadOlderMessages} disabled={olderBusy}>
            {olderBusy ? "Carregando…" : "Carregar mensagens anteriores"}
          </button>
        )}
        {historyLoading && feedItems.length === 0 ? (
          <div className="lead-history__empty">Carregando história…</div>
        ) : historyError && feedItems.length === 0 ? (
          <div className="lead-history__empty">
            <span>{historyError}</span>
            <button type="button" className="btn-ghost btn-xs" onClick={() => void loadMessages()}>Tentar novamente</button>
          </div>
        ) : feedItems.length === 0 ? (
          <div className="lead-history__empty">
            <strong>A história deste lead começa aqui.</strong>
            <span>Registre uma observação, atividade ou primeiro contato abaixo.</span>
          </div>
        ) : feedItems.map(renderFeedItem)}
      </div>

      <footer className="lead-history__composer">
        <nav className="glass-pill-track lead-history__composer-modes" aria-label="Tipo de interação">
          <GlassPill {...modePill} />
          {COMPOSER_MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              ref={modePill.itemRef(item.key)}
              className={`glass-pill-item lead-history__composer-mode${mode === item.key ? " is-active" : ""}`}
              aria-pressed={mode === item.key}
              onClick={() => setMode(item.key)}
            >
              <I d={item.icon} size={12} /> {item.label}
            </button>
          ))}
        </nav>

        {mode === "whatsapp" && (
          <div className="lead-history__composer-body">
            {!phone ? (
              <div className="lead-history__composer-note">Este lead não tem telefone cadastrado.</div>
            ) : whatsappStatus === false ? (
              <div className="lead-history__composer-note">
                <span>WhatsApp da empresa não está conectado.</span>
                <button type="button" className="btn-ghost btn-xs" onClick={onConnectWhatsapp}>
                  <WhatsAppMark size={12} /> Conectar WhatsApp
                </button>
              </div>
            ) : (
              <div className="lead-history__send-row">
                <textarea
                  className="field-dark"
                  rows={2}
                  maxLength={4000}
                  value={messageDraft}
                  placeholder="Escreva uma mensagem…"
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendWhatsapp();
                    }
                  }}
                  disabled={sendBusy}
                  aria-label="Mensagem de WhatsApp"
                />
                <button
                  type="button"
                  className="btn-teal lead-history__send-button"
                  onClick={() => void sendWhatsapp()}
                  disabled={sendBusy || !messageDraft.trim()}
                  aria-label="Enviar mensagem"
                  title="Enviar (Enter)"
                >
                  {sendBusy ? "…" : <I d={ICONS.send} size={16} />}
                </button>
              </div>
            )}
            {sendMessage && <span className="ctx-msg err">{sendMessage}</span>}
          </div>
        )}

        {mode === "email" && (
          <div className="lead-history__composer-body">
            {!email ? (
              <div className="lead-history__composer-note">Este lead não tem e-mail cadastrado.</div>
            ) : emailReady === false ? (
              <div className="lead-history__composer-note">
                <span>O e-mail da empresa ainda não está configurado.</span>
                <button type="button" className="btn-ghost btn-xs" onClick={onConfigureEmail}>Configurar e-mail</button>
              </div>
            ) : emailReady == null ? (
              <div className="lead-history__composer-note">Verificando configuração de e-mail…</div>
            ) : emailPreview ? (
              <div className="lead-history__email-preview">
                <span><small>Para</small><strong>{emailPreview.to || email}</strong></span>
                <span><small>Assunto</small><strong>{emailPreview.subject || "Sem assunto"}</strong></span>
                <p>{emailPreview.text || "—"}</p>
                <div className="lead-history__composer-actions">
                  <button type="button" className="btn-ghost btn-xs" onClick={generateEmailPreview} disabled={emailBusy}>Gerar de novo</button>
                  <button type="button" className="btn-teal btn-xs" onClick={sendEmail} disabled={emailBusy}>
                    <I d={ICONS.send} size={11} /> {emailBusy ? "Enviando…" : "Enviar e-mail"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="lead-history__composer-actions is-between">
                <button type="button" className="btn-teal btn-xs" onClick={generateEmailPreview} disabled={emailBusy}>
                  <I d={ICONS.mail} size={12} /> {emailBusy ? "Gerando…" : "Gerar prévia de apresentação"}
                </button>
                <button type="button" className="btn-ghost btn-xs" onClick={registerEmailOptOut} disabled={optOutBusy}>
                  {optOutBusy ? "Registrando…" : "Contato pediu remoção / sem interesse"}
                </button>
              </div>
            )}
            {emailMessage && <span className={`ctx-msg ${emailMessage.startsWith("✓") || emailMessage.startsWith("Registro") ? "ok" : "err"}`}>{emailMessage}</span>}
          </div>
        )}

        {mode === "observacao" && (
          <div className="lead-history__composer-body">
            <textarea
              className="field-dark"
              rows={3}
              maxLength={280}
              value={noteDraft}
              placeholder="Registre o contexto importante deste lead…"
              onChange={(event) => setNoteDraft(event.target.value)}
              aria-label="Observação do lead"
            />
            <div className="lead-history__composer-actions">
              {noteMessage && <span className={`ctx-msg ${noteMessage.startsWith("✓") ? "ok" : noteMessage.includes("não mudou") ? "" : "err"}`}>{noteMessage}</span>}
              <button type="button" className="btn-teal btn-xs" onClick={saveObservation} disabled={noteBusy || !noteDraft.trim()}>
                {noteBusy ? "Registrando…" : "Registrar observação"}
              </button>
            </div>
          </div>
        )}

        {mode === "atividade" && (
          <div className="lead-history__composer-body">
            <div className="lead-history__activity-form">
              <select className="field-dark" value={activityType} onChange={(event) => setActivityType(event.target.value)} aria-label="Tipo da atividade">
                {Object.entries(ACTIVITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input
                className="field-dark"
                maxLength={160}
                value={activityTitle}
                placeholder="O que precisa ser feito?"
                onChange={(event) => setActivityTitle(event.target.value)}
                aria-label="Título da atividade"
              />
              <input
                className="field-dark"
                type="datetime-local"
                value={activityDate}
                onChange={(event) => setActivityDate(event.target.value)}
                aria-label="Data da atividade"
              />
              <button type="button" className="btn-teal btn-xs" onClick={createActivity} disabled={activityBusy || !activityTitle.trim() || !activityDate}>
                {activityBusy ? "Criando…" : "Criar atividade"}
              </button>
            </div>
            {activityMessage && <span className={`ctx-msg ${activityMessage.startsWith("✓") ? "ok" : "err"}`}>{activityMessage}</span>}
          </div>
        )}
      </footer>
    </section>
  );
}
