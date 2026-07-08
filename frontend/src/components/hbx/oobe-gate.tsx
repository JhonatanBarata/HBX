"use client";

// OOBE — portão de primeiro acesso do HBX (07/07, reconstruído do zero).
// Casca ISOLADA aprovada (mock do GPT): dark constante, trilho lateral + palco,
// transições estilo Windows 11 ("uma coisa sai pra outra entrar" + cascata nos
// filhos). Visual 100% em src/app/hbx-theme/oobe.css (mundo próprio, fora da
// pele do sistema — NUNCA vestir com tokens do app; ver memória oobe-casca-isolada).
//
// Fluxo real (flags moram no USUÁRIO, repetem a cada login até resolver):
//   SENHA (mustChangePassword)  → PATCH /profile/password
//   RAMO (ramoPending, só dono) → POST  /profile/prospecting-segments
//   MODO (adminOnboardingPending) → POST /onboarding/event admin_mode:solo|team
//   ESCOLHA (tutorialPending)   → Tutorial | Simples | Pular
//     · Tutorial: boot cinematográfico → coach na casca REAL do sistema; o
//       backend só é marcado quando o coach termina/pula (tutorial-coach-host).
//     · Simples:  POST /profile/tutorial-done + checklist nasce expandido → /dashboard.
//     · Pular:    POST /profile/tutorial-done → /dashboard.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AC_COLLAPSE_KEY } from "@/components/hbx/activation-checklist";
import { apiFetch, getToken } from "@/lib/api";
import { setAdminOnboardingMode } from "@/lib/onboarding";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";

type Flags = {
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  ramoPending?: boolean;
  adminOnboardingPending?: boolean;
  tutorialPending?: boolean;
};

const RAMOS_SUGERIDOS = [
  "Clínicas e consultórios", "Odontologia", "Estética e beleza", "Academias",
  "Oficinas e autopeças", "Restaurantes e bares", "Comércio e varejo",
  "Imobiliárias", "Advocacia", "Contabilidade", "Pet shops", "Construção e reformas",
];

type GateStep = "senha" | "ramo" | "modo" | "caminho" | "escolha";

// Texto do trilho lateral por passo (h1/p/status) — acompanha o palco.
const SIDE_META: Record<GateStep, [string, string, string]> = {
  senha: ["Sua chave de entrada.", "Crie a senha definitiva — a temporária para de valer agora.", "Protegendo seu acesso"],
  ramo: ["Comece pelo alvo.", "Escolha estado, cidade e ramo.", "Salvando informações"],
  modo: ["Você vai operar sozinho ou com um time?", "", "Ajustando atendimento"],
  caminho: ["Como você quer começar?", "", "Preparando primeiros passos"],
  escolha: ["Vamos montar sua operação.", "Escolha se quer uma configuração guiada, simples ou se prefere pular.", "Preparando primeiros passos"],
};

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function primeiroNome(nome?: string | null) {
  const n = String(nome || "").trim().split(/\s+/)[0];
  return n ? `, ${n}` : "";
}

export function OobeGate() {
  const router = useRouter();
  const [flags, setFlags] = useState<Flags | null>(null);
  // Modo Tutorial: o portão fecha LOCALMENTE (o backend segue tutorialPending até
  // o coach terminar/pular) — sem isso o portão voltaria por cima do coach.
  const [tutorialLaunched, setTutorialLaunched] = useState(false);
  const [booting, setBooting] = useState(false);
  // Régua de progresso: quais passos estavam pendentes quando o portão abriu
  // (resolver um passo não o tira da régua — a barra avança, não encolhe).
  const [jornada, setJornada] = useState<GateStep[] | null>(null);

  const carregar = useCallback(() => {
    if (!getToken()) return;
    apiFetch<Flags>("/profile/current-user")
      .then(u => {
        setFlags(u || null);
        if (u) {
          setJornada(prev => {
            if (prev) return prev;
            const j: GateStep[] = [];
            if (u.mustChangePassword) j.push("senha");
            if (u.ramoPending) j.push("ramo");
            if (u.adminOnboardingPending) j.push("modo");
            // "caminho" é o passo REALMENTE exibido quando tutorialPending (ver
            // stepKey abaixo) — nunca "escolha" (painel morto, inalcançável).
            // Empurrar a chave certa aqui é o que mantém a contagem "Etapa X de N" certa.
            if (u.tutorialPending) j.push("caminho");
            return j;
          });
        }
      })
      .catch(() => setFlags(null));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Passo atual derivado dos flags (ordem fixa do portão).
  let stepKey: GateStep | null = null;
  if (flags) {
    const senha = Boolean(flags.mustChangePassword);
    const ramo = !senha && Boolean(flags.ramoPending);
    const modo = !senha && !ramo && Boolean(flags.adminOnboardingPending);
    const caminho = !senha && !ramo && !modo && Boolean(flags.tutorialPending) && !tutorialLaunched;
    stepKey = senha ? "senha" : ramo ? "ramo" : modo ? "modo" : caminho ? "caminho" : null;
  }

  // Transição Win11 entre passos: o painel atual roda a saída (is-leaving) e só
  // então o próximo remonta (key) e entra em cascata.
  const [shown, setShown] = useState<GateStep | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (stepKey === shown) return;
    let alive = true;
    if (shown === null || stepKey === null || prefersReducedMotion()) {
      Promise.resolve().then(() => { if (alive) { setShown(stepKey); setLeaving(false); } });
      return () => { alive = false; };
    }
    Promise.resolve().then(() => { if (alive) setLeaving(true); });
    const t = window.setTimeout(() => { if (alive) { setShown(stepKey); setLeaving(false); } }, 240);
    return () => { alive = false; window.clearTimeout(t); };
  }, [stepKey, shown]);

  if (!flags) return null;

  if (booting) {
    return (
      <OobeBoot
        name={flags.name}
        onDone={() => {
          startTutorialCoach();
          setTutorialLaunched(true);
          setBooting(false);
        }}
      />
    );
  }

  if (!shown) return null;

  // Régua = só os passos REAIS da jornada (senha/ramo/modo/caminho, na ordem
  // em que ficaram pendentes) — sem o painel morto "escolha" inflando o total.
  const regua = jornada && jornada.length ? jornada : [shown];
  const etapaIdx = Math.max(0, regua.indexOf(shown));
  const totalEtapas = regua.length;
  const etapaAtual = etapaIdx + 1;
  const pct = totalEtapas > 0 ? Math.round((etapaAtual / totalEtapas) * 100) : 0;
  // Único texto "Etapa X de N" — usado no trilho lateral E no rodapé de cada
  // painel (mesma fonte, sem duplicar a conta em dois lugares).
  const stepLabel = `Etapa ${etapaAtual} de ${totalEtapas}`;
  const [sideTitle, sideCopy, statusText] = SIDE_META[shown] || ["Preparando", "", ""];
  const panelClass = "oobe-panel" + (leaving ? " is-leaving" : "");

  return (
    <main className="hbx-oobe" role="dialog" aria-modal="true" aria-label="Primeira configuração HBX">
      <div className="oobe-grid" aria-hidden />
      <div className="oobe-noise" aria-hidden />

      <section className="oobe-shell">
        <aside className="oobe-side">
          <div className="oobe-brand">
            <div className="oobe-brand-mark">H</div>
            <div>
              <strong>HBX</strong>
              <span>Primeira configuração</span>
            </div>
          </div>

          <div className="oobe-side-copy" key={shown}>
            <h1>{sideTitle}</h1>
            <p>{sideCopy}</p>
          </div>

          <div className="oobe-progress">
            <div className="oobe-progress-top">
              <span>{stepLabel}</span>
              <span>{pct}%</span>
            </div>
            <div className="oobe-progress-bar">
              <div className="oobe-progress-fill" style={{ width: pct + "%" }} />
            </div>
          </div>
        </aside>

        <section className="oobe-main">
          <div className="oobe-topbar">
            <div className="oobe-status"><span /><b>{statusText}</b></div>
          </div>

          <div className="oobe-stage">
            {shown === "senha" && <PainelSenha key="senha" className={panelClass} flags={flags} stepLabel={stepLabel} onResolved={carregar} />}
            {shown === "ramo" && <PainelRamo key="ramo" className={panelClass} stepLabel={stepLabel} onResolved={carregar} />}
            {shown === "modo" && <PainelModo key="modo" className={panelClass} stepLabel={stepLabel} onResolved={carregar} />}
            {shown === "caminho" && (
              <PainelCaminho
                key="caminho"
                className={panelClass}
                stepLabel={stepLabel}
                onTutorial={() => setBooting(true)}
                onResolved={carregar}
                goDashboard={() => router.push("/dashboard")}
              />
            )}
            {shown === "escolha" && (
              <PainelEscolha
                key="escolha"
                className={panelClass}
                onTutorial={() => setBooting(true)}
                onResolved={carregar}
                goDashboard={() => router.push("/dashboard")}
              />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

/* ── Passo SENHA ───────────────────────────────────────────────────────────── */
function PainelSenha({ className, flags, stepLabel, onResolved }: { className: string; flags: Flags; stepLabel: string; onResolved: () => void }) {
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
    <form className={className} onSubmit={salvar}>
      <h2 className="oobe-title">Boas-vindas à HBX{primeiroNome(flags.name)}</h2>
      <p className="oobe-copy">
        Antes de começar, crie uma senha só sua. A senha temporária para de valer agora.
        {flags.email ? <> Seu login é <b>{flags.email}</b>.</> : null}
      </p>
      <div className="oobe-field">
        <label>Nova senha</label>
        <div className="oobe-input-row">
          <input className="oobe-input" type={show ? "text" : "password"} minLength={8} maxLength={120}
            placeholder="mínimo 8 caracteres" value={p1} disabled={busy} autoFocus autoComplete="new-password"
            onChange={e => setP1(e.target.value)} />
          <button type="button" className="oobe-btn" onClick={() => setShow(s => !s)} disabled={busy}>
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      <div className="oobe-field">
        <label>Repita a senha</label>
        <input className="oobe-input" type={show ? "text" : "password"} minLength={8} maxLength={120}
          placeholder="digite de novo" value={p2} disabled={busy} autoComplete="new-password"
          onChange={e => setP2(e.target.value)} />
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || "Você vai usar essa senha nos próximos acessos."}</div>
        <div className="oobe-actions">
          <button className="oobe-btn oobe-btn--primary" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar"}
          </button>
        </div>
      </footer>
      <div className="oobe-step-indicator">{stepLabel}</div>
    </form>
  );
}

/* ── Passo RAMO (prospecção) — segmentos + estado + cidade, 1 tela sem scroll ── */
function PainelRamo({ className, stepLabel, onResolved }: { className: string; stepLabel: string; onResolved: () => void }) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [livre, setLivre] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todos = Array.from(new Set([...RAMOS_SUGERIDOS, ...selecionados]));

  function toggle(r: string) {
    const removendo = selecionados.includes(r);
    const sels = removendo ? selecionados.filter(x => x !== r) : [...selecionados, r];
    setSelecionados(sels);
  }

  function addLivre() {
    const v = livre.trim();
    if (!v) return;
    if (!selecionados.includes(v)) {
      setSelecionados([...selecionados, v]);
    }
    setLivre("");
  }

  async function salvar() {
    if (busy) return;
    const segments = selecionados.length ? selecionados : livre.trim() ? [livre.trim()] : [];
    if (!segments.length) { setErr("Escolha pelo menos um ramo."); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/prospecting-segments", {
        method: "POST",
        body: JSON.stringify({ segments, estado: estado.trim(), cidade: cidade.trim() }),
      });
      onResolved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
      setBusy(false);
    }
  }

  return (
    <article className={className}>
      <h2 className="oobe-title">Qual é seu ramo?</h2>
      <div className="oobe-chips">
        {todos.map(r => (
          <button type="button" key={r} className={"oobe-chip" + (selecionados.includes(r) ? " is-on" : "")}
            onClick={() => toggle(r)} disabled={busy}>
            {r}
          </button>
        ))}
      </div>
      <div className="oobe-field">
        <label>Ou descreva</label>
        <div className="oobe-input-row">
          <input className="oobe-input" maxLength={80} placeholder="Seu ramo"
            value={livre} disabled={busy} onChange={e => setLivre(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLivre(); } }} />
          <button className="oobe-btn" type="button" onClick={addLivre} disabled={busy || !livre.trim()}>+</button>
        </div>
      </div>
      <div className="oobe-row">
        <div className="oobe-field">
          <label>Estado</label>
          <div className="oobe-input-row">
            <input className="oobe-input oobe-input--uf" maxLength={2} placeholder="UF" value={estado} disabled={busy}
              onChange={e => setEstado(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
          </div>
        </div>
        <div className="oobe-field">
          <label>Cidade</label>
          <div className="oobe-input-row">
            <input className="oobe-input" maxLength={80} placeholder="Sua cidade" value={cidade} disabled={busy}
              onChange={e => setCidade(e.target.value)} />
          </div>
        </div>
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || ""}</div>
        <div className="oobe-actions">
          <button className="oobe-btn oobe-btn--primary" type="button" onClick={salvar} disabled={busy}>
            {busy ? "Salvando…" : "Continuar"}
          </button>
        </div>
      </footer>
      <div className="oobe-step-indicator">{stepLabel}</div>
    </article>
  );
}

/* ── Passo MODO (solo | time) — cards selecionáveis + Continuar ────────────── */
function PainelModo({ className, stepLabel, onResolved }: { className: string; stepLabel: string; onResolved: () => void }) {
  const [sel, setSel] = useState<"solo" | "team">("solo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function continuar() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const ok = await setAdminOnboardingMode(sel);
    if (ok) {
      onResolved();
    } else {
      setErr("Não foi possível salvar agora. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <article className={className}>
      <h2 className="oobe-title">Você vai operar sozinho ou com um time?</h2>
      <div className="oobe-choices oobe-choices--2">
        <button className={"oobe-card" + (sel === "solo" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("solo")}>
          <span className="oobe-card-ico">1</span>
          <strong>Sozinho</strong>
        </button>
        <button className={"oobe-card" + (sel === "team" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("team")}>
          <span className="oobe-card-ico">3</span>
          <strong>Com time</strong>
        </button>
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || ""}</div>
        <div className="oobe-actions">
          <button className="oobe-btn oobe-btn--primary" type="button" onClick={continuar} disabled={busy}>
            {busy ? "Salvando…" : "Continuar"}
          </button>
        </div>
      </footer>
      <div className="oobe-step-indicator">{stepLabel}</div>
    </article>
  );
}

/* ── Passo CAMINHO (Passo a Passo | Direto Sistema) ────────────────────────── */
function PainelCaminho({ className, stepLabel, onTutorial, onResolved, goDashboard }: {
  className: string;
  stepLabel: string;
  onTutorial: () => void;
  onResolved: () => void;
  goDashboard: () => void;
}) {
  const [sel, setSel] = useState<"tutorial" | "simple">("tutorial");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function continuar() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({ mode: sel }) });
      if (sel === "simple") {
        try { localStorage.setItem(AC_COLLAPSE_KEY, "0"); } catch { /* sem storage */ }
      }
      onResolved();
      if (sel === "tutorial") { onTutorial(); } else { goDashboard(); }
    } catch {
      setErr("Não foi possível salvar agora. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <article className={className}>
      <h2 className="oobe-title">Como você quer começar?</h2>
      <div className="oobe-choices oobe-choices--2">
        <button className={"oobe-card" + (sel === "tutorial" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("tutorial")}>
          <span className="oobe-card-ico">▶</span>
          <strong>Passo a Passo</strong>
        </button>
        <button className={"oobe-card" + (sel === "simple" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("simple")}>
          <span className="oobe-card-ico">→</span>
          <strong>Direto Sistema</strong>
        </button>
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || ""}</div>
        <div className="oobe-actions">
          <button className="oobe-btn oobe-btn--primary" type="button" onClick={continuar} disabled={busy}>
            {busy ? "Preparando…" : "Continuar"}
          </button>
        </div>
      </footer>
      <div className="oobe-step-indicator">{stepLabel}</div>
    </article>
  );
}

/* ── Passo ESCOLHA (Tutorial | Simples | Pular) ────────────────────────────── */
function PainelEscolha({ className, onTutorial, onResolved, goDashboard }: {
  className: string;
  onTutorial: () => void;
  onResolved: () => void;
  goDashboard: () => void;
}) {
  const [sel, setSel] = useState<"tutorial" | "simple" | "skip">("tutorial");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function resolverSem(mode: "simple" | "skip") {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({ mode }) });
      if (mode === "simple") {
        // A promessa do Simples é "seguir o checklist" — ele nasce aberto.
        try { localStorage.setItem(AC_COLLAPSE_KEY, "0"); } catch { /* sem storage */ }
      }
      onResolved(); // tutorialPending=false → portão some
      goDashboard();
    } catch {
      setErr("Não foi possível salvar agora. Tente novamente.");
      setBusy(false);
    }
  }

  function continuar() {
    if (busy) return;
    if (sel === "tutorial") { setBusy(true); onTutorial(); return; }
    void resolverSem(sel);
  }

  const cta = sel === "tutorial" ? "Começar tutorial" : sel === "simple" ? "Entrar no sistema" : "Pular por enquanto";

  return (
    <article className={className}>
      <div className="oobe-step-label">Escolha de entrada</div>
      <h2 className="oobe-title">Como você quer começar?</h2>
      <p className="oobe-copy">A HBX pode te guiar por uma experiência completa ou liberar direto o sistema com um checklist simples.</p>
      <div className="oobe-choices">
        <button className={"oobe-card" + (sel === "tutorial" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("tutorial")}>
          <span className="oobe-card-ico">▶</span>
          <strong>Tutorial</strong>
          <small>Mostra o sistema módulo por módulo, com orientação visual e escolhas salvas.</small>
        </button>
        <button className={"oobe-card" + (sel === "simple" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("simple")}>
          <span className="oobe-card-ico">✓</span>
          <strong>Simples</strong>
          <small>Entra direto no Dashboard e deixa apenas o checklist de ativação.</small>
        </button>
        <button className={"oobe-card" + (sel === "skip" ? " is-selected" : "")} type="button" disabled={busy} onClick={() => setSel("skip")}>
          <span className="oobe-card-ico">↷</span>
          <strong>Pular</strong>
          <small>Não mostrar tutorial agora. Você segue usando o sistema normalmente.</small>
        </button>
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>
          {err || (sel === "tutorial"
            ? "O tutorial roda por cima do sistema real e salva suas escolhas."
            : "O checklist de primeiros passos continua te guiando no Dashboard.")}
        </div>
        <div className="oobe-actions">
          <button className="oobe-btn oobe-btn--primary" type="button" onClick={continuar} disabled={busy}>
            {busy ? "Preparando…" : cta}
          </button>
        </div>
      </footer>
    </article>
  );
}

/* ── Boot cinematográfico (Tutorial) — mesma identidade dark do OOBE ───────── */
const BOOT_STEPS = [
  "Preparando sua área de trabalho",
  "Carregando módulos da HBX",
  "Sincronizando primeiros passos",
  "Aquecendo o Radar",
  "Abrindo sua operação",
];
const BOOT_STEP_MS = 780;
const BOOT_HOLD_MS = 650;
const BOOT_FADE_MS = 700; // casa com o transition do .oobe-boot

export function OobeBoot({ onDone, name }: { onDone?: () => void; name?: string | null }) {
  const [done, setDone] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let i = 0;
    const tick = () => {
      if (i >= BOOT_STEPS.length) {
        timers.push(window.setTimeout(() => {
          setGone(true);
          timers.push(window.setTimeout(() => onDone?.(), BOOT_FADE_MS));
        }, BOOT_HOLD_MS));
        return;
      }
      i += 1;
      timers.push(window.setTimeout(() => { setDone(i); tick(); }, BOOT_STEP_MS));
    };
    tick();
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [onDone]);

  const primeiro = String(name || "").trim().split(/\s+/)[0];

  return (
    <div className={"oobe-boot" + (gone ? " is-gone" : "")} role="status" aria-live="polite">
      <div className="oobe-boot-stage">
        <div className="oobe-brand">
          <div className="oobe-brand-mark">H</div>
          <div><strong>HBX</strong></div>
        </div>
        <h1 className="oobe-boot-title">{primeiro ? `Bem-vindo ao HBX, ${primeiro}` : "Bem-vindo ao HBX"}</h1>
        <p className="oobe-boot-sub">Deixando tudo pronto para a sua operação. Isso leva só alguns segundos.</p>
        <span className="oobe-boot-dots" aria-hidden><i /><i /><i /><i /><i /></span>
        <ul className="oobe-boot-steps">
          {BOOT_STEPS.map((s, idx) => {
            const state = idx < done ? "done" : idx === done ? "loading" : "wait";
            return (
              <li key={s} className={"oobe-boot-step is-" + state}>
                <span className="oobe-boot-ic">
                  {state === "done"
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    : <span className="oobe-boot-spin" aria-hidden />}
                </span>
                <span>{s}</span>
                <span className="oobe-boot-state">{state === "done" ? "ok" : state === "loading" ? "carregando…" : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
