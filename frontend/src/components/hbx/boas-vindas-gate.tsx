"use client";

// Portão de boas-vindas (primeiro acesso) — montado no AuthGate, sobrepõe o app
// e BLOQUEIA até resolver. Ordem: SENHA (mustChangePassword) → RAMO (só dono) →
// MODO solo|time (só dono) → TUTORIAL (tutorialPending). Cada passo repete a
// CADA login até resolver — os flags moram no USUÁRIO (backend), não no navegador.
//   PATCH /profile/password   { newPassword }   (não pede a senha atual qdo o flag liga)
//   POST  /profile/tutorial-done                (Simples/Pular resolvem aqui; o modo
//                                                Tutorial só marca quando o COACH
//                                                termina/pula — tutorial-coach-host)
//
// CASCA OOBE (07/07): o portão inteiro roda numa entrada cinematográfica estilo
// Windows 11 — tela cheia, bloom de luz, painel central, cascata de entrada e
// troca de passo "sai antes, entra depois". Visual 100% em classe central
// (.bv-oobe-* / .bv-choice-* no screens.css). Zero estilo inline (Lei 4/5).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AC_COLLAPSE_KEY } from "@/components/hbx/activation-checklist";
import { BootSplash } from "@/components/hbx/boot-splash";
import { apiFetch, getToken } from "@/lib/api";
import { setAdminOnboardingMode } from "@/lib/onboarding";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";

type Flags = {
  name?: string | null;
  email?: string | null;
  mustChangePassword?: boolean;
  ramoPending?: boolean;
  // Onboarding do dono (Camada 4): true ⇒ portão pergunta "solo ou time?".
  adminOnboardingPending?: boolean;
  tutorialPending?: boolean;
};

// Ramos-alvo sugeridos no primeiro acesso do dono. Lista enxuta e genérica —
// o dono ajusta/expande depois no Radar. Texto livre cobre o resto.
const RAMOS_SUGERIDOS = [
  "Clínicas e consultórios", "Odontologia", "Estética e beleza", "Academias",
  "Oficinas e autopeças", "Restaurantes e bares", "Comércio e varejo",
  "Imobiliárias", "Advocacia", "Contabilidade", "Pet shops", "Construção e reformas",
];

// Ordem canônica do portão — régua dos pontinhos de progresso do rodapé.
const GATE_ORDER = ["senha", "ramo", "modo", "tutorial"] as const;
type GateStep = (typeof GATE_ORDER)[number];

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BoasVindasGate() {
  const [flags, setFlags] = useState<Flags | null>(null);
  // Modo Tutorial: o portão fecha LOCALMENTE (o backend segue tutorialPending
  // até o coach terminar/pular) — sem isso o portão voltaria por cima do coach
  // no primeiro reload de flags.
  const [tutorialLaunched, setTutorialLaunched] = useState(false);
  const [booting, setBooting] = useState(false);

  // Snapshot da jornada DESTA sessão (régua dos pontinhos): quais passos estavam
  // pendentes quando o portão abriu. Resolver um passo não o tira da régua — ele
  // vira "feito" (o flag no backend some, mas o pontinho fica aceso). Preenchido
  // UMA vez, no primeiro load dos flags (state, não ref — regra react-hooks/refs).
  const [jornada, setJornada] = useState<GateStep[] | null>(null);

  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  // Sem token, não faz nada → fica null → sem portão.
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
            if (u.tutorialPending) j.push("tutorial");
            return j;
          });
        }
      })
      .catch(() => setFlags(null));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Passo atual derivado dos flags (a ordem do portão é fixa).
  let stepKey: GateStep | null = null;
  if (flags) {
    const precisaSenha = Boolean(flags.mustChangePassword);
    const precisaRamo = !precisaSenha && Boolean(flags.ramoPending);
    const precisaModo = !precisaSenha && !precisaRamo && Boolean(flags.adminOnboardingPending);
    const precisaTutorial =
      !precisaSenha && !precisaRamo && !precisaModo &&
      Boolean(flags.tutorialPending) && !tutorialLaunched;
    stepKey = precisaSenha ? "senha" : precisaRamo ? "ramo" : precisaModo ? "modo" : precisaTutorial ? "tutorial" : null;
  }

  // Troca de passo com a lei "uma coisa sai pra outra entrar": o painel atual
  // faz o fade/slide de saída e só então o próximo entra (remonta pelo key →
  // roda a cascata de entrada de novo).
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

  // Modo Tutorial: boot cinematográfico → liga o coach por cima do app real.
  // NÃO marca o backend aqui — quem marca é o fecho do coach (terminar/pular).
  if (booting) {
    return (
      <BootSplash
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

  const regua = jornada || [];
  const shownIdx = GATE_ORDER.indexOf(shown);

  return (
    <div className="bv-oobe" role="dialog" aria-modal="true" aria-label="Primeira configuração HBX">
      <span className="bv-oobe__bloom" aria-hidden />
      <main key={shown} className={"bv-oobe__stage" + (leaving ? " is-leaving" : "")}>
        {shown === "senha" && <PassoSenha flags={flags} onResolved={carregar} />}
        {shown === "ramo" && <PassoRamo flags={flags} onResolved={carregar} />}
        {shown === "modo" && <PassoAdminModo flags={flags} onResolved={carregar} />}
        {shown === "tutorial" && (
          <PassoTutorialChoice onTutorial={() => setBooting(true)} onResolved={carregar} />
        )}
      </main>
      <footer className="bv-oobe__bar">
        <span className="bv-oobe__brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
          <strong>HBX</strong>
          <em>Primeira configuração</em>
        </span>
        {regua.length > 1 && (
          <span className="bv-oobe__dots" aria-hidden>
            {regua.map(k => {
              const cls = GATE_ORDER.indexOf(k) < shownIdx ? "is-done" : k === shown ? "is-on" : undefined;
              return <i key={k} className={cls} />;
            })}
          </span>
        )}
      </footer>
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
      <header className="bv-oobe__head">
        <span className="bv-oobe__kicker">Primeiro acesso</span>
        <h1 className="bv-oobe__title">Boas-vindas à HBX{primeiroNome(flags.name)}</h1>
        <p className="bv-oobe__sub">Antes de começar, crie uma senha só sua. A senha temporária para de valer agora.</p>
      </header>
      <form className="bv-oobe__content" onSubmit={salvar}>
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

type SegmentCard = { name: string; city: string; ddd: string; phoneMasked: string };

// Ramo-alvo no primeiro acesso do DONO (14/06): a lagoa do Radar é compartilhada e
// enorme; perguntar o que a empresa quer prospectar enche o olho com o que importa e
// desempata o que cada empresa vê (o "não repetir" é por empresa, no backend).
// POST /profile/prospecting-segments { segments }.
// Vitrine (PR17062026038): ao tocar um ramo, cards de empresas reais entram com
// telefone mascarado e contador animado. Botão some por ~12s ("segurar a pessoa").
function PassoRamo({ flags, onResolved }: { flags: Flags; onResolved: () => void }) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [livre, setLivre] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [btnState, setBtnState] = useState<"normal" | "searching" | "ready">("normal");
  const [vitrineItems, setVitrineItems] = useState<SegmentCard[]>([]);
  const [targetCount, setTargetCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);

  const vitrineCache = useRef<Map<string, { count: number; sample: SegmentCard[] }>>(new Map());
  const fetchingSegs = useRef(new Set<string>());
  const selecionadosRef = useRef<string[]>([]);
  const btnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const todos = Array.from(new Set([...RAMOS_SUGERIDOS, ...selecionados]));

  // Animated counter: eases from 0 to targetCount on each change.
  // FRAMES=1 when target=0 so the interval sets displayCount in its first tick
  // (avoids calling setState synchronously in the effect body).
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    let frame = 0;
    const FRAMES = targetCount > 0 ? 40 : 1;
    animRef.current = setInterval(() => {
      frame++;
      if (frame >= FRAMES) { setDisplayCount(targetCount); clearInterval(animRef.current!); return; }
      const t = frame / FRAMES;
      setDisplayCount(Math.round(targetCount * (1 - Math.pow(1 - t, 3))));
    }, 16);
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [targetCount]);

  // Cleanup btn timer on unmount
  useEffect(() => () => { if (btnTimerRef.current) clearTimeout(btnTimerRef.current); }, []);

  function recomputeVitrine(selected: string[]) {
    const allItems: SegmentCard[] = [];
    let total = 0;
    const seenNames = new Set<string>();
    for (const seg of selected) {
      const data = vitrineCache.current.get(seg);
      if (!data) continue;
      total += data.count;
      for (const item of data.sample) {
        const k = item.name.toLowerCase();
        if (!seenNames.has(k)) { seenNames.add(k); allItems.push(item); }
      }
    }
    setVitrineItems(allItems.slice(0, 18));
    setTargetCount(total);
  }

  function fetchSegment(seg: string, currentSels: string[]) {
    if (vitrineCache.current.has(seg)) { recomputeVitrine(currentSels); return; }
    if (fetchingSegs.current.has(seg)) return;
    fetchingSegs.current.add(seg);
    apiFetch<{ count: number; sample: SegmentCard[] }>(
      `/onboarding/segment-preview?segment=${encodeURIComponent(seg)}`
    )
      .then(d => { vitrineCache.current.set(seg, d || { count: 0, sample: [] }); })
      .catch(() => { vitrineCache.current.set(seg, { count: 0, sample: [] }); })
      .finally(() => {
        fetchingSegs.current.delete(seg);
        recomputeVitrine(selecionadosRef.current);
      });
  }

  function triggerBtnState() {
    setBtnState(prev => {
      if (prev !== "normal") return prev;
      btnTimerRef.current = setTimeout(() => setBtnState("ready"), 12000);
      return "searching";
    });
  }

  function toggle(r: string) {
    const isRemoving = selecionados.includes(r);
    const newSels = isRemoving ? selecionados.filter(x => x !== r) : [...selecionados, r];
    setSelecionados(newSels);
    selecionadosRef.current = newSels;
    if (!isRemoving) { fetchSegment(r, newSels); triggerBtnState(); }
    else { recomputeVitrine(newSels); }
  }

  function addLivre() {
    const v = livre.trim();
    if (!v) return;
    const isNew = !selecionados.includes(v);
    const newSels = isNew ? [...selecionados, v] : selecionados;
    setSelecionados(newSels);
    selecionadosRef.current = newSels;
    if (isNew) { fetchSegment(v, newSels); triggerBtnState(); }
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
      <header className="bv-oobe__head">
        <span className="bv-oobe__kicker">Quase lá{primeiroNome(flags.name)}</span>
        <h1 className="bv-oobe__title">Que tipo de empresa você quer prospectar?</h1>
        <p className="bv-oobe__sub">O Radar é uma base compartilhada e gigante. Diga o seu ramo-alvo que já mostramos as empresas certas pra você — dá pra mudar isso quando quiser.</p>
      </header>
      <form className="bv-oobe__content" onSubmit={salvar}>
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
          {btnState === "searching" ? (
            <span className="vitrine-searching">Procurando empresas perto de você…</span>
          ) : (
            <button className="btn-teal" type="submit" disabled={busy}>
              {busy ? "Salvando…" : btnState === "ready" ? "Ver meu Radar →" : "Salvar e continuar →"}
            </button>
          )}
        </div>
      </form>
      {vitrineItems.length > 0 && (
        <div className="vitrine-section">
          <p className="vitrine-counter">
            <i className="ti ti-building-community" />
            <strong>{displayCount.toLocaleString("pt-BR")}</strong>
            {" "}empresas do ramo na base
          </p>
          <div className="vitrine-grid">
            {vitrineItems.map((item) => (
              <div key={`${item.name}-${item.city}`} className="vitrine-card">
                <span className="vitrine-card__name">{item.name}</span>
                <span className="vitrine-card__city">{item.city}</span>
                <span className="vitrine-card__phone">
                  <i className="ti ti-lock" />{item.phoneMasked}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

// Onboarding do DONO no 1º login (Camada 4): "Você vai operar sozinho ou com
// time?". A escolha RAMIFICA o checklist de primeiros passos (solo = vira a jornada
// do vendedor; time = convidar vendedor + ver a 1ª conversa). Grava o carimbo
// admin_mode:solo|team (POST /onboarding/event) e some o portão. É um passo de
// CONFIGURAÇÃO, não tem WhatsApp/ação live aqui — o checklist depois é que conduz.
// Sem reset-em-effect: o componente nasce fresco a cada abertura do portão.
function PassoAdminModo({ flags, onResolved }: { flags: Flags; onResolved: () => void }) {
  const [busy, setBusy] = useState<"solo" | "team" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function escolher(mode: "solo" | "team") {
    if (busy) return;
    setBusy(mode);
    setErr(null);
    const ok = await setAdminOnboardingMode(mode);
    if (ok) {
      onResolved(); // recarrega flags → adminOnboardingPending=false → próximo passo
    } else {
      setErr("Não foi possível salvar agora. Tente novamente.");
      setBusy(null);
    }
  }

  return (
    <React.Fragment>
      <header className="bv-oobe__head">
        <span className="bv-oobe__kicker">Como você vai operar{primeiroNome(flags.name)}</span>
        <h1 className="bv-oobe__title">Você vai usar a HBX sozinho ou com um time?</h1>
        <p className="bv-oobe__sub">Isso ajusta seus primeiros passos e já define o modelo de atendimento do WhatsApp — dá pra mudar quando quiser em Atendimento.</p>
      </header>
      <div className="bv-oobe__content">
        <div className="bv-branch">
          <button type="button" className="bv-branch-opt" disabled={Boolean(busy)} onClick={() => escolher("solo")}>
            <span className="bv-branch-ico" aria-hidden="true"><i className="ti ti-user" /></span>
            <span className="bv-branch-tx">
              <strong>Sozinho, por enquanto</strong>
              <small>Eu mesmo prospecto e fecho, pelo meu próprio WhatsApp (chips individuais). Comece puxando seu primeiro lead.</small>
            </span>
            <span className="bv-branch-go" aria-hidden="true">{busy === "solo" ? "…" : "→"}</span>
          </button>
          <button type="button" className="bv-branch-opt" disabled={Boolean(busy)} onClick={() => escolher("team")}>
            <span className="bv-branch-ico" aria-hidden="true"><i className="ti ti-users-group" /></span>
            <span className="bv-branch-tx">
              <strong>Com um time</strong>
              <small>Tenho ou vou ter vendedores, atendendo por um número compartilhado da empresa. Comece convidando o primeiro.</small>
            </span>
            <span className="bv-branch-go" aria-hidden="true">{busy === "team" ? "…" : "→"}</span>
          </button>
        </div>
        {err && <div className="bv-msg bad">{err}</div>}
        <div className="bv-hint">Você é o dono da conta — só você define isso.</div>
      </div>
    </React.Fragment>
  );
}

// Decisão do tutorial (07/07): Tutorial / Simples / Pular.
//  - Tutorial: boot cinematográfico → coach por cima do app real. NÃO marca o
//    backend aqui — o coach marca ao terminar/pular (fechar o navegador no meio
//    re-oferece a escolha no próximo login, igual OOBE do Windows).
//  - Simples: marca tutorial-done, abre o checklist expandido e cai no Dashboard.
//  - Pular: marca tutorial-done e cai no Dashboard, sem mexer em preferências.
function PassoTutorialChoice({ onTutorial, onResolved }: { onTutorial: () => void; onResolved: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"tutorial" | "simples" | "pular" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function resolverSem(mode: "simples" | "pular") {
    if (busy) return;
    setBusy(mode);
    setErr(null);
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({}) });
      if (mode === "simples") {
        // A promessa do modo Simples é "seguir o checklist" — então ele nasce aberto.
        try { localStorage.setItem(AC_COLLAPSE_KEY, "0"); } catch { /* sem storage */ }
      }
      onResolved(); // recarrega flags → tutorialPending=false → portão some
      router.push("/dashboard");
    } catch {
      setErr("Não foi possível salvar agora. Tente novamente.");
      setBusy(null);
    }
  }

  function escolherTutorial() {
    if (busy) return;
    setBusy("tutorial");
    onTutorial();
  }

  return (
    <React.Fragment>
      <header className="bv-oobe__head">
        <span className="bv-oobe__kicker">Primeiros passos</span>
        <h1 className="bv-oobe__title">Como você quer começar?</h1>
        <p className="bv-oobe__sub">A HBX pode te guiar tela por tela ou liberar direto o sistema com uma lista simples de primeiros passos.</p>
      </header>
      <div className="bv-oobe__content bv-oobe__content--wide">
        <div className="bv-choice">
          <button type="button" className="bv-choice-card is-primary" disabled={Boolean(busy)} onClick={escolherTutorial}>
            <span className="bv-choice-card__icon" aria-hidden="true"><i className="ti ti-player-play" /></span>
            <span className="bv-choice-card__body">
              <strong>Tutorial</strong>
              <small>Passe comigo pelos módulos principais, com explicação guiada e salvando suas escolhas.</small>
            </span>
            <span className="bv-choice-card__action">{busy === "tutorial" ? "Preparando…" : "Começar tutorial →"}</span>
          </button>
          <button type="button" className="bv-choice-card" disabled={Boolean(busy)} onClick={() => resolverSem("simples")}>
            <span className="bv-choice-card__icon" aria-hidden="true"><i className="ti ti-list-check" /></span>
            <span className="bv-choice-card__body">
              <strong>Simples</strong>
              <small>Entrar direto no sistema e seguir apenas o checklist de ativação.</small>
            </span>
            <span className="bv-choice-card__action">{busy === "simples" ? "Salvando…" : "Usar modo simples"}</span>
          </button>
          <button type="button" className="bv-choice-card" disabled={Boolean(busy)} onClick={() => resolverSem("pular")}>
            <span className="bv-choice-card__icon" aria-hidden="true"><i className="ti ti-arrow-forward-up" /></span>
            <span className="bv-choice-card__body">
              <strong>Pular</strong>
              <small>Não mostrar tutorial agora. Você pode usar o sistema normalmente.</small>
            </span>
            <span className="bv-choice-card__action">{busy === "pular" ? "Salvando…" : "Pular por enquanto"}</span>
          </button>
        </div>
        {err && <div className="bv-msg bad">{err}</div>}
      </div>
    </React.Fragment>
  );
}
