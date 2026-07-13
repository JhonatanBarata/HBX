"use client";

import { useEffect, useState } from "react";

import { getApiBase, setToken } from "@/lib/api";

type MobileEntryResponse = {
  access_token?: string;
  next?: string;
};

function extractMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "A entrada móvel expirou. Feche e abra o aplicativo novamente.";
  const source = payload as { userMessage?: unknown; message?: unknown; response?: { message?: unknown } };
  if (typeof source.userMessage === "string" && source.userMessage.trim()) return source.userMessage;
  if (typeof source.message === "string" && source.message.trim()) return source.message;
  if (typeof source.response?.message === "string" && source.response.message.trim()) return source.response.message;
  return "A entrada móvel expirou. Feche e abra o aplicativo novamente.";
}

export default function MobileEntryPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function enter() {
      const ticket = new URLSearchParams(window.location.search).get("ticket")?.trim();
      if (!ticket) {
        setError("Entrada móvel inválida. Feche e abra o aplicativo novamente.");
        return;
      }

      try {
        const response = await fetch(`${getApiBase()}/mobile/devices/web-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ticket }),
          cache: "no-store",
        });
        const text = await response.text();
        const payload: unknown = text ? JSON.parse(text) : null;
        if (!response.ok) throw new Error(extractMessage(payload));

        const data = payload as MobileEntryResponse;
        if (!data.access_token) throw new Error("O HBX não devolveu uma sessão válida.");
        setToken(data.access_token, true);
        if (active) window.location.replace(data.next || "/entrega");
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível entrar pelo aplicativo.");
        }
      }
    }

    void enter();
    return () => { active = false; };
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0B1020", color: "white", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "min(420px, 100%)", padding: 28, borderRadius: 22, background: "#121A2D", textAlign: "center", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".04em" }}>HBX</div>
        {error ? (
          <>
            <h1 style={{ margin: "20px 0 10px", fontSize: 21 }}>Não foi possível entrar</h1>
            <p style={{ margin: 0, color: "#FFB4AB", lineHeight: 1.5 }}>{error}</p>
          </>
        ) : (
          <>
            <div aria-label="Carregando" style={{ width: 34, height: 34, margin: "24px auto", borderRadius: "50%", border: "3px solid #31415F", borderTopColor: "#2E5BFF", animation: "hbx-mobile-spin .8s linear infinite" }} />
            <h1 style={{ margin: "0 0 8px", fontSize: 21 }}>Entrando no HBX…</h1>
            <p style={{ margin: 0, color: "#AAB5CA" }}>Validando este aparelho.</p>
          </>
        )}
      </section>
      <style>{`@keyframes hbx-mobile-spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
