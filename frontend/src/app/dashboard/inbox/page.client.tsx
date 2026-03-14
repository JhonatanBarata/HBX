"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";

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
};

type InboxConversation = {
  id: string;
  status: "new" | "open" | "closed" | string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  messages: InboxMessage[];
};

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const [mounted, setMounted] = useState(false);

  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => setMounted(true), []);

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (!mounted) return date.toISOString();
    return date.toLocaleString();
  }

  const loadConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoadingConversation(true);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${id}`);
      setSelectedConversation(data);
      setSelectedId(data.id);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setError(message);
    } finally {
      if (!silent) setLoadingConversation(false);
    }
  }, []);

  const loadConversations = useCallback(
    async (preferredId?: string | null) => {
      setError(null);
      try {
        const data = await apiFetch<InboxConversation[]>("/inbox/conversations");
        setConversations(data);

        const pickedId = preferredId ?? selectedId ?? data[0]?.id ?? null;
        setSelectedId(pickedId);
        if (pickedId) {
          await loadConversation(pickedId, { silent: true });
        } else {
          setSelectedConversation(null);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setError(message);
      } finally {
        setLoadingList(false);
      }
    },
    [loadConversation, selectedId]
  );

  useEffect(() => {
    if (hasToken !== true) return;
    setLoadingList(true);
    return startSmartPolling(() => loadConversations(), {
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
      await loadConversations(data.id);
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
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
      await loadConversations(data.id);
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
      const message = `Mensagem simulada em ${new Date().toLocaleTimeString()}`;

      const data = await apiFetch<InboxConversation>("/inbox/mock-message", {
        method: "POST",
        body: JSON.stringify({ phone, message }),
      });
      await loadConversations(data.id);
    } catch (simulateError) {
      const message =
        simulateError instanceof Error ? simulateError.message : "Falha ao simular mensagem.";
      setError(message);
    } finally {
      setSimulating(false);
    }
  }

  const selectedStatus = useMemo(() => selectedConversation?.status ?? "new", [selectedConversation]);

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
      title="Dashboard operacional"
      description="Monitoramento de conversas em tempo real com fluxo de atendimento."
      actions={
        <>
          <Link href="/dashboard/messages" className="btn btn-secondary btn-sm">
            Mensagens e logs
          </Link>
          <button
            type="button"
            onClick={simulateMessage}
            disabled={simulating}
            className="btn btn-primary btn-sm"
          >
            {simulating ? "Simulando..." : "Simular mensagem"}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-4">
        <article className="panel p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-semibold">Conversas</h2>
              <p className="text-xs text-muted">Fila ativa de atendimento</p>
            </div>
            <button
              type="button"
              onClick={() => loadConversations()}
              className="btn btn-secondary btn-sm"
            >
              Atualizar
            </button>
          </div>

          {loadingList ? (
            <p className="text-sm text-muted">Carregando conversas...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma conversa encontrada.</p>
          ) : (
            <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
              {conversations.map((conversation) => {
                const last = conversation.messages?.[0];
                const active = conversation.id === selectedId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => loadConversation(conversation.id)}
                    className={`w-full text-left rounded-[12px] border p-2.5 transition ${
                      active
                        ? "border-[color:var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,white)]"
                        : "border-[var(--line)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">
                        {conversation.customer.name || conversation.customer.phone}
                      </p>
                      <span className="badge uppercase">{conversation.status}</span>
                    </div>
                    <p className="text-xs text-muted truncate mt-1">{conversation.customer.phone}</p>
                    <p className="text-xs text-muted truncate mt-1">
                      {last?.content || "Sem mensagens"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel p-3">
          {loadingConversation ? (
            <p className="text-sm text-muted">Carregando conversa...</p>
          ) : !selectedConversation ? (
            <p className="text-sm text-muted">Selecione uma conversa para iniciar o atendimento.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg">
                    {selectedConversation.customer.name || "Cliente sem nome"}
                  </h2>
                  <p className="text-xs text-muted">{selectedConversation.customer.phone}</p>
                  <p className="text-xs text-muted mt-1">
                    Atualizado em {formatDate(selectedConversation.updatedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {(["new", "open", "closed"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateStatus(status)}
                      className={`btn btn-sm ${
                        selectedStatus === status ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[450px] overflow-auto border border-[var(--line)] rounded-[14px] p-3 bg-[var(--surface-soft)] space-y-2">
                {selectedConversation.messages.length === 0 ? (
                  <p className="text-sm text-muted">Sem mensagens nesta conversa.</p>
                ) : (
                  selectedConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[82%] rounded-[12px] p-2.5 text-sm ${
                        message.direction === "outbound"
                          ? "ml-auto bg-[color-mix(in_srgb,var(--brand)_12%,white)] border border-[color-mix(in_srgb,var(--brand)_26%,white)]"
                          : "bg-white border border-[var(--line)]"
                      }`}
                    >
                      <p className="break-words leading-relaxed">{message.content}</p>
                      <p className="text-[10px] text-muted mt-1">{formatDate(message.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  value={sendText}
                  onChange={(event) => setSendText(event.target.value)}
                  placeholder="Digite uma resposta..."
                  className="field flex-1"
                />
                <button disabled={sending || !sendText.trim()} className="btn btn-primary" type="submit">
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </div>
          )}
        </article>
      </section>
    </DashboardScaffold>
  );
}
