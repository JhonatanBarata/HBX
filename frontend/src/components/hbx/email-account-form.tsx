"use client";

// LEADS-FINAL/06 — E-mail v1: formulário de CONEXÃO da conta SMTP do usuário.
// Componente COMPARTILHADO (sem tela duplicada): embutido na aba E-mail da
// página do lead (quando não há conta) E espelhado em Configurações → "Meu
// e-mail". SEM bloco IMAP no v1 — só envio.
//
// 3 blocos: (1) identidade (nome exibido + e-mail), (2) SMTP (provedor com
// presets + host/porta/SSL + usuário/senha), (3) testar/salvar.
//
// GUARDRAILS: o backend NUNCA devolve a senha (só `hasCredentials`); o campo de
// senha fica vazio ao editar (preenche só pra trocar). Testar conexão é ação
// EXPLÍCITA. Feature OFF (secret ausente no servidor) → mostra aviso e some.

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type Preset = {
  id: string;
  label: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  passwordHint: string;
};

export type EmailAccountPublic = {
  address: string;
  senderName: string | null;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  status: string;
  lastError: string | null;
  lastTestedAt: string | null;
  hasCredentials: boolean;
};

type AccountState = {
  enabled: boolean;
  account: EmailAccountPublic | null;
  presets: Preset[];
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectada",
  draft: "Falta testar",
  error: "Erro na conexão",
};

function emptyForm() {
  return { senderName: "", address: "", provider: "outro", smtpHost: "", smtpPort: "", smtpSecure: true, username: "", password: "" };
}

export function EmailAccountForm({ onAccountChange }: { onAccountChange?: (account: EmailAccountPublic | null) => void }) {
  const [state, setState] = useState<AccountState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<AccountState>("/lead-email/account");
      setState(res);
      setLoadError(null);
      onAccountChange?.(res?.account || null);
      // Sem conta → já entra em modo edição (form embutido, config-in-place).
      if (res?.enabled && !res.account) {
        setEditing(true);
        setForm(f => ({ ...emptyForm(), provider: f.provider }));
      } else {
        setEditing(false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar a conta de e-mail.");
    }
  }, [onAccountChange]);

  // IIFE async mantém o setState FORA do corpo síncrono do efeito
  // (react-hooks/set-state-in-effect) — load só grava estado após o await.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const presets = state?.presets || [];
  const currentPreset = presets.find(p => p.id === form.provider) || null;

  function editarConta() {
    const a = state?.account;
    setMsg(null);
    setEditing(true);
    setForm({
      senderName: a?.senderName || "",
      address: a?.address || "",
      provider: a?.provider || "outro",
      smtpHost: a?.smtpHost || "",
      smtpPort: a?.smtpPort ? String(a.smtpPort) : "",
      smtpSecure: a?.smtpSecure ?? true,
      username: a?.username || "",
      password: "", // nunca vem do servidor — preenche só pra trocar
    });
  }

  function aplicarPreset(id: string) {
    const p = presets.find(x => x.id === id);
    setForm(f => ({
      ...f,
      provider: id,
      smtpHost: p?.smtpHost ?? f.smtpHost,
      smtpPort: p?.smtpPort != null ? String(p.smtpPort) : f.smtpPort,
      smtpSecure: p ? p.smtpSecure : f.smtpSecure,
    }));
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        senderName: form.senderName,
        address: form.address,
        provider: form.provider,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort ? Number(form.smtpPort) : null,
        smtpSecure: form.smtpSecure,
        username: form.username || form.address,
      };
      if (form.password.trim()) body.password = form.password;
      await apiFetch("/lead-email/account", { method: "PUT", body: JSON.stringify(body) });
      setMsg({ text: "Conta salva. Teste a conexão para confirmar.", ok: true });
      setForm(f => ({ ...f, password: "" }));
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Não foi possível salvar.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function testar() {
    if (testBusy) return;
    setTestBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; status?: string; error?: string }>("/lead-email/account/test", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res?.ok) setMsg({ text: "Conexão OK — conta pronta para enviar.", ok: true });
      else setMsg({ text: res?.error || "A conexão falhou.", ok: false });
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "A conexão falhou.", ok: false });
    } finally {
      setTestBusy(false);
    }
  }

  async function remover() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/lead-email/account", { method: "DELETE" });
      setMsg(null);
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Não foi possível remover.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="lead-email__err">{loadError}</p>;
  if (!state) return <p className="lead-email__note">Carregando…</p>;
  if (!state.enabled) {
    return <p className="lead-email__note">O recurso de e-mail não está disponível no momento. Fale com o suporte.</p>;
  }

  const account = state.account;

  return (
    <div className="lead-email">
      {/* Conta conectada e NÃO editando → resumo + ações. */}
      {account && !editing ? (
        <div className="lead-email__acct">
          <div className="lead-email__acct-id">
            <span className="lead-email__acct-addr">{account.senderName ? `${account.senderName} · ` : ""}{account.address}</span>
            <span className="lead-email__acct-sub">
              {account.smtpHost}:{account.smtpPort} · {account.smtpSecure ? "SSL" : "STARTTLS"}
            </span>
          </div>
          <div className="lead-email__row">
            <span className={"tag" + (account.status === "connected" ? " teal" : " warn")}>
              {STATUS_LABEL[account.status] || account.status}
            </span>
            <button type="button" className="btn-ghost btn-xs" onClick={testar} disabled={testBusy}>
              {testBusy ? "Testando…" : "Testar conexão"}
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={editarConta} disabled={busy}>Editar</button>
            <button type="button" className="btn-ghost btn-xs" onClick={remover} disabled={busy}>Remover</button>
          </div>
        </div>
      ) : (
        <form className="lead-email" onSubmit={salvar}>
          {/* Bloco 1 — identidade */}
          <div className="lead-email__block">
            <h4 className="lead-email__block-title">Identidade do remetente</h4>
            <div className="frow">
              <div className="f">
                <label>Nome exibido</label>
                <input className="field-dark" maxLength={120} placeholder="Seu nome ou empresa"
                  value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))} />
              </div>
              <div className="f">
                <label>E-mail do remetente *</label>
                <input className="field-dark" type="email" maxLength={180} placeholder="voce@suaempresa.com.br"
                  value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Bloco 2 — SMTP (presets) */}
          <div className="lead-email__block">
            <h4 className="lead-email__block-title">Servidor de envio (SMTP)</h4>
            <div className="frow">
              <div className="f">
                <label>Provedor</label>
                <select className="select-dark field-dark" value={form.provider} onChange={e => aplicarPreset(e.target.value)}>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label>Servidor SMTP *</label>
                <input className="field-dark" maxLength={180} placeholder="smtp.suaempresa.com.br"
                  value={form.smtpHost} onChange={e => setForm(f => ({ ...f, smtpHost: e.target.value }))} />
              </div>
              <div className="f">
                <label>Porta *</label>
                <input className="field-dark" type="number" min={1} max={65535} placeholder="465"
                  value={form.smtpPort} onChange={e => setForm(f => ({ ...f, smtpPort: e.target.value }))} />
              </div>
              <div className="f">
                <label>Usuário</label>
                <input className="field-dark" maxLength={180} placeholder="normalmente o e-mail completo"
                  value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoComplete="off" />
              </div>
              <div className="f">
                <label>Senha {account?.hasCredentials ? "(guardada — preencha só pra trocar)" : "*"}</label>
                <input className="field-dark" type="password" placeholder={account?.hasCredentials ? "••••••••" : ""}
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
              </div>
            </div>
            <label className="lead-email__row" style={{ cursor: "pointer" }}>
              <button type="button" className={"sw" + (form.smtpSecure ? " on" : "")} role="switch" aria-checked={form.smtpSecure}
                onClick={() => setForm(f => ({ ...f, smtpSecure: !f.smtpSecure }))}><i></i></button>
              <span className="lead-email__hint">Conexão SSL/TLS</span>
            </label>
            {currentPreset?.passwordHint && <p className="lead-email__hint">{currentPreset.passwordHint}</p>}
          </div>

          {/* Bloco 3 — testar/salvar */}
          <div className="lead-email__row">
            <button className="btn-teal" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar conta"}</button>
            {account && (
              <>
                <button type="button" className="btn-ghost" onClick={testar} disabled={testBusy}>
                  {testBusy ? "Testando…" : "Testar conexão"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setMsg(null); }} disabled={busy}>Cancelar</button>
              </>
            )}
          </div>
        </form>
      )}

      {msg && <span className={msg.ok ? "lead-email__ok" : "lead-email__err"}>{msg.text}</span>}
      {account?.status === "error" && account.lastError && !msg && (
        <span className="lead-email__err">Último erro: {account.lastError}</span>
      )}
    </div>
  );
}
