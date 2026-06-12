"use client";

// Tela Atendimento (template docs/TEMAS/*/corporate/Atendimento.html) ligada
// no inbox real (WhatsApp via Webwhats — mensageria do backend):
//   - Conversas → GET /inbox/conversations?take=50
//   - Thread → GET /inbox/conversations/:id/messages (polling 8s)
//   - Enviar → POST /inbox/conversations/:id/message { content }
//   - Marcar lida → PATCH /inbox/conversations/:id/read
// Tabs Todas/Não lidas/Minhas = filtro client-side (unread/humanAssigned).
// KPIs sem contrato mostram "—" (abertos = conversas carregadas); seções do
// painel sem endpoint seguem visuais — ver doc do PR.
// Adaptação SPA: classe extra "app-viewport" no .app (ver screens.css).

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS, KpiRow, Sidebar, Topbar } from "@/components/hbx/shell";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { apiFetch } from "@/lib/api";
import { fetchWhatsAppModalStatus } from "@/lib/whatsapp-connection-flow";
import { whatsappModalStatusLabel } from "@/lib/whatsapp-center";

type InboxMessage = {
  id: string;
  direction: string; // inbound | outbound
  content: string;
  createdAt: string;
  messageType?: string;
  status?: string;
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

type MessagesResponse = { messages: InboxMessage[]; hasMore?: boolean };

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

export function AtendimentoClient() {
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [busca, setBusca] = useState("");
  const [thread, setThread] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // conexão WhatsApp (R2.9): chip de status + modal QR/start/disconnect
  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waModalOpen, setWaModalOpen] = useState(false);

  const refreshWaStatus = useCallback(() => {
    return fetchWhatsAppModalStatus()
      .then(res => setWaStatus(res?.status || null))
      .catch(() => setWaStatus(null));
  }, []);

  useEffect(() => { refreshWaStatus(); }, [refreshWaStatus]);

  const [hasMore, setHasMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  const loadConvs = useCallback(() => {
    return apiFetch<InboxConversation[]>("/inbox/conversations?take=50")
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

  async function carregarMais() {
    if (moreBusy || !hasMore) return;
    setMoreBusy(true);
    try {
      const res = await apiFetch<InboxConversation[]>(`/inbox/conversations?take=50&skip=${convs.length}`);
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
      })
      .catch(() => setThread([]));
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // thread da conversa selecionada + marcar como lida
  useEffect(() => {
    if (!selId) return;
    let alive = true;
    loadThread(selId).then(() => {
      if (!alive) return;
      apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/read`, { method: "PATCH", body: JSON.stringify({}) }).catch(() => { /* segue */ });
    });
    const timer = setInterval(() => { if (alive) loadThread(selId); }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [selId, loadThread]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight;
  }, [thread]);

  async function send() {
    const content = draft.trim();
    if (!content || !selId || sendBusy) return;
    setSendBusy(true);
    setSendError(null);
    try {
      await apiFetch(`/inbox/conversations/${encodeURIComponent(selId)}/message`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setDraft("");
      await loadThread(selId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSendBusy(false);
    }
  }

  const convo = convs.find(c => c.id === selId) || null;
  const naoLidas = convs.filter(c => convUnread(c) > 0);
  const filtered = convs
    .filter(c => tab === 0 ? true : tab === 1 ? convUnread(c) > 0 : c.humanAssigned === true)
    .filter(c => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return convName(c).toLowerCase().includes(q) || String(c.contact || "").includes(q);
    });

  const threadWithDays = thread.map((m, i) => {
    const day = dayLabel(m.createdAt);
    const prevDay = i > 0 ? dayLabel(thread[i - 1].createdAt) : "";
    return { m, day, showDay: Boolean(day) && day !== prevDay };
  });

  return (
    <div className="app app-viewport">
      <Sidebar active="atend" />
      <div className="main">
        <Topbar title="Atendimento" crumbs={<React.Fragment>Home &rsaquo; <b>Atendimento</b></React.Fragment>} />
        <div className="a-content">
          <div className="a-left">
            <KpiRow items={[
              { icon: "users", label: "Atendimentos em aberto", value: convs.length ? String(convs.length) : "—", delta: "—" },
              { icon: "clock", label: "Tempo médio de resposta", value: "—", delta: "—" },
              { icon: "check", label: "Não lidas", value: convs.length ? String(naoLidas.length) : "—", delta: "—" },
              { icon: "money", label: "Conversões", value: "—", delta: "—" },
            ]} />

            <div className="a-shell">
              <div className="convs">
                <div className="convs-head">
                  <div className="row">
                    <h2>Conversas</h2>
                    <button className="icon-ghost"><I d={ICONS.filter} size={15} /></button>
                    <button className="btn-ghost" style={{ minHeight: 32, fontSize: "0.7rem" }}>Todos os canais ▾</button>
                  </div>
                  <div className="row">
                    <button className={"tag" + (waStatus === "connected" ? " teal" : waStatus === "error" ? " red" : " warn")}
                      style={{ cursor: "pointer", border: "1px solid", background: "transparent" }}
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
                    <div style={{ padding: "18px 14px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {loadError || "Nenhuma conversa — conecte o WhatsApp e aguarde mensagens."}
                    </div>
                  )}
                  {filtered.map(c => {
                    const un = convUnread(c);
                    const lastMsg = (c.messages || [])[ (c.messages || []).length - 1 ] || null;
                    return (
                      <button key={c.id} className={"conv" + (selId === c.id ? " sel" : "")} onClick={() => setSelId(c.id)}>
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
                    <small>{convo?.customer?.phone || convo?.contact || "—"}</small>
                  </div>
                  <div style={{ marginLeft: "auto", display: "grid", gap: 6, justifyItems: "end" }}>
                    <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem" }}>WhatsApp ▾</button>
                  </div>
                </div>
                <div className="msgs" ref={endRef}>
                  {threadWithDays.map(({ m, day, showDay }) => {
                    const out = m.direction === "outbound";
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && <span className="day">{day}</span>}
                        <div className={"msg " + (out ? "out" : "in")}>
                          {!out && convo && <Av name={convName(convo)} size={26} />}
                          <div className="bubble">
                            <div style={{ whiteSpace: "pre-line" }}>{m.content}</div>
                            <div className="tm">{fmtMsgTime(m.createdAt)}{out && <span className="ck">✓✓</span>}</div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {thread.length === 0 && convo && (
                    <span className="day">Sem mensagens nesta conversa</span>
                  )}
                </div>
                <div className="composer">
                  {sendError && (
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{sendError}</div>
                  )}
                  <div className="row">
                    <input className="field-dark" style={{ flex: 1 }} placeholder="Digite sua mensagem..." value={draft}
                      onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} disabled={!convo || sendBusy} />
                    <button className="icon-ghost"><I d={ICONS.smile} size={17} /></button>
                    <button className="icon-ghost"><I d={ICONS.clip} size={17} /></button>
                    <button className="icon-ghost"><I d={ICONS.mark} size={17} /></button>
                    <button className="send" onClick={send} disabled={!convo || sendBusy}><I d={ICONS.send} size={16} /></button>
                  </div>
                  <div><button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem" }}><I d={ICONS.doc} size={13} /> Inserir mensagem rápida</button></div>
                </div>
              </div>
            </div>
          </div>

          <aside className="ctx">
            <div style={{ display: "flex", gap: 14, borderBottom: "1px solid var(--border-hairline)", paddingBottom: 10 }}>
              <span className="link" style={{ fontSize: "0.78rem" }}>Contexto do lead</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700, cursor: "pointer" }}>Histórico</span>
            </div>
            <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <Av name={convo ? convName(convo) : "—"} size={44} />
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="company">{convo ? convName(convo) : "—"}</span>
                  <span className="tag teal">Lead</span>
                </div>
                <div className="sub">{convo?.customer?.phone || convo?.contact || "—"}</div>
              </div>
            </div>
            <div className="kv">
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.mail} size={13} /> E-mail</span><span className="v" style={{ fontWeight: 600, fontSize: "0.7rem" }}>{convo?.customer?.email || "—"}</span></div>
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.phone} size={13} /> Telefone</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{convo?.customer?.phone || convo?.contact || "—"}</span></div>
              <div className="row"><span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I d={ICONS.msg} size={13} /> Canal</span><span className="v"><span className="chan wa">WhatsApp</span></span></div>
            </div>
            <div className="sep"></div>
            <div className="kv">
              <div className="row"><span className="k">Última mensagem</span><span className="v">{convo ? fmtConvTime(convo.lastMessageAt) : "—"}</span></div>
              <div className="row"><span className="k">Bot</span><span className="v">{convo ? (convo.botActive ? "Ativo" : "Inativo") : "—"}</span></div>
              <div className="row"><span className="k">Atendimento humano</span><span className="v">{convo ? (convo.humanAssigned ? "Sim" : "Não") : "—"}</span></div>
            </div>
            <div className="sep"></div>
            <div>
              <h3 style={{ marginBottom: 4 }}>Últimas interações <span className="link" style={{ fontWeight: 700 }}>Ver todas</span></h3>
              <div className="kv" style={{ marginTop: 8 }}>
                {thread.slice(-3).reverse().map(m => (
                  <div className="row" key={m.id}>
                    <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: m.direction === "outbound" ? "#4CC2FF" : "#22C77D" }}>
                      <I d={ICONS.msg} size={13} />
                      <span style={{ color: "var(--text-muted)" }}>{m.direction === "outbound" ? "Enviada" : "Recebida"}</span>
                    </span>
                    <span className="v" style={{ fontWeight: 600 }}>{fmtConvTime(m.createdAt)}</span>
                  </div>
                ))}
                {thread.length === 0 && <div className="row"><span className="k">—</span><span className="v">—</span></div>}
              </div>
            </div>
            <div className="sep"></div>
            <div style={{ display: "grid", gap: 8 }}>
              <h3>Ações rápidas</h3>
              <button className="btn-teal"><I d={ICONS.arrow} size={14} /> Mover etapa</button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button className="btn-ghost"><I d={ICONS.check} size={13} /> Criar tarefa</button>
                <button className="btn-ghost"><I d={ICONS.doc} size={13} /> Enviar proposta</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <WhatsAppConnectModal
        open={waModalOpen}
        onClose={() => { setWaModalOpen(false); refreshWaStatus(); }}
        onConnected={() => { refreshWaStatus(); loadConvs(); }}
      />
    </div>
  );
}
