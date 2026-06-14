"use client";

// Portão de boas-vindas (primeiro acesso) — montado no AuthGate, sobrepõe o app
// e BLOQUEIA até resolver. Ordem: SENHA (mustChangePassword) → TUTORIAL
// (tutorialPending). Cada passo repete a CADA login até resolver — os flags moram
// no USUÁRIO (backend), não no navegador.
//   PATCH /profile/password   { newPassword }   (não pede a senha atual qdo o flag liga)
//   POST  /profile/tutorial-done                ("Começar a usar" OU "Não exibir mais" resolvem)
// Lei 5: todo visual em classe central (.bv-* no screens.css). Zero estilo inline.

import React, { useCallback, useEffect, useState } from "react";

import { BootSplash } from "@/components/hbx/boot-splash";
import { apiFetch, getToken } from "@/lib/api";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";

type Flags = {
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  ramoPending?: boolean;
  tutorialPending?: boolean;
};

// Ramos-alvo sugeridos no primeiro acesso do dono. Lista enxuta e genérica —
// o dono ajusta/expande depois no Radar. Texto livre cobre o resto.
const RAMOS_SUGERIDOS = [
  "Clínicas e consultórios", "Odontologia", "Estética e beleza", "Academias",
  "Oficinas e autopeças", "Restaurantes e bares", "Comércio e varejo",
  "Imobiliárias", "Advocacia", "Contabilidade", "Pet shops", "Construção e reformas",
];

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
  // Ordem do portão: SENHA → RAMO (só dono) → TUTORIAL. Cada passo repete a cada
  // login até resolver (os flags moram no backend, não no navegador).
  const precisaRamo = !precisaSenha && Boolean(flags.ramoPending);
  const precisaTutorial = !precisaSenha && !precisaRamo && Boolean(flags.tutorialPending);
  if (!precisaSenha && !precisaRamo && !precisaTutorial) return null;

  // Senha definitiva: portão clássico. Tutorial: NÃO mostra mais o leitor estático
  // — dispara o TOUR INTERATIVO (boot → coach que vive no app-shell). Um só tutorial.
  if (precisaSenha) {
    return (
      <div className="bv-veil" role="dialog" aria-modal="true">
        <div className="bv-card">
          <PassoSenha flags={flags} onResolved={carregar} />
        </div>
      </div>
    );
  }
  if (precisaRamo) {
    return (
      <div className="bv-veil" role="dialog" aria-modal="true">
        <div className="bv-card">
          <PassoRamo flags={flags} onResolved={carregar} />
        </div>
      </div>
    );
  }
  return <PassoTutorialLauncher onResolved={carregar} />;
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

// Ramo-alvo no primeiro acesso do DONO (14/06): a lagoa do Radar é compartilhada e
// enorme; perguntar o que a empresa quer prospectar enche o olho com o que importa e
// desempata o que cada empresa vê (o "não repetir" é por empresa, no backend).
// POST /profile/prospecting-segments { segments }.
function PassoRamo({ flags, onResolved }: { flags: Flags; onResolved: () => void }) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [livre, setLivre] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const todos = Array.from(new Set([...RAMOS_SUGERIDOS, ...selecionados]));

  function toggle(r: string) {
    setSelecionados(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  }
  function addLivre() {
    const v = livre.trim();
    if (!v) return;
    setSelecionados(prev => (prev.includes(v) ? prev : [...prev, v]));
    setLivre("");
  }
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const segments = selecionados.length ? selecionados : livre.trim() ? [livre.trim()] : [];
    if (!segments.length) { setErr("Escolha pelo menos um ramo que você quer prospectar."); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/prospecting-segments", { method: "POST", body: JSON.stringify({ segments }) });
      onResolved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Não foi possível salvar o ramo.");
      setBusy(false);
    }
  }

  return (
    <React.Fragment>
      <div className="bv-hero">
        <span className="orb" />
        <span className="kicker">Quase lá{primeiroNome(flags.name)}</span>
        <h2>Que tipo de empresa você quer prospectar?</h2>
        <p>O Radar é uma base compartilhada e gigante. Diga o seu ramo-alvo que já mostramos as empresas certas pra você — dá pra mudar isso quando quiser.</p>
      </div>
      <form className="bv-body" onSubmit={salvar}>
        <div className="bv-field">
          <label>Toque nos ramos que você atende</label>
          <div className="bv-chips">
            {todos.map(r => (
              <button type="button" key={r} className={selecionados.includes(r) ? "btn-teal" : "btn-ghost"}
                onClick={() => toggle(r)} disabled={busy}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="bv-field">
          <label>Não achou? Escreva o seu</label>
          <div className="bv-row">
            <input className="field-dark" maxLength={80} placeholder="Ex.: marcenaria, escola de idiomas"
              value={livre} disabled={busy} onChange={e => setLivre(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLivre(); } }} />
            <button type="button" className="btn-ghost" onClick={addLivre} disabled={busy || !livre.trim()}>Adicionar</button>
          </div>
        </div>
        {err && <div className="bv-msg bad">{err}</div>}
        <div className="bv-foot">
          <span className="bv-hint grow">Isso fica salvo na sua empresa e vira o filtro inicial do Radar.</span>
          <button className="btn-teal" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar →"}
          </button>
        </div>
      </form>
    </React.Fragment>
  );
}

// Primeiro acesso → TOUR INTERATIVO. Mostra o boot estilo Windows e, ao terminar,
// liga o coach (que vive no app-shell e roda por cima do app real), marca o
// tutorial como concluído no backend (pra não re-disparar) e some o portão. Se a
// pessoa pular o tour depois, ele cai no /dashboard (tratado no próprio coach).
function PassoTutorialLauncher({ onResolved }: { onResolved: () => void }) {
  const [fired, setFired] = useState(false);

  async function lancar() {
    if (fired) return;
    setFired(true);
    startTutorialCoach();
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({}) });
    } catch { /* o flag re-tenta no próximo login; o tour já está rodando */ }
    onResolved(); // recarrega flags → tutorialPending=false → portão some
  }

  return <BootSplash onDone={lancar} />;
}
