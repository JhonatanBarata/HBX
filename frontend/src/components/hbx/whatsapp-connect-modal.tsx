"use client";

// Modal de conexão WhatsApp (R2.9 — entra junto com a tela de Atendimento).
// Usa o fluxo canônico de src/lib/whatsapp-connection-flow.ts:
// status → start (gera QR) → leitura → connected → bootstrap (espelha
// conversas/contatos) → onConnected(). Desconectar é em duas etapas.

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import {
  bootstrapWhatsAppAfterConnect,
  disconnectWhatsAppModalSession,
  fetchWhatsAppModalQr,
  fetchWhatsAppModalStatus,
  restartWhatsAppModalSession,
  startWhatsAppModalSession,
} from "@/lib/whatsapp-connection-flow";
import { formatWhatsAppDateTime, whatsappModalStatusLabel, type WhatsAppModalPayload } from "@/lib/whatsapp-center";

export function WhatsAppConnectModal({ open, onClose, onConnected }: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const [payload, setPayload] = useState<WhatsAppModalPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const bootstrappedKey = useRef<string | null>(null);

  const refresh = useCallback(() => {
    return fetchWhatsAppModalStatus()
      .then(async res => {
        let next = res;
        if (res?.status === "waiting_qr" && !res?.data?.qrCodeDataUrl) {
          next = await fetchWhatsAppModalQr().catch(() => res);
        }
        setPayload(next);
        setError(null);
        return next;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao consultar o status do WhatsApp.");
        return null;
      });
  }, []);

  // abre → consulta status; enquanto starting/waiting_qr/reconnecting, poll 4s
  useEffect(() => {
    if (!open) return;
    let alive = true;
    refresh();
    const timer = setInterval(async () => {
      if (!alive) return;
      const res = await refresh();
      if (!res) return;
      if (res.status === "connected") {
        const key = `${res.data.companyId}:${res.data.connectedAt || res.data.phone || "connected"}`;
        if (bootstrappedKey.current !== key) {
          bootstrappedKey.current = key;
          try {
            const boot = await bootstrapWhatsAppAfterConnect(res);
            if (alive && boot) {
              setBootstrapMsg(`✓ Conectado — ${boot.syncedConversations} conversas e ${boot.syncedContacts} contatos espelhados.`);
              onConnected?.();
            }
          } catch (err) {
            if (alive) setBootstrapMsg(err instanceof Error ? err.message : "Conectado, mas o espelhamento falhou.");
          }
        }
      }
    }, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [open, refresh, onConnected]);

  if (!open) return null;

  const status = payload?.status || "offline";
  const qr = payload?.data?.qrCodeDataUrl || null;
  const canStart = !busy && ["offline", "disconnected", "error"].includes(status);
  const canRestart = !busy && ["error", "reconnecting", "waiting_qr", "starting"].includes(status);
  const connected = status === "connected";

  async function run(action: () => Promise<WhatsAppModalPayload>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await action();
      setPayload(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 24 }}>
      <div className="hbx-modal" style={{ width: "min(420px, 100%)", display: "grid", gap: 14, padding: 24 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Conexão WhatsApp
          <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={onClose}>✕</span>
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={"tag" + (connected ? " teal" : status === "error" ? " red" : " warn")}>
            {whatsappModalStatusLabel(status)}
          </span>
          {payload?.data?.phone && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>{payload.data.phone}</span>}
        </div>

        {payload?.message && (
          <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{payload.message}</p>
        )}
        {error && (
          <p style={{ margin: 0, fontSize: "0.74rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{error}</p>
        )}
        {bootstrapMsg && (
          <p style={{ margin: 0, fontSize: "0.74rem", fontWeight: 700, color: bootstrapMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{bootstrapMsg}</p>
        )}

        {status === "waiting_qr" && (
          <div style={{ display: "grid", justifyItems: "center", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)", background: "var(--hbx-surface-soft)" }}>
            {qr
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr} alt="QR Code do WhatsApp" width={220} height={220} style={{ borderRadius: 8, background: "#fff", padding: 6 }} />
              : <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Gerando QR…</span>}
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textAlign: "center" }}>
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.
            </span>
          </div>
        )}

        {connected && (
          <div className="kv">
            <div className="row"><span className="k">Conectado em</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{formatWhatsAppDateTime(payload?.data?.connectedAt)}</span></div>
            <div className="row"><span className="k">Atualizado em</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{formatWhatsAppDateTime(payload?.data?.updatedAt)}</span></div>
          </div>
        )}

        {payload?.data?.lastError && !connected && (
          <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--hbx-danger)" }}>{payload.data.lastError}</p>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {canStart && (
            <button className="btn-teal" disabled={busy} onClick={() => run(startWhatsAppModalSession)}>
              <I d={ICONS.msg} size={14} /> {busy ? "Iniciando…" : "Conectar / gerar QR"}
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: connected ? "1fr 1fr" : canRestart ? "1fr 1fr" : "1fr", gap: 8 }}>
            <button className="btn-ghost" disabled={busy} onClick={() => refresh()}>Atualizar status</button>
            {canRestart && (
              <button className="btn-ghost" disabled={busy} onClick={() => run(restartWhatsAppModalSession)}>Reiniciar sessão</button>
            )}
            {connected && (
              confirmDisconnect ? (
                <button className="btn-ghost" style={{ color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" }} disabled={busy}
                  onClick={() => { setConfirmDisconnect(false); run(disconnectWhatsAppModalSession); }}>
                  Confirmar desconexão
                </button>
              ) : (
                <button className="btn-ghost" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar</button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
