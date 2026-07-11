"use client";

// LEADS-FINAL/06 — E-mail v1 (aba do lead). Sem conta → form de conexão
// embutido (EmailAccountForm, compartilhado com Configurações). Com conta →
// compose (para = e-mail do lead pré-preenchido) + histórico do enviado.
//
// GUARDRAILS: envio síncrono via backend (SMTP do próprio usuário), 1 por vez,
// erro do SMTP mostrado cru e honesto no histórico. NÃO toca WhatsApp/motor.

import { useCallback, useEffect, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { EmailAccountForm, type EmailAccountPublic } from "@/components/hbx/email-account-form";
import { apiFetch } from "@/lib/api";

type SentMessage = {
  id: string;
  to: string;
  subject: string;
  status: string;
  error: string | null;
  sentAt: string | null;
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function EmailPanel({ leadId, leadEmail, leadName }: { leadId: string; leadEmail: string | null; leadName?: string | null }) {
  const [account, setAccount] = useState<EmailAccountPublic | null>(null);
  const [to, setTo] = useState(leadEmail || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<SentMessage[] | null>(null);

  // `to` nasce do e-mail do lead: este painel só monta com o lead já carregado
  // (dentro do grid revelado), então o prop já está disponível no primeiro render.

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ enabled?: boolean; messages?: SentMessage[] }>(
        `/lead-email/history?leadId=${encodeURIComponent(leadId)}`,
      );
      setHistory(Array.isArray(res?.messages) ? res.messages : []);
    } catch {
      setHistory([]);
    }
  }, [leadId]);

  // IIFE async: setState só após o await (react-hooks/set-state-in-effect).
  useEffect(() => { void (async () => { await loadHistory(); })(); }, [loadHistory]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; status?: string; error?: string }>("/lead-email/send", {
        method: "POST",
        body: JSON.stringify({ leadId, to: to.trim(), subject: subject.trim(), bodyText: body }),
      });
      if (res?.ok) {
        setMsg({ text: `E-mail enviado para ${to.trim()}.`, ok: true });
        setSubject("");
        setBody("");
      } else {
        setMsg({ text: res?.error || "O envio falhou — veja o histórico abaixo.", ok: false });
      }
      await loadHistory();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "O envio falhou.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const podeEnviar = Boolean(account) && to.trim() && subject.trim() && body.trim();

  return (
    <div className="lead-email" style={{ padding: "0 2px 12px" }}>
      {/* Conta (compartilhado com Configurações): summary quando conectada, form quando não. */}
      <EmailAccountForm onAccountChange={setAccount} />

      {account && (
        <form className="lead-email__block" onSubmit={enviar}>
          <h4 className="lead-email__block-title">Escrever e-mail{leadName ? ` para ${leadName}` : ""}</h4>
          <div className="f">
            <label>Para</label>
            <input className="field-dark" type="email" maxLength={180} placeholder="email@destino.com.br"
              value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="f">
            <label>Assunto</label>
            <input className="field-dark" maxLength={240} placeholder="Assunto do e-mail"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="f">
            <label>Mensagem</label>
            <textarea className="field-dark" style={{ minHeight: 120, resize: "vertical" }} maxLength={20000}
              placeholder="Escreva sua mensagem…" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div className="lead-email__row">
            <button className="btn-teal" type="submit" disabled={busy || !podeEnviar}
              title={account.status === "connected" ? "Enviar" : "Teste a conexão da conta antes, se quiser garantir"}>
              <I d={ICONS.send} size={13} /> {busy ? "Enviando…" : "Enviar e-mail"}
            </button>
            {msg && <span className={msg.ok ? "lead-email__ok" : "lead-email__err"}>{msg.text}</span>}
          </div>
          <p className="lead-email__hint">
            O e-mail sai pelo servidor da SUA conta — a entrega depende do seu provedor. Erros aparecem crus no histórico.
          </p>
        </form>
      )}

      {/* Histórico do enviado (por lead) */}
      {account && (
        <div className="lead-email__history">
          {history === null ? (
            <p className="lead-email__note">Carregando histórico…</p>
          ) : history.length === 0 ? (
            <p className="muted-note">Nenhum e-mail enviado para este lead ainda.</p>
          ) : (
            history.map(m => (
              <div className="lead-email__msg" key={m.id}>
                <div className="lead-email__msg-head">
                  <span className="lead-email__msg-subj">{m.subject}</span>
                  <span className={"lead-email__badge " + (m.status === "sent" ? "lead-email__badge--sent" : "lead-email__badge--failed")}>
                    {m.status === "sent" ? "enviado" : "falhou"}
                  </span>
                </div>
                <span className="lead-email__msg-to">Para {m.to} · {fmtWhen(m.sentAt)}</span>
                {m.status === "failed" && m.error && <span className="lead-email__msg-err">{m.error}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
