"use client";

// MODO PUXAR (02/08) — convite único de equipe.
// O admin digita o e-mail e a resposta é SEMPRE "Convite enviado." (o sistema
// nunca revela se o e-mail tem conta HBX). Quem já tem conta aceita ao logar e
// vira vendedor; quem não tem cadastra pelo link. O link é copiável pra mandar
// por WhatsApp. Nada da conta pessoal do convidado migra pra empresa.

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ConviteRow = {
  id: string;
  email: string;
  status: string; // pending | accepted | declined | canceled | expired
  createdAt?: string;
  expiresAt?: string;
  inviteUrl?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  declined: "Recusado",
  canceled: "Cancelado",
  expired: "Expirado",
};

function fmtData(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function ConviteEquipeModal({ onClose, onDone }: { onClose: () => void; onDone?: (msg: string) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [invites, setInvites] = useState<ConviteRow[] | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [cancelArm, setCancelArm] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    return apiFetch<{ invites?: ConviteRow[] }>("/users/company/invites")
      .then(res => setInvites(Array.isArray(res?.invites) ? res.invites : []))
      .catch(() => setInvites([]));
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ message?: string; emailSent?: boolean; inviteUrl?: string }>("/users/company/invites", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setMsg(res?.emailSent === false
        ? "✓ Convite criado — o e-mail não saiu; copie o link abaixo e mande por WhatsApp."
        : `✓ ${res?.message || "Convite enviado."}`);
      setEmail("");
      onDone?.("✓ Convite enviado.");
      await recarregar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível enviar o convite.");
    } finally {
      setBusy(false);
    }
  }

  async function copiarLink(invite: ConviteRow) {
    if (!invite.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopiadoId(invite.id);
      setTimeout(() => setCopiadoId(cur => (cur === invite.id ? null : cur)), 2000);
    } catch {
      setMsg(`Link: ${invite.inviteUrl}`);
    }
  }

  async function cancelar(invite: ConviteRow) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/users/company/invites/${encodeURIComponent(invite.id)}`, { method: "DELETE" });
      setCancelArm(null);
      await recarregar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível cancelar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal" style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 14, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800 }}>Convidar por e-mail</h3>
          <button type="button" className="btn-ghost btn-xs" style={{ minHeight: 30 }} onClick={onClose}>Fechar</button>
        </div>
        <p style={{ margin: 0, fontSize: "var(--fz-l2)", lineHeight: 1.5, color: "var(--text-muted)" }}>
          A pessoa entra na equipe como <b>vendedor</b> com a própria conta: quem já usa o HBX aceita ao entrar;
          quem não usa se cadastra pelo link. Nada da conta pessoal dela vem junto.
        </p>

        <form onSubmit={enviar} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="field-dark"
            type="email"
            required
            placeholder="email@dapessoa.com"
            value={email}
            autoFocus
            onChange={e => setEmail(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn-teal" type="submit" disabled={busy || !email.trim()} style={{ minHeight: 40 }}>
            {busy ? "Enviando…" : "Enviar convite"}
          </button>
        </form>

        {msg && (
          <div className="hbx-2linhas" style={{ fontWeight: 700, fontSize: "var(--fz-l2)", color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>
            {msg}
          </div>
        )}

        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>E-mail</th><th>Status</th><th>Expira</th><th></th></tr></thead>
            <tbody>
              {invites === null && (
                <tr style={{ cursor: "default" }}><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>Carregando…</td></tr>
              )}
              {invites !== null && invites.length === 0 && (
                <tr style={{ cursor: "default" }}><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>Nenhum convite ainda.</td></tr>
              )}
              {(invites || []).map(invite => (
                <tr key={invite.id} style={{ cursor: "default", opacity: invite.status === "pending" ? 1 : 0.65 }}>
                  <td className="hbx-1linha" style={{ maxWidth: 220 }}>{invite.email}</td>
                  <td>
                    <span className={"tag hbx-inteiro" + (invite.status === "accepted" ? " teal" : invite.status === "pending" ? " warn" : "")}>
                      {STATUS_LABEL[invite.status] || invite.status}
                    </span>
                  </td>
                  <td className="hbx-inteiro">{invite.status === "pending" ? fmtData(invite.expiresAt) : "—"}</td>
                  <td>
                    {invite.status === "pending" && (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button className="btn-ghost" disabled={!invite.inviteUrl}
                          style={{ minHeight: 26, fontSize: "var(--hbx-font-min)" }}
                          onClick={() => copiarLink(invite)}>
                          {copiadoId === invite.id ? "Copiado ✓" : "Copiar link"}
                        </button>
                        <button className="btn-ghost" disabled={busy}
                          style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", ...(cancelArm === invite.id ? { color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" } : {}) }}
                          onClick={() => (cancelArm === invite.id ? cancelar(invite) : setCancelArm(invite.id))}>
                          {cancelArm === invite.id ? "Confirmar" : "Cancelar"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
