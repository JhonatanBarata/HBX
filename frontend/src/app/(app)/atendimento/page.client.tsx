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
//   - Reação → POST /inbox/conversations/:id/messages/:mid/reaction
//   - Reenviar → POST /inbox/conversations/:id/messages/:mid/retry
//   - Presença → GET /inbox/conversations/:id/presence (online/digitando/gravando)
//   - Mensagem rápida → GET/POST/DELETE /inbox/quick-replies
//   - Marcar lida → PATCH /inbox/conversations/:id/read
//   - Nova conversa → POST /inbox/conversations/start { phone, name? }
//     (também recebe handoff do Leads via sessionStorage hbx:abrir-conversa)
// Fidelidade WhatsApp: aviso de leitura real (status), imagem/vídeo/doc/áudio,
// nota de voz gravada no navegador, citação, reações, mensagem apagada.
// Tabs Todas/Não lidas/Minhas = filtro client-side (unread/humanAssigned).
// REGRA DAS 5 LEIS: NADA de cor/borda/fonte/radius inline — todo visual
// vem de classe do kit.css (token). Inline só layout.
// Adaptação SPA: classe extra "app-viewport" no .app (ver screens.css).

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS, KpiRow } from "@/components/hbx/shell";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { useTabIndex } from "@/lib/use-tab-param";
import { fetchWhatsAppModalStatus } from "@/lib/whatsapp-connection-flow";
import { whatsappModalStatusLabel } from "@/lib/whatsapp-center";

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
  metadata?: Record<string, unknown> | null;
  customer?: {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  messages?: InboxMessage[];
};

type MessagesResponse = { messages: InboxMessage[]; hasMore?: boolean; nextBefore?: string | null };
type Presence = { online?: boolean; typing?: boolean; recording?: boolean; lastSeenAt?: string | null; presence?: string };
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
  status: string;
  statusLabel: string;
  nextAction: string | null;
  returnAt: string | null;
  attemptCount: number;
  timesSeen: number;
  sourceType: string | null;
  shortNote: string | null;
  lastContactAt: string | null;
  updatedAt: string | null;
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
  { key: "groups", label: "Grupos" },
  { key: "blocked", label: "Bloqueadas" },
];

const EMOJIS = ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "🙏", "👍", "👏", "🙌", "💪", "🔥", "✅", "❌", "❤️", "💯", "🎉", "👋", "🤝", "😇", "😉", "😢", "😭", "😡", "🥳", "🤩", "😴", "📎"];
const QUICK_RX = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function convName(c: InboxConversation) {
  return c.customer?.name || c.customer?.phone || c.contact || "—";
}

function convUnread(c: InboxConversation) {
  const raw = (c.metadata as Record<string, unknown> | null | undefined)?.["whatsappUnreadCount"];
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
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

// Data/hora completa para a timeline do histórico do lead.
function fmtHistTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// /uploads/inbox/x.jpg → URL servível (proxy /hbx/api em dev). Absoluto passa direto.
function resolveMediaUrl(u?: string | null) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
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

export function AtendimentoClient() {
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ avgResponseSeconds: number | null; conversions: number | null } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useTabIndex("tab", 0);
  const [busca, setBusca] = useState("");
  const [thread, setThread] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const atBottomRef = useRef(true);
  const router = useRouter();

  // conexão WhatsApp (R2.9): chip de status + modal QR/start/disconnect
  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waModalOpen, setWaModalOpen] = useState(false);

  // fidelidade: citação, lightbox, reação, popovers, presença, gravação
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [presence, setPresence] = useState<Presence | null>(null);

  // filtro de fila (?queue=) + popover; filaRef p/ loadConvs ler sem recriar
  const [fila, setFila] = useState("");
  const [filaOpen, setFilaOpen] = useState(false);
  const filaRef = useRef("");

  // menu de ações da conversa (cabeçalho da thread)
  const [acoesOpen, setAcoesOpen] = useState(false);
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  // painel direito: card de situação + abas (0 = contexto, 1 = histórico)
  const [card, setCard] = useState<StatusCard | null>(null);
  const [ctxTab, setCtxTab] = useState(0);
  const [obsDraft, setObsDraft] = useState("");
  const [obsBusy, setObsBusy] = useState(false);

  // ações rápidas do painel: mover etapa + agendar retorno (criar tarefa)
  const [moverOpen, setMoverOpen] = useState(false);
  const [tarefaOpen, setTarefaOpen] = useState(false);
  const [tarefaData, setTarefaData] = useState("");

  const refreshWaStatus = useCallback(() => {
    return fetchWhatsAppModalStatus()
      .then(res => setWaStatus(res?.status || null))
      .catch(() => setWaStatus(null));
  }, []);

  useEffect(() => { refreshWaStatus(); }, [refreshWaStatus]);

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

  // mensagens rápidas
  const [quickList, setQuickList] = useState<QuickReply[]>([]);
  const [qrForm, setQrForm] = useState({ title: "", content: "" });
  const [qrBusy, setQrBusy] = useState(false);

  // gravação de áudio (MediaRecorder)
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<number>(0);
  const recCancelRef = useRef(false);

  const loadConvs = useCallback(() => {
    const q = filaRef.current ? `&queue=${encodeURIComponent(filaRef.current)}` : "";
    return apiFetch<InboxConversation[]>(`/inbox/conversations?take=50${q}`)
      .then(res => {
        const list = Array.isArray(res) ? res : [];
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
    // handoff do Leads: abre direto a conversa recém-criada
    let alive = true;
    let pendingId: string | null = null;
    try {
      pendingId = sessionStorage.getItem("hbx:abrir-conversa");
      if (pendingId) sessionStorage.removeItem("hbx:abrir-conversa");
    } catch { /* sem storage */ }
    loadConvs().then(() => { if (alive && pendingId) setSelId(pendingId); });
    loadMetrics();
    return () => { alive = false; };
  }, [loadConvs, loadMetrics]);

  // ref espelho do selId para o stream SSE recarregar o thread aberto
  const selIdRef = useRef<string | null>(null);
  useEffect(() => { selIdRef.current = selId; }, [selId]);

  // tempo real: GET /inbox/events (SSE). EventSource não envia o header
  // Authorization, então o stream é lido com fetch + ReadableStream.
  const [sseOn, setSseOn] = useState(false);
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
          retry = 0;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let cut;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              if (chunk.includes("event: inbox")) bump();
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
    return () => {
      alive = false;
      ctrl?.abort();
      if (reloadTimer) clearTimeout(reloadTimer);
    };
  }, [loadConvs, loadThread, loadCard, loadMetrics]);

  // thread da conversa selecionada + marcar como lida; polling 8s só como
  // fallback quando o stream SSE está fora
  useEffect(() => {
    if (!selId) return;
    let alive = true;
    atBottomRef.current = true;
    loadCard(selId);
    loadThread(selId).then(() => {
      if (!alive) return;
      apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/read`, { method: "PATCH", body: JSON.stringify({}) }).catch(() => { /* segue */ });
    });
    if (sseOn) return () => { alive = false; };
    const timer = setInterval(() => { if (alive) loadThread(selId); }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [selId, loadThread, loadCard, sseOn]);

  // presença (online / digitando… / gravando…) — poll leve enquanto aberta.
  // Sem reset síncrono aqui: ao trocar de conversa, openConv() já zera; e com
  // selId nulo a presença não é renderizada (convo é null).
  useEffect(() => {
    if (!selId) return;
    let alive = true;
    const poll = () => apiFetch<Presence>(`/inbox/conversations/${encodeURIComponent(selId)}/presence`)
      .then(p => { if (alive) setPresence(p || null); })
      .catch(() => { /* presença é best-effort */ });
    poll();
    const t = setInterval(poll, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [selId]);

  // mensagens rápidas (carrega ao abrir o popover a 1ª vez)
  const loadQuick = useCallback(() => {
    return apiFetch<QuickReply[]>("/inbox/quick-replies")
      .then(res => setQuickList(Array.isArray(res) ? res : []))
      .catch(() => { /* endpoint pode subir no próximo deploy do backend */ });
  }, []);

  // auto-scroll só quando o usuário já está no fim (não atrapalha paginar p/ cima)
  useEffect(() => {
    if (atBottomRef.current && endRef.current) {
      endRef.current.scrollTop = endRef.current.scrollHeight;
    }
  }, [thread]);

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
          phone: novaForm.phone.trim(),
          ...(novaForm.name.trim() ? { name: novaForm.name.trim() } : {}),
        }),
      });
      setNovaOpen(false);
      setNovaForm({ phone: "", name: "" });
      await loadConvs();
      if (res?.id != null) setSelId(String(res.id));
    } catch (err) {
      setNovaMsg(err instanceof Error ? err.message : "Não foi possível iniciar a conversa.");
    } finally {
      setNovaBusy(false);
    }
  }

  // troca de conversa (handler de clique — reset de UI fica fora de efeito)
  function openConv(id: string) {
    if (id === selId) return;
    setSelId(id);
    setReplyTo(null);
    setReactFor(null);
    setPresence(null);
    setEmojiOpen(false);
    setQuickOpen(false);
    setCard(null);
    setCtxTab(0);
    setAcoesOpen(false);
    setMoverOpen(false);
    setTarefaOpen(false);
    setAcaoMsg(null);
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
      await loadThread(selId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendBusy(false);
    }
  }

  // anexo: sobe o arquivo (POST /media) e envia a mensagem com o anexo
  async function sendAttachment(file: File, kind: string, extra?: { durationSeconds?: number }) {
    if (!selId) return;
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

  // gravação de nota de voz no navegador (MediaRecorder)
  async function startRec() {
    if (recording || !selId) return;
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "");
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recCancelRef.current = false;
      mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = 0; }
        if (recCancelRef.current) return;
        const baseMime = (mime || "audio/webm").split(";")[0];
        const ext = baseMime.includes("ogg") ? "ogg" : "webm";
        const secs = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: baseMime });
        const file = new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: baseMime });
        await sendAttachment(file, "audio", { durationSeconds: secs });
      };
      recRef.current = mr;
      recStartRef.current = Date.now();
      setRecSecs(0);
      mr.start();
      setRecording(true);
      recTimerRef.current = window.setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch {
      setSendError("Não foi possível acessar o microfone.");
    }
  }

  function stopRec(commit: boolean) {
    const mr = recRef.current;
    recCancelRef.current = !commit;
    setRecording(false);
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = 0; }
    if (mr && mr.state !== "inactive") { try { mr.stop(); } catch { /* já parou */ } }
  }

  async function doReact(m: InboxMessage, emoji: string) {
    setReactFor(null);
    if (!selId || !/^\d+$/.test(m.id)) return;
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/messages/${m.id}/reaction`, {
        method: "POST",
        body: JSON.stringify({ reaction: emoji }),
      });
      await loadThread(selId);
    } catch { /* segue */ }
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

  // "Não ligar mais" (PATCH status-card { doNotCall })
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

  // Enviar proposta: leva o contato para o Vendas (Radar → Vendas → WhatsApp)
  function enviarProposta() {
    try {
      sessionStorage.setItem("hbx:abrir-novo-lead", "1");
      if (convo) {
        sessionStorage.setItem("hbx:lead-contato", JSON.stringify({
          name: convName(convo),
          phone: convo.customer?.phone || convo.contact || "",
          email: convo.customer?.email || "",
        }));
      }
    } catch { /* sem storage */ }
    router.push("/vendas");
  }

  const convo = convs.find(c => c.id === selId) || null;
  const blocked = Boolean((convo?.metadata as Record<string, unknown> | null | undefined)?.["atendimentoBlockedAt"]);
  const naoLidas = convs.filter(c => convUnread(c) > 0);
  const filtered = convs
    .filter(c => tab === 0 ? true : tab === 1 ? convUnread(c) > 0 : c.humanAssigned === true)
    .filter(c => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return convName(c).toLowerCase().includes(q) || String(c.contact || "").includes(q);
    });

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

  function presenceNode() {
    const phone = convo?.customer?.phone || convo?.contact || "—";
    if (!presence) return <small>{phone}</small>;
    if (presence.typing) return <small><span className="typing"><i /><i /><i /></span> digitando…</small>;
    if (presence.recording) return <small>gravando áudio…</small>;
    if (presence.online) return <small>online</small>;
    if (presence.lastSeenAt) return <small>visto {fmtConvTime(presence.lastSeenAt)}</small>;
    return <small>{phone}</small>;
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
            ? <img className={"media-img" + (type === "sticker" ? " sticker" : "")} src={url} alt={meta.fileName || "imagem"} onClick={() => setLightbox(url)} />
            : <div className="cap">📷 Imagem</div>}
          {caption && <div className="cap">{caption}</div>}
        </>
      );
    }
    if (type === "video") {
      return (
        <>
          {url ? <video className="media-video" src={url} controls /> : <div className="cap">🎥 Vídeo</div>}
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
        <div className="a-content">
          <div className="a-left">
            <KpiRow items={[
              { icon: "users", label: "Atendimentos em aberto", value: convs.length ? String(convs.length) : "—", delta: "—" },
              { icon: "clock", label: "Tempo médio de resposta", value: fmtResp(metrics?.avgResponseSeconds), delta: metrics ? "7 dias" : "—" },
              { icon: "check", label: "Não lidas", value: convs.length ? String(naoLidas.length) : "—", delta: "—" },
              { icon: "money", label: "Conversões", value: metrics?.conversions != null ? String(metrics.conversions) : "—", delta: "—" },
            ]} />

            <div className="a-shell">
              <div className="convs">
                <div className="convs-head">
                  <div className="row">
                    <h2>Conversas</h2>
                    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <button className={"icon-ghost" + (filaOpen ? " on" : "")} onClick={() => setFilaOpen(o => !o)} title="Filtrar por fila" aria-label="Filtrar"><I d={ICONS.filter} size={15} /></button>
                      <button className="btn-ghost" style={{ minHeight: 32, fontSize: "0.7rem" }} onClick={() => setFilaOpen(o => !o)} aria-expanded={filaOpen}>
                        {FILAS.find(f => f.key === fila)?.label || "Todas as filas"} ▾
                      </button>
                      {filaOpen && (
                        <div className="hbx-pop" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 172, padding: 6, display: "grid", gap: 2 }}>
                          {FILAS.map(f => (
                            <button key={f.key || "all"} className={"nav-item" + (f.key === fila ? " active" : "")} style={{ minHeight: 32 }} onClick={() => aplicarFila(f.key)}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </span>
                    <button className="btn-teal" style={{ minHeight: 32, fontSize: "0.7rem" }} onClick={() => { setNovaOpen(true); setNovaMsg(null); }}>
                      <I d={ICONS.plus} size={13} /> Nova
                    </button>
                  </div>
                  <div className="row">
                    <button className={"tag" + (waStatus === "connected" ? " teal" : waStatus === "error" ? " red" : " warn")}
                      style={{ cursor: "pointer" }}
                      onClick={() => setWaModalOpen(true)} title="Conexão WhatsApp">
                      ● WhatsApp: {waStatus ? whatsappModalStatusLabel(waStatus) : "verificar"}
                    </button>
                  </div>
                </div>
                <div className="tabs">
                  {["Todas", "Não lidas", "Minhas"].map((t, i) => (
                    <button key={t} className={"tab" + (tab === i ? " active" : "")} onClick={() => setTab(i)}>
                      {t}{i === 0 && convs.length > 0 && <span className="n">{convs.length}</span>}{i === 1 && naoLidas.length > 0 && <span className="n">{naoLidas.length}</span>}
                    </button>
                  ))}
                </div>
                <div style={{ padding: "10px 14px" }}>
                  <input className="field-dark" placeholder="Buscar conversas..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <div className="conv-list">
                  {filtered.length === 0 && (
                    <div style={{ padding: "18px 14px", display: "grid", gap: 10, justifyItems: "start" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        {loadError || (waStatus === "connected"
                          ? "Nenhuma conversa ainda — as mensagens aparecem aqui."
                          : "WhatsApp ainda não conectado. Vincule o número para receber e responder no Atendimento.")}
                      </span>
                      {!loadError && waStatus !== "connected" && (
                        <button className="btn-teal" onClick={() => setWaModalOpen(true)}>
                          <I d={ICONS.msg} size={13} /> Conectar WhatsApp
                        </button>
                      )}
                    </div>
                  )}
                  {filtered.map(c => {
                    const un = convUnread(c);
                    const lastMsg = (c.messages || [])[(c.messages || []).length - 1] || null;
                    return (
                      <button key={c.id} className={"conv" + (selId === c.id ? " sel" : "")} onClick={() => openConv(c.id)}>
                        <Av name={convName(c)} size={36} />
                        <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
                          <span className="nm"><strong>{convName(c)}</strong><time>{fmtConvTime(c.lastMessageAt)}</time></span>
                          <span className="pv">
                            <small>{lastMsg?.content || "—"}</small>
                            <span className="chan wa">WhatsApp</span>
                            {un > 0 && <span className="unread">{un}</span>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-hairline)", textAlign: "center" }}>
                  {hasMore
                    ? <span className="link" style={{ cursor: "pointer" }} onClick={carregarMais}>{moreBusy ? "Carregando…" : "Carregar mais conversas ▾"}</span>
                    : <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{convs.length > 0 ? "Sem mais conversas" : "—"}</span>}
                </div>
              </div>

              <div className="thread">
                <div className="thread-head">
                  <Av name={convo ? convName(convo) : "—"} size={36} />
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>{convo ? convName(convo) : "Selecione uma conversa"}</strong>
                      {convo?.botActive && <span className="on"><i></i>Bot ativo</span>}
                    </span>
                    {convo ? presenceNode() : <small>—</small>}
                  </div>
                  <div style={{ marginLeft: "auto", display: "grid", gap: 6, justifyItems: "end" }}>
                    <span style={{ position: "relative", display: "inline-flex" }}>
                      <button className={"btn-ghost" + (acoesOpen ? " on" : "")} style={{ minHeight: 30, fontSize: "0.7rem" }}
                        disabled={!convo} onClick={() => { setAcoesOpen(o => !o); setAcaoMsg(null); }} aria-expanded={acoesOpen}>Ações ▾</button>
                      {acoesOpen && convo && (
                        <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 190, padding: 6, display: "grid", gap: 2 }}>
                          <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBot(!convo.botActive)}>{convo.botActive ? "Desligar bot" : "Ligar bot"}</button>
                          {blocked
                            ? <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBloqueio(false)}>Desbloquear contato</button>
                            : <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => acaoBloqueio(true)}>Bloquear contato</button>}
                          <button className="nav-item" style={{ minHeight: 32 }} onClick={() => { setAcoesOpen(false); enviarProposta(); }}>Abrir no Vendas</button>
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
                    const canReact = /^\d+$/.test(m.id) && !meta.isDeleted;
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
                          {canReact && (reactFor === m.id
                            ? <span className="reactions">{QUICK_RX.map(e => <button className="rx" key={e} onClick={() => doReact(m, e)}>{e}</button>)}</span>
                            : <button className="react-add" onClick={() => setReactFor(m.id)} aria-label="Reagir"><I d={ICONS.smile} size={15} /></button>)}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {visibleThread.length === 0 && convo && (
                    <span className="day">Sem mensagens nesta conversa</span>
                  )}
                </div>
                <div className="composer">
                  {sendError && (
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{sendError}</div>
                  )}
                  {replyTo && (
                    <div className="composer-quote">
                      <I d={ICONS.reply} size={14} />
                      <span className="body"><small>{replyTo.content || "Anexo"}</small></span>
                      <span className="x" onClick={() => setReplyTo(null)}><I d={ICONS.x} size={14} /></span>
                    </div>
                  )}

                  {recording ? (
                    <div className="rec-bar">
                      <span className="rec-dot" />
                      <span>Gravando nota de voz… {fmtDur(recSecs)}</span>
                      <button className="icon-ghost" style={{ marginLeft: "auto" }} onClick={() => stopRec(false)} title="Cancelar"><I d={ICONS.trash} size={17} /></button>
                      <button className="send" onClick={() => stopRec(true)} title="Enviar áudio"><I d={ICONS.send} size={16} /></button>
                    </div>
                  ) : (
                    <div className="row">
                      <input ref={draftRef} className="field-dark" style={{ flex: 1 }} placeholder="Digite sua mensagem..." value={draft}
                        onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} disabled={!convo || sendBusy} />
                      <button className={"icon-ghost" + (emojiOpen ? " on" : "")} onClick={() => { setEmojiOpen(o => !o); setQuickOpen(false); }} disabled={!convo} title="Emoji"><I d={ICONS.smile} size={17} /></button>
                      <button className="icon-ghost" onClick={() => fileRef.current?.click()} disabled={!convo || sendBusy} title="Anexar"><I d={ICONS.clip} size={17} /></button>
                      <button className="icon-ghost" onClick={startRec} disabled={!convo || sendBusy} title="Gravar áudio"><I d={ICONS.mic} size={17} /></button>
                      <button className="send" onClick={send} disabled={!convo || sendBusy}><I d={ICONS.send} size={16} /></button>
                    </div>
                  )}

                  <div>
                    <button className={"btn-ghost" + (quickOpen ? " on" : "")} style={{ minHeight: 30, fontSize: "0.7rem" }}
                      onClick={() => { const next = !quickOpen; setQuickOpen(next); setEmojiOpen(false); if (next) loadQuick(); }} disabled={!convo}>
                      <I d={ICONS.bolt} size={13} /> Inserir mensagem rápida
                    </button>
                  </div>

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
                        <input className="field-dark" placeholder="Título (ex.: Saudação)" maxLength={60} value={qrForm.title} onChange={e => setQrForm(f => ({ ...f, title: e.target.value }))} />
                        <input className="field-dark" placeholder="Texto da mensagem" maxLength={1000} value={qrForm.content} onChange={e => setQrForm(f => ({ ...f, content: e.target.value }))} />
                        <button className="btn-ghost" type="submit" disabled={qrBusy} style={{ minHeight: 32, fontSize: "0.7rem" }}>{qrBusy ? "Salvando…" : "Salvar mensagem rápida"}</button>
                      </form>
                    </div>
                  )}

                  <input ref={fileRef} type="file" hidden onChange={onPickFile}
                    accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" />
                </div>
              </div>
            </div>
          </div>

          <aside className="ctx">
            <div className="seg-toggle" style={{ width: "100%" }}>
              <button className={"seg" + (ctxTab === 0 ? " on" : "")} style={{ flex: 1 }} onClick={() => setCtxTab(0)}>Contexto do lead</button>
              <button className={"seg" + (ctxTab === 1 ? " on" : "")} style={{ flex: 1 }} onClick={() => setCtxTab(1)}>Histórico</button>
            </div>

            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <Av name={convo ? convName(convo) : "—"} size={44} />
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="company">{convo ? convName(convo) : "—"}</span>
                  {card?.customer?.doNotCall
                    ? <span className="tag red">Não ligar</span>
                    : <span className="tag teal">{card?.lead?.statusLabel || "Lead"}</span>}
                </div>
                <div className="sub">{convo?.customer?.phone || convo?.contact || "—"}</div>
              </div>
            </div>

            {ctxTab === 0 ? (
              <>
                <div className="kv">
                  <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.mail} size={13} /> E-mail</span><span className="v">{convo?.customer?.email || "—"}</span></div>
                  <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.phone} size={13} /> Telefone</span><span className="v">{convo?.customer?.phone || convo?.contact || "—"}</span></div>
                  <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.msg} size={13} /> Canal</span><span className="v"><span className="chan wa">WhatsApp</span></span></div>
                </div>
                <div className="sep"></div>
                <div className="kv">
                  <div className="row"><span className="k">Etapa do lead</span><span className="v">{card?.lead ? <span className="tag teal">{card.lead.statusLabel}</span> : "—"}</span></div>
                  <div className="row"><span className="k">Próxima ação</span><span className="v">{card?.lead?.nextAction || "—"}</span></div>
                  <div className="row"><span className="k">Retorno</span><span className="v">{card?.lead?.returnAt ? fmtHistTime(card.lead.returnAt) : "—"}</span></div>
                  <div className="row"><span className="k">Última mensagem</span><span className="v">{convo ? fmtConvTime(convo.lastMessageAt) : "—"}</span></div>
                  <div className="row"><span className="k">Bot</span><span className="v">{convo ? (convo.botActive ? "Ativo" : "Inativo") : "—"}</span></div>
                  <div className="row"><span className="k">Atendimento humano</span><span className="v">{convo ? (convo.humanAssigned ? "Sim" : "Não") : "—"}</span></div>
                </div>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 8 }}>
                  <h3>Observações</h3>
                  <textarea className="field-dark" rows={3} maxLength={500} placeholder="Anotações deste contato…"
                    value={obsDraft} onChange={e => setObsDraft(e.target.value)} disabled={!convo}
                    style={{ resize: "vertical", paddingTop: 8, paddingBottom: 8 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <button className="btn-ghost" disabled={!convo || acaoBusy} onClick={() => alternarNaoLigar(!card?.customer?.doNotCall)}>
                      {card?.customer?.doNotCall ? "Liberar contato" : "Não ligar mais"}
                    </button>
                    <button className="btn-teal" style={{ minHeight: 36 }} disabled={!convo || obsBusy} onClick={salvarObs}>{obsBusy ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
                <div className="sep"></div>
                <div>
                  <h3 style={{ marginBottom: 4 }}>Últimas interações <span className="link" style={{ fontWeight: 700 }} onClick={() => setCtxTab(1)}>Ver todas</span></h3>
                  <div className="kv" style={{ marginTop: 8 }}>
                    {visibleThread.slice(-3).reverse().map(m => (
                      <div className="row" key={m.id}>
                        <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <I d={ICONS.msg} size={13} />
                          {m.direction === "outbound" ? "Enviada" : "Recebida"}
                        </span>
                        <span className="v">{fmtConvTime(m.createdAt)}</span>
                      </div>
                    ))}
                    {visibleThread.length === 0 && <div className="row"><span className="k">—</span><span className="v">—</span></div>}
                  </div>
                </div>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 8 }}>
                  <h3>Ações rápidas</h3>
                  {acaoMsg && <span className="tag red">{acaoMsg}</span>}
                  <span style={{ position: "relative", display: "grid" }}>
                    <button className="btn-teal" disabled={!convo || acaoBusy} onClick={() => { setMoverOpen(o => !o); setTarefaOpen(false); setAcaoMsg(null); }}><I d={ICONS.arrow} size={14} /> Mover etapa</button>
                    {moverOpen && convo && (
                      <div className="hbx-pop" style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)", zIndex: 30, padding: 6, display: "grid", gap: 2 }}>
                        <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => moverEtapa("new")}>Novo · bot assume</button>
                        <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => moverEtapa("open")}>Em atendimento humano</button>
                        <button className="nav-item" style={{ minHeight: 32 }} disabled={acaoBusy} onClick={() => moverEtapa("closed")}>Encerrar conversa</button>
                      </div>
                    )}
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <span style={{ position: "relative", display: "grid" }}>
                      <button className="btn-ghost" disabled={!convo} onClick={() => { setTarefaOpen(o => !o); setMoverOpen(false); setAcaoMsg(null); }}><I d={ICONS.check} size={13} /> Criar tarefa</button>
                      {tarefaOpen && convo && (
                        <div className="hbx-pop" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 30, minWidth: 200, padding: 8, display: "grid", gap: 6 }}>
                          <label className="sub" style={{ marginTop: 0 }}>Agendar retorno</label>
                          <input className="field-dark" type="date" value={tarefaData} onChange={e => setTarefaData(e.target.value)} />
                          <button className="btn-teal" style={{ minHeight: 34 }} disabled={!tarefaData || acaoBusy} onClick={agendarRetorno}>{acaoBusy ? "Agendando…" : "Agendar retorno"}</button>
                        </div>
                      )}
                    </span>
                    <button className="btn-ghost" disabled={!convo} onClick={enviarProposta}><I d={ICONS.doc} size={13} /> Enviar proposta</button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <h3>Histórico do lead</h3>
                {(!card || card.history.length === 0) && (
                  <span className="sub" style={{ marginTop: 0 }}>{convo ? "Sem histórico registrado para este contato ainda." : "Selecione uma conversa."}</span>
                )}
                {card?.history.map(h => (
                  <div key={h.id} style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: "0.76rem" }}>{h.title}</strong>
                      <small className="sub" style={{ marginTop: 0, whiteSpace: "nowrap" }}>{fmtHistTime(h.createdAt)}</small>
                    </div>
                    {h.description && <span className="sub" style={{ marginTop: 0 }}>{h.description}</span>}
                    {(h.resultLabel || h.returnAt) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {h.resultLabel && <span className="tag teal">{h.resultLabel}</span>}
                        {h.returnAt && <span className="tag warn">Retorno {fmtHistTime(h.returnAt)}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

      <WhatsAppConnectModal
        open={waModalOpen}
        onClose={() => { setWaModalOpen(false); refreshWaStatus(); }}
        onConnected={() => { refreshWaStatus(); loadConvs(); }}
      />

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
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Nova conversa
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setNovaOpen(false)}>✕</span>
            </h3>
            {novaMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{novaMsg}</div>}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Telefone (com DDD) *</label>
              <input className="field-dark" required maxLength={20} placeholder="11999990000" value={novaForm.phone}
                onChange={e => setNovaForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome (opcional)</label>
              <input className="field-dark" maxLength={120} value={novaForm.name}
                onChange={e => setNovaForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={novaBusy} style={{ minHeight: 42 }}>
              {novaBusy ? "Iniciando…" : "Iniciar conversa"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
