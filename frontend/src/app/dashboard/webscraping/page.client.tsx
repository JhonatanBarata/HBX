"use client";

import { useEffect, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type RuntimePayload = {
  status: "online" | "degraded" | "offline";
  code: string;
  message: string;
  checkedAt: string;
  publicUrl: string;
  internalUrl: string | null;
  healthUrl: string | null;
  usingFallbackInternalUrl: boolean;
  serviceReachable: boolean;
  httpStatus: number | null;
  googleApiKeyConfigured: boolean | null;
  mockMode: boolean;
};

type EntryPayload = {
  url: string;
  runtime: RuntimePayload;
};
type ProfilePayload = {
  username?: string | null;
  name?: string | null;
  company?: { name?: string | null } | null;
};

function getRuntimeTone(status: RuntimePayload["status"] | null) {
  if (status === "offline") return "alert-error";
  if (status === "degraded") return "alert-warning";
  return "alert-success";
}

function getRuntimeHint(runtime: RuntimePayload) {
  if (runtime.code === "missing_internal_url") {
    return "O deploy publicado esta sem WEBSCRAPING_INTERNAL_URL efetiva no backend/Render.";
  }
  if (runtime.usingFallbackInternalUrl) {
    return "Diagnostico via destino local padrao; confirme WEBSCRAPING_INTERNAL_URL no ambiente online.";
  }
  if (runtime.code === "upstream_unreachable") {
    return "O backend publicado conhece o destino, mas nao conseguiu alcancar o servico webscraping.";
  }
  return null;
}

export default function WebscrapingClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoading(true);
    setError(null);
    let cancelled = false;

    (async () => {
      try {
        const [payload, profile] = await Promise.all([
          apiFetch<EntryPayload>("/modules/webscraping/entry"),
          apiFetch<ProfilePayload>("/profile/current-user"),
        ]);
        if (cancelled) return;
        setRuntime(payload.runtime);

        const userName = (profile.name || profile.username || "").trim();
        const companyName = (profile.company?.name || "").trim();

        const url = new URL(payload.url, window.location.origin);
        if (userName) {
          url.searchParams.set("user_name", userName);
        }
        if (companyName) {
          url.searchParams.set("company_name", companyName);
        }

        if (payload.runtime.status === "offline") {
          setError(null);
          setEntryUrl(null);
          return;
        }

        setEntryUrl(`${url.pathname}${url.search}${url.hash}`);
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao abrir modulo Webscraping.";
        setError(message);
        setEntryUrl(null);
        setRuntime(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken, retryTick]);

  useEffect(() => {
    if (hasToken !== true || loading) return;
    if (entryUrl) return;
    if (!runtime && !error) return;

    const retryTimer = window.setTimeout(() => {
      setRetryTick((current) => current + 1);
    }, 5000);

    return () => window.clearTimeout(retryTimer);
  }, [hasToken, loading, entryUrl, runtime, error]);

  useEffect(() => {
    if (hasToken !== true) return;

    async function handleBridgeMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; payload?: { to?: string; body?: string } } | null;
      if (!data || data.type !== "HBX_SEND_WHATSAPP") return;

      const to = String(data.payload?.to || "").trim();
      const body = String(data.payload?.body || "").trim();
      if (!to || !body) return;

      try {
        await apiFetch("/whatsapp/send", {
          method: "POST",
          body: JSON.stringify({ to, body, messageType: "text", sourceModule: "webscraping" }),
        });
        setSendError(null);
        setSendInfo(`Mensagem enfileirada para ${to}.`);
      } catch (sendError) {
        const message =
          sendError instanceof Error
            ? sendError.message
            : "Falha ao enfileirar mensagem do Webscraping.";
        setSendInfo(null);
        setSendError(message);
      }
    }

    window.addEventListener("message", handleBridgeMessage);
    return () => window.removeEventListener("message", handleBridgeMessage);
  }, [hasToken]);

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

  const shouldShowRetry = !loading && !entryUrl;

  return (
    <DashboardScaffold
      title="Webscraping"
      description="Prospecção local de contatos integrada como módulo do sistema."
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {runtime ? (
        <div className={`alert ${getRuntimeTone(runtime.status)}`}>
          <div className="space-y-1">
            <div>{runtime.message}</div>
            {getRuntimeHint(runtime) ? <div className="text-xs opacity-80">{getRuntimeHint(runtime)}</div> : null}
            {runtime.mockMode ? (
              <div className="text-xs opacity-80">
                O modulo esta em modo demonstracao controlado.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {sendInfo ? <div className="alert alert-success">{sendInfo}</div> : null}
      {sendError ? <div className="alert alert-error">{sendError}</div> : null}

      {loading ? (
        <div className="panel p-4 text-sm text-muted">Carregando módulo...</div>
      ) : entryUrl ? (
        <section className="panel p-2">
          <iframe
            title="Modulo Webscraping"
            src={entryUrl}
            className="w-full min-h-[78vh] rounded-xl"
          />
        </section>
      ) : (
        <section className="panel p-4 text-sm text-muted space-y-3">
          <div>
            {runtime?.status === "offline"
              ? "Modulo indisponivel por falha de infraestrutura ou configuracao."
              : "Modulo indisponivel."}
          </div>
          {shouldShowRetry ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRetryTick((current) => current + 1)}
              >
                Tentar novamente
              </button>
              <span className="text-xs opacity-80">
                A tela tenta reconectar automaticamente em alguns segundos.
              </span>
            </div>
          ) : null}
        </section>
      )}
    </DashboardScaffold>
  );
}
