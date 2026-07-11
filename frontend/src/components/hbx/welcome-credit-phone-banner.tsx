"use client";

// F3 (CONFIRMACAO-TELEFONE) — banner pós-login. Quando o gate está ON
// (HBX_CREDITS_REQUIRE_VERIFIED_PHONE, default OFF) e o dono entrou sem telefone
// verificado (típico do login Google), oferece confirmar o WhatsApp por código pra
// LIBERAR O BRINDE. Bloqueia SÓ o brinde — nunca o app (é um card flutuante,
// dispensável). Usa os endpoints AUTENTICADOS /auth/whatsapp/verify/start|confirm
// (sob o JWT da sessão). Visual 100% em classe central (.wcpb-*, creditos.css) +
// botões do kit (.btn-teal). Com a flag OFF nunca renderiza (requiresPhoneVerification
// vem false do backend) → regressão zero.

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch, getToken } from "@/lib/api";
import { fetchCreditStorefront } from "@/lib/credits-storefront";

type Profile = {
  userKind?: string;
  canViewBilling?: boolean;
  company?: { id?: number; contactPhone?: string | null; contactPhoneVerified?: boolean } | null;
};
type VerifyStart = { ok?: boolean; challengeToken?: string | null; previewCode?: string | null; message?: string | null };

export function WelcomeCreditPhoneBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [welcomeCredits, setWelcomeCredits] = useState(0);

  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!getToken()) return; // sem sessão → banner fica oculto (default)
    Promise.all([
      apiFetch<Profile>("/profile").catch(() => null),
      fetchCreditStorefront().catch(() => null),
    ]).then(([prof, sf]) => {
      const gateOn = Boolean(sf?.enabled && sf?.requiresPhoneVerification);
      const owner = prof?.userKind === "admin" && prof?.canViewBilling === true;
      const hasCompany = Boolean(prof?.company?.id);
      const unverified = prof?.company?.contactPhoneVerified === false;
      setWelcomeCredits(Number(sf?.welcomeCredits) || 0);
      setPhone((prev) => prev || String(prof?.company?.contactPhone || ""));
      setVisible(Boolean(gateOn && owner && hasCompany && unverified));
    }).catch(() => { /* sem banner */ });
  }, []);

  // Uma vez por montagem. A verificação (única mudança relevante) acontece DENTRO
  // do banner — não precisa refazer a cada navegação.
  useEffect(() => { load(); }, [load]);

  async function sendCode() {
    if (busy) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await apiFetch<VerifyStart>("/auth/whatsapp/verify/start", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      if (res?.challengeToken) {
        setChallengeToken(res.challengeToken);
        setPreviewCode(res.previewCode || null);
        setMsg(res.message || null);
        setStep("code");
      } else {
        setErr("Não foi possível enviar o código. Tente novamente.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível enviar o código. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (busy || !challengeToken) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch("/auth/whatsapp/verify/confirm", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code }),
      });
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Código inválido. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible || dismissed) return null;

  return (
    <div className="wcpb" role="region" aria-label="Confirmar WhatsApp">
      <div className="wcpb__head">
        <div className="wcpb__title">{step === "done" ? "WhatsApp confirmado ✓" : "Confirme seu WhatsApp"}</div>
        <button className="wcpb__close" type="button" aria-label="Fechar" onClick={() => setDismissed(true)}>×</button>
      </div>
      {step === "done" ? (
        <div className="wcpb__ok">
          {welcomeCredits > 0
            ? `Pronto! Seus ${welcomeCredits} créditos de boas-vindas foram liberados.`
            : "Pronto! Seus créditos de boas-vindas foram liberados."}
        </div>
      ) : (
        <React.Fragment>
          <div className="wcpb__msg">
            {welcomeCredits > 0
              ? `Confirme seu número por código para liberar seus ${welcomeCredits} créditos grátis. Leva 1 minuto.`
              : "Confirme seu número por código para liberar seus créditos grátis. Leva 1 minuto."}
          </div>
          {step === "phone" ? (
            <div className="wcpb__row">
              <input
                className="wcpb__input"
                type="tel"
                inputMode="tel"
                placeholder="WhatsApp com DDD"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
              <button className="btn-teal" type="button" onClick={sendCode} disabled={busy || !phone.trim()}>
                {busy ? "Enviando…" : "Enviar código"}
              </button>
            </div>
          ) : (
            <React.Fragment>
              {previewCode && <div className="wcpb__ok">Código (ambiente de teste): {previewCode}</div>}
              {msg && !previewCode && <div className="wcpb__ok">{msg}</div>}
              <div className="wcpb__row">
                <input
                  className="wcpb__input"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Código de 6 dígitos"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                />
                <button className="btn-teal" type="button" onClick={confirmCode} disabled={busy || code.length < 6}>
                  {busy ? "Confirmando…" : "Confirmar"}
                </button>
              </div>
            </React.Fragment>
          )}
          {err && <div className="wcpb__err">{err}</div>}
        </React.Fragment>
      )}
    </div>
  );
}
