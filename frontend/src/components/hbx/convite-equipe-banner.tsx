"use client";

// MODO PUXAR (02/08) — banner pós-login de convite de equipe.
// O backend lista convites pendentes pro E-MAIL do usuário logado
// (GET /auth/invites/pending). Aceitar move a conta pra empresa (vira
// vendedor; a conta pessoal congela e NADA migra) e o backend devolve uma
// SESSÃO NOVA já na empresa — aqui só trocamos o token e recarregamos.
// Convite inelegível mostra o motivo (ex.: "desconecte o WhatsApp antes")
// em vez de sumir. Visual 100% nas classes centrais .wcpb-* (creditos.css)
// + botões do kit — mesmo card flutuante do banner de confirmação.

import React, { useEffect, useState } from "react";
import { apiFetch, getToken, setToken } from "@/lib/api";

type PendingInvite = {
  id: string;
  companyName: string;
  expiresAt?: string;
  eligible: boolean;
  blockedReason?: string | null;
};

export function ConviteEquipeBanner() {
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return; // sem sessão → nada
    apiFetch<{ invites?: PendingInvite[] }>("/auth/invites/pending")
      .then(res => setInvites(Array.isArray(res?.invites) ? res.invites : []))
      .catch(() => setInvites([]));
  }, []);

  const invite = (invites || [])[0] || null;
  if (!invite || dismissed) return null;

  async function aceitar() {
    if (!invite || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<{ access_token?: string | null; message?: string }>(
        `/auth/invites/${encodeURIComponent(invite.id)}/accept`,
        { method: "POST" },
      );
      if (res?.access_token) setToken(res.access_token);
      // Sessão nova = empresa nova: recarrega do zero no painel.
      window.location.href = "/dashboard";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível aceitar o convite.");
      setBusy(false);
    }
  }

  async function recusar() {
    if (!invite || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/auth/invites/${encodeURIComponent(invite.id)}/decline`, { method: "POST" });
      setInvites(prev => (prev || []).filter(i => i.id !== invite.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível recusar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wcpb" role="region" aria-label="Convite de equipe">
      <div className="wcpb__head">
        <div className="wcpb__title">{invite.companyName} convidou você para a equipe</div>
        <button className="wcpb__close" type="button" aria-label="Fechar" onClick={() => setDismissed(true)}>×</button>
      </div>
      <div className="wcpb__msg">
        Ao aceitar, você entra como <b>vendedor</b> da {invite.companyName} e passa a usar as regras e os créditos da
        empresa. Sua conta atual fica guardada como está — nada dela é levado junto.
      </div>
      {!invite.eligible && invite.blockedReason && (
        <div className="wcpb__err">{invite.blockedReason}</div>
      )}
      <div className="wcpb__row">
        {invite.eligible && (
          <button className="btn-teal" type="button" onClick={aceitar} disabled={busy}>
            {busy ? "Entrando…" : "Aceitar e entrar"}
          </button>
        )}
        <button className="btn-ghost" type="button" onClick={recusar} disabled={busy}>
          Recusar
        </button>
      </div>
      {err && <div className="wcpb__err">{err}</div>}
    </div>
  );
}
