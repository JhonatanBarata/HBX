"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type Customer = {
  id: string;
  phone: string;
  name: string | null;
};

type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  content: string;
  createdAt: string;
  messageType: string;
  senderType: string;
  sourceModule?: string | null;
  status: string;
  error: string | null;
};

type InboxConversation = {
  id: string;
  status: "new" | "open" | "closed" | string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  routeTarget: "recovery" | "atendimento";
  routeReason: string;
  recoveryCustomerId: string | null;
  recoveryCustomerName: string | null;
  recoveryOpenAmount: number;
  recoveryCurrentStep: string | null;
  recoverySuggestedPath: string;
  latestSourceModule: string | null;
  customer: Customer;
  messages: InboxMessage[];
};

type StatusFilter = "all" | "new" | "open" | "closed";
type RouteFilter = "all" | "recovery" | "atendimento";

function getMessagePreview(message?: InboxMessage | null) {
  if (!message) return "Sem mensagens";
  const content = String(message.content || "").trim();
  if (content) return content;
  const type = String(message.messageType || "text").trim().toLowerCase();
  if (type === "image") return "[Imagem recebida]";
  if (type === "audio") return "[Audio recebido]";
  if (type === "document") return "[Documento recebido]";
  if (type === "interactive") return "[Interacao recebida]";
  if (type === "button") return "[Botao recebido]";
  if (type === "system") return "[Evento do sistema]";
  return `[${type || "mensagem"}]`;
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const [mounted, setMounted] = useState(false);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => setMounted(true), []);

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (!mounted) return date.toISOString();
    return date.toLocaleString("pt-BR");
  }

  function getMessageMeta(message: InboxMessage) {
    const parts = [
      String(message.senderType || "").trim().toLowerCase() || "system",
      String(message.messageType || "").trim().toLowerCase() || "text",
      String(message.status || "").trim().toUpperCase() || "RECEIVED",
    ];
    if (message.error) parts.push(`erro: ${message.error}`);
    return parts.join(" • ");
  }

  function getBubbleClass(message: InboxMessage) {
    const direction = String(message.direction || "").trim().toLowerCase();
    const senderType = String(message.senderType || "").trim().toLowerCase();
    if (senderType === "system") return styles.systemBubble;
    if (direction === "outbound") return styles.outboundBubble;
    return styles.inboundBubble;
  }

  const loadConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoadingConversation(true);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${id}`);
      setSelectedConversation(data);
      setSelectedId(data.id);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setError(message);
    } finally {
      if (!silent) setLoadingConversation(false);
    }
  }, []);

  const loadConversations = useCallback(
    async (options?: { preferredId?: string | null; silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingList(true);
      if (silent) setRefreshingList(true);
      setError(null);
      try {
        const data = await apiFetch<InboxConversation[]>("/inbox/conversations");
        setConversations(data);
        setLastRefreshedAt(new Date().toISOString());

        const pickedId = options?.preferredId ?? selectedId ?? data[0]?.id ?? null;
        setSelectedId(pickedId);
        if (pickedId) {
          await loadConversation(pickedId, { silent: true });
        } else {
          setSelectedConversation(null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setError(message);
      } finally {
        if (!silent) setLoadingList(false);
        if (silent) setRefreshingList(false);
      }
    },
    [loadConversation, selectedId],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    return startSmartPolling(() => loadConversations({ silent: true }), {
      intervalMs: 10000,
      immediate: true,
    });
  }, [hasToken, loadConversations]);

  async function updateStatus(status: "new" | "open" | "closed") {
    if (!selectedId) return;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSelectedConversation(data);
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
      setError(message);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !sendText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
        method: "POST",
        body: JSON.stringify({ content: sendText.trim() }),
      });
      setSendText("");
      setSelectedConversation(data);
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Falha ao enviar mensagem.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function simulateMessage() {
    setSimulating(true);
    setError(null);
    try {
      const fallback = `+5511${Math.floor(100000000 + Math.random() * 899999999)}`;
      const phone = selectedConversation?.customer.phone || fallback;
      const message = `Mensagem simulada em ${new Date().toLocaleTimeString("pt-BR")}`;
      const data = await apiFetch<InboxConversation>("/inbox/mock-message", {
        method: "POST",
        body: JSON.stringify({ phone, message }),
      });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (simulateError) {
      const message = simulateError instanceof Error ? simulateError.message : "Falha ao simular mensagem.";
      setError(message);
    } finally {
      setSimulating(false);
    }
  }

  const filteredConversations = useMemo(() => {
    const normalizedSearch = String(deferredSearch || "").trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (statusFilter !== "all" && conversation.status !== statusFilter) return false;
      if (routeFilter !== "all" && conversation.routeTarget !== routeFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        conversation.customer.name || "",
        conversation.customer.phone,
        conversation.routeReason,
        conversation.recoveryCustomerName || "",
        getMessagePreview(conversation.messages?.[0]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [conversations, deferredSearch, routeFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: conversations.length,
      newCount: conversations.filter((item) => item.status === "new").length,
      openCount: conversations.filter((item) => item.status === "open").length,
      closedCount: conversations.filter((item) => item.status === "closed").length,
      recoveryCount: conversations.filter((item) => item.routeTarget === "recovery").length,
      atendimentoCount: conversations.filter((item) => item.routeTarget === "atendimento").length,
    }),
    [conversations],
  );

  const selectedStatus = selectedConversation?.status ?? "new";
  const customerRows = useMemo(() => {
    const map = new Map<
      string,
      {
        customerName: string;
        phone: string;
        routeTarget: "recovery" | "atendimento";
        routeReason: string;
        openAmount: number;
        conversationCount: number;
        openConversationCount: number;
        updatedAt: string;
        recoveryCurrentStep: string | null;
        recoverySuggestedPath: string;
        conversationId: string;
      }
    >();

    for (const conversation of filteredConversations) {
      const key = String(conversation.customer.phone || conversation.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          customerName: conversation.customer.name || conversation.customer.phone,
          phone: conversation.customer.phone,
          routeTarget: conversation.routeTarget,
          routeReason: conversation.routeReason,
          openAmount: conversation.recoveryOpenAmount,
          conversationCount: 1,
          openConversationCount: conversation.status === "open" ? 1 : 0,
          updatedAt: conversation.updatedAt,
          recoveryCurrentStep: conversation.recoveryCurrentStep,
          recoverySuggestedPath: conversation.recoverySuggestedPath,
          conversationId: conversation.id,
        });
        continue;
      }
      existing.conversationCount += 1;
      if (conversation.status === "open") existing.openConversationCount += 1;
      if (new Date(conversation.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        existing.updatedAt = conversation.updatedAt;
        existing.routeTarget = conversation.routeTarget;
        existing.routeReason = conversation.routeReason;
        existing.openAmount = conversation.recoveryOpenAmount;
        existing.recoveryCurrentStep = conversation.recoveryCurrentStep;
        existing.recoverySuggestedPath = conversation.recoverySuggestedPath;
        existing.conversationId = conversation.id;
      }
    }

    return Array.from(map.values()).sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [filteredConversations]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }
  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Central premium de Atendimento"
      description="Fila manual, contexto de cobranca e rota sugerida entre Atendimento e HBX Recovery sem perder a conversa."
      actions={
        <>
          <Link href="/dashboard/messages" className="btn btn-secondary btn-sm">
            Mensagens e logs
          </Link>
          <button type="button" onClick={simulateMessage} disabled={simulating} className="btn btn-primary btn-sm">
            {simulating ? "Simulando..." : "Simular mensagem"}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className={styles.heroGrid}>
        <article className={`panel ${styles.heroPanel}`}>
          <div>
            <p className={styles.eyebrow}>Atendimento vivo</p>
            <h2>Fila manual com contexto de rota</h2>
            <p>
              O Inbox agora distingue o que deve continuar no Atendimento e o que faz mais sentido abrir no HBX Recovery.
            </p>
          </div>
          <div className={styles.refreshBadge}>
            <span className={refreshingList ? styles.refreshDotActive : styles.refreshDot} />
            {refreshingList ? "Atualizando silenciosamente" : "Sincronizacao continua ativa"}
            {lastRefreshedAt ? <strong>{formatDate(lastRefreshedAt)}</strong> : null}
          </div>
        </article>

        <div className={styles.statGrid}>
          <article className={`panel ${styles.statCard}`}>
            <span>Total</span>
            <strong>{stats.total}</strong>
          </article>
          <article className={`panel ${styles.statCard}`}>
            <span>Novas</span>
            <strong>{stats.newCount}</strong>
          </article>
          <article className={`panel ${styles.statCard}`}>
            <span>Em humano</span>
            <strong>{stats.openCount}</strong>
          </article>
          <article className={`panel ${styles.statCard}`}>
            <span>Rota Recovery</span>
            <strong>{stats.recoveryCount}</strong>
          </article>
        </div>
      </section>

      <section className={`panel ${styles.filterPanel}`}>
        <div className={styles.filterRow}>
          <label className={styles.filterField}>
            <span>Buscar conversa</span>
            <input
              className="field"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cliente, telefone ou motivo da rota"
            />
          </label>
          <label className={styles.filterField}>
            <span>Status</span>
            <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">Todos</option>
              <option value="new">Novas</option>
              <option value="open">Em humano</option>
              <option value="closed">Encerradas</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Destino sugerido</span>
            <select className="field" value={routeFilter} onChange={(event) => setRouteFilter(event.target.value as RouteFilter)}>
              <option value="all">Tudo</option>
              <option value="atendimento">Atendimento</option>
              <option value="recovery">Recovery</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => loadConversations()}>
            Atualizar agora
          </button>
        </div>
      </section>

      <section className={styles.workspace}>
        <article className={`panel ${styles.listPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Fila filtrada</h3>
              <p>{filteredConversations.length} conversa(s) na visualizacao atual.</p>
            </div>
          </div>

          {loadingList ? (
            <p className="text-sm text-muted">Carregando conversas...</p>
          ) : filteredConversations.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma conversa encontrada com os filtros atuais.</p>
          ) : (
            <div className={styles.conversationList}>
              {filteredConversations.map((conversation) => {
                const active = conversation.id === selectedId;
                const last = conversation.messages?.[0];
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => loadConversation(conversation.id)}
                    className={`${styles.conversationCard} ${active ? styles.conversationCardActive : ""}`}
                  >
                    <div className={styles.cardHeader}>
                      <div>
                        <strong>{conversation.customer.name || conversation.customer.phone}</strong>
                        <span>{conversation.customer.phone}</span>
                      </div>
                      <span className={styles.statusBadge}>{conversation.status}</span>
                    </div>

                    <div className={styles.badgeRow}>
                      <span
                        className={`${styles.routeBadge} ${
                          conversation.routeTarget === "recovery" ? styles.routeRecovery : styles.routeAtendimento
                        }`}
                      >
                        {conversation.routeTarget === "recovery" ? "Rota Recovery" : "Rota Atendimento"}
                      </span>
                      {conversation.recoveryOpenAmount > 0 ? (
                        <span className={styles.amountBadge}>{formatCurrency(conversation.recoveryOpenAmount)}</span>
                      ) : null}
                    </div>

                    <p className={styles.routeReason}>{conversation.routeReason}</p>
                    <p className={styles.preview}>{getMessagePreview(last)}</p>
                    <p className={styles.previewMeta}>Atualizada em {formatDate(conversation.updatedAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className={`panel ${styles.detailPanel}`}>
          {loadingConversation ? (
            <p className="text-sm text-muted">Carregando conversa...</p>
          ) : !selectedConversation ? (
            <p className="text-sm text-muted">Selecione uma conversa para iniciar o atendimento.</p>
          ) : (
            <div className={styles.detailBody}>
              <div className={styles.panelHeader}>
                <div>
                  <h3>{selectedConversation.customer.name || "Cliente sem nome"}</h3>
                  <p>{selectedConversation.customer.phone}</p>
                </div>
                <div className={styles.headerActions}>
                  {selectedConversation.routeTarget === "recovery" ? (
                    <Link href="/hbx-recovery" className="btn btn-secondary btn-sm">
                      Abrir no Recovery
                    </Link>
                  ) : null}
                  {(["new", "open", "closed"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateStatus(status)}
                      className={`btn btn-sm ${selectedStatus === status ? "btn-primary" : "btn-secondary"}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.routeBanner}>
                <div>
                  <strong>
                    {selectedConversation.routeTarget === "recovery"
                      ? "Destino sugerido: HBX Recovery"
                      : "Destino sugerido: Atendimento"}
                  </strong>
                  <p>{selectedConversation.routeReason}</p>
                </div>
                <div className={styles.badgeRow}>
                  {selectedConversation.recoveryCurrentStep ? (
                    <span className={styles.infoBadge}>{selectedConversation.recoveryCurrentStep}</span>
                  ) : null}
                  {selectedConversation.recoveryOpenAmount > 0 ? (
                    <span className={styles.amountBadge}>{formatCurrency(selectedConversation.recoveryOpenAmount)}</span>
                  ) : null}
                </div>
              </div>

              <div className={styles.timeline}>
                {selectedConversation.messages.length === 0 ? (
                  <p className="text-sm text-muted">Sem mensagens nesta conversa.</p>
                ) : (
                  selectedConversation.messages.map((message) => (
                    <div key={message.id} className={`${styles.messageBubble} ${getBubbleClass(message)}`}>
                      <p>{getMessagePreview(message)}</p>
                      <span>{getMessageMeta(message)}</span>
                      <span>{formatDate(message.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} className={styles.replyForm}>
                <input
                  value={sendText}
                  onChange={(event) => setSendText(event.target.value)}
                  placeholder="Digite uma resposta manual..."
                  className="field"
                />
                <button disabled={sending || !sendText.trim()} className="btn btn-primary" type="submit">
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </div>
          )}
        </article>
      </section>

      <section className={`panel ${styles.customerTablePanel}`}>
        <div className={styles.panelHeader}>
          <div>
            <h3>Tabela de clientes do Atendimento</h3>
            <p>Base consolidada por telefone, com rota sugerida e contexto de cobranca para priorizacao operacional.</p>
          </div>
        </div>

        {customerRows.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cliente encontrado para os filtros atuais.</p>
        ) : (
          <div className={styles.customerTableWrap}>
            <table className={styles.customerTable}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Rota</th>
                  <th>Em aberto</th>
                  <th>Conversas</th>
                  <th>Ultima atualizacao</th>
                  <th>Contexto</th>
                  <th>Abrir</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((row) => (
                  <tr key={`customer-${row.phone}`}>
                    <td>
                      <strong>{row.customerName}</strong>
                      <span>{row.phone}</span>
                    </td>
                    <td>
                      <span className={`${styles.routeBadge} ${row.routeTarget === "recovery" ? styles.routeRecovery : styles.routeAtendimento}`}>
                        {row.routeTarget === "recovery" ? "Recovery" : "Atendimento"}
                      </span>
                    </td>
                    <td>{row.openAmount > 0 ? formatCurrency(row.openAmount) : "-"}</td>
                    <td>{`${row.conversationCount} total / ${row.openConversationCount} abertas`}</td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>{row.recoveryCurrentStep || row.routeReason}</td>
                    <td>
                      <div className={styles.tableActionRow}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => loadConversation(row.conversationId)}
                        >
                          Conversa
                        </button>
                        {row.routeTarget === "recovery" ? (
                          <Link href={row.recoverySuggestedPath} className="btn btn-primary btn-sm">
                            Recovery
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardScaffold>
  );
}
