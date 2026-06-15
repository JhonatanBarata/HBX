"use client";

// Motor WhatsApp central do HBX (empresa-infra hbx-master-whatsapp-engine).
// Mesmo espírito do SMTP do master: conecta UMA vez aqui; Radar e Vendas herdam
// daqui pra verificar "esse número existe?". A conta master NÃO segura WhatsApp —
// quem segura é esta empresa técnica. Endpoints: /companies/master/whatsapp-modal/*.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { WhatsAppModalPayload } from "@/lib/whatsapp-center";

const engineStatus = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/status");
const engineQr = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/qr");
const engineStart = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/start", { method: "POST" });
const engineDisconnect = () => apiFetch<WhatsAppModalPayload>("/companies/master/whatsapp-modal/disconnect", { method: "POST" });

export function MasterWhatsappEngine() {
  const [payload, setPayload] = useState<WhatsAppModalPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const refresh = useCallback(async () => {
    try { setPayload(await engineStatus()); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Falha ao ler o status do motor."); }
  }, []);

  useEffect(() => {
    let alive = true;
    engineStatus()
      .then((p) => { if (alive) setPayload(p); })
      .catch((err: unknown) => { if (alive) setMsg(err instanceof Error ? err.message : "Falha ao ler o status do motor."); });
    return () => { alive = false; stopPoll(); };
  }, [stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      if (ticks > 40) { stopPoll(); return; } // QR expira; ~100s e para
      try {
        const p = await engineQr();
        setPayload(p);
        if (p.status === "connected") { stopPoll(); setMsg(null); }
      } catch { /* segue tentando até o teto */ }
    }, 2500);
  }, [stopPoll]);

  async function conectar() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { setPayload(await engineStart()); startPolling(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Falha ao iniciar a conexão."); }
    finally { setBusy(false); }
  }

  async function desconectar() {
    if (busy) return;
    if (!window.confirm("Desconectar o chip do motor de verificação? Enquanto desconectado, o Radar não confirma se o número existe.")) return;
    setBusy(true); setMsg(null);
    stopPoll();
    try { setPayload(await engineDisconnect()); }
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
        <h2>Motor WhatsApp do HBX — verificação de número</h2>
        <div className="meta">
          <span className={connected ? "tag teal" : "tag red"}>{statusLabel}</span>
        </div>
      </div>
      <div style={{ padding: "12px 16px", display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Chip central do HBX que valida se o número existe. O Radar e o Vendas herdam daqui — igual ao SMTP do master.
          Conecte uma vez; todas as empresas usam. A conta master não segura WhatsApp; quem segura é esta empresa técnica.
        </p>
        {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)" }}>{msg}</div>}
        {!connected && qr && (
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR para conectar o WhatsApp do motor" width={220} height={220} style={{ borderRadius: 12 }} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → aponte pro QR.
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!connected && (
            <button className="btn-teal" disabled={busy} onClick={conectar} style={{ minHeight: 38 }}>
              {busy ? "…" : qr ? "Gerar novo QR" : "Conectar chip"}
            </button>
          )}
          {connected && (
            <button className="btn-ghost" disabled={busy} onClick={desconectar} style={{ minHeight: 38 }}>Desconectar</button>
          )}
          <button className="btn-ghost" disabled={busy} onClick={refresh} style={{ minHeight: 38 }}>Atualizar</button>
        </div>
      </div>
    </section>
  );
}
