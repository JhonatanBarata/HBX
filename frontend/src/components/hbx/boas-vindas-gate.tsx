"use client";

// Portão de boas-vindas (primeiro acesso) — montado no AuthGate, sobrepõe o app
// e BLOQUEIA até resolver. Ordem: SENHA (mustChangePassword) → TUTORIAL
// (tutorialPending). Cada passo repete a CADA login até resolver — os flags moram
// no USUÁRIO (backend), não no navegador.
//   PATCH /profile/password   { newPassword }   (não pede a senha atual qdo o flag liga)
//   POST  /profile/tutorial-done                ("Começar a usar" OU "Não exibir mais" resolvem)
// Lei 5: todo visual em classe central (.bv-* no screens.css). Zero estilo inline.

import React, { useCallback, useEffect, useState } from "react";

import { fetchPlanMeCached } from "@/components/hbx/shell";
import { apiFetch, getToken } from "@/lib/api";
import { CAPITULOS, limiteDoPlano } from "@/lib/tutorial-chapters";

type Flags = {
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  tutorialPending?: boolean;
};

export function BoasVindasGate() {
  const [flags, setFlags] = useState<Flags | null>(null);

  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  // Sem token, não faz nada → fica null → sem portão.
  const carregar = useCallback(() => {
    if (!getToken()) return;
    apiFetch<Flags>("/profile/current-user")
      .then(u => setFlags(u || null))
      .catch(() => setFlags(null));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (!flags) return null;
  const precisaSenha = Boolean(flags.mustChangePassword);
  const precisaTutorial = !precisaSenha && Boolean(flags.tutorialPending);
  if (!precisaSenha && !precisaTutorial) return null;

  return (
    <div className="bv-veil" role="dialog" aria-modal="true">
      <div className="bv-card">
        {precisaSenha
          ? <PassoSenha flags={flags} onResolved={carregar} />
          : <PassoTutorial onResolved={carregar} />}
      </div>
    </div>
  );
}

function primeiroNome(nome?: string | null) {
  const n = String(nome || "").trim().split(/\s+/)[0];
  return n ? `, ${n}` : "";
}

function PassoSenha({ flags, onResolved }: { flags: Flags; onResolved: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (p1.length < 8) { setErr("A senha precisa de pelo menos 8 caracteres."); return; }
    if (p1 !== p2) { setErr("As senhas não conferem."); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/password", { method: "PATCH", body: JSON.stringify({ newPassword: p1 }) });
      onResolved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Não foi possível salvar a senha.");
      setBusy(false);
    }
  }

  return (
    <React.Fragment>
      <div className="bv-hero">
        <span className="orb" />
        <span className="kicker">Primeiro acesso</span>
        <h2>Boas-vindas à HBX{primeiroNome(flags.name)}</h2>
        <p>Antes de começar, crie uma senha só sua. A senha temporária para de valer agora.</p>
      </div>
      <form className="bv-body" onSubmit={salvar}>
        {flags.email && <div className="bv-hint">Seu login é <strong>{flags.email}</strong></div>}
        <div className="bv-field">
          <label>Nova senha</label>
          <div className="bv-row">
            <input className="field-dark" type={show ? "text" : "password"} minLength={8} maxLength={120}
              placeholder="mínimo 8 caracteres" value={p1} disabled={busy} autoFocus autoComplete="new-password"
              onChange={e => setP1(e.target.value)} />
            <button type="button" className="btn-ghost" onClick={() => setShow(s => !s)} disabled={busy}>
              {show ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        <div className="bv-field">
          <label>Repita a senha</label>
          <input className="field-dark" type={show ? "text" : "password"} minLength={8} maxLength={120}
            placeholder="digite de novo" value={p2} disabled={busy} autoComplete="new-password"
            onChange={e => setP2(e.target.value)} />
        </div>
        {err && <div className="bv-msg bad">{err}</div>}
        <div className="bv-foot">
          <span className="bv-hint grow">Você vai usar essa senha nos próximos acessos.</span>
          <button className="btn-teal" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar →"}
          </button>
        </div>
      </form>
    </React.Fragment>
  );
}

function PassoTutorial({ onResolved }: { onResolved: () => void }) {
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [cap, setCap] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPlanMeCached().then(d => { if (alive) setPlanKey(d?.current?.planKey || null); }).catch(() => { /* sem plano → default */ });
    return () => { alive = false; };
  }, []);

  const limite = limiteDoPlano(planKey);
  const visiveis = CAPITULOS.slice(0, Math.min(CAPITULOS.length, Math.max(1, limite + 1)));
  const idx = Math.min(cap, visiveis.length - 1);
  const c = visiveis[idx];
  const ultimo = idx >= visiveis.length - 1;

  async function resolver() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({}) });
      onResolved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível concluir agora.");
      setBusy(false);
    }
  }

  return (
    <React.Fragment>
      <div className="bv-hero">
        <span className="orb" />
        <span className="bv-tag">{c.plano}</span>
        <h2>{c.titulo}</h2>
        <p>{c.resumo}</p>
      </div>
      <div className="bv-body">
        <div className="bv-steps">
          {c.passos.map((p, i) => (
            <div key={p.t} className="bv-step">
              <span className="n">{i + 1}</span>
              <span className="tx">
                <strong>{p.t}</strong>
                <small>{p.d}</small>
              </span>
            </div>
          ))}
        </div>
        {err && <div className="bv-msg bad">{err}</div>}
        <div className="bv-foot">
          <span className="bv-dots">
            {visiveis.map((x, i) => <i key={x.id} className={i === idx ? "on" : ""} />)}
          </span>
          {idx > 0 && (
            <button type="button" className="bv-link" onClick={() => setCap(idx - 1)} disabled={busy}>← Voltar</button>
          )}
          {!ultimo
            ? <button type="button" className="btn-ghost grow" onClick={() => setCap(idx + 1)} disabled={busy}>Próximo →</button>
            : <span className="grow" />}
          <button type="button" className="bv-link" onClick={resolver} disabled={busy}>Não exibir mais</button>
          <button type="button" className="btn-teal" onClick={resolver} disabled={busy}>
            {busy ? "Concluindo…" : ultimo ? "Começar a usar ✓" : "Começar a usar"}
          </button>
        </div>
      </div>
    </React.Fragment>
  );
}
