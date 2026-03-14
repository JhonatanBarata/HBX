"use client";

import { useEffect, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type EntryPayload = { url: string };
type ProfilePayload = {
  username?: string | null;
  name?: string | null;
  company?: { name?: string | null } | null;
};

export default function WebscrapingClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [payload, profile] = await Promise.all([
          apiFetch<EntryPayload>("/modules/webscraping/entry"),
          apiFetch<ProfilePayload>("/profile/current-user"),
        ]);

        const userName = (profile.name || profile.username || "").trim();
        const companyName = (profile.company?.name || "").trim();

        const url = new URL(payload.url, window.location.origin);
        if (userName) {
          url.searchParams.set("user_name", userName);
        }
        if (companyName) {
          url.searchParams.set("company_name", companyName);
        }

        setEntryUrl(`${url.pathname}${url.search}${url.hash}`);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao abrir modulo Webscraping.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasToken]);

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

  return (
    <DashboardScaffold
      title="Webscraping"
      description="Prospeccao local de contatos integrada como modulo do sistema."
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {sendInfo ? <div className="alert alert-success">{sendInfo}</div> : null}
      {sendError ? <div className="alert alert-error">{sendError}</div> : null}

      {loading ? (
        <div className="panel p-4 text-sm text-muted">Carregando modulo...</div>
      ) : entryUrl ? (
        <section className="panel p-2">
          <iframe
            title="Modulo Webscraping"
            src={entryUrl}
            className="w-full min-h-[78vh] rounded-[12px]"
          />
        </section>
      ) : (
        <div className="panel p-4 text-sm text-muted">Modulo indisponivel.</div>
      )}
    </DashboardScaffold>
  );
}
