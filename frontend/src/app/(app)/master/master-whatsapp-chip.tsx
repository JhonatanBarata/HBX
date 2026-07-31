"use client";

// Chip de WhatsApp do MASTER (WebWhats) — o verificador "esse número existe?".
// O master conecta UMA vez aqui; a verificação de número de TODAS as empresas passa
// por este chip, automático (sem toggle). Endpoints já existentes:
// /companies/master/whatsapp-modal/{status,start,qr,disconnect}.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { WhatsAppModalPayload } from "@/lib/whatsapp-center";

const chipStatus = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/status");
const chipQr = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/qr");
const chipStart = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/start", { method: "POST" });
const chipDisconnect = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/disconnect", { method: "POST" });

export function MasterWhatsappChip() {
  const [payload, setPayload] = useState<WhatsAppModalPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const refresh = useCallback(async () => {
    try { setPayload(await chipStatus()); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Falha ao ler o status do chip."); }
  }, []);

  useEffect(() => {
    let alive = true;
    chipStatus()
      .then((p) => { if (alive) setPayload(p); })
      .catch((err: unknown) => { if (alive) setMsg(err instanceof Error ? err.message : "Falha ao ler o status do chip."); });
    return () => { alive = false; stopPoll(); };
  }, [stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      if (ticks > 40) { stopPoll(); return; }
      try {
        const p = await chipQr();
        setPayload(p);
        if (p.status === "connected") { stopPoll(); setMsg(null); }
      } catch { /* segue até o teto */ }
    }, 2500);
  }, [stopPoll]);

  async function conectar() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { setPayload(await chipStart()); startPolling(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Falha ao iniciar a conexão."); }
    finally { setBusy(false); }
  }

  async function desconectar() {
    if (busy) return;
    if (!window.confirm("Desconectar o chip do Master? A verificação de número para pra todas as empresas até reconectar.")) return;
    setBusy(true); setMsg(null);
    stopPoll();
    try { setPayload(await chipDisconnect()); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Falha ao desconectar."); }
    finally { setBusy(false); }
  }

  const status = payload?.status || "offline";
  const connected = status === "connected";
  const qr = payload?.data?.qrCodeDataUrl || null;
  const phone = payload?.data?.phone || null;
  const statusLabel = connected
    ? `Conectado${phone ? ` · ${phone}` : ""}`
    : status === "waiting_qr"
      ? "Aguardando leitura do QR"
      : status === "starting" || status === "reconnecting"
        ? "Conectando…"
        : "Desconectado";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>WhatsApp do Master (chip — verificação)</h2>
        <div className="meta">
          <span className={connected ? "tag teal" : "tag red"}>{statusLabel}</span>
        </div>
      </div>
      <div style={{ padding: "12px 16px 16px", display: "grid", gap: 12 }}>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Chip do WebWhats que valida se o número existe. A verificação de número de <strong>todas as empresas</strong>
          {" "}passa por este chip — automático, ninguém precisa marcar nada. Conecte uma vez.
        </span>
        {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)" }}>{msg}</div>}
        {!connected && qr && (
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR para conectar o chip do Master" width={220} height={220} style={{ borderRadius: 12 }} />
            <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", textAlign: "center" }}>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → aponte pro QR.
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!connected && (
            <button className="btn-teal" disabled={busy} onClick={conectar} style={{ minHeight: 36 }}>
              {busy ? "…" : qr ? "Gerar novo QR" : "Conectar chip do master"}
            </button>
          )}
          {connected && (
            <button className="btn-ghost" disabled={busy} onClick={desconectar} style={{ minHeight: 36 }}>Desconectar</button>
          )}
          <button className="btn-ghost" disabled={busy} onClick={refresh} style={{ minHeight: 36 }}>Atualizar</button>
        </div>
      </div>
    </section>
  );
}
