"use client";

// Portão de boas-vindas (primeiro acesso) — montado no AuthGate, sobrepõe o app
// e BLOQUEIA até resolver. Ordem: SENHA (mustChangePassword) → TUTORIAL
// (tutorialPending). Cada passo repete a CADA login até resolver — os flags moram
// no USUÁRIO (backend), não no navegador.
//   PATCH /profile/password   { newPassword }   (não pede a senha atual qdo o flag liga)
//   POST  /profile/tutorial-done                ("Começar a usar" OU "Não exibir mais" resolvem)
// Lei 5: todo visual em classe central (.bv-* no screens.css). Zero estilo inline.

import React, { useCallback, useEffect, useRef, useState } from "react";

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
  // Ordem do portão: SENHA → RAMO (só dono) → MODO solo|time (só dono, Camada 4) →
  // TUTORIAL. Cada passo repete a cada login até resolver (os flags moram no
  // backend, não no navegador).
  const precisaRamo = !precisaSenha && Boolean(flags.ramoPending);
  const precisaModo = !precisaSenha && !precisaRamo && Boolean(flags.adminOnboardingPending);
  const precisaTutorial = !precisaSenha && !precisaRamo && !precisaModo && Boolean(flags.tutorialPending);
  if (!precisaSenha && !precisaRamo && !precisaModo && !precisaTutorial) return null;

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
  if (precisaModo) {
    return (
      <div className="bv-veil" role="dialog" aria-modal="true">
        <div className="bv-card">
          <PassoAdminModo flags={flags} onResolved={carregar} />
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
      <div className="bv-hero">
        <span className="orb" />
        <span className="kicker">Como você vai operar{primeiroNome(flags.name)}</span>
        <h2>Você vai usar a HBX sozinho ou com um time?</h2>
        <p>Isso ajusta seus primeiros passos e já define o modelo de atendimento do WhatsApp — dá pra mudar quando quiser em Atendimento.</p>
      </div>
      <div className="bv-body">
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
