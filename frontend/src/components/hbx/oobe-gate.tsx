"use client";

// OOBE — portão de primeiro acesso do HBX (10/07, PR10072026/02-OOBE-TUTORIAL).
// Veste a MESMA CASCA do app: tokens/kit centrais (claro/escuro seguem o tema).
// A folha isolada dark (hbx-theme/oobe.css) MORREU — decisão do dono 10/07 que
// supersede a de 07/07. Estrutura própria vive em screens.css (.oobe-*), 100%
// em token; overlay/moldura são as classes centrais .hbx-veil/.hbx-modal.
//
// Fluxo real (flags moram no USUÁRIO, repetem a cada login até resolver):
//   SENHA      (mustChangePassword)      → PATCH /profile/password
//   CATEGORIAS (modulesPending, só dono) → POST  /profile/module-categories
//   RAMO       (ramoPending, só dono; SÓ se a categoria Radar foi escolhida)
//                                        → POST  /profile/prospecting-segments
//   MODO       (adminOnboardingPending)  → POST  /onboarding/event admin_mode:solo|team
//   CAMINHO    (tutorialPending)         → Passo a Passo | Direto (POST /profile/tutorial-done)
//
// Ao salvar CATEGORIAS a página RECARREGA de propósito: sidebar/topbar/tour leem
// /modules/me com cache de módulo no shell — o reload garante o efeito cascata
// (módulo sem acesso some, fail-closed) sem tocar no shell.tsx (a troca das
// chaves NAV null→própria é do W3, fase 2). A régua "Etapa X de N" sobrevive ao
// reload via sessionStorage.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, getToken } from "@/lib/api";
import { setAdminOnboardingMode } from "@/lib/onboarding";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";

type Flags = {
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  modulesPending?: boolean;
  ramoPending?: boolean;
  adminOnboardingPending?: boolean;
  tutorialPending?: boolean;
};

const RAMOS_SUGERIDOS = [
  "Clínicas e consultórios", "Odontologia", "Estética e beleza", "Academias",
  "Oficinas e autopeças", "Restaurantes e bares", "Comércio e varejo",
  "Imobiliárias", "Advocacia", "Contabilidade", "Pet shops", "Construção e reformas",
];

// Categorias de módulo (labels curtos — o mapa categoria→módulos é FONTE ÚNICA
// no backend: modules/module-categories.ts; aqui só chave + label do card).
const CATEGORIAS: Array<{ key: string; label: string; ico: string }> = [
  { key: "radar", label: "Radar de empresas", ico: "◎" },
  { key: "vendas", label: "Vendas e Agenda", ico: "▤" },
  { key: "whatsapp", label: "WhatsApp e IA", ico: "✆" },
  { key: "logistica", label: "Logística", ico: "➔" },
  { key: "website", label: "Website", ico: "◍" },
];

type GateStep = "senha" | "categorias" | "ramo" | "modo" | "caminho";

// Ordem canônica do portão — também é a ordem da régua "Etapa X de N".
const STEP_ORDER: GateStep[] = ["senha", "categorias", "ramo", "modo", "caminho"];

// A régua sobrevive ao reload pós-categorias (sessionStorage): resolver um passo
// não o tira da conta — a barra avança, não encolhe.
const JORNADA_KEY = "hbx:oobe-jornada";

function loadJornada(): GateStep[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(JORNADA_KEY) || "null");
    return Array.isArray(parsed) ? STEP_ORDER.filter(s => parsed.includes(s)) : [];
  } catch {
    return [];
  }
}

function saveJornada(j: GateStep[]) {
  try { sessionStorage.setItem(JORNADA_KEY, JSON.stringify(j)); } catch { /* sem storage */ }
}

function clearJornada() {
  try { sessionStorage.removeItem(JORNADA_KEY); } catch { /* sem storage */ }
}

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
  const [jornada, setJornada] = useState<GateStep[] | null>(null);

  const carregar = useCallback(() => {
    if (!getToken()) return;
    apiFetch<Flags>("/profile/current-user")
      .then(u => {
        setFlags(u || null);
        if (u) {
          const pend: GateStep[] = [];
          if (u.mustChangePassword) pend.push("senha");
          if (u.modulesPending) pend.push("categorias");
          // RAMO pode ficar pendente SÓ depois de escolher a categoria Radar —
          // por isso a régua é UNIÃO (passos novos entram; resolvidos não saem).
          if (u.ramoPending) pend.push("ramo");
          if (u.adminOnboardingPending) pend.push("modo");
          if (u.tutorialPending) pend.push("caminho");
          setJornada(prev => {
            const known = prev && prev.length ? prev : loadJornada();
            const union = STEP_ORDER.filter(s => known.includes(s) || pend.includes(s));
            if (union.length) saveJornada(union);
            return union;
          });
        }
      })
      .catch(() => setFlags(null));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Passo atual derivado dos flags (ordem fixa do portão).
  let stepKey: GateStep | null = null;
  if (flags) {
    if (flags.mustChangePassword) stepKey = "senha";
    else if (flags.modulesPending) stepKey = "categorias";
    else if (flags.ramoPending) stepKey = "ramo";
    else if (flags.adminOnboardingPending) stepKey = "modo";
    else if (flags.tutorialPending && !tutorialLaunched) stepKey = "caminho";
  }

  // Portão resolvido por inteiro → limpa a régua persistida.
  useEffect(() => {
    if (flags && stepKey === null && !booting && !tutorialLaunched) clearJornada();
  }, [flags, stepKey, booting, tutorialLaunched]);

  // Transição "uma coisa sai pra outra entrar": o painel atual roda a saída
  // (is-leaving) e só então o próximo remonta (key) e entra em cascata.
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

  const regua = jornada && jornada.length ? jornada : [shown];
  const etapaIdx = Math.max(0, regua.indexOf(shown));
  const totalEtapas = regua.length;
  const etapaAtual = etapaIdx + 1;
  const pct = totalEtapas > 0 ? Math.round((etapaAtual / totalEtapas) * 100) : 0;
  const stepLabel = `Etapa ${etapaAtual} de ${totalEtapas}`;
  const panelClass = "oobe-panel" + (leaving ? " is-leaving" : "");

  return (
    <main className="hbx-veil oobe-veil" role="dialog" aria-modal="true" aria-label="Primeira configuração HBX">
      <section className="hbx-modal oobe-shell">
        <header className="oobe-head">
          <div className="oobe-brand">
            <span className="oobe-brand-mark">H</span>
            <div>
              <strong>HBX</strong>
              <span>Primeira configuração</span>
            </div>
          </div>
          <div className="oobe-progress">
            <span className="oobe-progress-label">{stepLabel}</span>
            <div className="oobe-progress-bar">
              <div className="oobe-progress-fill" style={{ width: pct + "%" }} />
            </div>
          </div>
        </header>

        <div className="oobe-stage">
          {shown === "senha" && <PainelSenha key="senha" className={panelClass} flags={flags} onResolved={carregar} />}
          {shown === "categorias" && <PainelCategorias key="categorias" className={panelClass} />}
          {shown === "ramo" && <PainelRamo key="ramo" className={panelClass} onResolved={carregar} />}
          {shown === "modo" && <PainelModo key="modo" className={panelClass} onResolved={carregar} />}
          {shown === "caminho" && (
            <PainelCaminho
              key="caminho"
              className={panelClass}
              onTutorial={() => setBooting(true)}
              onResolved={carregar}
              goDashboard={() => router.push("/dashboard")}
            />
          )}
        </div>
      </section>
    </main>
  );
}

/* ── Passo SENHA ───────────────────────────────────────────────────────────── */
function PainelSenha({ className, flags, onResolved }: { className: string; flags: Flags; onResolved: () => void }) {
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
        <label className="field-label">Nova senha</label>
        <div className="oobe-input-row">
          <input className="field-dark" type={show ? "text" : "password"} minLength={8} maxLength={120}
            placeholder="mínimo 8 caracteres" value={p1} disabled={busy} autoFocus autoComplete="new-password"
            onChange={e => setP1(e.target.value)} />
          <button type="button" className="btn-ghost" onClick={() => setShow(s => !s)} disabled={busy}>
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      <div className="oobe-field">
        <label className="field-label">Repita a senha</label>
        <input className="field-dark" type={show ? "text" : "password"} minLength={8} maxLength={120}
          placeholder="digite de novo" value={p2} disabled={busy} autoComplete="new-password"
          onChange={e => setP2(e.target.value)} />
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || "Você vai usar essa senha nos próximos acessos."}</div>
        <div className="oobe-actions">
          <button className="btn-teal" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar"}
          </button>
        </div>
      </footer>
    </form>
  );
}

/* ── Passo CATEGORIAS (novo, 10/07) — quais categorias de módulo a empresa usa ── */
function PainelCategorias({ className }: { className: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(k: string) {
    if (busy) return;
    setSel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));
  }

  async function salvar() {
    if (busy) return;
    if (!sel.length) { setErr("Escolha pelo menos uma."); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/module-categories", { method: "POST", body: JSON.stringify({ categories: sel }) });
      // Reload de propósito: o cache de /modules/me do shell renasce e a
      // sidebar/tour/topbar encolhem pros módulos escolhidos (efeito cascata).
      window.location.reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
      setBusy(false);
    }
  }

  return (
    <article className={className}>
      <h2 className="oobe-title">O que sua empresa vai usar?</h2>
      <div className="oobe-choices">
        {CATEGORIAS.map(c => (
          <button key={c.key} type="button" disabled={busy}
            className={"oobe-card" + (sel.includes(c.key) ? " is-selected" : "")}
            aria-pressed={sel.includes(c.key)}
            onClick={() => toggle(c.key)}>
            <span className="oobe-card-ico" aria-hidden>{c.ico}</span>
            <strong>{c.label}</strong>
          </button>
        ))}
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || "Escolha pelo menos uma. Dá pra mudar depois."}</div>
        <div className="oobe-actions">
          <button className="btn-teal" type="button" onClick={salvar} disabled={busy}>
            {busy ? "Salvando…" : "Continuar"}
          </button>
        </div>
      </footer>
    </article>
  );
}

/* ── Passo RAMO (prospecção) — segmentos + estado + cidade, 1 tela sem scroll ── */
function PainelRamo({ className, onResolved }: { className: string; onResolved: () => void }) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [livre, setLivre] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todos = Array.from(new Set([...RAMOS_SUGERIDOS, ...selecionados]));

  function toggle(r: string) {
    const removendo = selecionados.includes(r);
    setSelecionados(removendo ? selecionados.filter(x => x !== r) : [...selecionados, r]);
  }

  function addLivre() {
    const v = livre.trim();
    if (!v) return;
    if (!selecionados.includes(v)) setSelecionados([...selecionados, v]);
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
        <label className="field-label">Ou descreva</label>
        <div className="oobe-input-row">
          <input className="field-dark" maxLength={80} placeholder="Seu ramo"
            value={livre} disabled={busy} onChange={e => setLivre(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLivre(); } }} />
          <button className="btn-ghost" type="button" onClick={addLivre} disabled={busy || !livre.trim()}>+</button>
        </div>
      </div>
      <div className="oobe-row">
        <div className="oobe-field">
          <label className="field-label">Estado</label>
          <input className="field-dark oobe-input--uf" maxLength={2} placeholder="UF" value={estado} disabled={busy}
            onChange={e => setEstado(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
        </div>
        <div className="oobe-field">
          <label className="field-label">Cidade</label>
          <input className="field-dark" maxLength={80} placeholder="Sua cidade" value={cidade} disabled={busy}
            onChange={e => setCidade(e.target.value)} />
        </div>
      </div>
      <footer className="oobe-bottom">
        <div className={"oobe-help" + (err ? " is-error" : "")}>{err || ""}</div>
        <div className="oobe-actions">
          <button className="btn-teal" type="button" onClick={salvar} disabled={busy}>
            {busy ? "Salvando…" : "Continuar"}
          </button>
        </div>
      </footer>
    </article>
  );
}

/* ── Passo MODO (solo | time) — cards selecionáveis + Continuar ────────────── */
function PainelModo({ className, onResolved }: { className: string; onResolved: () => void }) {
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
          <button className="btn-teal" type="button" onClick={continuar} disabled={busy}>
            {busy ? "Salvando…" : "Continuar"}
          </button>
        </div>
      </footer>
    </article>
  );
}

/* ── Passo CAMINHO (Passo a Passo | Direto Sistema) ────────────────────────── */
function PainelCaminho({ className, onTutorial, onResolved, goDashboard }: {
  className: string;
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
          <button className="btn-teal" type="button" onClick={continuar} disabled={busy}>
            {busy ? "Preparando…" : "Continuar"}
          </button>
        </div>
      </footer>
    </article>
  );
}

/* ── Boot do Tutorial — splash CURTO na casca do app (sem checklist fake) ───── */
const BOOT_HOLD_MS = 1000;
const BOOT_FADE_MS = 400; // casa com o transition do .oobe-boot

export function OobeBoot({ onDone, name }: { onDone?: () => void; name?: string | null }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hold = prefersReducedMotion() ? 0 : BOOT_HOLD_MS;
    const t1 = window.setTimeout(() => setGone(true), hold);
    const t2 = window.setTimeout(() => onDone?.(), hold + BOOT_FADE_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [onDone]);

  const primeiro = String(name || "").trim().split(/\s+/)[0];

  return (
    <div className={"oobe-boot" + (gone ? " is-gone" : "")} role="status" aria-live="polite">
      <div className="oobe-boot-stage">
        <div className="oobe-brand">
          <span className="oobe-brand-mark">H</span>
          <div><strong>HBX</strong></div>
        </div>
        <h1 className="oobe-boot-title">{primeiro ? `Bem-vindo ao HBX, ${primeiro}` : "Bem-vindo ao HBX"}</h1>
        <span className="oobe-boot-dots" aria-hidden><i /><i /><i /></span>
      </div>
    </div>
  );
}
