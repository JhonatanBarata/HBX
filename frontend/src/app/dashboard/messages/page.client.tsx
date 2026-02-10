"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearToken, getToken } from "../_lib/api";

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
  m: OutboundMessage
): "READ" | "DELIVERED" | "SENT" | "FAILED" | "RETRY" | "PENDING" {
  const status = String(m.status || "").toUpperCase();
  const delivery = String(m.deliveryStatus || "").toLowerCase();
  if (status === "READ" || delivery === "read") return "READ";
  if (status === "DELIVERED" || delivery === "delivered") return "DELIVERED";
  if (status === "SENT" || delivery === "sent") return "SENT";
  if (status === "FAILED" || delivery === "failed") return "FAILED";
  if (status === "PENDING" && (m.attemptCount ?? 0) > 0) return "RETRY";
  return "PENDING";
}

export default function MessagesClientPage() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const [logs, setLogs] = useState<OutboundMessage[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const hasToken = useMemo(() => Boolean(getToken()), []);

  async function loadLogs() {
    setLogsError(null);
    try {
      const data = await apiFetch<OutboundMessage[]>("/messages/outbound?take=50");
      setLogs(data);
    } catch (e: any) {
      setLogsError(e?.message ?? "Falha ao carregar logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadLogs();
    const t = setInterval(loadLogs, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendOk(null);
    setSending(true);
    try {
      const res = await apiFetch<{ id: number }>("/messages", {
        method: "POST",
        body: JSON.stringify({ to: to.trim(), body: body.trim() }),
      });
      setSendOk(`Enfileirado: #${res.id}`);
      setTo("");
      setBody("");
      await loadLogs();
    } catch (e: any) {
      setSendError(e?.message ?? "Falha ao enfileirar");
    } finally {
      setSending(false);
    }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  if (!hasToken) return null;

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Mensagens</h1>
            <p className="text-sm text-foreground/70">Teste envio manual e acompanhe logs.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/auto-replies"
              className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            >
              Regras
            </Link>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="border border-foreground/10 rounded-2xl p-4 bg-background">
            <h2 className="font-semibold mb-3">Enviar manualmente</h2>
            <form onSubmit={submitSend} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Para (to)</label>
                <input
                  className="w-full mt-1 p-2 border border-foreground/10 rounded-xl font-mono bg-background"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="+5511999999999"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Mensagem</label>
                <textarea
                  className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Digite a mensagem"
                />
              </div>

              {sendError && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
                  {sendError}
                </div>
              )}
              {sendOk && (
                <div className="p-3 rounded-xl border border-secondary/30 bg-secondary/10 text-sm">
                  {sendOk}
                </div>
              )}

              <button
                disabled={sending || !to.trim() || !body.trim()}
                className="w-full py-2 rounded-xl bg-primary text-background hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "Enviando..." : "Enfileirar"}
              </button>
            </form>
          </section>

          <section className="border border-foreground/10 rounded-2xl p-4 bg-background">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold">Logs de envio</h2>
              <button
                onClick={loadLogs}
                className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
              >
                Atualizar
              </button>
            </div>

            {logsError && (
              <div className="mb-3 p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
                {logsError}
              </div>
            )}

            {loadingLogs ? (
              <p className="text-sm text-foreground/70">Carregando...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-foreground/70">Sem mensagens ainda.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((m) => {
                  const uiStatus = deriveUiStatus(m);
                  const isExpanded = Boolean(expanded[m.id]);
                  return (
                    <div key={m.id} className="border border-foreground/10 rounded-2xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">#{m.id}</span>
                            <span className="text-xs px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5">
                              {uiStatus}
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5">
                              tentativas {m.attemptCount}/{m.maxAttempts}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-foreground/70 font-mono break-all">to: {m.to}</p>
                          <p className="mt-2 text-sm wrap-break-word">{m.body}</p>

                          {(m.providerMessageId || m.deliveryStatus) && (
                            <div className="mt-2 text-xs text-foreground/70 space-y-1">
                              {m.providerMessageId && (
                                <p className="font-mono break-all">wamid: {m.providerMessageId}</p>
                              )}
                              {m.deliveryStatus && <p>delivery: {m.deliveryStatus}</p>}
                              {m.deliveredAt && <p>deliveredAt: {new Date(m.deliveredAt).toLocaleString()}</p>}
                              {m.readAt && <p>readAt: {new Date(m.readAt).toLocaleString()}</p>}
                              {m.failedAt && <p>failedAt: {new Date(m.failedAt).toLocaleString()}</p>}
                            </div>
                          )}

                          {uiStatus === "RETRY" && (
                            <p className="mt-2 text-xs text-foreground/70">
                              Próxima tentativa em: {new Date(m.nextAttemptAt).toLocaleString()}
                            </p>
                          )}
                          {uiStatus === "FAILED" && m.lastError && (
                            <p className="mt-2 text-xs bg-primary/5 border border-primary/30 rounded-xl p-2">
                              {m.lastError}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [m.id]: !s[m.id] }))}
                          className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm shrink-0"
                        >
                          {isExpanded ? "Ocultar" : "Tentativas"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 border-t pt-3 space-y-2">
                          {(m.attempts ?? []).length === 0 ? (
                            <p className="text-xs text-foreground/70">Sem tentativas ainda.</p>
                          ) : (
                            (m.attempts ?? []).map((a) => (
                              <div key={a.id} className="text-xs border border-foreground/10 rounded-xl p-2">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="font-semibold">Attempt {a.attemptNo}</span>
                                  <span className="px-2 py-0.5 rounded-full border border-foreground/10 bg-foreground/5">
                                    {a.success ? "OK" : "FAIL"}
                                  </span>
                                  {a.httpStatus != null && (
                                    <span className="px-2 py-0.5 rounded-full border border-foreground/10 bg-foreground/5">
                                      HTTP {a.httpStatus}
                                    </span>
                                  )}
                                </div>
                                {a.error && <p className="mt-1">{a.error}</p>}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
