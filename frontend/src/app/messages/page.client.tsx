"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type OutboundAttempt = {
  id: number;
  attemptNo: number;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  httpStatus: number | null;
  error: string | null;
  requestBody?: string | null;
};

type OutboundMessage = {
  id: number;
  to: string;
  body: string;
  status: string;
  providerMessageId?: string | null;
  deliveryStatus?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  attempts: OutboundAttempt[];
};

function deriveUiStatus(
  message: OutboundMessage
): "READ" | "DELIVERED" | "SENT" | "FAILED" | "RETRY" | "PENDING" {
  const status = String(message.status || "").toUpperCase();
  const delivery = String(message.deliveryStatus || "").toLowerCase();
  if (status === "READ" || delivery === "read") return "READ";
  if (status === "DELIVERED" || delivery === "delivered") return "DELIVERED";
  if (status === "SENT" || delivery === "sent") return "SENT";
  if (status === "FAILED" || delivery === "failed") return "FAILED";
  if (status === "PENDING" && (message.attemptCount ?? 0) > 0) return "RETRY";
  return "PENDING";
}

function statusBadgeClass(status: ReturnType<typeof deriveUiStatus>) {
  if (status === "READ" || status === "DELIVERED" || status === "SENT") return "badge-success";
  if (status === "FAILED") return "badge-danger";
  return "badge-brand";
}

export default function MessagesClientPage() {
  const hasToken = useRequireAuth();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const [logs, setLogs] = useState<OutboundMessage[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (!mounted) return date.toISOString();
      return date.toLocaleString();
    } catch {
      return String(dateStr);
    }
  }

  const loadLogs = useCallback(async () => {
    setLogsError(null);
    try {
      const data = await apiFetch<OutboundMessage[]>("/messages/outbound?take=50");
      setLogs(data);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar logs.";
      setLogsError(message);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoadingLogs(true);
    return startSmartPolling(loadLogs, { intervalMs: 10000, immediate: true });
  }, [hasToken, loadLogs]);

  async function submitSend(event: React.FormEvent) {
    event.preventDefault();
    setSendError(null);
    setSendOk(null);
    setSending(true);

    try {
      const response = await apiFetch<{ id: number }>("/messages", {
        method: "POST",
        body: JSON.stringify({ to: to.trim(), body: body.trim() }),
      });
      setSendOk(`Mensagem enfileirada com sucesso (#${response.id}).`);
      setTo("");
      setBody("");
      await loadLogs();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Falha ao enfileirar mensagem.";
      setSendError(message);
    } finally {
      setSending(false);
    }
  }

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
      title="Mensagens e logs"
      description="Envio manual e rastreio completo do ciclo de entrega."
      actions={
        <>
          <Link href="/auto-replies" className="btn btn-secondary btn-sm">
            Respostas automaticas
          </Link>
          <button type="button" onClick={loadLogs} className="btn btn-primary btn-sm">
            Atualizar logs
          </button>
        </>
      }
    >
      <section className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
        <article className="panel p-4">
          <h2 className="text-lg font-semibold">Enviar mensagem manual</h2>
          <p className="text-sm text-muted mt-1">Use para testes operacionais e contato direto.</p>

          <form onSubmit={submitSend} className="space-y-3 mt-4">
            <div>
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Para (to)</label>
              <input
                className="field mt-1 mono"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="+5511999999999"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">Mensagem</label>
              <textarea
                className="field mt-1"
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Digite a mensagem"
              />
            </div>

            {sendError ? <div className="alert alert-error">{sendError}</div> : null}
            {sendOk ? <div className="alert alert-success">{sendOk}</div> : null}

            <button
              disabled={sending || !to.trim() || !body.trim()}
              className="btn btn-primary w-full"
              type="submit"
            >
              {sending ? "Enviando..." : "Enfileirar mensagem"}
            </button>
          </form>
        </article>

        <article className="panel p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-lg font-semibold">Logs de envio</h2>
              <p className="text-sm text-muted">Historico das ultimas 50 mensagens.</p>
            </div>
            <span className="badge badge-brand">{logs.length} registros</span>
          </div>

          {logsError ? <div className="alert alert-error mb-3">{logsError}</div> : null}

          {loadingLogs ? (
            <p className="text-sm text-muted">Carregando logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted">Sem mensagens no historico.</p>
          ) : (
            <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
              {logs.map((message) => {
                const uiStatus = deriveUiStatus(message);
                const isExpanded = Boolean(expanded[message.id]);

                return (
                  <div key={message.id} className="border border-[var(--line)] rounded-[14px] p-3 bg-[var(--surface)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge">#{message.id}</span>
                          <span className={`badge ${statusBadgeClass(uiStatus)}`}>{uiStatus}</span>
                          <span className="badge">
                            tentativas {message.attemptCount}/{message.maxAttempts}
                          </span>
                        </div>

                        <p className="mt-1 text-xs mono break-all text-muted">to: {message.to}</p>
                        <p className="mt-2 text-sm break-words leading-relaxed">{message.body}</p>

                        {(message.providerMessageId || message.deliveryStatus) && (
                          <div className="mt-2 text-xs text-muted space-y-1">
                            {message.providerMessageId ? (
                              <p className="mono break-all">wamid: {message.providerMessageId}</p>
                            ) : null}
                            {message.deliveryStatus ? <p>delivery: {message.deliveryStatus}</p> : null}
                            {message.deliveredAt ? (
                              <p>deliveredAt: {formatDate(message.deliveredAt)}</p>
                            ) : null}
                            {message.readAt ? <p>readAt: {formatDate(message.readAt)}</p> : null}
                            {message.failedAt ? <p>failedAt: {formatDate(message.failedAt)}</p> : null}
                          </div>
                        )}

                        {uiStatus === "RETRY" ? (
                          <p className="mt-2 text-xs text-muted">
                            Proxima tentativa em: {formatDate(message.nextAttemptAt)}
                          </p>
                        ) : null}

                        {uiStatus === "FAILED" && message.lastError ? (
                          <div className="mt-2 alert alert-error">{message.lastError}</div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpanded((state) => ({ ...state, [message.id]: !state[message.id] }))}
                        className="btn btn-secondary btn-sm shrink-0"
                      >
                        {isExpanded ? "Ocultar tentativas" : "Ver tentativas"}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-3 border-t border-[var(--line)] pt-3 space-y-2">
                        {(message.attempts ?? []).length === 0 ? (
                          <p className="text-xs text-muted">Sem tentativas registradas.</p>
                        ) : (
                          (message.attempts ?? []).map((attempt) => (
                            <div
                              key={attempt.id}
                              className="text-xs border border-[var(--line)] rounded-[10px] p-2 bg-[var(--surface-soft)]"
                            >
                              <div className="flex flex-wrap gap-2 items-center">
                                <span className="font-semibold">Tentativa {attempt.attemptNo}</span>
                                <span className={`badge ${attempt.success ? "badge-success" : "badge-danger"}`}>
                                  {attempt.success ? "OK" : "FAIL"}
                                </span>
                                {attempt.httpStatus != null ? (
                                  <span className="badge">HTTP {attempt.httpStatus}</span>
                                ) : null}
                              </div>
                              {attempt.error ? <p className="mt-1">{attempt.error}</p> : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </DashboardScaffold>
  );
}
