// MOBILE-CASCA/W3 — tipos e helpers compartilhados entre lista e chat.
// Espelham (mesmo contrato, sem importar — os tipos do desktop não são
// exportados) os tipos locais de app/(app)/atendimento/page.client.tsx.
// Mesma API: GET /inbox/conversations, GET .../messages, POST .../message,
// POST .../media, PATCH .../read, GET /inbox/whatsapp-health,
// GET /inbox/whatsapp-session. Zero endpoint novo.
// FAXINA 31/07/2026: presença e foto de perfil saíram aqui também (a lei do
// dono é "padronizar = IGUALAR" — não dá pra limpar a tela grande e deixar a
// casca compacta imitando o WhatsApp).

export type MsgMeta = {
  normalizedMessageType?: string | null;
  resolvedText?: string | null;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  isVoiceNote?: boolean;
  reactionEmoji?: string | null;
  reactionTargetKeyId?: string | null;
  providerKeyId?: string | null;
  providerMessageId?: string | null;
  quotedMessageId?: string | null;
  quotedPreview?: string | null;
  isDeleted?: boolean;
  senderName?: string | null;
} | null;

export type InboxMessage = {
  id: string;
  direction: string; // inbound | outbound
  content: string;
  createdAt: string;
  messageType?: string;
  status?: string;
  error?: string | null;
  metadata?: MsgMeta;
};

export type InboxConversation = {
  id: string;
  contact: string | null;
  lastMessageAt: string | null;
  botActive: boolean | null;
  humanAssigned: boolean | null;
  whatsappConnectionSessionId?: string | null;
  attendanceMode?: "shared" | "individual" | null;
  assignedUserId?: number | null;
  assignedToName?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: {
    name: string | null;
    phone: string | null;
    email: string | null;
    suggestedName?: string | null;
    isRegistered?: boolean;
  } | null;
  messages?: InboxMessage[];
};

export type MessagesResponse = { messages: InboxMessage[]; hasMore?: boolean; nextBefore?: string | null };

// Nunca deixar JID técnico chegar na tela (ordem do dono 17/06: "não existe
// número lid"). @s.whatsapp.net/@g.us/@broadcast/@newsletter também não.
export function cleanContact(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/@(lid|s\.whatsapp\.net|c\.us|g\.us|broadcast|newsletter)/i.test(raw)) return null;
  return raw;
}

export function phoneFromContact(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^\+?(\d{8,15})@(?:s\.whatsapp\.net|c\.us)$/i);
  if (m) return m[1];
  return cleanContact(raw);
}

export function convName(c: InboxConversation): string {
  return (
    cleanContact(c.customer?.name) ||
    phoneFromContact(c.customer?.phone) ||
    phoneFromContact(c.contact) ||
    "Contato WhatsApp"
  );
}

export function convUnread(c: InboxConversation): number {
  const raw = (c.metadata as Record<string, unknown> | null | undefined)?.["whatsappUnreadCount"];
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export function isNovaConversa(c: InboxConversation | null | undefined): boolean {
  const started = (c?.metadata as Record<string, unknown> | null | undefined)?.["manualConversationStarted"];
  return Boolean(started) && (c?.messages?.length ?? 0) === 0;
}

export function fmtConvTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function fmtMsgTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDur(secs?: number | null): string {
  const s = Math.max(0, Math.round(Number(secs || 0)));
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function msgType(m: InboxMessage): string {
  return String(m.metadata?.normalizedMessageType || m.messageType || "text").toLowerCase();
}

// Prévia de 1 linha da lista, com os prefixos do mockup: "Você:", robô, "Áudio
// · 0:37", "Foto". Espelha o corpo do balão (renderBody) do desktop, mas em
// texto curto — sem baixar mídia, só rotular o tipo.
export function convPreview(c: InboxConversation): { text: string; isBot: boolean } {
  const last = (c.messages && c.messages.length > 0) ? c.messages[c.messages.length - 1] : null;
  if (!last) return { text: isNovaConversa(c) ? "Conversa criada — envie a 1ª mensagem" : "Sem mensagens", isBot: false };
  const meta = last.metadata || {};
  if (meta.isDeleted) return { text: "Mensagem apagada", isBot: false };
  const type = msgType(last);
  const out = last.direction === "outbound";
  const isBot = out && c.botActive === true && !c.humanAssigned;
  const prefix = isBot ? "" : (out ? "Você: " : "");
  let body: string;
  switch (type) {
    case "image": body = "Foto"; break;
    case "sticker": body = "Figurinha"; break;
    case "video": body = "Vídeo"; break;
    case "audio": body = `Áudio · ${fmtDur(meta.durationSeconds)}`; break;
    case "document": body = meta.fileName || "Documento"; break;
    default: body = last.content || "";
  }
  return { text: `${prefix}${body}`, isBot };
}
