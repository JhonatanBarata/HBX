"use client";

// Tela Atendimento (template docs/TEMAS/*/corporate/Atendimento.html) ligada
// no inbox real (WhatsApp via Webwhats — mensageria do backend):
//   - Conversas → GET /inbox/conversations?take=50
//   - Tempo real → GET /inbox/events (SSE via fetch streaming; EventSource
//     não envia Authorization). Evento "inbox" = recarrega lista + thread.
//     Polling 8s vira FALLBACK só enquanto o stream está desconectado.
//   - Thread → GET /inbox/conversations/:id/messages (paginação ?before=)
//   - Enviar → POST /inbox/conversations/:id/message { content, attachment?, quoted? }
//   - Mídia → POST /inbox/conversations/:id/media (multipart) → URL, depois envia
//   - Reenviar → POST /inbox/conversations/:id/messages/:mid/retry
//   - Mensagem rápida → GET/POST/DELETE /inbox/quick-replies
//   - Marcar lida → PATCH /inbox/conversations/:id/read
//   - Cadastrar nome → PATCH /inbox/conversations/:id/status-card { name }
//   - Nova conversa → POST /inbox/conversations/start { phone, name? }
//     (também recebe handoff do Leads via sessionStorage hbx:abrir-conversa)
//
// FAXINA 31/07/2026 (ordem do dono: "menos chat whatsapp, mais chat empresarial").
// Isto aqui é um ATENDIMENTO, não um clone do WhatsApp. Saíram: foto de perfil
// (URL da Meta expirava = erro constante), presença "digitando…" (poll de 6s no
// motor), reagir com emoji. A identidade do contato é a do HBX — nome cadastrado
// e iniciais coloridas. O nome que o cliente usa no WhatsApp virou DICA de
// cadastro, nunca identidade.
// Continua fiel onde importa: aviso de leitura real (status), imagem/vídeo/doc/
// áudio, nota de voz gravada no navegador, citação, mensagem apagada, e a reação
// que o CLIENTE mandou (exibida, só não se responde com uma).
// Tabs Todas/Não lidas/Minhas = filtro client-side (unread/humanAssigned).
// REGRA DAS 5 LEIS: NADA de cor/borda/fonte/radius inline — todo visual
// vem de classe do kit.css (token). Inline só layout.
// Adaptação SPA: classe extra "app-viewport" no .app (ver screens.css).

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, ConfirmDialog, I, ICONS, WhatsAppMark, useCurrentUser, useMyModules } from "@/components/hbx/shell";
import { decodeAudioBlob, renderVoiceWav, VOICE_MODE_LABEL, VOICE_PRESETS, VOICE_PITCH_RANGE, VOICE_FORMANT_RANGE, type DecodedAudio, type VoiceMode, type VoiceTune } from "@/lib/voice-fx";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { ModeloAtendimentoPanel } from "@/components/hbx/modelo-atendimento-panel";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { stampOnboardingEvent } from "@/lib/onboarding";
import { isTenantAdmin } from "@/lib/roles";
import { useTabIndex } from "@/lib/use-tab-param";
import {
  fetchWhatsAppModalStatus,
} from "@/lib/whatsapp-connection-flow";
import { whatsappPillLabel } from "@/lib/whatsapp-center";

type MsgMeta = {
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

type InboxMessage = {
  id: string;
  direction: string; // inbound | outbound
  content: string;
  createdAt: string;
  messageType?: string;
  status?: string;
  error?: string | null;
  metadata?: MsgMeta;
};

type InboxConversation = {
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
    // Nome que o cliente se deu no WhatsApp, quando AINDA não há cadastro no HBX.
    // É dica pra oferecer o cadastro — nunca identidade (ver convName).
    suggestedName?: string | null;
    isRegistered?: boolean;
  } | null;
  messages?: InboxMessage[];
};

type MessagesResponse = { messages: InboxMessage[]; hasMore?: boolean; nextBefore?: string | null };
type QuickReply = { id: number | string; title: string; content: string };

// Card de situação do lead (GET/PATCH /inbox/conversations/:id/status-card):
// cliente (não-ligar/observações), lead (etapa/retorno) e histórico (timeline).
type StatusCardCustomer = {
  profileId: string;
  name: string | null;
  phone: string;
  phoneNormalized: string;
  doNotCall: boolean;
  doNotCallReason: string | null;
  observations: string;
  updatedAt: string | null;
};
type StatusCardLead = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  website: string | null;
  opportunityScore: number | null;
  leadTemperature: string | null;
  rating: number | null;
  reviews: number;
  status: string;
  statusLabel: string;
  nextAction: string | null;
  returnAt: string | null;
  attemptCount: number;
  timesSeen: number;
  sourceType: string | null;
  shortNote: string | null;
  lastResult: string | null;
  lastContactAt: string | null;
  productName: string | null;
  productValueLabel: string | null;
  saleStatus: string;
  saleStatusLabel: string | null;
  saleValueLabel: string | null;
  commissionStatusLabel: string | null;
  commissionValueLabel: string | null;
  setupValueLabel: string | null;
  setupCommissionValueLabel: string | null;
  updatedAt: string | null;
  // Empresa + dono + multi-contatos (do RadarLeadPool ligado). Telefone extra só exibe se WhatsApp-confirmado.
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  ownerNames?: string[] | null;
  ownerPhone?: string | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  companySituation?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  // HOT-07 (empresa recém-aberta): badge de urgência. Opcional.
  isFreshCompany?: boolean | null;
  daysSinceOpened?: number | null;
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    recommendedChannel?: string | null;
    painType?: string | null;
    painPitch?: string | null;
    opportunityReason?: string | null;
    enrichedAt?: string | null;
  } | null;
} | null;
type StatusCardHistory = {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  resultLabel: string | null;
  returnAt: string | null;
  createdAt: string | null;
};
type StatusCard = { customer: StatusCardCustomer; lead: StatusCardLead; history: StatusCardHistory[] };

// Filtro de fila do backend (?queue=) — "" = todas (sem filtro).
const FILAS: { key: string; label: string }[] = [
  { key: "", label: "Todas as filas" },
  { key: "recovery", label: "Recuperação" },
  { key: "scheduled", label: "Agendadas" },
  { key: "bot", label: "Bot" },
  { key: "blocked", label: "Finalizadas" },
];

const EMOJIS = ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "🙏", "👍", "👏", "🙌", "💪", "🔥", "✅", "❌", "❤️", "💯", "🎉", "👋", "🤝", "😇", "😉", "😢", "😭", "😡", "🥳", "🤩", "😴", "📎"];
// (QUICK_RX saiu na faxina de 31/07 — reagir com emoji era imitação do WhatsApp.
// Reação RECEBIDA do cliente continua aparecendo no balão, ver `reactionsByKey`.)

// Nunca deixar um JID técnico chegar na tela. @lid NÃO é número (ordem do dono 17/06:
// "não existe número lid, eu nunca vi isso"); @s.whatsapp.net/@g.us/@broadcast/@newsletter
// também não. Devolve null quando o valor for um JID cru, pra cair no rótulo neutro.
function cleanContact(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/@(lid|s\.whatsapp\.net|c\.us|g\.us|broadcast|newsletter)/i.test(raw)) return null;
  return raw;
}

// De um JID cru de número real (5519920121720@s.whatsapp.net / @c.us) extrai os dígitos
// pra mostrar como telefone; @lid e demais JIDs técnicos continuam virando null (não são
// número). Nunca deixa o `@s.whatsapp.net` cru vazar pra tela.
function phoneFromContact(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^\+?(\d{8,15})@(?:s\.whatsapp\.net|c\.us)$/i);
  if (m) return m[1];
  return cleanContact(raw);
}

// --- Máscara de telefone do "+Nova" (entrada manual) ---------------------------
// O "+55" é prefixo FIXO ao lado do campo (NÃO entra no valor editável — senão o "55" do
// país briga com o DDD 55 e vira loop de "5555…"). O campo formata só a parte NACIONAL:
// (DD) NNNN-NNNN ou (DD) NNNNN-NNNN conforme os dígitos. NUNCA insere o "9" — número sem
// ele é legítimo (fixos); o motor decide o canônico depois.

// Extrai a parte nacional (DDD + assinante, até 11 dígitos). Só tira o 55 do país quando
// colaram um número COMPLETO (12-13 díg começando com 55); DDD 55 nacional (10-11) fica.
function nationalDigitsBR(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

// Texto exibido no campo: SÓ a parte nacional, sem o "+55" (prefixo fixo no JSX).
function formatNationalBR(raw: string): string {
  const d = nationalDigitsBR(raw);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length < 2) return "(" + ddd;    // digitando o DDD: "(5"
  let out = "(" + ddd + ")";
  if (!rest) return out;                 // DDD pronto: "(55)"
  out += " ";
  // Quebra do hífen: assinante de 9 díg → 5+4; senão 4+4.
  const split = rest.length > 8 ? 5 : 4;
  if (rest.length <= split) return out + rest;
  return out + rest.slice(0, split) + "-" + rest.slice(split);
}

// O que vai pro backend: só dígitos, com 55 garantido na frente (o backend já normaliza
// e prefixa 55, mas mandar pronto é à prova de número de 12 dígitos sem prefixo automático).
function phoneToBackendBR(raw: string): string {
  const d = nationalDigitsBR(raw);
  if (!d) return "";
  return "55" + d;
}

// Nome exibido. O backend já entrega `customer.name` com a ordem CERTA
// (cadastro HBX > nome do WhatsApp), então aqui é só a queda pro telefone.
function convName(c: InboxConversation) {
  return (
    cleanContact(c.customer?.name) ||
    phoneFromContact(c.customer?.phone) ||
    phoneFromContact(c.contact) ||
    "Contato WhatsApp"
  );
}

// Conversa criada pelo "+nova" e ainda SEM nenhuma mensagem: o dono abriu pra contatar
// mas não enviou nada. Fica destacada (selo + topo da lista) até a 1ª mensagem sair.
function isNovaConversa(c: InboxConversation | null | undefined) {
  const started = (c?.metadata as Record<string, unknown> | null | undefined)?.["manualConversationStarted"];
  return Boolean(started) && (c?.messages?.length ?? 0) === 0;
}

function convUnread(c: InboxConversation) {
  const raw = (c.metadata as Record<string, unknown> | null | undefined)?.["whatsappUnreadCount"];
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

// IDENTIDADE HBX (31/07/2026): a conversa NÃO tem foto de perfil. O <Av> desenha
// iniciais coloridas a partir do nome — determinístico, offline, nunca expira.
// A foto do WhatsApp foi aposentada (URL assinada da Meta que expirava = erro de
// imagem constante, e obrigava consultar o motor a cada contato).

// Dica de cadastro: cliente que se apresentou no WhatsApp mas ainda não tem
// nome no HBX. Alimenta o selo "cadastrar" — nunca o nome exibido.
function convSuggestedName(c: InboxConversation | null | undefined) {
  return cleanContact(c?.customer?.suggestedName) || null;
}

function fmtConvTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtMsgTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function fmtBytes(n?: number | null) {
  const v = Number(n || 0);
  if (!v) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDur(secs?: number | null) {
  const s = Math.max(0, Math.round(Number(secs || 0)));
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Tempo médio de resposta (segundos → "45s" / "2m 30s" / "1h 5m").
function fmtResp(secs?: number | null) {
  if (secs == null) return "—";
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}


// Mídia do inbox chega ASSINADA do backend (/uploads/inbox/x.jpg?e=…&s=… ou absoluta).
// Relativo resolve contra o apiBase PRESERVANDO a query (a assinatura é o acesso);
// absoluto/data/blob passa direto — nunca rebater no apiBase.
function resolveMediaUrl(u?: string | null) {
  if (!u) return "";
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  const base = getApiBase();
  return u.startsWith("/") ? base + u : `${base}/${u}`;
}

function msgType(m: InboxMessage) {
  return String(m.metadata?.normalizedMessageType || m.messageType || "text").toLowerCase();
}

function attachKindFromMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

// ----- Aviso de leitura (✓ / ✓✓ / ✓✓ lido) -------------------------------
function Checks({ status }: { status?: string }) {
  const s = (status || "").toUpperCase();
  if (s === "READ") return <span className="ck read">✓✓</span>;
  if (s === "DELIVERED") return <span className="ck">✓✓</span>;
  return <span className="ck">✓</span>; // SENT / PENDING / demais
}

// ----- Player de áudio / nota de voz (estrutura no kit .audio-row) ---------
function AudioBubble({ src, seconds }: { src: string; seconds?: number | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => { /* gesto/codec */ });
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = ref.current;
    if (!a || !a.duration || !Number.isFinite(a.duration)) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  }
  return (
    <div className="audio-row">
      <button className="pp" type="button" onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"}>
        <I d={playing ? ICONS.pause : ICONS.play} size={15} />
      </button>
      <div className="track" onClick={seek}><i style={{ width: `${prog}%` }} /></div>
      <span className="dur">{fmtDur(seconds)}</span>
      <audio ref={ref} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProg(0); }}
        onTimeUpdate={e => { const a = e.currentTarget; setProg(a.duration ? (a.currentTime / a.duration) * 100 : 0); }} />
    </div>
  );
}

// Fecha um popover quando o clique cai FORA do seu wrapper. Diferente de um listener
// global solto, ignora cliques dentro do próprio wrapper — então o botão-gatilho segue
// abrindo/fechando normal (sem reabrir no toggle) e clicar num item do popover não
// fecha antes da ação. Retorna o ref pra pendurar no <span> que envolve gatilho+popover.
function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const cbRef = useRef(onClose);
  useEffect(() => { cbRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cbRef.current();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return ref;
}

export function AtendimentoClient() {
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ avgResponseSeconds: number | null; conversions: number | null } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  // Mestre-detalhe SÓ no celular: lista (false) ou conversa aberta (true). No
  // desktop a classe é ignorada (CSS de .a-shell.mobile-thread-open vive em
  // @media). Abre ao tocar numa conversa; o botão "voltar" da thread fecha.
  const [mobileThread, setMobileThread] = useState(false);
  const [tab, setTab] = useTabIndex("tab", 0);
  const [busca, setBusca] = useState("");
  const [thread, setThread] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const atBottomRef = useRef(true);
  // Abrir conversa = SEMPRE colar no fim (mesmo que o usuário tivesse rolado pra cima
  // na conversa anterior). Mídia do WhatsApp cresce a altura depois do render, então
  // re-colamos algumas vezes enquanto este flag estiver ligado.
  const forceBottomRef = useRef(false);
  const router = useRouter();

  // conexão WhatsApp (R2.9): chip de status + modal QR/start/disconnect
  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waModalOpen, setWaModalOpen] = useState(false);
  // Saúde de conexão lida do MOTOR ao vivo (/inbox/whatsapp-health). Verdade do selo
  // pessoal: só "Conectado" quando o motor está `open` E dá pra enviar (canSend).
  const [waHealth, setWaHealth] = useState<{ connectedForUi: boolean; canSend: boolean; providerInstanceState: string } | null>(null);


  // sessões WhatsApp: modo (company/current/meta/none), lista de sessões visíveis,
  // e ids das sessões deste usuário (para controle de supervisão/read-only).
  type SessionInfo = { sellerName: string | null; phone: string | null };
  const [waMode, setWaMode] = useState<string>("");
  const [sessionList, setSessionList] = useState<Array<{ id: string; phone: string | null; sellerName: string | null }>>([]);
  const [ownSessionIds, setOwnSessionIds] = useState<string[]>([]);
  const [sessionMap, setSessionMap] = useState<Map<string, SessionInfo>>(new Map());
  const [numberFilter, setNumberFilter] = useState<string>("");
  // Roster COMPLETO da empresa (todos os usuários, com ou sem chip conectado) — vem do
  // /inbox/whatsapp/admin-panel (só admin-dono). Usado no seletor "Chat" pra listar
  // também quem ainda não conectou o WhatsApp.
  const [teamUsers, setTeamUsers] = useState<Array<{ userId: string; name: string; connected: boolean; phone: string | null }>>([]);
  // attendanceMode global (shared/individual/null) — vem do /inbox/whatsapp-session
  const [waAttendanceMode, setWaAttendanceMode] = useState<"shared" | "individual" | null>(null);

  // Identidade do usuário logado (via useCurrentUser do shell — GET /profile/current-user)
  const me = useCurrentUser();
  const meuUserId = me ? String((me as { id?: number | string | null }).id ?? "") : "";
  const souAdmin = isTenantAdmin(me);

  // Painel "Modelo de atendimento" (admin only)
  const [atPanelOpen, setAtPanelOpen] = useState(false);

  // Estado de atribuição da conversa aberta (shared mode): nome do atendente atual
  // e popover de transferência
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferList, setTransferList] = useState<Array<{ userId: number; name: string | null }>>([]);
  const [transferBusy, setTransferBusy] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  // Último 4 dígitos do telefone para exibição compacta (ex.: …1720)
  function shortPhone(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 4 ? `…${digits.slice(-4)}` : phone;
  }

  function sessionLabel(info: SessionInfo | undefined): string {
    if (!info) return "?";
    return info.sellerName || shortPhone(info.phone) || "?";
  }

  // Número limpo (tira "@s.whatsapp.net"/"@c.us" e formata BR) — o motor às vezes manda o JID inteiro.
  function fullPhone(phone: string | null): string | null {
    if (!phone) return null;
    const d = phone.split("@")[0].replace(/\D/g, "");
    if (!d) return null;
    if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
    return d;
  }

  // Identificação CHEIA do vendedor (nome quando tem; senão o número limpo) — barra de supervisão e dropdown.
  function sellerFull(info: SessionInfo | undefined): string {
    if (!info) return "?";
    return info.sellerName || fullPhone(info.phone) || "?";
  }

  // Citação, lightbox de MÍDIA (foto/vídeo que o cliente mandou — isso fica),
  // popovers e gravação. Reação-de-saída e presença ("digitando…") saíram na
  // faxina de 31/07: eram imitação do WhatsApp, custavam consulta ao motor a
  // cada 6s e não movem venda nenhuma.
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  // colar (Ctrl+V) / arrastar arquivo: nunca envia direto — fica pendente até confirmar
  // no cartão de prévia (anti-cagada). previewUrl só existe para imagem (miniatura).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0); // contador de enter/leave (filhos disparam ambos)

  // filtro de fila (?queue=) + popover; filaRef p/ loadConvs ler sem recriar
  const [fila, setFila] = useState("");
  const [filaOpen, setFilaOpen] = useState(false);
  const filaRef = useRef("");
  // filtro por vendedor (admin/visão-empresa): popover do dropdown "Vendedor: Todos ▾"
  const [vendOpen, setVendOpen] = useState(false);

  // menu de ações da conversa (cabeçalho da thread)
  const [acoesOpen, setAcoesOpen] = useState(false);
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [enrichBusy, setEnrichBusy] = useState(false);

  // painel direito: card de situação + observações
  const [card, setCard] = useState<StatusCard | null>(null);
  const [obsDraft, setObsDraft] = useState("");
  const [obsBusy, setObsBusy] = useState(false);

  // "Fechar venda" direto do Atendimento — é aqui que fecha. Gera o link de
  // contratação e amarra a comissão ao vendedor que falou com o cliente.
  const [fecharOpen, setFecharOpen] = useState(false);

  // cockpit do painel: Retorno + Sem Interesse (layout igual ao Vendas)
  const [moverOpen, setMoverOpen] = useState(false);
  const [tarefaOpen, setTarefaOpen] = useState(false);
  const [tarefaData, setTarefaData] = useState("");
  const [atendSemInteresseOpen, setAtendSemInteresseOpen] = useState(false);

  // Click-outside dos dropdowns (fila/vendedor/ações/tarefa/semInteresse): pendura o ref
  // no <span> que envolve gatilho+popover. Antes ficavam abertos teimando na tela.
  const filaWrapRef = useClickOutside<HTMLSpanElement>(filaOpen, () => setFilaOpen(false));
  const vendWrapRef = useClickOutside<HTMLSpanElement>(vendOpen, () => setVendOpen(false));
  const acoesWrapRef = useClickOutside<HTMLSpanElement>(acoesOpen, () => setAcoesOpen(false));
  const tarefaWrapRef = useClickOutside<HTMLSpanElement>(tarefaOpen, () => setTarefaOpen(false));
  const semInteresseWrapRef = useClickOutside<HTMLSpanElement>(atendSemInteresseOpen, () => setAtendSemInteresseOpen(false));

  const refreshWaStatus = useCallback(() => {
    return fetchWhatsAppModalStatus()
      .then(res => setWaStatus(res?.status || null))
      .catch(() => setWaStatus(null));
  }, []);

  // Assinatura da sessão ativa (modo + sessões próprias). A lista de conversas é
  // POR-SESSÃO; ao trocar o número ativo a lista antiga fica defasada (ids de outro
  // vendedor). Guardamos a assinatura pra detectar a troca e revalidar a lista —
  // sem isso o front dispara /read e /message contra conversa de fora (404 ruidoso).
  const sessionSigRef = useRef<string | null>(null);
  // loadConvs é declarado mais abaixo (TDZ); chamamos via ref pra revalidar a lista
  // na troca de sessão sem criar dependência circular entre os useCallback.
  const loadConvsRef = useRef<(() => void) | null>(null);

  const refreshWaSession = useCallback(() => {
    return apiFetch<{
      providerWarning?: string | null;
      whatsappSession: {
        accessible: boolean;
        mode: string;
        attendanceMode?: "shared" | "individual" | null;
        sessions?: Array<{ id: string; phone: string | null; sellerName: string | null }>;
        ownSessionIds?: string[];
      };
    }>("/inbox/whatsapp-session")
      .then(res => {
        const ws = res?.whatsappSession;
        if (!ws) return;
        const mode = ws.mode || "";
        const sessions = ws.sessions ?? [];
        const ownIds = ws.ownSessionIds ?? [];
        setWaMode(mode);
        setSessionList(sessions);
        setOwnSessionIds(ownIds);
        setWaAttendanceMode(ws.attendanceMode ?? null);
        const map = new Map<string, SessionInfo>();
        for (const s of sessions) {
          map.set(s.id, { sellerName: s.sellerName, phone: s.phone });
        }
        setSessionMap(map);
        // Trocou a sessão ativa (número recém-conectado assumiu o inbox)? Recarrega a
        // lista — loadConvs reconcilia o selId (line do setSelId) e larga o id velho.
        const sig = `${mode}|${[...ownIds].sort().join(",")}`;
        if (sessionSigRef.current !== null && sessionSigRef.current !== sig) {
          loadConvsRef.current?.();
        }
        sessionSigRef.current = sig;
      })
      .catch(() => { /* endpoint pode não estar disponível ainda */ });
  }, []);

  // Saúde de conexão ao vivo (motor): fetch leve à parte, igual o refreshWaSession.
  // Alimenta o selo PESSOAL com a verdade do motor (open + canSend = Conectado).
  const refreshWaHealth = useCallback(() => {
    return apiFetch<{
      connectedForUi: boolean;
      canSend: boolean;
      providerInstanceState: string;
    }>("/inbox/whatsapp-health")
      .then(res => {
        if (!res) { setWaHealth(null); return; }
        setWaHealth({
          connectedForUi: Boolean(res.connectedForUi),
          canSend: Boolean(res.canSend),
          providerInstanceState: res.providerInstanceState || "unknown",
        });
      })
      .catch(() => setWaHealth(null));
  }, []);

  // Roster completo da empresa para o seletor "Chat" — inclui quem NÃO tem chip
  // conectado. /inbox/whatsapp/admin-panel é só admin-dono; gerente/erro cai no catch
  // (fica só com as sessões conectadas, sem quebrar nada).
  const loadTeam = useCallback(() => {
    return apiFetch<{ team?: Array<{ userId: string; name: string | null; whatsappConnected?: boolean; whatsappPhone?: string | null }> }>("/inbox/whatsapp/admin-panel")
      .then(res => {
        const team = Array.isArray(res?.team) ? res.team : [];
        setTeamUsers(team.map(m => ({
          userId: String(m.userId),
          name: m.name || `#${m.userId}`,
          connected: Boolean(m.whatsappConnected),
          phone: m.whatsappPhone ?? null,
        })));
      })
      .catch(() => { setTeamUsers([]); });
  }, []);

  // Estado de conexão VIVO no selo do inbox (PR17062026047 Bloco C): o status era
  // buscado só no mount, então se o número caísse com o vendedor na tela o selo seguia
  // mentindo "Conectado" até recarregar. Poll leve (independe de conversa aberta) mantém
  // o selo verdadeiro; o clique já abre o modal que faz poll de 4s e oferece reconectar.
  // Também carrega as sessões WhatsApp (mapa de número→vendedor) para o chip de supervisor.
  useEffect(() => {
    refreshWaStatus();
    refreshWaSession();
    refreshWaHealth();
    const t = setInterval(() => { refreshWaStatus(); refreshWaSession(); refreshWaHealth(); }, 20000);
    return () => clearInterval(t);
  }, [refreshWaStatus, refreshWaSession, refreshWaHealth]);


  // Carrega o roster da empresa quando é admin em visão-empresa (o seletor "Chat" só
  // aparece nesse caso). Reage à mudança de modo/identidade.
  useEffect(() => {
    if (souAdmin && waMode === "company") loadTeam();
  }, [souAdmin, waMode, loadTeam]);

  const [hasMore, setHasMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  // paginação da thread (carregar histórico mais antigo)
  const [msgHasMore, setMsgHasMore] = useState(false);
  const [msgBefore, setMsgBefore] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);

  // nova conversa manual (POST /inbox/conversations/start)
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaForm, setNovaForm] = useState({ phone: "", name: "" });
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaMsg, setNovaMsg] = useState<string | null>(null);

  // "Limpar": apaga as conversas que nunca receberam/enviaram nada (as "+nova"
  // abertas e jamais usadas). Não dispara nada pro WhatsApp.
  const [limparBusy, setLimparBusy] = useState(false);
  const [limparConfirm, setLimparConfirm] = useState(false);

  // Limpar ESTA conversa da caixa (some daqui, continua salva no cliente).
  const [limparOpen, setLimparOpen] = useState(false);

  // mensagens rápidas
  const [quickList, setQuickList] = useState<QuickReply[]>([]);
  const [qrForm, setQrForm] = useState({ title: "", content: "" });
  const [qrBusy, setQrBusy] = useState(false);

  // gravação de áudio (MediaRecorder) — fluxo WhatsApp: gravar → pausar → ouvir → enviar
  type RecPhase = "idle" | "recording" | "paused" | "review";
  const [recPhase, setRecPhase] = useState<RecPhase>("idle");
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number>(0);
  const recIntentRef = useRef<"review" | "cancel">("review");
  const recMimeRef = useRef<{ base: string; ext: string }>({ base: "audio/webm", ext: "webm" });
  const recBlobRef = useRef<Blob | null>(null);    // áudio original gravado
  const recDurRef = useRef(0);                       // duração final (s)
  const decodedRef = useRef<DecodedAudio | null>(null); // PCM decodificado (cache p/ trocar voz)
  const previewBlobRef = useRef<Blob | null>(null);  // blob que será enviado (original ou WAV processado)
  const previewExtRef = useRef("webm");

  // Alterador de voz (módulo "VC") — só admin + módulo liberado pelo master
  const mods = useMyModules();
  const vcAllowed = souAdmin && Boolean(mods.byKey["vc"]?.accessible);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("normal"); // nunca inicia ligado
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);        // popover (só aparece ao clicar)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // afinação Tom (pitch) + Timbre (formant) por modo (sliders ao vivo, salvo no navegador)
  type TuneMap = Record<"fem" | "masc", VoiceTune>;
  const freshTune = (): TuneMap => ({ fem: { ...VOICE_PRESETS.fem }, masc: { ...VOICE_PRESETS.masc } });
  const [tune, setTune] = useState<TuneMap>(freshTune);
  const tuneRef = useRef<TuneMap>(freshTune());
  const pitchTimerRef = useRef<number>(0);
  // espelhos p/ o closure do MediaRecorder.onstop (evita estado velho)
  const recSecsRef = useRef(0);
  const voiceModeRef = useRef<VoiceMode>("normal");
  // carrega a afinação salva (1x no mount; evita mismatch de hidratação)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hbx-vc-tune");
      if (!raw) return;
      const p = JSON.parse(raw);
      const pick = (m: "fem" | "masc"): VoiceTune => ({
        pitch: Number(p?.[m]?.pitch) > 0 ? Number(p[m].pitch) : VOICE_PRESETS[m].pitch,
        formant: Number(p?.[m]?.formant) > 0 ? Number(p[m].formant) : VOICE_PRESETS[m].formant,
      });
      const next: TuneMap = { fem: pick("fem"), masc: pick("masc") };
      tuneRef.current = next;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê localStorage 1x no mount (evita mismatch de hidratação); efeito legítimo
      setTune(next);
    } catch { /* ignora */ }
  }, []);
  // revoga a URL da prévia ao desmontar (evita vazamento de blob)
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  // NÃO fechar o menu de voz num mousedown global: isso desmontava o popover ANTES
  // do clique na opção completar → startRec nunca rodava (bug "escolho a voz e não
  // grava"). O menu fecha ao escolher (pickVoiceFromMenu) ou ao reclicar no mic.

  // Fecha o popover de transferência ao clicar fora
  useEffect(() => {
    if (!transferOpen) return;
    const handler = () => setTransferOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [transferOpen]);

  // Zera o aviso de não-lidas (X) desta conversa na lista NA HORA (otimista), sem
  // esperar o /read + próximo loadConvs. O backend persiste com whatsappMarkedReadAt,
  // então o próximo refresh já volta com 0 (não pisca de volta).
  const markConvReadLocal = useCallback((id: string) => {
    setConvs(prev => prev.map(c =>
      c.id === id
        ? { ...c, metadata: { ...(c.metadata ?? {}), whatsappUnreadCount: 0 } }
        : c));
  }, []);

  const loadConvs = useCallback(() => {
    const q = filaRef.current ? `&queue=${encodeURIComponent(filaRef.current)}` : "";
    return apiFetch<InboxConversation[]>(`/inbox/conversations?take=50${q}`)
      .then(res => {
        const raw = Array.isArray(res) ? res : [];
        // "+nova" sem 1ª mensagem sobe pro topo (senão afundaria — a lista ordena por
        // última mensagem real, e ela ainda não tem nenhuma). Resto mantém a ordem do backend.
        const list = [...raw.filter(isNovaConversa), ...raw.filter(c => !isNovaConversa(c))];
        setConvs(list);
        setHasMore(list.length === 50);
        setLoadError(null);
        setSelId(prev => prev && list.some(c => c.id === prev) ? prev : (list[0]?.id ?? null));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar as conversas.");
        setConvs([]);
      });
  }, []);

  // Ponte p/ a revalidação na troca de sessão (refreshWaSession chama via ref, evitando
  // TDZ/dependência circular). loadConvs é estável (deps []), então roda só uma vez.
  useEffect(() => { loadConvsRef.current = loadConvs; }, [loadConvs]);

  // Conjunto de ids da lista ESCOPADA atual (por sessão). O /read e o /message só podem
  // mirar uma conversa que existe nesta lista — assim um selId herdado de outra sessão
  // (lista defasada na troca de número) não dispara request fantasma que volta 404.
  const convIdSetRef = useRef<Set<string>>(new Set());
  useEffect(() => { convIdSetRef.current = new Set(convs.map(c => c.id)); }, [convs]);

  // Conectou: atualiza chip e recarrega lista. O prompt de histórico de outro número
  // (BUG 2 FIX) está centralizado no WhatsAppConnectModal — era duplicado aqui
  // (modal inline + popup nesta tela = duas coisas vivas para a mesma função).
  const handleWhatsAppConnected = useCallback(() => {
    refreshWaStatus();
    refreshWaSession();
    loadConvs();
  }, [refreshWaStatus, refreshWaSession, loadConvs]);

  // Desconectou: limpa a lista na hora — o chat do número que saiu não fica
  // pendurado por trás do modal.
  const handleWhatsAppDisconnected = useCallback(() => {
    setConvs([]); setSelId(null); setThread([]); setCard(null);
    refreshWaStatus();
  }, [refreshWaStatus]);

  // KPIs (GET /inbox/metrics) — fallback silencioso até o backend subir
  const loadMetrics = useCallback(() => {
    return apiFetch<{ avgResponseSeconds: number | null; conversions: number | null }>("/inbox/metrics")
      .then(res => setMetrics(res || null))
      .catch(() => { /* endpoint pode subir no próximo deploy do backend */ });
  }, []);

  async function carregarMais() {
    if (moreBusy || !hasMore) return;
    setMoreBusy(true);
    try {
      const q = filaRef.current ? `&queue=${encodeURIComponent(filaRef.current)}` : "";
      const res = await apiFetch<InboxConversation[]>(`/inbox/conversations?take=50&skip=${convs.length}${q}`);
      const extra = Array.isArray(res) ? res : [];
      setConvs(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...extra.filter(c => !seen.has(c.id))];
      });
      setHasMore(extra.length === 50);
    } catch {
      // mantém a lista atual; próxima tentativa recarrega
    } finally {
      setMoreBusy(false);
    }
  }

  const loadThread = useCallback((id: string) => {
    return apiFetch<MessagesResponse>(`/inbox/conversations/${encodeURIComponent(id)}/messages?limit=30`)
      .then(res => {
        const msgs = Array.isArray(res?.messages) ? res.messages.slice() : [];
        msgs.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        setThread(msgs);
        setMsgHasMore(Boolean(res?.hasMore));
        setMsgBefore(res?.nextBefore ?? null);
      })
      .catch(() => { setThread([]); setMsgHasMore(false); setMsgBefore(null); });
  }, []);

  const loadCard = useCallback((id: string) => {
    return apiFetch<StatusCard>(`/inbox/conversations/${encodeURIComponent(id)}/status-card`)
      .then(res => {
        setCard(res || null);
        setObsDraft(res?.customer?.observations || "");
      })
      .catch(() => { setCard(null); setObsDraft(""); });
  }, []);

  // Consulta-no-clique: verifica se o cliente (por telefone) já está finalizado.
  // Se sim, o backend re-aplica o SOFT-hide na conversa nova e a encaminha pro bot.
  // Executa SÓ no clique (mudança de selId) — sem job em background, sem conexão WA.
  const checkFinalized = useCallback((id: string) => {
    apiFetch<{ finalized: boolean; reason?: string; alreadyApplied?: boolean }>(
      `/inbox/conversations/${encodeURIComponent(id)}/check-finalized`,
      { method: "POST", body: JSON.stringify({}) },
    ).then(res => {
      if (res?.finalized && !res?.alreadyApplied) {
        // Backend reaplicou SOFT-hide — recarrega lista e thread pra refletir
        loadConvs();
      }
    }).catch(() => { /* silencioso — consulta best-effort */ });
  }, [loadConvs]);

  async function carregarMaisAntigas() {
    if (olderBusy || !msgHasMore || !msgBefore || !selId) return;
    setOlderBusy(true);
    const el = endRef.current;
    const prevH = el ? el.scrollHeight : 0;
    try {
      const res = await apiFetch<MessagesResponse>(
        `/inbox/conversations/${encodeURIComponent(selId)}/messages?limit=30&before=${encodeURIComponent(msgBefore)}`,
      );
      const older = (Array.isArray(res?.messages) ? res.messages.slice() : [])
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      setThread(prev => {
        const seen = new Set(prev.map(m => m.id));
        return [...older.filter(m => !seen.has(m.id)), ...prev];
      });
      setMsgHasMore(Boolean(res?.hasMore));
      setMsgBefore(res?.nextBefore ?? null);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    } catch {
      // segue com o que já tem
    } finally {
      setOlderBusy(false);
    }
  }

  useEffect(() => {
    // handoff: abre direto a conversa indicada, vinda de:
    //   1) sessionStorage "hbx:abrir-conversa" — gravado por Vendas (e Leads) antes de navegar
    //   2) query param ?conversation=<id> — deep-link de URL (ex.: /atendimento?conversation=42)
    let alive = true;
    let pendingId: string | null = null;
    let pendingDraft: string | null = null;
    try {
      pendingId = sessionStorage.getItem("hbx:abrir-conversa");
      if (pendingId) sessionStorage.removeItem("hbx:abrir-conversa");
      pendingDraft = sessionStorage.getItem("hbx:abrir-conversa-draft");
      if (pendingDraft) sessionStorage.removeItem("hbx:abrir-conversa-draft");
    } catch { /* sem storage */ }
    if (!pendingId && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qp = params.get("conversation");
      if (qp) pendingId = qp;
    }
    loadConvs().then(() => {
      if (!alive) return;
      if (pendingId) setSelId(pendingId);
      if (pendingDraft) setDraft(pendingDraft);
    });
    loadMetrics();
    return () => { alive = false; };
  }, [loadConvs, loadMetrics]);

  // ref espelho do selId para o stream SSE recarregar o thread aberto
  const selIdRef = useRef<string | null>(null);
  useEffect(() => { selIdRef.current = selId; }, [selId]);

  // tempo real: GET /inbox/events (SSE). EventSource não envia o header
  // Authorization, então o stream é lido com fetch + ReadableStream.
  const [sseOn, setSseOn] = useState(false);
  // marca do último sinal de vida do stream (qualquer chunk: inbox, ping ou
  // dado solto). O watchdog usa isso pra detectar stream que "morre calado"
  // atrás do proxy (res.ok resolve mas nada flui → sseOn ficaria "true mentindo").
  const lastStreamAt = useRef<number>(Date.now());
  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;
    let reloadTimer = 0;

    function bump() {
      if (reloadTimer) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = 0;
        loadConvs();
        loadMetrics();
        if (selIdRef.current) { loadThread(selIdRef.current); loadCard(selIdRef.current); }
      }, 600);
    }

    async function connect() {
      let retry = 0;
      while (alive) {
        ctrl = new AbortController();
        try {
          const res = await fetch(`${getApiBase()}/inbox/events`, {
            headers: { Authorization: `Bearer ${getToken() || ""}` },
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
          setSseOn(true);
          // (re)conectou: zera o relógio do watchdog pra não abortar na largada
          lastStreamAt.current = Date.now();
          retry = 0;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            // QUALQUER chunk recebido é sinal de vida — inclusive o ': keepalive'
            // (comentário) e o 'event: ping'. Atualiza antes de parsear os eventos.
            lastStreamAt.current = Date.now();
            buf += dec.decode(value, { stream: true });
            let cut;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              if (chunk.includes("event: inbox")) bump();
              // 'event: ping' já contou como vida acima; não precisa bump().
            }
          }
        } catch { /* desconectou — reconecta com backoff */ }
        setSseOn(false);
        if (!alive) break;
        retry = Math.min(retry + 1, 6);
        await new Promise(r => setTimeout(r, 1500 * retry));
      }
    }

    connect();
    // WATCHDOG: se passar >45s sem NENHUM evento útil (nem ping), o stream
    // está morto-calado — aborta o reader (read() lança → cai no catch →
    // setSseOn(false) → o loop reconecta com backoff). Com sseOn=false, o poll
    // de 8s da thread volta sozinho (efeito mais abaixo).
    const watchdog = window.setInterval(() => {
      if (!alive) return;
      if (Date.now() - lastStreamAt.current > 45000) {
        lastStreamAt.current = Date.now(); // evita rajada de aborts até reconectar
        ctrl?.abort();
      }
    }, 5000);

    return () => {
      alive = false;
      ctrl?.abort();
      clearInterval(watchdog);
      if (reloadTimer) clearTimeout(reloadTimer);
    };
  }, [loadConvs, loadThread, loadCard, loadMetrics]);

  // thread da conversa selecionada + marcar como lida; polling 8s só como
  // fallback quando o stream SSE está fora
  useEffect(() => {
    if (!selId) return;
    let alive = true;
    atBottomRef.current = true;
    forceBottomRef.current = true;
    loadCard(selId);
    loadThread(selId);
    // Consulta-no-clique: re-aplica SOFT-hide se cliente estava finalizado antes da troca de chip
    checkFinalized(selId);
    // Marca lida no servidor JÁ — não espera a thread carregar. (O backend lê as
    // últimas inbound do banco, então não depende do fetch da thread.) Assim o
    // próximo loadConvs/SSE já volta com unread=0 e o aviso não reaparece.
    // (O zerar otimista da lista acontece no openConv — setState não pode rodar
    // síncrono dentro de efeito.)
    // Só marca lido se a conversa pertence à lista escopada atual: um selId herdado de
    // outra sessão (lista defasada durante a troca de número) NÃO dispara /read fantasma.
    if (convIdSetRef.current.has(selId)) {
      apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/read`, { method: "PATCH", body: JSON.stringify({}) }).catch(() => { /* segue */ });
    }
    if (sseOn) return () => { alive = false; };
    const timer = setInterval(() => { if (alive) loadThread(selId); }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [selId, loadThread, loadCard, checkFinalized, sseOn]);

  // A LISTA também precisa de rede de segurança. O SSE pode morrer calado atrás do
  // proxy (res.ok resolve mas nada flui → sseOn fica "true" mentindo): aí a thread
  // segue viva (poll 8s acima) mas a lista CONGELAVA em mensagens antigas — não
  // reordenava nem atualizava o preview. Poll leve garante que a ordem/preview
  // acompanhem a última mensagem mesmo sem SSE. (O backend já ordena por
  // MAX(timestamp) e o setConvs reconcilia por key, então não pisca.)
  useEffect(() => {
    const timer = setInterval(() => { loadConvs(); }, 10000);
    return () => clearInterval(timer);
  }, [loadConvs]);

  // mensagens rápidas (carrega ao abrir o popover a 1ª vez)
  const loadQuick = useCallback(() => {
    return apiFetch<QuickReply[]>("/inbox/quick-replies")
      .then(res => setQuickList(Array.isArray(res) ? res : []))
      .catch(() => { /* endpoint pode subir no próximo deploy do backend */ });
  }, []);

  // Cola no fim da thread. Em rAF + re-cola por timeout porque a altura cresce DEPOIS
  // do render (dia separador, balões de mídia). Usado também no onLoad de cada mídia.
  const scrollMsgsToEnd = useCallback(() => {
    const el = endRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Mídia (imagem/vídeo) terminou de carregar: se o usuário ainda está no fim, re-cola
  // (a imagem empurrou o conteúdo pra baixo). Não rouba o scroll de quem rolou pra cima.
  const pinIfAtBottom = useCallback(() => {
    if (atBottomRef.current || forceBottomRef.current) requestAnimationFrame(scrollMsgsToEnd);
  }, [scrollMsgsToEnd]);

  // Auto-scroll: ao ABRIR uma conversa (forceBottom) sempre cola no fim; em mensagem
  // nova, só se o usuário já estava no fim (não atrapalha paginar pra cima). Re-cola
  // algumas vezes porque a mídia do WhatsApp cresce a altura depois do primeiro paint.
  useEffect(() => {
    if (!endRef.current) return;
    if (!atBottomRef.current && !forceBottomRef.current) return;
    requestAnimationFrame(scrollMsgsToEnd);
    const t1 = window.setTimeout(scrollMsgsToEnd, 90);
    const t2 = window.setTimeout(() => { scrollMsgsToEnd(); forceBottomRef.current = false; }, 340);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [thread, scrollMsgsToEnd]);

  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 96);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > 96 ? 'auto' : 'hidden';
  }, [draft]);

  function onMsgsScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 48) carregarMaisAntigas();
  }

  async function iniciarNovaConversa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (novaBusy) return;
    setNovaBusy(true);
    setNovaMsg(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({
          phone: phoneToBackendBR(novaForm.phone),
          ...(novaForm.name.trim() ? { name: novaForm.name.trim() } : {}),
        }),
      });
      setNovaOpen(false);
      setNovaForm({ phone: "", name: "" });
      await loadConvs();
      if (res?.id != null) {
        setSelId(String(res.id));
        // Abre já pronto pra digitar a 1ª mensagem (o "+nova" não passa pelo openConv).
        requestAnimationFrame(() => draftRef.current?.focus());
      }
    } catch (err) {
      setNovaMsg(err instanceof Error ? err.message : "Não foi possível iniciar a conversa.");
    } finally {
      setNovaBusy(false);
    }
  }

  // Varre as conversas e apaga as que estão sem mensagem alguma (as "+nova" abertas
  // e nunca enviadas — nada foi pro WhatsApp). Não envia nada; só limpa do banco e
  // recarrega a lista.
  // Abre o confirm CENTRAL do kit (Lei de pop-up — nunca window.confirm nativo).
  function limparVazias() {
    if (limparBusy) return;
    if (!convs.filter(isNovaConversa).length) { setLoadError(null); return; }
    setLimparConfirm(true);
  }

  async function doLimparVazias() {
    setLimparBusy(true);
    try {
      await apiFetch("/inbox/conversations/clear-empty", { method: "POST", body: JSON.stringify({}) });
      await loadConvs();
      setLimparConfirm(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível limpar as conversas vazias.");
    } finally {
      setLimparBusy(false);
    }
  }

  // troca de conversa (handler de clique — reset de UI fica fora de efeito)
  function openConv(id: string) {
    setMobileThread(true); // celular: tocar numa conversa abre a thread (mesmo a já selecionada)
    markConvReadLocal(id); // zera o (X) na lista na hora; o efeito do selId manda o /read
    if (id !== selId) {
      setSelId(id);
      setReplyTo(null);
      setEmojiOpen(false);
      setQuickOpen(false);
      setCard(null);
      setAcoesOpen(false);
      setMoverOpen(false);
      setTarefaOpen(false);
      setAcaoMsg(null);
      cancelPendingFile(); // anexo colado/arrastado pendente não atravessa pra outra conversa
    }
    requestAnimationFrame(() => draftRef.current?.focus());
  }

  // troca de fila (?queue=): recarrega a lista pelo backend
  function aplicarFila(key: string) {
    filaRef.current = key;
    setFila(key);
    setFilaOpen(false);
    loadConvs();
  }

  function quotedPayload() {
    if (!replyTo) return {};
    const meta = replyTo.metadata || {};
    return {
      quotedMessageId: String(meta.providerKeyId || meta.providerMessageId || replyTo.id),
      quotedContent: String(replyTo.content || meta.quotedPreview || "").slice(0, 200),
    };
  }

  async function send() {
    const content = draft.trim();
    if (!content || !selId || sendBusy) return;
    // selId fora da lista escopada (herdado de outra sessão na troca de número): não
    // dispara /message fantasma (voltaria 404). Revalida e avisa em vez de errar feio.
    if (!convs.some(c => c.id === selId)) {
      setSendError("Conversa indisponível na sessão atual. Atualizando a lista…");
      void loadConvs();
      return;
    }
    setSendBusy(true);
    setSendError(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/message`, {
        method: "POST",
        body: JSON.stringify({ content, ...quotedPayload() }),
      });
      setDraft("");
      setReplyTo(null);
      atBottomRef.current = true;
      void stampOnboardingEvent("first_conversation_started"); // marco: ATIVADO (Camada 1)
      await loadThread(selId);
      // Mensagem própria: cola no fim SEMPRE, sem depender só do efeito de `thread`
      // (o dono reportou ficar preso acima do "Hoje" recém-criado ao enviar).
      requestAnimationFrame(scrollMsgsToEnd);
      window.setTimeout(scrollMsgsToEnd, 150);
      void loadConvs(); // sobe a conversa e atualiza o preview na hora (sem esperar SSE)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendBusy(false);
      requestAnimationFrame(() => draftRef.current?.focus());
    }
  }

  // anexo: sobe o arquivo (POST /media) e envia a mensagem com o anexo
  async function sendAttachment(file: File, kind: string, extra?: { durationSeconds?: number }) {
    if (!selId) return;
    // Mesma guarda do send(): não sobe anexo/mensagem pra conversa fora da sessão atual.
    if (!convs.some(c => c.id === selId)) {
      setSendError("Conversa indisponível na sessão atual. Atualizando a lista…");
      void loadConvs();
      return;
    }
    setSendBusy(true);
    setSendError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await apiFetch<{ url: string; filename?: string; mimeType?: string; size?: number }>(
        `/inbox/conversations/${encodeURIComponent(selId)}/media`,
        { method: "POST", body: fd },
      );
      const caption = draft.trim();
      const fallback = kind === "audio" ? "🎤 Mensagem de voz" : (file.name || "📎 Anexo");
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/message`, {
        method: "POST",
        body: JSON.stringify({
          content: caption || fallback,
          attachmentKind: kind,
          attachmentUrl: up.url,
          attachmentMimeType: up.mimeType || file.type || undefined,
          attachmentFileName: file.name || up.filename || undefined,
          attachmentFileSize: up.size ?? file.size ?? undefined,
          ...(extra?.durationSeconds ? { attachmentDurationSeconds: extra.durationSeconds } : {}),
          ...quotedPayload(),
        }),
      });
      setDraft("");
      setReplyTo(null);
      atBottomRef.current = true;
      await loadThread(selId);
      requestAnimationFrame(scrollMsgsToEnd);
      window.setTimeout(scrollMsgsToEnd, 150);
      void loadConvs(); // mesma razão do send(): conversa sobe e preview atualiza já
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar o anexo.");
    } finally {
      setSendBusy(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendAttachment(file, attachKindFromMime(file.type));
  }

  // ── colar (Ctrl+V) / arrastar arquivo: pousa em revisão, nunca envia direto ──
  function stagePendingFile(file: File) {
    setSendError(null);
    setPendingPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPendingPreviewUrl(URL.createObjectURL(file));
    }
  }

  function cancelPendingFile() {
    setPendingPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPendingFile(null);
  }

  async function confirmPendingFile() {
    if (!pendingFile) return;
    const file = pendingFile;
    cancelPendingFile();
    await sendAttachment(file, attachKindFromMime(file.type));
  }

  // Ctrl+V no composer: só intercepta quando há arquivo colado (imagem de print,
  // por ex.); texto colado normal segue o fluxo padrão do textarea.
  function onComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = e.clipboardData?.files?.[0];
    if (!file || !convo || !canSend) return;
    e.preventDefault();
    stagePendingFile(file);
  }

  // Drag & drop na área da conversa aberta (thread inteira) — overlay "Solte para
  // enviar" enquanto arrasta; contador de profundidade porque os filhos do painel
  // também disparam dragenter/dragleave.
  function onThreadDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!convo || !canSend) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
  }
  function onThreadDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!convo || !canSend) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  }
  function onThreadDragLeave() {
    if (dragDepthRef.current > 0) dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragOver(false); }
  }
  function onThreadDrop(e: React.DragEvent<HTMLDivElement>) {
    dragDepthRef.current = 0;
    setDragOver(false);
    if (!convo || !canSend) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    stagePendingFile(file);
  }

  // ── gravação de nota de voz (fluxo WhatsApp: gravar → pausar → ouvir → enviar) ──
  function clearRecTimer() {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = 0; }
  }
  function startRecTimer() {
    clearRecTimer();
    recTimerRef.current = window.setInterval(() => setRecSecs(s => { recSecsRef.current = s + 1; return s + 1; }), 1000);
  }
  function revokePreview() {
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }

  // Monta a prévia (ouvir antes de enviar). normal = blob original; senão processa a voz.
  async function buildPreview(mode: VoiceMode) {
    const original = recBlobRef.current;
    if (!original) return;
    revokePreview();
    if (mode === "normal") {
      previewBlobRef.current = original;
      previewExtRef.current = recMimeRef.current.ext;
      setPreviewUrl(URL.createObjectURL(original));
      return;
    }
    setPreviewBusy(true);
    try {
      if (!decodedRef.current) decodedRef.current = await decodeAudioBlob(original);
      const t = mode === "fem" || mode === "masc" ? tuneRef.current[mode] : undefined;
      const wav = await renderVoiceWav(decodedRef.current, mode, t);
      previewBlobRef.current = wav;
      previewExtRef.current = "wav";
      setPreviewUrl(URL.createObjectURL(wav));
    } catch {
      // se a decodificação/processamento falhar, cai pro original (não trava o envio)
      previewBlobRef.current = original;
      previewExtRef.current = recMimeRef.current.ext;
      setPreviewUrl(URL.createObjectURL(original));
      setSendError("Não foi possível processar a voz; usando o áudio original.");
    } finally {
      setPreviewBusy(false);
    }
  }

  // Escolheu a voz no menu: na revisão reprocessa a prévia; senão começa a gravar já.
  function pickVoiceFromMenu(mode: VoiceMode) {
    setVoiceMenuOpen(false);
    setVoiceMode(mode);
    voiceModeRef.current = mode;
    if (recPhase === "review") void buildPreview(mode);
    else void startRec();
  }

  // Sliders Tom (pitch) e Timbre (formant) ao vivo na revisão. Salva no navegador
  // e reprocessa a prévia com debounce (RubberBand leva ~centenas de ms).
  function setVoiceParam(mode: "fem" | "masc", key: keyof VoiceTune, value: number) {
    const next: TuneMap = { ...tuneRef.current, [mode]: { ...tuneRef.current[mode], [key]: value } };
    tuneRef.current = next;
    setTune(next);
    try { localStorage.setItem("hbx-vc-tune", JSON.stringify(next)); } catch { /* ignora */ }
    if (recPhase === "review" && voiceModeRef.current === mode) {
      if (pitchTimerRef.current) clearTimeout(pitchTimerRef.current);
      pitchTimerRef.current = window.setTimeout(() => { void buildPreview(mode); }, 260);
    }
  }

  async function startRec() {
    if (!selId) return;
    if (recRef.current && recRef.current.state !== "inactive") return; // já gravando
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "");
      const baseMime = (mime || "audio/webm").split(";")[0];
      recMimeRef.current = { base: baseMime, ext: baseMime.includes("ogg") ? "ogg" : "webm" };
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recIntentRef.current = "review";
      decodedRef.current = null;
      previewBlobRef.current = null;
      mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        clearRecTimer();
        if (recIntentRef.current === "cancel") {
          chunksRef.current = [];
          setRecPhase("idle");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recMimeRef.current.base });
        recBlobRef.current = blob;
        recDurRef.current = Math.max(1, recSecsRef.current);
        setRecPhase("review");
        void buildPreview(voiceModeRef.current);
      };
      recRef.current = mr;
      setRecSecs(0); recSecsRef.current = 0;
      mr.start();
      setRecPhase("recording");
      startRecTimer();
    } catch {
      setSendError("Não foi possível acessar o microfone.");
    }
  }

  function pauseRec() {
    const mr = recRef.current;
    if (mr && mr.state === "recording") { try { mr.pause(); } catch { /* */ } clearRecTimer(); setRecPhase("paused"); }
  }
  function resumeRec() {
    const mr = recRef.current;
    if (mr && mr.state === "paused") { try { mr.resume(); } catch { /* */ } startRecTimer(); setRecPhase("recording"); }
  }
  // Para de gravar e vai pra revisão (ouvir antes de enviar).
  function stopToReview() {
    const mr = recRef.current;
    recIntentRef.current = "review";
    clearRecTimer();
    if (mr && mr.state !== "inactive") { try { mr.stop(); } catch { /* já parou */ } }
  }
  // Descarta tudo e volta ao normal.
  function cancelRec() {
    const mr = recRef.current;
    recIntentRef.current = "cancel";
    clearRecTimer();
    revokePreview();
    recBlobRef.current = null; previewBlobRef.current = null; decodedRef.current = null;
    if (mr && mr.state !== "inactive") { try { mr.stop(); } catch { /* */ } }
    else { setRecPhase("idle"); }
  }
  // Regravar: descarta a prévia e começa de novo.
  function reRecord() {
    revokePreview();
    recBlobRef.current = null; previewBlobRef.current = null; decodedRef.current = null;
    setRecPhase("idle");
    void startRec();
  }
  // Envia o que está na prévia (original ou voz processada).
  async function sendRecorded() {
    const blob = previewBlobRef.current;
    if (!blob || previewBusy) return;
    const ext = previewExtRef.current;
    const file = new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: blob.type || recMimeRef.current.base });
    revokePreview();
    recBlobRef.current = null; previewBlobRef.current = null; decodedRef.current = null;
    setRecPhase("idle");
    await sendAttachment(file, "audio", { durationSeconds: recDurRef.current });
  }

  // Popover Normal/Feminina/Masculina — só admin com módulo "VC", abre AO CLICAR (não fica sempre visível).
  function renderVoiceMenu() {
    if (!vcAllowed || !voiceMenuOpen) return null;
    const modes: VoiceMode[] = ["normal", "fem", "masc"];
    return (
      <div className="hbx-pop chat-pop vc-menu" style={{ right: 12 }}>
        <span className="vc-picker-label"><I d={ICONS.mic} size={12} /> Gravar com a voz:</span>
        <div className="vc-menu-opts">
          {modes.map(m => (
            <button key={m} type="button" className={"vc-opt" + (voiceMode === m ? " on" : "")}
              disabled={previewBusy} onClick={() => pickVoiceFromMenu(m)}>
              {VOICE_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  async function doRetry(m: InboxMessage) {
    if (!selId || !/^\d+$/.test(m.id)) return;
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/messages/${m.id}/retry`, { method: "POST" });
      await loadThread(selId);
    } catch { /* segue */ }
  }

  function insertText(text: string) {
    setDraft(d => (d ? `${d}${d.endsWith(" ") ? "" : " "}${text}` : text));
    setEmojiOpen(false);
    setQuickOpen(false);
    draftRef.current?.focus();
  }

  async function createQuick(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = qrForm.title.trim();
    const content = qrForm.content.trim();
    if (!title || !content || qrBusy) return;
    setQrBusy(true);
    try {
      await apiFetch("/inbox/quick-replies", { method: "POST", body: JSON.stringify({ title, content }) });
      setQrForm({ title: "", content: "" });
      await loadQuick();
    } catch { /* endpoint pode não estar no ar ainda */ } finally {
      setQrBusy(false);
    }
  }

  async function deleteQuick(id: number | string) {
    try {
      await apiFetch(`/inbox/quick-replies/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      await loadQuick();
    } catch { /* segue */ }
  }

  // ----- Ações da conversa (cabeçalho + painel direito) --------------------
  // Bloquear/desbloquear contato (PATCH /block | /unblock)
  async function acaoBloqueio(block: boolean) {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/${block ? "block" : "unblock"}`,
        { method: "PATCH", body: JSON.stringify({}) });
      setAcoesOpen(false);
      await loadConvs();
      await loadThread(selId);
      await loadCard(selId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // Liga/desliga o bot nesta conversa (PATCH /conversations/bulk-bot)
  async function acaoBot(enabled: boolean) {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch("/inbox/conversations/bulk-bot",
        { method: "PATCH", body: JSON.stringify({ ids: [Number(selId)], enabled }) });
      setAcoesOpen(false);
      await loadConvs();
      await loadThread(selId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível alterar o bot.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // Mover etapa da conversa (PATCH /conversations/:id/status)
  async function moverEtapa(status: string) {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) });
      setMoverOpen(false);
      await loadConvs();
      await loadThread(selId);
      await loadCard(selId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível mover a etapa.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // Enriquecer lead cru (POST /vendas/lead/:id/enrichment) → recarrega o card pra
  // a inteligência (score, dor, pitch, motivo) aparecer no painel.
  async function enriquecerLead() {
    const leadId = card?.lead?.id;
    if (!leadId || !selId || enrichBusy) return;
    setEnrichBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(leadId)}/enrichment`,
        { method: "POST", body: JSON.stringify({}) });
      await loadCard(selId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível enriquecer o lead.");
    } finally {
      setEnrichBusy(false);
    }
  }

  // Criar tarefa = agendar retorno (PATCH /conversations/:id/status-card { returnAt })
  async function agendarRetorno() {
    if (!selId || acaoBusy || !tarefaData) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status-card`,
        { method: "PATCH", body: JSON.stringify({ returnAt: tarefaData }) });
      setTarefaOpen(false);
      setTarefaData("");
      await loadCard(selId);
      await loadConvs();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível agendar o retorno.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // "Não ligar mais" (PATCH status-card { doNotCall }) — legado / liberar contato
  async function alternarNaoLigar(doNotCall: boolean) {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status-card`,
        { method: "PATCH", body: JSON.stringify({ doNotCall }) });
      await loadCard(selId);
      await loadConvs();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível atualizar a preferência.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // Manda o lead pra Central do Lead (/vendas) usando o MESMO contrato que a
  // Agenda e o painel de disparos já usam — sem inventar rota nova.
  function abrirNoVendas(leadId: string) {
    try { sessionStorage.setItem("hbx:vendas-focus-lead", leadId); } catch { /* sem storage */ }
    router.push("/vendas");
  }

  // Limpar conversa: some da caixa do HBX. NÃO apaga nada — as mensagens
  // continuam salvas no histórico do cliente/lead — e NÃO manda comando de
  // exclusão pro WhatsApp (o chat no aparelho do cliente fica intacto).
  async function limparConversa() {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/clear`,
        { method: "PATCH", body: JSON.stringify({ reason: "limpeza_manual" }) });
      setLimparOpen(false);
      setSelId(null);
      setThread([]);
      setCard(null);
      await loadConvs();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível limpar a conversa.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // "Sem interesse" + motivo → SOFT-hide (atendimentoBlockedAt) → vai pra "Finalizadas"
  async function semInteresse(reason: string) {
    if (!selId || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status-card`,
        { method: "PATCH", body: JSON.stringify({ doNotCall: true, closureReason: reason }) });
      await loadCard(selId);
      await loadConvs();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível registrar o interesse.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // Salvar observação do lead (PATCH status-card { observations })
  async function salvarObs() {
    if (!selId || obsBusy) return;
    setObsBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status-card`,
        { method: "PATCH", body: JSON.stringify({ observations: obsDraft }) });
      await loadCard(selId);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível salvar a observação.");
    } finally {
      setObsBusy(false);
    }
  }

  // Aceita a dica de nome do WhatsApp e CADASTRA no HBX (1 clique). A partir
  // daqui a identidade é do HBX: nenhum sync futuro sobrescreve, e a dica some.
  async function abrirCadastroSugerido(nome: string) {
    if (!selId || obsBusy) return;
    setObsBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/status-card`,
        { method: "PATCH", body: JSON.stringify({ name: nome }) });
      await loadCard(selId);
      await loadConvs();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível cadastrar o nome.");
    } finally {
      setObsBusy(false);
    }
  }

  // ---- Ações de atribuição (shared mode) ----------------------------------

  async function claimConversa() {
    if (!selId || transferBusy) return;
    setTransferBusy(true);
    setAssignMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/claim`, { method: "POST", body: JSON.stringify({}) });
      await loadConvs();
      if (selId) await loadThread(selId);
    } catch (err) {
      setAssignMsg(err instanceof Error ? err.message : "Não foi possível puxar o atendimento.");
    } finally {
      setTransferBusy(false);
    }
  }

  async function transferirConversa(userId: number) {
    if (!selId || transferBusy) return;
    setTransferBusy(true);
    setAssignMsg(null);
    setTransferOpen(false);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/transfer`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      await loadConvs();
      if (selId) await loadThread(selId);
    } catch (err) {
      setAssignMsg(err instanceof Error ? err.message : "Não foi possível transferir o atendimento.");
    } finally {
      setTransferBusy(false);
    }
  }

  async function liberarConversa() {
    if (!selId || transferBusy) return;
    setTransferBusy(true);
    setAssignMsg(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/release`, { method: "POST", body: JSON.stringify({}) });
      await loadConvs();
      if (selId) await loadThread(selId);
    } catch (err) {
      setAssignMsg(err instanceof Error ? err.message : "Não foi possível liberar o atendimento.");
    } finally {
      setTransferBusy(false);
    }
  }

  // Carrega lista da equipe para popover de transferência (best-effort via admin-panel)
  async function abrirTransferPopover() {
    setTransferOpen(true);
    if (transferList.length > 0) return;
    try {
      const res = await apiFetch<{ team?: Array<{ userId: number; name: string | null }> }>("/inbox/whatsapp/admin-panel");
      setTransferList((res?.team || []).map(m => ({ userId: m.userId, name: m.name })));
    } catch { /* segue com lista vazia */ }
  }

  // Enviar proposta: leva o contato para o Vendas (Radar → Vendas → WhatsApp)
  function enviarProposta() {
    try {
      sessionStorage.setItem("hbx:abrir-novo-lead", "1");
      if (convo) {
        sessionStorage.setItem("hbx:lead-contato", JSON.stringify({
          name: convName(convo),
          phone: phoneFromContact(convo.customer?.phone) || phoneFromContact(convo.contact) || "",
          email: convo.customer?.email || "",
        }));
      }
    } catch { /* sem storage */ }
    router.push("/vendas");
  }

  const convo = convs.find(c => c.id === selId) || null;
  // true enquanto a conversa está selecionada mas o card ainda não chegou do servidor
  const cardLoading = Boolean(convo && !card);
  const blocked = Boolean((convo?.metadata as Record<string, unknown> | null | undefined)?.["atendimentoBlockedAt"]);
  // A conversa ABERTA conta como lida na hora (igual ao WhatsApp Web): o aviso (X)
  // some imediatamente, sem esperar o servidor. Vale pro selo, pra aba "Não lidas" e
  // pra contagem do KPI — tudo deriva daqui.
  const unreadOf = (c: InboxConversation) => (c.id === selId ? 0 : convUnread(c));
  const naoLidas = convs.filter(c => unreadOf(c) > 0);
  const filtered = convs
    // Aba "Não lidas": só o que falta verificar. A conversa aberta fica visível mesmo
    // já lida (não some debaixo do dedo), mas sem o (X).
    .filter(c => tab === 0 ? true : tab === 1 ? (unreadOf(c) > 0 || c.id === selId) : c.humanAssigned === true)
    .filter(c => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return convName(c).toLowerCase().includes(q) || String(c.contact || "").includes(q);
    })
    // Filtro do seletor "Chat": chave de sessão casa pelo chip; chave "u:<id>" (usuário
    // sem chip) casa pela atribuição (assignedUserId) — sem chip nem atribuição = lista
    // vazia, que é o certo (esse usuário ainda não tem conversas).
    .filter(c => {
      if (!numberFilter) return true;
      if (numberFilter.startsWith("u:")) return String(c.assignedUserId ?? "") === numberFilter.slice(2);
      return String(c.whatsappConnectionSessionId || "") === numberFilter;
    });

  // canSend modo-ciente:
  //   - shared  → pode enviar se não há dono OU se sou o dono OU se sou admin
  //   - individual → regra antiga (dono da linha via ownSessionIds)
  //   - sem modo/null → aplica regra individual (legado)
  const convoMode = convo?.attendanceMode ?? waAttendanceMode;
  let canSend: boolean;
  if (convoMode === "shared") {
    const assignedId = convo?.assignedUserId;
    canSend = !assignedId || String(assignedId) === meuUserId || souAdmin;
  } else {
    // individual ou sem informação de modo
    canSend = !convo?.whatsappConnectionSessionId
      || ownSessionIds.includes(String(convo.whatsappConnectionSessionId));
  }

  // Supervisor info: no modo individual, mostra quem é o dono da linha (chip)
  const supervisorInfo = convoMode !== "shared" && !canSend && convo?.whatsappConnectionSessionId
    ? sessionMap.get(String(convo.whatsappConnectionSessionId))
    : undefined;
  const supervisorName = supervisorInfo ? sellerFull(supervisorInfo) : undefined;

  // No modo shared: nome do atendente atual (assignedToName) para exibição
  const assignedName = convo?.assignedToName || null;

  // Seletor "Chat": visão de empresa (admin/gerente). Aparece se há QUALQUER chat pra
  // filtrar — sessão conectada OU usuário no roster (mesmo sem chip).
  const showNumberFilter = waMode === "company" && (sessionList.length >= 1 || teamUsers.length >= 1);

  // Usuários da empresa que NÃO têm chip conectado (não aparecem nas sessões). Casa o
  // roster com as sessões pelo nome (mesma origem no backend: user.name/username).
  const sessionNames = new Set(
    sessionList.map(s => String(s.sellerName || "").trim().toLowerCase()).filter(Boolean),
  );
  const chiplessUsers = teamUsers.filter(u => !sessionNames.has(u.name.trim().toLowerCase()));

  // Rótulo do botão "Chat: …": resolve tanto chave de sessão quanto "u:<id>" (sem chip).
  const chatFilterLabel = (() => {
    if (!numberFilter) return "Todos";
    if (numberFilter.startsWith("u:")) {
      const u = teamUsers.find(t => `u:${t.userId}` === numberFilter);
      return u ? u.name : "?";
    }
    return sellerFull(sessionMap.get(numberFilter));
  })();

  // Traduz o estado do MOTOR (providerInstanceState) pro vocabulário que o selo já fala
  // (whatsappPillVariant/Label): open=conectado (tratado fora), connecting→reconnecting
  // (warn transitório que o selo já conhece — "connecting" cru cairia em vermelho), close→
  // disconnected; unknown devolve null pra cair no fallback do waStatus (não regredir).
  const mapHealthToStatus = (providerState: string): string | null => {
    switch (providerState) {
      case "open": return "connected";
      case "connecting": return "reconnecting";
      case "close": return "disconnected";
      default: return null; // unknown → fallback no waStatus
    }
  };

  // Selo de conexão do Atendimento (fix 25/06): pra ADMIN/dono em visão-empresa o selo
  // reflete a EQUIPE — verde quando QUALQUER vendedor está com a linha no ar (sessionList) —
  // e não o número PESSOAL do admin (que pode estar caído sem derrubar o time). O ramo
  // PESSOAL (else) agora usa a verdade do MOTOR ao vivo (/inbox/whatsapp-health): só
  // "Conectado" quando open + canSend; senão traduz o estado do motor pro selo. Health
  // ausente cai no waStatus de antes (sem regressão).
  const inboxWaStatus =
    souAdmin && waMode === "company" && sessionList.length > 0
      ? "connected"
      : waHealth
        ? (waHealth.connectedForUi && waHealth.canSend
            ? "connected"
            : mapHealthToStatus(waHealth.providerInstanceState) ?? waStatus)
        : waStatus;

  // reações: agrupa as mensagens-reação pelo alvo e tira-as do fluxo principal
  const reactionsByKey = new Map<string, string[]>();
  for (const m of thread) {
    const meta = m.metadata;
    if (meta?.reactionEmoji && meta?.reactionTargetKeyId) {
      const arr = reactionsByKey.get(meta.reactionTargetKeyId) || [];
      arr.push(meta.reactionEmoji);
      reactionsByKey.set(meta.reactionTargetKeyId, arr);
    }
  }
  const visibleThread = thread.filter(m => {
    if (msgType(m) === "reaction") return false;
    if (m.metadata?.reactionEmoji && m.metadata?.reactionTargetKeyId) return false;
    return true;
  });

  const threadWithDays = visibleThread.map((m, i) => {
    const day = dayLabel(m.createdAt);
    const prevDay = i > 0 ? dayLabel(visibleThread[i - 1].createdAt) : "";
    return { m, day, showDay: Boolean(day) && day !== prevDay };
  });

  // Aviso de estrangulamento (Trilha 1, Item 3): detecta rajada de FALHAs outbound
  // recentes — linked-device sendo limitado pelo WhatsApp. Critério simples: >=3
  // mensagens outbound FAILED nas últimas 5 mensagens visíveis da thread.
  // Derivado puro (sem estado extra): recalcula em cada render a partir da thread carregada.
  const recentOutboundFailed = visibleThread
    .slice(-10)
    .filter(m => m.direction === "outbound" && (m.status || "").toUpperCase() === "FAILED")
    .length;
  const showThrottleWarning = recentOutboundFailed >= 3;

  // Subtítulo do cabeçalho: o TELEFONE, sempre. (Era "online/digitando…" — saiu
  // na faxina; ver o comentário do estado lá em cima.) Quando o contato ainda
  // não tem cadastro no HBX e se apresentou no WhatsApp, oferece o nome dele
  // como atalho de cadastro em vez de assumir que aquilo é a identidade.
  function contatoSubtitulo() {
    const phone = phoneFromContact(convo?.customer?.phone) || phoneFromContact(convo?.contact) || "—";
    const sugerido = convSuggestedName(convo);
    if (!sugerido) return <small>{phone}</small>;
    return (
      <small>
        {phone}
        {" · "}
        <button className="at-name-hint" onClick={() => abrirCadastroSugerido(sugerido)}>
          se apresentou como {sugerido} — cadastrar
        </button>
      </small>
    );
  }

  // corpo do balão conforme o tipo (texto / imagem / vídeo / áudio / documento)
  function renderBody(m: InboxMessage) {
    const meta = m.metadata || {};
    if (meta.isDeleted) return <div className="cap">🚫 Mensagem apagada</div>;
    const type = msgType(m);
    const url = resolveMediaUrl(meta.mediaUrl || meta.previewUrl);
    const caption = m.content && m.content !== meta.fileName ? m.content : "";

    if (type === "image" || type === "sticker") {
      return (
        <>
          {url
            // eslint-disable-next-line @next/next/no-img-element -- mídia do WhatsApp (URL externa/dinâmica); next/image não se aplica
            ? <img className={"media-img" + (type === "sticker" ? " sticker" : "")} src={url} alt={meta.fileName || "imagem"} onLoad={pinIfAtBottom} onClick={() => setLightbox(url)} />
            : <div className="cap">📷 Imagem</div>}
          {caption && <div className="cap">{caption}</div>}
        </>
      );
    }
    if (type === "video") {
      return (
        <>
          {url ? <video className="media-video" src={url} controls onLoadedData={pinIfAtBottom} /> : <div className="cap">🎥 Vídeo</div>}
          {caption && <div className="cap">{caption}</div>}
        </>
      );
    }
    if (type === "audio") {
      return url ? <AudioBubble src={url} seconds={meta.durationSeconds} /> : <div className="cap">🎤 Áudio</div>;
    }
    if (type === "document") {
      const ext = (meta.mimeType || "").split("/")[1];
      return (
        <>
          <div className="doc-row">
            <span className="ic"><I d={ICONS.file} size={16} /></span>
            <span className="meta">
              <b>{meta.fileName || m.content || "Documento"}</b>
              <small>{[fmtBytes(meta.fileSize), ext ? ext.toUpperCase() : ""].filter(Boolean).join(" · ")}</small>
            </span>
            {url && <a className="dl" href={url} target="_blank" rel="noreferrer" download aria-label="Baixar"><I d={ICONS.download} size={16} /></a>}
          </div>
          {caption && caption !== meta.fileName && <div className="cap">{caption}</div>}
        </>
      );
    }
    return <div className="cap" style={{ whiteSpace: "pre-line" }}>{m.content}</div>;
  }

  return (
    <React.Fragment>
        <div className="a-content hbx-panel-shell hbx-panel-shell--context">
          <div className="a-left hbx-panel-shell__main">
            <div className="at-opsbar">
              <div className="at-opsbar__identity">
                <strong>Conversas</strong>
                <span>Central operacional</span>
              </div>

              <button
                className="at-wa-signal"
                data-state={inboxWaStatus}
                data-tut="atend-whatsapp"
                onClick={() => setWaModalOpen(true)}
                title="Conexão WhatsApp"
              >
                <span className="at-wa-signal__icon"><WhatsAppMark size={13} /></span>
                <span>
                  <small>WhatsApp</small>
                  <strong>{whatsappPillLabel(inboxWaStatus)}</strong>
                </span>
              </button>

              <div className="at-opsbar__metrics" aria-label="Resumo da caixa">
                <span className="at-micro">
                  <strong>{convs.length || "—"}</strong>
                  <small>Abertas</small>
                </span>
                <span className="at-micro">
                  <strong>{convs.length ? naoLidas.length : "—"}</strong>
                  <small>Não lidas</small>
                </span>
                <span className="at-micro at-micro--response">
                  <strong>{fmtResp(metrics?.avgResponseSeconds)}</strong>
                  <small>Resposta</small>
                </span>
                <span className="at-micro at-micro--conversion">
                  <strong>{metrics?.conversions != null ? metrics.conversions : "—"}</strong>
                  <small>Conversões</small>
                </span>
              </div>

              <div className="at-opsbar__controls">
                <span ref={filaWrapRef} className="at-convs-filter">
                  <button className="btn-ghost at-convs-control" onClick={() => { setFilaOpen(o => !o); setVendOpen(false); }} aria-expanded={filaOpen}>
                    {FILAS.find(f => f.key === fila)?.label || "Todas as filas"} ▾
                  </button>
                  {filaOpen && (
                    <div className="hbx-pop at-ops-pop at-ops-pop--left">
                      {FILAS.map(f => (
                        <button key={f.key || "all"} className={"nav-item at-ops-pop__item" + (f.key === fila ? " active" : "")} onClick={() => aplicarFila(f.key)}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                {showNumberFilter && (
                  <span ref={vendWrapRef} className="at-convs-filter">
                    <button className="btn-ghost at-convs-control" onClick={() => { setVendOpen(o => !o); setFilaOpen(false); }} aria-expanded={vendOpen}>
                      {chatFilterLabel} ▾
                    </button>
                    {vendOpen && (
                      <div className="hbx-pop at-ops-pop at-ops-pop--left at-ops-pop--wide">
                        <button className={"nav-item at-ops-pop__item" + (!numberFilter ? " active" : "")} onClick={() => { setNumberFilter(""); setVendOpen(false); }}>Todos os chats</button>
                        {sessionList.map(s => (
                          <button key={s.id} className={"nav-item at-ops-pop__item" + (numberFilter === s.id ? " active" : "")} onClick={() => { setNumberFilter(s.id); setVendOpen(false); }}>
                            {s.sellerName || fullPhone(s.phone) || s.id}
                          </button>
                        ))}
                        {chiplessUsers.map(u => (
                          <button key={"u:" + u.userId} className={"nav-item at-ops-pop__item at-ops-pop__person" + (numberFilter === ("u:" + u.userId) ? " active" : "")} onClick={() => { setNumberFilter("u:" + u.userId); setVendOpen(false); }}>
                            <span>{u.name}</span>
                            <span className="conv-seller">sem chip</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
                {souAdmin && (
                  <button
                    className="btn-ghost at-convs-control at-convs-control--model"
                    data-tut="atend-modelo"
                    onClick={() => setAtPanelOpen(true)}
                    title="Modelo de atendimento"
                    aria-label="Modelo de atendimento"
                  >
                    <I d={ICONS.users} size={13} /> <span>Modelo</span>
                  </button>
                )}
                <button
                  className="btn-ghost at-opsbar__clean"
                  onClick={limparVazias}
                  disabled={limparBusy}
                  title="Apagar conversas sem nenhuma mensagem"
                  aria-label="Limpar conversas vazias"
                >
                  <I d={ICONS.trash} size={14} />
                </button>
                <button className="btn-teal at-opsbar__new" data-tut="atend-nova" onClick={() => { setNovaOpen(true); setNovaMsg(null); }}>
                  <I d={ICONS.plus} size={13} /> Nova conversa
                </button>
              </div>
            </div>

            <div className={"a-shell" + (mobileThread ? " mobile-thread-open" : "")}>
              <div className="convs">
                <div className="convs-head">
                  {/* Banner: admin + sem modelo escolhido ainda */}
                  {souAdmin && waAttendanceMode === null && (
                    <div className="at-mode-banner">
                      <span style={{ flex: 1 }}>
                        Escolha o <strong>modelo de atendimento</strong>: Compartilhado ou Individual.
                      </span>
                      <button className="btn-ghost btn-xs" onClick={() => setAtPanelOpen(true)}>
                        Configurar ▸
                      </button>
                    </div>
                  )}
                </div>
                <div className="tabs" data-tut="atend-abas">
                  {["Todas", "Não lidas", "Minhas"].map((t, i) => (
                    <button key={t} className={"tab" + (tab === i ? " active" : "")} onClick={() => setTab(i)}>
                      {t}{i === 0 && convs.length > 0 && <span className="n">{convs.length}</span>}{i === 1 && naoLidas.length > 0 && <span className="n">{naoLidas.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="at-convs-search" data-tut="atend-busca">
                  <input className="field-dark" placeholder="Buscar conversas..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <div className="conv-list" data-tut="atend-lista">
                  {filtered.length === 0 && (
                    <div className="at-convs-empty">
                      <span>
                        {loadError || (inboxWaStatus === "connected"
                          ? "Nenhuma conversa ainda — as mensagens aparecem aqui."
                          : "WhatsApp ainda não conectado. Vincule o número para receber e responder as conversas aqui.")}
                      </span>
                      {!loadError && inboxWaStatus !== "connected" && (
                        <button className="btn-teal" onClick={() => setWaModalOpen(true)}>
                          <WhatsAppMark size={14} /> Conectar WhatsApp
                        </button>
                      )}
                    </div>
                  )}
                  {filtered.map(c => {
                    const un = unreadOf(c);
                    const lastMsg = (c.messages || [])[(c.messages || []).length - 1] || null;
                    return (
                      <button key={c.id} className={"conv" + (selId === c.id ? " sel" : "")} onClick={() => openConv(c.id)}>
                        <Av name={convName(c)} size={36} />
                        <span className="at-conv-copy">
                          <span className="nm"><strong>{convName(c)}</strong><time>{fmtConvTime(c.lastMessageAt)}</time></span>
                          <span className="pv">
                            <small>{isNovaConversa(c) ? "Mande a primeira mensagem…" : (lastMsg?.content || "—")}</small>
                            {isNovaConversa(c) && <span className="conv-nova">novo</span>}
                            <span className="chan wa">WhatsApp</span>
                            {showNumberFilter && !numberFilter && c.whatsappConnectionSessionId && sessionMap.has(String(c.whatsappConnectionSessionId)) && (
                              <span className="conv-seller">{sessionLabel(sessionMap.get(String(c.whatsappConnectionSessionId)))}</span>
                            )}
                            {un > 0 && <span className="unread">{un}</span>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="at-convs-foot">
                  {hasMore
                    ? <button className="link at-convs-more" onClick={carregarMais}>{moreBusy ? "Carregando…" : "Carregar mais ▾"}</button>
                    : <span>{convs.length > 0 ? "Fim da caixa" : "—"}</span>}
                </div>
              </div>

              <div className="thread"
                onDragOver={onThreadDragOver}
                onDragEnter={onThreadDragEnter}
                onDragLeave={onThreadDragLeave}
                onDrop={onThreadDrop}>
                {dragOver && convo && canSend && (
                  <div className="drop-overlay"><span>Solte para enviar</span></div>
                )}
                <div className="thread-head">
                  {/* Voltar para a lista — só aparece no celular (.chat-back é display:none no desktop). */}
                  <button className="chat-back" aria-label="Voltar para conversas" onClick={() => setMobileThread(false)}>
                    <I d={["M15 6l-6 6 6 6"]} size={20} />
                  </button>
                  {/* Iniciais do nome cadastrado no HBX — sem foto, sem rede. */}
                  <span className="at-thread-avatar">
                    <Av key={convo?.id ?? "none"} name={convo ? convName(convo) : "—"} size={36} />
                  </span>
                  <div className="at-thread-person">
                    <span className="at-thread-person__name">
                      <strong>{convo ? convName(convo) : "Selecione uma conversa"}</strong>
                      {convo?.botActive && <span className="on"><i></i>Bot ativo</span>}
                    </span>
                    {convo ? contatoSubtitulo() : <small>—</small>}
                  </div>
                  <div className="at-thread-actions">
                    {/* Shared mode: info + ações de atribuição no cabeçalho */}
                    {convo && convoMode === "shared" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {assignedName
                          ? <span className="tag teal" style={{ fontSize: "var(--hbx-font-min)" }}>Atendimento com: {assignedName}</span>
                          : <span className="tag warn" style={{ fontSize: "var(--hbx-font-min)" }}>Sem atendente</span>}
                        {(souAdmin || String(convo.assignedUserId || "") === meuUserId) && (
                          <span style={{ position: "relative", display: "inline-flex" }}>
                            <button
                              className="btn-ghost btn-xs"
                              disabled={transferBusy}
                              onClick={abrirTransferPopover}
                            >
                              Transferir ▾
                            </button>
                            {transferOpen && (
                              <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 180, padding: 6, display: "grid", gap: 2 }}>
                                {transferList.length === 0 && <span className="at-pop-empty">Carregando…</span>}
                                {transferList.map(t => (
                                  <button key={t.userId} className="nav-item" style={{ minHeight: 32 }} onClick={() => transferirConversa(t.userId)}>
                                    {t.name || `Usuário ${t.userId}`}
                                  </button>
                                ))}
                              </div>
                            )}
                          </span>
                        )}
                        {(souAdmin || String(convo.assignedUserId || "") === meuUserId) && convo.assignedUserId && (
                          <button className="btn-ghost btn-xs" disabled={transferBusy} onClick={liberarConversa}>
                            Liberar
                          </button>
                        )}
                      </div>
                    )}
                    {assignMsg && <span className="tag red">{assignMsg}</span>}
                    <span ref={acoesWrapRef} style={{ position: "relative", display: "inline-flex" }}>
                      <button className={"btn-ghost" + (acoesOpen ? " on" : "")} style={{ minHeight: 30, fontSize: "var(--fz-m2)" }}
                        disabled={!convo} onClick={() => { setAcoesOpen(o => !o); setAcaoMsg(null); }} aria-expanded={acoesOpen}>Ações ▾</button>
                      {acoesOpen && convo && (
                        <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 190, padding: 6, display: "grid", gap: 2 }}>
                          <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBot(!convo.botActive)}>{convo.botActive ? "Desligar bot" : "Ligar bot"}</button>
                          {blocked
                            ? <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBloqueio(false)}>Desbloquear contato</button>
                            : <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBloqueio(true)}>Bloquear contato</button>}
                          <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy}
                            onClick={() => { setAcoesOpen(false); setLimparOpen(true); }}>Limpar conversa</button>
                        </div>
                      )}
                    </span>
                    {acaoMsg && <span className="tag red">{acaoMsg}</span>}
                  </div>
                </div>
                <div className="msgs" ref={endRef} onScroll={onMsgsScroll}>
                  {msgHasMore && (
                    <span className="day" style={{ cursor: "pointer" }} onClick={carregarMaisAntigas}>
                      {olderBusy ? "Carregando…" : "Carregar mensagens anteriores ▴"}
                    </span>
                  )}
                  {threadWithDays.map(({ m, day, showDay }) => {
                    const out = m.direction === "outbound";
                    const meta = m.metadata || {};
                    const key = meta.providerKeyId || meta.providerMessageId || "";
                    const rx = key ? reactionsByKey.get(key) : undefined;
                    const failed = (m.status || "").toUpperCase() === "FAILED";
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && <span className="day">{day}</span>}
                        <div className={"msg " + (out ? "out" : "in")}>
                          {!out && convo && <Av name={convName(convo)} size={26} />}
                          <div style={{ display: "grid", minWidth: 0 }}>
                            <div className={"bubble" + (meta.isDeleted ? " deleted" : "") + (["image", "video", "audio", "document", "sticker"].includes(msgType(m)) && !meta.isDeleted ? " has-media" : "")}>
                              {meta.quotedPreview && (
                                <div className="msg-quote"><b>Resposta</b>{meta.quotedPreview}</div>
                              )}
                              {renderBody(m)}
                              <div className="tm">
                                {fmtMsgTime(m.createdAt)}
                                {out && (failed
                                  ? <button className="retry" onClick={() => doRetry(m)} title={m.error || "Falhou — reenviar"}>⚠ reenviar</button>
                                  : <Checks status={m.status} />)}
                              </div>
                            </div>
                            {rx && rx.length > 0 && (
                              <div className="reactions">
                                {rx.map((e, i) => <span className="rx" key={i}>{e}</span>)}
                              </div>
                            )}
                          </div>
                          {!meta.isDeleted && (
                            <button className="reply-add" onClick={() => setReplyTo(m)} aria-label="Responder" title="Responder"><I d={ICONS.reply} size={15} /></button>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {visibleThread.length === 0 && convo && (
                    isNovaConversa(convo) ? (
                      <div className="thread-empty-nova">
                        <strong>Conversa criada — ninguém foi avisado ainda.</strong>
                        <span>Digite abaixo e envie a primeira mensagem para falar com {convName(convo)} no WhatsApp.</span>
                      </div>
                    ) : (
                      <span className="day">Sem mensagens nesta conversa</span>
                    )
                  )}
                </div>
                {showThrottleWarning && (
                  <div className="throttle-warn" role="alert">
                    ⚠ WhatsApp limitou este número — aguarde alguns minutos antes de enviar.
                  </div>
                )}
                <div className="composer" data-tut="atend-responder">
                  {sendError && (
                    <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-danger)" }}>{sendError}</div>
                  )}
                  {replyTo && (
                    <div className="composer-quote">
                      <I d={ICONS.reply} size={14} />
                      <span className="body"><small>{replyTo.content || "Anexo"}</small></span>
                      <span className="x" onClick={() => setReplyTo(null)}><I d={ICONS.x} size={14} /></span>
                    </div>
                  )}

                  {/* Prévia de confirmação (colar/arrastar) — nunca envia direto. */}
                  {pendingFile && (
                    <div className="attach-preview"
                      tabIndex={-1}
                      ref={el => { if (el) el.focus(); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); void confirmPendingFile(); }
                        else if (e.key === "Escape") { e.preventDefault(); cancelPendingFile(); }
                      }}>
                      {pendingPreviewUrl
                        ? <img className="thumb" src={pendingPreviewUrl} alt="Prévia do anexo" />
                        : <span className="ic"><I d={ICONS.file} size={18} /></span>}
                      <span className="info">
                        <strong>{pendingFile.name || "Anexo"}</strong>
                        <small>{fmtBytes(pendingFile.size)}</small>
                      </span>
                      <button className="btn-ghost btn-xs" onClick={cancelPendingFile} disabled={sendBusy}>Cancelar</button>
                      <button className="send" onClick={confirmPendingFile} disabled={sendBusy} title="Enviar anexo"><I d={ICONS.send} size={15} /></button>
                    </div>
                  )}

                  {/* Shared mode sem dono: botão "Puxar atendimento" acima do compose */}
                  {convo && canSend && convoMode === "shared" && !convo.assignedUserId && (
                    <div className="at-claim-bar">
                      <span className="at-claim-txt">
                        Conversa sem atendente — puxe para você ou envie direto (o sistema atribui automaticamente).
                      </span>
                      <button className="btn-ghost btn-xs" disabled={transferBusy} onClick={claimConversa}>
                        <I d={ICONS.arrow} size={13} /> Puxar para mim
                      </button>
                    </div>
                  )}

                  {convo && !canSend ? (
                    convoMode === "shared" ? (
                      /* Shared + atribuída a outra pessoa → botão Assumir */
                      <div className="at-claim-bar">
                        <span style={{ flex: 1, fontSize: "var(--fz-l3)" }}>
                          Atendimento com <strong>{assignedName || "outro atendente"}</strong>.
                        </span>
                        <button className="btn-ghost btn-xs" disabled={transferBusy} onClick={() => transferirConversa(Number(meuUserId))}>
                          <I d={ICONS.arrow} size={13} /> Assumir
                        </button>
                      </div>
                    ) : (
                      /* Individual / legado: somente leitura (supervisão) */
                      <div className="row composer-readonly" style={{ gap: 8 }}>
                        <I d={ICONS.mic} size={15} />
                        <span style={{ flex: 1 }}>
                          Somente leitura — esta conversa é do vendedor <strong>{supervisorName}</strong>; só ele responde (você está em supervisão).
                        </span>
                      </div>
                    )
                  ) : recPhase === "recording" || recPhase === "paused" ? (
                    <div className="rec-bar">
                      <span className={"rec-dot" + (recPhase === "paused" ? " paused" : "")} />
                      <span>
                        {recPhase === "paused" ? "Pausado" : "Gravando"}
                        {voiceMode !== "normal" ? ` · voz ${VOICE_MODE_LABEL[voiceMode].toLowerCase()}` : ""}
                        {" · "}{fmtDur(recSecs)}
                      </span>
                      <button className="icon-ghost" style={{ marginLeft: "auto" }} onClick={cancelRec} title="Descartar"><I d={ICONS.trash} size={17} /></button>
                      {recPhase === "recording"
                        ? <button className="icon-ghost" onClick={pauseRec} title="Pausar"><I d={ICONS.pause} size={17} /></button>
                        : <button className="icon-ghost" onClick={resumeRec} title="Continuar"><I d={ICONS.play} size={17} /></button>}
                      <button className="send" onClick={stopToReview} title="Parar e ouvir"><I d={ICONS.stop} size={15} /></button>
                    </div>
                  ) : recPhase === "review" ? (
                    <div className="rec-review">
                      <div className="rec-review-row">
                        <button className="icon-ghost" onClick={cancelRec} title="Descartar"><I d={ICONS.trash} size={17} /></button>
                        <button className="icon-ghost" onClick={reRecord} disabled={previewBusy} title="Regravar"><I d={ICONS.mic} size={17} /></button>
                        <audio className="rec-audio" controls src={previewUrl ?? undefined} />
                        {vcAllowed && (
                          <button className={"vc-chip" + (voiceMenuOpen ? " on" : "")} disabled={previewBusy}
                            onClick={() => setVoiceMenuOpen(o => !o)} title="Trocar voz">
                            {VOICE_MODE_LABEL[voiceMode]}
                          </button>
                        )}
                        <button className="send" onClick={sendRecorded} disabled={previewBusy} title="Enviar áudio">
                          {previewBusy ? <span className="rec-spin" /> : <I d={ICONS.send} size={16} />}
                        </button>
                      </div>
                      {vcAllowed && voiceMode !== "normal" && (
                        <div className="vc-tune-box">
                          <div className="vc-tune">
                            <span className="vc-tune-lbl">Tom</span>
                            <input type="range" className="vc-range"
                              min={VOICE_PITCH_RANGE[voiceMode].min} max={VOICE_PITCH_RANGE[voiceMode].max} step={0.01}
                              value={tune[voiceMode].pitch} disabled={previewBusy}
                              onChange={e => setVoiceParam(voiceMode as "fem" | "masc", "pitch", Number(e.target.value))} />
                            <span className="vc-tune-val">{tune[voiceMode].pitch >= 1 ? "+" : ""}{Math.round((tune[voiceMode].pitch - 1) * 100)}%</span>
                          </div>
                          <div className="vc-tune">
                            <span className="vc-tune-lbl">Timbre</span>
                            <input type="range" className="vc-range"
                              min={VOICE_FORMANT_RANGE[voiceMode].min} max={VOICE_FORMANT_RANGE[voiceMode].max} step={0.01}
                              value={tune[voiceMode].formant} disabled={previewBusy}
                              onChange={e => setVoiceParam(voiceMode as "fem" | "masc", "formant", Number(e.target.value))} />
                            <span className="vc-tune-val">{tune[voiceMode].formant >= 1 ? "+" : ""}{Math.round((tune[voiceMode].formant - 1) * 100)}%</span>
                          </div>
                        </div>
                      )}
                      {previewBusy && <small className="rec-hint">Processando voz…</small>}
                    </div>
                  ) : (
                    <div className="row" style={{ alignItems: 'flex-end' }}>
                      <textarea ref={draftRef} className="field-dark" rows={1} style={{ flex: 1, resize: 'none', padding: '8px 12px', lineHeight: '20px', overflowY: 'hidden', verticalAlign: 'top' }} placeholder="Digite sua mensagem..." value={draft}
                        onChange={e => { setDraft(e.target.value); const el = e.target; el.style.height = 'auto'; const h = Math.min(el.scrollHeight, 96); el.style.height = h + 'px'; el.style.overflowY = el.scrollHeight > 96 ? 'auto' : 'hidden'; }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                        onPaste={onComposerPaste}
                        disabled={!convo || sendBusy} />
                      <button className={"icon-ghost" + (quickOpen ? " on" : "")}
                        onClick={() => { const next = !quickOpen; setQuickOpen(next); setEmojiOpen(false); if (next) loadQuick(); }}
                        disabled={!convo}
                        title="Mensagens rápidas"
                        aria-label="Mensagens rápidas">
                        <I d={ICONS.bolt} size={17} />
                      </button>
                      <button className={"icon-ghost" + (emojiOpen ? " on" : "")} onClick={() => { setEmojiOpen(o => !o); setQuickOpen(false); }} disabled={!convo} title="Emoji"><I d={ICONS.smile} size={17} /></button>
                      <button className="icon-ghost" onClick={() => fileRef.current?.click()} disabled={!convo || sendBusy} title="Anexar"><I d={ICONS.clip} size={17} /></button>
                      <button className={"icon-ghost" + (voiceMenuOpen ? " on" : "")}
                        onClick={() => { if (vcAllowed) { setVoiceMenuOpen(o => !o); setEmojiOpen(false); setQuickOpen(false); } else { void startRec(); } }}
                        disabled={!convo || sendBusy} title={vcAllowed ? "Gravar — escolher voz" : "Gravar áudio"}><I d={ICONS.mic} size={17} /></button>
                      <button className="send" onClick={send} disabled={!convo || sendBusy}><I d={ICONS.send} size={16} /></button>
                    </div>
                  )}

                  {renderVoiceMenu()}

                  {emojiOpen && (
                    <div className="hbx-pop chat-pop" style={{ left: 12 }}>
                      <div className="emoji-grid">
                        {EMOJIS.map(e => <button key={e} onClick={() => insertText(e)}>{e}</button>)}
                      </div>
                    </div>
                  )}

                  {quickOpen && (
                    <div className="hbx-pop chat-pop" style={{ right: 12 }}>
                      {quickList.length === 0 && <div className="quick-empty">Nenhuma mensagem rápida ainda. Crie a primeira abaixo.</div>}
                      {quickList.map(q => (
                        <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button className="quick-item" style={{ flex: 1 }} onClick={() => insertText(q.content)}>
                            <b>{q.title}</b>
                            <small>{q.content}</small>
                          </button>
                          <button className="icon-ghost" onClick={() => deleteQuick(q.id)} title="Excluir"><I d={ICONS.trash} size={15} /></button>
                        </div>
                      ))}
                      <form onSubmit={createQuick} style={{ display: "grid", gap: 6, padding: "8px 6px 4px", borderTop: "1px solid var(--border-hairline)" }}>
                        <input className="field-dark" placeholder="Título" maxLength={60} value={qrForm.title} onChange={e => setQrForm(f => ({ ...f, title: e.target.value }))} />
                        <input className="field-dark" placeholder="Texto da mensagem" maxLength={1000} value={qrForm.content} onChange={e => setQrForm(f => ({ ...f, content: e.target.value }))} />
                        <button className="btn-ghost" type="submit" disabled={qrBusy} style={{ minHeight: 32, fontSize: "var(--fz-m2)" }}>{qrBusy ? "Salvando…" : "Salvar mensagem rápida"}</button>
                      </form>
                    </div>
                  )}

                  <input ref={fileRef} type="file" hidden onChange={onPickFile}
                    accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" />
                </div>
              </div>
            </div>
          </div>

          <aside className="ctx hbx-panel-shell__context hbx-panel-context--dense" data-tut="atend-painel">
            <DetalhesNegocio
              key={convo?.id ?? "empty"}
              loading={cardLoading}
              detail={convo ? ({
                id: convo.id,
                // Coroa acende quando o lead foi enriquecido (mesmo critério da Vendas).
                enriched: Boolean(card?.lead?.leadIntelligence?.enrichedAt),
                // Nome: lead tem nome de empresa, senão usa o nome do contato WhatsApp
                name: card?.lead?.name || convName(convo),
                avatarUrl: null,
                online: false,
                phone: phoneFromContact(convo.customer?.phone) || phoneFromContact(convo.contact) || null,
                // Email: lead tem email completo; fallback pro contato do WhatsApp
                email: card?.lead?.email || convo.customer?.email || null,
                website: card?.lead?.website ?? null,
                // ============================================================
                // FICHA ENXUTA (faxina 31/07/2026 — lei "mostra num lugar,
                // edita num lugar"). Este painel repetia ~20 campos de
                // inteligência do lead (CNPJ, CNAE, razão social, sócios,
                // redes, score, temperatura, dor/pitch, multi-contatos) que
                // são da Central do Lead, no /vendas. Dado em dois lugares é
                // bug de produto: diverge, confunde e dobra a manutenção.
                //
                // Aqui fica só o que o ATENDENTE usa sem sair da conversa:
                // quem é, como falar, em que pé está, o que foi combinado e
                // fechar a venda. O resto mora atrás do botão "Abrir no
                // Vendas" (ações do painel).
                // ============================================================
                city: card?.lead?.city ?? null,
                state: card?.lead?.state ?? null,
                segment: card?.lead?.segment ?? null,
                statusLabel: card?.lead?.statusLabel ?? null,
                doNotCall: card?.customer?.doNotCall ?? false,
                channel: "WhatsApp",
                nextAction: card?.lead?.nextAction ?? null,
                returnAt: card?.lead?.returnAt ?? undefined,
                lastContactAt: card?.lead?.lastContactAt ?? undefined,
                attemptCount: card?.lead?.attemptCount ?? null,
                timesSeen: card?.lead?.timesSeen ?? null,
                shortNote: card?.lead?.shortNote ?? null,
                lastResult: card?.lead?.lastResult ?? null,
                observations: card?.customer?.observations ?? null,
                // Produto / valor (só quando tem lead linkado)
                productName: card?.lead?.productName ?? null,
                valueLabel: card?.lead?.productValueLabel ?? card?.lead?.saleValueLabel ?? null,
                // Venda (só quando há venda real)
                sale: card?.lead?.saleStatus && card.lead.saleStatus !== "none"
                  ? {
                      status: card.lead.saleStatus,
                      statusLabel: card.lead.saleStatusLabel,
                      valueLabel: card.lead.saleValueLabel,
                      commissionLabel: card.lead.commissionStatusLabel,
                      commissionValueLabel: card.lead.commissionValueLabel,
                      setupLabel: card.lead.setupValueLabel
                        ? `${card.lead.setupValueLabel}${card.lead.setupCommissionValueLabel ? ` · comissão: ${card.lead.setupCommissionValueLabel}` : ""}`
                        : null,
                    }
                  : null,
                history: card?.history?.map(h => ({
                  id: h.id,
                  title: h.title,
                  description: h.description,
                  resultLabel: h.resultLabel,
                  returnAt: h.returnAt,
                  createdAt: h.createdAt,
                })) ?? null,
              } satisfies NegocioDetail) : null}
              obsDraft={obsDraft}
              onObsChange={convo ? setObsDraft : undefined}
              onObsSave={convo ? salvarObs : undefined}
              obsBusy={obsBusy}
              onToggleDoNotCall={convo ? () => alternarNaoLigar(!card?.customer?.doNotCall) : undefined}
              historyLabel="Histórico do lead"
              title="Negócio"
              actions={convo ? (
                <div className="dn-cockpit">
                  {/* TIER 1 — Fechar venda */}
                  <div className="dn-cockpit__group">
                    <button className="fv-open-cta" onClick={() => setFecharOpen(true)} data-tut="atend-fechar">
                      <span className="fv-open-cta-ic"><I d={ICONS.money} size={18} /></span>
                      <span className="fv-open-cta-txt">
                        <b>Fechar venda</b>
                        <small>Gere o link e garanta sua comissão</small>
                      </span>
                      <I d={ICONS.arrow} size={16} />
                    </button>
                    {/* A ficha COMPLETA do lead (CNPJ, sócios, score, dor,
                        multi-contatos) mora na Central do Lead — um lugar só. */}
                    {card?.lead?.id && (
                      <button className="btn-ghost" style={{ minHeight: 34, fontSize: "var(--fz-m2)" }}
                        onClick={() => abrirNoVendas(String(card.lead!.id))}>
                        Abrir ficha completa no Vendas
                      </button>
                    )}
                  </div>
                  {/* TIER 2 — Retorno + Sem Interesse */}
                  <div className="dn-cockpit__group">
                    {acaoMsg && <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>}
                    <div className="vnd-quick-acts">
                      <span ref={tarefaWrapRef} style={{ position: "relative" }}>
                        <button className="btn-result btn-result--ok" disabled={acaoBusy} onClick={() => { setTarefaOpen(o => !o); setAtendSemInteresseOpen(false); setAcaoMsg(null); }}>
                          <I d={ICONS.clock} size={14} /> Retorno
                        </button>
                        {tarefaOpen && (
                          <div className="hbx-pop" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 200, padding: 8, display: "grid", gap: 6 }}>
                            <label className="sub" style={{ marginTop: 0 }}>Agendar retorno</label>
                            <input className="field-dark" type="date" value={tarefaData} onChange={e => setTarefaData(e.target.value)} />
                            <button className="btn-teal" style={{ minHeight: 34 }} disabled={!tarefaData || acaoBusy} onClick={agendarRetorno}>
                              {acaoBusy ? "Agendando…" : "Agendar retorno"}
                            </button>
                          </div>
                        )}
                      </span>
                      <span ref={semInteresseWrapRef} style={{ position: "relative" }}>
                        <button className="btn-result btn-result--cold" disabled={acaoBusy} onClick={() => { setAtendSemInteresseOpen(o => !o); setTarefaOpen(false); setAcaoMsg(null); }}>
                          Sem Interesse
                        </button>
                        {atendSemInteresseOpen && (
                          <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 210, padding: 6, display: "grid", gap: 2 }}>
                            {[
                              { key: "sem_interesse", label: "Sem interesse geral" },
                              { key: "ja_tem", label: "Já tem solução" },
                              { key: "preco", label: "Preço alto demais" },
                              { key: "sem_perfil", label: "Fora do perfil" },
                              { key: "nao_ligar", label: "Não ligar mais" },
                            ].map(({ key, label }) => (
                              <button key={key} className="nav-item" style={{ minHeight: 32, textAlign: "left" }}
                                onClick={() => { setAtendSemInteresseOpen(false); semInteresse(key); }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : undefined}
            />
          </aside>
        </div>

      {selId && fecharOpen && (
        <FecharVendaModal
          onClose={() => setFecharOpen(false)}
          mode={{ kind: "conversation", conversationId: selId }}
          leadName={card?.lead?.name || (convo ? convName(convo) : null)}
          phone={convo ? (phoneFromContact(convo.customer?.phone) || phoneFromContact(convo.contact) || null) : null}
          onDone={() => { if (selId) loadCard(selId); loadConvs(); }}
        />
      )}

      <WhatsAppConnectModal
        open={waModalOpen}
        onClose={() => { setWaModalOpen(false); refreshWaStatus(); }}
        onConnected={handleWhatsAppConnected}
        onDisconnected={handleWhatsAppDisconnected}
      />

      {atPanelOpen && (
        <ModeloAtendimentoPanel
          onClose={() => { setAtPanelOpen(false); refreshWaSession(); }}
          onConnectWhatsApp={() => { setAtPanelOpen(false); setWaModalOpen(true); }}
        />
      )}

      {lightbox && (
        <div className="hbx-veil" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- mídia do WhatsApp em tela cheia */}
          <img className="lightbox-img" src={lightbox} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {novaOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setNovaOpen(false); }}>
          <form className="hbx-modal" onSubmit={iniciarNovaConversa}
            style={{ width: "min(380px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Nova conversa
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setNovaOpen(false)}>✕</span>
            </h3>
            {novaMsg && <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{novaMsg}</div>}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Telefone (com DDD) *</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>+55</span>
                <input className="field-dark" style={{ flex: 1 }} type="tel" inputMode="tel" required autoFocus maxLength={16} placeholder="(  )  ____-____" value={novaForm.phone}
                  onChange={e => setNovaForm(f => ({ ...f, phone: formatNationalBR(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Nome (opcional)</label>
              <input className="field-dark" type="text" maxLength={120} value={novaForm.name}
                onChange={e => setNovaForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={novaBusy} style={{ minHeight: 42 }}>
              {novaBusy ? "Iniciando…" : "Iniciar conversa"}
            </button>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={limparConfirm}
        title="Limpar conversas vazias"
        message={`Apagar ${convs.filter(isNovaConversa).length} conversa(s) sem nenhuma mensagem? Nada é enviado ao WhatsApp do cliente — é só faxina aqui.`}
        confirmLabel="Apagar"
        danger
        busy={limparBusy}
        onConfirm={doLimparVazias}
        onCancel={() => setLimparConfirm(false)}
      />

      <ConfirmDialog
        open={limparOpen}
        title="Limpar esta conversa"
        message={
          convo
            ? `A conversa com ${convName(convo)} sai da sua caixa, mas continua salva no histórico do cliente — nada é perdido. O WhatsApp do cliente NÃO é alterado: nenhuma mensagem é apagada no aparelho dele.`
            : ""
        }
        confirmLabel="Limpar da caixa"
        busy={acaoBusy}
        onConfirm={limparConversa}
        onCancel={() => setLimparOpen(false)}
      />
    </React.Fragment>
  );
}
